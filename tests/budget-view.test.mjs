// La vista de presupuesto por categoría: qué se pinta y, sobre todo, qué NO cuenta.
// Se sustituye el DOM por elementos que guardan su innerHTML para poder mirar el HTML
// que sale de verdad, en vez de dar por hecho que el render hace lo que dice.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

function conDom(app) {
  const nodes = new Map();
  const nodo = () => ({
    innerHTML: "",
    textContent: "",
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    focus() {},
    showModal() {},
    close() {}
  });
  ["expenseBudgetList", "monthSituationTable", "monthSituationBars", "budgetsFields", "budgetsDialog"]
    .forEach(id => nodes.set(id, nodo()));
  app.document.getElementById = id => nodes.get(id) || null;
  app.document.querySelector = () => nodo();
  app.document.querySelectorAll = () => [];
  return nodes;
}

function movimiento(app, fecha, tipo, concepto, importe) {
  return app.normalizeTransaction({ fecha, tipo, concepto, importe });
}

function escenario() {
  const app = loadApp();
  const nodes = conDom(app);
  app.state.budgets = { "Vivienda": 550, "Alimentación": 330, "Ocio y social": 200 };
  app.state.transactions = [
    movimiento(app, "2026-08-02", "Gasto", "Piso", "-600"),
    movimiento(app, "2026-08-03", "Gasto", "Supermercado", "-120"),
    movimiento(app, "2026-08-04", "Gasto", "Comida", "-30"),
    // Una nómina guardada con CONCEPTO="Otros": no puede aparecer como gasto.
    movimiento(app, "2026-08-05", "Ingreso", "Otros", "1800"),
    // Entradas de dinero que antes entraban como gasto por descarte.
    movimiento(app, "2026-08-06", "Efectivo", "Otros", "50"),
    movimiento(app, "2026-08-07", "Retiro", "Otros", "30")
  ];
  app.state.summaryModes.situation = "gastos";
  app.state.summaryModes.expenseView = "presupuesto";
  return { app, nodes };
}

test("la lista de presupuesto usa los nombres nuevos y respeta el límite", () => {
  const { app, nodes } = escenario();
  app.renderExpenseBudgetList({ month: "2026-08" });
  const html = nodes.get("expenseBudgetList").innerHTML;

  assert.match(html, /Vivienda/);
  assert.match(html, /Alimentación/);
  // Los nombres antiguos ya no existen en la interfaz.
  assert.doesNotMatch(html, /Supermercado|Piso|Comida/);
  // Vivienda: 600 gastados sobre 550 de límite -> fila en rojo.
  assert.match(html, /budget-row over/);
  assert.match(html, /Excedido/);
  // Alimentación: 150 sobre 330 -> fila en verde.
  assert.match(html, /budget-row under/);
  assert.match(html, /Quedan/);
  // Un solo botón para editarlas todas.
  assert.equal((html.match(/id="editBudgetsBtn"/g) || []).length, 1);
});

test("las entradas de dinero no aparecen en el presupuesto", () => {
  const { app } = escenario();
  const filas = app.budgetRows("2026-08");
  const otros = filas.find(row => row.label === "Otros");

  // 1.800 de nómina + 50 de efectivo + 30 de retiro: nada de eso es gasto.
  assert.equal(otros, undefined, "Otros no debería tener gasto este mes");
  assert.equal(filas.find(row => row.label === "Vivienda").spent, 600);
  // Supermercado 120 + Comida 30 caen ambos en Alimentación.
  assert.equal(filas.find(row => row.label === "Alimentación").spent, 150);
});

test("una categoría con presupuesto y sin gasto sigue viéndose", () => {
  const { app } = escenario();
  const ocio = app.budgetRows("2026-08").find(row => row.label === "Ocio y social");

  assert.equal(ocio.spent, 0);
  assert.equal(ocio.budget, 200);
});

test("sin gasto ni presupuesto se avisa en vez de dejar el hueco vacío", () => {
  const app = loadApp();
  const nodes = conDom(app);
  app.state.budgets = {};
  app.state.transactions = [];
  app.renderExpenseBudgetList({ month: "2026-08" });

  assert.match(nodes.get("expenseBudgetList").innerHTML, /Sin gastos ni presupuesto/);
});

test("el editor genera un campo por categoría con su importe", () => {
  const { app, nodes } = escenario();
  app.openBudgetsDialog();
  const html = nodes.get("budgetsFields").innerHTML;

  assert.match(html, /data-budget-input="Vivienda"/);
  assert.match(html, /value="550"/);
  // La inversión no es una categoría de gasto: no se presupuesta.
  assert.doesNotMatch(html, /data-budget-input="Inversión"/);
});

