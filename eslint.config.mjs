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
  fetch: "readonly",
  AbortController: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Blob: "readonly",
  console: "readonly",
  crypto: "readonly",
  alert: "readonly",
  requestAnimationFrame: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
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
  URL: "readonly",
  clients: "readonly",
  console: "readonly",
  Promise: "readonly"
};

const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  globalThis: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly"
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
    // El backend de Apps Script también se lintea: `node --check` (y vm.Script en
    // scripts/check-gs.mjs) solo ven errores de sintaxis, así que una referencia a
    // una variable inexistente —por ejemplo tras quitar un parámetro sin limpiar su
    // uso— compilaba igual y reventaba en producción. no-undef sí lo caza; para eso
    // hay que declarar los globals del entorno de Google.
    files: ["apps-script.gs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        SpreadsheetApp: "readonly",
        PropertiesService: "readonly",
        LockService: "readonly",
        Utilities: "readonly",
        ContentService: "readonly",
        UrlFetchApp: "readonly",
        ScriptApp: "readonly",
        Session: "readonly",
        Logger: "readonly",
        console: "readonly"
      }
    },
    rules: {
      // Aviso, no error: las funciones sin llamante interno son justo los entry points
      // de Apps Script (doGet, doPost, el handler del disparador diario y los dos
      // utilidades que se ejecutan a mano desde el editor). Si aparece una sexta,
      // es código muerto.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": "off"
    }
  }
];
