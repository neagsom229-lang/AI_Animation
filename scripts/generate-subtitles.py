"""
@fileoverview Generates public/subtitles.srt from scripts/script.json with exact timestamps.
"""

import os
import json

os.makedirs('public', exist_ok=True)

with open('scripts/script.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

def format_time(seconds):
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

intervals = [
    ("scene1", 0.0, 20.0),
    ("scene2", 20.0, 50.0),
    ("scene3", 50.0, 90.0),
    ("scene4", 90.0, 120.0),
    ("scene5", 120.0, 140.0),
    ("scene6", 140.0, 150.0)
]

srt_lines = []
for idx, (key, start, end) in enumerate(intervals, 1):
    text = data.get(key, "")
    start_str = format_time(start)
    end_str = format_time(end)
    srt_lines.append(f"{idx}\n{start_str} --> {end_str}\n{text}\n")

with open('public/subtitles.srt', 'w', encoding='utf-8') as f:
    f.write("\n".join(srt_lines))

print("Generated public/subtitles.srt successfully.")
