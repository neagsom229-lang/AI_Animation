"""
@fileoverview Generates voice audio files (.wav) and voice.json (durations, subtitles, lip-sync envelopes)
from a story JSON file, with caching by text hash.
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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--story', default='src/stories/khmer-temple.json')
    parser.add_argument('--out', default='public/voice')
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    cache_dir = os.path.join(args.out, 'cache')
    os.makedirs(cache_dir, exist_ok=True)

    if not os.path.exists(args.story):
        print(f"Story file not found: {args.story}")
        sys.exit(1)

    with open(args.story, 'r', encoding='utf-8') as f:
        story = json.load(f)

    sample_rate = 22100
    voice_data = {
        "title": story.get("title", ""),
        "language": story.get("language", "en"),
        "scenes": []
    }

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
            wav_filename = f"{scene_id}-{line_idx}-{text_hash[:8]}.wav"
            wav_path = os.path.join(args.out, wav_filename)
            rel_path = f"voice/{wav_filename}"

            estimated_dur = max(3.0, len(text) * 0.08)
            if scene.get("dur"):
                estimated_dur = max(estimated_dur, scene.get("dur") / max(1, len(dialogue_list)))

            if not os.path.exists(wav_path):
                num_samples = int(sample_rate * estimated_dur)
                with wave.open(wav_path, 'w') as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    
                    for i in range(num_samples):
                        t = i / sample_rate
                        freq = 160 + math.sin(t * 10) * 40
                        val = math.sin(2 * math.pi * freq * t) * 0.15 + math.sin(2 * math.pi * (freq * 2) * t) * 0.05
                        envelope = (math.sin(t * 8) * 0.5 + 0.5) * 0.7 + 0.3
                        fade = min(1.0, t * 4) * min(1.0, (estimated_dur - t) * 4)
                        sample = int(val * envelope * fade * 32767)
                        wav_file.writeframes(struct.pack('<h', sample))

            with wave.open(wav_path, 'r') as wav_file:
                frames = wav_file.readframes(wav_file.getnframes())
                framerate = wav_file.getframerate()
                a = array.array('h', frames)
                exact_dur = len(a) / framerate
                
                chunk_size = int(framerate * 0.05)
                env = []
                for k in range(0, len(a), chunk_size):
                    chunk = a[k:k + chunk_size]
                    if not chunk:
                        break
                    rms = math.sqrt(sum(x * x for x in chunk) / len(chunk)) / 32768.0
                    env.append(round(rms, 3))

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
