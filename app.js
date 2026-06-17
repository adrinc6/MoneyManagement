const ENABLE_TEST_MODE = false;

const DEFAULT_CONFIG = {
  scriptUrl: "",
  appToken: "",
  sheetId: "",
  movementSheet: "Control Finanzas",
  futureMovementSheet: "Movimientos futuros",
  investmentSheet: "Inversiones",
  bankSheet: "Bancos",
  objectiveSheet: "Objetivos",
  dataSheet: "Datos",
  readMode: "apps-script",
  initialCash: 6122.08
};

const STATIC_TYPES = ["Gasto", "Ingreso", "Inversion", "Transferencia"];
const STATIC_CONCEPTS = ["Comida", "Cuidado personal", "Deporte", "Fiesta", "Inversion", "Ocio", "Otros", "Piso", "Supermercado", "Universidad", "Viajes"];
const INVESTMENT_TYPES = ["Bolsa", "Fondos", "Cartera"];
const PIE_CHART_COLORS = [
  "#2563eb", // azul
  "#dc2626", // rojo
  "#16a34a", // verde
  "#d97706", // naranja
  "#7c3aed", // violeta
  "#0891b2", // cyan
  "#be185d", // rosa
  "#4b5563", // gris oscuro
  "#84cc16", // lima
  "#a16207", // ocre
];
const BAR_CHART_COLORS = [
  "#0f766e", // teal
  "#ea580c", // naranja fuerte
  "#4338ca", // índigo
  "#65a30d", // verde lima
  "#c026d3", // fucsia
  "#b91c1c", // rojo oscuro
  "#0369a1", // azul petróleo
  "#6b7280", // gris
  "#ca8a04", // mostaza
  "#475569", // slate
];
const DATA_CACHE_KEY = "moneyDataCache";
const PENDING_CACHE_KEY = "moneyPendingChanges";
const THEME_KEY = "moneyTheme";
const DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TEST_TRANSACTIONS = ENABLE_TEST_MODE ? [
  ["2026-05-10", "Ingreso", "Otros", "Nomina", 2100],
  ["2026-05-12", "Gasto", "Supermercado", "Compra", -83.4],
  ["2026-05-25", "Retiro", "Otros", "Cajero", -120],
  ["2026-06-03", "Gasto", "Comida", "Menu", -14.5],
  ["2026-06-10", "Ingreso", "Otros", "Nomina", 2100],
  ["2026-06-11", "Gasto", "Ocio", "Libro", -19.99],
  ["2026-06-16", "Inversion", "Inversion", "Cartera", -400]
].map(row => normalizeTransaction({ fecha: row[0], tipo: row[1], concepto: row[2], descripcion: row[3], importe: row[4] })) : [];

const TEST_INVESTMENTS = ENABLE_TEST_MODE ? [
  { rowNumber: 10, data: "IWDA", nombre: "ETF MSCI World", tipo: "Cartera", cantidad: 23, valor: 89.4, total: 2056.2 },
  { rowNumber: 11, data: "EUNL", nombre: "ETF Core", tipo: "Bolsa", cantidad: 8, valor: 102.2, total: 817.6 },
  { rowNumber: 12, data: "Fondo Global", nombre: "Fondo indexado", tipo: "Fondos", cantidad: 1, valor: 3240, total: 3240 }
] : [];

const state = {
  config: loadConfig(),
  transactions: [],
  futureTransactions: [],
  investments: [],
  banks: [],
  categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS },
  charts: {},
  filtered: [],
  movementDrill: { level: "years", year: null, month: null },
  summaryModes: { situation: "ingresos", investmentMoney: "invested", moneyMix: "types", bankMoney: "summary", investmentOverviewType: null, investmentPanel: "current" },
  descriptionSuggestions: {},
  movementMode: "realized",
  tableControls: {},
  investmentGoals: loadInvestmentGoals()
};

document.addEventListener("DOMContentLoaded", () => {
  applySavedTheme();
  lucide.createIcons();
  wireUi();
  hydrateConfigForm();
  setDefaultDate();
  refreshData();
});

function wireUi() {
  document.querySelectorAll("[data-view-button]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.viewButton === "registrar" && btn.classList.contains("active")) {
        document.getElementById("movementForm").requestSubmit();
        return;
      }
      showView(btn.dataset.viewButton);
    });
  });
  document.getElementById("refreshBtn").addEventListener("click", () => refreshData({ force: true }));
  document.getElementById("movementForm").addEventListener("submit", submitMovement);
  document.getElementById("registerModeSwitch").addEventListener("click", setRegisterModeFromClick);
  document.getElementById("recurrenceType").addEventListener("change", renderRecurrencePicker);
  document.getElementById("movementModeSwitch").addEventListener("click", setMovementModeFromClick);
  document.getElementById("investmentPanelSwitch").addEventListener("click", setInvestmentPanelFromClick);
  document.getElementById("editInvestmentGoalsBtn").addEventListener("click", editInvestmentGoals);
  document.getElementById("closeInvestmentGoalsBtn")?.addEventListener("click", () => document.getElementById("investmentGoalsDialog").close());
  document.getElementById("investmentGoalsForm")?.addEventListener("submit", saveInvestmentGoalsFromDialog);
  document.getElementById("themeToggle")?.addEventListener("change", setThemeFromToggle);
  document.getElementById("formType").addEventListener("change", syncRegistrarMode);
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfigFromForm);
  document.getElementById("summaryYear").addEventListener("change", syncSummaryPeriodAndRender);
  document.getElementById("summaryMonth").addEventListener("change", syncSummaryPeriodAndRender);
  document.getElementById("openMonthSituationBtn").addEventListener("click", () => {
    document.getElementById("monthSituationDialog").showModal();
    renderSummary();
  });
  document.getElementById("closeMonthSituationBtn").addEventListener("click", () => document.getElementById("monthSituationDialog").close());
  document.getElementById("closeMoneyDialogBtn").addEventListener("click", () => document.getElementById("moneyDialog").close());
  document.getElementById("openInvestmentOverviewBtn").addEventListener("click", () => openInvestmentOverview(null));
  document.getElementById("closeInvestmentOverviewBtn").addEventListener("click", () => document.getElementById("investmentOverviewDialog").close());
  document.getElementById("movementBackBtn").addEventListener("click", movementBack);
  document.getElementById("addInvestmentRowBtn").addEventListener("click", addInvestmentRow);
  document.getElementById("saveInvestmentsBtn").addEventListener("click", saveInvestments);
  document.getElementById("formDescription").addEventListener("input", suggestTypeConceptFromDescription);
  document.getElementById("closeMovementDetailBtn").addEventListener("click", () => document.getElementById("movementDetailDialog").close());
  document.getElementById("movementDetailForm").addEventListener("submit", saveMovementDetail);
  document.getElementById("deleteMovementBtn").addEventListener("click", deleteMovementDetail);
  document.getElementById("closeInvestmentDetailBtn").addEventListener("click", () => document.getElementById("investmentDetailDialog").close());
  document.getElementById("investmentDetailForm").addEventListener("submit", saveInvestmentDetail);
  document.getElementById("closeMovementPopupBtn")?.addEventListener("click", () => document.getElementById("movementPopup").close());
  document.getElementById("monthSituationMode").addEventListener("click", event => {
    const btn = event.target.closest("[data-situation-mode]");
    if (!btn) return;
    state.summaryModes.situation = btn.dataset.situationMode;
    renderSummary();
  });
  document.getElementById("moneyMixMode")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-money-mix]");
    if (!btn) return;
    state.summaryModes.moneyMix = btn.dataset.moneyMix;
    renderMoneyCharts(calculateSummary(getSelectedSummaryMonth()));
  });
  document.getElementById("bankMoneyMode")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-bank-mode]");
    if (!btn) return;
    state.summaryModes.bankMoney = btn.dataset.bankMode;
    renderBankDetail(calculateSummary(getSelectedSummaryMonth()));
  });
  document.addEventListener("click", event => {
    if (event.target.closest(".toast")) return;
    window.setTimeout(() => clearToasts(), 0);
  });
}

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll("[data-view-button]").forEach(b => b.classList.toggle("active", b.dataset.viewButton === id));
  syncRegistrarActionButton();
  document.getElementById("viewTitle").textContent = {
    registrar: "Registrar",
    resumen: "Resumen",
    movimientos: "Movimientos",
    inversiones: "Inversiones",
    ajustes: "Ajustes"
  }[id] || "MoneyManagement";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadConfig() {
  try {
    const saved = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem("moneyConfig") || "{}") };
    if (!["apps-script", "public-csv"].includes(saved.readMode)) saved.readMode = "apps-script";
    saved.initialCash = DEFAULT_CONFIG.initialCash;
    return saved;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function hydrateConfigForm() {
  document.getElementById("configScriptUrl").value = state.config.scriptUrl;
  document.getElementById("configAppToken").value = state.config.appToken;
  document.getElementById("configSheetId").value = state.config.sheetId;
  document.getElementById("configMovementSheet").value = state.config.movementSheet;
  document.getElementById("configFutureMovementSheet").value = state.config.futureMovementSheet || "Movimientos futuros";
  document.getElementById("configInvestmentSheet").value = state.config.investmentSheet;
  document.getElementById("configBankSheet").value = state.config.bankSheet || "Bancos";
  document.getElementById("configDataSheet").value = state.config.dataSheet;
  document.getElementById("configReadMode").value = state.config.readMode;
  document.getElementById("configInitialCash").value = state.config.initialCash;
}

async function saveConfigFromForm() {
  const btn = document.getElementById("saveConfigBtn");
  markButtonSaving(btn);
  state.config = {
    scriptUrl: document.getElementById("configScriptUrl").value.trim(),
    appToken: document.getElementById("configAppToken").value.trim(),
    sheetId: document.getElementById("configSheetId").value.trim(),
    movementSheet: document.getElementById("configMovementSheet").value.trim() || "Control Finanzas",
    futureMovementSheet: document.getElementById("configFutureMovementSheet").value.trim() || "Movimientos futuros",
    investmentSheet: document.getElementById("configInvestmentSheet").value.trim() || "Inversiones",
    bankSheet: document.getElementById("configBankSheet").value.trim() || "Bancos",
    objectiveSheet: state.config.objectiveSheet || "Objetivos",
    dataSheet: document.getElementById("configDataSheet").value.trim() || "Datos",
    readMode: document.getElementById("configReadMode").value,
    initialCash: DEFAULT_CONFIG.initialCash
  };
  localStorage.setItem("moneyConfig", JSON.stringify(state.config));
  clearDataCache();
  clearPendingCache();
  await refreshDataInPlace();
  markButtonSaved(btn);
}

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = theme === "dark";
}

function setThemeFromToggle(event) {
  const theme = event.target.checked ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  refreshChartTheme();
}

function refreshChartTheme() {
  Object.values(state.charts).forEach(chart => chart.destroy());
  state.charts = {};
  renderAll();
}

function setDefaultDate() {
  document.getElementById("formDate").value = formatDate(new Date());
}

