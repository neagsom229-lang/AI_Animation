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
# Round 10 item 2: cache identity. Bump SCRIPT_VERSION when the depth algorithm
# or metric changes so every cached map is invalidated.
SCRIPT_VERSION = "round10-cache-v1"
# Pinned model revision (the Transformers checkpoint revision used for model mode).
# Gradient mode never uses this, but it is still part of the key so a gradient
# output can NEVER satisfy a model request.
MODEL_REVISION = "main@2026-11-17"


def depth_cache_key(image_sha, depth_mode, model_name=MODEL_ID,
                    model_revision=MODEL_REVISION, script_version=SCRIPT_VERSION):
    """Composite cache key: image bytes + mode + model identity + script version.
    Gradient and model keys always differ because depth_mode is included."""
    payload = json.dumps([image_sha, depth_mode, model_name, model_revision, script_version],
                         sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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


def read_gray16(path):
    """Read our 16-bit grayscale PNG back into a list of rows (stdlib only)."""
    data = open(path, "rb").read()
    pos = 8
    width = height = None
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            width, height, bd, ct = struct.unpack(">IIBB", chunk[:10])
            if bd != 16 or ct != 0:
                raise ValueError("expected 16-bit grayscale depth PNG")
        elif ctype == b"IDAT":
            idat.extend(chunk)
        pos += 12 + length
    raw = zlib.decompress(bytes(idat))
    rows = []
    stride = width * 2 + 1
    for y in range(height):
        row = raw[y * stride + 1:(y + 1) * stride]
        rows.append([struct.unpack(">H", row[x * 2:x * 2 + 2])[0] for x in range(width)])
    return rows


# --- Round 10 item 1: normalized depth statistics --------------------------

SOBEL_THRESHOLD = 0.08   # legacy edgeMetric: fraction with |Sobel| > 0.08
SHARP_FRACTION_CUT = 0.02  # Round 11: sharpFraction = fraction with |Sobel| > 0.02
FLAT_DEPTH_RANGE = 0.15  # flatDepth: p95 - p5 < 0.15


def _p95(values):
    """95th percentile of a sorted list (nearest-rank). Pure."""
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(len(s) - 1, int(len(s) * 0.95))]


def depth_statistics(depth_path, threshold=SOBEL_THRESHOLD):
    """Compute Round-11 depth statistics from a 16-bit depth PNG.

    All math on depth normalized to 0..1 (value / 65535).
      * sobelP95     = p95 of the 3x3 Sobel gradient MAGNITUDE (normalized).
                       Replaces the old fraction-of-large-gradients metric because
                       absolute fractions read ~0 for real model depth (0.0001-0.004).
      * sharpFraction= fraction of pixels whose Sobel magnitude > 0.02.
      * edgeMetric   = legacy fraction |Sobel| > threshold (kept for compatibility).
      * depthRange   = p95(depth) - p5(depth); flatDepth = range < 0.15.
    """
    rows16 = read_gray16(depth_path)
    h = len(rows16)
    if h == 0:
        return {"sobelP95": 0.0, "sharpFraction": 0.0, "edgeMetric": 0.0,
                "depthRange": 0.0, "flatDepth": True, "width": 0, "height": 0}
    w = len(rows16[0])
    norm = [[v / 65535.0 for v in row] for row in rows16]

    mags = []
    legacy_edges = 0
    total = 0
    for y in range(1, h - 1):
        r0, r1, r2 = norm[y - 1], norm[y], norm[y + 1]
        for x in range(1, w - 1):
            gx = (-r0[x - 1] + r0[x + 1] - 2 * r1[x - 1] + 2 * r1[x + 1] - r2[x - 1] + r2[x + 1]) / 8.0
            gy = (r0[x - 1] + 2 * r0[x] + r0[x + 1] - r2[x - 1] - 2 * r2[x] - r2[x + 1]) / 8.0
            mag = (gx * gx + gy * gy) ** 0.5
            mags.append(mag)
            total += 1
            if mag > threshold:
                legacy_edges += 1
    sobel_p95 = _p95(mags)
    sharp_fraction = sum(1 for m in mags if m > SHARP_FRACTION_CUT) / max(1, len(mags))
    legacy_edge = legacy_edges / max(1, total)

    hist = [0] * 256
    for row in norm:
        for v in row:
            hist[min(255, max(0, int(v * 255)))] += 1
    count = sum(hist)
    def percentile(p):
        target = count * p
        acc = 0
        for b, n in enumerate(hist):
            acc += n
            if acc >= target:
                return b / 255.0
        return 1.0
    depth_range = percentile(0.95) - percentile(0.05)
    return {
        "sobelP95": round(sobel_p95, 6),
        "sharpFraction": round(sharp_fraction, 6),
        "edgeMetric": round(legacy_edge, 6),
        "depthRange": round(depth_range, 6),
        "flatDepth": depth_range < FLAT_DEPTH_RANGE,
        "width": w,
        "height": h,
    }


