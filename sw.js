/* Service worker de MoneyManagement.
 * Da un app-shell offline real: la app es una PWA (manifest, iconos, standalone)
 * pero sin SW no arrancaba sin conexión. Aquí cacheamos el shell y las librerías
 * de CDN, y SIEMPRE dejamos pasar las peticiones a Apps Script (datos en vivo).
 */
const CACHE_VERSION = "mm-20260712-v20";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js?v=20260712-v20",
  "./styles.css",
  "./site.webmanifest",
  "./images/logo.png",
  "./images/favicon-16x16.png",
  "./images/favicon-32x32.png",
  "./images/apple-touch-icon.png",
  "./images/icon-192.png",
  "./images/icon-512.png"
];

// Hosts de datos (Apps Script / JSONP / POST): nunca se cachean.
const LIVE_DATA_HOSTS = [
  "script.google.com",
  "script.googleusercontent.com",
  "googleusercontent.com"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      // addAll falla en bloque si un recurso da error; los añadimos best-effort
      // para no dejar la instalación a medias por un icono que falte.
      Promise.allSettled(APP_SHELL.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isLiveData(url) {
  return LIVE_DATA_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
    || url.searchParams.has("callback");
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Datos en vivo: fuera del SW, siempre a la red.
  if (isLiveData(url)) return;

  const sameOrigin = url.origin === self.location.origin;

  // Navegaciones: red primero, con el index cacheado como red de seguridad offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() => caches.match("./index.html").then(cached => cached || caches.match("./")))
    );
    return;
  }

  // Librerías de CDN (Chart.js, Lucide): versionadas e inmutables → cache-first.
  if (!sameOrigin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        cachePut(request, response.clone());
        return response;
      }).catch(() => cached))
    );
    return;
  }

  // Estáticos propios (app.js, styles.css, imágenes): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        cachePut(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

function cachePut(request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  caches.open(CACHE_VERSION).then(cache => cache.put(request, response)).catch(() => {});
}
