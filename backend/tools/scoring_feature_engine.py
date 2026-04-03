#!/usr/bin/env python3
from __future__ import annotations
"""Feature-based score engine for Seyd-Yaar model integration.

This module does not require the original pipeline internals; it provides a clean
set of score composition functions that can be called from scoring.py later.
"""
from dataclasses import dataclass
import json
from pathlib import Path
import numpy as np
try:
    from .model_feature_primitives import normalize_robust, smooth_field, front_fusion, mesoscale_metrics, edge_distance_score
except Exception:
    from model_feature_primitives import normalize_robust, smooth_field, front_fusion, mesoscale_metrics, edge_distance_score

Array = np.ndarray
EPS = 1e-6


def _first_array_like(*vals: Array | None) -> Array | None:
    for v in vals:
        if v is None:
            continue
        a = np.asarray(v, dtype=np.float32)
        if a.size:
            return a
    return None


def _zeros_like_any(*vals: Array | None) -> Array:
    a = _first_array_like(*vals)
    if a is None:
        raise ValueError("No reference array available")
    return np.zeros_like(a, dtype=np.float32)


def _ones_like_any(*vals: Array | None) -> Array:
    a = _first_array_like(*vals)
    if a is None:
        raise ValueError("No reference array available")
    return np.ones_like(a, dtype=np.float32)


def load_feature_config(path: str | Path | None = None) -> dict:
    cfg_path = Path(path) if path else Path(__file__).with_name('feature_flags_default.json')
    return json.loads(cfg_path.read_text(encoding='utf-8'))

@dataclass(frozen=True)
class ScoreComponents:
    base: Array
    front: Array
    mesoscale: Array
    vertical: Array
    ops: Array
    persistence: Array
    phab: Array
    pcatch: Array


def _clip01(x: Array) -> Array:
    return np.clip(np.asarray(x, dtype=np.float32), 0.0, 1.0).astype(np.float32)


def bell_score(x: Array, center: float, half_width: float) -> Array:
    x = np.asarray(x, dtype=np.float32)
    hw = max(float(half_width), EPS)
    out = 1.0 - np.minimum(np.abs(x - center) / hw, 1.0)
    return _clip01(out)


def logistic_score(x: Array, midpoint: float, slope: float, invert: bool=False) -> Array:
    z = (np.asarray(x, dtype=np.float32) - midpoint) / max(float(slope), EPS)
    y = 1.0 / (1.0 + np.exp(-z))
    if invert:
        y = 1.0 - y
    return _clip01(y)


def weighted_sum(parts: dict[str, Array], weights: dict[str, float]) -> Array:
    out = None
    sw = 0.0
    for k, arr in parts.items():
        if arr is None or k not in weights:
            continue
        w = float(weights[k])
        if w == 0:
            continue
        a = np.nan_to_num(np.asarray(arr, dtype=np.float32), nan=0.0)
        out = a * w if out is None else out + a * w
        sw += w
    if out is None or sw <= 0:
        raise ValueError('No weighted parts available')
    return _clip01(out / sw)


def product_blend(parts: dict[str, Array], floor: float=0.15) -> Array:
    vals = []
    for arr in parts.values():
        if arr is None:
            continue
        vals.append(np.clip(np.nan_to_num(np.asarray(arr, dtype=np.float32), nan=0.0), floor, 1.0))
    if not vals:
        raise ValueError('No product parts available')
    out = vals[0]
    for v in vals[1:]:
        out = out * v
    return _clip01(out)


def build_base_score(*, sst_score=None, chl_score=None, o2_score=None, sss_score=None, mld_score=None, weights=None) -> Array:
    weights = weights or {'sst':0.28,'chl':0.22,'o2':0.18,'sss':0.12,'mld':0.20}
    return weighted_sum({'sst':sst_score,'chl':chl_score,'o2':o2_score,'sss':sss_score,'mld':mld_score}, weights)


def build_front_score(front_fused: Array | None, persistence: Array|None=None, smooth: bool=True) -> Array:
    if front_fused is None:
        return _zeros_like_any(persistence) if persistence is not None else np.zeros((1,), dtype=np.float32)
    arr = normalize_robust(front_fused)
    if smooth:
        arr = smooth_field(arr, median_size=3, gaussian_sigma=0.8)
    if persistence is not None:
        arr = _clip01(0.75*arr + 0.25*normalize_robust(persistence))
    return arr


def build_mesoscale_score(*, eke=None, eddy_edge_score=None, strain_score=None, ow_score=None, weights=None) -> Array:
    weights = weights or {'eke':0.30,'edge':0.35,'strain':0.20,'ow':0.15}
    return weighted_sum({'eke':eke,'edge':eddy_edge_score,'strain':strain_score,'ow':ow_score}, weights)


