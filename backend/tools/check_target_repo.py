#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path

REQUIRED_DOCS = [
    'docs/app.html',
    'docs/app.js',
    'docs/sw.js',
    '.github/workflows/seyd-yaar-validate-run.yml',
    'backend/tools/requirements-smoke.txt',
]
OPTIONAL_CORE = [
    'backend/seydyaar/pipeline/run_daily.py',
    'backend/seydyaar/models/scoring.py',
    'backend/seydyaar/models/ocean_features.py',
]

def main(argv=None):
    argv = argv or sys.argv[1:]
    root = Path(argv[0]).resolve() if argv else Path.cwd().resolve()
    out = {
        'repo_root': str(root),
        'required_docs_present': [],
        'required_docs_missing': [],
        'core_backend_present': [],
        'core_backend_missing': [],
        'ready_for_overlay': True,
    }
    for rel in REQUIRED_DOCS:
        p = root / rel
        (out['required_docs_present'] if p.exists() else out['required_docs_missing']).append(rel)
    for rel in OPTIONAL_CORE:
        p = root / rel
        (out['core_backend_present'] if p.exists() else out['core_backend_missing']).append(rel)
    if out['required_docs_missing']:
        out['ready_for_overlay'] = False
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
