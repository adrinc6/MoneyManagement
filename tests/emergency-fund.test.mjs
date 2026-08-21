// El fondo de emergencia es una vista sobre las categorías de inversión, no una entidad
// propia: solo suma los tipos marcados. Estas pruebas fijan ese contrato, incluido el caso
// que rompía a los grupos de cuentas (guardar nombres y no ids): un tipo renombrado o
// borrado no debe hacer que el fondo mienta ni que reviente el resumen.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const EMERGENCY_FUND_KEY = "moneyEmergencyFund";

function setup(app, types) {
  app.state.categories = { ...app.state.categories, investmentTypes: ["Bolsa", "Cripto", "Fondos"] };
  app.state.emergencyFund = { types };
}

const summary = {
  bank: 1000,
  investedByType: { Bolsa: 500, Cripto: 200, Fondos: 300 },
  valueByType: { Bolsa: 650, Cripto: 150, Fondos: 300 }
};

test("suma solo los tipos elegidos, con invertido, valor y ganancia", () => {
  const app = loadApp();
  setup(app, ["Bolsa", "Fondos"]);
  const fund = app.emergencyFundTotals(summary);
  assert.deepEqual([...fund.types], ["Bolsa", "Fondos"]);
  assert.equal(fund.invested, 800);
  assert.equal(fund.value, 950);
  assert.equal(fund.gain, 150);
  assert.equal(fund.gainPct, 150 / 800);
});

test("sin selección el fondo vale 0 y el Total del panel es solo el banco", () => {
  const app = loadApp();
  setup(app, []);
  const fund = app.emergencyFundTotals(summary);
  assert.equal(fund.invested, 0);
  assert.equal(fund.value, 0);
  assert.equal(fund.gain, 0);
  assert.equal(fund.gainPct, 0);
  assert.equal(summary.bank + fund.value, 1000);
});

test("un tipo guardado que ya no existe se ignora en vez de romper", () => {
  const app = loadApp();
  setup(app, ["Bolsa", "Materias primas"]);
  const fund = app.emergencyFundTotals(summary);
  assert.deepEqual([...fund.types], ["Bolsa"]);
  assert.equal(fund.value, 650);
});

test("la comparación tolera mayúsculas y acentos distintos en la categoría", () => {
  const app = loadApp();
  app.state.categories = { ...app.state.categories, investmentTypes: ["Bolsa"] };
  app.state.emergencyFund = { types: ["BOLSA"] };
  const fund = app.emergencyFundTotals(summary);
  assert.deepEqual([...fund.types], ["Bolsa"]);
  assert.equal(fund.value, 650);
});

test("loadEmergencyFund tolera datos corruptos o con otra forma", () => {
  const app = loadApp();
  app.__store.set(EMERGENCY_FUND_KEY, "{{{no es json");
  assert.deepEqual([...app.loadEmergencyFund().types], []);
  app.__store.set(EMERGENCY_FUND_KEY, JSON.stringify({ types: "Bolsa" }));
  assert.deepEqual([...app.loadEmergencyFund().types], []);
  app.__store.set(EMERGENCY_FUND_KEY, JSON.stringify({ types: ["Bolsa", "", "Bolsa", "Cripto"] }));
  assert.deepEqual([...app.loadEmergencyFund().types], ["Bolsa", "Cripto"]);
});

test("renombrar una categoría mantiene el fondo apuntando a ella", () => {
  const app = loadApp();
  setup(app, ["Bolsa", "Fondos"]);
  app.renameInvestmentTypeInEmergencyFund(value => (value === "Bolsa" ? "Renta variable" : value));
  assert.deepEqual([...app.state.emergencyFund.types], ["Renta variable", "Fondos"]);
  assert.equal(JSON.parse(app.__store.get(EMERGENCY_FUND_KEY)).types[0], "Renta variable");
});
