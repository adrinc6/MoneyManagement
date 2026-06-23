const APP_TOKEN = '';
const DEFAULT_MOVEMENT_SHEET = 'Control Finanzas';
const DEFAULT_INVESTMENT_SHEET = 'Inversiones';
const DEFAULT_BANK_SHEET = 'Bancos';
const DEFAULT_FUTURE_MOVEMENT_SHEET = 'Movimientos futuros';
const DEFAULT_OBJECTIVE_SHEET = 'Objetivos';
const DEFAULT_PENDING_SHEET = 'Pendientes';
const TELEGRAM_BOT_TOKEN = '';
const TELEGRAM_CHAT_ID = '';
const DAILY_NOTIFICATION_HOUR = 23;

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

  let payload;
  try {
    requireToken_(params.token || '');
    if (action === 'all') {
      const movedFutureMovements = moveDueFutureMovements_(futureMovementSheet, movementSheet, bankSheet);
      if (String(params.updateInvestments || '') === '1') updateInvestmentQuotesFromYahoo(investmentSheet);
      payload = buildAllDataPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, movedFutureMovements);
    } else if (action === 'sendDailyNotifications') {
      const movedFutureMovements = moveDueFutureMovements_(futureMovementSheet, movementSheet, bankSheet);
      updateInvestmentQuotesFromYahoo(investmentSheet);
      sendInvestmentNotificationMessages_(investmentSheet);
      payload = buildAllDataPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, movedFutureMovements);
      payload.notificationsSent = true;
    } else {
      payload = { ok: false, error: 'Unknown action' };
    }
  } catch (err) {
    payload = { ok: false, error: String(err && err.message ? err.message : err) };
  }

  const json = JSON.stringify(payload);
  const output = callback ? `${callback}(${json});` : json;
  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function buildAllDataPayload_(movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, movedFutureMovements) {
  return {
    ok: true,
    transactions: readMovements_(movementSheet),
    futureTransactions: readFutureMovements_(futureMovementSheet),
    movedFutureMovements: movedFutureMovements || [],
    investments: readInvestments_(investmentSheet),
    banks: readBanks_(bankSheet),
    investmentGoals: readInvestmentGoals_(objectiveSheet),
    categories: readCategories_(dataSheet)
  };
}

