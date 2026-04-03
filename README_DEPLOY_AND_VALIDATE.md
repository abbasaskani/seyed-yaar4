# Deploy and validate overlay bundle

## 1) Overlay on the main repository
Extract this bundle at the **root of the main repository** and allow files to replace existing ones.

## 2) Preflight
Run:
```bash
python backend/tools/check_target_repo.py .
python backend/tools/validate_release.py .
```

## 3) AOI / coordinates without manual typing every run
You can drive the analysis extent from either:
- `backend/tools/region_config.json` (recommended; use the included `region_config.json` or copy from `region_config.example.json`)
- a standalone AOI GeoJSON file
- direct CLI flags like `--bbox ... --utm-epsg ...`

Priority is:
1. explicit CLI flags
2. region config `bbox`
3. bbox derived from region config `aoi_geojson` or `--aoi-geojson`

Example local run using a region config:
```bash
python backend/tools/run_daily_with_postprocess.py \
  --latest-root docs/latest \
  --region-config backend/tools/region_config.json \
  --include-pcatch \
  -- --past-days 1 --future-days 5 --step-hours 12 --species skipjack
```

Example local run using only a GeoJSON AOI:
```bash
python backend/tools/run_daily_with_postprocess.py \
  --latest-root docs/latest \
  --aoi-geojson backend/tools/default_aoi.geojson \
  --utm-epsg 32640 \
  --include-pcatch \
  -- --past-days 1 --future-days 5 --step-hours 12 --species skipjack
```

## 4) If `python -m seydyaar` fails
The wrapper now tries both:
- `python -m seydyaar run-daily ...`
- direct script fallback: `backend/seydyaar/pipeline/run_daily.py`

It also sets `PYTHONPATH` with both repo root and `backend/`, so repositories that keep the package under `backend/seydyaar` do not need a manual install step just to be discovered.

## 5) GitHub Actions
The workflow is:
- `.github/workflows/seyd-yaar-validate-run.yml`

It supports:
- `region_config_path`
- `aoi_geojson_path`
- `utm_epsg`
- `extra_args`

So you no longer have to type the bbox manually every run when a region config or GeoJSON is available.


## Overlay-only note

This bundle contains the docs/tools overlay. If `backend/seydyaar/...` is absent, GitHub Actions will validate the overlay and skip the full daily pipeline instead of failing.
