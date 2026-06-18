const APP_TOKEN = '';
const DEFAULT_MOVEMENT_SHEET = 'Control Finanzas';
const DEFAULT_INVESTMENT_SHEET = 'Inversiones';
const DEFAULT_BANK_SHEET = 'Bancos';
const DEFAULT_FUTURE_MOVEMENT_SHEET = 'Movimientos futuros';
const DEFAULT_OBJECTIVE_SHEET = 'Objetivos';
const DEFAULT_PENDING_SHEET = 'Pendientes';

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
      payload = {
        ok: true,
        transactions: readMovements_(movementSheet),
        futureTransactions: readFutureMovements_(futureMovementSheet),
        movedFutureMovements,
        investments: readInvestments_(investmentSheet),
        banks: readBanks_(bankSheet),
        investmentGoals: readInvestmentGoals_(objectiveSheet),
        categories: readCategories_(dataSheet)
      };
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
    if (payload.action === 'updateMovement') {
      updateMovement_(payload.movement, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
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

function updateMovement_(movement, sheetName) {
  if (!movement) throw new Error('Missing movement');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const rowNumber = Number(movement.rowNumber || 0);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error('Invalid rowNumber');

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
  for (let r = values.length - 1; r >= 1; r--) {
    const row = values[r];
    const date = new Date(row[0]);
    if (!row[0] || Number.isNaN(date.getTime()) || date > today) continue;
    const movement = { fecha: normalizeDate_(date), tipo: row[4], concepto: row[5], descripcion: row[6], importe: parseNumber_(row[7]) };
    addMovement_(movement, movementSheetName);
    if (row[8]) adjustBank_(bankSheetName, row[8], movement.importe);
    moved.push({ ...movement, cuenta: row[8] || '' });
    futureSheet.deleteRow(r + 1);
  }
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
    .map((row, index) => ({
      rowNumber: index + 2,
      data: row[0],
      nombre: row[1],
      tipo: row[2],
      cantidad: parseNumber_(row[3]),
      valor: parseNumber_(row[4]),
      total: parseNumber_(row[5])
    }))
    .filter(row => row.data && row.nombre && row.tipo && Number.isFinite(row.total) && row.total > 0);
}

function readInvestmentGoals_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const goals = { monthly: 0, yearly: 0, total: 0 };
  if (!sheet) return goals;
  const values = sheet.getDataRange().getDisplayValues();
  values.slice(1).forEach(row => {
    const key = normalizeGoalKey_(row[0]);
    const value = parseNumber_(row[1]);
    if (key && Number.isFinite(value)) goals[key] = value;
  });
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
  if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid transfer');
  adjustBank_(sheetName, from, -amount);
  adjustBank_(sheetName, to, amount);
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
    if (!item || !item.data || !item.nombre || !item.tipo) return;
    const rowNumber = Number(item.rowNumber || 0);
    if (rowNumber >= 2 && rowNumber <= sheet.getMaxRows()) {
      sheet.getRange(rowNumber, 4).setValue(Number(item.cantidad || 0));
    } else {
      const values = [[
        item.data,
        item.nombre,
        item.tipo,
        Number(item.cantidad || 0),
        Number(item.valor || 0),
        Number(item.total || 0)
      ]];
      sheet.appendRow(values[0]);
    }
  });
}

function saveInvestmentGoals_(goals, sheetName) {
  const sheet = getOrCreateSheet_(sheetName, ['Tiempo', 'Valor']);
  const rows = [
    ['Mensual', Number(goals.monthly || goals.mensual || 0)],
    ['Anual', Number(goals.yearly || goals.anual || 0)],
    ['Total', Number(goals.total || 0)]
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
  if (text === 'mensual') return 'monthly';
  if (text === 'anual') return 'yearly';
  if (text === 'total') return 'total';
  return '';
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
