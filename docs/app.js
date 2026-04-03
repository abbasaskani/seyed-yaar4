/* ui-docs-phab-stability-v19 */
/* Seyd‑Yaar app.js — dynamic map + aggregation + uncertainty + feedback 💠🌊 */
const $ = (id) => document.getElementById(id);
const safeText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const safeHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

const strings = {
  en: {
    subtitle: "Catch Probability (Habitat × Ops) + Uncertainty",
    Run: "Run",
    Variant: "QC / Gap‑Fill",
    Species: "Species",
    Model: "Model",
    Map: "Map",
    Aggregation: "Aggregation",
    From: "From",
    To: "To",
    Top: "Top‑10 Hotspots",
    Profile: "Species Profile (Explainable)",
    Audit: "Audit / meta.json",
    DownloadPNG: "Download PNG",
    DownloadGeo: "Download GeoJSON",
    Feedback: "+ Feedback",
    ExportFb: "Export feedback",
    Rating: "Rating",
    Depth: "Gear depth (m)",
    Notes: "Notes (optional)",
    SaveLocal: "Save locally",
    qcHint: "Masks low‑quality pixels (opacity)",
    gapHint: "Uses precomputed gap‑filled variant",
  },
  fa: {
    subtitle: "احتمال صید (زیستگاه × عملیات) + عدم‌قطعیت",
    Run: "ران",
    Variant: "QC / گپ‌فیل",
    Species: "گونه",
    Model: "مدل",
    Map: "نقشه",
    Aggregation: "تجمیع",
    From: "از",
    To: "تا",
    Top: "۱۰ نقطه برتر",
    Profile: "پروفایل گونه (توضیح‌پذیر)",
    Audit: "Audit / meta.json",
    DownloadPNG: "دانلود PNG",
    DownloadGeo: "دانلود GeoJSON",
    Feedback: "+ فیدبک",
    ExportFb: "خروجی فیدبک",
    Rating: "امتیاز",
    Depth: "عمق ابزار (m)",
    Notes: "یادداشت (اختیاری)",
    SaveLocal: "ذخیره لوکال",
    qcHint: "پیکسل‌های بی‌کیفیت را ماسک می‌کند (شفافیت)",
    gapHint: "از نسخه گپ‌فیل‌شده استفاده می‌کند",
  }
};

let lang = localStorage.getItem("lang") || "en";
function applyLang(){
  const t = strings[lang];
  safeText("subtitle", t.subtitle);
  safeText("lblRun", t.Run);
  safeText("lblVariant", t.Variant);
  safeText("lblSpecies", t.Species);
  safeText("lblModel", t.Model);
  safeText("lblMap", t.Map);
  safeText("lblAgg", t.Aggregation);
  safeText("lblFrom", t.From);
  safeText("lblTo", t.To);
  safeText("sumTop", t.Top);
  safeText("sumProfile", t.Profile);
  safeText("sumAudit", t.Audit);
  safeText("downloadPngBtn", t.DownloadPNG);
  safeText("downloadGeoBtn", t.DownloadGeo);
  safeText("feedbackBtn", t.Feedback);
  safeText("exportFbBtn", t.ExportFb);
  safeText("fbLblRating", t.Rating);
  safeText("fbLblDepth", t.Depth);
  safeText("fbLblNotes", t.Notes);
  safeText("saveFbBtn", t.SaveLocal);
  safeText("qcHint", t.qcHint);
  safeText("gapHint", t.gapHint);
  document.body.dir = (lang === "fa") ? "rtl" : "ltr";
}
$("langToggle").addEventListener("click", ()=>{
  lang = (lang === "en") ? "fa" : "en";
  localStorage.setItem("lang", lang);
  applyLang();
});

applyLang();

/* ------------------------------
   Theme + Toasts + Mobile sheet
------------------------------ */
function setTheme(theme){
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  const btn = $("themeToggle");
  if(btn) btn.textContent = (theme === "light") ? "☀️" : "🌙";
}
setTheme(localStorage.getItem("theme") || "dark");
$("themeToggle")?.addEventListener("click", ()=>{
  const cur = document.body.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
  toast(lang==="fa" ? "تم عوض شد" : "Theme switched", "ok");
});

function toast(message, kind="ok", title=""){
  const host = $("toastHost");
  if(!host) return;
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  const ttl = title || (kind==="ok" ? (lang==="fa"?"اوکی":"OK") : kind==="warn" ? (lang==="fa"?"هشدار":"Warning") : (lang==="fa"?"خطا":"Error"));
  t.innerHTML = `<div class="tTitle">${ttl}</div><div class="tMsg">${message}</div>`;
  host.appendChild(t);
  setTimeout(()=>{t.style.opacity="0";t.style.transform="translateY(6px)";}, 3200);
  setTimeout(()=>{t.remove();}, 3800);
}

// Bottom sheet behavior on mobile
const panel = $("panel");
$("sheetHandle")?.addEventListener("click", ()=>{
  panel?.classList.toggle("open");
  // Leaflet sometimes needs a resize tick after layout changes
  if(map) setTimeout(()=>map.invalidateSize(true), 80);
});

/* ------------------------------
   Data loading (meta + binaries)
------------------------------ */
const state = {
  index: null,
  runId: null,
  runPath: null,
  variant: "auto",
  latestBase: localStorage.getItem("latestBase") || "docs/latest",
  species: localStorage.getItem("species") || "skipjack",
  model: localStorage.getItem("model") || "scoring",
  map: localStorage.getItem("map") || "phab",
  agg: localStorage.getItem("agg") || "p90",
  temporalView: localStorage.getItem("temporalView") || "instant",
  temporalTintEnabled: (localStorage.getItem("temporalTintEnabled") ?? "1") === "1",
  temporalTintMetric: localStorage.getItem("temporalTintMetric") || "duration",
  onlyStableCells: (localStorage.getItem("onlyStableCells") ?? "0") === "1",
  stablePreset: localStorage.getItem("stablePreset") || "normal",
  gridVisible: (localStorage.getItem("gridVisible") ?? "1") === "1",
  gridMode: localStorage.getItem("gridMode") || "utm",
  coordMode: localStorage.getItem("coordMode") || "utm",
  times: [],
  t0: null,
  t1: null,
  grid: null,
  mask: null,          // Uint8Array
  meta: null,          // species meta.json
  cache: new Map(),    // url -> typed array
  overlay: null,
  canvas: null,
  ctx: null,
  playing: false,
  autoCompute: false,
  dirty: true,
  userAoi: null,
  userMask: null,
  filterAoi: null,
  filterMask: null,
  timer: null,
  qcOn: true,
  gapOn: false,
  qcMaskCache: new Map(), // timeId-> Uint8Array
  // Rendering toggles
  renderFlipY: false,
  dataNorthFirst: true, // ✅ row0 is NORTH (fixes flip confusion)
  boundsPad: true,
  // Manual georeferencing tweak (degrees): shifts raster/click mapping without touching data
  manualLatOffset: Number(localStorage.getItem("manualLatOffset") ?? -0.35),
  manualLonOffset: Number(localStorage.getItem("manualLonOffset") ?? -0.01242),

};

function selectedEndTimeId(){
  const sel = $("t1Select");
  if(sel && sel.value){
    const direct = state.isoToTimeId?.[sel.value] || timeIdFromIso(sel.value);
    if(direct) return direct;
  }
  const idx = sel?.selectedIndex;
  if(Number.isFinite(idx) && idx >= 0){
    const tid = state.timeIds?.[idx];
    if(tid) return tid;
  }
  return state.timeIds?.[state.timeIds.length-1] || null;
}

function currentTemporalSummaryKey(){
  if(state.map === 'pcatch') return `pcatch_${state.model || $("modelSelect")?.value || 'scoring'}`;
  return currentPhabKey();
}

function speciesBasePath(){
  if(!state.runPath || !state.variant || !state.species) return null;
  return `${state.runPath}/variants/${state.variant}/species/${state.species}`;
}

function summaryFileUrl(rel){
  if(typeof rel !== 'string' || !rel) return null;
  const clean = rel.replace(/^\.\//,'').replace(/^\/+/, '');
  if(/^https?:/i.test(clean)) return clean;
  if(clean.startsWith('docs/latest/') || clean.startsWith('latest/')) return latestUrl(clean.replace(/^docs\/latest\//,'').replace(/^latest\//,''));
  const base = speciesBasePath();
  if(clean.startsWith('runs/')) return latestUrl(clean);
  return latestUrl(`${base}/${clean}`.replace(/\/+/g,'/'));
}

async function loadSummaryManifest(){
  try{
    state.summaryManifest = await fetchJson(latestUrl('summary_manifest.json'));
    return state.summaryManifest;
  }catch(_){ state.summaryManifest = null; return null; }
}

async function loadSummaryReport(){
  try{
    state.summaryReport = await fetchJson(latestUrl('summary_report.json'));
    return state.summaryReport;
  }catch(_){ state.summaryReport = null; return null; }
}

async function loadUiConfig(){
  try{
    state.uiConfig = await fetchJson(latestUrl('ui_config.json'));
    return state.uiConfig;
  }catch(_){ state.uiConfig = null; return null; }
}

function currentSummaryManifestEntry(){
  const key = currentTemporalSummaryKey();
  const bySpecies = state.summaryManifest?.by_species || {};
  const bucket = bySpecies?.[state.species];
  let entry = null;
  if(Array.isArray(bucket)){
    entry = bucket.find(e => e.key === key && e.variant === state.variant && e.run === state.runId) || null;
  }else if(bucket && typeof bucket === 'object'){
    const cand = bucket[key];
    if(cand && (!cand.variant || cand.variant === state.variant) && (!cand.run || cand.run === state.runId)) entry = cand;
  }
  if(!entry){
    const entries = state.summaryManifest?.entries || [];
    entry = entries.find(e => e.key === key && e.species === state.species && e.variant === state.variant && e.run === state.runId) || null;
  }
  return entry || null;
}

function currentSummaryReportBucket(){
  const rpt = state.summaryReport || {};
  const bySpecies = rpt.by_species || {};
  return bySpecies?.[state.species] || null;
}

function currentSummaryReportEntry(){
  const key = currentTemporalSummaryKey();
  const rpt = state.summaryReport || {};
  const bucket = currentSummaryReportBucket();
  if(Array.isArray(bucket)){
    const found = bucket.find(e => e && e.key === key && (!e.variant || e.variant === state.variant) && (!e.run || e.run === state.runId));
    if(found) return found;
  }
  if(bucket && typeof bucket === 'object'){
    const direct = bucket[key];
    if(direct && (!direct.variant || direct.variant === state.variant) && (!direct.run || direct.run === state.runId)) return direct;
    const latestEnd = bucket.latest_end_time_by_key?.[key] || rpt.latest_by_species?.[state.species]?.[key] || null;
    return {
      species: state.species,
      key,
      latest_end_time_id: latestEnd,
      top_n: Number.isFinite(rpt.top_n) ? rpt.top_n : null,
      window_hours: Number.isFinite(rpt.window_hours) ? rpt.window_hours : null,
      step_hours: Number.isFinite(rpt.step_hours) ? rpt.step_hours : null,
      threshold: Number.isFinite(rpt.threshold) ? rpt.threshold : null,
      keys: Array.isArray(bucket.keys) ? bucket.keys : [],
      entry_count: Number.isFinite(bucket.entry_count) ? bucket.entry_count : null,
      variant: bucket.variant_by_key?.[key] || null,
      run: bucket.run_by_key?.[key] || null,
      prefix: bucket.prefix_by_key?.[key] || null,
      summary_assets: bucket.summary_assets_by_key?.[key] || {},
      summary_paths: bucket.summary_paths_by_key?.[key] || {},
      summary_config: bucket.summary_config_by_key?.[key] || {},
    };
  }
  return null;
}

function summaryConfigForCurrentKey(){
  const key = currentTemporalSummaryKey();
  const cfg = state?.meta?.summary_config?.[key];
  if(cfg) return cfg;
  const man = currentSummaryManifestEntry()?.summary_config;
  if(man) return man;
  return currentSummaryReportEntry()?.summary_config || {};
}

function getTemporalSummaryTemplates(){
  const key = currentTemporalSummaryKey();
  const paths = state?.meta?.summary_paths?.[key];
  if(paths) return paths;
  const man = currentSummaryManifestEntry()?.summary_paths;
  if(man) return man;
  return currentSummaryReportEntry()?.summary_paths || {};
}

function getTemporalSummaryAssets(){
  const key = currentTemporalSummaryKey();
  const assets = state?.meta?.summary_assets?.[key];
  if(assets) return assets;
  const man = currentSummaryManifestEntry()?.summary_assets;
  if(man) return man;
  return currentSummaryReportEntry()?.summary_assets || {};
}


function currentExportsConfig(){
  const uiExp = state.uiConfig?.exports || {};
  const rptExp = state.summaryReport?.exports || {};
  return {
    ...rptExp,
    ...uiExp,
  };
}

function applyUiConfigDefaults(){
  const ui = state.uiConfig?.ui || {};
  const exportsCfg = currentExportsConfig();
  if(localStorage.getItem('model') == null && ui.default_model) state.model = ui.default_model;
  if(localStorage.getItem('map') == null && ui.default_map) state.map = ui.default_map;
  const defaultTemporal = ui.default_temporal_view || ui.default_temporal_mode;
  const defaultGridMode = ui.default_grid_mode || ui.grid_mode_default;
  const gridVisible = (typeof ui.grid_visible === 'boolean') ? ui.grid_visible : ui.grid_enabled;
  const tintEnabled = (typeof ui.temporal_tint_enabled === 'boolean') ? ui.temporal_tint_enabled : ui.tint_enabled;
  const tintMetric = ui.temporal_tint_metric || ui.tint_metric;
  if(localStorage.getItem('temporalView') == null && defaultTemporal) state.temporalView = defaultTemporal;
  if(localStorage.getItem('gridMode') == null && defaultGridMode) state.gridMode = defaultGridMode;
  if(localStorage.getItem('gridVisible') == null && typeof gridVisible === 'boolean') state.gridVisible = !!gridVisible;
  if(localStorage.getItem('temporalTintEnabled') == null && typeof tintEnabled === 'boolean') state.temporalTintEnabled = !!tintEnabled;
  if(localStorage.getItem('temporalTintMetric') == null && tintMetric) state.temporalTintMetric = tintMetric;
  const reportTopN = Number.isFinite(state.summaryReport?.top_n) ? state.summaryReport.top_n : null;
  const reportExportsTopN = Number.isFinite(state.summaryReport?.exports?.top_n) ? state.summaryReport.exports.top_n : null;
  const configuredTopN = Number.isFinite(exportsCfg.top_n) ? exportsCfg.top_n : (reportExportsTopN ?? reportTopN);
  if($('topLimit') && configuredTopN && (!$('topLimit').dataset.userSet || $('topLimit').dataset.userSet !== '1')){
    $('topLimit').value = String(configuredTopN);
  }
}

// --- Click suppression for priority markers ---
// We use both a timestamp (until) and a simple boolean alias for easy debugging in console.
// Note: Leaflet may still propagate clicks unless we explicitly stop propagation on marker events.
state.__suppressMapClickUntil = 0;
state.__suppressMapClick = false;

function suppressNextMapClick(ms=250){
  state.__suppressMapClick = true;
  state.__suppressMapClickUntil = Date.now() + ms;
}

function isMapClickSuppressed(){
  const on = Date.now() < (state.__suppressMapClickUntil || 0);
  state.__suppressMapClick = on;
  return on;
}

// Ensure Leaflet bounds exist. meta.grid provides lon/lat min/max but not bounds.
// Leaflet imageOverlay expects [[S,W],[N,E]] in lat/lon.


function currentStableAssetsBase(){
  const endTid = selectedEndTimeId();
  const assets = getTemporalSummaryAssets();
  const jsonTpl = assets?.json || assets?.geojson || assets?.csv;
  if(endTid && jsonTpl){
    const resolved = summaryFileUrl(jsonTpl.replaceAll('{time_id}', endTid).replaceAll('{time}', endTid));
    if(resolved) return resolved.replace(/\/[^\/]+$/, '');
  }
  const base = speciesBasePath();
  if(!base || !endTid) return null;
  return latestUrl(`${base}/summary/by_end_time/${endTid}`.replace(/\/+/g,'/'));
}

async function tryFetchStablePointsAsset(){
  state._stableAssetCache = state._stableAssetCache || new Map();
  const cacheKey = `${currentTemporalSummaryKey()}:${selectedEndTimeId()||""}`;
  if(state._stableAssetCache.has(cacheKey)) return state._stableAssetCache.get(cacheKey);
  const endTid = selectedEndTimeId();
  const assets = getTemporalSummaryAssets();
  const candidates = [];
  const add = (rel)=>{ if(typeof rel === 'string' && rel.length) candidates.push(rel.replaceAll('{time_id}', endTid || '').replaceAll('{time}', endTid || '')); };
  add(assets?.json);
  add(assets?.geojson);
  const key = currentTemporalSummaryKey();
  const suffix = `${temporalWindowHours()}h`;
  candidates.push(`summary/by_end_time/${endTid}/${key}_top_stable_points_${suffix}.json`);
  candidates.push(`summary/by_end_time/${endTid}/${key}_top_stable_points_${suffix}.geojson`);
  for(const rel of candidates){
    try{
      const url = summaryFileUrl(rel);
      if(!url) continue;
      const r = await fetch(url, {cache:'no-store'});
      if(r.ok){ const data = await r.json(); state._stableAssetCache.set(cacheKey, data); return data; }
    }catch(_){ }
  }
  state._stableAssetCache.set(cacheKey, null);
  return null;
}

function ensureGridBounds(){
  if(!state.grid) return null;
  const g = state.grid;
  const latMin = g.lat_min, latMax = g.lat_max;
  const lonMin = g.lon_min, lonMax = g.lon_max;
  const W = g.width, H = g.height;
  if([latMin, latMax, lonMin, lonMax, W, H].every(Number.isFinite)){
    const dx = (lonMax-lonMin) / Math.max(1,(W-1));
    const dy = (latMax-latMin) / Math.max(1,(H-1));
    const pad = !!state.boundsPad;
    const b = pad
      ? [[latMin - dy/2, lonMin - dx/2],[latMax + dy/2, lonMax + dx/2]]
      : [[latMin, lonMin],[latMax, lonMax]];
    // Apply manual offsets (if any)
    const dLat = Number(state.manualLatOffset||0);
    const dLon = Number(state.manualLonOffset||0);
    if(dLat || dLon){
      b[0][0] += dLat; b[1][0] += dLat;
      b[0][1] += dLon; b[1][1] += dLon;
    }
    g.bounds = b;
    return b;
  }
  const bb = g.bbox;
  if(Array.isArray(bb) && bb.length===4){
    const b = [[bb[1], bb[0]],[bb[3], bb[2]]];
    const dLat = Number(state.manualLatOffset||0);
    const dLon = Number(state.manualLonOffset||0);
    if(dLat || dLon){ b[0][0]+=dLat; b[1][0]+=dLat; b[0][1]+=dLon; b[1][1]+=dLon; }
    g.bounds = b;
    return b;
  }
  state._stableAssetCache.set(cacheKey, null);
  return null;
}



// Convert between grid pixel coords (x,y) and lat/lon using current bounds + flip
function xyToLatLon(x, y){
  const g = state.grid; if(!g) return null;
  const W=g.width, H=g.height;
  const b = ensureGridBounds(); if(!b) return null;
  const south=b[0][0], west=b[0][1], north=b[1][0], east=b[1][1];
  const xCl = Math.max(0, Math.min(W-1, x));
  const yCl = Math.max(0, Math.min(H-1, y));
    const yImg = state.dataNorthFirst ? yCl : (H-1 - yCl); // image-space y (0=north)
  const fx = (W<=1) ? 0 : (xCl/(W-1));
  const fy = (H<=1) ? 0 : (yImg/(H-1));
  const lon = west + fx*(east-west);
  const lat = north - fy*(north-south);
  return {lat, lon};
}
function latLonToXY(lat, lon){
  const g = state.grid; if(!g) return null;
  const W=g.width, H=g.height;
  const b = ensureGridBounds(); if(!b) return null;
  const south=b[0][0], west=b[0][1], north=b[1][0], east=b[1][1];
  if(lat<south || lat>north || lon<west || lon>east) return null;
  const fx = (lon - west) / (east - west);
  const fyN = (north - lat) / (north - south); // image y (0=north)
  const x = Math.max(0, Math.min(W-1, Math.round(fx*(W-1))));
  const yImg = Math.max(0, Math.min(H-1, Math.round(fyN*(H-1))));
    const y = state.dataNorthFirst ? yImg : (H-1 - yImg);
  return {x,y,i:y*W+x};
}

function fmtTime(isoZ){
  try{
    const d = new Date(isoZ);
    return d.toISOString().slice(0,16).replace("T"," ");
  }catch{ return isoZ; }
}
function timeIdFromIso(isoZ){
  // Prefer run-provided time_ids mapping (supports index-style folders like 0000..0143)
  if(state && state.isoToTimeId && state.isoToTimeId[isoZ]) return state.isoToTimeId[isoZ];
  if(typeof isoZ !== "string") return "";
  // Fallback: sanitize ISO (legacy demo runs)
  return isoZ.replace(/[:\-]/g, "").replace("T","_").replace("Z","");
}

function timeIdToIso(tid){
  // Expected: YYYYMMDD_HHMMZ
  try{
    const m = String(tid).match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})Z$/);
    if(!m) return String(tid);
    const [_, y, mo, d, hh, mm] = m;
    return `${y}-${mo}-${d}T${hh}:${mm}:00Z`;
  }catch{ return String(tid); }
}

