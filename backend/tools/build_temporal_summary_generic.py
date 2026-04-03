#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
from pyproj import CRS, Transformer

try:
    from .model_feature_primitives import temporal_summary
except Exception:
    from model_feature_primitives import temporal_summary

TIME_FMT = "%Y%m%d_%H%MZ"


@dataclass(frozen=True)
class SummaryBuildResult:
    prefix: str
    end_time_id: str
    out_dir: Path
    summary_paths: dict
    summary_assets: dict


def parse_time_id(tid: str) -> datetime:
    return datetime.strptime(tid, TIME_FMT).replace(tzinfo=timezone.utc)


def write_array(path: Path, arr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    arr.tofile(path)


def infer_time_ids(meta: dict) -> list[str]:
    tids = meta.get("time_ids") or []
    if tids:
        return [str(x) for x in tids]
    times = meta.get("times") or []
    out = []
    for iso in times:
        iso = str(iso)
        out.append(iso.replace("-", "").replace(":", "").replace("T", "_").replace("Z", "") + "Z")
    return out


def select_window_indices(time_ids: list[str], end_idx: int, window_hours: int) -> list[int]:
    end_dt = parse_time_id(time_ids[end_idx])
    return [
        i for i in range(end_idx + 1)
        if 0 <= (end_dt - parse_time_id(time_ids[i])).total_seconds() / 3600.0 < window_hours + 1e-9
    ]


def metric_prefix(per_time_key: str) -> str:
    return per_time_key.replace(' ', '_').replace('/', '_').lower()


def infer_bounds(meta: dict):
    grid = meta.get('grid') or {}
    return (float(grid.get('lon_min')), float(grid.get('lon_max')), float(grid.get('lat_min')), float(grid.get('lat_max')))


def infer_latest_root(meta_path: Path) -> Path:
    parts = list(meta_path.parts)
    if 'latest' in parts:
        idx = parts.index('latest')
        return Path(*parts[:idx + 1])
    return meta_path.parent if len(meta_path.parents) < 5 else meta_path.parents[4]


def resolve_per_time_path(meta_path: Path, rel: str) -> Path:
    rel = str(rel).lstrip('./')
    latest_root = infer_latest_root(meta_path)
    species_dir = meta_path.parent
    run_root = species_dir.parents[3]
    rel_path = Path(rel)
    if rel_path.parts and rel_path.parts[0] == 'runs':
        return latest_root / rel_path
    return run_root / rel_path


def cell_center(i: int, j: int, width: int, height: int, bounds):
    lon_min, lon_max, lat_min, lat_max = bounds
    dx = (lon_max - lon_min) / max(1, width - 1)
    dy = (lat_max - lat_min) / max(1, height - 1)
    return lon_min + i * dx, lat_max - j * dy


_TRANSFORMER_CACHE: dict[int, Transformer] = {}


def utm_transformer_for_lonlat(lon: float, lat: float):
    zone = int((lon + 180) // 6) + 1
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    tr = _TRANSFORMER_CACHE.get(epsg)
    if tr is None:
        tr = Transformer.from_crs(CRS.from_epsg(4326), CRS.from_epsg(epsg), always_xy=True)
        _TRANSFORMER_CACHE[epsg] = tr
    return zone, tr


def export_top_stable_points(
    out_dir: Path,
    prefix: str,
    suffix: str,
    stable: np.ndarray,
    persist: np.ndarray,
    stability: np.ndarray,
    duration: np.ndarray,
    peak_idx: np.ndarray,
    first_idx: np.ndarray,
    last_idx: np.ndarray,
    bounds,
    end_tid: str,
    time_ids: list[str],
    top_n: int = 20,
    step_hours: int = 12,
):
    H, W = stable.shape
    flat = stable.reshape(-1)
    finite = np.isfinite(flat)
    if not finite.any():
        return {}
    idx = np.where(finite)[0]
    vals = flat[idx]
    order = idx[np.argsort(vals)[::-1][:top_n]]
    points = []
    features = []
    for rank, k in enumerate(order, start=1):
        j, i = divmod(int(k), W)
        lon, lat = cell_center(i, j, W, H, bounds)
        zone, tr = utm_transformer_for_lonlat(lon, lat)
        easting, northing = tr.transform(lon, lat)
        pidx = int(peak_idx[j, i])
        fidx = int(first_idx[j, i])
        lidx = int(last_idx[j, i])
        peak_tid = time_ids[pidx] if 0 <= pidx < len(time_ids) else None
        first_tid = time_ids[fidx] if 0 <= fidx < len(time_ids) and fidx != 65535 else None
        last_tid = time_ids[lidx] if 0 <= lidx < len(time_ids) and lidx != 65535 else None
        item = {
            'rank': rank,
            'i': i,
            'j': j,
            'lon': float(lon),
            'lat': float(lat),
            'utm_zone': zone,
            'easting': float(easting),
            'northing': float(northing),
            'stable_hotspot': float(stable[j, i]),
            'persistence': float(persist[j, i]),
            'stability': float(stability[j, i]),
            'duration_slots': int(duration[j, i]),
            'duration_hours': int(duration[j, i]) * int(step_hours),
            'peak_time_index': pidx,
            'peak_time_id': peak_tid,
            'first_good_index': None if fidx == 65535 else fidx,
            'first_good_time_id': first_tid,
            'last_good_index': None if lidx == 65535 else lidx,
            'last_good_time_id': last_tid,
            'end_time_id': end_tid,
        }
        points.append(item)
        features.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat]}, 'properties': item})

    json_path = out_dir / f'{prefix}_top_stable_points_{suffix}.json'
    geojson_path = out_dir / f'{prefix}_top_stable_points_{suffix}.geojson'
    csv_path = out_dir / f'{prefix}_top_stable_points_{suffix}.csv'
    json_path.write_text(json.dumps({'end_time_id': end_tid, 'points': points}, ensure_ascii=False, indent=2), encoding='utf-8')
    geojson_path.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, indent=2), encoding='utf-8')
    with csv_path.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(points[0].keys()))
        w.writeheader()
        w.writerows(points)
    return {'json': json_path.name, 'geojson': geojson_path.name, 'csv': csv_path.name}


