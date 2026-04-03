# PATCH STATUS v32

## Added in v32
- `.github/workflows/seyd-yaar-validate-run.yml`
- `MODEL_CURRENT_FORMULATION_AND_REFERENCES.md`
- target-repo preflight now requires the workflow file too
- bundle cleaned from `__pycache__`

## Intent
This bundle is now suitable for overlay on the main repository and running through GitHub Actions validation + optional pipeline execution.

## Still true
Core backend direct integration into:
- `backend/seydyaar/pipeline/run_daily.py`
- `backend/seydyaar/models/scoring.py`
- `backend/seydyaar/models/ocean_features.py`

has **not** been patched inside this bundle because those core files are not included here.
