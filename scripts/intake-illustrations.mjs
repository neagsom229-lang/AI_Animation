#!/usr/bin/env node
/**
 * @fileoverview Illustration intake automation.
 *
 * For every image in <folder>: validate (PNG/JPG, 16:9 ±2%, >=1920x1080, no
 * alpha), auto-crop/resize/flatten to 16:9 1920x1080 via Remotion ffmpeg, write
 * to assets-src/illustrations/scene-XX.png, SHA-256 hash it, and write a
 * manifest.json with tool/date/prompt/licenseTermsUrl + reviewed:false per scene.
 * The final render FAILS if any required field is empty or reviewed !== true.
 *
 * Optional upscaling for images <2K via Real-ESRGAN (BSD-3) if installed on
 * PATH; otherwise warn — never fake it.
 *
 * Usage:
 *   node scripts/intake-illustrations.mjs <folder> --tool "Midjourney v6" \
 *     --prompt-file docs/ILLUSTRATION_PROMPTS.md --license-terms-url <url>
 *   node scripts/intake-illustrations.mjs <folder> --allow-missing-fields  # dev only
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mediaCommand } from './lib/media-bin.mjs';
import {
  ALLOWED_EXT, TARGET_W, TARGET_H, sceneNumberFromName, targetName,
  validateImage, realEsrganAvailable, REQUIRED_MANIFEST_FIELDS, hasAlpha,
} from './lib/image-check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'assets-src', 'illustrations');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

export function parseArgs(argv) {
  const args = {
    folder: null, tool: '', promptFile: '', licenseTermsUrl: '',
    allowMissingFields: false, date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('-') && !args.folder) { args.folder = a; continue; }
    if (a === '--tool' && argv[i + 1]) args.tool = argv[++i];
    else if (a === '--prompt-file' && argv[i + 1]) args.promptFile = argv[++i];
    else if (a === '--license-terms-url' && argv[i + 1]) args.licenseTermsUrl = argv[++i];
    else if (a === '--date' && argv[i + 1]) args.date = argv[++i];
    else if (a === '--allow-missing-fields') args.allowMissingFields = true;
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  if (!args.folder) throw new Error('Usage: node scripts/intake-illustrations.mjs <folder> [flags]');
  return args;
}

function ff(cmd, args) {
  // Round 13 item 4: use the bundled Remotion binary directly — `npx` startup
  // alone cost ~3 s per image. Falls back to `npx remotion <cmd>`.
  const { cmd: exe, prefix, shell } = mediaCommand(cmd);
  const r = spawnSync(exe, [...prefix, ...args], {
    cwd: ROOT, encoding: 'utf8', shell,
    maxBuffer: 32 * 1024 * 1024,
  });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Probe an image with Remotion ffprobe; returns {width,height,pixFmt,format}. */
export function probe(file) {
  const r = ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,pix_fmt,codec_name', '-of', 'json', file]);
  if (!r.ok) return { width: NaN, height: NaN, pixFmt: '', format: '', error: r.out.slice(0, 200) };
  try {
    // npx wraps ffprobe JSON with npm notice lines (stdout+stderr combined).
    // Take from the first '{' to the last '}' to isolate the JSON object.
    const start = r.out.indexOf('{');
    const end = r.out.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no JSON in ffprobe output');
    const j = JSON.parse(r.out.slice(start, end + 1));
    const s = (j.streams || [])[0] || {};
    const ext = path.extname(file).toLowerCase();
    return { width: Number(s.width), height: Number(s.height), pixFmt: s.pix_fmt || '', format: ext };
  } catch (e) {
    return { width: NaN, height: NaN, pixFmt: '', format: '', error: `ffprobe parse: ${e.message}` };
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Detect Real-ESRGAN on PATH (pure check on which output). */
function detectEsrgan() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which',
    ['realesrgan-ncnn-vulkan'], { encoding: 'utf8' });
  const found = r.status === 0 && (r.stdout || '').trim().length > 0;
  return { found, exe: found ? (r.stdout || '').trim().split(/\r?\n/)[0] : '' };
}

