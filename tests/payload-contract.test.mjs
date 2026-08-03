// Contrato de los payloads de descarga.
//
// El cliente decide qué secciones da por sincronizadas mirando QUÉ CLAVES trae el
// payload (syncedSectionsFromData en app.js recorre CACHE_SECTION_KEYS con
// hasOwnProperty). Si un payload deja de traer una clave, esa sección se queda con
// datos viejos en la caché local sin que nada avise. Estos tests fijan el juego de
// claves de cada modo de descarga.
import test from "node:test";
import assert from "node:assert/strict";
import { loadAppsScript } from "./load-apps-script.mjs";

const MOVEMENT_SHEET = "Control Finanzas";
const FUTURE_SHEET = "Movimientos futuros";
const INVESTMENT_SHEET = "Inversiones";
const BANK_SHEET = "Bancos";
const TOTALS_SHEET = "Inversión Totales";
const OBJECTIVE_SHEET = "Objetivos";
const DATA_SHEET = "Datos";

const MOVEMENT_HEADERS = ["FECHA", "AÑO", "MES", "DIA", "TIPO", "CONCEPTO", "DESCRIPCION", "IMPORTE", "Cuenta", "SID"];

function setup() {
  const gs = loadAppsScript();
  gs.__spreadsheet.addSheet(MOVEMENT_SHEET, [MOVEMENT_HEADERS]);
  gs.__spreadsheet.addSheet(FUTURE_SHEET, [MOVEMENT_HEADERS]);
  gs.__spreadsheet.addSheet(INVESTMENT_SHEET, [["DATA", "NOMBRE", "SHORT NAME", "TIPO", "CANTIDAD", "VALOR", "VALOR TOTAL", "VALOR ANTERIOR", "DIVISA"]]);
  gs.__spreadsheet.addSheet(BANK_SHEET, [["CUENTA", "DINERO"], ["Santander", 1000]]);
  gs.__spreadsheet.addSheet(TOTALS_SHEET, [gs.investmentTotalsHeaders_(), ["Bolsa", 0, 0, 0, 0, 0, 0, 0, 1]]);
  gs.__spreadsheet.addSheet(OBJECTIVE_SHEET, [["OBJETIVO", "CANTIDAD"]]);
  gs.__spreadsheet.addSheet(DATA_SHEET, [["TIPO", "CONCEPTO"]]);
  return gs;
}

// Las secciones que app.js conoce (CACHE_SECTION_KEYS), en el mismo orden.
const SECCIONES = [
  "transactions", "futureTransactions", "investments", "investmentTotals",
  "investmentEstimateRules", "investmentEstimateLedger", "banks", "investmentGoals", "categories"
];

const seccionesDe = payload => SECCIONES.filter(k => Object.prototype.hasOwnProperty.call(payload, k));

test("la descarga completa deja las estimaciones para la petición separada", () => {
  const gs = setup();
  const payload = gs.buildDataPayload_(gs.resolveSheets_({}), { movements: true, banks: true, movedFutureMovements: [] });

  assert.equal(payload.ok, true);
  assert.deepEqual(seccionesDe(payload), SECCIONES.filter(s => !["investmentEstimateRules", "investmentEstimateLedger"].includes(s)));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, "movedFutureMovements"));
});

test("la descarga base trae lo necesario sin movimientos ni estimaciones", () => {
  const gs = setup();
  const payload = gs.buildDataPayload_(gs.resolveSheets_({}), { banks: true, movedFutureMovements: [] });

  assert.deepEqual(seccionesDe(payload), SECCIONES.filter(s => !["transactions", "futureTransactions", "investmentEstimateRules", "investmentEstimateLedger"].includes(s)));
  assert.deepEqual([...payload.movedFutureMovements], []);
});

test("la descarga de inversiones no trae movimientos ni bancos", () => {
  const gs = setup();
  const payload = gs.buildDataPayload_(gs.resolveSheets_({}));

  assert.deepEqual(seccionesDe(payload), ["investments", "investmentTotals", "investmentGoals", "categories"]);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "movedFutureMovements"), false,
    "sin movedFutureMovements: esta descarga no vence futuros");
});

test("la respuesta es JSON plano legible con JSON.parse", () => {
  const gs = setup();
  const output = gs.json_({ ok: true, descripcion: "<nota>&\u2028\u2029" });
  // El escapado de <, >, & y los separadores Unicode solo hacía falta cuando la
  // respuesta se ejecutaba como JavaScript dentro de un <script>.
  assert.deepEqual(JSON.parse(output.text), { ok: true, descripcion: "<nota>&\u2028\u2029" });
  assert.equal(output.mimeType, "json");
});

