const ENABLE_TEST_MODE = false;
const INVESTMENT_DEBUG_PREFIX = "[MM-INV]";

function investmentDebug(step, details = {}) {
  console.log(`${INVESTMENT_DEBUG_PREFIX} ${step}`, details);
}

let lastGlobalErrorNotice = { message: "", at: 0 };
function notifyGlobalError(message, detail) {
  console.error(`${INVESTMENT_DEBUG_PREFIX} ${message}`, detail);
  const now = Date.now();
  if (message === lastGlobalErrorNotice.message && now - lastGlobalErrorNotice.at < 4000) return;
  lastGlobalErrorNotice = { message, at: now };
  if (typeof logSyncEvent === "function") logSyncEvent(message, "warn", String(detail?.message || detail || ""));
  if (typeof showToast === "function") showToast("Ha ocurrido un error inesperado. Revisa Ajustes > Sync si se repite.", "warn");
}

window.addEventListener("error", event => {
  notifyGlobalError("Error inesperado en la app", {
    message: event.message,
    file: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error
  });
});

window.addEventListener("unhandledrejection", event => {
  notifyGlobalError("Promesa rechazada sin capturar", event.reason);
});

window.addEventListener("offline", () => {
  if (typeof showToast === "function") showToast("Sin conexión. Los cambios se guardan en cola y se enviarán al volver.", "warn", 3200);
  if (typeof logSyncEvent === "function") logSyncEvent("Sin conexión", "warn");
});
window.addEventListener("online", () => {
  if (typeof showToast === "function") showToast("Conexión recuperada.", "ok");
  if (typeof logSyncEvent === "function") logSyncEvent("Conexión recuperada", "ok");
});

const DEFAULT_CONFIG = {
  scriptUrl: "",
  appToken: "",
  movementSheet: "Control Finanzas",
  futureMovementSheet: "Movimientos futuros",
  investmentSheet: "Inversiones",
  investmentTotalsSheet: "Inversión Totales",
  investmentEstimateRulesSheet: "Inversiones Estimación Reglas",
  investmentEstimateLedgerSheet: "Inversiones Estimación Movimientos",
  bankSheet: "Bancos",
  objectiveSheet: "Objetivos",
  dataSheet: "Datos",
  initialCash: 6122.08
};

const STATIC_TYPES = ["Gasto", "Ingreso", "Inversión", "Transferencia"];
const STATIC_CONCEPTS = ["Comida", "Cuidado personal", "Deporte", "Fiesta", "Inversión", "Ocio", "Otros", "Piso", "Supermercado", "Universidad", "Viajes"];
const INVESTMENT_TYPES = ["Bolsa", "Fondos", "Cartera"];
const INVESTMENT_CATEGORY_CACHE_KEY = "moneyInvestmentCategoriesDraft";
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
const OP_QUEUE_KEY = "moneyOpQueue";
const SENT_HISTORY_KEY = "moneySentHistory";
const SYNC_LOG_KEY = "moneySyncLog";
const THEME_KEY = "moneyTheme";
const INVESTMENT_ESTIMATE_MODE_KEY = "moneyInvestmentEstimateMode";
const EVOLUTION_RANGE_KEY = "moneyEvolutionRange";
const ACCOUNT_GROUPS_KEY = "moneyAccountGroups";
const FULL_MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SYSTEM_GOAL_LABELS = {
  expenseMonthly: "Gasto mensual",
  investmentMonthly: "Inversión mensual",
  yearly: "Inversión anual",
  total: "Inversión total"
};
const DATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DATA_CACHE_VERSION = 3;
const CACHE_SECTION_KEYS = ["transactions", "futureTransactions", "investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "banks", "investmentGoals", "categories"];
const MOVEMENT_PAGE_SIZE = 500;

const TEST_TRANSACTIONS = ENABLE_TEST_MODE ? [
  ["2026-05-10", "Ingreso", "Otros", "Nomina", 2100],
  ["2026-05-12", "Gasto", "Supermercado", "Compra", -83.4],
  ["2026-05-25", "Retiro", "Otros", "Cajero", -120],
  ["2026-06-03", "Gasto", "Comida", "Menu", -14.5],
  ["2026-06-10", "Ingreso", "Otros", "Nomina", 2100],
  ["2026-06-11", "Gasto", "Ocio", "Libro", -19.99],
  ["2026-06-16", "Inversión", "Inversión", "Cartera", -400]
].map(row => normalizeTransaction({ fecha: row[0], tipo: row[1], concepto: row[2], descripcion: row[3], importe: row[4] })) : [];

const TEST_INVESTMENTS = ENABLE_TEST_MODE ? [
  { rowNumber: 10, data: "IWDA", nombre: "ETF MSCI World", shortName: "IWDA", tipo: "Cartera", cantidad: 23, valor: 89.4, total: 2056.2 },
  { rowNumber: 11, data: "EUNL", nombre: "ETF Core", shortName: "EUNL", tipo: "Bolsa", cantidad: 8, valor: 102.2, total: 817.6 },
  { rowNumber: 12, data: "Fondo Global", nombre: "Fondo indexado", shortName: "Fondo", tipo: "Fondos", cantidad: 1, valor: 3240, total: 3240 }
] : [];

const state = {
  config: loadConfig(),
  transactions: [],
  futureTransactions: [],
  investments: [],
  investmentTotals: [],
  investmentEstimateRules: [],
  investmentEstimateLedger: [],
  investmentMode: loadInvestmentEstimateMode(),
  banks: [],
  categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS, investmentTypes: INVESTMENT_TYPES },
  charts: {},
  filtered: [],
  movementDrill: { level: "entries", year: String(new Date().getFullYear()), month: currentMonthKey() },
  summaryModes: { situation: "ingresos", investmentMoney: "invested", moneyMix: "types", bankMoney: "summary", investmentOverviewType: null, investmentOverviewMode: "invested", investmentPanel: "current", settingsPanel: "sync" },
  descriptionSuggestions: {},
  submittingMovement: false,
  movementBulkEdit: false,
  movementMode: "realized",
  tableControls: {},
  investmentGoals: loadInvestmentGoals(),
  evolutionRange: loadEvolutionRange(),
  accountGroups: loadAccountGroups(),
  cacheMeta: defaultCacheMeta(),
  opQueueRunning: false,
  investmentNotificationsSending: false,
  pendingInvestmentAllocationPrompts: [],
  currentInvestmentAllocationPrompt: null,
  pendingInvestmentSummaryPopup: null
};

