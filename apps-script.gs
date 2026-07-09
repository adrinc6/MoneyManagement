var APP_TOKEN = '';
var DEFAULT_MOVEMENT_SHEET = 'Control Finanzas';
var DEFAULT_INVESTMENT_SHEET = 'Inversiones';
var DEFAULT_BANK_SHEET = 'Bancos';
var DEFAULT_FUTURE_MOVEMENT_SHEET = 'Movimientos futuros';
var DEFAULT_OBJECTIVE_SHEET = 'Objetivos';
var DEFAULT_INVESTMENT_TOTALS_SHEET = 'Inversión Totales';
var DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET = 'Inversiones Estimación Reglas';
var DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET = 'Inversiones Estimación Movimientos';
var INVESTMENT_ESTIMATE_BASELINE_PREFIX = 'moneyInvestmentEstimateBaseline:';
var INVESTMENT_MODE_PREFERENCE_KEY = 'moneyInvestmentModePreference';
var DEFAULT_PENDING_SHEET = 'Pendientes';
var SECTION_REV_PREFIX = 'moneySectionRev:';
var PROCESSED_CLIENT_OPS_KEY = 'moneyProcessedClientOps';
var MOVEMENT_CHANGELOG_KEY = 'moneyMovementChangelog';
var MOVEMENT_CHANGELOG_LIMIT = 1200;
var MOVEMENT_SID_HEADER = 'SID';
var PROCESSED_NOTIFICATION_REQUESTS_KEY = 'moneyProcessedNotificationRequests';
var TELEGRAM_BOT_TOKEN = '';
var TELEGRAM_CHAT_ID = '';
var DAILY_NOTIFICATION_HOUR = 22;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = params.callback || '';
  const action = params.action || 'all';
  const movementSheet = params.movementSheet || DEFAULT_MOVEMENT_SHEET;
  const investmentSheet = params.investmentSheet || DEFAULT_INVESTMENT_SHEET;
  const bankSheet = params.bankSheet || DEFAULT_BANK_SHEET;
  const dataSheet = params.dataSheet || 'Datos';
  const futureMovementSheet = params.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET;
  const objectiveSheet = params.objectiveSheet || DEFAULT_OBJECTIVE_SHEET;
  const investmentTotalsSheet = params.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET;
  const investmentEstimateRulesSheet = params.investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET;
  const investmentEstimateLedgerSheet = params.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET;
  const investmentMode = params.investmentMode || investmentModePreference_();

  let payload;
  try {
    requireToken_(params.token || '');
    if (action === 'checkClientOp') {
      payload = buildClientOpStatusPayload_(params.clientOpId || '');
    } else if (action === 'quickStatus') {
      payload = buildQuickStatusPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, dataSheet, investmentTotalsSheet);
    } else if (action === 'downloadData') {
      payload = buildAllDataPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, [], investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
    } else if (action === 'downloadCoreData') {
      payload = buildCoreDataPayload_(investmentSheet, bankSheet, objectiveSheet, dataSheet, [], movementSheet, futureMovementSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
    } else if (action === 'downloadInvestments') {
      payload = buildInvestmentDataPayload_(investmentSheet, objectiveSheet, movementSheet, futureMovementSheet, bankSheet, dataSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
    } else if (action === 'downloadMovements') {
      payload = {
        ok: true,
        transactions: readMovements_(movementSheet),
        futureTransactions: readFutureMovements_(futureMovementSheet)
      };
    } else if (action === 'downloadMovementsPage') {
      payload = buildMovementPagePayload_(
        params.movementKind === 'future' ? futureMovementSheet : movementSheet,
        params.movementKind === 'future' ? 'futureTransactions' : 'transactions',
        params.offset,
        params.limit
      );
    } else if (action === 'downloadMovementChanges') {
      payload = buildMovementChangesPayload_(
        params.movementKind === 'future' ? 'futureTransactions' : 'transactions',
        params.sinceRev || '',
        movementSheet,
        futureMovementSheet,
        investmentSheet,
        bankSheet,
        objectiveSheet,
        dataSheet
      );
    } else if (action === 'moveDueFutureMovements') {
      const movedFutureMovements = moveDueFutureMovements_(futureMovementSheet, movementSheet, bankSheet);
      if (movedFutureMovements.length) {
        movedFutureMovements.forEach(function(movement) { adjustInvestmentCostFromMovement_(investmentTotalsSheet, dataSheet, investmentSheet, movementSheet, movement, 1); });
        syncInvestmentTotalsSheet_(investmentTotalsSheet, dataSheet, investmentSheet, movementSheet);
        const previousRevs = { transactions: getSectionRevision_('transactions'), futureTransactions: getSectionRevision_('futureTransactions') };
        const moveStamp = bumpSections_('transactions', 'futureTransactions', 'banks', 'investmentTotals');
        recordMovedFutureChanges_(movedFutureMovements, moveStamp, previousRevs);
      }
      payload = {
        ok: true,
        movedFutureMovements,
        banks: readBanks_(bankSheet),
        investmentTotals: readInvestmentTotals_(investmentTotalsSheet)
      };
    } else if (action === 'all') {
      const movedFutureMovements = moveDueFutureMovements_(futureMovementSheet, movementSheet, bankSheet);
      if (movedFutureMovements.length) {
        movedFutureMovements.forEach(function(movement) { adjustInvestmentCostFromMovement_(investmentTotalsSheet, dataSheet, investmentSheet, movementSheet, movement, 1); });
        syncInvestmentTotalsSheet_(investmentTotalsSheet, dataSheet, investmentSheet, movementSheet);
        const previousRevs = { transactions: getSectionRevision_('transactions'), futureTransactions: getSectionRevision_('futureTransactions') };
        const moveStamp = bumpSections_('transactions', 'futureTransactions', 'banks', 'investmentTotals');
        recordMovedFutureChanges_(movedFutureMovements, moveStamp, previousRevs);
      }
      payload = buildAllDataPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, movedFutureMovements, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
    } else if (action === 'updateInvestment') {
      const targetSheet = params.sheetName || investmentSheet;
      const investment = params.investment ? JSON.parse(params.investment) : {};
      const previousInvestment = params.previousInvestment ? JSON.parse(params.previousInvestment) : null;
      updateInvestment_(investment, targetSheet, previousInvestment);
      if (params.newInvestment === '1' && !isCashInvestment_(investment)) {
        updateInvestmentQuotesFromYahoo(targetSheet);
      }
      syncInvestmentTotalsSheet_(investmentTotalsSheet, dataSheet, targetSheet, movementSheet);
      bumpSections_('investments', 'investmentTotals');
      payload = buildInvestmentDataPayload_(targetSheet, objectiveSheet, movementSheet, futureMovementSheet, bankSheet, dataSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
      payload.investmentUpdated = true;
    } else if (action === 'deleteInvestment') {
      const targetSheet = params.sheetName || investmentSheet;
      const investment = params.investment ? JSON.parse(params.investment) : {};
      deleteInvestment_(investment, targetSheet, params.rowNumber || 0);
      syncInvestmentTotalsSheet_(investmentTotalsSheet, dataSheet, targetSheet, movementSheet);
      bumpSections_('investments', 'investmentTotals');
      payload = buildInvestmentDataPayload_(targetSheet, objectiveSheet, movementSheet, futureMovementSheet, bankSheet, dataSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
      payload.investmentDeleted = true;
    } else if (action === 'saveInvestmentCategories') {
      const targetSheet = params.sheetName || investmentSheet;
      const investmentTypes = params.investmentTypes ? JSON.parse(params.investmentTypes) : [];
      const renames = params.renames ? JSON.parse(params.renames) : {};
      saveInvestmentCategories_(dataSheet, targetSheet, investmentTypes, renames, movementSheet, futureMovementSheet, investmentTotalsSheet);
      syncInvestmentTotalsSheet_(investmentTotalsSheet, dataSheet, targetSheet, movementSheet);
      bumpSections_('categories', 'investments', 'investmentTotals', 'transactions', 'futureTransactions');
      payload = buildInvestmentDataPayload_(targetSheet, objectiveSheet, movementSheet, futureMovementSheet, bankSheet, dataSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
      payload.categoriesUpdated = true;
    } else if (action === 'updateInvestmentPrices') {
      const priceUpdateResult = updateInvestmentQuotesFromYahoo(investmentSheet);
      bumpSections_('investments', 'investmentTotals');
      payload = buildInvestmentDataPayload_(investmentSheet, objectiveSheet, movementSheet, futureMovementSheet, bankSheet, dataSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet);
      payload.pricesUpdated = true;
      payload.priceUpdateResult = priceUpdateResult;
    } else if (action === 'downloadInvestmentEstimateRules') {
      ensureInvestmentEstimateSheets_(investmentEstimateRulesSheet, investmentEstimateLedgerSheet, movementSheet);
      payload = { ok: true, investmentEstimateRules: readInvestmentEstimateRules_(investmentEstimateRulesSheet), investmentEstimateLedger: readInvestmentEstimateLedger_(investmentEstimateLedgerSheet) };
    } else if (action === 'clearInvestmentEstimates') {
      clearInvestmentEstimates_(investmentEstimateLedgerSheet, movementSheet);
      bumpSections_('investmentEstimateLedger');
      payload = { ok: true, estimatesCleared: true, investmentEstimateLedger: [] };
    } else if (action === 'simulateInvestmentEstimateRule') {
      const created = simulateInvestmentEstimateRule_(investmentEstimateRulesSheet, investmentEstimateLedgerSheet, investmentSheet, params.ruleId || '', parseNumber_(params.simulationAmount), params.simulationDate || '');
      bumpSections_('investmentEstimateLedger');
      payload = { ok: true, estimateCreated: true, createdEstimate: created, investmentEstimateLedger: readInvestmentEstimateLedger_(investmentEstimateLedgerSheet) };
    } else if (action === 'saveInvestmentEstimateAllocations') {
      const entries = params.entries ? JSON.parse(params.entries) : [];
      const saved = saveInvestmentEstimateAllocations_(investmentEstimateLedgerSheet, entries);
      bumpSections_('investmentEstimateLedger');
      payload = { ok: true, estimatesSaved: saved.length, investmentEstimateLedger: readInvestmentEstimateLedger_(investmentEstimateLedgerSheet) };
    } else if (action === 'sendDailyNotifications') {
      const notificationRequestId = String(params.notificationRequestId || '').trim();
      const notificationResult = sendInvestmentNotificationsOnce_(notificationRequestId, function() {
        sendInvestmentNotificationMessages_(investmentSheet, { mode: investmentMode, rulesSheet: investmentEstimateRulesSheet, ledgerSheet: investmentEstimateLedgerSheet, movementSheet: movementSheet, investmentTotalsSheet: investmentTotalsSheet });
      });
      payload = { ok: true, notificationsSent: notificationResult.sent, duplicate: notificationResult.duplicate, pricesUpdated: false, investmentMode: investmentMode }; 
    } else {
      payload = { ok: false, error: 'Unknown action' };
    }
  } catch (err) {
    payload = errorPayload_(err);
  }

  const json = JSON.stringify(payload);
  const output = callback ? `${callback}(${json});` : json;
  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function buildAllDataPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, movedFutureMovements, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet) {
  const investmentTotals = syncInvestmentTotalsSheet_(investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, dataSheet, investmentSheet, movementSheet);
  return {
    ok: true,
    transactions: readMovements_(movementSheet),
    futureTransactions: readFutureMovements_(futureMovementSheet),
    movedFutureMovements: movedFutureMovements || [],
    investments: readInvestments_(investmentSheet),
    investmentTotals,
    investmentEstimateRules: readInvestmentEstimateRules_(investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET),
    investmentEstimateLedger: readInvestmentEstimateLedger_(investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET),
    banks: readBanks_(bankSheet),
    investmentGoals: readInvestmentGoals_(objectiveSheet),
    categories: readAppCategories_(dataSheet, investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheet)
  };
}

function buildCoreDataPayload_(investmentSheet, bankSheet, objectiveSheet, dataSheet, movedFutureMovements, movementSheet, futureMovementSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet) {
  const investmentTotals = syncInvestmentTotalsSheet_(investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, dataSheet, investmentSheet, movementSheet || DEFAULT_MOVEMENT_SHEET);
  return {
    ok: true,
    movedFutureMovements: movedFutureMovements || [],
    investments: readInvestments_(investmentSheet),
    investmentTotals,
    investmentEstimateRules: readInvestmentEstimateRules_(investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET),
    investmentEstimateLedger: readInvestmentEstimateLedger_(investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET),
    banks: readBanks_(bankSheet),
    investmentGoals: readInvestmentGoals_(objectiveSheet),
    categories: readAppCategories_(dataSheet, investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheet)
  };
}

function buildInvestmentDataPayload_(investmentSheet, objectiveSheet, movementSheet, futureMovementSheet, bankSheet, dataSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet) {
  const investmentTotals = syncInvestmentTotalsSheet_(investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, dataSheet || 'Datos', investmentSheet, movementSheet || DEFAULT_MOVEMENT_SHEET);
  return {
    ok: true,
    investments: readInvestments_(investmentSheet),
    investmentTotals,
    investmentEstimateRules: readInvestmentEstimateRules_(investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET),
    investmentEstimateLedger: readInvestmentEstimateLedger_(investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET),
    investmentGoals: readInvestmentGoals_(objectiveSheet),
    categories: readAppCategories_(dataSheet || 'Datos', investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheet)
  };
}

function buildQuickStatusPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, dataSheet, investmentTotalsSheet) {
  const banks = readBanks_(bankSheet);
  const investments = readInvestments_(investmentSheet);
  const investmentTotals = syncInvestmentTotalsSheet_(investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, dataSheet || 'Datos', investmentSheet || DEFAULT_INVESTMENT_SHEET, movementSheet || DEFAULT_MOVEMENT_SHEET);
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
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
    hasMore: page.hasMore
  };
  payload[payloadKey] = page.rows;
  return payload;
}

function buildMovementChangesPayload_(section, sinceRev, movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet) {
  const currentRev = getSectionRevision_(section);
  if (!sinceRev || String(sinceRev) === String(currentRev)) {
    return { ok: true, incremental: true, section, sinceRev: sinceRev || '', currentRev, changes: [] };
  }
  const log = readMovementChangeLog_().filter(item => item && item.section === section);
  let changes = [];
  const firstByPrevious = log.findIndex(item => String(item.previousRev || '') === String(sinceRev));
  if (firstByPrevious !== -1) {
    changes = log.slice(firstByPrevious);
  } else {
    const startIndex = log.findIndex(item => String(item.rev || '') === String(sinceRev));
    if (startIndex !== -1) changes = log.slice(startIndex + 1);
  }
  if (!changes.length) {
    return { ok: true, incremental: false, reason: 'La base local ya no está en el changelog.', section, sinceRev, currentRev, changes: [] };
  }
  return { ok: true, incremental: true, section, sinceRev, currentRev, changes };
}

function processedClientOpsKey_() {
  return 'moneyProcessedClientOps';
}

function movementSidHeader_() {
  return 'SID';
}

function sectionRevKey_(section) {
  return SECTION_REV_PREFIX + String(section || '');
}

function getSectionRevision_(section) {
  const props = PropertiesService.getDocumentProperties();
  let rev = props.getProperty(sectionRevKey_(section));
  if (!rev) {
    rev = String(Date.now());
    props.setProperty(sectionRevKey_(section), rev);
  }
  return rev;
}

function bumpSections_() {
  const sections = Array.from(new Set(Array.prototype.slice.call(arguments).filter(Boolean)));
  if (!sections.length) return '';
  const props = PropertiesService.getDocumentProperties();
  const stamp = `${Date.now()}-${Utilities.getUuid().slice(0, 8)}`;
  sections.forEach(section => props.setProperty(sectionRevKey_(section), stamp));
  return stamp;
}

function sectionsForPayload_(payload) {
  const action = payload && payload.action || '';
  if (action === 'addMovement') return ['transactions', 'banks', 'investmentTotals'];
  if (action === 'addFutureMovement') return ['futureTransactions'];
  if (action === 'addMovementsBatch') return ['transactions', 'futureTransactions', 'banks', 'investmentTotals'];
  if (action === 'addTransfersBatch') return ['futureTransactions', 'banks'];
  if (action === 'updateMovement' || action === 'deleteMovement' || action === 'deleteMovementsBatch') {
    const sheet = String(payload.sheetName || '');
    return sheet === DEFAULT_FUTURE_MOVEMENT_SHEET ? ['futureTransactions'] : ['transactions', 'investmentTotals'];
  }
  if (action === 'updateInvestment' || action === 'saveInvestments' || action === 'deleteInvestment') return ['investments', 'investmentTotals', 'investmentEstimateLedger'];
  if (action === 'saveInvestmentCategories') return ['categories', 'investments', 'investmentTotals', 'transactions', 'futureTransactions'];
  if (action === 'saveInvestmentEstimateRules') return ['investmentEstimateRules', 'investmentEstimateLedger'];
  if (action === 'clearInvestmentEstimates' || action === 'simulateInvestmentEstimateRule' || action === 'saveInvestmentEstimateAllocations') return ['investmentEstimateLedger'];
  if (action === 'saveInvestmentGoals') return ['investmentGoals'];
  if (action === 'saveBanks' || action === 'transferBank') return ['banks'];
  return [];
}

function movementChangelogKey_() {
  return 'moneyMovementChangelog';
}

function readMovementChangeLog_() {
  try {
    const items = JSON.parse(PropertiesService.getDocumentProperties().getProperty(movementChangelogKey_()) || '[]');
    return Array.isArray(items) ? items : [];
  } catch (err) {
    return [];
  }
}

function writeMovementChangeLog_(items) {
  PropertiesService.getDocumentProperties().setProperty(movementChangelogKey_(), JSON.stringify((items || []).slice(-MOVEMENT_CHANGELOG_LIMIT)));
}

function appendMovementChanges_(changes) {
  if (!changes || !changes.length) return;
  const log = readMovementChangeLog_();
  writeMovementChangeLog_(log.concat(changes));
}

function movementChangeEntry_(section, type, movement, rev, previousRev) {
  const sid = String(movement && movement.sid || '').trim();
  if (!sid) return null;
  return {
    id: Utilities.getUuid(),
    at: new Date().toISOString(),
    rev: String(rev || getSectionRevision_(section)),
    previousRev: String(previousRev || ''),
    section,
    type,
    sid,
    movement: type === 'delete' ? null : normalizeMovementForChange_(movement)
  };
}

function normalizeMovementForChange_(movement) {
  if (!movement) return null;
  return {
    sid: String(movement.sid || '').trim(),
    rowNumber: movement.rowNumber || '',
    fecha: normalizeDate_(movement.fecha || movement.date),
    tipo: movement.tipo || '',
    concepto: movement.concepto || '',
    descripcion: movement.descripcion || '',
    importe: parseNumber_(movement.importe !== undefined ? movement.importe : movement.amount),
    cuenta: movement.cuenta || movement.account || '',
    transferFrom: movement.transferFrom || movement.from || '',
    transferTo: movement.transferTo || movement.to || ''
  };
}

function sectionForMovementSheetName_(sheetName) {
  const normalized = normalizeType_(sheetName || '');
  return normalized.indexOf('futuro') !== -1 || String(sheetName || '') === DEFAULT_FUTURE_MOVEMENT_SHEET ? 'futureTransactions' : 'transactions';
}

function sectionForMovementDate_(movement) {
  const date = new Date(movement && (movement.date || movement.fecha));
  if (Number.isNaN(date.getTime())) return 'futureTransactions';
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date <= today ? 'transactions' : 'futureTransactions';
}

function recordPayloadMovementChanges_(payload, rev, previousRevs) {
  const action = payload && payload.action || '';
  const changes = [];
  if (action === 'addMovement') {
    changes.push(movementChangeEntry_('transactions', 'upsert', Object.assign({}, payload.movement || {}, { cuenta: payload.account || payload.movement && payload.movement.cuenta || '' }), rev, previousRevs && previousRevs.transactions));
  } else if (action === 'addFutureMovement') {
    changes.push(movementChangeEntry_('futureTransactions', 'upsert', Object.assign({}, payload.movement || {}, { cuenta: payload.account || payload.movement && payload.movement.cuenta || '' }), rev, previousRevs && previousRevs.futureTransactions));
  } else if (action === 'addMovementsBatch') {
    (payload.movements || []).forEach(movement => {
      const section = sectionForMovementDate_(movement);
      changes.push(movementChangeEntry_(section, 'upsert', Object.assign({}, movement || {}, { cuenta: payload.account || movement && movement.cuenta || '' }), rev, previousRevs && previousRevs[section]));
    });
  } else if (action === 'updateMovement') {
    const section = sectionForMovementSheetName_(payload.sheetName || DEFAULT_MOVEMENT_SHEET);
    changes.push(movementChangeEntry_(section, 'upsert', payload.movement || {}, rev, previousRevs && previousRevs[section]));
  } else if (action === 'deleteMovement') {
    const section = sectionForMovementSheetName_(payload.sheetName || DEFAULT_MOVEMENT_SHEET);
    const movement = payload.movement || {};
    changes.push(movementChangeEntry_(section, 'delete', movement, rev, previousRevs && previousRevs[section]));
  } else if (action === 'deleteMovementsBatch') {
    const section = sectionForMovementSheetName_(payload.sheetName || DEFAULT_MOVEMENT_SHEET);
    (payload.movements || []).forEach(item => {
      const movement = item && (item.movement || item) || {};
      changes.push(movementChangeEntry_(section, 'delete', movement, rev, previousRevs && previousRevs[section]));
    });
  } else if (action === 'addTransfersBatch') {
    (payload.transfers || []).forEach(transfer => {
      const section = sectionForMovementDate_(transfer);
      if (section === 'futureTransactions') {
        const accounts = transferAccountsFromMovement_(transfer, payload.from || '', payload.to || '');
        changes.push(movementChangeEntry_(section, 'upsert', Object.assign({}, transfer || {}, {
          tipo: 'Transferencia',
          concepto: 'Transferencia',
          descripcion: `${accounts.from} → ${accounts.to}`,
          cuenta: `${accounts.from} → ${accounts.to}`,
          importe: Math.abs(Number(transfer.amount || transfer.importe || payload.amount || 0))
        }), rev, previousRevs && previousRevs[section]));
      }
    });
  }
  appendMovementChanges_(changes.filter(Boolean));
}

function recordMovedFutureChanges_(movements, rev, previousRevs) {
  const changes = [];
  (movements || []).forEach(movement => {
    changes.push(movementChangeEntry_('futureTransactions', 'delete', movement, rev, previousRevs && previousRevs.futureTransactions));
    if (!isTransferType_(movement && movement.tipo)) {
      changes.push(movementChangeEntry_('transactions', 'upsert', movement, rev, previousRevs && previousRevs.transactions));
    }
  });
  appendMovementChanges_(changes.filter(Boolean));
}

function buildClientOpStatusPayload_(clientOpId) {
  if (!clientOpId) return { ok: true, completed: false, pending: false };
  return { ok: true, completed: wasClientOpProcessed_(clientOpId), pending: isClientOpPending_(clientOpId) };
}

function rememberProcessedClientOp_(clientOpId) {
  if (!clientOpId) return;
  const props = PropertiesService.getDocumentProperties();
  const items = JSON.parse(props.getProperty(processedClientOpsKey_()) || '[]')
    .filter(item => item && item.id !== clientOpId)
    .slice(-200);
  items.push({ id: clientOpId, at: new Date().toISOString() });
  props.setProperty(processedClientOpsKey_(), JSON.stringify(items));
}

function wasClientOpProcessed_(clientOpId) {
  const items = JSON.parse(PropertiesService.getDocumentProperties().getProperty(processedClientOpsKey_()) || '[]');
  return items.some(item => item && item.id === clientOpId);
}

function isClientOpPending_(clientOpId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEFAULT_PENDING_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const values = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues();
  return values.some(row => String(row[0] || '').indexOf(clientOpId) !== -1);
}


function doPost(e) {
  let payload = {};
  let pendingId = '';
  try {
    payload = JSON.parse(e.postData.contents || '{}');
    requireToken_(payload.token || '');
    if (payload.clientOpId && wasClientOpProcessed_(payload.clientOpId)) {
      return json_({ ok: true, duplicate: true });
    }
    if (payload.clientOpId && isClientOpPending_(payload.clientOpId)) {
      return json_({ ok: true, pending: true });
    }
    pendingId = appendPendingPost_(payload);
    if (payload.action === 'addMovement') {
      addMovement_(Object.assign({}, payload.movement || {}, { cuenta: payload.account || payload.movement && payload.movement.cuenta || '' }), payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      adjustInvestmentCostFromMovement_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement, 1);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      if (payload.account) adjustBank_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.account, Number(payload.movement && (payload.movement.amount || payload.movement.importe) || 0));
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'addFutureMovement') {
      addFutureMovement_(payload.movement, payload.sheetName || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.account || '');
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'addMovementsBatch') {
      addMovementsBatch_(payload.movements || [], payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.bankSheet || DEFAULT_BANK_SHEET, payload.account || '');
      (payload.movements || []).forEach(function(movement) {
        const d = new Date(movement && (movement.date || movement.fecha));
        const today = new Date(); today.setHours(23, 59, 59, 999);
        if (!Number.isNaN(d.getTime()) && d <= today) adjustInvestmentCostFromMovement_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, movement, 1);
      });
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'addTransfersBatch') {
      addTransfersBatch_(payload.transfers || [], payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.bankSheet || DEFAULT_BANK_SHEET, payload.from || '', payload.to || '', Number(payload.amount || 0));
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'updateMovement') {
      if (payload.previousMovement) adjustInvestmentCostFromMovement_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.previousMovement, -1);
      updateMovement_(payload.movement, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.previousMovement || null);
      adjustInvestmentCostFromMovement_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement, 1);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'deleteMovement') {
      if (payload.movement) adjustInvestmentCostFromMovement_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement, -1);
      deleteMovement_(payload.rowNumber, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement || null);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'deleteMovementsBatch') {
      (payload.movements || []).forEach(function(item) {
        const movement = item && (item.movement || item);
        if (movement) adjustInvestmentCostFromMovement_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET, movement, -1);
      });
      deleteMovementsBatch_(payload.movements || [], payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'updateInvestment') {
      updateInvestment_(payload.investment || {}, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.previousInvestment || null);
      if (payload.newInvestment && !isCashInvestment_(payload.investment || {})) {
        updateInvestmentQuotesFromYahoo(payload.sheetName || DEFAULT_INVESTMENT_SHEET);
      }
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true, pricesUpdated: Boolean(payload.newInvestment) });
    }
    if (payload.action === 'deleteInvestment') {
      deleteInvestment_(payload.investment || {}, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.rowNumber || 0);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true, investmentDeleted: true });
    }
    if (payload.action === 'saveInvestments') {
      saveInvestments_(payload.investments || [], payload.sheetName || DEFAULT_INVESTMENT_SHEET);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'saveInvestmentCategories') {
      saveInvestmentCategories_(payload.dataSheet || 'Datos', payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.investmentTypes || [], payload.renames || {}, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET);
      syncInvestmentTotalsSheet_(payload.investmentTotalsSheet || DEFAULT_INVESTMENT_TOTALS_SHEET, payload.dataSheet || 'Datos', payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'saveInvestmentEstimateRules') {
      saveInvestmentEstimateRules_(payload.rules || [], payload.investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'clearInvestmentEstimates') {
      clearInvestmentEstimates_(payload.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'simulateInvestmentEstimateRule') {
      const created = simulateInvestmentEstimateRule_(payload.investmentEstimateRulesSheet || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, payload.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, payload.investmentSheet || DEFAULT_INVESTMENT_SHEET, payload.ruleId || '', parseNumber_(payload.simulationAmount), payload.simulationDate || '');
      return finishPost_(pendingId, payload, { ok: true, createdEstimate: created });
    }
    if (payload.action === 'saveInvestmentEstimateAllocations') {
      const saved = saveInvestmentEstimateAllocations_(payload.investmentEstimateLedgerSheet || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, payload.entries || []);
      return finishPost_(pendingId, payload, { ok: true, estimatesSaved: saved.length });
    }
    if (payload.action === 'saveInvestmentGoals') {
      saveInvestmentGoals_(payload.goals || {}, payload.sheetName || DEFAULT_OBJECTIVE_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'saveInvestmentModePreference') {
      saveInvestmentModePreference_(payload.investmentMode || payload.mode || 'real');
      return finishPost_(pendingId, payload, { ok: true, investmentModeSaved: true, investmentMode: investmentModePreference_() });
    }
    if (payload.action === 'saveBanks') {
      saveBanks_(payload.banks || [], payload.bankSheet || DEFAULT_BANK_SHEET);
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'transferBank') {
      transferBank_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.from, payload.to, Number(payload.amount || 0));
      return finishPost_(pendingId, payload, { ok: true });
    }
    if (payload.action === 'renameAccount') {
      const renamed = renameAccount_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.oldName || '', payload.newName || '');
      return finishPost_(pendingId, payload, Object.assign({ ok: true }, renamed));
    }
    if (payload.action === 'deleteAccount') {
      const deleted = deleteAccount_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.account || '', Boolean(payload.force));
      return finishPost_(pendingId, payload, Object.assign({ ok: true }, deleted));
    }
    return finishPost_(pendingId, payload, { ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_(errorPayload_(err));
  }
}

function requireToken_(token) {
  if (APP_TOKEN && token !== APP_TOKEN) {
    throw new Error('Invalid app token');
  }
}

function appendPendingPost_(payload) {
  const id = Utilities.getUuid();
  const sheet = getOrCreateSheet_(DEFAULT_PENDING_SHEET, ['ID', 'Fecha', 'Accion', 'Payload']);
  sheet.appendRow([id, new Date(), payload.action || '', JSON.stringify(sanitizePendingPayload_(payload))]);
  return id;
}

function finishPost_(pendingId, requestPayload, responsePayload) {
  removePendingPost_(pendingId);
  const response = responsePayload || requestPayload || { ok: true };
  if (response.ok !== false && requestPayload && requestPayload.action) {
    const sections = sectionsForPayload_(requestPayload);
    const previousRevs = {};
    sections.forEach(section => previousRevs[section] = getSectionRevision_(section));
    const stamp = bumpSections_.apply(null, sections);
    recordPayloadMovementChanges_(requestPayload, stamp, previousRevs);
    rememberProcessedClientOp_(requestPayload.clientOpId || '');
  }
  return json_(response);
}

function removePendingPost_(pendingId) {
  if (!pendingId) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DEFAULT_PENDING_SHEET);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(pendingId)) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}

