// Transferencias periódicas de principio a fin.
//
// Este es el flujo que el usuario reportó como roto: la operación se enviaba pero
// nunca se confirmaba, porque la hoja tiene un desplegable de validación en la
// columna CUENTA que rechaza el texto "Origen → Destino" y cada reintento repetía
// el mismo valor rechazado. Cada test aquí cubre una de las causas encontradas.
import test from "node:test";
import assert from "node:assert/strict";
import { loadAppsScript } from "./load-apps-script.mjs";
import { loadApp } from "./load-app.mjs";

const FUTURE_SHEET = "Movimientos futuros";
const BANK_SHEET = "Bancos";
const FUTURE_HEADERS = ["FECHA", "AÑO", "MES", "DIA", "TIPO", "CONCEPTO", "DESCRIPCION", "IMPORTE", "Cuenta", "SID"];

// Cuentas válidas del desplegable: NO incluye el texto "A → B" de las transferencias,
// que es justo lo que reproduce el fallo del usuario.
const ACCOUNTS = ["Santander", "Revolut"];
const accountDropdown = value => ACCOUNTS.includes(String(value).trim());

function setupSheets(gs, { futureRows = [] } = {}) {
  const future = gs.__spreadsheet.addSheet(FUTURE_SHEET, [FUTURE_HEADERS, ...futureRows]);
  const banks = gs.__spreadsheet.addSheet(BANK_SHEET, [
    ["CUENTA", "DINERO"],
    ["Santander", 1000],
    ["Revolut", 500]
  ]);
  return { future, banks };
}

function bankAmount(banks, account) {
  const rows = banks.getRange(2, 1, banks.getLastRow() - 1, 2).getValues();
  const row = rows.find(r => String(r[0]).trim() === account);
  return row ? Number(row[1]) : null;
}

test("una transferencia futura se guarda aunque CUENTA tenga un desplegable que rechace 'A → B'", () => {
  const gs = loadAppsScript();
  const { future } = setupSheets(gs);
  // Columna 9 (I) = CUENTA, con validación de rechazo: el fallo del usuario.
  future.setColumnValidation(9, accountDropdown);

  gs.addFutureMovement_(
    { sid: "mov_1", fecha: "2026-09-01", tipo: "Transferencia", concepto: "Transferencia", descripcion: "Santander → Revolut", importe: 200 },
    FUTURE_SHEET,
    ""
  );

  const row = future.getRange(2, 1, 1, 10).getValues()[0];
  assert.equal(row[6], "Santander → Revolut", "DESCRIPCION conserva el par de cuentas");
  assert.equal(row[7], 200);
  assert.equal(String(row[8] || ""), "", "CUENTA queda vacía para no chocar con el desplegable");
  assert.equal(row[9], "mov_1");
});

test("se guarda aunque la validación esté en la columna SID (se escribe antes que nada)", () => {
  // ensureMovementSidColumn_ reescribe la columna SID ANTES de cualquier otra
  // escritura: si esa ruta no está protegida, revienta antes de llegar al resto.
  const gs = loadAppsScript();
  const { future } = setupSheets(gs, {
    futureRows: [["2026-08-01", 2026, 8, 1, "Gasto", "Comida", "Compra", -20, "Santander", ""]]
  });
  future.setColumnValidation(10, () => false); // la columna SID rechaza todo

  gs.addFutureMovement_(
    { sid: "mov_2", fecha: "2026-09-01", tipo: "Transferencia", concepto: "Transferencia", descripcion: "Santander → Revolut", importe: 200 },
    FUTURE_SHEET,
    ""
  );

  const row = future.getRange(3, 1, 1, 10).getValues()[0];
  assert.equal(row[6], "Santander → Revolut");
  assert.equal(row[9], "mov_2");
});

test("transferBank_ mueve el saldo aunque la columna de importes de Bancos tenga validación", () => {
  const gs = loadAppsScript();
  const { banks } = setupSheets(gs);
  // Regla típica: "solo números mayores que 0" en la columna DINERO. La
  // transferencia deja Santander en negativo, así que la regla la rechazaría.
  banks.setColumnValidation(2, value => Number(value) > 0);

  gs.transferBank_(BANK_SHEET, "Santander", "Revolut", 1200);

  assert.equal(bankAmount(banks, "Santander"), -200, "el saldo se escribe aunque quede negativo");
  assert.equal(bankAmount(banks, "Revolut"), 1700);
});

