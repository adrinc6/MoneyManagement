// Regresiones de robustez: los fallos que colgaban la app o perdían cambios en
// silencio. Cada test corresponde a un problema real detectado en la auditoría.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const app = loadApp();

function resetQueue(queue = []) {
  app.localStorage.setItem(app.OP_QUEUE_KEY, JSON.stringify(queue));
}


test("runOpQueue termina aunque una operación no progrese", async () => {
  const previousUrl = app.state.config.scriptUrl;
  const previousSend = app.sendQueuedOp;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    resetQueue([{ id: "op-atascada", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c1" } }]);
    // Peor caso: enviar la operación no cambia nada de su estado.
    app.sendQueuedOp = async () => {};

    // Sin cortacircuitos esto no terminaría nunca.
    await app.runOpQueue();

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.status, "error", "el cortacircuitos la detiene en vez de girar en vacío");
  } finally {
    app.sendQueuedOp = previousSend;
    app.state.config.scriptUrl = previousUrl;
    resetQueue();
  }
});

test("un servidor ocupado se reintenta solo, con espera creciente", async () => {
  const previousFire = app.fireAppsScript;
  try {
    resetQueue([{ id: "op-lock", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c-lock" } }]);
    app.state.config.scriptUrl = "https://example.test/exec";
    app.fireAppsScript = async payload => ({ payload, result: { ok: false, error: "LOCK_TIMEOUT: ocupado", errorCode: "BUSY" } });

    await app.sendQueuedOp("op-lock");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.status, "retry", "un choque de bloqueo es transitorio: se reintenta solo");
    assert.equal(op.attempts, 1);
    assert.ok(op.nextAttemptAt > Date.now(), "y espera antes de volver a intentarlo");
  } finally {
    app.fireAppsScript = previousFire;
    app.state.config.scriptUrl = "";
    resetQueue();
  }
});

test("un fallo de datos detiene la operación con su motivo", async () => {
  const previousFire = app.fireAppsScript;
  try {
    resetQueue([{ id: "op-mala", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c-mala" } }]);
    app.state.config.scriptUrl = "https://example.test/exec";
    app.fireAppsScript = async payload => ({ payload, result: { ok: false, error: "VALIDATION: importe no válido", errorCode: "VALIDATION" } });

    await app.sendQueuedOp("op-mala");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.status, "error", "repetir no lo va a arreglar");
    assert.match(op.error, /no son válidos/, "se enseña el mensaje de la app, no el crudo del servidor");
  } finally {
    app.fireAppsScript = previousFire;
    app.state.config.scriptUrl = "";
    resetQueue();
  }
});

test("downloadMovementPages aborta si el offset no avanza", async () => {
  const previousFetch = app.fetchDownloadData;
  try {
    // Backend defectuoso: dice que hay más páginas pero devuelve siempre el mismo offset.
    app.fetchDownloadData = async () => ({ ok: true, transactions: [{ fecha: "2026-01-01" }], total: 999999, nextOffset: 0, hasMore: true });
    await assert.rejects(
      () => app.downloadMovementPages("realized", "movimientos", {}),
      /no avanza/i
    );
  } finally {
    app.fetchDownloadData = previousFetch;
  }
});

test("downloadMovementPages respeta el tope de páginas", async () => {
  const previousFetch = app.fetchDownloadData;
  let offset = 0;
  try {
    // Backend que avanza pero nunca termina: debe cortar por el tope de páginas.
    app.fetchDownloadData = async () => {
      offset += 1;
      return { ok: true, transactions: [{ fecha: "2026-01-01" }], total: Number.MAX_SAFE_INTEGER, nextOffset: offset, hasMore: true };
    };
    await assert.rejects(
      () => app.downloadMovementPages("realized", "movimientos", {}),
      /demasiadas p/i
    );
    assert.ok(offset <= app.MOVEMENT_MAX_PAGES + 1);
  } finally {
    app.fetchDownloadData = previousFetch;
  }
});

test("downloadMovementPages reanuda desde el offset guardado sin pedir páginas anteriores", async () => {
  const previousFetch = app.fetchDownloadData;
  const offsets = [];
  const progress = [];
  try {
    app.fetchDownloadData = async options => {
      offsets.push(options.offset);
      if (options.offset === 250) {
        return { ok: true, transactions: [{ sid: "nueva-1" }], total: 501, nextOffset: 500, hasMore: true };
      }
      return { ok: true, transactions: [{ sid: "nueva-2" }], total: 501, nextOffset: 501, hasMore: false };
    };

    const rows = await app.downloadMovementPages("realized", "movimientos", {
      startOffset: 250,
      initialRows: [{ sid: "ya-guardada" }],
      onPage: page => progress.push({ nextOffset: page.nextOffset, count: page.rows.length })
    });

    assert.deepEqual(offsets, [250, 500]);
    assert.deepEqual(Array.from(rows, row => row.sid), ["ya-guardada", "nueva-1", "nueva-2"]);
    assert.deepEqual(progress, [{ nextOffset: 500, count: 2 }, { nextOffset: 501, count: 3 }]);
  } finally {
    app.fetchDownloadData = previousFetch;
  }
});

test("una página sin filas válidas no corta las páginas posteriores", async () => {
  const previousFetch = app.fetchDownloadData;
  const offsets = [];
  try {
    app.fetchDownloadData = async options => {
      offsets.push(options.offset);
      if (options.offset === 0) {
        return { ok: true, transactions: [], total: 500, nextOffset: 250, hasMore: true };
      }
      return { ok: true, transactions: [{ sid: "posterior" }], total: 500, nextOffset: 500, hasMore: false };
    };
    const rows = await app.downloadMovementPages("realized", "movimientos", {});
    assert.deepEqual(offsets, [0, 250]);
    assert.deepEqual(Array.from(rows, row => row.sid), ["posterior"]);
  } finally {
    app.fetchDownloadData = previousFetch;
  }
});

test("un fallo repetido reduce solo la página problemática", async () => {
  const previousFetch = app.fetchAppsScriptData;
  const limits = [];
  try {
    app.fetchAppsScriptData = async options => {
      limits.push(options.limit);
      if (limits.length < 4) throw new Error("Apps Script no pudo entregar movimientos reales.");
      return { ok: true, transactions: [{ sid: "leída" }], total: 1, nextOffset: 1, hasMore: false };
    };
    await app.downloadMovementPages("realized", "movimientos", { recoverUntilSuccess: true, timeoutMs: null });
    assert.deepEqual(limits, [1000, 1000, 1000, 500]);
  } finally {
    app.fetchAppsScriptData = previousFetch;
  }
});

test("una descarga inicial recupera solo el bloque que falló, sin timeout ni reinicio global", async () => {
  const previousFetch = app.fetchAppsScriptData;
  let calls = 0;
  try {
    app.fetchAppsScriptData = async () => {
      calls += 1;
      if (calls === 1) throw new Error("Apps Script no pudo entregar movimientos reales (página 6).");
      return { ok: true, transactions: [{ sid: "recuperada" }] };
    };
    const payload = await app.fetchDownloadData(
      { action: "downloadMovementsPage", offset: 1250 },
      { label: "movimientos (página 6)", timeoutMs: null, recoverUntilSuccess: true }
    );
    assert.equal(calls, 2, "solo vuelve a intentar la página en curso");
    assert.equal(payload.transactions[0].sid, "recuperada");
  } finally {
    app.fetchAppsScriptData = previousFetch;
  }
});

test("un error de configuración no queda reintentándose durante la descarga inicial", async () => {
  const previousFetch = app.fetchAppsScriptData;
  let calls = 0;
  try {
    app.fetchAppsScriptData = async () => {
      const error = new Error("AUTH: Invalid app token");
      error.errorCode = "AUTH";
      calls += 1;
      throw error;
    };
    await assert.rejects(
      () => app.fetchDownloadData({}, { timeoutMs: null, recoverUntilSuccess: true }),
      /Invalid app token/
    );
    assert.equal(calls, 1);
  } finally {
    app.fetchAppsScriptData = previousFetch;
  }
});

test("safeSetItem informa del fallo en vez de lanzar", () => {
  const previousSetItem = app.localStorage.setItem;
  try {
    app.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    assert.equal(app.safeSetItem("clave", "valor"), false);
  } finally {
    app.localStorage.setItem = previousSetItem;
  }
  assert.equal(app.safeSetItem("clave", "valor"), true);
});

test("safeSetItem libera diagnósticos y reintenta antes de rendirse", () => {
  const previousSetItem = app.localStorage.setItem;
  let attempts = 0;
  try {
    // Falla la primera vez y funciona tras liberar espacio: el caso que importa,
    // porque la cola de operaciones nunca debe sacrificarse.
    app.localStorage.setItem = (key, value) => {
      attempts += 1;
      if (attempts === 1) throw new Error("QuotaExceededError");
      return previousSetItem(key, value);
    };
    assert.equal(app.safeSetItem(app.OP_QUEUE_KEY, "[]"), true);
    assert.equal(attempts, 2);
  } finally {
    app.localStorage.setItem = previousSetItem;
  }
});

test("una cola corrupta se vacía dejando copia de seguridad", () => {
  app.localStorage.setItem(app.OP_QUEUE_KEY, "{esto no es json");
  const queue = app.readOpQueue();
  assert.deepEqual(queue.length, 0);
  assert.equal(app.localStorage.getItem(`${app.OP_QUEUE_KEY}.corrupt`), "{esto no es json");
  resetQueue();
});

test("refreshData no solapa descargas pero no descarta acciones del usuario", async () => {
  const previousImpl = app.refreshDataImpl;
  try {
    const started = [];
    let releaseFirst;
    const firstDone = new Promise(resolve => { releaseFirst = resolve; });

    app.refreshDataImpl = async options => {
      started.push(options);
      if (started.length === 1) await firstDone;
      return true;
    };

    const background = app.refreshData({ scope: "all", cacheOnly: true });
    // Una segunda petición de fondo se engancha a la que ya está en vuelo.
    const duplicate = app.refreshData({ scope: "all", cacheOnly: true });
    assert.equal(started.length, 1, "las peticiones de fondo equivalentes no se duplican");

    // Una acción del usuario hace un trabajo distinto: debe ejecutarse igualmente.
    const userAction = app.refreshData({ updateInvestments: true });
    assert.equal(started.length, 1, "espera a que termine la que está en vuelo");

    releaseFirst();
    await Promise.all([background, duplicate, userAction]);

    assert.equal(started.length, 2, "la acción del usuario se ejecuta después, no se descarta");
    assert.equal(started[1].updateInvestments, true);
  } finally {
    app.refreshDataImpl = previousImpl;
  }
});

test("refreshData deduplica dos actualizaciones manuales idénticas", async () => {
  const previousImpl = app.refreshDataImpl;
  try {
    let calls = 0;
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    app.refreshDataImpl = async () => {
      calls += 1;
      await pending;
      return true;
    };

    const first = app.refreshData({ force: true, manualRefresh: true, showProgress: true, scope: "movements" });
    const duplicate = app.refreshData({ force: true, manualRefresh: true, showProgress: true, scope: "movements" });

    assert.equal(first, duplicate, "ambas pulsaciones comparten la misma descarga");
    assert.equal(calls, 1, "no se encola una segunda descarga idéntica");
    release();
    await first;
  } finally {
    app.refreshDataImpl = previousImpl;
  }
});

test("un envío interrumpido que ya se aplicó no se reenvía", async () => {
  // Se cerró la app con el POST en vuelo: no sabemos si llegó. Reenviarlo a ciegas
  // duplicaría el movimiento, así que se pregunta antes.
  const previousFetch = app.fetchAppsScriptData;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    resetQueue([{
      id: "op-corte", status: "sending", attempts: 0, nextAttemptAt: 0,
      lastSentAt: Date.now(), payload: { action: "addFutureMovement", clientOpId: "c-corte" }
    }]);
    app.fetchAppsScriptData = async () => ({ ok: true, completed: true });

    await app.reconcileInterruptedOps();

    assert.equal(JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY)).length, 0,
      "ya estaba aplicada: sale de la cola sin reenviarla");
  } finally {
    app.fetchAppsScriptData = previousFetch;
    app.state.config.scriptUrl = "";
    resetQueue();
  }
});

test("un envío interrumpido que no llegó a aplicarse vuelve a la cola", async () => {
  const previousFetch = app.fetchAppsScriptData;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    resetQueue([{
      id: "op-perdida", status: "sending", attempts: 0, nextAttemptAt: 0,
      lastSentAt: Date.now(), payload: { action: "addFutureMovement", clientOpId: "c-perdida" }
    }]);
    app.fetchAppsScriptData = async () => ({ ok: true, completed: false, pending: false });

    await app.reconcileInterruptedOps();

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.status, "retry", "vuelve a enviarse; el clientOpId evita duplicar si llegara a aplicarse");
    assert.equal(op.error, null);
  } finally {
    app.fetchAppsScriptData = previousFetch;
    app.state.config.scriptUrl = "";
    resetQueue();
  }
});

