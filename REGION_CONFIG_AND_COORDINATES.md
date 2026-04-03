# Region / Coordinates configuration

## Important
This bundle is an overlay bundle. The actual analysis extent (AOI / bbox) is owned by the **core backend** in the target repository.
That means the final source of truth for coordinates is usually inside the main repo's core files such as:
- `backend/seydyaar/pipeline/run_daily.py`
- `backend/seydyaar/models/ocean_features.py`
- any dataset/config file that defines the AOI or bbox

## What exists in this bundle
### 1) UI-only bbox controls
In `docs/app.html` there are UI fields such as:
- `bboxLatMin`
- `bboxLatMax`
- `bboxLonMin`
- `bboxLonMax`
- `aoiPoints`
- `filterAoiPoints`

These are **frontend / filtering / view controls** and do **not** define the backend analysis extent by themselves.

### 2) Overlay-side example region config
This bundle includes:
- `backend/tools/region_config.example.json`

This is an example/template only.

## Recommended way to pass coordinates on GitHub Actions
The workflow in this bundle exposes `extra_args`.
Use it to pass AOI arguments **only if the core `run_daily.py` in the target repo supports them**.

Example:
```bash
--bbox 5,27,50,77 --utm-epsg 32643
```

## If your target repo does NOT support bbox flags yet
Then coordinates must be set in the target repo's core source/config.
This overlay bundle cannot magically define the AOI for the full backend if the core files do not expose that option.
