# PATCH STATUS v30

## What was fixed in v30
- Fixed a real duplicate-function bug in `docs/app.js` (`getTemporalSummaryTemplates`) that could break precomputed temporal summary loading.
- Added duplicate JS function detection to `backend/tools/validate_release.py`.
- Aligned client-side fallback `stableHotspot` formula with backend `temporal_summary()` formula:
  `0.40*mean + 0.20*p90 + 0.20*persist + 0.10*stability + 0.10*duration_norm`.
- Re-ran validation successfully.

## Validation
- `python backend/tools/validate_release.py` passes
- `node --check docs/app.js` passes
- synthetic smoke test passes

## Remaining blocker
Direct integration into the repository core backend files under `backend/seydyaar/...` is not included in this overlay bundle.
