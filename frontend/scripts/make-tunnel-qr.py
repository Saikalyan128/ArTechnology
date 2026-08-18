#!/usr/bin/env python3
"""Generate QR PNG for a WebAR tunnel URL."""
import sys
from pathlib import Path

try:
    import qrcode
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "qrcode[pil]", "-q"])
    import qrcode

url = sys.argv[1] if len(sys.argv) > 1 else ""
if not url:
    print("Usage: make-tunnel-qr.py <https-url>")
    sys.exit(1)

root = Path(__file__).resolve().parent.parent
out_dir = root / "assets" / "qr"
out_dir.mkdir(parents=True, exist_ok=True)
png = out_dir / "webar-tunnel.png"
txt = out_dir / "webar-tunnel.txt"

img = qrcode.make(url)
img.save(png)
txt.write_text(url.strip() + "\n", encoding="utf-8")
print("URL", url)
print("QR ", png)
print("TXT", txt)
