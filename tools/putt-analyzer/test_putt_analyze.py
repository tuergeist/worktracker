"""
Tests fuer putt_analyze. Laufen ohne API-Key (Geometrie-Kern, CV-Detektor,
manual-Detektor, Blob-Detektion gegen das daneben liegende putt1.jpg).

Der Live-Hybrid-Test (Anthropic/Opus) ist opt-in via RUN_VLM_TESTS=1, weil er
einen API-Call kostet.

Lauf:  venv/bin/python -m pytest -v
"""
import json
import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import putt_analyze as pa

IMG = Path(__file__).with_name("putt1.jpg")


# ---------- Geometrie-Kern (reine Funktion, kein Bild/Key) ----------
def test_geometry_distances_and_within():
    res = pa.geometry((4000, 2250), hole=(1000, 1000),
                      balls_xy=[(1000, 1500), (1000, 2100)],   # 500px=0.5m, 1100px=1.1m
                      pxm=1000, scale_src="putter", radius_m=1.0)
    assert res.total == 2
    assert res.within == 1
    assert [round(m, 2) for *_, m in res.balls] == [0.50, 1.10]


def test_geometry_scale_from_putter():
    res = pa.geometry((10, 10), (0, 0), [], pxm=1064 / pa.PUTTER_INCH[34],
                      scale_src="putter", radius_m=1.0)
    assert 1230 <= res.pxm <= 1232                 # 1064px @34" -> ~1231 px/m


def test_geometry_sorted_by_distance():
    res = pa.geometry((10, 10), (0, 0), [(300, 0), (100, 0), (200, 0)],
                      pxm=1000, scale_src="putter")
    xs = [bx for bx, *_ in res.balls]
    assert xs == [100, 200, 300]


# ---------- Richtungsauswertung (kurz/lang, links/rechts) ----------
def _res_with_putter(hole, balls, grip, pxm=1000):
    res = pa.geometry((4000, 2250), hole, balls, pxm=pxm, scale_src="putter")
    res._endpoints = (np.array([hole[0], hole[1]]), np.array(grip, float))  # head@Loch, Griff
    return res


def test_putting_stats_short_and_right():
    # Griff rechts (+x) => Baelle kamen von rechts. Ball rechts(+x) & oben(-y).
    res = _res_with_putter((0, 0), [(300, -100)], grip=(1000, 0))
    b = pa.putting_stats(res)["balls"][0]
    assert b["long"] > 0          # Griffseite -> zu kurz
    assert b["lat"] > 0           # oben bei Griff-rechts -> Spieler-rechts


def test_putting_stats_long_and_left():
    # Ball hinter dem Loch (links, -x) & unten(+y) bei Griff rechts
    res = _res_with_putter((0, 0), [(-300, 100)], grip=(1000, 0))
    b = pa.putting_stats(res)["balls"][0]
    assert b["long"] < 0          # hinter dem Loch -> zu lang
    assert b["lat"] < 0           # unten bei Griff-rechts -> Spieler-links


def test_putting_stats_orientation_independent():
    # Gleiche physische Lage, Putter um 180deg gedreht (Griff links) -> gleiche Wertung
    a = pa.putting_stats(_res_with_putter((0, 0), [(300, -100)], grip=(1000, 0)))["balls"][0]
    b = pa.putting_stats(_res_with_putter((0, 0), [(-300, 100)], grip=(-1000, 0)))["balls"][0]
    assert (a["long"] > 0) == (b["long"] > 0)
    assert (a["lat"] > 0) == (b["lat"] > 0)


def test_putting_stats_zones():
    res = _res_with_putter((0, 0), [(500, 0), (2000, 0), (3500, 0)], grip=(1000, 0))
    st = pa.putting_stats(res)
    assert (st["good"], st["bad"], st["mist"]) == (1, 1, 1)   # 0.5m / 2m / 3.5m


# ---------- CV-Detektor (putt1, achsparallel, ROI-gebunden) ----------
@pytest.fixture(scope="module")
def have_img():
    if not IMG.exists():
        pytest.skip("Referenzbild putt1.jpg fehlt")


