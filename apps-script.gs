var APP_TOKEN = '';
var DEFAULT_MOVEMENT_SHEET = 'Control Finanzas';
var DEFAULT_INVESTMENT_SHEET = 'Inversiones';
var DEFAULT_BANK_SHEET = 'Bancos';
var DEFAULT_FUTURE_MOVEMENT_SHEET = 'Movimientos futuros';
var DEFAULT_OBJECTIVE_SHEET = 'Objetivos';
var DEFAULT_INVESTMENT_TOTALS_SHEET = 'Inversión Totales';
var DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET = 'Inversiones Estimación Reglas';
var DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET = 'Inversiones Estimación Movimientos';
var INVESTMENT_MODE_PREFERENCE_KEY = 'moneyInvestmentModePreference';
var PROCESSED_CLIENT_OPS_KEY = 'moneyProcessedClientOps';
var MOVEMENT_SID_HEADER = 'SID';
var PROCESSED_NOTIFICATION_REQUESTS_KEY = 'moneyProcessedNotificationRequests';
var TELEGRAM_BOT_TOKEN = '';
var TELEGRAM_CHAT_ID = '';
var DAILY_NOTIFICATION_HOUR = 22;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || '';
  // Los nombres de hoja viajan juntos en todas las lecturas: se resuelven una vez y se
  // pasan como un objeto, en vez de como nueve argumentos posicionales que había que
  // mantener en el mismo orden en cada llamada.
  const sheets = resolveSheets_(params);
  const movementSheet = sheets.movement;
  const investmentSheet = sheets.investment;
  const bankSheet = sheets.bank;
  const dataSheet = sheets.data;
  const futureMovementSheet = sheets.future;
  const investmentTotalsSheet = sheets.investmentTotals;
  const investmentEstimateRulesSheet = sheets.investmentEstimateRules;
  const investmentEstimateLedgerSheet = sheets.investmentEstimateLedger;
  const skipFutureSids = String(params.skipFutureSids || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  let payload;
  try {
    requireToken_(params.token || '');
    if (action === 'checkClientOp') {
      payload = buildClientOpStatusPayload_(params.clientOpId || '');
    } else if (action === 'quickStatus') {
      payload = buildQuickStatusPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, dataSheet, investmentTotalsSheet);
    } else if (action === 'downloadCoreData') {
      // La carga inicial no debe quedarse esperando a las hojas de estimaciones,
      // que pueden crecer mucho. Se descargan después, solo si el usuario usa ese modo.
      payload = buildDataPayload_(sheets, { banks: true, estimates: false, movedFutureMovements: [] });
    } else if (action === 'downloadInvestments') {
      payload = buildDataPayload_(sheets, { estimates: false });
    } else if (action === 'downloadInvestmentEstimates') {
      payload = buildInvestmentEstimatesPayload_(sheets);
    } else if (action === 'downloadMovementsPage') {
      payload = buildMovementPagePayload_(
        params.movementKind === 'future' ? futureMovementSheet : movementSheet,
        params.movementKind === 'future' ? 'futureTransactions' : 'transactions',
        params.offset,
        params.limit
      );
    } else if (action === 'moveDueFutureMovements') {
      const movedFutureMovements = moveDueFutureMovements_(futureMovementSheet, movementSheet, bankSheet, skipFutureSids);
      if (movedFutureMovements.length) {
        applyInvestmentCostChanges_(sheets, movedFutureMovements.map(function(movement) {
          return { movement: movement, sign: 1 };
        }), movementSheet);
      }
      payload = {
        ok: true,
        movedFutureMovements,
        banks: readBanks_(bankSheet),
        investmentTotals: readInvestmentTotals_(investmentTotalsSheet)
      };
    } else if (action === 'updateInvestmentPrices') {
      payload = withScriptLock_(function() {
        const priceUpdateResult = updateInvestmentQuotesFromYahoo(investmentSheet);
        // Los precios han cambiado: aquí sí hay que recalcular la hoja de totales, porque
        // los payloads de descarga ya no la sincronizan por su cuenta.
        syncInvestmentTotalsSheet_(investmentTotalsSheet, investmentSheet, movementSheet);
        const result = buildDataPayload_(sheets, { estimates: true });
        result.pricesUpdated = true;
        result.priceUpdateResult = priceUpdateResult;
        return result;
      });
    } else if (action === 'sendDailyNotifications') {
      // Sin withScriptLock_: sendInvestmentNotificationsOnce_ ya toma el script lock
      // internamente y el lock no es reentrante (se bloquearía contra sí mismo).
      const investmentMode = params.investmentMode || investmentModePreference_();
      const notificationRequestId = String(params.notificationRequestId || '').trim();
      const notificationResult = sendInvestmentNotificationsOnce_(notificationRequestId, function() {
        sendInvestmentNotificationMessages_(investmentSheet, { mode: investmentMode, rulesSheet: investmentEstimateRulesSheet, ledgerSheet: investmentEstimateLedgerSheet, movementSheet: movementSheet, investmentTotalsSheet: investmentTotalsSheet });
      });
      payload = { ok: true, notificationsSent: notificationResult.sent, duplicate: notificationResult.duplicate, pricesUpdated: false, investmentMode: investmentMode };
    } else {
      payload = unknownActionPayload_(action);
    }
  } catch (err) {
    payload = errorPayload_(err);
  }

  return json_(payload);
}

function resolveSheets_(source) {
  const from = source || {};
  return {
    movement: from.movementSheet || DEFAULT_MOVEMENT_SHEET,
    future: from.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET,
    investment: from.investmentSheet || DEFAULT_INVESTMENT_SHEET,
    investmentTotals: from.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET,
    investmentEstimateRules: from.investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET,
    investmentEstimateLedger: from.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET,
    bank: from.bankSheet || DEFAULT_BANK_SHEET,
    objective: from.objectiveSheet || DEFAULT_OBJECTIVE_SHEET,
    data: from.dataSheet || 'Datos'
  };
}

// Único constructor de payload de lectura. Antes eran tres funciones
// (buildAllDataPayload_, buildCoreDataPayload_, buildInvestmentDataPayload_) con el
// mismo preámbulo y la misma lista de campos recortada de distinta forma. Los flags
// deciden qué bloques se añaden, y con ellos qué secciones ve el cliente como
// sincronizadas.
function buildDataPayload_(sheets, { banks = false, estimates = false, movedFutureMovements } = {}) {
  const investments = readInvestments_(sheets.investment);
  const investmentTotals = investmentTotalsForRead_(sheets.investmentTotals, sheets.investment, sheets.movement);
  const payload = {
    ok: true,
    investments,
    investmentTotals,
    investmentGoals: readInvestmentGoals_(sheets.objective),
    appSettings: readAppSettings_(sheets.objective),
    categories: readAppCategories_(sheets.data, sheets.investmentTotals, sheets.investment, investments, investmentTotals)
  };
  if (estimates) {
    payload.investmentEstimateRules = readInvestmentEstimateRules_(sheets.investmentEstimateRules);
    payload.investmentEstimateLedger = readInvestmentEstimateLedger_(sheets.investmentEstimateLedger);
  }
  if (banks) payload.banks = readBanks_(sheets.bank);
  if (movedFutureMovements) payload.movedFutureMovements = movedFutureMovements;
  return payload;
}

function buildInvestmentEstimatesPayload_(sheets) {
  return {
    ok: true,
    investmentEstimateRules: readInvestmentEstimateRules_(sheets.investmentEstimateRules),
    investmentEstimateLedger: readInvestmentEstimateLedger_(sheets.investmentEstimateLedger)
  };
}

function buildQuickStatusPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, dataSheet, investmentTotalsSheet) {
  const banks = readBanks_(bankSheet);
  const investments = readInvestments_(investmentSheet);
  const investmentTotals = investmentTotalsForRead_(investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheet || DEFAULT_INVESTMENT_SHEET, movementSheet || DEFAULT_MOVEMENT_SHEET);
  const investmentTotalsValue = investmentTotals.reduce(function(acc, item) { return acc + (parseNumber_(item.value) || 0); }, 0);
  const investmentsValue = investments.reduce(function(acc, item) { return acc + (parseNumber_(item.total) || 0); }, 0);
  return {
    ok: true,
    status: {
      transactionsCount: sheetDataRowCount_(movementSheet),
      futureTransactionsCount: sheetDataRowCount_(futureMovementSheet),
      banksCount: banks.length,
      banksTotal: roundStatusNumber_(banks.reduce(function(acc, bank) { return acc + (parseNumber_(bank.dinero) || 0); }, 0)),
      investmentsCount: investments.length,
      investmentTotalsValue: roundStatusNumber_(investmentTotalsValue || investmentsValue)
    }
  };
}