async function refreshData(options = {}) {
  const force = Boolean(options.force);
  setRefreshLoading(true);
  const cached = readDataCache();

  if (cached && !force) {
    applyDataSnapshot(cached.data);
    syncOptions();
    renderAll();

    const age = Date.now() - cached.savedAt;
    if (age < DATA_CACHE_TTL_MS) {
      setNotice(`Datos cargados desde cache (${formatCacheAge(age)}).`, "ok");
      setRefreshLoading(false);
      return;
    }
    setNotice("Mostrando cache mientras se actualiza...", "");
  } else {
    setNotice("Cargando datos...", "");
  }

  try {
    const flushedPending = await flushPendingChangesBeforeDownload();
    let freshData;
    let movedFutureMovements = [];
    if (ENABLE_TEST_MODE) {
      freshData = {
        transactions: [...TEST_TRANSACTIONS],
        futureTransactions: [],
        investments: [...TEST_INVESTMENTS],
        investmentGoals: state.investmentGoals,
        banks: [
          { rowNumber: 2, cuenta: "Santander-Cuenta", dinero: 2400 },
          { rowNumber: 3, cuenta: "Revolut-Ahorro", dinero: 1300 }
        ],
        categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS }
      };
    } else if (state.config.readMode === "public-csv") {
      freshData = {
        transactions: await fetchPublicCsvTransactions(),
        futureTransactions: await fetchPublicCsvFutureTransactions(),
        investments: await fetchPublicCsvInvestments(),
        banks: await fetchPublicCsvBanks(),
        investmentGoals: await fetchPublicCsvInvestmentGoals(),
        categories: await fetchPublicCsvCategories()
      };
    } else {
      const payload = await fetchAppsScriptData();
      if (!payload.ok) throw new Error(payload.error || "Apps Script devolvio error");
      if (!Object.prototype.hasOwnProperty.call(payload, "banks")) {
        throw new Error("Apps Script no devuelve la hoja Bancos. Pega y despliega el apps-script.gs actualizado");
      }
      movedFutureMovements = payload.movedFutureMovements || [];
      freshData = {
        transactions: payload.transactions || [],
        futureTransactions: payload.futureTransactions || [],
        investments: payload.investments || [],
        banks: payload.banks || [],
        investmentGoals: payload.investmentGoals,
        categories: payload.categories
      };
    }
    applyDataSnapshot(freshData);
    clearPendingCache();
    if (movedFutureMovements.length) {
      ensureMovedFutureMovementsVisible(movedFutureMovements);
      showMovementPopup(
        "Futuros movidos a realizados",
        null,
        "",
        movedFutureMovementsPopupHtml(movedFutureMovements)
      );
    }
    syncOptions();
    renderAll();
    writeDataCache();
    setNotice(lineMessage(
      `${state.transactions.length} movimientos y ${state.banks.length} cuentas cargadas.`,
      flushedPending.length ? `Pendientes enviados antes: ${flushedPending.join(", ")}` : ""
    ), "ok");
  } catch (error) {
    console.error(error);
    if (cached) {
      setNotice(lineMessage("No se pudo actualizar; sigo usando cache.", error.message), "warn");
      return;
    }
    state.transactions = [];
    state.investments = [];
    state.banks = [];
    state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
    syncOptions();
    renderAll();
    setNotice(lineMessage(`No se pudieron cargar datos: ${error.message}`, "Revisa Ajustes."), "warn");
  } finally {
    setRefreshLoading(false);
  }
}

function setRefreshLoading(loading) {
  const btn = document.getElementById("refreshBtn");
  if (!btn) return;
  btn.classList.toggle("loading", loading);
  btn.disabled = loading;
}

async function refreshDataInPlace() {
  const activeView = document.querySelector(".view.active");
  const activeViewId = activeView?.id || "";
  const scrollTop = activeView?.scrollTop || 0;
  await refreshData({ force: true });
  requestAnimationFrame(() => {
    const currentView = activeViewId ? document.getElementById(activeViewId) : null;
    if (currentView) currentView.scrollTop = scrollTop;
  });
}

function markButtonSaved(button, label = "Guardado") {
  if (!button) return;
  const previousHtml = button.dataset.previousHtml || button.innerHTML;
  button.dataset.previousHtml = previousHtml;
  button.classList.remove("saving");
  button.classList.add("saved");
  button.disabled = true;
  button.innerHTML = `<i data-lucide="check"></i> ${escapeHtml(label)}`;
  lucide.createIcons();
  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.classList.remove("saved");
    button.innerHTML = button.dataset.previousHtml || previousHtml;
    delete button.dataset.previousHtml;
    button.disabled = false;
    lucide.createIcons();
  }, 2200);
}

function markButtonSaving(button, label = "Guardando") {
  if (!button) return;
  if (!button.dataset.previousHtml) button.dataset.previousHtml = button.innerHTML;
  button.classList.remove("saved");
  button.classList.add("saving");
  button.disabled = true;
  button.innerHTML = `<i data-lucide="loader-2"></i> ${escapeHtml(label)}`;
  lucide.createIcons();
}

function restoreButton(button) {
  if (!button || !button.dataset.previousHtml) return;
  button.classList.remove("saving");
  button.disabled = false;
  button.innerHTML = button.dataset.previousHtml;
  delete button.dataset.previousHtml;
  lucide.createIcons();
}

function ensureMovedFutureMovementsVisible(movedFutureMovements) {
  const moved = movedFutureMovements.map(normalizeTransaction).filter(Boolean);
  const existingRealized = new Set(state.transactions.map(transactionSignature));
  moved.forEach(movement => {
    const signature = transactionSignature(movement);
    if (!existingRealized.has(signature)) {
      state.transactions.push(movement);
      existingRealized.add(signature);
    }
  });
  const movedSignatures = new Set(moved.map(transactionSignature));
  state.futureTransactions = state.futureTransactions.filter(movement => !movedSignatures.has(transactionSignature(movement)));
  state.transactions.sort((a, b) => b.date - a.date);
}

function applyDataSnapshot(data) {
  state.transactions = (data.transactions || []).map(normalizeTransaction).filter(Boolean);
  state.futureTransactions = (data.futureTransactions || []).map(normalizeTransaction).filter(Boolean);
  state.investments = (data.investments || []).map(normalizeInvestment).filter(Boolean);
  state.banks = (data.banks || []).map(normalizeBank).filter(Boolean);
  state.investmentGoals = normalizeInvestmentGoals(data.investmentGoals ?? state.investmentGoals);
  state.categories = normalizeCategories(data.categories);
}

function dataCacheConfigKey() {
  const { scriptUrl, appToken, sheetId, movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, readMode } = state.config;
  return JSON.stringify({ scriptUrl, appToken, sheetId, movementSheet, futureMovementSheet, investmentSheet, bankSheet, objectiveSheet, dataSheet, readMode });
}

function readDataCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || "null");
    if (!cached || cached.configKey !== dataCacheConfigKey() || !cached.data) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeDataCache() {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      configKey: dataCacheConfigKey(),
      savedAt: Date.now(),
      data: {
        transactions: state.transactions.map(serializeTransaction),
        futureTransactions: state.futureTransactions.map(serializeTransaction),
        investments: state.investments,
        banks: state.banks,
        investmentGoals: state.investmentGoals,
        categories: state.categories
      }
    }));
  } catch (error) {
    console.warn("No se pudo guardar la cache local", error);
  }
}

function clearDataCache() {
  localStorage.removeItem(DATA_CACHE_KEY);
}

function readPendingCache() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_CACHE_KEY) || "null");
    if (!pending || pending.configKey !== dataCacheConfigKey()) return null;
    return pending;
  } catch {
    return null;
  }
}

function writePendingCache(pending) {
  const next = { ...pending, configKey: dataCacheConfigKey(), savedAt: Date.now() };
  const hasPending = ["investments", "banks"].some(key => Array.isArray(next[key]));
  if (!hasPending) return clearPendingCache();
  localStorage.setItem(PENDING_CACHE_KEY, JSON.stringify(next));
}

function clearPendingCache() {
  localStorage.removeItem(PENDING_CACHE_KEY);
}

async function flushPendingChangesBeforeDownload() {
  const pending = readPendingCache();
  if (!pending || state.config.readMode !== "apps-script" || !state.config.scriptUrl) return [];

  const flushed = [];
  const nextPending = { ...pending };

  if (Array.isArray(pending.investments)) {
    await postAppsScript({
      action: "saveInvestments",
      sheetName: state.config.investmentSheet,
      investments: pending.investments
    });
    delete nextPending.investments;
    flushed.push("inversiones");
  }

  if (Array.isArray(pending.banks)) {
    await postAppsScript({
      action: "saveBanks",
      bankSheet: state.config.bankSheet || "Bancos",
      banks: pending.banks
    });
    delete nextPending.banks;
    flushed.push("cuentas");
  }

  delete nextPending.transactions;
  writePendingCache(nextPending);
  return flushed;
}

function dropPendingSections(...sections) {
  const pending = readPendingCache();
  if (!pending) return;
  sections.forEach(section => delete pending[section]);
  writePendingCache(pending);
}

function rememberPendingSnapshot(...sections) {
  const pending = readPendingCache() || {};
  sections.forEach(section => {
    if (section === "investments") pending.investments = state.investments;
    if (section === "banks") pending.banks = state.banks;
  });
  writePendingCache(pending);
}

function transactionSignature(row) {
  const t = normalizeTransaction(row);
  return t ? [formatDate(t.date), normalizeType(t.tipo), normalizeType(t.concepto), t.descripcion, safeNumber(t.amount).toFixed(2)].join("|") : "";
}

function serializeTransaction(t) {
  return { rowNumber: t.rowNumber, fecha: formatDate(t.date), tipo: t.tipo, concepto: t.concepto, descripcion: t.descripcion, importe: t.amount, cuenta: t.cuenta || t.account || "" };
}