def test_cv_detector_putt1(have_img):
    res = pa.analyze(str(IMG), detector="cv")
    assert 8 <= res.total <= 12                    # ~10 Baelle (CV-Tuning +-)
    cx, cy = res.hole
    assert 1500 <= cx <= 1720 and 1180 <= cy <= 1300
    assert 1000 <= res.putter_px <= 1150
    assert 1150 <= res.pxm <= 1320                 # Putter-Maszstab ~1239 px/m
    assert res.scale_src == "putter"


def test_white_blobs_finds_balls(have_img):
    blobs = pa.white_blobs(Image.open(str(IMG)).convert("RGB"))
    assert 9 <= len(blobs) <= 12


# ---------- manual-Detektor (Punkte aus JSON, kein Modell) ----------
def test_manual_detector(have_img):
    pts = {"hole": [1632, 1245], "putter": [[1715, 1244], [2785, 1274]],
           "balls": [[1695, 1116], [2513, 1891]], "balls_in_hole": 0}
    res = pa.analyze(str(IMG), detector="manual", points=json.dumps(pts))
    assert res.total == 2
    assert res.scale_src == "putter"
    assert res.within == 2                         # 0.07m und ~0.9m -> beide < 1m


def test_manual_scale_from_hole_when_no_putter(have_img):
    pts = {"hole": [1632, 1245], "cup_diam": 133, "balls": [], "balls_in_hole": 3}
    res = pa.analyze(str(IMG), detector="manual", points=json.dumps(pts))
    assert res.scale_src == "hole"
    assert abs(res.pxm - 133 / pa.HOLE_DIAM_M) < 1
    assert res.balls_in_hole == 3


# ---------- Live-Hybrid (opt-in, kostet einen API-Call) ----------
@pytest.mark.skipif(not (os.environ.get("RUN_VLM_TESTS") and pa._env("ANTHROPIC_API_KEY")),
                    reason="RUN_VLM_TESTS=1 + ANTHROPIC_API_KEY noetig")
def test_hybrid_opus_putt1():
    res = pa.analyze(str(IMG), detector="hybrid", provider="anthropic")
    assert 8 <= res.total <= 12
    assert res.scale_src in ("putter", "hole")
    cx, cy = res.hole
    assert 1500 <= cx <= 1720


# ---------- VLM-Ausgabe-Sanitisierung (null-Koordinaten, kein echter Call) ----------
# Das VLM gibt bei untauglichen Fotos null-Koordinaten zurueck. detect_vlm_rough
# multipliziert jeden Punkt mit dem Downscale-Faktor; ungefiltert crashte das mit
# "unsupported operand type(s) for *: 'NoneType' and 'float'". _vlm_call wird
# gemockt, damit kein API-Key/Netz noetig ist.
def _mock_vlm(monkeypatch, payload):
    monkeypatch.setattr(pa, "_vlm_call", lambda *a, **k: json.dumps(payload))


def test_vlm_rough_filters_null_and_malformed_balls(monkeypatch):
    _mock_vlm(monkeypatch, {
        "hole": [100, 120],
        "putter": [[100, 120], [100, 300]],
        "balls": [[200, 200], [None, 50], [300, None], "x", [], [310, 320]],
        "balls_in_hole": 0,
    })
    rough = pa.detect_vlm_rough(str(IMG), provider="anthropic", api_key="test")
    assert len(rough["balls"]) == 2                 # nur die zwei gueltigen Paare
    assert rough["putter"] is not None
    assert all(isinstance(c, float) for b in rough["balls"] for c in b)


def test_vlm_rough_null_putter_coord_drops_putter(monkeypatch):
    _mock_vlm(monkeypatch, {
        "hole": [100, 120],
        "putter": [[100, 120], [None, 300]],        # ein Endpunkt unbrauchbar
        "balls": [],
    })
    rough = pa.detect_vlm_rough(str(IMG), provider="anthropic", api_key="test")
    assert rough["putter"] is None                  # kein halber Putter
    assert rough["hole"] is not None


def test_vlm_rough_missing_hole_raises_clean(monkeypatch):
    # Regression: untaugliches Bild -> hole=null. Frueher NoneType*float-Crash,
    # jetzt klare, dem User zumutbare Meldung.
    _mock_vlm(monkeypatch, {"hole": [None, None], "putter": None, "balls": []})
    with pytest.raises(ValueError, match="Kein Loch"):
        pa.detect_vlm_rough(str(IMG), provider="anthropic", api_key="test")