function sanitizePendingPayload_(payload) {
  const copy = Object.assign({}, payload);
  delete copy.token;
  return copy;
}

function createMovementSid_() {
  return `mov_${Utilities.getUuid()}`;
}

function movementSidFrom_(movement) {
  return String(movement && (movement.sid || movement.SID || movement.id || movement.ID) || '').trim() || createMovementSid_();
}

function ensureMovementSidColumn_(sheet) {
  if (!sheet) return 0;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(normalizeHeader_);
  let sidCol = headers.indexOf('sid') + 1;
  if (!sidCol) {
    sidCol = lastCol + 1;
    sheet.getRange(1, sidCol).setValue(movementSidHeader_());
  }
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const range = sheet.getRange(2, sidCol, lastRow - 1, 1);
    const values = range.getValues();
    let changed = false;
    for (let i = 0; i < values.length; i++) {
      if (!String(values[i][0] || '').trim()) {
        values[i][0] = createMovementSid_();
        changed = true;
      }
    }
    if (changed) range.setValues(values);
  }
  return sidCol;
}

function writeMovementRow_(sheet, rowNumber, movement, sid, account) {
  const date = new Date(movement.date || movement.fecha);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const amount = Number(movement.amount || movement.importe);
  if (!Number.isFinite(amount)) throw new Error('Invalid amount');
  const sidCol = ensureMovementSidColumn_(sheet);
  sheet.getRange(rowNumber, 1, 1, 8).setValues([[date, `=YEAR(A${rowNumber})`, `=MONTH(A${rowNumber})`, `=DAY(A${rowNumber})`, movement.tipo || '', movement.concepto || '', movement.descripcion || '', amount]]);
  if (sheet.getLastColumn() >= 9) sheet.getRange(rowNumber, 9).setValue(account ?? movement.cuenta ?? movement.account ?? '');
  if (sidCol) sheet.getRange(rowNumber, sidCol).setValue(sid || movementSidFrom_(movement));
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


function addMovement_(movement, sheetName) {
  if (!movement) throw new Error('Missing movement');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  ensureMovementSidColumn_(sheet);
  const row = sheet.getLastRow() + 1;
  writeMovementRow_(sheet, row, movement, movementSidFrom_(movement), movement.cuenta || movement.account || '');
}

function readMovements_(sheetName) {
  const page = readMovementsPage_(sheetName, 0, Number.MAX_SAFE_INTEGER);
  return page.rows;
}

function readMovementsPage_(sheetName, offset, limit, optional) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    if (optional) return { rows: [], total: 0, offset: 0, limit: Math.max(1, Math.min(Number(limit || 500), 1000)), nextOffset: 0, hasMore: false };
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  const sidCol = ensureMovementSidColumn_(sheet);
  const total = Math.max(0, sheet.getLastRow() - 1);
  const safeOffset = Math.max(0, Math.min(Number(offset || 0), total));
  const requestedLimit = Number(limit || 500);
  const safeLimit = requestedLimit >= Number.MAX_SAFE_INTEGER ? Math.max(1, total) : Math.max(1, Math.min(requestedLimit, 1000));
  if (!total || safeOffset >= total) {
    return { rows: [], total, offset: safeOffset, limit: safeLimit, nextOffset: safeOffset, hasMore: false };
  }
  const count = Math.min(safeLimit, total - safeOffset);
  const startRow = 2 + safeOffset;
  const width = Math.max(sheet.getLastColumn(), sidCol, 9);
  const values = sheet.getRange(startRow, 1, count, width).getValues();
  const rows = values
    .map((row, index) => movementObjectFromRow_(row, startRow + index, sidCol))
    .filter(Boolean);
  const nextOffset = safeOffset + count;
  return { rows, total, offset: safeOffset, limit: safeLimit, nextOffset, hasMore: nextOffset < total };
}

