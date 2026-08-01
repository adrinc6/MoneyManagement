// ESLint (config plana). app.js se lintea con reglas a medida: lo que importa ahí
// es no-undef (un global mal escrito era un fallo real en producción, invisible para
// `node --check`); el ruido puramente estilístico queda como aviso o desactivado.
import js from "@eslint/js";

// app.js corre en el navegador y usa dos librerías de CDN.
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  location: "readonly",
  fetch: "readonly",
  Response: "readonly",
  Request: "readonly",
  AbortController: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Blob: "readonly",
  FormData: "readonly",
  Image: "readonly",
  console: "readonly",
  crypto: "readonly",
  atob: "readonly",
  btoa: "readonly",
  alert: "readonly",
  confirm: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  queueMicrotask: "readonly",
  CustomEvent: "readonly",
  Event: "readonly",
  MutationObserver: "readonly",
  ResizeObserver: "readonly",
  getComputedStyle: "readonly",
  Intl: "readonly",
  Chart: "readonly",
  lucide: "readonly"
};

const serviceWorkerGlobals = {
  self: "readonly",
  caches: "readonly",
  fetch: "readonly",
  Response: "readonly",
  Request: "readonly",
  URL: "readonly",
  clients: "readonly",
  console: "readonly",
  Promise: "readonly"
};

const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  globalThis: "readonly",
  URL: "readonly"
};

export default [
  js.configs.recommended,
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: serviceWorkerGlobals }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: nodeGlobals }
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...nodeGlobals, Intl: "readonly", Date: "readonly", Math: "readonly", JSON: "readonly" } }
  },
  {
    files: ["app.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: browserGlobals },
    rules: {
      // Avisos: señalan limpieza pendiente sin bloquear la CI.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": "off"
    }
  },
  {
    // El backend de Apps Script se comprueba con scripts/check-gs.mjs: sus globals
    // (SpreadsheetApp, UrlFetchApp, ...) no existen fuera del entorno de Google.
    ignores: ["apps-script.gs"]
  }
];
