# Seyd-Yaar Current Formulation and Reference Notes

## Important honesty note
The **feature choices** in this bundle are scientifically motivated, but the **exact numeric weights** in the current helper engine are **engineering defaults from this patch**, not coefficients fitted from fishery observations or taken verbatim from one paper.

So:
- variables and directionality: literature-supported
- exact weights and blend coefficients: current implementation defaults

## Current temporal summary formulae
- persist = good_count / valid_count, threshold default 0.70
- stability = 1 / (1 + std / max(mean, eps))
- duration = longest consecutive run above threshold
- stable_hotspot = 0.40*mean + 0.20*p90 + 0.20*persist + 0.10*stability + 0.10*duration_norm

## Current score blocks
### Base
Weights in current helper engine:
- SST 0.28
- CHL 0.22
- O2 0.18
- SSS 0.12
- MLD 0.20

### Front
Uses multivariate front fusion from:
- SST gradient
- log(CHL) gradient
- SLA gradient
with current weights:
- SST 0.40
- CHL 0.35
- SLA 0.25
and optional front persistence blending:
- 0.75 front + 0.25 persistence

### Mesoscale
Current weights:
- EKE 0.30
- Edge 0.35
- Strain 0.20
- Okubo-Weiss 0.15

### Vertical
Current weights:
- MLD 0.35
- O2 0.35
- Thermocline 0.30

### Ops
Current weights:
- Wave height 0.35
- Wave period 0.15
- Wave direction 0.10
- Stokes 0.20
- SMOC 0.20

### Composition
- PHAB = product blend of base × front × mesoscale × vertical with floor 0.20
- PCATCH = PHAB × persistence factor × ops factor

## Features currently represented in code
- SST
- CHL
- O2
- SSS
- MLD
- thermocline proxy / Z20 proxy
- SLA
- surface currents u/v
- EKE
- vorticity
- strain
- Okubo-Weiss
- edge distance score
- wave height
- wave period
- wave direction score (if provided)
- Stokes drift
- SMOC
- temporal persistence metrics

## Features flagged but not yet fully wired end-to-end in core backend
- nearest-surface depth selection in the main fetch/derive path
- explicit CHL 3-day preprocessing inside the main generator
- NPP lag in the main score path
- raw wave-direction-to-score transform in the helper engine
- config-driven stable_hotspot weights in the temporal builder
- config-driven pcatch blend weights in compose_scores

## Why these variables are here
- BOA / multivariate front logic motivated SST/CHL-front usage
- Copernicus official docs support CHL_gradient availability
- O2 + temperature joint constraints and habitat viability support adding oxygen and vertical structure
- mesoscale eddy diagnostics motivate EKE / strain / OW / edge-distance
