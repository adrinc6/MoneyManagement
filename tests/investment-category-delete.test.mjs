// Eliminar o traspasar una cartera de inversión, y el signo del importe.
//
// Una cartera no es solo una etiqueta: cuelgan de ella posiciones, coste, movimientos ya
// realizados (que movieron saldo en Bancos), movimientos futuros, pesos de composición,
// reglas de estimación y el fondo de emergencia. Antes no se podía borrar una cartera con
// datos; ahora el usuario elige entre llevárselo todo por delante o traspasarlo a otra, y
// lo que se fija aquí es que ninguna de las dos rutas deje datos huérfanos ni el saldo de
// una cuenta descuadrado.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const plain = value => JSON.parse(JSON.stringify(value));

function seed(app) {
  app.state.config = { ...app.state.config, movementSheet: "Control Finanzas", investmentSheet: "Inversiones" };
  app.state.banks = [{ cuenta: "Santander", dinero: 1000 }, { cuenta: "BBVA", dinero: 500 }];
  app.state.categories = app.normalizeCategories({ investmentTypes: ["Cartera Pop", "Fondos"] });
  app.state.investments = [
    { rowNumber: 2, data: "POP", nombre: "Pop ETF", tipo: "Cartera Pop", cantidad: 1, valor: 200, total: 200 },
    { rowNumber: 3, data: "IWDA", nombre: "World", tipo: "Fondos", cantidad: 1, valor: 100, total: 100 }
  ];
  app.state.investmentTotals = [
    { tipo: "Cartera Pop", cost: 300, value: 200, lastValue: 190, daily: 10, dailyPct: 0, gain: -100, gainPct: 0, order: 1 },
    { tipo: "Fondos", cost: 100, value: 100, lastValue: 100, daily: 0, dailyPct: 0, gain: 0, gainPct: 0, order: 2 }
  ];
  app.state.transactions = [
    app.normalizeTransaction({ sid: "m1", rowNumber: 5, fecha: "2026-01-10", tipo: "Inversión", concepto: "", descripcion: "Cartera Pop", importe: -300, cuenta: "Santander" }),
    app.normalizeTransaction({ sid: "m2", rowNumber: 6, fecha: "2026-02-10", tipo: "Inversión", concepto: "", descripcion: "Fondos", importe: -100, cuenta: "BBVA" })
  ];
  app.state.futureTransactions = [
    app.normalizeTransaction({ sid: "f1", rowNumber: 2, fecha: "2030-01-10", tipo: "Inversión", concepto: "", descripcion: "Cartera Pop", importe: -50, cuenta: "Santander" })
  ];
  app.state.investmentEstimateRules = [{ id: "r1", tipo: "Cartera Pop", movementDescription: "Cartera Pop" }];
  app.state.investmentEstimateLedger = [{ id: "l1", tipo: "Cartera Pop", importe: -10 }];
  app.state.investmentComposition = app.normalizeInvestmentComposition({
    total: "100",
    groups: { "Cartera Pop": "60", Fondos: "40" },
    positions: { "Cartera Pop": { POP: "100" } }
  });
  app.state.emergencyFund = { types: ["Cartera Pop", "Fondos"] };
}

test("las dependencias de una cartera cuentan todo lo que cuelga de ella", () => {
  const app = loadApp();
  seed(app);

  const dependencias = app.investmentCategoryDependencies("Cartera Pop");

  assert.equal(dependencias.positions.length, 1);
  assert.equal(dependencias.transactions.length, 1);
  assert.equal(dependencias.futureTransactions.length, 1);
  assert.equal(dependencias.rules, 1);
  assert.equal(dependencias.ledger, 1);
  assert.equal(dependencias.hasTotals, true);
  assert.ok(dependencias.total > 0, "con dependencias hay que preguntar antes de borrar");

  assert.equal(app.investmentCategoryDependencies("Inexistente").total, 0, "sin dependencias se borra sin preguntar");
});

