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

test("la descarga completa trae las nueve secciones", () => {
  const gs = setup();
  const payload = gs.buildDataPayload_(gs.resolveSheets_({}), { movements: true, banks: true, movedFutureMovements: [] });

  assert.equal(payload.ok, true);
  assert.deepEqual(seccionesDe(payload), SECCIONES);
  assert.ok(Object.prototype.hasOwnProperty.call(payload, "movedFutureMovements"));
});

test("la descarga base trae todo menos los movimientos", () => {
  const gs = setup();
  const payload = gs.buildDataPayload_(gs.resolveSheets_({}), { banks: true, movedFutureMovements: [] });

  assert.deepEqual(seccionesDe(payload), SECCIONES.filter(s => s !== "transactions" && s !== "futureTransactions"));
  assert.deepEqual([...payload.movedFutureMovements], []);
});

test("la descarga de inversiones no trae movimientos ni bancos", () => {
  const gs = setup();
  const payload = gs.buildDataPayload_(gs.resolveSheets_({}));

  assert.deepEqual(seccionesDe(payload), [
    "investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "investmentGoals", "categories"
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "movedFutureMovements"), false,
    "sin movedFutureMovements: esta descarga no vence futuros");
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
