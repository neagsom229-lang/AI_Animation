# WebGPU spike — Three.js `WebGPURenderer` inside Remotion's browser

**Status: ISOLATED SPIKE ONLY.** Nothing here is wired into the production
pipeline. No tracked file was modified. The only new files are in
`spikes/webgpu/`:

- `test.html` — minimal ES-module page that imports Three.js `WebGPURenderer`
  from `node_modules/three/examples/jsm/renderers/webgpu/WebGPURenderer.js`,
  builds a spinning box, calls `renderer.init()` + `await renderer.render()`
  four times, and records the selected backend and draw stats.
- `run.cjs` — Node harness. Starts a tiny `node:http` server that serves the
  page and the `three/` tree (with an import map for the bare `three`
  specifier), launches Remotion's own browser via
  `@remotion/renderer`'s `openBrowser('chrome', …)`, and polls the page's
  `window.__RESULT__` through `page.evaluate()`.

Machine / versions (observed):

- OS: Windows (Win64), Chrome UA `HeadlessChrome/158.0.8127.2` (headless shell)
  / `HeadlessChrome/158.0.0.0` (Chrome for Testing)
- `three`: **0.160.1** (experimental WebGPURenderer in this release)
- `@remotion/renderer`: **4.0.542**
- Node: **v22.23.3**
- GPU reported by WebGPU adapter: `vendor: intel`, `architecture: gen-12lp`
  (Intel Gen12LP / "UHD" class integrated graphics)
- Free RAM reported by Remotion during launch: **2489.79 MiB** (`os.freemem()`)

Relevant Remotion internals, verified by reading
`node_modules/@remotion/renderer/dist/open-browser.js`:

- Remotion already passes `--enable-unsafe-webgpu` and
  `--ignore-gpu-blocklist` to Chrome by default. So the blocker is **not** a
  missing Chrome flag.
- Remotion's default `chromeMode` is `headless-shell`, which uses
  `--headless=old` on Windows. The downloaded binary is
  `node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`.
