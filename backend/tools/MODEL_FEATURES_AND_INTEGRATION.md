# MODEL FEATURES AND INTEGRATION v17

## Target model blocks
- Base: SST, CHL, O2, SSS, MLD
- Front: BOA/logCHL/SLA fusion (use `front_fusion` from `model_feature_primitives.py`)
- Mesoscale: EKE, vorticity, strain, Okubo-Weiss, eddy-edge distance
- Vertical: nearest-surface-depth, thermocline/Z20 proxy, O2 compression
- Ops: wave height/period/direction, Stokes drift, SMOC
- Temporal: mean/p90/persist/stability/duration/stable_hotspot

## Recommended direct core hooks once real source files are open
- `backend/seydyaar/models/ocean_features.py`
  - import from `model_feature_primitives`
  - derive `front_fusion`, `mesoscale_metrics`, `thermocline_proxy_from_profile`, `z20_proxy_from_profile`
- `backend/seydyaar/models/scoring.py`
  - import from `scoring_feature_engine`
  - compose `base/front/mesoscale/vertical/ops/persistence` into `phab/pcatch`
- `backend/seydyaar/pipeline/run_daily.py`
  - after writing per-time rasters, invoke postprocess or embed generic summary builder
  - store `summary_config` + `summary_paths` in species meta.json

## Minimal formulas
- stable_hotspot = 0.40*mean + 0.20*p90 + 0.20*persist + 0.10*stability + 0.10*(duration/T)
- pcatch = phab * (0.65 + 0.35*persistence) * (0.55 + 0.45*ops)
