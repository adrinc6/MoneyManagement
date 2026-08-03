// Regresiones de robustez: los fallos que colgaban la app o perdían cambios en
// silencio. Cada test corresponde a un problema real detectado en la auditoría.
import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const app = loadApp();

function resetQueue(queue = []) {
  app.localStorage.setItem(app.OP_QUEUE_KEY, JSON.stringify(queue));
}

test("una operación sin clientOpId acaba en error en vez de reelegirse en bucle", async () => {
  // Antes checkQueuedOp salía sin tocar el estado, así que runOpQueue volvía a
  // elegir la misma operación indefinidamente y congelaba la pestaña.
  resetQueue([{ id: "op-sin-id", status: "checking", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement" } }]);
  await app.checkQueuedOp("op-sin-id");

  const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
  assert.equal(op.status, "error");
  assert.equal(app.isOpActionable(op), false);
  resetQueue();
});

test("runOpQueue termina aunque una operación no progrese", async () => {
  const previousUrl = app.state.config.scriptUrl;
  const previousCheck = app.checkQueuedOp;
  try {
    app.state.config.scriptUrl = "https://example.test/exec";
    resetQueue([{ id: "op-atascada", status: "checking", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c1" } }]);
    // Simula el peor caso: comprobar la operación no cambia nada de su estado.
    app.checkQueuedOp = async () => {};

    // Sin cortacircuitos esto no terminaría nunca.
    await app.runOpQueue();

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.ok(op.attempts > 0, "el cortacircuitos debe contar el intento fallido");
    assert.ok(op.nextAttemptAt > 0 || op.status === "error");
  } finally {
    app.checkQueuedOp = previousCheck;
    app.state.config.scriptUrl = previousUrl;
    resetQueue();
  }
});

test("un fallo reintentable del servidor queda para reintento manual", async () => {
  const previousFetch = app.fetchAppsScriptData;
  try {
    resetQueue([{ id: "op-lock", status: "checking", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c-lock" } }]);
    app.fetchAppsScriptData = async () => ({ ok: true, failed: true, retryable: true, error: "LOCK_TIMEOUT: ocupado" });

    await app.checkQueuedOp("op-lock");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.status, "error", "un choque de bloqueo no debe disparar un nuevo POST automático");
    assert.equal(op.attempts, 0, "la respuesta del servidor se conserva sin reenviar la operación");
  } finally {
    app.fetchAppsScriptData = previousFetch;
    resetQueue();
  }
});

test("un fallo NO reintentable sí detiene la operación", async () => {
  const previousFetch = app.fetchAppsScriptData;
  try {
    resetQueue([{ id: "op-mala", status: "checking", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c-mala" } }]);
    app.fetchAppsScriptData = async () => ({ ok: true, failed: true, error: "VALIDATION: importe no válido" });

    await app.checkQueuedOp("op-mala");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.status, "error");
    assert.match(op.error, /VALIDATION/);
  } finally {
    app.fetchAppsScriptData = previousFetch;
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
      calls += 1;
      throw new Error("AUTH: Invalid app token");
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

test("estar esperando el servidor no consume intentos dentro de la ventana de gracia", async () => {
  // El backend puede tardar hasta 30 s esperando su turno del script lock. Contar
  // eso como intento fallido agotaba los 8 permitidos y mataba recurrencias enteras.
  const previousFetch = app.fetchAppsScriptData;
  try {
    resetQueue([{
      id: "op-espera", status: "checking", attempts: 0, nextAttemptAt: 0,
      lastSentAt: Date.now(), payload: { action: "addFutureMovement", clientOpId: "c-espera" }
    }]);
    app.fetchAppsScriptData = async () => ({ ok: true, completed: false, pending: false });

    await app.checkQueuedOp("op-espera");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.attempts, 0, "no se gasta un intento mientras la petición sigue viva");
    assert.equal(op.status, "checking");
    assert.ok(op.nextAttemptAt > Date.now(), "se reprograma la siguiente comprobación");
  } finally {
    app.fetchAppsScriptData = previousFetch;
    resetQueue();
  }
});

test("pasado un minuto sin noticias, la operación sigue confirmándose sin reenviar", async () => {
  const previousFetch = app.fetchAppsScriptData;
  try {
    resetQueue([{
      id: "op-vieja", status: "checking", attempts: 0, nextAttemptAt: 0,
      lastSentAt: Date.now() - 10 * 60 * 1000, payload: { action: "addFutureMovement", clientOpId: "c-vieja" }
    }]);
    app.fetchAppsScriptData = async () => ({ ok: true, completed: false, pending: false });

    await app.checkQueuedOp("op-vieja");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.equal(op.attempts, 0, "no convierte una comprobación tardía en un nuevo envío");
    assert.equal(op.status, "checking");
    assert.equal(op.confirmationDelayed, true);
    assert.equal(op.error, null, "el fallo de comprobación no se muestra como fallo del movimiento");
  } finally {
    app.fetchAppsScriptData = previousFetch;
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
