#!/usr/bin/env python3
"""Lightweight, integration-ready feature engineering primitives for Seyd-Yaar.

These functions are intentionally backend-agnostic so they can be dropped into the
existing pipeline once the full core backend is available.

Focus areas:
- nearest-surface depth selection
- 3-day lagged productivity helpers
- edge-preserving smoothing for front/eddy fields
- mesoscale metrics (EKE, vorticity, strain, Okubo-Weiss)
- thermocline proxies
- temporal persistence/stability/duration summaries
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np

try:
    from scipy.ndimage import gaussian_filter, median_filter
except Exception:  # pragma: no cover - scipy optional in some installs
    gaussian_filter = None
    median_filter = None

Array = np.ndarray


@dataclass(frozen=True)
class TemporalSummary:
    mean: Array
    p90: Array
    persist: Array
    stability: Array
    duration: Array
    peak_time_index: Array
    first_good_index: Array
    last_good_index: Array
    stable_hotspot: Array


@dataclass(frozen=True)
class MesoscaleMetrics:
    eke: Array
    vorticity: Array
    strain: Array
    okubo_weiss: Array


@dataclass(frozen=True)
class FrontFusion:
    sst_grad: Array
    chl_grad: Array
    sla_grad: Array
    fused: Array


EPS = 1e-6


def nearest_surface_index(depths: Array) -> int:
    """Return the index of the depth closest to the surface (absolute min depth)."""
    d = np.asarray(depths, dtype=np.float32)
    if d.ndim != 1 or d.size == 0:
        raise ValueError("depths must be a non-empty 1D array")
    return int(np.argmin(np.abs(d)))


def select_nearest_surface(data: Array, depths: Array, axis: int = 0) -> Array:
    """Select the nearest-surface slice along a depth axis."""
    idx = nearest_surface_index(depths)
    return np.take(data, idx, axis=axis)


def rolling_mean_last_window(stack: Array, window: int) -> Array:
    """Mean over the last `window` time steps, ignoring NaN values."""
    arr = np.asarray(stack, dtype=np.float32)
    if arr.ndim < 1 or window < 1:
        raise ValueError("stack must have time axis and window >= 1")
    return np.nanmean(arr[-window:], axis=0).astype(np.float32)


def rolling_p90_last_window(stack: Array, window: int) -> Array:
    arr = np.asarray(stack, dtype=np.float32)
    return np.nanpercentile(arr[-window:], 90, axis=0).astype(np.float32)


def lagged_anomaly_last_window(stack: Array, window: int, baseline: Optional[Array] = None) -> Array:
    """Mean over the last window minus a baseline mean (or overall mean)."""
    arr = np.asarray(stack, dtype=np.float32)
    recent = rolling_mean_last_window(arr, window)
    base = np.asarray(baseline, dtype=np.float32) if baseline is not None else np.nanmean(arr, axis=0).astype(np.float32)
    return (recent - base).astype(np.float32)


def normalize_duration_hours(duration_slots: Array, step_hours: float, total_slots: Optional[int] = None) -> Array:
    dur = np.asarray(duration_slots, dtype=np.float32) * float(step_hours)
    if total_slots and total_slots > 0:
        return np.clip(dur / float(total_slots * step_hours), 0.0, 1.0).astype(np.float32)
    mx = np.nanmax(dur) if np.size(dur) else 0.0
    if not np.isfinite(mx) or mx <= EPS:
        return np.zeros_like(dur, dtype=np.float32)
    return np.clip(dur / mx, 0.0, 1.0).astype(np.float32)


def persistence_weighted_front(front_score: Array, persistence: Array, alpha: float = 0.25) -> Array:
    f = np.asarray(front_score, dtype=np.float32)
    p = normalize_robust(np.asarray(persistence, dtype=np.float32))
    return np.clip((1.0 - alpha) * f + alpha * p, 0.0, 1.0).astype(np.float32)


def edge_distance_score(distance_km: Array, scale_km: float = 50.0) -> Array:
    d = np.asarray(distance_km, dtype=np.float32)
    return np.clip(np.exp(-np.maximum(d, 0.0) / max(scale_km, EPS)), 0.0, 1.0).astype(np.float32)


def safe_log_chl(chl: Array, floor: float = 1e-4) -> Array:
    return np.log10(np.maximum(np.asarray(chl, dtype=np.float32), floor))


def smooth_field(field: Array, median_size: int = 3, gaussian_sigma: float = 1.0) -> Array:
    """Edge-preserving-ish smoothing: median first, then light gaussian.

    If scipy is unavailable, falls back to the original field.
    """
    arr = np.asarray(field, dtype=np.float32)
    out = arr.copy()
    if median_filter is not None and median_size and median_size > 1:
        out = median_filter(out, size=median_size, mode="nearest")
    if gaussian_filter is not None and gaussian_sigma and gaussian_sigma > 0:
        out = gaussian_filter(out, sigma=gaussian_sigma, mode="nearest")
    return out.astype(np.float32)


def gradient_magnitude(field: Array, dx: float = 1.0, dy: float = 1.0) -> Array:
    fy, fx = np.gradient(np.asarray(field, dtype=np.float32), dy, dx)
    return np.hypot(fx, fy).astype(np.float32)


def normalize_robust(field: Array, qlo: float = 5.0, qhi: float = 95.0) -> Array:
    arr = np.asarray(field, dtype=np.float32)
    finite = np.isfinite(arr)
    if not finite.any():
        return np.full_like(arr, np.nan, dtype=np.float32)
    lo, hi = np.nanpercentile(arr, [qlo, qhi])
    if hi <= lo + EPS:
        return np.clip(arr, 0.0, 1.0).astype(np.float32)
    out = (arr - lo) / (hi - lo)
    return np.clip(out, 0.0, 1.0).astype(np.float32)


def front_fusion(
    sst: Array,
    chl: Array,
    sla: Array,
    dx: float = 1.0,
    dy: float = 1.0,
    weights: Optional[dict[str, float]] = None,
    smooth: bool = True,
) -> FrontFusion:
    """Build a lightweight multivariate front score from SST/logCHL/SLA gradients."""
    w = {"sst": 0.40, "chl": 0.35, "sla": 0.25}
    if weights:
        w.update(weights)
    sst_use = smooth_field(sst) if smooth else np.asarray(sst, dtype=np.float32)
    chl_use = smooth_field(safe_log_chl(chl)) if smooth else safe_log_chl(chl)
    sla_use = smooth_field(sla) if smooth else np.asarray(sla, dtype=np.float32)

    sst_g = normalize_robust(gradient_magnitude(sst_use, dx=dx, dy=dy))
    chl_g = normalize_robust(gradient_magnitude(chl_use, dx=dx, dy=dy))
    sla_g = normalize_robust(gradient_magnitude(sla_use, dx=dx, dy=dy))
    fused = np.clip(w["sst"] * sst_g + w["chl"] * chl_g + w["sla"] * sla_g, 0.0, 1.0).astype(np.float32)
    return FrontFusion(sst_grad=sst_g, chl_grad=chl_g, sla_grad=sla_g, fused=fused)


def mesoscale_metrics(u: Array, v: Array, dx: float = 1.0, dy: float = 1.0) -> MesoscaleMetrics:
    """Compute light mesoscale metrics from surface currents."""
    u = np.asarray(u, dtype=np.float32)
    v = np.asarray(v, dtype=np.float32)
    du_dy, du_dx = np.gradient(u, dy, dx)
    dv_dy, dv_dx = np.gradient(v, dy, dx)
    vort = dv_dx - du_dy
    sn = du_dx - dv_dy
    ss = dv_dx + du_dy
    strain = np.sqrt(sn * sn + ss * ss)
    ow = strain * strain - vort * vort
    eke = 0.5 * (u * u + v * v)
    return MesoscaleMetrics(
        eke=eke.astype(np.float32),
        vorticity=vort.astype(np.float32),
        strain=strain.astype(np.float32),
        okubo_weiss=ow.astype(np.float32),
    )


def thermocline_proxy_from_profile(temp_profile: Array, depths: Array, axis: int = 0) -> Array:
    """Return depth of strongest vertical temperature gradient as a thermocline proxy."""
    t = np.asarray(temp_profile, dtype=np.float32)
    d = np.asarray(depths, dtype=np.float32)
    if d.ndim != 1 or d.size < 2:
        raise ValueError("depths must be a 1D array with >=2 values")
    # move depth axis to front
    if axis != 0:
        t = np.moveaxis(t, axis, 0)
    grad = np.abs(np.gradient(t, d, axis=0))
    max_idx = np.nanargmax(grad, axis=0)
    return d[max_idx].astype(np.float32)


def z20_proxy_from_profile(temp_profile: Array, depths: Array, axis: int = 0, isotherm: float = 20.0) -> Array:
    """Approximate Z20 depth from a temperature profile."""
    t = np.asarray(temp_profile, dtype=np.float32)
    d = np.asarray(depths, dtype=np.float32)
    if axis != 0:
        t = np.moveaxis(t, axis, 0)
    mask = t <= isotherm
    first_idx = mask.argmax(axis=0)
    out = d[first_idx].astype(np.float32)
    no_cross = ~mask.any(axis=0)
    out[no_cross] = np.nan
    return out


def _longest_run_per_cell(good_2d: Array) -> Array:
    best = np.zeros(good_2d.shape[1], dtype=np.uint16)
    cur = np.zeros(good_2d.shape[1], dtype=np.uint16)
    for row in good_2d:
        cur = np.where(row, cur + 1, 0)
        best = np.maximum(best, cur)
    return best


def temporal_summary(stack: Array, threshold: float = 0.70) -> TemporalSummary:
    """Compute per-cell temporal summary from a [T, ...] score stack."""
    arr = np.asarray(stack, dtype=np.float32)
    if arr.ndim < 2:
        raise ValueError("stack must be at least 2D with a leading time axis")
    spatial_shape = arr.shape[1:]
    flat = arr.reshape(arr.shape[0], -1)
    valid = np.isfinite(flat)
    valid_count = valid.sum(axis=0).astype(np.float32)
    mean = np.nanmean(flat, axis=0).astype(np.float32)
    p90 = np.nanpercentile(flat, 90, axis=0).astype(np.float32)
    std = np.nanstd(flat, axis=0).astype(np.float32)
    good = valid & (flat >= threshold)
    persist = np.where(valid_count > 0, good.sum(axis=0) / valid_count, np.nan).astype(np.float32)
    stability = np.clip(1.0 / (1.0 + std / np.maximum(mean, EPS)), 0.0, 1.0).astype(np.float32)
    duration = _longest_run_per_cell(good).astype(np.uint8)
    duration_norm = duration.astype(np.float32) / max(arr.shape[0], 1)
    peak_idx = np.where(valid, flat, -np.inf).argmax(axis=0).astype(np.uint16)
    any_good = good.any(axis=0)
    first_good = np.full(flat.shape[1], 65535, dtype=np.uint16)
    last_good = np.full(flat.shape[1], 65535, dtype=np.uint16)
    first_good[any_good] = good.argmax(axis=0)[any_good].astype(np.uint16)
    rev = np.flip(good, axis=0)
    last_good[any_good] = (good.shape[0] - 1 - rev.argmax(axis=0))[any_good].astype(np.uint16)
    stable = np.clip(
        0.40 * np.nan_to_num(mean, nan=0.0)
        + 0.20 * np.nan_to_num(p90, nan=0.0)
        + 0.20 * np.nan_to_num(persist, nan=0.0)
        + 0.10 * np.nan_to_num(stability, nan=0.0)
        + 0.10 * duration_norm,
        0.0,
        1.0,
    ).astype(np.float32)

    def reshape(x: Array, dtype=None) -> Array:
        y = x.reshape(spatial_shape)
        return y.astype(dtype or y.dtype, copy=False)

    return TemporalSummary(
        mean=reshape(mean, np.float32),
        p90=reshape(p90, np.float32),
        persist=reshape(persist, np.float32),
        stability=reshape(stability, np.float32),
        duration=reshape(duration, np.uint8),
        peak_time_index=reshape(peak_idx, np.uint16),
        first_good_index=reshape(first_good, np.uint16),
        last_good_index=reshape(last_good, np.uint16),
        stable_hotspot=reshape(stable, np.float32),
    )
