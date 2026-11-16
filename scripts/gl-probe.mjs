// Phase 5 probe: one-frame renderStill across gl backends on the full Chrome.
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

process.env.CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browserExecutable = process.env.CHROME;

const bundleOut = await bundle({
  entryPoint: path.resolve('./remotion/index.ts'),
  publicDir: path.resolve('./public'),
});
const story = JSON.parse((await import('fs')).readFileSync('src/stories/khmer-temple.json', 'utf8'));
const voiceData = JSON.parse((await import('fs')).readFileSync('public/voice.json', 'utf8'));
const inputProps = { story, voiceData, isMock: false };
const composition = await selectComposition({ serveUrl: bundleOut, id: 'StoryFilm', inputProps, browserExecutable });

for (const gl of [undefined, 'angle', 'angle-egl', 'swiftshader']) {
  const t0 = Date.now();
  try {
    await renderStill({
      composition, serveUrl: bundleOut,
      output: `out/gl-probe-${String(gl ?? 'default')}.png`,
      frame: 30, inputProps,
      ...(gl ? { gl } : {}),
      browserExecutable,
    });
    console.log(`gl=${String(gl ?? 'default')} OK in ${Date.now() - t0}ms`);
  } catch (err) {
    console.log(`gl=${String(gl ?? 'default')} FAILED: ${err.message.split('\n')[0]}`);
  }
}
process.exit(0);
