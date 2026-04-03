# Region / Coordinates configuration

## What changed
This overlay can now derive the backend AOI automatically before calling the core daily runner.
That means you do **not** have to manually type bbox values on every run anymore.

## Supported sources for AOI
The wrapper `backend/tools/run_daily_with_postprocess.py` accepts AOI from three sources, in this priority order:

1. Explicit CLI flags
   - `--bbox lat_min,lat_max,lon_min,lon_max`
   - `--utm-epsg 32640`
2. Region config JSON
   - `--region-config backend/tools/region_config.json`
3. AOI GeoJSON
   - `--aoi-geojson path/to/aoi.geojson`
   - or `aoi_geojson` inside the region config

## Recommended setup
Create a real config file such as:
- `backend/tools/region_config.json`

You can copy from:
- `backend/tools/region_config.example.json`

Example:
```json
{
  "region_name": "arabian_sea",
  "aoi_geojson": "default_aoi.geojson",
  "utm_epsg": 32640
}
```

The wrapper will derive the bbox from the polygon automatically.

## Your current AOI example
The attached AOI polygon corresponds to this bbox:
- lat_min = 16.387719633314063
- lat_max = 23.53110795430304
- lon_min = 60.22459770549662
- lon_max = 65.6614592964082

## Important limitation
The overlay can only pass AOI arguments into the **core backend**.
So the target repository still needs one of these to be true:
- the `seydyaar` package is importable, or
- `backend/seydyaar/pipeline/run_daily.py` exists and accepts `--bbox` / `--utm-epsg`

If the core runner does not support AOI arguments yet, then the underlying repo still needs a small patch in its real `run_daily.py` argparse layer.