function movementObjectFromRow_(row, rowNumber, sidCol) {
  if (!row[0] || !row[4] || row[7] === '') return null;
  return {
    sid: sidCol ? String(row[sidCol - 1] || '').trim() : '',
    rowNumber,
    fecha: normalizeDate_(row[0]),
    tipo: row[4],
    concepto: row[5],
    descripcion: row[6],
    importe: parseNumber_(row[7]),
    cuenta: row[8] || ''
  };
}

function updateMovement_(movement, sheetName, previousMovement) {
  if (!movement) throw new Error('Missing movement');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const sidCol = ensureMovementSidColumn_(sheet);
  const targetSid = String(movement.sid || previousMovement && previousMovement.sid || '').trim();
  let rowNumber = targetSid ? findMovementRowBySid_(sheet, targetSid, sidCol) : Number(movement.rowNumber || 0);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) rowNumber = 0;
  if (rowNumber && previousMovement && !movementMatchesSheetRow_(sheet, rowNumber, previousMovement)) rowNumber = 0;
  if (!rowNumber && previousMovement) rowNumber = findMovementRow_(sheet, previousMovement);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error('Movement not found');
  writeMovementRow_(sheet, rowNumber, movement, targetSid || movementSidFrom_(movement), movement.cuenta || movement.account || '');
}