// El selector de días de una recurrencia se repinta desde syncOptions, que corre en cada
// actualización de datos. Al reconstruir el innerHTML se perdían los días ya marcados:
// si entraba un refresco mientras rellenabas una recurrencia, la selección desaparecía.
test("repintar el selector de recurrencia conserva los días marcados", () => {
  const app = loadApp();
  const picker = { dataset: {}, innerHTML: "" };
  let marcados = [];
  app.document.getElementById = id => (id === "recurrencePicker" ? picker : (id === "recurrenceType" ? { value: "weekly" } : null));
  app.document.querySelectorAll = () => marcados.map(value => ({ value }));

  app.renderRecurrencePicker();
  assert.equal(picker.innerHTML.includes("checked"), false, "sin nada marcado, ninguna casilla activa");

  // El usuario marca miércoles (2) y viernes (4).
  marcados = ["2", "4"];
  app.renderRecurrencePicker();

  assert.match(picker.innerHTML, /value="2" checked/, "miércoles sigue marcado tras repintar");
  assert.match(picker.innerHTML, /value="4" checked/, "viernes sigue marcado tras repintar");
  assert.equal(picker.innerHTML.match(/checked/g).length, 2, "solo los dos que estaban marcados");
});

test("cambiar de semanal a mensual empieza sin selección", () => {
  const app = loadApp();
  const picker = { dataset: {}, innerHTML: "" };
  let tipo = "weekly";
  app.document.getElementById = id => (id === "recurrencePicker" ? picker : (id === "recurrenceType" ? { value: tipo } : null));
  app.document.querySelectorAll = () => ["2", "4"].map(value => ({ value }));

  app.renderRecurrencePicker();
  tipo = "monthly";
  app.renderRecurrencePicker();

  assert.equal(picker.innerHTML.includes("checked"), false,
    "los días de la semana no se arrastran a los días del mes");
});

