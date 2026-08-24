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

test("las posiciones se aceptan antes de cargar sus categorías", () => {
  const previousCategories = app.state.categories;
  const previousTotals = app.state.investmentTotals;
  const previousInvestments = app.state.investments;
  try {
    app.state.categories = { types: [], concepts: [], investmentTypes: [] };
    app.state.investmentTotals = [];
    app.state.investments = [];
    const position = app.normalizeInvestment({
      divisa: "EUR", data: "TNOW.MI", nombre: "MSCI World Info Tech",
      shortName: "MSCI Wld Tech", tipo: "ETFs", cantidad: 0.2097,
      valor: 1119.38, total: 234.73, valorAnterior: 1128.34, variacion: -0.79
    });
    assert.ok(position, "ETFs no depende de que categories se haya aplicado antes");
    assert.equal(position.cantidad, 0.2097);
    assert.equal(app.normalizeInvestment({ data: "EUR-USD", nombre: "EUR to USD", tipo: "---", total: 1.1551 }), null,
      "la fila auxiliar de divisa sigue excluida");
  } finally {
    app.state.categories = previousCategories;
    app.state.investmentTotals = previousTotals;
    app.state.investments = previousInvestments;
  }
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

test("el backoff crece pero queda acotado, y siempre con jitter", () => {
  // Sin jitter, varias peticiones que fallan a la vez vuelven a caer juntas sobre la
  // misma ejecución de Google.
  const alto = app.retryDelayMs(1, () => 1);
  const bajo = app.retryDelayMs(1, () => 0);
  assert.ok(alto > bajo, "el mismo intento no puede dar siempre la misma espera");

  for (let attempt = 1; attempt <= 20; attempt++) {
    const delay = app.retryDelayMs(attempt, () => 1);
    assert.ok(delay >= 500, `el intento ${attempt} espera al menos el mínimo`);
    assert.ok(delay <= app.RETRY_MAX_DELAY_MS * 1.3, `el intento ${attempt} no se dispara`);
  }
  assert.ok(app.retryDelayMs(4, () => 0.5) > app.retryDelayMs(1, () => 0.5), "crece con los intentos");
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

test("la URL de Apps Script reemplaza parámetros antiguos y elimina fragmentos", () => {
  try {
    app.state.config.scriptUrl = "https://script.google.com/macros/s/id/exec?origen=movil&action=antigua#fragmento";
    const url = app.appsScriptGetUrl(new URLSearchParams({ action: "downloadCoreData" }));
    assert.equal(url, "https://script.google.com/macros/s/id/exec?origen=movil&action=downloadCoreData");
    app.state.config.scriptUrl = "https://script.google.com/macros/s/id/dev";
    assert.throws(() => app.assertAppsScriptDeploymentUrl(), /termina en \/dev/);
    app.state.config.scriptUrl = "https://script.google.com/macros/s/id/editor";
    assert.throws(() => app.assertAppsScriptDeploymentUrl(), /terminar en \/exec/);
  } finally {
    app.state.config.scriptUrl = "";
  }
});

test("un error de datos no se reintenta y uno de servidor ocupado sí", async () => {
  // La clasificación estaba justo del revés: assertPayloadOk vivía FUERA del bucle, así
  // que un LOCK_TIMEOUT —lo más reintentable que hay— abortaba la actualización entera,
  // mientras que un fallo de transporte sin información reintentaba para siempre.
  const original = app.fetchAppsScriptData;
  try {
    let calls = 0;
    app.fetchAppsScriptData = async () => {
      calls++;
      return { ok: false, error: "Invalid app token", errorCode: "AUTH" };
    };
    await assert.rejects(
      () => app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base", recoverUntilSuccess: true }),
      /token/i
    );
    assert.equal(calls, 1, "un token inválido no mejora repitiendo");

    calls = 0;
    app.fetchAppsScriptData = async () => {
      calls++;
      if (calls < 3) return { ok: false, error: "servidor ocupado", errorCode: "BUSY" };
      return { ok: true, banks: [] };
    };
    const payload = await app.fetchDownloadData({ action: "downloadCoreData" }, { label: "datos base", recoverUntilSuccess: true });
    assert.equal(payload.ok, true);
    assert.equal(calls, 3, "el servidor ocupado sí se reintenta hasta que responde");
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

test("runOpQueue envía de una en una y la respuesta confirma sin sondeo", async () => {
  const originalFire = app.fireAppsScript;
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
      return { payload, result: { ok: true } };
    };

    app.writeOpQueue([
      { id: "op-a", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "transferBank", clientOpId: "c1" } },
      { id: "op-b", status: "error", attempts: 8, nextAttemptAt: 0, error: "Load failed", payload: { action: "transferBank", clientOpId: "c2" } },
      { id: "op-c", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "addFutureMovement", clientOpId: "c3" } }
    ]);

    await app.runOpQueue();

    assert.equal(maxInFlight, 1, "el backend serializa las escrituras: nunca dos a la vez");
    assert.deepEqual(sent, ["transferBank", "addFutureMovement"],
      "confirmadas por la respuesta, la cola avanza sin esperar 5 s por operación");
    assert.equal(app.readOpQueue().find(op => op.id === "op-b").status, "error", "la detenida sigue en error y no bloquea");
    assert.equal(app.readOpQueue().filter(op => op.status !== "error").length, 0, "las enviadas salen de la cola");
  } finally {
    app.fireAppsScript = originalFire;
    app.writeOpQueue([]);
    app.state.config.scriptUrl = "";
  }
});

test("fireAppsScript espera la respuesta del POST y la devuelve", async () => {
  // Antes se mandaba con sendBeacon y la respuesta se tiraba, aunque doPost siempre
  // ha contestado con el resultado completo: había que preguntar por él con
  // checkClientOp cada cinco segundos.
  const originalFetch = app.fetch;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    const requests = [];
    app.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, applied: 1 }) };
    };

    const { payload, result } = await app.fireAppsScript({ action: "transferBank", from: "A", to: "B", amount: 5 });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.keepalive, undefined,
      "sin keepalive: su tope de 64 KiB tumbaba los lotes grandes al instante");
    assert.match(String(requests[0].options.body), /transferBank/);
    assert.ok(payload.clientOpId, "el clientOpId acuñado viaja de vuelta para poder reintentar sin duplicar");
    assert.equal(result.ok, true, "la confirmación llega con la propia escritura");
  } finally {
    app.fetch = originalFetch;
    app.state.config.scriptUrl = "";
  }
});

