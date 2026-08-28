import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

// La vista previa de Registrar habla del mes en curso. En periódico se guardan todos los
// movimientos del rango, pero al mes actual solo le afectan los que caen dentro de él:
// contar el rango entero enseñaría un saldo que no va a existir este mes.
const d = (y, m, day) => new Date(y, m - 1, day);

test("en periódico solo cuentan las repeticiones que caen en el mes en curso", () => {
  const app = loadApp();
  const dates = [d(2026, 8, 1), d(2026, 8, 15), d(2026, 9, 1), d(2026, 10, 1)];

  assert.equal(app.occurrencesInMonth(dates, "2026-08"), 2);
  assert.equal(app.occurrencesInMonth(dates, "2026-09"), 1);
});

test("un rango que empieza el mes que viene no afecta a este", () => {
  const app = loadApp();
  const dates = [d(2026, 9, 1), d(2026, 10, 1), d(2026, 11, 1)];

  assert.equal(app.occurrencesInMonth(dates, "2026-08"), 0);
});

test("sin fechas no hay nada que contar", () => {
  const app = loadApp();

  assert.equal(app.occurrencesInMonth([], "2026-08"), 0);
  assert.equal(app.occurrencesInMonth(undefined, "2026-08"), 0);
  assert.equal(app.occurrencesInMonth([null, d(2026, 8, 3)], "2026-08"), 1);
});
