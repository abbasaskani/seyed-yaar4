#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

try:
    from .aoi_utils import resolve_bbox_and_utm
    from .run_postprocess_all import main as post_main
except Exception:
    from aoi_utils import resolve_bbox_and_utm
    from run_postprocess_all import main as post_main


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _module_available(name: str, extra_paths: list[Path] | None = None) -> bool:
    original = list(sys.path)
    try:
        for p in extra_paths or []:
            sp = str(p)
            if sp not in sys.path:
                sys.path.insert(0, sp)
        return importlib.util.find_spec(name) is not None
    finally:
        sys.path[:] = original


def choose_run_command(latest_root: str, passthrough: list[str]) -> tuple[list[str], dict[str, str]]:
    root = repo_root()
    backend_dir = root / 'backend'
    core_run = backend_dir / 'seydyaar' / 'pipeline' / 'run_daily.py'
    env = os.environ.copy()
    py_paths = [str(root), str(backend_dir)]
    env['PYTHONPATH'] = os.pathsep.join(py_paths + ([env['PYTHONPATH']] if env.get('PYTHONPATH') else []))

    if _module_available('seydyaar', [root, backend_dir]):
        return [sys.executable, '-m', 'seydyaar', 'run-daily', '--out', latest_root] + passthrough, env

    if core_run.exists():
        return [sys.executable, str(core_run), '--out', latest_root] + passthrough, env

    raise SystemExit(
        'Could not find the Seyd-Yaar core backend. Checked importable module "seydyaar" and '
        f'script path {core_run}. Make sure the target repository contains backend/seydyaar/... '
        'or an installable seydyaar package.'
    )


def has_flag(argv: list[str], *flags: str) -> bool:
    return any(arg in flags or any(arg.startswith(f + '=') for f in flags) for arg in argv)


def main():
    p = argparse.ArgumentParser(description='Run seydyaar daily pipeline and auto-build summaries/hotspot assets')
    p.add_argument('--latest-root', default='docs/latest')
    p.add_argument('--include-pcatch', action='store_true')
    p.add_argument('--config', default=None)
    p.add_argument('--top-n', type=int, default=None)
    p.add_argument('--region-config', default=None, help='JSON config that can provide bbox, utm_epsg, and/or aoi_geojson')
    p.add_argument('--aoi-geojson', default=None, help='GeoJSON file used to derive bbox automatically')
    p.add_argument('--bbox', default=None, help='Explicit bbox as lat_min,lat_max,lon_min,lon_max')
    p.add_argument('--utm-epsg', default=None, help='Explicit UTM EPSG passed through when supported by the core backend')
    p.add_argument('remainder', nargs=argparse.REMAINDER, help='Arguments after -- are passed to the core daily runner')
    args = p.parse_args()

    passthrough = list(args.remainder)
    if passthrough and passthrough[0] == '--':
        passthrough = passthrough[1:]

    bbox, utm_epsg, aoi_details = resolve_bbox_and_utm(
        region_config_path=args.region_config,
        aoi_geojson_path=args.aoi_geojson,
        explicit_bbox=args.bbox,
        explicit_utm_epsg=args.utm_epsg,
    )
    if bbox and not has_flag(passthrough, '--bbox'):
        passthrough += ['--bbox', bbox]
    if utm_epsg and not has_flag(passthrough, '--utm-epsg'):
        passthrough += ['--utm-epsg', str(utm_epsg)]

    cmd, env = choose_run_command(args.latest_root, passthrough)
    if aoi_details:
        print('▶ AOI resolved:', aoi_details)
    print('▶', ' '.join(cmd))
    rc = subprocess.call(cmd, env=env)
    if rc != 0:
        raise SystemExit(rc)

    post_args = [str(args.latest_root)]
    if args.config:
        post_args += ['--config', str(args.config)]
    if args.include_pcatch:
        post_args += ['--include-pcatch']
    if args.top_n is not None:
        post_args += ['--top-n', str(args.top_n)]
    argv_backup = sys.argv[:]
    sys.argv = ['run_postprocess_all.py'] + post_args
    try:
        post_main()
    finally:
        sys.argv = argv_backup


if __name__ == '__main__':
    main()