function formatCacheAge(ageMs) {
  const minutes = Math.max(1, Math.round(ageMs / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

async function fetchAppsScriptData() {
  if (!state.config.scriptUrl) throw new Error("falta la URL de Apps Script");
  const url = `${state.config.scriptUrl}?action=all&token=${encodeURIComponent(state.config.appToken)}&movementSheet=${encodeURIComponent(state.config.movementSheet)}&futureMovementSheet=${encodeURIComponent(state.config.futureMovementSheet || "Movimientos futuros")}&investmentSheet=${encodeURIComponent(state.config.investmentSheet)}&bankSheet=${encodeURIComponent(state.config.bankSheet || "Bancos")}&objectiveSheet=${encodeURIComponent(state.config.objectiveSheet || "Objetivos")}&dataSheet=${encodeURIComponent(state.config.dataSheet)}`;
  return jsonp(url);
}

async function fetchPublicCsvTransactions() {
  if (!state.config.sheetId) throw new Error("falta el ID de Google Sheet");
  const csv = await fetchCsv(state.config.sheetId, state.config.movementSheet);
  return parseCsv(csv).slice(1).map(row => normalizeTransaction({
    fecha: row[0], tipo: row[4], concepto: row[5], descripcion: row[6], importe: row[7]
  })).filter(Boolean);
}

async function fetchPublicCsvFutureTransactions() {
  if (!state.config.sheetId) return [];
  const csv = await fetchCsv(state.config.sheetId, state.config.futureMovementSheet || "Movimientos futuros");
  return parseCsv(csv).slice(1).map(row => normalizeTransaction({
    fecha: row[0], tipo: row[4], concepto: row[5], descripcion: row[6], importe: row[7]
  })).filter(Boolean);
}

async function fetchPublicCsvInvestments() {
  if (!state.config.sheetId) return [];
  const csv = await fetchCsv(state.config.sheetId, state.config.investmentSheet);
  return parseCsv(csv).slice(1).map((row, i) => normalizeInvestment({
    rowNumber: i + 2, data: row[0], nombre: row[1], tipo: row[2], cantidad: row[3], valor: row[4], total: row[5]
  })).filter(Boolean);
}

async function fetchPublicCsvBanks() {
  if (!state.config.sheetId) return [];
  const csv = await fetchCsv(state.config.sheetId, state.config.bankSheet || "Bancos");
  return parseCsv(csv).slice(1).map((row, i) => normalizeBank({
    rowNumber: i + 2, cuenta: row[0], dinero: row[1]
  })).filter(Boolean);
}

async function fetchPublicCsvCategories() {
  if (!state.config.sheetId) return { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
  const csv = await fetchCsv(state.config.sheetId, state.config.dataSheet);
  const rows = parseCsv(csv).slice(1);
  return normalizeCategories({ types: rows.map(r => r[0]), concepts: rows.map(r => r[1]) });
}

async function fetchCsv(sheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CSV no disponible para ${sheetName}`);
  return response.text();
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `moneyJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    window[cb] = data => { resolve(data); script.remove(); delete window[cb]; };
    script.onerror = () => { reject(new Error("no se pudo leer Apps Script")); script.remove(); delete window[cb]; };
    script.src = `${url}${sep}callback=${cb}`;
    document.body.appendChild(script);
  });
}

function syncOptions() {
  const forbiddenTypes = ["efectivo", "retiro", "otros"];

  const types = unique([
    ...STATIC_TYPES,
    ...state.categories.types,
    ...state.transactions.map(t => t.tipo)
  ])
    .map(prettyType)
    .filter(t => !forbiddenTypes.includes(normalizeType(t)));

  const concepts = unique([
    ...STATIC_CONCEPTS,
    ...state.categories.concepts,
    ...state.transactions.map(t => t.concepto),
    ...state.futureTransactions.map(t => t.concepto)
  ]).map(prettyType);

  fillSelect("formType", types, "Seleccione");
  fillSelect("formConcept", concepts, "Seleccione");
  fillSelect("editMovementType", types, "Seleccione");
  fillSelect("editMovementConcept", concepts, "Seleccione");
  fillSelect("editInvestmentType", INVESTMENT_TYPES);

  const accounts = state.banks.map(b => b.cuenta);
  fillSelect("formAccount", accounts, accounts.length ? null : "Sin cuentas");
  fillSelect("formTransferFrom", accounts, accounts.length ? null : "Origen");
  fillSelect("formTransferTo", accounts, accounts.length ? null : "Destino");
  fillSelect("recurrenceAccount", accounts, accounts.length ? null : "Sin cuentas");

  buildDescriptionSuggestions();
  syncRegistrarMode();
  renderRecurrencePicker();

  syncSummaryPeriodOptions();
}

function syncRegistrarMode() {
  const isTransfer = normalizeType(document.getElementById("formType").value) === "transferencia";
  document.querySelectorAll(".movement-only").forEach(el => el.classList.toggle("hidden", isTransfer));
  document.querySelectorAll(".transfer-only").forEach(el => el.classList.toggle("hidden", !isTransfer));
  ["formDate", "formConcept", "formDescription"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.required = !isTransfer;
  });
  document.getElementById("formTransferFrom").required = isTransfer;
  document.getElementById("formTransferTo").required = isTransfer;
  const submitLabel = isTransfer
    ? `<i data-lucide="repeat-2"></i> Transferir entre cuentas`
    : `<i data-lucide="save"></i> Guardar registro`;
  document.getElementById("submitMovement").innerHTML = submitLabel;
  syncRegistrarActionButton();
  if (typeof syncRegisterMode === "function") syncRegisterMode();
  lucide.createIcons();
}

function syncRegistrarActionButton() {
  const registrarButton = document.querySelector('[data-view-button="registrar"]');
  if (!registrarButton) return;
  const isRegistrarActive = registrarButton.classList.contains("active");
  const isTransfer = normalizeType(document.getElementById("formType")?.value || "") === "transferencia";

  if (isRegistrarActive) {
    registrarButton.classList.add("save-mode");
    registrarButton.setAttribute("aria-label", isTransfer ? "Transferir entre cuentas" : "Guardar registro");
    registrarButton.innerHTML = isTransfer
      ? `<i data-lucide="repeat-2"></i><span>Transferir</span>`
      : `<i data-lucide="save"></i><span>Guardar</span>`;
  } else {
    registrarButton.classList.remove("save-mode");
    registrarButton.setAttribute("aria-label", "Registrar");
    registrarButton.innerHTML = `<i data-lucide="plus"></i><span>Registrar</span>`;
  }
  lucide.createIcons();
}

function syncSummaryPeriodOptions() {
  const current = getSelectedSummaryMonth();
  const months = unique([currentMonthKey(), ...state.transactions.map(t => monthKey(t.date)), ...state.futureTransactions.map(t => monthKey(t.date))]).sort().reverse();
  const years = unique(months.map(month => month.slice(0, 4))).sort((a, b) => Number(b) - Number(a));
  const selected = months.includes(current) ? current : currentMonthKey();
  fillSelect("summaryYear", years);
  document.getElementById("summaryYear").value = selected.slice(0, 4);
  fillSelect("summaryMonth", Array.from({ length: 12 }, (_, idx) => {
    const value = String(idx + 1).padStart(2, "0");
    return { value, label: monthName(value) };
  }));
  document.getElementById("summaryMonth").value = selected.slice(5, 7);
}

function getSelectedSummaryMonth() {
  const current = currentMonthKey();
  const year = document.getElementById("summaryYear")?.value || current.slice(0, 4);
  const month = document.getElementById("summaryMonth")?.value || current.slice(5, 7);
  return `${year}-${month}`;
}

function syncSummaryPeriodAndRender() {
  renderAll();
}

function fillSelect(id, values, placeholder = null) {
  const el = document.getElementById(id);
  const current = el.value;

  const options = [
    ...(placeholder ? [`<option value="">${escapeHtml(placeholder)}</option>`] : []),
    ...values.map(v => {
      const value = typeof v === "object" ? v.value : v;
      const label = typeof v === "object" ? v.label : v;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    })
  ];

  el.innerHTML = options.join("");

  const rawValues = values.map(v => typeof v === "object" ? v.value : v);
  if (rawValues.includes(current)) {
    el.value = current;
  } else if (placeholder) {
    el.value = "";
  }
}

function buildDescriptionSuggestions() {
  const sorted = [...state.transactions]
    .filter(t => t.descripcion)
    .sort((a, b) => b.date - a.date);

  const suggestions = {};

  sorted.forEach(t => {
    const key = normalizeDescription(t.descripcion);
    if (!key || suggestions[key]) return;

    suggestions[key] = {
      tipo: t.tipo,
      concepto: t.concepto
    };
  });

  state.descriptionSuggestions = suggestions;
}

function suggestTypeConceptFromDescription() {
  const description = document.getElementById("formDescription").value;
  const key = normalizeDescription(description);
  const suggestion = state.descriptionSuggestions[key];

  if (!suggestion) return;

  const typeSelect = document.getElementById("formType");
  const conceptSelect = document.getElementById("formConcept");

  if ([...typeSelect.options].some(o => o.value === suggestion.tipo)) {
    typeSelect.value = suggestion.tipo;
  }

  if ([...conceptSelect.options].some(o => o.value === suggestion.concepto)) {
    conceptSelect.value = suggestion.concepto;
  }
}

function renderAll() {
  syncRegisterMode();
  renderFutureDueNotice();
  renderSummary();
  renderMovements();
  renderInvestments();
  lucide.createIcons();
}

function renderSummary() {
  const month = getSelectedSummaryMonth();
  const summary = calculateSummary(month);
  const situationItems = [
    ["Ingresos", summary.income, "positive"],
    ["Gastos", summary.expenses, "negative"],
    ["Inversion", summary.investedMonth, ""],
    ["Balance", summary.balance, summary.balance >= 0 ? "positive" : "negative"]
  ];
  document.getElementById("monthSituationStrip").innerHTML = situationItems
    .map(([label, value, tone]) => summaryItem(label, money(value), tone))
    .join("");
  renderMonthSituationDialog(summary);
  renderMoneySummary(summary);
}

function renderMonthSituationDialog(summary) {
  renderMonthSituationBars(summary);
  document.querySelectorAll("[data-situation-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.situationMode === state.summaryModes.situation);
  });

  const rows = getSituationBreakdown(summary.month, state.summaryModes.situation);
  const total = sum(rows.map(e => e[1]));
  renderTable("monthSituationTable", ["", "Detalle", "Cantidad", "%"], rows.map(([label, value], idx) => [
    colorDot(chartColor(PIE_CHART_COLORS, idx)),
    escapeHtml(label),
    money(value),
    total ? pct(value / total) : "0,0 %"
  ]));
  upsertChart("monthSituationChart", "doughnut", {
    labels: rows.map(([label, value]) => `${label}: ${money(value)} (${total ? pct(value / total) : "0,0 %"})`),
    datasets: [{ data: rows.map(e => e[1]), backgroundColor: rows.map((_, idx) => chartColor(PIE_CHART_COLORS, idx)), borderWidth: 2, borderColor: chartSurfaceColor() }]
  }, compactChartOptions("", { cutout: "58%" }));
}

function renderMoneySummary(summary) {
  const accountsAdjustment = summary.computedBank - summary.bankAccountsTotal;
  const checkTone = Math.abs(accountsAdjustment) < 0.01 ? "positive" : "negative";
  const parts = INVESTMENT_TYPES.map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    return `<div class="money-item"><span>${type}</span><strong>${money(invested)}</strong><small class="muted">Actual: ${money(current)}</small></div>`;
  }).join("");
  document.getElementById("moneySummary").innerHTML = `
    <div class="money-grid">
      <button class="money-item money-action" id="openBankMoneyBtn" type="button">
        <span>Banco</span>
        <strong>${money(summary.bank)}</strong>
        <small class="${checkTone}">${state.banks.length ? (Math.abs(accountsAdjustment) < 0.01 ? "Check OK" : `Cuentas ${accountsAdjustment >= 0 ? "+" : ""}${money(accountsAdjustment)}`) : "Sin cuentas"}</small>
      </button>
      <button class="money-item money-action" id="openInvestedMoneyBtn" type="button">
        <span>Invertido</span>
        <strong>${money(summary.investedTotal)}</strong>
        <small class="muted">Actual: ${money(summary.valueTotal)}</small>
      </button>
    </div>
  `;

  document.getElementById("openBankMoneyBtn")?.addEventListener("click", () => openMoneyDetail("bank"));
  document.getElementById("openInvestedMoneyBtn")?.addEventListener("click", () => openMoneyDetail("invested"));

  document.getElementById("bookMoneyTotal").textContent = money(summary.totalMoneyBook);
  document.getElementById("realizedMoneyTotal").textContent = `${money(summary.totalMoneyRealized)} • ${pct(summary.profitLossPct)} • ${money(summary.profitLoss)}`;
}

function openMoneyDetail(mode) {
  const summary = calculateSummary(getSelectedSummaryMonth());
  const isBank = mode === "bank";
  const parts = INVESTMENT_TYPES.map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    return `<div class="money-item"><span>${type}</span><strong>${money(invested)}</strong><small class="muted">Actual: ${money(current)} · ${pctGain(current, invested)}</small></div>`;
  }).join("");

  document.getElementById("moneyDialogTitle").textContent = isBank ? "Banco" : "Invertido";
  document.getElementById("bankMoneyDetail").classList.toggle("hidden", !isBank);
  document.getElementById("investedMoneyDetail").classList.toggle("hidden", isBank);
  document.getElementById("moneyDialogSummary").innerHTML = isBank ? "" : `
    <div class="money-grid">
      <div class="money-item"><span>Invertido</span><strong>${money(summary.investedTotal)}</strong><small class="muted">Coste historico</small></div>
      <div class="money-item"><span>Actual</span><strong>${money(summary.valueTotal)}</strong><small class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${money(summary.profitLoss)} · ${pct(summary.profitLossPct)}</small></div>
      ${parts}
    </div>
  `;
  if (isBank) renderBankDetail(summary);
  document.getElementById("moneyDialog").showModal();
  renderMoneyCharts(summary);
  lucide.createIcons();
}