test("la primera instalación del service worker no recarga la página", () => {
  // El bug: sw.js hace skipWaiting + clients.claim, así que en la PRIMERA visita la
  // página pasa de no-controlada a controlada y controllerchange disparaba una recarga
  // que además cortaba la descarga inicial. Solo debe recargar cuando releva a otro.
  assert.equal(app.shouldReloadForServiceWorker({
    hadController: false, alreadyReloaded: false, dialogOpen: false, downloadInFlight: false
  }), false, "instalación inicial: no se recarga");

  assert.equal(app.shouldReloadForServiceWorker({
    hadController: true, alreadyReloaded: false, dialogOpen: false, downloadInFlight: false
  }), true, "actualización sobre un worker anterior: sí se recarga");
});

test("la recarga por actualización espera a que no haya trabajo que perder", () => {
  const base = { hadController: true, alreadyReloaded: false, dialogOpen: false, downloadInFlight: false };

  assert.equal(app.shouldReloadForServiceWorker({ ...base, downloadInFlight: true }), false,
    "no se recarga a mitad de una descarga: se perdería el bloque en vuelo");
  assert.equal(app.shouldReloadForServiceWorker({ ...base, dialogOpen: true }), false,
    "no se recarga con un diálogo abierto: se perdería lo que el usuario escribe");
  assert.equal(app.shouldReloadForServiceWorker({ ...base, alreadyReloaded: true }), false,
    "nunca se recarga dos veces");
});

