// ESLint (config plana) acotado a los archivos nuevos (tests y service worker).
// app.js es un monolito heredado de ~6k líneas; su linting completo es un paso
// posterior con reglas a medida, así que de momento se cubre con `node --check`.
import js from "@eslint/js";

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
  globalThis: "readonly"
};

export default [
  js.configs.recommended,
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: serviceWorkerGlobals }
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...nodeGlobals, Intl: "readonly", Date: "readonly", Math: "readonly", JSON: "readonly" } }
  },
  {
    ignores: ["app.js", "apps-script.gs"]
  }
];
