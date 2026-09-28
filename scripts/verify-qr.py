#!/usr/bin/env python3
"""Decodifica con OpenCV los QR que genera lib/game/qr.ts — el lector real es el árbitro.
Uso: node scripts/dump-qr.cjs > /tmp/qr.json && python3 scripts/verify-qr.py /tmp/qr.json"""
import json, sys
import numpy as np, cv2

cases = json.load(open(sys.argv[1]))
det = cv2.QRCodeDetector()
bad = 0
for c in cases:
    m = np.array(c["matrix"], dtype=np.uint8)
    n = m.shape[0]
    quiet, scale = 4, 8
    img = np.full(((n + 2 * quiet) * scale,) * 2, 255, dtype=np.uint8)
    for y in range(n):
        for x in range(n):
            if m[y][x]:
                img[(y + quiet) * scale:(y + quiet + 1) * scale, (x + quiet) * scale:(x + quiet + 1) * scale] = 0
    text, pts, _ = det.detectAndDecode(img)
    ok = text == c["text"]
    bad += 0 if ok else 1
    print(("OK  " if ok else "FAIL"), f"v{(n - 17) // 4} {c['ecc']} {len(c['text'].encode())}B", repr(text[:40]), "" if ok else f"esperaba {c['text'][:40]!r}")
sys.exit(1 if bad else 0)
