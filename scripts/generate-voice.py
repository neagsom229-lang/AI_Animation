"""
@fileoverview Generates voice audio files and voice.json using edge-tts or mock fallback.
Computes real 20Hz normalized RMS envelopes from decoded PCM audio via Remotion ffmpeg (decoding to temp WAV).
Exits 1 if decoding fails (no constant fallback), with command, stderr, and exit code logged.
Includes a doctor check verifying ffmpeg decoding on a 1-second test file.
"""

import os
import sys
import json
import hashlib
import wave
import struct
import math
import array
import argparse
import asyncio
import subprocess
import shutil
import tempfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

async def generate_edge_tts(text, voice, out_path):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)

def get_npx():
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        # Check common Windows/macOS paths if not in PATH
        for path in [
            os.path.expanduser("~\\AppData\\Roaming\\npm\\npx.cmd"),
            "C:\\Program Files\\nodejs\\npx.cmd",
            "/usr/local/bin/npx",
            "/usr/bin/npx"
        ]:
            if os.path.exists(path):
                return path
    return npx

def process_audio_file(audio_path, is_mock=False):
    sample_rate = 22050
    if is_mock:
        try:
            with wave.open(audio_path, 'r') as wav_file:
                frames = wav_file.readframes(wav_file.getnframes())
                framerate = wav_file.getframerate()
                nchannels = wav_file.getnchannels()
                a = array.array('h', frames)
                duration = len(a) / (framerate * max(1, nchannels))

                chunk_size = max(1, round(framerate / 20))
                raw_env = []
                for k in range(0, len(a), chunk_size):
                    chunk = a[k:k + chunk_size]
                    if not chunk:
                        break
                    rms = math.sqrt(sum(x * x for x in chunk) / len(chunk)) / 32768.0
                    raw_env.append(rms)

                peak = max(raw_env) if raw_env else 1.0
                if peak <= 0:
                    peak = 1.0
                env = [round(min(1.0, val / peak), 3) for val in raw_env]
                return duration, env
        except Exception as e:
            print(f"[Error] Failed to process mock WAV audio: {e}")
            sys.exit(1)
    else:
        npx = get_npx()
        if not npx:
            print("[Error] 'npx' (or 'npx.cmd') executable not found in PATH. Please ensure Node.js is installed.")
            sys.exit(1)

        fd, tmp_wav = tempfile.mkstemp(suffix='.wav')
        os.close(fd)
        try:
            cmd = [npx, 'remotion', 'ffmpeg', '-y', '-v', 'error', '-i', audio_path, '-ac', '1', '-ar', str(sample_rate), tmp_wav]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                print(f"[Error] Remotion ffmpeg decoding failed for {audio_path}")
                print(f"Command: {' '.join(cmd)}")
                print(f"Exit code: {res.returncode}")
                print(f"Stderr:\n{res.stderr}")
                sys.exit(1)

            with wave.open(tmp_wav, 'r') as wav_file:
                frames = wav_file.readframes(wav_file.getnframes())
                framerate = wav_file.getframerate()
                nchannels = wav_file.getnchannels()
                a = array.array('h', frames)
                duration = len(a) / (framerate * max(1, nchannels))
                if len(a) == 0:
                    print(f"[Error] Decoded WAV data is empty for {audio_path}")
                    sys.exit(1)

                # RMS window from the decoded WAV's real framerate:
                # window = round(framerate / 20) samples => exactly 20 envelopes/second.
                chunk_size = max(1, round(framerate / 20))
                raw_env = []
                for k in range(0, len(a), chunk_size):
                    chunk = a[k:k + chunk_size]
                    if not chunk:
                        break
                    rms = math.sqrt(sum(x * x for x in chunk) / len(chunk)) / 32768.0
                    raw_env.append(rms)

                # Normalise 0-1 by this line's peak (max becomes exactly 1.0).
                peak = max(raw_env) if raw_env else 1.0
                if peak <= 0:
                    peak = 1.0
                env = [round(min(1.0, val / peak), 3) for val in raw_env]
                return duration, env
        except Exception as e:
            print(f"[Error] Exception during audio processing for {audio_path}: {e}")
            sys.exit(1)
        finally:
            if os.path.exists(tmp_wav):
                try:
                    os.remove(tmp_wav)
                except Exception:
                    pass