document.addEventListener("DOMContentLoaded", () => {
  investmentDebug("app cargada", { version: "local-mirror-v19" });
  applySavedTheme();
  applySavedInvestmentEstimateMode();
  lucide.createIcons();
  wireUi();
  hydrateConfigForm();
  setDefaultDate();
  renderPendingOpsBadge();
  syncInvestmentEstimateModeUi();
  renderSyncSettingsPanel();
  renderSettingsPanelTabs();
  syncRefreshButtonLabel("registrar");
  refreshData({ scope: "all", cacheOnly: true });
  ensureOpQueuePoller();
  window.setTimeout(() => retryPendingOps(null, { recoverSending: true }), 0);
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
  document.getElementById("refreshBtn").addEventListener("click", refreshActiveViewData);
  document.getElementById("investmentUpdatePricesBtn")?.addEventListener("click", updateInvestmentPricesFromHeader);
  document.getElementById("investmentSendNotificationsBtn")?.addEventListener("click", sendInvestmentNotificationsFromHeader);
  document.getElementById("movementForm").addEventListener("submit", submitMovement);
  document.getElementById("registerModeSwitch").addEventListener("click", setRegisterModeFromClick);
  document.getElementById("recurrenceType").addEventListener("change", renderRecurrencePicker);
  document.getElementById("movementModeSwitch").addEventListener("click", setMovementModeFromClick);
  document.getElementById("investmentPanelSwitch").addEventListener("click", setInvestmentPanelFromClick);
  document.getElementById("settingsPanelSwitch")?.addEventListener("click", setSettingsPanelFromClick);
  document.getElementById("editInvestmentGoalsBtn").addEventListener("click", editInvestmentGoals);
  document.getElementById("evolutionStartMonth")?.addEventListener("change", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEndMonth")?.addEventListener("change", saveEvolutionRangeAndRender);
  document.getElementById("evolutionSnapshotDay")?.addEventListener("change", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEstimateIncome")?.addEventListener("change", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEstimateExpense")?.addEventListener("change", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEstimateInvestment")?.addEventListener("change", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEstimateIncome")?.addEventListener("input", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEstimateExpense")?.addEventListener("input", saveEvolutionRangeAndRender);
  document.getElementById("evolutionEstimateInvestment")?.addEventListener("input", saveEvolutionRangeAndRender);
  document.getElementById("closeInvestmentGoalsBtn")?.addEventListener("click", () => document.getElementById("investmentGoalsDialog").close());
  document.getElementById("investmentGoalsForm")?.addEventListener("submit", saveInvestmentGoalsFromDialog);
  document.getElementById("themeToggle")?.addEventListener("change", setThemeFromToggle);
  document.getElementById("investmentEstimateToggle")?.addEventListener("change", setInvestmentEstimateModeFromToggle);
  document.getElementById("editInvestmentEstimateRulesBtn")?.addEventListener("click", openInvestmentEstimateRulesDialog);
  document.getElementById("clearInvestmentEstimatesBtn")?.addEventListener("click", clearInvestmentEstimates);
  document.getElementById("closeInvestmentEstimateRulesBtn")?.addEventListener("click", () => document.getElementById("investmentEstimateRulesDialog")?.close());
  document.getElementById("addInvestmentEstimateRuleBtn")?.addEventListener("click", addInvestmentEstimateRule);
  document.getElementById("saveInvestmentEstimateRulesBtn")?.addEventListener("click", saveInvestmentEstimateRules);
  document.getElementById("formType").addEventListener("change", syncRegistrarMode);
  document.getElementById("formAmount")?.addEventListener("input", enforceTransferPositiveAmount);
  document.getElementById("formAmount")?.addEventListener("change", enforceTransferPositiveAmount);
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfigFromForm);
  document.getElementById("retryPendingOpsBtn")?.addEventListener("click", () => retryPendingOps());
  document.getElementById("clearSyncLogsBtn")?.addEventListener("click", clearSyncLogs);
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
  document.getElementById("movementBulkEditBtn").addEventListener("click", toggleMovementBulkEdit);
  document.getElementById("movementBulkDeleteBtn").addEventListener("click", deleteSelectedMovements);
  document.getElementById("addInvestmentRowBtn").addEventListener("click", addInvestmentRow);
  document.getElementById("saveInvestmentsBtn")?.classList.add("hidden");
  document.getElementById("saveInvestmentsBtn")?.addEventListener("click", saveInvestments);
  ensureInvestmentCategoryDialog();
  document.getElementById("formDescription").addEventListener("input", suggestTypeConceptFromDescription);
  document.getElementById("closeMovementDetailBtn").addEventListener("click", () => document.getElementById("movementDetailDialog").close());
  document.getElementById("movementDetailForm").addEventListener("submit", saveMovementDetail);
  document.getElementById("deleteMovementBtn").addEventListener("click", deleteMovementDetail);
  document.getElementById("movementDeleteAccountForm")?.addEventListener("submit", confirmMovementDeleteAccount);
  document.getElementById("closeMovementDeleteAccountBtn")?.addEventListener("click", closeMovementAccountPrompt);
  document.getElementById("closeMovementTableControlBtn")?.addEventListener("click", () => document.getElementById("movementTableControlDialog").close());
  document.getElementById("closeAccountManageBtn")?.addEventListener("click", () => document.getElementById("accountManageDialog").close());
  document.getElementById("accountManageForm")?.addEventListener("submit", submitAccountManage);
  document.getElementById("accountManageDeleteBtn")?.addEventListener("click", deleteAccountManage);
  document.getElementById("closeAccountGroupBtn")?.addEventListener("click", () => document.getElementById("accountGroupDialog").close());
  document.getElementById("accountGroupForm")?.addEventListener("submit", submitAccountGroup);
  document.getElementById("accountGroupDeleteBtn")?.addEventListener("click", deleteAccountGroup);
  document.getElementById("movementTableControlSort")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-table-sort]");
    if (!btn) return;
    const alreadyActive = btn.classList.contains("active");
    document.querySelectorAll("#movementTableControlSort [data-table-sort]").forEach(b => b.classList.remove("active"));
    if (!alreadyActive) btn.classList.add("active");
  });
  document.getElementById("clearMovementTableControlBtn")?.addEventListener("click", () => {
    document.querySelectorAll("#movementTableControlSort [data-table-sort]").forEach(b => b.classList.remove("active"));
    document.getElementById("movementTableControlFilter").value = "";
  });
  document.getElementById("movementTableControlForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const dialog = document.getElementById("movementTableControlDialog");
    const column = dialog.__column;
    const rows = dialog.__rows;
    const sortBtn = document.querySelector("#movementTableControlSort [data-table-sort].active");
    const filter = document.getElementById("movementTableControlFilter").value.trim();
    if (!sortBtn && !filter) {
      state.tableControls.movement = {};
    } else {
      state.tableControls.movement = { column };
      if (sortBtn) state.tableControls.movement.sort = sortBtn.dataset.tableSort;
      if (filter) state.tableControls.movement.filter = filter;
    }
    dialog.close();
    renderMovementTable(rows);
  });
  document.getElementById("closeInvestmentDetailBtn").addEventListener("click", () => document.getElementById("investmentDetailDialog").close());
  document.getElementById("deleteInvestmentBtn")?.addEventListener("click", deleteInvestmentDetail);
  document.getElementById("investmentDetailForm").addEventListener("submit", saveInvestmentDetail);
  document.getElementById("editInvestmentQuantity")?.addEventListener("input", syncInvestmentDetailComputedTotal);
  document.getElementById("editInvestmentName")?.addEventListener("input", syncInvestmentDetailInputLocks);
  document.getElementById("editInvestmentData")?.addEventListener("input", syncInvestmentDetailInputLocks);
  document.getElementById("closeMovementPopupBtn")?.addEventListener("click", () => { document.getElementById("movementPopup").close(); processPendingInvestmentAllocationPrompts(); });
  document.getElementById("movementPopup")?.addEventListener("close", processPendingInvestmentAllocationPrompts);
  document.getElementById("discardInvestmentAllocationBtn")?.addEventListener("click", discardInvestmentAllocationPrompt);
  document.getElementById("investmentAllocationDialog")?.addEventListener("close", handleInvestmentAllocationDialogClosed);
  document.getElementById("addExistingInvestmentAllocationRowBtn")?.addEventListener("click", addExistingInvestmentAllocationRow);
  document.getElementById("addNewInvestmentAllocationRowBtn")?.addEventListener("click", addBlankInvestmentAllocationRow);
  document.getElementById("investmentAllocationForm")?.addEventListener("submit", saveInvestmentAllocationPrompt);
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
  document.getElementById("investmentOverviewMode")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-investment-overview-mode]");
    if (!btn) return;
    state.summaryModes.investmentOverviewMode = btn.dataset.investmentOverviewMode;
    renderInvestmentBreakdownCharts(calculateSummary(getSelectedSummaryMonth()));
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
  if (id === "movimientos") {
    const now = new Date();
    state.movementDrill = { level: "entries", year: String(now.getFullYear()), month: currentMonthKey() };
  }
  syncRegistrarActionButton();
  syncInvestmentHeaderActions(id);
  syncRefreshButtonLabel(id);
  document.getElementById("viewTitle").textContent = {
    registrar: "Registrar",
    resumen: "Resumen",
    movimientos: "Movimientos",
    inversiones: "Inversiones",
    ajustes: "Ajustes"
  }[id] || "MoneyManagement";
  renderCurrentView(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncInvestmentHeaderActions(activeViewId = "") {
  const show = activeViewId === "inversiones";
  document.getElementById("investmentUpdatePricesBtn")?.classList.toggle("hidden", !show);
  document.getElementById("investmentSendNotificationsBtn")?.classList.toggle("hidden", !show);
}

function activeViewId() {
  return document.querySelector(".view.active")?.id || "registrar";
}

function refreshScopeForView(id = activeViewId()) {
  if (id === "movimientos") return "movements";
  if (id === "inversiones") return "investments";
  if (id === "resumen") return "summary";
  if (id === "ajustes") return "all";
  return "all";
}

function refreshLabelForScope(scope, viewId = activeViewId()) {
  return "Actualizar";
}

function syncRefreshButtonLabel(viewId = activeViewId()) {
  const btn = document.getElementById("refreshBtn");
  if (!btn) return;
  const scope = refreshScopeForView(viewId);
  const isFullDownload = viewId === "ajustes";
  const label = isFullDownload ? "Forzar descarga completa ALL desde Sheets" : refreshLabelForScope(scope, viewId);
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.classList.toggle("refresh-all", isFullDownload);
  btn.querySelector(".refresh-all-label")?.classList.toggle("hidden", !isFullDownload);
}

function refreshActiveViewData() {
  const viewId = activeViewId();
  if (viewId === "ajustes") return forceFullRefreshFromSettings();
  if (viewId === "registrar") return compareLocalWithSheets();

  const scope = refreshScopeForView(viewId);
  const successByScope = {
    movements: "Movimientos descargados desde Sheets.",
    investments: "Inversiones descargadas desde Sheets.",
    summary: "Resumen descargado desde Sheets."
  };
  return refreshData({
    force: true,
    manualRefresh: true,
    disableIncremental: true,
    showProgress: true,
    userRefresh: true,
    cacheOnly: true,
    scope,
    successMessage: successByScope[scope] || "Vista actualizada desde Sheets."
  });
}

function forceFullRefreshFromSettings() {
  return refreshData({
    force: true,
    manualRefresh: true,
    disableIncremental: true,
    scope: "all",
    showProgress: true,
    successMessage: "Descarga completa ALL realizada desde Sheets."
  });
}

async function compareLocalWithSheets() {
  setRefreshLoading(true);
  setSyncStatus("Comparando local con Sheets", "");
  try {
    const cached = readDataCache();
    if (cached) {
      state.cacheMeta = normalizeCacheMeta(cached);
      applyDataSnapshot(cached.data);
      syncOptions();
      renderDataScope("all");
    }
    if (!state.config.scriptUrl) {
      setNotice("Configura la URL de Apps Script para comparar con Sheets.", "warn");
      setSyncStatus("Falta URL de Apps Script", "warn");
      return false;
    }
    if (pendingOpsCount() > 0) {
      setNotice("Hay cambios pendientes de subir; primero reintenta/envía la cola antes de comparar con Sheets.", "warn");
      setSyncStatus("Cambios pendientes", "warn");
      logSyncEvent("Comparación rápida omitida: hay cambios pendientes de subir.", "warn");
      return false;
    }
    const remote = await fetchAppsScriptData({ action: "quickStatus" });
    assertPayloadOk(remote);
    const local = buildLocalQuickStatus();
    const differences = quickStatusDifferences(local, remote.status || {});
    if (differences.length) {
      setNotice(lineMessage("Se necesita revisar/actualizar:", ...differences), "warn");
      setSyncStatus("Descuadres detectados", "warn");
      logSyncEvent(`Comparación rápida con descuadres: ${differences.join(" | ")}`, "warn");
    } else {
      setNotice("Comparación rápida correcta: local y Sheets cuadran.", "ok");
      setSyncStatus("Local y Sheets cuadran", "ok");
      logSyncEvent("Comparación rápida correcta: local y Sheets cuadran.", "ok");
    }
    renderSyncSettingsPanel();
    window.setTimeout(() => setSyncStatus("", ""), 2500);
    return true;
  } catch (error) {
    console.error(error);
    setNotice(lineMessage("No se pudo comparar con Sheets.", error.message), "warn");
    setSyncStatus("Error al comparar", "warn");
    logSyncEvent("Error en comparación rápida.", "warn", error.message || String(error));
    return false;
  } finally {
    setRefreshLoading(false);
    kickOpQueue();
  }
}

function buildLocalQuickStatus() {
  const investmentTotalsValue = sum((state.investmentTotals || []).map(item => safeNumber(item.value ?? item.total ?? 0)));
  const investmentsValue = sum((state.investments || []).map(item => safeNumber(item.total ?? currentInvestmentTotal(item))));
  return {
    transactionsCount: state.transactions.length,
    futureTransactionsCount: state.futureTransactions.length,
    banksCount: state.banks.length,
    banksTotal: roundMoney(sum(state.banks.map(bank => bank.dinero))),
    investmentsCount: state.investments.length,
    investmentTotalsValue: roundMoney(investmentTotalsValue || investmentsValue)
  };
}

function quickStatusDifferences(local, remote) {
  const checks = [
    ["Movimientos", "transactionsCount", 0],
    ["Movimientos futuros", "futureTransactionsCount", 0],
    ["Cuentas", "banksCount", 0],
    ["Total bancos", "banksTotal", 0.01],
    ["Inversiones", "investmentsCount", 0],
    ["Valor inversiones", "investmentTotalsValue", 0.01]
  ];
  return checks.flatMap(([label, key, tolerance]) => {
    const localValue = Number(local[key] || 0);
    const remoteValue = Number(remote[key] || 0);
    return Math.abs(localValue - remoteValue) > tolerance
      ? [`${label}: local ${formatQuickStatusValue(localValue)} · Sheets ${formatQuickStatusValue(remoteValue)}`]
      : [];
  });
}

function formatQuickStatusValue(value) {
  return Number.isInteger(value) ? String(value) : money(value);
}

async function updateInvestmentPricesFromHeader() {
  const btn = document.getElementById("investmentUpdatePricesBtn");
  btn?.classList.add("saving");
  btn.disabled = true;

  const ok = await refreshData({
    force: true,
    updateInvestments: true,
    scope: "investments",
    successMessage: "Precios actualizados y caché de inversiones renovada."
  });

  btn?.classList.remove("saving");
  btn?.classList.toggle("saved", ok);
  btn.disabled = false;

  if (ok) {
    window.setTimeout(() => btn?.classList.remove("saved"), 2200);
  }
}

async function sendInvestmentNotificationsFromHeader() {
  if (state.investmentNotificationsSending) return false;
  state.investmentNotificationsSending = true;
  const btn = document.getElementById("investmentSendNotificationsBtn");
  btn?.classList.add("saving");
  btn.disabled = true;
  const notificationRequestId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `notification_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  setRefreshLoading(true);
  setSyncStatus("Enviando notificaciones", "");

  try {
    const payload = await fetchAppsScriptData({ action: "sendDailyNotifications", notificationRequestId });
    assertPayloadOk(payload);
    setNotice("Notificaciones enviadas con los datos actuales de Google Sheets.", "ok");
    setSyncStatus("Notificaciones enviadas", "ok");

    btn?.classList.remove("saving");
    btn?.classList.add("saved");
    window.setTimeout(() => btn?.classList.remove("saved"), 2200);

    window.setTimeout(() => setSyncStatus("", ""), 2500);
    return true;
  } catch (error) {
    console.error(error);
    setNotice(lineMessage("No se pudieron enviar las notificaciones.", error.message), "warn");
    setSyncStatus("Error al notificar", "warn");
    btn?.classList.remove("saving", "saved");
    return false;
  } finally {
    state.investmentNotificationsSending = false;
    btn.disabled = false;
    setRefreshLoading(false);
    kickOpQueue();
  }
}

function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem("moneyConfig") || "{}");
    return {
      ...DEFAULT_CONFIG,
      scriptUrl: raw.scriptUrl || DEFAULT_CONFIG.scriptUrl,
      appToken: raw.appToken || DEFAULT_CONFIG.appToken,
      movementSheet: raw.movementSheet || DEFAULT_CONFIG.movementSheet,
      futureMovementSheet: raw.futureMovementSheet || DEFAULT_CONFIG.futureMovementSheet,
      investmentSheet: raw.investmentSheet || DEFAULT_CONFIG.investmentSheet,
      investmentTotalsSheet: raw.investmentTotalsSheet || DEFAULT_CONFIG.investmentTotalsSheet,
      investmentEstimateRulesSheet: raw.investmentEstimateRulesSheet || DEFAULT_CONFIG.investmentEstimateRulesSheet,
      investmentEstimateLedgerSheet: raw.investmentEstimateLedgerSheet || DEFAULT_CONFIG.investmentEstimateLedgerSheet,
      bankSheet: raw.bankSheet || DEFAULT_CONFIG.bankSheet,
      objectiveSheet: raw.objectiveSheet || DEFAULT_CONFIG.objectiveSheet,
      dataSheet: raw.dataSheet || DEFAULT_CONFIG.dataSheet,
      initialCash: DEFAULT_CONFIG.initialCash
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function hydrateConfigForm() {
  document.getElementById("configScriptUrl").value = state.config.scriptUrl;
  document.getElementById("configAppToken").value = state.config.appToken;
  document.getElementById("configMovementSheet").value = state.config.movementSheet;
  document.getElementById("configFutureMovementSheet").value = state.config.futureMovementSheet || "Movimientos futuros";
  document.getElementById("configInvestmentSheet").value = state.config.investmentSheet;
  document.getElementById("configBankSheet").value = state.config.bankSheet || "Bancos";
  document.getElementById("configDataSheet").value = state.config.dataSheet;
  document.getElementById("configInitialCash").value = state.config.initialCash;
}

async function saveConfigFromForm() {
  const btn = document.getElementById("saveConfigBtn");
  markButtonSaving(btn);
  state.config = {
    scriptUrl: document.getElementById("configScriptUrl").value.trim(),
    appToken: document.getElementById("configAppToken").value.trim(),
    movementSheet: document.getElementById("configMovementSheet").value.trim() || "Control Finanzas",
    futureMovementSheet: document.getElementById("configFutureMovementSheet").value.trim() || "Movimientos futuros",
    investmentSheet: document.getElementById("configInvestmentSheet").value.trim() || "Inversiones",
    investmentTotalsSheet: state.config.investmentTotalsSheet || "Inversión Totales",
    investmentEstimateRulesSheet: state.config.investmentEstimateRulesSheet || "Inversiones Estimación Reglas",
    investmentEstimateLedgerSheet: state.config.investmentEstimateLedgerSheet || "Inversiones Estimación Movimientos",
    bankSheet: document.getElementById("configBankSheet").value.trim() || "Bancos",
    objectiveSheet: state.config.objectiveSheet || "Objetivos",
    dataSheet: document.getElementById("configDataSheet").value.trim() || "Datos",
    initialCash: DEFAULT_CONFIG.initialCash
  };
  localStorage.setItem("moneyConfig", JSON.stringify(state.config));
  clearDataCache();
  clearPendingCache();
  await refreshData({ force: true, scope: refreshScopeForView(activeViewId()) });
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


function loadInvestmentEstimateMode() {
  return localStorage.getItem(INVESTMENT_ESTIMATE_MODE_KEY) === "estimated" ? "estimated" : "real";
}

function investmentEstimateEnabled() {
  return state.investmentMode === "estimated";
}

function applySavedInvestmentEstimateMode() {
  state.investmentMode = loadInvestmentEstimateMode();
  syncInvestmentEstimateModeUi();
}

function syncInvestmentEstimateModeUi() {
  const enabled = investmentEstimateEnabled();
  const toggle = document.getElementById("investmentEstimateToggle");
  if (toggle) toggle.checked = enabled;
  const label = document.getElementById("investmentEstimateModeLabel");
  if (label) label.textContent = enabled ? "Usando posiciones reales + estimaciones" : "Usando solo posiciones reales";
  document.documentElement.dataset.investmentMode = enabled ? "estimated" : "real";
}

function setInvestmentEstimateModeFromToggle(event) {
  state.investmentMode = event.target.checked ? "estimated" : "real";
  localStorage.setItem(INVESTMENT_ESTIMATE_MODE_KEY, state.investmentMode);
  syncInvestmentEstimateModeUi();
  refreshChartTheme();
  setNotice(state.investmentMode === "estimated" ? "Modo estimación activado." : "Modo real activado.", "ok", 1800);
  saveInvestmentModePreference();
}

function saveInvestmentModePreference() {
  if (!state.config.scriptUrl) return;
  queueOp({ action: "saveInvestmentModePreference", investmentMode: state.investmentMode });
  logSyncEvent(`Modo de inversión actualizado en local y enviado para notificaciones: ${state.investmentMode}.`, "ok");
}

function refreshChartTheme() {
  Object.values(state.charts).forEach(chart => chart.destroy());
  state.charts = {};
  renderCurrentView(activeViewId());
}

function setDefaultDate() {
  document.getElementById("formDate").value = formatDate(new Date());
}

function syncStatusStep(showProgress, message, type = "") {
  if (showProgress) setSyncStatus(message, type);
}

function cacheSectionsForScope(scope = "all") {
  if (scope === "movements") return ["transactions", "futureTransactions", "banks"];
  if (scope === "investments") return ["investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "investmentGoals", "categories"];
  if (scope === "summary") return ["transactions", "futureTransactions", "investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "banks", "investmentGoals", "categories"];
  if (scope === "banks") return ["banks"];
  return [...CACHE_SECTION_KEYS];
}

function defaultCacheMeta() {
  return {
    version: DATA_CACHE_VERSION,
    savedAt: 0,
    sections: Object.fromEntries(CACHE_SECTION_KEYS.map(section => [section, { rev: "", savedAt: 0, dirty: false }]))
  };
}

function normalizeCacheMeta(cached = {}) {
  const base = defaultCacheMeta();
  const meta = cached.meta || {};
  const savedAt = Number(meta.savedAt || cached.savedAt || 0) || 0;
  CACHE_SECTION_KEYS.forEach(section => {
    const current = meta.sections?.[section] || {};
    base.sections[section] = {
      rev: String(current.rev || ""),
      savedAt: Number(current.savedAt || savedAt || 0) || 0,
      dirty: Boolean(current.dirty)
    };
  });
  base.savedAt = savedAt;
  return base;
}

function touchCacheSections(sections = [], dirty = false) {
  const meta = normalizeCacheMeta({ meta: state.cacheMeta, savedAt: Date.now() });
  sections.forEach(section => {
    if (!meta.sections[section]) return;
    meta.sections[section] = {
      ...meta.sections[section],
      savedAt: Date.now(),
      dirty
    };
  });
  meta.savedAt = Date.now();
  state.cacheMeta = meta;
}

function markCacheSectionsDirty(...sections) {
  touchCacheSections(sections.flat().filter(Boolean), true);
}

function markCacheSectionsSynced(sections = []) {
  touchCacheSections(sections, false);
}

function cachedSectionIsDirty(cached, section) {
  return Boolean(cached?.meta?.sections?.[section]?.dirty || state.cacheMeta?.sections?.[section]?.dirty);
}

function cacheAgeMs(cached) {
  return Date.now() - Number(cached?.savedAt || cached?.meta?.savedAt || 0);
}

function cacheIsStale(cached) {
  return Boolean(cached && cacheAgeMs(cached) >= DATA_CACHE_TTL_MS);
}

function hasAnyLoadedData() {
  return Boolean(
    state.transactions.length ||
    state.futureTransactions.length ||
    state.investments.length ||
    state.investmentTotals.length ||
    state.banks.length
  );
}

function staleCacheMessage(cached) {
  return `Datos locales cargados (${formatCacheAge(cacheAgeMs(cached))}). La caché supera 7 días; descarga desde Ajustes solo si quieres reemplazarla desde Sheets.`;
}

function renderCurrentView(viewId = activeViewId()) {
  if (viewId === "registrar") {
    syncRegisterMode();
    renderRegistrarSummaryCompact();
    renderFutureDueNotice();
  } else if (viewId === "resumen") {
    renderSummary();
  } else if (viewId === "movimientos") {
    renderFutureDueNotice();
    renderMovements();
  } else if (viewId === "inversiones") {
    renderInvestments();
  } else if (viewId === "ajustes") {
    syncInvestmentEstimateModeUi();
    renderSyncSettingsPanel();
    renderPendingOpsBadge();
  }
  lucide.createIcons();
}

function renderDataScope(scope = "all") {
  renderCurrentView(activeViewId());
}

async function downloadMovementSectionOptimized(kind, section, label, cached, options = {}) {
  return downloadMovementPages(kind, label, { showProgress: options.showProgress });
}

function syncedSectionsFromData(data = {}) {
  const sections = [];
  if (Object.prototype.hasOwnProperty.call(data, "transactions")) sections.push("transactions");
  if (Object.prototype.hasOwnProperty.call(data, "futureTransactions")) sections.push("futureTransactions");
  if (Object.prototype.hasOwnProperty.call(data, "investments")) sections.push("investments");
  if (Object.prototype.hasOwnProperty.call(data, "investmentTotals")) sections.push("investmentTotals");
  if (Object.prototype.hasOwnProperty.call(data, "investmentEstimateRules")) sections.push("investmentEstimateRules");
  if (Object.prototype.hasOwnProperty.call(data, "investmentEstimateLedger")) sections.push("investmentEstimateLedger");
  if (Object.prototype.hasOwnProperty.call(data, "banks")) sections.push("banks");
  if (Object.prototype.hasOwnProperty.call(data, "investmentGoals")) sections.push("investmentGoals");
  if (Object.prototype.hasOwnProperty.call(data, "categories")) sections.push("categories");
  return sections;
}

async function refreshData(options = {}) {
  const force = Boolean(options.force);
  const updateInvestments = Boolean(options.updateInvestments);
  const sendNotifications = Boolean(options.sendNotifications);
  const scope = options.scope || (updateInvestments || sendNotifications ? "investments" : "all");
  const isFullDownload = scope === "all";
  const showProgress = Boolean(options.showProgress || force || updateInvestments || sendNotifications);
  const requestedSections = cacheSectionsForScope(scope);
  const manualRefresh = Boolean(options.manualRefresh);
  const userRefresh = Boolean(options.userRefresh);
  const forceRequestedSections = force || manualRefresh;
  setRefreshLoading(true);
  syncStatusStep(showProgress, refreshStartStatus({ scope, updateInvestments, sendNotifications }), "");

  const cached = readDataCache();
  if (cached) {
    state.cacheMeta = normalizeCacheMeta(cached);
    applyDataSnapshot(cached.data);
    syncOptions();
    renderDataScope(scope);
    if (cacheIsStale(cached) && !force && !updateInvestments && !sendNotifications) {
      setNotice(staleCacheMessage(cached), "warn");
    }
  }

  const previousFutureTransactions = state.futureTransactions.map(serializeTransaction);
  const dueFutureMovementsFromCache = findDueFutureMovements(cached?.data?.futureTransactions || state.futureTransactions || []);
  const shouldMoveDueFutureMovements = Boolean(scope !== "investments" && scope !== "banks" && dueFutureMovementsFromCache.length);

  if (cached && options.cacheOnly && !force && !updateInvestments && !sendNotifications && !shouldMoveDueFutureMovements) {
    setNotice(
      cacheIsStale(cached)
        ? staleCacheMessage(cached)
        : (options.successMessage || `Datos cargados desde caché (${formatCacheAge(cacheAgeMs(cached))}).`),
      cacheIsStale(cached) ? "warn" : "ok"
    );
    syncStatusStep(showProgress, cacheIsStale(cached) ? "Caché local antigua" : "Caché local cargada", cacheIsStale(cached) ? "warn" : "ok");
    logSyncEvent("Inicio desde caché local; sin comprobar manifiesto ni descargar Sheets.", cacheIsStale(cached) ? "warn" : "ok");
    renderSyncSettingsPanel();
    setRefreshLoading(false);
    return true;
  }

  if (cached && !state.config.scriptUrl && !force && !shouldMoveDueFutureMovements) {
    setNotice(
      cacheIsStale(cached)
        ? staleCacheMessage(cached)
        : `Datos cargados desde caché (${formatCacheAge(cacheAgeMs(cached))}).`,
      cacheIsStale(cached) ? "warn" : "ok"
    );
    setRefreshLoading(false);
    return true;
  }

  const loadingText = sendNotifications
    ? "Enviando notificaciones..."
    : updateInvestments
      ? "Actualizando precios y solo inversiones..."
      : manualRefresh && scope === "all"
        ? "Descargando todo desde Sheets..."
        : manualRefresh && scope === "movements"
          ? "Descargando solo movimientos desde Sheets..."
          : manualRefresh && scope === "investments"
            ? "Descargando solo inversiones desde Sheets..."
            : manualRefresh && scope === "summary"
              ? "Descargando datos de resumen desde Sheets..."
              : userRefresh && scope === "all"
                ? "Comprobando cambios rápidos..."
                : userRefresh && scope === "movements"
                  ? "Comprobando movimientos..."
                  : userRefresh && scope === "investments"
                    ? "Comprobando inversiones..."
                    : userRefresh && scope === "summary"
                      ? "Comprobando resumen..."
              : scope === "movements"
                ? "Actualizando solo movimientos..."
                : scope === "investments"
                  ? "Actualizando solo inversiones..."
                  : scope === "summary"
                    ? "Actualizando resumen por secciones..."
                    : "Actualizando datos por secciones...";
  if (force || userRefresh || !cached || shouldMoveDueFutureMovements) setNotice(loadingText, "");
  logSyncEvent(refreshStartStatus({ scope, updateInvestments, sendNotifications }).replace(/\n/g, " · "), "");

  if (!ENABLE_TEST_MODE && !state.config.scriptUrl) {
    syncOptions();
    renderDataScope(scope);
    setNotice("Configura la URL de Apps Script en Ajustes para sincronizar con Google Sheets.", "warn");
    syncStatusStep(showProgress, "Falta URL de Apps Script", "warn");
    setRefreshLoading(false);
    return false;
  }

  try {
    const shouldFlushPending = updateInvestments || sendNotifications;
    syncStatusStep(showProgress && shouldFlushPending, "Enviando cambios pendientes", "");
    const flushedPending = shouldFlushPending ? await flushPendingChangesBeforeDownload() : [];
    const queuedPendingFlushed = await flushOpQueueBeforeDownload({ showProgress });
    flushedPending.push(...queuedPendingFlushed);
    let freshData = {};
    let movedFutureMovements = [];
    let syncedSections = [];

    let neededSections = updateInvestments || sendNotifications
      ? ["investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "investmentGoals"]
      : !cached || forceRequestedSections
        ? requestedSections.filter(section => !cachedSectionIsDirty(cached, section))
        : [];

    if (shouldMoveDueFutureMovements) {
      neededSections = forceRequestedSections
        ? unique([...neededSections, "transactions", "futureTransactions", "banks"])
        : unique([...neededSections, "banks", "investmentTotals"]);
      setNotice(`Hay ${dueFutureMovementsFromCache.length} movimiento(s) futuro(s) vencido(s). Los muevo y actualizo lo necesario...`, "warn");
    }

    if (cached && neededSections.length && !forceRequestedSections && !updateInvestments && !sendNotifications && !shouldMoveDueFutureMovements) {
      const changedLabels = neededSections.map(formatCacheSectionName).join(", ");
      syncOptions();
      renderDataScope(scope);
      setNotice(lineMessage(
        `Sheets indica cambios en: ${changedLabels}.`,
        "Mantengo la caché local intacta; usa la descarga completa de Ajustes solo si quieres reemplazarla desde Sheets."
      ), "warn");
      syncStatusStep(showProgress, "Diferencias detectadas\nCaché local conservada", "warn");
      logSyncEvent(`Diferencias detectadas sin descarga automática: ${changedLabels}.`, "warn");
      renderSyncSettingsPanel();
      if (showProgress) window.setTimeout(() => setSyncStatus("", ""), 2500);
      return true;
    }

    if (ENABLE_TEST_MODE) {
      syncStatusStep(showProgress, "Modo prueba\nPreparando datos locales", "");
      freshData = {
        transactions: [...TEST_TRANSACTIONS],
        futureTransactions: [],
        investments: [...TEST_INVESTMENTS],
        investmentGoals: state.investmentGoals,
        investmentTotals: [],
        banks: [
          { rowNumber: 2, cuenta: "Santander-Cuenta", dinero: 2400 },
          { rowNumber: 3, cuenta: "Revolut-Ahorro", dinero: 1300 }
        ],
        categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS, investmentTypes: INVESTMENT_TYPES }
      };
      syncedSections = [...CACHE_SECTION_KEYS];
    } else if (sendNotifications) {
      syncStatusStep(showProgress, "Enviando notificaciones", "");
      const payload = await fetchAppsScriptData({ action: "sendDailyNotifications" });
      assertPayloadOk(payload);
    } else if (!neededSections.length && cached) {
      syncOptions();
      renderDataScope(scope);
      setNotice(options.successMessage || `Datos cargados desde caché (${formatCacheAge(cacheAgeMs(cached))}).`, cacheIsStale(cached) ? "warn" : "ok");
      syncStatusStep(showProgress, cacheIsStale(cached) ? "Caché antigua" : "Usando caché", cacheIsStale(cached) ? "warn" : "ok");
      logSyncEvent("Se mantiene caché local; sin manifiesto ni descarga automática.", cacheIsStale(cached) ? "warn" : "ok");
      renderSyncSettingsPanel();
      if (showProgress) window.setTimeout(() => setSyncStatus("", ""), 1800);
      return true;
    } else {
      const needsMovements = neededSections.some(section => ["transactions", "futureTransactions"].includes(section));
      const needsCore = neededSections.some(section => ["investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "banks", "investmentGoals", "categories"].includes(section));
      const onlyInvestments = neededSections.every(section => ["investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "investmentGoals", "categories"].includes(section));

      if (updateInvestments || (onlyInvestments && !needsMovements)) {
        syncStatusStep(showProgress, investmentRequestStatus({ updateInvestments, sendNotifications }), "");
        const payload = await fetchAppsScriptData({ updateInvestments, scope: "investments" });
        assertPayloadOk(payload);
        freshData = {
          ...freshData,
          investments: payload.investments || [],
          investmentGoals: payload.investmentGoals ?? state.investmentGoals,
          investmentTotals: payload.investmentTotals || state.investmentTotals,
          investmentEstimateRules: payload.investmentEstimateRules || state.investmentEstimateRules,
          investmentEstimateLedger: payload.investmentEstimateLedger || state.investmentEstimateLedger
        };
      } else {
        let core = null;
        if (needsCore || shouldMoveDueFutureMovements) {
          const coreAction = shouldMoveDueFutureMovements ? "moveDueFutureMovements" : "downloadCoreData";
          syncStatusStep(showProgress, shouldMoveDueFutureMovements ? "Moviendo futuros vencidos\nDescargando datos base" : "Descargando datos base", "");
          core = await fetchAppsScriptData({ action: coreAction });
          assertPayloadOk(core);
          movedFutureMovements = core.movedFutureMovements || [];
          freshData = {
            ...freshData,
            investments: core.investments || state.investments,
            banks: core.banks || state.banks,
            investmentGoals: core.investmentGoals ?? state.investmentGoals,
            investmentTotals: core.investmentTotals || state.investmentTotals,
            investmentEstimateRules: core.investmentEstimateRules || state.investmentEstimateRules,
            investmentEstimateLedger: core.investmentEstimateLedger || state.investmentEstimateLedger,
            categories: core.categories || state.categories
          };
        }
        const movementReconciliationNeeded = shouldMoveDueFutureMovements && !movedFutureMovements.length;
        if (needsMovements || movementReconciliationNeeded) {
          syncStatusStep(showProgress, movementReconciliationNeeded ? "Reconciliando movimientos" : "Descargando movimientos", "");
          const movementDownloads = [];
          if (neededSections.includes("transactions") || movementReconciliationNeeded) {
            movementDownloads.push(downloadMovementSectionOptimized("realized", "transactions", "movimientos", cached, { showProgress, disableIncremental: true }));
          } else {
            movementDownloads.push(Promise.resolve(null));
          }
          if (neededSections.includes("futureTransactions") || movementReconciliationNeeded) {
            movementDownloads.push(downloadMovementSectionOptimized("future", "futureTransactions", "movimientos futuros", cached, { showProgress, disableIncremental: true }));
          } else {
            movementDownloads.push(Promise.resolve(null));
          }
          const [transactions, futureTransactions] = await Promise.all(movementDownloads);
          if (transactions) freshData.transactions = transactions;
          if (futureTransactions) freshData.futureTransactions = futureTransactions;
        }
      }
    }

    const fallbackFutureTransactions = cached?.data?.futureTransactions?.length ? cached.data.futureTransactions : previousFutureTransactions;
    if (movedFutureMovements.length && !freshData.futureTransactions?.length && fallbackFutureTransactions.length) {
      freshData.futureTransactions = fallbackFutureTransactions.filter(fallbackMovement => {
        const cachedSignature = futureMovementSignature(fallbackMovement);
        return !movedFutureMovements.some(movedMovement => futureMovementSignature(movedMovement) === cachedSignature);
      });
    }

    syncStatusStep(showProgress, "Actualizando pantalla\nGuardando caché", "");
    if (Object.keys(freshData).length) {
      if (isFullDownload && syncedSectionsFromData(freshData).length === CACHE_SECTION_KEYS.length) applyDataSnapshot(freshData);
      else mergeDataSnapshot(freshData);
      syncedSections = unique([...syncedSections, ...syncedSectionsFromData(freshData)]);
    }

    if (pendingOpsCount() === 0) {
      if (isFullDownload && syncedSections.length === CACHE_SECTION_KEYS.length) clearPendingCache();
      else if (syncedSections.includes("investments")) dropPendingSections("investments", "investmentTotals", "investmentEstimateRules", "investmentEstimateLedger", "investmentGoals");
      else if (syncedSections.includes("transactions")) dropPendingSections("transactions");
    }

    if (movedFutureMovements.length) {
      ensureMovedFutureMovementsVisible(movedFutureMovements);
      syncedSections = unique([
        ...syncedSections,
        "transactions",
        "futureTransactions",
        "banks",
        "investmentTotals"
      ]);
      state.pendingInvestmentSummaryPopup = {
        title: "Futuros movidos a realizados",
        movement: null,
        account: "",
        extra: movedFutureMovementsPopupHtml(movedFutureMovements)
      };
      scheduleInvestmentAllocationForRegistration(movedFutureMovements, { source: "futuro", respectDay: true });
    }

    markCacheSectionsSynced(syncedSections);
    syncOptions();
    renderDataScope(scope);
    writeDataCache({ syncedSections });
    const defaultSuccess = sendNotifications
      ? "Notificaciones enviadas."
      : updateInvestments
        ? "Precios actualizados y caché de inversiones renovada."
        : scope === "movements"
          ? "Movimientos actualizados por bloques."
          : scope === "investments"
            ? "Inversiones actualizadas."
            : scope === "summary"
              ? "Resumen actualizado por secciones."
              : "Datos actualizados por secciones.";
    setNotice(lineMessage(
      options.successMessage || defaultSuccess,
      flushedPending.length ? `Pendientes enviados antes: ${flushedPending.join(", ")}` : ""
    ), "ok");
    syncStatusStep(showProgress, "Caché actualizada", "ok");
    logSyncEvent(`Actualización completada: ${syncedSections.length ? syncedSections.join(", ") : "sin cambios"}.`, "ok");
    renderSyncSettingsPanel();
    if (showProgress) window.setTimeout(() => setSyncStatus("", ""), 2500);
    return true;
  } catch (error) {
    console.error(error);
    if (cached || hasAnyLoadedData()) {
      setNotice(lineMessage(
        cached ? "No se pudo actualizar; sigo usando caché." : "No se pudo actualizar; mantengo los datos ya cargados.",
        error.message
      ), "warn");
      syncStatusStep(showProgress, cached ? "Usando caché" : "Datos mantenidos", "warn");
      logSyncEvent(cached ? "No se pudo actualizar; usando caché." : "No se pudo actualizar; datos existentes mantenidos.", "warn", error.message || String(error));
      syncOptions();
      renderDataScope(scope);
      renderSyncSettingsPanel();
      return false;
    }
    syncOptions();
    renderAll();
    setNotice(lineMessage(`No se pudieron cargar datos: ${error.message}`, "No hay caché local disponible. Revisa Ajustes."), "warn");
    syncStatusStep(showProgress, "Error de sincronización", "warn");
    logSyncEvent("Error de sincronización sin caché local.", "warn", error.message || String(error));
    renderSyncSettingsPanel();
    return false;
  } finally {
    setRefreshLoading(false);
    kickOpQueue();
  }
}

function refreshStartStatus({ scope, updateInvestments, sendNotifications } = {}) {
  if (sendNotifications) return "Preparando notificaciones\nSin descargar datos";
  if (updateInvestments) return "Preparando precios\nSolo inversiones";
  if (scope === "investments") return "Preparando inversiones";
  if (scope === "movements") return "Preparando movimientos";
  if (scope === "summary") return "Preparando resumen";
  if (scope === "banks") return "Preparando cuentas";
  return "Preparando actualización";
}

function investmentRequestStatus({ updateInvestments, sendNotifications } = {}) {
  if (sendNotifications) return "Enviando notificaciones";
  if (updateInvestments) return "Actualizando precios\nDescargando inversiones";
  return "Descargando inversiones\nObjetivos";
}

const ERROR_CODE_MESSAGES = {
  AUTH: "El token de Apps Script no coincide. Revisa Ajustes > Conexión.",
  SHEET_NOT_FOUND: "No se encuentra una hoja esperada en el Sheet. Revisa los nombres en Ajustes.",
  NOT_FOUND: "El elemento ya no existe en Sheets (puede que se haya borrado desde otro sitio).",
  VALIDATION: "Los datos enviados no son válidos.",
  CONFLICT: "Hay un conflicto con datos existentes.",
  QUOTA: "Google ha limitado las peticiones por hoy. Inténtalo más tarde."
};

function assertPayloadOk(payload) {
  if (!payload || !payload.ok) {
    const errorCode = payload?.errorCode || "";
    const message = ERROR_CODE_MESSAGES[errorCode] || payload?.error || "Apps Script devolvio error";
    const error = new Error(message);
    error.errorCode = errorCode;
    throw error;
  }
}

async function downloadMovementPages(kind, label, options = {}) {
  let offset = 0;
  let total = null;
  const rows = [];
  syncStatusStep(options.showProgress, `Descargando ${label}\nCalculando páginas`, "");
  while (true) {
    const pageNumber = Math.floor(offset / MOVEMENT_PAGE_SIZE) + 1;
    if (total !== null) {
      const knownTotalPages = Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE));
      syncStatusStep(options.showProgress, `Descargando ${label}\nPágina ${pageNumber}/${knownTotalPages}`, "");
    }
    const payload = await fetchAppsScriptData({
      action: "downloadMovementsPage",
      movementKind: kind,
      offset,
      limit: MOVEMENT_PAGE_SIZE
    });
    assertPayloadOk(payload);
    const pageRows = kind === "future" ? (payload.futureTransactions || []) : (payload.transactions || []);
    rows.push(...pageRows);
    total = Number.isFinite(Number(payload.total)) ? Number(payload.total) : rows.length;
    const totalPages = Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE));
    offset = Number.isFinite(Number(payload.nextOffset)) ? Number(payload.nextOffset) : offset + pageRows.length;
    syncStatusStep(options.showProgress, `Descargando ${label}\nPágina ${pageNumber}/${totalPages} · ${Math.min(rows.length, total)}/${total}`, "");
    if (!payload.hasMore || !pageRows.length) break;
  }
  return rows;
}


function setRefreshLoading(loading) {
  const btn = document.getElementById("refreshBtn");
  if (btn) {
    btn.classList.toggle("loading", loading);
    btn.disabled = loading;
  }
}

async function refreshDataInPlace() {
  const activeView = document.querySelector(".view.active");
  const activeViewId = activeView?.id || "";
  const scrollTop = activeView?.scrollTop || 0;
  await refreshData({ force: true, scope: refreshScopeForView(activeViewId) });
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

function confirmDialog(message, title = "Confirmar") {
  return new Promise(resolve => {
    const dialog = document.getElementById("genericConfirmDialog");
    document.getElementById("genericConfirmTitle").textContent = title;
    document.getElementById("genericConfirmMessage").textContent = message;
    const acceptBtn = document.getElementById("genericConfirmAcceptBtn");
    const cancelBtn = document.getElementById("genericConfirmCancelBtn");
    const closeBtn = document.getElementById("closeGenericConfirmBtn");
    const settle = result => {
      acceptBtn.removeEventListener("click", onAccept);
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      dialog.close();
      resolve(result);
    };
    const onAccept = () => settle(true);
    const onCancel = () => settle(false);
    acceptBtn.addEventListener("click", onAccept);
    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
    dialog.showModal();
  });
}

async function withButtonState(button, action) {
  try {
    return await action();
  } catch (error) {
    restoreButton(button);
    setNotice(`No se pudo completar la acción: ${error?.message || error}`, "warn");
    return undefined;
  }
}

function ensureMovedFutureMovementsVisible(movedFutureMovements) {
  const moved = movedFutureMovements.map(normalizeTransaction).filter(Boolean);
  const realizedMovements = moved.filter(movement => !isTransfer(movement));
  const existingRealized = new Set(state.transactions.map(transactionSignature));
  realizedMovements.forEach(movement => {
    const signature = transactionSignature(movement);
    if (!existingRealized.has(signature)) {
      state.transactions.push(movement);
      existingRealized.add(signature);
    }
  });
  const movedSignatures = new Set(moved.map(futureMovementSignature));
  state.futureTransactions = state.futureTransactions.filter(movement => !movedSignatures.has(futureMovementSignature(movement)));
  state.transactions.sort((a, b) => b.date - a.date);
}

function applyDataSnapshot(data) {
  state.transactions = (data.transactions || []).map(normalizeTransaction).filter(Boolean);
  state.futureTransactions = (data.futureTransactions || []).map(normalizeTransaction).filter(Boolean);
  state.investments = (data.investments || []).map(normalizeInvestment).filter(Boolean).map(recalculateInvestmentTotal);
  state.investmentTotals = (data.investmentTotals || []).map(normalizeInvestmentTotal).filter(Boolean);
  state.investmentEstimateRules = (data.investmentEstimateRules || []).map(normalizeInvestmentEstimateRule).filter(Boolean);
  state.investmentEstimateLedger = (data.investmentEstimateLedger || []).map(normalizeInvestmentEstimateLedger).filter(Boolean);
  state.banks = (data.banks || []).map(normalizeBank).filter(Boolean);
  state.investmentGoals = normalizeInvestmentGoals(data.investmentGoals ?? state.investmentGoals);
  state.categories = normalizeCategories(data.categories);
}

function mergeDataSnapshot(data = {}) {
  if (Object.prototype.hasOwnProperty.call(data, "transactions")) {
    state.transactions = (data.transactions || []).map(normalizeTransaction).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(data, "futureTransactions")) {
    state.futureTransactions = (data.futureTransactions || []).map(normalizeTransaction).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(data, "investments")) {
    state.investments = (data.investments || []).map(normalizeInvestment).filter(Boolean).map(recalculateInvestmentTotal);
  }
  if (Object.prototype.hasOwnProperty.call(data, "investmentTotals")) {
    state.investmentTotals = (data.investmentTotals || []).map(normalizeInvestmentTotal).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(data, "investmentEstimateRules")) {
    state.investmentEstimateRules = (data.investmentEstimateRules || []).map(normalizeInvestmentEstimateRule).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(data, "investmentEstimateLedger")) {
    state.investmentEstimateLedger = (data.investmentEstimateLedger || []).map(normalizeInvestmentEstimateLedger).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(data, "banks")) {
    state.banks = (data.banks || []).map(normalizeBank).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(data, "investmentGoals")) {
    state.investmentGoals = normalizeInvestmentGoals(data.investmentGoals ?? state.investmentGoals);
  }
  if (Object.prototype.hasOwnProperty.call(data, "categories")) {
    state.categories = normalizeCategories(data.categories);
  }
}

function dataCacheConfigKey() {
  const { scriptUrl, appToken, movementSheet, futureMovementSheet, investmentSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet, bankSheet, objectiveSheet, dataSheet } = state.config;
  return JSON.stringify({ scriptUrl, appToken, movementSheet, futureMovementSheet, investmentSheet, investmentTotalsSheet, investmentEstimateRulesSheet, investmentEstimateLedgerSheet, bankSheet, objectiveSheet, dataSheet });
}

function readDataCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || "null");
    if (!cached || cached.configKey !== dataCacheConfigKey() || !cached.data) return null;
    const meta = normalizeCacheMeta(cached);
    return { ...cached, meta, savedAt: meta.savedAt || cached.savedAt || 0 };
  } catch {
    return null;
  }
}

function writeDataCache(options = {}) {
  try {
    const syncedSections = Array.isArray(options.syncedSections) ? options.syncedSections : [];
    const dirtySections = Array.isArray(options.dirtySections) ? options.dirtySections : [];
    const touchedSections = new Set([...syncedSections, ...dirtySections]);
    const previousCache = readDataCache();
    if (syncedSections.length) markCacheSectionsSynced(syncedSections);
    if (dirtySections.length) markCacheSectionsDirty(dirtySections);
    if (!syncedSections.length && !dirtySections.length) touchCacheSections([], false);
    const meta = normalizeCacheMeta({ meta: state.cacheMeta, savedAt: Date.now() });
    meta.savedAt = Date.now();
    state.cacheMeta = meta;
    const currentData = {
      transactions: state.transactions.map(serializeTransaction),
      futureTransactions: state.futureTransactions.map(serializeTransaction),
      investments: state.investments,
      investmentTotals: state.investmentTotals,
      investmentEstimateRules: state.investmentEstimateRules,
      investmentEstimateLedger: state.investmentEstimateLedger,
      banks: state.banks,
      investmentGoals: state.investmentGoals,
      categories: state.categories
    };
    const data = { ...currentData };
    if (previousCache?.data && touchedSections.size) {
      CACHE_SECTION_KEYS.forEach(section => {
        if (!touchedSections.has(section) && Object.prototype.hasOwnProperty.call(previousCache.data, section)) {
          data[section] = previousCache.data[section];
        }
      });
    }
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      configKey: dataCacheConfigKey(),
      savedAt: meta.savedAt,
      meta,
      data
    }));
    renderSyncSettingsPanel();
  } catch (error) {
    console.warn("No se pudo guardar la caché local", error);
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
  const hasPending = ["investments", "banks"].some(key => Array.isArray(next[key])) || Boolean(next.investmentGoals);
  if (!hasPending) return clearPendingCache();
  localStorage.setItem(PENDING_CACHE_KEY, JSON.stringify(next));
}

function clearPendingCache() {
  localStorage.removeItem(PENDING_CACHE_KEY);
}

async function flushPendingChangesBeforeDownload() {
  const pending = readPendingCache();
  if (!pending || !state.config.scriptUrl) return [];

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

  if (pending.investmentGoals) {
    await postAppsScript({
      action: "saveInvestmentGoals",
      sheetName: state.config.objectiveSheet || "Objetivos",
      goals: pending.investmentGoals
    });
    delete nextPending.investmentGoals;
    flushed.push("objetivos");
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
    if (section === "investmentGoals") pending.investmentGoals = state.investmentGoals;
  });
  writePendingCache(pending);
}

function readSyncLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || "[]");
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

function writeSyncLogs(logs) {
  localStorage.setItem(SYNC_LOG_KEY, JSON.stringify((logs || []).slice(-120)));
}

function logSyncEvent(message, type = "", detail = "") {
  const logs = readSyncLogs();
  logs.push({ at: Date.now(), message: String(message || ""), type: String(type || ""), detail: String(detail || "") });
  writeSyncLogs(logs);
  renderSyncSettingsPanel();
}

function clearSyncLogs() {
  localStorage.removeItem(SYNC_LOG_KEY);
  renderSyncSettingsPanel();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Nunca";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatCacheSectionName(section) {
  const map = {
    transactions: "Movimientos",
    futureTransactions: "Futuros",
    investments: "Inversiones",
    investmentTotals: "Totales inversión",
    investmentEstimateRules: "Reglas estimación",
    investmentEstimateLedger: "Estimaciones",
    banks: "Bancos",
    investmentGoals: "Objetivos",
    categories: "Categorías"
  };
  return map[section] || section;
}

function estimateLocalStorageSize() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      const value = localStorage.getItem(key) || "";
      if (key.startsWith("money")) total += key.length + value.length;
    }
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / 1024 / 1024).toFixed(2)} MB`;
  } catch {
    return "No disponible";
  }
}

