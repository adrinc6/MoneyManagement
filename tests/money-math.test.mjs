// Cobertura de las funciones de dinero: parseo de importes y fechas, redondeo y
// agregación mensual. Antes solo estaba testeada la capa de sincronización, así que
// un error de mil veces al leer "1.234" o un desfase de día en las fechas serial
// habrían pasado desapercibidos.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const app = loadApp();

test("parseNumber distingue decimales de separadores de miles", () => {
  // Formato español: la coma es decimal.
  assert.equal(app.parseNumber("12,5"), 12.5);
  assert.equal(app.parseNumber("-12,50"), -12.5);
  assert.equal(app.parseNumber("1.234,56"), 1234.56);
  // Punto como separador de miles: grupos de exactamente 3 dígitos.
  assert.equal(app.parseNumber("1.234"), 1234);
  assert.equal(app.parseNumber("1.234.567"), 1234567);
  // Punto decimal cuando no puede ser agrupación.
  assert.equal(app.parseNumber("1.5"), 1.5);
  assert.equal(app.parseNumber("10.55"), 10.55);
  // Formato inglés.
  assert.equal(app.parseNumber("1,234.56"), 1234.56);
  assert.equal(app.parseNumber("1,234,567"), 1234567);
  // Números tal cual.
  assert.equal(app.parseNumber(42), 42);
  assert.equal(app.parseNumber("2000"), 2000);
  // Con símbolo de moneda.
  assert.equal(app.parseNumber("1.234,56 €"), 1234.56);
});

test("parseNumber devuelve NaN para lo ilegible, nunca 0", () => {
  for (const value of ["abc", "", "   ", "---", "€", null, undefined]) {
    assert.ok(Number.isNaN(app.parseNumber(value)), `esperaba NaN para ${JSON.stringify(value)}`);
  }
});

test("parseDate interpreta los serial de hoja de cálculo en hora local", () => {
  // 45658 es 2025-01-01 en la época de Sheets (1899-12-30).
  const date = app.parseDate(45658);
  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 1);
});

test("parseDate acepta ISO y dd/mm/yyyy sin desfase de zona horaria", () => {
  const iso = app.parseDate("2026-03-15");
  assert.equal(iso.getFullYear(), 2026);
  assert.equal(iso.getMonth(), 2);
  assert.equal(iso.getDate(), 15);

  const slash = app.parseDate("15/03/2026");
  assert.equal(slash.getFullYear(), 2026);
  assert.equal(slash.getMonth(), 2);
  assert.equal(slash.getDate(), 15);

  assert.equal(app.parseDate(""), null);
});

test("roundMoneyStrict rechaza lo ilegible mientras roundMoney lo presenta como 0", () => {
  assert.equal(app.roundMoneyStrict("1.234,56"), 1234.56);
  assert.equal(app.roundMoneyStrict(10.555), 10.56);
  assert.ok(Number.isNaN(app.roundMoneyStrict("no-numero")));
  assert.ok(Number.isNaN(app.roundMoneyStrict("")));
  // roundMoney conserva el 0 para las rutas de presentación.
  assert.equal(app.roundMoney("no-numero"), 0);
});

test("normalizeTransaction descarta filas sin fecha, tipo o importe legible", () => {
  assert.equal(app.normalizeTransaction({ fecha: "2026-01-05", tipo: "", importe: 10 }), null);
  assert.equal(app.normalizeTransaction({ fecha: "", tipo: "Gasto", importe: 10 }), null);
  assert.equal(app.normalizeTransaction({ fecha: "2026-01-05", tipo: "Gasto", importe: "abc" }), null);

  const ok = app.normalizeTransaction({ fecha: "2026-01-05", tipo: "Gasto", concepto: "Comida", importe: "-12,50" });
  assert.equal(ok.amount, -12.5);
  assert.equal(ok.tipo, "Gasto");
  assert.ok(ok.sid);
});

test("normalizeRows cuenta las filas descartadas", () => {
  const dropped = [];
  const rows = [
    { fecha: "2026-01-05", tipo: "Gasto", importe: -10 },
    { fecha: "", tipo: "Gasto", importe: -10 },
    { fecha: "2026-01-06", tipo: "", importe: -10 }
  ];
  const out = app.normalizeRows(rows, app.normalizeTransaction, dropped, "movimientos");
  assert.equal(out.length, 1);
  assert.deepEqual(dropped, ["movimientos: 2"]);
});

test("normalizeBank rechaza saldos ilegibles en vez de convertirlos en 0", () => {
  assert.equal(app.normalizeBank({ cuenta: "Banco", dinero: "abc" }), null);
  assert.equal(app.normalizeBank({ cuenta: "", dinero: 100 }), null);
  assert.equal(app.normalizeBank({ cuenta: "Banco", dinero: "1.234,56" }).dinero, 1234.56);
});

