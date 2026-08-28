// Objetivos de composición: el reparto objetivo de la cartera y de cada grupo.
//
// Lo que se fija aquí es la aritmética, que es donde el usuario se juega el dinero: qué
// significa un peso vacío frente a un cero, cómo se normalizan pesos escritos como fracción y
// cuál es el total mínimo con el que se cuadra la composición sin tener que vender nada.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

// Lo que devuelve app.js vive en otro realm (node:vm): un objeto de allí no es
// reference-equal con uno de aquí aunque tenga la misma forma. Se copia antes de comparar.
const plain = value => JSON.parse(JSON.stringify(value));

const COMPOSITION_KEY = "moneyInvestmentComposition";

const entry = (key, weight, current) => ({ key, label: key, weight, current });

test("parseCompositionWeight distingue vacío, número, porcentaje y fracción", () => {
  const app = loadApp();
  assert.equal(app.parseCompositionWeight(""), null, "vacío es 'no cuenta', no un cero");
  assert.equal(app.parseCompositionWeight("   "), null);
  assert.equal(app.parseCompositionWeight(null), null);
  assert.equal(app.parseCompositionWeight("20"), 20);
  assert.equal(app.parseCompositionWeight("0"), 0);
  assert.equal(app.parseCompositionWeight("11,5"), 11.5);
  assert.equal(app.parseCompositionWeight("20 %"), 20);
  assert.ok(Math.abs(app.parseCompositionWeight("1/9") - 1 / 9) < 1e-12);
  assert.equal(app.parseCompositionWeight("3/4"), 0.75);
  assert.ok(Number.isNaN(app.parseCompositionWeight("1/0")), "una fracción sin denominador no vale");
  assert.ok(Number.isNaN(app.parseCompositionWeight("abc")));
  assert.ok(Number.isNaN(app.parseCompositionWeight("-5")), "un peso negativo no significa nada");
});

test("compositionWeightParts parte el peso en las dos columnas del editor", () => {
  const app = loadApp();
  assert.deepEqual(plain(app.compositionWeightParts("")), { numerator: "", denominator: "" }, "vacío es vacío en las dos");
  assert.deepEqual(plain(app.compositionWeightParts(null)), { numerator: "", denominator: "" });
  assert.deepEqual(plain(app.compositionWeightParts("1/9")), { numerator: "1", denominator: "9" });
  assert.deepEqual(plain(app.compositionWeightParts("20")), { numerator: "20", denominator: "100" }, "un número suelto es sobre 100");
  assert.deepEqual(plain(app.compositionWeightParts("20 %")), { numerator: "20", denominator: "100" });
  assert.deepEqual(plain(app.compositionWeightParts(" 11,5 ")), { numerator: "11,5", denominator: "100" });
});

test("compositionWeightFromParts recompone lo que se escribe en las dos columnas", () => {
  const app = loadApp();
  assert.equal(app.compositionWeightFromParts("", ""), "", "sin numerador no hay peso: ese grupo no cuenta");
  assert.equal(app.compositionWeightFromParts("", "9"), "", "un denominador solo tampoco es un peso");
  assert.equal(app.compositionWeightFromParts("20", ""), "20/100", "el denominador por defecto es 100");
  assert.equal(app.compositionWeightFromParts("1", "9"), "1/9");
  assert.equal(app.compositionWeightFromParts("0", ""), "0/100", "el cero sigue contando");
  assert.equal(app.parseCompositionWeight(app.compositionWeightFromParts("20", "")), 0.2);
});

test("normalizeInvestmentComposition migra los pesos antiguos a fracción", () => {
  const app = loadApp();
  const composition = app.normalizeInvestmentComposition({ groups: { Bolsa: "60", Fondos: "1/9" } });
  assert.deepEqual(plain(composition.groups), { Bolsa: "60/100", Fondos: "1/9" });
});