test("borrar una cartera se lleva sus datos y devuelve el dinero a su cuenta", () => {
  const app = loadApp();
  seed(app);

  const ops = app.purgeInvestmentCategoryLocally("Cartera Pop");

  assert.deepEqual(app.state.investments.map(i => i.tipo), ["Fondos"]);
  assert.deepEqual(app.state.investmentTotals.map(i => i.tipo), ["Fondos"]);
  assert.deepEqual(app.state.transactions.map(t => t.sid), ["m2"]);
  assert.deepEqual(app.state.futureTransactions.map(t => t.sid), []);
  assert.deepEqual(app.state.investmentEstimateRules, []);
  assert.deepEqual(app.state.investmentEstimateLedger, []);
  assert.deepEqual(Object.keys(plain(app.state.investmentComposition.groups)), ["Fondos"]);
  assert.deepEqual(Object.keys(plain(app.state.investmentComposition.positions)), []);
  assert.deepEqual(plain(app.state.emergencyFund.types), ["Fondos"]);

  // El movimiento sacó 300 EUR de Santander: al borrarlo tienen que volver.
  assert.equal(app.state.banks.find(b => b.cuenta === "Santander").dinero, 1300);
  assert.equal(app.state.banks.find(b => b.cuenta === "BBVA").dinero, 500, "las demás cuentas no se tocan");

  const acciones = plain(ops).map(op => op.action);
  assert.deepEqual(acciones, ["deleteMovementsBatch", "deleteMovementsBatch", "saveBanks", "deleteInvestment"]);
  assert.equal(ops[0].sheetName, "Control Finanzas");
  assert.equal(ops[3].rowNumber, 2, "se borra la fila real de la posición de esa cartera");
});

test("un traspaso funde las dos filas de totales en una sola", () => {
  const app = loadApp();
  seed(app);
  // Lo que deja el renombrado "Cartera Pop" -> "Fondos" antes de fundir.
  app.state.investmentTotals = app.state.investmentTotals.map(item => ({ ...item, tipo: "Fondos" }));

  app.mergeInvestmentTotalsByType();

  assert.equal(app.state.investmentTotals.length, 1);
  const total = app.state.investmentTotals[0];
  assert.equal(total.cost, 400, "300 + 100");
  assert.equal(total.value, 300, "200 + 100");
  assert.equal(total.lastValue, 290);
  assert.equal(total.gain, -100, "valor menos coste");
});

test("netInvested usa el signo: lo desinvertido resta de lo invertido", () => {
  const app = loadApp();
  const movimientos = [{ amount: -500 }, { amount: -100 }, { amount: 200 }];

  assert.equal(app.netInvested(movimientos), 400);
  assert.equal(app.netInvested([{ amount: 300 }]), -300, "un mes en el que solo se desinvierte queda en negativo");
  assert.equal(app.netInvested([]), 0);
});

test("applyInvestmentCostDeltaLocal sube el coste al invertir y lo baja al desinvertir", () => {
  const app = loadApp();
  seed(app);
  const coste = () => app.state.investmentTotals.find(i => i.tipo === "Cartera Pop").cost;

  app.applyInvestmentCostDeltaLocal({ tipo: "Inversión", descripcion: "Cartera Pop", amount: -100 }, 1);
  assert.equal(coste(), 400);

  app.applyInvestmentCostDeltaLocal({ tipo: "Inversión", descripcion: "Cartera Pop", amount: 150 }, 1);
  assert.equal(coste(), 250);

  app.applyInvestmentCostDeltaLocal({ tipo: "Inversión", descripcion: "Cartera Pop", amount: 9999 }, 1);
  assert.equal(coste(), 0, "el coste nunca queda negativo");
});

test("una desinversión de una cartera desconocida no crea una fila de totales negativa", () => {
  const app = loadApp();
  seed(app);

  app.applyInvestmentCostDeltaLocal({ tipo: "Inversión", descripcion: "Cripto", amount: 500 }, 1);

  assert.deepEqual(app.state.investmentTotals.map(i => i.tipo), ["Cartera Pop", "Fondos"]);
});