function sheetDataRowCount_(sheetName) {
  const sheet = getSheet_(sheetName);
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function roundStatusNumber_(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function buildMovementPagePayload_(sheetName, payloadKey, offset, limit) {
  const page = readMovementsPage_(sheetName, offset, limit, payloadKey === 'futureTransactions');
  const payload = {
    ok: true,
    total: page.total,
    offset: page.offset,
    limit: page.limit,
    nextOffset: page.nextOffset,
    hasMore: page.hasMore,
    columns: MOVEMENT_PAYLOAD_COLUMNS
  };
  payload[payloadKey] = page.rows;
  return payload;
}

function processedClientOpsKey_() {
  return PROCESSED_CLIENT_OPS_KEY;
}


function appliedBatchSidsKey_() {
  return 'moneyAppliedBatchSids';
}

function appliedTransferSidsKey_() {
  return 'moneyAppliedTransferSids';
}

function receivedClientOpsKey_() {
  return 'moneyReceivedClientOps';
}


// Marca "recibida, esperando turno". La fila de "Pendientes" solo se escribe DESPUÉS
// de obtener el script lock, así que durante esa espera (hasta 30 s) checkClientOp
// respondía "no sé nada" y el cliente lo contaba como intento fallido, agotando los
// reintentos. Este registro se escribe ANTES de esperar el lock para que el cliente
// sepa que su petición está viva.
var RECEIVED_OP_STALE_MS = 3 * 60 * 1000;

function rememberReceivedClientOp_(clientOpId) {
  if (!clientOpId) return;
  try {
    const now = Date.now();
    const items = readBoundedList_(receivedClientOpsKey_())
      .filter(function(item) {
        return item && item.id !== clientOpId && (now - Number(item.at || 0)) < RECEIVED_OP_STALE_MS;
      });
    items.push({ id: clientOpId, at: now });
    storeBoundedList_(receivedClientOpsKey_(), items);
  } catch (err) {
    // Es solo una pista de estado: si falla, se sigue adelante.
  }
}

function forgetReceivedClientOp_(clientOpId) {
  if (!clientOpId) return;
  try {
    const items = readBoundedList_(receivedClientOpsKey_());
    const next = items.filter(function(item) { return item && item.id !== clientOpId; });
    if (next.length !== items.length) storeBoundedList_(receivedClientOpsKey_(), next);
  } catch (err) {
    // Las entradas caducan solas por RECEIVED_OP_STALE_MS.
  }
}

function isClientOpReceived_(clientOpId) {
  if (!clientOpId) return false;
  const now = Date.now();
  return readBoundedList_(receivedClientOpsKey_()).some(function(item) {
    return item && item.id === clientOpId && (now - Number(item.at || 0)) < RECEIVED_OP_STALE_MS;
  });
}

// Las transferencias no escriben fila, así que no tienen SID en la hoja que las
// proteja de un reenvío: su única defensa era la lista de operaciones procesadas,
// que se poda al superar el límite de 9 KB por propiedad. Si una entrada se
// desalojaba mientras el cliente aún esperaba confirmación, el reenvío movía el
// dinero DOS VECES. Este registro propio, con identificadores cortos, lo impide.
function wasTransferApplied_(transferSid) {
  if (!transferSid) return false;
  return readBoundedList_(appliedTransferSidsKey_()).some(function(item) {
    return String(item && item.id || item) === transferSid;
  });
}

function rememberAppliedTransfer_(transferSid) {
  if (!transferSid) return;
  try {
    const items = readBoundedList_(appliedTransferSidsKey_())
      .filter(function(item) { return String(item && item.id || item) !== transferSid; });
    items.push(transferSid);
    storeBoundedList_(appliedTransferSidsKey_(), items);
  } catch (err) {
    // Si no se puede registrar, el reintento volvería a mover el saldo; se prefiere
    // no romper la transferencia que ya se aplicó correctamente.
  }
}

function movementSidHeader_() {
  return MOVEMENT_SID_HEADER;
}

// Único consumidor: la reconciliación del arranque, para operaciones que se quedaron a
// medias porque se cerró la app con el POST en vuelo. Solo necesita saber si el cambio
// llegó a aplicarse o si sigue en curso; el motivo de un fallo ya viaja en la respuesta
// del propio POST, así que no hay que guardarlo aquí para que alguien lo recoja después.
function buildClientOpStatusPayload_(clientOpId) {
  if (!clientOpId) return { ok: true, completed: false, pending: false };
  if (wasClientOpProcessed_(clientOpId)) return { ok: true, completed: true, pending: false };
  const pending = isClientOpReceived_(clientOpId);
  return { ok: true, completed: false, pending: pending };
}

// Guarda una lista acotada en DocumentProperties (límite de 9 KB por valor),
// recortando las entradas más antiguas hasta que quepa la actual.
function storeBoundedList_(key, items) {
  let list = items;
  let serialized = JSON.stringify(list);
  while (serialized.length > 9000 && list.length > 1) {
    list = list.slice(1);
    serialized = JSON.stringify(list);
  }
  PropertiesService.getDocumentProperties().setProperty(key, serialized);
}

function readBoundedList_(key) {
  try {
    const raw = PropertiesService.getDocumentProperties().getProperty(key);
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function rememberProcessedClientOp_(clientOpId) {
  if (!clientOpId) return;
  try {
    const items = readBoundedList_(processedClientOpsKey_())
      .filter(item => item && item.id !== clientOpId);
    items.push({ id: clientOpId, at: new Date().toISOString() });
    storeBoundedList_(processedClientOpsKey_(), items);
    // La operación ya está confirmada: el registro de saldos aplicados a medias no
    // tiene sentido y solo ocuparía sitio.
    forgetAppliedBatchSids_(clientOpId);
  } catch (err) {
    // No dejar que un fallo aquí oculte que la operación sí se completó.
  }
}




// Los saldos de "Bancos" se ajustan con sumas, no son idempotentes: si un lote falla
// a medias y el cliente lo reintenta, el dinero se movería dos veces. Registramos qué
// sids de un lote ya movieron saldo para saltarlos en el reintento.
function appliedBatchSids_(clientOpId) {
  if (!clientOpId) return {};
  const found = readBoundedList_(appliedBatchSidsKey_()).find(item => item && item.id === clientOpId);
  const map = {};
  ((found && found.sids) || []).forEach(sid => map[sid] = true);
  return map;
}

function rememberAppliedBatchSids_(clientOpId, sids) {
  if (!clientOpId || !sids || !sids.length) return;
  try {
    const items = readBoundedList_(appliedBatchSidsKey_());
    const existing = items.find(item => item && item.id === clientOpId);
    if (existing) {
      existing.sids = (existing.sids || []).concat(sids);
    } else {
      items.push({ id: clientOpId, at: new Date().toISOString(), sids: sids.slice() });
    }
    storeBoundedList_(appliedBatchSidsKey_(), items);
  } catch (err) {
    // Si no se puede registrar, el reintento reaplicaría saldos: se prefiere no romper
    // la operación en curso, que ya se ha aplicado correctamente.
  }
}

function forgetAppliedBatchSids_(clientOpId) {
  if (!clientOpId) return;
  const items = readBoundedList_(appliedBatchSidsKey_());
  const next = items.filter(item => item && item.id !== clientOpId);
  if (next.length !== items.length) storeBoundedList_(appliedBatchSidsKey_(), next);
}

function wasClientOpProcessed_(clientOpId) {
  return readBoundedList_(processedClientOpsKey_()).some(item => item && item.id === clientOpId);
}

function doPost(e) {
  let payload = {};
  try {
    try {
      payload = JSON.parse(e && e.postData && e.postData.contents || '{}');
    } catch (parseErr) {
      throw new Error('VALIDATION: el cuerpo de la petición no es JSON válido.');
    }
    requireToken_(payload.token || '');
    // Tope de tamaño de lote: por encima del máximo que genera la app legítimamente
    // (366 fechas por recurrencia) solo puede ser un error o un abuso.
    ['movements', 'transfers', 'investments', 'entries', 'banks'].forEach(function(field) {
      if (Array.isArray(payload[field]) && payload[field].length > 500) {
        throw new Error('VALIDATION: demasiados elementos en ' + field + ' (máximo 500).');
      }
    });
    // Ruta rápida sin bloqueo para operaciones ya confirmadas (evita serializar la
    // tormenta de reintentos que dispara el cliente).
    if (payload.clientOpId && wasClientOpProcessed_(payload.clientOpId)) {
      return json_({ ok: true, duplicate: true });
    }
    // Serializa las mutaciones: al borrar una cuenta con movimientos futuros el
    // cliente puede encolar varias operaciones que no deben pisarse entre sí.
    // Antes de ponerse a la cola del lock: así checkClientOp puede responder
    // "pendiente" mientras esta petición espera su turno, en vez de "no sé nada"
    // (que el cliente contabilizaba como intento fallido).
    rememberReceivedClientOp_(payload.clientOpId || '');
    // withScriptLock_ es el único sitio que sabe esperar el lock, con su timeout y su
    // error LOCK_TIMEOUT reintentable. doPost lo reimplementaba a mano, duplicando el
    // literal de 30 s, el mensaje y el manejo de scriptLockHeld_.
    return withScriptLock_(function() {
      // Reevaluado dentro del lock: ya con el estado consolidado por otra petición.
      if (payload.clientOpId && wasClientOpProcessed_(payload.clientOpId)) {
        return json_({ ok: true, duplicate: true });
      }
      return finishPost_(payload, applyPostAction_(payload));
    });
  } catch (err) {
    // El cliente lee esta respuesta: el motivo y su errorCode le llegan directamente y
    // decide con ellos si reintentar o parar. Ya no hace falta dejarlo apuntado para que
    // lo recoja una consulta posterior.
    return json_(errorPayload_(err));
  } finally {
    forgetReceivedClientOp_(payload && payload.clientOpId || '');
  }
}

// El token es OBLIGATORIO: sin él, cualquiera con la URL /exec podía leer y
// modificar todas las finanzas. Configura APP_TOKEN arriba y el mismo valor en
// Ajustes de la app.
// Aplica UNA acción y devuelve su respuesta, sin cerrar la petición. Se ejecuta siempre
// con el script lock tomado. Que "aplicar" esté separado de "cerrar la petición" es lo
// que permite a batchOps aplicar N acciones seguidas bajo el mismo lock, en vez de pagar
// un POST, una espera de lock y una ejecución de Apps Script por cada una.
function applyPostAction_(payload) {
    if (payload.action === 'batchOps') {
      // Un alta periódica de 52 fechas era 52 peticiones; aquí es una. Cada acción
      // interna conserva su propio clientOpId, así que los guardias de idempotencia
      // (saldos ya aplicados, sids ya escritos) siguen valiendo uno a uno y un reintento
      // del lote no duplica lo que ya entró.
      const ops = Array.isArray(payload.ops) ? payload.ops : [];
      if (!ops.length) throw new Error('VALIDATION: el lote no lleva operaciones.');
      if (ops.length > 500) throw new Error('VALIDATION: demasiadas operaciones en el lote (máximo 500).');
      const results = ops.map(function(op) {
        const merged = Object.assign({}, payload, op);
        delete merged.ops;
        const result = applyPostAction_(merged);
        if (result && result.ok === false) throw new Error(result.error || 'Una operación del lote falló.');
        if (merged.clientOpId) rememberProcessedClientOp_(merged.clientOpId);
        return result;
      });
      return { ok: true, applied: results.length };
    }
    if (payload.action === 'addMovement') {
      addMovement_(Object.assign({}, payload.movement || {}, { cuenta: payload.account || payload.movement && payload.movement.cuenta || '' }), payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      // Solo los movimientos de inversión cambian el coste y, con él, la hoja de totales.
      // Para el resto, resincronizarla es trabajo caro tirado — y dentro de un lote sería
      // ese coste multiplicado por cada fecha.
      if (isInvestmentMovement_(payload.movement)) {
        adjustInvestmentCostFromMovement_(resolveSheets_(payload), payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement, 1);
      }
      if (payload.account) {
        // El ajuste de saldo es una suma, no es idempotente: si el registro del
        // clientOpId procesado se desalojó de la lista acotada, un reintento
        // volvería a mover el dinero. El sid del movimiento hace de marcador.
        const movementSid = String(payload.movement && payload.movement.sid || '').trim();
        const alreadyApplied = movementSid && payload.clientOpId && appliedBatchSids_(payload.clientOpId)[movementSid];
        if (!alreadyApplied) {
          adjustBank_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.account, Number(payload.movement && (payload.movement.amount || payload.movement.importe) || 0));
          if (movementSid && payload.clientOpId) rememberAppliedBatchSids_(payload.clientOpId, [movementSid]);
        }
      }
      return { ok: true };
    }
    if (payload.action === 'addFutureMovement') {
      addFutureMovement_(payload.movement, payload.sheetName || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.account || '');
      return { ok: true };
    }
    if (payload.action === 'updateMovement') {
      updateMovement_(payload.movement, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.previousMovement || null);
      applyInvestmentCostChanges_(resolveSheets_(payload), [
        { movement: payload.previousMovement, sign: -1 },
        { movement: payload.movement, sign: 1 }
      ], payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      return { ok: true };
    }
    if (payload.action === 'deleteMovement') {
      deleteMovement_(payload.rowNumber, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement || null);
      adjustInvestmentCostFromMovement_(resolveSheets_(payload), payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement, -1);
      return { ok: true };
    }
    if (payload.action === 'deleteMovementsBatch') {
      deleteMovementsBatch_(payload.movements || [], payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      applyInvestmentCostChanges_(
        resolveSheets_(payload),
        (payload.movements || []).map(function(item) { return { movement: item && (item.movement || item), sign: -1 }; }),
        payload.sheetName || DEFAULT_MOVEMENT_SHEET
      );
      return { ok: true };
    }
    if (payload.action === 'updateInvestment') {
      updateInvestment_(payload.investment || {}, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.previousInvestment || null);
      if (payload.newInvestment && !isCashInvestment_(payload.investment || {})) {
        updateInvestmentQuotesFromYahoo(payload.sheetName || DEFAULT_INVESTMENT_SHEET);
      }
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return { ok: true, pricesUpdated: Boolean(payload.newInvestment) };
    }
    if (payload.action === 'deleteInvestment') {
      deleteInvestment_(payload.investment || {}, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.rowNumber || 0);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return { ok: true, investmentDeleted: true };
    }
    if (payload.action === 'saveInvestmentCategories') {
      saveInvestmentCategories_(payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.investmentTypes || [], payload.renames || {}, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, payload.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, payload.deletions || []);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return { ok: true };
    }
    if (payload.action === 'saveInvestmentEstimateRules') {
      saveInvestmentEstimateRules_(payload.rules || [], payload.investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET);
      return { ok: true };
    }
    if (payload.action === 'clearInvestmentEstimates') {
      clearInvestmentEstimates_(payload.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return { ok: true };
    }
    if (payload.action === 'saveInvestmentEstimateAllocations') {
      const saved = saveInvestmentEstimateAllocations_(payload.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, payload.entries || []);
      return { ok: true, estimatesSaved: saved.length };
    }
    if (payload.action === 'saveAppSettings') {
      saveAppSettings_(payload.settings || {}, payload.sheetName || DEFAULT_OBJECTIVE_SHEET);
      return { ok: true, appSettingsSaved: true, appSettings: readAppSettings_(payload.sheetName || DEFAULT_OBJECTIVE_SHEET) };
    }
    if (payload.action === 'saveInvestmentGoals') {
      saveInvestmentGoals_(payload.goals || {}, payload.sheetName || DEFAULT_OBJECTIVE_SHEET);
      return { ok: true };
    }
    if (payload.action === 'saveInvestmentModePreference') {
      saveInvestmentModePreference_(payload.investmentMode || payload.mode || 'real');
      return { ok: true, investmentModeSaved: true, investmentMode: investmentModePreference_() };
    }
    if (payload.action === 'saveBanks') {
      saveBanks_(payload.banks || [], payload.bankSheet || DEFAULT_BANK_SHEET);
      return { ok: true };
    }
    if (payload.action === 'transferBank') {
      // Mover saldo es una suma: sin este guardia, un reenvío duplicaría el dinero.
      const transferSid = String(payload.transferSid || '').trim();
      if (transferSid && wasTransferApplied_(transferSid)) {
        return { ok: true, duplicate: true };
      }
      transferBank_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.from, payload.to, Number(payload.amount || 0));
      rememberAppliedTransfer_(transferSid);
      return { ok: true };
    }
    if (payload.action === 'renameAccount') {
      const renamed = renameAccount_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.oldName || '', payload.newName || '');
      return Object.assign({ ok: true }, renamed);
    }
    if (payload.action === 'deleteAccount') {
      const deleted = deleteAccount_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.account || '', Boolean(payload.force));
      return Object.assign({ ok: true }, deleted);
    }
    if (payload.action === 'reassignFutureMovementsAccount') {
      const changed = reassignFutureMovementsAccount_(payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.oldName || '', payload.newName || '');
      return { ok: true, changed };
    }
    return unknownActionPayload_(payload.action);
}

function requireToken_(token) {
  if (!APP_TOKEN) {
    throw new Error('AUTH: configura APP_TOKEN en el Apps Script (es obligatorio) y en Ajustes de la app.');
  }
  if (token !== APP_TOKEN) {
    throw new Error('AUTH: Invalid app token');
  }
}

// Guard de reentrada: el script lock no es fiablemente reentrante, así que una
// llamada anidada (una acción bloqueada que invoca otro helper bloqueado) podría
// quedarse esperándose a sí misma hasta el timeout. Como la ejecución ya posee el
// lock, la anidada se limita a ejecutar el cuerpo.
var scriptLockHeld_ = false;
function withScriptLock_(fn) {
  if (scriptLockHeld_) return fn();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    throw new Error('LOCK_TIMEOUT: el servidor está ocupado con otra operación; reintenta en unos segundos.');
  }
  scriptLockHeld_ = true;
  try {
    return fn();
  } finally {
    scriptLockHeld_ = false;
    try { lock.releaseLock(); } catch (releaseErr) {}
  }
}

function finishPost_(requestPayload, responsePayload) {
  // Confirma las escrituras antes de responder. La antigua ruta añadía y borraba una
  // fila en la hoja "Pendientes" y hacía un segundo flush después de que el cambio real
  // ya fuese visible; esa contabilidad era la causa de confirmaciones muy lentas.
  SpreadsheetApp.flush();
  const response = responsePayload || requestPayload || { ok: true };
  if (response.ok !== false && requestPayload && requestPayload.action) {
    rememberProcessedClientOp_(requestPayload.clientOpId || '');
  }
  return json_(response);
}

function createMovementSid_() {
  return `mov_${Utilities.getUuid()}`;
}

function movementSidFrom_(movement) {
  return String(movement && (movement.sid || movement.SID || movement.id || movement.ID) || '').trim() || createMovementSid_();
}

// Localiza la columna SID leyendo solo la fila de cabeceras, sin tocar los datos.
function movementSidColumn_(sheet) {
  if (!sheet) return 0;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(normalizeHeader_);
  return headers.indexOf('sid') + 1;
}

// Memo por ejecución: localizar o crear la cabecera SID se hace una vez por hoja.
// Cada ejecución de Apps Script es aislada, así que la caché vive solo esta petición.
var movementSidColumnCache_ = {};
function ensureMovementSidColumnCached_(sheet) {
  if (!sheet) return 0;
  const key = String(sheet.getSheetId());
  if (!(key in movementSidColumnCache_)) {
    // En el caso normal la columna ya existe: localizarla por cabecera evita leer
    // toda la hoja cada vez que se añade, edita o borra un movimiento.
    const existingSidColumn = movementSidColumn_(sheet);
    movementSidColumnCache_[key] = existingSidColumn || ensureMovementSidColumn_(sheet);
  }
  return movementSidColumnCache_[key];
}

function ensureMovementSidColumn_(sheet) {
  if (!sheet) return 0;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let sidCol = movementSidColumn_(sheet);
  if (!sidCol) {
    sidCol = lastCol + 1;
    // Escritura protegida: esta función corre ANTES que cualquier otra en las altas
    // de movimiento, así que una regla de validación heredada aquí tumbaba la
    // operación entera antes de llegar a las escrituras que sí estaban protegidas.
    setCellValueSafe_(sheet.getRange(1, sidCol), movementSidHeader_());
  }
  // No se rellenan de golpe los SID históricos durante una lectura. Esa migración
  // convertía la primera página de movimientos en una escritura de toda la hoja y
  // podía agotar la ejecución de Apps Script. Las filas nuevas o editadas reciben SID
  // al escribirse; para las antiguas se conserva la búsqueda segura por contenido.
  return sidCol;
}

// Neutraliza la inyección de fórmulas: un texto de usuario que empiece por '='
// (u otro prefijo activo) se escribiría como fórmula viva en la hoja. El apóstrofo
// inicial es invisible en la celda y Sheets lo quita al leer.
function sanitizeCell_(value) {
  if (typeof value === 'string' && /^[=+@\t\r]/.test(value)) return "'" + value;
  return value;
}

// Escritura tolerante a las reglas de validación de datos de la hoja. Caso real:
// la columna CUENTA con un desplegable rechaza el texto "Origen → Destino" de las
// transferencias periódicas y la operación fallaba PARA SIEMPRE (cada reintento
// escribía el mismo valor). Si la escritura choca con una validación, se limpia la
// validación SOLO del rango recién escrito (heredada por autofill de la fila
// anterior; el resto de la hoja no se toca) y se reintenta una vez.
function setRangeValuesSafe_(range, values) {
  try {
    range.setValues(values);
  } catch (err) {
    const message = String(err && err.message || err || '');
    if (!/validaci|validation/i.test(message)) throw err;
    range.clearDataValidations();
    try {
      range.setValues(values);
    } catch (retryErr) {
      throw new Error('VALIDATION: una regla de validación de datos de la hoja rechaza el valor a escribir (' + message + '). Relaja esa regla en la hoja.');
    }
  }
}

function setCellValueSafe_(range, value) {
  setRangeValuesSafe_(range, [[value]]);
}

// Sobrescribe una fila que YA existe. Las altas no pasan por aquí: van por
// appendMovementRows_, que además deduplica.
//
// Eran tres escrituras por fila (A:H, luego la cuenta, luego el sid). Ahora es una sola
// de A hasta la columna SID, dejando intactas las celdas intermedias que no se tocan.
function writeMovementRow_(sheet, rowNumber, movement, sid, account) {
  const date = new Date(movement.date || movement.fecha);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const amount = Number(movement.amount || movement.importe);
  if (!Number.isFinite(amount)) throw new Error('Invalid amount');
  const sidCol = ensureMovementSidColumnCached_(sheet);
  // Mismo ancho que appendMovementRows_: si la hoja no llega a la columna 9 no se le
  // añade una "Cuenta" que no tenía.
  const width = Math.max(sheet.getLastColumn(), sidCol, 8);
  const row = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
  row[0] = date;
  row[1] = `=YEAR(A${rowNumber})`;
  row[2] = `=MONTH(A${rowNumber})`;
  row[3] = `=DAY(A${rowNumber})`;
  row[4] = sanitizeCell_(movement.tipo || '');
  row[5] = sanitizeCell_(movement.concepto || '');
  row[6] = sanitizeCell_(movement.descripcion || '');
  row[7] = amount;
  if (width >= 9) row[8] = sanitizeCell_(account != null ? account : (movement.cuenta != null ? movement.cuenta : (movement.account || '')));
  if (sidCol) row[sidCol - 1] = sid || movementSidFrom_(movement);
  setRangeValuesSafe_(sheet.getRange(rowNumber, 1, 1, width), [row]);
}

// Añade varios movimientos con UNA sola lectura de la columna SID y UNA sola
// escritura de rango. La versión fila a fila (writeMovementRow_) vuelve a llamar a
// ensureMovementSidColumn_ en cada iteración, que lee la columna SID entera: un lote
// periódico de decenas de fechas tardaba minutos y superaba el timeout del cliente,
// dejando la operación reintentándose en bucle. Además omite los sid que ya están en
// la hoja, así que reintentar un lote aplicado a medias no duplica filas.
function appendMovementRows_(sheet, entries) {
  if (!sheet || !entries || !entries.length) return 0;
  const sidCol = ensureMovementSidColumnCached_(sheet);
  const lastRow = sheet.getLastRow();
  const existingSids = {};
  if (sidCol && lastRow >= 2) {
    sheet.getRange(2, sidCol, lastRow - 1, 1).getValues().forEach(row => {
      const sid = String(row[0] || '').trim();
      if (sid) existingSids[sid] = true;
    });
  }
  const width = Math.max(sheet.getLastColumn(), sidCol, 8);
  const rows = [];
  entries.forEach(entry => {
    const movement = entry && entry.movement;
    if (!movement) return;
    const date = new Date(movement.date || movement.fecha);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    const amount = Number(movement.amount || movement.importe);
    if (!Number.isFinite(amount)) throw new Error('Invalid amount');
    const sid = String(entry.sid || movementSidFrom_(movement));
    if (existingSids[sid]) return;
    existingSids[sid] = true;
    const rowNumber = lastRow + 1 + rows.length;
    const row = new Array(width).fill('');
    row[0] = date;
    row[1] = `=YEAR(A${rowNumber})`;
    row[2] = `=MONTH(A${rowNumber})`;
    row[3] = `=DAY(A${rowNumber})`;
    row[4] = sanitizeCell_(movement.tipo || '');
    row[5] = sanitizeCell_(movement.concepto || '');
    row[6] = sanitizeCell_(movement.descripcion || '');
    row[7] = amount;
    if (width >= 9) row[8] = sanitizeCell_(entry.account != null ? entry.account : (movement.cuenta || movement.account || ''));
    if (sidCol) row[sidCol - 1] = sid;
    rows.push(row);
  });
  if (!rows.length) return 0;
  setRangeValuesSafe_(sheet.getRange(lastRow + 1, 1, rows.length, width), rows);
  return rows.length;
}

function findMovementRowBySid_(sheet, sid, sidCol) {
  const target = String(sid || '').trim();
  if (!target || !sidCol || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, sidCol, sheet.getLastRow() - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() === target) return i + 2;
  }
  return 0;
}

// Un alta es un append: appendMovementRows_ hace 1 lectura + 1 escritura, mientras que
// writeMovementRow_ hacía tres llamadas a la API por fila. Además deduplica por sid, así
// que un reintento no escribe el movimiento dos veces.
function addMovement_(movement, sheetName) {
  if (!movement) throw new Error('Missing movement');
  appendMovementRows_(requireSheet_(sheetName), [{
    movement: movement,
    sid: movementSidFrom_(movement),
    account: movement.cuenta || movement.account || ''
  }]);
}

function readMovements_(sheetName) {
  const page = readMovementsPage_(sheetName, 0, Number.MAX_SAFE_INTEGER);
  return page.rows.map(movementObjectFromCompactRow_);
}

function readMovementsPage_(sheetName, offset, limit, optional) {
  const sheet = getSheet_(sheetName);
  if (!sheet) {
    if (optional) return { rows: [], total: 0, offset: 0, limit: Math.max(1, Math.min(Number(limit || 500), 1000)), nextOffset: 0, hasMore: false };
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  // La cabecera SID se asegura una vez en la primera página; no se migra la columna
  // histórica completa durante una lectura.
  const sidCol = Number(offset || 0) > 0 ? movementSidColumn_(sheet) : ensureMovementSidColumnCached_(sheet);
  const total = Math.max(0, sheet.getLastRow() - 1);
  const safeOffset = Math.max(0, Math.min(Number(offset || 0), total));
  const requestedLimit = Number(limit || 250);
  const safeLimit = requestedLimit >= Number.MAX_SAFE_INTEGER ? Math.max(1, total) : Math.max(1, Math.min(requestedLimit, 1000));
  if (!total || safeOffset >= total) {
    return { rows: [], total, offset: safeOffset, limit: safeLimit, nextOffset: safeOffset, hasMore: false };
  }
  const count = Math.min(safeLimit, total - safeOffset);
  const startRow = 2 + safeOffset;
  // No uses getLastColumn(): una columna auxiliar o formato lejano haría que cada
  // página leyese cientos de columnas irrelevantes. Los movimientos solo usan A:I y,
  // si existe, la columna SID se lee aparte.
  const values = sheet.getRange(startRow, 1, count, 9).getValues();
  const sidValues = sidCol > 9
    ? sheet.getRange(startRow, sidCol, count, 1).getDisplayValues()
    : null;
  const rows = values
    .map((row, index) => movementRowFromSheetRow_(
      row,
      startRow + index,
      sidCol,
      sidCol ? (sidCol <= 9 ? row[sidCol - 1] : sidValues[index][0]) : ''
    ))
    .filter(Boolean);
  const nextOffset = safeOffset + count;
  return { rows, total, offset: safeOffset, limit: safeLimit, nextOffset, hasMore: nextOffset < total };
}

// Los movimientos viajan como filas (arrays) en vez de objetos con ocho claves cada una:
// para un histórico grande eso es del orden de tres veces menos payload que descargar y
// parsear en el móvil. El orden se declara aquí una sola vez y viaja en la respuesta, así
// que el cliente no conoce posiciones fijas.
var MOVEMENT_PAYLOAD_COLUMNS = ['sid', 'rowNumber', 'fecha', 'tipo', 'concepto', 'descripcion', 'importe', 'cuenta'];

function movementRowFromSheetRow_(row, rowNumber, sidCol, sidValue) {
  if (!row[0] || !row[4] || row[7] === '') return null;
  return [
    sidCol ? String(sidValue || '').trim() : '',
    rowNumber,
    normalizeDate_(row[0]),
    row[4],
    row[5],
    row[6],
    parseNumber_(row[7]),
    row[8] || ''
  ];
}

// Para los consumidores internos del propio script, que sí trabajan con objetos.
function movementObjectFromCompactRow_(row) {
  const movement = {};
  MOVEMENT_PAYLOAD_COLUMNS.forEach(function(key, index) { movement[key] = row[index]; });
  return movement;
}

function updateMovement_(movement, sheetName, previousMovement) {
  if (!movement) throw new Error('Missing movement');
  const sheet = requireSheet_(sheetName);
  const sidCol = ensureMovementSidColumnCached_(sheet);
  const targetSid = String(movement.sid || previousMovement && previousMovement.sid || '').trim();
  let rowNumber = targetSid ? findMovementRowBySid_(sheet, targetSid, sidCol) : Number(movement.rowNumber || 0);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) rowNumber = 0;
  if (rowNumber && previousMovement && !movementMatchesSheetRow_(sheet, rowNumber, previousMovement)) rowNumber = 0;
  if (!rowNumber && previousMovement) rowNumber = findMovementRow_(sheet, previousMovement);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error('Movement not found');
  writeMovementRow_(sheet, rowNumber, movement, targetSid || movementSidFrom_(movement), movement.cuenta || movement.account || '');
}

function deleteMovement_(rowNumber, sheetName, movement) {
  const sheet = requireSheet_(sheetName);
  const sidCol = ensureMovementSidColumnCached_(sheet);
  const sid = String(movement && movement.sid || '').trim();
  let row = sid ? findMovementRowBySid_(sheet, sid, sidCol) : Number(rowNumber || 0);
  if (movement && row >= 2 && row <= sheet.getLastRow() && !movementMatchesSheetRow_(sheet, row, movement)) {
    row = 0;
  }
  if ((!row || row < 2 || row > sheet.getLastRow()) && movement) {
    row = findMovementRow_(sheet, movement);
  }
  if (row < 2 || row > sheet.getLastRow()) throw new Error('Movement not found');
  sheet.deleteRow(row);
}

// Era O(ítems × filas): una lectura completa de la columna SID por cada elemento, más una
// lectura por fila en el recorrido de respaldo. Ahora se lee la hoja UNA vez y todo se
// resuelve contra ese snapshot en memoria.
function deleteMovementsBatch_(items, sheetName) {
  if (!items.length) return;
  const sheet = requireSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Movements not found');
  const sidCol = ensureMovementSidColumnCached_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, movementRowWidth_(sidCol)).getValues();

  const rowBySid = {};
  if (sidCol) {
    values.forEach((row, index) => {
      const sid = String(row[sidCol - 1] || '').trim();
      if (sid) rowBySid[sid] = index + 2;
    });
  }

  const rows = [];
  items.forEach(item => {
    const movement = item && (item.movement || item);
    const sid = String(movement && movement.sid || '').trim();
    let row = sid && rowBySid[sid] ? rowBySid[sid] : Number(item && item.rowNumber || 0);
    if (movement && row >= 2 && row <= lastRow && !movementRowMatches_(values[row - 2], movement, sidCol)) {
      row = 0;
    }
    if ((!row || row < 2 || row > lastRow) && movement) {
      // Respaldo por contenido, también sobre el snapshot: de la última fila hacia atrás,
      // saltando las que ya se han asignado a otro elemento del lote.
      row = 0;
      for (let i = values.length - 1; i >= 0 && !row; i--) {
        const candidate = i + 2;
        if (rows.indexOf(candidate) !== -1) continue;
        if (movementRowMatches_(values[i], movement, sidCol)) row = candidate;
      }
    }
    if (row >= 2 && row <= lastRow) rows.push(row);
  });
  const uniqueRows = Array.from(new Set(rows)).sort((a, b) => b - a);
  if (!uniqueRows.length) throw new Error('Movements not found');
  uniqueRows.forEach(row => sheet.deleteRow(row));
}

// Localiza una fila por su sid y, si ese sid no está en la hoja (filas creadas antes de
// que existiera la columna SID, o editadas desde fuera), por su contenido.
//
// El recorrido por contenido hacía un getRange POR FILA, más un getLastColumn por fila,
// a través de movementMatchesSheetRow_: con 5.000 movimientos eran 5.000 idas y vueltas
// a Sheets y la ejecución se agotaba a los seis minutos. Ahora se lee el rango una vez y
// se compara en memoria.
function findMovementRow_(sheet, movement, excludedRows) {
  const excluded = excludedRows || [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const sidCol = ensureMovementSidColumnCached_(sheet);
  const sid = String(movement && movement.sid || '').trim();
  const sidRow = sid ? findMovementRowBySid_(sheet, sid, sidCol) : 0;
  if (sidRow && excluded.indexOf(sidRow) === -1) return sidRow;
  const values = sheet.getRange(2, 1, lastRow - 1, movementRowWidth_(sidCol)).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = i + 2;
    if (excluded.indexOf(row) !== -1) continue;
    if (movementRowMatches_(values[i], movement, sidCol)) return row;
  }
  return 0;
}

// Los movimientos ocupan A:I; la columna SID puede estar más allá. No se usa
// getLastColumn(): una columna auxiliar o un formato lejano haría leer cientos de
// columnas irrelevantes en cada comprobación.
function movementRowWidth_(sidCol) {
  return Math.max(9, Number(sidCol) || 0);
}

// Comparación pura sobre una fila ya leída, sin tocar la hoja.
function movementRowMatches_(values, movement, sidCol) {
  if (!values || !movement) return false;
  const movementSid = String(movement.sid || '').trim();
  const rowSid = sidCol ? String(values[sidCol - 1] || '').trim() : '';
  if (movementSid && rowSid) return movementSid === rowSid;
  const movementAmount = parseNumber_(movement.amount || movement.importe);
  const rowAmount = parseNumber_(values[7]);
  return normalizeDate_(values[0]) === normalizeDate_(movement.date || movement.fecha)
    && String(values[4] || '').trim() === String(movement.tipo || '').trim()
    && String(values[5] || '').trim() === String(movement.concepto || '').trim()
    && String(values[6] || '').trim() === String(movement.descripcion || '').trim()
    && Math.abs(rowAmount - movementAmount) < 0.005;
}

function movementMatchesSheetRow_(sheet, row, movement) {
  const sidCol = ensureMovementSidColumnCached_(sheet);
  return movementRowMatches_(sheet.getRange(row, 1, 1, movementRowWidth_(sidCol)).getValues()[0], movement, sidCol);
}

function futureMovementHeaders_() {
  return ['FECHA', 'AÑO', 'MES', 'DIA', 'TIPO', 'CONCEPTO', 'DESCRIPCION', 'IMPORTE', 'Cuenta', movementSidHeader_()];
}

function addFutureMovement_(movement, sheetName, account) {
  if (!movement) throw new Error('Missing movement');
  appendMovementRows_(getOrCreateSheet_(sheetName, futureMovementHeaders_()), [{
    movement: movement,
    sid: movementSidFrom_(movement),
    account: account || movement.account || movement.cuenta || ''
  }]);
}

function parseTransferAccountText_(value) {
  const text = String(value || '').trim();
  const separator = text.indexOf('→') !== -1 ? '→' : text.indexOf('->') !== -1 ? '->' : '';
  if (!separator) return { from: '', to: '' };
  const parts = text.split(separator);
  return { from: String(parts[0] || '').trim(), to: String(parts.slice(1).join(separator) || '').trim() };
}

function normalizeType_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isTransferType_(value) {
  return normalizeType_(value) === 'transferencia';
}

function isInvestmentPositionType_(value) {
  const normalized = normalizeType_(value);
  if (!normalized || normalized === '---') return false;
  if (normalized.indexOf('total') !== -1) return false;
  return true;
}


// Comprobación barata y de solo lectura: ¿hay algún futuro vencido? Permite que la
// carga normal (sin nada que mover) no tenga que esperar el script lock.
function hasDueFutureMovements_(futureSheetName) {
  const futureSheet = getSheet_(futureSheetName);
  if (!futureSheet || futureSheet.getLastRow() < 2) return false;
  const dates = futureSheet.getRange(2, 1, futureSheet.getLastRow() - 1, 1).getValues();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return dates.some(function(row) {
    const date = parseMovementDate_(row[0]);
    return date && date <= today;
  });
}

// Mueve los futuros vencidos DENTRO del script lock: la relectura dentro del lock
// hace la operación segura ante dos peticiones simultáneas (la segunda ya no
// encuentra las filas movidas por la primera).
function moveDueFutureMovements_(futureSheetName, movementSheetName, bankSheetName, skipSids) {
  if (!hasDueFutureMovements_(futureSheetName)) return [];
  return withScriptLock_(function() {
    return moveDueFutureMovementsLocked_(futureSheetName, movementSheetName, bankSheetName, skipSids);
  });
}

function moveDueFutureMovementsLocked_(futureSheetName, movementSheetName, bankSheetName, skipSids) {
  const futureSheet = getSheet_(futureSheetName);
  if (!futureSheet) return [];
  const bankSheet = getSheet_(bankSheetName);
  const skipSet = {};
  (skipSids || []).forEach(function(sid) { const trimmed = String(sid || '').trim(); if (trimmed) skipSet[trimmed] = true; });
  const sidCol = ensureMovementSidColumnCached_(futureSheet);
  const values = futureSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const moved = [];
  const rowsToDelete = [];
  // Los movimientos realizados se acumulan y se escriben de una vez con
  // appendMovementRows_: fila a fila eran ~3 llamadas a la API por vencimiento, y una
  // puesta al día de varios meses se comía el presupuesto de tiempo de la petición.
  const pendingAppends = [];
  // Los saldos, igual. findBankRow_ leía la hoja Bancos entera por cada comprobación y
  // adjustBank_/transferBank_ la leían y reescribían por cada vencimiento: unas tres
  // idas y vueltas por fila. Se lee una vez, se acumulan los deltas y se escribe al
  // final, en una sola operación.
  const knownAccounts = {};
  if (bankSheet && bankSheet.getLastRow() >= 2) {
    bankSheet.getRange(2, 1, bankSheet.getLastRow() - 1, 1).getValues().forEach(function(row) {
      const account = String(row[0] || '').trim();
      if (account) knownAccounts[normalizeType_(account)] = true;
    });
  }
  const accountExists = function(account) {
    return !bankSheet || Boolean(knownAccounts[normalizeType_(String(account || '').trim())]);
  };
  const balanceChanges = [];
  for (let r = values.length - 1; r >= 1; r--) {
    const row = values[r];
    const date = parseMovementDate_(row[0]);
    if (!date || date > today) continue;
    const sid = sidCol ? String(row[sidCol - 1] || '').trim() : '';
    if (sid && skipSet[sid]) continue;
    const movement = { sid: sid, fecha: normalizeDate_(date), tipo: row[4], concepto: row[5], descripcion: row[6], importe: parseNumber_(row[7]) };
    if (isTransferType_(movement.tipo)) {
      const accounts = parseTransferAccountText_(row[8] || row[6]);
      const amount = Math.abs(Number(movement.importe || 0));
      if (!accounts.from || !accounts.to || accounts.from === accounts.to || !Number.isFinite(amount) || amount <= 0) continue;
      // Account renamed or deleted since the transfer was scheduled: leave it as a future movement instead of crashing.
      if (!accountExists(accounts.from) || !accountExists(accounts.to)) continue;
      balanceChanges.push({ account: accounts.from, delta: -amount }, { account: accounts.to, delta: amount });
      moved.push({ ...movement, cuenta: `${accounts.from} → ${accounts.to}`, transferFrom: accounts.from, transferTo: accounts.to });
    } else {
      if (row[8] && !accountExists(row[8])) continue;
      pendingAppends.push({ movement, sid: sid || movementSidFrom_(movement), account: row[8] || '' });
      if (row[8]) balanceChanges.push({ account: row[8], delta: movement.importe });
      moved.push({ ...movement, cuenta: row[8] || '' });
    }
    rowsToDelete.push(r + 1);
  }
  if (pendingAppends.length) {
    const movementSheet = requireSheet_(movementSheetName);
    appendMovementRows_(movementSheet, pendingAppends);
  }
  if (balanceChanges.length) adjustBankBalances_(bankSheetName, balanceChanges);
  rowsToDelete.sort((a, b) => b - a).forEach(rowNumber => futureSheet.deleteRow(rowNumber));
  return moved.reverse();
}

// Acceso a hojas. Antes había 31 llamadas sueltas a getActiveSpreadsheet() y el guard
// "Sheet not found" estaba copiado en 15 sitios; getSheet_/requireSheet_ son la única
// vía, y ss_() memoiza el documento para no volver a pedirlo en cada helper.
var spreadsheetCache_ = null;

function ss_() {
  if (!spreadsheetCache_) spreadsheetCache_ = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheetCache_;
}

function getSheet_(sheetName) {
  return ss_().getSheetByName(sheetName);
}

function requireSheet_(sheetName) {
  const sheet = getSheet_(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  return sheet;
}

function getOrCreateSheet_(sheetName, headers) {
  let sheet = getSheet_(sheetName);
  if (!sheet) {
    // El nombre viene de la petición: se valida antes de crear nada para que un
    // caller no pueda sembrar la hoja de cálculo de pestañas basura.
    const name = String(sheetName || '').trim();
    if (!name || name.length > 80 || /[[\]*?:/\\]/.test(name)) {
      throw new Error('VALIDATION: nombre de hoja no válido: ' + name);
    }
    if (ss_().getSheets().length >= 40) {
      throw new Error('VALIDATION: demasiadas hojas en el documento; no se crea "' + name + '".');
    }
    sheet = ss_().insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function readInvestments_(sheetName) {
  const sheet = getSheet_(sheetName);
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const values = range.getValues();
  const col = investmentColumnMap_(sheet);
  // Solo la variación necesita el texto mostrado para distinguir correctamente un
  // porcentaje. Antes getDisplayValues() duplicaba la lectura de toda la hoja.
  const displayVariations = col.variacion && range.getNumRows() > 1
    ? sheet.getRange(2, col.variacion, range.getNumRows() - 1, 1).getDisplayValues()
    : [];
  return values.slice(1)
    .map((row, index) => {
      let cantidad = parseNumber_(row[col.cantidad - 1]);
      const valor = parseNumber_(row[col.valor - 1]);
      let total = parseNumber_(col.total ? row[col.total - 1] : NaN);
      if (!Number.isFinite(total) && Number.isFinite(cantidad) && Number.isFinite(valor)) total = cantidad * valor;
      // Algunas fórmulas/API de Sheets entregan SHARES vacío o 0 durante el recálculo,
      // aunque PRICE y VALUE ya estén consolidados. No se pierde la posición: ambas
      // cifras determinan de forma inequívoca la cantidad real.
      if ((!Number.isFinite(cantidad) || cantidad === 0) && Number.isFinite(total) && total > 0 && Number.isFinite(valor) && valor > 0) {
        cantidad = total / valor;
      }
      return {
        rowNumber: index + 2,
        divisa: String(row[(col.divisa || 1) - 1] || '').trim() || 'EUR',
        data: row[col.data - 1],
        nombre: col.nombre ? row[col.nombre - 1] : row[col.data - 1],
        shortName: col.shortName ? String(row[col.shortName - 1] || '').trim() : '',
        tipo: row[col.tipo - 1],
        cantidad,
        valor,
        total,
        valorAnterior: parseNumber_(col.valorAnterior ? row[col.valorAnterior - 1] : NaN),
        variacion: normalizeInvestmentPercent_(col.variacion ? row[col.variacion - 1] : NaN, displayVariations[index] ? displayVariations[index][0] : '')
      };
    })
    .filter(row => row.data && row.nombre && isInvestmentPositionType_(row.tipo) && Number.isFinite(row.total) && row.total >= 0);
}

function investmentEstimateRuleHeaders_() {
  return ['ID', 'Activa', 'Día Mes', 'Descripción Movimiento', 'Data', 'Nombre', 'Short Name', 'Porcentaje', 'Importe Fijo'];
}

function investmentEstimateLedgerHeaders_() {
  return ['ID', 'Activo', 'Fecha Movimiento', 'SID Movimiento', 'Tipo Inversión', 'Data', 'Nombre', 'Short Name', 'Importe', 'Precio Usado', 'Shares Estimadas', 'Origen'];
}

// Asegura que las hojas existen; getOrCreateSheet_ ya escribe la cabecera al crearlas.
// NO normaliza cabeceras: esto lo llama una ruta de LECTURA, y resetSheetHeaders_
// reescribe la fila 1 y llega a borrar columnas. Cada descarga escribía en dos hojas
// del usuario. La normalización se queda en las rutas de escritura, que sí la piden.
function ensureInvestmentEstimateSheets_(rulesSheetName, ledgerSheetName) {
  return {
    rulesSheet: getOrCreateSheet_(rulesSheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, investmentEstimateRuleHeaders_()),
    ledgerSheet: getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_())
  };
}

function resetSheetHeaders_(sheet, headers) {
  if (!sheet) return;
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  if (lastColumn > headers.length) sheet.deleteColumns(headers.length + 1, lastColumn - headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureSheetHeaders_(sheet, headers) {
  if (!sheet) return;
  const width = Math.max(headers.length, sheet.getLastColumn() || 1);
  const existing = sheet.getRange(1, 1, 1, width).getValues()[0];
  const normalizedExisting = existing.map(function(v) { return normalizeType_(v); });
  let changed = false;
  headers.forEach(function(header, idx) {
    if (!normalizedExisting[idx]) { existing[idx] = header; changed = true; }
  });
  if (changed) sheet.getRange(1, 1, 1, existing.length).setValues([existing]);
}

function investmentModePreference_() {
  const saved = PropertiesService.getDocumentProperties().getProperty(INVESTMENT_MODE_PREFERENCE_KEY);
  return saved === 'estimated' ? 'estimated' : 'real';
}

function saveInvestmentModePreference_(mode) {
  const normalized = String(mode || '').trim() === 'estimated' ? 'estimated' : 'real';
  PropertiesService.getDocumentProperties().setProperty(INVESTMENT_MODE_PREFERENCE_KEY, normalized);
  return normalized;
}

// Helper compartido: busca cada columna del spec por su lista de nombres posibles
// (case/acentos-insensible vía normalizeType_) y devuelve el índice 1-based, o el
// fallback dado si ninguno de los nombres aparece en la cabecera de la hoja.
function mapSheetColumns_(sheet, spec) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0].map(normalizeType_);
  const result = {};
  Object.keys(spec).forEach(function(key) {
    const names = spec[key][0];
    const fallback = spec[key][1];
    let found = fallback;
    for (var i = 0; i < names.length; i++) {
      const idx = headers.indexOf(normalizeType_(names[i]));
      if (idx !== -1) { found = idx + 1; break; }
    }
    result[key] = found;
  });
  return result;
}

function estimateColumnMap_(sheet) {
  return mapSheetColumns_(sheet, {
    id: [['ID'], 1],
    active: [['Activa', 'Activo', 'Active'], 2],
    day: [['Día Mes', 'Dia Mes', 'Day Of Month'], 3],
    movementDescription: [['Descripción Movimiento', 'Descripcion Movimiento', 'Descripción', 'Descripcion'], 4],
    tipo: [['Tipo Inversión', 'Tipo Inversion', 'Tipo'], 0],
    data: [['Data', 'Ticker', 'Ticker/ISIN'], 5],
    nombre: [['Nombre', 'Name'], 6],
    shortName: [['Short Name', 'Short', 'Nombre Corto'], 7],
    percentage: [['Porcentaje', '%'], 8],
    fixedAmount: [['Importe Fijo', 'Fijo', 'Importe'], 9],
    order: [['Orden'], 0]
  });
}

function ledgerColumnMap_(sheet) {
  return mapSheetColumns_(sheet, {
    id: [['ID'], 1],
    active: [['Activo', 'Activa'], 2],
    fecha: [['Fecha Movimiento'], 3],
    sid: [['SID Movimiento'], 4],
    tipo: [['Tipo Inversión', 'Tipo Inversion', 'Tipo'], 5],
    data: [['Data', 'Ticker'], 6],
    nombre: [['Nombre'], 7],
    shortName: [['Short Name'], 8],
    importe: [['Importe'], 9],
    precio: [['Precio Usado'], 10],
    shares: [['Shares Estimadas'], 11],
    origen: [['Origen'], 12]
  });
}

function readInvestmentEstimateRules_(sheetName) {
  const sheet = ensureInvestmentEstimateSheets_(sheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET).rulesSheet;
  const values = sheet.getDataRange().getValues();
  const col = estimateColumnMap_(sheet);
  function cell(row, index) { return index ? row[index - 1] : ''; }
  return values.slice(1).map(function(row, index) {
    const id = String(cell(row, col.id) || '').trim() || ('rule_' + Utilities.getUuid());
    return {
      rowNumber: index + 2,
      id: id,
      activa: isTruthy_(cell(row, col.active)),
      dayOfMonth: optionalNumber_(cell(row, col.day)),
      movementConcept: 'Inversión',
      movementDescription: String(cell(row, col.movementDescription) || '').trim(),
      tipo: '',
      data: String(cell(row, col.data) || '').trim(),
      nombre: String(cell(row, col.nombre) || '').trim(),
      shortName: String(cell(row, col.shortName) || '').trim(),
      percentage: optionalNumber_(cell(row, col.percentage)),
      fixedAmount: optionalNumber_(cell(row, col.fixedAmount)),
      order: optionalNumber_(cell(row, col.order)) || index + 1
    };
  }).filter(function(rule) {
    return rule.movementDescription || rule.data || rule.nombre || rule.shortName || (Number.isFinite(rule.percentage) && rule.percentage > 0) || (Number.isFinite(rule.fixedAmount) && rule.fixedAmount > 0);
  });
}

function saveInvestmentEstimateRules_(rules, sheetName) {
  const sheet = getOrCreateSheet_(sheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, investmentEstimateRuleHeaders_());
  resetSheetHeaders_(sheet, investmentEstimateRuleHeaders_());
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  const rows = (rules || []).map(function(rule, index) {
    const id = String(rule.id || rule.ID || '').trim() || ('rule_' + Utilities.getUuid());
    return [
      id,
      Boolean(rule.activa !== false && rule.active !== false),
      safeFinite_(rule.dayOfMonth || rule.diaMes),
      rule.movementDescription || rule.descripcionMovimiento || '',
      rule.data || rule.ticker || '',
      rule.nombre || rule.name || '',
      rule.shortName || rule.short_name || rule.nombreCorto || '',
      safeFinite_(rule.percentage || rule.porcentaje),
      safeFinite_(rule.fixedAmount || rule.importeFijo || rule.fijo)
    ];
  });
  if (rows.length) setRangeValuesSafe_(sheet.getRange(2, 1, rows.length, investmentEstimateRuleHeaders_().length), rows.map(function(row) { return row.map(sanitizeCell_); }));
}

function readInvestmentEstimateLedger_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  const values = sheet.getDataRange().getValues();
  const col = ledgerColumnMap_(sheet);
  return values.slice(1).map(function(row, index) {
    return {
      rowNumber: index + 2,
      id: String(row[col.id - 1] || '').trim(),
      activo: row[col.active - 1] === '' ? true : isTruthy_(row[col.active - 1]),
      fechaMovimiento: normalizeDate_(row[col.fecha - 1]),
      sidMovimiento: String(row[col.sid - 1] || '').trim(),
      reglaId: '',
      tipo: String(row[col.tipo - 1] || '').trim(),
      data: String(row[col.data - 1] || '').trim(),
      nombre: String(row[col.nombre - 1] || '').trim(),
      shortName: String(row[col.shortName - 1] || '').trim(),
      importe: parseNumber_(row[col.importe - 1]),
      precioUsado: parseNumber_(row[col.precio - 1]),
      sharesEstimadas: parseNumber_(row[col.shares - 1]),
      origen: String(row[col.origen - 1] || '').trim(),
      createdAt: '',
      movimiento: ''
    };
  }).filter(function(row) { return row.id && row.activo !== false && Number.isFinite(row.sharesEstimadas); });
}

function clearInvestmentEstimates_(ledgerSheetName, movementSheetName) {
  const sheet = getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  ensureSheetHeaders_(sheet, investmentEstimateLedgerHeaders_());
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
}

function investmentEstimateLedgerKeys_(sheet) {
  const map = {};
  if (sheet.getLastRow() < 2) return map;
  const col = ledgerColumnMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 12)).getValues();
  values.forEach(function(row) {
    const id = String(row[col.id - 1] || '').trim();
    const sid = String(row[col.sid - 1] || '').trim();
    const data = String(row[col.data - 1] || '').trim();
    const amount = String(row[col.importe - 1] || '').trim();
    if (id) map[id] = true;
    if (sid && data && amount) map[[sid, data, amount].join('|')] = true;
  });
  return map;
}