test("calculateSummary agrega ingresos, gastos e inversión del mes", () => {
  const previous = { transactions: app.state.transactions, banks: app.state.banks };
  try {
    app.state.transactions = [
      { fecha: "2026-03-05", tipo: "Ingreso", concepto: "Nómina", importe: 2000 },
      { fecha: "2026-03-10", tipo: "Gasto", concepto: "Comida", importe: -250 },
      { fecha: "2026-03-12", tipo: "Gasto", concepto: "Ocio", importe: -50 },
      { fecha: "2026-03-20", tipo: "Inversión", concepto: "Bolsa", importe: -300 },
      // Otro mes: no debe contarse en los totales de marzo.
      { fecha: "2026-04-01", tipo: "Gasto", concepto: "Comida", importe: -999 }
    ].map(app.normalizeTransaction);
    app.state.banks = [];

    const summary = app.calculateSummary("2026-03");
    assert.equal(summary.income, 2000);
    assert.equal(summary.expenses, 300);
    assert.equal(summary.investedMonth, 300);
    // Balance del mes: suma de todos los importes de marzo.
    assert.equal(app.roundMoney(summary.balance), 1400);
  } finally {
    app.state.transactions = previous.transactions;
    app.state.banks = previous.banks;
  }
});

test("expandRecurrenceDates respeta el tope y avisa cuando trunca", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 0, 31);

  // Semanal, lunes (índice 0 con semana que empieza en lunes): 4 lunes en enero 2026.
  const weekly = app.expandRecurrenceDates(start, end, "weekly", [0]);
  assert.equal(weekly.truncated, false);
  assert.equal(weekly.dates.length, 4);
  weekly.dates.forEach(date => assert.equal(date.getDay(), 1));

  // Mensual, día 15: una sola fecha en el rango.
  const monthly = app.expandRecurrenceDates(start, end, "monthly", [15]);
  assert.equal(monthly.dates.length, 1);
  assert.equal(monthly.dates[0].getDate(), 15);

  // Por encima del tope se trunca y se informa.
  const capped = app.expandRecurrenceDates(start, end, "monthly", [1, 2, 3, 4, 5], 3);
  assert.equal(capped.truncated, true);
  assert.equal(capped.dates.length, 3);

  // Rangos degenerados no generan nada ni se cuelgan.
  assert.equal(app.expandRecurrenceDates(end, start, "weekly", [0]).dates.length, 0);
  assert.equal(app.expandRecurrenceDates(start, end, "weekly", []).dates.length, 0);
  assert.equal(app.expandRecurrenceDates(null, null, "weekly", [0]).dates.length, 0);
});

test("expandRecurrenceDates no itera sin fin con un rango absurdo", () => {
  // Un rango de un siglo se corta por el límite de días recorridos.
  const result = app.expandRecurrenceDates(new Date(2026, 0, 1), new Date(2126, 0, 1), "monthly", [1]);
  assert.equal(result.truncated, true);
  assert.ok(result.dates.length <= app.MAX_RECURRENCE_OCCURRENCES);
});

test("buildRegistrarSummaryCards usa el presupuesto y los futuros del mes actual", () => {
  const previous = {
    transactions: app.state.transactions,
    futureTransactions: app.state.futureTransactions,
    investmentGoals: app.state.investmentGoals,
    banks: app.state.banks
  };
  const currentMonth = app.currentMonthKey();
  const [year, month] = currentMonth.split("-").map(Number);
  const otherMonth = new Date(year, month, 1);
  try {
    app.state.transactions = [
      { fecha: new Date(year, month - 1, 5), tipo: "Gasto", importe: -120 },
      { fecha: new Date(year, month - 1, 6), tipo: "Inversión", importe: -40 }
    ].map(app.normalizeTransaction);
    app.state.futureTransactions = [
      { fecha: new Date(year, month - 1, 10), tipo: "Gasto", importe: -109.4 },
      { fecha: new Date(year, month - 1, 11), tipo: "Inversión", importe: -208.4 },
      { fecha: new Date(year, month - 1, 12), tipo: "Ingreso", importe: 500 },
      { fecha: otherMonth, tipo: "Gasto", importe: -999 }
    ].map(app.normalizeTransaction);
    app.state.investmentGoals = { expenseMonthly: 300 };
    app.state.banks = [];

    const cards = app.buildRegistrarSummaryCards();
    assert.deepEqual(Array.from(cards, card => card.label), [
      "Dinero total bancos", "Dinero invertido", "Uso personal", "Invertido mes",
      "Gastos mes", "Gastos/Inv futuros mes"
    ]);
    assert.equal(cards[2].value, app.money(180));
    assert.equal(cards[4].value, app.money(120));
    assert.equal(cards[5].value, "109/208 €");

    app.state.investmentGoals = { expenseMonthly: 0 };
    assert.equal(app.buildRegistrarSummaryCards()[2].value, "Sin objetivo");
  } finally {
    app.state.transactions = previous.transactions;
    app.state.futureTransactions = previous.futureTransactions;
    app.state.investmentGoals = previous.investmentGoals;
    app.state.banks = previous.banks;
  }
});