// Y lo mismo en el backend: borrar una cartera tiene que limpiar la hoja de inversiones,
// las reglas y el ledger de estimación, y NO fallar por el guarda que impide quitar una
// categoría con datos: el usuario ya ha confirmado que se la lleva por delante.
const RULES_SHEET = "Inversiones Estimación Reglas";
const LEDGER_SHEET = "Inversiones Estimación Movimientos";

function setupBackend(gs) {
  gs.__spreadsheet.addSheet("Control Finanzas", [["FECHA", "AÑO", "MES", "DIA", "TIPO", "CONCEPTO", "DESCRIPCION", "IMPORTE", "Cuenta", "SID"]]);
  gs.__spreadsheet.addSheet("Movimientos futuros", [["FECHA", "AÑO", "MES", "DIA", "TIPO", "CONCEPTO", "DESCRIPCION", "IMPORTE", "Cuenta", "SID"]]);
  gs.__spreadsheet.addSheet("Inversiones", [
    ["DATA", "NOMBRE", "SHORT NAME", "TIPO", "CANTIDAD", "VALOR", "VALOR TOTAL", "VALOR ANTERIOR", "DIVISA"],
    ["POP", "Pop ETF", "POP", "Cartera Pop", 1, 200, 200, 190, "EUR"],
    ["IWDA", "World", "IWDA", "Fondos", 1, 100, 100, 100, "EUR"]
  ]);
  gs.__spreadsheet.addSheet("Inversión Totales", [
    gs.investmentTotalsHeaders_(),
    ["Cartera Pop", 300, 200, 190, 10, 0, -100, 0, 1],
    ["Fondos", 100, 100, 100, 0, 0, 0, 0, 2]
  ]);
  gs.__spreadsheet.addSheet(RULES_SHEET, [
    gs.investmentEstimateRuleHeaders_(),
    ["r1", true, 1, "Cartera Pop", "POP", "Pop ETF", "POP", 100, 0],
    ["r2", true, 1, "Fondos", "IWDA", "World", "IWDA", 100, 0]
  ]);
  gs.__spreadsheet.addSheet(LEDGER_SHEET, [
    gs.investmentEstimateLedgerHeaders_(),
    ["l1", true, "2026-01-10", "m1", "Cartera Pop", "POP", "Pop ETF", "POP", -10, 200, 0.05, "regla"],
    ["l2", true, "2026-01-10", "m2", "Fondos", "IWDA", "World", "IWDA", -10, 100, 0.1, "regla"]
  ]);
}

test("saveInvestmentCategories_ con deletions purga la cartera en todas las hojas", async () => {
  const { loadAppsScript } = await import("./load-apps-script.mjs");
  const gs = loadAppsScript();
  setupBackend(gs);

  gs.saveInvestmentCategories_("Inversiones", ["Fondos"], {}, "Control Finanzas", "Movimientos futuros",
    "Inversión Totales", RULES_SHEET, LEDGER_SHEET, ["Cartera Pop"]);

  assert.deepEqual(gs.readInvestments_("Inversiones").map(i => i.tipo), ["Fondos"]);
  assert.deepEqual(gs.readInvestmentTotals_("Inversión Totales").map(i => i.tipo), ["Fondos"]);
  assert.deepEqual(gs.readInvestmentEstimateRules_(RULES_SHEET).map(r => r.id), ["r2"]);
  assert.deepEqual(gs.readInvestmentEstimateLedger_(LEDGER_SHEET).map(l => l.id), ["l2"]);
});

test("sin deletions sigue sin poder quitarse una categoría con datos", async () => {
  const { loadAppsScript } = await import("./load-apps-script.mjs");
  const gs = loadAppsScript();
  setupBackend(gs);

  assert.throws(() => gs.saveInvestmentCategories_("Inversiones", ["Fondos"], {}, "Control Finanzas",
    "Movimientos futuros", "Inversión Totales", RULES_SHEET, LEDGER_SHEET, []), /Cartera Pop/);
});
