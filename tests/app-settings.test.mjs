// Los ajustes de la app (presupuesto por categoría, composición objetivo y qué inversiones
// cuentan para el fondo de emergencia) se guardan en la hoja "Objetivos", junto a los
// objetivos de inversión de toda la vida. Conviven dos lecturas sobre la misma hoja: los
// objetivos son números y los ajustes van como JSON. Estas pruebas fijan que ninguna de
// las dos pisa a la otra, que era justo lo que hacía la escritura anterior.
import test from "node:test";
import assert from "node:assert/strict";
import { loadAppsScript } from "./load-apps-script.mjs";

// Los objetos nacen dentro del sandbox vm, con otro Object.prototype: deepEqual los da
// por distintos aunque el contenido sea idéntico. Se comparan serializados.
const plano = value => JSON.parse(JSON.stringify(value ?? null));

const OBJECTIVE_SHEET = "Objetivos";

function setup() {
  const gs = loadAppsScript();
  gs.__spreadsheet.addSheet(OBJECTIVE_SHEET, [["Tiempo", "Valor"]]);
  return gs;
}

const GOALS = { expenseMonthly: 1250, investmentMonthly: 800, yearly: 8000, total: 15000 };
const SETTINGS = {
  budgets: { "Vivienda": 550, "Alimentación": 330 },
  emergencyFund: { types: ["Bolsa"] }
};

test("los ajustes van y vuelven de la hoja", () => {
  const gs = setup();
  gs.saveAppSettings_(SETTINGS, OBJECTIVE_SHEET);
  assert.deepEqual(plano(gs.readAppSettings_(OBJECTIVE_SHEET)), SETTINGS);
});

// La regresión que motivó el cambio: saveInvestmentGoals_ hacía clearContent de toda la
// hoja y reescribía sus cuatro filas, así que guardar objetivos borraba el presupuesto.
test("guardar objetivos no borra los ajustes", () => {
  const gs = setup();
  gs.saveAppSettings_(SETTINGS, OBJECTIVE_SHEET);
  gs.saveInvestmentGoals_(GOALS, OBJECTIVE_SHEET);

  assert.deepEqual(plano(gs.readAppSettings_(OBJECTIVE_SHEET)), SETTINGS);
  assert.equal(gs.readInvestmentGoals_(OBJECTIVE_SHEET).expenseMonthly, 1250);
});

test("guardar ajustes no borra los objetivos", () => {
  const gs = setup();
  gs.saveInvestmentGoals_(GOALS, OBJECTIVE_SHEET);
  gs.saveAppSettings_(SETTINGS, OBJECTIVE_SHEET);

  const goals = gs.readInvestmentGoals_(OBJECTIVE_SHEET);
  assert.equal(goals.expenseMonthly, 1250);
  assert.equal(goals.total, 15000);
});

test("reguardar actualiza la fila en vez de duplicarla", () => {
  const gs = setup();
  gs.saveInvestmentGoals_(GOALS, OBJECTIVE_SHEET);
  gs.saveAppSettings_(SETTINGS, OBJECTIVE_SHEET);
  gs.saveInvestmentGoals_({ ...GOALS, expenseMonthly: 1400 }, OBJECTIVE_SHEET);
  gs.saveAppSettings_({ ...SETTINGS, budgets: { "Vivienda": 600 } }, OBJECTIVE_SHEET);

  const rows = gs.readObjectiveRows_(OBJECTIVE_SHEET);
  assert.equal(rows.filter(row => row[0] === "Gasto mensual").length, 1);
  assert.equal(rows.filter(row => row[0] === "budgets").length, 1);
  assert.equal(gs.readInvestmentGoals_(OBJECTIVE_SHEET).expenseMonthly, 1400);
  assert.deepEqual(plano(gs.readAppSettings_(OBJECTIVE_SHEET).budgets), { "Vivienda": 600 });
});

// Un JSON a medio escribir no puede dejar sin descarga al resto de la app.
test("una fila de ajustes ilegible se ignora sin romper la lectura", () => {
  const gs = setup();
  gs.saveInvestmentGoals_(GOALS, OBJECTIVE_SHEET);
  gs.saveAppSettings_(SETTINGS, OBJECTIVE_SHEET);
  const sheet = gs.__spreadsheet.getSheetByName(OBJECTIVE_SHEET);
  const rows = gs.readObjectiveRows_(OBJECTIVE_SHEET);
  const idx = rows.findIndex(row => row[0] === "budgets");
  sheet.getRange(idx + 2, 2).setValue("{roto");

  const settings = gs.readAppSettings_(OBJECTIVE_SHEET);
  assert.equal(settings.budgets, undefined);
  assert.deepEqual(plano(settings.emergencyFund), { types: ["Bolsa"] });
  assert.equal(gs.readInvestmentGoals_(OBJECTIVE_SHEET).expenseMonthly, 1250);
});

test("los ajustes viajan en la descarga base", () => {
  const gs = setup();
  gs.saveAppSettings_(SETTINGS, OBJECTIVE_SHEET);
  const payload = gs.applyPostAction_({
    action: "saveAppSettings",
    sheetName: OBJECTIVE_SHEET,
    settings: { ...SETTINGS, budgets: { "Ocio y social": 220 } }
  });
  assert.equal(payload.appSettingsSaved, true);
  assert.deepEqual(plano(payload.appSettings.budgets), { "Ocio y social": 220 });
});
