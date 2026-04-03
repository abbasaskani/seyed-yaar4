#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys

try:
    from .run_postprocess_all import main as post_main
except Exception:
    from run_postprocess_all import main as post_main


def main():
    p = argparse.ArgumentParser(description='Run seydyaar daily pipeline and auto-build summaries/hotspot assets')
    p.add_argument('--latest-root', default='docs/latest')
    p.add_argument('--include-pcatch', action='store_true')
    p.add_argument('--config', default=None)
    p.add_argument('--top-n', type=int, default=None)
    p.add_argument('remainder', nargs=argparse.REMAINDER, help='Arguments after -- are passed to python -m seydyaar run-daily')
    args = p.parse_args()

    passthrough = list(args.remainder)
    if passthrough and passthrough[0] == '--':
        passthrough = passthrough[1:]

    cmd = [sys.executable, '-m', 'seydyaar', 'run-daily', '--out', args.latest_root] + passthrough
    print('▶', ' '.join(cmd))
    rc = subprocess.call(cmd)
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
