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

test("un fallo reintentable del servidor no detiene la operación con error terminal", async () => {
  const previousFetch = app.fetchAppsScriptData;
  try {
    resetQueue([{ id: "op-lock", status: "checking", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c-lock" } }]);
    app.fetchAppsScriptData = async () => ({ ok: true, failed: true, retryable: true, error: "LOCK_TIMEOUT: ocupado" });

    await app.checkQueuedOp("op-lock");

    const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
    assert.notEqual(op.status, "error", "un choque de bloqueo transitorio debe reintentarse");
    assert.equal(op.attempts, 1);
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

test("failQueuedOp aplica backoff creciente y se detiene tras el máximo de intentos", () => {
  resetQueue([{ id: "op-backoff", status: "queued", attempts: 0, nextAttemptAt: 0, payload: { action: "addMovement", clientOpId: "c-b" } }]);
  for (let i = 0; i < app.OP_MAX_ATTEMPTS; i++) {
    app.failQueuedOp("op-backoff", "fallo de prueba");
  }
  const [op] = JSON.parse(app.localStorage.getItem(app.OP_QUEUE_KEY));
  assert.equal(op.status, "error");
  assert.equal(op.attempts, app.OP_MAX_ATTEMPTS);
  assert.equal(app.isOpActionable(op), false);
  resetQueue();
});
