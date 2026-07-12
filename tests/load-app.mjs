// Carga app.js REAL dentro de un contexto vm con el entorno de navegador stubeado,
// para poder testear sus funciones puras sin modificar el código de producción ni
// depender de un navegador. Las funciones declaradas a nivel de módulo quedan como
// propiedades del contexto y se devuelven para las pruebas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const appPath = join(here, "..", "app.js");

export function loadApp() {
  const source = readFileSync(appPath, "utf8");

  const noop = () => {};
  const store = new Map();
  const localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  const elementStub = {
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    addEventListener: noop,
    appendChild: noop,
    remove: noop,
    querySelectorAll: () => [],
    setAttribute: noop,
    style: {},
    innerHTML: "",
    textContent: ""
  };
  const documentStub = {
    addEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ ...elementStub }),
    body: { appendChild: noop }
  };

  const context = {
    console,
    Intl,
    Date,
    Math,
    JSON,
    localStorage,
    navigator: { onLine: true },
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop
  };
  context.window = {
    addEventListener: noop,
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    crypto: globalThis.crypto,
    MONEY_DEBUG: false,
    localStorage
  };
  context.document = documentStub;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app.js" });
  return context;
}
