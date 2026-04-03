#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

try:
    from .build_temporal_summary_generic import build as build_generic, metric_prefix
except Exception:
    from build_temporal_summary_generic import build as build_generic, metric_prefix

DEFAULT_KEYS = ['phab_scoring']


def discover_species_meta(root: Path):
    return sorted(root.glob('runs/*/variants/*/species/*/meta.json'))


def load_feature_config(path: Path | None):
    if path is None:
        path = Path(__file__).with_name('feature_flags_default.json')
    return json.loads(path.read_text(encoding='utf-8'))


def discover_keys(meta: dict, include_pcatch: bool = False):
    per_time = ((meta.get('paths') or {}).get('per_time') or {})
    keys = []
    for key in per_time.keys():
        if key.startswith('phab_'):
            keys.append(key)
        elif include_pcatch and key.startswith('pcatch_'):
            keys.append(key)
    for k in DEFAULT_KEYS:
        if k in per_time and k not in keys:
            keys.append(k)
    return sorted(keys)


def main() -> None:
    p = argparse.ArgumentParser(description='Build configured temporal summaries/assets for all species under docs/latest')
    p.add_argument('latest_root', type=Path)
    p.add_argument('--config', type=Path, default=None)
    p.add_argument('--include-pcatch', action='store_true')
    p.add_argument('--top-n', type=int, default=None)
    args = p.parse_args()

    cfg = load_feature_config(args.config)
    pipe_cfg = cfg.get('pipeline', {})
    exports_cfg = cfg.get('exports', {})
    window_hours = int(pipe_cfg.get('window_hours', 72))
    step_hours = int(pipe_cfg.get('step_hours', 12))
    threshold = float(pipe_cfg.get('summary_threshold', 0.70))
    top_n = int(args.top_n if args.top_n is not None else exports_cfg.get('top_n', 20))

    metas = discover_species_meta(args.latest_root)
    if not metas:
        raise SystemExit(f'No species meta.json found under {args.latest_root}')

    manifest_entries = []
    by_species = {}
    for meta_path in metas:
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        keys = discover_keys(meta, include_pcatch=args.include_pcatch)
        species = str(meta.get('species') or meta_path.parent.name)
        variant = str(meta.get('variant') or meta_path.parent.parent.name)
        run_id = str(meta.get('run_id') or meta_path.parent.parent.parent.parent.name)
        for key in keys:
            try:
                print(f'→ {meta_path} :: {key}')
                results = build_generic(meta_path, per_time_key=key, window_hours=window_hours, step_hours=step_hours, threshold=threshold, top_n=top_n)
                if not results:
                    continue
                latest = results[-1]
                prefix = metric_prefix(key)
                entry = {
                    'run': run_id,
                    'variant': variant,
                    'species': species,
                    'key': key,
                    'prefix': prefix,
                    'latest_end_time_id': latest.end_time_id,
                    'summary_config': {
                        'window_hours': window_hours,
                        'step_hours': step_hours,
                        'threshold': threshold,
                        'prefix': prefix,
                    },
                    'summary_paths': latest.summary_paths,
                    'summary_assets': latest.summary_assets,
                }
                manifest_entries.append(entry)
                by_species.setdefault(species, {})[key] = entry
            except KeyError:
                print(f'  skip missing key: {key}')

    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        'schema_version': 1,
        'generated_at': generated_at,
        'latest_root': str(args.latest_root),
        'entries': manifest_entries,
        'by_species': by_species,
    }
    latest_by_species = {}
    by_species_report = {}
    for species, by_key in by_species.items():
        latest_by_species[species] = {k: v.get('latest_end_time_id') for k, v in by_key.items()}
        by_species_report[species] = {
            'keys': sorted(by_key.keys()),
            'entry_count': len(by_key),
            'latest_end_time_by_key': latest_by_species[species],
            'variant_by_key': {k: (v.get('variant')) for k, v in by_key.items()},
            'run_by_key': {k: (v.get('run')) for k, v in by_key.items()},
            'prefix_by_key': {k: (v.get('prefix')) for k, v in by_key.items()},
            'summary_assets_by_key': {k: (v.get('summary_assets') or {}) for k, v in by_key.items()},
            'summary_paths_by_key': {k: (v.get('summary_paths') or {}) for k, v in by_key.items()},
            'summary_config_by_key': {k: (v.get('summary_config') or {}) for k, v in by_key.items()},
        }
    keys = sorted({e['key'] for e in manifest_entries})
    counts_by_key = {k: 0 for k in keys}
    for e in manifest_entries:
        counts_by_key[e['key']] = counts_by_key.get(e['key'], 0) + 1
    report = {
        'schema_version': 1,
        'generated_at': generated_at,
        'latest_root': str(args.latest_root),
        'species_count': len(by_species),
        'entry_count': len(manifest_entries),
        'keys': keys,
        'counts_by_key': counts_by_key,
        'latest_by_species': latest_by_species,
        'by_species': by_species_report,
        'top_n': top_n,
        'window_hours': window_hours,
        'step_hours': step_hours,
        'threshold': threshold,
        'exports': {
            'top_n': top_n,
            'json': bool(exports_cfg.get('json', True)),
            'geojson': bool(exports_cfg.get('geojson', True)),
            'csv': bool(exports_cfg.get('csv', True)),
        },
    }
    if exports_cfg.get('manifest', True):
        (args.latest_root / 'summary_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (args.latest_root / 'summary_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    if exports_cfg.get('ui_config', True):
        raw_ui = dict(cfg.get('ui', {}))
        if 'default_temporal_mode' in raw_ui and 'default_temporal_view' not in raw_ui:
            raw_ui['default_temporal_view'] = raw_ui['default_temporal_mode']
        if 'grid_enabled' in raw_ui and 'grid_visible' not in raw_ui:
            raw_ui['grid_visible'] = raw_ui['grid_enabled']
        if 'tint_metric' in raw_ui and 'temporal_tint_metric' not in raw_ui:
            raw_ui['temporal_tint_metric'] = raw_ui['tint_metric']
        if 'temporal_tint_enabled' in raw_ui and 'tint_enabled' not in raw_ui:
            raw_ui['tint_enabled'] = raw_ui['temporal_tint_enabled']
        ui_cfg = {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'pipeline': pipe_cfg,
            'ui': raw_ui,
            'features': cfg.get('features', {}),
            'operations': cfg.get('operations', {}),
            'exports': {
                'top_n': top_n,
                'json': bool(exports_cfg.get('json', True)),
                'geojson': bool(exports_cfg.get('geojson', True)),
                'csv': bool(exports_cfg.get('csv', True)),
                'manifest': bool(exports_cfg.get('manifest', True)),
                'ui_config': bool(exports_cfg.get('ui_config', True)),
            },
        }
        (args.latest_root / 'ui_config.json').write_text(json.dumps(ui_cfg, ensure_ascii=False, indent=2), encoding='utf-8')

    print('✓ all configured summaries/assets built')


if __name__ == '__main__':
    main()