test("los campos que manda el frontend son los que lee el backend", () => {
  // Un desajuste de nombres aquí rompe en silencio: la fila se escribiría vacía.
  const app = loadApp();
  const gs = loadAppsScript();
  const { future } = setupSheets(gs);

  const transfer = app.normalizeTransaction({
    fecha: "2026-09-01",
    tipo: "Transferencia",
    concepto: "Transferencia",
    descripcion: "Santander → Revolut",
    importe: 200
  });
  const [op] = app.recurringTransferOps([transfer], {
    from: "Santander",
    to: "Revolut",
    amount: 200,
    futureMovementSheet: FUTURE_SHEET,
    bankSheet: BANK_SHEET
  });

  assert.equal(op.action, "addFutureMovement");
  assert.equal(op.sheetName, FUTURE_SHEET);

  // El backend consume exactamente este payload.
  gs.addFutureMovement_(op.movement, op.sheetName, op.account || "");

  const row = future.getRange(2, 1, 1, 10).getValues()[0];
  assert.equal(row[4], "Transferencia", "TIPO llega");
  assert.equal(row[6], "Santander → Revolut", "DESCRIPCION llega");
  assert.equal(Number(row[7]), 200, "IMPORTE llega");
  assert.ok(row[9], "SID llega");
});

test("la fila guardada se relee con origen y destino correctos", () => {
  const app = loadApp();
  const gs = loadAppsScript();
  const { future } = setupSheets(gs);
  future.setColumnValidation(9, accountDropdown);

  gs.addFutureMovement_(
    { sid: "mov_3", fecha: "2026-09-01", tipo: "Transferencia", concepto: "Transferencia", descripcion: "Santander → Revolut", importe: 200 },
    FUTURE_SHEET,
    ""
  );

  const row = future.getRange(2, 1, 1, 10).getValues()[0];
  const movement = app.normalizeTransaction({
    fecha: row[0], tipo: row[4], concepto: row[5], descripcion: row[6], importe: row[7], cuenta: row[8], sid: row[9]
  });

  assert.ok(movement, "la fila se normaliza");
  assert.equal(movement.transferFrom, "Santander");
  assert.equal(movement.transferTo, "Revolut");
});

test("al vencer, la transferencia mueve el saldo y desaparece de futuros", () => {
  const gs = loadAppsScript();
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const { future, banks } = setupSheets(gs, {
    // CUENTA vacía a propósito: las cuentas se deducen de DESCRIPCION.
    futureRows: [[ayer, ayer.getFullYear(), ayer.getMonth() + 1, ayer.getDate(), "Transferencia", "Transferencia", "Santander → Revolut", 200, "", "mov_4"]]
  });

  const moved = gs.moveDueFutureMovementsLocked_(FUTURE_SHEET, "Control Finanzas", BANK_SHEET, []);

  assert.equal(moved.length, 1, "se mueve una transferencia vencida");
  assert.equal(bankAmount(banks, "Santander"), 800);
  assert.equal(bankAmount(banks, "Revolut"), 700);
  assert.equal(future.getLastRow(), 1, "solo queda la cabecera");
});

test("reenviar la misma transferencia no mueve el dinero dos veces", () => {
  const gs = loadAppsScript();
  const { banks } = setupSheets(gs);

  const body = clientOpId => JSON.stringify({
    token: gs.__token,
    action: "transferBank",
    clientOpId,
    transferSid: "tr_1",
    bankSheet: BANK_SHEET,
    from: "Santander",
    to: "Revolut",
    amount: 200
  });

  gs.doPost({ postData: { contents: body("op-1") } });
  assert.equal(bankAmount(banks, "Santander"), 800);

  // Simula la poda de la lista de operaciones procesadas (límite de 9 KB): el
  // cliente reenvía la MISMA operación porque nunca recibió confirmación.
  gs.__properties.delete("moneyProcessedClientOps");

  gs.doPost({ postData: { contents: body("op-1") } });

  assert.equal(bankAmount(banks, "Santander"), 800, "el saldo no se mueve dos veces");
  assert.equal(bankAmount(banks, "Revolut"), 700);
});
