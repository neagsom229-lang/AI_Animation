#!/usr/bin/env python3
"""Generate 16-bit depth maps for every illustration in an illustrated story.

Two modes:

  --depth model     Depth Anything V2 Small (depth-anything/Depth-Anything-V2-Small-hf).
                    LICENSE: apache-2.0 (verified from the model card 2026-11-17;
                    recorded in CREDITS.md). CPU-capable via torch. Dependencies
                    are installed with ``python -m pip`` (never pip.exe).
  --depth gradient  Horizon-based vertical gradient, NO model and NO third-party
                    dependency. Clearly labeled as a fallback in stdout and in
                    a sibling ``<name>-depth.mode.txt`` file.

Optional: --layers writes foreground/mid/background masks using OpenCV
inpainting (``python -m pip install opencv-python-headless numpy``), cached by
the image's SHA-256 so repeated runs skip work.

Output depth PNG is 16-bit grayscale (single channel, big-endian), written next
to the source image as ``<basename>-depth.png`` (matches scripts/illustrated-
manifest.mjs). Missing source images fail loudly unless --allow-missing.

Usage:
  python scripts/depth.py --story src/stories/khmer-empire.json --depth model
  python scripts/depth.py --story src/stories/khmer-empire.json --depth gradient --allow-missing
  python scripts/depth.py --install-deps          # python -m pip install ...
  python scripts/depth.py --license-check         # print verified license and exit
"""

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import zlib

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Verified 2026-11-17 from https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf
# The model card shows "License: apache-2.0". Apache-2.0 is a permissive license
# allowing commercial use and redistribution; it is NOT non-commercial.
MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
MODEL_LICENSE = "apache-2.0"
MODEL_CARD_URL = "https://huggingface.co/" + MODEL_ID
PERMISSIVE_LICENSES = {"apache-2.0", "cc0-1.0", "cc-by-4.0", "mit"}
DEPTH_PIP = ["torch", "transformers", "Pillow", "numpy"]
LAYER_PIP = ["opencv-python-headless", "numpy", "Pillow"]


def license_check():
    """Fail loudly if the recorded model license is not permissive."""
    ok = MODEL_LICENSE.lower() in PERMISSIVE_LICENSES
    print("[license] model      : " + MODEL_ID)
    print("[license] card       : " + MODEL_CARD_URL)
    print("[license] license    : " + MODEL_LICENSE + " (verified from model card 2026-11-17)")
    print("[license] commercial : yes (permissive); non-commercial checkpoint: NO")
    if not ok:
        print("[license] ERROR: license is not in the permissive allow-list; refusing to use checkpoint.")
        sys.exit(2)
    print("[license] OK: permissive license, safe to use in this film.")
    return ok


def install_deps(extra):
    """Install dependencies using python -m pip (never pip.exe)."""
    packages = list(DEPTH_PIP) + (list(LAYER_PIP) if extra else [])
    packages = sorted(set(packages))
    cmd = [sys.executable, "-m", "pip", "install"] + packages
    print("[pip] " + " ".join(cmd))
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("[pip] ERROR: dependency install failed (exit %d)." % result.returncode)
        sys.exit(3)


def png_header(path):
    """Read (width, height, bit_depth, color_type) from a PNG IHDR chunk."""
    with open(path, "rb") as f:
        sig = f.read(8)
        if sig != b"\x89PNG\r\n\x1a\n":
            raise ValueError("not a PNG: " + path)
        length = struct.unpack(">I", f.read(4))[0]
        ctype = f.read(4)
        if ctype != b"IHDR":
            raise ValueError("missing IHDR: " + path)
        data = f.read(length)
        width, height, bit_depth, color_type = struct.unpack(">IIBB", data[:10])
    return width, height, bit_depth, color_type