function findInvestmentForEstimateRule_(rule, investments) {
  const data = normalizeType_(rule.data || '');
  const shortName = normalizeType_(rule.shortName || '');
  const name = normalizeType_(rule.nombre || '');
  return (investments || []).find(function(item) { return data && normalizeType_(item.data) === data; })
    || (investments || []).find(function(item) { return shortName && normalizeType_(item.shortName || item.nombre) === shortName; })
    || (investments || []).find(function(item) { return name && normalizeType_(item.nombre) === name; })
    || null;
}

function saveInvestmentEstimateAllocations_(ledgerSheetName, entries) {
  const sheet = getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  resetSheetHeaders_(sheet, investmentEstimateLedgerHeaders_());
  const existingIds = investmentEstimateLedgerKeys_(sheet);
  const saved = [];
  const rows = [];
  (entries || []).forEach(function(entry) {
    const id = String(entry.id || '').trim() || ('est_' + Utilities.getUuid());
    const key = id || [entry.sidMovimiento || '', entry.data || '', entry.importe || '', entry.precioUsado || ''].join('|');
    if (existingIds[key]) return;
    const amount = parseNumber_(entry.importe);
    const price = parseNumber_(entry.precioUsado);
    const shares = parseNumber_(entry.sharesEstimadas) || (amount && price ? amount / price : NaN);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0 || !Number.isFinite(shares) || shares <= 0) return;
    const date = new Date(entry.fechaMovimiento || entry.fecha || new Date());
    const row = [
      id,
      entry.activo !== false,
      Number.isNaN(date.getTime()) ? new Date() : date,
      String(entry.sidMovimiento || '').trim(),
      entry.tipo || '',
      entry.data || '',
      entry.nombre || entry.data || '',
      entry.shortName || entry.nombre || entry.data || '',
      amount,
      price,
      shares,
      entry.origen || 'reparto confirmado'
    ];
    rows.push(row.map(sanitizeCell_));
    saved.push(entry);
    existingIds[key] = true;
  });
  // Una escritura para todo el reparto. La antigua versión escribía dentro del bucle y eran hasta
  // 500 llamadas a la API en una sola operación.
  if (rows.length) {
    setRangeValuesSafe_(sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length), rows);
  }
  return saved;
}