function renderSyncSettingsPanel() {
  const summaryEl = document.getElementById("syncStatusSummary");
  const sectionsEl = document.getElementById("cacheSectionsTable");
  const logsEl = document.getElementById("syncLogsTable");
  if (!summaryEl && !sectionsEl && !logsEl) return;
  const cached = readDataCache();
  const meta = normalizeCacheMeta(cached || { meta: state.cacheMeta });
  const queue = readOpQueue();
  const pending = queue.filter(op => op.status !== "done").length;
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="sync-summary-grid">
        <article><span>Última sync</span><strong>${escapeHtml(formatDateTime(meta.savedAt))}</strong></article>
        <article><span>Operaciones pendientes</span><strong>${pending}</strong></article>
        <article><span>Tamaño local</span><strong>${escapeHtml(estimateLocalStorageSize())}</strong></article>
      </div>`;
  }
  if (sectionsEl) {
    const rows = CACHE_SECTION_KEYS.map(section => {
      const info = meta.sections?.[section] || {};
      const status = info.dirty ? "Pendiente" : info.rev ? "Sincronizada" : "Sin datos";
      return `<tr>
        <td>${escapeHtml(formatCacheSectionName(section))}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(formatDateTime(info.savedAt))}</td>
      </tr>`;
    }).join("");
    sectionsEl.innerHTML = `<thead><tr><th>Sección</th><th>Estado</th><th>Última vez</th></tr></thead><tbody>${rows}</tbody>`;
  }
  if (logsEl) {
    const logs = readSyncLogs().slice(-30).reverse();
    const rows = logs.map(log => `<tr class="${log.type === "warn" ? "log-warn" : log.type === "ok" ? "log-ok" : ""}">
      <td>${escapeHtml(formatDateTime(log.at))}</td>
      <td>${escapeHtml(log.message)}${log.detail ? `<small>${escapeHtml(log.detail)}</small>` : ""}</td>
    </tr>`).join("");
    logsEl.innerHTML = `<thead><tr><th>Hora</th><th>Evento</th></tr></thead><tbody>${rows || `<tr><td class="empty" colspan="2">Sin logs todavía.</td></tr>`}</tbody>`;
  }
}

function readOpQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(OP_QUEUE_KEY) || "[]");
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

function writeOpQueue(queue) {
  localStorage.setItem(OP_QUEUE_KEY, JSON.stringify(queue));
  renderPendingOpsBadge();
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readSentHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(SENT_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function writeSentHistory(history) {
  const next = history.filter(item => item && item.status === "ok").slice(-100);
  localStorage.setItem(SENT_HISTORY_KEY, JSON.stringify(next));
}

function rememberSentOp(payload) {
  const history = readSentHistory();
  history.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), day: todayKey(), status: "ok", payload });
  writeSentHistory(history);
}

function pendingOpsCount() {
  return readOpQueue().filter(op => op.status !== "done").length;
}

function queueActionStatus(payload = {}) {
  const map = {
    addMovement: "Enviando movimiento",
    addFutureMovement: "Enviando movimiento futuro",
    addMovementsBatch: "Enviando movimientos periódicos",
    updateMovement: "Guardando movimiento",
    updateInvestment: "Guardando inversión",
    deleteMovement: "Borrando movimiento",
    deleteMovementsBatch: "Borrando movimientos",
    saveBanks: "Guardando cuentas",
    saveInvestments: "Guardando inversiones",
    saveInvestmentEstimateRules: "Guardando reglas de estimación",
    clearInvestmentEstimates: "Borrando estimaciones",
    simulateInvestmentEstimateRule: "Simulando estimación",
    saveInvestmentModePreference: "Guardando modo de inversión",
    saveInvestmentGoals: "Guardando objetivos",
    transferBank: "Enviando transferencia",
    addTransfersBatch: "Enviando transferencias periódicas"
  };
  return `${map[payload.action] || "Enviando cambio"}\nSincronizando Google Sheets`;
}

function renderPendingOpsBadge() {
  const el = document.getElementById("pendingOpsBadge");
  if (!el) return;
  const queue = readOpQueue();
  const count = queue.filter(op => op.status !== "done").length;
  el.textContent = String(count);
  el.classList.toggle("hidden", count === 0);
  renderPendingOpsTable(queue);
  renderSentOpsTable();
  renderSyncSettingsPanel();
}

function renderPendingOpsTable(queue = readOpQueue()) {
  const table = document.getElementById("pendingOpsTable");
  if (!table) return;
  const rows = queue.map((op, idx) => {
    const actionMap = {
      addMovement: "Movimiento",
      addFutureMovement: "Movimiento futuro",
      addMovementsBatch: "Movs. periódicos",
      updateMovement: "Editar movimiento",
      updateInvestment: "Editar inversión",
      deleteMovement: "Borrar movimiento",
      deleteMovementsBatch: "Borrar múltiple",
      saveBanks: "Guardar cuentas",
      saveInvestments: "Guardar inversiones",
      saveInvestmentEstimateRules: "Guardar reglas estimación",
      clearInvestmentEstimates: "Borrar estimaciones",
      simulateInvestmentEstimateRule: "Simular estimación",
      saveInvestmentModePreference: "Modo inversión",
      saveInvestmentGoals: "Guardar objetivos",
      transferBank: "Transferencia",
      addTransfersBatch: "Transferencias periódicas"
    };
    const statusText = op.status === "sending" ? "Enviando" : op.status === "checking" ? "Confirmando" : "Pendiente (auto cada 5 s)";
    const detail = op.error ? `${statusText}: ${op.error}` : statusText;
    return `<tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(actionMap[op.payload?.action] || op.payload?.action || "Operación")}</td>
      <td>${escapeHtml(detail)}</td>
      <td><button class="mini-edit-btn" type="button" data-retry-op="${escapeAttr(op.id)}">Reintentar ahora</button></td>
    </tr>`;
  }).join("");
  table.innerHTML = `<thead><tr><th>#</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>${rows || `<tr><td class="empty" colspan="4">Sin peticiones pendientes.</td></tr>`}</tbody>`;
  table.querySelectorAll("[data-retry-op]").forEach(btn => btn.addEventListener("click", () => retryPendingOps(btn.dataset.retryOp)));
}

function renderSentOpsTable() {
  const table = document.getElementById("sentOpsTable");
  if (!table) return;
  const actionMap = {
    addMovement: "Movimiento",
    addFutureMovement: "Movimiento futuro",
    addMovementsBatch: "Movs. periódicos",
    updateMovement: "Editar movimiento",
    updateInvestment: "Editar inversión",
    deleteMovement: "Borrar movimiento",
    deleteMovementsBatch: "Borrar múltiple",
    saveBanks: "Guardar cuentas",
    saveInvestments: "Guardar inversiones",
    saveInvestmentEstimateRules: "Guardar reglas estimación",
    clearInvestmentEstimates: "Borrar estimaciones",
    simulateInvestmentEstimateRule: "Simular estimación",
    saveInvestmentEstimateAllocations: "Reparto estimación",
    saveInvestmentModePreference: "Modo inversión",
    saveInvestmentGoals: "Guardar objetivos",
    transferBank: "Transferencia",
    addTransfersBatch: "Transferencias periódicas"
  };
  const rows = readSentHistory()
    .filter(item => item.day === todayKey())
    .map((op, idx) => `<tr class="sent-row"><td>${idx + 1}</td><td>${escapeHtml(actionMap[op.payload?.action] || op.payload?.action || "Operación")}</td><td>Enviado hoy</td><td></td></tr>`)
    .join("");
  table.innerHTML = `<thead><tr><th>#</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody><tr class="table-section-row"><td colspan="4">Enviados hoy con éxito</td></tr>${rows || `<tr><td class="empty" colspan="4">Sin envíos de hoy.</td></tr>`}</tbody>`;
}

function queuePayloadSections(payload = {}) {
  const action = payload.action || "";
  if (["addMovement", "updateMovement", "deleteMovement"].includes(action)) {
    const sheetName = String(payload.sheetName || "");
    return sheetName === (state.config.futureMovementSheet || "Movimientos futuros") || action === "addFutureMovement"
      ? ["futureTransactions"]
      : ["transactions", "banks", "investmentTotals", "investmentEstimateLedger"];
  }
  if (action === "addFutureMovement") return ["futureTransactions"];
  if (action === "addMovementsBatch") return ["transactions", "futureTransactions", "banks", "investmentTotals", "investmentEstimateLedger"];
  if (action === "deleteMovementsBatch") {
    const sheetName = String(payload.sheetName || "");
    return sheetName === (state.config.futureMovementSheet || "Movimientos futuros") ? ["futureTransactions"] : ["transactions", "investmentTotals"];
  }
  if (["transferBank", "saveBanks", "addTransfersBatch"].includes(action)) return action === "addTransfersBatch" ? ["futureTransactions", "banks"] : ["banks"];
  if (["saveInvestments", "updateInvestment", "deleteInvestment"].includes(action)) return ["investments", "investmentTotals", "investmentEstimateLedger"];
  if (action === "saveInvestmentCategories") return ["categories", "investments", "investmentTotals", "transactions", "futureTransactions"];
  if (["saveInvestmentEstimateRules"].includes(action)) return ["investmentEstimateRules", "investmentEstimateLedger"];
  if (["clearInvestmentEstimates", "simulateInvestmentEstimateRule", "saveInvestmentEstimateAllocations"].includes(action)) return ["investmentEstimateLedger"];
  if (action === "saveInvestmentGoals") return ["investmentGoals"];
  return [];
}

function withClientOpId(payload = {}) {
  if (payload.clientOpId) return payload;
  return { ...payload, clientOpId: createSid("op") };
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function queuedOpLabel(payload = {}) {
  const actionMap = {
    addMovement: "Movimiento",
    addFutureMovement: "Movimiento futuro",
    addMovementsBatch: "Movimientos periódicos",
    updateMovement: "Editar movimiento",
    updateInvestment: "Editar inversión",
    deleteMovement: "Borrar movimiento",
    deleteMovementsBatch: "Borrar múltiple",
    saveBanks: "Guardar cuentas",
    saveInvestments: "Guardar inversiones",
    saveInvestmentEstimateRules: "Guardar reglas estimación",
    clearInvestmentEstimates: "Borrar estimaciones",
    simulateInvestmentEstimateRule: "Simular estimación",
    saveInvestmentEstimateAllocations: "Reparto estimación",
    saveInvestmentModePreference: "Modo inversión",
    saveInvestmentGoals: "Guardar objetivos",
    transferBank: "Transferencia",
    addTransfersBatch: "Transferencias periódicas"
  };
  return actionMap[payload.action] || payload.action || "Operación";
}

async function recoverInterruptedSendingOps() {
  const queue = readOpQueue();
  const sending = queue.filter(op => op.status === "sending");
  if (!sending.length) return;
  if (state.config.scriptUrl) {
    for (const op of sending) {
      const clientOpId = op.payload?.clientOpId;
      if (!clientOpId) continue;
      try {
        const payload = await fetchAppsScriptData({ action: "checkClientOp", clientOpId });
        if (payload?.ok && payload.completed) {
          logSyncEvent(`Envío interrumpido ya confirmado: ${op.payload?.action || "cambio"}.`, "ok");
          rememberSentOp(op.payload);
          const synced = queuePayloadSections(op.payload);
          markCacheSectionsSynced(synced);
          writeDataCache({ syncedSections: synced });
          writeOpQueue(readOpQueue().filter(item => item.id !== op.id));
        }
      } catch (error) {
        logSyncEvent("No se pudo comprobar un envío interrumpido; se reintentará.", "warn", error.message || String(error));
      }
    }
  }
  const refreshedQueue = readOpQueue();
  let changed = false;
  refreshedQueue.forEach(op => {
    if (op.status !== "sending") return;
    op.status = "retry";
    op.error = op.error || "Envío interrumpido al cerrar la app; se reintentará automáticamente.";
    changed = true;
  });
  if (changed) {
    writeOpQueue(refreshedQueue);
    logSyncEvent("Envíos interrumpidos marcados para reintento automático.", "warn");
  }
}

function queueOp(payload) {
  const queue = readOpQueue();
  const queuedPayload = withClientOpId(payload || {});
  queue.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), status: "queued", payload: queuedPayload });
  logSyncEvent(`Operación en cola: ${queuedPayload.action || "cambio"}.`, "");
  markCacheSectionsDirty(queuePayloadSections(queuedPayload));
  writeDataCache({ dirtySections: queuePayloadSections(queuedPayload) });
  writeOpQueue(queue);
  if (payload?.action === "saveInvestments") rememberPendingSnapshot("investments");
  if (payload?.action === "saveBanks") rememberPendingSnapshot("banks");
  if (payload?.action === "saveInvestmentGoals") rememberPendingSnapshot("investmentGoals");
  setTimeout(() => sendQueuedOp(queue[queue.length - 1].id), 0);
  ensureOpQueuePoller();
}

const OP_POLL_INTERVAL_MS = 5000;
let opQueuePollerHandle = null;
const opsInFlight = new Set();

function ensureOpQueuePoller() {
  if (opQueuePollerHandle) return;
  opQueuePollerHandle = window.setInterval(() => pollPendingOps(), OP_POLL_INTERVAL_MS);
}

async function pollPendingOps() {
  if (!state.config.scriptUrl) return;
  const queue = readOpQueue();
  const pending = queue.filter(op => op.status !== "done");
  if (!pending.length) return;
  for (const op of pending) {
    if (op.status === "sending" || op.status === "checking") {
      checkQueuedOp(op.id);
    } else {
      sendQueuedOp(op.id);
    }
  }
}

function markOpStatus(opId, patch) {
  const queue = readOpQueue();
  const target = queue.find(op => op.id === opId);
  if (!target) return;
  Object.assign(target, patch);
  writeOpQueue(queue);
}

function completeQueuedOp(item) {
  const next = readOpQueue().filter(op => op.id !== item.id);
  writeOpQueue(next);
  logSyncEvent(`Operación confirmada: ${item.payload?.action || "cambio"}.`, "ok");
  rememberSentOp(item.payload);
  if (item.payload?.action === "saveInvestments") dropPendingSections("investments");
  if (item.payload?.action === "saveBanks") dropPendingSections("banks");
  if (item.payload?.action === "saveInvestmentGoals") dropPendingSections("investmentGoals");
  const synced = queuePayloadSections(item.payload);
  markCacheSectionsSynced(synced);
  writeDataCache({ syncedSections: synced });
  renderPendingOpsBadge();
  setSyncStatus("Cambio enviado\nCaché sincronizada", "ok");
  window.setTimeout(() => setSyncStatus("", ""), 1800);
  if (item.payload?.action === "updateInvestment" && item.payload?.newInvestment) {
    refreshData({ force: true, scope: "investments", successMessage: "Inversión creada, precios actualizados y datos descargados desde Sheets." });
  }
}

async function sendQueuedOp(opId) {
  if (opsInFlight.has(opId)) return;
  if (!state.config.scriptUrl) return;
  const queue = readOpQueue();
  const item = queue.find(op => op.id === opId);
  if (!item || item.status === "done" || item.status === "sending" || item.status === "checking") return;
  opsInFlight.add(opId);
  ensureOpQueuePoller();
  markOpStatus(opId, { status: "sending", error: null });
  setSyncStatus(queueActionStatus(item.payload), "");
  try {
    await fireAppsScript(item.payload);
    markOpStatus(opId, { status: "checking", lastSentAt: Date.now() });
  } catch (error) {
    markOpStatus(opId, { status: "retry", error: String(error.message || error), lastSentAt: Date.now() });
    logSyncEvent(`No se pudo enviar (se reintentará en 5 s): ${item.payload?.action || "cambio"}.`, "warn", error.message || String(error));
  } finally {
    opsInFlight.delete(opId);
    renderPendingOpsBadge();
  }
}

async function checkQueuedOp(opId) {
  if (opsInFlight.has(opId)) return;
  const queue = readOpQueue();
  const item = queue.find(op => op.id === opId);
  if (!item || item.status === "done") return;
  const clientOpId = item.payload?.clientOpId;
  if (!clientOpId) return;
  opsInFlight.add(opId);
  try {
    const result = await fetchAppsScriptData({ action: "checkClientOp", clientOpId });
    if (result?.ok && result.completed) {
      completeQueuedOp(item);
      return;
    }
    if (result?.ok && result.pending) {
      markOpStatus(opId, { status: "checking", error: null });
      return;
    }
    markOpStatus(opId, { status: "retry", error: "Sin confirmación todavía; se reintentará." });
  } catch (error) {
    markOpStatus(opId, { status: "retry", error: String(error.message || error) });
  } finally {
    opsInFlight.delete(opId);
    renderPendingOpsBadge();
  }
}

function kickOpQueue() {
  ensureOpQueuePoller();
  const queue = readOpQueue();
  queue.filter(op => op.status === "queued" || op.status === "retry").forEach(op => sendQueuedOp(op.id));
  queue.filter(op => op.status === "checking").forEach(op => checkQueuedOp(op.id));
}

async function retryPendingOps(opId = null, { recoverSending = true } = {}) {
  if (recoverSending) await recoverInterruptedSendingOps();
  const queue = readOpQueue();
  const targets = opId ? queue.filter(op => op.id === opId) : queue.filter(op => op.status !== "done");
  const wasChecking = new Map(targets.map(op => [op.id, op.status === "checking"]));
  targets.forEach(op => { if (op.status !== "checking") op.status = "retry"; });
  writeOpQueue(queue);
  ensureOpQueuePoller();
  await Promise.all(targets.map(op => wasChecking.get(op.id) ? checkQueuedOp(op.id) : sendQueuedOp(op.id)));
}

async function flushOpQueueBeforeDownload({ showProgress = false } = {}) {
  const pendingBefore = readOpQueue().filter(op => op.status !== "done");
  if (!pendingBefore.length) return [];
  syncStatusStep(showProgress, "Enviando pendientes\nAntes de descargar", "");
  logSyncEvent(`Enviando ${pendingBefore.length} operación(es) pendiente(s) antes de descargar.`, "");
  await retryPendingOps();
  const pendingAfter = readOpQueue().filter(op => op.status !== "done");
  if (pendingAfter.length) {
    const detail = pendingAfter.map(op => queuedOpLabel(op.payload)).join(", ");
    setNotice(lineMessage(
      "No se descargan datos para evitar desincronización: quedan cambios pendientes de subir.",
      detail
    ), "warn");
    syncStatusStep(showProgress, "Pendientes sin enviar\nDescarga cancelada", "warn");
    throw new Error(`Quedan cambios pendientes de subir: ${detail}`);
  }
  return pendingBefore.map(op => queuedOpLabel(op.payload));
}

function transactionSignature(row) {
  const t = normalizeTransaction(row);
  return t ? [formatDate(t.date), normalizeType(t.tipo), normalizeType(t.concepto), t.descripcion, safeNumber(t.amount).toFixed(2)].join("|") : "";
}

function futureMovementSignature(row) {
  const t = normalizeTransaction(row);
  return t ? [transactionSignature(t), normalizeType(t.cuenta || t.account || "")].join("|") : "";
}

function serializeTransaction(t) {
  return {
    sid: t.sid || "",
    rowNumber: t.rowNumber,
    fecha: formatDate(t.date),
    tipo: t.tipo,
    concepto: t.concepto,
    descripcion: t.descripcion,
    importe: t.amount,
    cuenta: t.cuenta || t.account || "",
    transferFrom: t.transferFrom || "",
    transferTo: t.transferTo || ""
  };
}

function formatCacheAge(ageMs) {
  const minutes = Math.max(1, Math.round(ageMs / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

function findDueFutureMovements(futureTransactions = []) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return (futureTransactions || [])
    .map(normalizeTransaction)
    .filter(movement => movement && movement.date && movement.date <= today);
}

async function fetchAppsScriptData(options = {}) {
  if (!state.config.scriptUrl) throw new Error("falta la URL de Apps Script");
  if (navigator.onLine === false) throw new Error("Sin conexión");
  const action = options.action || (options.sendNotifications
    ? "sendDailyNotifications"
    : options.updateInvestments
      ? "updateInvestmentPrices"
      : options.scope === "investments"
        ? "downloadInvestments"
        : options.moveDueFutureMovements
          ? "moveDueFutureMovements"
          : "downloadData");
  const params = new URLSearchParams({
    action,
    token: state.config.appToken,
    movementSheet: state.config.movementSheet,
    futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros",
    investmentSheet: state.config.investmentSheet,
    investmentTotalsSheet: state.config.investmentTotalsSheet || "Inversión Totales",
    investmentEstimateRulesSheet: state.config.investmentEstimateRulesSheet || "Inversiones Estimación Reglas",
    investmentEstimateLedgerSheet: state.config.investmentEstimateLedgerSheet || "Inversiones Estimación Movimientos",
    investmentMode: state.investmentMode || "real",
    bankSheet: state.config.bankSheet || "Bancos",
    objectiveSheet: state.config.objectiveSheet || "Objetivos",
    dataSheet: state.config.dataSheet
  });
  if (options.updateInvestments) params.set("updateInvestments", "1");
  if (options.investment) params.set("investment", JSON.stringify(options.investment));
  if (options.previousInvestment) params.set("previousInvestment", JSON.stringify(options.previousInvestment));
  if (options.investmentTypes) params.set("investmentTypes", JSON.stringify(options.investmentTypes));
  if (options.investmentTotalsSheet) params.set("investmentTotalsSheet", options.investmentTotalsSheet);
  if (options.renames) params.set("renames", JSON.stringify(options.renames));
  if (options.sheetName) params.set("sheetName", options.sheetName);
  if (options.clientOpId) params.set("clientOpId", options.clientOpId);
  if (options.notificationRequestId) params.set("notificationRequestId", options.notificationRequestId);
  if (options.newInvestment) params.set("newInvestment", "1");
  if (options.rowNumber) params.set("rowNumber", String(options.rowNumber));
  if (options.ruleId) params.set("ruleId", String(options.ruleId));
  if (Number.isFinite(Number(options.simulationAmount))) params.set("simulationAmount", String(Number(options.simulationAmount)));
  if (options.simulationDate) params.set("simulationDate", options.simulationDate);
  if (options.sinceRev) params.set("sinceRev", options.sinceRev);
  if (options.movementKind) params.set("movementKind", options.movementKind);
  if (Number.isFinite(Number(options.offset))) params.set("offset", String(Number(options.offset)));
  if (Number.isFinite(Number(options.limit))) params.set("limit", String(Number(options.limit)));
  return jsonp(`${state.config.scriptUrl}?${params.toString()}`);
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
  fillSelect("editInvestmentType", investmentTypes());

  const accounts = state.banks.map(b => b.cuenta).filter(Boolean);
  fillSelect("formAccount", accounts, accounts.length ? null : "Sin cuentas");
  fillSelect("formTransferFrom", accounts, accounts.length ? null : "Origen");
  fillSelect("formTransferTo", accounts, accounts.length ? null : "Destino");
  fillSelect("recurrenceAccount", accounts, accounts.length ? null : "Sin cuentas");
  fillSelect("editMovementAccount", accounts, accounts.length ? null : "Sin cuentas");

  buildDescriptionSuggestions();
  syncRegistrarMode();
  renderRecurrencePicker();

  syncSummaryPeriodOptions();
}

function syncRegistrarMode() {
  const isTransfer = normalizeType(document.getElementById("formType").value) === "transferencia";
  const recurring = isRecurringMode();
  const amountInput = document.getElementById("formAmount");
  if (amountInput) {
    amountInput.min = isTransfer ? "0.01" : "";
    amountInput.placeholder = isTransfer ? "0.00" : "0.00";
    if (isTransfer) enforceTransferPositiveAmount();
  }
  document.querySelectorAll(".movement-only").forEach(el => el.classList.toggle("hidden", isTransfer));
  document.querySelectorAll(".transfer-only").forEach(el => el.classList.toggle("hidden", !isTransfer));
  const formDate = document.getElementById("formDate");
  if (formDate) formDate.required = !isTransfer && !recurring;
  ["formConcept", "formDescription"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.required = !isTransfer;
  });
  document.getElementById("formTransferFrom").required = isTransfer;
  document.getElementById("formTransferTo").required = isTransfer;
  const submitLabel = isTransfer
    ? (recurring ? `<i data-lucide="repeat-2"></i> Guardar transferencias` : `<i data-lucide="repeat-2"></i> Transferir entre cuentas`)
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
    registrarButton.classList.toggle("saving", state.submittingMovement);
    registrarButton.disabled = state.submittingMovement;
    registrarButton.setAttribute("aria-label", isTransfer ? "Transferir entre cuentas" : "Guardar registro");
    registrarButton.innerHTML = state.submittingMovement
      ? `<i data-lucide="loader-2"></i><span>Guardando</span>`
      : isTransfer
        ? `<i data-lucide="repeat-2"></i><span>Transferir</span>`
        : `<i data-lucide="save"></i><span>Guardar</span>`;
  } else {
    registrarButton.classList.remove("save-mode");
    registrarButton.classList.remove("saving");
    registrarButton.disabled = false;
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
  renderDataScope("summary");
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
  renderRegistrarSummaryCompact();
  renderFutureDueNotice();
  renderSummary();
  renderMovements();
  renderInvestments();
  syncInvestmentEstimateModeUi();
  renderSyncSettingsPanel();
  renderSettingsPanelTabs();
  lucide.createIcons();
}

function renderRegistrarSummaryCompact() {
  const el = document.getElementById("registrarSummary");
  if (!el) return;
  const summary = calculateSummary(getSelectedSummaryMonth());
  const selectedMonth = getSelectedSummaryMonth();
  const investedCurrentMonth = Math.abs(sum(state.transactions.filter(t => isInvestment(t) && monthKey(t.date) === selectedMonth).map(t => t.amount)));
  const investedWithProfit = summary.investedTotal + summary.profitLoss;
  const investedWithProfitLabel = summary.investedTotal
    ? `Inv. + gan. (${pct(summary.profitLossPct)})`
    : "Inv. + gan.";
  const cards = [
    { label: "Dinero banco", value: money(summary.bank) },
    { label: "Dinero invertido", value: money(summary.investedTotal) },
    { label: "Ingresos mes actual", value: money(summary.income) },
    { label: investedWithProfitLabel, value: money(investedWithProfit) },
    { label: "Gastos mes actual", value: money(summary.expenses) },
    { label: "Invertido mes actual", value: money(investedCurrentMonth) }
  ];
  el.innerHTML = cards.map(card => `
    <article class="mini-stat-card">
      <strong>${escapeHtml(card.value)}</strong>
      <span>${escapeHtml(card.label)}</span>
    </article>
  `).join("");
}

function renderMonthSituationDialog(summary) {
  renderMonthSituationBars(summary);
  document.querySelectorAll("[data-situation-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.situationMode === state.summaryModes.situation);
  });

  const rows = getSituationBreakdown(summary.month, state.summaryModes.situation);
  const total = sum(rows.map(e => e[1]));
  renderTable("monthSituationTable", ["", "Detalle", "Cantidad", ""], rows.map(([label, value], idx) => [
    colorDot(chartColor(PIE_CHART_COLORS, idx)),
    escapeHtml(label),
    money(value),
    pct(value / Math.max(total, 1))
  ]));
  upsertChart("monthSituationChart", "doughnut", {
    labels: rows.map(([label]) => label),
    datasets: [{ data: rows.map(e => e[1]), backgroundColor: rows.map((_, idx) => chartColor(PIE_CHART_COLORS, idx)), borderWidth: 2, borderColor: chartSurfaceColor() }]
  }, compactChartOptions("", { cutout: "58%" }));
}

function renderMoneySummary(summary) {
  const groups = state.accountGroups || [];
  const groupRows = groups.map(group => {
    const total = sum(state.banks.filter(bank => group.accountNames.includes(bank.cuenta)).map(bank => bank.dinero));
    return `<button class="money-row money-action" data-account-group-id="${escapeAttr(group.id)}" type="button">
      <span>${escapeHtml(group.name)}</span>
      <strong>${money(total)}</strong>
    </button>`;
  }).join("");
  document.getElementById("moneySummary").innerHTML = `
    <div class="money-list">
      <button class="money-row money-action" id="openAllAccountsBtn" type="button">
        <span>Banco</span>
        <strong>${money(summary.bank)}</strong>
      </button>
      ${groupRows}
      <button class="money-row money-action add-account-group" id="addAccountGroupBtn" type="button">
        <i data-lucide="plus"></i>
        <span>Nueva tarjeta</span>
      </button>
    </div>
  `;
  document.getElementById("investedSummary").innerHTML = `
    <button class="money-item money-action" id="openInvestedMoneyBtn" type="button">
      <span>Invertido</span>
      <strong>${money(summary.investedTotal)}</strong>
      <small class="${summary.profitLoss >= 0 ? "positive" : "negative"}">Realizando ganancias: ${money(summary.valueTotal)} · ${pct(summary.profitLossPct)}</small>
    </button>
  `;

  document.getElementById("openInvestedMoneyBtn")?.addEventListener("click", () => openMoneyDetail("invested"));
  document.getElementById("openAllAccountsBtn")?.addEventListener("click", () => openMoneyDetail("bank"));
  document.getElementById("addAccountGroupBtn")?.addEventListener("click", () => openAccountGroupDialog(null));
  document.querySelectorAll("[data-account-group-id]").forEach(btn => {
    btn.addEventListener("click", () => openAccountGroupDialog(btn.dataset.accountGroupId));
  });
  lucide.createIcons();

  document.getElementById("bookMoneyTotal").textContent = money(summary.totalMoneyBook);
  document.getElementById("realizedMoneyTotal").textContent = `${money(summary.totalMoneyRealized)} • ${pct(summary.profitLossPct)} • ${money(summary.profitLoss)}`;
}

