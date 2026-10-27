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
    # lembar terpisah: seluruh gambar dipakai (tanpa kotak potong)
    "stage2": {
        "bg_file": "stage2-gua-bg.jpg",
        "fg_file": "stage2-gua-fg.jpg",
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
    """Kembalikan (warna, alpha) dengan membuang pola papan catur abu-putih."""
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
    # Kotak catur sisa yang sedikit ternoda cahaya (mis. pendar kristal) ikut dibuang:
    # tumbuhkan latar ke piksel sangat terang & hampir netral, lalu ke kotak abu (~188).
    chroma = mx - mn
    light_sq = (mn > 222) & (chroma < 45)
    bg = ndi.binary_propagation(bg, mask=bg | light_sq)
    grey_sq = (mn > 158) & (mn < 200) & (chroma < 10)
    for _ in range(20):
        nb = ndi.binary_dilation(bg) & grey_sq & ~bg
        if not nb.any():
            break
        bg |= nb
    bg = ndi.binary_propagation(bg, mask=bg | light_sq)
    # Kotak catur yang diwarnai pendar (chroma sedang) di dekat latar juga dibuang
    tinted = (mn > 146) & (chroma < 48)
    for _ in range(30):
        nb = ndi.binary_dilation(bg) & tinted & ~bg
        if not nb.any():
            break
        bg |= nb
    bg = ndi.binary_propagation(bg, mask=bg | light_sq)
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
    # Pendar warna di atas papan catur dibuat ulang sebagai cahaya lembut tanpa pola
    rgbf = rgb.astype(float)
    cvec = rgbf - rgbf.mean(2, keepdims=True)
    cm = np.sqrt((cvec ** 2).sum(2))
    ga = np.clip((ndi.gaussian_filter(cm, 4) - 14) / 50.0, 0, 0.8)
    ga[fgm] = 0
    ga[~ndi.binary_dilation(fgm, iterations=60)] = 0
    with np.errstate(invalid="ignore", divide="ignore"):
        dirv = np.where(cm[..., None] > 1e-3, cvec / cm[..., None], 0)
    dirv = np.stack([ndi.gaussian_filter(dirv[..., i], 4) for i in range(3)], 2)
    gcol = np.clip(190 + dirv * 90, 0, 255)
    glow_px = ga > alpha
    color = np.where(glow_px[..., None], gcol, rgbf).astype(np.uint8)
    alpha = np.maximum(alpha, ga)
    return color, (np.clip(alpha, 0, 1) * 255).astype(np.uint8)


def process(name, cfg, debug):
    os.makedirs(OUT, exist_ok=True)
    if "file" in cfg:
        sheet = Image.open(os.path.join(SRC, cfg["file"])).convert("RGB")
        bg_src, fg_src = sheet.crop(cfg["bg"]), sheet.crop(cfg["fg"]) if cfg.get("fg") else None
    else:
        bg_src = Image.open(os.path.join(SRC, cfg["bg_file"])).convert("RGB")
        fg_src = Image.open(os.path.join(SRC, cfg["fg_file"])).convert("RGB") if cfg.get("fg_file") else None
    bg = fit_16_9(bg_src)
    bg.save(os.path.join(OUT, f"{name}_bg.webp"), "WEBP", quality=86, method=6)
    if fg_src is not None:
        rgb = np.asarray(fg_src).astype(np.int16)
        col, a = remove_checker(rgb)
        fg = Image.fromarray(np.dstack([col, a]), "RGBA")
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
