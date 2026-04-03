#!/usr/bin/env python3
from __future__ import annotations
import json, tempfile, subprocess, sys
from pathlib import Path
import numpy as np
try:
    from .build_temporal_summary_generic import build
    from .run_postprocess_all import main as post_main
    from .scoring_feature_engine import build_from_raw_fields, component_report
    from .aoi_utils import bbox_from_geojson_path
except Exception:
    from build_temporal_summary_generic import build
    from run_postprocess_all import main as post_main
    from scoring_feature_engine import build_from_raw_fields, component_report
    from aoi_utils import bbox_from_geojson_path


def write_bin(p, arr, dtype="f32"):
    p.parent.mkdir(parents=True, exist_ok=True)
    if dtype == "f32": np.asarray(arr, dtype=np.float32).tofile(p)
    elif dtype == "u16": np.asarray(arr, dtype=np.uint16).tofile(p)
    else: np.asarray(arr, dtype=np.uint8).tofile(p)


def assert_true(name, cond):
    if not cond:
        raise AssertionError(f"smoke assertion failed: {name}")


def main():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        root = td/'docs'/'latest'
        species_dir = root/'runs'/'main'/'variants'/'auto'/'species'/'skipjack'
        times = ['20260401_0600Z','20260401_1800Z','20260402_0600Z','20260402_1800Z','20260403_0600Z','20260403_1800Z']
        W,H = 8,6
        grid = {'width':W,'height':H,'lat_min':0.0,'lat_max':5.0,'lon_min':50.0,'lon_max':57.0}
        meta = {
          'run_id':'main','variant':'auto','species':'skipjack','grid':grid,
          'times':times,
          'paths':{'per_time':{
             'phab_scoring':'runs/main/variants/auto/species/skipjack/times/{time}/phab_scoring_f32.bin',
             'phab_frontplus':'runs/main/variants/auto/species/skipjack/times/{time}/phab_frontplus_f32.bin',
             'pcatch_scoring':'runs/main/variants/auto/species/skipjack/times/{time}/pcatch_scoring_f32.bin'
          }}
        }
        species_dir.mkdir(parents=True, exist_ok=True)
        (species_dir/'meta.json').write_text(json.dumps(meta), encoding='utf-8')
        base = np.linspace(0.1,0.95,W*H, dtype=np.float32).reshape(H,W)
        for i, tid in enumerate(times):
            tdir = species_dir/'times'/tid
            write_bin(tdir/'phab_scoring_f32.bin', np.clip(base + i*0.01,0,1))
            write_bin(tdir/'phab_frontplus_f32.bin', np.clip(base[::-1] + i*0.02,0,1))
            write_bin(tdir/'pcatch_scoring_f32.bin', np.clip(base*0.8 + i*0.015,0,1))
        for key in ('phab_scoring','phab_frontplus','pcatch_scoring'):
            build(species_dir/'meta.json', key, window_hours=72, step_hours=12, threshold=0.7, top_n=10)
        old = sys.argv[:]
        try:
            sys.argv = ['run_postprocess_all.py', str(root), '--include-pcatch']
            post_main()
        finally:
            sys.argv = old
        manifest = root/'summary_manifest.json'
        report = root/'summary_report.json'
        ui_cfg = root/'ui_config.json'
        ui = json.loads(ui_cfg.read_text()) if ui_cfg.exists() else {}
        rpt = json.loads(report.read_text()) if report.exists() else {}
        raw = {'sst':base,'chl':base*0.7+0.1,'sla':base*0.2,'u':base*0.1,'v':base*0.05,'o2':base,'sss':base,'mld':base,'thermocline':base,'temporal_persistence':base, 'wave_height_score': np.full_like(base, 0.8), 'wave_period_score': np.full_like(base, 0.6), 'ow': np.full_like(base, 0.2)}
        comps = build_from_raw_fields(raw)
        rep = component_report(comps)
        geojson_path = td/'aoi.geojson'
        geojson_path.write_text(json.dumps({
            'type': 'FeatureCollection',
            'features': [{'type': 'Feature', 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': [[[60.0, 23.0],[60.0, 16.0],[65.0,16.0],[65.0,23.0],[60.0,23.0]]]}}]
        }), encoding='utf-8')
        bbox = bbox_from_geojson_path(geojson_path)
        out = {
            'has_manifest': manifest.exists(),
            'has_report': report.exists(),
            'has_ui_config': ui_cfg.exists(),
            'ui_has_temporal_alias': bool(ui.get('ui', {}).get('default_temporal_view')),
            'ui_exports_top_n': (ui.get('exports') or {}).get('top_n'),
            'ui_exports_json': bool((ui.get('exports') or {}).get('json')),
            'report_has_by_species': bool(rpt.get('by_species', {}).get('skipjack')),
            'report_top_n': rpt.get('top_n'),
            'report_window_hours': rpt.get('window_hours'),
            'report_threshold': rpt.get('threshold'),
            'report_entry_count': rpt.get('entry_count'),
            'report_has_assets_by_key': bool((rpt.get('by_species', {}).get('skipjack') or {}).get('summary_assets_by_key', {}).get('phab_scoring')),
            'report_has_paths_by_key': bool((rpt.get('by_species', {}).get('skipjack') or {}).get('summary_paths_by_key', {}).get('phab_scoring')),
            'report_has_config_by_key': bool((rpt.get('by_species', {}).get('skipjack') or {}).get('summary_config_by_key', {}).get('phab_scoring')),
            'phab_mean': round(rep['phab']['mean'], 4) if rep['phab']['mean'] is not None else None,
            'pcatch_mean': round(rep['pcatch']['mean'],4) if rep['pcatch']['mean'] is not None else None,
            'aoi_bbox': bbox,
        }
        assert_true('manifest', out['has_manifest'])
        assert_true('report', out['has_report'])
        assert_true('ui_config', out['has_ui_config'])
        assert_true('ui_temporal_alias', out['ui_has_temporal_alias'])
        assert_true('ui_exports_top_n', out['ui_exports_top_n'] == 20)
        assert_true('ui_exports_json', out['ui_exports_json'] is True)
        assert_true('report_has_by_species', out['report_has_by_species'])
        assert_true('report_window_hours', out['report_window_hours'] == 72)
        assert_true('report_threshold', abs(out['report_threshold'] - 0.7) < 1e-9)
        assert_true('report_has_assets_by_key', out['report_has_assets_by_key'])
        assert_true('report_has_paths_by_key', out['report_has_paths_by_key'])
        assert_true('report_has_config_by_key', out['report_has_config_by_key'])
        assert_true('phab_mean', out['phab_mean'] is not None)
        assert_true('pcatch_mean', out['pcatch_mean'] is not None)
        assert_true('aoi_bbox', bbox['lat_min'] == 16.0 and bbox['lon_max'] == 65.0)
        print(json.dumps(out))

if __name__ == '__main__':
    main()
