/**
 * @fileoverview Full-browser discovery for the GPU render path.
 *
 * Remotion's bundled `chrome-headless-shell` only speaks SwiftShader (software
 * GL), so it can never reach the Intel UHD hardware path. To render with the
 * GPU the renderer has to be pointed at a FULL Chrome/Edge install — the
 * `CHROME` environment variable wins, otherwise the well-known install
 * locations are probed.
 *
 * Pure Node (`node:fs`) — no npm dependency, works offline.
 *
 * @module scripts/lib/browser
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Candidate full-browser executables, in preference order. */
function candidates() {
  if (process.platform === 'win32') {
    const roots = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env['LOCALAPPDATA']
    ].filter(Boolean);
    const out = [];
    for (const root of roots) {
      out.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      out.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
    return out;
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
}

/**
 * Find a full Chrome/Edge executable, or null when none is installed.
 *
 * @returns {string|null} absolute path to the executable
 */
export function findFullBrowser() {
  for (const candidate of candidates()) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Unreadable path — try the next one.
    }
  }
  return null;
}

/**
 * The browser Remotion will actually use.
 *
 * @param {string} [envValue] the CHROME environment variable (wins)
 * @returns {{executable: string|undefined, label: string, isFull: boolean}}
 */
export function resolveBrowser(envValue = process.env.CHROME) {
  if (envValue) {
    return { executable: envValue, label: `full browser (CHROME=${envValue})`, isFull: true };
  }
  const found = findFullBrowser();
  if (found) {
    return {
      executable: found,
      label: `full browser (${path.basename(found)})`,
      isFull: true
    };
  }
  return {
    executable: undefined,
    label: "Remotion's bundled chrome-headless-shell (software GL only)",
    isFull: false
  };
}

/** Total system memory in MB (for the pre-flight report). */
export function systemMemoryMb() {
  return Math.round(os.totalmem() / (1024 * 1024));
}