function openAccountGroupDialog(groupId) {
  const dialog = document.getElementById("accountGroupDialog");
  const group = groupId ? (state.accountGroups || []).find(g => g.id === groupId) : null;
  dialog.__groupId = group ? group.id : null;
  document.getElementById("accountGroupTitle").textContent = group ? "Editar tarjeta" : "Nueva tarjeta";
  document.getElementById("accountGroupName").value = group ? group.name : "";
  document.getElementById("accountGroupDeleteBtn").classList.toggle("hidden", !group);
  const selected = new Set(group ? group.accountNames : []);
  document.getElementById("accountGroupChecklist").innerHTML = state.banks.length
    ? `<div class="account-group-checklist">${state.banks.map(bank => `
        <label>
          <input type="checkbox" value="${escapeAttr(bank.cuenta)}" ${selected.has(bank.cuenta) ? "checked" : ""}>
          <span>${escapeHtml(bank.cuenta)}</span>
        </label>
      `).join("")}</div>`
    : emptyBlock("No hay cuentas todavía. Añade una cuenta primero.");
  dialog.showModal();
}

function submitAccountGroup(event) {
  event.preventDefault();
  const dialog = document.getElementById("accountGroupDialog");
  const name = document.getElementById("accountGroupName").value.trim();
  if (!name) return;
  const accountNames = [...document.querySelectorAll("#accountGroupChecklist input[type=checkbox]:checked")].map(input => input.value);
  const groupId = dialog.__groupId;
  if (groupId) {
    const group = (state.accountGroups || []).find(g => g.id === groupId);
    if (group) {
      group.name = name;
      group.accountNames = accountNames;
    }
  } else {
    state.accountGroups = state.accountGroups || [];
    state.accountGroups.push({ id: createSid("group"), name, accountNames });
  }
  writeAccountGroups();
  dialog.close();
  renderSummary();
  setNotice("Tarjeta guardada.", "ok");
}

function deleteAccountGroup() {
  const dialog = document.getElementById("accountGroupDialog");
  const groupId = dialog.__groupId;
  if (!groupId) return;
  state.accountGroups = (state.accountGroups || []).filter(g => g.id !== groupId);
  writeAccountGroups();
  dialog.close();
  renderSummary();
  setNotice("Tarjeta eliminada.", "ok");
}

function openMoneyDetail(mode) {
  const summary = calculateSummary(getSelectedSummaryMonth());
  const isBank = mode === "bank";
  const parts = investmentTypes().map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    const gain = current - invested;
    return `<div class="money-item"><span>${type}</span><strong>${money(invested)}</strong><small class="${gain >= 0 ? "positive" : "negative"}">Actual: ${money(current)} · ${pct(gainPct(current, invested))}</small></div>`;
  }).join("");

  document.getElementById("moneyDialogTitle").textContent = isBank ? "Banco" : "Invertido";
  document.getElementById("bankMoneyDetail").classList.toggle("hidden", !isBank);
  document.getElementById("investedMoneyDetail").classList.toggle("hidden", isBank);
  document.getElementById("moneyDialogSummary").innerHTML = isBank ? "" : `
    <div class="money-grid investment-money-grid">
      <div class="money-item"><span>Invertido</span><strong>${money(summary.investedTotal)}</strong><small class="${summary.profitLoss >= 0 ? "positive" : "negative"}">Actual: ${money(summary.valueTotal)} · ${pct(summary.profitLossPct)}</small></div>
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
    <div class="bank-row">
      <span>${escapeHtml(bank.cuenta)}</span>
      <input data-bank-index="${idx}" type="number" step="0.01" inputmode="decimal" value="${formatDecimalInput(bank.dinero)}" aria-label="Importe ${escapeAttr(bank.cuenta)}">
      <button class="icon-btn minimal-icon" type="button" data-bank-manage-index="${idx}" aria-label="Gestionar cuenta ${escapeAttr(bank.cuenta)}"><i data-lucide="more-vertical"></i></button>
    </div>
  `).join("") || emptyBlock("No se han detectado cuentas. La hoja debe llamarse Bancos y tener columnas Cuenta y Dinero.");
}

function refreshAfterAccountChange() {
  renderSummary();
  if (document.getElementById("moneyDialog")?.open) {
    renderBankDetail(calculateSummary(getSelectedSummaryMonth()));
  }
}

function openAccountManageDialog(index) {
  const dialog = document.getElementById("accountManageDialog");
  const isNew = index === null || index === undefined;
  dialog.__index = isNew ? null : index;
  document.getElementById("accountManageTitle").textContent = isNew ? "Nueva cuenta" : "Editar cuenta";
  document.getElementById("accountManageName").value = isNew ? "" : state.banks[index].cuenta;
  document.getElementById("accountManageInitial").value = "0";
  document.querySelector(".account-manage-initial").classList.toggle("hidden", !isNew);
  document.getElementById("accountManageDeleteBtn").classList.toggle("hidden", isNew);
  dialog.showModal();
}

async function submitAccountManage(event) {
  event.preventDefault();
  const dialog = document.getElementById("accountManageDialog");
  const name = document.getElementById("accountManageName").value.trim();
  if (!name) return;
  const index = dialog.__index;
  const btn = event.submitter;
  if (index === null) {
    if (state.banks.some(b => b.cuenta === name)) {
      setNotice("Ya existe una cuenta con ese nombre.", "warn");
      return;
    }
    const initial = Number(document.getElementById("accountManageInitial").value || 0);
    state.banks.push({ cuenta: name, dinero: initial });
    writeDataCache();
    dialog.close();
    refreshAfterAccountChange();
    setNotice('Cuenta añadida. Pulsa "Guardar cuentas" para confirmarla en Sheets.', "ok");
    return;
  }
  const bank = state.banks[index];
  const oldName = bank.cuenta;
  if (name === oldName) {
    dialog.close();
    return;
  }
  if (state.banks.some((b, i) => i !== index && b.cuenta === name)) {
    setNotice("Ya existe una cuenta con ese nombre.", "warn");
    return;
  }
  markButtonSaving(btn);
  await withButtonState(btn, async () => {
    if (state.config.scriptUrl) {
      queueOp({
        action: "renameAccount",
        bankSheet: state.config.bankSheet || "Bancos",
        movementSheet: state.config.movementSheet,
        futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros",
        oldName,
        newName: name
      });
    }
    bank.cuenta = name;
    state.transactions.forEach(t => { if (t.cuenta === oldName) t.cuenta = name; });
    state.futureTransactions.forEach(t => { if (t.cuenta === oldName) t.cuenta = name; });
    renameAccountInGroups(oldName, name);
    writeDataCache();
    markButtonSaved(btn);
    dialog.close();
    refreshAfterAccountChange();
    setNotice(state.config.scriptUrl ? "Cuenta renombrada y enviada a Sheets." : "Cuenta renombrada localmente.", "ok");
  });
}

async function deleteAccountManage() {
  const dialog = document.getElementById("accountManageDialog");
  const index = dialog.__index;
  if (index === null || index === undefined) return;
  const bank = state.banks[index];
  const movementsCount = state.transactions.filter(t => t.cuenta === bank.cuenta).length
    + state.futureTransactions.filter(t => t.cuenta === bank.cuenta).length;
  let force = false;
  if (movementsCount) {
    const ok = await confirmDialog(
      `Esta cuenta tiene ${movementsCount} movimiento(s) asociados. Los movimientos conservarán el nombre de cuenta, pero la cuenta desaparecerá del listado de Bancos. ¿Eliminar igualmente?`,
      "Eliminar cuenta"
    );
    if (!ok) return;
    force = true;
  } else {
    const ok = await confirmDialog(`¿Eliminar la cuenta "${bank.cuenta}"?`, "Eliminar cuenta");
    if (!ok) return;
  }
  const btn = document.getElementById("accountManageDeleteBtn");
  markButtonSaving(btn, "Eliminando");
  await withButtonState(btn, async () => {
    if (state.config.scriptUrl) {
      queueOp({
        action: "deleteAccount",
        bankSheet: state.config.bankSheet || "Bancos",
        movementSheet: state.config.movementSheet,
        futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros",
        account: bank.cuenta,
        force
      });
    }
    state.banks.splice(index, 1);
    removeAccountFromGroups(bank.cuenta);
    writeDataCache();
    markButtonSaved(btn, "Eliminada");
    dialog.close();
    refreshAfterAccountChange();
    setNotice("Cuenta eliminada.", "ok");
  });
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
  const dailyByType = {};
  const dailyPreviousByType = {};
  const totalsByType = investmentTotalsByType();
  investmentTypes().forEach(type => {
    const totalRow = totalsByType.get(normalizeType(type));
    if (totalRow) {
      investedByType[type] = safeNumber(totalRow.cost);
      valueByType[type] = safeNumber(totalRow.value);
      dailyPreviousByType[type] = safeNumber(totalRow.lastValue);
      dailyByType[type] = Number.isFinite(totalRow.daily) ? safeNumber(totalRow.daily) : valueByType[type] - dailyPreviousByType[type];
      return;
    }
    const positions = effectiveInvestmentPositions().filter(i => normalizeType(i.tipo) === normalizeType(type));
    investedByType[type] = Math.abs(sum(untilToday
      .filter(t => isInvestment(t) && normalizeType(t.descripcion) === normalizeType(type))
      .map(t => t.amount)));
    valueByType[type] = sum(positions.map(i => currentInvestmentTotal(i)));
    dailyPreviousByType[type] = sum(positions.map(i => previousInvestmentTotal(i)));
    dailyByType[type] = valueByType[type] - dailyPreviousByType[type];
  });
  const investedTotal = sum(Object.values(investedByType));
  const valueTotal = sum(Object.values(valueByType));
  const dailyPreviousTotal = sum(Object.values(dailyPreviousByType));
  const dailyVariationTotal = valueTotal - dailyPreviousTotal;
  return {
    month, income, expenses, investedMonth, balance, bank,
    computedBank, bankAccountsTotal,
    investedByType, valueByType, investedTotal, valueTotal,
    dailyByType, dailyPreviousByType, dailyPreviousTotal, dailyVariationTotal,
    dailyVariationPct: dailyPreviousTotal ? dailyVariationTotal / dailyPreviousTotal : 0,
    totalMoneyBook: bank + investedTotal,
    totalMoneyRealized: bank + valueTotal,
    profitLoss: valueTotal - investedTotal,
    profitLossPct: investedTotal ? (valueTotal - investedTotal) / investedTotal : 0
  };
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
    const key = mode === "gastos" ? t.concepto : t.descripcion || t.concepto || "Sin descripción";
    rows[key] = (rows[key] || 0) + Math.abs(t.amount);
  });
  return Object.entries(rows).sort((a, b) => b[1] - a[1]);
}

