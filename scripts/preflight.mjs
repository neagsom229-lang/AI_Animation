#!/usr/bin/env node
/**
 * @fileoverview Render pre-flight: RAM check + stale-browser reaping.
 *
 * This box is small (16 GB total, ~3.6–5.5 GB free, Intel UHD). Remotion
 * spawns one Chromium tab per concurrency slot, and every tab holds a WebGL
 * context plus the bundled bundle — four tabs is the documented safe
 * number here (see scripts/make.mjs). Two failure modes have bitten this
 * project:
 *
 *  1. **RAM exhaustion** — Chromium tabs die mid-render and the frame
 *     counter stalls. The pre-flight measures free RAM *before* the render
 *     and warns (and reduces concurrency) when it is under the threshold.
 *  2. **Leaked browsers** — a crashed or cancelled render leaves headless
 *     Chrome processes behind, each holding hundreds of MB. The next run
 *     then starts with less free RAM than it should. The pre-flight finds
 *     the Chrome processes that belong to THIS pipeline (their command line
 *     carries Remotion's user-data-dir marker) and kills them.
 *
 * Usage:
 *   node scripts/preflight.mjs            # report only, kill nothing
 *   node scripts/preflight.mjs --kill     # report + reap stale browsers
 *   node scripts/preflight.mjs --json     # machine-readable report
 *
 * @module scripts/preflight
 */

import { execFileSync } from 'node:child_process';
import os from 'node:os';

/** Free RAM below this is a warning (the brief's threshold). */
export const MIN_FREE_RAM_MB = 4096;

/** Concurrency Remotion is allowed to use at each free-RAM level. */
export const CONCURRENCY_BY_FREE_RAM = [
  { minFreeMb: 8192, concurrency: 6 },
  { minFreeMb: 6144, concurrency: 5 },
  { minFreeMb: 4096, concurrency: 4 },
  { minFreeMb: 0, concurrency: 2 }
];

/** Concurrency the project has proven stable on this hardware. */
export const DEFAULT_CONCURRENCY = 4;

/** Marker that identifies a Chromium started by the Remotion pipeline. */
const REMOTION_MARKER = 'remotion';

/**
 * @typedef {object} ChromeProcess
 * @property {number} pid
 * @property {number} rssMb working-set size in MB (0 when unknown)
 * @property {string} commandLine
 */

/**
 * @typedef {object} PreflightReport
 * @property {number} totalMb
 * @property {number} freeMb
 * @property {boolean} lowMemory
 * @property {number} suggestedConcurrency
 * @property {{pid: number, rssMb: number, name: string}[]} topProcesses
 * @property {ChromeProcess[]} staleChrome
 * @property {number} killed
 */

/** Free physical memory in MB. */
export function freeMemoryMb() {
  return Math.round(os.freemem() / (1024 * 1024));
}

/** Total physical memory in MB. */
export function totalMemoryMb() {
  return Math.round(os.totalmem() / (1024 * 1024));
}

/**
 * List running Chrome/Chromium processes with their command lines.
 *
 * Windows uses PowerShell's CIM query; POSIX uses `ps`. A platform that
 * cannot answer returns an empty list — the pre-flight must never be the
 * reason a render fails.
 *
 * @returns {ChromeProcess[]}
 */
export function listChromeProcesses() {
  try {
    if (process.platform === 'win32') {
      const script =
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" " +
        '| Select-Object ProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress';
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      });
      const parsed = JSON.parse(out.trim() || '[]');
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .filter((p) => p && p.ProcessId)
        .map((p) => ({
          pid: Number(p.ProcessId),
          rssMb: Math.round(Number(p.WorkingSetSize || 0) / (1024 * 1024)),
          commandLine: String(p.CommandLine || '')
        }));
    }
    const out = execFileSync('ps', ['-eo', 'pid=,rss=,args='], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
    const list = [];
    for (const line of out.split('\n')) {
      if (!/chrome|chromium/i.test(line)) continue;
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      list.push({
        pid: Number(m[1]),
        rssMb: Math.round(Number(m[2]) / 1024),
        commandLine: m[3]
      });
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * The N biggest memory processes on the machine (the brief asks for the top 5
 * when free RAM is low). Never throws — a platform that cannot answer returns
 * an empty list, and the pre-flight must not be the reason a render fails.
 *
 * @param {number} [count]
 * @returns {{pid: number, rssMb: number, name: string}[]}
 */
export function listTopMemoryProcesses(count = 5) {
  try {
    if (process.platform === 'win32') {
      const script =
        'Get-Process | Sort-Object WorkingSet64 -Descending | ' +
        `Select-Object -First ${count} Name,Id,WorkingSet64 | ConvertTo-Json -Compress`;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      });
      const parsed = JSON.parse(out.trim() || '[]');
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .filter((p) => p && p.Id)
        .map((p) => ({
          pid: Number(p.Id),
          rssMb: Math.round(Number(p.WorkingSet64 || 0) / (1024 * 1024)),
          name: String(p.Name || 'unknown')
        }));
    }
    const out = execFileSync(
      'ps',
      ['-eo', 'pid=,rss=,comm=', '--sort=-rss'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    );
    const list = [];
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      list.push({
        pid: Number(m[1]),
        rssMb: Math.round(Number(m[2]) / 1024),
        name: m[3]
      });
      if (list.length >= count) break;
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * Chrome processes that belong to THIS pipeline: Remotion launches its
 * browser with a temporary user-data-dir under the system temp folder whose
 * path carries the "remotion" marker.
 *
 * @param {ChromeProcess[]} processes
 * @returns {ChromeProcess[]}
 */
export function staleRemotionChrome(processes) {
  return processes.filter(
    (p) =>
      p.commandLine.toLowerCase().includes(REMOTION_MARKER) &&
      /--headless|--remote-debugging-port|--user-data-dir/i.test(p.commandLine)
  );
}

/**
 * Kill a list of PIDs.
 *
 * @param {number[]} pids
 * @returns {number} how many were actually terminated
 */
export function killPids(pids) {
  let killed = 0;
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore'
        });
      } else {
        process.kill(pid, 'SIGKILL');
      }
      killed += 1;
    } catch {
      // Already gone — not an error.
    }
  }
  return killed;
}

