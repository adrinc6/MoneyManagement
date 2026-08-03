import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const app = loadApp();

test("parseNumber entiende formatos ES e internacionales", () => {
  assert.equal(app.parseNumber(1234.56), 1234.56);
  assert.equal(app.parseNumber("10,50"), 10.5);
  assert.equal(app.parseNumber("1.000,00"), 1000);
  assert.equal(app.parseNumber("1,000.00"), 1000);
  assert.equal(app.parseNumber("-42,5"), -42.5);
});

test("roundMoney redondea a 2 decimales y nunca devuelve NaN", () => {
  assert.equal(app.roundMoney(10.555), 10.56);
  assert.equal(app.roundMoney("10,555"), 10.56);
  assert.equal(app.roundMoney(0.1 + 0.2), 0.3);
});

test("round2 y safeNumber", () => {
  assert.equal(app.round2(2.005), 2);
  assert.equal(app.round2(2.006), 2.01);
  assert.equal(app.safeNumber(NaN), 0);
  assert.equal(app.safeNumber(Infinity), 0);
  assert.equal(app.safeNumber(7), 7);
});

test("normalizeType y prettyType", () => {
  assert.equal(app.normalizeType("  Inversión "), "inversion");
  assert.equal(app.normalizeType("GASTO"), "gasto");
  assert.equal(app.prettyType("inversion"), "Inversión");
  assert.equal(app.prettyType("transferencia"), "Transferencia");
  assert.equal(app.prettyType("Gasto"), "Gasto");
});

test("clasificadores de movimiento", () => {
  assert.equal(app.isIncome({ tipo: "Ingreso" }), true);
  assert.equal(app.isIncome({ tipo: "Gasto" }), false);
  assert.equal(app.isInvestment({ tipo: "Inversión" }), true);
  assert.equal(app.isTransfer({ tipo: "Transferencia" }), true);
  assert.equal(app.isMonthlyExpense({ tipo: "Gasto" }), true);
  assert.equal(app.isMonthlyExpense({ tipo: "Ingreso" }), false);
});

test("sum y unique", () => {
  assert.equal(app.sum([1, 2, "3", null, undefined]), 6);
  assert.deepEqual(Array.from(app.unique(["a", "a", "", null, "b"])), ["a", "b"]);
});

test("monthKey y formatDate", () => {
  const d = new Date(2026, 6, 12); // julio
  assert.equal(app.monthKey(d), "2026-07");
  assert.equal(app.formatDate(d), "2026-07-12");
  assert.equal(app.monthKey(null), "");
});

test("parseDate ida y vuelta", () => {
  const d = app.parseDate("2026-07-12");
  assert.equal(app.formatDate(d), "2026-07-12");
  assert.equal(app.parseDate("12/07/2026") instanceof Date, true);
  assert.equal(app.parseDate(""), null);
});

test("escapeHtml y escapeAttr evitan inyección", () => {
  assert.equal(app.escapeHtml("<b>&\"'"), "&lt;b&gt;&amp;&quot;&#039;");
  assert.equal(app.escapeAttr("a`b"), "a&#096;b");
  assert.equal(app.escapeHtml(null), "");
});

test("plural", () => {
  assert.equal(app.plural(1, "uno", "varios"), "uno");
  assert.equal(app.plural(2, "uno", "varios"), "varios");
  assert.equal(app.plural(0, "uno", "varios"), "varios");
});

test("opLabel usa el mapa único y cae a la propia acción", () => {
  assert.equal(app.opLabel("addMovement"), "Movimiento");
  assert.equal(app.opLabel("transferBank"), "Transferencia");
  assert.equal(app.opLabel("accionDesconocida"), "accionDesconocida");
});

test("buildUndo genera la inversa de un alta de movimiento", () => {
  const undo = app.buildUndo({
    action: "addMovement",
    account: "Banco",
    sheetName: "Control Finanzas",
    movement: { sid: "mov_1", fecha: "2026-07-12", tipo: "Gasto", concepto: "Comida", descripcion: "x", importe: -10 }
  });
  assert.ok(undo);
  assert.equal(undo.inverse.action, "deleteMovement");
  assert.equal(undo.inverse.sheetName, "Control Finanzas");
});

test("buildUndo invierte una transferencia y descarta lo no reversible", () => {
  const undo = app.buildUndo({ action: "transferBank", from: "A", to: "B", amount: 50 });
  assert.equal(undo.inverse.from, "B");
  assert.equal(undo.inverse.to, "A");
  assert.equal(undo.inverse.amount, 50);
  assert.equal(app.buildUndo({ action: "saveBanks" }), null);
  assert.equal(app.buildUndo({ action: "renameAccount" }), null);
});

