// Comprobación de sintaxis de apps-script.gs. `node --check` no acepta la extensión
// .gs, así que se compila el fuente con vm.Script (sin ejecutarlo). Sin esto, la
// mitad del código con toda la lógica que mueve dinero no tenía verificación alguna.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const path = new URL("../apps-script.gs", import.meta.url);

try {
  new vm.Script(readFileSync(path, "utf8"), { filename: "apps-script.gs" });
  console.log("check-gs: apps-script.gs compila sin errores de sintaxis");
} catch (error) {
  console.error(`check-gs: error de sintaxis en apps-script.gs\n  ${error.message}`);
  process.exit(1);
}