async function resolveLatestBase(){
  const candidates = [
    state.latestBase || "docs/latest",
    "docs/latest",
    "./docs/latest",
    "latest",
    "./latest",
    "../docs/latest",
    "../latest",
  ];
  let lastErr = null;
  for(const raw of candidates){
    const base = String(raw || "docs/latest").replace(/\/$/, "");
    try{
      const r = await fetch(`${base}/meta_index.json`, {cache:"no-store"});
      if(r.ok){
        state.latestBase = base.replace(/^\.\//, "");
        localStorage.setItem("latestBase", state.latestBase);
        return state.latestBase;
      }
      lastErr = new Error(`HTTP ${r.status} ${base}/meta_index.json`);
    }catch(err){
      lastErr = err;
    }
  }
  throw lastErr || new Error("Could not resolve docs/latest/meta_index.json");
}
function latestUrl(rel){
  const base = String(state.latestBase || "docs/latest").replace(/\/$/, "");
  const clean = String(rel || "").replace(/^\/+/, "").replace(/^latest\//, "");
  return `${base}/${clean}`;
}
function normalizeDataUrl(url){
  if(!url || typeof url !== "string") return url;
  if(/^https?:/i.test(url)) return url;
  if(url.startsWith("docs/latest/")) return url;
  if(url.startsWith("./docs/latest/") || url.startsWith("../docs/latest/")) return url;
  if(/^((\.\.?\/)?latest\/)/.test(url)){
    const rel = url.replace(/^((\.\.?\/)?latest\/)/, "");
    return latestUrl(rel);
  }
  return url;
}
async function fetchJson(url){
  const finalUrl = normalizeDataUrl(url);
  const r = await fetch(finalUrl, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${finalUrl}`);
  return r.json();
}
async function fetchBin(url, dtype){
  const finalUrl = normalizeDataUrl(url);
  if(state.cache.has(finalUrl)) return state.cache.get(finalUrl);
  const r = await fetch(finalUrl, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${finalUrl}`);
  const buf = await r.arrayBuffer();
  let out;
  if(dtype === "f32") out = new Float32Array(buf);
  else if(dtype === "u8") out = new Uint8Array(buf);
  else if(dtype === "u16") out = new Uint16Array(buf);
  else out = buf;
  state.cache.set(finalUrl, out);
  return out;
}


function pointInRing(lon, lat, ring){
  // ray casting; ring: [[lon,lat],...]
  let inside = false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1];
    const xj=ring[j][0], yj=ring[j][1];
    const intersect = ((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);
    if(intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lon, lat, poly){
  // poly: [outerRing, hole1, hole2...]
  if(!poly || !poly.length) return false;
  if(!pointInRing(lon,lat,poly[0])) return false;
  for(let h=1;h<poly.length;h++){
    if(pointInRing(lon,lat,poly[h])) return false;
  }
  return true;
}
function pointInGeoJSON(lon, lat, gj){
  if(!gj) return false;
  const g = gj.type==="Feature" ? gj.geometry : (gj.type==="FeatureCollection" ? null : gj);
  if(g){
    const t=g.type;
    if(t==="Polygon") return pointInPolygon(lon,lat,g.coordinates);
    if(t==="MultiPolygon") return g.coordinates.some(p=>pointInPolygon(lon,lat,p));
    return false;
  }
  if(gj.type==="FeatureCollection"){
    return gj.features.some(f=>{
      const gg=f.geometry;
      if(!gg) return false;
      if(gg.type==="Polygon") return pointInPolygon(lon,lat,gg.coordinates);
      if(gg.type==="MultiPolygon") return gg.coordinates.some(p=>pointInPolygon(lon,lat,p));
      return false;
    });
  }
  return false;
}
function buildMaskFromGeoJSON(gj){
  const W = state.grid.width, H = state.grid.height;
  const lonMin = state.grid.lon_min, lonMax = state.grid.lon_max;
  const latMin = state.grid.lat_min, latMax = state.grid.lat_max;
  const dx = (lonMax - lonMin) / (W-1);
  const dy = (latMax - latMin) / (H-1);
  const m = new Uint8Array(W*H);
  for(let r=0;r<H;r++){
    const lat = latMax - r*dy;
    for(let c=0;c<W;c++){
      const lon = lonMin + c*dx;
      const idx = r*W+c;
      // Respect server land/valid mask if present
      if(state.baseMask && state.baseMask[idx]===0){ m[idx]=0; continue; }
      m[idx] = pointInGeoJSON(lon,lat,gj) ? 1 : 0;
    }
  }
  return m;
}
function combineMask(base, extra){
  if(!extra) return base;
  const out = new Uint8Array(base.length);
  for(let i=0;i<base.length;i++){
    out[i] = (base[i] && extra[i]) ? 1 : 0;
  }
  return out;
}
/* ------------------------------
   Leaflet map
------------------------------ */
let map, imageOverlay, markerLayer;
function initMap(){
  map = L.map('map', {preferCanvas:true});
  // 🗺️ Basemap with automatic fallback
  // In some networks/regions the default OSM tile endpoint may be blocked or rate-limited.
  // If we detect repeated tile errors, we automatically switch to a mirror.
  const basemaps = [
    {
      name: "OSM",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      opts: { subdomains: "abc", maxZoom: 18, attribution: "&copy; OpenStreetMap" }
    },
    {
      name: "Carto",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      opts: { subdomains: "abcd", maxZoom: 19, attribution: "&copy; CARTO" }
    },
    {
      name: "Esri",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      opts: { maxZoom: 19, attribution: "Tiles &copy; Esri" }
    }
  ];

  let baseIdx = 0;
  let tileErrors = 0;
  let baseLayer = null;

  function setBase(i){
    baseIdx = i % basemaps.length;
    tileErrors = 0;
    if(baseLayer) map.removeLayer(baseLayer);
    const bm = basemaps[baseIdx];
    baseLayer = L.tileLayer(bm.url, {
      ...bm.opts,
      // allow images to load cross-origin without tainting (helps PNG export in some browsers)
      crossOrigin: true,
    }).addTo(map);
    baseLayer.on("tileerror", ()=>{
      tileErrors++;
      // If too many tile errors early on, fallback.
      if(tileErrors === 8){
        console.warn("Basemap tile errors; switching basemap to", basemaps[(baseIdx+1)%basemaps.length].name);
        setBase(baseIdx+1);
      }
    });
  }
  setBase(0);
  markerLayer = L.layerGroup().addTo(map);

  // ✅ IMPORTANT: Leaflet (and leaflet-draw) expects the map to have an initial
  // center + zoom. If we don't set it, enabling draw/edit tools can throw:
  // "Set map center and zoom first." (because map.getCenter() is called before load).
  // We set a sane default center for the Arabian Sea, then we later fitBounds()
  // after loading meta/grid.
  try{
    map.setView([12.0, 54.0], 5);
  }catch(_){/* ignore */}

  map.on("click", (e)=>{
    if(!e?.latlng) return;
    if(isMapClickSuppressed()) return;
    $("fbLat").value = e.latlng.lat.toFixed(4);
    $("fbLon").value = e.latlng.lng.toFixed(4);
  });

  // Click anywhere (when not drawing AOI) to show point details popup
  map.on("click", (e)=>{
    try{
      if(isMapClickSuppressed()) return;
      if(($("aoiMode")?.value)==="draw") return; // avoid interfering with drawing
      showPointPopup(e.latlng.lat, e.latlng.lng);
    }catch(_){}
  });

  // offscreen canvas
  state.canvas = document.createElement("canvas");
  state.ctx = state.canvas.getContext("2d", {willReadFrequently:false});
  try{ afterMapInit_v22(); }catch(_){ }
}

/* ------------------------------
   v22: Grid 0.5°, AOI, Time slider, DBSCAN clustering, Auto-analyze
------------------------------ */
let gridLayer = null;
let gridLabelLayer = null;
let aoiRect = null;
let aoiStart = null;
let clusterLayer = null;
let clusterCenters = null;
let clusterTopLayer = null;
let hoverTooltip = null;

// Create panes used for our custom layers
function ensurePanes(){
  if(!map) return;

  // Raster pane (image overlay) - should never block clicks
  if(!map.getPane("rasterPane")){
    map.createPane("rasterPane");
    map.getPane("rasterPane").style.zIndex = 420;
    map.getPane("rasterPane").style.pointerEvents = "none";
  }

  // Grid pane (lines + labels)
  if(!map.getPane("gridPane")){
    map.createPane("gridPane");
    map.getPane("gridPane").style.zIndex = 450;
    map.getPane("gridPane").style.pointerEvents = "none";
  }

  // Cluster polygon pane
  if(!map.getPane("clusterPane")){
    map.createPane("clusterPane");
    map.getPane("clusterPane").style.zIndex = 460;
  }

  // Cluster important points (centers + top-10)
  if(!map.getPane("clusterTopPane")){
    map.createPane("clusterTopPane");
    map.getPane("clusterTopPane").style.zIndex = 470;
  }

  // Global top-10 points pane
  if(!map.getPane("topPointPane")){
    map.createPane("topPointPane");
    map.getPane("topPointPane").style.zIndex = 480;
  }
}




// Draw grid in either geographic degrees or UTM kilometres
function getCurrentGridMode(){
  return $("gridModeSelect")?.value || state.gridMode || "utm";
}
function setCurrentGridMode(mode){
  state.gridMode = mode || "utm";
  if(!state.coordMode) state.coordMode = state.gridMode;
  localStorage.setItem("gridMode", state.gridMode);
  const gSel = $("gridModeSelect");
  const cSel = $("coordModeSelect");
  if(gSel) gSel.value = state.gridMode;
  if(cSel) cSel.value = state.coordMode;
}
function getCurrentCoordMode(){
  return $("coordModeSelect")?.value || state.coordMode || getCurrentGridMode() || "utm";
}
function setCurrentCoordMode(mode){
  state.coordMode = mode || state.gridMode || "utm";
  localStorage.setItem("coordMode", state.coordMode);
  const cSel = $("coordModeSelect");
  if(cSel) cSel.value = state.coordMode;
}
function getUtmZone(lon){
  return Math.max(1, Math.min(60, Math.floor((lon + 180)/6) + 1));
}
function getUtmProj(zone, south){
  return `+proj=utm +zone=${zone} ${south ? "+south" : ""} +datum=WGS84 +units=m +no_defs`;
}
function latLonToUtm(lat, lon){
  if(typeof proj4 !== "function" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const zone = getUtmZone(lon);
  const south = lat < 0;
  const p = proj4("EPSG:4326", getUtmProj(zone, south), [lon, lat]);
  return {zone, south, hemisphere: south ? "S" : "N", easting: p[0], northing: p[1]};
}
function utmToLatLon(easting, northing, zone, south){
  if(typeof proj4 !== "function") return null;
  const p = proj4(getUtmProj(zone, south), "EPSG:4326", [easting, northing]);
  return {lon: p[0], lat: p[1]};
}
function utmSpacingForZoom(z){
  if(z >= 10) return 10000;
  if(z >= 8) return 25000;
  if(z >= 6) return 50000;
  return 100000;
}
function sampleUtmLine(constantValue, variableMin, variableMax, zone, south, isEasting){
  const pts = [];
  const steps = 20;
  for(let i=0;i<=steps;i++){
    const t = i / steps;
    const variable = variableMin + (variableMax - variableMin) * t;
    const ll = isEasting
      ? utmToLatLon(constantValue, variable, zone, south)
      : utmToLatLon(variable, constantValue, zone, south);
    if(ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lon)) pts.push([ll.lat, ll.lon]);
  }
  return pts;
}
function drawGeoGrid(bounds, z){
  const south=bounds.getSouth(), north=bounds.getNorth(), west=bounds.getWest(), east=bounds.getEast();
  const step = 0.5;
  const lat0 = Math.floor(south/step)*step;
  const lat1 = Math.ceil(north/step)*step;
  const lon0 = Math.floor(west/step)*step;
  const lon1 = Math.ceil(east/step)*step;
  const lines=[];
  for(let lat=lat0; lat<=lat1+1e-9; lat+=step){
    lines.push(L.polyline([[lat, lon0],[lat, lon1]], {pane:"gridPane", weight:1, opacity:0.22, color:"#ffffff"}));
  }
  for(let lon=lon0; lon<=lon1+1e-9; lon+=step){
    lines.push(L.polyline([[lat0, lon],[lat1, lon]], {pane:"gridPane", weight:1, opacity:0.22, color:"#ffffff"}));
  }
  gridLayer = L.layerGroup(lines).addTo(map);

  const labelStep = (z>=7) ? 0.5 : (z>=5 ? 1.0 : 2.0);
  const latL0 = Math.floor(south/labelStep)*labelStep;
  const latL1 = Math.ceil(north/labelStep)*labelStep;
  const lonL0 = Math.floor(west/labelStep)*labelStep;
  const lonL1 = Math.ceil(east/labelStep)*labelStep;
  const labels=[];
  const padLat = (north-south)*0.05;
  const padLon = (east-west)*0.05;
  for(let lat=latL0; lat<=latL1+1e-9; lat+=labelStep){
    const icon = L.divIcon({className:"", html:`<div class="gridLabel gridLabelLat">${lat.toFixed(1)}°</div>`, iconSize:[1,1]});
    labels.push(L.marker([lat, west+padLon], {pane:"gridPane", icon, interactive:false}));
  }
  for(let lon=lonL0; lon<=lonL1+1e-9; lon+=labelStep){
    const icon = L.divIcon({className:"", html:`<div class="gridLabel gridLabelLon">${lon.toFixed(1)}°</div>`, iconSize:[1,1]});
    labels.push(L.marker([north-padLat, lon], {pane:"gridPane", icon, interactive:false}));
  }
  gridLabelLayer = L.layerGroup(labels).addTo(map);
}
function drawUtmGrid(bounds, z){
  if(typeof proj4 !== "function") return drawGeoGrid(bounds, z);
  const center = bounds.getCenter();
  const zone = getUtmZone(center.lng);
  const southHem = center.lat < 0;
  const corners = [
    latLonToUtm(bounds.getSouth(), bounds.getWest()),
    latLonToUtm(bounds.getSouth(), bounds.getEast()),
    latLonToUtm(bounds.getNorth(), bounds.getWest()),
    latLonToUtm(bounds.getNorth(), bounds.getEast()),
  ].filter(Boolean);
  if(!corners.length) return drawGeoGrid(bounds, z);
  const eastings = corners.map(c=>c.easting);
  const northings = corners.map(c=>c.northing);
  const minE = Math.min(...eastings), maxE = Math.max(...eastings);
  const minN = Math.min(...northings), maxN = Math.max(...northings);
  const spacing = utmSpacingForZoom(z);
  const e0 = Math.floor(minE / spacing) * spacing;
  const e1 = Math.ceil(maxE / spacing) * spacing;
  const n0 = Math.floor(minN / spacing) * spacing;
  const n1 = Math.ceil(maxN / spacing) * spacing;
  const lines=[];
  const labels=[];
  for(let e=e0; e<=e1+1e-9; e+=spacing){
    const pts = sampleUtmLine(e, n0, n1, zone, southHem, true);
    if(pts.length>1) lines.push(L.polyline(pts, {pane:"gridPane", weight:1, opacity:0.22, color:"#ffffff"}));
    const anchor = utmToLatLon(e, n0, zone, southHem);
    if(anchor){
      const icon = L.divIcon({className:"", html:`<div class="gridLabel gridLabelLon">${Math.round(e/1000)} kmE</div>`, iconSize:[1,1]});
      labels.push(L.marker([anchor.lat, anchor.lon], {pane:"gridPane", icon, interactive:false}));
    }
  }
  for(let n=n0; n<=n1+1e-9; n+=spacing){
    const pts = sampleUtmLine(n, e0, e1, zone, southHem, false);
    if(pts.length>1) lines.push(L.polyline(pts, {pane:"gridPane", weight:1, opacity:0.22, color:"#ffffff"}));
    const anchor = utmToLatLon(e0, n, zone, southHem);
    if(anchor){
      const icon = L.divIcon({className:"", html:`<div class="gridLabel gridLabelLat">${Math.round(n/1000)} kmN • Z${zone}${southHem?"S":"N"}</div>`, iconSize:[1,1]});
      labels.push(L.marker([anchor.lat, anchor.lon], {pane:"gridPane", icon, interactive:false}));
    }
  }
  gridLayer = L.layerGroup(lines).addTo(map);
  gridLabelLayer = L.layerGroup(labels).addTo(map);
}
function drawGrid05(){
  if(!map) return;
  ensurePanes();
  if(gridLayer){ try{ gridLayer.remove(); }catch(_){} gridLayer=null; }
  if(gridLabelLayer){ try{ gridLabelLayer.remove(); }catch(_){} gridLabelLayer=null; }
  if(!$('gridToggle')?.checked) return;
  const bounds = map.getBounds();
  const mode = getCurrentGridMode();
  const z = map.getZoom();
  if(mode === 'utm') drawUtmGrid(bounds, z);
  else drawGeoGrid(bounds, z);
}
function formatLatLonDeg(lat, lon){
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
function formatUtm(lat, lon){
  const utm = latLonToUtm(lat, lon);
  if(!utm) return 'UTM unavailable';
  return `Z${utm.zone}${utm.hemisphere} • E ${Math.round(utm.easting)} • N ${Math.round(utm.northing)}`;
}
function formatPopupCoords(lat, lon){
  const primary = getCurrentCoordMode() === 'geo'
    ? `<div><b>Lat/Lon:</b> ${formatLatLonDeg(lat, lon)}</div><div><b>UTM:</b> ${formatUtm(lat, lon)}</div>`
    : `<div><b>UTM:</b> ${formatUtm(lat, lon)}</div><div><b>Lat/Lon:</b> ${formatLatLonDeg(lat, lon)}</div>`;
  return primary;
}
function setAOI(bounds){
  state.aoiBounds = bounds || null;
  if(aoiRect){ try{ aoiRect.remove(); }catch(_){} aoiRect=null; }
  if(bounds && map){
    ensurePanes();
    aoiRect = L.rectangle(bounds, {pane:"clusterPane", color:"#F1C40F", weight:2, fillOpacity:0.05, interactive:false}).addTo(map);
  }
}

function computeAOIBounds(){
  const mode = $("aoiMode")?.value || "full";
  if(mode==="full"){
    const g = state.grid;
    return L.latLngBounds([g.lat_min, g.lon_min],[g.lat_max, g.lon_max]);
  }
  if(mode==="view" && map) return map.getBounds();
  if(mode==="draw") return state.aoiBounds || null;
  state._stableAssetCache.set(cacheKey, null);
  return null;
}

// Distribution + dynamic scaling inside AOI (for color scale and percentiles)
function computeScaleAndPercentiles(arr01){
  const aoi = computeAOIBounds();
  const g = state.grid;
  const W=g.width, H=g.height;
  const vals=[];
  for(let y=0;y<H;y++){
    const lat = g.lat_max - (g.lat_max-g.lat_min)*(y/(H-1));
    for(let x=0;x<W;x++){
      const lon = g.lon_min + (g.lon_max-g.lon_min)*(x/(W-1));
      if(aoi && !aoi.contains([lat,lon])) continue;
      const v = arr01[y*W+x];
      if(Number.isFinite(v)) vals.push(v);
    }
  }
  vals.sort((a,b)=>a-b);
  state._distVals = vals;
  if(!vals.length){ state.scaleMin=0; state.scaleMax=1; return; }
  const pick = (q)=> vals[Math.min(vals.length-1, Math.max(0, Math.floor(q*(vals.length-1))))];
  state.scaleMin = pick(0.02);
  state.scaleMax = pick(0.98);
}

function percentileOfValue(v){
  const a = state._distVals || [];
  if(!a.length || !Number.isFinite(v)) return null;
  let lo=0, hi=a.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(a[mid] <= v) lo=mid+1; else hi=mid;
  }
  return lo / a.length;
}

// Show point information (any grid cell) on map click
let __infoPopup = null;
function openInfoPopup(latlng, html){
  if(!map) return;
  if(__infoPopup) try{ map.closePopup(__infoPopup); }catch(_){}
  __infoPopup = L.popup({maxWidth: 420, closeButton:true})
    .setLatLng(latlng)
    .setContent(html);
  __infoPopup.openOn(map);
}

function gridIndexFromLatLon(lat, lon){
  return latLonToXY(lat, lon);
}

function snapLatLonToGridCell(lat, lon){
  const idx = gridIndexFromLatLon(lat, lon);
  if(!idx) return null;
  const center = xyToLatLon(idx.x, idx.y);
  if(!center) return null;
  return { ...center, idx };
}

function rankFromPercentile(pct){
  const n = state._distVals?.length || 0;
  if(!n || pct==null) return null;
  return Math.max(1, Math.round((1-pct)*n));
}

// lightweight per-time array cache for click popups
state._binCache = state._binCache || new Map();
async function getValueAtIndexForKey(timeIso, key, idx){
  const tid = timeIdFromIso(timeIso);
  const cacheKey = `${tid}:${key}`;
  let arr = state._binCache.get(cacheKey);
  if(!arr){
    const tpl = state.meta?.paths?.per_time?.[key];
    if(!tpl) return null;
    const url = latestUrl(`${state.runPath}/${tpl.replace("{time}", tid).replace("{time_id}", tid)}`);
    arr = await fetchBin(url, "f32");
    state._binCache.set(cacheKey, arr);
    // simple cache size limit
    if(state._binCache.size > 12){
      const first = state._binCache.keys().next().value;
      state._binCache.delete(first);
    }
  }
  const v = arr?.[idx.i];
  return Number.isFinite(v) ? v : null;
}

async function showPointPopup(lat, lon, metaInfo){
  try{
    if(!state.grid) return;
    const idx = gridIndexFromLatLon(lat, lon);
    if(!idx) return;

    const tIdx = getSelectedTimeIndex();
    const timeIso = state.times?.[tIdx] || $("t1Select")?.value || "";
    const timeId = getSelectedTimeId();

    const arr = state.lastComputed?.arrShown || state.lastComputed?.arrAgg;
    if(!arr) return;

    const v = arr[idx.i];
    if(!Number.isFinite(v)) return;

    const pct = (typeof percentileOfValue==="function") ? percentileOfValue(v) : null;
    const rank = _rankFromPercentile(pct);

    let extraHtml = "";
    const singleMode = (!$("avgToggle")?.checked) && ($("t0Select")?.selectedIndex === $("t1Select")?.selectedIndex);

    if(singleMode && timeId && state?.meta?.paths?.per_time){
      state._layerCache = state._layerCache || {};
      state._layerCache[timeId] = state._layerCache[timeId] || {};

      const wantKeys = ["pcatch_ensemble","phab_scoring","pops"];
      const parts = [];
      for(const key of wantKeys){
        const tpl = state.meta.paths.per_time[key];
        if(!tpl) continue;
        try{
          if(!state._layerCache[timeId][key]){
            const url = latestUrl(`${state.runPath}/${tpl.replace("{time}", timeId).replace("{time_id}", timeId)}`);
            state._layerCache[timeId][key] = await fetchBin(url, "f32");
          }
          const a = state._layerCache[timeId][key];
          const vv = a?.[idx.i];
          if(Number.isFinite(vv)) parts.push(`<div><b>${key}:</b> ${(vv*100).toFixed(2)}%</div>`);
        }catch(_){}
      }
      if(parts.length){
        extraHtml = `<div style="margin-top:8px"><b>Other layers (same time)</b></div>` + parts.join("");
      }
    }

    const currentKey = (typeof currentPerTimeKey==="function") ? currentPerTimeKey() : "current";
    let temporalHtml = "";
    const tp = state.lastComputed?.temporalProducts;
    if(tp){
      const p = tp.persist?.[idx.i];
      const st = tp.stability?.[idx.i];
      const dur = tp.duration?.[idx.i];
      const peakIdx = tp.peakTimeIndex?.[idx.i] ?? 0;
      const firstIdx = tp.firstGoodIndex?.[idx.i];
      const lastIdx = tp.lastGoodIndex?.[idx.i];
      const peakIso = tp.timeIsos?.[peakIdx] || "—";
      const firstIso = (Number.isFinite(firstIdx) && firstIdx !== 65535) ? tp.timeIsos?.[firstIdx] : null;
      const lastIso = (Number.isFinite(lastIdx) && lastIdx !== 65535) ? tp.timeIsos?.[lastIdx] : null;
      temporalHtml = `<div style="margin-top:8px"><b>Temporal (${temporalWindowHours()}h / ${currentTemporalSummaryKey()})</b></div>
      <div><b>Persistence:</b> ${Number.isFinite(p) ? (p*100).toFixed(1)+"%" : "—"}</div>
      <div><b>Stability:</b> ${Number.isFinite(st) ? st.toFixed(2) : "—"}</div>
      <div><b>Stable duration:</b> ${Number.isFinite(dur) ? (dur*temporalStepHours())+"h" : "—"}</div>
      <div><b>First good:</b> ${firstIso ? fmtTime(firstIso) : "—"}</div>
      <div><b>Last good:</b> ${lastIso ? fmtTime(lastIso) : "—"}</div>
      <div><b>Peak time:</b> ${peakIso ? fmtTime(peakIso) : "—"}</div>
      ${renderTemporalSparklineSvg(tp.timeIsos || [], idx.i, tp)}
      `;
    }
    const html = `
      <div style="font-weight:900;margin-bottom:6px">${metaInfo?.kind==="top" ? ("Top #"+metaInfo.rank) : (metaInfo?.kind==="cluster-top" ? ("Cluster #"+metaInfo.clusterId+" • #"+metaInfo.rank) : (metaInfo?.kind==="cluster-center" ? ("Cluster Center #"+metaInfo.clusterId) : "Point"))}</div>
      ${formatPopupCoords(lat, lon)}
      <div><b>${currentKey}:</b> ${(v*100).toFixed(2)}%</div>
      <div><b>Percentile(AOI):</b> ${pct==null ? "—" : "P"+Math.round(pct*100)}</div>
      <div><b>Rank(AOI):</b> ${(metaInfo?.rank!=null) ? ("#"+metaInfo.rank) : (rank==null ? "—" : "#"+rank)}</div>
      <div><b>Time:</b> ${timeIso.replace("T"," ").replace("Z"," UTC")}</div>
      ${temporalHtml}${extraHtml}
    `;

    L.popup({maxWidth: 360})
      .setLatLng([lat,lon])
      .setContent(html)
      .openOn(map);

    if($("pinToggle")?.checked){
      addPin(lat, lon, v);
    }
  }catch(e){
    console.error(e);
  }
}

// Pins (user markers)
function addPin(lat, lon, v01){
  try{
    if(!map) return;
    state.pins = state.pins || [];
    const pct = (typeof percentileOfValue==="function") ? percentileOfValue(v01) : null;
    const rec = {
      lat, lon,
      prob: v01,
      percentile: pct,
      rank: _rankFromPercentile(pct),
      time: state.times?.[getSelectedTimeIndex()] || $("t1Select")?.value || "",
      layer: (typeof currentPerTimeKey==="function") ? currentPerTimeKey() : "current"
    };
    state.pins.push(rec);

    if(!window.pinLayer) window.pinLayer = L.layerGroup().addTo(map);
    const icon = L.divIcon({className:"", html:`<div class="pinMarker"></div>`, iconSize:[14,14], iconAnchor:[7,7]});
    const mk = L.marker([lat,lon], {icon}).addTo(window.pinLayer);
    mk.bindPopup(`<b>Pin</b><br>${lat.toFixed(4)}, ${lon.toFixed(4)}<br><b>${(v01*100).toFixed(2)}%</b><br>${rec.time}`);
  }catch(e){ console.error(e); }
}



function _setWeights(a,b,c){
  a = Number(a)||0; b=Number(b)||0; c=Number(c)||0;
  const sum = (a+b+c) || 1;
  state.clusterWeights = {a:a/sum, b:b/sum, c:c/sum};
  $("wMeanNum") && ($("wMeanNum").value = state.clusterWeights.a.toFixed(2));
  $("wMaxNum")  && ($("wMaxNum").value  = state.clusterWeights.b.toFixed(2));
  $("wAreaNum") && ($("wAreaNum").value = state.clusterWeights.c.toFixed(2));
}
function applyWeightPreset(name){
  if(name==="stable") _setWeights(0.85, 0.15, 0.02);
  else if(name==="peak") _setWeights(0.45, 0.55, 0.02);
  else if(name==="wide") _setWeights(0.60, 0.25, 0.15);
  else _setWeights(0.70, 0.30, 0.02);
}
function readWeightsFromUI(){
  _setWeights($("wMeanNum")?.value, $("wMaxNum")?.value, $("wAreaNum")?.value);
}
$("weightPreset")?.addEventListener("change", ()=>applyWeightPreset($("weightPreset").value));
$("resetWeightsBtn")?.addEventListener("click", ()=>applyWeightPreset("default"));
["wMeanNum","wMaxNum","wAreaNum"].forEach(id=> $(id)?.addEventListener("change", readWeightsFromUI));
applyWeightPreset("default");
$("topLimit")?.addEventListener("change", ()=>{ if($("topLimit")) $("topLimit").dataset.userSet = "1"; });

function havKm(ax, ay, bx, by){
  const R=6371, toRad=Math.PI/180;
  const dLat=(by-ay)*toRad, dLon=(bx-ax)*toRad;
  const s1=Math.sin(dLat/2), s2=Math.sin(dLon/2);
  const c = s1*s1 + Math.cos(ay*toRad)*Math.cos(by*toRad)*s2*s2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(c)));
}

function dbscan(points, epsKm, minPts){
  const n=points.length;
  const labels=new Int32Array(n).fill(-1);
  const visited=new Uint8Array(n);
  let cid=0;

  function regionQuery(i){
    const out=[];
    const pi=points[i];
    for(let j=0;j<n;j++){
      if(i===j) continue;
      const pj=points[j];
      if(havKm(pi.lat, pi.lon, pj.lat, pj.lon) <= epsKm) out.push(j);
    }
    return out;
  }

  for(let i=0;i<n;i++){
    if(visited[i]) continue;
    visited[i]=1;
    const neigh=regionQuery(i);
    if(neigh.length + 1 < minPts){ labels[i]=-1; continue; }
    labels[i]=cid;
    const seed=neigh.slice();
    while(seed.length){
      const j=seed.pop();
      if(!visited[j]){
        visited[j]=1;
        const neigh2=regionQuery(j);
        if(neigh2.length + 1 >= minPts) seed.push(...neigh2);
      }
      if(labels[j] < 0) labels[j]=cid;
    }
    cid++;
  }
  const clusters=Array.from({length:cid}, ()=>[]);
  for(let i=0;i<n;i++){
    const l=labels[i];
    if(l>=0) clusters[l].push(i);
  }
  return {labels, clusters};
}

function convexHullLatLon(pts){
  if(pts.length<=3) return pts;
  const p = pts.map(x=>({x:x.lon, y:x.lat}));
  p.sort((a,b)=> a.x===b.x ? a.y-b.y : a.x-b.x);
  const cross=(o,a,b)=> (a.x-o.x)*(b.y-o.y) - (a.y-o.y)*(b.x-o.x);
  const lower=[];
  for(const pt of p){
    while(lower.length>=2 && cross(lower[lower.length-2], lower[lower.length-1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper=[];
  for(const pt of p.slice().reverse()){
    while(upper.length>=2 && cross(upper[upper.length-2], upper[upper.length-1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper).map(z=>({lat:z.y, lon:z.x}));
}

function approxAreaKm2(poly){
  if(poly.length<3) return 0;
  const lat0 = poly.reduce((s,p)=>s+p.lat,0)/poly.length;
  const kx = 111.32*Math.cos(lat0*Math.PI/180);
  const ky = 110.57;
  const pts = poly.map(p=>({x:p.lon*kx, y:p.lat*ky}));
  let area=0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    area += a.x*b.y - b.x*a.y;
  }
  return Math.abs(area)/2;
}


function buildClusters(){
  const method = $("clusterMethod")?.value || "contour";
  if(method === "dbscan") return buildClustersDBSCAN();
  return buildClustersContour();
}

function buildClustersDBSCAN(){
  if(!state.lastComputed?.arrAgg){ toast("No data yet", "err", "Clusters"); return; }
  const g = state.grid; const W=g.width, H=g.height;
  const aoi = state.userAOI || state.serverAOI || null;
  const thrPct = Number($("clusterThreshold")?.value||85);
  const thrVal = thrPct/100;

  const epsKm = Math.max(1, Number($("clusterEpsKm")?.value || 25));
  const minPts = Math.max(2, Number($("clusterMinPts")?.value || 6));

  const pts=[];
  for(let y=0;y<H;y++){
    const lat = g.lat_max - (g.lat_max-g.lat_min)*(y/(H-1));
    for(let x=0;x<W;x++){
      const lon = g.lon_min + (g.lon_max-g.lon_min)*(x/(W-1));
      if(aoi && !aoi.contains([lat,lon])) continue;
      const v = state.lastComputed.arrAgg[y*W+x];
      if(Number.isFinite(v) && v>=thrVal) pts.push({lat,lon,v,idx:y*W+x,x,y});
    }
  }
  pts.sort((a,b)=>b.v-a.v);
  const pts2 = pts.slice(0, 2500);

  const {clusters} = dbscan(pts2, epsKm, minPts);
  const infos = [];
  clusters.forEach((ids, id)=>{
    if(!ids.length) return;
    const members = ids.map(i=>pts2[i]);
    const mean = members.reduce((s,p)=>s+p.v,0)/members.length;
    const mx = members.reduce((s,p)=>Math.max(s,p.v), -1);
    const centroid = members.reduce((a,p)=>({lat:a.lat+p.lat, lon:a.lon+p.lon}), {lat:0, lon:0});
    centroid.lat/=members.length; centroid.lon/=members.length;
    let wsum=0,wlat=0,wlon=0,peak={v:-1,lat:0,lon:0};
    for(const p of members){
      wsum+=p.v; wlat+=p.v*p.lat; wlon+=p.v*p.lon;
      if(p.v>peak.v) peak={v:p.v, lat:p.lat, lon:p.lon};
    }
    const wcentroid = {lat:wsum? (wlat/wsum):centroid.lat, lon:wsum? (wlon/wsum):centroid.lon};

    const hull = convexHullLatLon(members);
    const area = approxAreaKm2(hull);

    infos.push({id, n:members.length, mean, mx, area, centroid, wcentroid, peak, poly: hull, top: members.slice().sort((a,b)=>b.v-a.v).slice(0,10)});
  });

  renderClusters(infos, thrVal, "dbscan");
}

function buildClustersContour(){
  if(!state.lastComputed?.arrAgg){ toast("No data yet", "err", "Clusters"); return; }
  const g = state.grid; const W=g.width, H=g.height;
  const aoi = state.userAOI || state.serverAOI || null;
  const thrPct = Number($("clusterThreshold")?.value||85);
  const thrVal = thrPct/100;

  const minCells = Math.max(2, Number($("clusterMinPts")?.value || 6));

  // Build mask of cells above threshold (in AOI)
  const mask = new Uint8Array(W*H);
  for(let y=0;y<H;y++){
    const lat = g.lat_max - (g.lat_max-g.lat_min)*(y/(H-1));
    for(let x=0;x<W;x++){
      const lon = g.lon_min + (g.lon_max-g.lon_min)*(x/(W-1));
      if(aoi && !aoi.contains([lat,lon])) continue;
      const v = state.lastComputed.arrAgg[y*W+x];
      if(Number.isFinite(v) && v>=thrVal) mask[y*W+x]=1;
    }
  }

  // Connected components (4-neighborhood) via flood fill
  const label = new Int32Array(W*H); label.fill(-1);
  const comps=[];
  let cid=0;
  const stackX=new Int32Array(W*H);
  const stackY=new Int32Array(W*H);

  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=y*W+x;
      if(mask[i]!==1 || label[i]!==-1) continue;

      // flood fill
      let sp=0; stackX[sp]=x; stackY[sp]=y; sp++;
      label[i]=cid;
      const cells=[];

      while(sp>0){
        sp--;
        const cx=stackX[sp], cy=stackY[sp];
        const ii=cy*W+cx;
        cells.push(ii);

        const nb = [
          [cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]
        ];
        for(const [nx,ny] of nb){
          if(nx<0||ny<0||nx>=W||ny>=H) continue;
          const jj=ny*W+nx;
          if(mask[jj]!==1 || label[jj]!==-1) continue;
          label[jj]=cid;
          stackX[sp]=nx; stackY[sp]=ny; sp++;
        }
      }

      if(cells.length>=minCells){
        comps.push({id:cid, cells});
      }
      cid++;
    }
  }

  // Build cluster infos
  const infos = comps.map(c=>{
    let sum=0, mx=-1, wsum=0, wlat=0, wlon=0, latSum=0, lonSum=0;
    let peak={v:-1, lat:0, lon:0};
    for(const ii of c.cells){
      const y=Math.floor(ii/W), x=ii - y*W;
      const ll = xyToLatLon(x,y) || {lat:NaN, lon:NaN};
    const lat = ll.lat;
    const lon = ll.lon;
      const v = state.lastComputed.arrAgg[ii];
      sum += v; latSum += lat; lonSum += lon;
      if(v>mx) mx=v;
      wsum += v; wlat += v*lat; wlon += v*lon;
      if(v>peak.v) peak={v, lat, lon};
    }
    const mean = sum/c.cells.length;
    const centroid = {lat: latSum/c.cells.length, lon: lonSum/c.cells.length};
    const wcentroid = {lat: wsum? (wlat/wsum) : centroid.lat, lon: wsum? (wlon/wsum) : centroid.lon};

    const rings = buildComponentRings(label, c.id, W, H);
    // pick largest ring as polygon
    const poly = rings.sort((a,b)=>b.length-a.length)[0] || [];
    const polyLL = poly.map(([cx,cy])=> cornerToLatLon(cx,cy,g,W,H)).filter(Boolean);
    const area = approxAreaKm2(polyLL);

    return {id:c.id, n:c.cells.length, mean, mx, area, centroid, wcentroid, peak, poly: polyLL, top: topCellsToPoints(c.cells, W, g, H)};
  });

  renderClusters(infos, thrVal, "contour");
}

function cornerToLatLon(cx, cy, g, W, H){
  const lon = g.lon_min + (g.lon_max-g.lon_min)*(cx/W);
  const lat = g.lat_max - (g.lat_max-g.lat_min)*(cy/H);
  return {lat, lon};
}

function topCellsToPoints(cells, W, g, H){
  // top 10 points inside cluster by value
  const pts = cells.map(ii=>{
    const y=Math.floor(ii/W), x=ii-y*W;
    const lat = g.lat_max - (g.lat_max-g.lat_min)*(y/(H-1));
    const lon = g.lon_min + (g.lon_max-g.lon_min)*(x/(W-1));
    const v = state.lastComputed.arrAgg[ii];
    return {lat, lon, v, idx: ii};
  });
  pts.sort((a,b)=>b.v-a.v);
  return pts.slice(0,10);
}

function buildComponentRings(label, cid, W, H){
  // Build boundary edges (grid corners) around component cells; stitch into rings
  // Corners: (x,y) in [0..W]x[0..H]
  const nextMap = new Map(); // key -> array of next keys
  const addEdge = (ax,ay,bx,by)=>{
    const a = ax+","+ay, b = bx+","+by;
    if(!nextMap.has(a)) nextMap.set(a, []);
    nextMap.get(a).push(b);
  };

  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=y*W+x;
      if(label[i]!==cid) continue;

      // top
      if(y===0 || label[(y-1)*W+x]!==cid) addEdge(x,y, x+1,y);
      // right
      if(x===W-1 || label[y*W+(x+1)]!==cid) addEdge(x+1,y, x+1,y+1);
      // bottom
      if(y===H-1 || label[(y+1)*W+x]!==cid) addEdge(x+1,y+1, x,y+1);
      // left
      if(x===0 || label[y*W+(x-1)]!==cid) addEdge(x,y+1, x,y);
    }
  }

  const rings=[];
  // Stitch edges into loops
  while(nextMap.size){
    const start = nextMap.keys().next().value;
    if(start==null) break;
    
    let cur = start;
    const ring=[start];
    let safety=0;

    while(safety<100000){
      safety++;
      const outs = nextMap.get(cur);
      if(!outs || !outs.length) break;
      const nxt = outs.pop();
      if(!outs.length) nextMap.delete(cur);
      cur = nxt;
      ring.push(cur);
      if(cur===start) break;
    }

    // convert ring keys to int pairs
    if(ring.length>4 && ring[ring.length-1]===start){
      const pts = ring.map(k=>k.split(",").map(v=>parseInt(v,10)));
      rings.push(simplifyGridRing(pts));
    }
  }
  return rings;
}

function simplifyGridRing(pts){
  // remove consecutive duplicates and collinear points on grid
  const out=[];
  for(const p of pts){
    if(!out.length || out[out.length-1][0]!==p[0] || out[out.length-1][1]!==p[1]) out.push(p);
  }
  const out2=[];
  for(let i=0;i<out.length;i++){
    const a=out[(i-1+out.length)%out.length];
    const b=out[i];
    const c=out[(i+1)%out.length];
    const dx1=b[0]-a[0], dy1=b[1]-a[1];
    const dx2=c[0]-b[0], dy2=c[1]-b[1];
    // collinear if direction doesn't change
    if(dx1===dx2 && dy1===dy2) continue;
    out2.push(b);
  }
  return out2;
}

function renderClusters(infos, thrVal, mode){
  ensurePanes();
  if(clusterLayer){ try{ clusterLayer.remove(); }catch(_){} clusterLayer=null; }
  if(clusterCenters){ try{ clusterCenters.remove(); }catch(_){} clusterCenters=null; }
  if(clusterTopLayer){ try{ clusterTopLayer.remove(); }catch(_){} clusterTopLayer=null; }

  const listEl = $("clusterList");
  if(listEl) listEl.innerHTML="";

  const w = state.clusterWeights || {a:0.7,b:0.3,c:0.02};
  const centerMode = $("clusterCenterMode")?.value || "weighted";

  // compute score
  infos.forEach(info=>{
    info.score = w.a*info.mean + w.b*info.mx + w.c*Math.log(1+Math.max(0,info.area||0));
    info.center = (centerMode==="peak") ? {lat:info.peak.lat, lon:info.peak.lon} :
                  (centerMode==="centroid") ? {lat:info.centroid.lat, lon:info.centroid.lon} :
                  {lat:info.wcentroid.lat, lon:info.wcentroid.lon};
  });

  infos.sort((a,b)=>b.score-a.score);
  const bestId = infos[0]?.id;

  const polys=[], centers=[];
  const clusterTops=[];
  infos.forEach(info=>{
    if(!info.poly || info.poly.length<3) return;
    const poly = L.polygon(info.poly.map(p=>[p.lat,p.lon]), {pane:"clusterPane", color:"#ff0000", weight:2, fillOpacity:0.08});
    poly.on("click", (e)=>{ try{ suppressNextMapClick(); L.DomEvent.stop(e); }catch(_){ } selectCluster(info); });
    polys.push(poly);

    const c = L.circleMarker([info.center.lat, info.center.lon], {pane:"clusterTopPane", radius:6, weight:2, color:"#ffffff", fillColor:"#ff0000", fillOpacity:0.9});
    c.on("click", (e)=>{ try{ L.DomEvent.stopPropagation(e); }catch(_){}; selectCluster(info); });
    centers.push(c);

    // Top-10 points INSIDE this cluster (ranked by v) — clickable with priority
    (info.top||[]).slice(0,10).forEach((p, j)=>{
      const icon = L.divIcon({
        className:"",
        html:`<div class="rankDot small">${j+1}</div>`,
        iconSize:[18,18],
        iconAnchor:[9,9]
      });
      const mk = L.marker([p.lat, p.lon], {icon, pane:"clusterTopPane", bubblingMouseEvents:false, bubblingPointerEvents:false});
      mk.on("click", (e)=>{ try{ L.DomEvent.stopPropagation(e); }catch(_){}; showPointPopup(p.lat, p.lon, {kind:"cluster-top", clusterId:info.id, rank:j+1}); });
      clusterTops.push(mk);
    });

    if(listEl){
      const div=document.createElement("div");
      div.className="clusterItem" + (info.id===bestId ? " active" : "");
      div.innerHTML = `<div>#${info.id} • n=${info.n}</div><div>max ${(info.mx*100).toFixed(1)}% • mean ${(info.mean*100).toFixed(1)}% • score ${info.score.toFixed(2)}</div>`;
      div.addEventListener("click", ()=> selectCluster(info));
      listEl.appendChild(div);
    }
  });

  clusterLayer = L.layerGroup(polys).addTo(map);
  clusterCenters = L.layerGroup(centers).addTo(map);
  clusterTopLayer = L.layerGroup(clusterTops).addTo(map);
  state.clusters = infos;

  if(infos.length){
    toast(lang==="fa" ? `خوشه‌ها: ${infos.length} (بهترین: #${bestId})` : `Clusters: ${infos.length} (best: #${bestId})`, "ok", "Clusters");
  }else{
    toast(lang==="fa" ? "هیچ خوشه‌ای پیدا نشد" : "No clusters found", "info", "Clusters");
  }
}


function clearClusters(){
  try{ if(clusterLayer){ clusterLayer.remove(); } }catch(_){}
  try{ if(clusterCenters){ clusterCenters.remove(); } }catch(_){}
  try{ if(clusterTopLayer){ clusterTopLayer.remove(); } }catch(_){}
  clusterLayer=null; clusterCenters=null; clusterTopLayer=null;
  const listEl = $("clusterList");
  if(listEl) listEl.innerHTML="";
}

function selectCluster(info){
  const topRows = (info.top||[]).map((p,i)=>`<div>#${i+1} • ${(p.v*100).toFixed(1)}% • ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</div>`).join("");
  const html = `
    <div style="font-weight:900;margin-bottom:6px">Cluster #${info.id}</div>
    <div>n=${info.n} • mean ${(info.mean*100).toFixed(1)}% • max ${(info.mx*100).toFixed(1)}% • area≈${(info.area||0).toFixed(1)} km²</div>
    <div style="margin-top:6px"><b>Score</b>: ${info.score.toFixed(3)}</div>
    <div style="margin-top:10px"><b>Top points</b></div>
    ${topRows || "<div class='muted'>—</div>"}
  `;
  L.popup({maxWidth: 420})
    .setLatLng([info.center.lat, info.center.lon])
    .setContent(html)
    .openOn(map);
}
// Existence check helper (HEAD preferred; fallback to GET)
const __existsCache = new Map();
async function exists(url){
  const finalUrl = normalizeDataUrl(url);
  if(__existsCache.has(finalUrl)) return __existsCache.get(finalUrl);
  try{
    const r = await fetch(finalUrl, {method:"HEAD", cache:"no-store"});
    const ok = (r.status===200 || r.status===304);
    if(ok){ __existsCache.set(finalUrl,true); return true; }
    if(r.status===405 || r.status===501){
      const r2 = await fetch(finalUrl, {method:"GET", cache:"no-store"});
      const ok2 = (r2.status===200 || r2.status===304);
      __existsCache.set(finalUrl, ok2); return ok2;
    }
    __existsCache.set(finalUrl,false); return false;
  }catch(_){
    try{
      const r3 = await fetch(finalUrl, {method:"GET", cache:"no-store"});
      const ok3 = (r3.status===200 || r3.status===304);
      __existsCache.set(finalUrl, ok3); return ok3;
    }catch(__){
      __existsCache.set(finalUrl,false); return false;
    }
  }
}

function mergeAndSortTimeIds(a,b){
  const s = new Set();
  (a||[]).forEach(x=>s.add(x));
  (b||[]).forEach(x=>s.add(x));
  return Array.from(s).sort(); // YYYYMMDD_HHMMZ
}

async function scanTimeIdsFromTimesDir(){
  // Works on local python http.server (directory listing). On GitHub Pages it may return 404/HTML without listing.
  try{
    const base = latestUrl(`${state.runPath}/variants/${state.variant}/species/${state.species}/times/`);
    const r = await fetch(base, {cache:"no-store"});
    if(!(r.status===200 || r.status===304)) return [];
    const html = await r.text();
    const reDir = /href="(\d{8}_\d{4}Z)\/"/g;
    const out=[]; let m;
    while((m=reDir.exec(html))!==null) out.push(m[1]);
    return Array.from(new Set(out));
  }catch(_){
    return [];
  }
}

function currentPerTimeKey(){
  const mapKey = $("mapSelect")?.value || "phab";
  const modelKey = $("modelSelect")?.value || "scoring";
  if(mapKey==="pcatch") return `pcatch_${modelKey}`;
  if(mapKey==="phab") return (modelKey==="frontplus") ? "phab_frontplus" : "phab_scoring";
  if(mapKey==="pops") return "pops";
  if(mapKey==="agree") return "agree";
  if(mapKey==="spread") return "spread";
  if(mapKey==="conf") return "conf";
  return "phab_scoring";
}

async function filterTimeIdsByExistingLayer(timeIds){
  try{
    const key = currentPerTimeKey();
    const tpl = state?.meta?.paths?.per_time?.[key];
    if(!tpl || typeof tpl!=="string") return timeIds;

    const good=[];
    const CONC=6;
    for(let i=0;i<timeIds.length;i+=CONC){
      const chunk = timeIds.slice(i,i+CONC);
      const res = await Promise.all(chunk.map(async tid=>{
        const url = latestUrl(`${state.runPath}/${tpl.replace("{time}", tid).replace("{time_id}", tid)}`);
        return (await exists(url)) ? tid : null;
      }));
      for(const x of res) if(x) good.push(x);
    }
    return good;
  }catch(_){
    return timeIds;
  }
}

function afterMapInit_v22(){
  ensurePanes();
  if($("gridToggle")) $("gridToggle").checked = state.gridVisible;
  try{ drawGrid05(); }catch(_){}
  map.on("moveend", ()=>{ try{ drawGrid05(); }catch(_){} });
  map.on("click", (e)=>{ 
    if(($("aoiMode")?.value)!=="draw") return;
    if(!aoiStart){ aoiStart = e.latlng; toast(lang==="fa" ? "گوشه دوم را کلیک کن" : "Click second corner", "info", "AOI"); return; }
    const b = L.latLngBounds(aoiStart, e.latlng);
    aoiStart = null;
    setAOI(b);
    scheduleAnalyze();
  });
  map.on("mousemove", (e)=>{
    try{
      if(!state.lastComputed?.arrShown) return;
      const xy = latLonToXY(e.latlng.lat, e.latlng.lng);
      if(!xy) return;
      const g = state.grid;
      const W=g.width, H=g.height;
      const lat=e.latlng.lat, lon=e.latlng.lng;
      const x = xy.x;
      const y = xy.y;
      const v = state.lastComputed.arrShown[y*W+x];
      if(!Number.isFinite(v)) return;
      const p = percentileOfValue(v);
      const txt = `${lat.toFixed(3)}, ${lon.toFixed(3)} • ${(v*100).toFixed(1)}%` + (p!=null ? ` • P${Math.round(p*100)}` : "");
      if(!hoverTooltip){
        hoverTooltip = L.tooltip({sticky:true, direction:"top", opacity:0.85}).setContent(txt);
        hoverTooltip.setLatLng(e.latlng);
        hoverTooltip.addTo(map);
      }else{
        hoverTooltip.setLatLng(e.latlng);
        hoverTooltip.setContent(txt);
      }
    }catch(_){}
  });
  setTimeout(()=>{ try{ drawGrid05(); }catch(_){} }, 150);
}

$("exportClustersBtn")?.addEventListener("click", ()=>{
  const data = state.clusters || [];
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="clusters.json"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
});

$("clusterBtn")?.addEventListener("click", ()=>{ try{ buildClusters(); }catch(e){ console.error(e); } });
$("clusterClearBtn")?.addEventListener("click", ()=>{ try{ clearClusters(); }catch(e){ console.error(e); } });

$("exportTopBtn")?.addEventListener("click", ()=>{
  const top = state.lastComputed?.topFiltered || [];
  const lines = ["rank,lat,lon,prob_pct,percentile"];
  top.forEach((p,i)=>{
    lines.push([i+1,p.lat,p.lon,(p.p).toFixed(1), (p.pct!=null?Math.round(p.pct*100):"")].join(","));
  });
  const blob=new Blob([lines.join("\n")], {type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="top_points.csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
});


$("exportPinsBtn")?.addEventListener("click", ()=>{
  const pins = state.pins || [];
  const lines = ["lat,lon,prob_pct,percentile,rank,time,layer"];
  pins.forEach(p=>{
    lines.push([p.lat,p.lon,(p.prob*100).toFixed(2),(p.percentile!=null?Math.round(p.percentile*100):""),(p.rank||""),p.time,p.layer].join(","));
  });
  const blob=new Blob([lines.join("\n")], {type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="pins.csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
});


// Auto-analyze with debounce
let _anTimer = null;
function scheduleAnalyze(){
  if(!$("autoAnalyzeToggle")?.checked) return;
  clearTimeout(_anTimer);
  _anTimer = setTimeout(async ()=>{
    try{ await computeAndRender(); }catch(err){ console.error(err); }
  }, 320);
}

["gridToggle","avgToggle","aoiMode","clusterThreshold","clusterEpsKm","clusterMinPts","stepSelect","aggSelect","mapSelect","modelSelect","gridModeSelect","coordModeSelect","temporalViewSelect","temporalTintToggle","temporalTintMetricSelect","onlyStableToggle","stablePresetSelect"].forEach(id=>{
  $(id)?.addEventListener("change", ()=>{ 
    if(id==="gridToggle"){
      state.gridVisible = !!$("gridToggle")?.checked;
      localStorage.setItem("gridVisible", state.gridVisible ? "1" : "0");
      drawGrid05();
    }
    if(id==="gridModeSelect"){
      setCurrentGridMode($("gridModeSelect")?.value || "utm");
      drawGrid05();
    }
    if(id==="coordModeSelect") setCurrentCoordMode($("coordModeSelect")?.value || getCurrentGridMode());
    if(id==="temporalViewSelect"){
      state.temporalView = $("temporalViewSelect")?.value || "instant";
      localStorage.setItem("temporalView", state.temporalView);
    }
    if(id==="temporalTintToggle"){
      state.temporalTintEnabled = !!$("temporalTintToggle")?.checked;
      localStorage.setItem("temporalTintEnabled", state.temporalTintEnabled ? "1" : "0");
    }
    if(id==="temporalTintMetricSelect"){
      state.temporalTintMetric = $("temporalTintMetricSelect")?.value || "duration";
      localStorage.setItem("temporalTintMetric", state.temporalTintMetric);
    }
    if(id==="onlyStableToggle"){
      state.onlyStableCells = !!($("onlyStableToggle")?.checked);
      localStorage.setItem("onlyStableCells", state.onlyStableCells ? "1" : "0");
    }
    if(id==="stablePresetSelect"){
      state.stablePreset = $("stablePresetSelect")?.value || "normal";
      localStorage.setItem("stablePreset", state.stablePreset);
    }
    scheduleAnalyze();
  });
});

// Bottom time slider binds to Single time mode by default
function syncSliderFromSelect(){
  const i = $("t1Select")?.selectedIndex ?? 0;
  const s = $("timeSlider"); if(!s) return;
  s.max = Math.max(0, state.times.length-1);
  s.value = String(Math.max(0, i));
  $("timeNowLabel").textContent = state.times[i] ? new Date(state.times[i]).toISOString().replace("T"," ").slice(0,16)+"Z" : "—";
}
function syncSelectFromSlider(){
  const s = $("timeSlider"); if(!s) return;
  const i = Number(s.value||0);
  $("t0Select").selectedIndex = i;
  $("t1Select").selectedIndex = i;
  $("timeNowLabel").textContent = state.times[i] ? new Date(state.times[i]).toISOString().replace("T"," ").slice(0,16)+"Z" : "—";
}

$("timeSlider")?.addEventListener("input", ()=>{
  if($("avgToggle")?.checked) return; // slider drives single-time only
  syncSelectFromSlider();
  scheduleAnalyze();
});
$("playBtnBottom")?.addEventListener("click", ()=>{
  $("playBtn")?.click();
});



/* ------------------------------
   Colormap (RdYlGn-like)
------------------------------ */
// Palette (stops) can change per layer/map. Default is blue→green→yellow.
const PALETTES = {
  default: [
    {p:0.00, c:[40, 30, 120]},   // indigo
    {p:0.55, c:[46, 204, 113]},  // green
    {p:1.00, c:[241, 196, 15]},  // yellow
  ],
  conf: [
    {p:0.00, c:[10, 10, 10]},    // near-black
    {p:1.00, c:[240, 240, 240]}, // near-white
  ],
  spread: [
    {p:0.00, c:[32, 26, 96]},    // deep blue-purple
    {p:0.60, c:[46, 204, 113]},  // green
    {p:1.00, c:[241, 196, 15]},  // yellow
  ],
  agree: [
    {p:0.00, c:[32, 26, 96]},
    {p:0.60, c:[46, 204, 113]},
    {p:1.00, c:[241, 196, 15]},
  ],
};

function getStopsForMap(mapKey){
  // If meta provides palette, prefer it (optional).
  try{
    const s = state?.meta?.palettes?.[mapKey];
    if(Array.isArray(s) && s.length>=2) return s;
  }catch(_){}
  return PALETTES[mapKey] || PALETTES.default;
}

function stopsToCssGradient(stops){
  const parts = (stops||[]).map(s=>{
    const [r,g,b]=s.c;
    return `rgb(${r},${g},${b}) ${Math.round(s.p*100)}%`;
  });
  return `linear-gradient(to top, ${parts.join(", ")})`;
}

let stops = getStopsForMap(state?.map||'default');
function refreshStops(){ stops = getStopsForMap(state?.map||'default'); }

function lerp(a,b,t){return a+(b-a)*t}
function colorFor(v01){
  // Dynamic scaling per selection (AOI + current layer)
  const sMin = (typeof state.scaleMin==='number') ? state.scaleMin : 0;
  const sMax = (typeof state.scaleMax==='number') ? state.scaleMax : 1;
  const denom = (sMax - sMin) || 1;
  const vScaled = (v01 - sMin) / denom;

  const v = Math.min(1, Math.max(0, vScaled));
  let a=stops[0], b=stops[stops.length-1];
  for(let i=0;i<stops.length-1;i++){
    if(v>=stops[i].p && v<=stops[i+1].p){ a=stops[i]; b=stops[i+1]; break; }
  }
  const t = (v - a.p) / (b.p - a.p + 1e-9);
  return [
    Math.round(lerp(a.c[0], b.c[0], t)),
    Math.round(lerp(a.c[1], b.c[1], t)),
    Math.round(lerp(a.c[2], b.c[2], t)),
  ];
}

/* ------------------------------
   Aggregation
------------------------------ */
function aggQuantile(q){
  const T = state._tmpT;
  const tmp = state._tmpVals;
  tmp.sort();
  const idx = Math.round((T-1)*q);
  return tmp[idx];
}

function aggregatePerPixel(arrs, method){
  // arrs: array of Float32Array length N, values 0..1 or NaN
  const N = arrs[0].length;
  const T = arrs.length;
  const out = new Float32Array(N);
  const tmp = new Float32Array(T);
  for(let i=0;i<N;i++){
    // mask applied at aggregation time (server mask × user AOI)
    if(state.analysisMask && state.analysisMask[i]===0){ out[i]=NaN; continue; }
    let k=0;
    for(let t=0;t<T;t++){
      const v = arrs[t][i];
      if(Number.isFinite(v)) tmp[k++] = v;
    }
    if(k===0){ out[i]=NaN; continue; }
    if(method==="mean"){
      let s=0; for(let j=0;j<k;j++) s+=tmp[j];
      out[i]=s/k;
    }else if(method==="max"){
      let m=-1; for(let j=0;j<k;j++) if(tmp[j]>m) m=tmp[j];
      out[i]=m;
    }else if(method==="median"){
      // sort first k values (small)
      const slice = tmp.subarray(0,k);
      slice.sort();
      out[i]=slice[Math.floor((k-1)*0.5)];
    }else if(method==="p90"){
      const slice = tmp.subarray(0,k);
      slice.sort();
      out[i]=slice[Math.floor((k-1)*0.9)];
    }else{
      let s=0; for(let j=0;j<k;j++) s+=tmp[j];
      out[i]=s/k;
    }
  }
  return out;
}


function currentPhabKey(){
  const modelKey = $("modelSelect")?.value || state.model || "scoring";
  return (modelKey === "frontplus") ? "phab_frontplus" : "phab_scoring";
}
function temporalWindowHours(){
  const cfg = summaryConfigForCurrentKey();
  const h = Number(cfg.window_hours || cfg.hours || 72);
  return Number.isFinite(h) && h > 0 ? h : 72;
}
function temporalStepHours(){
  const cfg = summaryConfigForCurrentKey();
  const h = Number(cfg.step_hours || 12);
  return Number.isFinite(h) && h > 0 ? h : 12;
}
function temporalThreshold(){
  const cfg = summaryConfigForCurrentKey();
  const x = Number(cfg.threshold || cfg.good_threshold || 0.7);
  return Number.isFinite(x) ? x : 0.7;
}
function getTemporalWindowTimes(){
  const endIdx = $("t1Select")?.selectedIndex ?? Math.max(0, state.times.length - 1);
  const endIso = state.times?.[endIdx];
  if(!endIso) return [];
  const endMs = new Date(endIso).getTime();
  const startMs = endMs - temporalWindowHours()*3600*1000 + 1;
  return state.times.filter((iso, idx)=> idx <= endIdx && new Date(iso).getTime() >= startMs);
}
async function loadPhabLayerForTime(timeIso){
  const tid = timeIdFromIso(timeIso);
  const key = currentPhabKey();
  let tpl = state?.meta?.paths?.per_time?.[key] || state?.meta?.paths?.per_time?.phab_scoring;
  if(!tpl) return new Float32Array(state.grid.width * state.grid.height).fill(NaN);
  const url = `${state.runPath}/${tpl.replace("{time}", tid).replace("{time_id}", tid)}`;
  return fetchBin(latestUrl(url), "f32");
}
function rollingLongestRun(boolArr){
  let best = 0, cur = 0;
  for(let i=0;i<boolArr.length;i++){
    if(boolArr[i]){ cur += 1; if(cur > best) best = cur; }
    else cur = 0;
  }
  return best;
}
function renderTemporalSparklineSvg(timeIsos, idx, products){
  const values = [];
  for(let t=0;t<timeIsos.length;t++){
    const arr = products?.source === 'precomputed' ? null : null;
  }
  const arrs = state.temporalSeriesCache?.get(currentPhabKey()) || null;
  if(!Array.isArray(arrs) || !arrs.length) return '';
  const vals = [];
  for(let t=0;t<arrs.length;t++){
    const v = arrs[t]?.[idx];
    if(Number.isFinite(v)) vals.push(v); else vals.push(NaN);
  }
  const finite = vals.filter(Number.isFinite);
  if(!finite.length) return '';
  const mn = Math.min(...finite), mx = Math.max(...finite);
  const w = 160, h = 34, pad = 3;
  const xs = vals.map((_,i)=> pad + (w-2*pad) * (vals.length===1 ? 0.5 : i/(vals.length-1)));
  const ys = vals.map(v => {
    if(!Number.isFinite(v)) return null;
    const t = (v - mn) / ((mx - mn) || 1);
    return h - pad - t * (h - 2*pad);
  });
  let d = '';
  for(let i=0;i<xs.length;i++){
    if(ys[i]==null) continue;
    d += (d ? ' L ' : 'M ') + `${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  if(!d) return '';
  return `<div style="margin-top:6px"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.15)"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/></svg></div>`;
}
function computeTemporalProducts(arrs, threshold=0.7){
  const N = arrs?.[0]?.length || 0;
  const T = arrs?.length || 0;
  const mean = new Float32Array(N);
  const p90 = new Float32Array(N);
  const persist = new Float32Array(N);
  const stability = new Float32Array(N);
  const duration = new Uint8Array(N);
  const stableHotspot = new Float32Array(N);
  const peakTimeIndex = new Uint16Array(N);
  const firstGoodIndex = new Uint16Array(N);
  const lastGoodIndex = new Uint16Array(N);
  const tmp = new Array(T);
  for(let i=0;i<N;i++){
    let s = 0, k = 0, mx = -Infinity, mxIdx = 0, goodCount = 0;
    const bools = new Array(T).fill(false);
    let firstGood = 65535, lastGood = 65535;
    for(let t=0;t<T;t++){
      const v = arrs[t][i];
      if(Number.isFinite(v)){
        tmp[k] = v;
        if(v > mx){ mx = v; mxIdx = t; }
        s += v;
        if(v >= threshold){
          bools[t] = true;
          goodCount += 1;
          if(firstGood === 65535) firstGood = t;
          lastGood = t;
        }
        k += 1;
      }
    }
    if(!k){
      mean[i] = NaN; p90[i] = NaN; persist[i] = NaN; stability[i] = NaN; duration[i] = 0; stableHotspot[i] = NaN; peakTimeIndex[i] = 0; firstGoodIndex[i] = 65535; lastGoodIndex[i] = 65535;
      continue;
    }
    const vals = tmp.slice(0, k).sort((a,b)=>a-b);
    const mn = s / k;
    mean[i] = mn;
    p90[i] = vals[Math.max(0, Math.min(k-1, Math.floor((k-1)*0.9)))];
    persist[i] = goodCount / k;
    let varSum = 0;
    for(let t=0;t<k;t++) varSum += Math.pow(vals[t] - mn, 2);
    const std = Math.sqrt(varSum / k);
    const cv = std / Math.max(mn, 1e-6);
    stability[i] = Math.max(0, Math.min(1, 1 / (1 + cv)));
    duration[i] = rollingLongestRun(bools);
    peakTimeIndex[i] = mxIdx;
    firstGoodIndex[i] = firstGood;
    lastGoodIndex[i] = lastGood;
    const durNorm = T ? (duration[i] / T) : 0;
    stableHotspot[i] = Math.max(0, Math.min(1,
      0.40*mean[i] + 0.20*p90[i] + 0.20*persist[i] + 0.10*stability[i] + 0.10*durNorm
    ));
  }
  return {mean, p90, persist, stability, duration, stableHotspot, peakTimeIndex, firstGoodIndex, lastGoodIndex, count:T, threshold};
}

function normalizeTemporalSummaryTemplates(){
  const metaPaths = getTemporalSummaryTemplates() || {};
  const normalize = (v)=> (typeof v === "string" && v.length) ? v : null;
  return {
    mean: normalize(metaPaths.mean || metaPaths.phab_mean_3day || metaPaths.phab_mean_72h),
    p90: normalize(metaPaths.p90 || metaPaths.phab_p90_3day || metaPaths.phab_p90_72h),
    persist: normalize(metaPaths.persist || metaPaths.phab_persist_3day || metaPaths.phab_persist_72h),
    stability: normalize(metaPaths.stability || metaPaths.phab_stability_3day || metaPaths.phab_stability_72h),
    duration: normalize(metaPaths.duration || metaPaths.phab_duration_3day || metaPaths.phab_duration_72h),
    stableHotspot: normalize(metaPaths.stable || metaPaths.stableHotspot || metaPaths.phab_stable_hotspot_3day || metaPaths.phab_stable_hotspot_72h),
    peakTimeIndex: normalize(metaPaths.peakTimeIndex || metaPaths.peak_time_index || metaPaths.phab_peak_time_index_72h),
    firstGoodIndex: normalize(metaPaths.firstGoodIndex || metaPaths.first_good_index || metaPaths.phab_first_good_index_72h),
    lastGoodIndex: normalize(metaPaths.lastGoodIndex || metaPaths.last_good_index || metaPaths.phab_last_good_index_72h),
  };
}

function resolveSummaryTemplate(tpl, endTid){
  if(typeof tpl !== "string" || !tpl) return null;
  return tpl.replaceAll("{time_id}", endTid).replaceAll("{time}", endTid);
}

async function loadPrecomputedTemporalProducts(endTid){
  const tpls = normalizeTemporalSummaryTemplates();
  if(!tpls.mean || !tpls.p90 || !tpls.persist || !tpls.duration || !tpls.stableHotspot) return null;
  const rel = (tpl)=> summaryFileUrl(resolveSummaryTemplate(tpl, endTid));
  try{
    const out = {
      mean: await fetchBin(rel(tpls.mean), "f32"),
      p90: await fetchBin(rel(tpls.p90), "f32"),
      persist: await fetchBin(rel(tpls.persist), "f32"),
      stability: tpls.stability ? await fetchBin(rel(tpls.stability), "f32") : null,
      duration: await fetchBin(rel(tpls.duration), "u8"),
      stableHotspot: await fetchBin(rel(tpls.stableHotspot), "f32"),
      peakTimeIndex: tpls.peakTimeIndex ? await fetchBin(rel(tpls.peakTimeIndex), "u16") : null,
      firstGoodIndex: tpls.firstGoodIndex ? await fetchBin(rel(tpls.firstGoodIndex), "u16") : null,
      lastGoodIndex: tpls.lastGoodIndex ? await fetchBin(rel(tpls.lastGoodIndex), "u16") : null,
      count: Math.max(1, Math.round(temporalWindowHours()/Math.max(1, temporalStepHours()))),
      threshold: temporalThreshold(),
      source: "precomputed"
    };
    return out;
  }catch(err){
    console.warn("Precomputed temporal summaries unavailable; falling back to client-side windowing.", err);
    return null;
  }
}

async function ensureTemporalProducts(){
  const timeIsos = getTemporalWindowTimes();
  const endTid = timeIdFromIso(timeIsos[timeIsos.length-1] || getSelectedTimeId() || "");
  const cacheKey = `${currentPhabKey()}|${endTid}|${timeIsos.map(timeIdFromIso).join("|")}|${temporalThreshold()}`;
  state.temporalCache = state.temporalCache || new Map();
  if(state.temporalCache.has(cacheKey)) return {timeIsos, ...state.temporalCache.get(cacheKey)};
  let products = endTid ? await loadPrecomputedTemporalProducts(endTid) : null;
  if(!products){
    const arrs = await Promise.all(timeIsos.map(loadPhabLayerForTime));
    state.temporalSeriesCache = state.temporalSeriesCache || new Map();
    state.temporalSeriesCache.set(currentPhabKey(), arrs);
    products = computeTemporalProducts(arrs, temporalThreshold());
    products.source = "client";
  }
  state.temporalCache.set(cacheKey, products);
  if(state.temporalCache.size > 8){
    const first = state.temporalCache.keys().next().value;
    state.temporalCache.delete(first);
  }
  return {timeIsos, ...products};
}
function normalizeDurationValue(v, count){
  if(!Number.isFinite(v) || !count) return NaN;
  return Math.max(0, Math.min(1, v / count));
}
function temporalMetricArray(products, metric){
  if(!products) return null;
  if(metric === "persist") return products.persist;
  if(metric === "stability") return products.stability || products.persist;
  if(metric === "duration"){
    const out = new Float32Array(products.duration.length);
    for(let i=0;i<out.length;i++) out[i] = normalizeDurationValue(products.duration[i], products.count);
    return out;
  }
  return products.persist;
}
function temporalTintColor(v01){
  const v = Math.max(0, Math.min(1, v01));
  const stopsLocal = [
    {p:0.0, c:[183,28,28]},
    {p:0.5, c:[253,184,19]},
    {p:1.0, c:[27,94,32]},
  ];
  let a = stopsLocal[0], b = stopsLocal[stopsLocal.length-1];
  for(let i=0;i<stopsLocal.length-1;i++){
    if(v >= stopsLocal[i].p && v <= stopsLocal[i+1].p){ a = stopsLocal[i]; b = stopsLocal[i+1]; break; }
  }
  const t = (v - a.p) / ((b.p - a.p) || 1);
  return [
    Math.round(lerp(a.c[0], b.c[0], t)),
    Math.round(lerp(a.c[1], b.c[1], t)),
    Math.round(lerp(a.c[2], b.c[2], t)),
  ];
}
function blendColors(base, tint, alpha){
  const a = Math.max(0, Math.min(1, alpha));
  return [
    Math.round(base[0]*(1-a) + tint[0]*a),
    Math.round(base[1]*(1-a) + tint[1]*a),
    Math.round(base[2]*(1-a) + tint[2]*a),
  ];
}

/* ------------------------------
   Rendering to overlay
------------------------------ */

function setLegend(title){
  const el = $("legend");
  if(!el) return;
  const tv = $("temporalViewSelect")?.value || state.temporalView || "instant";
  const isDuration = (state.map === 'phab' && tv === 'duration');
  const mn01 = (typeof state.scaleMin==='number' && Number.isFinite(state.scaleMin)) ? state.scaleMin : null;
  const mx01 = (typeof state.scaleMax==='number' && Number.isFinite(state.scaleMax)) ? state.scaleMax : null;
  const ticks = [];
  let mm = '';
  if(isDuration){
    const cnt = state.lastComputed?.temporalProducts?.count || Math.max(1, Math.round(temporalWindowHours()/Math.max(1, temporalStepHours())));
    const maxHours = cnt * temporalStepHours();
    mm = ` <span style="font-weight:700;opacity:.9">(0–${maxHours}h)</span>`;
    for(let i=0;i<5;i++) ticks.push(Math.round((maxHours)*(i/4)) + 'h');
  }else{
    const mn = (mn01==null) ? null : (mn01*100);
    const mx = (mx01==null) ? null : (mx01*100);
    mm = (mn!=null && mx!=null) ? ` <span style="font-weight:700;opacity:.9">(${mn.toFixed(1)}–${mx.toFixed(1)}%)</span>` : '';
    if(mn!=null && mx!=null && mx>mn){
      for(let i=0;i<5;i++) ticks.push(Math.round(mn + (mx-mn)*(i/4)) + '%');
    }else if(mn!=null){
      ticks.push(Math.round(mn) + '%');
    }
  }
  const tickHtml = ticks.length ? ticks.slice().reverse().map(v=>`<div>${v}</div>`).join("") : "";
  const tintOn = !!(state.temporalTintEnabled && state.map === 'phab' && state.lastComputed?.temporalProducts);
  const tintLabel = state.temporalTintMetric === 'duration' ? 'less stable → more stable' : 'lower → higher';
  const tintHtml = tintOn ? `
    <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
      <div style="font-size:12px; opacity:.85;">Temporal tint</div>
      <div style="height:10px; flex:1; border-radius:999px; background:linear-gradient(to right, rgb(183,28,28), rgb(253,184,19), rgb(27,94,32));"></div>
      <div style="font-size:11px; opacity:.85;">${tintLabel}</div>
    </div>` : "";
  el.innerHTML = `
    <div class="wrap">
      <div class="title">${title}${mm}</div>
      <div style="display:flex; gap:10px; align-items:stretch;">
        <div class="bar" style="background:${stopsToCssGradient(getStopsForMap(state.map || 'default'))}"></div>
        <div class="ticks">${tickHtml}</div>
      </div>
      ${tintHtml}
    </div>
  `;
}



function renderOverlay(arr01, conf01){
  const {width:W, height:H} = state.grid;
  const bounds = ensureGridBounds();
  if(!bounds || !bounds[0] || !bounds[1]){
    console.error('Invalid grid bounds; cannot render overlay', state.grid);
    return;
  }
  state.canvas.width = W;
  state.canvas.height = H;
  const img = state.ctx.createImageData(W, H);
  const data = img.data;
  const tintArr = (state.temporalTintEnabled && state.map === 'phab' && state.lastComputed?.temporalProducts)
    ? temporalMetricArray(state.lastComputed.temporalProducts, state.temporalTintMetric)
    : null;
  for(let yImg=0;yImg<H;yImg++){
    const ySrc = state.dataNorthFirst ? yImg : (H-1 - yImg);
    for(let x=0;x<W;x++){
      const iSrc = ySrc*W + x;
      const v = arr01[iSrc];
      const ok = Number.isFinite(v);
      let c = ok ? colorFor(v) : [0,0,0];
      if(ok && tintArr && Number.isFinite(tintArr[iSrc])){
        const tint = temporalTintColor(tintArr[iSrc]);
        const tintAlpha = (state.temporalTintMetric === "duration") ? 0.24 : 0.18;
        c = blendColors(c, tint, tintAlpha);
      }
      const a = ok ? Math.round(255 * Math.min(1, Math.max(0, conf01[iSrc] ?? 1))) : 0;
      const p = (yImg*W + x)*4;
      data[p+0]=c[0]; data[p+1]=c[1]; data[p+2]=c[2]; data[p+3]=a;
    }
  }
  state.ctx.putImageData(img, 0, 0);
  const url = state.canvas.toDataURL("image/png");
  const b = [[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]];
  ensurePanes();
  if(!imageOverlay){
    imageOverlay = L.imageOverlay(url, b, {opacity: 0.92, interactive:false, pane:"rasterPane"}).addTo(map);
  }else{
    imageOverlay.setUrl(url);
    imageOverlay.setBounds(b);
  }
  state.overlay = imageOverlay;
}


/* ------------------------------
   Top‑10 extraction + UI
------------------------------ */
function topKFromArray(arr, k=10){
  const W = state.grid.width, H = state.grid.height;
  const lonMin = state.grid.lon_min, lonMax = state.grid.lon_max;
  const latMin = state.grid.lat_min, latMax = state.grid.lat_max;
  const dx = (lonMax - lonMin) / (W-1);
  const dy = (latMax - latMin) / (H-1);
  // keep best k (simple insertion)
  const best = [];
  for(let i=0;i<arr.length;i++){
    const v = arr[i];
    if(!Number.isFinite(v)) continue;
    if(best.length < k){
      best.push({i,v});
      best.sort((a,b)=>a.v-b.v);
    }else if(v > best[0].v){
      best[0] = {i,v};
      best.sort((a,b)=>a.v-b.v);
    }
  }
  best.sort((a,b)=>b.v-a.v);
  return best.map((x,rank)=>{
    const r = Math.floor(x.i / W);
    const c = x.i % W;
    const lon = lonMin + c*dx;
    const lat = latMax - r*dy;
    return {rank:rank+1, lat, lon, p: x.v};
  });
}

function normalizeStablePointsAsset(asset){
  if(!asset) return [];
  if(Array.isArray(asset.points)) return asset.points;
  if(Array.isArray(asset.features)) return asset.features.map(f=>({ ...(f.properties||{}), lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1] }));
  return [];
}

function stableAssetRowsForTable(asset){
  const pts = normalizeStablePointsAsset(asset);
  return pts.map((pt, idx)=>({
    rank: pt.rank || (idx+1),
    lat: Number(pt.lat),
    lon: Number(pt.lon),
    p: Number.isFinite(pt.stable_hotspot) ? pt.stable_hotspot : Number(pt.probability || pt.p || NaN),
    persist: Number(pt.persistence),
    stability: Number(pt.stability),
    duration_hours: Number(pt.duration_hours),
  })).filter(x=>Number.isFinite(x.lat) && Number.isFinite(x.lon) && Number.isFinite(x.p));
}

function renderTop10(list, covs){
  const stableAsset = (state.map === "phab" && state.lastComputed?.temporalProducts?.source === "precomputed") ? (state.lastComputed?.temporalProducts?.stableAsset || null) : null;
  const stableRows = stableAssetRowsForTable(stableAsset);
  const tableList = stableRows.length ? stableRows : (Array.isArray(list) ? list : []);
  const lim = tableList.length;
  if($("sumTop")){
    const show = Math.min(lim, parseInt($("topLimit")?.value || "100", 10) || 100);
    safeText("sumTop", (lang === "fa")
      ? `نقاط برتر (روی نقشه: ۱۰ • جدول: ${show})`
      : `Hotspots (Map: Top‑10 • Table: ${show})`);
  }

  markerLayer.clearLayers();
  if(!lim){
    $("top10Table").innerHTML = `<div class="muted">${lang==="fa"?"هیچ نقطه‌ای با فیلتر فعلی پیدا نشد.":"No hotspots matched the current filter."}</div>`;
    return;
  }

  const tp = state.lastComputed?.temporalProducts || null;
  const showTemporalCols = !!tp && state.map === "phab";
  const rows = [];
  for(const pt of tableList){
    const showOnMap = (pt.rank<=10);
    if(showOnMap){
      ensurePanes();
      const icon = L.divIcon({
        className:"",
        html:`<div class="rankDot">${pt.rank}</div>`,
        iconSize:[26,26],
        iconAnchor:[13,13]
      });
      const mk = L.marker([pt.lat, pt.lon], {icon, pane:"topPointPane", bubblingMouseEvents:false, bubblingPointerEvents:false}).addTo(markerLayer);
      mk.on("click", (e)=>{ try{ suppressNextMapClick(); L.DomEvent.stop(e); }catch(_){ } showPointPopup(pt.lat, pt.lon, {kind:"top", rank:pt.rank}); });
    }

    const covIdx = Math.max(0, (pt.rank||1)-1);
    const sst = covs?.sst?.[covIdx];
    const chl = covs?.chl?.[covIdx];
    const cur = covs?.current?.[covIdx];
    const wav = covs?.waves?.[covIdx];
    const pPct = pt.p*100;
    const badgeClass = (pPct>=70) ? "good" : (pPct>=40) ? "mid" : "bad";
    const row = {
      "#": pt.rank,
      "P%": `<span class="badge ${badgeClass}">${pPct.toFixed(1)}%</span>`,
      "Lat": pt.lat.toFixed(4),
      "Lon": pt.lon.toFixed(4),
      "SST": (sst!=null)? sst.toFixed(2) : "—",
      "Chl": (chl!=null)? chl.toFixed(3) : "—",
      "Cur": (cur!=null)? cur.toFixed(2) : "—",
      "Hs": (wav!=null)? wav.toFixed(2) : "—",
    };
    if(showTemporalCols){
      const idx = gridIndexFromLatLon(pt.lat, pt.lon);
      if(idx){
        const p = tp.persist?.[idx.i];
        const st = tp.stability?.[idx.i];
        const dur = tp.duration?.[idx.i];
        row["Persist"] = Number.isFinite(pt.persist) ? `${(pt.persist*100).toFixed(0)}%` : (Number.isFinite(p) ? `${(p*100).toFixed(0)}%` : "—");
        row["Stable"] = Number.isFinite(pt.stability) ? pt.stability.toFixed(2) : (Number.isFinite(st) ? st.toFixed(2) : "—");
        row["Dur"] = Number.isFinite(pt.duration_hours) ? `${pt.duration_hours}h` : (Number.isFinite(dur) ? `${dur*temporalStepHours()}h` : "—");
      }
    }
    rows.push(row);
  }

  let html = `<table><thead><tr>${Object.keys(rows[0]||{"#":0}).map(k=>`<th>${k}</th>`).join("")}</tr></thead><tbody>`;
  for(const r of rows){
    html += `<tr>${Object.values(r).map(v=>`<td>${v}</td>`).join("")}</tr>`;
  }
  html += `</tbody></table>`;
  $("top10Table").innerHTML = html;
  tryFetchStablePointsAsset().then(asset=>{
    if(state.lastComputed?.temporalProducts && asset) state.lastComputed.temporalProducts.stableAsset = asset;
    if(asset && !stableRows.length){
      renderTop10(stableAssetRowsForTable(asset), covs);
      return;
    }
    if(!asset || !$("top10Table")) return;
    const note = document.createElement("div");
    note.className = "muted";
    note.style.marginTop = "8px";
    const count = Array.isArray(asset?.points) ? asset.points.length : (Array.isArray(asset?.features) ? asset.features.length : null);
    const rpt = state.summaryReport || {};
    const rptEntry = currentSummaryReportEntry();
    const expCfg = currentExportsConfig();
    const endLabel = selectedEndTimeId() || rptEntry?.latest_end_time_id || rpt.latest_by_species?.[state.species]?.[currentTemporalSummaryKey()] || null;
    const topNLabel = Number.isFinite(rptEntry?.top_n) ? rptEntry.top_n : (Number.isFinite(expCfg?.top_n) ? expCfg.top_n : (Number.isFinite(rpt.top_n) ? rpt.top_n : null));
    const winLabel = Number.isFinite(rptEntry?.window_hours) ? rptEntry.window_hours : (Number.isFinite(rpt.window_hours) ? rpt.window_hours : null);
    const thrLabel = Number.isFinite(rptEntry?.threshold) ? rptEntry.threshold : (Number.isFinite(rpt.threshold) ? rpt.threshold : null);
    const prefixLabel = rptEntry?.prefix || null;
    note.textContent = (lang==="fa")
      ? `خروجی summary ذخیره‌شده یافت شد${count!=null ? ` • ${count} نقطه` : ""}${prefixLabel ? ` • ${prefixLabel}` : ""}${topNLabel!=null ? ` • top_n: ${topNLabel}` : ""}${winLabel!=null ? ` • پنجره: ${winLabel}h` : ""}${thrLabel!=null ? ` • آستانه: ${thrLabel}` : ""}${endLabel ? ` • پایان: ${endLabel}` : ""}`
      : `Stored summary asset detected${count!=null ? ` • ${count} points` : ""}${prefixLabel ? ` • ${prefixLabel}` : ""}${topNLabel!=null ? ` • top_n: ${topNLabel}` : ""}${winLabel!=null ? ` • window: ${winLabel}h` : ""}${thrLabel!=null ? ` • threshold: ${thrLabel}` : ""}${endLabel ? ` • end: ${endLabel}` : ""}`;
    const assets = getTemporalSummaryAssets();
    const endTid = selectedEndTimeId();
    const mkLink = (label, rel) => {
      const href = rel ? summaryFileUrl(rel.replaceAll('{time_id}', endTid || '').replaceAll('{time}', endTid || '')) : null;
      return href ? ` <a href="${href}" target="_blank" rel="noopener">${label}</a>` : '';
    };
    note.innerHTML += mkLink('JSON', assets?.json) + mkLink('GeoJSON', assets?.geojson) + mkLink('CSV', assets?.csv);
    $("top10Table").appendChild(note);
  }).catch(()=>{});
}

/* ------------------------------
   Profile + audit
------------------------------ */
function renderProfile(){
  const sp = state.meta?.species_profile;
  if(!sp){ $("profileBox").innerHTML = "—"; return; }
  const p = sp.priors;
  const w = sp.layer_weights;
  const refs = (sp.references||[]).map(x=>`<li>${x}</li>`).join("");
  $("profileBox").innerHTML = `
    <div><b>${sp.label?.en || ""}</b> • <span class="muted">${sp.scientific_name||""}</span></div>
    <div class="muted">Region: ${sp.region||"—"}</div>
    <div style="margin-top:8px"><b>Priors</b></div>
    <ul class="bullets">
      <li>SST opt/sigma: ${p.sst_opt_c}°C / ${p.sst_sigma_c}</li>
      <li>Chl opt: ${p.chl_opt_mg_m3} mg/m³ (σ log10=${p.chl_sigma_log10})</li>
      <li>Current opt/sigma: ${p.current_opt_m_s} m/s / ${p.current_sigma_m_s}</li>
      <li>Waves soft max: ${p.waves_hs_soft_max_m} m</li>
    </ul>
    <div><b>Layer weights</b></div>
    <ul class="bullets">
      <li>Temp: ${w.temp} • Chl: ${w.chl} • Front: ${w.front} • Current: ${w.current} • Waves: ${w.waves}</li>
    </ul>
    <div><b>Key references</b></div>
    <ul class="bullets">${refs}</ul>
    <div class="muted small">${sp.notes||""}</div>
  `;
}

function renderAudit(){
  const meta = state.meta;
  if(!meta){ safeText("auditBox", "—"); return; }
  safeText("auditBox", JSON.stringify({
    run_id: meta.run_id,
    variant: meta.variant,
    species: meta.species,
    defaults: meta.defaults,
    ppp_model: meta.ppp_model,
    grid: meta.grid,
    times: meta.times?.length,
  }, null, 2));
}

/* ------------------------------
   Compute & update view
------------------------------ */
function getSelectedTimes(){
  const i0 = $("t0Select").selectedIndex;
  const i1 = $("t1Select").selectedIndex;
  const lb = parseInt($("lookbackSelect")?.value || "0", 10);
  const avgOn = ($("avgToggle")?.checked) || (lb !== 0);
  if(!avgOn){
    // Single-time mode: use "To" as the active timestamp
    return [state.times[i1]];
  }
  const a = Math.min(i0,i1);
  const b = Math.max(i0,i1);
  return state.times.slice(a, b+1);
}

function mapTitle(){
  const m = $("mapSelect").value;
  const tv = $("temporalViewSelect")?.value || state.temporalView || "instant";
  if(m === "phab" && tv !== "instant"){
    const wh = temporalWindowHours();
    if(tv === "mean") return `Habitat Suitability • Mean (${wh}h)`;
    if(tv === "p90") return `Habitat Suitability • P90 (${wh}h)`;
    if(tv === "persist") return `Habitat Suitability • Persistence (${wh}h)`;
    if(tv === "stability") return `Habitat Suitability • Stability (${wh}h)`;
    if(tv === "duration") return `Habitat Suitability • Stable duration (${wh}h)`;
    if(tv === "stable") return `Habitat Suitability • Stable hotspot (${wh}h)`;
  }
  if(m==="pcatch") return "Pcatch (Habitat×Ops)";
  if(m==="phab") return "Habitat Suitability";
  if(m==="pops") return "Operational Feasibility";
  if(m==="agree") return "Agreement (ensemble)";
  if(m==="spread") return "Spread/Std (ensemble)";
  if(m==="conf") return "Confidence / Opacity";
  return m;
}

async function loadCovAtPoints(timeIso, points){
  const timeId = timeIdFromIso(timeIso);
  const W = state.grid.width, H = state.grid.height;
  const lonMin = state.grid.lon_min, lonMax = state.grid.lon_max;
  const latMin = state.grid.lat_min, latMax = state.grid.lat_max;
  const dx = (lonMax - lonMin) / (W-1);
  const dy = (latMax - latMin) / (H-1);

  async function loadArr(key, dtype){
    const tpl = state.meta?.paths?.per_time?.[key];
    if(!tpl) return new Float32Array(W*H).fill(NaN);
    const url = latestUrl(`${state.runPath}/${tpl.replace("{time}", timeId).replace("{time_id}", timeId)}`);
    try{ return await fetchBin(url, dtype); }catch(_){ return new Float32Array(W*H).fill(NaN); }
  }
  const [sst, chl, cur, wav] = await Promise.all([
    loadArr("sst","f32"), loadArr("chl","f32"), loadArr("current","f32"), loadArr("waves","f32")
  ]);

  const out = {sst:[], chl:[], current:[], waves:[]};
  for(const pt of points){
    const c = Math.round((pt.lon - lonMin)/dx);
    const r = Math.round((latMax - pt.lat)/dy);
    const rr = Math.min(H-1, Math.max(0, r));
    const cc = Math.min(W-1, Math.max(0, c));
    const idx = rr*W+cc;
    out.sst.push(sst[idx]);
    out.chl.push(chl[idx]);
    out.current.push(cur[idx]);
    out.waves.push(wav[idx]);
  }
  return out;
}

async function getConfAggregated(timeIsos){
  // aggregate confidence similarly to probs (but mean)
  const W = state.grid.width, H = state.grid.height;
  const promises = timeIsos.map(t=>{
    const tid = timeIdFromIso(t);
    const url = latestUrl(`${state.runPath}/${state.meta.paths.per_time.conf.replace("{time}", tid).replace("{time_id}", tid)}`);
    return fetchBin(url,"f32");
  });
  const arrs = await Promise.all(promises);
  const conf = aggregatePerPixel(arrs, "mean");

  // QC mask if toggle
  if(state.qcOn){
    const qcArrs = await Promise.all(timeIsos.map(async t=>{
      const tid = timeIdFromIso(t);
      const url = latestUrl(`${state.runPath}/${state.meta.paths.per_time.qc_chl.replace("{time}", tid).replace("{time_id}", tid)}`);
      return fetchBin(url,"u8");
    }));
    const qcMean = new Float32Array(conf.length);
    for(let i=0;i<conf.length;i++){
      if(state.analysisMask && state.analysisMask[i]===0){ qcMean[i]=0; continue; }
      let s=0, k=0;
      for(let t=0;t<qcArrs.length;t++){
        s += (qcArrs[t][i] > 0) ? 1 : 0;
        k++;
      }
      qcMean[i] = (k>0)? (s/k) : 1;
    }
    for(let i=0;i<conf.length;i++) conf[i] = conf[i] * qcMean[i];
  }
  return conf;
}

function applyFilterMaskToArray(arr){
  // After analysis: optionally filter results by a second AOI (post-filter)
  if(!state.filterMask) return arr;
  const out = new Float32Array(arr.length);
  for(let i=0;i<arr.length;i++){
    const v = arr[i];
    if(!Number.isFinite(v)){ out[i]=NaN; continue; }
    out[i] = (state.filterMask[i]===1) ? v : NaN;
  }
  return out;
}

function getStablePresetConfig(){
  const preset = $("stablePresetSelect")?.value || state.stablePreset || "normal";
  if(preset === "lenient") return {persist:0.34, run:2};
  if(preset === "strict") return {persist:0.67, run:4};
  return {persist:0.5, run:3};
}
function applyStableCellsFilter(arr, temporalProducts){
  if(!(state.onlyStableCells && temporalProducts)) return arr;
  const cfg = getStablePresetConfig();
  const out = new Float32Array(arr.length);
  for(let i=0;i<arr.length;i++){
    const v = arr[i];
    if(!Number.isFinite(v)){ out[i]=NaN; continue; }
    const okPersist = Number.isFinite(temporalProducts.persist?.[i]) && temporalProducts.persist[i] >= cfg.persist;
    const okRun = Number.isFinite(temporalProducts.duration?.[i]) && temporalProducts.duration[i] >= cfg.run;
    out[i] = (okPersist && okRun) ? v : NaN;
  }
  return out;
}

function getTopFilter(){
  const minP = parseFloat($("minP")?.value ?? "0")/100;
  const lim = parseInt($("topLimit")?.value ?? "100");
  return {minP, lim};
}

function renderFromCache(){
  if(!state.lastComputed) return;
  const {arrAgg, confAgg, timeIsos} = state.lastComputed;
  let arrShown = applyFilterMaskToArray(arrAgg);
  arrShown = applyStableCellsFilter(arrShown, state.lastComputed?.temporalProducts);
  const confShown = (confAgg && confAgg.length===arrShown.length) ? confAgg : new Float32Array(arrShown.length).fill(1);
  state.lastComputed.arrShown = arrShown;
  state.lastComputed.confShown = confShown;

  refreshStops();
  setLegend(mapTitle());
  renderOverlay(arrShown, confShown);

  const {minP, lim} = getTopFilter();
  const topAll = topKFromArray(arrShown, 100);
  const topFiltered = topAll.filter(x=>x.p >= minP).slice(0, Math.min(100, lim));
  // attach rank + percentile for exports
  const dist = state._distVals || [];
  topFiltered.forEach((pt, idx)=>{
    pt.rank = idx+1;
    pt.pct = (typeof percentileOfValue==='function') ? percentileOfValue(pt.p/100) : null;
  });
  state.lastComputed.topFiltered = topFiltered;


  const midTime = timeIsos[Math.floor(timeIsos.length/2)];
  loadCovAtPoints(midTime, topFiltered).then(covs=>renderTop10(topFiltered, covs));
}


async function computeAndRender(){
  localStorage.setItem("species", state.species);
  localStorage.setItem("model", state.model);
  localStorage.setItem("map", state.map);
  localStorage.setItem("agg", state.agg);

  const timeIsos = getSelectedTimes();
  const mapKey = $("mapSelect").value;
  const modelKey = $("modelSelect").value;
  const temporalView = $("temporalViewSelect")?.value || state.temporalView || "instant";
  state.temporalView = temporalView;
  localStorage.setItem("temporalView", temporalView);

  const W = state.grid.width, H = state.grid.height;
  async function loadLayerForTime(timeIso){
    const tid = timeIdFromIso(timeIso);
    let key = null;
    if(mapKey==="pcatch") key = `pcatch_${modelKey}`;
    else if(mapKey==="phab") key = (modelKey==="frontplus") ? "phab_frontplus" : "phab_scoring";
    else if(mapKey==="pops") key = "pops";
    else if(mapKey==="agree") key = "agree";
    else if(mapKey==="spread") key = "spread";
    else if(mapKey==="conf") key = "conf";
    else key = (mapKey==="phab") ? "phab_scoring" : `pcatch_${modelKey}`;
    const tpl = state.meta.paths.per_time[key];
    if(!tpl || typeof tpl !== "string"){
      console.warn("Missing layer template:", key);
      return new Float32Array(W*H).fill(NaN);
    }
    return fetchBin(latestUrl(`${state.runPath}/${tpl.replace("{time}", tid).replace("{time_id}", tid)}`), (key.endsWith("_u8")?"u8":"f32"));
  }

  let arrAgg, confAgg;
  let temporalProducts = null;

  if(mapKey === "phab" && temporalView !== "instant"){
    temporalProducts = await ensureTemporalProducts();
    temporalProducts.timeIsos = temporalProducts.timeIsos || getTemporalWindowTimes();
    if(temporalView === "mean") arrAgg = temporalProducts.mean;
    else if(temporalView === "p90") arrAgg = temporalProducts.p90;
    else if(temporalView === "persist") arrAgg = temporalProducts.persist;
    else if(temporalView === "stability") arrAgg = temporalProducts.stability;
    else if(temporalView === "duration"){
      const out = new Float32Array(temporalProducts.duration.length);
      for(let i=0;i<out.length;i++) out[i] = normalizeDurationValue(temporalProducts.duration[i], temporalProducts.count);
      arrAgg = out;
    }else if(temporalView === "stable") arrAgg = temporalProducts.stableHotspot;
    else arrAgg = temporalProducts.mean;
    confAgg = await getConfAggregated(temporalProducts.timeIsos);
    state.lastComputed = {arrAgg, confAgg, timeIsos: temporalProducts.timeIsos, temporalProducts};
  }else{
    const arrs = await Promise.all(timeIsos.map(loadLayerForTime));
    let aggMethod = $("aggSelect").value;
    if(mapKey==="conf") aggMethod = "mean";
    arrAgg = aggregatePerPixel(arrs, aggMethod);
    confAgg = (mapKey==="conf")
      ? (()=>{ const c = new Float32Array(arrAgg.length); for(let i=0;i<c.length;i++) c[i] = Number.isFinite(arrAgg[i]) ? 1.0 : 0.0; return c; })()
      : await getConfAggregated(timeIsos);
    if(mapKey === "phab"){
      temporalProducts = await ensureTemporalProducts();
      temporalProducts.timeIsos = temporalProducts.timeIsos || getTemporalWindowTimes();
    }
    state.lastComputed = {arrAgg, confAgg, timeIsos, temporalProducts};
  }

  try{ computeScaleAndPercentiles(arrAgg); }catch(_){ }
  renderFromCache();
  if(!state._didFit){
    map.fitBounds([[state.grid.lat_min, state.grid.lon_min],[state.grid.lat_max, state.grid.lon_max]]);
    state._didFit = true;
  }
}


/* ------------------------------
   Run/variant/species meta wiring
------------------------------ */
async function refreshMeta(){
  await resolveLatestBase();
  state.index = await fetchJson(latestUrl("meta_index.json"));
  const runSelect = $("runSelect");
  runSelect.innerHTML = "";
  for(const r of state.index.runs){
    const opt = document.createElement("option");
    opt.value = r.run_id;
    opt.textContent = `${r.run_id} (${r.fast ? "fast" : "full"})`;
    runSelect.appendChild(opt);
  }
  state.runId = state.index.latest_run_id || state.index.runs[state.index.runs.length-1]?.run_id;
  runSelect.value = state.runId;

  runSelect.onchange = async ()=>{
    state.runId = runSelect.value;
    state._stableAssetCache?.clear?.();
    await refreshVariants();
  };

  await refreshVariants();
}

async function refreshVariants(){
  const run = state.index.runs.find(r=>r.run_id===state.runId);
  state.runPath = run.path; // e.g., runs/demo_YYYY-MM-DD
  const variantSelect = $("variantSelect");
  variantSelect.innerHTML = "";
  for(const v of run.variants){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    variantSelect.appendChild(opt);
  }

  // Keep gap toggle in sync with variant
  const preferred = ($("gapToggle").checked) ? "gapfill" : "base";
  state.variant = run.variants.includes(preferred) ? preferred : run.variants[0];
  variantSelect.value = state.variant;

  variantSelect.onchange = async ()=>{
    state.variant = variantSelect.value;
    $("gapToggle").checked = (state.variant === "gapfill");
    state._stableAssetCache?.clear?.();
    await loadSpeciesMetaAndInit();
  };

  await loadSpeciesMetaAndInit();
}

async function loadSpeciesMetaAndInit(){
  state.species = $("speciesSelect").value;
  state._stableAssetCache?.clear?.();
  // species meta path:
  const url = latestUrl(`${state.runPath}/variants/${state.variant}/species/${state.species}/meta.json`);
  state.meta = await fetchJson(url);
  // run-level meta for availability reporting + deduped time catalog
  state.runMeta = await fetchJson(latestUrl(`${state.runPath}/meta.json`)).catch(()=>null);
  await Promise.all([loadSummaryManifest(), loadUiConfig(), loadSummaryReport()]);
  applyUiConfigDefaults();
  state.grid = state.meta.grid;

  
  ensureGridBounds();
// load server mask
  const maskUrl = latestUrl(`${state.runPath}/${state.meta.paths.mask}`);
  state.baseMask = await fetchBin(maskUrl, "u8");

  // effective analysis mask = server mask × user AOI
  state.analysisMask = combineMask(state.baseMask, state.userMask);

  // time selects (prefer runMeta.available_time_ids to avoid listing missing future bins)
  const availableTimeIds = state.runMeta?.available_time_ids || state.meta.time_ids || [];
  state.timeIds = await filterTimeIdsByExistingLayer(availableTimeIds);
  // keep derived ISO list in sync
  state.times = state.timeIds.map(timeIdToIso);
  state.isoToTimeId = {};
  for(let i=0;i<state.times.length;i++){ state.isoToTimeId[state.times[i]] = state.timeIds[i]; }

  // availability info panel
  const lastTid = state.runMeta?.latest_available_time_id || (state.timeIds[state.timeIds.length-1]||null);
  if($("availabilityInfo")){
    if(lastTid){
      const lastIso = timeIdToIso(lastTid);
      $("availabilityInfo").innerHTML = `<b>${lang==="fa"?"آخرین دیتای موجود":"Latest available data"}</b><br><span class="muted">${fmtTime(lastIso)} (UTC)</span>`;
    }else{
      $("availabilityInfo").innerHTML = `<b>${lang==="fa"?"دیتایی یافت نشد":"No data found"}</b>`;
    }
  }
  $("t0Select").innerHTML = "";
  $("t1Select").innerHTML = "";
  for(const t of state.times){
    const o0 = document.createElement("option");
    o0.value = t; o0.textContent = fmtTime(t);
    const o1 = document.createElement("option");
    o1.value = t; o1.textContent = fmtTime(t);
    $("t0Select").appendChild(o0);
    $("t1Select").appendChild(o1);
  }
  // default: latest single time (for planning)
  const last = Math.max(0, state.times.length-1);
  $("t0Select").selectedIndex = last;
  $("t1Select").selectedIndex = last;

  // defaults persisted
  $("speciesSelect").value = state.species;
  $("modelSelect").value = state.model;
  $("mapSelect").value = state.map;
  $("aggSelect").value = state.agg;
  if($("gridToggle")) $("gridToggle").checked = state.gridVisible;
  if($("gridModeSelect")) $("gridModeSelect").value = state.gridMode;
  if($("coordModeSelect")) $("coordModeSelect").value = state.coordMode;
  if($("temporalViewSelect")) $("temporalViewSelect").value = state.temporalView;
  if($("temporalTintToggle")) $("temporalTintToggle").checked = state.temporalTintEnabled;
  if($("temporalTintMetricSelect")) $("temporalTintMetricSelect").value = state.temporalTintMetric;
  if($("onlyStableToggle")) $("onlyStableToggle").checked = state.onlyStableCells;
  if($("stablePresetSelect")) $("stablePresetSelect").value = state.stablePreset;

  // Per‑species lookback memory (each species can have its own averaging window)
  try{
    const savedLb = localStorage.getItem(`lookback_${state.species}`);
    if(savedLb !== null) $("lookbackSelect").value = savedLb;
  }catch(_){/* ignore */}
  applyLookback();
  syncSliderFromSelect();
  try{ drawGrid05(); }catch(_){}


  // AOI UI defaults (bbox = grid bounds)
  $("bboxLatMin").value = state.grid.lat_min.toFixed(4);
  $("bboxLatMax").value = state.grid.lat_max.toFixed(4);
  $("bboxLonMin").value = state.grid.lon_min.toFixed(4);
  $("bboxLonMax").value = state.grid.lon_max.toFixed(4);
  // Don't erase user's AOI on species switch if it exists (AOI is a user intent)
  if(!state.userMask){
    state.userMask = null;
  }
  state.analysisMask = combineMask(state.baseMask, state.userMask);
  // init filter bbox defaults too
  $("filterBboxLatMin").value = state.grid.lat_min.toFixed(4);
  $("filterBboxLatMax").value = state.grid.lat_max.toFixed(4);
  $("filterBboxLonMin").value = state.grid.lon_min.toFixed(4);
  $("filterBboxLonMax").value = state.grid.lon_max.toFixed(4);
  updateAoiStatus();

  // filter status
  updateFilterAoiStatus();

  // Leaflet draw layer + controls (once)
  if(!state._drawInit){
    state._drawInit = true;
    // Leaflet-draw calls map.getCenter() internally; make sure map is ready.
    map.whenReady(()=>{
      // Two AOIs: analysis + filter
      state.drawLayer = new L.FeatureGroup();
      map.addLayer(state.drawLayer);
      state.drawTarget = "analysis";

      // Keep last drawn shapes separated (for styling and status)
      state.drawnAnalysis = null;
      state.drawnFilter = null;

      // Focus decides where draw goes
      $("aoiText").addEventListener("focus", ()=> state.drawTarget = "analysis");
      $("filterAoiText").addEventListener("focus", ()=> state.drawTarget = "filter");

      const drawControl = new L.Control.Draw({
        edit: { featureGroup: state.drawLayer },
        draw: { polyline:false, circle:false, circlemarker:false, marker:false }
      });
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (e)=>{
        // Style by target
        if(state.drawTarget === "filter"){
          if(state.drawnFilter) state.drawLayer.removeLayer(state.drawnFilter);
          e.layer.setStyle?.({color:"#ffe95a", weight:2, fillOpacity:0.05});
          state.drawnFilter = e.layer;
          state.drawLayer.addLayer(e.layer);
          const gj = e.layer.toGeoJSON();
          $("filterAoiText").value = JSON.stringify(gj, null, 2);
          applyFilterAoiFromText();
        }else{
          if(state.drawnAnalysis) state.drawLayer.removeLayer(state.drawnAnalysis);
          e.layer.setStyle?.({color:"#39ff9f", weight:2, fillOpacity:0.05});
          state.drawnAnalysis = e.layer;
          state.drawLayer.addLayer(e.layer);
          const gj = e.layer.toGeoJSON();
          $("aoiText").value = JSON.stringify(gj, null, 2);
          applyUserAoiFromText();
        }
      });
    });
  }

  renderProfile();
  renderAudit();

  // compute
  setDirty();
}

/* ------------------------------
   UI events
------------------------------ */
["speciesSelect","modelSelect","mapSelect","aggSelect","t0Select","t1Select","temporalViewSelect"].forEach(id=>{
  $(id).addEventListener("change", async ()=>{
    const prevSpecies = state.species;
    state.species = $("speciesSelect").value;
    state.model = $("modelSelect").value;
    state.map = $("mapSelect").value;
    state.agg = $("aggSelect").value;

    // if species changed, reload meta (different profile + files)
    if(id==="speciesSelect"){
      // Persist per-species lookback (commercial UX: each species remembers its own average window)
      try{ localStorage.setItem(`lookback_${prevSpecies}`, $("lookbackSelect").value); }catch(_){/* ignore */}
      await loadSpeciesMetaAndInit();
      setDirty("Species changed. Press Analyze.");
      return;
    }
    setDirty();
    scheduleAnalyze();
  });
});

$("qcToggle").addEventListener("change", async ()=>{
  state.qcOn = $("qcToggle").checked;
  setDirty();
});

$("gapToggle").addEventListener("change", async ()=>{
  // Switch variant to base/gapfill if available
  const want = $("gapToggle").checked ? "gapfill" : "base";
  const run = state.index.runs.find(r=>r.run_id===state.runId);
  if(run.variants.includes(want)){
    state.variant = want;
    $("variantSelect").value = want;
    await loadSpeciesMetaAndInit();
  }else{
    // revert
    $("gapToggle").checked = (state.variant==="gapfill");
  }
});

$("analyzeBtn").addEventListener("click", async ()=>{
  state.dirty = false;
  safeText("dirtyHint", (lang==="fa") ? "در حال تحلیل..." : "Analyzing…");
  $("top10Table").innerHTML = `<div class="skeleton" style="height:180px"></div>`;
  toast(lang==="fa" ? "در حال بارگذاری داده‌ها" : "Loading data…", "ok", lang==="fa"?"تحلیل":"Analyze");
  try{ await computeAndRender(); }
  catch(err){
    console.error(err);
    toast(lang==="fa" ? "داده برای این بازه هنوز آماده نیست. اگر تحلیل در حال اجراست، کمی بعد دوباره امتحان کن." : "Data not available for this selection yet. If a backend run is in progress, try again later.", "warn", lang==="fa"?"در دسترس نیست":"Not ready");
    safeText("dirtyHint", (lang==="fa") ? "داده هنوز آماده نیست" : "Not ready yet");
    return;
  }
  safeText("dirtyHint", (lang==="fa") ? "انجام شد ✅" : "Done ✅");
});

$("lookbackSelect").addEventListener("change", ()=>{
  try{ localStorage.setItem(`lookback_${state.species}`, $("lookbackSelect").value); }catch(_){/* ignore */}
  applyLookback();
  setDirty("Lookback changed. Press Analyze.");
});
$("t1Select").addEventListener("change", ()=>{ applyLookback(); syncSliderFromSelect(); scheduleAnalyze(); });
function applyLookback(){
  const d = parseInt($("lookbackSelect").value||"0");
  if(!d || !state.times?.length) return;
  const t1Iso = $("t1Select").value;
  const t1 = new Date(t1Iso);
  const t0 = new Date(t1.getTime() - d*24*3600*1000);
  // choose closest available time >= t0
  let bestIdx=0, bestDt=1e18;
  for(let i=0;i<state.times.length;i++){
    const tt = new Date(state.times[i]);
    const diff = Math.abs(tt.getTime() - t0.getTime());
    if(diff<bestDt){ bestDt=diff; bestIdx=i; }
  }
  $("t0Select").selectedIndex = bestIdx;
}



function setDirty(msg){
  state.dirty = true;
  safeText("dirtyHint", msg || "Change settings, then press Analyze.");
}

function parsePointsToPolygonGeoJSON(txt, name="points_poly"){
  // Accept lines like: "lat,lon" or "lat lon" or "lon,lat" if user prefixes with "lon:" (kept simple)
  const lines = (txt||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const pts = [];
  for(const l of lines){
    const parts = l.split(/[,\s]+/).filter(Boolean);
    if(parts.length<2) continue;
    const a = parseFloat(parts[0]), b = parseFloat(parts[1]);
    if(!isFinite(a)||!isFinite(b)) continue;
    // assume lat,lon (most common). We'll treat |lat|<=90 as lat.
    let lat=a, lon=b;
    if(Math.abs(a)>90 && Math.abs(b)<=90){ lon=a; lat=b; }
    pts.push([lon, lat]);
  }
  if(pts.length < 3) throw new Error("Need at least 3 points");
  // close ring
  if(pts[0][0]!==pts[pts.length-1][0] || pts[0][1]!==pts[pts.length-1][1]) pts.push(pts[0]);
  return {type:"Feature", properties:{name}, geometry:{type:"Polygon", coordinates:[pts]}};
}

function updateAoiStatus(){
  const on = !!state.userMask;
  safeText("aoiStatus", on ? "AOI: active ✅ (mask applied)" : "AOI: none (using server mask)");
}
function applyUserAoiFromText(){
  try{
    const raw = $("aoiText").value.trim();
    if(!raw){ state.userAoi=null; state.userMask=null; updateAoiStatus(); setDirty("AOI cleared. Press Analyze."); return; }
    const gj = JSON.parse(raw);
    state.userAoi = gj;
    state.userMask = buildMaskFromGeoJSON(gj);
    state.analysisMask = combineMask(state.baseMask, state.userMask);
    updateAoiStatus();
    setDirty("AOI updated. Press Analyze.");
  }catch(err){
    alert("Invalid GeoJSON ❌");
  }
}
$("useAoiBtn").addEventListener("click", ()=>applyUserAoiFromText());
$("clearAoiBtn").addEventListener("click", ()=>{
  $("aoiText").value="";
  if(state.drawnAnalysis){ state.drawLayer?.removeLayer(state.drawnAnalysis); state.drawnAnalysis=null; }
  state.userAoi=null; state.userMask=null;
  state.analysisMask = combineMask(state.baseMask, state.userMask);
  updateAoiStatus();
  setDirty("AOI cleared. Press Analyze.");
});
$("aoiFile").addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const txt = await f.text();
  $("aoiText").value = txt;
  applyUserAoiFromText();
});
$("useBboxBtn").addEventListener("click", ()=>{
  const latMin=parseFloat($("bboxLatMin").value), latMax=parseFloat($("bboxLatMax").value);
  const lonMin=parseFloat($("bboxLonMin").value), lonMax=parseFloat($("bboxLonMax").value);
  if(!isFinite(latMin)||!isFinite(latMax)||!isFinite(lonMin)||!isFinite(lonMax)){ alert("Invalid bbox"); return; }
  const poly = [[
    [lonMin,latMin],[lonMax,latMin],[lonMax,latMax],[lonMin,latMax],[lonMin,latMin]
  ]];
  const gj = {type:"Feature", properties:{name:"bbox"}, geometry:{type:"Polygon", coordinates:poly}};
  $("aoiText").value = JSON.stringify(gj, null, 2);
  // draw on map
  try{
    if(state.drawnAnalysis) state.drawLayer?.removeLayer(state.drawnAnalysis);
    const lyr = L.geoJSON(gj, {style:{color:"#39ff9f", weight:2, fillOpacity:0.05}});

$("usePointsBtn").addEventListener("click", ()=>{
  const txt = $("aoiPoints")?.value?.trim();
  if(!txt){ alert("Please paste points (lat,lon) first."); return; }
  try{
    const gj = parsePointsToPolygonGeoJSON(txt, "points");
    $("aoiText").value = JSON.stringify(gj, null, 2);
    // draw on map
    try{
      if(state.drawnAnalysis) state.drawLayer?.removeLayer(state.drawnAnalysis);
      const lyr = L.geoJSON(gj, {style:{color:"#39ff9f", weight:2, fillOpacity:0.05}});
      lyr.eachLayer(l=>{ state.drawnAnalysis = l; state.drawLayer?.addLayer(l); });
      // fit bounds
      try{ map.fitBounds(lyr.getBounds(), {padding:[20,20]}); }catch(e){}
    }catch(e){}
    applyUserAoiFromText();
  }catch(err){
    alert("Invalid points list ❌ (need ≥3 points)");
  }
});
    lyr.eachLayer(l=>{ state.drawnAnalysis = l; state.drawLayer?.addLayer(l); });
  }catch(e){}
  applyUserAoiFromText();
});

// ---- Filter AOI (post-analysis) ----
function updateFilterAoiStatus(){
  const on = !!state.filterMask;
  safeText("filterAoiStatus", on ? "Filter: active ✅" : "Filter: none");
}
function applyFilterAoiFromText(){
  try{
    const raw = $("filterAoiText").value.trim();
    if(!raw){ state.filterAoi=null; state.filterMask=null; updateFilterAoiStatus(); renderFromCache(); return; }
    const gj = JSON.parse(raw);
    state.filterAoi = gj;
    // filter mask should still respect analysis mask
    const m = buildMaskFromGeoJSON(gj);
    state.filterMask = combineMask(state.analysisMask || state.baseMask, m);
    updateFilterAoiStatus();
    renderFromCache();
  }catch(err){
    alert("Invalid Filter GeoJSON ❌");
  }
}

$("useFilterAoiBtn").addEventListener("click", ()=>applyFilterAoiFromText());
$("clearFilterAoiBtn").addEventListener("click", ()=>{
  $("filterAoiText").value="";
  if(state.drawnFilter){ state.drawLayer?.removeLayer(state.drawnFilter); state.drawnFilter=null; }
  state.filterAoi=null; state.filterMask=null;
  updateFilterAoiStatus();
  renderFromCache();
});
$("filterAoiFile").addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const txt = await f.text();
  $("filterAoiText").value = txt;
  applyFilterAoiFromText();
});
$("useFilterBboxBtn").addEventListener("click", ()=>{
  const latMin=parseFloat($("filterBboxLatMin").value), latMax=parseFloat($("filterBboxLatMax").value);
  const lonMin=parseFloat($("filterBboxLonMin").value), lonMax=parseFloat($("filterBboxLonMax").value);
  if(!isFinite(latMin)||!isFinite(latMax)||!isFinite(lonMin)||!isFinite(lonMax)){ alert("Invalid bbox"); return; }
  const poly = [[[lonMin,latMin],[lonMax,latMin],[lonMax,latMax],[lonMin,latMax],[lonMin,latMin]]];
  const gj = {type:"Feature", properties:{name:"filter_bbox"}, geometry:{type:"Polygon", coordinates:poly}};
  $("filterAoiText").value = JSON.stringify(gj, null, 2);
  try{
    if(state.drawnFilter) state.drawLayer?.removeLayer(state.drawnFilter);
    const lyr = L.geoJSON(gj, {style:{color:"#ffe95a", weight:2, fillOpacity:0.05}});

$("useFilterPointsBtn").addEventListener("click", ()=>{
  const txt = $("filterAoiPoints")?.value?.trim();
  if(!txt){ alert("Please paste filter points (lat,lon) first."); return; }
  try{
    const gj = parsePointsToPolygonGeoJSON(txt, "filter_points");
    $("filterAoiText").value = JSON.stringify(gj, null, 2);
    // draw on map
    try{
      if(state.drawnFilter) state.drawLayer?.removeLayer(state.drawnFilter);
      const lyr = L.geoJSON(gj, {style:{color:"#ffe95a", weight:2, fillOpacity:0.05}});
      lyr.eachLayer(l=>{ state.drawnFilter = l; state.drawLayer?.addLayer(l); });
      try{ map.fitBounds(lyr.getBounds(), {padding:[20,20]}); }catch(e){}
    }catch(e){}
    applyFilterAoiFromText();
  }catch(err){
    alert("Invalid points list ❌ (need ≥3 points)");
  }
});
    lyr.eachLayer(l=>{ state.drawnFilter = l; state.drawLayer?.addLayer(l); });
  }catch(e){}
  applyFilterAoiFromText();
});

// ---- Top filters (client-side, no recompute) ----
$("minP").addEventListener("input", ()=>{
  safeText("minPVal", `${$("minP").value}%`);
  renderFromCache();
});
$("topLimit").addEventListener("change", ()=>renderFromCache());

/* animation */
$("playBtn").addEventListener("click", ()=>{
  if(state.playing){
    stopPlay();
  }else{
    startPlay();
  }
});

function startPlay(){
  if($("avgToggle")?.checked){
    toast(lang==="fa" ? "برای Play، حالت Average را خاموش کن" : "Turn off Average to Play", "info", "Play");
    return;
  }
  if(state.playing) return;
  state.playing = true;
  safeText("playBtn", "⏸ Pause");
  safeText("playBtnBottom", "⏸");

  // Keep selected range length fixed and slide it forward over available times
  const rangeLen = Math.abs($("t1Select").selectedIndex - $("t0Select").selectedIndex);

  let busy = false;
  const stepHours = Number($("stepSelect")?.value || 6);
  const stepN = Math.max(1, Math.round(stepHours/6)); // time list is 6h-granular

  const tick = async ()=>{
    if(!state.playing) return;
    if(busy){ state.timer = setTimeout(tick, 350); return; }
    busy = true;
    try{
      const i0 = $("t0Select").selectedIndex;
      const i1 = $("t1Select").selectedIndex;
      const dir = (i1 >= i0) ? 1 : -1;

      let next0 = i0 + dir*stepN;
      let next1 = next0 + dir*rangeLen;

      // wrap
      const n = state.times.length;
      while(next0 < 0) next0 += n;
      while(next0 >= n) next0 -= n;
      while(next1 < 0) next1 += n;
      while(next1 >= n) next1 -= n;

      $("t0Select").selectedIndex = next0;
      $("t1Select").selectedIndex = next1;

      // Recompute and redraw for the new time range
      await computeAndRender();
      try{ syncSliderFromSelect(); }catch(_){}
    }catch(e){
      console.error("Play step failed:", e);
    }finally{
      busy = false;
      state.timer = setTimeout(tick, 900);
    }
  };

  // kick off
  tick();
}

function stopPlay(){
  state.playing = false;
  safeText("playBtn", "▶ Play");
  safeText("playBtnBottom", "▶");
  if(state.timer) clearTimeout(state.timer);
  state.timer = null;
}

/* ------------------------------
   Download / Share
------------------------------ */
$("downloadPngBtn").addEventListener("click", ()=>{
  const url = state.canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `seydyaar_${state.runId}_${state.variant}_${state.species}_${state.map}_${state.agg}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

$("downloadGeoBtn").addEventListener("click", async ()=>{
  // create GeoJSON from current top10 markers (recompute quickly from current canvas arrays not accessible; use DOM table)
  // We'll regenerate from last render by reading markers from markerLayer
  const feats = [];
  markerLayer.eachLayer(l=>{
    const latlng = l.getLatLng();
    feats.push({
      type:"Feature",
      properties:{},
      geometry:{type:"Point", coordinates:[latlng.lng, latlng.lat]}
    });
  });
  const fc = {type:"FeatureCollection", features: feats};
  const blob = new Blob([JSON.stringify(fc, null, 2)], {type:"application/geo+json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seydyaar_top10_${state.runId}_${state.variant}_${state.species}.geojson`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ------------------------------
   Feedback (IndexedDB)
------------------------------ */
const DB_NAME = "seydyaar_feedback_db";
const STORE = "feedback";
function openDb(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, {keyPath:"id"});
      store.createIndex("ts","timestamp");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveFeedback(rec){
  const db = await openDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
  });
}
async function listFeedback(){
  const db = await openDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = ()=>resolve(req.result || []);
    req.onerror = ()=>reject(req.error);
  });
}
function closeModal(){ $("modal").classList.add("hidden"); }
function openModal(){ $("modal").classList.remove("hidden"); }