def write_gray16(path, width, height, row_values):
    """Write a 16-bit grayscale PNG. row_values(y, x) -> 0..65535."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        for x in range(width):
            v = max(0, min(65535, int(row_values(y, x))))
            raw.extend(struct.pack(">H", v))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 16, 0, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def depth_path_for(image_path):
    base, ext = os.path.splitext(image_path)
    return base + "-depth" + (ext or ".png")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def gradient_depth(image_path, out_path):
    """Horizon-based vertical gradient depth (near at bottom, far at top)."""
    width, height, _bd, _ct = png_header(image_path)

    def value(y, x):
        # Smoothstep from far (top, 0.18) to near (bottom, 1.0).
        t = y / max(1, height - 1)
        s = t * t * (3 - 2 * t)
        return 0.18 * 65535 + s * 0.82 * 65535

    write_gray16(out_path, width, height, value)
    with open(out_path + ".mode.txt", "w", encoding="utf-8") as f:
        f.write("mode: gradient (horizon-based fallback, NOT a learned depth map)\n")
        f.write("source: " + image_path + "\n")
    return width, height


def model_depth(image_path, out_path):
    """Depth Anything V2 Small on CPU. Imports lazily so gradient mode needs no deps."""
    try:
        import numpy as np
        from PIL import Image
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    except ImportError as e:
        print("[model] Missing dependency: %s" % e)
        print("[model] Install with: python -m pip install %s" % " ".join(DEPTH_PIP))
        print("[model] Or re-run with --depth gradient for the labeled fallback.")
        sys.exit(4)
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID)
    model.to("cpu").eval()
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        predicted = model(**inputs).predicted_depth
    pred = torch.nn.functional.interpolate(
        predicted.unsqueeze(1), size=image.size[::-1], mode="bicubic", align_corners=False
    ).squeeze().cpu().numpy()
    mn, mx = float(pred.min()), float(pred.max())
    norm = (pred - mn) / (mx - mn + 1e-8)
    arr = (norm * 65535.0).astype(np.uint16)

    def value(y, x):
        return int(arr[y, x])

    write_gray16(out_path, image.width, image.height, value)
    with open(out_path + ".mode.txt", "w", encoding="utf-8") as f:
        f.write("mode: model (%s, %s)\n" % (MODEL_ID, MODEL_LICENSE))
        f.write("source: " + image_path + "\n")
    return image.width, image.height


def layer_split(image_path, out_prefix):
    """Optional fg/mid/bg masks via OpenCV inpainting, cached by image SHA-256."""
    cache = out_prefix + ".layers.json"
    digest = sha256_file(image_path)
    if os.path.exists(cache):
        try:
            with open(cache, "r", encoding="utf-8") as f:
                if json.load(f).get("sha256") == digest:
                    print("[layers] cache hit for " + image_path)
                    return
        except (ValueError, OSError):
            pass
    try:
        import cv2
        import numpy as np
    except ImportError as e:
        print("[layers] Missing dependency: %s" % e)
        print("[layers] Install with: python -m pip install %s" % " ".join(LAYER_PIP))
        sys.exit(5)
    img = cv2.imread(image_path)
    h, w = img.shape[:2]
    # Simple three-band split by vertical position with an inpaint seam, a
    # lightweight stand-in for a full segmentation model.
    bands = {"fg": (int(h * 0.62), h), "mid": (int(h * 0.32), int(h * 0.62)), "bg": (0, int(h * 0.32))}
    for name, (y0, y1) in bands.items():
        mask = np.zeros((h, w), dtype=np.uint8)
        mask[y0:y1, :] = 255
        mask = cv2.inpaint(cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR), mask, 3, cv2.INPAINT_TELEA)
        cv2.imwrite(out_prefix + "-mask-" + name + ".png", mask[:, :, 0])
    with open(cache, "w", encoding="utf-8") as f:
        json.dump({"sha256": digest, "bands": list(bands.keys())}, f)
    print("[layers] wrote masks for " + image_path)


def main():
    p = argparse.ArgumentParser(description="Generate 16-bit depth maps for illustrated scenes.")
    p.add_argument("--story", default="src/stories/khmer-empire.json")
    p.add_argument("--depth", choices=["model", "gradient"], default="model")
    p.add_argument("--allow-missing", action="store_true")
    p.add_argument("--layers", action="store_true", help="also write fg/mid/bg masks (OpenCV)")
    p.add_argument("--install-deps", action="store_true", help="python -m pip install dependencies")
    p.add_argument("--license-check", action="store_true", help="print verified model license and exit")
    args = p.parse_args()

    license_check()
    if args.license_check:
        return
    if args.install_deps:
        install_deps(args.layers)
        return

    if not os.path.exists(args.story):
        print("[error] story not found: " + args.story)
        sys.exit(1)
    with open(args.story, "r", encoding="utf-8") as f:
        story = json.load(f)

    made = 0
    missing = 0
    for scene in story.get("scenes", []):
        image = scene.get("image")
        if not image or not os.path.exists(image):
            missing += 1
            print("[missing] %s: %s" % (scene.get("id"), image))
            continue
        out = depth_path_for(image)
        if args.depth == "gradient":
            w, h = gradient_depth(image, out)
            print("[gradient] %s: wrote %s (%dx%d, 16-bit) -- FALLBACK" % (scene.get("id"), out, w, h))
        else:
            w, h = model_depth(image, out)
            print("[model] %s: wrote %s (%dx%d, 16-bit)" % (scene.get("id"), out, w, h))
        if args.layers:
            layer_split(image, os.path.splitext(image)[0])
        made += 1

    print("[done] depth maps written: %d; missing images skipped: %d" % (made, missing))
    if missing and not args.allow_missing:
        print("[error] missing source images; re-run with --allow-missing to skip them.")
        sys.exit(6)


if __name__ == "__main__":
    main()
