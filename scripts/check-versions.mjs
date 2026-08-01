// Comprueba que la versión de assets del service worker y las URLs de index.html
// coinciden. Se desincronizaron una vez (caché mm-...v22 contra app.js?v=...v20),
// dejando el ?v= sin efecto: cada despliegue servía el app.js anterior.
import { readFileSync } from "node:fs";

const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const match = sw.match(/ASSET_VERSION\s*=\s*"([^"]+)"/);
if (!match) {
  console.error("check-versions: no se encontró ASSET_VERSION en sw.js");
  process.exit(1);
}

const version = match[1];
const errors = [];
for (const asset of ["app.js", "styles.css"]) {
  if (!html.includes(`${asset}?v=${version}`)) {
    const found = html.match(new RegExp(`${asset.replace(".", "\\.")}\\?v=([^"']+)`));
    errors.push(`index.html usa ${asset}?v=${found ? found[1] : "(sin versión)"} pero sw.js declara ${version}`);
  }
}

if (errors.length) {
  console.error(`check-versions: versiones desalineadas\n  ${errors.join("\n  ")}`);
  process.exit(1);
}

console.log(`check-versions: sw.js e index.html alineados en ${version}`);
