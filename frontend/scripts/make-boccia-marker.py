#!/usr/bin/env python3
"""Generate a unique high-contrast MindAR marker PNG for Boccia watch."""
from pathlib import Path
import random

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parent.parent / "assets" / "targets" / "boccia.png"
out.parent.mkdir(parents=True, exist_ok=True)
W = H = 512
img = Image.new("RGB", (W, H), (12, 18, 28))
d = ImageDraw.Draw(img)

d.rectangle([8, 8, W - 9, H - 9], outline=(230, 236, 245), width=10)
d.rectangle([28, 28, W - 29, H - 29], outline=(80, 180, 220), width=4)

palette = [
    (0, 180, 216), (255, 190, 11), (251, 86, 7), (131, 56, 236),
    (58, 134, 255), (6, 214, 160), (255, 0, 110), (255, 255, 255),
]
for i, c in enumerate(palette):
    y0 = 50 + i * 50
    d.rectangle([48, y0, 150, y0 + 36], fill=c)

tiles = [
    (300, 60, 460, 140, palette[0]),
    (280, 160, 380, 240, palette[2]),
    (400, 160, 470, 280, palette[4]),
    (300, 260, 420, 360, palette[5]),
    (200, 320, 290, 450, palette[3]),
    (340, 380, 470, 460, palette[1]),
    (170, 80, 270, 200, palette[6]),
]
for x0, y0, x1, y1, c in tiles:
    d.rectangle([x0, y0, x1, y1], fill=c)

cx = cy = W // 2
d.polygon([(cx, cy - 70), (cx + 70, cy), (cx, cy + 70), (cx - 70, cy)], fill=(255, 255, 255))
d.polygon([(cx, cy - 40), (cx + 40, cy), (cx, cy + 40), (cx - 40, cy)], fill=(20, 30, 45))
d.line([(cx - 90, cy), (cx + 90, cy)], fill=(255, 190, 11), width=6)
d.line([(cx, cy - 90), (cx, cy + 90)], fill=(255, 190, 11), width=6)

try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
    font_s = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
except Exception:
    font = font_s = ImageFont.load_default()
d.text((56, 455), "BOCCIA", fill=(255, 255, 255), font=font)
d.text((200, 465), "AR MARKER", fill=(180, 200, 220), font=font_s)

random.seed(42)
for _ in range(120):
    x = random.randint(40, W - 40)
    y = random.randint(40, H - 40)
    r = random.randint(1, 3)
    col = random.choice([(255, 255, 255), (0, 0, 0), (255, 190, 11)])
    d.ellipse([x - r, y - r, x + r, y + r], fill=col)

img.save(out, "PNG")
print("wrote", out, out.stat().st_size)
