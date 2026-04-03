/* Seyd‑Yaar Service Worker — static cache, never trust dynamic latest/runs data */
const CACHE = "seydyaar-v0.6.0";
const CORE = ["./","./index.html","./app.html","./styles.css","./home.js","./app.js","./manifest.json","./assets/logo.png"];

async function safeCacheCore(){
  const cache = await caches.open(CACHE);
  await Promise.allSettled(CORE.map(async (asset)=>{
    try{
      const res = await fetch(asset, {cache:"no-store"});
      if(res && res.ok) await cache.put(asset, res.clone());
    }catch(_){ }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(safeCacheCore().catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

function isDynamic(url) {
  return url.pathname.includes("/latest/") || url.pathname.includes("/runs/") || url.pathname.includes("/docs/latest/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const acceptHeader = req.headers.get("accept") || "";

  if (req.mode === "navigate" || acceptHeader.includes("text/html")) {
    event.respondWith(fetch(req).catch(async () => (await caches.match("./app.html")) || (await caches.match("./index.html")) || new Response("Offline", {status:503})));
    return;
  }

  if (isDynamic(url)) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: "no-store" });
      } catch (_) {
        const hit = await caches.match(req);
        return hit || new Response("Dynamic data unavailable", {status:503, statusText:"Service Unavailable"});
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
      }
      return res;
    } catch (_) {
      return new Response("Offline", {status:503});
    }
  })());
});
