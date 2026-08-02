// Columna COST de la hoja de totales de inversión.
//
// Es el coste acumulado por categoría y lo mueve adjustInvestmentCostFromMovement_ en
// cada alta, edición o borrado de un movimiento de inversión, y en cada vencimiento de
// un futuro. Estos tests fijan el valor resultante ANTES de tocar esa ruta, que hacía
// una reescritura completa de la hoja de totales por cada movimiento.
import test from "node:test";
import assert from "node:assert/strict";
import { loadAppsScript } from "./load-apps-script.mjs";

const MOVEMENT_SHEET = "Control Finanzas";
const FUTURE_SHEET = "Movimientos futuros";
const INVESTMENT_SHEET = "Inversiones";
const BANK_SHEET = "Bancos";
const TOTALS_SHEET = "Inversión Totales";

const MOVEMENT_HEADERS = ["FECHA", "AÑO", "MES", "DIA", "TIPO", "CONCEPTO", "DESCRIPCION", "IMPORTE", "Cuenta", "SID"];

function setup(gs, { totals = [["Bolsa", 100], ["Fondos", 50]], movementRows = [], futureRows = [] } = {}) {
  gs.__spreadsheet.addSheet(MOVEMENT_SHEET, [MOVEMENT_HEADERS, ...movementRows]);
  gs.__spreadsheet.addSheet(FUTURE_SHEET, [MOVEMENT_HEADERS, ...futureRows]);
  gs.__spreadsheet.addSheet(INVESTMENT_SHEET, [
    ["DATA", "NOMBRE", "SHORT NAME", "TIPO", "CANTIDAD", "VALOR", "VALOR TOTAL", "VALOR ANTERIOR", "DIVISA"],
    ["IWDA", "ETF World", "IWDA", "Bolsa", 10, 100, 1000, 1000, "EUR"]
  ]);
  gs.__spreadsheet.addSheet(BANK_SHEET, [["CUENTA", "DINERO"], ["Santander", 5000]]);
  return gs.__spreadsheet.addSheet(TOTALS_SHEET, [
    gs.investmentTotalsHeaders_(),
    ...totals.map(([tipo, cost], idx) => [tipo, cost, 0, 0, 0, 0, 0, 0, idx + 1])
  ]);
}

const costeDe = (gs, tipo) => {
  const fila = gs.readInvestmentTotals_(TOTALS_SHEET).find(r => r.tipo === tipo);
  return fila ? fila.cost : null;
};

const movimiento = (concepto, importe, sid = "mov_1") => ({
  sid, fecha: "2026-05-10", tipo: "Inversión", concepto, descripcion: concepto, importe
});

test("un alta de inversión suma su importe al coste de su categoría", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -400), 1);

  assert.equal(costeDe(gs, "Bolsa"), 500, "100 + 400");
  assert.equal(costeDe(gs, "Fondos"), 50, "las demás categorías no se tocan");
});

test("un borrado resta, y el coste nunca baja de cero", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -30), -1);
  assert.equal(costeDe(gs, "Bolsa"), 70);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -999), -1);
  assert.equal(costeDe(gs, "Bolsa"), 0, "se corta en 0, no queda negativo");
});

test("varios movimientos seguidos acumulan como la suma de sus importes", () => {
  const gs = loadAppsScript();
  setup(gs);

  [200, 300, 45.5].forEach((importe, i) => {
    gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -importe, `mov_${i}`), 1);
  });

  assert.equal(costeDe(gs, "Bolsa"), 100 + 200 + 300 + 45.5);
});

test("un movimiento que no es de inversión no toca ninguna categoría", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET,
    { sid: "m", fecha: "2026-05-10", tipo: "Gasto", concepto: "Bolsa", descripcion: "Bolsa", importe: -400 }, 1);

  assert.equal(costeDe(gs, "Bolsa"), 100);
});

test("un movimiento de inversión sin categoría reconocida no toca nada", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Cripto", -400), 1);

  assert.equal(costeDe(gs, "Bolsa"), 100);
  assert.equal(costeDe(gs, "Fondos"), 50);
});

test("un importe ilegible o cero no mueve el coste", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", "no es un número"), 1);
  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", 0), 1);

  assert.equal(costeDe(gs, "Bolsa"), 100);
});

test("editar un movimiento (restar el anterior y sumar el nuevo) deja la diferencia", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -400), 1);
  // Igual que doPost en updateMovement: primero -1 el anterior, luego +1 el nuevo.
  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -400), -1);
  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -250), 1);

  assert.equal(costeDe(gs, "Bolsa"), 350, "100 + 250");
});

test("mover a otra categoría descuenta de la vieja y suma en la nueva", () => {
  const gs = loadAppsScript();
  setup(gs);

  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Bolsa", -40), -1);
  gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, movimiento("Fondos", -40), 1);

  assert.equal(costeDe(gs, "Bolsa"), 60);
  assert.equal(costeDe(gs, "Fondos"), 90);
});

test("varios futuros de inversión vencidos acumulan su coste al moverse", () => {
  const gs = loadAppsScript();
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const fila = (concepto, importe, sid) =>
    [ayer, ayer.getFullYear(), ayer.getMonth() + 1, ayer.getDate(), "Inversión", concepto, concepto, importe, "Santander", sid];
  setup(gs, { futureRows: [fila("Bolsa", -200, "f1"), fila("Fondos", -75, "f2")] });

  const movidos = gs.moveDueFutureMovementsLocked_(FUTURE_SHEET, MOVEMENT_SHEET, BANK_SHEET, []);
  // Igual que doGet en las acciones 'all' y 'moveDueFutureMovements'.
  movidos.forEach(m => gs.adjustInvestmentCostFromMovement_(TOTALS_SHEET, INVESTMENT_SHEET, MOVEMENT_SHEET, m, 1));

  assert.equal(movidos.length, 2);
  assert.equal(costeDe(gs, "Bolsa"), 300, "100 + 200");
  assert.equal(costeDe(gs, "Fondos"), 125, "50 + 75");
});

// writeColumnUpdates_ sustituye a dos setValue por fila en la actualización de
// cotizaciones. Lo importante es que una fila sin cotización nueva conserve su valor:
// escribir la columna entera de golpe la habría machacado con un hueco.
test("writeColumnUpdates_ actualiza solo las filas con dato nuevo y respeta el resto", () => {
  const gs = loadAppsScript();
  const hoja = gs.__spreadsheet.addSheet("Cotizaciones", [
    ["TICKER", "PRECIO"],
    ["IWDA", 100],
    ["EUNL", 200],
    ["VWCE", 300]
  ]);

  // Solo llegan precios para las filas 2 y 4.
  gs.writeColumnUpdates_(hoja, 2, 2, 3, { 2: 111, 4: 333 }, hoja.getRange(2, 1, 3, 2).getValues(), 2);

  assert.deepEqual(hoja.getRange(2, 2, 3, 1).getValues().map(r => r[0]), [111, 200, 333],
    "la fila sin cotización mantiene su precio anterior");
});

test("writeColumnUpdates_ no escribe nada si no hay ninguna actualización", () => {
  const gs = loadAppsScript();
  const hoja = gs.__spreadsheet.addSheet("Cotizaciones", [["TICKER", "PRECIO"], ["IWDA", 100]]);

  gs.writeColumnUpdates_(hoja, 2, 2, 1, {}, hoja.getRange(2, 1, 1, 2).getValues(), 2);

  assert.equal(hoja.getRange(2, 2).getValue(), 100);
});