def load_stack(meta_path: Path, time_ids: Iterable[str], tpl: str, width: int, height: int) -> dict[str, np.ndarray]:
    expected = width * height
    out: dict[str, np.ndarray] = {}
    for tid in time_ids:
        rel = tpl.replace('{time_id}', tid).replace('{time}', tid)
        path = resolve_per_time_path(meta_path, rel)
        arr = np.fromfile(path, dtype=np.float32)
        if arr.size != expected:
            raise ValueError(f'Unexpected raster size for {path}: got {arr.size}, expected {expected}')
        out[tid] = arr.reshape(height, width)
    return out


def update_meta(meta_path: Path, per_time_key: str, window_hours: int, step_hours: int, threshold: float, latest_assets: dict | None = None) -> None:
    suffix = f'{window_hours}h'
    prefix = metric_prefix(per_time_key)
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    meta.setdefault('summary_config', {})
    meta['summary_config'][prefix] = {
        'window_hours': window_hours,
        'step_hours': step_hours,
        'threshold': threshold,
        'label': f'{per_time_key} temporal summaries ({window_hours}h)',
        'prefix': prefix,
        'latest_end_time_id': None,
    }
    meta.setdefault('summary_paths', {})
    meta['summary_paths'][prefix] = {
        'mean': f'summary/by_end_time/{{time_id}}/{prefix}_mean_{suffix}_f32.bin',
        'p90': f'summary/by_end_time/{{time_id}}/{prefix}_p90_{suffix}_f32.bin',
        'persist': f'summary/by_end_time/{{time_id}}/{prefix}_persist_{suffix}_f32.bin',
        'stability': f'summary/by_end_time/{{time_id}}/{prefix}_stability_{suffix}_f32.bin',
        'duration': f'summary/by_end_time/{{time_id}}/{prefix}_duration_{suffix}_u8.bin',
        'peak_time_index': f'summary/by_end_time/{{time_id}}/{prefix}_peak_time_index_{suffix}_u16.bin',
        'first_good_index': f'summary/by_end_time/{{time_id}}/{prefix}_first_good_index_{suffix}_u16.bin',
        'last_good_index': f'summary/by_end_time/{{time_id}}/{prefix}_last_good_index_{suffix}_u16.bin',
        'stable_hotspot': f'summary/by_end_time/{{time_id}}/{prefix}_stable_hotspot_{suffix}_f32.bin',
    }
    if latest_assets:
        meta.setdefault('summary_assets', {})
        meta['summary_assets'][prefix] = {k: f'summary/by_end_time/{{time_id}}/{v}' for k, v in latest_assets.items()}
        latest_json = next(iter(latest_assets.values()), None)
        if latest_json and 'summary/by_end_time/' in latest_json:
            try:
                tid = latest_json.split('summary/by_end_time/')[1].split('/')[0]
                meta['summary_config'][prefix]['latest_end_time_id'] = tid
            except Exception:
                pass
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')


