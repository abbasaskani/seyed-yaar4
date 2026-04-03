#!/usr/bin/env python3
from __future__ import annotations
import json, py_compile, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'backend' / 'tools'
DOCS = ROOT / 'docs'

JS_REF_RE = re.compile(r'\$\(["\']([^"\']+)["\']\)')
HTML_ID_RE = re.compile(r'id=["\']([^"\']+)["\']')
JS_FUNC_RE = re.compile(r'^function\s+([A-Za-z0-9_]+)\s*\(', re.M)


def check_py(paths):
    for p in paths:
        py_compile.compile(str(p), doraise=True)


def check_js(path: Path):
    subprocess.run(['node', '--check', str(path)], check=True)


def check_dom_refs(html: Path, js: Path):
    h = html.read_text(encoding='utf-8')
    j = js.read_text(encoding='utf-8')
    ids_html = set(HTML_ID_RE.findall(h))
    ids_js = set(JS_REF_RE.findall(j))
    missing = sorted(ids_js - ids_html)
    return {'html_ids': len(ids_html), 'js_refs': len(ids_js), 'missing_ids': missing}


def check_duplicate_js_functions(js: Path):
    src = js.read_text(encoding='utf-8')
    names = JS_FUNC_RE.findall(src)
    dup = sorted({n for n in names if names.count(n) > 1})
    return {'duplicate_functions': dup}


def run_smoke():
    out = subprocess.check_output([sys.executable, str(TOOLS / 'qa_smoke_test.py')], text=True)
    return json.loads(out.strip().splitlines()[-1])


def check_target_repo(root: Path):
    out = json.loads(subprocess.check_output([sys.executable, str(TOOLS / 'check_target_repo.py'), str(root)], text=True))
    return out


def main():
    py_files = [
        TOOLS / 'build_temporal_summary_generic.py',
        TOOLS / 'run_postprocess_all.py',
        TOOLS / 'run_daily_with_postprocess.py',
        TOOLS / 'model_feature_primitives.py',
        TOOLS / 'scoring_feature_engine.py',
        TOOLS / 'qa_smoke_test.py',
        TOOLS / 'validate_release.py',
        TOOLS / 'check_target_repo.py',
        TOOLS / 'aoi_utils.py',
    ]
    check_py(py_files)
    check_js(DOCS / 'app.js')
    dom = check_dom_refs(DOCS / 'app.html', DOCS / 'app.js')
    dup = check_duplicate_js_functions(DOCS / 'app.js')
    smoke = run_smoke()
    target = check_target_repo(ROOT)
    report = {'py_compile': True, 'node_check': True, 'dom': dom, 'js_structure': dup, 'smoke': smoke, 'target_repo': target}
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
