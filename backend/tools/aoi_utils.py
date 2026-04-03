#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _iter_coords(obj: Any):
    if isinstance(obj, (list, tuple)):
        if len(obj) >= 2 and all(isinstance(v, (int, float)) for v in obj[:2]):
            yield float(obj[0]), float(obj[1])
        else:
            for item in obj:
                yield from _iter_coords(item)


def bbox_from_geojson_path(path: str | Path) -> dict[str, float]:
    p = Path(path).expanduser().resolve()
    data = json.loads(p.read_text(encoding='utf-8'))
    coords = []
    gj_type = data.get('type')
    if gj_type == 'FeatureCollection':
        for feat in data.get('features', []):
            geom = feat.get('geometry') or {}
            coords.extend(list(_iter_coords(geom.get('coordinates'))))
    elif gj_type == 'Feature':
        geom = data.get('geometry') or {}
        coords.extend(list(_iter_coords(geom.get('coordinates'))))
    else:
        coords.extend(list(_iter_coords(data.get('coordinates'))))
    if not coords:
        raise ValueError(f'No coordinates found in GeoJSON: {p}')
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return {
        'lat_min': min(lats),
        'lat_max': max(lats),
        'lon_min': min(lons),
        'lon_max': max(lons),
    }


def load_region_config(path: str | Path) -> dict[str, Any]:
    p = Path(path).expanduser().resolve()
    cfg = json.loads(p.read_text(encoding='utf-8'))
    if not isinstance(cfg, dict):
        raise ValueError(f'Region config must be a JSON object: {p}')
    return cfg


def resolve_bbox_and_utm(*, region_config_path: str | Path | None = None, aoi_geojson_path: str | Path | None = None, explicit_bbox: str | None = None, explicit_utm_epsg: str | int | None = None) -> tuple[str | None, str | None, dict[str, Any]]:
    details: dict[str, Any] = {}
    bbox = explicit_bbox
    utm_epsg = str(explicit_utm_epsg) if explicit_utm_epsg not in (None, '') else None

    if region_config_path:
        cfg = load_region_config(region_config_path)
        details['region_config_path'] = str(Path(region_config_path).expanduser().resolve())
        details['region_name'] = cfg.get('region_name')
        if not bbox:
            if isinstance(cfg.get('bbox'), dict):
                bb = cfg['bbox']
                bbox = f"{bb['lat_min']},{bb['lat_max']},{bb['lon_min']},{bb['lon_max']}"
            elif isinstance(cfg.get('bbox'), list) and len(cfg['bbox']) == 4:
                bbox = ','.join(str(v) for v in cfg['bbox'])
        if not utm_epsg and cfg.get('utm_epsg') not in (None, ''):
            utm_epsg = str(cfg.get('utm_epsg'))
        if not aoi_geojson_path and cfg.get('aoi_geojson'):
            aoi_geojson_path = cfg.get('aoi_geojson')
            if not Path(aoi_geojson_path).is_absolute():
                aoi_geojson_path = str((Path(region_config_path).expanduser().resolve().parent / aoi_geojson_path).resolve())

    if aoi_geojson_path and not bbox:
        bb = bbox_from_geojson_path(aoi_geojson_path)
        bbox = f"{bb['lat_min']},{bb['lat_max']},{bb['lon_min']},{bb['lon_max']}"
        details['aoi_geojson_path'] = str(Path(aoi_geojson_path).expanduser().resolve())
        details['aoi_bbox'] = bb

    return bbox, utm_epsg, details