- `chromeMode: 'chrome-for-testing'` uses the full Chrome binary
  (`node_modules/.remotion/chrome-for-testing/win64/chrome-win64/chrome.exe`,
  downloaded by Remotion's `ensureBrowser`) with `--headless=new`.
  This is a supported, documented Remotion option: CLI
  `--chrome-mode=chrome-for-testing` or `Config.setChromeMode('chrome-for-testing')`
  in `remotion.config.ts`. Valid values: `headless-shell` | `chrome-for-testing`.

---

## Commands run and REAL output

### 1. Default mode (Remotion's `chrome-headless-shell`)

```
cd D:\General\Animation\kuanimation-skill
node spikes/webgpu/run.cjs
```

(exit code 0)

Key output:

```
chromeMode  : headless-shell
gl          : (Remotion default)
serving test page at http://127.0.0.1:52040/test.html
openBrowser() succeeded
BROWSER [log] userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... HeadlessChrome/158.0.8127.2 Safari/537.36
BROWSER [log] navigator.gpu type: object
BROWSER [log] isSecureContext: true
page.goto() succeeded; waiting for module + WebGPU init...
BROWSER [warning] No available adapters.
BROWSER [log] navigator.gpu.requestAdapter(): null (NO ADAPTER)
BROWSER [log] THREE.REVISION: 160
BROWSER [warning] No available adapters.
BROWSER [warning] No available adapters.
BROWSER [log] Imported WebGPURenderer from three/examples/jsm/renderers/webgpu/WebGPURenderer.js
BROWSER [warning] THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.
BROWSER [log] selected backend: WebGL2-fallback
BROWSER [log] renderer.init() resolved
BROWSER [log] rendered 4 frames; info.render.frame=undefined calls=4 triangles=12
BROWSER [log] RESULT: SUCCESS
...
FINAL: RENDER OK BUT NOT WEBGPU (backend=WebGL2-fallback)
```

→ `navigator.gpu` exists, but `requestAdapter()` returns **null** with the
console warning `No available adapters.` Three.js therefore falls back to the
WebGL2 backend and prints
`THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.`
Frames do render (4 draw calls, 12 triangles), but **not through WebGPU**.

### 2. Default mode with Vulkan GL (`--gl=vulkan`)

```
node spikes/webgpu/run.cjs --gl=vulkan
```

(exit code 0)

Same result as #1: `requestAdapter(): null (NO ADAPTER)`, backend
`WebGL2-fallback`. Adding Vulkan-related flags did not produce a WebGPU adapter
in the headless shell.

### 3. Forcing full Chrome for Testing (`--chrome-mode=chrome-for-testing`) — WORKS

```
node spikes/webgpu/run.cjs --chrome-mode=chrome-for-testing
```

(exit code 0; reproduced twice with identical results, including once with
`--log-level=verbose`)

```
chromeMode  : chrome-for-testing
gl          : (Remotion default)
serving test page at http://127.0.0.1:54660/test.html
openBrowser() succeeded
BROWSER [log] userAgent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... HeadlessChrome/158.0.0.0 Safari/537.36
BROWSER [log] navigator.gpu type: object
BROWSER [log] isSecureContext: true
page.goto() succeeded; waiting for module + WebGPU init...
BROWSER [log] navigator.gpu.requestAdapter(): ADAPTER FOUND
BROWSER [log] adapter.info: {"vendor":"intel","architecture":"gen-12lp","device":"","description":""}
BROWSER [log] THREE.REVISION: 160
BROWSER [log] Imported WebGPURenderer from three/examples/jsm/renderers/webgpu/WebGPURenderer.js
BROWSER [log] selected backend: WebGPU
BROWSER [log] renderer.init() resolved
BROWSER [log] rendered 4 frames; info.render.frame=undefined calls=4 triangles=12
BROWSER [log] RESULT: SUCCESS

=== RESULT ===
{
  "status": "SUCCESS",
  "backend": "WebGPU",
  "calls": 4,
  "triangles": 12
}

FINAL: WEBGPU WORKS (renderer used the WebGPU backend)
```

Adapter identity came from `adapter.info` (Chrome 158 returned only
`vendor: intel` and `architecture: gen-12lp`; `device`/`description` were empty
strings in this build). The spike would fall back to `requestAdapterInfo()`
only if `adapter.info` were absent, which did not happen here.

### 4. One flaky launch (honest note)

The **first** `chrome-for-testing` run failed with:

```
HARNESS ERROR: TimeoutError: Timed out after 25000 ms while trying to connect
to the browser! ... at BrowserRunner.js:306
```

This was a cold-start launch timeout, not a WebGPU failure: the same command
succeeded on the next two consecutive runs. The headless-shell runs never had
this problem. Treat Chrome-for-Testing startup as occasionally flaky on this
machine (25 s Remotion launch timeout).

---

## Conclusion

**It depends on which Chrome binary Remotion uses — and the default does NOT work.**

- ❌ **Default Remotion mode (`headless-shell`, `--headless=old`): WebGPU does
  not work.** `navigator.gpu` is present but `requestAdapter()` returns `null`
  ("No available adapters."), so `three@0.160.1`'s `WebGPURenderer` silently
  falls back to its WebGL2 backend. A frame does render, but it is WebGL2, not
  WebGPU. `--gl=vulkan` does not change this.
- ✅ **Full Chrome for Testing (`chromeMode: 'chrome-for-testing'` /
  `--chrome-mode=chrome-for-testing`, `--headless=new`): WebGPU works.**
  An Intel `gen-12lp` adapter is found, `WebGPURenderer` selects its WebGPU
  backend, `renderer.init()` resolves, and 4 frames render
  (`calls=4, triangles=12`). Reproduced reliably.
- The machine has roughly 2.4–3 GB free RAM; the full Chrome + WebGPU path ran
  fine within that budget.
- `three@0.160.1`'s WebGPURenderer is experimental: its `init()` and `render()`
  are async, and it silently falls back to WebGL2 when no adapter exists. Any
  real integration must explicitly check `renderer.backend.isWebGPUBackend`
  (or `navigator.gpu.requestAdapter()`) rather than assuming WebGPU, and must
  adopt async init/render with Remotion's `delayRender()`/`continueRender()`.
  Remotion's own `<ThreeCanvas>` (`@remotion/three`) uses the classic
  `WebGLRenderer`, so swapping in `WebGPURenderer` would be custom work — this
  spike did **not** modify or validate that path.

## Side effects / scope note

- No tracked file was changed (`git status --short spikes` shows only
  `?? spikes/`). Nothing under `remotion/`, `scripts/`, `src/`, or
  `package.json` was touched.
- Remotion's `ensureBrowser` may have downloaded the full Chrome for Testing
  binary into `node_modules/.remotion/chrome-for-testing/` (gitignored, not a
  tracked file). That is a browser cache, not a source change.

## How to reproduce

```
cd D:\General\Animation\kuanimation-skill

# Default Remotion browser (expected: WebGL2 fallback, NOT WebGPU)
node spikes/webgpu/run.cjs

# Force full Chrome for Testing (expected: real WebGPU)
node spikes/webgpu/run.cjs --chrome-mode=chrome-for-testing

# Optional diagnostics
node spikes/webgpu/run.cjs --chrome-mode=chrome-for-testing --log-level=verbose
node spikes/webgpu/run.cjs --gl=vulkan
```