test("con un total objetivo reparte por peso y dice lo que falta en cada grupo", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({
    entries: [entry("ETFs", 20, 1000), entry("Fondos", 80, 5000)],
    total: "18000"
  });
  assert.equal(plan.total, 18000);
  assert.equal(plan.automatic, false);
  assert.equal(plan.rows[0].target, 3600, "el 20 % de 18.000");
  assert.equal(plan.rows[0].missing, 2600);
  assert.equal(plan.rows[1].target, 14400);
  assert.equal(plan.rows[1].missing, 9400);
  assert.equal(plan.currentTotal, 6000);
  assert.equal(plan.missingTotal, 12000, "lo que falta es el objetivo menos lo que ya hay");
  assert.equal(plan.excessTotal, 0);
});

test("sin total objetivo calcula el mínimo que cuadra sin vender nada", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({
    entries: [entry("ETFs", 60, 900), entry("Fondos", 40, 100)],
    total: ""
  });
  assert.equal(plan.automatic, true);
  assert.equal(plan.minimumTotal, 1500, "900 ya es el 60 %, así que la cartera entera son 1.500");
  assert.equal(plan.total, 1500);
  assert.equal(plan.rows[0].missing, 0, "el grupo que marca el mínimo no necesita nada");
  assert.equal(plan.rows[1].missing, 500);
  assert.equal(plan.missingTotal, 500);
  assert.equal(plan.excessTotal, 0, "el mínimo nunca obliga a vender");
});

test("un peso 0 con dinero dentro sobra: no se puede arreglar aportando", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({
    entries: [entry("ETFs", 100, 500), entry("Cripto", 0, 300)],
    total: "1000"
  });
  assert.equal(plan.rows[1].target, 0);
  assert.equal(plan.rows[1].missing, 0);
  assert.equal(plan.rows[1].excess, 300);
  assert.equal(plan.excessTotal, 300);
  assert.equal(plan.missingTotal, 500);
});

test("las fracciones se normalizan igual que los porcentajes", () => {
  const app = loadApp();
  const novenos = app.computeCompositionPlan({
    entries: Array.from({ length: 9 }, (_, i) => entry(`G${i}`, 1 / 9, 0)),
    total: "900"
  });
  novenos.rows.forEach(row => {
    assert.ok(Math.abs(row.share - 1 / 9) < 1e-12);
    assert.equal(row.target, 100);
  });
  assert.equal(novenos.weightsWarning, false, "nueve novenos suman 1: está bien escrito");

  const mezcla = app.computeCompositionPlan({ entries: [entry("A", 1 / 2, 0), entry("B", 50, 0)], total: "100" });
  assert.ok(Math.abs(mezcla.rows[0].share - 0.5 / 50.5) < 1e-12, "se normaliza por la suma, sea cual sea la escala");
});

test("una suma que no es ni 100 ni 1 se reparte igual, pero avisa", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({ entries: [entry("A", 60, 0), entry("B", 30, 0)], total: "900" });
  assert.equal(plan.weightsWarning, true);
  assert.equal(plan.rows[0].target, 600, "60 de 90 es dos tercios");
  assert.equal(plan.rows[1].target, 300);
  assert.equal(app.computeCompositionPlan({ entries: [entry("A", 60, 0), entry("B", 40, 0)], total: "100" }).weightsWarning, false);
});

test("sin filas con peso no hay reparto ni objetivo mínimo", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({ entries: [], total: "" });
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.total, 0);
  assert.equal(plan.missingTotal, 0);
  assert.equal(plan.weightsWarning, false);
});

test("compositionGroupEntries deja fuera los grupos sin peso, y su dinero con ellos", () => {
  const app = loadApp();
  app.state.categories = { ...app.state.categories, investmentTypes: ["Bolsa", "Cripto", "Fondos"] };
  app.state.investmentComposition = app.normalizeInvestmentComposition({ groups: { Bolsa: "60", Fondos: "40" } });
  const summary = { investedByType: { Bolsa: 500, Cripto: 200, Fondos: 300 }, valueByType: { Bolsa: 650, Cripto: 150, Fondos: 300 } };
  const entries = app.compositionGroupEntries(summary);
  assert.deepEqual(plain(entries.map(item => item.key)), ["Bolsa", "Fondos"]);
  assert.equal(app.computeCompositionPlan({ entries, total: "" }).currentTotal, 800, "los 200 de Cripto no cuentan");
});