test("la confirmación automática tiene un límite de un minuto", () => {
  assert.equal(app.OP_CONFIRM_TIMEOUT_MS, 60000);
});

test("isOpActionable respeta el backoff y descarta las operaciones detenidas", () => {
  const now = 1_000_000;
  assert.equal(app.isOpActionable({ status: "queued" }, now), true);
  assert.equal(app.isOpActionable({ status: "retry", nextAttemptAt: now + 5000 }, now), false);
  assert.equal(app.isOpActionable({ status: "retry", nextAttemptAt: now - 1 }, now), true);
  assert.equal(app.isOpActionable({ status: "error" }, now), false);
  assert.equal(app.isOpActionable({ status: "done" }, now), false);
  assert.equal(app.isOpActionable(null, now), false);
});

test("failQueuedOp detiene la operación sin reenviarla automáticamente", () => {
  app.writeOpQueue([{ id: "op-1", status: "sending", payload: { action: "addTransfersBatch" } }]);

  app.failQueuedOp("op-1", "El envío tardó demasiado");
  let op = app.readOpQueue()[0];
  assert.equal(op.status, "error");
  assert.equal(op.attempts, 1);
  assert.equal(op.error, "El envío tardó demasiado");
  assert.equal(op.nextAttemptAt, 0);
  assert.equal(app.isOpActionable(op), false);

  app.writeOpQueue([]);
});

test("fetchDownloadData no reinicia una descarga automáticamente", async () => {
  const original = app.fetchAppsScriptData;
  try {
    let calls = 0;
    app.fetchAppsScriptData = async () => {
      calls++;
      throw new Error("Apps Script no respondió a tiempo");
    };
    await assert.rejects(
      () => app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base" }),
      /no respondió a tiempo/
    );
    assert.equal(calls, 1, "no reinicia una descarga completa automáticamente");
  } finally {
    app.fetchAppsScriptData = original;
  }
});

test("fetchDownloadData ignora cualquier solicitud de reintento", async () => {
  const original = app.fetchAppsScriptData;
  try {
    let calls = 0;
    app.fetchAppsScriptData = async () => {
      calls++;
      throw new Error("Apps Script no respondió a tiempo");
    };
    await assert.rejects(
      () => app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base", maxAttempts: 2 }),
      /no respondió a tiempo/
    );
    assert.equal(calls, 1, "ni siquiera una petición que lo pida reinicia la descarga");
  } finally {
    app.fetchAppsScriptData = original;
  }
});

test("las descargas esperan hasta cinco minutos y medio antes de declarar timeout", async () => {
  const original = app.fetchAppsScriptData;
  try {
    app.fetchAppsScriptData = async options => ({ ok: true, timeoutMs: options.timeoutMs });
    const payload = await app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base" });
    assert.equal(payload.timeoutMs, 330000);
  } finally {
    app.fetchAppsScriptData = original;
  }
});

test("la descarga inicial puede solicitar una espera sin timeout", async () => {
  const original = app.fetchAppsScriptData;
  try {
    app.fetchAppsScriptData = async options => ({ ok: true, timeoutMs: options.timeoutMs });
    const payload = await app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base", timeoutMs: null });
    assert.equal(payload.timeoutMs, null);
  } finally {
    app.fetchAppsScriptData = original;
  }
});

test("la URL de Apps Script conserva sus parámetros al añadir la consulta", () => {
  try {
    app.state.config.scriptUrl = "https://script.google.com/macros/s/id/exec?origen=movil";
    const url = app.appsScriptGetUrl(new URLSearchParams({ action: "downloadCoreData", callback: "cb" }));
    assert.equal(url, "https://script.google.com/macros/s/id/exec?origen=movil&action=downloadCoreData&callback=cb");
    app.state.config.scriptUrl = "https://script.google.com/macros/s/id/dev";
    assert.throws(() => app.assertAppsScriptDeploymentUrl(), /termina en \/dev/);
  } finally {
    app.state.config.scriptUrl = "";
  }
});

test("fetchDownloadData no reintenta un payload con ok:false", async () => {
  const original = app.fetchAppsScriptData;
  try {
    let calls = 0;
    app.fetchAppsScriptData = async () => {
      calls++;
      return { ok: false, error: "Invalid app token" };
    };
    const payload = await app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base" });
    assert.equal(calls, 1, "un error de negocio se devuelve tal cual, sin reintentos");
    assert.equal(payload.ok, false);
    assert.throws(() => app.assertPayloadOk(payload), /Invalid app token/);
  } finally {
    app.fetchAppsScriptData = original;
  }
});