test("la reanudación de una descarga sobrevive a una recarga de la página", () => {
  // Antes esto vivía en state.downloadResume, solo en memoria: al recargar a mitad de la
  // descarga inicial se perdía la única pista de qué faltaba y la app se quedaba mostrando
  // datos parciales como si estuvieran completos.
  const app = loadApp();
  app.setDownloadResume("all", ["transactions", "banks"]);
  app.setMovementDownloadProgress("transactions", { nextOffset: 2000, total: 5000 });

  // Una recarga = releer la caché persistida y normalizarla de cero.
  const persisted = JSON.parse(JSON.stringify({ meta: app.state.cacheMeta }));
  const app2 = loadApp();
  app2.state.cacheMeta = app2.normalizeCacheMeta(persisted);

  assert.deepEqual(Array.from(app2.pendingResumeSections()).sort(), ["banks", "transactions"]);
  const resumed = app2.movementDownloadResume("transactions", null);
  assert.equal(resumed.startOffset, 2000, "se retoma en el offset guardado, no desde la página 1");
  assert.equal(resumed.initialRows.length, 0);
});

test("terminar una descarga deja la caché sin nada pendiente", () => {
  const app = loadApp();
  app.setDownloadResume("all", ["transactions"]);
  app.setMovementDownloadProgress("transactions", { nextOffset: 1000, total: 1000 });
  assert.equal(app.pendingResumeSections().length, 1);

  app.clearMovementDownloadProgress("transactions");
  app.clearDownloadResume();

  assert.equal(app.pendingResumeSections().length, 0);
  assert.equal(app.normalizeCacheMeta({ meta: app.state.cacheMeta }).resume, undefined,
    "sin nada pendiente no queda rastro de reanudación en la caché");
});

