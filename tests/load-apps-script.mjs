// Carga apps-script.gs REAL en un contexto vm con la API de Google Apps Script
// stubeada, para poder probar la lógica que mueve dinero sin depender de Google.
//
// Lo importante de estos stubs es que una hoja puede declarar REGLAS DE VALIDACIÓN
// que rechazan valores lanzando el mismo error que lanza Google:
//   "Los datos introducidos en la celda I66 infringen las reglas de validación..."
// Ese es exactamente el fallo que impedía guardar las transferencias periódicas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, "..", "apps-script.gs");

function columnLetter(col) {
  let out = "";
  let n = col;
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const isBlank = value => value === "" || value === null || value === undefined;

class FakeSheet {
  constructor(name, id, rows = []) {
    this.name = name;
    this.id = id;
    this.data = rows.map(row => [...row]);
    // columna (1-based) -> función que devuelve true si el valor es aceptable
    this.validations = new Map();
    // celdas "A1" a las que se les ha limpiado la validación
    this.clearedValidations = new Set();
    this.deletedRows = [];
  }

  // Declara una regla de validación de rechazo sobre una columna (1-based).
  setColumnValidation(col, isAllowed) {
    this.validations.set(col, isAllowed);
  }

  getName() { return this.name; }
  getSheetId() { return this.id; }

  getLastRow() {
    let last = 0;
    this.data.forEach((row, idx) => {
      if ((row || []).some(cell => !isBlank(cell))) last = idx + 1;
    });
    return last;
  }

  getLastColumn() {
    let last = 0;
    this.data.forEach(row => {
      (row || []).forEach((cell, idx) => {
        if (!isBlank(cell)) last = Math.max(last, idx + 1);
      });
    });
    return last;
  }

  getMaxRows() { return Math.max(this.data.length, 1000); }

  _ensureCell(row, col) {
    while (this.data.length < row) this.data.push([]);
    const target = this.data[row - 1];
    while (target.length < col) target.push("");
  }

  _checkValidation(row, col, value) {
    const a1 = `${columnLetter(col)}${row}`;
    if (this.clearedValidations.has(a1)) return;
    const rule = this.validations.get(col);
    if (!rule) return;
    // Una celda en blanco nunca infringe una regla de validación en Sheets.
    if (isBlank(value)) return;
    if (rule(value)) return;
    throw new Error(`Los datos introducidos en la celda ${a1} infringen las reglas de validación de datos definidas en esa celda.`);
  }

  _write(row, col, value) {
    this._checkValidation(row, col, value);
    this._ensureCell(row, col);
    this.data[row - 1][col - 1] = value;
  }

  _read(row, col) {
    const target = this.data[row - 1];
    if (!target) return "";
    const value = target[col - 1];
    return value === undefined ? "" : value;
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols);
  }

  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((value, idx) => this._checkValidation(row, idx + 1, value));
    values.forEach((value, idx) => this._write(row, idx + 1, value));
  }

  deleteRow(row) {
    this.deletedRows.push(row);
    this.data.splice(row - 1, 1);
  }

  deleteRows(row, count = 1) {
    this.data.splice(row - 1, count);
  }
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      for (let c = 0; c < this.numCols; c++) row.push(this.sheet._read(this.row + r, this.col + c));
      out.push(row);
    }
    return out;
  }

  getDisplayValues() {
    return this.getValues().map(row => row.map(cell => (cell === null || cell === undefined ? "" : String(cell))));
  }

  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numCols; }

  getValue() { return this.sheet._read(this.row, this.col); }

  setValue(value) {
    this.sheet._write(this.row, this.col, value);
    return this;
  }

  setValues(values) {
    // Como en Sheets: si alguna celda infringe una validación, no se escribe nada.
    values.forEach((rowValues, r) => {
      rowValues.forEach((value, c) => this.sheet._checkValidation(this.row + r, this.col + c, value));
    });
    values.forEach((rowValues, r) => {
      rowValues.forEach((value, c) => this.sheet._write(this.row + r, this.col + c, value));
    });
    return this;
  }

  clearDataValidations() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.clearedValidations.add(`${columnLetter(this.col + c)}${this.row + r}`);
      }
    }
    return this;
  }

  setNumberFormat() { return this; }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet._write(this.row + r, this.col + c, "");
    }
    return this;
  }
}

class FakeSpreadsheet {
  constructor() {
    this.sheets = [];
    this.nextId = 1;
  }

  addSheet(name, rows) {
    const sheet = new FakeSheet(name, this.nextId++, rows);
    this.sheets.push(sheet);
    return sheet;
  }

  getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }
  insertSheet(name) { return this.addSheet(name, []); }
  getSheets() { return this.sheets; }
}

export function loadAppsScript({ token = "test-token" } = {}) {
  const source = readFileSync(scriptPath, "utf8");
  const spreadsheet = new FakeSpreadsheet();
  const properties = new Map();
  const makeProps = () => ({
    getProperty: key => (properties.has(key) ? properties.get(key) : null),
    setProperty: (key, value) => { properties.set(key, String(value)); },
    deleteProperty: key => { properties.delete(key); }
  });

  let uuidCounter = 0;
  const lockState = { held: false, acquisitions: 0 };
  const spreadsheetState = { flushes: 0 };

  const context = {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    JSON,
    Math,
    Date,
    Number,
    String,
    Array,
    Object,
    Error,
    RegExp,
    isNaN,
    parseFloat,
    parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush: () => { spreadsheetState.flushes += 1; } },
    PropertiesService: { getDocumentProperties: makeProps, getScriptProperties: makeProps },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { lockState.acquisitions += 1; lockState.held = true; },
        releaseLock: () => { lockState.held = false; }
      })
    },
    Session: { getScriptTimeZone: () => "Europe/Madrid" },
    Utilities: {
      getUuid: () => `uuid-${++uuidCounter}`,
      // El backend solo usa el patrón yyyy-MM-dd; se formatea en hora local para
      // que la fecha no se desplace de día como pasaría con toISOString().
      formatDate: date => {
        const d = new Date(date);
        const pad = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
    },
    ContentService: {
      createTextOutput: text => ({ text, mimeType: "", setMimeType(mime) { this.mimeType = mime; return this; } }),
      MimeType: { JSON: "json" }
    },
    UrlFetchApp: {
      fetch: () => ({ getResponseCode: () => 500, getContentText: () => "{}" })
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({}) },
    Logger: { log: () => {} }
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "apps-script.gs" });
  // APP_TOKEN es obligatorio desde el endurecimiento del backend: los tests
  // necesitan uno configurado para poder llamar a doPost/doGet.
  vm.runInContext(`APP_TOKEN = ${JSON.stringify(token)};`, context, { filename: "apps-script.gs:token" });

  context.__spreadsheet = spreadsheet;
  context.__properties = properties;
  context.__lockState = lockState;
  context.__spreadsheetState = spreadsheetState;
  context.__token = token;
  return context;
}

export { FakeSheet, FakeSpreadsheet, columnLetter };