function buildEstimatedInvestments_(investmentSheetName, ledgerSheetName) {
  const investments = readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET).map(function(item) { return Object.assign({}, item); });
  const ledger = readInvestmentEstimateLedger_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET);
  ledger.forEach(function(entry) {
    const shares = parseNumber_(entry.sharesEstimadas);
    if (!Number.isFinite(shares) || shares <= 0) return;
    let match = findInvestmentForEstimateRule_(entry, investments);
    if (match) {
      match.cantidad = (parseNumber_(match.cantidad) || 0) + shares;
      const price = parseNumber_(match.valor) || parseNumber_(entry.precioUsado) || 0;
      match.valor = price;
      match.total = match.cantidad * price;
    } else {
      const price = parseNumber_(entry.precioUsado) || 0;
      investments.push({ rowNumber: null, divisa: 'EUR', data: entry.data || '', nombre: entry.nombre || entry.data || 'Estimación', shortName: entry.shortName || '', tipo: entry.tipo || 'Inversión', cantidad: shares, valor: price, total: shares * price, valorAnterior: price, variacion: 0 });
    }
  });
  return investments;
}

function buildInvestmentVariationSummaryFromInvestments_(investments, categories) {
  const totals = { all: emptyVariationBucket_(), order: (categories || []).slice() };
  (categories || []).forEach(function(type) { totals[type] = emptyVariationBucket_(); });
  (investments || []).forEach(function(item) {
    const type = String(item.tipo || '').trim();
    if (!isInvestmentPositionType_(type)) return;
    const normalizedType = (categories || []).find(function(cat) { return normalizeType_(cat) === normalizeType_(type); }) || type;
    if (!totals[normalizedType]) { totals[normalizedType] = emptyVariationBucket_(); totals.order.push(normalizedType); }
    const name = String(item.shortName || item.nombre || item.data || '').trim();
    const isCash = isCashInvestment_(item);
    const quantity = parseNumber_(item.cantidad);
    const currentPrice = parseNumber_(item.valor);
    const previousPrice = parseNumber_(item.valorAnterior);
    const currentTotal = parseNumber_(item.total);
    const total = Number.isFinite(currentTotal)
      ? currentTotal
      : (Number.isFinite(quantity) && Number.isFinite(currentPrice) ? quantity * currentPrice : NaN);
    const previousTotal = isCash
      ? (Number.isFinite(previousPrice) ? previousPrice : total)
      : (Number.isFinite(quantity) && Number.isFinite(previousPrice) && previousPrice > 0 ? quantity * previousPrice : total);
    if (!Number.isFinite(total) || !Number.isFinite(previousTotal)) return;
    const variation = total - previousTotal;
    const position = { name: name, type: normalizedType, isCash: isCash, price: currentPrice, current: total, previous: previousTotal, variation: variation, pct: percentageChange_(total, previousTotal) };
    addVariationRow_(totals.all, position);
    addVariationRow_(totals[normalizedType], position);
  });
  Object.keys(totals).forEach(function(key) { if (key !== 'order') totals[key].positions.sort(function(a, b) { return Number(b.current || 0) - Number(a.current || 0); }); });
  return totals;
}