test("un fallo de red al enviar se distingue de un rechazo del servidor", async () => {
  const originalFetch = app.fetch;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    app.fetch = async () => { throw new TypeError("Load failed"); };
    await assert.rejects(() => app.fireAppsScript({ action: "transferBank" }), error => {
      assert.equal(error.errorCode, "NETWORK");
      return true;
    });

    app.fetch = async () => ({ ok: false, status: 403, text: async () => "" });
    await assert.rejects(() => app.fireAppsScript({ action: "transferBank" }), error => {
      assert.equal(error.errorCode, "CONFIG", "un 403 es el despliegue mal publicado, no un corte");
      assert.equal(error.status, 403);
      return true;
    });
  } finally {
    app.fetch = originalFetch;
    app.state.config.scriptUrl = "";
  }
});

test("las operaciones seguidas viajan en un solo envío por lote", () => {
  // Una recurrencia de 52 fechas eran 52 POST, 52 esperas del script lock y 52
  // ejecuciones de Apps Script: minutos de espera para el usuario.
  const payloads = Array.from({ length: 52 }, (_, n) => ({
    action: "addFutureMovement",
    movement: { sid: `f-${n}`, fecha: "2026-01-01", tipo: "Gasto", concepto: "Cuota", importe: -10 }
  }));

  const chunks = app.chunkOpsForSending(payloads);

  assert.equal(chunks.length, 1, "52 fechas caben en un envío");
  assert.equal(chunks[0].action, "batchOps");
  assert.equal(chunks[0].ops.length, 52);
  assert.ok(chunks[0].clientOpId, "el lote lleva su propio identificador");
  chunks[0].ops.forEach(op => assert.ok(op.clientOpId, "y cada operación conserva el suyo, para deduplicar una a una"));
});

test("un lote demasiado grande se trocea en varios envíos", () => {
  const payloads = Array.from({ length: 250 }, () => ({ action: "addFutureMovement", movement: {} }));
  const chunks = app.chunkOpsForSending(payloads);

  assert.equal(chunks.length, Math.ceil(250 / app.MAX_OPS_PER_BATCH));
  chunks.forEach(chunk => assert.ok(chunk.ops.length <= app.MAX_OPS_PER_BATCH));
  assert.equal(chunks.reduce((total, chunk) => total + chunk.ops.length, 0), 250, "no se pierde ninguna");
});

test("una operación suelta no se envuelve en un lote", () => {
  const chunks = app.chunkOpsForSending([{ action: "transferBank", from: "A", to: "B", amount: 5 }]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].action, "transferBank", "sin envoltorio innecesario");
});

test("un lote declara las secciones de caché de todo lo que lleva dentro", () => {
  const sections = app.queuePayloadSections({
    action: "batchOps",
    ops: [
      { action: "addFutureMovement" },
      { action: "transferBank" }
    ]
  });
  assert.deepEqual(Array.from(sections).sort(), ["banks", "futureTransactions"]);
});