// Abrir el editor con todo vacío y sin ninguna pista de por dónde empezar no ayuda: se
// proponen cifras calculadas sobre el gasto real. En cuanto hay algo guardado, manda eso.
test("el editor propone cifras solo mientras no haya presupuesto guardado", () => {
  const app = loadApp();
  const nodes = conDom(app);

  app.state.budgets = {};
  app.openBudgetsDialog();
  assert.match(nodes.get("budgetsFields").innerHTML, /data-budget-input="Vivienda" value="580"/);

  app.state.budgets = { "Vivienda": 500 };
  app.openBudgetsDialog();
  const html = nodes.get("budgetsFields").innerHTML;
  assert.match(html, /data-budget-input="Vivienda" value="500"/);
  // Lo que el usuario no puso se queda vacío, no se rellena con la sugerencia.
  assert.match(html, /data-budget-input="Otros" value=""/);
});

// Verde mientras el gasto cabe en el presupuesto, rojo en cuanto se pasa. Sin presupuesto
// no hay nada que comparar, así que la fila se queda neutra.
test("cada fila se colorea según si se ha pasado del presupuesto", () => {
  const app = loadApp();
  const nodes = conDom(app);
  app.state.budgets = { "Vivienda": 550, "Alimentación": 330 };
  app.state.transactions = [
    movimiento(app, "2026-08-02", "Gasto", "Piso", "-600"),        // se pasa
    movimiento(app, "2026-08-03", "Gasto", "Supermercado", "-100"), // dentro
    movimiento(app, "2026-08-04", "Gasto", "Otros", "-40")          // sin presupuesto
  ];
  app.renderExpenseBudgetList({ month: "2026-08" });
  const html = nodes.get("expenseBudgetList").innerHTML;

  assert.match(html, /budget-row over[\s\S]*?Vivienda/);
  assert.match(html, /budget-row under[\s\S]*?Alimentación/);
  assert.match(html, /budget-row none[\s\S]*?Otros/);
  assert.match(html, /Sin presupuesto/);
});

test("una sola columna de filas y un único botón de edición", () => {
  const app = loadApp();
  const nodes = conDom(app);
  app.state.budgets = { "Vivienda": 550 };
  app.state.transactions = [movimiento(app, "2026-08-02", "Gasto", "Piso", "-100")];
  app.renderExpenseBudgetList({ month: "2026-08" });
  const html = nodes.get("expenseBudgetList").innerHTML;

  // El diseño anterior eran tarjetas en dos columnas con un botón "Editar" por tarjeta.
  assert.doesNotMatch(html, /budget-cards|monthly-goal-card|data-edit-budget/);
  assert.equal((html.match(/id="editBudgetsBtn"/g) || []).length, 1);
});

test("las categorías deben sumar exactamente el objetivo mensual de gastos", () => {
  const app = loadApp();
  const budgets = { "Vivienda": 600, "Alimentación": 400 };

  assert.equal(app.budgetGoalMismatch(budgets, 1000), null);
  const mismatch = app.budgetGoalMismatch(budgets, 950);
  assert.deepEqual(JSON.parse(JSON.stringify(mismatch)), { total: 1000, goal: 950, difference: 50 });
  assert.match(app.budgetGoalMismatchMessage(mismatch), /categorías suman/);
});

test("el estado vacío permite objetivo y categorías a cero", () => {
  const app = loadApp();
  assert.equal(app.budgetGoalMismatch({}, 0), null);
});

test("el resumen superior indica lo pendiente y bloquea guardar hasta cuadrar", () => {
  const app = loadApp();
  const summary = { innerHTML: "", className: "" };
  const saveButton = { disabled: false };
  const inputs = [
    { value: "600", dataset: { budgetInput: "Vivienda" } },
    { value: "300", dataset: { budgetInput: "Alimentación" } }
  ];
  app.state.investmentGoals.expenseMonthly = 1000;
  app.document.getElementById = id => ({ budgetAllocationSummary: summary, saveBudgetsBtn: saveButton }[id] || null);
  app.document.querySelectorAll = selector => selector === "[data-budget-input]" ? inputs : [];

  app.renderBudgetAllocationStatus();
  assert.match(summary.innerHTML, /Faltan/);
  assert.match(summary.innerHTML, /100(?:\s|\u00a0)*€/);
  assert.equal(saveButton.disabled, true);

  inputs[1].value = "400";
  app.renderBudgetAllocationStatus();
  assert.match(summary.innerHTML, /Todo el objetivo está asignado/);
  assert.equal(saveButton.disabled, false);
});
