import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

function registrarDom(app, type) {
  const hidden = new Set();
  const conceptField = {
    classList: {
      toggle(name, enabled) {
        if (enabled) hidden.add(name);
        else hidden.delete(name);
      }
    }
  };
  const typeInput = { value: type };
  const conceptInput = { value: "Vivienda", required: true };
  app.document.getElementById = id => ({ formType: typeInput, formConcept: conceptInput }[id] || null);
  app.document.querySelectorAll = selector => selector === ".concept-field" ? [conceptField] : [];
  return { hidden, conceptField, typeInput, conceptInput };
}

test("el concepto se oculta, deja de ser obligatorio y se limpia para ingreso e inversión", () => {
  for (const type of ["Ingreso", "Inversión"]) {
    const app = loadApp();
    const dom = registrarDom(app, type);
    app.syncRegistrarConceptField();

    assert.equal(dom.hidden.has("hidden"), true, type);
    assert.equal(dom.conceptInput.required, false, type);
    assert.equal(dom.conceptInput.value, "", type);
  }
});

test("la resincronización del modo periódico no puede volver a mostrar el concepto", () => {
  const app = loadApp();
  const dom = registrarDom(app, "Inversión");
  dom.hidden.delete("hidden"); // Simula que el ajuste de campos periódicos lo ha mostrado.
  app.syncRegistrarConceptField();

  assert.equal(dom.hidden.has("hidden"), true);
});

test("el concepto se conserva y es obligatorio para gasto", () => {
  const app = loadApp();
  const dom = registrarDom(app, "Gasto");
  app.syncRegistrarConceptField();

  assert.equal(dom.hidden.has("hidden"), false);
  assert.equal(dom.conceptInput.required, true);
  assert.equal(dom.conceptInput.value, "Vivienda");
});