def build_vertical_score(*, mld_score=None, o2_score=None, thermocline_score=None, weights=None) -> Array:
    weights = weights or {'mld':0.35,'o2':0.35,'thermo':0.30}
    return weighted_sum({'mld':mld_score,'o2':o2_score,'thermo':thermocline_score}, weights)


def build_ops_score(*, wave_height_score=None, wave_period_score=None, wave_direction_score=None, stokes_score=None, smoc_score=None, weights=None) -> Array:
    weights = weights or {'hs':0.35,'period':0.15,'dir':0.10,'stokes':0.20,'smoc':0.20}
    return weighted_sum({'hs':wave_height_score,'period':wave_period_score,'dir':wave_direction_score,'stokes':stokes_score,'smoc':smoc_score}, weights)


def compose_scores(*, base: Array, front: Array, mesoscale: Array, vertical: Array, ops: Array|None=None, persistence: Array|None=None) -> ScoreComponents:
    phab = product_blend({'base':base, 'front':front, 'mesoscale':mesoscale, 'vertical':vertical}, floor=0.20)
    if persistence is None:
        persistence = np.ones_like(phab, dtype=np.float32)
    if ops is None:
        ops = np.ones_like(phab, dtype=np.float32)
    pcatch = _clip01(phab * np.clip(0.65 + 0.35*np.nan_to_num(persistence, nan=0.0), 0.15, 1.0) * np.clip(0.55 + 0.45*np.nan_to_num(ops, nan=0.0), 0.15, 1.0))
    return ScoreComponents(base=_clip01(base), front=_clip01(front), mesoscale=_clip01(mesoscale), vertical=_clip01(vertical), ops=_clip01(ops), persistence=_clip01(persistence), phab=_clip01(phab), pcatch=_clip01(pcatch))



def build_from_raw_fields_with_config(raw: dict[str, Array], cfg: dict | None = None) -> ScoreComponents:
    cfg = cfg or load_feature_config()
    wcfg = cfg.get('weights', {})
    features = cfg.get('features', {})
    front_weights = wcfg.get('front_fusion')
    raw2 = dict(raw)
    if not features.get('o2', True): raw2['o2'] = None
    if not features.get('sss', True): raw2['sss'] = None
    if not features.get('mld', True): raw2['mld'] = None
    if not features.get('thermocline_proxy', True): raw2['thermocline'] = None
    if not features.get('ops_layer', True):
        for k in ('wave_height','wave_period','wave_direction','stokes','smoc','wave_height_score','wave_period_score','wave_direction_score','stokes_score','smoc_score'):
            raw2[k] = None
    front_arr = raw2.get('front_fused')
    if front_arr is None and features.get('front_fusion', True) and all(raw2.get(k) is not None for k in ('sst', 'chl', 'sla')):
        front_arr = front_fusion(raw2['sst'], raw2['chl'], raw2['sla'], weights=front_weights, smooth=True).fused
    raw2['front_fused'] = front_arr
    comps = build_from_raw_fields(raw2)
    if not features.get('pcatch_enabled', True):
        comps = ScoreComponents(base=comps.base, front=comps.front, mesoscale=comps.mesoscale, vertical=comps.vertical, ops=comps.ops, persistence=comps.persistence, phab=comps.phab, pcatch=comps.phab)
    return comps


def feature_availability_report(raw: dict[str, Array | None]) -> dict:
    out = {}
    for k, v in raw.items():
        if v is None:
            out[k] = {'present': False, 'shape': None}
            continue
        a = np.asarray(v)
        out[k] = {
            'present': True,
            'shape': list(a.shape),
            'finite_ratio': float(np.isfinite(a).mean()) if a.size else 0.0,
        }
    return out


def robust_score(x: Array | None, invert: bool = False) -> Array | None:
    if x is None:
        return None
    s = normalize_robust(np.asarray(x, dtype=np.float32))
    return _clip01(1.0 - s) if invert else _clip01(s)


def distance_to_edge_score(distance_km: Array | None, scale_km: float = 50.0) -> Array | None:
    if distance_km is None:
        return None
    return edge_distance_score(np.asarray(distance_km, dtype=np.float32), scale_km=scale_km)