function renderMoneyCharts(summary) {
  const bankRows = adjustedBankChartRows().map((row, idx) => ({ label: row.label, value: row.value, color: chartColor(PIE_CHART_COLORS, idx) }));
  const bankTotal = sum(bankRows.map(row => row.value));
  upsertChart("bankDistributionChart", "doughnut", {
    labels: bankRows.length ? bankRows.map(row => row.label) : ["Banco"],
    datasets: [{ data: bankRows.length ? bankRows.map(row => row.value) : [Math.max(summary.bank, 0)], backgroundColor: bankRows.length ? bankRows.map(row => row.color) : [chartColor(PIE_CHART_COLORS, 0)], borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions("Cuentas", { legend: false }));
  renderColorRowsTable("bankDistributionTable", bankRows, ["", "Cuenta", "Dinero", ""]);

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
    rows = investmentTypes().map((type, idx) => ({ label: type, value: summary.investedByType[type] || 0, color: chartColor(PIE_CHART_COLORS, idx + 2) })).filter(row => row.value > 0);
    title = "Tipos de inversión";
  }
  const total = sum(rows.map(row => row.value));
  upsertChart("moneyVsInvestedChart", "doughnut", {
    labels: rows.map(row => row.label),
    datasets: [{ data: rows.map(row => row.value), backgroundColor: rows.map(row => row.color), borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions(title, { legend: false }));
  renderColorRowsTable("investmentMixTable", rows, ["", "Detalle", "Total", ""]);
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
    <button class="btn full" id="addAccountBtn" type="button"><i data-lucide="plus"></i> Añadir cuenta</button>
    ${state.banks.length ? `<button class="btn primary full" id="saveBanksBtn" type="button"><i data-lucide="save"></i> Guardar cuentas</button>` : ""}`;
  document.getElementById("saveBanksBtn")?.addEventListener("click", saveBanks);
  document.getElementById("addAccountBtn")?.addEventListener("click", () => openAccountManageDialog(null));
  accountsPanel.querySelectorAll("[data-bank-manage-index]").forEach(btn => {
    btn.addEventListener("click", () => openAccountManageDialog(Number(btn.dataset.bankManageIndex)));
  });
  lucide.createIcons();
}

function bankCheckText(accountsAdjustment) {
  if (Math.abs(accountsAdjustment) < 0.01) return "Cuentas cuadradas con Banco.";
  return accountsAdjustment > 0
    ? `Añadir ${money(Math.abs(accountsAdjustment))} en cuentas.`
    : `Restar ${money(Math.abs(accountsAdjustment))} en cuentas.`;
}

function renderMovements() {
  const drill = state.movementDrill;
  document.querySelector("#movimientos .movement-toolbar").classList.toggle("hidden", drill.level === "years");
  document.getElementById("movementBackBtn").style.visibility = drill.level === "years" ? "hidden" : "visible";
  syncMovementBulkButtons();
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
    return `<button class="month-card year-card" data-year="${year}">
      <div class="month-number">
        <span>Año</span>
        <strong>${year}</strong>
      </div>
      <div class="month-metrics">
        ${metricBlock(movementLabels().income, yearly.income, "positive")}
        ${metricBlock(movementLabels().expenses, yearly.expenses, "negative")}
        ${metricBlock(movementLabels().investment, yearly.invested, "")}
        ${metricBlock("Balance", yearly.balance, yearly.balance >= 0 ? "positive" : "negative")}
      </div>
    </button>`;
  }).join("") || emptyBlock("Sin movimientos.")}</div>`;
  document.querySelectorAll("[data-year]").forEach(btn => btn.addEventListener("click", () => {
    state.movementBulkEdit = false;
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
        ${metricBlock(movementLabels().income, s.income, "positive")}
        ${metricBlock(movementLabels().expenses, s.expenses, "negative")}
        ${metricBlock(movementLabels().investment, s.investedMonth, "")}
        ${metricBlock("Balance", s.balance, s.balance >= 0 ? "positive" : "negative")}
      </div>
    </button>`;
  }).join("") || emptyBlock("Sin meses.")}</div>`;
  document.querySelectorAll("[data-month]").forEach(btn => btn.addEventListener("click", () => {
    state.movementBulkEdit = false;
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
          ${metricBlock("Inversión", summary.investedMonth, "")}
          ${metricBlock("Balance", summary.balance, summary.balance >= 0 ? "positive" : "negative")}
        </div>
      </div>
      <div class="table-wrap movement-table-wrap"><table id="movementTable"></table></div>
    </article>`;
  renderMovementTable(rows);
  state.filtered = rows;
}

function renderMovementTable(rows) {
  const table = document.getElementById("movementTable");
  table.classList.toggle("movement-bulk-edit", state.movementBulkEdit);
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
  const renderCell = (column, t) => {
    if (column[0] === "day") return `<td class="amount col-day">${String(t.date.getDate()).padStart(2, "0")}</td>`;
    if (column[0] === "type") return `<td class="col-type">${tag(t.tipo)}</td>`;
    if (column[0] === "concept") return `<td class="text-clip col-concept" title="${escapeAttr(t.concepto)}">${escapeHtml(t.concepto)}</td>`;
    if (column[0] === "desc") {
      if (state.movementMode === "future" && t.cuenta) {
        return `<td class="col-desc col-desc-with-account">
          <span class="text-clip" title="${escapeAttr(t.descripcion)}">${escapeHtml(t.descripcion)}</span>
          <span class="text-clip cell-secondary" title="${escapeAttr(t.cuenta)}">${escapeHtml(t.cuenta)}</span>
        </td>`;
      }
      return `<td class="text-clip col-desc" title="${escapeAttr(t.descripcion)}">${escapeHtml(t.descripcion)}</td>`;
    }
    return `<td class="col-money">${amountCell(t.amount)}</td>`;
  };
  if (!visibleRows.length) {
    table.innerHTML = `<thead><tr>${state.movementBulkEdit ? `<th class="col-select"></th>` : ""}${columns.map(c => `<th class="col-${c[0]}"><button class="table-head-btn" data-table-column="${c[0]}">${c[1]}</button></th>`).join("")}</tr></thead><tbody><tr><td class="empty" colspan="${columns.length + (state.movementBulkEdit ? 1 : 0)}">Sin datos para mostrar.</td></tr></tbody>`;
  } else {
    table.innerHTML = `<thead><tr>${state.movementBulkEdit ? `<th class="col-select"></th>` : ""}${columns.map(c => `<th class="col-${c[0]}"><button class="table-head-btn" data-table-column="${c[0]}">${c[1]}</button></th>`).join("")}</tr></thead><tbody>${visibleRows.map(t => {
      const index = getDisplayedMovements().indexOf(t);
      const selector = state.movementBulkEdit ? `<td class="col-select"><input class="movement-select" type="checkbox" data-movement-select="${index}" aria-label="Seleccionar movimiento"></td>` : "";
      return `<tr class="clickable-row ${state.movementBulkEdit ? "selectable-row" : ""}" data-movement-index="${index}">${selector}${columns.map(column => renderCell(column, t)).join("")}</tr>`;
    }).join("")
      }</tbody>`;
  }
  table.querySelectorAll("[data-table-column]").forEach(btn => btn.addEventListener("click", () => configureMovementTable(btn.dataset.tableColumn, rows)));
  table.querySelectorAll("[data-movement-index]").forEach(row => {
    row.addEventListener("click", event => {
      if (state.movementBulkEdit) {
        if (event.target.matches("input")) return;
        const checkbox = row.querySelector(".movement-select");
        if (checkbox) checkbox.checked = !checkbox.checked;
        syncMovementBulkButtons();
        return;
      }
      openMovementDetail(Number(row.dataset.movementIndex));
    });
  });
  table.querySelectorAll(".movement-select").forEach(input => input.addEventListener("change", syncMovementBulkButtons));
  syncMovementBulkButtons();
}

function toggleMovementBulkEdit() {
  state.movementBulkEdit = !state.movementBulkEdit;
  renderMovements();
}

function syncMovementBulkButtons() {
  const editBtn = document.getElementById("movementBulkEditBtn");
  const deleteBtn = document.getElementById("movementBulkDeleteBtn");
  if (!editBtn || !deleteBtn) return;
  const isEntries = state.movementDrill.level === "entries";
  editBtn.classList.toggle("hidden", !isEntries);
  deleteBtn.classList.toggle("hidden", !isEntries || !state.movementBulkEdit);
  editBtn.classList.toggle("primary", state.movementBulkEdit);
  editBtn.classList.toggle("icon-only", state.movementBulkEdit);
  editBtn.setAttribute("aria-label", state.movementBulkEdit ? "Cancelar edición" : "Editar movimientos");
  editBtn.title = state.movementBulkEdit ? "Cancelar" : "Editar";
  editBtn.innerHTML = state.movementBulkEdit ? `<i data-lucide="check"></i>` : `<i data-lucide="square-pen"></i> Editar`;
  const count = selectedMovementIndexes().length;
  if (deleteBtn.classList.contains("saving")) {
    lucide.createIcons();
    return;
  }
  deleteBtn.disabled = count === 0;
  deleteBtn.classList.add("icon-only");
  deleteBtn.setAttribute("aria-label", count ? `Borrar ${count} movimientos seleccionados` : "Borrar movimientos seleccionados");
  deleteBtn.title = count ? `Borrar ${count}` : "Borrar";
  deleteBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
  lucide.createIcons();
}

function selectedMovementIndexes() {
  return [...document.querySelectorAll("[data-movement-select]:checked")]
    .map(input => Number(input.dataset.movementSelect))
    .filter(Number.isInteger);
}

async function deleteSelectedMovements() {
  const indexes = selectedMovementIndexes();
  if (!indexes.length) return;
  const btn = document.getElementById("movementBulkDeleteBtn");
  markButtonSaving(btn, "Borrando");
  try {
    const list = getDisplayedMovements();
    const movements = indexes.map(index => list[index]).filter(Boolean);
    const finalizeDelete = (account = "") => {
      const totalAmount = sum(movements.map(movement => Number(movement.amount || 0)));
      const accountDelta = -totalAmount;
      if (account) applyBankDelta(account, accountDelta);
      if (state.movementMode !== "future") movements.forEach(movement => applyInvestmentCostDeltaLocal(movement, -1));
      const selected = new Set(movements);
      const target = state.movementMode === "future" ? state.futureTransactions : state.transactions;
      for (let i = target.length - 1; i >= 0; i--) {
        if (selected.has(target[i])) target.splice(i, 1);
      }
      writeDataCache();
      if (state.config.scriptUrl) {
        queueOp({
          action: "deleteMovementsBatch",
          sheetName: state.movementMode === "future" ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet,
          movements: movements.map(movement => ({
            rowNumber: movement.rowNumber,
            movement: serializeTransaction(movement)
          }))
        });
        if (account) queueOp({ action: "saveBanks", bankSheet: state.config.bankSheet || "Bancos", banks: state.banks });
        setNotice(`${movements.length} movimientos eliminados.`, "ok");
      } else {
        setNotice(lineMessage("Eliminados solo en pantalla.", "Para borrar en Sheets necesitas Apps Script."), "warn");
      }
      state.movementBulkEdit = false;
      syncOptions();
      renderDataScope("movements");
    };
    if (state.banks.length) {
      const totalAmount = sum(movements.map(movement => Number(movement.amount || 0)));
      promptMovementDeleteAccount({
        title: "Aplicar a cuenta",
        amount: -totalAmount,
        onConfirm: account => finalizeDelete(account),
        onCancel: () => restoreButton(btn)
      });
      return;
    }
    finalizeDelete();
  } catch (error) {
    restoreButton(btn);
    setNotice(`No se pudieron borrar: ${error.message}`, "warn");
    renderMovements();
  }
}

function configureMovementTable(column, rows) {
  const dialog = document.getElementById("movementTableControlDialog");
  const currentControl = state.tableControls.movement || {};
  const current = currentControl.column === column ? currentControl : {};
  document.querySelectorAll("#movementTableControlSort [data-table-sort]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tableSort === current.sort);
  });
  document.getElementById("movementTableControlFilter").value = current.filter || "";
  dialog.__column = column;
  dialog.__rows = rows;
  dialog.showModal();
}

function movementBack() {
  state.movementBulkEdit = false;
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

function movementLabels() {
  return state.movementMode === "future"
    ? { income: "Ingresos\nplaneados", expenses: "Gastos\nplaneados", investment: "Inversión\nplaneada" }
    : { income: "Ingresos", expenses: "Gastos", investment: "Inversión" };
}

function metricBlock(label, value, tone) {
  return `<div class="metric ${tone || ""}"><strong>${money(value, 0)}</strong><span>${escapeHtml(label)}</span></div>`;
}


function setSettingsPanelFromClick(event) {
  const btn = event.target.closest("[data-settings-panel]");
  if (!btn) return;
  state.summaryModes.settingsPanel = btn.dataset.settingsPanel || "sync";
  renderSettingsPanelTabs();
}

function renderSettingsPanelTabs() {
  const panel = state.summaryModes.settingsPanel || "sync";
  const labels = {
    sync: ["Sincronización", "Estado de caché, secciones y logs internos."],
    connection: ["Conexión", "Peticiones pendientes y envíos confirmados de hoy."],
    params: ["Parámetros", "Estimación, tema, URL de Apps Script y token opcional."]
  };
  document.querySelectorAll("#settingsPanelSwitch [data-settings-panel]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.settingsPanel === panel);
  });
  document.querySelectorAll("[data-settings-panel-section]").forEach(section => {
    section.classList.toggle("hidden", section.dataset.settingsPanelSection !== panel);
  });
  const [title, subtitle] = labels[panel] || labels.sync;
  const titleEl = document.getElementById("settingsPanelTitle");
  const subtitleEl = document.getElementById("settingsPanelSubtitle");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
}

function setInvestmentPanelFromClick(event) {
  const btn = event.target.closest("[data-investment-panel]");
  if (!btn) return;
  state.summaryModes.investmentPanel = btn.dataset.investmentPanel;
  renderInvestments();
  requestAnimationFrame(() => fitInvestmentTables?.());
}

function renderInvestmentEditTable() {
  const sourcePositions = effectiveInvestmentPositions();
  const estimatedMode = investmentEstimateEnabled();
  const rows = investmentTypes().flatMap(type => {
    const positions = sourcePositions
      .filter(i => normalizeType(i.tipo) === normalizeType(type))
      .sort((a, b) => currentInvestmentTotal(b) - currentInvestmentTotal(a));
    if (!positions.length) return [];
    const group = `<tr><th colspan="${estimatedMode ? 6 : 5}">${escapeHtml(type)}</th></tr>`;
    const body = positions.map(i => {
      const idx = Number.isInteger(i.sourceIndex) ? i.sourceIndex : -1;
      const estimatedShares = safeNumber(i.estimatedShares);
      const displayedShares = estimatedMode ? safeNumber(i.cantidad) - estimatedShares : safeNumber(i.cantidad);
      const displayName = estimatedMode ? (i.shortName || i.nombre || i.data) : (i.nombre || i.shortName || i.data);
      return `<tr class="${estimatedMode ? "" : "clickable-row"}" data-investment-index="${idx}">
        <td class="investment-name col-detail" title="${escapeAttr(displayName)}">${escapeHtml(displayName)}</td>
        <td class="amount col-qty">${isCashInvestmentPosition(i) ? '—' : quantityFmt(displayedShares)}</td>
        ${estimatedMode ? `<td class="amount col-qty estimated-shares-cell">${isCashInvestmentPosition(i) ? '—' : estimatedSharesFmt(estimatedShares)}</td>` : ""}
        <td class="amount col-money">${isCashInvestmentPosition(i) ? '—' : money(i.valor, 2)}</td>
        <td class="amount col-money">${money(currentInvestmentTotal(i), 2)}</td>
        <td class="amount col-pct">${pctCell(dailyInvestmentPct(i))}</td>
      </tr>`;
    }).join("");
    return [group + body];
  });
  const body = rows.join("");
  const estimatedColumn = estimatedMode ? `<col class="col-qty">` : "";
  const estimatedHeader = estimatedMode ? `<th class="col-qty">Est.</th>` : "";
  const columnCount = estimatedMode ? 6 : 5;
  document.getElementById("investmentEditTable").innerHTML = `<colgroup><col class="col-detail"><col class="col-qty">${estimatedColumn}<col class="col-money"><col class="col-money"><col class="col-pct"></colgroup><thead><tr><th class="col-detail"></th><th class="col-qty">Shares</th>${estimatedHeader}<th class="col-money">Price</th><th class="col-money">Value</th><th class="col-pct">%d</th></tr></thead><tbody>${body || `<tr><td class="empty" colspan="${columnCount}">Sin posiciones.</td></tr>`}</tbody>`;
  document.querySelectorAll("#investmentEditTable [data-investment-index]").forEach(row => {
    if (!investmentEstimateEnabled()) row.addEventListener("click", () => openInvestmentDetail(Number(row.dataset.investmentIndex)));
  });
}


function fitInvestmentTables() {
  fitInvestmentTableColumns("investmentEditTable", 0);
  fitInvestmentTableColumns("investmentBreakdownTable", 0);
}

function fitInvestmentTableColumns(tableId, flexibleColumnIndex = 0) {
  const table = document.getElementById(tableId);
  if (!table || !table.offsetParent) return;
  const cols = [...table.querySelectorAll("colgroup col")];
  if (!cols.length) return;

  table.style.tableLayout = "auto";
  cols.forEach(col => {
    col.style.width = "";
    col.style.minWidth = "";
  });

  const columnCount = cols.length;
  const measuredWidths = Array(columnCount).fill(0);
  const rows = [...table.querySelectorAll("tr")];

  rows.forEach(row => {
    let columnIndex = 0;
    [...row.children].forEach(cell => {
      const span = Math.max(1, Number(cell.colSpan) || 1);
      if (span === 1 && columnIndex !== flexibleColumnIndex) {
        measuredWidths[columnIndex] = Math.max(measuredWidths[columnIndex], cell.scrollWidth);
      }
      columnIndex += span;
    });
  });

  measuredWidths.forEach((width, index) => {
    if (index === flexibleColumnIndex || !cols[index]) return;
    const safeWidth = Math.ceil(width + 1);
    cols[index].style.width = `${safeWidth}px`;
  });

  table.style.tableLayout = "fixed";
}

function debounce(fn, wait = 100) {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}

const refitInvestmentTablesOnViewportChange = debounce(() => fitInvestmentTables?.(), 150);
window.addEventListener("resize", refitInvestmentTablesOnViewportChange);
window.addEventListener("orientationchange", refitInvestmentTablesOnViewportChange);

function renderInvestmentBreakdownCharts(summary) {
  const selectedType = state.summaryModes.investmentOverviewType;
  const selectedMode = state.summaryModes.investmentOverviewMode;
  document.querySelectorAll("[data-investment-overview-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.investmentOverviewMode === selectedMode);
  });
  document.getElementById("investmentOverviewMode")?.classList.toggle("hidden", Boolean(selectedType));
  document.getElementById("investmentOverviewTitle").textContent = selectedType ? selectedType : "Inversiones";
  if (selectedType) return renderInvestmentPositionCharts(selectedType);
  if (selectedMode === "gains") {
    return renderInvestmentGainBreakdown(summary);
  }
  const rows = investmentTypes()
    .map((type, idx) => ({ label: type, value: summary.investedByType[type] || 0, color: chartColor(PIE_CHART_COLORS, idx + 2) }))
    .filter(row => row.value > 0);
  renderColorRowsTable("investmentOverviewTable", rows, ["", "Detalle", "Invertido", ""]);
  upsertChart("investmentBreakdownDonut", "doughnut", {
    labels: rows.map(row => row.label),
    datasets: [{ data: rows.map(row => row.value), backgroundColor: rows.map(row => row.color), borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions("Invertido", { legend: false }));
}

function addInvestmentRow() {
  if (investmentEstimateEnabled()) {
    setNotice("Cambia a modo real para editar posiciones manuales.", "warn");
    return;
  }
  state.investments.push({ rowNumber: null, isDraftNew: true, divisa: "EUR", data: "", nombre: "", shortName: "", tipo: investmentTypes()[0] || "Cartera", cantidad: 0, valor: 0, total: 0, valorAnterior: 0, variacion: 0 });
  openInvestmentDetail(state.investments.length - 1);
}

async function saveInvestments() {
  readInvestmentEditor();
  const payload = { action: "saveInvestments", sheetName: state.config.investmentSheet, investments: state.investments };
  if (!state.config.scriptUrl) {
    writeDataCache({ dirtySections: ["investments"] });
    rememberPendingSnapshot("investments");
    setNotice(lineMessage("Para modificar inversiones necesitas Apps Script.", "Cambio guardado solo en cache local."), "warn");
    renderInvestments();
    return;
  }
  const btn = document.getElementById("saveInvestmentsBtn");
  markButtonSaving(btn);
  try {
    writeDataCache({ dirtySections: queuePayloadSections(payload) });
    queueOp(payload);
    markButtonSaved(btn);
    setNotice("Inversiones guardadas en local y enviadas a Sheets.", "ok");
  } catch (error) {
    restoreButton(btn);
    setNotice(lineMessage("No se pudo preparar el guardado.", error.message), "warn");
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
  document.getElementById("editMovementAccount").value = t.cuenta || "";
  document.querySelector("#movementDetailForm .future-account-field")?.classList.toggle("hidden", state.movementMode !== "future");
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
    sid: previous.sid,
    rowNumber: previous.rowNumber,
    fecha: document.getElementById("editMovementDate").value,
    tipo: document.getElementById("editMovementType").value,
    concepto: document.getElementById("editMovementConcept").value,
    descripcion: document.getElementById("editMovementDescription").value,
    importe: document.getElementById("editMovementAmount").value,
    cuenta: state.movementMode === "future" ? document.getElementById("editMovementAccount").value.trim() : previous.cuenta
  });
  if (!movement) {
    restoreButton(btn);
    return;
  }
  const saveWithAccount = account => {
    try {
      const accountDelta = roundMoney(movement.amount - previous.amount);
      if (account && accountDelta) applyBankDelta(account, accountDelta);
      if (state.movementMode !== "future") applyInvestmentMovementMirror(previous, movement);
      list[index] = movement;
      writeDataCache();
      if (state.config.scriptUrl) {
        queueOp({
          action: "updateMovement",
          movement: serializeTransaction(movement),
          previousMovement: serializeTransaction(previous),
          sheetName: state.movementMode === "future" ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet
        });
        if (account && accountDelta) queueOp({ action: "saveBanks", bankSheet: state.config.bankSheet || "Bancos", banks: state.banks });
        setNotice("Movimiento actualizado en local y en cola.", "ok");
      } else {
        setNotice(lineMessage("Cambio local.", "Para guardar en Sheets necesitas Apps Script."), "warn");
      }
      markButtonSaved(btn);
      document.getElementById("movementDetailDialog").close();
      syncOptions();
      renderDataScope("movements");
    } catch (error) {
      restoreButton(btn);
      setNotice(`No se pudo guardar: ${error.message}`, "warn");
    }
  };
  try {
    const accountDelta = roundMoney(movement.amount - previous.amount);
    if (state.movementMode !== "future" && state.banks.length && accountDelta) {
      promptMovementDeleteAccount({
        title: "Aplicar cambio de dinero",
        amount: accountDelta,
        onConfirm: account => saveWithAccount(account),
        onCancel: () => restoreButton(btn)
      });
      return;
    }
    saveWithAccount("");
  } catch (error) {
    restoreButton(btn);
    setNotice(`No se pudo guardar: ${error.message}`, "warn");
  }
}

async function deleteMovementDetail() {
  const btn = document.getElementById("deleteMovementBtn");
  const index = Number(document.getElementById("editMovementIndex").value);
  const list = getDisplayedMovements();
  const movement = list[index];
  if (!movement) return;
  markButtonSaving(btn, "Eliminando");
  const accountDelta = -Number(movement.amount || 0);
  const finalizeDelete = account => {
    try {
      if (account) applyBankDelta(account, accountDelta);
      if (state.movementMode !== "future") applyInvestmentCostDeltaLocal(movement, -1);
      list.splice(index, 1);
      writeDataCache();
      if (state.config.scriptUrl) {
        queueOp({
          action: "deleteMovement",
          rowNumber: movement.rowNumber,
          movement: serializeTransaction(movement),
          sheetName: state.movementMode === "future" ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet
        });
        if (account) queueOp({ action: "saveBanks", bankSheet: state.config.bankSheet || "Bancos", banks: state.banks });
        setNotice("Movimiento eliminado.", "ok");
      } else {
        setNotice(lineMessage("Eliminado solo en pantalla.", "Para borrar en Sheets necesitas Apps Script."), "warn");
      }
      markButtonSaved(btn, "Eliminado");
      document.getElementById("movementDetailDialog").close();
      syncOptions();
      renderDataScope("movements");
    } catch (error) {
      restoreButton(btn);
      setNotice(`No se pudo eliminar: ${error.message}`, "warn");
    }
  };
  try {
    if (!state.banks.length) {
      finalizeDelete("");
      return;
    }
    promptMovementDeleteAccount({
      title: "Aplicar a cuenta",
      amount: accountDelta,
      onConfirm: account => finalizeDelete(account),
      onCancel: () => restoreButton(btn)
    });
  } catch (error) {
    restoreButton(btn);
    setNotice(`No se pudo eliminar: ${error.message}`, "warn");
  }
}

function openInvestmentDetail(index) {
  const item = state.investments[index];
  if (!item) return;
  document.getElementById("editInvestmentIndex").value = index;
  document.getElementById("editInvestmentCurrency").value = item.divisa || "EUR";
  document.getElementById("editInvestmentData").value = item.data;
  document.getElementById("editInvestmentName").value = item.nombre;
  document.getElementById("editInvestmentShortName").value = item.shortName || "";
  document.getElementById("editInvestmentType").value = item.tipo || investmentTypes()[0];
  const quantityInput = document.getElementById("editInvestmentQuantity");
  const priceInput = document.getElementById("editInvestmentValue");
  const totalInput = document.getElementById("editInvestmentTotal");
  quantityInput.value = Number.isFinite(safeNumber(item.cantidad)) ? safeNumber(item.cantidad) : "";
  priceInput.value = Number.isFinite(safeNumber(item.valor)) ? safeNumber(item.valor) : "";
  totalInput.value = round2(currentInvestmentTotal(item));
  syncInvestmentDetailInputLocks();
  document.getElementById("investmentDetailDialog").showModal();
}

function investmentDetailLooksCash() {
  const data = document.getElementById("editInvestmentData")?.value.trim() || "";
  const name = document.getElementById("editInvestmentName")?.value.trim() || "";
  const shortName = document.getElementById("editInvestmentShortName")?.value.trim() || "";
  return isCashInvestmentPosition({ data, nombre: name, shortName });
}

function syncInvestmentDetailInputLocks() {
  const isCash = investmentDetailLooksCash();
  const quantityInput = document.getElementById("editInvestmentQuantity");
  const priceInput = document.getElementById("editInvestmentValue");
  const totalInput = document.getElementById("editInvestmentTotal");
  if (!quantityInput || !priceInput || !totalInput) return;
  quantityInput.readOnly = isCash;
  priceInput.readOnly = true;
  totalInput.readOnly = !isCash;
  if (isCash) {
    quantityInput.value = "";
    priceInput.value = "";
  } else {
    syncInvestmentDetailComputedTotal();
  }
}

function syncInvestmentDetailComputedTotal() {
  const quantity = Number(document.getElementById("editInvestmentQuantity")?.value || 0);
  const value = Number(document.getElementById("editInvestmentValue")?.value || 0);
  const totalInput = document.getElementById("editInvestmentTotal");
  if (totalInput && totalInput.readOnly) totalInput.value = round2(quantity * value);
}

async function saveInvestmentDetail(event) {
  event.preventDefault();
  const btn = event.submitter;
  markButtonSaving(btn);
  const index = Number(document.getElementById("editInvestmentIndex").value);
  const item = state.investments[index];
  if (!item) {
    restoreButton(btn);
    return;
  }
  await withButtonState(btn, async () => {
    const previousItem = { ...item };
    const detailData = document.getElementById("editInvestmentData").value.trim();
    const detailName = document.getElementById("editInvestmentName").value.trim();
    const detailShortName = document.getElementById("editInvestmentShortName").value.trim();
    const isNewInvestment = Boolean(item.isDraftNew || !item.rowNumber);
    const detailIsCash = isCashInvestmentPosition({
      data: detailData,
      nombre: detailName,
      shortName: detailShortName
    });
    Object.assign(item, {
      divisa: document.getElementById("editInvestmentCurrency").value.trim().toUpperCase() || "EUR",
      data: detailData,
      nombre: detailName,
      shortName: detailShortName,
      tipo: document.getElementById("editInvestmentType").value,
      cantidad: detailIsCash ? NaN : Number(document.getElementById("editInvestmentQuantity").value || 0)
    });
    if (detailIsCash) {
      item.total = Number(document.getElementById("editInvestmentTotal").value || 0);
      item.valorAnterior = item.total;
    } else {
      item.total = roundMoney(safeNumber(item.cantidad) * safeNumber(item.valor));
    }
    recalculateInvestmentTotal(item);
    item.isDraftNew = false;
    recalculateInvestmentTotalsLocalFromPositions();
    writeDataCache();

    document.getElementById("investmentDetailDialog").close();
    syncOptions();
    renderDataScope("investments");

    if (state.config.scriptUrl) {
      queueOp({
        action: "updateInvestment",
        sheetName: state.config.investmentSheet,
        investment: { ...item },
        previousInvestment: previousItem,
        newInvestment: isNewInvestment
      });
      setNotice("Cambio aplicado en caché y enviado a Sheets.", "ok");
      setSyncStatus("Subiendo cambio", "");
    } else {
      rememberPendingSnapshot("investments");
      setNotice(lineMessage("Cambio local.", "Para guardar en Sheets necesitas Apps Script."), "warn");
    }
    markButtonSaved(btn);
    renderInvestments();
  });
}

async function deleteInvestmentDetail(event) {
  const btn = event.currentTarget;
  markButtonSaving(btn);
  const index = Number(document.getElementById("editInvestmentIndex").value);
  const item = state.investments[index];
  if (!item) {
    restoreButton(btn);
    return;
  }
  await withButtonState(btn, async () => {
    const previousItem = { ...item };
    state.investments.splice(index, 1);
    recalculateInvestmentTotalsLocalFromPositions();
    writeDataCache();

    document.getElementById("investmentDetailDialog").close();
    syncOptions();
    renderDataScope("investments");

    if (state.config.scriptUrl && previousItem.rowNumber) {
      queueOp({
        action: "deleteInvestment",
        sheetName: state.config.investmentSheet,
        investment: previousItem,
        rowNumber: previousItem.rowNumber
      });
      setNotice("Posición eliminada en caché y enviada a Sheets.", "ok");
      setSyncStatus("Eliminando posición", "");
    } else if (state.config.scriptUrl) {
      setNotice("Posición nueva eliminada localmente.", "ok");
    } else {
      rememberPendingSnapshot("investments");
      setNotice(lineMessage("Eliminada solo en pantalla.", "Para borrar en Sheets necesitas Apps Script."), "warn");
    }
    markButtonSaved(btn, "Eliminado");
    renderInvestments();
  });
}

async function submitMovement(event) {
  event.preventDefault();
  investmentDebug("submitMovement inicio", {
    formType: document.getElementById("formType")?.value,
    formConcept: document.getElementById("formConcept")?.value,
    formDescription: document.getElementById("formDescription")?.value,
    formDate: document.getElementById("formDate")?.value,
    formAmount: document.getElementById("formAmount")?.value,
    recurring: isRecurringMode()
  });
  if (!state.config.scriptUrl) {
    setNotice("Configura Apps Script antes de enviar movimientos.", "warn");
    return;
  }
  const isTransfer = normalizeType(document.getElementById("formType").value) === "transferencia";
  const isRecurring = isRecurringMode();
  const btn = document.getElementById("submitMovement");
  state.submittingMovement = true;
  syncRegistrarActionButton();
  markButtonSaving(btn);
  try {
    if (isRecurring && isTransfer) {
      const transfers = transferMovementsFromRecurrenceForm();
      if (!transfers.length) throw new Error("selecciona fechas y al menos un día");
      const from = document.getElementById("formTransferFrom").value;
      const to = document.getElementById("formTransferTo").value;
      const amount = Math.abs(Number(document.getElementById("formAmount").value || 0));
      if (!amount || !from || !to || from === to) throw new Error("elige origen, destino e importe valido");
      const today = endOfToday();
      const realized = transfers.filter(m => m.date <= today);
      const futureMovs = transfers.filter(m => m.date > today);
      const fromBefore = getBankAmount(from);
      const toBefore = getBankAmount(to);
      realized.forEach(() => {
        applyBankDelta(from, -amount);
        applyBankDelta(to, amount);
      });
      state.futureTransactions.push(...futureMovs);
      writeDataCache();
      queueOp({
        action: "addTransfersBatch",
        transfers: transfers.map(serializeTransaction),
        futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros",
        bankSheet: state.config.bankSheet || "Bancos",
        from,
        to,
        amount
      });
      showMovementPopup("Transferencias periódicas guardadas", futureMovs[0] || realized[0], `${from} → ${to}`, lineMessage(
        `${realized.length} ${plural(realized.length, "activada", "activadas")} y ${futureMovs.length} futuras`,
        realized.length ? lineMessage(`Origen: ${bankChangeText(from, fromBefore)}`, `Destino: ${bankChangeText(to, toBefore)}`) : ""
      ));
    } else if (isRecurring && !isTransfer) {
      const movements = movementsFromRecurrenceForm();
      if (!movements.length) throw new Error("selecciona fechas y al menos un día");
      const account = document.getElementById("recurrenceAccount").value;
      movements.forEach(movement => { movement.cuenta = account; });
      const today = endOfToday();
      const realized = movements.filter(m => m.date <= today);
      const futureMovs = movements.filter(m => m.date > today);
      const accountBefore = getBankAmount(account);
      const totalBefore = sum(state.banks.map(b => b.dinero));
      realized.forEach(m => {
        applyBankDelta(account, m.amount);
        applyInvestmentCostDeltaLocal(m, 1);
      });
      const totalAfter = sum(state.banks.map(b => b.dinero));
      state.transactions.push(...realized);
      state.futureTransactions.push(...futureMovs);
      state.pendingInvestmentSummaryPopup = {
        title: "Movimientos periódicos guardados",
        movement: realized[0] || futureMovs[0] || null,
        account,
        extra: lineMessage(
          `${realized.length} ${plural(realized.length, "realizado", "realizados")} y ${futureMovs.length} futuros`,
          realized.length ? bankChangeLines(totalBefore, totalAfter, account, accountBefore) : ""
        )
      };
      scheduleInvestmentAllocationForRegistration(realized, { source: "registro", respectDay: false });
      writeDataCache();
      queueOp({ action: "addMovementsBatch", movements: movements.map(serializeTransaction), movementSheet: state.config.movementSheet, futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros", bankSheet: state.config.bankSheet || "Bancos", account });
    } else if (isTransfer) {
      const amount = Math.abs(Number(document.getElementById("formAmount").value || 0));
      const from = document.getElementById("formTransferFrom").value;
      const to = document.getElementById("formTransferTo").value;
      if (!amount || !from || !to || from === to) throw new Error("elige origen, destino e importe valido");
      const fromBefore = getBankAmount(from);
      const toBefore = getBankAmount(to);
      applyBankDelta(from, -amount);
      applyBankDelta(to, amount);
      writeDataCache();
      queueOp({ action: "transferBank", bankSheet: state.config.bankSheet || "Bancos", from, to, amount });
      setNotice(lineMessage("Traspaso hecho", `Origen: ${bankChangeText(from, fromBefore)}`, `Destino: ${bankChangeText(to, toBefore)}`), "ok");
    } else {
      const movement = movementFromForm();
      const future = movement.date > endOfToday();
      const isInvestmentRegistration = !future && (
        isInvestmentMovement(movement)
        || normalizeType(document.getElementById("formType")?.value) === "inversion"
        || normalizeType(document.getElementById("formConcept")?.value) === "inversion"
      );
      investmentDebug("movimiento puntual clasificado", {
        movement: movement ? {
          sid: movement.sid,
          date: formatDate(movement.date),
          tipo: movement.tipo,
          concepto: movement.concepto,
          descripcion: movement.descripcion,
          amount: movement.amount
        } : null,
        future,
        isInvestmentMovement: isInvestmentMovement(movement),
        rawTypeNormalized: normalizeType(document.getElementById("formType")?.value),
        rawConceptNormalized: normalizeType(document.getElementById("formConcept")?.value),
        isInvestmentRegistration
      });
      const account = document.getElementById("formAccount").value;
      movement.cuenta = account;
      const bankBefore = getBankAmount(account);
      const totalBefore = sum(state.banks.map(b => b.dinero));
      if (!future) {
        applyBankDelta(account, movement.amount);
        applyInvestmentCostDeltaLocal(movement, 1);
      }
      (future ? state.futureTransactions : state.transactions).push(movement);
      if (isInvestmentRegistration) {
        state.pendingInvestmentSummaryPopup = {
          title: "Movimiento guardado",
          movement,
          account,
          extra: bankChangeLines(totalBefore, sum(state.banks.map(b => b.dinero)), account, bankBefore)
        };
      } else {
        state.pendingInvestmentSummaryPopup = null;
      }
      writeDataCache();
      queueOp({
        action: future ? "addFutureMovement" : "addMovement",
        movement: serializeTransaction(movement),
        sheetName: future ? (state.config.futureMovementSheet || "Movimientos futuros") : state.config.movementSheet,
        bankSheet: state.config.bankSheet || "Bancos",
        account
      });
      if (isInvestmentRegistration) {
        investmentDebug("programando popup de reparto", { sid: movement.sid });
        scheduleInvestmentAllocationForRegistration([movement], { source: "registro", respectDay: false });
      } else {
        investmentDebug("abriendo resumen directamente", { reason: future ? "movimiento futuro" : "no clasificado como inversión" });
        showMovementPopup(
          future ? "Movimiento futuro guardado" : "Movimiento guardado",
          movement,
          account,
          !future ? bankChangeLines(totalBefore, sum(state.banks.map(b => b.dinero)), account, bankBefore) : ""
        );
      }
    }
    syncOptions();
    renderDataScope("movements");
    event.target.reset();
    setDefaultDate();
    syncRegistrarMode();
    markButtonSaved(btn);
  } catch (error) {
    console.error(`${INVESTMENT_DEBUG_PREFIX} submitMovement falló`, error);
    restoreButton(btn);
    setNotice(`No se pudo enviar: ${error.message}`, "warn");
  } finally {
    state.submittingMovement = false;
    syncRegistrarActionButton();
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

function transferMovementFromFormBase() {
  const from = document.getElementById("formTransferFrom").value;
  const to = document.getElementById("formTransferTo").value;
  const amount = Math.abs(Number(document.getElementById("formAmount").value || 0));
  const account = `${from} → ${to}`;
  return {
    tipo: "Transferencia",
    concepto: "Transferencia",
    descripcion: account,
    importe: amount,
    cuenta: account,
    transferFrom: from,
    transferTo: to
  };
}

function transferMovementsFromRecurrenceForm() {
  const start = parseDate(document.getElementById("recurrenceStart").value);
  const end = parseDate(document.getElementById("recurrenceEnd").value);
  if (!start || !end || start > end) return [];
  const selected = [...document.querySelectorAll("#recurrencePicker input:checked")].map(i => Number(i.value));
  if (!selected.length) return [];
  const type = document.getElementById("recurrenceType").value;
  const base = transferMovementFromFormBase();
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
  syncRegistrarMode();
}

function isRecurringMode() {
  return document.querySelector('[data-register-mode].active')?.dataset.registerMode === 'recurring';
}

function enforceTransferPositiveAmount() {
  const type = normalizeType(document.getElementById("formType")?.value || "");
  const amountInput = document.getElementById("formAmount");
  if (type !== "transferencia" || !amountInput || amountInput.value === "") return;
  const value = Number(amountInput.value);
  if (Number.isFinite(value) && value < 0) amountInput.value = String(Math.abs(value));
}

function syncRegisterMode() {
  const recurring = isRecurringMode();
  const isTransfer = normalizeType(document.getElementById('formType').value) === 'transferencia';
  const showRecurring = recurring;
  document.getElementById('registrar')?.classList.toggle('recurring-register-active', showRecurring);
  document.getElementById('movementForm')?.classList.toggle('recurring-form-active', showRecurring);
  document.getElementById('movementForm')?.classList.toggle('single-form-active', !showRecurring);
  document.getElementById('recurringFields')?.classList.toggle('hidden', !showRecurring);
  document.querySelector('#movementForm .recurring-account')?.classList.toggle('hidden', !showRecurring || isTransfer);
  document.querySelectorAll('#movementForm .movement-only').forEach(el => {
    const fieldId = el.querySelector('input, select')?.id;
    const hiddenInRecurring = ['formDate', 'formAccount'].includes(fieldId);
    el.classList.toggle('hidden', isTransfer || (showRecurring && hiddenInRecurring));
  });
  const formDate = document.getElementById('formDate');
  if (formDate) formDate.required = !showRecurring && !isTransfer;
  const recurrenceAccount = document.getElementById('recurrenceAccount');
  if (recurrenceAccount) recurrenceAccount.required = showRecurring && !isTransfer;
  ['recurrenceStart', 'recurrenceEnd'].forEach(id => { const el = document.getElementById(id); if (el) el.required = showRecurring; });
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
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, i) => ({ label, value: i }))
    : Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
  picker.innerHTML = `<p>${type === 'weekly' ? 'Días de la semana' : 'Días del mes'}</p><div class="choice-grid ${type}">${items.map(item => `<label><input type="checkbox" value="${item.value}"><span>${item.label}</span></label>`).join('')}</div>`;
}

function setMovementModeFromClick(event) {
  const btn = event.target.closest('[data-movement-mode]');
  if (!btn) return;
  state.movementMode = btn.dataset.movementMode;
  document.querySelectorAll('[data-movement-mode]').forEach(b => b.classList.toggle('active', b === btn));
  state.movementBulkEdit = false;
  state.movementDrill = { level: 'years', year: null, month: null };
  renderMovements();
}

function getDisplayedMovements() {
  return state.movementMode === 'future' ? state.futureTransactions : state.transactions;
}

function renderFutureDueNotice() {
  const due = state.futureTransactions.filter(t => t.date <= endOfToday());
  if (!due.length) return;
  if (state.config.scriptUrl) {
    setSyncStatus(`Moviendo ${due.length} movimiento(s) futuro(s) vencido(s)`, "");
    return;
  }
  showMovementPopup(
    "Movimientos futuros vencidos",
    null,
    "",
    lineMessage(`${due.length} movimiento(s) son de hoy o anteriores.`, "Configura Apps Script para moverlos automáticamente.")
  );
}

function movementPopupHtml(movement, account, extra = '') {
  if (String(extra).trim().startsWith("<")) return extra;
  if (!movement) return extra ? `<p>${formatNoticeHtml(extra)}</p>` : "";
  const rows = [
    ["Fecha", formatDate(movement.date)],
    ["Tipo", movement.tipo],
    ["Concepto", movement.concepto],
    ["Descripción", movement.descripcion],
    ["Cuenta", account || movement.cuenta || "Sin cuenta"],
    ["Importe", money(movement.amount)]
  ];
  return `<div class="saved-movement-stack">
    ${movementExtraCards(extra)}
    ${popupInfoCard("Resumen del movimiento", rows)}
  </div>`;
}

function movementExtraCards(extra) {
  const lines = String(extra || "").split(/\s*\/\/\s*/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const summaryRows = [];
  const bankRows = [];
  lines.forEach(line => {
    const separator = line.indexOf(":");
    if (separator > 0) {
      bankRows.push([line.slice(0, separator), line.slice(separator + 1).trim()]);
    } else {
      summaryRows.push(["Resumen", line]);
    }
  });
  return [
    summaryRows.length ? popupInfoCard("Movimiento realizado", summaryRows) : "",
    bankRows.length ? popupInfoCard("Evolución bancos", bankRows) : ""
  ].join("");
}

function popupInfoCard(title, rows) {
  return `<section class="saved-movement-card">
    <h3>${escapeHtml(title)}</h3>
    ${rows.map(([label, value]) => `
    <div class="saved-movement-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`).join("")}
  </section>`;
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
  investmentDebug("showMovementPopup solicitado", {
    title,
    sid: movement?.sid || null,
    dialogExists: Boolean(dialog),
    dialogOpen: Boolean(dialog?.open),
    pendingAllocationCount: state.pendingInvestmentAllocationPrompts.length,
    allocationDialogOpen: Boolean(document.getElementById("investmentAllocationDialog")?.open),
    hasPendingSummary: Boolean(state.pendingInvestmentSummaryPopup)
  });
  if (!dialog) return;
  if (state.pendingInvestmentSummaryPopup && state.pendingInvestmentAllocationPrompts.length) {
    state.pendingInvestmentSummaryPopup = { title, movement, account, extra };
    return;
  }
  document.getElementById('movementPopupTitle').textContent = title;
  document.getElementById('movementPopupBody').innerHTML = movementPopupHtml(movement, account, extra);
  if (!dialog.open) dialog.showModal();
  lucide.createIcons();
}

function loadInvestmentGoals() {
  try { return normalizeInvestmentGoals(JSON.parse(localStorage.getItem('investmentGoals') || '{}')); }
  catch { return normalizeInvestmentGoals({}); }
}

function editInvestmentGoals(focusGoal = "") {
  const current = state.investmentGoals;
  document.getElementById("goalExpenseMonthlyInput").value = formatDecimalInput(current.expenseMonthly);
  document.getElementById("goalInvestmentMonthlyInput").value = formatDecimalInput(monthlyInvestmentGoal());
  document.getElementById("goalYearlyInput").value = formatDecimalInput(current.yearly);
  document.getElementById("goalTotalInput").value = formatDecimalInput(current.total);
  document.getElementById("investmentGoalsDialog").showModal();
  const focusMap = {
    expense: "goalExpenseMonthlyInput",
    investment: "goalInvestmentMonthlyInput"
  };
  const input = document.getElementById(focusMap[focusGoal]);
  if (input) window.setTimeout(() => input.focus(), 30);
}

async function saveInvestmentGoalsFromDialog(event) {
  event.preventDefault();
  const btn = event.submitter;
  markButtonSaving(btn);
  const expenseMonthly = roundMoney(document.getElementById("goalExpenseMonthlyInput").value);
  const investmentMonthly = roundMoney(document.getElementById("goalInvestmentMonthlyInput").value);
  const yearly = roundMoney(document.getElementById("goalYearlyInput").value);
  const total = roundMoney(document.getElementById("goalTotalInput").value);
  state.investmentGoals = normalizeInvestmentGoals({ expenseMonthly, investmentMonthly, monthly: investmentMonthly, yearly, total });
  localStorage.setItem('investmentGoals', JSON.stringify(state.investmentGoals));
  writeDataCache({ dirtySections: ["investmentGoals"] });
  rememberPendingSnapshot("investmentGoals");
  renderDataScope("investments");
  if (state.config.scriptUrl) {
    try {
      queueOp({ action: "saveInvestmentGoals", sheetName: state.config.objectiveSheet || "Objetivos", goals: state.investmentGoals });
      document.getElementById("investmentGoalsDialog").close();
      markButtonSaved(btn);
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

function normalizeInvestmentGoals(value) {
  const goals = { incomeMonthly: 0, expenseMonthly: 0, investmentMonthly: 0, monthly: 0, yearly: 0, total: 0 };
  if (!value || typeof value !== "object") return goals;
  Object.entries(value).forEach(([key, raw]) => {
    const normalized = normalizeGoalKey(key);
    const parsed = parseNumber(raw);
    if (normalized && Number.isFinite(parsed)) goals[normalized] = parsed;
  });
  ["incomeMonthly", "expenseMonthly", "investmentMonthly", "monthly", "yearly", "total"].forEach(key => {
    const parsed = parseNumber(value[key]);
    if (Number.isFinite(parsed)) goals[key] = parsed;
  });
  if (!goals.investmentMonthly && goals.monthly) goals.investmentMonthly = goals.monthly;
  if (!goals.monthly && goals.investmentMonthly) goals.monthly = goals.investmentMonthly;
  return goals;
}

function normalizeGoalKey(value) {
  const text = normalizeType(value);
  if (["gasto mensual", "limite de gasto mensual", "gastos mensuales", "expense monthly", "expensemonthly"].includes(text)) return "expenseMonthly";
  if (["inversion mensual", "objetivo de inversion mensual", "investment monthly", "investmentmonthly"].includes(text)) return "investmentMonthly";
  if (["inversion anual", "anual", "yearly"].includes(text)) return "yearly";
  if (["inversion total", "total"].includes(text)) return "total";
  if (text === "mensual" || text === "monthly") return "monthly";
  return "";
}

function monthlyInvestmentGoal() {
  return safeNumber(state.investmentGoals.investmentMonthly || state.investmentGoals.monthly);
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
    ['Inversión mensual', monthlyInvestmentGoal(), realizedMonth, plannedMonth, 'investment'],
    ['Inversión anual', state.investmentGoals.yearly, realizedYear, plannedYear],
    ['Inversión total', state.investmentGoals.total, realizedTotal, plannedTotal]
  ];
  el.innerHTML = cards.map(([label, goal, done, planned, systemGoal]) => {
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
  el.querySelectorAll("[data-edit-system-goal]").forEach(btn => {
    btn.addEventListener("click", () => editInvestmentGoals(btn.dataset.editSystemGoal));
  });
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

function bankChangeLines(totalBefore, totalAfter, account, accountBefore) {
  return lineMessage(
    `Banco: ${money(totalBefore)} a ${money(totalAfter)}`,
    account ? `${account}: ${money(accountBefore)} a ${money(getBankAmount(account))}` : ""
  );
}

function promptMovementDeleteAccount({ title, amount, onConfirm, onCancel }) {
  const dialog = document.getElementById("movementDeleteAccountDialog");
  if (!dialog) return;
  document.getElementById("movementDeleteAccountTitle").textContent = title || "Aplicar a cuenta";
  document.getElementById("movementDeleteAccountAmount").textContent = `${amount >= 0 ? "Añadir" : "Restar"} ${money(Math.abs(amount))} en cuentas`;
  const select = document.getElementById("movementDeleteAccountSelect");
  select.innerHTML = state.banks.map(bank => `<option value="${escapeAttr(bank.cuenta)}">${escapeHtml(bank.cuenta)}</option>`).join("");
  dialog.__onConfirm = onConfirm;
  dialog.__onCancel = onCancel;
  dialog.showModal();
}

function closeMovementAccountPrompt() {
  const dialog = document.getElementById("movementDeleteAccountDialog");
  if (!dialog) return;
  const onCancel = dialog.__onCancel;
  dialog.__onConfirm = null;
  dialog.__onCancel = null;
  dialog.close();
  if (typeof onCancel === "function") onCancel();
}

async function confirmMovementDeleteAccount(event) {
  event.preventDefault();
  const dialog = document.getElementById("movementDeleteAccountDialog");
  const account = document.getElementById("movementDeleteAccountSelect").value;
  const onConfirm = dialog.__onConfirm;
  dialog.__onConfirm = null;
  dialog.__onCancel = null;
  dialog.close();
  if (typeof onConfirm === "function") await onConfirm(account);
}

async function saveBanks() {
  const btn = document.getElementById("saveBanksBtn");
  markButtonSaving(btn);
  document.querySelectorAll("[data-bank-index]").forEach(input => {
    const idx = Number(input.dataset.bankIndex);
    if (state.banks[idx]) state.banks[idx].dinero = roundMoney(input.value);
  });
  if (!state.config.scriptUrl) {
    writeDataCache({ dirtySections: ["banks"] });
    rememberPendingSnapshot("banks");
    renderSummary();
    markButtonSaved(document.getElementById("saveBanksBtn") || btn);
    renderPendingOpsBadge();
    return;
  }
  try {
    writeDataCache();
    queueOp({ action: "saveBanks", bankSheet: state.config.bankSheet || "Bancos", banks: state.banks });
    document.getElementById("moneyDialog")?.close();
    renderDataScope("banks");
    markButtonSaved(document.getElementById("saveBanksBtn") || btn);
    setNotice("Cuentas guardadas.", "ok");
  } catch (error) {
    restoreButton(document.getElementById("saveBanksBtn") || btn);
    setNotice(`No se pudieron guardar cuentas: ${error.message}`, "warn");
    renderSummary();
  }
}

async function fireAppsScript(payload) {
  if (navigator.onLine === false) throw new Error("Sin conexión");
  const finalPayload = withClientOpId(payload || {});
  await fetch(state.config.scriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      token: state.config.appToken,
      dataSheet: state.config.dataSheet || "Datos",
      investmentSheet: state.config.investmentSheet || "Inversiones",
      investmentTotalsSheet: state.config.investmentTotalsSheet || "Inversión Totales",
      investmentEstimateRulesSheet: state.config.investmentEstimateRulesSheet || "Inversiones Estimación Reglas",
      investmentEstimateLedgerSheet: state.config.investmentEstimateLedgerSheet || "Inversiones Estimación Movimientos",
      investmentMode: state.investmentMode || "real",
      movementSheet: state.config.movementSheet || "Control Finanzas",
      futureMovementSheet: state.config.futureMovementSheet || "Movimientos futuros",
      ...finalPayload
    })
  });
  return finalPayload;
}

async function postAppsScript(payload) {
  const finalPayload = await fireAppsScript(payload);
  await confirmClientOp(finalPayload.clientOpId);
}

async function confirmClientOp(clientOpId) {
  if (!clientOpId) return;
  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(Math.min(350 + attempt * 300, 2000));
    try {
      const payload = await fetchAppsScriptData({ action: "checkClientOp", clientOpId });
      if (payload?.ok && payload.completed) return;
      if (payload?.ok && payload.pending) continue;
    } catch (error) {
      if (attempt >= maxAttempts - 1) throw error;
    }
  }
  throw new Error("Apps Script no confirmó la operación todavía; se queda en cola y se reintentará.");
}

function createSid(prefix = "id") {
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeTransaction(row) {
  if (!row) return null;
  const date = parseDate(row.fecha || row.FECHA || row.date || row[0]);
  const tipo = prettyType(String(row.tipo || row.TIPO || row[4] || "").trim());
  const concepto = prettyType(String(row.concepto || row.CONCEPTO || row[5] || "").trim());
  const descripcion = String(row.descripcion || row.DESCRIPCION || row["DESCRIPCION"] || row[6] || "").trim();
  const amount = parseNumber(row.importe ?? row.IMPORTE ?? row.amount ?? row[7]);
  if (!date || !tipo || Number.isNaN(amount)) return null;
  const cuenta = String(row.cuenta || row.CUENTA || row.account || row[8] || "").trim();
  const transferParts = parseTransferAccountText(cuenta || descripcion);
  return {
    sid: String(row.sid || row.SID || row.Id || row.ID || row[9] || "").trim() || createSid("mov"),
    rowNumber: Number(row.rowNumber || row.row || 0) || null,
    date,
    tipo,
    concepto: concepto || (normalizeType(tipo) === "transferencia" ? "Transferencia" : "Otros"),
    descripcion,
    amount,
    cuenta,
    transferFrom: row.transferFrom || row.from || transferParts.from || "",
    transferTo: row.transferTo || row.to || transferParts.to || ""
  };
}

function parseTransferAccountText(value) {
  const text = String(value || "").trim();
  const separator = text.includes("→") ? "→" : text.includes("->") ? "->" : "";
  if (!separator) return { from: "", to: "" };
  const [from, to] = text.split(separator).map(part => part.trim());
  return { from: from || "", to: to || "" };
}

function isInvestmentPositionType(value) {
  const normalized = normalizeType(value);
  return investmentTypes().some(type => normalizeType(type) === normalized);
}

function isCashInvestmentPosition(item) {
  const name = removeAccents(String(item?.nombre || item?.name || item?.NAME || '')).toLowerCase();
  const ticker = String(item?.data || item?.DATA || '').trim();
  return name.includes('efectivo') || ticker === '---';
}

function normalizeInvestment(row) {
  const isArrayRow = Array.isArray(row);
  const divisa = String(row.divisa || row.DIVISA || row.currency || row.CURRENCY || row[0] || 'EUR').trim().toUpperCase() || 'EUR';
  const data = String(row.data || row.DATA || row.ticker || row.TICKER || row[1] || '').trim();
  const nombre = String(row.nombre || row.NOMBRE || row.name || row.NAME || row[2] || data).trim();
  const shortName = String(row.shortName || row.shortname || row.short_name || row.SHORT_NAME || row['SHORT NAME'] || row['Short Name'] || (isArrayRow ? row[3] : '') || '').trim();
  const tipo = prettyType(String(row.tipo || row.TIPO || row.type || row.TYPE || (isArrayRow ? row[4] : row[3]) || '').trim());
  const cantidad = parseNumber(row.cantidad ?? row.CANTIDAD ?? row.shares ?? row.SHARES ?? (isArrayRow ? row[5] : row[4]));
  const valor = parseNumber(row.valor ?? row.VALOR ?? row.price ?? row.PRICE ?? (isArrayRow ? row[6] : row[5]));
  const total = parseNumber(row.total ?? row.value ?? row.VALUE ?? row['VALOR TOTAL (€)'] ?? row['VALOR TOTAL'] ?? (isArrayRow ? row[7] : row[6]));
  const valorAnterior = parseNumber(row.valorAnterior ?? row.lastPrice ?? row['LAST PRICE'] ?? row['VALOR ANTERIOR'] ?? (isArrayRow ? row[8] : row[7]));
  const variacion = normalizePercentPoints(parseNumber(row.variacion ?? row.variation ?? row.VARIATION ?? row['% VARIACIÓN'] ?? row['% VARIACION'] ?? (isArrayRow ? row[9] : row[8])));
  const candidate = { data, nombre };
  const isCash = isCashInvestmentPosition(candidate);
  if (!nombre || !isInvestmentPositionType(tipo) || (!isCash && !data)) return null;
  if (!Number.isFinite(total) && !Number.isFinite(cantidad)) return null;
  return {
    rowNumber: Number(row.rowNumber || row.row || 0) || null,
    divisa,
    data,
    nombre,
    shortName,
    tipo,
    cantidad,
    valor,
    total,
    valorAnterior,
    variacion
  };
}


function normalizeInvestmentTotal(row) {
  const tipo = prettyType(String(row.tipo || row.TIPO || row.type || row.TYPE || row[0] || '').trim());
  if (!tipo) return null;
  return {
    rowNumber: Number(row.rowNumber || row.row || 0) || null,
    tipo,
    cost: parseNumber(row.cost ?? row.COST ?? row.invested ?? row[1]),
    value: parseNumber(row.value ?? row.VALUE ?? row.current ?? row[2]),
    lastValue: parseNumber(row.lastValue ?? row['LAST VALUE'] ?? row.previous ?? row[3]),
    daily: parseNumber(row.daily ?? row.DAILY ?? row[4]),
    dailyPct: normalizePercentPoints(parseNumber(row.dailyPct ?? row['%D'] ?? row[5])),
    gain: parseNumber(row.gain ?? row.GAIN ?? row[6]),
    gainPct: normalizePercentPoints(parseNumber(row.gainPct ?? row['%GAIN'] ?? row[7])),
    order: Number(row.order || row.ORDEN || row[8] || 0) || 0
  };
}


function normalizeInvestmentEstimateRule(row) {
  const isArrayRow = Array.isArray(row);
  const id = String(row.id || row.ID || row.ruleId || row[0] || createSid("rule")).trim();
  const activeRaw = row.activa ?? row.ACTIVA ?? row.active ?? row[1];
  const active = activeRaw === true || String(activeRaw || '').toLowerCase().trim() === 'true' || String(activeRaw || '').toLowerCase().trim() === 'sí' || String(activeRaw || '').toLowerCase().trim() === 'si' || String(activeRaw || '').trim() === '1';
  return {
    id,
    activa: active,
    dayOfMonth: Number(row.dayOfMonth ?? row.diaMes ?? row['DÍA MES'] ?? row['DIA MES'] ?? (isArrayRow ? row[2] : '')) || '',
    movementConcept: 'Inversión',
    movementDescription: String(row.movementDescription ?? row.descripcionMovimiento ?? row['DESCRIPCIÓN MOVIMIENTO'] ?? row['DESCRIPCION MOVIMIENTO'] ?? (isArrayRow ? row[3] : '') ?? '').trim(),
    tipo: '',
    data: String(row.data ?? row.DATA ?? row.ticker ?? row.TICKER ?? (isArrayRow ? row[4] : '') ?? '').trim(),
    nombre: String(row.nombre ?? row.NOMBRE ?? row.name ?? row.NAME ?? '').trim(),
    shortName: String(row.shortName ?? row['SHORT NAME'] ?? row.short_name ?? (isArrayRow ? row[5] : '') ?? '').trim(),
    percentage: parseNumber(row.percentage ?? row.porcentaje ?? row.PORCENTAJE ?? row['%'] ?? (isArrayRow ? row[6] : '')),
    fixedAmount: parseNumber(row.fixedAmount ?? row.importeFijo ?? row['IMPORTE FIJO'] ?? row['FIJO'] ?? (isArrayRow ? row[7] : '')),
    order: Number(row.order ?? row.orden ?? row.ORDEN ?? (isArrayRow ? row[8] : '')) || 0
  };
}

function normalizeInvestmentEstimateLedger(row) {
  const isArrayRow = Array.isArray(row);
  const activeRaw = row.activo ?? row.ACTIVO ?? row.active ?? row[1];
  const active = activeRaw !== false && String(activeRaw || 'TRUE').toLowerCase().trim() !== 'false' && String(activeRaw || '').toLowerCase().trim() !== 'no' && String(activeRaw || '').trim() !== '0';
  const date = parseDate(row.fechaMovimiento ?? row['FECHA MOVIMIENTO'] ?? row.fecha ?? (isArrayRow ? row[2] : ''));
  return {
    id: String(row.id || row.ID || row[0] || '').trim(),
    activo: active,
    fechaMovimiento: date,
    sidMovimiento: String(row.sidMovimiento ?? row['SID MOVIMIENTO'] ?? (isArrayRow ? row[3] : '') ?? '').trim(),
    reglaId: String(row.reglaId ?? row['REGLA ID'] ?? '').trim(),
    tipo: prettyType(String(row.tipo ?? row['TIPO INVERSIÓN'] ?? row['TIPO INVERSION'] ?? (isArrayRow ? row[4] : '') ?? '').trim()),
    data: String(row.data ?? row.DATA ?? row.ticker ?? (isArrayRow ? row[5] : '') ?? '').trim(),
    nombre: String(row.nombre ?? row.NOMBRE ?? (isArrayRow ? row[6] : '') ?? '').trim(),
    shortName: String(row.shortName ?? row['SHORT NAME'] ?? (isArrayRow ? row[7] : '') ?? '').trim(),
    importe: parseNumber(row.importe ?? row['IMPORTE'] ?? (isArrayRow ? row[8] : '')),
    precioUsado: parseNumber(row.precioUsado ?? row['PRECIO USADO'] ?? (isArrayRow ? row[9] : '')),
    sharesEstimadas: parseNumber(row.sharesEstimadas ?? row['SHARES ESTIMADAS'] ?? (isArrayRow ? row[10] : '')),
    origen: String(row.origen ?? row.ORIGEN ?? (isArrayRow ? row[11] : '') ?? '').trim(),
    createdAt: String(row.createdAt ?? row['CREATED AT'] ?? '').trim(),
    movimiento: String(row.movimiento ?? row.MOVIMIENTO ?? '').trim()
  };
}

function effectiveInvestmentPositions() {
  const positions = state.investments.map((item, sourceIndex) => ({ ...item, sourceIndex, estimatedShares: 0 }));
  if (!investmentEstimateEnabled()) return positions;
  activeInvestmentEstimateLedger().forEach(entry => {
    const shares = safeNumber(entry.sharesEstimadas);
    if (!shares) return;
    const match = findMatchingInvestmentPosition(positions, entry);
    if (match) {
      match.estimatedShares = safeNumber(match.estimatedShares) + shares;
      match.cantidad = safeNumber(match.cantidad) + shares;
      const price = currentPriceForEstimate(entry, match);
      if (Number.isFinite(price) && price > 0) match.valor = price;
      match.total = safeNumber(match.cantidad) * safeNumber(match.valor);
      if (!Number.isFinite(match.valorAnterior)) match.valorAnterior = safeNumber(match.valor);
      match.isEstimated = true;
    } else {
      const price = safeNumber(entry.precioUsado);
      positions.push({
        rowNumber: null,
        divisa: 'EUR',
        data: entry.data,
        nombre: entry.nombre || entry.data || 'Estimación',
        shortName: entry.shortName || entry.nombre || entry.data,
        tipo: entry.tipo || 'Cartera',
        cantidad: shares,
        valor: price,
        total: shares * price,
        valorAnterior: price,
        variacion: 0,
        isEstimated: true,
        estimatedShares: shares
      });
    }
  });
  return positions.map(item => recalculateInvestmentTotal(item));
}

function activeInvestmentEstimateLedger() {
  return (state.investmentEstimateLedger || []).filter(item => item && item.activo !== false && safeNumber(item.sharesEstimadas) > 0);
}

function findMatchingInvestmentPosition(positions, entry) {
  const data = normalizeType(entry.data);
  const type = normalizeType(entry.tipo);
  const name = normalizeType(entry.nombre);
  return positions.find(item => data && normalizeType(item.data) === data)
    || positions.find(item => type && name && normalizeType(item.tipo) === type && normalizeType(item.nombre) === name)
    || null;
}

function currentPriceForEstimate(entry, match) {
  const price = safeNumber(match?.valor);
  if (Number.isFinite(price) && price > 0) return price;
  const used = safeNumber(entry?.precioUsado);
  return Number.isFinite(used) && used > 0 ? used : NaN;
}

function investmentTotalsByType() {
  const map = new Map();
  (state.investmentTotals || []).forEach(item => {
    if (!item || !item.tipo) return;
    map.set(normalizeType(item.tipo), { ...item });
  });
  if (!investmentEstimateEnabled()) return map;
  activeInvestmentEstimateLedger().forEach(entry => {
    const type = prettyType(entry.tipo || 'Cartera');
    const key = normalizeType(type);
    const existing = map.get(key) || {
      tipo: type,
      cost: realizedInvestmentCostForType(type),
      value: 0,
      lastValue: 0,
      daily: 0,
      order: 0
    };
    const match = findMatchingInvestmentPosition(state.investments, entry);
    const price = currentPriceForEstimate(entry, match);
    const lastPrice = safeNumber(match?.valorAnterior);
    const shares = safeNumber(entry.sharesEstimadas);
    const value = shares * (Number.isFinite(price) && price > 0 ? price : safeNumber(entry.precioUsado));
    const lastValue = shares * (Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : (Number.isFinite(price) ? price : safeNumber(entry.precioUsado)));
    // Cost already comes from the realized investment movement.
    // Estimated allocations only change position value and shares.
    existing.value = safeNumber(existing.value) + value;
    existing.lastValue = safeNumber(existing.lastValue) + lastValue;
    existing.daily = safeNumber(existing.value) - safeNumber(existing.lastValue);
    existing.gain = safeNumber(existing.value) - safeNumber(existing.cost);
    existing.gainPct = existing.cost ? existing.gain / existing.cost * 100 : 0;
    map.set(key, existing);
  });
  return map;
}

function realizedInvestmentCostForType(type) {
  return Math.abs(sum((state.transactions || [])
    .filter(movement => isInvestment(movement)
      && normalizeType(localInvestmentCategoryForMovement(movement)) === normalizeType(type))
    .map(movement => movement.amount)));
}

function localInvestmentCategoryForMovement(movement) {
  if (!movement || !isInvestment(movement)) return '';
  const candidates = [movement.concepto, movement.descripcion].map(v => String(v || '').trim()).filter(Boolean);
  for (const candidate of candidates) {
    const match = investmentTypes().find(type => normalizeType(type) === normalizeType(candidate));
    if (match) return match;
  }
  return candidates[0] || '';
}

function applyInvestmentCostDeltaLocal(movement, sign = 1) {
  const category = localInvestmentCategoryForMovement(movement);
  if (!category) return;
  const amount = Math.abs(Number(movement.amount || movement.importe || 0));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const existing = (state.investmentTotals || []).find(item => normalizeType(item.tipo) === normalizeType(category));
  if (existing) {
    existing.cost = Math.max(0, roundMoney(safeNumber(existing.cost) + sign * amount));
    existing.gain = roundMoney(safeNumber(existing.value) - safeNumber(existing.cost));
    existing.gainPct = existing.cost ? existing.gain / existing.cost : 0;
  } else if (sign > 0) {
    state.investmentTotals.push({ tipo: category, cost: roundMoney(amount), value: 0, lastValue: 0, daily: 0, dailyPct: 0, gain: -roundMoney(amount), gainPct: -1, order: state.investmentTotals.length + 1 });
  }
}

function applyInvestmentMovementMirror(previousMovement, nextMovement) {
  if (previousMovement && isInvestment(previousMovement)) applyInvestmentCostDeltaLocal(previousMovement, -1);
  if (nextMovement && isInvestment(nextMovement)) applyInvestmentCostDeltaLocal(nextMovement, 1);
}

function recalculateInvestmentTotalsLocalFromPositions() {
  const previousTotals = new Map((state.investmentTotals || []).map(item => [normalizeType(item.tipo), item]));
  const typeOrder = investmentTypes();
  const next = typeOrder.map((type, index) => {
    const prior = previousTotals.get(normalizeType(type)) || {};
    return {
      rowNumber: prior.rowNumber || null,
      tipo: type,
      cost: safeNumber(prior.cost),
      value: 0,
      lastValue: 0,
      daily: 0,
      dailyPct: 0,
      gain: 0,
      gainPct: 0,
      order: Number(prior.order || index + 1)
    };
  });
  const byType = new Map(next.map(item => [normalizeType(item.tipo), item]));
  (state.investments || []).forEach(item => {
    const key = normalizeType(item.tipo);
    if (!key) return;
    if (!byType.has(key)) {
      const type = prettyType(item.tipo);
      const created = { rowNumber: null, tipo: type, cost: 0, value: 0, lastValue: 0, daily: 0, dailyPct: 0, gain: 0, gainPct: 0, order: next.length + 1 };
      next.push(created);
      byType.set(key, created);
    }
    const total = byType.get(key);
    total.value += safeNumber(currentInvestmentTotal(item));
    total.lastValue += safeNumber(previousInvestmentTotal(item));
  });
  next.forEach(total => {
    total.value = roundMoney(total.value);
    total.lastValue = roundMoney(total.lastValue);
    total.daily = roundMoney(total.value - total.lastValue);
    total.dailyPct = total.lastValue ? total.daily / total.lastValue : 0;
    total.gain = roundMoney(total.value - safeNumber(total.cost));
    total.gainPct = total.cost ? total.gain / total.cost : 0;
  });
  state.investmentTotals = next;
  state.categories = normalizeCategories({ ...state.categories, investmentTypes: next.map(item => item.tipo) });
}

function normalizeBank(row) {
  const cuenta = String(row.cuenta || row.CUENTA || row[0] || "").trim();
  const dinero = parseNumber(row.dinero ?? row.DINERO ?? row[1]);
  if (!cuenta || Number.isNaN(dinero)) return null;
  return { rowNumber: Number(row.rowNumber || row.row || 0) || null, cuenta, dinero };
}

function normalizeCategories(categories) {
  const sourceInvestmentTypes = categories && (categories.investmentTypes || categories.investments || categories.inversiones || categories.tiposInversion);
  const cleanInvestmentTypes = (sourceInvestmentTypes || []).map(prettyType).filter(Boolean);
  return {
    types: unique([...(categories && categories.types || []), ...STATIC_TYPES]).map(prettyType),
    concepts: unique([...(categories && categories.concepts || []), ...STATIC_CONCEPTS]).map(prettyType),
    investmentTypes: unique(cleanInvestmentTypes.length ? cleanInvestmentTypes : INVESTMENT_TYPES).map(prettyType).filter(Boolean)
  };
}

function investmentTypes() {
  const configured = [...(state.categories?.investmentTypes || [])].map(prettyType).filter(Boolean);
  const totals = [...(state.investmentTotals || [])]
    .slice()
    .sort((a, b) => safeNumber(a.order) - safeNumber(b.order))
    .map(i => prettyType(i.tipo))
    .filter(Boolean);
  const current = effectiveInvestmentPositions().map(i => i.tipo).map(prettyType).filter(Boolean);
  const estimateTypes = [...(state.investmentEstimateRules || []), ...(state.investmentEstimateLedger || [])].map(i => prettyType(i.tipo)).filter(Boolean);
  const base = configured.length || totals.length || current.length || estimateTypes.length ? [] : INVESTMENT_TYPES;
  return unique([...configured, ...totals, ...current, ...estimateTypes, ...base])
    .map(prettyType)
    .filter(Boolean);
}

function renderTable(id, headers, rows) {
  const table = document.getElementById(id);
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty" colspan="${headers.length}">Sin datos para mostrar.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
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


function ensureInvestmentCategoryEditButton() {
  const table = document.getElementById("investmentBreakdownTable");
  const panel = table?.closest("article.panel");
  const header = panel?.querySelector(".panel-header");
  if (!header || document.getElementById("editInvestmentCategoriesBtn")) return;
  const btn = document.createElement("button");
  btn.id = "editInvestmentCategoriesBtn";
  btn.className = "btn mini-edit-btn";
  btn.type = "button";
  btn.innerHTML = '<i data-lucide="edit-3"></i>';
  btn.addEventListener("click", openInvestmentCategoryDialog);
  header.appendChild(btn);
}

function ensureInvestmentCategoryDialog() {
  if (document.getElementById("investmentCategoriesDialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "investmentCategoriesDialog";
  dialog.innerHTML = `
    <form id="investmentCategoriesForm" method="dialog" class="dialog-card investment-category-dialog">
      <div class="dialog-head">
        <h2>Categorías de inversión</h2>
        <button class="icon-btn" id="closeInvestmentCategoriesBtn" type="button" aria-label="Cerrar"><i data-lucide="x"></i></button>
      </div>
      <div class="investment-category-body">
        <p class="dialog-subtitle">Ordena, renombra o añade categorías.</p>
      <div id="investmentCategoryRows" class="investment-category-rows"></div>
      <button class="btn investment-category-add" id="addInvestmentCategoryBtn" type="button"><i data-lucide="plus"></i> Añadir categoría</button>
      </div>
      <div class="investment-category-actions">
        <button class="btn primary full" type="submit"><i data-lucide="save"></i> Guardar categorías</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  document.getElementById("closeInvestmentCategoriesBtn").addEventListener("click", () => dialog.close());
  document.getElementById("addInvestmentCategoryBtn").addEventListener("click", () => addInvestmentCategoryRow(""));
  document.getElementById("investmentCategoriesForm").addEventListener("submit", saveInvestmentCategoriesFromDialog);
}


function investmentCategoryHasData(type) {
  const key = normalizeType(type);
  const hasPositions = state.investments.some(item => normalizeType(item.tipo) === key);
  const total = (state.investmentTotals || []).find(item => normalizeType(item.tipo) === key);
  const hasCost = total && Math.abs(safeNumber(total.cost)) > 0.009;
  const hasValue = total && Math.abs(safeNumber(total.value)) > 0.009;
  return hasPositions || hasCost || hasValue;
}

function openInvestmentCategoryDialog() {
  ensureInvestmentCategoryDialog();
  const rows = document.getElementById("investmentCategoryRows");
  rows.innerHTML = "";
  investmentTypes().forEach(type => addInvestmentCategoryRow(type));
  updateInvestmentCategoryMoveButtons();
  document.getElementById("investmentCategoriesDialog").showModal();
  lucide.createIcons();
}

function updateInvestmentCategoryMoveButtons() {
  const rows = [...document.querySelectorAll("#investmentCategoryRows .investment-category-row")];
  rows.forEach((row, index) => {
    const up = row.querySelector('[data-category-move="up"]');
    const down = row.querySelector('[data-category-move="down"]');
    if (up) {
      up.disabled = index === 0;
      up.classList.toggle("invisible", index === 0);
    }
    if (down) {
      down.disabled = index === rows.length - 1;
      down.classList.toggle("invisible", index === rows.length - 1);
    }
  });
}

function addInvestmentCategoryRow(value = "") {
  const rows = document.getElementById("investmentCategoryRows");
  const row = document.createElement("div");
  row.className = "investment-category-row";
  row.innerHTML = `
    <div class="category-order-actions">
      <button class="icon-btn" type="button" data-category-move="up" aria-label="Subir"><i data-lucide="chevron-up"></i></button>
      <button class="icon-btn" type="button" data-category-move="down" aria-label="Bajar"><i data-lucide="chevron-down"></i></button>
    </div>
    <input data-original-category="${escapeAttr(value)}" value="${escapeAttr(value)}" placeholder="Nueva categoría" />
    <button class="icon-btn danger" type="button" data-category-remove aria-label="Quitar"><i data-lucide="trash-2"></i></button>`;
  row.querySelector('[data-category-move="up"]').addEventListener("click", () => {
    if (row.previousElementSibling) rows.insertBefore(row, row.previousElementSibling);
    updateInvestmentCategoryMoveButtons();
  });
  row.querySelector('[data-category-move="down"]').addEventListener("click", () => {
    if (row.nextElementSibling) rows.insertBefore(row.nextElementSibling, row);
    updateInvestmentCategoryMoveButtons();
  });
  row.querySelector('[data-category-remove]').addEventListener("click", () => {
    const input = row.querySelector('input');
    const current = prettyType(input?.value || input?.dataset.originalCategory || '');
    const original = prettyType(input?.dataset.originalCategory || '');
    if ((original && investmentCategoryHasData(original)) || (current && investmentCategoryHasData(current))) {
      setNotice(`No se puede borrar ${current || original}: tiene posiciones o coste. Mueve/renombra primero sus inversiones.`, 'warn');
      return;
    }
    row.remove();
    updateInvestmentCategoryMoveButtons();
  });
  rows.appendChild(row);
  updateInvestmentCategoryMoveButtons();
  lucide.createIcons();
}

async function saveInvestmentCategoriesFromDialog(event) {
  event.preventDefault();
  const btn = event.submitter;
  markButtonSaving(btn);
  const entries = [...document.querySelectorAll("#investmentCategoryRows input")]
    .map(input => ({ original: input.dataset.originalCategory || "", next: prettyType(input.value || "") }))
    .filter(entry => entry.next);
  const nextTypes = unique(entries.map(entry => entry.next));
  const renames = {};
  entries.forEach(entry => {
    if (entry.original && normalizeType(entry.original) !== normalizeType(entry.next)) renames[entry.original] = entry.next;
  });
  if (!nextTypes.length) {
    restoreButton(btn);
    setNotice("Debe haber al menos una categoría de inversión.", "warn");
    return;
  }
  state.categories = normalizeCategories({ ...state.categories, investmentTypes: nextTypes });
  state.investments = state.investments.map(item => {
    const renamed = Object.entries(renames).find(([from]) => normalizeType(from) === normalizeType(item.tipo));
    return renamed ? { ...item, tipo: renamed[1] } : item;
  });
  state.investmentTotals = (state.investmentTotals || []).map(item => {
    const renamed = Object.entries(renames).find(([from]) => normalizeType(from) === normalizeType(item.tipo));
    return renamed ? { ...item, tipo: renamed[1] } : item;
  });
  const renameInvestmentMovement = movement => {
    const renamed = Object.entries(renames).find(([from]) => isInvestment(movement) && normalizeType(from) === normalizeType(movement.descripcion));
    return renamed ? { ...movement, descripcion: renamed[1] } : movement;
  };
  state.transactions = state.transactions.map(renameInvestmentMovement);
  state.futureTransactions = state.futureTransactions.map(renameInvestmentMovement);
  renderInvestments();
  document.getElementById("investmentCategoriesDialog").close();
  setSyncStatus("Guardando categorías", "");
  try {
    recalculateInvestmentTotalsLocalFromPositions();
    syncOptions();
    renderInvestments();
    writeDataCache();
    if (state.config.scriptUrl) {
      queueOp({
        action: "saveInvestmentCategories",
        investmentTypes: nextTypes,
        renames,
        sheetName: state.config.investmentSheet,
        investmentTotalsSheet: state.config.investmentTotalsSheet || "Inversión Totales"
      });
      setSyncStatus("Guardando categorías", "");
      setNotice("Categorías aplicadas en caché y enviadas a Sheets.", "ok");
    } else {
      localStorage.setItem(INVESTMENT_CATEGORY_CACHE_KEY, JSON.stringify(nextTypes));
      setSyncStatus("Categorías guardadas en este navegador", "ok");
    }
    markButtonSaved(btn);
  } catch (error) {
    restoreButton(btn);
    setSyncStatus("Error al guardar categorías", "warn");
    setNotice(lineMessage("No se pudieron guardar las categorías.", error.message), "warn");
  }
}

function renderInvestmentBreakdownTable(summary) {
  const rows = investmentTypes().map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    const dailyPrevious = summary.dailyPreviousByType[type] || 0;
    const dailyPct = dailyPrevious ? (current - dailyPrevious) / dailyPrevious : 0;
    return `<tr class="clickable-row" data-investment-type="${escapeAttr(type)}"><td class="text-clip col-type">${type}</td><td class="amount col-money">${money(invested)}</td><td class="amount col-money">${money(current)}</td><td class="amount col-money">${amountCell(current - invested)}</td><td class="amount col-pct">${pctCell(gainPct(current, invested))}</td><td class="amount col-pct">${pctCell(dailyPct)}</td></tr>`;
  }).join("");
  document.getElementById("investmentBreakdownTable").innerHTML = `<colgroup><col class="col-type"><col class="col-money"><col class="col-money"><col class="col-money"><col class="col-pct"><col class="col-pct"></colgroup><thead><tr><th class="col-type"></th><th class="col-money">Cost</th><th class="col-money">Value</th><th class="col-money">Gain</th><th class="col-pct">%Gain</th><th class="col-pct">%d</th></tr></thead><tbody>${rows}</tbody>`;
  document.querySelectorAll("#investmentBreakdownTable [data-investment-type]").forEach(row => row.addEventListener("click", () => openInvestmentOverview(row.dataset.investmentType)));
}

function renderInvestmentPositionCharts(type) {
  const positions = effectiveInvestmentPositions().filter(i => normalizeType(i.tipo) === normalizeType(type) && currentInvestmentTotal(i) > 0).sort((a, b) => currentInvestmentTotal(b) - currentInvestmentTotal(a));
  const estimatedMode = investmentEstimateEnabled();
  const rows = positions.map((i, idx) => ({
    label: estimatedMode ? (i.shortName || i.nombre || i.data) : (i.nombre || i.shortName || i.data),
    value: currentInvestmentTotal(i),
    color: chartColor(PIE_CHART_COLORS, idx)
  }));
  renderColorRowsTable("investmentOverviewTable", rows, ["", "Detalle", "Total", ""]);
  upsertChart("investmentBreakdownDonut", "doughnut", {
    labels: rows.map(row => row.label),
    datasets: [{ data: rows.map(row => row.value), backgroundColor: rows.map(row => row.color), borderColor: chartSurfaceColor(), borderWidth: 2 }]
  }, compactChartOptions(`${type}`, { legend: false }));
}

function renderInvestmentGainBreakdown(summary) {
  const investedRows = [];
  const gainRows = [];
  investmentTypes().forEach((type, idx) => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    const gain = Math.max(current - invested, 0);
    const baseColor = chartColor(PIE_CHART_COLORS, idx + 2);
    const gainColor = chartColor(BAR_CHART_COLORS, idx);
    if (invested > 0) investedRows.push({ label: type, value: invested, color: baseColor });
    if (gain > 0) gainRows.push({ label: `${type} ganancia`, value: gain, color: gainColor });
  });
  const rows = [...investedRows, ...gainRows];
  const total = sum(rows.map(item => item.value));
  const globalRows = [
    { label: "Invertido global", value: summary.investedTotal, color: "#111111" },
    { label: "Ganancias globales", value: Math.max(summary.profitLoss, 0), color: "#556b2f" }
  ].filter(row => row.value > 0);
  renderTable("investmentOverviewTable", ["", "Detalle", "Total", ""], rows.map(row => [
    colorDot(row.color),
    escapeHtml(row.label),
    money(row.value),
    pct(row.value / Math.max(total, 1))
  ]));
  upsertChart("investmentBreakdownDonut", "doughnut", {
    labels: rows.map(row => row.label),
    datasets: [{
      data: rows.map(row => row.value),
      labels: rows.map(row => row.label),
      backgroundColor: rows.map(row => row.color),
      borderColor: chartSurfaceColor(),
      borderWidth: 2,
      offset: rows.map((_, idx) => idx >= investedRows.length ? 18 : 0),
      weight: 2.4
    }, {
      data: globalRows.map(row => row.value),
      labels: globalRows.map(row => row.label),
      backgroundColor: globalRows.map(row => row.color),
      borderColor: chartSurfaceColor(),
      borderWidth: 2,
      offset: 0,
      weight: 1.4
    }]
  }, compactChartOptions("Invertido + ganancias", { legend: false, cutout: "12%" }));
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

function moneyTooltip() {
  return {
    callbacks: {
      title: items => {
        const context = items[0];
        if (!context) return "";
        const datasetLabels = context.dataset?.labels || context.dataset?.customLabels || [];
        const label = datasetLabels[context.dataIndex] || context.label || context.dataset.label || "";
        const value = Number(context.parsed?.y ?? context.parsed) || 0;
        const type = context.chart?.config?.type;
        if (["doughnut", "pie", "polarArea"].includes(type)) {
          const total = sum((context.dataset?.data || []).map(item => Number(item?.y ?? item) || 0));
          return `${label}: ${pct(value / Math.max(total, 1))} (${money(value)})`;
        }
        return `${label}: ${money(value)}`;
      },
      label: () => null
    }
  };
}

function summaryItem(title, value, tone) {
  return `<div class="summary-item"><span>${escapeHtml(title)}</span><strong class="${tone || ""}">${escapeHtml(value)}</strong></div>`;
}

function renderMonthSituationBars(summary) {
  const outflow = summary.expenses + summary.investedMonth;
  const base = Math.max(summary.income, outflow, 1);
  const incomePct = Math.min(100, summary.income / base * 100);
  const outflowPct = Math.min(100, outflow / base * 100);
  const expenseShare = outflow ? summary.expenses / outflow : 0;
  const investmentShare = outflow ? summary.investedMonth / outflow : 0;
  const expenseWidth = outflowPct * expenseShare;
  const investmentWidth = outflowPct * investmentShare;
  document.getElementById("monthSituationBars").innerHTML = `
    <div class="balance-bar-row">
      <div class="balance-bar-heading">
        <strong>Ingresos</strong>
        <span class="balance-bar-summary">
          <strong class="positive">${money(summary.income)}</strong>
          ${summary.income > 0 ? `<small>Usado ${pct(outflow / summary.income)}</small>` : ""}
        </span>
        </div>
      <div class="balance-track"><span class="income" style="width:${Math.max(3, incomePct)}%"></span></div>
    </div>
    <div class="balance-bar-row">
      <div class="balance-bar-heading">
        <strong>Gastos + inversión</strong>
        <span class="balance-bar-summary">
          <strong>${money(outflow)}</strong>
          <small>Gasto ${pct(expenseShare)} · Inversión ${pct(investmentShare)}</small>
        </span>
      </div>
      <div class="balance-track stacked">
        <span class="expense" style="width:${Math.max(outflow ? 3 : 0, expenseWidth)}%"></span>
        <span class="investment" style="width:${Math.max(outflow ? 3 : 0, investmentWidth)}%"></span>
      </div>
    </div>
    <div class="balance-bar-row balance-final">
      <div class="balance-bar-heading">
        <strong>Balance</strong>
        <span class="balance-bar-summary">
          <strong class="${summary.balance >= 0 ? "positive" : "negative"}">${money(summary.balance)}</strong>
          <small>${summary.balance >= 0 ? "Queda disponible" : "Te pasas del mes"}</small>
        </span>
      </div>
    </div>`;
}

function monthlyGoalCard(kind, title, current, goal) {
  const normalizedGoal = Math.max(safeNumber(goal), 0);
  const currentValue = Math.max(safeNumber(current), 0);
  const isExpense = kind === "expense";
  const diff = normalizedGoal - currentValue;
  const exceeded = isExpense && diff < 0;
  const remainingText = normalizedGoal
    ? exceeded
      ? `Excedido ${money(Math.abs(diff))}`
      : `${isExpense ? "Quedan" : "Faltan"} ${money(Math.max(diff, 0))}`
    : "Sin objetivo";
  const pctValue = normalizedGoal ? currentValue / normalizedGoal : 0;
  const progress = Math.min(100, Math.max(0, pctValue * 100));
  const goalLabel = isExpense ? "Límite" : "Objetivo";
  const tone = kind === "income" ? "positive" : kind === "expense" ? "negative" : kind === "investment" ? "blue" : "";
  return `
    <div class="summary-item monthly-goal-card ${kind} ${exceeded ? "over-limit" : ""}">
      <div class="monthly-goal-head">
        <span>${escapeHtml(title)}</span>
        <button class="mini-edit-btn" data-edit-system-goal="${escapeAttr(kind)}" type="button">Editar</button>
      </div>
      <div class="monthly-goal-main">
        <strong class="${tone}">${money(currentValue)}</strong>
        <small>${goalLabel}: ${money(normalizedGoal)}</small>
      </div>
      <small class="${exceeded ? "negative" : "muted"}">${remainingText} · ${pct(pctValue)}</small>
      <div class="mini-progress"><span style="width:${progress}%"></span></div>
    </div>`;
}

function renderSummary() {
  const month = getSelectedSummaryMonth();
  const summary = calculateSummary(month);
  document.getElementById("monthSituationStrip").innerHTML = [
    summaryItem("Ingresos", money(summary.income), "positive"),
    monthlyGoalCard("expense", "Gastos", summary.expenses, state.investmentGoals.expenseMonthly),
    monthlyGoalCard("investment", "Inversión", summary.investedMonth, monthlyInvestmentGoal()),
    summaryItem("Balance", money(summary.balance), summary.balance >= 0 ? "positive" : "negative")
  ].join("");
  document.querySelectorAll("[data-edit-system-goal]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      editInvestmentGoals(btn.dataset.editSystemGoal);
    });
  });
  renderMonthSituationDialog(summary);
  renderMoneySummary(summary);
}

function renderInvestments() {
  ensureInvestmentCategoryEditButton();
  const summary = calculateSummary(getSelectedSummaryMonth());
  const panel = state.summaryModes.investmentPanel;
  const showingGoals = panel === "goals";
  const showingEvolution = panel === "evolution";
  document.getElementById("investmentPanelLabel").textContent = showingEvolution ? "Evolución" : showingGoals ? "Objetivos" : (investmentEstimateEnabled() ? "Inversión estimada" : "Inversión");
  document.getElementById("editInvestmentGoalsBtn").classList.toggle("hidden", !showingGoals);
  document.getElementById("openInvestmentOverviewBtn").classList.toggle("hidden", showingGoals || showingEvolution);
  document.getElementById("investmentGoals").classList.toggle("hidden", !showingGoals);
  document.getElementById("investmentEvolution")?.classList.toggle("hidden", !showingEvolution);
  document.querySelectorAll("[data-investment-panel]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.investmentPanel === panel);
  });
  document.getElementById("investmentCurrentTotal").textContent = money(summary.valueTotal);
  document.getElementById("investmentTotalMetrics").innerHTML = `
    <div class="total-metrics-line">
      <span>Invertido</span>
      <strong>${money(summary.investedTotal)}</strong>
    </div>
    <div class="total-metrics-line split">
      <div><span>Ganancia total</span><strong class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${money(summary.profitLoss)}</strong></div>
      <div><span>Ganancia diaria</span><strong class="${summary.dailyVariationTotal >= 0 ? "positive" : "negative"}">${money(summary.dailyVariationTotal)}</strong></div>
    </div>
    <div class="total-metrics-line split">
      <div><span>% total</span><strong class="${summary.profitLossPct >= 0 ? "positive" : "negative"}">${pctNoSymbol(summary.profitLossPct)}</strong></div>
      <div><span>% diario</span><strong class="${summary.dailyVariationPct >= 0 ? "positive" : "negative"}">${pctNoSymbol(summary.dailyVariationPct)}</strong></div>
    </div>
  `;
  if (document.getElementById("investmentOverviewDialog").open) renderInvestmentBreakdownCharts(summary);
  renderInvestmentGoals(summary);
  if (showingEvolution) renderInvestmentEvolution();
  else {
    renderInvestmentBreakdownTable(summary);
    renderInvestmentEditTable();
    fitInvestmentTables();
  }
  const hideLowerSections = showingGoals || showingEvolution;
  document.querySelectorAll("#inversiones > article.panel").forEach(el => {
    el.classList.toggle("hidden", hideLowerSections);
  });
  document.getElementById("saveInvestmentsBtn")?.classList.add("hidden");
  document.getElementById("addInvestmentRowBtn")?.classList.toggle("hidden", investmentEstimateEnabled());
}



function openInvestmentEstimateRulesDialog() {
  renderInvestmentEstimateRulesTable();
  document.getElementById("investmentEstimateRulesDialog")?.showModal();
  lucide.createIcons();
}

function blankInvestmentEstimateRule() {
  return {
    id: createSid("rule"),
    activa: true,
    dayOfMonth: "",
    movementConcept: "Inversión",
    movementDescription: "",
    tipo: "",
    data: "",
    nombre: "",
    shortName: "",
    percentage: NaN,
    fixedAmount: NaN,
    order: (state.investmentEstimateRules || []).length + 1
  };
}

function addInvestmentEstimateRule() {
  readInvestmentEstimateRulesFromEditor();
  state.investmentEstimateRules.push(blankInvestmentEstimateRule());
  renderInvestmentEstimateRulesTable();
}

function renderInvestmentEstimateRulesTable() {
  const table = document.getElementById("investmentEstimateRulesTable");
  if (!table) return;
  const rows = (state.investmentEstimateRules || []).map((rule, idx) => `
    <tr data-estimate-rule-index="${idx}">
      <td><input type="checkbox" data-field="activa" ${rule.activa ? "checked" : ""}></td>
      <td><input class="tiny-input" type="number" min="1" max="31" step="1" data-field="dayOfMonth" value="${escapeAttr(rule.dayOfMonth || '')}" placeholder="—"></td>
      <td><input data-field="movementDescription" value="${escapeAttr(rule.movementDescription || '')}" placeholder="Bolsa / Cartera / Fondos"></td>
      <td><input data-field="data" value="${escapeAttr(rule.data || '')}" placeholder="Ticker/ISIN"></td>
      <td><input data-field="shortName" value="${escapeAttr(rule.shortName || '')}" placeholder="Short"></td>
      <td><input data-field="nombre" value="${escapeAttr(rule.nombre || '')}" placeholder="Nombre"></td>
      <td><input class="tiny-input" type="number" step="0.01" data-field="percentage" value="${formatOptionalInput(rule.percentage)}" placeholder="%"></td>
      <td><input class="money-input" type="number" step="0.01" data-field="fixedAmount" value="${formatOptionalInput(rule.fixedAmount)}" placeholder="EUR"></td>
      <td class="estimate-rule-actions">
        <button class="icon-btn danger-icon" type="button" data-estimate-rule-delete="${idx}" title="Borrar regla"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`).join("");
  table.innerHTML = `<thead><tr><th>On</th><th>Día</th><th>Descripción</th><th>Ticker/ISIN</th><th>Short</th><th>Nombre</th><th>%</th><th>Fijo</th><th></th></tr></thead><tbody>${rows || `<tr><td class="empty" colspan="9">Sin reglas. Pulsa + para crear una.</td></tr>`}</tbody>`;
  table.querySelectorAll("[data-estimate-rule-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      readInvestmentEstimateRulesFromEditor();
      state.investmentEstimateRules.splice(Number(btn.dataset.estimateRuleDelete), 1);
      renderInvestmentEstimateRulesTable();
    });
  });
  lucide.createIcons();
}

function formatOptionalInput(value) {
  const n = parseNumber(value);
  return Number.isFinite(n) ? String(n) : "";
}

function estimateRuleAmountLocal(rule, movementAmount) {
  const fixed = parseNumber(rule?.fixedAmount);
  if (Number.isFinite(fixed) && fixed > 0) return Math.min(fixed, safeNumber(movementAmount));
  let percentage = parseNumber(rule?.percentage);
  if (!Number.isFinite(percentage) || percentage <= 0) return NaN;
  if (percentage > 1) percentage = percentage / 100;
  return safeNumber(movementAmount) * percentage;
}

function readInvestmentEstimateRulesFromEditor() {
  document.querySelectorAll("#investmentEstimateRulesTable tbody tr[data-estimate-rule-index]").forEach(row => {
    const idx = Number(row.dataset.estimateRuleIndex);
    const current = state.investmentEstimateRules[idx] || blankInvestmentEstimateRule();
    row.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      if (field === "activa") current.activa = Boolean(input.checked);
      else if (["dayOfMonth", "percentage", "fixedAmount"].includes(field)) {
        const parsed = parseNumber(input.value);
        current[field] = Number.isFinite(parsed) ? parsed : "";
      } else current[field] = input.value.trim();
    });
    current.movementConcept = "Inversión";
    current.tipo = "";
    if (!current.id) current.id = createSid("rule");
    current.order = idx + 1;
    state.investmentEstimateRules[idx] = current;
  });
}