def build(
    meta_path: Path,
    per_time_key: str,
    window_hours: int = 72,
    step_hours: int = 12,
    threshold: float = 0.7,
    top_n: int = 20,
) -> list[SummaryBuildResult]:
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    grid = meta.get('grid') or {}
    width = int(grid.get('width'))
    height = int(grid.get('height'))
    if width <= 0 or height <= 0:
        raise ValueError(f'Invalid grid in {meta_path}')

    per_time = ((meta.get('paths') or {}).get('per_time') or {})
    if per_time_key not in per_time:
        raise KeyError(f"per_time key '{per_time_key}' not found in {meta_path}")
    tpl = str(per_time[per_time_key])
    species_dir = meta_path.parent
    time_ids = infer_time_ids(meta)
    if not time_ids:
        raise ValueError(f'No time ids in {meta_path}')

    raster_by_tid = load_stack(meta_path, time_ids, tpl, width, height)
    prefix = metric_prefix(per_time_key)
    suffix = f'{window_hours}h'
    bounds = infer_bounds(meta)
    results: list[SummaryBuildResult] = []
    latest_assets = None
    for end_idx, end_tid in enumerate(time_ids):
        idxs = select_window_indices(time_ids, end_idx, window_hours)
        if not idxs:
            continue
        selected_tids = [time_ids[i] for i in idxs]
        stack = np.stack([raster_by_tid[tid] for tid in selected_tids], axis=0)
        summary = temporal_summary(stack, threshold=threshold)

        out_dir = species_dir / 'summary' / 'by_end_time' / end_tid
        write_array(out_dir / f'{prefix}_mean_{suffix}_f32.bin', summary.mean.astype(np.float32))
        write_array(out_dir / f'{prefix}_p90_{suffix}_f32.bin', summary.p90.astype(np.float32))
        write_array(out_dir / f'{prefix}_persist_{suffix}_f32.bin', summary.persist.astype(np.float32))
        write_array(out_dir / f'{prefix}_stability_{suffix}_f32.bin', summary.stability.astype(np.float32))
        write_array(out_dir / f'{prefix}_duration_{suffix}_u8.bin', summary.duration.astype(np.uint8))
        write_array(out_dir / f'{prefix}_peak_time_index_{suffix}_u16.bin', summary.peak_time_index.astype(np.uint16))
        write_array(out_dir / f'{prefix}_first_good_index_{suffix}_u16.bin', summary.first_good_index.astype(np.uint16))
        write_array(out_dir / f'{prefix}_last_good_index_{suffix}_u16.bin', summary.last_good_index.astype(np.uint16))
        write_array(out_dir / f'{prefix}_stable_hotspot_{suffix}_f32.bin', summary.stable_hotspot.astype(np.float32))
        assets = export_top_stable_points(
            out_dir,
            prefix,
            suffix,
            summary.stable_hotspot.astype(np.float32),
            summary.persist.astype(np.float32),
            summary.stability.astype(np.float32),
            summary.duration.astype(np.uint8),
            summary.peak_time_index.astype(np.uint16),
            summary.first_good_index.astype(np.uint16),
            summary.last_good_index.astype(np.uint16),
            bounds,
            end_tid,
            selected_tids,
            top_n=top_n,
            step_hours=step_hours,
        )
        latest_assets = assets
        results.append(
            SummaryBuildResult(
                prefix=prefix,
                end_time_id=end_tid,
                out_dir=out_dir,
                summary_paths={
                    'mean': f'summary/by_end_time/{end_tid}/{prefix}_mean_{suffix}_f32.bin',
                    'p90': f'summary/by_end_time/{end_tid}/{prefix}_p90_{suffix}_f32.bin',
                    'persist': f'summary/by_end_time/{end_tid}/{prefix}_persist_{suffix}_f32.bin',
                    'stability': f'summary/by_end_time/{end_tid}/{prefix}_stability_{suffix}_f32.bin',
                    'duration': f'summary/by_end_time/{end_tid}/{prefix}_duration_{suffix}_u8.bin',
                    'peak_time_index': f'summary/by_end_time/{end_tid}/{prefix}_peak_time_index_{suffix}_u16.bin',
                    'first_good_index': f'summary/by_end_time/{end_tid}/{prefix}_first_good_index_{suffix}_u16.bin',
                    'last_good_index': f'summary/by_end_time/{end_tid}/{prefix}_last_good_index_{suffix}_u16.bin',
                    'stable_hotspot': f'summary/by_end_time/{end_tid}/{prefix}_stable_hotspot_{suffix}_f32.bin',
                },
                summary_assets={k: f'summary/by_end_time/{end_tid}/{v}' for k, v in assets.items()},
            )
        )

    update_meta(meta_path, per_time_key=per_time_key, window_hours=window_hours, step_hours=step_hours, threshold=threshold, latest_assets=latest_assets)
    return results


def main() -> None:
    p = argparse.ArgumentParser(description='Build temporal summaries for any per_time raster key in species meta.json')
    p.add_argument('meta_path', type=Path)
    p.add_argument('--per-time-key', required=True)
    p.add_argument('--window-hours', type=int, default=72)
    p.add_argument('--step-hours', type=int, default=12)
    p.add_argument('--threshold', type=float, default=0.70)
    p.add_argument('--top-n', type=int, default=20)
    args = p.parse_args()
    build(args.meta_path, per_time_key=args.per_time_key, window_hours=args.window_hours, step_hours=args.step_hours, threshold=args.threshold, top_n=args.top_n)


if __name__ == '__main__':
    main()
