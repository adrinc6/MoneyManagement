const ENABLE_TEST_MODE = false;

const DEFAULT_CONFIG = {
  scriptUrl: "",
  appToken: "",
  sheetId: "",
  movementSheet: "Control Finanzas",
  investmentSheet: "Inversiones",
  dataSheet: "Datos",
  readMode: "apps-script",
  initialCash: 6122.08
};

const STATIC_TYPES = ["Gasto", "Ingreso", "Retiro", "Inversion"];
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
  categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS },
  charts: {},
  filtered: [],
  movementDrill: { level: "years", year: null, month: null },
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
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfigFromForm);
  document.getElementById("summaryMonth").addEventListener("change", renderAll);
  document.getElementById("openMonthSituationBtn").addEventListener("click", () => {
    document.getElementById("monthSituationDialog").showModal();
    renderSummary();
  });
  document.getElementById("closeMonthSituationBtn").addEventListener("click", () => document.getElementById("monthSituationDialog").close());
  document.getElementById("movementBackBtn").addEventListener("click", movementBack);
  document.getElementById("addInvestmentRowBtn").addEventListener("click", addInvestmentRow);
  document.getElementById("saveInvestmentsBtn").addEventListener("click", saveInvestments);
  document.getElementById("formDescription").addEventListener("input", suggestTypeConceptFromDescription);
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
      state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
    } else if (state.config.readMode === "public-csv") {
      state.transactions = await fetchPublicCsvTransactions();
      state.investments = await fetchPublicCsvInvestments();
      state.categories = await fetchPublicCsvCategories();
    } else {
      const payload = await fetchAppsScriptData();
      if (!payload.ok) throw new Error(payload.error || "Apps Script devolvio error");
      state.transactions = (payload.transactions || []).map(normalizeTransaction).filter(Boolean);
      state.investments = (payload.investments || []).map(normalizeInvestment).filter(Boolean);
      state.categories = normalizeCategories(payload.categories);
    }
    syncOptions();
    renderAll();
    setNotice(`${state.transactions.length} movimientos cargados.`, "ok");
  } catch (error) {
    console.error(error);
    state.transactions = [];
    state.investments = [];
    state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
    syncOptions();
    renderAll();
    setNotice(`No se pudieron cargar datos: ${error.message}. Revisa Ajustes.`, "warn");
  }
}

async function fetchAppsScriptData() {
  if (!state.config.scriptUrl) throw new Error("falta la URL de Apps Script");
  const url = `${state.config.scriptUrl}?action=all&token=${encodeURIComponent(state.config.appToken)}&movementSheet=${encodeURIComponent(state.config.movementSheet)}&investmentSheet=${encodeURIComponent(state.config.investmentSheet)}&dataSheet=${encodeURIComponent(state.config.dataSheet)}`;
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
  const forbiddenTypes = ["efectivo", "otros"];

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

  buildDescriptionSuggestions();

  const months = unique([currentMonthKey(), ...state.transactions.map(t => monthKey(t.date))]).sort().reverse();
  const previousMonth = document.getElementById("summaryMonth").value;
  fillSelect("summaryMonth", months);
  document.getElementById("summaryMonth").value = months.includes(previousMonth) ? previousMonth : currentMonthKey();
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
    ["Inversion", summary.investedMonth, ""]
  ];
  document.getElementById("monthSituationStrip").innerHTML = situationItems
    .map(([label, value, tone]) => summaryItem(label, money(value), tone))
    .join("");
  renderMonthSituationDialog(summary);
  renderMoneySummary(summary);
}

function renderMonthSituationDialog(summary) {
  const entries = [
    ["Ingresos", summary.income],
    ["Gastos", summary.expenses],
    ["Inversion", summary.investedMonth]
  ];
  const total = sum(entries.map(e => e[1]));
  renderTable("monthSituationTable", ["Categoria", "Cantidad", "%"], entries.map(([label, value]) => [
    escapeHtml(label),
    money(value),
    total ? pct(value / total) : "0,0 %"
  ]));
  upsertChart("monthSituationChart", "doughnut", {
    labels: entries.map(([label, value]) => `${label}: ${money(value)} (${total ? pct(value / total) : "0,0 %"})`),
    datasets: [{ data: entries.map(e => e[1]), backgroundColor: COLORS, borderWidth: 2, borderColor: "#fff" }]
  }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "58%" });
}

function renderMoneySummary(summary) {
  const parts = INVESTMENT_TYPES.map(type => {
    const invested = summary.investedByType[type] || 0;
    const current = summary.valueByType[type] || 0;
    return `<div class="money-item"><span>${type}</span><strong>${money(invested)}</strong><small class="muted">Actual: ${money(current)}</small></div>`;
  }).join("");
  document.getElementById("moneySummary").innerHTML = `
    <div class="money-grid">
      <div class="money-item"><span>Banco</span><strong>${money(summary.bank)}</strong></div>
      <div class="money-item"><span>Invertido total</span><strong>${money(summary.investedTotal)}</strong></div>
      ${parts}
    </div>
  `;
  document.getElementById("bookMoneyTotal").textContent = money(summary.totalMoneyBook);
}