function isTruthy_(value) {
  if (value === true) return true;
  const normalized = normalizeType_(value);
  return normalized === 'true' || normalized === 'si' || normalized === 'sí' || normalized === '1' || normalized === 'yes' || normalized === 'x';
}

function optionalNumber_(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  const n = parseNumber_(value);
  return Number.isFinite(n) ? n : NaN;
}

function safeFinite_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && value.trim() === '') return '';
  const n = parseNumber_(value);
  return Number.isFinite(n) ? n : '';
}

function readInvestmentGoals_(sheetName) {
  const sheet = getSheet_(sheetName);
  const goals = { expenseMonthly: 0, investmentMonthly: 0, monthly: 0, yearly: 0, total: 0 };
  if (!sheet) return goals;
  const lastRow = sheet.getLastRow();
  const values = lastRow ? sheet.getRange(1, 1, lastRow, 2).getDisplayValues() : [];
  values.slice(1).forEach(row => {
    const key = normalizeGoalKey_(row[0]);
    const value = parseNumber_(row[1]);
    if (key && Number.isFinite(value)) goals[key] = value;
  });
  if (!goals.investmentMonthly && goals.monthly) goals.investmentMonthly = goals.monthly;
  if (!goals.monthly && goals.investmentMonthly) goals.monthly = goals.investmentMonthly;
  return goals;
}

function readBanks_(sheetName) {
  const sheet = requireSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const values = lastRow ? sheet.getRange(1, 1, lastRow, 2).getDisplayValues() : [];
  return values.slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      cuenta: String(row[0] || '').trim(),
      dinero: parseNumber_(row[1])
    }))
    .filter(row => row.cuenta && Number.isFinite(row.dinero));
}

function saveBanks_(banks, sheetName) {
  const sheet = requireSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  const rowByAccount = {};
  rows.forEach(function(row, index) {
    const account = String(row[0] || '').trim();
    if (account) rowByAccount[normalizeType_(account)] = index;
  });
  const appendRows = [];
  const changedRows = [];
  banks.forEach(item => {
    if (!item || !item.cuenta) return;
    const amount = parseNumber_(item.dinero);
    if (!Number.isFinite(amount)) return;
    // El rowNumber del cliente puede estar desfasado si la hoja cambió: se verifica
    // que esa fila sea de la misma cuenta antes de escribir encima; si no, se busca
    // por nombre para no machacar una fila ajena.
    let rowIndex = Number(item.rowNumber || 0) - 2;
    if (rowIndex < 0 || rowIndex >= rows.length || String(rows[rowIndex][0] || '').trim() !== String(item.cuenta).trim()) {
      rowIndex = rowByAccount[normalizeType_(item.cuenta)];
    }
    if (Number.isInteger(rowIndex) && rowIndex >= 0) {
      const next = [sanitizeCell_(item.cuenta), amount];
      if (String(rows[rowIndex][0] || '') !== String(next[0]) || Number(rows[rowIndex][1]) !== amount) {
        rows[rowIndex] = next;
        changedRows.push(rowIndex);
      }
    } else {
      appendRows.push([sanitizeCell_(item.cuenta), amount]);
    }
  });
  writeBankRowUpdates_(sheet, rows, changedRows);
  if (appendRows.length) setRangeValuesSafe_(sheet.getRange(lastRow + 1, 1, appendRows.length, 2), appendRows);
}

function writeBankRowUpdates_(sheet, rows, indexes) {
  const ordered = Array.from(new Set(indexes || [])).sort(function(a, b) { return a - b; });
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1] === ordered[end] + 1) end += 1;
    const first = ordered[start];
    const count = end - start + 1;
    setRangeValuesSafe_(sheet.getRange(first + 2, 1, count, 2), rows.slice(first, first + count));
    start = end + 1;
  }
}

function transferBank_(sheetName, from, to, amount) {
  const transferAmount = Math.abs(Number(amount || 0));
  if (!from || !to || from === to || !Number.isFinite(transferAmount) || transferAmount <= 0) throw new Error('Invalid transfer');
  adjustBankBalances_(sheetName, [{ account: from, delta: -transferAmount }, { account: to, delta: transferAmount }]);
}

function adjustBank_(sheetName, account, delta) {
  if (!account || !Number.isFinite(delta) || delta === 0) return;
  adjustBankBalances_(sheetName, [{ account: account, delta: delta }]);
}

function adjustBankBalances_(sheetName, changes) {
  const pending = (changes || []).filter(function(change) {
    return change && change.account && Number.isFinite(Number(change.delta)) && Number(change.delta) !== 0;
  });
  if (!pending.length) return;
  const sheet = requireSheet_(sheetName);
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0) throw new Error('Bank account not found');
  const rows = sheet.getRange(2, 1, rowCount, 2).getValues();
  const rowByAccount = {};
  rows.forEach(function(row, index) {
    const account = String(row[0] || '').trim();
    if (account) rowByAccount[normalizeType_(account)] = index;
  });
  const changedRows = [];
  pending.forEach(function(change) {
    const rowIndex = rowByAccount[normalizeType_(change.account)];
    if (!Number.isInteger(rowIndex)) throw new Error(`Bank account not found: ${change.account}`);
    const current = parseNumber_(rows[rowIndex][1]);
    rows[rowIndex][1] = (Number.isFinite(current) ? current : 0) + Number(change.delta);
    changedRows.push(rowIndex);
  });
  writeBankAmountUpdates_(sheet, rows, changedRows);
}

function writeBankAmountUpdates_(sheet, rows, indexes) {
  const ordered = Array.from(new Set(indexes || [])).sort(function(a, b) { return a - b; });
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1] === ordered[end] + 1) end += 1;
    const first = ordered[start];
    const count = end - start + 1;
    setRangeValuesSafe_(sheet.getRange(first + 2, 2, count, 1), rows.slice(first, first + count).map(function(row) { return [row[1]]; }));
    start = end + 1;
  }
}

function findBankRow_(sheet, account) {
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0) return 0;
  const values = sheet.getRange(2, 1, rowCount, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(account).trim()) return i + 2;
  }
  return 0;
}

function renameAccountTextValue_(value, oldName, newName) {
  const text = String(value || '').trim();
  const normalizedOld = String(oldName || '').trim();
  if (!text || !normalizedOld) return { value: text, changed: false };
  if (text === normalizedOld) return { value: newName, changed: true };
  const parts = parseTransferAccountText_(text);
  if (parts.from || parts.to) {
    let changed = false;
    const from = parts.from === normalizedOld ? newName : parts.from;
    const to = parts.to === normalizedOld ? newName : parts.to;
    if (from !== parts.from || to !== parts.to) changed = true;
    if (changed) return { value: `${from} → ${to}`, changed: true };
  }
  return { value: text, changed: false };
}

function renameAccountInMovementSheet_(sheetName, oldName, newName) {
  const sheet = getSheet_(sheetName);
  if (!sheet) return 0;
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0 || sheet.getLastColumn() < 9) return 0;
  const accountRange = sheet.getRange(2, 9, rowCount, 1);
  const accountValues = accountRange.getValues();
  const descRange = sheet.getRange(2, 7, rowCount, 1);
  const descValues = descRange.getValues();
  let changed = 0;
  for (let i = 0; i < rowCount; i++) {
    const accountResult = renameAccountTextValue_(accountValues[i][0], oldName, newName);
    if (!accountResult.changed) continue;
    accountValues[i][0] = accountResult.value;
    const descResult = renameAccountTextValue_(descValues[i][0], oldName, newName);
    if (descResult.changed) descValues[i][0] = descResult.value;
    changed++;
  }
  if (changed) {
    // Escrituras protegidas: la columna 9 (CUENTA) es justo la que suele llevar un
    // desplegable, y aquí se le escribe texto de par de cuentas "A → B".
    setRangeValuesSafe_(accountRange, accountValues);
    setRangeValuesSafe_(descRange, descValues);
  }
  return changed;
}

function reassignFutureMovementsAccount_(sheetName, oldName, newName) {
  // La reasignación mueve TODOS los movimientos futuros de la cuenta antigua a la
  // nueva (es lo que pide el diálogo al borrar la cuenta). Los `sids` llegan como
  // pista del cliente, pero no dependemos de ellos: hacerlo por texto de cuenta
  // migra también filas sin SID (creadas a mano o antes de existir la columna),
  // evitando que el cambio quede aplicado en caché pero no en Sheets.
  const normalizedOld = String(oldName || '').trim();
  const normalizedNew = String(newName || '').trim();
  if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) return 0;
  return renameAccountInMovementSheet_(sheetName, normalizedOld, normalizedNew);
}

function renameAccount_(bankSheetName, movementSheetName, futureMovementSheetName, oldName, newName) {
  const normalizedOld = String(oldName || '').trim();
  const normalizedNew = String(newName || '').trim();
  if (!normalizedOld || !normalizedNew) throw new Error('Nombre de cuenta inválido');
  if (normalizedOld === normalizedNew) return { movementsUpdated: 0, futureMovementsUpdated: 0 };
  const bankSheet = requireSheet_(bankSheetName);
  const bankRow = findBankRow_(bankSheet, normalizedOld);
  if (!bankRow) {
    // Reintento de una operación ya aplicada (p.ej. tras un timeout de red): si la cuenta
    // antigua ya no existe pero la nueva sí, asumimos que el renombrado ya se completó.
    if (findBankRow_(bankSheet, normalizedNew)) return { movementsUpdated: 0, futureMovementsUpdated: 0, alreadyApplied: true };
    throw new Error(`Bank account not found: ${normalizedOld}`);
  }
  if (findBankRow_(bankSheet, normalizedNew)) throw new Error(`Ya existe una cuenta llamada ${normalizedNew}`);
  setCellValueSafe_(bankSheet.getRange(bankRow, 1), sanitizeCell_(normalizedNew));
  const movementsUpdated = renameAccountInMovementSheet_(movementSheetName, normalizedOld, normalizedNew);
  const futureMovementsUpdated = renameAccountInMovementSheet_(futureMovementSheetName, normalizedOld, normalizedNew);
  return { movementsUpdated, futureMovementsUpdated };
}

function accountReferenceCountInMovementSheet_(sheetName, account) {
  const sheet = getSheet_(sheetName);
  if (!sheet) return 0;
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0 || sheet.getLastColumn() < 9) return 0;
  const values = sheet.getRange(2, 9, rowCount, 1).getValues();
  const normalized = String(account).trim();
  return values.filter(row => String(row[0]).trim() === normalized).length;
}

function deleteAccount_(bankSheetName, movementSheetName, futureMovementSheetName, account, force) {
  const normalized = String(account || '').trim();
  if (!normalized) throw new Error('Nombre de cuenta inválido');
  const movementsCount = accountReferenceCountInMovementSheet_(movementSheetName, normalized);
  const futureMovementsCount = accountReferenceCountInMovementSheet_(futureMovementSheetName, normalized);
  if (!force && (movementsCount || futureMovementsCount)) {
    throw new Error(`La cuenta tiene ${movementsCount + futureMovementsCount} movimientos asociados. Confirma para borrar igualmente.`);
  }
  const bankSheet = requireSheet_(bankSheetName);
  const row = findBankRow_(bankSheet, normalized);
  if (!row) return { movementsCount, futureMovementsCount, alreadyApplied: true };
  bankSheet.deleteRow(row);
  return { movementsCount, futureMovementsCount };
}


function updateInvestment_(investment, sheetName, previousInvestment) {
  if (!investment) throw new Error('Missing investment');
  const sheet = requireSheet_(sheetName);

  const rowNumber = Number(investment.rowNumber || previousInvestment && previousInvestment.rowNumber || 0);
  let targetRow = rowNumber >= 2 && rowNumber <= sheet.getLastRow()
    ? rowNumber
    : findInvestmentRow_(sheet, investment, previousInvestment);
  const isNewInvestment = targetRow < 2 || targetRow > sheet.getLastRow();

  if (!isInvestmentPositionType_(investment.tipo)) throw new Error('Investment type not editable');
  if (isNewInvestment) {
    const row = new Array(Math.max(sheet.getLastColumn(), 9)).fill('');
    sheet.appendRow(row);
    targetRow = sheet.getLastRow();
  }

  writeInvestmentEditableFields_(sheet, targetRow, investment);
  if (isNewInvestment && !isCashInvestment_(investment)) {
    // Para una posición nueva solo escribimos campos base + Yahoo PRICE/LAST PRICE.
    // VALUE / VARIATION se dejan a las fórmulas de la hoja.
    updateInvestmentQuoteRowFromYahoo_(sheet, targetRow);
  }
}

function writeInvestmentEditableFields_(sheet, row, item) {
  const col = investmentColumnMap_(sheet);
  const isCash = isCashInvestment_(item);
  if (col.divisa) setCellValueSafe_(sheet.getRange(row, col.divisa), sanitizeCell_(normalizeInvestmentCurrency_(item.divisa || 'EUR')));
  if (col.data) setCellValueSafe_(sheet.getRange(row, col.data), sanitizeCell_(item.data || ''));
  if (col.nombre) setCellValueSafe_(sheet.getRange(row, col.nombre), sanitizeCell_(item.nombre || ''));
  if (col.shortName) setCellValueSafe_(sheet.getRange(row, col.shortName), sanitizeCell_(item.shortName || ''));
  if (col.tipo) setCellValueSafe_(sheet.getRange(row, col.tipo), sanitizeCell_(item.tipo || ''));
  if (!isCash && col.cantidad) setCellValueSafe_(sheet.getRange(row, col.cantidad), Number(item.cantidad || 0));
  saveCashInvestmentValue_(sheet, row, item);
}