$("feedbackBtn").addEventListener("click", openModal);
$("closeModal").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

let lastFbTs = 0;
$("saveFbBtn").addEventListener("click", async ()=>{
  const now = Date.now();
  if(now - lastFbTs < 5000){
    safeText("fbHint", "Rate limit: please wait a few seconds 🙏");
    return;
  }
  const rating = $("fbRating").value;
  const lat = parseFloat($("fbLat").value);
  const lon = parseFloat($("fbLon").value);
  const depth = parseInt($("fbDepth").value,10);
  const notes = ($("fbNotes").value || "").slice(0, 500);

  // validation
  if(!Number.isFinite(lat) || !Number.isFinite(lon)){
    safeText("fbHint", "Please set lat/lon (click on map) ✅");
    return;
  }
  if(lat < state.grid.lat_min-2 || lat > state.grid.lat_max+2 || lon < state.grid.lon_min-2 || lon > state.grid.lon_max+2){
    safeText("fbHint", "Lat/Lon outside AOI bounds ⚠️");
    return;
  }

  const rec = {
    id: `${now}_${Math.round(lat*10000)}_${Math.round(lon*10000)}`,
    timestamp: new Date(now).toISOString(),
    lat, lon,
    species: state.species,
    gear_depth_m: depth,
    rating,
    notes,
    run_id: state.runId,
    variant: state.variant,
    model: state.model,
  };
  await saveFeedback(rec);
  lastFbTs = now;
  safeText("fbHint", "Saved locally ✅ (IndexedDB)");
  setTimeout(()=>{safeText("fbHint", "Saved to IndexedDB. Anti‑spam: rate‑limit + basic validation.");}, 2200);
  closeModal();
});

