# Ready for GitHub Overlay (v31)

This bundle is validated and ready to be overlaid onto the main Seyd-Yaar repository.

## What this bundle includes
- docs/app.html
- docs/app.js
- docs/sw.js
- backend/tools/* utilities for temporal summaries, export, validation and QA

## Important
This bundle is **not** a standalone full repo. It expects the destination repository to already contain the core backend files:
- backend/seydyaar/pipeline/run_daily.py
- backend/seydyaar/models/scoring.py
- backend/seydyaar/models/ocean_features.py

## Preflight on target repo
Run these from the repo root after overlaying this bundle:

```bash
python backend/tools/check_target_repo.py .
python backend/tools/validate_release.py .
```

Expected:
- `ready_for_overlay: true`
- `py_compile: true`
- `node_check: true`
- smoke test passes

## Initial run
If validation passes, you can run the pipeline + postprocess wrapper:

```bash
python backend/tools/run_daily_with_postprocess.py \
  --latest-root docs/latest \
  --include-pcatch \
  -- --past-days 1 --future-days 5 --step-hours 12 --species skipjack
```

## Notes
- Temporal summaries are built for PHAB and, if present, PCATCH.
- UI reads from meta/manifest/report/ui_config with fallbacks.
- Stable hotspot exports (JSON/GeoJSON/CSV) are included in postprocess outputs.


## Overlay-only note

This bundle contains the docs/tools overlay. If `backend/seydyaar/...` is absent, GitHub Actions will validate the overlay and skip the full daily pipeline instead of failing.
