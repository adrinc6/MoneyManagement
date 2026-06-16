const ENABLE_TEST_MODE = false;

const DEFAULT_CONFIG = {
  scriptUrl: "",
  appToken: "",
  sheetId: "",
  movementSheet: "Control Finanzas",
  investmentSheet: "Inversiones",
  bankSheet: "Bancos",
  dataSheet: "Datos",
  readMode: "apps-script",
  initialCash: 6122.08
};

const STATIC_TYPES = ["Gasto", "Ingreso", "Inversion", "Transferencia"];
const STATIC_CONCEPTS = ["Comida", "Cuidado personal", "Deporte", "Fiesta", "Inversion", "Ocio", "Otros", "Piso", "Supermercado", "Universidad", "Viajes"];
const INVESTMENT_TYPES = ["Bolsa", "Fondos", "Cartera"];
const COLORS = ["#15803d", "#c2410c", "#2563eb", "#b45309", "#7c3aed", "#0891b2", "#be123c", "#64748b"];

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
  investments: [],
  banks: [],
  categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS },
  charts: {},
  filtered: [],
  movementDrill: { level: "years", year: null, month: null },
  summaryModes: { situation: "ingresos", investmentMoney: "invested" },
  descriptionSuggestions: {}
};

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  wireUi();
  hydrateConfigForm();
  setDefaultDate();
  refreshData();
});

function wireUi() {
  document.querySelectorAll("[data-view-button]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.viewButton));
  });
  document.getElementById("refreshBtn").addEventListener("click", refreshData);
  document.getElementById("movementForm").addEventListener("submit", submitMovement);
  document.getElementById("formType").addEventListener("change", syncRegistrarMode);
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfigFromForm);
  document.getElementById("summaryMonth").addEventListener("change", renderAll);
  document.getElementById("openMonthSituationBtn").addEventListener("click", () => {
    document.getElementById("monthSituationDialog").showModal();
    renderSummary();
  });
  document.getElementById("closeMonthSituationBtn").addEventListener("click", () => document.getElementById("monthSituationDialog").close());
  document.getElementById("closeMoneyDialogBtn").addEventListener("click", () => document.getElementById("moneyDialog").close());
  document.getElementById("openInvestmentOverviewBtn").addEventListener("click", () => {
    document.getElementById("investmentOverviewDialog").showModal();
    renderInvestments();
  });
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
  document.getElementById("monthSituationMode").addEventListener("click", event => {
    const btn = event.target.closest("[data-situation-mode]");
    if (!btn) return;
    state.summaryModes.situation = btn.dataset.situationMode;
    renderSummary();
  });
  document.getElementById("investmentMoneyMode").addEventListener("click", event => {
    const btn = event.target.closest("[data-money-mode]");
    if (!btn) return;
    state.summaryModes.investmentMoney = btn.dataset.moneyMode;
    renderSummary();
  });
}

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll("[data-view-button]").forEach(b => b.classList.toggle("active", b.dataset.viewButton === id));
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
  document.getElementById("configInvestmentSheet").value = state.config.investmentSheet;
  document.getElementById("configBankSheet").value = state.config.bankSheet || "Bancos";
  document.getElementById("configDataSheet").value = state.config.dataSheet;
  document.getElementById("configReadMode").value = state.config.readMode;
  document.getElementById("configInitialCash").value = state.config.initialCash;
}

function saveConfigFromForm() {
  state.config = {
    scriptUrl: document.getElementById("configScriptUrl").value.trim(),
    appToken: document.getElementById("configAppToken").value.trim(),
    sheetId: document.getElementById("configSheetId").value.trim(),
    movementSheet: document.getElementById("configMovementSheet").value.trim() || "Control Finanzas",
    investmentSheet: document.getElementById("configInvestmentSheet").value.trim() || "Inversiones",
    bankSheet: document.getElementById("configBankSheet").value.trim() || "Bancos",
    dataSheet: document.getElementById("configDataSheet").value.trim() || "Datos",
    readMode: document.getElementById("configReadMode").value,
    initialCash: Number(document.getElementById("configInitialCash").value || 0)
  };
  localStorage.setItem("moneyConfig", JSON.stringify(state.config));
  refreshData();
}

function setDefaultDate() {
  document.getElementById("formDate").value = formatDate(new Date());
}