function deleteMovement_(rowNumber, sheetName, movement) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const sidCol = ensureMovementSidColumn_(sheet);
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

function deleteMovementsBatch_(items, sheetName) {
  if (!items.length) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = [];
  const sidCol = ensureMovementSidColumn_(sheet);
  items.forEach(item => {
    const movement = item && (item.movement || item);
    const sid = String(movement && movement.sid || '').trim();
    let row = sid ? findMovementRowBySid_(sheet, sid, sidCol) : Number(item && item.rowNumber || 0);
    if (movement && row >= 2 && row <= sheet.getLastRow() && !movementMatchesSheetRow_(sheet, row, movement)) {
      row = 0;
    }
    if ((!row || row < 2 || row > sheet.getLastRow()) && movement) {
      row = findMovementRow_(sheet, movement, rows);
    }
    if (row >= 2 && row <= sheet.getLastRow()) rows.push(row);
  });
  const uniqueRows = Array.from(new Set(rows)).sort((a, b) => b - a);
  if (!uniqueRows.length) throw new Error('Movements not found');
  uniqueRows.forEach(row => sheet.deleteRow(row));
}

function findMovementRow_(sheet, movement, excludedRows) {
  const excluded = excludedRows || [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const sidCol = ensureMovementSidColumn_(sheet);
  const sid = String(movement && movement.sid || '').trim();
  const sidRow = sid ? findMovementRowBySid_(sheet, sid, sidCol) : 0;
  if (sidRow && excluded.indexOf(sidRow) === -1) return sidRow;
  for (let row = lastRow; row >= 2; row--) {
    if (excluded.indexOf(row) !== -1) continue;
    if (movementMatchesSheetRow_(sheet, row, movement)) return row;
  }
  return 0;
}

function movementMatchesSheetRow_(sheet, row, movement) {
  const sidCol = ensureMovementSidColumn_(sheet);
  const values = sheet.getRange(row, 1, 1, Math.max(sheet.getLastColumn(), sidCol, 8)).getValues()[0];
  const movementSid = String(movement && movement.sid || '').trim();
  const rowSid = sidCol ? String(values[sidCol - 1] || '').trim() : '';
  if (movementSid && rowSid && movementSid === rowSid) return true;
  const movementDate = normalizeDate_(movement.date || movement.fecha);
  const rowDate = normalizeDate_(values[0]);
  const movementAmount = parseNumber_(movement.amount || movement.importe);
  const rowAmount = parseNumber_(values[7]);
  return rowDate === movementDate
    && String(values[4] || '').trim() === String(movement.tipo || '').trim()
    && String(values[5] || '').trim() === String(movement.concepto || '').trim()
    && String(values[6] || '').trim() === String(movement.descripcion || '').trim()
    && Math.abs(rowAmount - movementAmount) < 0.005;
}

function addFutureMovement_(movement, sheetName, account) {
  if (!movement) throw new Error('Missing movement');
  const sheet = getOrCreateSheet_(sheetName, ['FECHA', 'AÑO', 'MES', 'DIA', 'TIPO', 'CONCEPTO', 'DESCRIPCION', 'IMPORTE', 'Cuenta', movementSidHeader_()]);
  ensureMovementSidColumn_(sheet);
  const row = sheet.getLastRow() + 1;
  writeMovementRow_(sheet, row, movement, movementSidFrom_(movement), account || movement.account || movement.cuenta || '');
}

function addMovementsBatch_(movements, movementSheet, futureSheet, bankSheet, account) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  movements.forEach(movement => {
    const date = new Date(movement.date || movement.fecha);
    if (Number.isNaN(date.getTime())) return;
    if (date <= today) {
      addMovement_(Object.assign({}, movement || {}, { cuenta: account || movement && movement.cuenta || '' }), movementSheet);
      if (account) adjustBank_(bankSheet, account, Number(movement.amount || movement.importe || 0));
    } else {
      addFutureMovement_(movement, futureSheet, account);
    }
  });
}