function isCashInvestment_(item) {
  const name = String(item && (item.nombre || item.name || item.NAME) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ticker = String(item && (item.data || item.DATA) || '').trim();
  return name.indexOf('efectivo') !== -1 || ticker === '---';
}

function saveCashInvestmentValue_(sheet, row, item) {
  if (!isCashInvestment_(item)) return;
  const col = investmentColumnMap_(sheet);
  const cash = parseNumber_(item.total ?? item.value ?? item.VALUE ?? item.valorTotal);
  if (!Number.isFinite(cash)) return;
  if (col.total) setCellValueSafe_(sheet.getRange(row, col.total), cash);
  if (col.valorAnterior) setCellValueSafe_(sheet.getRange(row, col.valorAnterior), cash);
}

function deleteInvestment_(investment, sheetName, rowNumber) {
  const sheet = requireSheet_(sheetName);
  let targetRow = Number(rowNumber || investment && investment.rowNumber || 0);
  if (targetRow < 2 || targetRow > sheet.getLastRow()) {
    targetRow = findInvestmentRow_(sheet, investment || {}, null);
  }
  if (targetRow < 2 || targetRow > sheet.getLastRow()) throw new Error('Investment not found');
  sheet.deleteRow(targetRow);
}

function findInvestmentRow_(sheet, investment, previousInvestment) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const col = investmentColumnMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const candidates = [investment, previousInvestment].filter(Boolean);
  for (const candidate of candidates) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (
        String(row[col.data - 1]).trim() === String(candidate.data || '').trim() &&
        String(row[(col.nombre || col.data) - 1]).trim() === String(candidate.nombre || '').trim()
      ) {
        return i + 2;
      }
    }
  }
  return 0;
}

function updateInvestmentQuotesFromYahoo(sheetName) {
  return updateInvestmentQuotesFromYahooOptimized_(sheetName || DEFAULT_INVESTMENT_SHEET);
}

function updateInvestmentQuoteRowFromYahoo_(sheet, rowNumber) {
  const col = investmentColumnMap_(sheet);
  const ticker = String(sheet.getRange(rowNumber, col.data).getValue() || '').trim();
  const type = String(sheet.getRange(rowNumber, col.tipo).getValue() || '').trim();
  const name = String(sheet.getRange(rowNumber, col.nombre).getValue() || '').trim();
  if (!ticker || ticker === '---' || !isInvestmentPositionType_(type) || isCashInvestment_({ data: ticker, nombre: name })) return null;

  const rates = getCurrencyRates_();
  const alias = yahooTickerAlias_(ticker);
  const quote = getYahooQuotes_([alias])[alias];
  if (!quote) return null;
  const sourceCurrency = normalizeInvestmentCurrency_(sheet.getRange(rowNumber, col.divisa || 1).getValue() || quote.currency || 'EUR');
  const priceEur = convertQuotePriceToEur_(quote.regularMarketPrice, sourceCurrency, rates);
  const previousEur = convertQuotePriceToEur_(quote.previousClose, sourceCurrency, rates);
  if (Number.isFinite(priceEur) && col.valor) setCellValueSafe_(sheet.getRange(rowNumber, col.valor), priceEur);
  if (Number.isFinite(previousEur) && col.valorAnterior) setCellValueSafe_(sheet.getRange(rowNumber, col.valorAnterior), previousEur);
  updateCurrencyHelperRow_(sheet, col, rates);
  return { row: rowNumber, ticker, price: priceEur, previousClose: previousEur, currency: sourceCurrency, yahooCurrency: quote.currency };
}

function updateInvestmentQuotesFromYahooOptimized_(sheetName) {
  const sheet = requireSheet_(sheetName || DEFAULT_INVESTMENT_SHEET);
  const col = investmentColumnMap_(sheet);
  const rates = getCurrencyRates_();
  const lastRow = sheet.getLastRow();
  const rowCount = Math.max(0, lastRow - 1);
  if (!rowCount) return { prices: [], previous: [] };

  const width = Math.max(sheet.getLastColumn(), col.valorAnterior || 1, col.valor || 1);
  const values = sheet.getRange(2, 1, rowCount, width).getValues();
  const rowsToUpdate = values
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => {
      const ticker = String(row[col.data - 1] || '').trim();
      const type = String(row[col.tipo - 1] || '').trim();
      const name = String(row[col.nombre - 1] || '').trim();
      return ticker && ticker !== '---' && isInvestmentPositionType_(type) && !isCashInvestment_({ data: ticker, nombre: name });
    });

  const tickers = Array.from(new Set(rowsToUpdate.map(({ row }) => yahooTickerAlias_(String(row[col.data - 1] || '').trim()))));
  const quotes = getYahooQuotes_(tickers);
  const prices = [];
  const previous = [];
  const pendingPrices = {};
  const pendingPrevious = {};

  rowsToUpdate.forEach(({ row, rowNumber }) => {
    const ticker = String(row[col.data - 1] || '').trim();
    const quote = quotes[yahooTickerAlias_(ticker)];
    if (!quote) return;
    const sourceCurrency = normalizeInvestmentCurrency_(row[(col.divisa || 1) - 1] || quote.currency || 'EUR');
    const priceEur = convertQuotePriceToEur_(quote.regularMarketPrice, sourceCurrency, rates);
    const previousEur = convertQuotePriceToEur_(quote.previousClose, sourceCurrency, rates);

    if (Number.isFinite(priceEur)) {
      // Yahoo solo actualiza PRICE. No se escribe VALUE: esa columna queda para fórmulas de Sheets.
      pendingPrices[rowNumber] = priceEur;
      prices.push({ row: rowNumber, ticker, price: priceEur, currency: sourceCurrency, yahooCurrency: quote.currency });
    }
    if (Number.isFinite(previousEur) && col.valorAnterior) {
      // Yahoo solo actualiza LAST PRICE. No se recalculan VALUE/VARIATION aquí.
      pendingPrevious[rowNumber] = previousEur;
      previous.push({ row: rowNumber, ticker, previousClose: previousEur, currency: sourceCurrency, yahooCurrency: quote.currency });
    }
  });

  // Una escritura por columna en vez de dos por fila: con N posiciones eran 2N
  // llamadas a la API. Las filas sin cotización conservan su valor actual.
  writeColumnUpdates_(sheet, col.valor, 2, rowCount, pendingPrices, values, col.valor);
  if (col.valorAnterior) writeColumnUpdates_(sheet, col.valorAnterior, 2, rowCount, pendingPrevious, values, col.valorAnterior);

  updateCurrencyHelperRow_(sheet, col, rates);
  // Los tickers que no se pudieron consultar viajan en la respuesta para que la app
  // pueda avisar, en vez de dar por buena una actualización incompleta.
  const failures = quotes.__failures || [];
  return { prices, previous, failures, failed: failures.length };
}

function investmentColumnMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(value => normalizeHeader_(value));
  const find = names => {
    for (let i = 0; i < headers.length; i++) {
      if (names.indexOf(headers[i]) !== -1) return i + 1;
    }
    return 0;
  };
  const map = {
    divisa: find(['divisa', 'moneda', 'currency']),
    data: find(['data', 'ticker', 'isin']),
    nombre: find(['nombre', 'name']),
    shortName: find(['short name', 'shortname', 'nombre corto', 'nombre reducido']),
    tipo: find(['tipo', 'type']),
    cantidad: find(['shares', 'cantidad', 'qty', 'quantity']),
    valor: find(['valor', 'precio', 'price']),
    total: find(['valor total eur', 'valor total €', 'valor total', 'total', 'value']),
    valorAnterior: find(['valor anterior', 'precio anterior', 'previous close', 'last price']),
    variacion: find(['% variacion', 'variacion', '% variación', 'variation'])
  };
  ['divisa', 'data', 'tipo', 'cantidad', 'valor', 'valorAnterior'].forEach(key => {
    if (!map[key]) throw new Error(`Falta columna en Inversiones: ${key === 'cantidad' ? 'SHARES' : key}`);
  });
  return map;
}

function normalizeHeader_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/€/g, 'eur')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInvestmentCurrency_(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return 'EUR';
  if (text === '€' || text === 'EURO' || text === 'EUROS') return 'EUR';
  if (text === '$' || text === 'DOLAR' || text === 'DÓLAR' || text === 'DOLARES' || text === 'DÓLARES') return 'USD';
  if (text === 'GBPENCE' || text === 'GBX') return 'GBX';
  return text;
}

function getYahooQuotes_(tickers) {
  const uniqueTickers = Array.from(new Set((tickers || []).map(yahooTickerAlias_).filter(Boolean)));
  const out = {};
  if (!uniqueTickers.length) return out;
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(uniqueTickers.join(','))}`;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText());
      const rows = json && json.quoteResponse && json.quoteResponse.result || [];
      rows.forEach(item => {
        const symbol = item.symbol;
        const price = Number(item.regularMarketPrice || item.ask || item.bid || item.regularMarketPreviousClose);
        const previous = Number(item.regularMarketPreviousClose || item.regularMarketPrice);
        if (symbol && Number.isFinite(price)) {
          out[symbol] = { ticker: symbol, yahooTicker: symbol, currency: item.currency || '', regularMarketPrice: price, previousClose: previous };
        }
      });
    }
  } catch (err) {
    // Fallback individual abajo.
  }
  // Un ticker que Yahoo no reconoce (o un fallo puntual de red) no debe tumbar la
  // actualización entera: antes el throw dentro del forEach abortaba también los
  // que sí se habían resuelto. Los fallos se acumulan y se informan aparte.
  const failures = [];
  // fetchAll lanza las peticiones a la vez. En serie eran N llamadas HTTP encadenadas
  // dentro del script lock, y con el endpoint por lotes de Yahoo devolviendo 401/429 a
  // menudo, ese respaldo es el caso normal, no la excepción.
  const pending = uniqueTickers.filter(ticker => !out[ticker]);
  if (pending.length) {
    const requests = pending.map(ticker => yahooQuoteRequest_(ticker));
    let responses = [];
    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (err) {
      pending.forEach(ticker => failures.push({ ticker: ticker, error: String(err && err.message || err) }));
      responses = [];
    }
    responses.forEach((response, index) => {
      const ticker = pending[index];
      try {
        out[ticker] = parseYahooQuote_(ticker, response);
      } catch (err) {
        failures.push({ ticker: ticker, error: String(err && err.message || err) });
      }
    });
  }
  if (failures.length) out.__failures = failures;
  return out;
}

function yahooQuoteRequest_(ticker) {
  return {
    url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTickerAlias_(ticker))}`,
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  };
}

function parseYahooQuote_(ticker, res) {
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Yahoo error ${code} para ${ticker}`);
  const json = JSON.parse(res.getContentText());
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  const meta = result && result.meta;
  if (!meta) throw new Error(`Respuesta Yahoo inválida para ${ticker}`);
  return {
    ticker,
    yahooTicker: yahooTickerAlias_(ticker),
    currency: meta.currency || '',
    regularMarketPrice: Number(meta.regularMarketPrice || meta.previousClose),
    previousClose: Number(meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice)
  };
}

function yahooTickerAlias_(ticker) {
  const text = String(ticker || '').trim();
  if (text === 'EUR-USD' || text === 'EUR/USD') return 'EURUSD=X';
  if (text === 'USD-EUR' || text === 'USD/EUR') return 'USDEUR=X';
  return text;
}

// Los tipos de cambio son los mismos para toda la ejecución, pero se volvían a pedir a
// Yahoo en cada llamada — incluida una por cada fila nueva de inversión.
var currencyRatesCache_ = null;

function getCurrencyRates_() {
  if (currencyRatesCache_) return currencyRatesCache_;
  const rates = { EUR: 1 };
  const quotes = getYahooQuotes_(['EURUSD=X', 'GBPEUR=X', 'EURCHF=X']);
  const eurUsd = Number(quotes['EURUSD=X'] && quotes['EURUSD=X'].regularMarketPrice);
  rates.eurUsd = Number.isFinite(eurUsd) && eurUsd ? eurUsd : 1;
  rates.USD = rates.eurUsd ? 1 / rates.eurUsd : 1;
  const gbpEur = Number(quotes['GBPEUR=X'] && quotes['GBPEUR=X'].regularMarketPrice);
  rates.gbpEur = Number.isFinite(gbpEur) && gbpEur ? gbpEur : 1;
  rates.GBP = rates.gbpEur || 1;
  const eurChf = Number(quotes['EURCHF=X'] && quotes['EURCHF=X'].regularMarketPrice);
  rates.CHF = Number.isFinite(eurChf) && eurChf ? 1 / eurChf : 1;
  currencyRatesCache_ = rates;
  return rates;
}

function convertQuotePriceToEur_(price, currency, rates) {
  const value = Number(price);
  if (!Number.isFinite(value)) return NaN;
  const rawCurrency = String(currency || '').trim();
  const cur = normalizeInvestmentCurrency_(rawCurrency);
  if (!cur || cur === 'EUR') return value;
  if (cur === 'USD') return value * Number(rates.USD || 1);
  if (cur === 'GBX') return (value / 100) * Number(rates.GBP || rates.gbpEur || 1);
  if (cur === 'GBP') return value * Number(rates.GBP || rates.gbpEur || 1);
  if (cur === 'CHF') return value * Number(rates.CHF || 1);
  return value;
}

// Escribe de una vez una columna entera, conservando el valor actual de las filas que
// no traen actualización.
function writeColumnUpdates_(sheet, column, firstRow, rowCount, updatesByRow, currentValues, currentColumn) {
  if (!column || !rowCount) return;
  const keys = Object.keys(updatesByRow);
  if (!keys.length) return;
  const out = [];
  for (let i = 0; i < rowCount; i++) {
    const rowNumber = firstRow + i;
    const current = currentValues[i] ? currentValues[i][currentColumn - 1] : '';
    out.push([Object.prototype.hasOwnProperty.call(updatesByRow, rowNumber) ? updatesByRow[rowNumber] : current]);
  }
  setRangeValuesSafe_(sheet.getRange(firstRow, column, rowCount, 1), out);
}

function updateCurrencyHelperRow_(sheet, col, rates) {
  const lastRow = Math.min(sheet.getLastRow(), 10);
  if (lastRow < 2) return;
  // Una lectura de rango en vez de hasta nueve getValue de una celda cada uno.
  const tickers = sheet.getRange(2, col.data, lastRow - 1, 1).getValues();
  for (let i = 0; i < tickers.length; i++) {
    const ticker = String(tickers[i][0] || '').trim();
    if (ticker === 'EUR-USD' || ticker === 'EUR/USD') {
      setCellValueSafe_(sheet.getRange(i + 2, col.valor), Number(rates.eurUsd || 0));
      return;
    }
  }
}

function sendDailyMoneyManagementNotifications() {
  updateInvestmentQuotesFromYahoo(DEFAULT_INVESTMENT_SHEET);
  sendInvestmentNotificationMessages_(DEFAULT_INVESTMENT_SHEET, {
    mode: 'estimated',
    rulesSheet: DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET,
    ledgerSheet: DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET,
    movementSheet: DEFAULT_MOVEMENT_SHEET,
    investmentTotalsSheet: DEFAULT_INVESTMENT_TOTALS_SHEET
  });
}

function sendInvestmentNotificationMessages_(investmentSheet, options) {
  options = options || {};
  let summary;
  if (options.mode === 'estimated') {
    const categories = readInvestmentCategoriesForTotals_(options.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheet || DEFAULT_INVESTMENT_SHEET);
    summary = buildInvestmentVariationSummaryFromInvestments_(buildEstimatedInvestments_(investmentSheet || DEFAULT_INVESTMENT_SHEET, options.ledgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET), categories);
  } else {
    summary = buildInvestmentVariationSummary_(investmentSheet || DEFAULT_INVESTMENT_SHEET);
  }
  summary.isEstimated = options.mode === 'estimated';
  summary.costs = investmentCostsByType_(options.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET);
  sendTelegramMessage_(formatGeneralInvestmentMessage_(summary));
  (summary.order || []).forEach(type => sendTelegramMessage_(formatTypeInvestmentMessage_(summary, type)));
}

function sendInvestmentNotificationsOnce_(requestId, sendFn) {
  if (!requestId) {
    sendFn();
    return { sent: true, duplicate: false };
  }
  return withScriptLock_(function() {
    const props = PropertiesService.getScriptProperties();
    let processed = [];
    try {
      processed = JSON.parse(props.getProperty(PROCESSED_NOTIFICATION_REQUESTS_KEY) || '[]');
    } catch (err) {
      processed = [];
    }
    if (processed.some(function(item) { return item && item.id === requestId; })) {
      return { sent: false, duplicate: true };
    }
    // La petición se marca como procesada ANTES de enviar: sendFn manda N mensajes
    // de Telegram y, si fallaba a mitad, el reintento reenviaba los ya entregados.
    // Para un aviso informativo diario es preferible perderlo una vez a duplicarlo.
    processed.push({ id: requestId, at: new Date().toISOString() });
    props.setProperty(PROCESSED_NOTIFICATION_REQUESTS_KEY, JSON.stringify(processed.slice(-100)));
    sendFn();
    return { sent: true, duplicate: false };
  });
}

function setupDailyMoneyManagementNotifications() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'sendDailyMoneyManagementNotifications')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('sendDailyMoneyManagementNotifications')
    .timeBased()
    .everyDays(1)
    .atHour(DAILY_NOTIFICATION_HOUR)
    .create();
}

function getTelegramChatId() {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('Configura TELEGRAM_BOT_TOKEN');
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(res.getContentText());
}

function sendTelegramMessage_(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    muteHttpExceptions: true,
    payload: {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`Telegram error ${code}: ${response.getContentText()}`);
}

// El resumen de variación se construye SIEMPRE a partir de readInvestments_, que es la
// misma lista de posiciones que ve la app.
//
// Antes había dos implementaciones: esta leía la hoja por su cuenta y descartaba
// cualquier posición sin VALOR ANTERIOR (previousTotal salía NaN), mientras que la de
// modo estimado le asignaba variación 0. Como el modo "real" es el de por defecto, una
// posición recién añadida, sin cierre anterior, desaparecía del aviso de Telegram sin
// que nada lo indicara; en modo estimado sí salía. Ahora las dos dan lo mismo.
function buildInvestmentVariationSummary_(sheetName) {
  const resolvedSheetName = sheetName || DEFAULT_INVESTMENT_SHEET;
  const investments = readInvestments_(resolvedSheetName);
  const categories = readInvestmentCategoriesForTotals_(DEFAULT_INVESTMENT_TOTALS_SHEET, resolvedSheetName, investments);
  return buildInvestmentVariationSummaryFromInvestments_(investments, categories);
}

function emptyVariationBucket_() {
  return { current: 0, previous: 0, variation: 0, positions: [] };
}

function addVariationRow_(bucket, position) {
  if (!bucket || !position) return;
  bucket.current += Number(position.current || 0);
  bucket.previous += Number(position.previous || 0);
  bucket.variation += Number(position.variation || 0);
  bucket.positions.push(position);
}

function formatGeneralInvestmentMessage_(summary) {
  const all = summary.all;
  const costs = summary.costs || {};
  const lines = [
    `💰 <b>MoneyManagement - Resumen diario</b>`,
    `<b>Total:</b> ${formatMoney_(all.current)} | ${formatPct_(percentageChange_(all.current, all.previous))} | ${formatSignedMoney_(all.variation)}`,
    formatInvestedLine_(costs.__all, all.current),
    ''
  ];
  (summary.order || []).forEach(type => {
    const bucket = summary[type] || emptyVariationBucket_();
    lines.push(`${emojiForType_(type)} ${escapeTelegramHtml_(type)}: ${formatMoney_(bucket.current)} | ${formatPct_(percentageChange_(bucket.current, bucket.previous))} | ${formatSignedMoney_(bucket.variation)}`);
    lines.push(formatInvestedLine_(costs[normalizeType_(type)], bucket.current));
  });
  return lines.filter(line => line !== null).join('\n');
}

function formatTypeInvestmentMessage_(summary, type) {
  const bucket = summary[type] || emptyVariationBucket_();
  const lines = [
    `${emojiForType_(type)} <b>${escapeTelegramHtml_(type)}</b>: ${formatMoney_(bucket.current)} | ${formatPct_(percentageChange_(bucket.current, bucket.previous))} | ${formatSignedMoney_(bucket.variation)}`
  ];
  if (bucket.positions.length) {
    lines.push('');
    bucket.positions.forEach(position => {
      lines.push(`${positionMarker_(position, summary.isEstimated)} ${escapeTelegramHtml_(position.name)}: ${formatMoney_(position.current)} | ${formatPct_(position.pct)} | ${formatMoney_(position.variation)}`);
    });
  } else {
    lines.push('', 'Sin posiciones.');
  }
  return lines.join('\n');
}

// El coste (lo realmente invertido) solo existe agregado por categoria en la hoja de
// totales: readInvestments_ no lo devuelve por posicion. Por eso el resumen "Invertido"
// aparece en el mensaje general y no en las lineas de posiciones.
function investmentCostsByType_(sheetName) {
  const map = { __all: 0 };
  readInvestmentTotals_(sheetName).forEach(row => {
    const cost = Number(row.cost);
    if (!Number.isFinite(cost)) return;
    map[normalizeType_(row.tipo)] = cost;
    map.__all += cost;
  });
  return map;
}

// Devuelve null (y el llamante la omite) cuando no hay coste registrado: un "+0,00%"
// sobre coste 0 seria enganoso. El porcentaje se recalcula aqui en escala 0-100 porque
// %GAIN se guarda en la hoja como fraccion.
function formatInvestedLine_(cost, current) {
  const invested = Number(cost || 0);
  if (!Number.isFinite(invested) || Math.abs(invested) < 0.005) return null;
  const gain = Number(current || 0) - invested;
  return `Invertido: ${formatMoney_(invested)} | ${formatPct_((gain / invested) * 100)} | ${formatSignedMoney_(gain)}`;
}

function escapeTelegramHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function percentageChange_(current, previous) {
  return previous ? ((current - previous) / previous) * 100 : 0;
}

function emojiForType_(type) {
  return '💰';
}

function positionMarker_(position, isEstimated) {
  if (position && position.isCash) return '💵';
  if (isEstimated && position && Math.abs(Number(position.variation || 0)) >= 0.005) {
    return position.variation > 0 ? '🟢' : '🔴';
  }
  return '-';
}

function formatMoney_(value) {
  return `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;
}

