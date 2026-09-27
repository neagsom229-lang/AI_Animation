# How Angkor Wat Was Built

A 180-second, six-scene watercolour explainer with English captions, an original instrumental score, and Microsoft Edge neural narration.

This project uses the shared `../assets/` Kuanimation drawing runtime; keep this folder at the workspace root beside `assets/`.

## Render on Windows PowerShell

Requirements: Node.js/npm, Python 3, FFmpeg/FFprobe, Google Chrome, and an internet connection for Edge TTS. Set `CHROME` if Chrome is not installed at the default path.

```powershell
cd angkor-built
$env:CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm install --no-audit --no-fund
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install edge-tts
.\.venv\Scripts\python.exe tts_edge.py --voice en-US-GuyNeural --out voice
node render.mjs film.html --grid 36
node mix.mjs film.html
node render.mjs film.html
```

The finished video is `out\film-final.mp4`; the silent picture-only render is `out\film.mp4`, and the contact sheet is `out\film-contact.jpg`.

Choose `en-US-AriaNeural` instead of `en-US-GuyNeural` in the TTS command for the alternate voice. Re-run with `--force` to regenerate existing WAV cues.

All generated files stay inside this project folder.
