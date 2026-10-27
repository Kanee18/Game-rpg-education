#!/usr/bin/env python3
"""
Menyiapkan latar pertarungan dari lembar aset (dua panel: latar belakang di atas,
latar depan bertekstur papan catur "transparan palsu" di bawah).

Pemakaian:
    python3 tools/prepare_backgrounds.py          # semua stage di CONFIG
    python3 tools/prepare_backgrounds.py --debug  # simpan pratinjau ke tools/_debug

Keluaran: public/assets/backgrounds/<nama>_bg.webp (1920x1080, opak)
          public/assets/backgrounds/<nama>_fg.webp (1920x1080, transparan)
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "backgrounds")
OUT = os.path.join(ROOT, "public", "assets", "backgrounds")
DEBUG_DIR = os.path.join(ROOT, "tools", "_debug")
W, H = 1920, 1080

# Kotak panel (x0, y0, x1, y1) pada lembar sumber, di dalam bingkai putih.
CONFIG = {
    "stage1": {
        "file": "stage1-lembah.jpg",
        "bg": (46, 150, 1746, 1126),
        "fg": (46, 1360, 1746, 2324),
    },
}


def fit_16_9(im):
    """Potong tengah ke rasio 16:9 lalu ubah ukuran ke 1920x1080."""
    w, h = im.size
    if w / h > W / H:
        nw = round(h * W / H)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w * H / W)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((W, H), Image.LANCZOS)


def remove_checker(rgb):
    """Kembalikan alpha (0..255) dengan membuang pola papan catur abu-putih."""
    mn, mx = rgb.min(2), rgb.max(2)
    cand = ((mx - mn) < 22) & (mn > 170)
    lab, n = ndi.label(cand)
    top = np.unique(lab[:40])
    bg = np.isin(lab, top[top > 0])
    # Sisa kotak catur yang terkurung di sela daun/ranting: punya warna terang (~254)
    # dan abu (~188) sekaligus.
    if n:
        idx = np.arange(1, n + 1)
        size = ndi.sum(np.ones_like(mn), lab, idx)
        bright = ndi.mean((mn > 244).astype(float), lab, idx)
        grey = ndi.mean((np.abs(mn - 188) < 9).astype(float), lab, idx)
        checker = np.zeros(n + 1, bool)
        checker[1:] = (size > 25) & ((bright > 0.3) | ((bright > 0.1) & (grey > 0.25)))
        bg |= checker[lab]
    # Buang pulau kecil yang tersisa di bagian atas (bayangan samar)
    fgm = ~bg
    lab2, n2 = ndi.label(fgm)
    if n2:
        sizes = np.bincount(lab2.ravel())
        small = sizes < 400
        small[0] = False
        fgm &= ~small[lab2]
    # Tepi lembut: piksel terang di perbatasan dibuat semi transparan
    edge = fgm & ndi.binary_dilation(~fgm, iterations=2)
    alpha = fgm.astype(float)
    light = np.clip((mn - 150) / 90.0, 0, 1)
    alpha[edge] = 1 - 0.8 * light[edge]
    alpha = ndi.gaussian_filter(alpha, 0.7)
    alpha[~ndi.binary_dilation(fgm, iterations=1)] = 0
    return (np.clip(alpha, 0, 1) * 255).astype(np.uint8)


def process(name, cfg, debug):
    sheet = Image.open(os.path.join(SRC, cfg["file"])).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    bg = fit_16_9(sheet.crop(cfg["bg"]))
    bg.save(os.path.join(OUT, f"{name}_bg.webp"), "WEBP", quality=86, method=6)
    if cfg.get("fg"):
        part = sheet.crop(cfg["fg"])
        rgb = np.asarray(part).astype(np.int16)
        a = remove_checker(rgb)
        fg = Image.fromarray(np.dstack([rgb.astype(np.uint8), a]), "RGBA")
        fg = fit_16_9(fg)
        fg.save(os.path.join(OUT, f"{name}_fg.webp"), "WEBP", quality=86, method=6)
        if debug:
            os.makedirs(DEBUG_DIR, exist_ok=True)
            comp = bg.convert("RGBA")
            comp.alpha_composite(fg)
            comp.convert("RGB").resize((960, 540)).save(os.path.join(DEBUG_DIR, f"{name}_composite.png"))
            dark = Image.new("RGBA", fg.size, (40, 10, 60, 255))
            dark.alpha_composite(fg)
            dark.convert("RGB").resize((960, 540)).save(os.path.join(DEBUG_DIR, f"{name}_fg_check.png"))
    print(f"  {name}: selesai")


if __name__ == "__main__":
    dbg = "--debug" in sys.argv
    for k, v in CONFIG.items():
        process(k, v, dbg)
