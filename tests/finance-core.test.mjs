import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const app = loadApp();

test("parseNumber entiende formatos ES e internacionales", () => {
  assert.equal(app.parseNumber(1234.56), 1234.56);
  assert.equal(app.parseNumber("10,50"), 10.5);
  assert.equal(app.parseNumber("1.000,00"), 1000);
  assert.equal(app.parseNumber("1,000.00"), 1000);
  assert.equal(app.parseNumber("1.234,56"), 1234.56);
  assert.equal(app.parseNumber("-42,5"), -42.5);
  assert.ok(Number.isNaN(app.parseNumber("")));
  assert.ok(Number.isNaN(app.parseNumber("---")));
  assert.ok(Number.isNaN(app.parseNumber(null)));
});

test("roundMoney redondea a 2 decimales y nunca devuelve NaN", () => {
  assert.equal(app.roundMoney(10.555), 10.56);
  assert.equal(app.roundMoney("10,555"), 10.56);
  assert.equal(app.roundMoney(0.1 + 0.2), 0.3);
  assert.equal(app.roundMoney("no-numero"), 0);
});

test("round2 y safeNumber", () => {
  assert.equal(app.round2(2.005), 2);
  assert.equal(app.round2(2.006), 2.01);
  assert.equal(app.safeNumber(NaN), 0);
  assert.equal(app.safeNumber(Infinity), 0);
  assert.equal(app.safeNumber(7), 7);
});

test("normalizeType y prettyType", () => {
  assert.equal(app.normalizeType("  Inversión "), "inversion");
  assert.equal(app.normalizeType("GASTO"), "gasto");
  assert.equal(app.prettyType("inversion"), "Inversión");
  assert.equal(app.prettyType("transferencia"), "Transferencia");
  assert.equal(app.prettyType("Gasto"), "Gasto");
});

test("clasificadores de movimiento", () => {
  assert.equal(app.isIncome({ tipo: "Ingreso" }), true);
  assert.equal(app.isIncome({ tipo: "Gasto" }), false);
  assert.equal(app.isInvestment({ tipo: "Inversión" }), true);
  assert.equal(app.isTransfer({ tipo: "Transferencia" }), true);
  assert.equal(app.isMonthlyExpense({ tipo: "Gasto" }), true);
  assert.equal(app.isMonthlyExpense({ tipo: "Ingreso" }), false);
});

test("sum y unique", () => {
  assert.equal(app.sum([1, 2, "3", null, undefined]), 6);
  assert.deepEqual(Array.from(app.unique(["a", "a", "", null, "b"])), ["a", "b"]);
});

test("monthKey y formatDate", () => {
  const d = new Date(2026, 6, 12); // julio
  assert.equal(app.monthKey(d), "2026-07");
  assert.equal(app.formatDate(d), "2026-07-12");
  assert.equal(app.monthKey(null), "");
});

test("parseDate ida y vuelta", () => {
  const d = app.parseDate("2026-07-12");
  assert.equal(app.formatDate(d), "2026-07-12");
  assert.equal(app.parseDate("12/07/2026") instanceof Date, true);
  assert.equal(app.parseDate(""), null);
});

test("escapeHtml y escapeAttr evitan inyección", () => {
  assert.equal(app.escapeHtml("<b>&\"'"), "&lt;b&gt;&amp;&quot;&#039;");
  assert.equal(app.escapeAttr("a`b"), "a&#096;b");
  assert.equal(app.escapeHtml(null), "");
});

test("plural", () => {
  assert.equal(app.plural(1, "uno", "varios"), "uno");
  assert.equal(app.plural(2, "uno", "varios"), "varios");
  assert.equal(app.plural(0, "uno", "varios"), "varios");
});

test("opLabel usa el mapa único y cae a la propia acción", () => {
  assert.equal(app.opLabel("addMovement"), "Movimiento");
  assert.equal(app.opLabel("transferBank"), "Transferencia");
  assert.equal(app.opLabel("accionDesconocida"), "accionDesconocida");
});

test("buildUndo genera la inversa de un alta de movimiento", () => {
  const undo = app.buildUndo({
    action: "addMovement",
    account: "Banco",
    sheetName: "Control Finanzas",
    movement: { sid: "mov_1", fecha: "2026-07-12", tipo: "Gasto", concepto: "Comida", descripcion: "x", importe: -10 }
  });
  assert.ok(undo);
  assert.equal(undo.inverse.action, "deleteMovement");
  assert.equal(undo.inverse.sheetName, "Control Finanzas");
});

test("buildUndo invierte una transferencia y descarta lo no reversible", () => {
  const undo = app.buildUndo({ action: "transferBank", from: "A", to: "B", amount: 50 });
  assert.equal(undo.inverse.from, "B");
  assert.equal(undo.inverse.to, "A");
  assert.equal(undo.inverse.amount, 50);
  assert.equal(app.buildUndo({ action: "saveBanks" }), null);
  assert.equal(app.buildUndo({ action: "renameAccount" }), null);
});

test("opBackoffMs crece exponencialmente y se topa en 60 s", () => {
  assert.equal(app.opBackoffMs(1), 5000);
  assert.equal(app.opBackoffMs(2), 10000);
  assert.equal(app.opBackoffMs(3), 20000);
  assert.equal(app.opBackoffMs(4), 40000);
  assert.equal(app.opBackoffMs(5), 60000);
  assert.equal(app.opBackoffMs(20), 60000);
});

test("isOpActionable respeta el backoff y descarta las operaciones detenidas", () => {
  const now = 1_000_000;
  assert.equal(app.isOpActionable({ status: "queued" }, now), true);
  assert.equal(app.isOpActionable({ status: "retry", nextAttemptAt: now + 5000 }, now), false);
  assert.equal(app.isOpActionable({ status: "retry", nextAttemptAt: now - 1 }, now), true);
  assert.equal(app.isOpActionable({ status: "error" }, now), false);
  assert.equal(app.isOpActionable({ status: "done" }, now), false);
  assert.equal(app.isOpActionable(null, now), false);
});

test("failQueuedOp aplica backoff y detiene la operación al agotar los intentos", () => {
  app.writeOpQueue([{ id: "op-1", status: "sending", payload: { action: "addTransfersBatch" } }]);

  app.failQueuedOp("op-1", "El envío tardó demasiado");
  let op = app.readOpQueue()[0];
  assert.equal(op.status, "retry");
  assert.equal(op.attempts, 1);
  assert.equal(op.error, "El envío tardó demasiado");
  assert.ok(op.nextAttemptAt > Date.now());

  for (let i = 0; i < 6; i++) app.failQueuedOp("op-1", "sigue fallando");
  op = app.readOpQueue()[0];
  assert.equal(op.attempts, 7);
  assert.equal(op.status, "retry");

  app.failQueuedOp("op-1", "sigue fallando");
  op = app.readOpQueue()[0];
  assert.equal(op.attempts, 8);
  assert.equal(op.status, "error", "tras 8 intentos deja de reintentarse sola");
  assert.equal(op.nextAttemptAt, 0);
  assert.equal(app.isOpActionable(op), false);

  app.writeOpQueue([]);
});