async function saveInvestmentEstimateRules() {
  readInvestmentEstimateRulesFromEditor();
  const payload = { action: "saveInvestmentEstimateRules", rules: state.investmentEstimateRules };
  const btn = document.getElementById("saveInvestmentEstimateRulesBtn");
  markButtonSaving(btn);
  try {
    writeDataCache({ dirtySections: ["investmentEstimateRules"] });
    if (!state.config.scriptUrl) {
      setNotice("Reglas guardadas solo en caché local porque falta Apps Script.", "warn");
      markButtonSaved(btn);
      return;
    }
    queueOp(payload);
    markButtonSaved(btn);
    setNotice("Reglas guardadas en local y enviadas a Sheets.", "ok");
  } catch (error) {
    restoreButton(btn);
    setNotice(lineMessage("No se pudo preparar el guardado.", error.message), "warn");
  } finally {
    renderInvestmentEstimateRulesTable();
  }
}

async function clearInvestmentEstimates() {
  const ok = await confirmDialog("Esto borra las estimaciones generadas y toma la posición manual actual como nuevo punto de partida. Las reglas se mantienen.", "Borrar estimaciones");
  if (!ok) return;
  const btn = document.getElementById("clearInvestmentEstimatesBtn");
  markButtonSaving(btn, "");
  try {
    state.investmentEstimateLedger = [];
    writeDataCache({ dirtySections: ["investmentEstimateLedger"] });
    if (state.config.scriptUrl) {
      queueOp({ action: "clearInvestmentEstimates" });
    }
    setNotice("Estimaciones borradas. Las reglas se conservan.", "ok");
  } catch (error) {
    setNotice(lineMessage("No se pudo preparar el borrado.", error.message), "warn");
  } finally {
    restoreButton(btn);
    renderInvestments();
  }
}