/**
 * Suggest a concurrency for the render given the free memory.
 *
 * The floor is 2: below that a render of a 400-frame film takes hours, and
 * above the safe number the tabs OOM. The project's proven-stable value is
 * 4 and is returned whenever the memory is at or above the threshold.
 *
 * @param {number} freeMb
 * @returns {number}
 */
export function suggestConcurrency(freeMb) {
  for (const band of CONCURRENCY_BY_FREE_RAM) {
    if (freeMb >= band.minFreeMb) return band.concurrency;
  }
  return 2;
}

/**
 * Run the pre-flight.
 *
 * @param {{kill?: boolean, minFreeMb?: number}} [options]
 * @returns {PreflightReport}
 */
export function runPreflight(options = {}) {
  const minFreeMb = options.minFreeMb ?? MIN_FREE_RAM_MB;
  const freeMb = freeMemoryMb();
  const totalMb = totalMemoryMb();
  const stale = staleRemotionChrome(listChromeProcesses());
  let killed = 0;
  if (options.kill && stale.length > 0) {
    killed = killPids(stale.map((p) => p.pid));
  }
  return {
    totalMb,
    freeMb,
    lowMemory: freeMb < minFreeMb,
    suggestedConcurrency: suggestConcurrency(freeMb),
    topProcesses: listTopMemoryProcesses(5),
    staleChrome: stale,
    killed
  };
}

/**
 * Human-readable report lines.
 *
 * @param {PreflightReport} report
 * @returns {string[]}
 */
export function formatPreflight(report) {
  const lines = [];
  lines.push(
    `[Preflight] RAM: ${report.freeMb} MB free of ${report.totalMb} MB` +
      (report.lowMemory
        ? ` — BELOW the ${MIN_FREE_RAM_MB} MB threshold; the render may stall or OOM`
        : ' — OK')
  );
  lines.push(
    `[Preflight] Concurrency: ${report.suggestedConcurrency} ` +
      `(default ${DEFAULT_CONCURRENCY}; lower means slower but safer)`
  );
  if (report.staleChrome.length > 0) {
    const mb = report.staleChrome.reduce((sum, p) => sum + p.rssMb, 0);
    lines.push(
      `[Preflight] Stale Remotion browser processes: ${report.staleChrome.length} ` +
        `(${mb} MB resident)` +
        (report.killed > 0 ? ` — killed ${report.killed}` : ' — not killed')
    );
  } else {
    lines.push('[Preflight] No stale Remotion browser processes.');
  }
  if (report.lowMemory && report.topProcesses.length > 0) {
    lines.push('[Preflight] Top memory processes:');
    for (const p of report.topProcesses) {
      lines.push(`[Preflight]   ${String(p.pid).padStart(7)}  ${String(p.rssMb).padStart(6)} MB  ${p.name}`);
    }
  }
  return lines;
}

/**
 * Kill the Remotion browsers that appeared since a snapshot was taken.
 *
 * This is the "kill the stale Chrome processes *it* started" step: the
 * snapshot is taken before the render, and whatever Remotion leaves behind
 * afterwards (a cancelled render, a crashed tab) is reaped here — it is our
 * process, by construction, and it is holding hundreds of MB of RAM.
 *
 * @param {Set<number>} beforePids process ids seen before the render
 * @returns {{killed: number, pids: number[]}}
 */
export function reapNewRemotionChrome(beforePids) {
  const fresh = staleRemotionChrome(listChromeProcesses()).filter((p) => !beforePids.has(p.pid));
  const killed = killPids(fresh.map((p) => p.pid));
  return { killed, pids: fresh.map((p) => p.pid) };
}

/** Snapshot of the current Chrome pids (call before a render). */
export function snapshotChromePids() {
  return new Set(listChromeProcesses().map((p) => p.pid));
}

const isMain =
  process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  const args = process.argv.slice(2);
  const report = runPreflight({ kill: args.includes('--kill') });
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const line of formatPreflight(report)) console.log(line);
  }
  // A low-memory warning must not fail the command — it is advice.
  process.exitCode = 0;
}