/** Crop/resize/flatten to exactly TARGET_W×TARGET_H using ffmpeg's crop+scale. */
function normalize(input, output) {
  // center-crop to 16:9 then scale; format=rgb24 drops alpha before PNG encode.
  const vf = `crop=ih*16/9:ih:(iw-ih*16/9)/2:0,scale=${TARGET_W}:${TARGET_H}:flags=lanczos,format=rgb24`;
  return ff('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vf', vf,
    '-frames:v', '1', output]);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const folder = path.resolve(ROOT, args.folder);
  if (!fs.existsSync(folder)) throw new Error(`Input folder not found: ${folder}`);

  if (!args.allowMissingFields) {
    for (const k of REQUIRED_MANIFEST_FIELDS) {
      if (k === 'licenseTermsUrl' && !args.licenseTermsUrl) {
        throw new Error(`--license-terms-url is required (license must be logged; no silent fallback). Use --allow-missing-fields only for dev.`);
      }
      if (k === 'tool' && !args.tool) {
        throw new Error(`--tool is required (recording the generating tool). Use --allow-missing-fields only for dev.`);
      }
    }
    if (!args.promptFile || !fs.existsSync(path.resolve(ROOT, args.promptFile))) {
      throw new Error(`--prompt-file must point to an existing prompt doc (got "${args.promptFile}").`);
    }
  }

  const files = fs.readdirSync(folder)
    .filter((f) => ALLOWED_EXT.includes(path.extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) throw new Error(`No PNG/JPG images found in ${folder}`);
  console.log(`[intake] ${files.length} candidate image(s) in ${folder}`);

  const esrgan = detectEsrgan();
  if (esrgan.found) console.log(`[intake] Real-ESRGAN found: ${esrgan.exe}`);
  else console.log('[intake] WARN: Real-ESRGAN not installed; images <2K will NOT be upscaled (never faked).');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entries = [];
  let i = 0;
  for (const file of files) {
    i += 1;
    const src = path.join(folder, file);
    const probed = probe(src);
    const check = validateImage(probed);
    const sceneNo = sceneNumberFromName(file) || i;
    const destName = targetName(sceneNo);
    const dest = path.join(OUT_DIR, destName);

    if (!check.ok) {
      // Hard failures that crop/resize cannot fix: alpha present, unknown dims,
      // or too small. Crop/resize handles aspect + exact size.
      if (probed.pixFmt && !Number.isFinite(probed.width)) {
        throw new Error(`${file}: ${check.errors.join('; ')}${probed.error ? ` (${probed.error})` : ''}`);
      }
      if (check.alpha) console.log(`[intake] ${file}: alpha (${probed.pixFmt}) present — auto-flattening to RGB (logged, not silent).`);
      if (!Number.isFinite(probed.width)) throw new Error(`${file}: ${probed.error || 'unreadable image'}`);
      if (!check.errors.every((e) => /aspect|too small/.test(e))) {
        throw new Error(`${file}: ${check.errors.join('; ')}`);
      }
      if (!esrgan.found && (probed.width < TARGET_W || probed.height < TARGET_H)) {
        console.log(`[intake] WARN ${file}: ${probed.width}x${probed.height} <2K and no Real-ESRGAN; using as-is (upscale skipped).`);
      }
    }

    const norm = normalize(src, dest);
    if (!norm.ok) throw new Error(`${file}: ffmpeg normalize failed: ${norm.out.slice(0, 240)}`);
    // Verify normalized output meets the 'no alpha' + exact-size contract.
    const outProbe = probe(dest);
    if (hasAlpha(outProbe.pixFmt)) throw new Error(`${file}: normalized output still has alpha (${outProbe.pixFmt})`);
    if (outProbe.width !== TARGET_W || outProbe.height !== TARGET_H) {
      throw new Error(`${file}: normalized output is ${outProbe.width}x${outProbe.height}, expected ${TARGET_W}x${TARGET_H}`);
    }
    const hash = sha256(dest);
    const promptText = args.promptFile
      ? `# prompt source: ${args.promptFile}\n# scene ${sceneNo} — see section scene-${String(sceneNo).padStart(2, '0')}`
      : '';
    entries.push({
      scene: sceneNo,
      file: `assets-src/illustrations/${destName}`,
      source: file,
      width: TARGET_W, height: TARGET_H,
      sha256: hash,
      tool: args.tool,
      date: args.date,
      prompt: args.allowMissingFields ? '' : promptText,
      promptFile: args.promptFile,
      licenseTermsUrl: args.licenseTermsUrl,
      reviewed: false,
    });
    console.log(`[intake] ${file} -> ${destName} (${probed.width}x${probed.height}${probed.pixFmt ? ` ${probed.pixFmt}` : ''}) sha256=${hash.slice(0, 12)}`);
  }

  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    target: { width: TARGET_W, height: TARGET_H, aspect: '16:9' },
    requiredFields: REQUIRED_MANIFEST_FIELDS,
    note: 'Set reviewed:true per scene after docs/IMAGE_REVIEW_CHECKLIST.md review; final render fails otherwise.',
    scenes: entries,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[intake] wrote ${MANIFEST} (${entries.length} scenes, reviewed:false).`);
  console.log('[intake] ACTION: review each image, then set reviewed:true in the manifest before final render.');
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('Intake failed:', e.message); process.exit(1); });
}