def build_from_raw_fields(raw: dict[str, Array]) -> ScoreComponents:
    raw = dict(raw)
    ref = _first_array_like(*raw.values())
    if ref is None:
        raise ValueError('No array-like fields provided')

    sst_score = raw.get('sst_score')
    if sst_score is None and raw.get('sst') is not None:
        sst_score = robust_score(raw.get('sst'))
    chl_score = raw.get('chl_score')
    if chl_score is None and raw.get('chl') is not None:
        chl_score = robust_score(raw.get('chl'))
    o2_score = raw.get('o2_score')
    if o2_score is None and raw.get('o2') is not None:
        o2_score = robust_score(raw.get('o2'))
    sss_score = raw.get('sss_score')
    if sss_score is None and raw.get('sss') is not None:
        sss_score = robust_score(raw.get('sss'))
    mld_score = raw.get('mld_score')
    if mld_score is None and raw.get('mld') is not None:
        mld_score = robust_score(raw.get('mld'))
    thermocline_score = raw.get('thermocline_score')
    if thermocline_score is None and raw.get('thermocline') is not None:
        thermocline_score = robust_score(raw.get('thermocline'), invert=True)

    front_arr = raw.get('front_fused')
    if front_arr is None and all(raw.get(k) is not None for k in ('sst', 'chl', 'sla')):
        front_arr = front_fusion(raw['sst'], raw['chl'], raw['sla']).fused
    front_score = build_front_score(front_arr, persistence=raw.get('front_persistence')) if front_arr is not None else _zeros_like_any(ref)

    eke = raw.get('eke')
    vort = raw.get('vorticity')
    strain = raw.get('strain')
    ow = raw.get('ow')
    if ow is None:
        ow = raw.get('okubo_weiss')
    if (eke is None or strain is None or ow is None) and raw.get('u') is not None and raw.get('v') is not None:
        mm = mesoscale_metrics(raw['u'], raw['v'])
        eke = mm.eke if eke is None else eke
        vort = mm.vorticity if vort is None else vort
        strain = mm.strain if strain is None else strain
        ow = mm.okubo_weiss if ow is None else ow
    edge_score = raw.get('eddy_edge_score')
    if edge_score is None and raw.get('edge_distance_km') is not None:
        edge_score = distance_to_edge_score(raw.get('edge_distance_km'))
    mesoscale_score = build_mesoscale_score(
        eke=robust_score(eke),
        eddy_edge_score=edge_score,
        strain_score=robust_score(strain),
        ow_score=robust_score(ow, invert=True),
    ) if any(v is not None for v in (eke, edge_score, strain, ow)) else _ones_like_any(ref)

    base_score = build_base_score(
        sst_score=sst_score,
        chl_score=chl_score,
        o2_score=o2_score,
        sss_score=sss_score,
        mld_score=mld_score,
    ) if any(v is not None for v in (sst_score, chl_score, o2_score, sss_score, mld_score)) else _ones_like_any(ref)

    vertical_score = build_vertical_score(
        mld_score=mld_score,
        o2_score=o2_score,
        thermocline_score=thermocline_score,
    ) if any(v is not None for v in (mld_score, o2_score, thermocline_score)) else _ones_like_any(ref)

    ops_score = build_ops_score(
        wave_height_score=(raw.get('wave_height_score') if raw.get('wave_height_score') is not None else robust_score(raw.get('wave_height'), invert=True)),
        wave_period_score=(raw.get('wave_period_score') if raw.get('wave_period_score') is not None else robust_score(raw.get('wave_period'))),
        wave_direction_score=(raw.get('wave_direction_score') if raw.get('wave_direction_score') is not None else _ones_like_any(ref)),
        stokes_score=(raw.get('stokes_score') if raw.get('stokes_score') is not None else robust_score(raw.get('stokes'), invert=True)),
        smoc_score=(raw.get('smoc_score') if raw.get('smoc_score') is not None else robust_score(raw.get('smoc'), invert=True)),
    ) if any(raw.get(k) is not None for k in ('wave_height','wave_period','wave_direction','stokes','smoc','wave_height_score','wave_period_score','wave_direction_score','stokes_score','smoc_score')) else _ones_like_any(ref)

    persistence_score = raw.get('temporal_persistence')
    if persistence_score is not None:
        persistence_score = robust_score(persistence_score)
    else:
        persistence_score = _ones_like_any(ref)

    return compose_scores(
        base=base_score,
        front=front_score,
        mesoscale=mesoscale_score,
        vertical=vertical_score,
        ops=ops_score,
        persistence=persistence_score,
    )


def component_report(components: ScoreComponents) -> dict:
    def stats(arr: Array) -> dict:
        a = np.asarray(arr, dtype=np.float32)
        finite = np.isfinite(a)
        if not finite.any():
            return {'mean': None, 'p90': None, 'min': None, 'max': None}
        aa = a[finite]
        return {
            'mean': float(np.mean(aa)),
            'p90': float(np.percentile(aa, 90)),
            'min': float(np.min(aa)),
            'max': float(np.max(aa)),
        }
    return {
        'base': stats(components.base),
        'front': stats(components.front),
        'mesoscale': stats(components.mesoscale),
        'vertical': stats(components.vertical),
        'ops': stats(components.ops),
        'persistence': stats(components.persistence),
        'phab': stats(components.phab),
        'pcatch': stats(components.pcatch),
    }
