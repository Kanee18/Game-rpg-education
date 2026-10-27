#!/usr/bin/env python3
"""
Memotong sprite sheet karakter (JPG latar putih) menjadi atlas WebP transparan
+ metadata JSON yang dipakai game.

Pemakaian:
    pip install pillow numpy scipy
    python3 tools/slice_sprites.py            # semua karakter
    python3 tools/slice_sprites.py ksatria    # satu karakter
    python3 tools/slice_sprites.py --debug    # simpan lembar kontrol ke tools/_debug

Sumber : assets-src/sheets/<id>.jpg
Keluaran: public/assets/characters/<id>.webp dan <id>.json

Cara kerja singkat:
  1. Piksel "tinta" = piksel yang tidak hampir putih.
  2. Komponen terhubung dicari, lalu dikelompokkan per baris animasi
     (ROWS di bawah) dan per frame (komponen besar = satu frame, komponen kecil
     seperti percikan/proyektil ditempelkan ke frame terdekat).
  3. Latar putih dibuang; area efek cahaya yang tidak dikelilingi garis luar
     diberi alpha lembut (color-to-alpha) agar tampak menyala di latar gelap.
  4. Titik jangkar (kaki karakter) dihitung dari piksel gelap (garis luar).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "sheets")
OUT = os.path.join(ROOT, "public", "assets", "characters")
DEBUG_DIR = os.path.join(ROOT, "tools", "_debug")

TARGET_H = 250       # tinggi frame idle di atlas (px); sumber tidak pernah diperbesar
INK = 236            # min(rgb) di bawah ini dianggap tinta
W = 2576

# Setiap baris: rect (x0,y0,x1,y1) tempat titik tengah komponen harus berada,
# lalu daftar animasi yang mengambil frame dari baris itu (berdasarkan indeks
# urutan kiri→kanan). attach: ke mana komponen kecil ditempelkan.
CONFIG = {
    "ksatria": {
        "drop": [],
        "rows": [
            {"rect": (0, 20, W, 470), "anims": {"idle": [0, 1], "walk": [2, 3, 4, 5, 6, 7]}},
            {"rect": (0, 470, W, 950), "anims": {"attack": [0, 1, 2, 3, 4, 5, 6]}},
            {"rect": (0, 950, W, 1438), "anims": {"hit": [0, 1, 2], "ultimate": [3, 4, 5, 6]}},
        ],
    },
    "penyihir": {
        "cuts": [(0, 2050, 1168)],
        "drop": [(0, 0, 90, 40), (0, 312, 160, 360), (0, 626, 432, 674), (0, 926, 306, 974), (0, 1132, 626, 1196)],
        "rows": [
            {"rect": (0, 30, W, 318), "anims": {"idle": list(range(13))}},
            {"rect": (0, 318, W, 640), "anims": {"walk": list(range(13))}},
            {"rect": (0, 640, W, 940), "attach": "left", "anims": {"attack": list(range(8))}},
            {"rect": (0, 940, 2050, 1175), "anims": {"hit": list(range(9))}},
            {"rect": (0, 1175, W, 1438), "anims": {"ultimate": list(range(11))}},
            {"rect": (2050, 870, W, 1175), "merge_into_row": 4},
        ],
    },
    "biarawati": {
        "hole_min": 150, "hole_pure": 0.9, "clear_points": [(1474, 175), (1477, 188)],
        "drop": [(40, 100, 300, 210), (40, 380, 330, 500), (40, 650, 330, 790), (40, 940, 260, 1060), (40, 1220, 450, 1340)],
        "rows": [
            {"rect": (330, 0, W, 300), "anims": {"idle": [0, 1, 2, 3]}},
            {"rect": (330, 300, W, 580), "anims": {"walk": [0, 1, 2, 3]}},
            {"rect": (330, 580, W, 895), "anims": {"attack": [0, 1, 2, 3]}},
            {"rect": (330, 895, 1100, 1438), "anims": {"hit": [0, 1, 2]}},
            {"rect": (1100, 895, W, 1438), "anims": {"ultimate": [0, 1, 2]}},
        ],
    },
    "pemanah": {
        "hole_min": 40, "hole_pure": 0.8,
        "drop": [(20, 10, 110, 50), (20, 296, 125, 336), (20, 584, 150, 622), (20, 872, 90, 912), (20, 1158, 175, 1198)],
        "rows": [
            {"rect": (0, 40, W, 296), "anims": {"idle": [0, 1, 2, 3, 4]}},
            {"rect": (0, 330, W, 584), "anims": {"walk": [0, 1, 2, 3, 4, 5, 6]}},
            {"rect": (0, 610, W, 870), "anims": {"attack": list(range(9))}},
            {"rect": (0, 890, W, 1158), "anims": {"hit": [0, 1, 2, 3]}},
            {"rect": (0, 1160, W, 1438), "anims": {"ultimate": [0, 1, 2, 3, 4]}, "fx": {"tornado": 5}},
        ],
    },
    "assassin": {
        "hole_min": 20, "hole_pure": 0.6,
        "drop": [(25, 10, 115, 48), (25, 288, 195, 326), (25, 562, 380, 600), (25, 846, 250, 884), (25, 1118, 305, 1156)],
        "rows": [
            {"rect": (0, 40, W, 285), "anims": {"idle": list(range(9))}},
            {"rect": (0, 300, W, 560), "anims": {"walk": list(range(10))}},
            {"rect": (0, 590, W, 845), "attach": "left", "anims": {"attack": list(range(7))}},
            {"rect": (0, 850, W, 1115), "anims": {"hit": list(range(6))}},
            {"rect": (0, 1115, W, 1438), "anims": {"ultimate": list(range(6))}},
        ],
    },
    "paladin": {
        "drop": [(70, 110, 205, 180), (50, 400, 215, 470), (30, 650, 235, 790), (30, 960, 245, 1040), (30, 1260, 280, 1330)],
        "rows": [
            {"rect": (250, 0, W, 300), "anims": {"idle": [0, 1, 2, 3]}},
            {"rect": (250, 300, W, 580), "anims": {"walk": [0, 1, 2, 3]}},
            {"rect": (180, 580, W, 880), "anims": {"attack": [0, 1, 2, 3]}},
            {"rect": (150, 880, 1500, 1170), "anims": {"hit": [0, 1, 2]}},
            {"rect": (0, 1170, W, 1438), "anims": {"ultimate": [0, 1, 2, 3]}},
            {"rect": (1500, 880, W, 1170), "merge_into_row": 4},
        ],
    },
    "pyromancer": {
        "hole_min": 10 ** 9,   # gaun putih: jangan buang lubang putih otomatis
        "dark_max": 185,       # garis luar gaun berwarna lavender terang
        "drop": [(30, 18, 155, 70), (1055, 18, 1220, 70), (30, 520, 270, 580), (30, 1022, 130, 1076), (1600, 528, 1866, 582)],
        "rows": [
            {"rect": (0, 70, 1060, 520), "anims": {"idle": [0, 1, 2]}},
            {"rect": (1060, 70, W, 520), "anims": {"walk": [0, 1, 2, 3, 4]}},
            {"rect": (0, 520, 1560, 1025), "anims": {"attack": [0, 1, 2]}, "fx": {"fireball": 3}},
            {"rect": (0, 1025, 1560, 1438), "anims": {"hit": [0, 1]}},
            {"rect": (1560, 520, W, 1438), "anims": {"ultimate": [0]}},
        ],
    },
}


def inside(box, rect, frac=0.8):
    x0, y0, x1, y1 = box
    rx0, ry0, rx1, ry1 = rect
    ix = max(0, min(x1, rx1) - max(x0, rx0))
    iy = max(0, min(y1, ry1) - max(y0, ry0))
    return ix * iy >= frac * max(1, (x1 - x0) * (y1 - y0))


def build_alpha(rgb, ink_mask, hole_min=120, hole_pure=0.85, clear_points=(), dark_max=120):
    """Pisahkan sheet menjadi dua lapisan:
    - body: badan karakter (dikelilingi garis luar) -> digambar normal
    - glow: efek cahaya di luar badan -> digambar aditif ('lighter') di game
    """
    mn = rgb.min(2)
    mx = rgb.max(2)
    rgbf = rgb.astype(float)
    dark = mx < dark_max
    closed = ndi.binary_closing(dark, structure=np.ones((7, 7)), iterations=1)
    body = ndi.binary_fill_holes(closed)
    # Lubang putih murni di dalam badan = celah latar (antara tongkat & lengan).
    white = (mn >= 242) & body & ~dark
    lab, n = ndi.label(white)
    ring = np.zeros_like(body)
    if n:
        sizes = ndi.sum(np.ones_like(mn), lab, index=np.arange(1, n + 1))
        pure = ndi.mean((mn >= 246).astype(float), lab, index=np.arange(1, n + 1))
        bad = np.zeros(n + 1, bool)
        bad[1:] = (sizes > hole_min) & (pure > hole_pure)
        holes = bad[lab]
        # Titik manual: kosongkan region putih yang memuat titik tsb.
        for (px, py) in clear_points:
            lab2, _ = ndi.label(mn >= 238)
            if lab2[py, px]:
                holes |= lab2 == lab2[py, px]
        body &= ~holes
        ring = ndi.binary_dilation(holes, iterations=3) & ~dark & body
    # Piksel putih latar yang ikut masuk "badan" karena closing (lekukan di tepi garis
    # luar) dikembalikan menjadi latar: region putih di dalam badan yang menyentuh luar badan.
    wb = body & (mn >= 232)
    lab3, n3 = ndi.label(wb)
    if n3:
        outside = ndi.binary_dilation(~body, iterations=1)
        touch = np.zeros(n3 + 1, bool)
        touch[np.unique(lab3[outside & wb])] = True
        touch[0] = False
        # hanya lekukan kecil; area putih besar (gaun, kain) tetap dipertahankan
        sizes3 = np.bincount(lab3.ravel(), minlength=n3 + 1)
        touch &= sizes3 <= 300
        body &= ~touch[lab3]
    # color-to-alpha terhadap putih
    a = (255.0 - mn) / 255.0
    aa = np.clip(a, 1e-3, 1)[..., None]
    unpm = np.clip((rgbf - 255.0 * (1 - aa)) / aa, 0, 255)

    # --- lapisan body
    a_body = body.astype(float)
    strong = ink_mask & ~body & (mn < 110)          # api/efek pekat: tetap normal
    a_body = np.where(strong, 1.0, a_body)
    a_body = np.where(ring, np.clip(a * 1.6, 0, 1), a_body)
    near = ndi.binary_dilation(body | strong, iterations=1) & ~(body | strong)
    a_body = np.where(near, np.clip(a * 1.3, 0, 1), a_body)   # tepi antialias
    col_body = np.where((ring | near)[..., None], unpm, rgbf)

    # --- lapisan glow (aditif): warna premultiplied = unpm * alpha
    a_glow = np.where(body | strong, 0.0, np.clip(a * 1.5, 0, 1))
    a_glow[~ndi.binary_dilation(ink_mask, iterations=3)] = 0
    col_glow = unpm

    return (col_body.astype(np.uint8), (a_body * 255).astype(np.uint8),
            col_glow.astype(np.uint8), (a_glow * 255).astype(np.uint8), dark)


def group_row(comps, attach):
    """comps: list of dict(box, area, ids). Kembalikan list frame (komponen besar)
    dan list komponen kecil yang tidak dapat frame."""
    if not comps:
        return []
    maxa = max(c["area"] for c in comps)
    big = [c for c in comps if c["area"] >= 0.12 * maxa]
    small = [c for c in comps if c["area"] < 0.12 * maxa]
    big.sort(key=lambda c: c["box"][0])
    frames = []
    for c in big:
        merged = False
        for f in frames:
            fx0, _, fx1, _ = f["box"]
            cx0, _, cx1, _ = c["box"]
            ov = min(fx1, cx1) - max(fx0, cx0)
            if ov > 0.5 * min(fx1 - fx0, cx1 - cx0):
                f["ids"] += c["ids"]
                f["box"] = union(f["box"], c["box"])
                f["area"] += c["area"]
                merged = True
                break
        if not merged:
            frames.append({"box": c["box"], "ids": list(c["ids"]), "area": c["area"]})
    for c in small:
        best, bestd = None, 1e9
        cx = (c["box"][0] + c["box"][2]) / 2
        for f in frames:
            if attach == "left" and f["box"][0] > c["box"][0]:
                continue
            d = box_dist(f["box"], c["box"])
            if d < bestd:
                best, bestd = f, d
        if best is None:
            best = min(frames, key=lambda f: abs((f["box"][0] + f["box"][2]) / 2 - cx))
            bestd = box_dist(best["box"], c["box"])
        if bestd < 140 and c["area"] >= 60:
            best["ids"] += c["ids"]
            best["box"] = union(best["box"], c["box"])
    frames.sort(key=lambda f: f["box"][0])
    return frames


def union(a, b):
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def box_dist(a, b):
    dx = max(0, max(a[0], b[0]) - min(a[2], b[2]))
    dy = max(0, max(a[1], b[1]) - min(a[3], b[3]))
    return (dx * dx + dy * dy) ** 0.5


def process(cid, debug=False):
    cfg = CONFIG[cid]
    img = Image.open(os.path.join(SRC, cid + ".jpg")).convert("RGB")
    rgb = np.asarray(img).astype(np.int16).copy()
    # Hapus teks label: piksel netral (abu/hitam) di dalam kotak label diputihkan.
    for (x0, y0, x1, y1) in cfg["drop"]:
        reg = rgb[y0:y1, x0:x1]
        neutral = (reg.max(2) - reg.min(2)) < 22
        reg[neutral] = 255
    ink = rgb.min(2) < INK
    layers = build_alpha(rgb, ink, cfg.get("hole_min", 120), cfg.get("hole_pure", 0.85),
                         cfg.get("clear_points", ()), cfg.get("dark_max", 120))
    grow = ndi.binary_dilation(ink, iterations=2)
    # Garis potong paksa untuk baris yang sprite-nya saling menempel.
    for (cx0, cx1, cy) in cfg.get("cuts", []):
        grow[cy - 1:cy + 1, cx0:cx1] = False
    lab, n = ndi.label(grow)
    objs = ndi.find_objects(lab)
    areas = ndi.sum(ink, lab, index=np.arange(1, n + 1))
    coms = ndi.center_of_mass(ink, lab, index=np.arange(1, n + 1))

    comps = []
    for i, sl in enumerate(objs):
        if sl is None or areas[i] < 25:
            continue
        box = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
        if any(inside(box, r) for r in cfg["drop"]):
            continue
        cy, cx = coms[i]
        comps.append({"box": box, "area": float(areas[i]), "ids": [i + 1], "c": (cx, cy)})

    rows = cfg["rows"]
    per_row = [[] for _ in rows]
    for c in comps:
        cx, cy = c["c"]
        for ri, r in enumerate(rows):
            x0, y0, x1, y1 = r["rect"]
            if x0 <= cx < x1 and y0 <= cy < y1:
                per_row[r.get("merge_into_row", ri)].append(c)
                break

    frames_out = {}   # anim -> list of frame images
    fx_out = {}
    for ri, r in enumerate(rows):
        if "merge_into_row" in r:
            continue
        frames = group_row(per_row[ri], r.get("attach", "nearest"))
        need = max([max(v) for v in r["anims"].values()] + list(r.get("fx", {}).values())) + 1
        print(f"  {cid} row{ri}: {len(frames)} frame (butuh {need})")
        if len(frames) < need:
            raise SystemExit(f"{cid} baris {ri}: frame kurang ({len(frames)} < {need})")
        for anim, idxs in r["anims"].items():
            frames_out.setdefault(anim, [])
            for k in idxs:
                frames_out[anim].append(cut(frames[k], lab, layers))
        for name, k in r.get("fx", {}).items():
            fx_out[name] = cut(frames[k], lab, layers, anchor="center")

    pack(cid, frames_out, fx_out, debug)


def cut(frame, lab, layers, anchor="feet"):
    col_b, a_b, col_g, a_g, dark = layers
    x0, y0, x1, y1 = frame["box"]
    pad = 6
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(lab.shape[1], x1 + pad), min(lab.shape[0], y1 + pad)
    sub = lab[y0:y1, x0:x1]
    m = ndi.binary_dilation(np.isin(sub, frame["ids"]), iterations=3)
    m = ndi.binary_fill_holes(m)  # area putih di dalam karakter (gaun, mata) ikut; latar diatur alpha
    ab = a_b[y0:y1, x0:x1].copy(); ab[~m] = 0
    ag = a_g[y0:y1, x0:x1].copy(); ag[~m] = 0
    body = Image.fromarray(np.dstack([col_b[y0:y1, x0:x1], ab]), "RGBA")
    glow = Image.fromarray(np.dstack([col_g[y0:y1, x0:x1], ag]), "RGBA")
    both = Image.fromarray(np.maximum(ab, ag))
    bb = both.point(lambda v: 255 if v > 6 else 0).getbbox()
    body, glow = body.crop(bb), glow.crop(bb)
    d = (dark[y0:y1, x0:x1] & m)[bb[1]:bb[3], bb[0]:bb[2]]
    h, w = d.shape
    if anchor == "feet" and d.sum() > 50:
        ys = np.where(d.sum(1) >= 3)[0]
        ay = int(ys.max()) if len(ys) else h - 1
        yy, xx = np.where(d)
        top = yy < (yy.min() + 0.6 * (ay - yy.min()))
        ax = float(np.median(xx[top])) if top.sum() > 20 else float(np.median(xx))
    else:
        ax, ay = w / 2, h / 2
    has_glow = int((np.asarray(glow)[..., 3] > 12).sum()) > 200
    return {"img": body, "glow": glow if has_glow else None, "ax": ax, "ay": ay}


def pack(cid, anims, fx, debug):
    # Skala per karakter: tinggi frame idle pertama dinormalkan ke TARGET_H.
    s = min(1.0, TARGET_H / anims["idle"][0]["img"].height)
    def rs(f):
        im = f["img"]
        size = (max(1, round(im.width * s)), max(1, round(im.height * s)))
        g = f["glow"].resize(size, Image.LANCZOS) if f["glow"] is not None else None
        return {"img": im.resize(size, Image.LANCZOS), "glow": g, "ax": f["ax"] * s, "ay": f["ay"] * s}
    anims = {k: [rs(f) for f in v] for k, v in anims.items()}
    fx = {k: rs(f) for k, f in fx.items()}
    items = []
    for name, frs in anims.items():
        for i, f in enumerate(frs):
            items.append((name, i, f))
    for name, f in fx.items():
        items.append(("fx:" + name, 0, f))
    # Shelf packing sederhana
    maxw = 2048
    x = y = shelf_h = 0
    places = []
    for it in sorted(items, key=lambda t: -t[2]["img"].height):
        im = it[2]["img"]
        if x + im.width > maxw:
            x = 0
            y += shelf_h + 2
            shelf_h = 0
        places.append((it, x, y))
        x += im.width + 2
        shelf_h = max(shelf_h, im.height)
    H = y + shelf_h
    atlas = Image.new("RGBA", (maxw, H), (0, 0, 0, 0))
    gatlas = Image.new("RGBA", (maxw, H), (0, 0, 0, 0))
    meta = {"id": cid, "scale": round(s, 4), "bodyH": anims["idle"][0]["img"].height, "anims": {}, "fx": {}}
    for (name, i, f), px, py in places:
        atlas.paste(f["img"], (px, py))
        if f["glow"] is not None:
            gatlas.paste(f["glow"], (px, py))
        rec = [px, py, f["img"].width, f["img"].height, round(f["ax"], 1), round(f["ay"], 1),
               1 if f["glow"] is not None else 0]
        if name.startswith("fx:"):
            meta["fx"][name[3:]] = rec
        else:
            meta["anims"].setdefault(name, [None] * len(anims[name]))
            meta["anims"][name][i] = rec
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, cid + ".webp"), "WEBP", quality=88, method=6)
    gatlas.save(os.path.join(OUT, cid + "_glow.webp"), "WEBP", quality=80, method=6)
    with open(os.path.join(OUT, cid + ".json"), "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    print(f"  {cid}: atlas {maxw}x{H}, " + ", ".join(f"{k}={len(v)}" for k, v in anims.items()))
    if debug:
        contact(cid, anims, fx)


def contact(cid, anims, fx):
    os.makedirs(DEBUG_DIR, exist_ok=True)
    cell = 300
    rows = list(anims.items()) + [("fx:" + k, [v]) for k, v in fx.items()]
    cols = max(len(v) for _, v in rows)
    sheet = Image.new("RGBA", (cols * cell, len(rows) * cell), (40, 44, 70, 255))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for r, (name, frs) in enumerate(rows):
        for c, f in enumerate(frs):
            im = f["img"]
            k = min(1, (cell - 20) / max(im.width, im.height))
            im2 = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
            bx = c * cell + cell // 2
            by = r * cell + cell - 20
            px = int(bx - f["ax"] * k)
            py = int(by - f["ay"] * k)
            if name.startswith("fx:"):
                px, py = c * cell + 10, r * cell + 10
            sheet.alpha_composite(im2, (max(0, px), max(0, py)))
            if f["glow"] is not None:
                g = np.asarray(f["glow"].resize(im2.size)).astype(float)
                add = g[..., :3] * (g[..., 3:4] / 255.0)
                X, Y = max(0, px), max(0, py)
                base = np.asarray(sheet).astype(float)
                hh = min(add.shape[0], base.shape[0] - Y); ww = min(add.shape[1], base.shape[1] - X)
                base[Y:Y + hh, X:X + ww, :3] = np.clip(base[Y:Y + hh, X:X + ww, :3] + add[:hh, :ww], 0, 255)
                sheet = Image.fromarray(base.astype(np.uint8), "RGBA")
                dr = ImageDraw.Draw(sheet)
            dr.line([(bx - 10, by), (bx + 10, by)], fill=(255, 0, 0, 255))
        dr.text((4, r * cell + 4), name, fill=(255, 255, 0, 255))
    sheet.convert("RGB").save(os.path.join(DEBUG_DIR, cid + ".png"))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dbg = "--debug" in sys.argv
    for cid in (args or list(CONFIG)):
        print(cid)
        process(cid, dbg)
