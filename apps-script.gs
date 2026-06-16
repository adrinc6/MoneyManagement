const DEFAULT_MOVEMENT_SHEET = 'Control Finanzas';
const DEFAULT_INVESTMENT_SHEET = 'Inversiones';
const APP_TOKEN = '';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = params.callback || '';
  const action = params.action || 'all';
  const movementSheet = params.movementSheet || DEFAULT_MOVEMENT_SHEET;
  const investmentSheet = params.investmentSheet || DEFAULT_INVESTMENT_SHEET;
  const dataSheet = params.dataSheet || 'Datos';

  let payload;
  try {
    requireToken_(params.token || '');
    if (action === 'all') {
      payload = {
        ok: true,
        transactions: readMovements_(movementSheet),
        investments: readInvestments_(investmentSheet),
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
  try {
    payload = JSON.parse(e.postData.contents || '{}');
    requireToken_(payload.token || '');
    if (payload.action === 'addMovement') {
      addMovement_(payload.movement, payload.sheetName || DEFAULT_MOVEMENT_SHEET);
      return json_({ ok: true });
    }
    if (payload.action === 'saveInvestments') {
      saveInvestments_(payload.investments || [], payload.sheetName || DEFAULT_INVESTMENT_SHEET);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function requireToken_(token) {
  if (APP_TOKEN && token !== APP_TOKEN) {
    throw new Error('Invalid app token');
  }
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
    .filter(row => row[0] && row[4] && row[7])
    .map(row => ({
      fecha: normalizeDate_(row[0]),
      tipo: row[4],
      concepto: row[5],
      descripcion: row[6],
      importe: parseNumber_(row[7])
    }));
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

function saveInvestments_(investments, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

  investments.forEach(item => {
    if (!item || !item.data || !item.nombre || !item.tipo) return;
    const rowNumber = Number(item.rowNumber || 0);
    const values = [[
      item.data,
      item.nombre,
      item.tipo,
      Number(item.cantidad || 0),
      Number(item.valor || 0),
      Number(item.total || 0)
    ]];
    if (rowNumber >= 2 && rowNumber <= sheet.getMaxRows()) {
      sheet.getRange(rowNumber, 1, 1, 6).setValues(values);
    } else {
      sheet.appendRow(values[0]);
    }
  });
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

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
