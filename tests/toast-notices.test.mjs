// Los avisos flotantes duraban milisegundos: el listener global de clic los borraba a
// todos con un setTimeout(0), incluido el que acababa de abrir ese mismo clic.
import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as esperar } from "node:timers/promises";
import { loadApp } from "./load-app.mjs";

function toastFalso(app, marca) {
  return { marca, quitado: false, remove() { this.quitado = true; }, closest: () => null };
}

test("un clic solo cierra los avisos que ya estaban en pantalla", async () => {
  const app = loadApp();
  const viejo = toastFalso(app, "viejo");
  let toasts = [viejo];
  app.document.querySelectorAll = selector => (selector === ".toast" ? [...toasts] : []);

  // El clic entra en fase de captura, antes de que el manejador del botón cree su aviso.
  app.dismissExistingToasts({ target: { closest: () => null } });
  const nuevo = toastFalso(app, "nuevo");
  toasts = [viejo, nuevo];
  await esperar(0);

  assert.equal(viejo.quitado, true);
  assert.equal(nuevo.quitado, false, "el aviso lanzado por ese clic debe seguir visible");
});

test("un clic sobre el propio aviso no lo cierra por detrás", async () => {
  const app = loadApp();
  const toast = toastFalso(app, "propio");
  app.document.querySelectorAll = () => [toast];

  app.dismissExistingToasts({ target: { closest: () => toast } });
  await esperar(0);

  assert.equal(toast.quitado, false);
});

// "Actualizar precios" ya se narra en la cabecera (estado bajo el nombre de la app),
// así que el popup sobraba; los errores sí deben seguir avisando.
test("actualizar precios no lanza avisos flotantes de éxito", async () => {
  const app = loadApp();
  const boton = { disabled: false, classList: { add() {}, remove() {}, toggle() {} } };
  app.document.getElementById = id => (id === "investmentUpdatePricesBtn" ? boton : null);
  const avisos = [];
  app.setNotice = (mensaje, tono) => avisos.push([mensaje, tono]);
  let opciones = null;
  app.refreshData = async options => { opciones = options; return true; };

  await app.updateInvestmentPricesFromHeader();

  assert.equal(opciones.quietSuccess, true);
  assert.equal(opciones.updateInvestments, true);
  assert.deepEqual(avisos, []);
});
