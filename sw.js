/* Service worker de MoneyManagement.
 * Da un app-shell offline real: la app es una PWA (manifest, iconos, standalone)
 * pero sin SW no arrancaba sin conexión. Aquí cacheamos el shell y las librerías
 * de CDN, y SIEMPRE dejamos pasar las peticiones a Apps Script (datos en vivo).
 */
// Una sola fuente de versión: el nombre de la caché y las URLs con ?v= salían de
// literales distintos y se desincronizaron (v22 vs v20), así que el ?v= no invalidaba
// nada. index.html debe usar este mismo valor; scripts/check-versions.mjs lo verifica.
const ASSET_VERSION = "20260803-v26";
const CACHE_VERSION = `mm-${ASSET_VERSION}`;

// Sin estos recursos la app no arranca: si alguno falla, la instalación falla y el
// service worker anterior sigue sirviendo una copia completa.
const CORE_SHELL = [
  "./",
  "./index.html",
  `./app.js?v=${ASSET_VERSION}`,
  `./styles.css?v=${ASSET_VERSION}`,
  "./site.webmanifest"
];

// Accesorios: que falte un icono no debe impedir la instalación.
const OPTIONAL_SHELL = [
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
      // El núcleo con addAll (todo o nada): antes un fallo aquí se toleraba y se
      // activaba una caché sin app.js, dejando la app en blanco al abrirla sin red.
      cache.addAll(CORE_SHELL)
        .then(() => Promise.allSettled(OPTIONAL_SHELL.map(url => cache.add(url))))
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
        .catch(() => caches.match("./index.html")
          .then(cached => cached || caches.match("./"))
          .then(cached => cached || offlineResponse()))
    );
    return;
  }

  // Librerías de CDN (Chart.js, Lucide): versionadas e inmutables → cache-first.
  if (!sameOrigin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        cachePut(request, response.clone());
        return response;
      }).catch(() => offlineResponse()))
    );
    return;
  }

  // Estáticos propios (app.js, styles.css, imágenes): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        cachePut(request, response.clone());
        return response;
      }).catch(() => cached || offlineResponse());
      return cached || network;
    })
  );
});

// respondWith(undefined) provoca un TypeError y el navegador reporta un error de
// red opaco. Sin conexión y sin copia en caché, mejor una respuesta 503 explícita.
function offlineResponse() {
  return new Response("Sin conexión", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

function cachePut(request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  caches.open(CACHE_VERSION).then(cache => cache.put(request, response)).catch(() => {});
}
