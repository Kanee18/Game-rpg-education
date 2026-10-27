#!/usr/bin/env python3
"""
Menyiapkan sprite musuh dari lembar pose berlatar papan catur "transparan palsu".

Pemakaian:
    python3 tools/prepare_enemies.py          # semua musuh di CONFIG
    python3 tools/prepare_enemies.py --debug  # simpan pratinjau ke tools/_debug

Keluaran: public/assets/enemies/<id>.webp (atlas) dan <id>.json
          frame: [sx, sy, w, h, anchorX, anchorY]

Cara kerja:
  - Badan = area yang dikelilingi garis luar gelap -> opak, warna asli.
  - Di luar badan, papan catur berwarna netral (abu/putih) sehingga "chroma"
    (selisih warna terhadap abu-abu) hanya berasal dari efek cahaya. Alpha efek
    dihitung dari chroma, jadi pola papan catur hilang tanpa perlu tahu letak kotaknya.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "enemies")
OUT = os.path.join(ROOT, "public", "assets", "enemies")
DEBUG_DIR = os.path.join(ROOT, "tools", "_debug")

CONFIG = {
    "wolf": {
        "file": "stage1-serigala.jpg",
        "flip": True,           # sumber menghadap kanan, di game musuh menghadap kiri
        "thin_glow": ("attack", "skill"),   # pose dengan garis cahaya putih tipis
        "target_h": 300,        # tinggi frame idle di atlas
        # kotak tiap pose (x0, y0, x1, y1) — di atas teks label
        "frames": {
            "idle": (60, 10, 470, 232),
            "attack": (560, 10, 1000, 232),
            "skill": (50, 290, 490, 538),
            "defeat": (570, 300, 1010, 538),
        },
    },
    "golem": {
        "file": "stage2-golem.jpg",
        "flip": True,
        "target_h": 340,
        # teks label yang menempel di dekat pose dihapus dulu
        "erase": [(474, 334, 550, 369)],
        # lembar ini tidak punya pose idle: dibuat dari pose serangan tanpa
        # ledakan kristal di tanah (hanya komponen badan utama)
        "frames": {
            "idle": {"from": (70, 55, 490, 302), "main_only": True,
                     # area ledakan di sekitar tinju & retakan tanah
                     "clean_box": (200, 140, 420, 260), "cut_below": 238},
            "attack": {"from": (70, 55, 490, 302), "ground_y": 238},
            "skill": (595, 68, 950, 362),
            "defeat": {"from": (262, 336, 732, 546), "drop_islands": True, "glow_near_body": 14},
        },
    },
}


def extract(rgb, thin_glow=False):
    rgbf = rgb.astype(float)
    mn, mx = rgb.min(2), rgb.max(2)
    dark = mx < 95
    # papan catur selalu terang (>=180) dan netral; bulu serigala lebih gelap
    solid = (mx < 165) | dark
    closed = ndi.binary_closing(solid, structure=np.ones((5, 5)))
    body = ndi.binary_fill_holes(closed)
    # lubang papan catur yang terkurung (mis. sela kaki) dikembalikan menjadi latar
    mean0 = rgb.astype(float).mean(2)
    chroma0 = np.sqrt(((rgb - mean0[..., None]) ** 2).sum(2))
    hole = body & ~solid & (chroma0 < 16) & (mn > 175)
    lab_h, n_h = ndi.label(hole)
    if n_h:
        sizes_h = np.bincount(lab_h.ravel())
        big = sizes_h > 120
        big[0] = False
        body &= ~big[lab_h]
    body = ndi.binary_opening(body, iterations=1) | dark
    # buang pulau gelap kecil (sisa noise JPEG)
    lab, n = ndi.label(body)
    if n:
        sizes = np.bincount(lab.ravel())
        keep = sizes >= 60
        keep[0] = False
        body = keep[lab]
    # chroma: jarak warna terhadap sumbu abu-abu
    mean = rgbf.mean(2, keepdims=True)
    chroma_vec = rgbf - mean
    chroma = np.sqrt((chroma_vec ** 2).sum(2))
    cmax = np.percentile(chroma[~body], 99.7) if (~body).any() else 1
    cmax = max(cmax, 40)
    a = np.clip((chroma - 8) / (cmax - 8), 0, 1)
    a = ndi.gaussian_filter(a, 1.2)
    # inti cahaya putih (mis. sabetan cakar) di tengah area yang sudah bercahaya
    near = ndi.gaussian_filter(a, 3)
    # garis cahaya putih yang tipis (tanduk cahaya, sabetan cakar): terang, berada di
    # area bercahaya, dan hilang bila dibuka 9x9 -> bukan kotak catur (kotak ~17 px)
    bright = (mn > 200) & ~body
    thin = bright & ~ndi.binary_opening(bright, structure=np.ones((9, 9)))
    thin = ndi.binary_opening(thin, structure=np.ones((2, 2)))
    lab_t, n_t = ndi.label(thin)
    if n_t:
        # buang serpihan kecil (tepi kotak catur yang terpotong pendar)
        sz = np.bincount(lab_t.ravel()); sz[0] = 0
        ok = sz >= 40
        thin = ok[lab_t]
    core = ((mn > 232) & (near > 0.55) & ~body) | ((thin & (near > 0.25)) if thin_glow else False)
    core = ndi.binary_dilation(core) & (mn > 185) & ~body
    # warna efek: arah chroma dengan saturasi tetap, kecerahan dasar 175
    with np.errstate(invalid="ignore", divide="ignore"):
        dirv = np.where(chroma[..., None] > 1e-3, chroma_vec / chroma[..., None], 0)
    glow_col = np.clip(175 + dirv * cmax * 0.9, 0, 255)
    glow_col[core] = np.clip(rgbf[core] * 0.6 + 255 * 0.4, 0, 255)
    a = np.where(core, np.maximum(a, 0.9), a)

    alpha = np.where(body, 1.0, a)
    color = np.where(body[..., None], rgbf, glow_col)
    # tepi badan antialias
    edge = ndi.binary_dilation(body, iterations=1) & ~body
    alpha[edge] = np.maximum(alpha[edge], np.clip((255 - mn[edge]) / 255 * 1.4, 0, 1))
    color[edge] = np.where((mn[edge] < 150)[:, None], rgbf[edge], color[edge])
    return color.astype(np.uint8), (alpha * 255).astype(np.uint8), body


def process(eid, cfg, debug):
    sheet = Image.open(os.path.join(SRC, cfg["file"])).convert("RGB")
    arr = np.asarray(sheet).copy()
    for (x0, y0, x1, y1) in cfg.get("erase", []):
        reg = arr[y0:y1, x0:x1].astype(int)
        # teks hitam/putih netral -> jadikan latar terang netral
        neutral = (reg.max(2) - reg.min(2)) < 40
        arr[y0:y1, x0:x1][neutral] = 250
    sheet = Image.fromarray(arr)
    frames = {}
    for name, spec in cfg["frames"].items():
        box = spec["from"] if isinstance(spec, dict) else spec
        rgb = np.asarray(sheet.crop(box)).astype(np.int16)
        col, al, body = extract(rgb, thin_glow=name in cfg.get("thin_glow", ()))
        if isinstance(spec, dict) and spec.get("cut_below"):
            body[spec["cut_below"]:] = False
            al[spec["cut_below"]:] = 0
        if isinstance(spec, dict) and spec.get("drop_islands"):
            lab, n = ndi.label(body)
            if n:
                sizes = np.bincount(lab.ravel()); sizes[0] = 0
                main = lab == sizes.argmax()
                near = ndi.binary_dilation(main, iterations=25)
                ok = np.zeros(n + 1, bool)
                ok[np.unique(lab[near])] = True
                ok[0] = False
                body = ok[lab]
        if isinstance(spec, dict) and spec.get("glow_near_body"):
            near = ndi.binary_dilation(body, iterations=spec["glow_near_body"])
            al = np.where(near, al, 0).astype(np.uint8)
        if isinstance(spec, dict) and spec.get("main_only"):
            lab, n = ndi.label(body)
            if n:
                sizes = np.bincount(lab.ravel()); sizes[0] = 0
                main = lab == sizes.argmax()
                main = ndi.binary_fill_holes(main)
                # buang pecahan ledakan yang menempel: opening besar lalu kembalikan detail
                core = ndi.binary_opening(main, iterations=4)
                lab2, _ = ndi.label(core)
                s2 = np.bincount(lab2.ravel()); s2[0] = 0
                core = lab2 == s2.argmax()
                grow = ndi.binary_dilation(core, iterations=5)
                if spec.get("clean_box"):
                    # di sekitar tinju hanya bentuk padat yang dipertahankan (pecahan dibuang)
                    x0, y0, x1, y1 = spec["clean_box"]
                    grow[y0:y1, x0:x1] = ndi.binary_dilation(core, iterations=1)[y0:y1, x0:x1]
                main &= grow
                body = main
                keep = ndi.binary_dilation(main, iterations=8)
                if spec.get("clean_box"):
                    keep[y0:y1, x0:x1] = False
                al = np.where(main, al, np.where(keep, (al * 0.5).astype(np.uint8), 0)).astype(np.uint8)
        # efek cahaya memudar mendekati tepi kotak potong (hindari tepi lurus)
        hgt, wid = al.shape
        yy, xx = np.mgrid[0:hgt, 0:wid]
        edge_d = np.minimum.reduce([yy, xx, hgt - 1 - yy, wid - 1 - xx]).astype(float)
        fade = np.clip(edge_d / 28.0, 0, 1)
        al = np.where(body, al, (al * fade)).astype(np.uint8)
        im = Image.fromarray(np.dstack([col, al]), "RGBA")
        bb = Image.fromarray(al).point(lambda v: 255 if v > 10 else 0).getbbox()
        im = im.crop(bb)
        b = body[bb[1]:bb[3], bb[0]:bb[2]]
        ys = np.where(b.sum(1) >= 3)[0]
        ay = float(ys.max()) if len(ys) else im.height - 1
        if isinstance(spec, dict) and spec.get("ground_y"):
            ay = float(spec["ground_y"] - bb[1])   # garis tanah tetap (retakan ada di bawahnya)
        xs = np.where(b.any(0))[0]
        ax = float((xs.min() + xs.max()) / 2) if len(xs) else im.width / 2
        if cfg.get("flip"):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            ax = im.width - ax
        frames[name] = {"img": im, "ax": ax, "ay": ay}
    s = cfg["target_h"] / frames["idle"]["img"].height
    s = min(s, 1.6)
    # skala sumber kecil boleh diperbesar sedikit; simpan dalam resolusi target
    items = []
    for name, f in frames.items():
        im = f["img"].resize((round(f["img"].width * s), round(f["img"].height * s)), Image.LANCZOS)
        items.append((name, im, f["ax"] * s, f["ay"] * s))
    x, atlas_w = 0, sum(i[1].width + 2 for i in items)
    atlas_h = max(i[1].height for i in items)
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    meta = {"id": eid, "bodyH": items[0][1].height, "frames": {}}
    for name, im, ax, ay in items:
        atlas.paste(im, (x, 0))
        meta["frames"][name] = [x, 0, im.width, im.height, round(ax, 1), round(ay, 1)]
        x += im.width + 2
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, eid + ".webp"), "WEBP", quality=90, method=6)
    with open(os.path.join(OUT, eid + ".json"), "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    print(f"  {eid}: atlas {atlas_w}x{atlas_h}, frame: {', '.join(frames)}")
    if debug:
        os.makedirs(DEBUG_DIR, exist_ok=True)
        prev = Image.new("RGBA", (atlas_w, atlas_h * 2), (30, 24, 50, 255))
        prev.alpha_composite(atlas, (0, 0))
        light = Image.new("RGBA", (atlas_w, atlas_h), (90, 130, 80, 255))
        light.alpha_composite(atlas)
        prev.paste(light, (0, atlas_h))
        prev.convert("RGB").save(os.path.join(DEBUG_DIR, eid + "_enemy.png"))


if __name__ == "__main__":
    dbg = "--debug" in sys.argv
    for k, v in CONFIG.items():
        process(k, v, dbg)
