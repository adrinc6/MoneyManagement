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

// La descripción de una inversión no es texto libre: es la cartera a la que va el dinero,
// y una errata creaba una cartera fantasma. Con Tipo = Inversión se elige de una lista
// cerrada; con cualquier otro tipo sigue siendo el input de siempre.
function descriptionDom(app, type, { descripcion = "Compra semanal", cartera = "Cartera Pop" } = {}) {
  const shown = new Map();
  const field = name => ({
    classList: {
      toggle: (_cls, enabled) => shown.set(name, !enabled),
      add: () => shown.set(name, false)
    }
  });
  const freeField = field("free");
  const investmentField = field("investment");
  const typeInput = { value: type };
  const descriptionInput = { value: descripcion, required: false };
  const descriptionSelect = { value: cartera, required: false };
  const root = {
    querySelectorAll: selector => selector === ".free-description-field" ? [freeField]
      : selector === ".investment-description-field" ? [investmentField]
        : selector === ".free-description-field, .investment-description-field"
          ? [freeField, investmentField]
          : []
  };
  app.document.getElementById = id => ({
    formType: typeInput,
    formConcept: { value: "Vivienda", required: true },
    formDescription: descriptionInput,
    formDescriptionSelect: descriptionSelect,
    formAmount: { value: "-100" },
    movementForm: root
  }[id] || null);
  app.document.querySelectorAll = () => [];
  return { shown, typeInput, descriptionInput, descriptionSelect, root };
}

test("con Tipo = Inversión se muestra la lista de carteras y se esconde el texto libre", () => {
  const app = loadApp();
  const dom = descriptionDom(app, "Inversión");

  app.toggleInvestmentDescriptionFields(dom.root, true);

  assert.equal(dom.shown.get("investment"), true);
  assert.equal(dom.shown.get("free"), false);
});

test("con cualquier otro tipo manda el input de texto libre", () => {
  const app = loadApp();
  const dom = descriptionDom(app, "Gasto");

  app.toggleInvestmentDescriptionFields(dom.root, false);

  assert.equal(dom.shown.get("investment"), false);
  assert.equal(dom.shown.get("free"), true);
});

test("la descripción del movimiento sale del control visible en cada tipo", () => {
  const app = loadApp();
  descriptionDom(app, "Inversión");
  assert.equal(app.movementFromFormBase().descripcion, "Cartera Pop");

  const otra = loadApp();
  descriptionDom(otra, "Gasto");
  assert.equal(otra.movementFromFormBase().descripcion, "Compra semanal");
});

// El bug: syncRegisterMode corre al final de syncRegistrarMode y barría todos los
// .movement-only, así que dejaba visibles los dos campos "Descripción" a la vez. El
// criterio válido tiene que poder reaplicarse encima de ese barrido.
test("la resincronización del modo periódico no puede mostrar las dos descripciones", () => {
  const app = loadApp();
  const dom = descriptionDom(app, "Inversión");
  dom.shown.set("free", true); // Lo que deja el barrido de movement-only.
  dom.shown.set("investment", true);

  app.syncRegistrarDescriptionFields();

  assert.equal(dom.shown.get("free"), false);
  assert.equal(dom.shown.get("investment"), true);
  assert.equal(dom.descriptionInput.required, false);
  assert.equal(dom.descriptionSelect.required, true);
});

test("en transferencia no se muestra ninguna descripción", () => {
  const app = loadApp();
  const dom = descriptionDom(app, "Transferencia");
  dom.shown.set("free", true);
  dom.shown.set("investment", true);

  app.syncRegistrarDescriptionFields();

  assert.equal(dom.shown.get("free"), false);
  assert.equal(dom.shown.get("investment"), false);
  assert.equal(dom.descriptionInput.required, false);
  assert.equal(dom.descriptionSelect.required, false);
});