test("recurringTransferOps manda una petición por fecha, no un lote", () => {
  const past = new Date(); past.setDate(past.getDate() - 10);
  const future = new Date(); future.setDate(future.getDate() + 10);
  const transfers = [
    app.normalizeTransaction({ sid: "mov_a", fecha: app.formatDate(past), tipo: "Transferencia", concepto: "Transferencia", importe: 25 }),
    app.normalizeTransaction({ sid: "mov_b", fecha: app.formatDate(future), tipo: "Transferencia", concepto: "Transferencia", importe: 25 })
  ];
  const ops = app.recurringTransferOps(transfers, {
    from: "Banco A", to: "Banco B", amount: 25,
    futureMovementSheet: "Movimientos futuros", bankSheet: "Bancos"
  });

  assert.equal(ops.length, 2, "una operación por fecha");
  assert.equal(ops[0].action, "transferBank");
  assert.equal(ops[0].bankSheet, "Bancos");
  assert.equal(ops[0].from, "Banco A");
  assert.equal(ops[0].to, "Banco B");
  assert.equal(ops[0].amount, 25);
  assert.ok(ops[0].transferSid, "lleva identificador para que el reintento no mueva el dinero dos veces");
  assert.equal(ops[1].action, "addFutureMovement");
  assert.equal(ops[1].sheetName, "Movimientos futuros");
  // CUENTA va vacía a propósito: esa columna suele tener un desplegable que rechaza
  // "Banco A → Banco B" y hacía fallar la operación para siempre. El par de cuentas
  // viaja en DESCRIPCION, de donde lo leen tanto la app como el backend.
  assert.equal(ops[1].account, "");
  assert.equal(ops[1].movement.cuenta, "");
  assert.equal(ops[1].movement.descripcion, "Banco A → Banco B");
  assert.equal(ops[1].movement.sid, "mov_b", "conserva el sid para que el reintento no duplique");
  assert.equal(ops[1].movement.importe, 25);
  assert.ok(!ops.some(op => op.action === "addTransfersBatch"), "ya no se usa el lote");
});

test("recurringMovementOps separa realizados y futuros por acción", () => {
  const past = new Date(); past.setDate(past.getDate() - 3);
  const future = new Date(); future.setDate(future.getDate() + 3);
  const movements = [
    app.normalizeTransaction({ sid: "mov_1", fecha: app.formatDate(past), tipo: "Gasto", concepto: "Comida", importe: -12 }),
    app.normalizeTransaction({ sid: "mov_2", fecha: app.formatDate(future), tipo: "Gasto", concepto: "Comida", importe: -12 })
  ];
  const ops = app.recurringMovementOps(movements, {
    account: "Banco A", movementSheet: "Control Finanzas",
    futureMovementSheet: "Movimientos futuros", bankSheet: "Bancos"
  });

  assert.equal(ops.length, 2);
  assert.equal(ops[0].action, "addMovement");
  assert.equal(ops[0].sheetName, "Control Finanzas");
  assert.equal(ops[0].account, "Banco A");
  assert.equal(ops[0].movement.cuenta, "Banco A");
  assert.equal(ops[1].action, "addFutureMovement");
  assert.equal(ops[1].sheetName, "Movimientos futuros");
  assert.equal(ops[1].movement.sid, "mov_2");
});

test("groupPendingOps agrupa un lote en una sola fila con su progreso", () => {
  const queue = [
    { id: "a", batchId: "b1", batchLabel: "Transferencias periódicas", batchIndex: 0, batchSize: 4, status: "sending", payload: { action: "transferBank" } },
    { id: "b", batchId: "b1", batchLabel: "Transferencias periódicas", batchIndex: 1, batchSize: 4, status: "queued", payload: { action: "transferBank" } },
    { id: "c", status: "queued", payload: { action: "saveBanks" } }
  ];
  const groups = app.groupPendingOps(queue);
  assert.equal(groups.length, 2, "el lote colapsa a una fila y la suelta va aparte");
  assert.equal(groups[0].retryId, "b1", "reintentar actúa sobre el lote entero");
  assert.equal(groups[0].ops.length, 2);
  assert.match(app.describePendingGroup(groups[0]).text, /3 de 4/, "2 ya enviadas de 4");
  assert.equal(groups[1].label, "Guardar cuentas");
});