test("una respuesta ilegible se distingue de un corte de red", async () => {
  // Google devuelve una página HTML de error cuando la ejecución no llega a arrancar.
  // Con JSONP esto era indistinguible de un corte y por eso "fallaba y luego funcionaba".
  const originalFetch = app.fetch;
  try {
    app.fetch = async () => ({ ok: true, status: 200, text: async () => "<!DOCTYPE html><title>Error</title>" });
    await assert.rejects(() => app.appsScriptRequest("https://example.test/exec", {}), error => {
      assert.equal(error.errorCode, "MALFORMED");
      return true;
    });
  } finally {
    app.fetch = originalFetch;
  }
});

test("un timeout aborta la petición en vez de dejarla colgando", async () => {
  const originalFetch = app.fetch;
  try {
    let abortedSignal = null;
    app.fetch = (url, options) => new Promise((resolve, reject) => {
      abortedSignal = options.signal;
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
    await assert.rejects(() => app.appsScriptRequest("https://example.test/exec", { timeoutMs: 5 }), error => {
      assert.equal(error.errorCode, "TIMEOUT");
      return true;
    });
    assert.equal(abortedSignal.aborted, true, "la petición se cancela de verdad, no se abandona");
  } finally {
    app.fetch = originalFetch;
  }
});

// Las categorías se redujeron a 6, pero la hoja conserva los nombres antiguos: la
// traducción ocurre al leer, así que nada de lo que ve la app usa ya los viejos.
test("conceptAlias traduce los conceptos antiguos y es idempotente", () => {
  assert.equal(app.conceptAlias("Supermercado"), "Alimentación");
  assert.equal(app.conceptAlias("Comida"), "Alimentación");
  assert.equal(app.conceptAlias("Piso"), "Vivienda");
  assert.equal(app.conceptAlias("Ocio"), "Ocio y social");
  assert.equal(app.conceptAlias("Fiesta"), "Ocio y social");
  assert.equal(app.conceptAlias("Viajes"), "Ocio y social");
  assert.equal(app.conceptAlias("Cuidado personal"), "Personal");
  assert.equal(app.conceptAlias("Deporte"), "Personal");
  assert.equal(app.conceptAlias("Universidad"), "Formación");
  // Idempotente y tolerante a acentos/mayúsculas.
  assert.equal(app.conceptAlias("Alimentación"), "Alimentación");
  assert.equal(app.conceptAlias("SUPERMERCADO"), "Alimentación");
  assert.equal(app.conceptAlias("universidad"), "Formación");
  // Un concepto desconocido pasa tal cual.
  assert.equal(app.conceptAlias("Otros"), "Otros");
});

test("normalizeTransaction traduce el concepto de una fila antigua", () => {
  const t = app.normalizeTransaction({
    fecha: "2024-03-04", tipo: "Gasto", concepto: "Supermercado", importe: "-30,50"
  });
  assert.equal(t.concepto, "Alimentación");
});

// El presupuesto por categoría solo debe contar gasto real. Antes se clasificaba por
// puro descarte, así que un "Efectivo" o un "Retiro" positivo entraba como gasto.
test("las entradas de dinero no cuentan como gasto", () => {
  assert.equal(app.isIncome({ tipo: "Efectivo", amount: 50 }), true);
  assert.equal(app.isMonthlyExpense({ tipo: "Efectivo", amount: 50 }), false);
  assert.equal(app.isMonthlyExpense({ tipo: "Retiro", amount: 30 }), false);
  // Un efectivo negativo sí es gasto.
  assert.equal(app.isIncome({ tipo: "Efectivo", amount: -20 }), false);
  assert.equal(app.isMonthlyExpense({ tipo: "Efectivo", amount: -20 }), true);
});

// En la hoja hay 183 filas de TIPO=Gasto con importe positivo: si el tipo dice que es
// gasto, es gasto, aunque el signo diga otra cosa. Fiarse del signo los excluía.
test("un Gasto cuenta aunque el importe venga en positivo", () => {
  assert.equal(app.isMonthlyExpense({ tipo: "Gasto", amount: 40 }), true);
  assert.equal(app.isMonthlyExpense({ tipo: "Gasto", amount: -40 }), true);
});

// Hay 92 nóminas guardadas con CONCEPTO="Otros": el TIPO es lo que manda.
test("una nómina con concepto Otros no es gasto", () => {
  const t = app.normalizeTransaction({
    fecha: "2024-03-04", tipo: "Ingreso", concepto: "Otros", importe: "1800"
  });
  assert.equal(app.isIncome(t), true);
  assert.equal(app.isMonthlyExpense(t), false);
});