function isInvestmentMovement(movement) {
  const normalized = normalizeTransaction(movement);
  if (!normalized) return false;
  return normalizeType(normalized.tipo) === "inversion"
    || normalizeType(normalized.concepto) === "inversion";
}

function enqueueInvestmentAllocationPrompts(movements = [], options = {}) {
  investmentDebug("enqueue inicio", {
    movementCount: movements?.length || 0,
    options,
    movements: (movements || []).map(item => ({
      tipo: item?.tipo,
      concepto: item?.concepto,
      descripcion: item?.descripcion,
      amount: item?.amount ?? item?.importe
    }))
  });
  const prompts = (movements || [])
    .map(normalizeTransaction)
    .filter(shouldPromptForInvestmentAllocation)
    .map(movement => ({
    movement,
    source: options.source || "registro",
    respectDay: Boolean(options.respectDay)
  }));
  investmentDebug("enqueue filtrado", {
    promptCount: prompts.length,
    prompts: prompts.map(prompt => ({
      sid: prompt.movement.sid,
      tipo: prompt.movement.tipo,
      concepto: prompt.movement.concepto,
      descripcion: prompt.movement.descripcion
    }))
  });
  if (!prompts.length) return 0;
  state.pendingInvestmentAllocationPrompts.push(...prompts);
  if (options.openNow) processPendingInvestmentAllocationPrompts();
  return prompts.length;
}

function openInvestmentAllocationForRegistration(movements = [], options = {}) {
  investmentDebug("openInvestmentAllocationForRegistration inicio", {
    movementCount: movements.length,
    options
  });
  const promptCount = enqueueInvestmentAllocationPrompts(movements, { ...options, openNow: false });
  if (!promptCount) {
    investmentDebug("sin prompts para abrir", {});
    return false;
  }
  const summaryDialog = document.getElementById("movementPopup");
  investmentDebug("estado antes de procesar popup", {
    promptCount,
    summaryDialogOpen: Boolean(summaryDialog?.open),
    allocationDialogExists: Boolean(document.getElementById("investmentAllocationDialog")),
    allocationDialogOpen: Boolean(document.getElementById("investmentAllocationDialog")?.open)
  });
  if (summaryDialog?.open) summaryDialog.close();
  try {
    processPendingInvestmentAllocationPrompts();
  } catch (error) {
    console.error(`${INVESTMENT_DEBUG_PREFIX} error abriendo reparto`, error);
    state.pendingInvestmentAllocationPrompts = [];
    state.currentInvestmentAllocationPrompt = null;
    setNotice(lineMessage("No se pudo abrir el reparto de inversión.", error.message), "warn");
    return false;
  }
  const opened = Boolean(
    document.getElementById("investmentAllocationDialog")?.open
    || state.currentInvestmentAllocationPrompt
    || state.pendingInvestmentAllocationPrompts.length
  );
  investmentDebug("resultado apertura reparto", {
    opened,
    dialogOpen: Boolean(document.getElementById("investmentAllocationDialog")?.open),
    hasCurrentPrompt: Boolean(state.currentInvestmentAllocationPrompt),
    pendingCount: state.pendingInvestmentAllocationPrompts.length
  });
  return opened;
}

function scheduleInvestmentAllocationForRegistration(movements = [], options = {}) {
  investmentDebug("schedule solicitado", {
    movementCount: movements.length,
    options,
    hasPendingSummary: Boolean(state.pendingInvestmentSummaryPopup)
  });
  window.setTimeout(() => {
    investmentDebug("schedule ejecutándose", {
      movementCount: movements.length,
      hasPendingSummary: Boolean(state.pendingInvestmentSummaryPopup)
    });
    const allocationOpened = openInvestmentAllocationForRegistration(movements, options);
    if (allocationOpened) {
      investmentDebug("schedule terminó con reparto abierto", {});
      return;
    }
    const summary = state.pendingInvestmentSummaryPopup;
    state.pendingInvestmentSummaryPopup = null;
    investmentDebug("schedule usa resumen como fallback", {
      hasSummaryMovement: Boolean(summary?.movement),
      title: summary?.title
    });
    if (summary) {
      showMovementPopup(summary.title || "Movimiento guardado", summary.movement, summary.account || "", summary.extra || "");
    }
  }, 0);
}

function shouldPromptForInvestmentAllocation(movement) {
  const normalized = normalizeTransaction(movement);
  if (!normalized) return false;
  return isInvestmentMovement(normalized);
}

function processPendingInvestmentAllocationPrompts() {
  const allocationDialog = document.getElementById("investmentAllocationDialog");
  const summaryDialog = document.getElementById("movementPopup");
  investmentDebug("processPendingInvestmentAllocationPrompts", {
    allocationDialogExists: Boolean(allocationDialog),
    allocationDialogOpen: Boolean(allocationDialog?.open),
    summaryDialogOpen: Boolean(summaryDialog?.open),
    pendingCount: state.pendingInvestmentAllocationPrompts.length
  });
  if (allocationDialog?.open) {
    investmentDebug("process cancelado: reparto ya abierto", {});
    return;
  }
  if (summaryDialog?.open) {
    investmentDebug("process cancelado: resumen abierto", {});
    return;
  }
  const next = state.pendingInvestmentAllocationPrompts.shift();
  if (!next) {
    investmentDebug("process sin siguiente prompt", {});
    return;
  }
  investmentDebug("process abre siguiente prompt", {
    sid: next.movement?.sid,
    descripcion: next.movement?.descripcion
  });
  openInvestmentAllocationDialog(next);
}

function openInvestmentAllocationDialog(prompt) {
  const movement = normalizeTransaction(prompt?.movement);
  investmentDebug("openInvestmentAllocationDialog inicio", {
    prompt,
    normalizedMovement: movement ? {
      sid: movement.sid,
      tipo: movement.tipo,
      concepto: movement.concepto,
      descripcion: movement.descripcion,
      amount: movement.amount
    } : null
  });
  if (!movement) {
    investmentDebug("open cancelado: movimiento no normalizable", {});
    return;
  }
  state.currentInvestmentAllocationPrompt = { ...prompt, movement };
  const amount = Math.abs(safeNumber(movement.amount));
  const dialog = document.getElementById("investmentAllocationDialog");
  investmentDebug("diálogo de reparto localizado", {
    exists: Boolean(dialog),
    openBefore: Boolean(dialog?.open),
    amount
  });
  document.getElementById("investmentAllocationTitle").textContent = `Repartir inversión · ${money(amount)}`;
  document.getElementById("investmentAllocationContext").textContent = `${formatDate(movement.date)} · ${movement.concepto || "Inversión"} · ${movement.descripcion || "Sin descripción"}`;
  if (dialog && !dialog.open) {
    dialog.showModal();
    investmentDebug("showModal reparto ejecutado", { openAfter: dialog.open });
  }
  try {
    const matchedRules = matchingInvestmentAllocationRules(movement, Boolean(prompt.respectDay));
    investmentDebug("reglas antes de renderizar", {
      loadedRuleCount: state.investmentEstimateRules.length,
      matchedRuleCount: matchedRules.length,
      matchedRules: matchedRules.map(rule => ({
        id: rule.id,
        activa: rule.activa,
        dayOfMonth: rule.dayOfMonth,
        movementDescription: rule.movementDescription,
        data: rule.data,
        percentage: rule.percentage,
        fixedAmount: rule.fixedAmount
      }))
    });
    renderInvestmentAllocationExistingSelect();
    renderInvestmentAllocationTable(initialInvestmentAllocationRows(movement, prompt));
  } catch (error) {
    console.error(`${INVESTMENT_DEBUG_PREFIX} error renderizando reparto`, error);
    renderInvestmentAllocationFallbackRow(amount, movement);
    setNotice(lineMessage("Se abrió un reparto editable sin precargar las reglas.", error.message), "warn");
  }
  lucide.createIcons();
}