$("exportFbBtn").addEventListener("click", async ()=>{
  const all = await listFeedback();
  const blob = new Blob([JSON.stringify(all, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seydyaar_feedback_export.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ------------------------------
   Bootstrap
------------------------------ */
initMap();
// Ensure tiles render even if the layout/CSS loads slightly later
setTimeout(()=>{ try{ map?.invalidateSize(true); }catch(_){} }, 120);
refreshMeta().catch(err=>{
  console.error(err);
  toast(lang==="fa" ? "داده‌ای در مسیر /latest پیدا نشد. اگر هنوز خروجی تولید نکردی، Workflow GitHub Action را اجرا کن." : "No data found under /latest. If you haven't generated outputs yet, run the GitHub Action (Run generator) to create docs/latest.", "err", lang==="fa"?"خطا":"Error");
  const hint = $("dirtyHint");
  if(hint) hint.textContent = (lang==="fa") ? "داده موجود نیست — ابتدا خروجی بساز" : "No data — generate outputs first";
})
function getSelectedTimeIndex(){
  return $("t1Select")?.selectedIndex ?? 0;
}
function getSelectedTimeId(){
  const i = getSelectedTimeIndex();
  return (state.timeIds && state.timeIds[i]) ? state.timeIds[i] : null;
}

;
// ---- Debug / console helpers (so claims are testable) ----
window.state = state;
window.__SY = window.__SY || {};
window.__SY.version = "ui-docs-phab-stability-v16";
window.__SY.setFlipY = (v)=>{ state.dataNorthFirst = !!v; try{ renderFromCache(); }catch(_){} }; // true => row0 NORTH
window.__SY.setRenderFlipY = (v)=>{ state.dataNorthFirst = ! (!!v); try{ renderFromCache(); }catch(_){} }; // legacy: true => row0 SOUTH
window.__SY.setBoundsPad = (v)=>{ state.boundsPad = !!v; try{ if(state.grid) state.grid.bounds=null; ensureGridBounds(); renderFromCache(); }catch(_){} };
function syncOffsetControls(){ const latEl = $("latOffsetInput"); const lonEl = $("lonOffsetInput"); if(latEl) latEl.value = String(Number(state.manualLatOffset||0)); if(lonEl) lonEl.value = String(Number(state.manualLonOffset||0)); }
function applyManualOffsets(dLat, dLon, {persist=true, rerender=true} = {}){ state.manualLatOffset = Number(dLat||0); state.manualLonOffset = Number(dLon||0); if(persist){ localStorage.setItem("manualLatOffset", String(state.manualLatOffset)); localStorage.setItem("manualLonOffset", String(state.manualLonOffset)); } syncOffsetControls(); try{ if(state.grid) state.grid.bounds=null; ensureGridBounds(); if(rerender) renderFromCache(); }catch(e){ console.error(e);} return {latOffset: state.manualLatOffset, lonOffset: state.manualLonOffset}; }
window.__SY.setOffsets = (dLat, dLon)=> applyManualOffsets(dLat, dLon, {persist:true, rerender:true});
(function wireOffsetControls(){ const latEl = $("latOffsetInput"); const lonEl = $("lonOffsetInput"); const applyBtn = $("applyLatOffsetBtn"); const resetBtn = $("resetLatOffsetBtn"); syncOffsetControls(); applyBtn?.addEventListener("click", ()=>{ applyManualOffsets(Number(latEl?.value ?? state.manualLatOffset), Number(lonEl?.value ?? state.manualLonOffset)); toast(lang==="fa" ? "آفست نقشه اعمال شد" : "Map offset applied", "ok"); }); resetBtn?.addEventListener("click", ()=>{ applyManualOffsets(-0.35, -0.01242); toast(lang==="fa" ? "آفست پیش‌فرض بازنشانی شد" : "Offset reset to default", "ok"); });})();
window.__SY.suppress = (ms=250)=>{ suppressNextMapClick(ms); return state.__suppressMapClickUntil; };
window.__SY.getSuppress = ()=> state.__suppressMapClickUntil;

window.__SY.xyToLatLon = xyToLatLon;
window.__SY.latLonToXY = latLonToXY;


window._gridIndexFromLatLon = gridIndexFromLatLon;
window._rankFromPercentile = (typeof rankFromPercentile==="function") ? rankFromPercentile : ((x)=>null);
window.__SY.getOverlay = ()=> state.overlay;
window.__SY.getOverlayOpacity = ()=> state.overlay?.options?.opacity ?? null;
window.__SY.setOverlayOpacity = (v)=>{ try{ state.overlay?.setOpacity(Number(v)); }catch(_){} };
window.__SY.getTemporalProducts = ()=> state.lastComputed?.temporalProducts || null;
window.__SY.getSummaryReport = ()=> state.summaryReport || null;