function addTransfersBatch_(transfers, futureSheet, bankSheet, defaultFrom, defaultTo, defaultAmount) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  transfers.forEach(transfer => {
    const date = new Date(transfer.date || transfer.fecha);
    if (Number.isNaN(date.getTime())) return;
    const accounts = transferAccountsFromMovement_(transfer, defaultFrom, defaultTo);
    const amount = Math.abs(Number(transfer.amount || transfer.importe || defaultAmount || 0));
    if (!accounts.from || !accounts.to || accounts.from === accounts.to || !Number.isFinite(amount) || amount <= 0) return;
    if (date <= today) {
      transferBank_(bankSheet, accounts.from, accounts.to, amount);
    } else {
      addFutureTransfer_(transfer, futureSheet, accounts.from, accounts.to, amount);
    }
  });
}

function addFutureTransfer_(transfer, sheetName, from, to, amount) {
  const accountText = `${from} → ${to}`;
  addFutureMovement_({
    fecha: transfer.fecha || transfer.date,
    tipo: 'Transferencia',
    concepto: 'Transferencia',
    descripcion: accountText,
    importe: Math.abs(Number(amount || transfer.amount || transfer.importe || 0)),
    cuenta: accountText,
    sid: transfer.sid || transfer.SID || ''
  }, sheetName, accountText);
}

function transferAccountsFromMovement_(movement, fallbackFrom, fallbackTo) {
  const explicitFrom = String(movement && (movement.transferFrom || movement.from) || '').trim();
  const explicitTo = String(movement && (movement.transferTo || movement.to) || '').trim();
  if (explicitFrom || explicitTo) return { from: explicitFrom || fallbackFrom || '', to: explicitTo || fallbackTo || '' };
  return parseTransferAccountText_(movement && (movement.cuenta || movement.account || movement.descripcion) || `${fallbackFrom || ''} → ${fallbackTo || ''}`);
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

function readFutureMovements_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const page = readMovementsPage_(sheetName, 0, Number.MAX_SAFE_INTEGER);
  return page.rows;
}

function moveDueFutureMovements_(futureSheetName, movementSheetName, bankSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const futureSheet = ss.getSheetByName(futureSheetName);
  if (!futureSheet) return [];
  const sidCol = ensureMovementSidColumn_(futureSheet);
  const values = futureSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const moved = [];
  const rowsToDelete = [];
  for (let r = values.length - 1; r >= 1; r--) {
    const row = values[r];
    const date = parseMovementDate_(row[0]);
    if (!date || date > today) continue;
    const movement = { sid: sidCol ? String(row[sidCol - 1] || '').trim() : '', fecha: normalizeDate_(date), tipo: row[4], concepto: row[5], descripcion: row[6], importe: parseNumber_(row[7]) };
    if (isTransferType_(movement.tipo)) {
      const accounts = parseTransferAccountText_(row[8] || row[6]);
      const amount = Math.abs(Number(movement.importe || 0));
      if (!accounts.from || !accounts.to || accounts.from === accounts.to || !Number.isFinite(amount) || amount <= 0) continue;
      transferBank_(bankSheetName, accounts.from, accounts.to, amount);
      moved.push({ ...movement, cuenta: `${accounts.from} → ${accounts.to}`, transferFrom: accounts.from, transferTo: accounts.to });
    } else {
      addMovement_(movement, movementSheetName);
      if (row[8]) adjustBank_(bankSheetName, row[8], movement.importe);
      moved.push({ ...movement, cuenta: row[8] || '' });
    }
    rowsToDelete.push(r + 1);
  }
  rowsToDelete.sort((a, b) => b - a).forEach(rowNumber => futureSheet.deleteRow(rowNumber));
  return moved.reverse();
}

function getOrCreateSheet_(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
  }
  return sheet;
}

function readInvestments_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const col = investmentColumnMap_(sheet);
  return values.slice(1)
    .map((row, index) => {
      const displayRow = displayValues[index + 1] || [];
      const cantidad = parseNumber_(row[col.cantidad - 1]);
      const valor = parseNumber_(row[col.valor - 1]);
      let total = parseNumber_(col.total ? row[col.total - 1] : NaN);
      if (!Number.isFinite(total) && Number.isFinite(cantidad) && Number.isFinite(valor)) total = cantidad * valor;
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
        variacion: normalizeInvestmentPercent_(col.variacion ? row[col.variacion - 1] : NaN, col.variacion ? displayRow[col.variacion - 1] : '')
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

function ensureInvestmentEstimateSheets_(rulesSheetName, ledgerSheetName, movementSheetName) {
  const rulesSheet = getOrCreateSheet_(rulesSheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, investmentEstimateRuleHeaders_());
  const ledgerSheet = getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  resetSheetHeaders_(rulesSheet, investmentEstimateRuleHeaders_());
  resetSheetHeaders_(ledgerSheet, investmentEstimateLedgerHeaders_());
  return { rulesSheet, ledgerSheet };
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

function investmentEstimateBaselineKey_(movementSheetName) {
  return INVESTMENT_ESTIMATE_BASELINE_PREFIX + String(movementSheetName || DEFAULT_MOVEMENT_SHEET);
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


function estimateColumnMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0].map(normalizeType_);
  function col(names, fallback) {
    for (var i = 0; i < names.length; i++) {
      const target = normalizeType_(names[i]);
      const idx = headers.indexOf(target);
      if (idx !== -1) return idx + 1;
    }
    return fallback;
  }
  return {
    id: col(['ID'], 1),
    active: col(['Activa', 'Activo', 'Active'], 2),
    day: col(['Día Mes', 'Dia Mes', 'Day Of Month'], 3),
    movementDescription: col(['Descripción Movimiento', 'Descripcion Movimiento', 'Descripción', 'Descripcion'], 4),
    tipo: col(['Tipo Inversión', 'Tipo Inversion', 'Tipo'], 0),
    data: col(['Data', 'Ticker', 'Ticker/ISIN'], 5),
    nombre: col(['Nombre', 'Name'], 6),
    shortName: col(['Short Name', 'Short', 'Nombre Corto'], 7),
    percentage: col(['Porcentaje', '%'], 8),
    fixedAmount: col(['Importe Fijo', 'Fijo', 'Importe'], 9),
    order: col(['Orden'], 0)
  };
}

function ledgerColumnMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0].map(normalizeType_);
  function col(names, fallback) {
    for (var i = 0; i < names.length; i++) {
      const target = normalizeType_(names[i]);
      const idx = headers.indexOf(target);
      if (idx !== -1) return idx + 1;
    }
    return fallback;
  }
  return {
    id: col(['ID'], 1), active: col(['Activo', 'Activa'], 2), fecha: col(['Fecha Movimiento'], 3), sid: col(['SID Movimiento'], 4),
    tipo: col(['Tipo Inversión', 'Tipo Inversion', 'Tipo'], 5), data: col(['Data', 'Ticker'], 6), nombre: col(['Nombre'], 7), shortName: col(['Short Name'], 8),
    importe: col(['Importe'], 9), precio: col(['Precio Usado'], 10), shares: col(['Shares Estimadas'], 11), origen: col(['Origen'], 12)
  };
}

function readInvestmentEstimateRules_(sheetName) {
  const setup = ensureInvestmentEstimateSheets_(sheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET, DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, DEFAULT_MOVEMENT_SHEET);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName || DEFAULT_INVESTMENT_ESTIMATE_RULES_SHEET) || setup.rulesSheet;
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
  if (rows.length) sheet.getRange(2, 1, rows.length, investmentEstimateRuleHeaders_().length).setValues(rows);
}

function readInvestmentEstimateLedger_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  resetSheetHeaders_(sheet, investmentEstimateLedgerHeaders_());
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
  const movementSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(movementSheetName || DEFAULT_MOVEMENT_SHEET);
  PropertiesService.getDocumentProperties().setProperty(investmentEstimateBaselineKey_(movementSheetName || DEFAULT_MOVEMENT_SHEET), String(movementSheet ? movementSheet.getLastRow() : 1));
}

function applyInvestmentEstimateRulesForNewMovements_(rulesSheetName, ledgerSheetName, movementSheetName, investmentSheetName, processLastIfNoBaseline) {
  ensureInvestmentEstimateSheets_(rulesSheetName, ledgerSheetName, movementSheetName);
  const movementSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(movementSheetName || DEFAULT_MOVEMENT_SHEET);
  if (!movementSheet) return [];
  const props = PropertiesService.getDocumentProperties();
  const baselineKey = investmentEstimateBaselineKey_(movementSheetName || DEFAULT_MOVEMENT_SHEET);
  const lastRow = movementSheet.getLastRow();
  const storedBaseline = props.getProperty(baselineKey);
  const baseline = storedBaseline ? Number(storedBaseline) : (processLastIfNoBaseline ? Math.max(1, lastRow - 1) : lastRow);
  if (!storedBaseline && !processLastIfNoBaseline) props.setProperty(baselineKey, String(lastRow));
  if (lastRow <= baseline) return [];
  const sidCol = ensureMovementSidColumn_(movementSheet);
  const width = Math.max(movementSheet.getLastColumn(), sidCol, 9);
  const values = movementSheet.getRange(baseline + 1, 1, lastRow - baseline, width).getValues();
  const movements = values.map(function(row, index) { return movementObjectFromRow_(row, baseline + 1 + index, sidCol); }).filter(Boolean);
  const created = applyInvestmentEstimateRulesForMovements_(rulesSheetName, ledgerSheetName, investmentSheetName, movements, 'movimiento');
  props.setProperty(baselineKey, String(lastRow));
  return created;
}