async function refreshData() {
  setNotice("Cargando datos...", "");
  try {
    if (ENABLE_TEST_MODE) {
      state.transactions = [...TEST_TRANSACTIONS];
      state.investments = [...TEST_INVESTMENTS];
      state.banks = [
        { rowNumber: 2, cuenta: "Santander-Cuenta", dinero: 2400 },
        { rowNumber: 3, cuenta: "Revolut-Ahorro", dinero: 1300 }
      ];
      state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
    } else if (state.config.readMode === "public-csv") {
      state.transactions = await fetchPublicCsvTransactions();
      state.investments = await fetchPublicCsvInvestments();
      state.banks = await fetchPublicCsvBanks();
      state.categories = await fetchPublicCsvCategories();
    } else {
      const payload = await fetchAppsScriptData();
      if (!payload.ok) throw new Error(payload.error || "Apps Script devolvio error");
      if (!Object.prototype.hasOwnProperty.call(payload, "banks")) {
        throw new Error("Apps Script no devuelve la hoja Bancos. Pega y despliega el apps-script.gs actualizado");
      }
      state.transactions = (payload.transactions || []).map(normalizeTransaction).filter(Boolean);
      state.investments = (payload.investments || []).map(normalizeInvestment).filter(Boolean);
      state.banks = (payload.banks || []).map(normalizeBank).filter(Boolean);
      state.categories = normalizeCategories(payload.categories);
    }
    syncOptions();
    renderAll();
    setNotice(`${state.transactions.length} movimientos y ${state.banks.length} cuentas cargadas.`, "ok");
  } catch (error) {
    console.error(error);
    state.transactions = [];
    state.investments = [];
    state.banks = [];
    state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
    syncOptions();
    renderAll();
    setNotice(`No se pudieron cargar datos: ${error.message}. Revisa Ajustes.`, "warn");
  }
}

async function fetchAppsScriptData() {
  if (!state.config.scriptUrl) throw new Error("falta la URL de Apps Script");
  const url = `${state.config.scriptUrl}?action=all&token=${encodeURIComponent(state.config.appToken)}&movementSheet=${encodeURIComponent(state.config.movementSheet)}&investmentSheet=${encodeURIComponent(state.config.investmentSheet)}&bankSheet=${encodeURIComponent(state.config.bankSheet || "Bancos")}&dataSheet=${encodeURIComponent(state.config.dataSheet)}`;
  return jsonp(url);
}

async function fetchPublicCsvTransactions() {
  if (!state.config.sheetId) throw new Error("falta el ID de Google Sheet");
  const csv = await fetchCsv(state.config.sheetId, state.config.movementSheet);
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
    ...state.transactions.map(t => t.concepto)
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

  buildDescriptionSuggestions();
  syncRegistrarMode();

  const months = unique([currentMonthKey(), ...state.transactions.map(t => monthKey(t.date))]).sort().reverse();
  const previousMonth = document.getElementById("summaryMonth").value;
  fillSelect("summaryMonth", months);
  document.getElementById("summaryMonth").value = months.includes(previousMonth) ? previousMonth : currentMonthKey();
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
  document.getElementById("submitMovement").innerHTML = isTransfer
    ? `<i data-lucide="repeat-2"></i> Transferir entre cuentas`
    : `<i data-lucide="send"></i> Enviar a Google Sheets`;
  lucide.createIcons();
}

function fillSelect(id, values, placeholder = null) {
  const el = document.getElementById(id);
  const current = el.value;

  const options = [
    ...(placeholder ? [`<option value="">${escapeHtml(placeholder)}</option>`] : []),
    ...values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
  ];

  el.innerHTML = options.join("");

  if (values.includes(current)) {
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
  renderSummary();
  renderMovements();
  renderInvestments();
  lucide.createIcons();
}

function renderSummary() {
  const month = document.getElementById("summaryMonth").value || currentMonthKey();
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
  renderTable("monthSituationTable", ["Detalle", "Cantidad", "%"], rows.map(([label, value]) => [
    escapeHtml(label),
    money(value),
    total ? pct(value / total) : "0,0 %"
  ]));
  upsertChart("monthSituationChart", "doughnut", {
    labels: rows.map(([label, value]) => `${label}: ${money(value)} (${total ? pct(value / total) : "0,0 %"})`),
    datasets: [{ data: rows.map(e => e[1]), backgroundColor: COLORS, borderWidth: 2, borderColor: "#fff" }]
  }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "58%" });
}