function formatSignedMoney_(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? '+' : ''}${formatMoney_(amount)}`;
}

function formatPct_(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? '+' : ''}${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// Claves de la hoja "Objetivos" que no son objetivos sino ajustes de la app, guardados
// como JSON en la columna Valor. readInvestmentGoals_ las ignora (normalizeGoalKey_
// devuelve '' para ellas), así que ambas lecturas conviven en la misma hoja.
var APP_SETTINGS_KEYS = ['budgets', 'investmentComposition', 'emergencyFund'];

// Lee la hoja entera como pares clave/valor, preservando el orden de las filas.
function readObjectiveRows_(sheetName) {
  const sheet = getSheet_(sheetName || DEFAULT_OBJECTIVE_SHEET);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues()
    .map(function(row) { return [String(row[0] || '').trim(), row[1]]; })
    .filter(function(row) { return row[0]; });
}

// Escribe preservando las filas que no gestiona quien llama. Sin esto, guardar objetivos
// borraba los ajustes (y al revés): la escritura antigua hacía clearContent de todo.
function writeObjectiveRows_(sheetName, updates) {
  const sheet = getOrCreateSheet_(sheetName || DEFAULT_OBJECTIVE_SHEET, ['Tiempo', 'Valor']);
  const existing = readObjectiveRows_(sheetName);
  const result = [];
  const applied = {};
  existing.forEach(function(row) {
    const key = row[0];
    const match = Object.keys(updates).filter(function(k) { return normalizeSettingKey_(k) === normalizeSettingKey_(key); })[0];
    if (match) {
      if (applied[match]) return;
      applied[match] = true;
      result.push([key, updates[match]]);
    } else {
      result.push(row);
    }
  });
  Object.keys(updates).forEach(function(key) {
    if (!applied[key]) result.push([key, updates[key]]);
  });
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  if (result.length) sheet.getRange(2, 1, result.length, 2).setValues(result);
}

function normalizeSettingKey_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function saveInvestmentGoals_(goals, sheetName) {
  writeObjectiveRows_(sheetName, {
    'Gasto mensual': Number(goals.expenseMonthly || 0),
    'Inversión mensual': Number(goals.investmentMonthly || goals.monthly || 0),
    'Inversión anual': Number(goals.yearly || goals.anual || 0),
    'Inversión total': Number(goals.total || 0)
  });
}

// Ajustes de la app guardados en la misma hoja. Un JSON corrupto en una fila no puede
// tumbar la descarga entera: esa clave se ignora y el resto sigue.
function readAppSettings_(sheetName) {
  const settings = {};
  readObjectiveRows_(sheetName).forEach(function(row) {
    const key = APP_SETTINGS_KEYS.filter(function(k) { return normalizeSettingKey_(k) === normalizeSettingKey_(row[0]); })[0];
    if (!key) return;
    const raw = String(row[1] || '').trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') settings[key] = parsed;
    } catch (error) {
      // fila ilegible: se deja fuera y la app usa lo que tenga en local
    }
  });
  return settings;
}

function saveAppSettings_(settings, sheetName) {
  const updates = {};
  APP_SETTINGS_KEYS.forEach(function(key) {
    const value = settings ? settings[key] : null;
    if (value === undefined || value === null) return;
    updates[key] = JSON.stringify(value);
  });
  if (!Object.keys(updates).length) return;
  writeObjectiveRows_(sheetName, updates);
}

// `knownInvestments` evita releer la hoja de inversiones cuando el llamante ya la tiene:
// readInvestments_ hace getValues() Y getDisplayValues(), o sea dos lecturas completas de
// la hoja cada vez que se llama.
function readInvestmentCategoriesForTotals_(totalsSheetName, investmentSheetName, knownInvestments, knownTotals) {
  const totals = (knownTotals || readInvestmentTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET))
    .sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); })
    .map(function(item) { return String(item.tipo || '').trim(); })
    .filter(Boolean);
  const investments = (knownInvestments || readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET))
    .map(function(item) { return String(item.tipo || '').trim(); })
    .filter(Boolean);
  return Array.from(new Set([].concat(totals, investments).filter(Boolean)));
}

function readAppCategories_(dataSheetName, totalsSheetName, investmentSheetName, knownInvestments, knownTotals) {
  const categories = readCategories_(dataSheetName || 'Datos');
  categories.investmentTypes = readInvestmentCategoriesForTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheetName || DEFAULT_INVESTMENT_SHEET, knownInvestments, knownTotals);
  return categories;
}

function movementInvestmentCategory_(movement, categories) {
  if (!movement || normalizeType_(movement.tipo) !== 'inversion') return '';
  const candidates = [movement.concepto, movement.descripcion].map(v => String(v || '').trim()).filter(Boolean);
  for (const candidate of candidates) {
    const match = (categories || []).find(type => normalizeType_(type) === normalizeType_(candidate));
    if (match) return match;
  }
  return '';
}

function historicalInvestmentCostByCategory_(movementSheetName, categories) {
  const result = {};
  (categories || []).forEach(type => result[type] = 0);
  const rows = readMovements_(movementSheetName || DEFAULT_MOVEMENT_SHEET);
  rows.forEach(movement => {
    const category = movementInvestmentCategory_(movement, categories);
    if (!category) return;
    const amount = -parseNumber_(movement.importe ?? movement.amount);
    if (Number.isFinite(amount)) result[category] = (result[category] || 0) + amount;
  });
  Object.keys(result).forEach(function(key) { result[key] = Math.max(0, result[key]); });
  return result;
}

function positionPreviousTotal_(item) {
  if (isCashInvestment_(item)) return parseNumber_(item.total ?? item.value ?? item.VALUE) || 0;
  const quantity = parseNumber_(item.cantidad ?? item.shares ?? item.SHARES);
  const lastPrice = parseNumber_(item.valorAnterior ?? item.lastPrice ?? item['LAST PRICE']);
  if (Number.isFinite(quantity) && Number.isFinite(lastPrice)) return quantity * lastPrice;
  return parseNumber_(item.total ?? item.value ?? item.VALUE) || 0;
}

// Cabecera y escritura de la hoja de totales: estaban duplicadas literalmente en
// syncInvestmentTotalsSheet_ y updateInvestmentCategoryNamesInTotals_, y el literal de
// las nueve columnas aparecía cuatro veces.
function investmentTotalsHeaders_() {
  return ['TIPO', 'COST', 'VALUE', 'LAST VALUE', 'DAILY', '%D', 'GAIN', '%GAIN', 'ORDEN'];
}

function writeInvestmentTotalsRows_(sheet, rows) {
  const previousLastRow = sheet.getLastRow();
  sheet.getRange(1, 1, 1, 9).setValues([investmentTotalsHeaders_()]);
  if (previousLastRow > 1) sheet.getRange(2, 1, previousLastRow - 1, Math.max(9, sheet.getLastColumn())).clearContent();
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  sheet.getRange(2, 2, rows.length, 4).setNumberFormat('0.00');
  sheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00%');
  sheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.00');
  sheet.getRange(2, 8, rows.length, 1).setNumberFormat('0.00%');
}

function syncInvestmentTotalsSheet_(totalsSheetName, investmentSheetName, movementSheetName) {
  const totalsSheet = getOrCreateSheet_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentTotalsHeaders_());
  const categories = readInvestmentCategoriesForTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheetName || DEFAULT_INVESTMENT_SHEET);
  const investments = readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET);
  const existing = {};
  const lastRow = totalsSheet.getLastRow();
  if (lastRow >= 2) {
    totalsSheet.getRange(2, 1, lastRow - 1, Math.max(9, totalsSheet.getLastColumn())).getValues().forEach((row, idx) => {
      const type = String(row[0] || '').trim();
      if (!type) return;
      existing[normalizeType_(type)] = { type, cost: parseNumber_(row[1]), order: Number(row[8] || idx + 1) };
    });
  }
  const initialCosts = Object.keys(existing).length ? {} : historicalInvestmentCostByCategory_(movementSheetName || DEFAULT_MOVEMENT_SHEET, categories);
  const orderedCategories = Array.from(new Set([].concat(categories, Object.values(existing).map(item => item.type)).filter(Boolean)));
  const rows = orderedCategories.map((type, idx) => {
    const key = normalizeType_(type);
    const positions = investments.filter(item => normalizeType_(item.tipo) === key);
    const value = positions.reduce((acc, item) => acc + (parseNumber_(item.total) || 0), 0);
    const previous = positions.reduce((acc, item) => acc + (positionPreviousTotal_(item) || 0), 0);
    const old = existing[key] || {};
    const cost = Number.isFinite(old.cost) ? old.cost : (initialCosts[type] || 0);
    const daily = value - previous;
    const gain = value - cost;
    return [type, cost, value, previous, daily, previous ? daily / previous : 0, gain, cost ? gain / cost : 0, Number.isFinite(old.order) ? old.order : idx + 1];
  }).sort((a, b) => Number(a[8] || 0) - Number(b[8] || 0));
  writeInvestmentTotalsRows_(totalsSheet, rows);
}

// Totales para las DESCARGAS. syncInvestmentTotalsSheet_ no es una lectura: reescribe la
// hoja de totales (clearContent + setValues + formatos) y, si está vacía, recorre la hoja
// de movimientos entera. Hacer eso en cada GET era lo que hacía que la descarga inicial
// pasara de los 20 s del cliente y fallara con "Apps Script no respondió a tiempo".
// Las acciones que mutan (alta/baja de inversión, categorías, precios, doPost) siguen
// llamando al sync completo antes de construir su payload, así que los totales no se
// quedan obsoletos; aquí solo se sincroniza si la hoja aún no existe o está vacía.
function investmentTotalsForRead_(totalsSheetName, investmentSheetName, movementSheetName) {
  const name = totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET;
  const sheet = getSheet_(name);
  if (sheet && sheet.getLastRow() >= 2) return readInvestmentTotals_(name);
  // Solo aquí hace falta releer: los otros doce llamantes de la sincronización
  // descartaban este resultado, que era una lectura completa de la hoja por mutación.
  syncInvestmentTotalsSheet_(name, investmentSheetName, movementSheetName);
  return readInvestmentTotals_(name);
}

function readInvestmentTotals_(sheetName) {
  const sheet = getSheet_(sheetName || DEFAULT_INVESTMENT_TOTALS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(9, sheet.getLastColumn())).getValues()
    .map((row, index) => ({
      rowNumber: index + 2,
      tipo: String(row[0] || '').trim(),
      cost: parseNumber_(row[1]),
      value: parseNumber_(row[2]),
      lastValue: parseNumber_(row[3]),
      daily: parseNumber_(row[4]),
      dailyPct: parseNumber_(row[5]),
      gain: parseNumber_(row[6]),
      gainPct: parseNumber_(row[7]),
      order: Number(row[8] || index + 1)
    }))
    .filter(row => row.tipo);
}

// Guardia barata: solo un movimiento de tipo "Inversión" puede alterar el coste y, por
// tanto, la hoja de totales. Comprobarlo evita el trabajo caro en el caso general.
function isInvestmentMovement_(movement) {
  return Boolean(movement) && normalizeType_(movement.tipo) === 'inversion';
}

// Aplica los cambios de coste de VARIOS movimientos de una vez.
//
// Antes esto era una función por movimiento que, para cada uno, releía las categorías
// (dos lecturas completas), reescribía la hoja de totales entera vía
// syncInvestmentTotalsSheet_ (dos lecturas más y una escritura), volvía a leer los
// totales y escribía una celda. Y se llamaba dentro de bucles: mover M futuros
// vencidos costaba M veces todo eso. Ahora es una sincronización, una lectura y una
// escritura para todo el lote.
//
// Los deltas se aplican EN ORDEN y con el mismo corte en cero por movimiento que antes,
// para no cambiar el resultado cuando un descuento deja el coste por debajo de cero.
function applyInvestmentCostChanges_(sheets, changes, movementSheetName) {
  // Los movimientos FUTUROS no cuentan como coste hasta que vencen. Antes esto se
  // decidía buscando la subcadena "futuro" en el nombre de la hoja, pero ese nombre es
  // configurable desde Ajustes: llamarla "Programados" hacía que cada edición o borrado
  // de un futuro de inversión corrompiera la columna COST. Ahora se compara con el
  // nombre real de la hoja de futuros que viaja en la petición.
  if (normalizeType_(movementSheetName || '') === normalizeType_(sheets.future || DEFAULT_FUTURE_MOVEMENT_SHEET)) return;
  const list = (changes || []).filter(function(change) { return change && change.movement; });
  if (!list.length) return;

  let sheet = getSheet_(sheets.investmentTotals);
  // Solo inicializa los totales una vez. Si se acaba de modificar el movimiento,
  // la sincronización completa ya incorpora ese estado y no se aplica el delta por
  // segunda vez. En el uso normal se lee y escribe únicamente TIPO/COSTE.
  if (!sheet || sheet.getLastRow() < 2) {
    syncInvestmentTotalsSheet_(sheets.investmentTotals, sheets.investment, sheets.movement);
    return;
  }
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const categories = values.map(function(row) { return String(row[0] || '').trim(); }).filter(Boolean);
  const entries = [];
  list.forEach(function(change) {
    const category = movementInvestmentCategory_(change.movement, categories);
    if (!category) return;
    // El signo del importe manda: negativo = invertir (sube el coste), positivo =
    // desinvertir (lo baja). Con Math.abs una venta engordaba el coste de la cartera.
    const amount = -parseNumber_(change.movement.importe ?? change.movement.amount);
    if (!Number.isFinite(amount) || amount === 0) return;
    entries.push({ category: category, delta: Number(change.sign || 0) * amount });
  });
  if (!entries.length) return;
  let touched = false;
  entries.forEach(function(entry) {
    const row = values.find(function(candidate) { return normalizeType_(candidate[0]) === normalizeType_(entry.category); });
    if (!row) return;
    const current = parseNumber_(row[1]);
    row[1] = Math.max(0, (Number.isFinite(current) ? current : 0) + entry.delta);
    touched = true;
  });
  if (!touched) return;
  setRangeValuesSafe_(sheet.getRange(2, 2, values.length, 1), values.map(function(row) { return [row[1]]; }));
}

function adjustInvestmentCostFromMovement_(sheets, movementSheetName, movement, sign) {
  applyInvestmentCostChanges_(sheets, [{ movement: movement, sign: sign }], movementSheetName);
}

function readCategories_(sheetName) {
  const sheet = ensureDataSheet_(sheetName || 'Datos');
  const lastRow = sheet.getLastRow();
  const values = lastRow ? sheet.getRange(1, 1, lastRow, 2).getDisplayValues() : [];
  return {
    types: values.slice(1).map(row => row[0]).filter(Boolean),
    concepts: values.slice(1).map(row => row[1]).filter(Boolean),
    investmentTypes: []
  };
}

function ensureDataSheet_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName || 'Datos', ['Tipo', 'Concepto']);
  const existingLastCol = sheet.getLastColumn();
  if (existingLastCol < 2) sheet.insertColumnsAfter(existingLastCol, 2 - existingLastCol);
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 2)).getValues()[0];
  if (!headers[0]) sheet.getRange(1, 1).setValue('Tipo');
  if (!headers[1]) sheet.getRange(1, 2).setValue('Concepto');
  return sheet;
}

function saveInvestmentCategories_(investmentSheetName, investmentTypes, renames, movementSheetName, futureMovementSheetName, investmentTotalsSheetName, estimateRulesSheetName, estimateLedgerSheetName, deletions) {
  const categories = Array.from(new Set((investmentTypes || []).map(v => String(v || '').trim()).filter(Boolean)));
  if (!categories.length) throw new Error('Faltan categorías de inversión');

  // Carteras que el usuario ha decidido borrar con todo lo que cuelga de ellas. Se
  // purgan aquí para que el guardado de categorías no falle luego al ver que la
  // categoría sobrante todavía tiene posiciones, reglas o estimaciones.
  const deleted = (deletions || []).map(v => String(v || '').trim()).filter(Boolean);
  if (deleted.length) {
    deleteInvestmentRowsByCategory_(investmentSheetName || DEFAULT_INVESTMENT_SHEET, deleted);
    deleteEstimateRowsByCategory_(estimateRulesSheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, deleted, estimateColumnMap_, 'movementDescription');
    deleteEstimateRowsByCategory_(estimateLedgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, deleted, ledgerColumnMap_, 'tipo');
  }

  const investmentSheet = getSheet_(investmentSheetName || DEFAULT_INVESTMENT_SHEET);
  const renameEntries = Object.entries(renames || {}).filter(entry => entry[0] && entry[1]);
  if (investmentSheet && investmentSheet.getLastRow() >= 2 && renameEntries.length) {
    const col = investmentColumnMap_(investmentSheet);
    const range = investmentSheet.getRange(2, col.tipo, investmentSheet.getLastRow() - 1, 1);
    const values = range.getValues();
    let changed = false;
    values.forEach(row => {
      const current = String(row[0] || '').trim();
      const match = renameEntries.find(([from]) => normalizeType_(from) === normalizeType_(current));
      if (match) {
        row[0] = match[1];
        changed = true;
      }
    });
    if (changed) range.setValues(values);
  }

  updateInvestmentCategoryNamesInMovements_(movementSheetName || DEFAULT_MOVEMENT_SHEET, renames || {});
  updateInvestmentCategoryNamesInMovements_(futureMovementSheetName || DEFAULT_FUTURE_MOVEMENT_SHEET, renames || {});
  updateInvestmentCategoryNamesInEstimateRules_(estimateRulesSheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, renames || {});
  updateInvestmentCategoryNamesInEstimateLedger_(estimateLedgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, renames || {});
  updateInvestmentCategoryNamesInTotals_(investmentTotalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, renames || {}, categories, investmentSheetName || DEFAULT_INVESTMENT_SHEET, deleted);
}

// Borra de una hoja todas las filas cuya categoría esté en la lista. De abajo arriba,
// para que borrar una fila no desplace los índices de las que aún quedan por mirar.
function deleteRowsMatching_(sheet, values, matches) {
  const rows = [];
  values.forEach(function(row, index) { if (matches(row)) rows.push(index + 2); });
  rows.reverse().forEach(function(row) { sheet.deleteRow(row); });
  return rows.length;
}

function deleteInvestmentRowsByCategory_(sheetName, categories) {
  const sheet = getSheet_(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const col = investmentColumnMap_(sheet);
  const keys = categories.map(normalizeType_);
  const values = sheet.getRange(2, col.tipo, sheet.getLastRow() - 1, 1).getValues();
  return deleteRowsMatching_(sheet, values, function(row) { return keys.indexOf(normalizeType_(row[0])) !== -1; });
}

function deleteEstimateRowsByCategory_(sheetName, categories, columnMap, columnKey) {
  const sheet = getSheet_(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const col = columnMap(sheet);
  if (!col[columnKey]) return 0;
  const keys = categories.map(normalizeType_);
  const values = sheet.getRange(2, col[columnKey], sheet.getLastRow() - 1, 1).getValues();
  return deleteRowsMatching_(sheet, values, function(row) { return keys.indexOf(normalizeType_(row[0])) !== -1; });
}

function updateInvestmentCategoryNamesInTotals_(sheetName, renames, orderedCategories, investmentSheetName, deletions) {
  // Las categorías borradas a propósito no disparan los guardas de abajo: el usuario ya
  // ha confirmado que se lleva por delante sus posiciones, coste y movimientos.
  const deletedKeys = (deletions || []).map(normalizeType_);
  const sheet = getOrCreateSheet_(sheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentTotalsHeaders_());
  const requested = (orderedCategories || []).map(v => String(v || '').trim()).filter(Boolean);
  const requestedKeys = new Set(requested.map(normalizeType_));
  // Una sola lectura de la hoja de inversiones para todo: la comprobación de abajo la
  // repetía dentro de un bucle, releyendo la hoja entera por cada categoría sobrante.
  const investments = readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET);
  const positionsByType = {};
  const labelByType = {};
  investments.forEach(item => {
    const key = normalizeType_(item.tipo);
    if (!key) return;
    positionsByType[key] = (positionsByType[key] || 0) + 1;
    if (!labelByType[key]) labelByType[key] = item.tipo;
  });

  const existingByKey = {};
  const extraRows = [];
  if (sheet.getLastRow() >= 2) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(9, sheet.getLastColumn())).getValues();
    values.forEach((row, idx) => {
      let type = String(row[0] || '').trim();
      if (!type) return;
      const match = Object.entries(renames || {}).find(([from]) => normalizeType_(from) === normalizeType_(type));
      if (match) {
        type = match[1];
        row[0] = match[1];
      }
      const key = normalizeType_(type);
      row[0] = type;
      if (requestedKeys.has(key)) existingByKey[key] = row;
      else extraRows.push({ row, key, type, idx });
    });
  }

  extraRows.forEach(item => {
    const row = item.row;
    const hasPosition = (positionsByType[item.key] || 0) > 0;
    const hasCost = Math.abs(parseNumber_(row[1]) || 0) > 0.009;
    const hasValue = Math.abs(parseNumber_(row[2]) || 0) > 0.009;
    if (deletedKeys.indexOf(item.key) !== -1) return;
    if (hasPosition || hasCost || hasValue) {
      throw new Error('No se puede borrar la categoría "' + item.type + '" porque tiene posiciones, coste o valor.');
    }
  });

  Object.keys(positionsByType).forEach(key => {
    if (!requestedKeys.has(key) && deletedKeys.indexOf(key) === -1) {
      const label = labelByType[key] || key;
      throw new Error('No se puede borrar la categoría "' + label + '" porque tiene posiciones.');
    }
  });

  const rows = requested.map((type, idx) => {
    const key = normalizeType_(type);
    const old = existingByKey[key] || [];
    return [
      type,
      parseNumber_(old[1]) || 0,
      parseNumber_(old[2]) || 0,
      parseNumber_(old[3]) || 0,
      parseNumber_(old[4]) || 0,
      parseNumber_(old[5]) || 0,
      parseNumber_(old[6]) || 0,
      parseNumber_(old[7]) || 0,
      idx + 1
    ];
  });

  writeInvestmentTotalsRows_(sheet, rows);
}

function updateInvestmentCategoryNamesInMovements_(sheetName, renames) {
  const entries = Object.entries(renames || {}).filter(entry => entry[0] && entry[1]);
  if (!entries.length) return;
  const sheet = getSheet_(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const width = Math.max(sheet.getLastColumn(), 7);
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    // Las hojas de movimientos guardan TIPO, CONCEPTO y DESCRIPCIÓN en E:G.
    const type = normalizeType_(row[4]);
    const concept = String(row[5] || '').trim();
    const desc = String(row[6] || '').trim();
    if (type !== 'inversion') return;
    const conceptMatch = entries.find(([from]) => normalizeType_(from) === normalizeType_(concept));
    const descMatch = entries.find(([from]) => normalizeType_(from) === normalizeType_(desc));
    if (conceptMatch || descMatch) {
      if (conceptMatch) row[5] = conceptMatch[1];
      if (descMatch) row[6] = descMatch[1];
      changed = true;
    }
  });
  if (changed) range.setValues(values);
}

function updateInvestmentCategoryNamesInEstimateRules_(sheetName, renames) {
  const entries = Object.entries(renames || {}).filter(entry => entry[0] && entry[1]);
  const sheet = getSheet_(sheetName);
  if (!entries.length || !sheet || sheet.getLastRow() < 2) return;
  const col = estimateColumnMap_(sheet);
  if (!col.movementDescription) return;
  const range = sheet.getRange(2, col.movementDescription, sheet.getLastRow() - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    const match = entries.find(([from]) => normalizeType_(from) === normalizeType_(row[0]));
    if (match) { row[0] = match[1]; changed = true; }
  });
  if (changed) range.setValues(values);
}

function updateInvestmentCategoryNamesInEstimateLedger_(sheetName, renames) {
  const entries = Object.entries(renames || {}).filter(entry => entry[0] && entry[1]);
  const sheet = getSheet_(sheetName);
  if (!entries.length || !sheet || sheet.getLastRow() < 2) return;
  const col = ledgerColumnMap_(sheet);
  if (!col.tipo) return;
  const range = sheet.getRange(2, col.tipo, sheet.getLastRow() - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    const match = entries.find(([from]) => normalizeType_(from) === normalizeType_(row[0]));
    if (match) { row[0] = match[1]; changed = true; }
  });
  if (changed) range.setValues(values);
}

function normalizeDate_(value) {
  const date = parseMovementDate_(value);
  if (!date) return value;
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseMovementDate_(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNumber_(value) {
  if (typeof value === 'number') return value;
  let cleaned = String(value || '').replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  const hasComma = cleaned.indexOf(',') !== -1;
  const hasDot = cleaned.indexOf('.') !== -1;
  if (hasComma && hasDot) {
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }
  return Number(cleaned);
}

function normalizeInvestmentPercent_(rawValue, displayValue) {
  const displayText = String(displayValue || '');
  const displayNumber = parseNumber_(displayText);
  if (displayText.indexOf('%') !== -1 && Number.isFinite(displayNumber)) return displayNumber;
  const rawNumber = parseNumber_(rawValue);
  return Number.isFinite(rawNumber) ? rawNumber : NaN;
}

function normalizeGoalKey_(value) {
  const text = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (text === 'gasto mensual' || text === 'limite de gasto mensual' || text === 'gastos mensuales' || text === 'expense monthly' || text === 'expensemonthly') return 'expenseMonthly';
  if (text === 'inversion mensual' || text === 'objetivo de inversion mensual' || text === 'investment monthly' || text === 'investmentmonthly') return 'investmentMonthly';
  if (text === 'inversion anual' || text === 'anual' || text === 'yearly') return 'yearly';
  if (text === 'inversion total' || text === 'total') return 'total';
  if (text === 'mensual') return 'monthly';
  return '';
}

// Única forma de construir la respuesta: JSON a secas, para doGet y doPost por igual.
// El cliente las lee con fetch y JSON.parse. Ya no hace falta el envoltorio
// JSONP ni escapar <, >, & o los separadores Unicode de línea: aquello solo era necesario
// porque la respuesta se ejecutaba como JavaScript dentro de un <script>.
function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorCode_(err) {
  const message = String(err && err.message ? err.message : err || '');
  if (/^AUTH:/.test(message)) return 'AUTH';
  if (/^VALIDATION:/.test(message)) return 'VALIDATION';
  if (/^LOCK_TIMEOUT/.test(message)) return 'BUSY';
  if (/Invalid app token/i.test(message)) return 'AUTH';
  if (/Sheet not found/i.test(message)) return 'SHEET_NOT_FOUND';
  if (/not found/i.test(message)) return 'NOT_FOUND';
  if (/Invalid transfer|inválido|inv[aá]lida/i.test(message)) return 'VALIDATION';
  if (/tiene \d+ movimientos asociados/i.test(message)) return 'CONFLICT';
  if (/Ya existe una cuenta/i.test(message)) return 'CONFLICT';
  if (/quota|límite|limit/i.test(message)) return 'QUOTA';
  return 'UNKNOWN';
}

// Sin capa de compatibilidad, una acción desconocida solo puede significar que el
// Apps Script desplegado es más antiguo que la app. Reintentar no lo arregla, así que
// lleva código propio para que el cliente pare y diga qué hacer.
function unknownActionPayload_(action) {
  return { ok: false, error: 'Acción no reconocida: ' + String(action || '(vacía)'), errorCode: 'UNKNOWN_ACTION' };
}

function errorPayload_(err) {
  const message = String(err && err.message ? err.message : err);
  const code = errorCode_(err);
  // Los errores no clasificados no exponen internos del script al caller: el
  // detalle queda en el registro de ejecuciones de Apps Script.
  if (code === 'UNKNOWN') {
    console.error(err && err.stack || message);
    return { ok: false, error: 'Error interno del servidor. Revisa el registro de ejecuciones de Apps Script.', errorCode: 'INTERNAL' };
  }
  return { ok: false, error: message, errorCode: code };
}