function applyInvestmentEstimateRulesForMovements_(rulesSheetName, ledgerSheetName, investmentSheetName, movements, origin) {
  const rules = readInvestmentEstimateRules_(rulesSheetName).filter(function(rule) { return rule.activa; });
  if (!rules.length) return [];
  const investments = readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET);
  const ledgerSheet = getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  ensureSheetHeaders_(ledgerSheet, investmentEstimateLedgerHeaders_());
  const existing = investmentEstimateLedgerKeys_(ledgerSheet);
  const created = [];
  (movements || []).forEach(function(movement) {
    if (!movement || normalizeType_(movement.tipo) !== 'inversion') return;
    rules.forEach(function(rule) {
      if (!investmentEstimateRuleMatchesMovement_(rule, movement)) return;
      const key = String(movement.sid || movement.rowNumber || '') + '|' + String(rule.id || '');
      if (existing[key]) return;
      const amount = investmentEstimateRuleAmount_(rule, Math.abs(parseNumber_(movement.importe)));
      const price = investmentEstimateRulePrice_(rule, investments);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) return;
      const row = appendInvestmentEstimateLedgerRow_(ledgerSheet, rule, movement, amount, price, origin || 'movimiento');
      existing[key] = true;
      created.push(row);
    });
  });
  return created;
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

function investmentEstimateRuleMatchesMovement_(rule, movement) {
  if (!rule || !movement) return false;
  if (normalizeType_(movement.tipo) !== 'inversion') return false;
  if (normalizeType_(movement.concepto || '') && normalizeType_(movement.concepto || '') !== 'inversion') return false;
  const movementDate = new Date(movement.fecha || movement.date);
  const day = Number(rule.dayOfMonth || 0);
  if (day && (!movementDate || movementDate.getDate() !== day)) return false;
  const desc = normalizeType_(rule.movementDescription || '');
  if (desc && normalizeType_(movement.descripcion || '').indexOf(desc) === -1) return false;
  return true;
}

function investmentEstimateRuleAmount_(rule, movementAmount) {
  const fixed = parseNumber_(rule.fixedAmount);
  if (Number.isFinite(fixed) && fixed > 0) return Math.min(fixed, movementAmount);
  let pct = parseNumber_(rule.percentage);
  if (!Number.isFinite(pct) || pct <= 0) return NaN;
  if (pct > 1) pct = pct / 100;
  return movementAmount * pct;
}

function investmentEstimateRulePrice_(rule, investments) {
  const match = findInvestmentForEstimateRule_(rule, investments || []);
  const price = parseNumber_(match && match.valor);
  return Number.isFinite(price) && price > 0 ? price : NaN;
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

function appendInvestmentEstimateLedgerRow_(sheet, rule, movement, amount, price, origin) {
  const shares = amount / price;
  const id = 'est_' + Utilities.getUuid();
  const date = new Date(movement.fecha || movement.date || new Date());
  const row = [
    id,
    true,
    date,
    String(movement.sid || '').trim() || ('sim_' + Utilities.getUuid()),
    rule.tipo || movement.descripcion || '',
    rule.data || '',
    rule.nombre || rule.data || '',
    rule.shortName || rule.nombre || rule.data || '',
    amount,
    price,
    shares,
    origin || 'movimiento'
  ];
  sheet.appendRow(row);
  return {
    id: id,
    activo: true,
    fechaMovimiento: normalizeDate_(date),
    sidMovimiento: row[3],
    reglaId: '',
    tipo: row[4],
    data: row[5],
    nombre: row[6],
    shortName: row[7],
    importe: amount,
    precioUsado: price,
    sharesEstimadas: shares,
    origen: row[11],
    createdAt: '',
    movimiento: ''
  };
}

function simulateInvestmentEstimateRule_(rulesSheetName, ledgerSheetName, investmentSheetName, ruleId, amount, dateText) {
  const rules = readInvestmentEstimateRules_(rulesSheetName);
  const rule = rules.find(function(item) { return String(item.id || '') === String(ruleId || ''); });
  if (!rule) throw new Error('Regla no encontrada');
  const price = investmentEstimateRulePrice_(rule, readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET));
  if (!Number.isFinite(price) || price <= 0) throw new Error('No se encontró precio para simular la regla');
  const movementAmount = Number.isFinite(amount) && amount > 0 ? amount : parseNumber_(rule.simulateAmount);
  const usedAmount = investmentEstimateRuleAmount_(rule, movementAmount);
  if (!Number.isFinite(usedAmount) || usedAmount <= 0) throw new Error('Importe de simulación inválido');
  const movement = { sid: 'sim_' + Utilities.getUuid(), fecha: normalizeDate_(dateText || new Date()), tipo: 'Inversión', concepto: rule.movementConcept || 'Simulación', descripcion: rule.movementDescription || 'Simulación manual', importe: -Math.abs(usedAmount) };
  const sheet = getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  ensureSheetHeaders_(sheet, investmentEstimateLedgerHeaders_());
  return appendInvestmentEstimateLedgerRow_(sheet, rule, movement, usedAmount, price, 'simulación manual');
}


function saveInvestmentEstimateAllocations_(ledgerSheetName, entries) {
  const sheet = getOrCreateSheet_(ledgerSheetName || DEFAULT_INVESTMENT_ESTIMATE_LEDGER_SHEET, investmentEstimateLedgerHeaders_());
  resetSheetHeaders_(sheet, investmentEstimateLedgerHeaders_());
  const existingIds = investmentEstimateLedgerKeys_(sheet);
  const saved = [];
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
    sheet.appendRow(row);
    saved.push(entry);
    existingIds[key] = true;
  });
  if (saved.length) bumpSections_('investmentEstimateLedger');
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
      investments.push({ rowNumber: null, divisa: 'EUR', data: entry.data || '', nombre: entry.nombre || entry.data || 'Estimación', shortName: entry.shortName || '', tipo: entry.tipo || 'Cartera', cantidad: shares, valor: price, total: shares * price, valorAnterior: price, variacion: 0 });
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const goals = { incomeMonthly: 0, expenseMonthly: 0, investmentMonthly: 0, monthly: 0, yearly: 0, total: 0 };
  if (!sheet) return goals;
  const values = sheet.getDataRange().getDisplayValues();
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const values = sheet.getDataRange().getDisplayValues();
  return values.slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      cuenta: String(row[0] || '').trim(),
      dinero: parseNumber_(row[1])
    }))
    .filter(row => row.cuenta && Number.isFinite(row.dinero));
}

function saveBanks_(banks, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  banks.forEach(item => {
    if (!item || !item.cuenta) return;
    const rowNumber = Number(item.rowNumber || findBankRow_(sheet, item.cuenta) || 0);
    const values = [[item.cuenta, Number(item.dinero || 0)]];
    if (rowNumber >= 2 && rowNumber <= sheet.getMaxRows()) {
      sheet.getRange(rowNumber, 1, 1, 2).setValues(values);
    } else {
      sheet.appendRow(values[0]);
    }
  });
}

function transferBank_(sheetName, from, to, amount) {
  const transferAmount = Math.abs(Number(amount || 0));
  if (!from || !to || from === to || !Number.isFinite(transferAmount) || transferAmount <= 0) throw new Error('Invalid transfer');
  adjustBank_(sheetName, from, -transferAmount);
  adjustBank_(sheetName, to, transferAmount);
}

function adjustBank_(sheetName, account, delta) {
  if (!account || !Number.isFinite(delta) || delta === 0) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const row = findBankRow_(sheet, account);
  if (!row) throw new Error(`Bank account not found: ${account}`);
  const current = parseNumber_(sheet.getRange(row, 2).getValue());
  sheet.getRange(row, 2).setValue((Number.isFinite(current) ? current : 0) + delta);
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

function renameAccountInMovementSheet_(sheetName, oldName, newName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return 0;
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0 || sheet.getLastColumn() < 9) return 0;
  const range = sheet.getRange(2, 9, rowCount, 1);
  const values = range.getValues();
  let changed = 0;
  const normalizedOld = String(oldName).trim();
  values.forEach(row => {
    if (String(row[0]).trim() === normalizedOld) {
      row[0] = newName;
      changed++;
    }
  });
  if (changed) range.setValues(values);
  return changed;
}

function renameAccount_(bankSheetName, movementSheetName, futureMovementSheetName, oldName, newName) {
  const normalizedOld = String(oldName || '').trim();
  const normalizedNew = String(newName || '').trim();
  if (!normalizedOld || !normalizedNew) throw new Error('Nombre de cuenta inválido');
  if (normalizedOld === normalizedNew) return { movementsUpdated: 0, futureMovementsUpdated: 0 };
  const bankSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(bankSheetName);
  if (!bankSheet) throw new Error(`Sheet not found: ${bankSheetName}`);
  const bankRow = findBankRow_(bankSheet, normalizedOld);
  if (!bankRow) throw new Error(`Bank account not found: ${normalizedOld}`);
  if (findBankRow_(bankSheet, normalizedNew)) throw new Error(`Ya existe una cuenta llamada ${normalizedNew}`);
  bankSheet.getRange(bankRow, 1).setValue(normalizedNew);
  const movementsUpdated = renameAccountInMovementSheet_(movementSheetName, normalizedOld, normalizedNew);
  const futureMovementsUpdated = renameAccountInMovementSheet_(futureMovementSheetName, normalizedOld, normalizedNew);
  return { movementsUpdated, futureMovementsUpdated };
}

function accountReferenceCountInMovementSheet_(sheetName, account) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
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
  const bankSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(bankSheetName);
  if (!bankSheet) throw new Error(`Sheet not found: ${bankSheetName}`);
  const row = findBankRow_(bankSheet, normalized);
  if (!row) throw new Error(`Bank account not found: ${normalized}`);
  bankSheet.deleteRow(row);
  return { movementsCount, futureMovementsCount };
}

