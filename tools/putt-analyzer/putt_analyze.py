#!/usr/bin/env python3
"""
putt_analyze.py - Putting-Green-Analyse aus einem Foto.

Zaehlt Golfbaelle auf einem Gruen, misst ihre Distanz zum Loch und beantwortet:
  - wie viele Baelle innerhalb r Meter ums Loch liegen (default r = 1 m)
  - wie viele Baelle insgesamt auf dem Gruen liegen
  - Baelle IM Loch werden separat gezaehlt, nicht mitgerechnet

Passt zur worktracker-Uebung "Putten aus 1 m, 10 Baelle": Foto statt Handzaehlung.

ARCHITEKTUR - "VLM grob + CV fein" (rotationsinvariant, robust):

  1. Ein schnelles Vision-Modell (VLM) liefert nur GROBE Semantik aus einem
     verkleinerten Bild: wo ist das aktive Loch, wo liegen die Baelle ungefaehr,
     wie viele im Loch. Das loest die harten Faelle, an denen reine
     Bildverarbeitung scheitert: gekippte Putter/Fahnen, mehrere Fahnen,
     Distraktoren (Schuh am Bildrand), Schatten-Raender.

  2. Klassische CV (numpy/scipy) macht die PRAEZISE Messung: weisse Ball-Blobs
     werden exakt lokalisiert und den groben VLM-Punkten zugeordnet (Nearest-Blob),
     das Loch wird lokal als dunkle Cup-Ellipse nachgemessen.

  3. MASZSTAB aus dem Loch-Durchmesser (Norm 108 mm) - fix, ohne Annahme ueber die
     Putterlaenge. Putterlaenge bleibt optionale Querprobe.

Der VLM-Provider ist austauschbar (--provider): 'mistral' (guenstig, fuer Volumen)
oder 'anthropic' (Claude, beste Lokalisierung). Die CV-Feinmessung macht das
Ergebnis unabhaengig von der VLM-Praezision.

Weitere Detektoren: 'manual' (Punkte aus JSON, kein Modell), 'cv' (reine
Bildverarbeitung, nur achsparallele putt1-artige Bilder, ROI-gebunden).

Install:  python3 -m venv venv && venv/bin/pip install -r requirements.txt
Keys  :   export MISTRAL_API_KEY=...   bzw.   export ANTHROPIC_API_KEY=...
Aufruf:   venv/bin/python putt_analyze.py putt2.jpg                  # hybrid + mistral
          venv/bin/python putt_analyze.py putt2.jpg --provider anthropic
          venv/bin/python putt_analyze.py putt1.jpg --detector manual --points pts.json
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import urllib.request
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# Keys aus Umgebung ODER .env (python-decouple, falls installiert; sucht .env ab cwd aufwaerts)
try:
    from decouple import config as _dconf

    def _env(name):
        return os.environ.get(name) or _dconf(name, default=None)
except Exception:                                    # decouple optional
    def _env(name):
        return os.environ.get(name)

PUTTER_INCH = {33: 0.838, 34: 0.864, 35: 0.889}
HOLE_DIAM_M = 0.108                                  # Norm-Lochdurchmesser (108 mm)

# --- VLM ---
VLM_MAX_PX = 1024                                    # laengste Bildkante ans Modell (Token sparen)
PROVIDER_DEFAULT_MODEL = {
    "mistral": "mistral-large-latest",               # zu ungenau fuer Lokalisierung - nur als Fallback
    "anthropic": "claude-opus-4-8",                  # beste Lokalisierung; ~1ct/Foto. haiku zu schwach, sonnet ueberzaehlt
}
VLM_PROMPT = (
    "Golf putting green photo, {w}x{h}px, origin top-left. Find the ACTIVE hole: "
    "the cup where the lying putter rests / that it points away from. If several flags "
    "exist, the active hole is the one at the putter head. Reply with ONLY compact JSON, "
    "pixel coordinates of THIS image:\n"
    '{{"hole":[x,y],"putter":[[head_x,head_y],[grip_x,grip_y]],'
    '"balls":[[x,y],...],"balls_in_hole":N}}\n'
    "hole = centre of the active cup. putter = the two ends of the lying putter "
    "(head end resting at the hole, grip end = the thick handle). balls = golf balls "
    "lying ON the green; do NOT include balls inside the cup (count those as "
    "balls_in_hole) and do NOT include non-balls such as shoes or flags."
)

# --- nur fuer den reinen CV-Fallback: feste ROIs fuer putt1.jpg (4032x2268) ---
DEF_CUP_ROI = (1545, 1198, 1702, 1296)
DEF_PUTTER_ROI = (1700, 1198, 2810, 1330)


@dataclass
class Result:
    image_size: tuple[int, int]
    scale: int
    hole: tuple[float, float]
    cup_diam_px: float | None
    pxm: float                                       # Pixel pro Meter (Maszstab)
    scale_src: str                                   # "hole" | "putter"
    radius_m: float
    balls: list = field(default_factory=list)        # (x, y, dist_px, dist_m), sortiert
    balls_in_hole: int = 0
    putter_px: float | None = None
    putter_inch: int = 34
    detector: str = "hybrid"

    @property
    def total(self) -> int:
        return len(self.balls)

    @property
    def within(self) -> int:
        return sum(1 for *_, m in self.balls if m <= self.radius_m)


# =========================================================================
#  Geometrie-Kern (nur Punkte + Maszstab) - orientierungsunabhaengig
# =========================================================================
def geometry(full_size, hole, balls_xy, pxm, scale_src, radius_m=1.0,
             cup_diam_px=None, balls_in_hole=0, putter_px=None, putter_inch=34,
             detector="hybrid"):
    hx, hy = hole
    rows = sorted(
        ((bx, by, (d := float(np.hypot(bx - hx, by - hy))), d / pxm) for bx, by in balls_xy),
        key=lambda r: r[2],
    )
    return Result(tuple(full_size), 1, (float(hx), float(hy)),
                  float(cup_diam_px) if cup_diam_px else None, float(pxm), scale_src,
                  radius_m, rows, int(balls_in_hole),
                  float(putter_px) if putter_px else None, putter_inch, detector)


# =========================================================================
#  VLM (grob) - Provider Mistral / Anthropic via Raw-HTTP
# =========================================================================
def _downscale(im, max_px):
    w, h = im.size
    s = max(w, h) / max_px
    return (im.resize((round(w / s), round(h / s))), s) if s > 1 else (im.copy(), 1.0)


def _http_json(url, headers, body, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _vlm_call(provider, b64, prompt, model, api_key, timeout):
    """-> roher Antworttext (JSON-String erwartet)."""
    if provider == "mistral":
        data = _http_json(
            "https://api.mistral.ai/v1/chat/completions",
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            {"model": model, "temperature": 0, "max_tokens": 1000,
             "response_format": {"type": "json_object"},
             "messages": [{"role": "user", "content": [
                 {"type": "text", "text": prompt},
                 {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}]},
            timeout)
        return data["choices"][0]["message"]["content"]
    if provider == "anthropic":
        data = _http_json(
            "https://api.anthropic.com/v1/messages",
            {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
            {"model": model, "max_tokens": 1000,
             "messages": [{"role": "user", "content": [
                 {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                 {"type": "text", "text": prompt + "\nReturn only the JSON object, no prose."}]}]},
            timeout)
        return "".join(b["text"] for b in data["content"] if b["type"] == "text")
    raise ValueError(f"unbekannter provider: {provider}")


def _extract_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    a, b = text.find("{"), text.rfind("}")
    return json.loads(text[a:b + 1] if a >= 0 else text)


def detect_vlm_rough(image_path, provider="mistral", model=None, api_key=None,
                     max_px=VLM_MAX_PX, timeout=60):
    """Grobe Semantik vom VLM -> Punkte in Vollaufloesung."""
    model = model or PROVIDER_DEFAULT_MODEL[provider]
    api_key = api_key or _env("MISTRAL_API_KEY" if provider == "mistral" else "ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(f"API-Key fuer provider '{provider}' fehlt (Env oder --api-key).")
    im = Image.open(image_path).convert("RGB")
    small, s = _downscale(im, max_px)
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    raw = _extract_json(_vlm_call(provider, b64,
                                  VLM_PROMPT.format(w=small.size[0], h=small.size[1]),
                                  model, api_key, timeout))
    putter = raw.get("putter")
    return {
        "hole": (raw["hole"][0] * s, raw["hole"][1] * s),
        "putter": [(putter[0][0] * s, putter[0][1] * s),
                   (putter[1][0] * s, putter[1][1] * s)] if putter else None,
        "balls": [(b[0] * s, b[1] * s) for b in raw.get("balls", [])],
        "balls_in_hole": int(raw.get("balls_in_hole", 0)),
        "full_size": im.size,
    }


# =========================================================================
#  CV-Feinmessung
# =========================================================================
def _feats(a):
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx, mn = a.max(2), a.min(2)
    val = mx / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    green = G - np.maximum(R, B)
    return R, G, B, val, sat, green


def white_blobs(im, f=3):
    """Alle weissen Ball-Kandidaten (x, y, durchmesser_px) in Vollaufloesung."""
    small = im.reduce(f) if f > 1 else im
    a = np.asarray(small).astype(np.float32)
    *_, val, sat, _ = _feats(a)
    white = (val > 0.72) & (sat < 0.22)
    lbl, n = ndimage.label(white)
    sizes = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    coms = ndimage.center_of_mass(np.ones_like(lbl), lbl, range(1, n + 1))
    min_area, max_dim = max(8, int(360 / (f * f))), int(100 / f)
    out = []
    for i, (s, c) in enumerate(zip(sizes, coms), 1):
        if s < min_area:
            continue
        ys, xs = np.where(lbl == i)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if w / h > 2.5 or w / h < 0.45 or s / (w * h) < 0.5 or max(w, h) > max_dim:
            continue
        out.append((c[1] * f, c[0] * f, max(w, h) * f))
    return out


def refine_cup(im, hole_xy, win=170):
    """Dunkle Cup-Ellipse lokal um den groben Lochpunkt -> (cx, cy, durchmesser_px)."""
    hx, hy = hole_xy
    W, H = im.size
    x0, y0 = max(0, int(hx - win)), max(0, int(hy - win))
    x1, y1 = min(W, int(hx + win)), min(H, int(hy + win))
    a = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.float32)
    *_, green = _feats(a)
    cup = ndimage.binary_opening(ndimage.binary_closing(green < 5, iterations=2), iterations=1)
    lbl, n = ndimage.label(cup)
    if n == 0:
        return hx, hy, None
    # Komponente, die dem groben Lochpunkt am naechsten liegt (nicht die groesste)
    cx_w, cy_w = hx - x0, hy - y0
    best, bd = None, 1e9
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if len(xs) < 60:
            continue
        d = np.hypot(xs.mean() - cx_w, ys.mean() - cy_w)
        if d < bd:
            bd, best = d, (xs, ys)
    if best is None:
        return hx, hy, None
    xs, ys = best
    # Cup-Mitte aus den BREITESTEN Zeilen - die duenne Fahnenstange (schmale Zeilen
    # oberhalb) wuerde den Schwerpunkt sonst nach oben ziehen.
    rows = {}
    for yy, xx in zip(ys, xs):
        rows.setdefault(int(yy), []).append(int(xx))
    widths = {yy: max(v) - min(v) + 1 for yy, v in rows.items()}
    maxw = max(widths.values())
    wide = [yy for yy, w in widths.items() if w > 0.5 * maxw]
    cy = float(np.mean(wide)) + y0
    cx = float(np.mean([np.mean(rows[yy]) for yy in wide])) + x0
    diam = float(maxw)                               # breiteste Zeile = Cup-Durchmesser
    return cx, cy, diam


def find_flags(im, f=3, min_area=18):
    """Warme (nicht-gruene, gesaettigte) Fahnen-Blobs -> Zentren in Vollaufloesung.

    Fuer die Erkennung sekundaerer Loecher (zweite Fahne) - deren Baelle/Cups
    sollen nicht als Gruen-Baelle zaehlen.
    """
    small = im.reduce(f) if f > 1 else im
    a = np.asarray(small).astype(np.float32)
    R, G, B, val, sat, green = _feats(a)
    warm = (sat > 0.40) & (green < 0) & (R - B > 25)
    lbl, n = ndimage.label(warm)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if len(xs) < min_area:
            continue
        out.append((xs.mean() * f, ys.mean() * f))
    return out


def refine_cv(im, rough, f=3, putter_inch=34, max_ball_m=2.2):
    """VLM grob -> praezise: Loch-Mitte (Cup), Maszstab (Putter), Baelle (alle CV-Blobs).

    Baelle kommen vollstaendig aus der CV-Blob-Detektion (nicht aus der VLM-Liste);
    ausgeschlossen werden Baelle im Cup-Radius (im Loch) und Blobs weiter als
    max_ball_m vom Loch (Schuhe/Distraktoren am Bildrand). Maszstab primaer aus der
    Putterlaenge (VLM-Enden, 34"), sonst aus dem Cup-Durchmesser (108 mm).
    """
    blobs = white_blobs(im, f)
    cx, cy, diam = refine_cup(im, rough["hole"])

    putter = rough.get("putter")
    plen = float(np.hypot(putter[1][0] - putter[0][0], putter[1][1] - putter[0][1])) if putter else None
    if plen and plen > 200:
        pxm, scale_src = plen / PUTTER_INCH[putter_inch], "putter"
    elif diam:
        pxm, scale_src = diam / HOLE_DIAM_M, "hole"
    else:
        pxm, scale_src = im.size[0] / 4.0, "fallback"

    # Loch-Radius aus dem gemessenen Cup (Baelle im Cup-Radius zaehlen als "im Loch").
    cup_r = (diam * 0.5) if diam else (plen * 0.05 if plen else 50)
    max_px = max_ball_m * pxm
    opus_balls = rough.get("balls", [])
    green, in_hole_cv = [], 0
    for bx, by, _bd in blobs:
        dpx = np.hypot(bx - cx, by - cy)
        if dpx < cup_r:                                # im aktiven Loch
            in_hole_cv += 1
            continue
        # nahe Baelle immer; weite nur, wenn das VLM dort einen Ball sah
        # (haelt weite Putts, verwirft Distraktoren wie Schuhe am Rand).
        if scale_src != "fallback" and dpx > max_px:
            if not any(np.hypot(bx - ox, by - oy) < 0.25 * pxm for ox, oy in opus_balls):
                continue
        green.append((bx, by))
    return {"hole": (cx, cy), "balls_xy": green, "cup_diam": diam, "pxm": pxm,
            "scale_src": scale_src, "putter_px": plen, "putter_ends": putter,
            "balls_in_hole": max(rough["balls_in_hole"], in_hole_cv), "n_blobs": len(blobs)}


# =========================================================================
#  reiner CV-Fallback (achsparallel, ROI-gebunden) - fuer putt1-artige Bilder
# =========================================================================
def detect_cup(im, roi):
    x0, y0, _, _ = roi
    a = np.asarray(im.crop(roi)).astype(np.float32)
    *_, green = _feats(a)
    cup = ndimage.binary_opening(ndimage.binary_closing(green < 5, iterations=2), iterations=1)
    lbl, n = ndimage.label(cup)
    if n == 0:
        return None
    sizes = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    ys, xs = np.where(lbl == np.argmax(sizes) + 1)
    return (xs.min() + xs.max()) / 2 + x0, (ys.min() + ys.max()) / 2 + y0, float(xs.max() - xs.min() + 1)


def detect_putter(im, roi):
    x0, y0, _, _ = roi
    a = np.asarray(im.crop(roi)).astype(np.float32)
    *_, green = _feats(a)
    ng = ndimage.binary_opening(green < 6, iterations=1)
    lbl, n = ndimage.label(ng)
    sizes = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    ys, xs = np.where(lbl == np.argmax(sizes) + 1)
    pts = np.c_[xs, ys].astype(float)
    c = pts.mean(0)
    _, _, vt = np.linalg.svd(pts - c, full_matrices=False)
    proj = (pts - c) @ vt[0]
    return pts[proj.argmin()] + [x0, y0], pts[proj.argmax()] + [x0, y0]


# =========================================================================
#  Orchestrierung
# =========================================================================
def analyze(image_path, detector="cv", provider="mistral", model=None, api_key=None,
            putter_inch=34, radius_m=1.0, scale=3,
            hole=None, putter=None, cup_roi=None, putter_roi=None, points=None):
    """Vollanalyse -> Result (mit _small/_endpoints fuer annotate())."""
    im = Image.open(image_path).convert("RGB")
    f = max(1, scale)
    endpoints = None

    if detector in ("hybrid", "vlm"):
        rough = detect_vlm_rough(image_path, provider=provider, model=model, api_key=api_key)
        if detector == "vlm":                        # roh, ohne CV-Feinmessung
            putter = rough.get("putter")
            plen = float(np.hypot(putter[1][0] - putter[0][0], putter[1][1] - putter[0][1])) if putter else None
            pxm = (plen / PUTTER_INCH[putter_inch]) if plen else im.size[0] / 4.0
            ref = {"hole": rough["hole"], "balls_xy": rough["balls"], "cup_diam": None,
                   "pxm": pxm, "scale_src": "putter" if plen else "fallback",
                   "putter_px": plen, "putter_ends": putter,
                   "balls_in_hole": rough["balls_in_hole"]}
        else:
            ref = refine_cv(im, rough, f, putter_inch=putter_inch)
        if ref.get("putter_ends"):
            endpoints = (np.array(ref["putter_ends"][0]), np.array(ref["putter_ends"][1]))
        res = geometry(im.size, ref["hole"], ref["balls_xy"], ref["pxm"], ref["scale_src"],
                       radius_m=radius_m, cup_diam_px=ref["cup_diam"],
                       balls_in_hole=ref["balls_in_hole"], putter_px=ref.get("putter_px"),
                       putter_inch=putter_inch, detector=detector)

    elif detector == "manual":
        p = points if isinstance(points, dict) else json.load(open(points)) if os.path.exists(points) else json.loads(points)
        diam = p.get("cup_diam")
        if p.get("putter"):
            (x1, y1), (x2, y2) = p["putter"]         # [[head_x,head_y],[grip_x,grip_y]]
            plen = float(np.hypot(x2 - x1, y2 - y1))
            pxm, scale_src = plen / PUTTER_INCH[putter_inch], "putter"
            endpoints = (np.array([x1, y1]), np.array([x2, y2]))
        else:
            plen = None
            pxm, scale_src = diam / HOLE_DIAM_M, "hole"
        res = geometry(im.size, tuple(p["hole"]), [tuple(b) for b in p.get("balls", [])],
                       pxm, scale_src, radius_m=radius_m, cup_diam_px=diam,
                       balls_in_hole=int(p.get("balls_in_hole", 0)),
                       putter_px=plen, putter_inch=putter_inch, detector=detector)

    else:                                            # cv
        small = im.reduce(f) if f > 1 else im
        balls = [(x, y) for x, y, _ in white_blobs(im, f)]
        if hole is not None:
            hx, hy, diam = (*hole, None)
        else:
            hx, hy, diam = detect_cup(im, cup_roi or DEF_CUP_ROI)
        if putter is not None:
            e1, e2 = np.array(putter[:2]), np.array(putter[2:])
        else:
            e1, e2 = detect_putter(im, putter_roi or DEF_PUTTER_ROI)
        endpoints = (e1, e2)
        plen = float(np.hypot(e2[0] - e1[0], e2[1] - e1[1]))
        pxm, scale_src = plen / PUTTER_INCH[putter_inch], "putter"
        res = geometry(im.size, (hx, hy), balls, pxm, scale_src, radius_m=radius_m,
                       cup_diam_px=diam, putter_px=plen, putter_inch=putter_inch, detector="cv")

    res._small = im.reduce(f) if f > 1 else im.copy()
    res.scale = f
    res._endpoints = endpoints
    return res


def annotate(res, out_path):
    vis = res._small.copy()
    d = ImageDraw.Draw(vis)
    f = res.scale
    hx, hy = res.hole[0] / f, res.hole[1] / f
    st = putting_stats(res)
    # Qualitaetszonen: 1 m (gut, gruen) und 3 m (Mist-Grenze, rot)
    for rm, col in ((1.0, (0, 200, 0)), (3.0, (220, 0, 0))):
        rr = res.pxm * rm / f
        d.ellipse([hx - rr, hy - rr, hx + rr, hy + rr], outline=col, width=2)
    # Putt-Achse (Schlaeger->Loch-Linie) durch das Loch, beidseitig bis Bildrand
    if st is not None:
        ux, uy = st["u"]
        L = max(vis.size)
        d.line([(hx - ux * L, hy - uy * L), (hx + ux * L, hy + uy * L)], fill=(0, 220, 220), width=2)
    d.ellipse([hx - 4, hy - 4, hx + 4, hy + 4], fill=(255, 255, 0))
    # Baelle nach Zone gefaerbt (gruen<=1m, orange<=3m, rot>3m)
    for i, (bx, by, _dpx, m) in enumerate(res.balls, 1):
        x, y = bx / f, by / f
        col = _bucket_color(m)
        d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=col, width=3)
        d.text((x + 8, y - 5), f"{m:.2f}", fill=(255, 255, 0))
    # Streu-Ellipse (Systematik): Mitte = mittlerer Miss, Achsen = 1σ Streuung,
    # laengs an der Putter-Achse ausgerichtet (lang=kurz/lang-Streuung, quer=links/rechts).
    if st is not None and len(res.balls) >= 2:
        ux, uy = st["u"]
        px, py = st["p"]
        s = res.pxm / f
        cxm = hx + (st["mean_long"] * ux + st["mean_lat"] * px) * s
        cym = hy + (st["mean_long"] * uy + st["mean_lat"] * py) * s
        a, b = max(st["std_long"] * s, 3), max(st["std_lat"] * s, 3)
        t = np.linspace(0, 2 * np.pi, 49)
        pts = [(cxm + a * np.cos(k) * ux + b * np.sin(k) * px,
                cym + a * np.cos(k) * uy + b * np.sin(k) * py) for k in t]
        overlay = Image.new("RGBA", vis.size, (0, 0, 0, 0))
        ImageDraw.Draw(overlay).polygon(pts, fill=(255, 0, 255, 77))   # 30% alpha Fuellung
        vis = Image.alpha_composite(vis.convert("RGBA"), overlay).convert("RGB")
        d = ImageDraw.Draw(vis)
        d.line(pts + [pts[0]], fill=(255, 0, 255), width=2)            # Rand
        d.ellipse([cxm - 4, cym - 4, cxm + 4, cym + 4], fill=(255, 0, 255))  # Mittel-Miss
    vis.save(out_path)
    return vis.size


def putting_stats(res):
    """Zerlegt jeden Ball relativ zur PUTTER-Achse (Kopf->Griff, gesamte Laenge).

    Der Putter ist eine Strecke; als Gerade gesehen schneidet sie das Loch, und die
    Baelle kommen aus Putterrichtung auf das Loch zu. Achse u = Kopf->Griff (die echte
    Putterrichtung, unabhaengig von kleinen Fehlern der Loch-Schaetzung); der Kopf
    liegt am Loch, der Griff zeigt dorthin, woher die Baelle kamen.
      long > 0  : Ball auf der Griffseite des Lochs  -> ZU KURZ (nicht erreicht)
      long < 0  : Ball hinter dem Loch               -> ZU LANG (ueberrollt)
    lat = Querablage; Vorzeichen -> rechts/links (visuell kalibriert: lat>0 = rechts).
    Alles in Metern. Gibt None, wenn keine Putterachse bekannt ist.
    """
    if getattr(res, "_endpoints", None) is None:
        return None
    e1, e2 = np.asarray(res._endpoints[0], float), np.asarray(res._endpoints[1], float)
    hx, hy = res.hole
    # Kopf = naeher am Loch, Griff = ferner; Achse = Putterrichtung Kopf->Griff
    head, grip = (e1, e2) if np.hypot(*(e1 - [hx, hy])) <= np.hypot(*(e2 - [hx, hy])) else (e2, e1)
    u = grip - head
    n = np.hypot(*u)
    if n < 1e-6:
        return None
    u /= n
    # Spieler blickt Richtung -u (vom Griff zum Loch); seine Rechte = (u_y, -u_x).
    # Damit ist lat>0 = rechts (visuell an putt1 kalibriert).
    p = np.array([u[1], -u[0]])
    pxm = res.pxm
    balls = []
    for bx, by, _dpx, dm in res.balls:
        v = np.array([bx - hx, by - hy], float)
        balls.append({"x": bx, "y": by, "dist": dm,
                      "long": float(v @ u) / pxm, "lat": float(v @ p) / pxm})
    if balls:
        ml = float(np.mean([b["long"] for b in balls]))
        mlat = float(np.mean([b["lat"] for b in balls]))
        sl = float(np.std([b["long"] for b in balls]))
        slat = float(np.std([b["lat"] for b in balls]))
    else:
        ml = mlat = sl = slat = 0.0
    good = sum(1 for b in balls if b["dist"] <= 1.0)
    bad = sum(1 for b in balls if 1.0 < b["dist"] <= 3.0)
    mist = sum(1 for b in balls if b["dist"] > 3.0)
    return {"u": u, "p": p, "grip": np.asarray(grip, float), "balls": balls,
            "mean_long": ml, "mean_lat": mlat, "std_long": sl, "std_lat": slat,
            "good": good, "bad": bad, "mist": mist}


def _bucket_color(dist):
    return (0, 200, 0) if dist <= 1.0 else (255, 150, 0) if dist <= 3.0 else (220, 0, 0)


def save_sample(res, image_path, save_dir):
    """Bild + Label-JSON ablegen - Trainingsdatensatz fuer ein spaeteres eigenes Modell.

    Speichert das Originalbild und die Labels (Loch, Putter, Baelle, Maszstab, Zaehlung)
    unter save_dir/<stem>.jpg / <stem>.json. Hinweis: User-Bilder nur mit Einwilligung
    speichern (Datenschutz).
    """
    import shutil
    os.makedirs(save_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(image_path))[0]
    dst_img = os.path.join(save_dir, stem + os.path.splitext(image_path)[1])
    if os.path.abspath(dst_img) != os.path.abspath(image_path):
        shutil.copy2(image_path, dst_img)
    label = {
        "image": os.path.basename(dst_img), "image_size": list(res.image_size),
        "hole": list(res.hole), "cup_diam_px": res.cup_diam_px,
        "putter_px": res.putter_px, "pxm": res.pxm, "scale_src": res.scale_src,
        "balls_on_green": [[bx, by] for bx, by, _, _ in res.balls],
        "balls_in_hole": res.balls_in_hole, "radius_m": res.radius_m,
        "within_radius": res.within, "detector": res.detector,
    }
    with open(os.path.join(save_dir, stem + ".json"), "w") as fh:
        json.dump(label, fh, indent=2)
    return os.path.join(save_dir, stem + ".json")


def _report(res):
    print(f"Detektor    : {res.detector}   Maszstab {res.pxm:.0f} px/m ({res.scale_src})")
    print(f"Loch        : ({res.hole[0]:.0f},{res.hole[1]:.0f})"
          + (f", Cup {res.cup_diam_px:.0f}px" if res.cup_diam_px else "")
          + (f"   Putter {res.putter_px:.0f}px" if res.putter_px else ""))
    print(f"Baelle      : {res.total} auf dem Gruen, {res.balls_in_hole} im Loch")

    st = putting_stats(res)
    if st is None:
        print("(keine Putterachse - keine Richtungsauswertung)")
        return
    print("\nPro Putt (entlang Schlaeger->Loch-Achse):")
    print(f"{'#':>2} {'Dist':>6}  {'laengs':>13}  {'quer':>11}  Wertung")
    order = sorted(st["balls"], key=lambda b: b["dist"])
    for i, b in enumerate(order, 1):
        lng = f"{abs(b['long'])*100:3.0f}cm {'kurz' if b['long'] >= 0 else 'lang'}"
        lat = f"{abs(b['lat'])*100:3.0f}cm {'re' if b['lat'] >= 0 else 'li'}"
        zone = "gut" if b["dist"] <= 1 else "schlecht" if b["dist"] <= 3 else "MIST"
        print(f"{i:>2} {b['dist']:5.2f}m  {lng:>13}  {lat:>11}  {zone}")

    ml, mlat = st["mean_long"], st["mean_lat"]
    print(f"\nZonen       : {st['good']} gut (<=1m) | {st['bad']} schlecht (1-3m) | {st['mist']} Mist (>3m)")
    print(f"Tendenz     : im Schnitt {abs(ml)*100:.0f} cm {'zu kurz' if ml >= 0 else 'zu lang'}"
          f", {abs(mlat)*100:.0f} cm {'rechts' if mlat >= 0 else 'links'}")
    print(f"Streuung    : laengs +-{st['std_long']*100:.0f} cm, quer +-{st['std_lat']*100:.0f} cm")
    sys_l = "kurz" if ml >= 0 else "lang"
    sys_s = "rechts" if mlat >= 0 else "links"
    strong = abs(ml) > 0.25 or abs(mlat) > 0.25
    print(f"Systematik  : {'tendenziell ' + sys_l + ' + ' + sys_s if strong else 'keine klare Schlagseite'}")


def main():
    p = argparse.ArgumentParser(description="Putting-Green-Analyse: Baelle zaehlen + Distanz zum Loch.")
    p.add_argument("image")
    p.add_argument("--detector", choices=["hybrid", "vlm", "manual", "cv"], default="hybrid")
    p.add_argument("--provider", choices=["mistral", "anthropic"], default="anthropic")
    p.add_argument("--model", default=None, help="VLM-Modell (sonst Provider-Default)")
    p.add_argument("--api-key", default=None)
    p.add_argument("--points", help="manual: JSON-Datei/String")
    p.add_argument("--putter-inch", type=int, default=34, choices=[33, 34, 35])
    p.add_argument("--radius", type=float, default=1.0)
    p.add_argument("--scale", type=int, default=3, help="Downscale fuers annotierte Bild")
    p.add_argument("--hole", help="cv: Loch 'X,Y'")
    p.add_argument("--putter", help="cv: Putter 'X1,Y1,X2,Y2'")
    p.add_argument("--cup-roi", help="cv: 'x0,y0,x1,y1'")
    p.add_argument("--putter-roi", help="cv: 'x0,y0,x1,y1'")
    p.add_argument("--out", default="putt_annotated.png", help="Ausgabe-PNG (leer = keins)")
    p.add_argument("--save-dir", help="Bild + Label-JSON hier ablegen (Trainingsdaten; nur mit Consent)")
    a = p.parse_args()

    def nums(s, t=float):
        return tuple(t(v) for v in s.split(",")) if s else None

    res = analyze(
        a.image, detector=a.detector, provider=a.provider, model=a.model, api_key=a.api_key,
        putter_inch=a.putter_inch, radius_m=a.radius, scale=a.scale,
        hole=nums(a.hole), putter=nums(a.putter),
        cup_roi=nums(a.cup_roi, int), putter_roi=nums(a.putter_roi, int), points=a.points,
    )
    _report(res)
    if a.out:
        size = annotate(res, a.out)
        print(f"\nAnnotiert gespeichert: {a.out}  ({size[0]}x{size[1]})")
    if a.save_dir:
        path = save_sample(res, a.image, a.save_dir)
        print(f"Trainingsdaten gespeichert: {path}")


if __name__ == "__main__":
    main()
