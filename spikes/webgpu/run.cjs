/**
 * ISOLATED SPIKE (not part of the production pipeline).
 *
 * Launches Remotion's bundled Chrome Headless Shell via @remotion/renderer's
 * `openBrowser()` API, serves a minimal Three.js WebGPURenderer test page over
 * a local HTTP server, and reports whether WebGPU initializes and renders.
 *
 * Usage (from repo root):
 *   node spikes/webgpu/run.js                     # default GL backend, headless-shell
 *   node spikes/webgpu/run.js --gl=vulkan         # try Vulkan backend
 *   node spikes/webgpu/run.js --gl=angle
 *   node spikes/webgpu/run.js --chrome-mode=chrome-for-testing
 *
 * NOTE: Remotion 4.0.542 already adds `--enable-unsafe-webgpu` and
 * `--ignore-gpu-blocklist` to the Chrome args by default (verified in
 * node_modules/@remotion/renderer/dist/open-browser.js).
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const THREE_ROOT = path.join(REPO_ROOT, 'node_modules', 'three');
const HTML_PATH = path.join(__dirname, 'test.html');

const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : null;
};
const glArg = argValue('gl');
const chromeMode = argValue('chrome-mode') || 'headless-shell';
const logLevel = argValue('log-level') || 'error';
const gl = glArg && glArg !== 'default' ? glArg : undefined;

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };

function makeServer() {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (urlPath === '/' || urlPath === '/test.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(HTML_PATH));
        return;
      }
      if (urlPath.startsWith('/three/')) {
        const rel = urlPath.slice('/three/'.length);
        const full = path.resolve(THREE_ROOT, rel);
        if (!full.startsWith(THREE_ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end('not found: ' + rel); return; }
        res.writeHead(200, { 'Content-Type': (MIME[path.extname(full)] || 'application/octet-stream') + '; charset=utf-8' });
        res.end(fs.readFileSync(full));
        return;
      }
      res.writeHead(404);
      res.end('not found');
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const consoleLines = [];
  let browser = null;
  let server = null;

  console.log('=== WEBGPU SPIKE (isolated) ===');
  console.log('repo root   : ' + REPO_ROOT);
  console.log('three root  : ' + THREE_ROOT + ' (v' + require(path.join(THREE_ROOT, 'package.json')).version + ')');
  console.log('chromeMode  : ' + chromeMode);
  console.log('gl          : ' + (gl === undefined ? '(Remotion default)' : gl));
  console.log('');

  try {
    const made = await makeServer();
    server = made.server;
    const port = made.port;
    const url = 'http://127.0.0.1:' + port + '/test.html';
    console.log('serving test page at ' + url);

    const { openBrowser } = require('@remotion/renderer');
    browser = await openBrowser('chrome', {
      logLevel,
      chromeMode,
      chromiumOptions: {
        gl,
        headless: true,
      },
    });
    console.log('openBrowser() succeeded');

    const page = await browser.newPage({
      context: () => null,
      logLevel: 'error',
      indent: false,
      pageIndex: 0,
      onBrowserLog: (log) => {
        const line = '[' + log.type + '] ' + log.text;
        consoleLines.push(line);
        console.log('BROWSER ' + line);
      },
      onLog: () => {},
    });

    await page.goto({ url, timeout: 30000 });
    console.log('page.goto() succeeded; waiting for module + WebGPU init...');

    let result = null;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      result = await page.evaluate(() => (typeof window.__RESULT__ !== 'undefined' ? window.__RESULT__ : null));
      if (result && result.status !== 'running') break;
      await sleep(250);
    }

    console.log('');
    console.log('=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log('=== CONSOLE (' + consoleLines.length + ' lines) ===');
    console.log(consoleLines.join('\n') || '(none)');

    if (!result) {
      console.log('\nFINAL: INCONCLUSIVE - page never produced a result (timeout)');
      process.exitCode = 2;
    } else if (result.status === 'SUCCESS' && result.backend === 'WebGPU') {
      console.log('\nFINAL: WEBGPU WORKS (renderer used the WebGPU backend)');
    } else if (result.status === 'SUCCESS') {
      console.log('\nFINAL: RENDER OK BUT NOT WEBGPU (backend=' + result.backend + ')');
    } else {
      console.log('\nFINAL: ERROR - see result.error above');
      process.exitCode = 3;
    }
  } catch (e) {
    console.error('HARNESS ERROR:', e && e.stack ? e.stack : String(e));
    process.exitCode = 1;
  } finally {
    if (browser) { try { await browser.close({ silent: true }); } catch (_) {} }
    if (server) { try { await new Promise((r) => server.close(r)); } catch (_) {} }
  }
}

main();