function renderMoneySummary(summary) {
  document.querySelectorAll("[data-money-mode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.moneyMode === state.summaryModes.investmentMoney);
  });
  const bankDelta = summary.bankAccountsTotal - summary.computedBank;
  const checkTone = Math.abs(bankDelta) < 0.01 ? "positive" : "negative";
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
        <small class="${checkTone}">${state.banks.length ? (Math.abs(bankDelta) < 0.01 ? "Check OK" : `Diferencia ${money(bankDelta)}`) : "Sin Bancos"}</small>
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
}

function openMoneyDetail(mode) {
  const summary = calculateSummary(document.getElementById("summaryMonth").value || currentMonthKey());
  const isBank = mode === "bank";
  const bankDelta = summary.bankAccountsTotal - summary.computedBank;
  const checkTone = Math.abs(bankDelta) < 0.01 ? "positive" : "negative";
  const parts = INVESTMENT_TYPES.map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    return `<div class="money-item"><span>${type}</span><strong>${money(invested)}</strong><small class="muted">Actual: ${money(current)} · ${pctGain(current, invested)}</small></div>`;
  }).join("");

  document.getElementById("moneyDialogTitle").textContent = isBank ? "Banco" : "Invertido";
  document.getElementById("bankMoneyDetail").classList.toggle("hidden", !isBank);
  document.getElementById("investedMoneyDetail").classList.toggle("hidden", isBank);
  document.getElementById("moneyDialogSummary").innerHTML = isBank ? `
    <div class="money-grid">
      <div class="money-item"><span>Banco</span><strong>${money(summary.bank)}</strong><small class="muted">${state.banks.length} cuentas</small></div>
      <div class="money-item"><span>App</span><strong>${money(summary.computedBank)}</strong><small class="${checkTone}">Diferencia ${money(bankDelta)}</small></div>
    </div>
    <div class="bank-check ${checkTone}">
      <i data-lucide="${Math.abs(bankDelta) < 0.01 ? "check-circle-2" : "alert-triangle"}"></i>
      <span>${state.banks.length ? `Suma de cuentas ${money(summary.bankAccountsTotal)} · App ${money(summary.computedBank)} · Diferencia ${money(bankDelta)}` : "Sin cuentas cargadas en la hoja Bancos."}</span>
    </div>
    <div class="bank-list">${renderBankRows()}</div>
    ${state.banks.length && state.config.readMode === "apps-script" ? `<button class="btn full" id="saveBanksBtn" type="button"><i data-lucide="save"></i> Guardar cuentas</button>` : ""}
  ` : `
    <div class="money-grid">
      <div class="money-item"><span>Invertido</span><strong>${money(summary.investedTotal)}</strong><small class="muted">Coste historico</small></div>
      <div class="money-item"><span>Actual</span><strong>${money(summary.valueTotal)}</strong><small class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${money(summary.profitLoss)} · ${pct(summary.profitLossPct)}</small></div>
      ${parts}
    </div>
  `;
  document.getElementById("saveBanksBtn")?.addEventListener("click", saveBanks);
  document.getElementById("moneyDialog").showModal();
  renderMoneyCharts(summary);
  lucide.createIcons();
}