function saveInvestments_(investments, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  investments.forEach(item => {
    if (!item || !item.data || !item.nombre || !item.tipo || !isInvestmentPositionType_(item.tipo)) return;
    const rowNumber = Number(item.rowNumber || 0);
    const targetRow = rowNumber >= 2 && rowNumber <= sheet.getMaxRows() ? rowNumber : 0;
    if (targetRow) {
      writeInvestmentEditableFields_(sheet, targetRow, item);
    } else {
      const row = new Array(Math.max(sheet.getLastColumn(), 9)).fill('');
      sheet.appendRow(row);
      writeInvestmentEditableFields_(sheet, sheet.getLastRow(), item);
    }
  });
}


function updateInvestment_(investment, sheetName, previousInvestment) {
  if (!investment) throw new Error('Missing investment');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

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
  if (col.divisa) sheet.getRange(row, col.divisa).setValue(normalizeInvestmentCurrency_(item.divisa || 'EUR'));
  if (col.data) sheet.getRange(row, col.data).setValue(item.data || '');
  if (col.nombre) sheet.getRange(row, col.nombre).setValue(item.nombre || '');
  if (col.shortName) sheet.getRange(row, col.shortName).setValue(item.shortName || item.short_name || item.shortname || '');
  if (col.tipo) sheet.getRange(row, col.tipo).setValue(item.tipo || '');
  if (!isCash && col.cantidad) sheet.getRange(row, col.cantidad).setValue(Number(item.cantidad || 0));
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
  if (col.total) sheet.getRange(row, col.total).setValue(cash);
  if (col.valorAnterior) sheet.getRange(row, col.valorAnterior).setValue(cash);
}

function recalculateInvestmentTotalInRow_(sheet, row) {
  const col = investmentColumnMap_(sheet);
  if (!col.total || !col.valor || !col.cantidad) return;
  const type = String(sheet.getRange(row, col.tipo).getValue() || '').trim();
  if (!isInvestmentPositionType_(type)) return;
  const quantity = parseNumber_(sheet.getRange(row, col.cantidad).getValue());
  const price = parseNumber_(sheet.getRange(row, col.valor).getValue());
  if (Number.isFinite(quantity) && Number.isFinite(price)) sheet.getRange(row, col.total).setValue(quantity * price);
  if (col.variacion && col.valorAnterior) {
    const previous = parseNumber_(sheet.getRange(row, col.valorAnterior).getValue());
    if (Number.isFinite(previous) && previous) writeInvestmentVariation_(sheet, row, col.variacion, percentageChange_(price, previous));
  }
}

function deleteInvestment_(investment, sheetName, rowNumber) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
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

function updateInvestmentPricesFromYahoo(sheetName) {
  return updateInvestmentQuotesFromYahooOptimized_(sheetName || DEFAULT_INVESTMENT_SHEET).prices;
}

function updateInvestmentPreviousPricesFromYahoo(sheetName) {
  return updateInvestmentQuotesFromYahooOptimized_(sheetName || DEFAULT_INVESTMENT_SHEET).previous;
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
  if (Number.isFinite(priceEur) && col.valor) sheet.getRange(rowNumber, col.valor).setValue(priceEur);
  if (Number.isFinite(previousEur) && col.valorAnterior) sheet.getRange(rowNumber, col.valorAnterior).setValue(previousEur);
  updateCurrencyHelperRow_(sheet, col, rates);
  return { row: rowNumber, ticker, price: priceEur, previousClose: previousEur, currency: sourceCurrency, yahooCurrency: quote.currency };
}

function updateInvestmentQuotesFromYahooOptimized_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName || DEFAULT_INVESTMENT_SHEET);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName || DEFAULT_INVESTMENT_SHEET}`);
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

  rowsToUpdate.forEach(({ row, rowNumber }) => {
    const ticker = String(row[col.data - 1] || '').trim();
    const quote = quotes[yahooTickerAlias_(ticker)];
    if (!quote) return;
    const sourceCurrency = normalizeInvestmentCurrency_(row[(col.divisa || 1) - 1] || quote.currency || 'EUR');
    const priceEur = convertQuotePriceToEur_(quote.regularMarketPrice, sourceCurrency, rates);
    const previousEur = convertQuotePriceToEur_(quote.previousClose, sourceCurrency, rates);

    if (Number.isFinite(priceEur)) {
      // Yahoo solo actualiza PRICE. No se escribe VALUE: esa columna queda para fórmulas de Sheets.
      sheet.getRange(rowNumber, col.valor).setValue(priceEur);
      prices.push({ row: rowNumber, ticker, price: priceEur, currency: sourceCurrency, yahooCurrency: quote.currency });
    }
    if (Number.isFinite(previousEur) && col.valorAnterior) {
      // Yahoo solo actualiza LAST PRICE. No se recalculan VALUE/VARIATION aquí.
      sheet.getRange(rowNumber, col.valorAnterior).setValue(previousEur);
      previous.push({ row: rowNumber, ticker, previousClose: previousEur, currency: sourceCurrency, yahooCurrency: quote.currency });
    }
  });

  updateCurrencyHelperRow_(sheet, col, rates);
  return { prices, previous };
}

function writeInvestmentVariation_(sheet, row, column, percentagePoints) {
  const amount = Number(percentagePoints);
  if (!Number.isFinite(amount)) return;
  sheet.getRange(row, column).setNumberFormat('0.00').setValue(amount);
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

function investmentRowCurrency_(sheet, row, col, fallbackCurrency) {
  const manual = col.divisa ? sheet.getRange(row, col.divisa).getValue() : '';
  return normalizeInvestmentCurrency_(manual || fallbackCurrency || 'EUR');
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
  uniqueTickers.forEach(ticker => {
    if (!out[ticker]) out[ticker] = getYahooQuote_(ticker);
  });
  return out;
}


function getYahooQuote_(ticker) {
  const yahooTicker = yahooTickerAlias_(ticker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}`;
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`Yahoo error ${code} para ${ticker}`);
  const json = JSON.parse(res.getContentText());
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  const meta = result && result.meta;
  if (!meta) throw new Error(`Respuesta Yahoo inválida para ${ticker}`);
  return {
    ticker,
    yahooTicker,
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

function getCurrencyRates_() {
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

function updateCurrencyHelperRow_(sheet, col, rates) {
  const lastRow = sheet.getLastRow();
  for (let row = 2; row <= Math.min(lastRow, 10); row++) {
    const ticker = String(sheet.getRange(row, col.data).getValue() || '').trim();
    if (ticker === 'EUR-USD' || ticker === 'EUR/USD') {
      sheet.getRange(row, col.valor).setValue(Number(rates.eurUsd || 0));
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
  sendTelegramMessage_(formatGeneralInvestmentMessage_(summary));
  (summary.order || []).forEach(type => sendTelegramMessage_(formatTypeInvestmentMessage_(summary, type)));
}

function sendInvestmentNotificationsOnce_(requestId, sendFn) {
  if (!requestId) {
    sendFn();
    return { sent: true, duplicate: false };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
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
    sendFn();
    processed.push({ id: requestId, at: new Date().toISOString() });
    props.setProperty(PROCESSED_NOTIFICATION_REQUESTS_KEY, JSON.stringify(processed.slice(-100)));
    return { sent: true, duplicate: false };
  } finally {
    lock.releaseLock();
  }
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

function buildInvestmentVariationSummary_(sheetName) {
  const resolvedSheetName = sheetName || DEFAULT_INVESTMENT_SHEET;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(resolvedSheetName);
  if (!sheet) throw new Error(`Sheet not found: ${resolvedSheetName}`);
  const col = investmentColumnMap_(sheet);
  const values = sheet.getDataRange().getValues();
  const categories = readInvestmentCategoriesForTotals_(DEFAULT_INVESTMENT_TOTALS_SHEET, resolvedSheetName);
  const totals = { all: emptyVariationBucket_(), order: categories };
  categories.forEach(function(type) { totals[type] = emptyVariationBucket_(); });

  values.slice(1).forEach(row => {
    const type = String(row[col.tipo - 1] || '').trim();
    if (!isInvestmentPositionType_(type)) return;
    const normalizedType = categories.find(item => normalizeType_(item) === normalizeType_(type)) || type;
    if (!totals[normalizedType]) {
      totals[normalizedType] = emptyVariationBucket_();
      totals.order.push(normalizedType);
    }
    const name = String((col.shortName ? row[col.shortName - 1] : '') || (col.nombre ? row[col.nombre - 1] : '') || row[col.data - 1] || '').trim();
    const quantity = parseNumber_(row[col.cantidad - 1]);
    const currentPrice = parseNumber_(row[col.valor - 1]);
    const currentTotal = parseNumber_(col.total ? row[col.total - 1] : NaN);
    const previousPrice = parseNumber_(col.valorAnterior ? row[col.valorAnterior - 1] : NaN);
    const isCash = isCashInvestment_({ data: row[col.data - 1], nombre: row[col.nombre - 1] });
    const total = Number.isFinite(currentTotal)
      ? currentTotal
      : (Number.isFinite(quantity) && Number.isFinite(currentPrice) ? quantity * currentPrice : NaN);
    const previousTotal = isCash
      ? (Number.isFinite(parseNumber_(col.valorAnterior ? row[col.valorAnterior - 1] : NaN))
        ? parseNumber_(col.valorAnterior ? row[col.valorAnterior - 1] : NaN)
        : total)
      : (Number.isFinite(quantity) && Number.isFinite(previousPrice) ? quantity * previousPrice : NaN);
    if (!Number.isFinite(total) || !Number.isFinite(previousTotal)) return;
    const variation = total - previousTotal;
    const position = {
      name,
      type: normalizedType,
      isCash,
      price: currentPrice,
      current: total,
      previous: previousTotal,
      variation,
      pct: percentageChange_(total, previousTotal)
    };
    addVariationRow_(totals.all, position);
    addVariationRow_(totals[normalizedType], position);
  });
  Object.keys(totals).forEach(key => {
    if (key === 'order') return;
    totals[key].positions.sort((a, b) => Number(b.current || 0) - Number(a.current || 0));
  });
  return totals;
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
  const lines = [
    `💰 <b>MoneyManagement - Resumen diario</b>`,
    `<b>Total:</b> ${formatMoney_(all.current)} | ${formatPct_(percentageChange_(all.current, all.previous))} | ${formatSignedMoney_(all.variation)}`,
    ''
  ];
  (summary.order || []).forEach(type => {
    const bucket = summary[type] || emptyVariationBucket_();
    lines.push(`${emojiForType_(type)} ${type}: ${formatMoney_(bucket.current)} | ${formatPct_(percentageChange_(bucket.current, bucket.previous))} | ${formatSignedMoney_(bucket.variation)}`);
  });
  return lines.join('\n');
}

function formatTypeInvestmentMessage_(summary, type) {
  const bucket = summary[type] || emptyVariationBucket_();
  const lines = [
    `${emojiForType_(type)} <b>${type}</b>: ${formatMoney_(bucket.current)} | ${formatPct_(percentageChange_(bucket.current, bucket.previous))} | ${formatSignedMoney_(bucket.variation)}`
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
  if (type === 'Bolsa') return '📈';
  if (type === 'Fondos') return '🏦';
  if (type === 'Cartera') return '💼';
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

function saveInvestmentGoals_(goals, sheetName) {
  const sheet = getOrCreateSheet_(sheetName, ['Tiempo', 'Valor']);
  const rows = [
    ['Gasto mensual', Number(goals.expenseMonthly || 0)],
    ['Inversión mensual', Number(goals.investmentMonthly || goals.monthly || 0)],
    ['Inversión anual', Number(goals.yearly || goals.anual || 0)],
    ['Inversión total', Number(goals.total || 0)]
  ];
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}



function readInvestmentCategoriesForTotals_(totalsSheetName, investmentSheetName) {
  const totals = readInvestmentTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET)
    .sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); })
    .map(function(item) { return String(item.tipo || '').trim(); })
    .filter(Boolean);
  const investments = readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET)
    .map(function(item) { return String(item.tipo || '').trim(); })
    .filter(Boolean);
  return Array.from(new Set([].concat(totals, investments).filter(Boolean)));
}

function readAppCategories_(dataSheetName, totalsSheetName, investmentSheetName) {
  const categories = readCategories_(dataSheetName || 'Datos');
  categories.investmentTypes = readInvestmentCategoriesForTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheetName || DEFAULT_INVESTMENT_SHEET);
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
    const amount = Math.abs(parseNumber_(movement.importe ?? movement.amount));
    if (Number.isFinite(amount)) result[category] = (result[category] || 0) + amount;
  });
  return result;
}

