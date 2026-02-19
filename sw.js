/* KZRIZUSMO STORE - Service Worker (PWA) v3 */

const CACHE_NAME = "kz-store-pwa-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // addAll gagal jika salah satu asset gagal, jadi kita amankan dengan try/catch + fallback per item
    try {
      await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: "reload" })));
    } catch (e) {
      for (const u of CORE_ASSETS) {
        try { await cache.add(new Request(u, { cache: "reload" })); } catch (_e) {}
      }
    }

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Optional: allow page to force activate new SW
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isHTMLRequest(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1) Navigasi halaman: network-first (biar update cepat), fallback ke cache saat offline
  if (isHTMLRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);

        // Simpan versi terbaru untuk offline
        cache.put("./", fresh.clone());
        cache.put("./index.html", fresh.clone());

        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        const cached =
          (await cache.match("./index.html", { ignoreSearch: true })) ||
          (await cache.match("./", { ignoreSearch: true }));
        return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // 2) Same-origin asset: cache-first + runtime cache
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return cached || new Response("", { status: 504 });
      }
    })());
    return;
  }

  // 3) Cross-origin (CDN, gambar, font): stale-while-revalidate (ringan)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const fetchPromise = fetch(req).then((res) => {
      try {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      } catch (_e) {}
      return res;
    }).catch(() => cached);

    return cached || fetchPromise;
  })());
});