function renderInvestmentAllocationFallbackRow(amount, movement) {
  const select = document.getElementById("investmentAllocationExistingSelect");
  if (select) {
    select.innerHTML = `<option value="">Sin precarga disponible</option>`;
    select.dataset.candidateIndexes = "[]";
  }
  const table = document.getElementById("investmentAllocationTable");
  if (!table) return;
  const inferredType = inferredInvestmentTypeFromMovement(movement) || "Cartera";
  table.innerHTML = `<thead><tr><th>Tipo</th><th>Ticker/ISIN</th><th>Short</th><th>Nombre</th><th>%</th><th>Importe</th><th>Precio</th><th>Shares est.</th><th></th></tr></thead>
    <tbody><tr data-allocation-row data-regla-id="">
      <td><select data-field="tipo"><option value="${escapeAttr(inferredType)}">${escapeHtml(inferredType)}</option></select></td>
      <td><input data-field="data" value="" placeholder="Ticker/ISIN"></td>
      <td><input data-field="shortName" value="" placeholder="Short"></td>
      <td><input data-field="nombre" value="" placeholder="Nombre"></td>
      <td><input class="tiny-input" type="number" step="0.01" data-field="percentage" value="100"></td>
      <td><input class="money-input" type="number" step="0.01" data-field="importe" value="${escapeAttr(formatOptionalInput(amount))}"></td>
      <td><input class="money-input" type="number" step="0.0001" data-field="precioUsado" value=""></td>
      <td data-allocation-shares>—</td>
      <td><button class="icon-btn danger-icon" type="button" data-allocation-delete title="Borrar fila"><i data-lucide="trash-2"></i></button></td>
    </tr></tbody>`;
  table.querySelectorAll("input, select").forEach(input => input.addEventListener("input", handleInvestmentAllocationInput));
  table.querySelector("[data-allocation-delete]")?.addEventListener("click", event => {
    event.currentTarget.closest("tr")?.remove();
    updateInvestmentAllocationTotals();
  });
  updateInvestmentAllocationTotals();
}

function handleInvestmentAllocationDialogClosed() {
  investmentDebug("diálogo de reparto cerrado", {
    pendingCount: state.pendingInvestmentAllocationPrompts.length,
    hasPendingSummary: Boolean(state.pendingInvestmentSummaryPopup)
  });
  state.currentInvestmentAllocationPrompt = null;
  if (state.pendingInvestmentAllocationPrompts.length) {
    processPendingInvestmentAllocationPrompts();
    return;
  }
  if (state.pendingInvestmentSummaryPopup) {
    const summary = state.pendingInvestmentSummaryPopup;
    state.pendingInvestmentSummaryPopup = null;
    showMovementPopup(summary.title || "Movimiento guardado", summary.movement, summary.account || "", summary.extra || "");
  }
}

function discardInvestmentAllocationPrompt() {
  setNotice("Movimiento guardado sin añadirlo a estimaciones.", "ok");
  document.getElementById("investmentAllocationDialog")?.close();
}

function initialInvestmentAllocationRows(movement, prompt = {}) {
  const amount = Math.abs(safeNumber(movement.amount));
  const rules = matchingInvestmentAllocationRules(movement, Boolean(prompt.respectDay));
  const rows = rules.map(rule => allocationRowFromRule(rule, amount)).filter(Boolean);
  if (rows.length) return rows;
  return [{ id: createSid("alloc"), tipo: inferredInvestmentTypeFromMovement(movement) || investmentTypes()[0] || "Cartera", data: "", nombre: "", shortName: "", percentage: 100, importe: amount, precioUsado: "", reglaId: "", isNew: true }];
}

function matchingInvestmentAllocationRules(movement, respectDay = false) {
  const normalized = normalizeTransaction(movement);
  if (!shouldPromptForInvestmentAllocation(normalized)) {
    investmentDebug("matching descartado: no es inversión", { movement });
    return [];
  }
  const active = (state.investmentEstimateRules || []).filter(rule => rule && rule.activa);
  const dayFiltered = active.filter(rule => {
    if (!respectDay || !rule.dayOfMonth) return true;
    return Number(rule.dayOfMonth) === normalized.date.getDate();
  });
  const movementDescription = normalizeDescription(normalized.descripcion || "");
  const matched = dayFiltered.filter(rule => {
    const ruleDescription = normalizeDescription(rule.movementDescription || "");
    if (!ruleDescription || !movementDescription) return false;
    return movementDescription.includes(ruleDescription)
      || ruleDescription.includes(movementDescription);
  });
  investmentDebug("matching de reglas", {
    respectDay,
    movementDate: formatDate(normalized.date),
    movementDescription,
    totalRules: state.investmentEstimateRules.length,
    activeRules: active.length,
    dayFilteredRules: dayFiltered.length,
    matchedRules: matched.length
  });
  return matched.sort((a, b) => safeNumber(a.order) - safeNumber(b.order));
}

function allocationRowFromRule(rule, movementAmount) {
  const amount = estimateRuleAmountLocal(rule, movementAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const match = findInvestmentForAllocation(rule);
  const price = safeNumber(match?.valor);
  const percentage = Number.isFinite(parseNumber(rule.percentage)) && parseNumber(rule.percentage) > 0
    ? parseNumber(rule.percentage)
    : (movementAmount ? amount / movementAmount * 100 : "");
  return {
    id: createSid("alloc"),
    tipo: match?.tipo || inferredInvestmentTypeFromMovement(state.currentInvestmentAllocationPrompt?.movement) || "Cartera",
    data: rule.data || match?.data || "",
    nombre: rule.nombre || match?.nombre || rule.shortName || rule.data || "",
    shortName: rule.shortName || match?.shortName || match?.nombre || rule.data || "",
    percentage,
    importe: roundMoney(amount),
    precioUsado: price || "",
    reglaId: rule.id || "",
    isNew: !match
  };
}

function findInvestmentForAllocation(seed = {}) {
  const data = normalizeType(seed.data || "");
  const shortName = normalizeType(seed.shortName || "");
  const name = normalizeType(seed.nombre || "");
  return (state.investments || []).find(item => data && normalizeType(item.data) === data)
    || (state.investments || []).find(item => shortName && normalizeType(item.shortName || item.nombre) === shortName)
    || (state.investments || []).find(item => name && normalizeType(item.nombre) === name)
    || null;
}

function inferredInvestmentTypeFromMovement(movement) {
  const text = normalizeType(`${movement?.concepto || ""} ${movement?.descripcion || ""}`);
  return investmentTypes().find(type => text.includes(normalizeType(type))) || "";
}

function renderInvestmentAllocationExistingSelect() {
  const select = document.getElementById("investmentAllocationExistingSelect");
  if (!select) return;
  const movement = state.currentInvestmentAllocationPrompt?.movement;
  const inferredType = inferredInvestmentTypeFromMovement(movement);
  const candidates = (state.investments || []).filter(item => !inferredType || normalizeType(item.tipo) === normalizeType(inferredType));
  select.innerHTML = candidates.map((item, idx) => `<option value="${idx}">${escapeHtml(item.shortName || item.nombre || item.data)} · ${escapeHtml(item.tipo || "")}</option>`).join("") || `<option value="">Sin posiciones de ese tipo</option>`;
  select.dataset.candidateIndexes = JSON.stringify(candidates.map(item => state.investments.indexOf(item)));
}

function renderInvestmentAllocationTable(rows = []) {
  const table = document.getElementById("investmentAllocationTable");
  if (!table) return;
  table.innerHTML = `<thead><tr><th>Tipo</th><th>Ticker/ISIN</th><th>Short</th><th>Nombre</th><th>%</th><th>Importe</th><th>Precio</th><th>Shares est.</th><th></th></tr></thead><tbody>${rows.map(investmentAllocationRowHtml).join("")}</tbody>`;
  table.querySelectorAll("input, select").forEach(input => input.addEventListener("input", handleInvestmentAllocationInput));
  table.querySelectorAll("[data-allocation-delete]").forEach(btn => btn.addEventListener("click", () => {
    btn.closest("tr")?.remove();
    updateInvestmentAllocationTotals();
  }));
  updateInvestmentAllocationTotals();
  lucide.createIcons();
}

function investmentAllocationRowHtml(row) {
  const types = investmentTypes();
  const shares = safeNumber(row.precioUsado) > 0 ? safeNumber(row.importe) / safeNumber(row.precioUsado) : 0;
  return `<tr data-allocation-row data-regla-id="${escapeAttr(row.reglaId || "")}">
    <td><select data-field="tipo">${types.map(type => `<option value="${escapeAttr(type)}" ${normalizeType(type) === normalizeType(row.tipo) ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></td>
    <td><input data-field="data" value="${escapeAttr(row.data || "")}" placeholder="Ticker/ISIN"></td>
    <td><input data-field="shortName" value="${escapeAttr(row.shortName || "")}" placeholder="Short"></td>
    <td><input data-field="nombre" value="${escapeAttr(row.nombre || "")}" placeholder="Nombre"></td>
    <td><input class="tiny-input" type="number" step="0.01" data-field="percentage" value="${formatOptionalInput(row.percentage)}"></td>
    <td><input class="money-input" type="number" step="0.01" data-field="importe" value="${formatOptionalInput(row.importe)}"></td>
    <td><input class="money-input" type="number" step="0.0001" data-field="precioUsado" value="${formatOptionalInput(row.precioUsado)}"></td>
    <td data-allocation-shares>${shares ? formatDecimalInput(shares, 6) : "—"}</td>
    <td><button class="icon-btn danger-icon" type="button" data-allocation-delete title="Borrar fila"><i data-lucide="trash-2"></i></button></td>
  </tr>`;
}

function handleInvestmentAllocationInput(event) {
  const row = event.target.closest("tr[data-allocation-row]");
  const prompt = state.currentInvestmentAllocationPrompt;
  const totalAmount = Math.abs(safeNumber(prompt?.movement?.amount));
  const field = event.target.dataset.field;
  if (field === "percentage") {
    const percentage = parseNumber(event.target.value);
    if (Number.isFinite(percentage)) {
      row.querySelector('[data-field="importe"]').value = formatDecimalInput(roundMoney(totalAmount * percentage / 100), 2);
    }
  } else if (field === "importe") {
    const amount = parseNumber(event.target.value);
    if (Number.isFinite(amount) && totalAmount > 0) {
      row.querySelector('[data-field="percentage"]').value = formatDecimalInput(amount / totalAmount * 100, 2);
    }
  }
  updateInvestmentAllocationTotals();
}

function readInvestmentAllocationRows() {
  return Array.from(document.querySelectorAll("#investmentAllocationTable tbody tr[data-allocation-row]")).map(row => {
    const item = { reglaId: row.dataset.reglaId || "" };
    row.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      if (["percentage", "importe", "precioUsado"].includes(field)) item[field] = parseNumber(input.value);
      else item[field] = input.value.trim();
    });
    const amount = safeNumber(item.importe);
    const price = safeNumber(item.precioUsado);
    item.sharesEstimadas = amount > 0 && price > 0 ? amount / price : NaN;
    return item;
  });
}

function updateInvestmentAllocationTotals() {
  const prompt = state.currentInvestmentAllocationPrompt;
  const target = Math.abs(safeNumber(prompt?.movement?.amount));
  const rows = readInvestmentAllocationRows();
  const total = roundMoney(sum(rows.map(row => safeNumber(row.importe))));
  const diff = roundMoney(target - total);
  document.querySelectorAll("#investmentAllocationTable tbody tr[data-allocation-row]").forEach((row, idx) => {
    const item = rows[idx];
    const sharesCell = row.querySelector("[data-allocation-shares]");
    if (sharesCell) sharesCell.textContent = Number.isFinite(item.sharesEstimadas) ? formatDecimalInput(item.sharesEstimadas, 6) : "—";
  });
  const totalEl = document.getElementById("investmentAllocationTotal");
  const balanced = rows.length > 0 && Math.abs(diff) < 0.01;
  if (totalEl) {
    totalEl.textContent = balanced
      ? `✓ Cuadra: ${money(total)} / ${money(target)}`
      : `! ${money(total)} / ${money(target)} · diferencia ${money(diff)}`;
    totalEl.classList.toggle("balanced", balanced);
    totalEl.classList.toggle("unbalanced", !balanced);
  }
  const saveBtn = document.getElementById("saveInvestmentAllocationBtn");
  if (saveBtn) {
    saveBtn.disabled = !balanced;
    saveBtn.classList.toggle("allocation-ready", balanced);
  }
}

function addExistingInvestmentAllocationRow() {
  const select = document.getElementById("investmentAllocationExistingSelect");
  const indexes = JSON.parse(select?.dataset.candidateIndexes || "[]");
  const investment = state.investments[indexes[Number(select?.value || 0)]];
  if (!investment) return;
  const remaining = investmentAllocationRemainingAmount();
  appendInvestmentAllocationRow({
    tipo: investment.tipo,
    data: investment.data,
    nombre: investment.nombre,
    shortName: investment.shortName || investment.nombre || investment.data,
    percentage: "",
    importe: remaining > 0 ? remaining : "",
    precioUsado: investment.valor || "",
    reglaId: ""
  });
}

function addBlankInvestmentAllocationRow() {
  const movement = state.currentInvestmentAllocationPrompt?.movement;
  appendInvestmentAllocationRow({ tipo: inferredInvestmentTypeFromMovement(movement) || investmentTypes()[0] || "Cartera", data: "", nombre: "", shortName: "", percentage: "", importe: investmentAllocationRemainingAmount() || "", precioUsado: "", reglaId: "" });
}

function appendInvestmentAllocationRow(row) {
  const tbody = document.querySelector("#investmentAllocationTable tbody");
  if (!tbody) return;
  tbody.insertAdjacentHTML("beforeend", investmentAllocationRowHtml(row));
  const tr = tbody.lastElementChild;
  tr.querySelectorAll("input, select").forEach(input => input.addEventListener("input", handleInvestmentAllocationInput));
  tr.querySelector("[data-allocation-delete]")?.addEventListener("click", () => { tr.remove(); updateInvestmentAllocationTotals(); });
  updateInvestmentAllocationTotals();
  lucide.createIcons();
}

function investmentAllocationRemainingAmount() {
  const target = Math.abs(safeNumber(state.currentInvestmentAllocationPrompt?.movement?.amount));
  const total = roundMoney(sum(readInvestmentAllocationRows().map(row => safeNumber(row.importe))));
  return roundMoney(target - total);
}

async function saveInvestmentAllocationPrompt(event) {
  event.preventDefault();
  const prompt = state.currentInvestmentAllocationPrompt;
  const movement = normalizeTransaction(prompt?.movement);
  if (!movement) return;
  const target = Math.abs(safeNumber(movement.amount));
  const rows = readInvestmentAllocationRows().filter(row => safeNumber(row.importe) > 0);
  const total = roundMoney(sum(rows.map(row => safeNumber(row.importe))));
  if (Math.abs(total - target) >= 0.01) {
    setNotice(`El reparto no cuadra: ${money(total)} de ${money(target)}. Ajusta los importes antes de guardar.`, "warn");
    return;
  }
  const invalid = rows.find(row => !row.data || !row.nombre || !row.shortName || !safeNumber(row.precioUsado) || !Number.isFinite(row.sharesEstimadas));
  if (invalid) {
    setNotice("Cada fila debe tener ticker/ISIN, short, nombre, precio e importe.", "warn");
    return;
  }
  const entries = rows.map(row => normalizeInvestmentEstimateLedger({
    id: createSid("est"), activo: true, fechaMovimiento: formatDate(movement.date), sidMovimiento: movement.sid,
    tipo: row.tipo, data: row.data, nombre: row.nombre, shortName: row.shortName,
    importe: roundMoney(row.importe), precioUsado: safeNumber(row.precioUsado), sharesEstimadas: row.sharesEstimadas,
    origen: prompt.source === "futuro" ? "movimiento futuro activado" : "registro confirmado"
  }));
  const btn = document.getElementById("saveInvestmentAllocationBtn");
  markButtonSaving(btn);
  try {
    state.investmentEstimateLedger.push(...entries);
    writeDataCache({ dirtySections: ["investmentEstimateLedger"] });
    queueOp({ action: "saveInvestmentEstimateAllocations", movement: serializeTransaction(movement), entries });
    setNotice("Reparto guardado como estimación.", "ok");
    document.getElementById("investmentAllocationDialog")?.close();
    renderInvestments();
  } catch (error) {
    setNotice(lineMessage("No se pudo guardar el reparto.", error.message), "warn");
  } finally {
    restoreButton(btn);
    if (document.getElementById("investmentAllocationDialog")?.open) {
      updateInvestmentAllocationTotals();
    }
  }
}

function loadEvolutionRange() {
  try {
    const saved = JSON.parse(localStorage.getItem(EVOLUTION_RANGE_KEY) || "{}");
    return {
      start: saved.start || "2026-01",
      end: saved.end || "2026-12",
      snapshotDay: Number(saved.snapshotDay ?? 31),
      income: Number(saved.income ?? 1800),
      expenses: Number(saved.expenses ?? 1250),
      investment: Number(saved.investment ?? 750)
    };
  } catch {
    return { start: "2026-01", end: "2026-12", snapshotDay: 31, income: 1800, expenses: 1250, investment: 750 };
  }
}

function loadAccountGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_GROUPS_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .map(group => ({
        id: String(group.id || createSid("group")),
        name: String(group.name || "").trim(),
        accountNames: Array.isArray(group.accountNames) ? group.accountNames.map(String) : []
      }))
      .filter(group => group.name);
  } catch {
    return [];
  }
}

function writeAccountGroups() {
  localStorage.setItem(ACCOUNT_GROUPS_KEY, JSON.stringify(state.accountGroups || []));
}

function renameAccountInGroups(oldName, newName) {
  (state.accountGroups || []).forEach(group => {
    group.accountNames = group.accountNames.map(name => name === oldName ? newName : name);
  });
  writeAccountGroups();
}

function removeAccountFromGroups(accountName) {
  (state.accountGroups || []).forEach(group => {
    group.accountNames = group.accountNames.filter(name => name !== accountName);
  });
  writeAccountGroups();
}

function saveEvolutionRangeAndRender() {
  const start = document.getElementById("evolutionStartMonth")?.value || "2026-01";
  const end = document.getElementById("evolutionEndMonth")?.value || start;
  const ordered = compareMonthKeys(start, end) <= 0 ? { start, end } : { start: end, end: start };
  state.evolutionRange = {
    ...ordered,
    snapshotDay: Math.min(31, Math.max(1, readEvolutionNumber("evolutionSnapshotDay", state.evolutionRange.snapshotDay ?? 31))),
    income: readEvolutionNumber("evolutionEstimateIncome", state.evolutionRange.income ?? 1800),
    expenses: readEvolutionNumber("evolutionEstimateExpense", state.evolutionRange.expenses ?? 1250),
    investment: readEvolutionNumber("evolutionEstimateInvestment", state.evolutionRange.investment ?? 750)
  };
  localStorage.setItem(EVOLUTION_RANGE_KEY, JSON.stringify(state.evolutionRange));
  renderInvestmentEvolution();
}

function readEvolutionNumber(id, fallback) {
  const el = document.getElementById(id);
  if (!el || el.value === "") return Number(fallback) || 0;
  const parsed = parseNumber(el.value);
  return Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
}

function renderInvestmentEvolution() {
  fillEvolutionMonthSelectors();
  const rows = buildEvolutionRows(state.evolutionRange.start, state.evolutionRange.end);
  renderTable("evolutionTable", ["Mes", "Banco", "Inv.", "Total", "Ing.", "Gasto", "Aport."], rows.map(row => [
    escapeHtml(numericMonthLabel(row.month)),
    money(row.bank, 0),
    money(row.invested, 0),
    money(row.total, 0),
    money(row.income, 0),
    money(row.expenses, 0),
    money(row.investment, 0)
  ]));
}

function fillEvolutionMonthSelectors() {
  const months = buildEvolutionMonthOptions();
  fillSelect("evolutionStartMonth", months);
  fillSelect("evolutionEndMonth", months);
  fillSelect("evolutionSnapshotDay", Array.from({ length: 31 }, (_, idx) => String(idx + 1)));
  document.getElementById("evolutionStartMonth").value = state.evolutionRange.start;
  document.getElementById("evolutionEndMonth").value = state.evolutionRange.end;
  document.getElementById("evolutionSnapshotDay").value = String(state.evolutionRange.snapshotDay || 31);
  setEvolutionInputValue("evolutionEstimateIncome", state.evolutionRange.income ?? 1800);
  setEvolutionInputValue("evolutionEstimateExpense", state.evolutionRange.expenses ?? 1250);
  setEvolutionInputValue("evolutionEstimateInvestment", state.evolutionRange.investment ?? 750);
}

function setEvolutionInputValue(id, value) {
  const input = document.getElementById(id);
  if (!input || document.activeElement === input) return;
  input.value = formatDecimalInput(value, 0);
}

function buildEvolutionMonthOptions() {
  const txMonths = unique([...state.transactions, ...state.futureTransactions].map(t => monthKey(t.date)));
  const minMonth = txMonths.sort()[0] || "2025-01";
  const start = compareMonthKeys(minMonth, "2025-01") < 0 ? minMonth : "2025-01";
  const end = compareMonthKeys("2026-12", addMonthsKey(currentMonthKey(), 12)) > 0 ? "2026-12" : addMonthsKey(currentMonthKey(), 12);
  return monthsBetween(start, end).map(month => ({ value: month, label: compactMonthLabel(month) }));
}

function buildEvolutionRows(start, end) {
  const current = currentMonthKey();
  const months = monthsBetween(start, end);
  const priorMonth = addMonthsKey(current, -1);
  const snapshotDay = state.evolutionRange.snapshotDay || 31;
  const estimates = {
    income: safeNumber(state.evolutionRange.income || 1800),
    expenses: safeNumber(state.evolutionRange.expenses || 1250),
    investment: safeNumber(state.evolutionRange.investment || 750)
  };
  let projectedBank = bankAtMonthSnapshot(priorMonth, snapshotDay);
  let projectedInvested = investedAtMonthSnapshot(priorMonth, snapshotDay);
  const projection = new Map();
  monthsBetween(current, end).forEach(month => {
    projectedBank += estimates.income - estimates.expenses - estimates.investment;
    projectedInvested += estimates.investment;
    projection.set(month, { bank: projectedBank, invested: projectedInvested, ...estimates });
  });
  return months.map(month => {
    const isFuturePlan = compareMonthKeys(month, current) >= 0;
    if (isFuturePlan) {
      const p = projection.get(month) || { bank: projectedBank, invested: projectedInvested, income: 0, expenses: 0, investment: 0 };
      return { month, bank: p.bank, invested: p.invested, total: p.bank + p.invested, income: p.income, expenses: p.expenses, investment: p.investment };
    }
    const snapshot = monthSnapshotDate(month, snapshotDay);
    const summary = summarizeTransactions(state.transactions.filter(t => monthKey(t.date) === month && t.date <= snapshot));
    const bank = bankAtMonthSnapshot(month, snapshotDay);
    const invested = investedAtMonthSnapshot(month, snapshotDay);
    return { month, bank, invested, total: bank + invested, income: summary.income, expenses: summary.expenses, investment: summary.invested };
  });
}

function bankAtMonthSnapshot(month, day) {
  const end = monthSnapshotDate(month, day);
  return getInitialCash()
    + sum(state.transactions.filter(t => t.date <= end).map(t => t.amount));
}

function investedAtMonthSnapshot(month, day) {
  const end = monthSnapshotDate(month, day);
  return Math.abs(sum(state.transactions.filter(t => t.date <= end && isInvestment(t)).map(t => t.amount)));
}

function monthsBetween(start, end) {
  const out = [];
  for (let cursor = start; compareMonthKeys(cursor, end) <= 0; cursor = addMonthsKey(cursor, 1)) out.push(cursor);
  return out;
}

function addMonthsKey(month, amount) {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1 + amount, 1);
  return monthKey(date);
}

function monthSnapshotDate(month, day) {
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();
  return new Date(year, monthNum - 1, Math.min(Math.max(Number(day) || 31, 1), lastDay), 23, 59, 59, 999);
}

function compareMonthKeys(a, b) {
  return String(a).localeCompare(String(b));
}

function compactMonthLabel(key) {
  return `${monthName(key.slice(5, 7)).slice(0, 3)} ${key.slice(0, 4)}`;
}

function numericMonthLabel(key) {
  return `${key.slice(5, 7)}-${key.slice(2, 4)}`;
}

function shortWeekday(date) {
  return ["dom", "lun", "mar", "mie", "jue", "vie", "sab"][date.getDay()];
}

function tag(value) { return `<span class="tag">${escapeHtml(value || "Sin tipo")}</span>`; }
function amountCell(value) { return `<span class="amount ${value >= 0 ? "positive" : "negative"}">${money(value)}</span>`; }
function gainPct(value, invested) { return invested ? (value - invested) / invested : 0; }
function pctCell(value) {
  return `<span class="amount ${Number(value || 0) >= 0 ? "positive" : "negative"}">${pctNoSymbol(value)}</span>`;
}
function currentInvestmentTotal(item) {
  const total = safeNumber(item?.total);
  if (Number.isFinite(total)) return total;
  return safeNumber(item?.cantidad) * safeNumber(item?.valor);
}
function previousInvestmentTotal(item) {
  const previous = safeNumber(item?.valorAnterior);
  const quantity = safeNumber(item?.cantidad);
  return previous && quantity ? previous * quantity : currentInvestmentTotal(item);
}
function dailyInvestmentPct(item) {
  const storedPercent = normalizePercentPoints(item?.variacion);
  if (Number.isFinite(storedPercent)) return storedPercent / 100;
  const previousTotal = previousInvestmentTotal(item);
  const currentTotal = currentInvestmentTotal(item);
  return previousTotal ? (currentTotal - previousTotal) / previousTotal : 0;
}
function recalculateInvestmentTotal(item) {
  // Sheets es la fuente de VALUE/LAST PRICE/VARIATION.
  // En la app solo recalculamos localmente si es una fila nueva sin VALUE.
  if (!item) return item;
  if (!Number.isFinite(safeNumber(item.total))) {
    const quantity = safeNumber(item.cantidad);
    const value = safeNumber(item.valor);
    if (Number.isFinite(quantity) && Number.isFinite(value)) item.total = quantity * value;
  }
  item.variacion = normalizePercentPoints(item.variacion);
  return item;
}
function emptyBlock(text) { return `<div class="empty">${escapeHtml(text)}</div>`; }
function sum(values) { return values.reduce((a, b) => a + (Number(b) || 0), 0); }
function unique(values) { return [...new Set(values.filter(v => v !== undefined && v !== null && String(v).trim() !== ""))]; }
function currentMonthKey() { return monthKey(new Date()); }
function monthKey(date) { return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : ""; }
function monthName(month) {
  return FULL_MONTH_NAMES[Number(month) - 1] || "";
}
function monthLabel(key) { return `${monthName(key.slice(5, 7))} ${key.slice(0, 4)}`; }
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }
function isIncome(t) { return normalizeType(t.tipo) === "ingreso"; }
function isInvestment(t) { return normalizeType(t.tipo) === "inversion"; }
function isTransfer(t) { return normalizeType(t.tipo) === "transferencia"; }
function isMonthlyExpense(t) { return !isIncome(t) && !isInvestment(t) && !isTransfer(t); }
function normalizeType(value) { return removeAccents(String(value || "")).toLowerCase().trim(); }
function prettyType(value) {
  const n = normalizeType(value);
  const map = { inversion: "Inversión", descripcion: "Descripción", transferencia: "Transferencia" };
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

function normalizePercentPoints(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function formatDate(date) { return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""; }
function money(value, decimals = 2) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(Number(value) || 0); }
function pct(value, digits = 1) {
  const n = Number(value) || 0;
  return `${(n * 100).toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} %`;
}
function pctNoSymbol(value) {
  return pct(value).replace(/\s*%$/, "");
}
function formatDecimalInput(value, decimals = 2) { return safeNumber(parseNumber(value)).toFixed(decimals); }
function roundMoney(value) { const parsed = parseNumber(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0; }
function quantityFmt(value) {
  const number = Number(value) || 0;
  const decimals = Math.abs(number) > 0 && Math.abs(number) < 0.01 ? 6 : 4;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimals }).format(number);
}
function estimatedSharesFmt(value) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}
function round2(value) {
  const n = safeNumber(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : "";
}
function safeNumber(value) { return Number.isFinite(value) ? value : 0; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function removeAccents(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function setSyncStatus(message, type = "") {
  const el = document.getElementById("sourceNotice");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("show", Boolean(message));
  el.classList.toggle("ok", type === "ok");
  el.classList.toggle("warn", type === "warn");
}

function setNotice(message, type, durationMs) {
  showToast(message, type, durationMs);
}

function showToast(message, type = "", durationMs = 2000) {
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
  window.setTimeout(remove, durationMs);
}

function clearToasts() {
  document.querySelectorAll(".toast").forEach(toast => toast.remove());
}

function formatNoticeHtml(message) {
  return escapeHtml(message).replace(/\s*\/\/\s*/g, "<br>");
}

function lineMessage(...parts) {
  return parts.filter(part => part !== undefined && part !== null && String(part).trim()).join(" // ");
}

function plural(count, singular, pluralText) {
  return Number(count) === 1 ? singular : pluralText;
}