test("las filas compactas se reconstruyen usando las columnas que declara la respuesta", async () => {
  // El cliente no conoce posiciones fijas: se guía por payload.columns, así que añadir
  // una columna en el backend no descoloca los importes.
  const previousFetch = app.fetchDownloadData;
  try {
    app.fetchDownloadData = async () => ({
      ok: true,
      columns: ["sid", "rowNumber", "fecha", "tipo", "concepto", "descripcion", "importe", "cuenta"],
      transactions: [["mov-1", 2, "2026-03-04", "Gasto", "Comida", "Menú", -12.5, "Santander"]],
      total: 1,
      nextOffset: 1,
      hasMore: false
    });

    const rows = await app.downloadMovementPages("realized", "movimientos", {});

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sid, "mov-1");
    assert.equal(rows[0].importe, -12.5);
    assert.equal(rows[0].cuenta, "Santander");
    assert.equal(app.normalizeTransaction(rows[0]).amount, -12.5, "y el normalizador los entiende");
  } finally {
    app.fetchDownloadData = previousFetch;
  }
});

test("no se lanzan más peticiones simultáneas de las permitidas", async () => {
  // Ejecuciones simultáneas del mismo script es de donde salen los errores transitorios
  // de Apps Script.
  const previousFetch = app.fetch;
  try {
    let inFlight = 0;
    let maxInFlight = 0;
    app.fetch = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => globalThis.setTimeout(resolve, 0));
      inFlight--;
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };

    await Promise.all(Array.from({ length: 8 }, () => app.appsScriptRequest("https://example.test/exec", {})));

    assert.ok(maxInFlight <= 2, `nunca más de 2 a la vez (llegó a ${maxInFlight})`);
  } finally {
    app.fetch = previousFetch;
  }
});

test("un backend desactualizado se detecta y no se reintenta", async () => {
  // Sin capa de compatibilidad, una acción desconocida solo puede ser que el Apps Script
  // desplegado sea más antiguo que la app: repetir 40 veces no lo arregla.
  const previousFetch = app.fetchAppsScriptData;
  let calls = 0;
  try {
    app.fetchAppsScriptData = async () => {
      calls += 1;
      return { ok: false, error: "Acción no reconocida: batchOps", errorCode: "UNKNOWN_ACTION" };
    };
    await assert.rejects(
      () => app.fetchDownloadData({ action: "downloadCoreData" }, { recoverUntilSuccess: true }),
      /más antiguo que la app/
    );
    assert.equal(calls, 1);
  } finally {
    app.fetchAppsScriptData = previousFetch;
  }
});