function positionPreviousTotal_(item) {
  if (isCashInvestment_(item)) return parseNumber_(item.total ?? item.value ?? item.VALUE) || 0;
  const quantity = parseNumber_(item.cantidad ?? item.shares ?? item.SHARES);
  const lastPrice = parseNumber_(item.valorAnterior ?? item.lastPrice ?? item['LAST PRICE']);
  if (Number.isFinite(quantity) && Number.isFinite(lastPrice)) return quantity * lastPrice;
  return parseNumber_(item.total ?? item.value ?? item.VALUE) || 0;
}

function syncInvestmentTotalsSheet_(totalsSheetName, dataSheetName, investmentSheetName, movementSheetName) {
  const totalsSheet = getOrCreateSheet_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, ['TIPO', 'COST', 'VALUE', 'LAST VALUE', 'DAILY', '%D', 'GAIN', '%GAIN', 'ORDEN']);
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
  totalsSheet.getRange(1, 1, 1, 9).setValues([['TIPO', 'COST', 'VALUE', 'LAST VALUE', 'DAILY', '%D', 'GAIN', '%GAIN', 'ORDEN']]);
  if (lastRow > 1) totalsSheet.getRange(2, 1, lastRow - 1, Math.max(9, totalsSheet.getLastColumn())).clearContent();
  if (rows.length) totalsSheet.getRange(2, 1, rows.length, 9).setValues(rows);
  if (rows.length) {
    totalsSheet.getRange(2, 2, rows.length, 4).setNumberFormat('0.00');
    totalsSheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00%');
    totalsSheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.00');
    totalsSheet.getRange(2, 8, rows.length, 1).setNumberFormat('0.00%');
  }
  return readInvestmentTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET);
}

function readInvestmentTotals_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName || DEFAULT_INVESTMENT_TOTALS_SHEET);
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

function adjustInvestmentCostFromMovement_(totalsSheetName, dataSheetName, investmentSheetName, movementSheetName, movement, sign) {
  if (normalizeType_(movementSheetName || '').indexOf('futuro') !== -1) return;
  const categories = readInvestmentCategoriesForTotals_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, investmentSheetName || DEFAULT_INVESTMENT_SHEET);
  const category = movementInvestmentCategory_(movement, categories);
  if (!category) return;
  const amount = Math.abs(parseNumber_(movement && (movement.importe ?? movement.amount)));
  if (!Number.isFinite(amount) || amount <= 0) return;
  syncInvestmentTotalsSheet_(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, dataSheetName || 'Datos', investmentSheetName || DEFAULT_INVESTMENT_SHEET, movementSheetName || DEFAULT_MOVEMENT_SHEET);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(totalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET);
  if (!sheet) return;
  const values = sheet.getRange(2, 1, Math.max(0, sheet.getLastRow() - 1), 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeType_(values[i][0]) === normalizeType_(category)) {
      const current = parseNumber_(values[i][1]);
      sheet.getRange(i + 2, 2).setValue(Math.max(0, (Number.isFinite(current) ? current : 0) + sign * amount));
      return;
    }
  }
}

function readCategories_(sheetName) {
  const sheet = ensureDataSheet_(sheetName || 'Datos');
  const values = sheet.getDataRange().getDisplayValues();
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

function saveInvestmentCategories_(dataSheetName, investmentSheetName, investmentTypes, renames, movementSheetName, futureMovementSheetName, investmentTotalsSheetName) {
  const categories = Array.from(new Set((investmentTypes || []).map(v => String(v || '').trim()).filter(Boolean)));
  if (!categories.length) throw new Error('Faltan categorías de inversión');

  const investmentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(investmentSheetName || DEFAULT_INVESTMENT_SHEET);
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
  updateInvestmentCategoryNamesInTotals_(investmentTotalsSheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, renames || {}, categories, investmentSheetName || DEFAULT_INVESTMENT_SHEET);
}

function updateInvestmentCategoryNamesInTotals_(sheetName, renames, orderedCategories, investmentSheetName) {
  const sheet = getOrCreateSheet_(sheetName || DEFAULT_INVESTMENT_TOTALS_SHEET, ['TIPO', 'COST', 'VALUE', 'LAST VALUE', 'DAILY', '%D', 'GAIN', '%GAIN', 'ORDEN']);
  const requested = (orderedCategories || []).map(v => String(v || '').trim()).filter(Boolean);
  const requestedKeys = new Set(requested.map(normalizeType_));
  const positionsByType = {};
  readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET).forEach(item => {
    const key = normalizeType_(item.tipo);
    if (!key) return;
    positionsByType[key] = (positionsByType[key] || 0) + 1;
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
    if (hasPosition || hasCost || hasValue) {
      throw new Error('No se puede borrar la categoría "' + item.type + '" porque tiene posiciones, coste o valor.');
    }
  });

  Object.keys(positionsByType).forEach(key => {
    if (!requestedKeys.has(key)) {
      const label = readInvestments_(investmentSheetName || DEFAULT_INVESTMENT_SHEET).find(item => normalizeType_(item.tipo) === key)?.tipo || key;
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

  sheet.getRange(1, 1, 1, 9).setValues([['TIPO', 'COST', 'VALUE', 'LAST VALUE', 'DAILY', '%D', 'GAIN', '%GAIN', 'ORDEN']]);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(9, sheet.getLastColumn())).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  if (rows.length) {
    sheet.getRange(2, 2, rows.length, 4).setNumberFormat('0.00');
    sheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00%');
    sheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.00');
    sheet.getRange(2, 8, rows.length, 1).setNumberFormat('0.00%');
  }
}

function updateInvestmentCategoryNamesInMovements_(sheetName, renames) {
  const entries = Object.entries(renames || {}).filter(entry => entry[0] && entry[1]);
  if (!entries.length) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const width = Math.max(sheet.getLastColumn(), 4);
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    const type = normalizeType_(row[1]);
    const desc = String(row[3] || '').trim();
    if (type !== 'inversion') return;
    const match = entries.find(([from]) => normalizeType_(from) === normalizeType_(desc));
    if (match) {
      row[3] = match[1];
      changed = true;
    }
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
  match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
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

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorCode_(err) {
  const message = String(err && err.message ? err.message : err || '');
  if (/Invalid app token/i.test(message)) return 'AUTH';
  if (/Sheet not found/i.test(message)) return 'SHEET_NOT_FOUND';
  if (/not found/i.test(message)) return 'NOT_FOUND';
  if (/Invalid transfer|inválido|inv[aá]lida/i.test(message)) return 'VALIDATION';
  if (/tiene \d+ movimientos asociados/i.test(message)) return 'CONFLICT';
  if (/Ya existe una cuenta/i.test(message)) return 'CONFLICT';
  if (/quota|límite|limit/i.test(message)) return 'QUOTA';
  return 'UNKNOWN';
}

function errorPayload_(err) {
  const message = String(err && err.message ? err.message : err);
  return { ok: false, error: message, errorCode: errorCode_(err) };
}
