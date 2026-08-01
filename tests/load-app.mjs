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

  // Los temporizadores se disparan de verdad, pero sin esperar: así `sleep` (y con él los
  // reintentos de descarga) avanza en los tests en vez de quedarse colgado para siempre.
  const immediateTimeout = fn => globalThis.setTimeout(fn, 0);
  const cancelTimeout = id => globalThis.clearTimeout(id);

  const context = {
    console,
    Intl,
    Date,
    Math,
    JSON,
    localStorage,
    navigator: { onLine: true },
    setTimeout: immediateTimeout,
    clearTimeout: cancelTimeout,
    setInterval: () => 0,
    clearInterval: noop
  };
  context.window = {
    addEventListener: noop,
    setTimeout: immediateTimeout,
    clearTimeout: cancelTimeout,
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
  // Las declaraciones `const`/`let` de nivel superior son léxicas: al contrario que las
  // funciones, no quedan como propiedades del contexto. Se exponen a mano las que los
  // tests necesitan poder leer o ajustar.
  vm.runInContext("globalThis.state = state;", context, { filename: "app.js:expose" });
  return context;
}