// Hubo dos colas de escritura en paralelo: la de operaciones y una "caché de
// pendientes" que reenviaba saveInvestments/saveBanks/saveInvestmentGoals por su
// cuenta, con un clientOpId nuevo, así que la deduplicación del backend no la
// protegía y podía reescribir en Sheets una instantánea más antigua. Solo debe
// quedar una.
test("una operación pendiente se registra en la cola y en ningún otro sitio", () => {
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    app.state.banks = [{ cuenta: "Santander", dinero: 1000 }];
    app.writeOpQueue([]);
    const clavesAntes = new Set(app.__store.keys());

    app.queueOp({ action: "saveBanks", bankSheet: "Bancos", banks: app.state.banks });

    const cola = app.readOpQueue();
    assert.equal(cola.length, 1, "la operación queda en la cola");
    assert.equal(cola[0].payload.action, "saveBanks");

    const clavesNuevas = [...app.__store.keys()].filter(k => !clavesAntes.has(k));
    const colasDeEnvio = clavesNuevas.filter(k => k !== app.OP_QUEUE_KEY && /pending|queue|cola/i.test(k));
    assert.deepEqual(colasDeEnvio, [], `ninguna segunda cola de envío: ${clavesNuevas.join(", ")}`);
  } finally {
    app.writeOpQueue([]);
    app.state.config.scriptUrl = "";
    app.state.banks = [];
  }
});

test("runOpQueue espera confirmación antes de enviar la siguiente operación", async () => {
  const originalFire = app.fireAppsScript;
  const originalCheck = app.fetchAppsScriptData;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    let inFlight = 0;
    let maxInFlight = 0;
    const sent = [];
    app.fireAppsScript = async payload => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => globalThis.setTimeout(resolve, 0));
      sent.push(payload.action);
      inFlight--;
      return payload;
    };
    app.fetchAppsScriptData = async () => ({ ok: true, completed: false, pending: true });

    app.writeOpQueue([
      { id: "op-a", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "transferBank", clientOpId: "c1" } },
      { id: "op-b", status: "error", attempts: 8, nextAttemptAt: 0, error: "Load failed", payload: { action: "transferBank", clientOpId: "c2" } },
      { id: "op-c", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "addFutureMovement", clientOpId: "c3" } }
    ]);

    await app.runOpQueue();

    assert.equal(maxInFlight, 1, "nunca hay dos peticiones a la vez");
    assert.deepEqual(sent, ["transferBank"], "no envía la siguiente hasta confirmar la anterior");
    assert.equal(app.readOpQueue().find(op => op.id === "op-b").status, "error", "la detenida sigue en error y no bloquea");
  } finally {
    app.fireAppsScript = originalFire;
    app.fetchAppsScriptData = originalCheck;
    app.writeOpQueue([]);
    app.state.config.scriptUrl = "";
  }
});

test("fireAppsScript usa sendBeacon antes de fetch y no espera la respuesta", async () => {
  const originalFetch = app.fetch;
  const originalBlob = app.Blob;
  const originalBeacon = app.navigator.sendBeacon;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    app.Blob = class { constructor(parts) { this.parts = parts; } };
    let fetchCalls = 0;
    app.fetch = async () => {
      fetchCalls++;
      throw new TypeError("Load failed");
    };
    const beacons = [];
    app.navigator.sendBeacon = (url, blob) => { beacons.push({ url, blob }); return true; };

    const payload = await app.fireAppsScript({ action: "transferBank", from: "A", to: "B", amount: 5 });

    assert.equal(fetchCalls, 0);
    assert.equal(beacons.length, 1, "Beacon es la vía de envío principal");
    assert.equal(beacons[0].url, "https://example.test/exec");
    assert.ok(payload.clientOpId, "devuelve el payload con su clientOpId para poder confirmarlo");
    assert.match(String(beacons[0].blob.parts[0]), /transferBank/);
  } finally {
    app.fetch = originalFetch;
    app.Blob = originalBlob;
    app.navigator.sendBeacon = originalBeacon;
    app.state.config.scriptUrl = "";
  }
});

test("fireAppsScript inicia fetch sin Beacon sin bloquear la confirmación", async () => {
  const originalFetch = app.fetch;
  const originalBeacon = app.navigator.sendBeacon;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    app.fetch = async () => { throw new TypeError("Load failed"); };
    app.navigator.sendBeacon = undefined;
    const payload = await app.fireAppsScript({ action: "transferBank" });
    assert.ok(payload.clientOpId);
  } finally {
    app.fetch = originalFetch;
    app.navigator.sendBeacon = originalBeacon;
    app.state.config.scriptUrl = "";
  }
});