function calculateSummary(month) {
  const [year, monthNum] = month.split("-").map(Number);
  const txMonth = state.transactions.filter(t => t.date.getFullYear() === year && t.date.getMonth() + 1 === monthNum);
  const untilToday = state.transactions.filter(t => t.date <= endOfToday());
  const income = sum(txMonth.filter(isIncome).map(t => t.amount));
  const expenses = Math.abs(sum(txMonth.filter(isMonthlyExpense).map(t => t.amount)));
  const investedMonth = Math.abs(sum(txMonth.filter(isInvestment).map(t => t.amount)));
  const balance = sum(txMonth.map(t => t.amount));
  const bank = state.config.initialCash
    + sum(untilToday.filter(t => normalizeType(t.tipo) === "ingreso").map(t => t.amount))
    + sum(untilToday.filter(t => normalizeType(t.tipo) === "gasto").map(t => t.amount))
    - sum(untilToday.filter(t => normalizeType(t.tipo) === "retiro").map(t => t.amount))
    + sum(untilToday.filter(t => isInvestment(t)).map(t => t.amount));
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
    investedByType, valueByType, investedTotal, valueTotal,
    totalMoneyBook: bank + investedTotal,
    profitLoss: valueTotal - investedTotal,
    profitLossPct: investedTotal ? (valueTotal - investedTotal) / investedTotal : 0
  };
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
  document.getElementById("movementDrillTitle").textContent = "Selecciona un añoo";
  document.getElementById("movementDrill").innerHTML = `<div class="year-grid">${years.map(year => {
    const tx = state.transactions.filter(t => String(t.date.getFullYear()) === year);
    const yearly = summarizeTransactions(tx);
    return `<button class="year-card" data-year="${year}">
      <span>Ano</span>
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
  document.getElementById("movementDrillTitle").textContent = `Ano ${year}`;
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
  renderTable("movementTable", ["Fecha", "Tipo", "Concepto", "Descripcion", "Importe"], rows.map(transactionRow));
  state.filtered = rows;
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
    const group = i.tipo !== lastType ? `<tr><th colspan="6">${escapeHtml(i.tipo || "Sin tipo")}</th></tr>` : "";
    lastType = i.tipo;
    return `${group}<tr data-investment-index="${idx}">
      <td><input data-field="data" value="${escapeAttr(i.data)}"></td>
      <td><input data-field="nombre" value="${escapeAttr(i.nombre)}"></td>
      <td><input data-field="tipo" value="${escapeAttr(i.tipo)}"></td>
      <td><input data-field="cantidad" type="number" step="0.0001" value="${safeNumber(i.cantidad)}"></td>
      <td><input data-field="valor" type="number" step="0.0001" value="${safeNumber(i.valor)}"></td>
      <td><input data-field="total" type="number" step="0.01" value="${safeNumber(i.total)}"></td>
    </tr>`;
  }).join("");
  document.getElementById("investmentEditTable").innerHTML = `<thead><tr><th>DATA</th><th>Nombre</th><th>Tipo</th><th>Cantidad</th><th>Valor</th><th>Total</th></tr></thead><tbody>${body || `<tr><td class="empty" colspan="6">Sin posiciones.</td></tr>`}</tbody>`;
}

function addInvestmentRow() {
  state.investments.push({ rowNumber: null, data: "", nombre: "", tipo: "Cartera", cantidad: 0, valor: 0, total: 0 });
  renderInvestmentEditTable();
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

async function submitMovement(event) {
  event.preventDefault();
  const movement = movementFromForm();
  if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
    setNotice("Configura Apps Script antes de enviar movimientos.", "warn");
    return;
  }
  const btn = document.getElementById("submitMovement");
  btn.disabled = true;
  try {
    await fetch(state.config.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "addMovement", token: state.config.appToken, movement, sheetName: state.config.movementSheet })
    });
    state.transactions.push(movement);
    syncOptions();
    renderAll();
    setNotice("Movimiento enviado.", "ok");
    event.target.reset();
    setDefaultDate();
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

function normalizeTransaction(row) {
  const date = parseDate(row.fecha || row.FECHA || row.date || row[0]);
  const tipo = prettyType(String(row.tipo || row.TIPO || row[4] || "").trim());
  const concepto = prettyType(String(row.concepto || row.CONCEPTO || row[5] || "").trim());
  const descripcion = String(row.descripcion || row.DESCRIPCION || row["DESCRIPCION"] || row[6] || "").trim();
  const amount = parseNumber(row.importe ?? row.IMPORTE ?? row[7]);
  if (!date || !tipo || Number.isNaN(amount)) return null;
  return { date, tipo, concepto: concepto || "Otros", descripcion, amount };
}

function normalizeInvestment(row) {
  const total = parseNumber(row.total ?? row["VALOR TOTAL"] ?? row[5]);
  const data = String(row.data || row.DATA || row[0] || "").trim();
  const nombre = String(row.nombre || row.NOMBRE || row[1] || data).trim();
  const tipo = prettyType(String(row.tipo || row.TIPO || row[2] || "").trim());
  if (!data || !nombre || !tipo || Number.isNaN(total) || total < 0) return null;
  return { rowNumber: Number(row.rowNumber || row.row || 0) || null, data, nombre, tipo, cantidad: parseNumber(row.cantidad ?? row.CANTIDAD ?? row[3]), valor: parseNumber(row.valor ?? row.VALOR ?? row[4]), total };
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
  const map = { inversion: "Inversion", descripcion: "Descripcion" };
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