test("las estimaciones se obtienen con un payload independiente", () => {
  const gs = setup();
  const payload = gs.buildInvestmentEstimatesPayload_(gs.resolveSheets_({}));
  assert.deepEqual(seccionesDe(payload), ["investmentEstimateRules", "investmentEstimateLedger"]);
});

test("renombrar una categoría actualiza movimientos y estimaciones", () => {
  const gs = setup();
  gs.__spreadsheet.getSheetByName(MOVEMENT_SHEET).getRange(2, 1, 1, MOVEMENT_HEADERS.length).setValues([
    ["2026-01-01", 2026, 1, 1, "Inversión", "Bolsa", "Bolsa", -100, "Banco", "m-1"]
  ]);
  const rulesName = "Reglas prueba";
  const ledgerName = "Libro prueba";
  gs.__spreadsheet.addSheet(rulesName, [gs.investmentEstimateRuleHeaders_(), ["r-1", true, "", "Bolsa", "", "", "", "", ""]]);
  gs.__spreadsheet.addSheet(ledgerName, [gs.investmentEstimateLedgerHeaders_(), ["l-1", true, "2026-01-01", "m-1", "Bolsa", "", "", "", 100, 10, 10, "manual"]]);

  gs.updateInvestmentCategoryNamesInMovements_(MOVEMENT_SHEET, { Bolsa: "ETFs" });
  gs.updateInvestmentCategoryNamesInEstimateRules_(rulesName, { Bolsa: "ETFs" });
  gs.updateInvestmentCategoryNamesInEstimateLedger_(ledgerName, { Bolsa: "ETFs" });

  assert.deepEqual(gs.__spreadsheet.getSheetByName(MOVEMENT_SHEET).getRange(2, 6, 1, 2).getValues()[0], ["ETFs", "ETFs"]);
  assert.equal(gs.__spreadsheet.getSheetByName(rulesName).getRange(2, 4).getValue(), "ETFs");
  assert.equal(gs.__spreadsheet.getSheetByName(ledgerName).getRange(2, 5).getValue(), "ETFs");
});

test("un lote aplica todas sus operaciones bajo un solo lock", () => {
  // Una recurrencia de 52 fechas era 52 POST, 52 esperas de lock y 52 ejecuciones.
  const gs = setup();
  const ops = [1, 2, 3].map(n => ({
    action: "addFutureMovement",
    clientOpId: `lote-op-${n}`,
    sheetName: FUTURE_SHEET,
    movement: { sid: `f-${n}`, fecha: `2026-0${n}-01`, tipo: "Gasto", concepto: "Cuota", descripcion: "", importe: -10 }
  }));

  const response = JSON.parse(gs.doPost({ postData: { contents: JSON.stringify({
    token: gs.__token,
    action: "batchOps",
    clientOpId: "lote-1",
    futureMovementSheet: FUTURE_SHEET,
    ops
  }) } }).text);

  assert.equal(response.ok, true);
  assert.equal(response.applied, 3);
  assert.equal(gs.__spreadsheet.getSheetByName(FUTURE_SHEET).getLastRow(), 4, "las tres filas están escritas");
  // Cada operación conserva su clientOpId, así que reenviar el lote no duplica nada.
  ops.forEach(op => assert.equal(gs.buildClientOpStatusPayload_(op.clientOpId).completed, true));

  const repeat = JSON.parse(gs.doPost({ postData: { contents: JSON.stringify({
    token: gs.__token,
    action: "batchOps",
    clientOpId: "lote-1",
    futureMovementSheet: FUTURE_SHEET,
    ops
  }) } }).text);
  assert.equal(repeat.duplicate, true, "el lote entero se deduplica por su propio clientOpId");
  assert.equal(gs.__spreadsheet.getSheetByName(FUTURE_SHEET).getLastRow(), 4, "y no vuelve a escribir");
});

test("resolveSheets_ aplica los valores por defecto y respeta los nombres de la petición", () => {
  const gs = setup();

  // Se copia con spread: el objeto nace dentro del vm y su prototipo no es el de este
  // realm, así que deepEqual estricto lo rechazaría aunque el contenido coincida.
  assert.deepEqual({ ...gs.resolveSheets_({}) }, {
    movement: MOVEMENT_SHEET,
    future: FUTURE_SHEET,
    investment: INVESTMENT_SHEET,
    investmentTotals: TOTALS_SHEET,
    investmentEstimateRules: "Inversiones Estimación Reglas",
    investmentEstimateLedger: "Inversiones Estimación Movimientos",
    bank: BANK_SHEET,
    objective: OBJECTIVE_SHEET,
    data: DATA_SHEET
  });

  assert.equal(gs.resolveSheets_({ movementSheet: "Otra" }).movement, "Otra");
  assert.equal(gs.resolveSheets_({ bankSheet: "Mis cuentas" }).bank, "Mis cuentas");
});