function doPost(e) {
  let payload = {};
  let pendingId = '';
  try {
    payload = JSON.parse(e.postData.contents || '{}');
    requireToken_(payload.token || '');
    pendingId = appendPendingPost_(payload);
    if (payload.action === 'addMovement') {
      addMovement_(payload.movement, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      if (payload.account) adjustBank_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.account, Number(payload.movement && (payload.movement.amount || payload.movement.importe) || 0));
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'addFutureMovement') {
      addFutureMovement_(payload.movement, payload.sheetName || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.account || '');
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'addMovementsBatch') {
      addMovementsBatch_(payload.movements || [], payload.movementSheet || DEFAULT_MOVEMENT_SHEET, payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.bankSheet || DEFAULT_BANK_SHEET, payload.account || '');
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'addTransfersBatch') {
      addTransfersBatch_(payload.transfers || [], payload.futureMovementSheet || DEFAULT_FUTURE_MOVEMENT_SHEET, payload.bankSheet || DEFAULT_BANK_SHEET, payload.from || '', payload.to || '', Number(payload.amount || 0));
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'updateMovement') {
      updateMovement_(payload.movement, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.previousMovement || null);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'deleteMovement') {
      deleteMovement_(payload.rowNumber, payload.sheetName || DEFAULT_MOVEMENT_SHEET, payload.movement || null);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'deleteMovementsBatch') {
      deleteMovementsBatch_(payload.movements || [], payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'updateInvestment') {
      updateInvestment_(payload.investment || {}, payload.sheetName || DEFAULT_INVESTMENT_SHEET, payload.previousInvestment || null);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'saveInvestments') {
      saveInvestments_(payload.investments || [], payload.sheetName || DEFAULT_INVESTMENT_SHEET);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'saveInvestmentGoals') {
      saveInvestmentGoals_(payload.goals || {}, payload.sheetName || DEFAULT_OBJECTIVE_SHEET);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'saveBanks') {
      saveBanks_(payload.banks || [], payload.bankSheet || DEFAULT_BANK_SHEET);
      return finishPost_(pendingId, { ok: true });
    }
    if (payload.action === 'transferBank') {
      transferBank_(payload.bankSheet || DEFAULT_BANK_SHEET, payload.from, payload.to, Number(payload.amount || 0));
      return finishPost_(pendingId, { ok: true });
    }
    return finishPost_(pendingId, { ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
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

function finishPost_(pendingId, payload) {
  removePendingPost_(pendingId);
  return json_(payload);
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

function addMovement_(movement, sheetName) {
  if (!movement) throw new Error('Missing movement');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const date = new Date(movement.date || movement.fecha);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');

  const amount = Number(movement.amount || movement.importe);
  if (!Number.isFinite(amount)) throw new Error('Invalid amount');

  sheet.appendRow([
    date,
    `=YEAR(A${sheet.getLastRow() + 1})`,
    `=MONTH(A${sheet.getLastRow() + 1})`,
    `=DAY(A${sheet.getLastRow() + 1})`,
    movement.tipo || '',
    movement.concepto || '',
    movement.descripcion || '',
    amount
  ]);
}

function readMovements_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const values = sheet.getDataRange().getValues();
  return values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(item => item.row[0] && item.row[4] && item.row[7] !== '')
    .map(item => ({
      rowNumber: item.rowNumber,
      fecha: normalizeDate_(item.row[0]),
      tipo: item.row[4],
      concepto: item.row[5],
      descripcion: item.row[6],
      importe: parseNumber_(item.row[7])
    }));
}

function updateMovement_(movement, sheetName, previousMovement) {
  if (!movement) throw new Error('Missing movement');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  let rowNumber = Number(movement.rowNumber || 0);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) rowNumber = 0;
  if (rowNumber && previousMovement && !movementMatchesSheetRow_(sheet, rowNumber, previousMovement)) rowNumber = 0;
  if (!rowNumber && previousMovement) rowNumber = findMovementRow_(sheet, previousMovement);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error('Movement not found');

  const date = new Date(movement.date || movement.fecha);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const amount = Number(movement.amount || movement.importe);
  if (!Number.isFinite(amount)) throw new Error('Invalid amount');

  const values = [
    date,
    `=YEAR(A${rowNumber})`,
    `=MONTH(A${rowNumber})`,
    `=DAY(A${rowNumber})`,
    movement.tipo || '',
    movement.concepto || '',
    movement.descripcion || '',
    amount
  ];
  if (sheet.getLastColumn() >= 9) values.push(movement.cuenta || movement.account || '');
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
}

function deleteMovement_(rowNumber, sheetName, movement) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  let row = Number(rowNumber || 0);
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
  items.forEach(item => {
    const movement = item && (item.movement || item);
    let row = Number(item && item.rowNumber || 0);
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
  for (let row = lastRow; row >= 2; row--) {
    if (excluded.indexOf(row) !== -1) continue;
    if (movementMatchesSheetRow_(sheet, row, movement)) return row;
  }
  return 0;
}

function movementMatchesSheetRow_(sheet, row, movement) {
  const values = sheet.getRange(row, 1, 1, Math.max(sheet.getLastColumn(), 8)).getValues()[0];
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
  const sheet = getOrCreateSheet_(sheetName, ['FECHA', 'AÑO', 'MES', 'DIA', 'TIPO', 'CONCEPTO', 'DESCRIPCION', 'IMPORTE', 'Cuenta']);
  const date = new Date(movement.date || movement.fecha);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const amount = Number(movement.amount || movement.importe);
  if (!Number.isFinite(amount)) throw new Error('Invalid amount');
  const row = sheet.getLastRow() + 1;
  sheet.appendRow([date, `=YEAR(A${row})`, `=MONTH(A${row})`, `=DAY(A${row})`, movement.tipo || '', movement.concepto || '', movement.descripcion || '', amount, account || movement.account || movement.cuenta || '']);
}

function addMovementsBatch_(movements, movementSheet, futureSheet, bankSheet, account) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  movements.forEach(movement => {
    const date = new Date(movement.date || movement.fecha);
    if (Number.isNaN(date.getTime())) return;
    if (date <= today) {
      addMovement_(movement, movementSheet);
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
    cuenta: accountText
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
  return ['bolsa', 'fondos', 'cartera'].indexOf(normalized) !== -1;
}

function readFutureMovements_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  return values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(item => item.row[0] && item.row[4] && item.row[7] !== '')
    .map(item => ({
      rowNumber: item.rowNumber,
      fecha: normalizeDate_(item.row[0]),
      tipo: item.row[4],
      concepto: item.row[5],
      descripcion: item.row[6],
      importe: parseNumber_(item.row[7]),
      cuenta: item.row[8] || ''
    }));
}

function moveDueFutureMovements_(futureSheetName, movementSheetName, bankSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const futureSheet = ss.getSheetByName(futureSheetName);
  if (!futureSheet) return [];
  const values = futureSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const moved = [];
  const rowsToDelete = [];
  for (let r = values.length - 1; r >= 1; r--) {
    const row = values[r];
    const date = new Date(row[0]);
    if (!row[0] || Number.isNaN(date.getTime()) || date > today) continue;
    const movement = { fecha: normalizeDate_(date), tipo: row[4], concepto: row[5], descripcion: row[6], importe: parseNumber_(row[7]) };
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
  const values = sheet.getDataRange().getValues();
  return values.slice(1)
    .map((row, index) => {
      const cantidad = parseNumber_(row[4]);
      const valor = parseNumber_(row[5]);
      let total = parseNumber_(row[6]);
      if (!Number.isFinite(total) && Number.isFinite(cantidad) && Number.isFinite(valor)) total = cantidad * valor;
      return {
        rowNumber: index + 2,
        divisa: String(row[0] || '').trim() || 'EUR',
        data: row[1],
        nombre: row[2],
        tipo: row[3],
        cantidad,
        valor,
        total,
        valorAnterior: parseNumber_(row[7]),
        variacion: parseNumber_(row[8])
      };
    })
    .filter(row => row.data && row.nombre && isInvestmentPositionType_(row.tipo) && Number.isFinite(row.total) && row.total >= 0);
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

function saveInvestments_(investments, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  investments.forEach(item => {
    if (!item || !item.data || !item.nombre || !item.tipo || !isInvestmentPositionType_(item.tipo)) return;
    const rowNumber = Number(item.rowNumber || 0);
    const values = [[
      normalizeInvestmentCurrency_(item.divisa || 'EUR'),
      item.data || '',
      item.nombre || '',
      item.tipo || '',
      Number(item.cantidad || 0)
    ]];
    if (rowNumber >= 2 && rowNumber <= sheet.getMaxRows()) {
      sheet.getRange(rowNumber, 1, 1, 5).setValues(values);
      recalculateInvestmentTotalInRow_(sheet, rowNumber);
    } else {
      sheet.appendRow(values[0]);
      recalculateInvestmentTotalInRow_(sheet, sheet.getLastRow());
    }
  });
}

function updateInvestment_(investment, sheetName, previousInvestment) {
  if (!investment) throw new Error('Missing investment');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  const rowNumber = Number(investment.rowNumber || previousInvestment && previousInvestment.rowNumber || 0);
  const targetRow = rowNumber >= 2 && rowNumber <= sheet.getLastRow()
    ? rowNumber
    : findInvestmentRow_(sheet, investment, previousInvestment);
  if (targetRow < 2 || targetRow > sheet.getLastRow()) throw new Error('Investment not found');

  if (!isInvestmentPositionType_(investment.tipo)) throw new Error('Investment type not editable');
  sheet.getRange(targetRow, 1, 1, 5).setValues([[
    normalizeInvestmentCurrency_(investment.divisa || 'EUR'),
    investment.data || '',
    investment.nombre || '',
    investment.tipo || '',
    Number(investment.cantidad || 0)
  ]]);
  recalculateInvestmentTotalInRow_(sheet, targetRow);
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
    if (Number.isFinite(previous) && previous) sheet.getRange(row, col.variacion).setValue((price - previous) / previous);
  }
}

function findInvestmentRow_(sheet, investment, previousInvestment) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, Math.min(sheet.getLastColumn(), 9)).getValues();
  const candidates = [investment, previousInvestment].filter(Boolean);
  for (const candidate of candidates) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (
        String(row[1]).trim() === String(candidate.data || '').trim() &&
        String(row[2]).trim() === String(candidate.nombre || '').trim()
      ) {
        return i + 2;
      }
    }
  }
  return 0;
}


function updateInvestmentQuotesFromYahoo(sheetName) {
  const prices = updateInvestmentPricesFromYahoo(sheetName || DEFAULT_INVESTMENT_SHEET);
  const previous = updateInvestmentPreviousPricesFromYahoo(sheetName || DEFAULT_INVESTMENT_SHEET);
  return { prices, previous };
}

function updateInvestmentPricesFromYahoo(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName || DEFAULT_INVESTMENT_SHEET);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName || DEFAULT_INVESTMENT_SHEET}`);
  const col = investmentColumnMap_(sheet);
  const rates = getCurrencyRates_();
  const lastRow = sheet.getLastRow();
  const results = [];

  for (let row = 2; row <= lastRow; row++) {
    const ticker = String(sheet.getRange(row, col.data).getValue() || '').trim();
    const type = String(sheet.getRange(row, col.tipo).getValue() || '').trim();
    const quantity = parseNumber_(sheet.getRange(row, col.cantidad).getValue());
    if (!ticker || !isInvestmentPositionType_(type)) continue;
    const quote = getYahooQuote_(ticker);
    const sourceCurrency = investmentRowCurrency_(sheet, row, col, quote.currency);
    const priceEur = convertQuotePriceToEur_(quote.regularMarketPrice, sourceCurrency, rates);
    if (!Number.isFinite(priceEur)) continue;
    sheet.getRange(row, col.valor).setValue(priceEur);
    if (col.total && Number.isFinite(quantity)) sheet.getRange(row, col.total).setValue(quantity * priceEur);
    if (col.variacion) {
      const previousValue = parseNumber_(sheet.getRange(row, col.valorAnterior).getValue());
      if (Number.isFinite(previousValue) && previousValue) sheet.getRange(row, col.variacion).setValue((priceEur - previousValue) / previousValue);
    }
    results.push({ row, ticker, price: priceEur, currency: sourceCurrency, yahooCurrency: quote.currency });
  }
  updateCurrencyHelperRow_(sheet, col, rates);
  return results;
}

function updateInvestmentPreviousPricesFromYahoo(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName || DEFAULT_INVESTMENT_SHEET);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName || DEFAULT_INVESTMENT_SHEET}`);
  const col = investmentColumnMap_(sheet);
  const rates = getCurrencyRates_();
  const lastRow = sheet.getLastRow();
  const results = [];

  for (let row = 2; row <= lastRow; row++) {
    const ticker = String(sheet.getRange(row, col.data).getValue() || '').trim();
    const type = String(sheet.getRange(row, col.tipo).getValue() || '').trim();
    if (!ticker || !isInvestmentPositionType_(type)) continue;
    const quote = getYahooQuote_(ticker);
    const sourceCurrency = investmentRowCurrency_(sheet, row, col, quote.currency);
    const previousEur = convertQuotePriceToEur_(quote.previousClose, sourceCurrency, rates);
    if (!Number.isFinite(previousEur)) continue;
    sheet.getRange(row, col.valorAnterior).setValue(previousEur);
    if (col.variacion) {
      const currentValue = parseNumber_(sheet.getRange(row, col.valor).getValue());
      if (Number.isFinite(currentValue) && previousEur) sheet.getRange(row, col.variacion).setValue((currentValue - previousEur) / previousEur);
    }
    results.push({ row, ticker, previousClose: previousEur, currency: sourceCurrency, yahooCurrency: quote.currency });
  }
  updateCurrencyHelperRow_(sheet, col, rates);
  return results;
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
    tipo: find(['tipo', 'type']),
    cantidad: find(['cantidad', 'qty', 'quantity']),
    valor: find(['valor', 'precio', 'price']),
    total: find(['valor total eur', 'valor total €', 'valor total', 'total']),
    valorAnterior: find(['valor anterior', 'precio anterior', 'previous close']),
    variacion: find(['% variacion', 'variacion', '% variación'])
  };
  ['divisa', 'data', 'tipo', 'cantidad', 'valor', 'valorAnterior'].forEach(key => {
    if (!map[key]) throw new Error(`Falta columna en Inversiones: ${key}`);
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
  const pairs = {
    USD: 'EURUSD=X',
    GBP: 'GBPEUR=X',
    CHF: 'EURCHF=X'
  };
  const eurUsdQuote = getYahooQuote_(pairs.USD);
  rates.eurUsd = Number(eurUsdQuote.regularMarketPrice);
  rates.USD = rates.eurUsd ? 1 / rates.eurUsd : 1;
  try {
    const gbpEurQuote = getYahooQuote_(pairs.GBP);
    rates.gbpEur = Number(gbpEurQuote.regularMarketPrice);
    rates.GBP = rates.gbpEur || 1;
  } catch (err) {
    rates.gbpEur = 1;
    rates.GBP = 1;
  }
  try {
    const eurChfQuote = getYahooQuote_(pairs.CHF);
    const eurChf = Number(eurChfQuote.regularMarketPrice);
    rates.CHF = eurChf ? 1 / eurChf : 1;
  } catch (err) {
    rates.CHF = 1;
  }
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
  moveDueFutureMovements_(DEFAULT_FUTURE_MOVEMENT_SHEET, DEFAULT_MOVEMENT_SHEET, DEFAULT_BANK_SHEET);
  updateInvestmentQuotesFromYahoo(DEFAULT_INVESTMENT_SHEET);
  sendInvestmentNotificationMessages_(DEFAULT_INVESTMENT_SHEET);
}

function sendInvestmentNotificationMessages_(investmentSheet) {
  const summary = buildInvestmentVariationSummary_(investmentSheet || DEFAULT_INVESTMENT_SHEET);
  sendTelegramMessage_(formatGeneralInvestmentMessage_(summary));
  ['Bolsa', 'Fondos', 'Cartera'].forEach(type => sendTelegramMessage_(formatTypeInvestmentMessage_(summary, type)));
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
  const values = sheet.getDataRange().getValues();
  const totals = {
    all: emptyVariationBucket_(),
    Bolsa: emptyVariationBucket_(),
    Fondos: emptyVariationBucket_(),
    Cartera: emptyVariationBucket_()
  };
  values.slice(1).forEach(row => {
    const type = String(row[3] || '').trim();
    if (!isInvestmentPositionType_(type)) return;
    const normalizedType = ['Bolsa', 'Fondos', 'Cartera'].find(item => normalizeType_(item) === normalizeType_(type));
    const name = String(row[2] || row[1] || '').trim();
    const quantity = parseNumber_(row[4]);
    const currentPrice = parseNumber_(row[5]);
    const currentTotal = parseNumber_(row[6]);
    const previousPrice = parseNumber_(row[7]);
    if (!Number.isFinite(quantity) || !Number.isFinite(currentPrice) || !Number.isFinite(previousPrice)) return;
    const previousTotal = quantity * previousPrice;
    const total = Number.isFinite(currentTotal) ? currentTotal : quantity * currentPrice;
    const variation = total - previousTotal;
    const position = {
      name,
      type: normalizedType,
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
    totals[key].positions.sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation));
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
    `💰 <b>MoneyManagement · Resumen diario</b>`,
    `<b>Total:</b> ${formatMoney_(all.current)} · ${formatSignedMoney_(all.variation)} · ${formatPct_(percentageChange_(all.current, all.previous))}`,
    '',
    '<b>Desglose</b>'
  ];
  ['Bolsa', 'Fondos', 'Cartera'].forEach(type => {
    const bucket = summary[type] || emptyVariationBucket_();
    lines.push(`${emojiForType_(type)} ${type}: ${formatMoney_(bucket.current)} · ${formatSignedMoney_(bucket.variation)} · ${formatPct_(percentageChange_(bucket.current, bucket.previous))}`);
  });
  return lines.join('\n');
}

function formatTypeInvestmentMessage_(summary, type) {
  const bucket = summary[type] || emptyVariationBucket_();
  const lines = [
    `${emojiForType_(type)} <b>${type}</b>`,
    `<b>Conjunto:</b> ${formatMoney_(bucket.current)} · ${formatSignedMoney_(bucket.variation)} · ${formatPct_(percentageChange_(bucket.current, bucket.previous))}`
  ];
  if (bucket.positions.length) {
    lines.push('', '<b>Posiciones</b>');
    bucket.positions.forEach(position => {
      lines.push(`${position.variation >= 0 ? '🟢' : '🔴'} ${escapeTelegramHtml_(position.name)}: ${formatMoney_(position.price)} · ${formatPct_(position.pct)} (${formatMoney_(position.current)})`);
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
  return previous ? (current - previous) / previous : 0;
}

function emojiForType_(type) {
  if (type === 'Bolsa') return '📈';
  if (type === 'Fondos') return '🏦';
  if (type === 'Cartera') return '💼';
  return '💰';
}

function formatMoney_(value) {
  return `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatSignedMoney_(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? '+' : ''}${formatMoney_(amount)}`;
}

function formatPct_(value) {
  const amount = Number(value || 0) * 100;
  return `${amount >= 0 ? '+' : ''}${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
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

function readCategories_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { types: [], concepts: [] };
  const values = sheet.getDataRange().getDisplayValues();
  return {
    types: values.slice(1).map(row => row[0]).filter(Boolean),
    concepts: values.slice(1).map(row => row[1]).filter(Boolean)
  };
}

function normalizeDate_(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
