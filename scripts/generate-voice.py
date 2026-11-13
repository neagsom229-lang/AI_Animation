"""
@fileoverview Generates voice audio files and voice.json using edge-tts (default km-KH-PisethNeural / en-US-AriaNeural)
or optional Gemini / mock fallback with --mock flag and loud warning.
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

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

async def generate_edge_tts(text, voice, out_path):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--story', default='src/stories/khmer-temple.json')
    parser.add_argument('--lang', default='km')
    parser.add_argument('--voice', default='')
    parser.add_argument('--mock', action='store_true', help='Use mock synthesis with a loud warning instead of edge-tts')
    parser.add_argument('--out', default='public/voice')
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    if not os.path.exists(args.story):
        print(f"Error: Story file not found: {args.story}")
        sys.exit(1)

    with open(args.story, 'r', encoding='utf-8') as f:
        story = json.load(f)

    lang = args.lang or story.get('language', 'km')
    voice = args.voice
    if not voice:
        voice = 'km-KH-PisethNeural' if lang == 'km' else 'en-US-AriaNeural'

    sample_rate = 22100
    voice_data = {
        "story": args.story,
        "title": story.get("title", ""),
        "language": lang,
        "scenes": []
    }

    print(f"[Voice Generator] Story: {args.story} | Lang: {lang} | Voice: {voice} | Mock: {args.mock}")

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
            
            text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
            audio_filename = f"{scene_id}-{line_idx}-{text_hash[:8]}.wav"
            audio_path = os.path.join(args.out, audio_filename)
            rel_path = f"voice/{audio_filename}"

            success = False
            if not args.mock:
                try:
                    mp3_path = audio_path.replace('.wav', '.mp3')
                    asyncio.run(generate_edge_tts(text, voice, mp3_path))
                    os.rename(mp3_path, audio_path)
                    success = True
                except Exception as e:
                    print(f"[Voice Generator] edge-tts warning/failure: {e}")
                    success = False

            if not success:
                if not args.mock:
                    print(f"[Error] edge-tts failed and --mock was not specified. Aborting.")
                    sys.exit(1)
                else:
                    print(f"\n==================================================")
                    print(f"[LOUD WARNING] USING MOCK SYNTHESIS")
                    print(f"==================================================\n")
                    
                    estimated_dur = max(3.0, len(text) * 0.08)
                    if scene.get("dur"):
                        estimated_dur = max(estimated_dur, scene.get("dur") / max(1, len(dialogue_list)))
                    
                    num_samples = int(sample_rate * estimated_dur)
                    with wave.open(audio_path, 'w') as wav_file:
                        wav_file.setnchannels(1)
                        wav_file.setsampwidth(2)
                        wav_file.setframerate(sample_rate)
                        for i in range(num_samples):
                            t = i / sample_rate
                            val = math.sin(2 * math.pi * 220 * t) * 0.1
                            sample = int(val * 32767)
                            wav_file.writeframes(struct.pack('<h', sample))

            exact_dur = 3.0
            env = [0.1] * 20
            try:
                with wave.open(audio_path, 'r') as wav_file:
                    frames = wav_file.readframes(wav_file.getnframes())
                    framerate = wav_file.getframerate()
                    nchannels = wav_file.getnchannels()
                    a = array.array('h', frames)
                    exact_dur = len(a) / (framerate * max(1, nchannels))
                    
                    chunk_size = int(framerate * 0.05)
                    env = []
                    for k in range(0, len(a), chunk_size):
                        chunk = a[k:k + chunk_size]
                        if not chunk:
                            break
                        rms = math.sqrt(sum(x * x for x in chunk) / len(chunk)) / 32768.0
                        env.append(round(rms, 3))
            except Exception:
                file_size = os.path.getsize(audio_path)
                exact_dur = max(3.0, file_size / 16000.0)

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

    voice_json_path = "public/voice.json"
    with open(voice_json_path, 'w', encoding='utf-8') as f:
        json.dump(voice_data, f, ensure_ascii=False, indent=2)

    print(f"Generated {voice_json_path} successfully with {len(voice_data['scenes'])} scenes.")

if __name__ == '__main__':
    main()