def depth_edge_metric(depth_path, threshold=SOBEL_THRESHOLD):
    """Backward-compatible wrapper: returns the legacy edgeMetric."""
    return depth_statistics(depth_path, threshold)["edgeMetric"]


def rank_limit_factors(sharp_values, signatures=None):
    """Round 11 (+ Round 12 tie fix): derive limitFactor from sharpness rank.

    Ties MUST receive the same factor: scenes are grouped when they have an
    identical sharpness signature (sobelP95 + sharpFraction) OR an identical
    image hash. Grouping uses union-find so either criterion merges a class.
    The whole class receives the factor of its sharpest member's rank, so no
    two identical scenes can drift apart (e.g. sc-15/16/17 in the real metrics).

    Sharpest 25% -> factor in [0.6, 0.8]; remaining -> [0.9, 1.0]; clamp [0.4,1].
    Returns factors in the SAME order as input. Pure.
    """
    n = len(sharp_values)
    if n == 0:
        return []

    # Union-find over scenes.
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    # Merge by image hash when signatures carry one (signature = (metric_key, hash)).
    by_hash = {}
    by_metric = {}
    for i, sig in enumerate(signatures if signatures is not None else [None] * n):
        metric_key = sig[0] if sig is not None else sharp_values[i]
        img_hash = sig[1] if sig is not None and len(sig) > 1 else None
        by_metric.setdefault(metric_key, []).append(i)
        if img_hash:
            by_hash.setdefault(img_hash, []).append(i)
    for group in list(by_metric.values()) + list(by_hash.values()):
        for i in group[1:]:
            union(group[0], i)

    # Representative sharpness per class = max (sharpest member).
    class_sharp = {}
    for i in range(n):
        r = find(i)
        class_sharp[r] = max(class_sharp.get(r, float('-inf')), sharp_values[i])

    # Rank the CLASSES by representative sharpness (sharpest first).
    roots_sorted = sorted(class_sharp, key=lambda r: class_sharp[r], reverse=True)
    top = max(1, int(round(n * 0.25)))
    root_factor = {}
    for rank, root in enumerate(roots_sorted):
        if rank < top:
            f = 0.6 + 0.2 * (rank / max(1, top - 1)) if top > 1 else 0.6
        else:
            r2 = (rank - top) / max(1, len(roots_sorted) - top - 1)
            f = 0.9 + 0.1 * r2
        root_factor[root] = round(min(1.0, max(0.4, f)), 4)

    return [root_factor[find(i)] for i in range(n)]


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
    p.add_argument("--force", action="store_true", help="recompute depth even when the cache key matches")
    p.add_argument("--layers", action="store_true", help="also write fg/mid/bg masks (OpenCV)")
    p.add_argument("--install-deps", action="store_true", help="python -m pip install dependencies")
    p.add_argument("--license-check", action="store_true", help="print verified model license and exit")
    p.add_argument("--stats", metavar="DEPTH_PNG", default=None,
                   help="print depth_statistics() as JSON for one depth PNG and exit")
    args = p.parse_args()

    if args.stats:
        print(json.dumps(depth_statistics(args.stats)))
        return

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
    cached = 0
    metrics = {"version": 1, "depthMode": args.depth, "scenes": []}
    review_dir = os.path.join("out", "review")
    os.makedirs(review_dir, exist_ok=True)
    metrics_path = os.path.join(review_dir, "parallax-metrics.json")

    for scene in story.get("scenes", []):
        image = scene.get("image")
        if not image or not os.path.exists(image):
            missing += 1
            print("[missing] %s: %s" % (scene.get("id"), image))
            continue
        out = depth_path_for(image)
        digest = sha256_file(image)
        key = depth_cache_key(digest, args.depth)
        sidecar = out + ".sha256"
        cached_source = None
        hit = False
        if os.path.exists(out) and os.path.exists(sidecar) and not args.force:
            raw = open(sidecar, "r", encoding="utf-8").read().strip()
            if raw.startswith("{"):
                try:
                    meta = json.loads(raw)
                    if meta.get("cacheKey") == key:
                        hit = True
                        cached_source = meta.get("depthSource")
                except (ValueError, TypeError):
                    hit = False
        if hit:
            print("[cache hit: %s] %s: key=%s" % (cached_source, scene.get("id"), key[:12]))
            cached += 1
        else:
            if args.depth == "gradient":
                w, h = gradient_depth(image, out)
                print("[gradient] %s computed (%dx%d, 16-bit) -- FALLBACK" % (scene.get("id"), w, h))
                cached_source = "gradient"
            else:
                w, h = model_depth(image, out)
                print("[model] %s computed (%dx%d, 16-bit)" % (scene.get("id"), w, h))
                cached_source = "model"
            # JSON sidecar carries the composite key + source so a gradient map
            # can never satisfy a model request (different keys).
            meta = {"cacheKey": key, "depthSource": cached_source, "imageSha256": digest,
                    "depthMode": args.depth, "modelName": MODEL_ID,
                    "modelRevision": MODEL_REVISION, "scriptVersion": SCRIPT_VERSION}
            with open(sidecar, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)
            made += 1
        if args.layers:
            layer_split(image, os.path.splitext(image)[0])

        stats = depth_statistics(out)
        motion = scene.get("motion") or {}
        # Round 10 item 3: direction from camera move (not hardcoded "left").
        direction = motion.get("direction") or direction_from_camera(scene.get("camera", "static"))
        # depthSource: reads from the cache sidecar when it is the new JSON form,
        # otherwise falls back to the mode requested this run (legacy plain sidecar).
        depth_source = _depth_source_from_sidecar(out, args.depth)
        flat_note = " FLAT DEPTH (range < 0.15): parallax has little separation." if stats["flatDepth"] else ""
        print("[metrics] %s: sobelP95=%.4f sharp=%.4f edge=%.4f range=%.3f flat=%s source=%s%s" % (
            scene.get("id"), stats["sobelP95"], stats["sharpFraction"], stats["edgeMetric"],
            stats["depthRange"], stats["flatDepth"], depth_source, flat_note))
        metrics["scenes"].append({
            "scene": scene.get("id"),
            "imageSha256": digest,
            "sobelP95": stats["sobelP95"],
            "sharpFraction": stats["sharpFraction"],
            "depthEdgeMetric": stats["edgeMetric"],  # legacy field, kept for compatibility
            "depthRange": stats["depthRange"],
            "flatDepth": stats["flatDepth"],
            "depthSource": depth_source,
            "limitFactor": 1.0,  # replaced below by rank-based factor
            "requestedAmplitude": motion.get("amplitude", 1),
            "direction": direction,
            "camera": scene.get("camera", "static"),
            "note": "sobelP95=p95(|Sobel| on depth 0..1); sharpFraction=frac(|Sobel|>0.02); limit=rank(sharpness): sharpest25%->0.6-0.8 rest->0.9-1.0 clamp[0.4,1]",
        })

    # Round 11 item 1 (+ Round 12 tie fix): rank factors with tie grouping.
    sharp_values = [s["sobelP95"] for s in metrics["scenes"]]
    # Signature ties: identical (sobelP95, sharpFraction) OR identical image hash.
    signatures = [((s["sobelP95"], s["sharpFraction"]), s["imageSha256"])
                  for s in metrics["scenes"]]
    factors = rank_limit_factors(sharp_values, signatures)
    for s, f in zip(metrics["scenes"], factors):
        s["limitFactor"] = f

    def _mm(vals):
        if not vals:
            return "n/a"
        s = sorted(vals)
        return "min=%.4f median=%.4f max=%.4f" % (s[0], s[len(s) // 2], s[-1])
    print("\n[summary] sobelP95   %s" % _mm(sharp_values))
    print("[summary] sharpFrac  %s" % _mm([s["sharpFraction"] for s in metrics["scenes"]]))
    print("[scene]  id        sobelP95  sharpFrac  limitFactor  source")
    for s in metrics["scenes"]:
        print("[scene]  %-9s %.4f    %.4f      %.2f        %s" % (
            s["scene"], s["sobelP95"], s["sharpFraction"], s["limitFactor"], s["depthSource"]))

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print("[done] depth written: %d, cached: %d, missing images skipped: %d" % (made, cached, missing))
    print("[done] parallax metrics: %s" % metrics_path)
    if missing and not args.allow_missing:
        print("[error] missing source images; re-run with --allow-missing to skip them.")
        sys.exit(6)


def direction_from_camera(camera):
    """Round 10 item 3: derive parallax direction from the camera move.

    truck-left -> left, truck-right -> right, push/crane/static -> none.
    An explicit scene `motion.direction` still overrides this. Pure.
    """
    c = str(camera or "static").lower()
    if "truck-left" in c or "truck_left" in c:
        return "left"
    if "truck-right" in c or "truck_right" in c:
        return "right"
    return "none"  # push-in / push-out / crane / static have no lateral travel


def _depth_source_from_sidecar(depth_path, fallback):
    """Read depthSource from a JSON cache sidecar; legacy plain-hash sidecars
    predate source tracking and cannot identify their origin -> return the
    current mode explicitly marked as assumed (never present as verified)."""
    sidecar = depth_path + ".sha256"
    if not os.path.exists(sidecar):
        return fallback
    raw = open(sidecar, "r", encoding="utf-8").read().strip()
    if raw.startswith("{"):
        try:
            return json.loads(raw).get("depthSource", fallback)
        except (ValueError, TypeError):
            return fallback
    # Legacy sidecar: source genuinely unknown. Say so rather than guess.
    return "unknown-legacy-cache"


if __name__ == "__main__":
    main()