function renderBankRows() {
  return state.banks.map((bank, idx) => `
    <label class="bank-row">
      <span>${escapeHtml(bank.cuenta)}</span>
      <input data-bank-index="${idx}" type="number" step="0.01" value="${safeNumber(bank.dinero)}">
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
  const computedBank = state.config.initialCash
    + sum(untilToday.filter(t => normalizeType(t.tipo) === "ingreso").map(t => t.amount))
    + sum(untilToday.filter(t => normalizeType(t.tipo) === "gasto").map(t => t.amount))
    - sum(untilToday.filter(t => normalizeType(t.tipo) === "retiro").map(t => t.amount))
    + sum(untilToday.filter(t => isInvestment(t)).map(t => t.amount));
  const bankAccountsTotal = sum(state.banks.map(b => b.dinero));
  const bank = state.banks.length ? bankAccountsTotal : computedBank;
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
      <div><strong>Gastos + inversion</strong><span>${money(outflow)} · Gasto ${pct(expensePct)} · Inversion ${pct(investmentPct)}</span></div>
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
  const bankLabels = state.banks.map(b => b.cuenta);
  const bankValues = state.banks.map(b => b.dinero);
  upsertChart("bankDistributionChart", "doughnut", {
    labels: bankLabels.length ? bankLabels : ["Banco"],
    datasets: [{ data: bankValues.length ? bankValues : [summary.bank], backgroundColor: COLORS, borderColor: "#fff", borderWidth: 2 }]
  }, compactChartOptions("Distribucion cuentas"));

  upsertChart("moneyVsInvestedChart", "doughnut", {
    labels: ["Dinero", "Invertido"],
    datasets: [{ data: [summary.bank, summary.investedTotal], backgroundColor: ["#0f766e", "#2563eb"], borderColor: "#fff", borderWidth: 2 }]
  }, compactChartOptions("Dinero vs invertido"));

  const isCurrent = state.summaryModes.investmentMoney === "current";
  const values = INVESTMENT_TYPES.map(type => isCurrent ? summary.valueByType[type] || 0 : summary.investedByType[type] || 0);
  upsertChart("investmentTypesChart", "bar", {
    labels: INVESTMENT_TYPES,
    datasets: [{
      label: isCurrent ? "Valor actual" : "Invertido",
      data: values,
      backgroundColor: COLORS.slice(2, 5),
      borderRadius: 8
    }]
  }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: moneyTooltip() }, scales: moneyScales() });
}

function renderMovements() {
  const drill = state.movementDrill;
  document.getElementById("movementBackBtn").style.visibility = drill.level === "years" ? "hidden" : "visible";
  if (drill.level === "years") renderMovementYears();
  if (drill.level === "months") renderMovementMonths(drill.year);
  if (drill.level === "entries") renderMovementEntries(drill.year, drill.month);
}

function renderMovementYears() {
  const years = unique(state.transactions.map(t => String(t.date.getFullYear()))).sort((a, b) => Number(b) - Number(a));
  document.getElementById("movementDrillTitle").textContent = "Selecciona un año";
  document.getElementById("movementDrill").innerHTML = `<div class="year-grid">${years.map(year => {
    const tx = state.transactions.filter(t => String(t.date.getFullYear()) === year);
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
  state.filtered = state.transactions;
}

function renderMovementMonths(year) {
  const months = unique(state.transactions.filter(t => String(t.date.getFullYear()) === year).map(t => monthKey(t.date))).sort().reverse();
  document.getElementById("movementDrillTitle").textContent = `Año ${year}`;
  document.getElementById("movementDrill").innerHTML = `<div class="month-card-list">${months.map(month => {
    const s = calculateSummary(month);
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
  state.filtered = state.transactions.filter(t => String(t.date.getFullYear()) === year);
}
function renderMovementEntries(year, month) {
  const rows = state.transactions
    .filter(t => String(t.date.getFullYear()) === year && monthKey(t.date) === month)
    .sort((a, b) => b.date - a.date);
  const summary = calculateSummary(month);
  document.getElementById("movementDrillTitle").innerHTML = `${month} · ${rows.length} movimientos`;
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
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty" colspan="5">Sin datos para mostrar.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `<thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Descripcion</th><th>Importe</th></tr></thead><tbody>${
    rows.map(t => `<tr class="clickable-row" data-movement-index="${state.transactions.indexOf(t)}">${transactionRow(t).map(c => `<td>${c}</td>`).join("")}</tr>`).join("")
  }</tbody>`;
  table.querySelectorAll("[data-movement-index]").forEach(row => {
    row.addEventListener("click", () => openMovementDetail(Number(row.dataset.movementIndex)));
  });
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
  const summary = calculateSummary(document.getElementById("summaryMonth").value || currentMonthKey());
  document.getElementById("investmentCurrentTotal").textContent = money(summary.valueTotal);
  document.getElementById("investmentTotalMetrics").innerHTML = `
    <div><span>Invertido</span><strong>${money(summary.investedTotal)}</strong></div>
    <div><span>Ganancia</span><strong class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${money(summary.profitLoss)}</strong></div>
    <div><span>%</span><strong class="${summary.profitLoss >= 0 ? "positive" : "negative"}">${pct(summary.profitLossPct)}</strong></div>
  `;
  if (document.getElementById("investmentOverviewDialog").open) {
    renderInvestmentBreakdownCharts(summary);
  }
  renderTable("investmentBreakdownTable", ["Tipo", "Invertido", "Actual", "Ganancia", "%"], INVESTMENT_TYPES.map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    return [type, money(invested), money(current), amountCell(current - invested), pctGain(current, invested)];
  }));
  renderInvestmentEditTable();
}

function renderInvestmentEditTable() {
  const sorted = [...state.investments].sort((a, b) => INVESTMENT_TYPES.indexOf(a.tipo) - INVESTMENT_TYPES.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre));
  let lastType = "";
  const body = sorted.map((i) => {
    const idx = state.investments.indexOf(i);
    const group = i.tipo !== lastType ? `<tr><th colspan="4">${escapeHtml(i.tipo || "Sin tipo")}</th></tr>` : "";
    lastType = i.tipo;
    const invested = calculateSummary(document.getElementById("summaryMonth").value || currentMonthKey()).investedByType[i.tipo] || 0;
    const share = invested ? i.total / invested : 0;
    return `${group}<tr class="clickable-row" data-investment-index="${idx}">
      <td>${escapeHtml(i.nombre)}</td>
      <td>${money(i.cantidad, 4)}</td>
      <td>${money(i.valor, 4)}</td>
      <td>${money(i.total)} <small class="muted">${pct(share)}</small></td>
    </tr>`;
  }).join("");
  document.getElementById("investmentEditTable").innerHTML = `<thead><tr><th>Nombre</th><th>Cantidad</th><th>Valor</th><th>Total</th></tr></thead><tbody>${body || `<tr><td class="empty" colspan="4">Sin posiciones.</td></tr>`}</tbody>`;
  document.querySelectorAll("#investmentEditTable [data-investment-index]").forEach(row => {
    row.addEventListener("click", () => openInvestmentDetail(Number(row.dataset.investmentIndex)));
  });
}

function renderInvestmentBreakdownCharts(summary) {
  const invested = INVESTMENT_TYPES.map(type => summary.investedByType[type] || 0);
  const current = INVESTMENT_TYPES.map(type => summary.valueByType[type] || 0);
  const gains = INVESTMENT_TYPES.map((type, idx) => current[idx] - invested[idx]);
  upsertChart("investmentBreakdownDonut", "doughnut", {
    labels: INVESTMENT_TYPES.map((type, idx) => `${type}: ${money(current[idx])} (${pctGain(current[idx], invested[idx])})`),
    datasets: [{ data: current, backgroundColor: COLORS.slice(2, 5), borderColor: "#fff", borderWidth: 2 }]
  }, compactChartOptions("Valor actual"));

  upsertChart("investmentBreakdownBars", "bar", {
    labels: INVESTMENT_TYPES,
    datasets: [
      { label: "Invertido", data: invested, backgroundColor: "#2563eb", borderRadius: 8 },
      { label: "Actual", data: current, backgroundColor: "#15803d", borderRadius: 8 },
      { label: "Ganancia", data: gains, backgroundColor: gains.map(v => v >= 0 ? "#0f766e" : "#c2410c"), borderRadius: 8 }
    ]
  }, { responsive: true, maintainAspectRatio: false, plugins: { tooltip: moneyTooltip() }, scales: moneyScales() });
}

function addInvestmentRow() {
  state.investments.push({ rowNumber: null, data: "", nombre: "", tipo: "Cartera", cantidad: 0, valor: 0, total: 0 });
  openInvestmentDetail(state.investments.length - 1);
}

async function saveInvestments() {
  readInvestmentEditor();
  if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
    setNotice("Para modificar inversiones necesitas Apps Script.", "warn");
    renderInvestments();
    return;
  }
  const btn = document.getElementById("saveInvestmentsBtn");
  btn.disabled = true;
  try {
    await fetch(state.config.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveInvestments", token: state.config.appToken, sheetName: state.config.investmentSheet, investments: state.investments })
    });
    setNotice("Cambios de inversiones enviados.", "ok");
  } catch (error) {
    setNotice(`No se pudieron guardar inversiones: ${error.message}`, "warn");
  } finally {
    btn.disabled = false;
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
  const t = state.transactions[index];
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
  const index = Number(document.getElementById("editMovementIndex").value);
  const previous = state.transactions[index];
  if (!previous) return;
  const movement = normalizeTransaction({
    rowNumber: previous.rowNumber,
    fecha: document.getElementById("editMovementDate").value,
    tipo: document.getElementById("editMovementType").value,
    concepto: document.getElementById("editMovementConcept").value,
    descripcion: document.getElementById("editMovementDescription").value,
    importe: document.getElementById("editMovementAmount").value
  });
  if (!movement) return;
  if (state.config.readMode === "apps-script" && state.config.scriptUrl && previous.rowNumber) {
    await postAppsScript({ action: "updateMovement", movement, sheetName: state.config.movementSheet });
    setNotice("Movimiento actualizado.", "ok");
  } else {
    setNotice("Cambio local: para guardar en Sheets necesitas Apps Script y rowNumber.", "warn");
  }
  state.transactions[index] = movement;
  document.getElementById("movementDetailDialog").close();
  syncOptions();
  renderAll();
}

async function deleteMovementDetail() {
  const index = Number(document.getElementById("editMovementIndex").value);
  const movement = state.transactions[index];
  if (!movement) return;
  if (state.config.readMode === "apps-script" && state.config.scriptUrl && movement.rowNumber) {
    await postAppsScript({ action: "deleteMovement", rowNumber: movement.rowNumber, sheetName: state.config.movementSheet });
    setNotice("Movimiento eliminado.", "ok");
  } else {
    setNotice("Eliminado solo en pantalla: para borrar en Sheets necesitas Apps Script y rowNumber.", "warn");
  }
  state.transactions.splice(index, 1);
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
  const btn = document.getElementById("submitMovement");
  btn.disabled = true;
  try {
    if (isTransfer) {
      const amount = Math.abs(Number(document.getElementById("formAmount").value || 0));
      const from = document.getElementById("formTransferFrom").value;
      const to = document.getElementById("formTransferTo").value;
      if (!amount || !from || !to || from === to) throw new Error("elige origen, destino e importe valido");
      await postAppsScript({ action: "transferBank", bankSheet: state.config.bankSheet || "Bancos", from, to, amount });
      applyBankDelta(from, -amount);
      applyBankDelta(to, amount);
      setNotice("Transferencia realizada.", "ok");
    } else {
      const movement = movementFromForm();
      await postAppsScript({
        action: "addMovement",
        movement,
        sheetName: state.config.movementSheet,
        bankSheet: state.config.bankSheet || "Bancos",
        account: document.getElementById("formAccount").value
      });
      applyBankDelta(document.getElementById("formAccount").value, movement.amount);
      state.transactions.push(movement);
      setNotice("Movimiento enviado.", "ok");
    }
    syncOptions();
    renderAll();
    event.target.reset();
    setDefaultDate();
    syncRegistrarMode();
  } catch (error) {
    setNotice(`No se pudo enviar: ${error.message}`, "warn");
  } finally {
    btn.disabled = false;
  }
}

function movementFromForm() {
  const type = prettyType(document.getElementById("formType").value);
  const amount = Number(document.getElementById("formAmount").value || 0);

  return normalizeTransaction({
    fecha: document.getElementById("formDate").value,
    tipo: type,
    concepto: prettyType(document.getElementById("formConcept").value),
    descripcion: document.getElementById("formDescription").value.trim(),
    importe: amount
  });
}

function applyBankDelta(account, amount) {
  const bank = state.banks.find(b => b.cuenta === account);
  if (bank) bank.dinero += Number(amount) || 0;
}

async function saveBanks() {
  document.querySelectorAll("[data-bank-index]").forEach(input => {
    const idx = Number(input.dataset.bankIndex);
    if (state.banks[idx]) state.banks[idx].dinero = Number(input.value || 0);
  });
  if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
    renderSummary();
    return;
  }
  try {
    await postAppsScript({ action: "saveBanks", bankSheet: state.config.bankSheet || "Bancos", banks: state.banks });
    setNotice("Cuentas guardadas.", "ok");
  } catch (error) {
    setNotice(`No se pudieron guardar cuentas: ${error.message}`, "warn");
  }
  renderSummary();
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
  return { rowNumber: Number(row.rowNumber || row.row || 0) || null, date, tipo, concepto: concepto || "Otros", descripcion, amount };
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
  return [formatDate(t.date), tag(t.tipo), escapeHtml(t.concepto), escapeHtml(t.descripcion), amountCell(t.amount)];
}

function upsertChart(canvasId, type, data, options) {
  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  state.charts[canvasId] = new Chart(document.getElementById(canvasId), { type, data, options });
}

function compactChartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: Boolean(title), text: title },
      legend: { position: "bottom" },
      tooltip: moneyTooltip()
    },
    cutout: "58%"
  };
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
function money(value, decimals = 2) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value) || 0); }
function pct(value) { return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 }).format(Number(value) || 0); }
function safeNumber(value) { return Number.isFinite(value) ? value : 0; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function removeAccents(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function setNotice(message, type) {
  const el = document.getElementById("sourceNotice");
  el.textContent = message || "";
  el.className = `sync-status ${message ? "show" : ""} ${type === "ok" ? "ok" : type === "warn" ? "warn" : ""}`;
}