test("un grupo con peso 0 sí cuenta: es 'no quiero tener nada aquí'", () => {
  const app = loadApp();
  app.state.categories = { ...app.state.categories, investmentTypes: ["Bolsa", "Cripto"] };
  app.state.investmentComposition = app.normalizeInvestmentComposition({ groups: { Bolsa: "100", Cripto: "0" } });
  const summary = { investedByType: { Bolsa: 500, Cripto: 200 }, valueByType: { Bolsa: 500, Cripto: 200 } };
  const entries = app.compositionGroupEntries(summary);
  assert.deepEqual(plain(entries.map(item => item.key)), ["Bolsa", "Cripto"]);
  assert.equal(entries[1].weight, 0);
});

test("la base de un grupo es lo invertido, y el valor solo cuando no hay invertido", () => {
  const app = loadApp();
  const summary = { investedByType: { Bolsa: 500, Cripto: 0 }, valueByType: { Bolsa: 650, Cripto: 150 } };
  assert.equal(app.compositionBaseForGroup("Bolsa", summary), 500);
  assert.equal(app.compositionBaseForGroup("Cripto", summary), 150);
  assert.equal(app.compositionBaseForGroup("Fondos", summary), 0);
});

test("la clave de una posición es su ticker, y su nombre cuando es efectivo", () => {
  const app = loadApp();
  assert.equal(app.compositionPositionKey({ data: "IWDA", nombre: "ETF World" }), "iwda");
  assert.equal(app.compositionPositionKey({ data: "---", nombre: "Efectivo" }), "efectivo");
  assert.equal(app.compositionPositionKey({ data: "", nombre: "Cuenta remunerada" }), "cuenta remunerada");
});

test("loadInvestmentComposition tolera datos corruptos o con otra forma", () => {
  const app = loadApp();
  app.__store.set(COMPOSITION_KEY, "{{{no es json");
  assert.deepEqual(plain(app.loadInvestmentComposition()), { total: "", groups: {}, positions: {} });
  app.__store.set(COMPOSITION_KEY, JSON.stringify({ groups: { Bolsa: "60", "": "10", Cripto: "" }, positions: { Bolsa: { IWDA: "70", EMIM: "" } }, total: 18000 }));
  const loaded = app.loadInvestmentComposition();
  assert.deepEqual(plain(loaded.groups), { Bolsa: "60/100" }, "los pesos vacíos no se guardan: no cuentan");
  assert.deepEqual(plain(loaded.positions), { Bolsa: { iwda: "70/100" } });
  assert.equal(loaded.total, "18000");
});

test("el peso se guarda como se escribió: 1/9 vuelve como 1/9", () => {
  const app = loadApp();
  app.state.investmentComposition = app.normalizeInvestmentComposition({ groups: { Bolsa: "1/9" } });
  app.writeInvestmentComposition();
  assert.equal(JSON.parse(app.__store.get(COMPOSITION_KEY)).groups.Bolsa, "1/9");
  assert.equal(app.compositionGroupWeightText("BOLSA"), "1/9", "la búsqueda tolera mayúsculas y acentos");
});

test("renombrar una categoría se lleva su peso y el de sus posiciones", () => {
  const app = loadApp();
  app.state.investmentComposition = app.normalizeInvestmentComposition({
    groups: { Bolsa: "60", Fondos: "40" },
    positions: { Bolsa: { iwda: "70" } }
  });
  app.renameInvestmentTypeInComposition(value => (value === "Bolsa" ? "Renta variable" : value));
  assert.deepEqual(plain(app.state.investmentComposition.groups), { "Renta variable": "60/100", Fondos: "40/100" });
  assert.deepEqual(plain(app.state.investmentComposition.positions), { "Renta variable": { iwda: "70/100" } });
  assert.equal(JSON.parse(app.__store.get(COMPOSITION_KEY)).groups["Renta variable"], "60/100");
});

// Importes fijos: un grupo o una posición puede pedir dinero en vez de peso. Lo que se fija
// aquí es que ese dinero suma al objetivo y desaparece de los porcentajes, ni en el objetivo
// ni en el peso de ahora, que es justo lo que hace que poner uno no mueva a los demás.
const fixedEntry = (key, amount, current) => ({ key, label: key, weight: null, fixed: amount, current });