function renderBankRows() {
  return state.banks.map((bank, idx) => `
    <label class="bank-row">
      <span>${escapeHtml(bank.cuenta)}</span>
      <input data-bank-index="${idx}" type="number" step="0.01" inputmode="decimal" value="${formatDecimalInput(bank.dinero)}">
    </label>
  `).join("") || emptyBlock("No se han detectado cuentas. La hoja debe llamarse Bancos y tener columnas Cuenta y Dinero.");
}

function calculateSummary(month) {
  const [year, monthNum] = month.split("-").map(Number);
  const txMonth = state.transactions.filter(t => t.date.getFullYear() === year && t.date.getMonth() + 1 === monthNum);
  const untilToday = state.transactions.filter(t => t.date <= endOfToday());
  const income = sum(txMonth.filter(isIncome).map(t => t.amount));
  const expenses = Math.abs(sum(txMonth.filter(isMonthlyExpense).map(t => t.amount)));
  const investedMonth = Math.abs(sum(txMonth.filter(isInvestment).map(t => t.amount)));
  const balance = sum(txMonth.map(t => t.amount));
  const computedBank = getInitialCash()
    + sumTransactionsByType(untilToday, "Ingreso")
    + sumTransactionsByType(untilToday, "Gasto")
    - sumTransactionsByType(untilToday, "Retiro")
    + sumTransactionsByType(untilToday, "Inversion");
  const bankAccountsTotal = sum(state.banks.map(b => b.dinero));
  const bank = computedBank;
  const investedByType = {};
  const valueByType = {};
  INVESTMENT_TYPES.forEach(type => {
    investedByType[type] = Math.abs(sum(untilToday.filter(t => isInvestment(t) && normalizeType(t.descripcion) === normalizeType(type)).map(t => t.amount)));
    valueByType[type] = sum(state.investments.filter(i => normalizeType(i.tipo) === normalizeType(type)).map(i => i.total));
  });
  const investedTotal = sum(Object.values(investedByType));
  const valueTotal = sum(Object.values(valueByType));
  return {
    month, income, expenses, investedMonth, balance, bank,
    computedBank, bankAccountsTotal,
    investedByType, valueByType, investedTotal, valueTotal,
    totalMoneyBook: bank + investedTotal,
    totalMoneyRealized: bank + valueTotal,
    profitLoss: valueTotal - investedTotal,
    profitLossPct: investedTotal ? (valueTotal - investedTotal) / investedTotal : 0
  };
}

function renderMonthSituationBars(summary) {
  const outflow = summary.expenses + summary.investedMonth;
  const max = Math.max(summary.income, outflow, 1);
  const expensePct = outflow ? summary.expenses / outflow : 0;
  const investmentPct = outflow ? summary.investedMonth / outflow : 0;
  document.getElementById("monthSituationBars").innerHTML = `
    <div class="balance-bar-row">
      <div><strong>Ingresos</strong><span>${money(summary.income)}</span></div>
      <div class="balance-track"><span class="income" style="width:${Math.max(3, summary.income / max * 100)}%"></span></div>
    </div>
    <div class="balance-bar-row">
      <div class="balance-bar-heading">
        <strong>Gastos + inversion</strong>
        <span class="balance-bar-summary">
          <strong>${money(outflow)}</strong>
          <small>Gasto ${pct(expensePct)} · Inversion ${pct(investmentPct)}</small>
        </span>
      </div>
      <div class="balance-track stacked">
        <span class="expense" style="width:${Math.max(0, outflow ? expensePct * outflow / max * 100 : 0)}%"></span>
        <span class="investment" style="width:${Math.max(0, outflow ? investmentPct * outflow / max * 100 : 0)}%"></span>
      </div>
    </div>
    <div class="balance-result ${summary.balance >= 0 ? "positive" : "negative"}">
      Balance ${money(summary.balance)}
    </div>
  `;
}

function getInitialCash() {
  return DEFAULT_CONFIG.initialCash;
}

function sumTransactionsByType(transactions, type) {
  const normalized = normalizeType(type);
  return sum(transactions.filter(t => normalizeType(t.tipo) === normalized).map(t => t.amount));
}

function getSituationBreakdown(month, mode) {
  const [year, monthNum] = month.split("-").map(Number);
  const txMonth = state.transactions.filter(t => t.date.getFullYear() === year && t.date.getMonth() + 1 === monthNum);
  const rows = {};
  const selected = txMonth.filter(t => {
    if (mode === "ingresos") return isIncome(t);
    if (mode === "gastos") return isMonthlyExpense(t);
    return isInvestment(t);
  });
  selected.forEach(t => {
    const key = mode === "gastos" ? t.concepto : t.descripcion || t.concepto || "Sin descripcion";
    rows[key] = (rows[key] || 0) + Math.abs(t.amount);
  });
  return Object.entries(rows).sort((a, b) => b[1] - a[1]);
}

