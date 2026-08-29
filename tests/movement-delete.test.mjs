import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

// Un movimiento futuro no ha movido dinero todavía: al borrarlo no hay nada que devolver a
// ninguna cuenta, así que no debe abrirse la ventana de "Aplicar a cuenta" (que además
// aplicaba un delta al banco y descuadraba el saldo real).
test("en futuros el borrado no toca los bancos aunque haya cuentas", () => {
  const app = loadApp();
  app.state.banks = [{ cuenta: "Principal", dinero: 1000 }];
  app.state.movementMode = "future";

  assert.equal(app.movementDeleteTouchesBanks(), false);
});

test("en realizados el borrado sí pregunta por cuenta cuando hay bancos", () => {
  const app = loadApp();
  app.state.banks = [{ cuenta: "Principal", dinero: 1000 }];
  app.state.movementMode = "realized";

  assert.equal(app.movementDeleteTouchesBanks(), true);
});

test("sin bancos no hay nada que preguntar en ningún modo", () => {
  const app = loadApp();
  app.state.banks = [];

  app.state.movementMode = "realized";
  assert.equal(app.movementDeleteTouchesBanks(), false);

  app.state.movementMode = "future";
  assert.equal(app.movementDeleteTouchesBanks(), false);
});