test("un importe fijo suma al objetivo y no entra en el reparto por pesos", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({
    entries: [entry("ETFs", 55, 1100), entry("Fondos RV", 25, 880), entry("Fondos Mixtos", 20, 1000), fixedEntry("Metal", 8000, 9200)],
    total: "12000"
  });
  assert.equal(plan.shared, 12000, "los pesos reparten lo que se escribe arriba");
  assert.equal(plan.fixedTotal, 8000);
  assert.equal(plan.total, 20000, "el objetivo total es el reparto más los fijos");
  assert.equal(plan.rows[0].target, 6600, "el 55 % de 12.000, sin contar el fijo");
  assert.equal(plan.rows[3].target, 8000, "el fijo vale exactamente lo que pide");
  assert.equal(plan.rows[3].share, 0, "un fijo no tiene peso");
  assert.equal(plan.rows[3].currentShare, 0);
  assert.equal(plan.rows[3].excess, 1200, "y si tiene de más, sobra igual que un peso");
  assert.ok(Math.abs(plan.rows[0].currentShare - 1100 / 2980) < 1e-12, "el peso de ahora ignora el dinero de los fijos");
});

test("una posición fija sube el objetivo de su grupo y el de la cartera", () => {
  const app = loadApp();
  const grupo = app.computeCompositionPlan({
    entries: [entry("VWCE", 50, 700), entry("SP500", 50, 250), fixedEntry("Bono", 1000, 400)],
    total: "6600"
  });
  assert.equal(grupo.total, 7600, "6.600 repartidos más los 1.000 del bono");
  assert.equal(grupo.rows[0].target, 3300);
  assert.equal(grupo.rows[2].missing, 600);

  // Vista desde la cartera: el fijo de dentro viaja como `extra` de la fila del grupo.
  const cartera = app.computeCompositionPlan({
    entries: [
      { key: "ETFs", label: "ETFs", weight: 55, extra: 1000, currentExtra: 400, current: 1500 },
      entry("Fondos RV", 25, 880),
      entry("Fondos Mixtos", 20, 1000)
    ],
    total: "12000"
  });
  assert.equal(cartera.rows[0].base, 6600, "por peso le tocan 6.600");
  assert.equal(cartera.rows[0].target, 7600, "y su objetivo son 6.600 más el fijo de dentro");
  assert.equal(cartera.total, 13000, "que también sube el objetivo de la cartera");
  assert.ok(Math.abs(cartera.rows[0].currentShare - 1100 / 2980) < 1e-12, "el dinero del fijo no cuenta para el peso");
});

test("una composición de solo fijos no reparte nada", () => {
  const app = loadApp();
  const plan = app.computeCompositionPlan({
    entries: [fixedEntry("Metal", 8000, 9200), fixedEntry("Liquidez", 2000, 1200)],
    total: ""
  });
  assert.equal(plan.shared, 0);
  assert.equal(plan.total, 10000, "el objetivo es la suma de los fijos");
  assert.equal(plan.missingTotal, 800);
  assert.equal(plan.excessTotal, 1200);
  assert.equal(plan.weightsWarning, false, "sin pesos no hay reparto que avisar");
});

test("el importe fijo se guarda con el euro delante y no se confunde con un peso", () => {
  const app = loadApp();
  assert.equal(app.parseCompositionWeight("€1000"), null, "un fijo no es un peso");
  assert.equal(app.compositionFixedAmount("€1000"), 1000);
  assert.equal(app.compositionFixedAmount("€1.234,50"), 1234.5, "acepta lo que uno escribiría a mano");
  assert.equal(app.compositionFixedAmount("60/100"), null, "un peso no tiene importe");
  assert.ok(Number.isNaN(app.compositionFixedAmount("€abc")));

  app.state.investmentComposition = app.normalizeInvestmentComposition({
    groups: { Metal: "€8000", Bolsa: "60" },
    positions: { Bolsa: { bono: "€1000", iwda: "1/3" } }
  });
  app.writeInvestmentComposition();
  const guardado = JSON.parse(app.__store.get(COMPOSITION_KEY));
  assert.deepEqual(plain(guardado.groups), { Metal: "€8000", Bolsa: "60/100" });
  assert.deepEqual(plain(guardado.positions), { Bolsa: { bono: "€1000", iwda: "1/3" } });
});