function renderMoneyCharts(summary) {
  const bankRows = adjustedBankChartRows().map((row, idx) => ({ label: row.label, value: row.value, color: chartColor(PIE_CHART_COLORS, idx) }));
  const bankTotal = sum(bankRows.map(row => row.value));
  upsertChart("bankDistributionChart", "doughnut", {
    labels: bankRows.length ? bankRows.map(row => `${row.label}: ${money(row.value)} (${pct(row.value / bankTotal)})`) : ["Banco"],
    datasets: [{ data: bankRows.length ? bankRows.map(row => row.value) : [Math.max(summary.bank, 0)], backgroundColor: bankRows.length ? bankRows.map(row => row.color) : [chartColor(PIE_CHART_COLORS, 0)], borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions("Cuentas", { legend: false }));
  renderColorRowsTable("bankDistributionTable", bankRows, ["", "Cuenta", "Dinero", "%"]);

  document.querySelectorAll("[data-money-mix]").forEach(btn => btn.classList.toggle("active", btn.dataset.moneyMix === state.summaryModes.moneyMix));
  let rows;
  let title;
  if (state.summaryModes.moneyMix === "profit") {
    rows = [
      { label: "Invertido", value: summary.investedTotal, color: chartColor(BAR_CHART_COLORS, 2) },
      { label: "Ganancia", value: Math.max(summary.profitLoss, 0), color: chartColor(BAR_CHART_COLORS, 0) }
    ].filter(row => row.value > 0);
    title = "Invertido vs ganancia";
  } else if (state.summaryModes.moneyMix === "money") {
    rows = [
      { label: "Dinero", value: summary.bank, color: chartColor(BAR_CHART_COLORS, 0) },
      { label: "Invertido", value: summary.investedTotal, color: chartColor(BAR_CHART_COLORS, 2) }
    ].filter(row => row.value > 0);
    title = "Dinero vs invertido";
  } else {
    rows = INVESTMENT_TYPES.map((type, idx) => ({ label: type, value: summary.investedByType[type] || 0, color: chartColor(PIE_CHART_COLORS, idx + 2) })).filter(row => row.value > 0);
    title = "Tipos de inversion";
  }
  const total = sum(rows.map(row => row.value));
  upsertChart("moneyVsInvestedChart", "doughnut", {
    labels: rows.map(row => `${row.label}: ${money(row.value)} (${pct(row.value / Math.max(total, 1))})`),
    datasets: [{ data: rows.map(row => row.value), backgroundColor: rows.map(row => row.color), borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions(title, { legend: false }));
  renderColorRowsTable("investmentMixTable", rows, ["", "Detalle", "Total", "%"]);
}

function renderBankDetail(summary) {
  document.querySelectorAll("[data-bank-mode]").forEach(btn => btn.classList.toggle("active", btn.dataset.bankMode === state.summaryModes.bankMoney));
  const accountsAdjustment = summary.computedBank - summary.bankAccountsTotal;
  const checkTone = Math.abs(accountsAdjustment) < 0.01 ? "positive" : "negative";
  const summaryPanel = document.getElementById("bankSummaryPanel");
  const accountsPanel = document.getElementById("bankAccountsPanel");
  summaryPanel.classList.toggle("hidden", state.summaryModes.bankMoney !== "summary");
  accountsPanel.classList.toggle("hidden", state.summaryModes.bankMoney !== "accounts");
  summaryPanel.innerHTML = `
    <div class="money-grid">
      <div class="money-item"><span>Banco</span><strong>${money(summary.bank)}</strong></div>
      <div class="money-item"><span>Cuentas</span><strong>${money(summary.bankAccountsTotal)}</strong><small class="muted">${state.banks.length} cuentas</small></div>
    </div>
    <div class="bank-check ${state.banks.length ? checkTone : "warn"}">
      <i data-lucide="${Math.abs(accountsAdjustment) < 0.01 ? "check-circle-2" : "alert-triangle"}"></i>
      <span>${state.banks.length ? bankCheckText(accountsAdjustment) : "Sin cuentas cargadas en la hoja Bancos."}</span>
    </div>`;
  accountsPanel.innerHTML = `
    <div class="bank-list compact-bank-list">${renderBankRows()}</div>
    ${state.banks.length && state.config.readMode === "apps-script" ? `<button class="btn primary full" id="saveBanksBtn" type="button"><i data-lucide="save"></i> Guardar cuentas</button>` : ""}`;
  document.getElementById("saveBanksBtn")?.addEventListener("click", saveBanks);
  lucide.createIcons();
}

function bankCheckText(accountsAdjustment) {
  if (Math.abs(accountsAdjustment) < 0.01) return "Cuentas cuadradas con Banco.";
  return accountsAdjustment > 0
    ? `Hay que sumar ${money(accountsAdjustment)} a cuentas para llegar a Banco.`
    : `Hay que restar ${money(Math.abs(accountsAdjustment))} a cuentas para llegar a Banco.`;
}

function renderMovements() {
  const drill = state.movementDrill;
  document.querySelector("#movimientos .movement-toolbar").classList.toggle("hidden", drill.level === "years");
  document.getElementById("movementBackBtn").style.visibility = drill.level === "years" ? "hidden" : "visible";
  if (drill.level === "years") renderMovementYears();
  if (drill.level === "months") renderMovementMonths(drill.year);
  if (drill.level === "entries") renderMovementEntries(drill.year, drill.month);
}

function renderMovementYears() {
  const source = getDisplayedMovements();
  const years = unique(source.map(t => String(t.date.getFullYear()))).sort((a, b) => Number(b) - Number(a));
  document.getElementById("movementDrillTitle").textContent = "Selecciona un año";
  document.getElementById("movementDrill").innerHTML = `<div class="year-grid">${years.map(year => {
    const tx = source.filter(t => String(t.date.getFullYear()) === year);
    const yearly = summarizeTransactions(tx);
    return `<button class="year-card" data-year="${year}">
      <span>Año</span>
      <strong>${year}</strong>
      <small>${tx.length} movimientos</small>
    </button>`;
  }).join("") || emptyBlock("Sin movimientos.")}</div>`;
  document.querySelectorAll("[data-year]").forEach(btn => btn.addEventListener("click", () => {
    state.movementDrill = { level: "months", year: btn.dataset.year, month: null };
    renderMovements();
  }));
  state.filtered = source;
}

function renderMovementMonths(year) {
  const source = getDisplayedMovements();
  const months = unique(source.filter(t => String(t.date.getFullYear()) === year).map(t => monthKey(t.date))).sort().reverse();
  document.getElementById("movementDrillTitle").textContent = `Año ${year}`;
  document.getElementById("movementDrill").innerHTML = `<div class="month-card-list">${months.map(month => {
    const monthRows = source.filter(t => monthKey(t.date) === month);
    const s = state.movementMode === "future" ? summarizeTransactions(monthRows) : calculateSummary(month);
    const monthNumber = String(Number(month.slice(5, 7)));
    return `<button class="month-card" data-month="${month}">
      <div class="month-number">
        <span>Mes</span>
        <strong>${monthNumber}</strong>
      </div>
      <div class="month-metrics">
        ${metricBlock("Ingresos", s.income, "positive")}
        ${metricBlock("Gastos", s.expenses, "negative")}
        ${metricBlock("Inversion", s.investedMonth, "")}
        ${metricBlock("Balance", s.balance, s.balance >= 0 ? "positive" : "negative")}
      </div>
    </button>`;
  }).join("") || emptyBlock("Sin meses.")}</div>`;
  document.querySelectorAll("[data-month]").forEach(btn => btn.addEventListener("click", () => {
    state.movementDrill = { level: "entries", year, month: btn.dataset.month };
    renderMovements();
  }));
  state.filtered = source.filter(t => String(t.date.getFullYear()) === year);
}
function renderMovementEntries(year, month) {
  const source = getDisplayedMovements();
  const rows = source
    .filter(t => String(t.date.getFullYear()) === year && monthKey(t.date) === month)
    .sort((a, b) => b.date - a.date);
  const summary = state.movementMode === "future" ? summarizeTransactions(rows) : calculateSummary(month);
  document.getElementById("movementDrillTitle").innerHTML = `${monthLabel(month)} · ${rows.length} movimientos`;
  document.getElementById("movementDrill").innerHTML = `
    <article class="panel">
      <div class="panel-body">
        <div class="month-metrics">
          ${metricBlock("Ingresos", summary.income, "positive")}
          ${metricBlock("Gastos", summary.expenses, "negative")}
          ${metricBlock("Inversion", summary.investedMonth, "")}
          ${metricBlock("Balance", summary.balance, summary.balance >= 0 ? "positive" : "negative")}
        </div>
      </div>
      <div class="table-wrap"><table id="movementTable"></table></div>
    </article>`;
  renderMovementTable(rows);
  state.filtered = rows;
}

function renderMovementTable(rows) {
  const table = document.getElementById("movementTable");
  const columns = [
    ["day", "Día", t => t.date.getDate()],
    ["type", "Tipo", t => t.tipo],
    ["concept", "Concepto", t => t.concepto],
    ["desc", "Desc.", t => t.descripcion],
    ["amount", "Importe", t => t.amount]
  ];
  const control = state.tableControls.movement || {};
  let visibleRows = [...rows];
  if (control.filter) visibleRows = visibleRows.filter(t => String(columns.find(c => c[0] === control.column)?.[2](t) ?? "").toLowerCase().includes(control.filter.toLowerCase()));
  if (control.sort) visibleRows.sort((a, b) => {
    const getter = columns.find(c => c[0] === control.column)?.[2] || columns[0][2];
    const av = getter(a), bv = getter(b);
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return control.sort === "asc" ? result : -result;
  });
  if (!visibleRows.length) {
    table.innerHTML = `<thead><tr>${columns.map(c => `<th><button class="table-head-btn" data-table-column="${c[0]}">${c[1]}</button></th>`).join("")}</tr></thead><tbody><tr><td class="empty" colspan="5">Sin datos para mostrar.</td></tr></tbody>`;
  } else {
    table.innerHTML = `<thead><tr>${columns.map(c => `<th><button class="table-head-btn" data-table-column="${c[0]}">${c[1]}</button></th>`).join("")}</tr></thead><tbody>${
      visibleRows.map(t => `<tr class="clickable-row" data-movement-index="${getDisplayedMovements().indexOf(t)}">${transactionRow(t).join("")}</tr>`).join("")
    }</tbody>`;
  }
  table.querySelectorAll("[data-table-column]").forEach(btn => btn.addEventListener("click", () => configureMovementTable(btn.dataset.tableColumn, rows)));
  table.querySelectorAll("[data-movement-index]").forEach(row => {
    row.addEventListener("click", () => openMovementDetail(Number(row.dataset.movementIndex)));
  });
}

function configureMovementTable(column, rows) {
  const option = prompt('Ordenar/filtrar: escribe asc, desc o un texto para filtrar. Vacío limpia el filtro.', 'asc');
  state.tableControls.movement = { column };
  if (!option) state.tableControls.movement = {};
  else if (["asc", "desc"].includes(option.toLowerCase())) state.tableControls.movement.sort = option.toLowerCase();
  else state.tableControls.movement.filter = option;
  renderMovementTable(rows);
}

function movementBack() {
  const drill = state.movementDrill;
  if (drill.level === "entries") state.movementDrill = { level: "months", year: drill.year, month: null };
  else if (drill.level === "months") state.movementDrill = { level: "years", year: null, month: null };
  renderMovements();
}

function summarizeTransactions(transactions) {
  const income = sum(transactions.filter(t => isIncome(t)).map(t => t.amount));
  const expenses = Math.abs(sum(transactions.filter(t => isMonthlyExpense(t)).map(t => t.amount)));
  const invested = Math.abs(sum(transactions.filter(t => isInvestment(t)).map(t => t.amount)));
  return { income, expenses, invested, balance: income - expenses - invested };
}

function metricBlock(label, value, tone) {
  return `<div class="metric ${tone || ""}"><strong>${money(value, 0)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderInvestments() {
  const summary = calculateSummary(getSelectedSummaryMonth());
  const showingGoals = state.summaryModes.investmentPanel === "goals";
  document.getElementById("investmentPanelLabel").textContent = showingGoals ? "Objetivos" : "Inversión";
  document.getElementById("editInvestmentGoalsBtn").classList.toggle("hidden", !showingGoals);
  document.getElementById("openInvestmentOverviewBtn").classList.toggle("hidden", showingGoals);
  document.getElementById("investmentGoals").classList.toggle("hidden", !showingGoals);
  document.querySelectorAll("[data-investment-panel]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.investmentPanel === state.summaryModes.investmentPanel);
  });
  document.getElementById("investmentCurrentTotal").textContent = money(summary.valueTotal);
  document.getElementById("investmentTotalMetrics").innerHTML = `
    <div><span>Invertido</span><strong>${money(summary.investedTotal)}</strong></div>
    <div><span>Ganancia</span><strong class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${money(summary.profitLoss)}</strong></div>
    <div><span>%</span><strong class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${pct(summary.profitLossPct)}</strong></div>
  `;
  if (document.getElementById("investmentOverviewDialog").open) {
    renderInvestmentBreakdownCharts(summary);
  }
  renderInvestmentGoals(summary);
  renderInvestmentBreakdownTable(summary);
  renderInvestmentEditTable();
}

function setInvestmentPanelFromClick(event) {
  const btn = event.target.closest("[data-investment-panel]");
  if (!btn) return;
  state.summaryModes.investmentPanel = btn.dataset.investmentPanel;
  renderInvestments();
}

function renderInvestmentEditTable() {
  const sorted = [...state.investments].sort((a, b) => b.total - a.total);
  let lastType = "";
  const body = sorted.map((i) => {
    const idx = state.investments.indexOf(i);
    const group = i.tipo !== lastType ? `<tr><th colspan="4">${escapeHtml(i.tipo || "Sin tipo")}</th></tr>` : "";
    lastType = i.tipo;
    return `${group}<tr class="clickable-row" data-investment-index="${idx}">
      <td class="investment-name" title="${escapeAttr(i.nombre)}">${escapeHtml(i.nombre)}</td>
      <td class="amount">${numberFmt(i.cantidad, 2)}</td>
      <td class="amount">${money(i.valor, 2)}</td>
      <td class="amount">${money(i.total, 2)}</td>
    </tr>`;
  }).join("");
  document.getElementById("investmentEditTable").innerHTML = `<thead><tr><th class="col-detail">Detalle</th><th class="col-qty">Cant.</th><th class="col-money">Valor</th><th class="col-money">Total</th></tr></thead><tbody>${body || `<tr><td class="empty" colspan="4">Sin posiciones.</td></tr>`}</tbody>`;
  document.querySelectorAll("#investmentEditTable [data-investment-index]").forEach(row => {
    row.addEventListener("click", () => openInvestmentDetail(Number(row.dataset.investmentIndex)));
  });
}

function renderInvestmentBreakdownCharts(summary) {
  const selectedType = state.summaryModes.investmentOverviewType;
  document.getElementById("investmentOverviewTitle").textContent = selectedType ? selectedType : "Inversiones";
  if (selectedType) return renderInvestmentPositionCharts(selectedType);
  const current = INVESTMENT_TYPES.map(type => summary.valueByType[type] || 0);
  const rows = INVESTMENT_TYPES.map((type, idx) => ({ label: type, value: current[idx], color: chartColor(PIE_CHART_COLORS, idx + 2) })).filter(row => row.value > 0);
  renderColorRowsTable("investmentOverviewTable", rows, ["", "Detalle", "Total", "%"]);
  upsertChart("investmentBreakdownDonut", "doughnut", {
    labels: rows.map(row => `${row.label}: ${money(row.value)} (${pct(row.value / Math.max(sum(rows.map(r => r.value)), 1))})`),
    datasets: [{ data: rows.map(row => row.value), backgroundColor: rows.map(row => row.color), borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions("Valor actual", { legend: false }));
}

function addInvestmentRow() {
  state.investments.push({ rowNumber: null, data: "", nombre: "", tipo: "Cartera", cantidad: 0, valor: 0, total: 0 });
  openInvestmentDetail(state.investments.length - 1);
}

async function saveInvestments() {
  readInvestmentEditor();
  if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
    writeDataCache();
    rememberPendingSnapshot("investments");
    setNotice(lineMessage("Para modificar inversiones necesitas Apps Script.", "Cambio guardado solo en cache local."), "warn");
    renderInvestments();
    return;
  }
  const btn = document.getElementById("saveInvestmentsBtn");
  markButtonSaving(btn);
  try {
    await fetch(state.config.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveInvestments", token: state.config.appToken, sheetName: state.config.investmentSheet, investments: state.investments })
    });
    writeDataCache();
    dropPendingSections("investments");
    await refreshDataInPlace();
    markButtonSaved(btn);
    setNotice("Cambios de inversiones enviados.", "ok");
  } catch (error) {
    restoreButton(btn);
    setNotice(`No se pudieron guardar inversiones: ${error.message}`, "warn");
  } finally {
    renderInvestments();
  }
}

function readInvestmentEditor() {
  document.querySelectorAll("#investmentEditTable tbody tr[data-investment-index]").forEach(row => {
    const idx = Number(row.dataset.investmentIndex);
    row.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      state.investments[idx][field] = ["cantidad", "valor", "total"].includes(field) ? Number(input.value || 0) : input.value.trim();
    });
  });
}

function openMovementDetail(index) {
  const list = getDisplayedMovements();
  const t = list[index];
  if (!t) return;
  document.getElementById("editMovementIndex").value = index;
  document.getElementById("editMovementDate").value = formatDate(t.date);
  document.getElementById("editMovementType").value = t.tipo;
  document.getElementById("editMovementConcept").value = t.concepto;
  document.getElementById("editMovementDescription").value = t.descripcion;
  document.getElementById("editMovementAmount").value = t.amount;
  document.getElementById("movementDetailDialog").showModal();
}

async function saveMovementDetail(event) {
  event.preventDefault();
  const btn = event.submitter;
  markButtonSaving(btn);
  const index = Number(document.getElementById("editMovementIndex").value);
  const list = getDisplayedMovements();
  const previous = list[index];
  if (!previous) {
    restoreButton(btn);
    return;
  }
  const movement = normalizeTransaction({
    rowNumber: previous.rowNumber,
    fecha: document.getElementById("editMovementDate").value,
    tipo: document.getElementById("editMovementType").value,
    concepto: document.getElementById("editMovementConcept").value,
    descripcion: document.getElementById("editMovementDescription").value,
    importe: document.getElementById("editMovementAmount").value
  });
  if (!movement) {
    restoreButton(btn);
    return;
  }
  try {
    if (state.config.readMode === "apps-script" && state.config.scriptUrl && previous.rowNumber) {
      await postAppsScript({ action: "updateMovement", movement, sheetName: state.movementMode === "future" ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet });
      setNotice("Movimiento actualizado.", "ok");
    } else {
      setNotice(lineMessage("Cambio local.", "Para guardar en Sheets necesitas Apps Script y rowNumber."), "warn");
    }
    list[index] = movement;
    writeDataCache();
    markButtonSaved(btn);
    document.getElementById("movementDetailDialog").close();
    if (state.config.readMode === "apps-script" && state.config.scriptUrl && previous.rowNumber) {
      await refreshDataInPlace();
    }
    syncOptions();
    renderAll();
  } catch (error) {
    restoreButton(btn);
    setNotice(`No se pudo guardar: ${error.message}`, "warn");
  }
}

async function deleteMovementDetail() {
  const index = Number(document.getElementById("editMovementIndex").value);
  const list = getDisplayedMovements();
  const movement = list[index];
  if (!movement) return;
  if (state.config.readMode === "apps-script" && state.config.scriptUrl && movement.rowNumber) {
    await postAppsScript({ action: "deleteMovement", rowNumber: movement.rowNumber, sheetName: state.movementMode === "future" ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet });
    setNotice("Movimiento eliminado.", "ok");
  } else {
    setNotice(lineMessage("Eliminado solo en pantalla.", "Para borrar en Sheets necesitas Apps Script y rowNumber."), "warn");
  }
  list.splice(index, 1);
  writeDataCache();
  document.getElementById("movementDetailDialog").close();
  syncOptions();
  renderAll();
}

function openInvestmentDetail(index) {
  const item = state.investments[index];
  if (!item) return;
  document.getElementById("editInvestmentIndex").value = index;
  document.getElementById("editInvestmentData").value = item.data;
  document.getElementById("editInvestmentName").value = item.nombre;
  document.getElementById("editInvestmentType").value = item.tipo || INVESTMENT_TYPES[0];
  document.getElementById("editInvestmentQuantity").value = safeNumber(item.cantidad);
  document.getElementById("editInvestmentValue").value = safeNumber(item.valor);
  document.getElementById("editInvestmentTotal").value = safeNumber(item.total);
  document.getElementById("investmentDetailDialog").showModal();
}

function saveInvestmentDetail(event) {
  event.preventDefault();
  const btn = event.submitter;
  const index = Number(document.getElementById("editInvestmentIndex").value);
  const item = state.investments[index];
  if (!item) return;
  Object.assign(item, {
    data: document.getElementById("editInvestmentData").value.trim(),
    nombre: document.getElementById("editInvestmentName").value.trim(),
    tipo: document.getElementById("editInvestmentType").value,
    cantidad: Number(document.getElementById("editInvestmentQuantity").value || 0),
    valor: Number(document.getElementById("editInvestmentValue").value || 0),
    total: Number(document.getElementById("editInvestmentTotal").value || 0)
  });
  writeDataCache();
  rememberPendingSnapshot("investments");
  markButtonSaved(btn);
  document.getElementById("investmentDetailDialog").close();
  renderInvestments();
}

async function submitMovement(event) {
  event.preventDefault();
  if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
    setNotice("Configura Apps Script antes de enviar movimientos.", "warn");
    return;
  }
  const isTransfer = normalizeType(document.getElementById("formType").value) === "transferencia";
  const isRecurring = isRecurringMode();
  const btn = document.getElementById("submitMovement");
  markButtonSaving(btn);
  try {
    if (isRecurring && !isTransfer) {
      const movements = movementsFromRecurrenceForm();
      if (!movements.length) throw new Error("selecciona fechas y al menos un día");
      await postAppsScript({ action: "addMovementsBatch", movements, movementSheet: state.config.movementSheet, futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros", bankSheet: state.config.bankSheet || "Bancos", account: document.getElementById("recurrenceAccount").value });
      const account = document.getElementById("recurrenceAccount").value;
      const today = endOfToday();
      const realized = movements.filter(m => m.date <= today);
      const futureMovs = movements.filter(m => m.date > today);
      const bankBefore = getBankAmount(account);
      realized.forEach(m => applyBankDelta(account, m.amount));
      state.transactions.push(...realized);
      state.futureTransactions.push(...futureMovs);
      writeDataCache();
      showMovementPopup("Movimientos periódicos guardados", realized[0] || futureMovs[0], account, lineMessage(
        `${realized.length} ${plural(realized.length, "realizado", "realizados")} y ${futureMovs.length} futuros`,
        account ? `Banco: ${bankChangeText(account, bankBefore)}` : ""
      ));
    } else if (isTransfer) {
      const amount = Math.abs(Number(document.getElementById("formAmount").value || 0));
      const from = document.getElementById("formTransferFrom").value;
      const to = document.getElementById("formTransferTo").value;
      if (!amount || !from || !to || from === to) throw new Error("elige origen, destino e importe valido");
      const fromBefore = getBankAmount(from);
      const toBefore = getBankAmount(to);
      await postAppsScript({ action: "transferBank", bankSheet: state.config.bankSheet || "Bancos", from, to, amount });
      applyBankDelta(from, -amount);
      applyBankDelta(to, amount);
      writeDataCache();
      dropPendingSections("banks");
      setNotice(lineMessage("Traspaso hecho", `Origen: ${bankChangeText(from, fromBefore)}`, `Destino: ${bankChangeText(to, toBefore)}`), "ok");
    } else {
      const movement = movementFromForm();
      const future = movement.date > endOfToday();
      await postAppsScript({
        action: future ? "addFutureMovement" : "addMovement",
        movement,
        sheetName: future ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet,
        bankSheet: state.config.bankSheet || "Bancos",
        account: document.getElementById("formAccount").value
      });
      const account = document.getElementById("formAccount").value;
      const bankBefore = getBankAmount(account);
      const totalBefore = sum(state.banks.map(b => b.dinero));
      if (!future) applyBankDelta(account, movement.amount);
      (future ? state.futureTransactions : state.transactions).push(movement);
      writeDataCache();
      dropPendingSections("banks");
      const totalAfter = sum(state.banks.map(b => b.dinero));
      showMovementPopup(future ? "Movimiento futuro guardado" : "Movimiento guardado", movement, account);
      setNotice(formatMovementSavedNotice(movement, account, totalBefore, totalAfter, bankBefore), "ok");
    }
    syncOptions();
    renderAll();
    event.target.reset();
    setDefaultDate();
    syncRegistrarMode();
    await refreshDataInPlace();
    markButtonSaved(btn);
  } catch (error) {
    restoreButton(btn);
    setNotice(`No se pudo enviar: ${error.message}`, "warn");
  } finally {
    if (!btn.classList.contains("saved")) restoreButton(btn);
  }
}

function movementsFromRecurrenceForm() {
  const start = parseDate(document.getElementById("recurrenceStart").value);
  const end = parseDate(document.getElementById("recurrenceEnd").value);
  if (!start || !end || start > end) return [];
  const selected = [...document.querySelectorAll("#recurrencePicker input:checked")].map(i => Number(i.value));
  if (!selected.length) return [];
  const type = document.getElementById("recurrenceType").value;
  const base = movementFromFormBase();
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const weekDay = (d.getDay() + 6) % 7;
    const monthDay = d.getDate();
    if ((type === "weekly" && selected.includes(weekDay)) || (type === "monthly" && selected.includes(monthDay))) {
      out.push(normalizeTransaction({ ...base, fecha: formatDate(d) }));
    }
  }
  return out.filter(Boolean);
}

function movementFromFormBase() {
  const type = prettyType(document.getElementById("formType").value);
  const amount = Number(document.getElementById("formAmount").value || 0);
  return {
    tipo: type,
    concepto: prettyType(document.getElementById("formConcept").value),
    descripcion: document.getElementById("formDescription").value.trim(),
    importe: amount
  };
}

function movementFromForm() {
  return normalizeTransaction({
    ...movementFromFormBase(),
    fecha: document.getElementById("formDate").value
  });
}

function setRegisterModeFromClick(event) {
  const btn = event.target.closest('[data-register-mode]');
  if (!btn) return;
  document.querySelectorAll('[data-register-mode]').forEach(b => b.classList.toggle('active', b === btn));
  syncRegisterMode();
}

function isRecurringMode() {
  return document.querySelector('[data-register-mode].active')?.dataset.registerMode === 'recurring';
}

function syncRegisterMode() {
  const recurring = isRecurringMode();
  const isTransfer = normalizeType(document.getElementById('formType').value) === 'transferencia';
  const showRecurring = recurring && !isTransfer;
  document.getElementById('recurringFields')?.classList.toggle('hidden', !showRecurring);
  document.querySelector('#movementForm .recurring-account')?.classList.toggle('hidden', !showRecurring);
  document.querySelectorAll('#movementForm .movement-only').forEach(el => {
    const fieldId = el.querySelector('input, select')?.id;
    const hiddenInRecurring = ['formDate', 'formAccount'].includes(fieldId);
    el.classList.toggle('hidden', isTransfer || (showRecurring && hiddenInRecurring));
  });
  const formDate = document.getElementById('formDate');
  if (formDate) formDate.required = !showRecurring && !isTransfer;
  const recurrenceAccount = document.getElementById('recurrenceAccount');
  if (recurrenceAccount) recurrenceAccount.required = showRecurring;
  ['recurrenceStart','recurrenceEnd'].forEach(id => { const el=document.getElementById(id); if (el) el.required = showRecurring; });
  if (showRecurring) setDefaultRecurrenceDates();
  renderRecurrencePicker();
}

function setDefaultRecurrenceDates() {
  const start = document.getElementById('recurrenceStart');
  const end = document.getElementById('recurrenceEnd');
  const today = new Date();
  if (start && !start.value) start.value = formatDate(today);
  if (end && !end.value) end.value = formatDate(addMonthsClamped(today, 1));
}

function addMonthsClamped(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function renderRecurrencePicker() {
  const picker = document.getElementById('recurrencePicker');
  if (!picker) return;
  const type = document.getElementById('recurrenceType')?.value || 'weekly';
  const items = type === 'weekly'
    ? ['L','M','X','J','V','S','D'].map((label, i) => ({ label, value: i }))
    : Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
  picker.innerHTML = `<p>${type === 'weekly' ? 'Días de la semana' : 'Días del mes'}</p><div class="choice-grid ${type}">${items.map(item => `<label><input type="checkbox" value="${item.value}"><span>${item.label}</span></label>`).join('')}</div>`;
}

function setMovementModeFromClick(event) {
  const btn = event.target.closest('[data-movement-mode]');
  if (!btn) return;
  state.movementMode = btn.dataset.movementMode;
  document.querySelectorAll('[data-movement-mode]').forEach(b => b.classList.toggle('active', b === btn));
  state.movementDrill = { level: 'years', year: null, month: null };
  renderMovements();
}

function getDisplayedMovements() {
  return state.movementMode === 'future' ? state.futureTransactions : state.transactions;
}

function renderFutureDueNotice() {
  const due = state.futureTransactions.filter(t => t.date <= endOfToday());
  if (due.length) showMovementPopup('Movimientos futuros vencidos', null, '', lineMessage(`${due.length} movimiento(s) son de hoy o anteriores.`, 'Pulsa Actualizar para moverlos automáticamente desde Apps Script.'));
}

function movementPopupHtml(movement, account, extra = '') {
  if (String(extra).trim().startsWith("<")) return extra;
  if (extra) return `<p>${formatNoticeHtml(extra)}</p>`;
  return `<div class="money-grid"><div class="money-item"><span>Fecha</span><strong>${formatDate(movement.date)}</strong></div><div class="money-item"><span>Importe</span><strong>${money(movement.amount)}</strong></div><div class="money-item"><span>Tipo</span><strong>${escapeHtml(movement.tipo)}</strong></div><div class="money-item"><span>Cuenta</span><strong>${escapeHtml(account || 'Sin cuenta')}</strong></div></div><p><strong>${escapeHtml(movement.concepto)}</strong> · ${escapeHtml(movement.descripcion)}</p>`;
}

function movedFutureMovementsPopupHtml(movements) {
  const rows = movements
    .map(row => ({ movement: normalizeTransaction(row), account: row.cuenta || row.account || "" }))
    .filter(row => row.movement)
    .map(({ movement, account }) => `
      <tr>
        <td class="popup-date">${formatDate(movement.date).slice(5)}</td>
        <td class="popup-type">${tag(movement.tipo)}</td>
        <td class="text-clip" title="${escapeAttr(movement.concepto)}">${escapeHtml(movement.concepto)}</td>
        <td class="text-clip" title="${escapeAttr(movement.descripcion)}">${escapeHtml(movement.descripcion)}</td>
        <td class="amount popup-money">${money(movement.amount, 0)}</td>
        <td class="text-clip" title="${escapeAttr(account || 'Sin cuenta')}">${escapeHtml(account || 'Sin cuenta')}</td>
      </tr>`)
    .join("");
  return `
    <p>${formatNoticeHtml(lineMessage(`${movements.length} ${plural(movements.length, "movimiento vencido movido", "movimientos vencidos movidos")} a realizados.`))}</p>
    <div class="table-wrap movement-popup-table">
      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Desc.</th><th>Cant.</th><th>Banco</th></tr></thead>
        <tbody>${rows || `<tr><td class="empty" colspan="6">Sin datos para mostrar.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function showMovementPopup(title, movement, account = '', extra = '') {
  const dialog = document.getElementById('movementPopup');
  if (!dialog) return;
  document.getElementById('movementPopupTitle').textContent = title;
  document.getElementById('movementPopupBody').innerHTML = movementPopupHtml(movement, account, extra);
  if (!dialog.open) dialog.showModal();
  lucide.createIcons();
}

function loadInvestmentGoals() {
  try { return { monthly: 0, yearly: 0, total: 0, ...JSON.parse(localStorage.getItem('investmentGoals') || '{}') }; }
  catch { return { monthly: 0, yearly: 0, total: 0 }; }
}

function editInvestmentGoals() {
  const current = state.investmentGoals;
  document.getElementById("goalMonthlyInput").value = formatDecimalInput(current.monthly);
  document.getElementById("goalYearlyInput").value = formatDecimalInput(current.yearly);
  document.getElementById("goalTotalInput").value = formatDecimalInput(current.total);
  document.getElementById("investmentGoalsDialog").showModal();
}

async function saveInvestmentGoalsFromDialog(event) {
  event.preventDefault();
  const btn = event.submitter;
  markButtonSaving(btn);
  const monthly = roundMoney(document.getElementById("goalMonthlyInput").value);
  const yearly = roundMoney(document.getElementById("goalYearlyInput").value);
  const total = roundMoney(document.getElementById("goalTotalInput").value);
  state.investmentGoals = { monthly, yearly, total };
  localStorage.setItem('investmentGoals', JSON.stringify(state.investmentGoals));
  writeDataCache();
  renderInvestments();
  if (state.config.scriptUrl && state.config.readMode === "apps-script") {
    try {
      await postAppsScript({ action: "saveInvestmentGoals", sheetName: state.config.objectiveSheet || "Objetivos", goals: state.investmentGoals });
      await refreshDataInPlace();
      markButtonSaved(btn);
      document.getElementById("investmentGoalsDialog").close();
      setNotice('Objetivos guardados en Google Sheets.', 'ok');
    } catch (error) {
      restoreButton(btn);
      setNotice(lineMessage('Objetivos guardados solo en este navegador.', error.message), 'warn');
    }
  } else {
    markButtonSaved(btn);
    document.getElementById("investmentGoalsDialog").close();
    setNotice('Objetivos guardados en este navegador.', 'ok');
  }
}

async function fetchPublicCsvInvestmentGoals() {
  if (!state.config.sheetId) return state.investmentGoals;
  const csv = await fetchCsv(state.config.sheetId, state.config.objectiveSheet || "Objetivos");
  const rows = parseCsv(csv).slice(1);
  return normalizeInvestmentGoals(Object.fromEntries(rows.map(row => [row[0], row[1]])));
}

function normalizeInvestmentGoals(value) {
  const goals = { monthly: 0, yearly: 0, total: 0 };
  if (!value || typeof value !== "object") return goals;
  Object.entries(value).forEach(([key, raw]) => {
    const normalized = normalizeGoalKey(key);
    const parsed = parseNumber(raw);
    if (normalized && Number.isFinite(parsed)) goals[normalized] = parsed;
  });
  ["monthly", "yearly", "total"].forEach(key => {
    const parsed = parseNumber(value[key]);
    if (Number.isFinite(parsed)) goals[key] = parsed;
  });
  return goals;
}

function normalizeGoalKey(value) {
  const text = normalizeType(value);
  if (text === "mensual" || text === "monthly") return "monthly";
  if (text === "anual" || text === "yearly") return "yearly";
  if (text === "total") return "total";
  return "";
}

function renderInvestmentGoals(summary) {
  const el = document.getElementById('investmentGoals');
  if (!el) return;
  const today = endOfToday();
  const month = currentMonthKey();
  const year = String(today.getFullYear());
  const realizedMonth = Math.abs(sum(state.transactions.filter(t => isInvestment(t) && monthKey(t.date) === month).map(t => t.amount)));
  const plannedMonth = Math.abs(sum(state.futureTransactions.filter(t => isInvestment(t) && monthKey(t.date) === month).map(t => t.amount)));
  const realizedYear = Math.abs(sum(state.transactions.filter(t => isInvestment(t) && String(t.date.getFullYear()) === year).map(t => t.amount)));
  const plannedYear = Math.abs(sum(state.futureTransactions.filter(t => isInvestment(t) && String(t.date.getFullYear()) === year).map(t => t.amount)));
  const realizedTotal = summary.investedTotal;
  const plannedTotal = Math.abs(sum(state.futureTransactions.filter(isInvestment).map(t => t.amount)));
  const cards = [
    ['Mensual', state.investmentGoals.monthly, realizedMonth, plannedMonth],
    ['Anual', state.investmentGoals.yearly, realizedYear, plannedYear],
    ['Total', state.investmentGoals.total, realizedTotal, plannedTotal]
  ];
  el.innerHTML = cards.map(([label, goal, done, planned]) => {
    const totalProgress = done + planned;
    const remaining = Math.max(goal - totalProgress, 0);
    const overrun = Math.max(totalProgress - goal, 0);
    const denominator = Math.max(goal, totalProgress, 1);
    const pctDone = Math.min(100, done / denominator * 100);
    const pctPlanned = Math.min(100 - pctDone, planned / denominator * 100);
    const pctRemaining = Math.max(0, 100 - pctDone - pctPlanned);
    return `
      <div class="goal-row">
        <div class="goal-heading">
          <strong>${escapeHtml(label)}</strong>
          <div class="goal-meta">
            <span>Objetivo ${money(goal)}</span>
            ${overrun ? `<span class="goal-overrun">Te pasas ${money(overrun)}</span>` : ''}
          </div>
        </div>
        <div class="goal-track">
          <span class="done" style="width:${pctDone}%"></span>
          <span class="planned" style="width:${pctPlanned}%"></span>
          <span class="remaining" style="width:${pctRemaining}%"></span>
        </div>
        <div class="goal-metrics">
          <div class="done"><strong>${money(done)}</strong><span>Aportado</span></div>
          <div class="planned"><strong>${money(planned)}</strong><span>Programado</span></div>
          <div class="remaining"><strong>${money(remaining)}</strong><span>Restante</span></div>
        </div>
      </div>`;
  }).join('');
}

function applyBankDelta(account, amount) {
  const bank = state.banks.find(b => b.cuenta === account);
  if (bank) bank.dinero += Number(amount) || 0;
}

function getBankAmount(account) {
  return safeNumber(state.banks.find(b => b.cuenta === account)?.dinero);
}

function bankChangeText(account, before) {
  return `${account || "Cuenta"} ${money(before)} → ${money(getBankAmount(account))}`;
}

async function saveBanks() {
  const btn = document.getElementById("saveBanksBtn");
  markButtonSaving(btn);
  document.querySelectorAll("[data-bank-index]").forEach(input => {
    const idx = Number(input.dataset.bankIndex);
    if (state.banks[idx]) state.banks[idx].dinero = roundMoney(input.value);
  });
  if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
    writeDataCache();
    rememberPendingSnapshot("banks");
    renderSummary();
    markButtonSaved(document.getElementById("saveBanksBtn") || btn);
    return;
  }
  try {
    await postAppsScript({ action: "saveBanks", bankSheet: state.config.bankSheet || "Bancos", banks: state.banks });
    writeDataCache();
    dropPendingSections("banks");
    await refreshDataInPlace();
    renderBankDetail(calculateSummary(getSelectedSummaryMonth()));
    markButtonSaved(document.getElementById("saveBanksBtn") || btn);
    setNotice("Cuentas guardadas.", "ok");
  } catch (error) {
    restoreButton(document.getElementById("saveBanksBtn") || btn);
    setNotice(`No se pudieron guardar cuentas: ${error.message}`, "warn");
    renderSummary();
  }
}

async function postAppsScript(payload) {
  await fetch(state.config.scriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: state.config.appToken, ...payload })
  });
}

function normalizeTransaction(row) {
  const date = parseDate(row.fecha || row.FECHA || row.date || row[0]);
  const tipo = prettyType(String(row.tipo || row.TIPO || row[4] || "").trim());
  const concepto = prettyType(String(row.concepto || row.CONCEPTO || row[5] || "").trim());
  const descripcion = String(row.descripcion || row.DESCRIPCION || row["DESCRIPCION"] || row[6] || "").trim();
  const amount = parseNumber(row.importe ?? row.IMPORTE ?? row[7]);
  if (!date || !tipo || Number.isNaN(amount)) return null;
  return { rowNumber: Number(row.rowNumber || row.row || 0) || null, date, tipo, concepto: concepto || "Otros", descripcion, amount, cuenta: String(row.cuenta || row.CUENTA || row.account || row[8] || "").trim() };
}

function normalizeInvestment(row) {
  const total = parseNumber(row.total ?? row["VALOR TOTAL"] ?? row[5]);
  const data = String(row.data || row.DATA || row[0] || "").trim();
  const nombre = String(row.nombre || row.NOMBRE || row[1] || data).trim();
  const tipo = prettyType(String(row.tipo || row.TIPO || row[2] || "").trim());
  if (!data || !nombre || !tipo || Number.isNaN(total) || total < 0) return null;
  return { rowNumber: Number(row.rowNumber || row.row || 0) || null, data, nombre, tipo, cantidad: parseNumber(row.cantidad ?? row.CANTIDAD ?? row[3]), valor: parseNumber(row.valor ?? row.VALOR ?? row[4]), total };
}

function normalizeBank(row) {
  const cuenta = String(row.cuenta || row.CUENTA || row[0] || "").trim();
  const dinero = parseNumber(row.dinero ?? row.DINERO ?? row[1]);
  if (!cuenta || Number.isNaN(dinero)) return null;
  return { rowNumber: Number(row.rowNumber || row.row || 0) || null, cuenta, dinero };
}

function normalizeCategories(categories) {
  return {
    types: unique([...(categories && categories.types || []), ...STATIC_TYPES]).map(prettyType),
    concepts: unique([...(categories && categories.concepts || []), ...STATIC_CONCEPTS]).map(prettyType)
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quote && next === '"') { cell += '"'; i++; }
    else if (ch === '"') quote = !quote;
    else if (ch === "," && !quote) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quote) {
      if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = ""; }
      if (ch === "\r" && next === "\n") i++;
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function renderTable(id, headers, rows) {
  const table = document.getElementById(id);
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty" colspan="${headers.length}">Sin datos para mostrar.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

function transactionRow(t) {
  return [
    `<td class="amount col-day">${String(t.date.getDate()).padStart(2, "0")}</td>`,
    `<td class="col-type">${tag(t.tipo)}</td>`,
    `<td class="text-clip col-concept" title="${escapeAttr(t.concepto)}">${escapeHtml(t.concepto)}</td>`,
    `<td class="text-clip col-desc" title="${escapeAttr(t.descripcion)}">${escapeHtml(t.descripcion)}</td>`,
    `<td class="col-money">${amountCell(t.amount)}</td>`
  ];
}

function upsertChart(canvasId, type, data, options) {
  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  state.charts[canvasId] = new Chart(document.getElementById(canvasId), { type, data, options });
}

function compactChartOptions(title, options = {}) {
  const textColor = cssVar("--chart-text");
  const gridColor = cssVar("--chart-grid");
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: Boolean(title), text: title, color: textColor },
      legend: { display: options.legend !== false, position: "bottom", labels: { color: textColor, boxWidth: 12, boxHeight: 12 } },
      tooltip: moneyTooltip()
    },
    scales: options.scales ? themeScales(options.scales, textColor, gridColor) : undefined,
    cutout: options.cutout || "52%"
  };
}

function chartColor(palette, index) {
  return palette[index % palette.length];
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartSurfaceColor() {
  return cssVar("--chart-surface") || cssVar("--panel") || "#fff";
}

function themeScales(scales, textColor, gridColor) {
  const themed = { ...scales };
  Object.keys(themed).forEach(axis => {
    themed[axis] = {
      ...themed[axis],
      ticks: { ...(themed[axis].ticks || {}), color: textColor },
      grid: { ...(themed[axis].grid || {}), color: gridColor }
    };
  });
  return themed;
}

function adjustedBankChartRows() {
  const map = new Map();
  state.banks.forEach(bank => map.set(normalizeType(bank.cuenta), { label: bank.cuenta, value: Number(bank.dinero) || 0 }));
  const save = map.get("bbva-save") || map.get("bbva save");
  const credit = map.get("bbva-credito") || map.get("bbva credito");
  if (save && credit) save.value += Math.min(credit.value, 0);
  return [...map.values()].filter(row => row.value > 0).sort((a, b) => b.value - a.value);
}

function openInvestmentOverview(type) {
  state.summaryModes.investmentOverviewType = type;
  document.getElementById("investmentOverviewDialog").showModal();
  renderInvestments();
}

function renderInvestmentBreakdownTable(summary) {
  const rows = INVESTMENT_TYPES.map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    return `<tr class="clickable-row" data-investment-type="${escapeAttr(type)}"><td class="text-clip">${type}</td><td class="amount">${money(invested)}</td><td class="amount">${money(current)}</td><td>${amountCell(current - invested)}</td><td class="amount">${pctGain(current, invested)}</td></tr>`;
  }).join("");
  document.getElementById("investmentBreakdownTable").innerHTML = `<thead><tr><th class="col-type">Tipo</th><th class="col-money">Inv.</th><th class="col-money">Actual</th><th class="col-money">Gan.</th><th class="col-pct">%</th></tr></thead><tbody>${rows}</tbody>`;
  document.querySelectorAll("#investmentBreakdownTable [data-investment-type]").forEach(row => row.addEventListener("click", () => openInvestmentOverview(row.dataset.investmentType)));
}

function renderInvestmentPositionCharts(type) {
  const positions = state.investments.filter(i => normalizeType(i.tipo) === normalizeType(type) && i.total > 0).sort((a, b) => b.total - a.total);
  const total = sum(positions.map(i => i.total));
  const rows = positions.map((i, idx) => ({ label: i.nombre, value: i.total, color: chartColor(PIE_CHART_COLORS, idx) }));
  renderColorRowsTable("investmentOverviewTable", rows, ["", "Detalle", "Total", "Peso"]);
  upsertChart("investmentBreakdownDonut", "doughnut", {
    labels: rows.map(row => `${row.label}: ${money(row.value)} (${pct(row.value / Math.max(total, 1))})`),
    datasets: [{ data: rows.map(row => row.value), backgroundColor: rows.map(row => row.color), borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions(`Peso ${type}`, { legend: false }));
}

function renderColorRowsTable(id, rows, headers) {
  const total = sum(rows.map(row => row.value));
  renderTable(id, headers, rows.map(row => [
    colorDot(row.color),
    escapeHtml(row.label),
    money(row.value),
    pct(row.value / Math.max(total, 1))
  ]));
}

function colorDot(color) {
  return `<span class="color-dot" style="background:${escapeAttr(color)}"></span>`;
}

function renderChartLegend(id, rows) {
  const total = sum(rows.map(row => row.value));
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = rows.map(row => `
    <div class="legend-row">
      <span class="legend-swatch" style="background:${row.color}"></span>
      <span>${escapeHtml(row.label)}: ${money(row.value)} (${pct(row.value / Math.max(total, 1))})</span>
    </div>
  `).join("") || emptyBlock("Sin datos para mostrar.");
}

function moneyTooltip() {
  return { callbacks: { label: context => `${context.label || context.dataset.label || ""}: ${money(context.parsed?.y ?? context.parsed)}` } };
}

function moneyScales() {
  return { y: { beginAtZero: true, ticks: { callback: value => money(value, 0) } }, x: { grid: { display: false } } };
}

function summaryItem(title, value, tone) {
  return `<div class="summary-item"><span>${escapeHtml(title)}</span><strong class="${tone || ""}">${escapeHtml(value)}</strong></div>`;
}

function tag(value) { return `<span class="tag">${escapeHtml(value || "Sin tipo")}</span>`; }
function amountCell(value) { return `<span class="amount ${value >= 0 ? "positive" : "negative"}">${money(value)}</span>`; }
function pctGain(value, invested) { return invested ? pct((value - invested) / invested) : "0,0 %"; }
function emptyBlock(text) { return `<div class="empty">${escapeHtml(text)}</div>`; }
function sum(values) { return values.reduce((a, b) => a + (Number(b) || 0), 0); }
function unique(values) { return [...new Set(values.filter(v => v !== undefined && v !== null && String(v).trim() !== ""))]; }
function currentMonthKey() { return monthKey(new Date()); }
function monthKey(date) { return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : ""; }
function monthName(month) {
  const date = new Date(2020, Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-ES", { month: "short" }).format(date).replace(".", "");
}
function monthLabel(key) { return `${monthName(key.slice(5, 7))} ${key.slice(0, 4)}`; }
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }
function isIncome(t) { return normalizeType(t.tipo) === "ingreso";}
function isInvestment(t) { return normalizeType(t.tipo) === "inversion"; }
function isMonthlyExpense(t) { return !isIncome(t) && !isInvestment(t);}
function normalizeType(value) { return removeAccents(String(value || "")).toLowerCase().trim(); }
function prettyType(value) {
  const n = normalizeType(value);
  const map = { inversion: "Inversion", descripcion: "Descripcion", transferencia: "Transferencia" };
  return map[n] || String(value || "").trim();
}

function normalizeDescription(value) {
  return removeAccents(String(value || ""))
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400 * 1000));
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) return new Date(Number(slash[3].padStart(4, "20")), Number(slash[2]) - 1, Number(slash[1]));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "" || value === "---") return NaN;
  let cleaned = String(value).replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  else if (hasComma) cleaned = cleaned.replace(",", ".");
  return Number(cleaned);
}

function formatDate(date) { return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""; }
function money(value, decimals = 2) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(Number(value) || 0); }
function formatDecimalInput(value, decimals = 2) { return safeNumber(parseNumber(value)).toFixed(decimals); }
function roundMoney(value) { const parsed = parseNumber(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0; }
function pct(value) { return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 }).format(Number(value) || 0); }
function numberFmt(value, decimals = 2) { return new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimals }).format(Number(value) || 0); }
function safeNumber(value) { return Number.isFinite(value) ? value : 0; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function removeAccents(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function setNotice(message, type) {
  showToast(message, type);
}

function showToast(message, type = "") {
  if (!message) return;
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "ok" ? "ok" : type === "warn" ? "warn" : ""}`;
  toast.innerHTML = `<span>${formatNoticeHtml(message)}</span><button class="toast-close" type="button" aria-label="Cerrar">×</button>`;
  container.appendChild(toast);
  const remove = () => {
    toast.classList.add("closing");
    window.setTimeout(() => toast.remove(), 220);
  };
  toast.querySelector(".toast-close").addEventListener("click", remove);
  toast.addEventListener("click", event => {
    if (event.target === toast) remove();
  });
  window.setTimeout(remove, 5000);
}

function clearToasts() {
  document.querySelectorAll(".toast").forEach(toast => toast.remove());
}

function formatNoticeHtml(message) {
  return escapeHtml(message).replace(/\s*\/\/\s*/g, "<br>");
}

function formatMovementSavedNotice(movement, account, totalBefore, totalAfter, bankBefore) {
  return lineMessage(
    `Movimiento guardado`,
    `Banco: ${money(totalBefore)} a ${money(totalAfter)}`,
    `${account}: ${money(bankBefore)} a ${money(bankBefore + movement.amount)}`
  );
}

function lineMessage(...parts) {
  return parts.filter(part => part !== undefined && part !== null && String(part).trim()).join(" // ");
}

function plural(count, singular, pluralText) {
  return Number(count) === 1 ? singular : pluralText;
}