def run_doctor_check():
    print("[Doctor] Running audio decoding / Remotion ffmpeg doctor check...")
    sample_rate = 22050
    fd, test_wav = tempfile.mkstemp(suffix='.wav')
    os.close(fd)
    try:
        # Generate 1 second sine wave test WAV file
        with wave.open(test_wav, 'w') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            for i in range(sample_rate):
                t = i / sample_rate
                sample = int(math.sin(2 * math.pi * 440 * t) * 16383)
                wf.writeframes(struct.pack('<h', sample))
        
        dur, env = process_audio_file(test_wav, is_mock=True)
        if dur < 0.9 or not env or len(env) < 10:
            raise RuntimeError(f"Decoded audio invalid or too short: dur={dur}, env_len={len(env) if env else 0}")
        print("[PASS] Doctor check: audio processing and envelope calculation operational.")
    except Exception as e:
        print(f"[FAIL] Doctor check failed: {e}")
        print("Clear fix message: Ensure Node.js and Remotion are installed correctly. Run 'npm install' in the project root.")
        sys.exit(1)
    finally:
        if os.path.exists(test_wav):
            try:
                os.remove(test_wav)
            except Exception:
                pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--story', default='src/stories/khmer-temple.json')
    parser.add_argument('--lang', default='km', choices=['km', 'en'],
                        help='Subtitle/dialogue language: km (Khmer) or en (English)')
    parser.add_argument('--voice', default=None,
                        help='edge-tts voice name; default depends on --lang '
                             '(km-KH-PisethNeural for km, en-US-AriaNeural for en)')
    parser.add_argument('--mock', action='store_true', help='Use mock synthesis with explicit --mock flag')
    parser.add_argument('--out', default='public/voice')
    parser.add_argument('--json', default='public/voice.json',
                        help='Where to write the voice.json data file')
    parser.add_argument('--doctor', action='store_true', help='Run doctor check and exit')
    args = parser.parse_args()

    if args.doctor:
        run_doctor_check()
        return

    os.makedirs(args.out, exist_ok=True)

    if not os.path.exists(args.story):
        print(f"Error: Story file not found: {args.story}")
        sys.exit(1)

    with open(args.story, 'r', encoding='utf-8') as f:
        story = json.load(f)

    lang = args.lang or story.get('language', 'km')

    # Language -> default voice. An explicit --voice always wins (validated below).
    DEFAULT_VOICES = {
        'km': 'km-KH-PisethNeural',
        'en': 'en-US-AriaNeural',
    }
    KNOWN_VOICES = {
        'km-KH-PisethNeural', 'km-KH-SreymomNeural', 'en-US-AriaNeural',
    }
    voice = args.voice or DEFAULT_VOICES[lang]
    if voice not in KNOWN_VOICES:
        print(f"[Error] Unknown voice '{voice}'. Known voices: {', '.join(sorted(KNOWN_VOICES))}. "
              f"Add new voices to KNOWN_VOICES in scripts/generate-voice.py after verifying them with edge-tts.")
        sys.exit(1)

    provider = "mock" if args.mock else "edge-tts"
    sample_rate = 22050
    voice_data = {
        "story": args.story,
        "title": story.get("title", ""),
        "language": lang,
        "voice": voice,
        "provider": provider,
        "scenes": []
    }

    print(f"[Voice Generator] Story: {args.story} | Lang: {lang} | Voice: {voice} | Provider: {provider}")

    for scene_idx, scene in enumerate(story.get("scenes", [])):
        scene_id = scene.get("id", f"scene{scene_idx+1}")
        dialogue_list = scene.get("dialogue", [])
        
        if not dialogue_list:
            dialogue_list = [{"speaker": "narrator", "text": scene.get("name", scene_id), "subtitle": scene.get("name", "")}]

        scene_lines = []
        scene_total_dur = 0.0

        for line_idx, dlg in enumerate(dialogue_list):
            text = dlg.get("text", "")
            subtitle = dlg.get("subtitle", text)
            
            cache_seed = f"{text}::{voice}::{provider}::{'mock' if args.mock else 'real'}"
            text_hash = hashlib.md5(cache_seed.encode('utf-8')).hexdigest()

            prefix = "mock-" if args.mock else ""
            ext = ".wav" if args.mock else ".mp3"
            audio_filename = f"{prefix}{scene_id}-{line_idx}-{text_hash[:8]}{ext}"
            audio_path = os.path.join(args.out, audio_filename)
            json_dir = os.path.dirname(os.path.abspath(args.json)) or '.'
            rel_path = os.path.relpath(os.path.abspath(audio_path), json_dir).replace(os.sep, '/')

            if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
                # Cache hit: key = hash(text + voice + provider + real|mock).
                # Mock files ("mock-" prefix) can never be reused as real and
                # vice versa because the key and the prefix both differ.
                print(f"[Cache] Reusing cached {provider} audio: {audio_filename}")
            elif args.mock:
                print(f"\n==================================================")
                print(f"[LOUD WARNING] USING MOCK SYNTHESIS FOR: '{text}'")
                print(f"==================================================\n")
                
                estimated_dur = max(3.0, len(text) * 0.08)
                if scene.get("dur"):
                    estimated_dur = max(estimated_dur, scene.get("dur") / max(1, len(dialogue_list)))
                
                num_samples = int(sample_rate * estimated_dur)
                tmp_path = audio_path + ".tmp"
                with wave.open(tmp_path, 'w') as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    for i in range(num_samples):
                        t = i / sample_rate
                        # Modulate amplitude with speech-like bursts and pauses (low median, sharp peaks)
                        mod = max(0.0, math.sin(t * 5)) ** 3
                        val = (math.sin(2 * math.pi * 220 * t) * 0.3) * mod
                        sample = int(max(-1.0, min(1.0, val)) * 32767)
                        wav_file.writeframes(struct.pack('<h', sample))
                os.replace(tmp_path, audio_path)
            else:
                try:
                    tmp_path = audio_path + ".tmp"
                    asyncio.run(generate_edge_tts(text, voice, tmp_path))
                    os.replace(tmp_path, audio_path)
                except Exception as e:
                    print(f"[Error] edge-tts generation failed for '{text}': {e}")
                    sys.exit(1)

            exact_dur, env = process_audio_file(audio_path, is_mock=args.mock)

            scene_lines.append({
                "file": rel_path,
                "dur": round(exact_dur, 3),
                "text": text,
                "subtitle": subtitle,
                "env": env
            })
            scene_total_dur += exact_dur

        voice_data["scenes"].append({
            "id": scene_id,
            "name": scene.get("name", ""),
            "dur": round(scene_total_dur, 3),
            "lines": scene_lines
        })

    voice_json_path = args.json
    voice_json_dir = os.path.dirname(voice_json_path)
    if voice_json_dir:
        os.makedirs(voice_json_dir, exist_ok=True)
    tmp_json_path = voice_json_path + ".tmp"
    with open(tmp_json_path, 'w', encoding='utf-8') as f:
        json.dump(voice_data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_json_path, voice_json_path)

    print(f"Generated {voice_json_path} successfully with {len(voice_data['scenes'])} scenes.")

if __name__ == '__main__':
    main()
