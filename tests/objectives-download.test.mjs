import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

test("el bloque appSettings descargado reemplaza los presupuestos locales", () => {
  const app = loadApp();
  app.state.budgets = { "Vivienda": 999 };

  app.applyDataSnapshot({ appSettings: { budgets: { "Vivienda": 600, "Alimentación": 400 } } }, { onlyPresentSections: true });

  assert.deepEqual(JSON.parse(JSON.stringify(app.state.budgets)), { "Vivienda": 600, "Alimentación": 400 });
  assert.deepEqual(JSON.parse(app.localStorage.getItem("moneyBudgets")), { "Vivienda": 600, "Alimentación": 400 });
});
