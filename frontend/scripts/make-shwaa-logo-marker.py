#!/usr/bin/env python3
"""Build MindAR-friendly PNG from SHWAA visiting-card logo."""
from pathlib import Path

try:
    from PIL import Image, ImageEnhance
except ImportError:
    import subprocess
    import sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageEnhance

root = Path(__file__).resolve().parent.parent
src = root / "assets" / "visting card_new-02-02.jpg"
out = root / "assets" / "targets" / "shwaa-logo.png"
out.parent.mkdir(parents=True, exist_ok=True)

im = Image.open(src).convert("RGBA")
print("src", src.name, im.size)

bg = Image.new("RGB", im.size, (255, 255, 255))
bg.paste(im, mask=im.split()[-1])

gray = bg.convert("L")
mask = gray.point(lambda p: 0 if p > 245 else 255)
bbox = mask.getbbox()
if bbox:
    pad = 12
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(bg.width, r + pad)
    b = min(bg.height, b + pad)
    content = bg.crop((l, t, r, b))
else:
    content = bg

side = max(content.size)
margin = int(side * 0.14)
canvas_side = side + margin * 2
target = max(canvas_side, 768)
scale = target / float(canvas_side)
nw = max(1, int(content.width * scale))
nh = max(1, int(content.height * scale))
content = content.resize((nw, nh), Image.Resampling.LANCZOS)

canvas = Image.new("RGB", (target, target), (255, 255, 255))
ox = (target - content.width) // 2
oy = (target - content.height) // 2
canvas.paste(content, (ox, oy))
canvas = ImageEnhance.Contrast(canvas).enhance(1.2)
canvas.save(out, "PNG", optimize=True)
print("wrote", out, canvas.size, out.stat().st_size)
