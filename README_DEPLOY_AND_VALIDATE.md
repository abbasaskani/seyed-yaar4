# Deploy and validate

## 1) Overlay this bundle on the repository root
Copy the contents of this bundle into the repository root so these paths exist:
- `docs/app.html`
- `docs/app.js`
- `docs/sw.js`
- `backend/tools/...`

## 2) Preflight check the target repository
Run:
```bash
python backend/tools/check_target_repo.py .
```
This reports whether the repository already contains the core backend files that are **not** shipped in this bundle.

## 3) Validate the bundle after overlay
Run:
```bash
python backend/tools/validate_release.py
```
This checks:
- Python compile for backend tools
- `node --check` for `docs/app.js`
- DOM id references between `app.html` and `app.js`
- synthetic smoke test for summary/postprocess/scoring helpers
- target repo structure report

## 4) Run the generator
Use the repository main generator as usual, or the wrapper:
```bash
python backend/tools/run_daily_with_postprocess.py --latest-root docs/latest --include-pcatch -- --past-days 1 --future-days 5 --step-hours 12 --species skipjack
```

## 5) Run only postprocess if data already exist
```bash
python backend/tools/run_postprocess_all.py docs/latest --include-pcatch
```

## 6) Remaining blocker
This bundle does **not** include direct patches to the core backend files under:
- `backend/seydyaar/pipeline/run_daily.py`
- `backend/seydyaar/models/scoring.py`
- `backend/seydyaar/models/ocean_features.py`

If those files exist in your repository, this bundle is ready to overlay and test on GitHub.


## GitHub Actions workflow included
This bundle now includes:
- `.github/workflows/seyd-yaar-validate-run.yml`

Typical flow on GitHub:
1. push overlay to your main repo
2. Actions tab → run **Seyd-Yaar Validate and Run** manually
3. first run validates the bundle and optionally runs the generator + postprocess

Manual local checks remain:
```bash
python backend/tools/check_target_repo.py .
python backend/tools/validate_release.py .
```
