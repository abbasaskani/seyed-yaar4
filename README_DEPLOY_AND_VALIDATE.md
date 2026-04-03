# Deploy and validate overlay bundle

## 1) Overlay on the main repository
Extract this bundle at the **root of the main repository** and allow files to replace existing ones.

## 2) Preflight
Run:
```bash
python backend/tools/check_target_repo.py .
python backend/tools/validate_release.py .
```

## 3) Coordinates / AOI
This bundle does NOT own the final analysis extent by itself.
See:
- `REGION_CONFIG_AND_COORDINATES.md`
- `backend/tools/region_config.example.json`

If the target repo's core backend supports bbox flags, you can pass them via GitHub Actions `extra_args`, for example:
```text
--bbox 5,27,50,77 --utm-epsg 32643
```

## 4) Local run
```bash
python backend/tools/run_daily_with_postprocess.py --latest-root docs/latest --include-pcatch -- --past-days 1 --future-days 5 --step-hours 12 --species skipjack
```

## 5) Postprocess only
```bash
python backend/tools/run_postprocess_all.py docs/latest --include-pcatch
```

## 6) GitHub Actions
The workflow is:
- `.github/workflows/seyd-yaar-validate-run.yml`

It installs:
- numpy
- scipy
- pyproj

before running validation/smoke.
