const DEFAULT_CONFIG = {
      scriptUrl: "",
      appToken: "",
      sheetId: "",
      movementSheet: "Control Finanzas",
      investmentSheet: "Inversiones",
      dataSheet: "Datos",
      readMode: "demo",
      initialCash: 6122.08
    };
    const STATIC_TYPES = ["Efectivo", "Gasto", "Ingreso", "Retiro", "Inversion"];
    const STATIC_CONCEPTS = ["Comida", "Cuidado personal", "Deporte", "Fiesta", "Inversion", "Ocio", "Otros", "Piso", "Supermercado", "Universidad", "Viajes"];
    const INVESTMENT_TYPES = ["Bolsa", "Fondos", "Cartera"];
    const COLORS = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#c2410c", "#15803d", "#0891b2", "#be123c", "#4f46e5", "#64748b", "#a16207"];

    const DEMO_TRANSACTIONS = [
      ["2026-01-03", "Gasto", "Piso", "Alquiler", -650],
      ["2026-01-04", "Gasto", "Supermercado", "Compra semanal", -72.35],
      ["2026-01-10", "Ingreso", "Otros", "Nomina", 2100],
      ["2026-01-15", "Inversion", "Inversion", "Bolsa", -300],
      ["2026-02-02", "Gasto", "Ocio", "Cine", -18],
      ["2026-02-05", "Gasto", "Comida", "Restaurante", -36.5],
      ["2026-02-10", "Ingreso", "Otros", "Nomina", 2100],
      ["2026-02-18", "Gasto", "Viajes", "Tren", -44.7],
      ["2026-03-01", "Gasto", "Piso", "Alquiler", -650],
      ["2026-03-10", "Ingreso", "Otros", "Nomina", 2100],
      ["2026-03-12", "Gasto", "Deporte", "Gimnasio", -39.9],
      ["2026-03-20", "Inversion", "Inversion", "Fondos", -350],
      ["2026-04-02", "Gasto", "Supermercado", "Compra", -94.2],
      ["2026-04-10", "Ingreso", "Otros", "Nomina", 2100],
      ["2026-04-14", "Gasto", "Cuidado personal", "Peluqueria", -22],
      ["2026-04-22", "Gasto", "Fiesta", "Cena", -58],
      ["2026-05-02", "Gasto", "Piso", "Alquiler", -650],
      ["2026-05-10", "Ingreso", "Otros", "Nomina", 2100],
      ["2026-05-12", "Gasto", "Supermercado", "Compra", -83.4],
      ["2026-05-25", "Retiro", "Otros", "Cajero", -120],
      ["2026-06-03", "Gasto", "Comida", "Menu", -14.5],
      ["2026-06-10", "Ingreso", "Otros", "Nomina", 2100],
      ["2026-06-11", "Gasto", "Ocio", "Libro", -19.99],
      ["2026-06-16", "Inversion", "Inversion", "Cartera", -400]
    ].map(row => normalizeTransaction({ fecha: row[0], tipo: row[1], concepto: row[2], descripcion: row[3], importe: row[4] }));

    const DEMO_INVESTMENTS = [
      { rowNumber: 10, data: "IWDA", nombre: "ETF MSCI World", tipo: "Cartera", cantidad: 23, valor: 89.4, total: 2056.2 },
      { rowNumber: 11, data: "EUNL", nombre: "ETF Core", tipo: "Bolsa", cantidad: 8, valor: 102.2, total: 817.6 },
      { rowNumber: 12, data: "Fondo Global", nombre: "Fondo indexado", tipo: "Fondos", cantidad: 1, valor: 3240, total: 3240 }
    ];

    const state = {
      config: loadConfig(),
      transactions: [],
      investments: [],
      categories: { types: STATIC_TYPES, concepts: STATIC_CONCEPTS },
      charts: {},
      filtered: []
    };

    document.addEventListener("DOMContentLoaded", () => {
      lucide.createIcons();
      wireUi();
      hydrateConfigForm();
      setDefaultDate();
      refreshData();
    });

    function wireUi() {
      document.querySelectorAll("[data-view-button]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.viewButton)));
      document.getElementById("refreshBtn").addEventListener("click", refreshData);
      document.getElementById("openSummaryBtn").addEventListener("click", () => document.getElementById("summaryDialog").showModal());
      document.getElementById("closeSummaryBtn").addEventListener("click", () => document.getElementById("summaryDialog").close());
      document.getElementById("movementForm").addEventListener("submit", submitMovement);
      document.getElementById("addLocalBtn").addEventListener("click", addLocalMovement);
      document.getElementById("saveConfigBtn").addEventListener("click", saveConfigFromForm);
      document.getElementById("demoBtn").addEventListener("click", useDemo);
      document.getElementById("exportCsvBtn").addEventListener("click", exportFilteredCsv);
      document.getElementById("addInvestmentRowBtn").addEventListener("click", addInvestmentRow);
      document.getElementById("saveInvestmentsBtn").addEventListener("click", saveInvestments);
      ["summaryMonth", "dashboardMonth"].forEach(id => document.getElementById(id).addEventListener("change", syncMonthSelection));
      ["movementMonthFilter", "typeFilter", "conceptFilter", "searchFilter", "sortFilter"].forEach(id => {
        document.getElementById(id).addEventListener("input", renderMovements);
      });
    }

    function showView(id) {
      document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
      document.querySelectorAll("[data-view-button]").forEach(b => b.classList.toggle("active", b.dataset.viewButton === id));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function loadConfig() {
      try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem("moneyConfig") || "{}") }; }
      catch { return { ...DEFAULT_CONFIG }; }
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

    function useDemo() {
      state.config.readMode = "demo";
      localStorage.setItem("moneyConfig", JSON.stringify(state.config));
      hydrateConfigForm();
      refreshData();
    }

    function setDefaultDate() {
      document.getElementById("formDate").value = formatDate(new Date());
    }

    async function refreshData() {
      setStatus("loading", "Cargando datos", "Leyendo Control Finanzas...");
      try {
        if (state.config.readMode === "demo") {
          state.transactions = [...DEMO_TRANSACTIONS];
          state.investments = [...DEMO_INVESTMENTS];
          state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
          setNotice("Modo demo activo. Conecta Apps Script para usar tus datos reales.", "warn");
        } else if (state.config.readMode === "public-csv") {
          state.transactions = await fetchPublicCsvTransactions();
          state.investments = await fetchPublicCsvInvestments();
          state.categories = await fetchPublicCsvCategories();
          setNotice("Datos leidos desde CSV publico. Para escribir o modificar inversiones usa Apps Script.", "ok");
        } else {
          const payload = await fetchAppsScriptData();
          if (!payload.ok) throw new Error(payload.error || "Apps Script devolvio error");
          state.transactions = (payload.transactions || []).map(normalizeTransaction).filter(Boolean);
          state.investments = (payload.investments || []).map(normalizeInvestment).filter(Boolean);
          state.categories = normalizeCategories(payload.categories);
          setNotice("Datos sincronizados desde Google Sheets.", "ok");
        }
        syncOptions();
        renderAll();
        setStatus("ok", "Conectado", `${state.transactions.length} movimientos cargados`);
      } catch (error) {
        console.error(error);
        state.transactions = [...DEMO_TRANSACTIONS];
        state.investments = [...DEMO_INVESTMENTS];
        state.categories = { types: STATIC_TYPES, concepts: STATIC_CONCEPTS };
        syncOptions();
        renderAll();
        setStatus("bad", "Error de conexion", "Mostrando demo");
        setNotice(`No se pudo cargar la fuente configurada: ${error.message}.`, "warn");
      }
    }

    async function fetchAppsScriptData() {
      if (!state.config.scriptUrl) throw new Error("Falta la URL de Apps Script");
      const url = `${state.config.scriptUrl}?action=all&token=${encodeURIComponent(state.config.appToken)}&movementSheet=${encodeURIComponent(state.config.movementSheet)}&investmentSheet=${encodeURIComponent(state.config.investmentSheet)}&dataSheet=${encodeURIComponent(state.config.dataSheet)}`;
      return jsonp(url);
    }

    async function fetchPublicCsvTransactions() {
      if (!state.config.sheetId) throw new Error("Falta el ID de Google Sheet");
      const csv = await fetchCsv(state.config.sheetId, state.config.movementSheet);
      return parseCsv(csv).slice(1).map(row => normalizeTransaction({ fecha: row[0], tipo: row[4], concepto: row[5], descripcion: row[6], importe: row[7] })).filter(Boolean);
    }

    async function fetchPublicCsvInvestments() {
      if (!state.config.sheetId) return [];
      const csv = await fetchCsv(state.config.sheetId, state.config.investmentSheet);
      return parseCsv(csv).slice(1).map((row, i) => normalizeInvestment({ rowNumber: i + 2, data: row[0], nombre: row[1], tipo: row[2], cantidad: row[3], valor: row[4], total: row[5] })).filter(Boolean);
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
        script.onerror = () => { reject(new Error("No se pudo leer el Apps Script")); script.remove(); delete window[cb]; };
        script.src = `${url}${sep}callback=${cb}`;
        document.body.appendChild(script);
      });
    }

    function syncOptions() {
      const types = unique([...STATIC_TYPES, ...state.categories.types, ...state.transactions.map(t => t.tipo)]).map(prettyType);
      const concepts = unique([...STATIC_CONCEPTS, ...state.categories.concepts, ...state.transactions.map(t => t.concepto)]).map(prettyType);
      fillSelect("formType", types);
      fillSelect("formConcept", concepts);
      fillSelect("typeFilter", ["Todos", ...types]);
      fillSelect("conceptFilter", ["Todos", ...concepts]);
      const months = unique([currentMonthKey(), ...state.transactions.map(t => monthKey(t.date))]).sort().reverse();
      const previousSummaryMonth = document.getElementById("summaryMonth").value;
      const previousDashboardMonth = document.getElementById("dashboardMonth").value;
      fillSelect("summaryMonth", months);
      fillSelect("dashboardMonth", months);
      fillSelect("movementMonthFilter", ["Todos", ...months]);
      document.getElementById("summaryMonth").value = months.includes(previousSummaryMonth) ? previousSummaryMonth : currentMonthKey();
      document.getElementById("dashboardMonth").value = months.includes(previousDashboardMonth) ? previousDashboardMonth : document.getElementById("summaryMonth").value;
    }

    function fillSelect(id, values) {
      const el = document.getElementById(id);
      const current = el.value;
      el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
      if (values.includes(current)) el.value = current;
    }

    function syncMonthSelection(event) {
      document.getElementById("summaryMonth").value = event.target.value;
      document.getElementById("dashboardMonth").value = event.target.value;
      renderAll();
    }

    function renderAll() {
      renderSummary();
      renderMovements();
      renderInvestments();
    }

    function renderSummary() {
      const selectedMonth = document.getElementById("summaryMonth").value || currentMonthKey();
      const summary = calculateSummary(selectedMonth);
      document.getElementById("summarySubtitle").textContent = `Resumen de ${selectedMonth}`;
      document.getElementById("categorySubtitle").textContent = selectedMonth;
      document.getElementById("quickSummary").innerHTML = [
        summaryItem("Ingresos", money(summary.income), "positive"),
        summaryItem("Gastos", money(summary.expenses), "negative"),
        summaryItem("Inversion", money(summary.investedMonth), ""),
        summaryItem("Balance", money(summary.balance), summary.balance >= 0 ? "positive" : "negative")
      ].join("");
      document.getElementById("kpiGrid").innerHTML = [
        kpi("Ingresos mes", money(summary.income), "Ingreso + efectivo positivo", "good"),
        kpi("Gastos mes", money(summary.expenses), "Gasto + efectivo negativo", summary.expenses > summary.income ? "bad" : ""),
        kpi("Inversion mes", money(summary.investedMonth), "Aportaciones del mes", ""),
        kpi("Dinero total", money(summary.totalMoneyCurrent), `${pct(summary.savingsRate)} ahorro`, summary.balance >= 0 ? "good" : "bad")
      ].join("");
      document.getElementById("dialogKpis").innerHTML = document.getElementById("kpiGrid").innerHTML;
      renderSummaryTables(summary);
      renderMonthlyChart();
      renderCategoryCharts(selectedMonth);
      renderWealthChart();
      renderRecentTable();
      renderMonthFlowChart(summary);
    }

    function calculateSummary(month) {
      const [year, monthNum] = month.split("-").map(Number);
      const txMonth = state.transactions.filter(t => t.date.getFullYear() === year && t.date.getMonth() + 1 === monthNum);
      const untilToday = state.transactions.filter(t => t.date <= endOfToday());
      const income = sum(txMonth.filter(t => isIncome(t)).map(t => t.amount));
      const expenses = Math.abs(sum(txMonth.filter(t => isMonthlyExpense(t)).map(t => t.amount)));
      const investedMonth = Math.abs(sum(txMonth.filter(t => isInvestment(t)).map(t => t.amount)));
      const balance = income - expenses - investedMonth;
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
      const totalMoneyBook = bank + investedTotal;
      const totalMoneyCurrent = bank + valueTotal;
      return {
        month, income, expenses, investedMonth, balance, bank,
        investedByType, valueByType, investedTotal, valueTotal,
        totalMoneyBook, totalMoneyCurrent,
        profitLoss: valueTotal - investedTotal,
        profitLossPct: investedTotal ? (valueTotal - investedTotal) / investedTotal : 0,
        savingsRate: income ? balance / income : 0
      };
    }

    function renderSummaryTables(summary) {
      const rows = [
        ["Ingresos mes", money(summary.income), "", "", "", ""],
        ["Gastos mes", money(summary.expenses), "", "", "", ""],
        ["Inversion mes", money(summary.investedMonth), "", "", "", ""],
        ["Balance mes", money(summary.balance), "", "", "", ""],
        ["Banco", money(summary.bank), "", "", "", ""],
        ["Inversion Bolsa", money(summary.investedByType.Bolsa), pctOf(summary.investedByType.Bolsa, summary.investedTotal), money(summary.valueByType.Bolsa), pctGain(summary.valueByType.Bolsa, summary.investedByType.Bolsa), money(summary.valueByType.Bolsa - summary.investedByType.Bolsa)],
        ["Inversion Fondos", money(summary.investedByType.Fondos), pctOf(summary.investedByType.Fondos, summary.investedTotal), money(summary.valueByType.Fondos), pctGain(summary.valueByType.Fondos, summary.investedByType.Fondos), money(summary.valueByType.Fondos - summary.investedByType.Fondos)],
        ["Inversion Cartera", money(summary.investedByType.Cartera), pctOf(summary.investedByType.Cartera, summary.investedTotal), money(summary.valueByType.Cartera), pctGain(summary.valueByType.Cartera, summary.investedByType.Cartera), money(summary.valueByType.Cartera - summary.investedByType.Cartera)],
        ["Inversion total", money(summary.investedTotal), pctOf(summary.investedTotal, summary.totalMoneyBook), money(summary.valueTotal), pct(summary.profitLossPct), money(summary.profitLoss)],
        ["Dinero total", money(summary.totalMoneyBook), "", money(summary.totalMoneyCurrent), "", money(summary.totalMoneyCurrent - summary.totalMoneyBook)]
      ];
      const headers = ["Resumen", "Dinero", "% total", "Dinero actual", "% ganancias", "Ganancias"];
      renderTable("summaryTable", headers, rows);
      renderTable("dialogSummaryTable", headers, rows);
    }

    function renderMonthlyChart() {
      const grouped = groupMonthly(state.transactions);
      const labels = Object.keys(grouped).sort().slice(-18);
      upsertChart("monthlyChart", "bar", {
        labels,
        datasets: [
          { label: "Ingresos", data: labels.map(m => grouped[m].income), backgroundColor: "#15803d" },
          { label: "Gastos", data: labels.map(m => grouped[m].expenses), backgroundColor: "#c2410c" },
          { label: "Inversion", data: labels.map(m => grouped[m].investment), backgroundColor: "#2563eb" },
          { label: "Balance", data: labels.map(m => grouped[m].balance), type: "line", borderColor: "#111827", backgroundColor: "#111827", tension: .25 }
        ]
      }, moneyAxisOptions());
    }

    function renderCategoryCharts(month) {
      const tx = state.transactions.filter(t => monthKey(t.date) === month && isMonthlyExpense(t));
      const entries = Object.entries(groupBySum(tx, t => t.concepto, t => Math.abs(t.amount))).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const data = { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: COLORS, borderWidth: 2, borderColor: "#fff" }] };
      const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "62%" };
      upsertChart("categoryChart", "doughnut", data, options);
      upsertChart("quickCategoryChart", "doughnut", data, options);
    }

    function renderMonthFlowChart(summary) {
      upsertChart("monthFlowChart", "bar", {
        labels: ["Ingresos", "Gastos", "Inversion", "Balance"],
        datasets: [{ label: summary.month, data: [summary.income, summary.expenses, summary.investedMonth, summary.balance], backgroundColor: ["#15803d", "#c2410c", "#2563eb", summary.balance >= 0 ? "#0f766e" : "#b45309"] }]
      }, moneyAxisOptions(false));
    }

    function renderWealthChart() {
      const points = computeWealth();
      upsertChart("wealthChart", "line", {
        labels: points.map(p => p.month),
        datasets: [{ label: "Banco estimado", data: points.map(p => p.bank), borderColor: "#0f766e", backgroundColor: "rgba(15,118,110,.12)", fill: true, tension: .25 }]
      }, moneyAxisOptions());
    }

    function renderRecentTable() {
      const rows = [...state.transactions].sort((a, b) => b.date - a.date).slice(0, 10);
      renderTable("recentTable", ["Fecha", "Tipo", "Concepto", "Descripcion", "Importe"], rows.map(transactionRow));
    }

    function renderMovements() {
      const month = document.getElementById("movementMonthFilter").value;
      const type = document.getElementById("typeFilter").value;
      const concept = document.getElementById("conceptFilter").value;
      const query = document.getElementById("searchFilter").value.trim().toLowerCase();
      const sort = document.getElementById("sortFilter").value;
      let rows = [...state.transactions];
      if (month && month !== "Todos") rows = rows.filter(t => monthKey(t.date) === month);
      if (type && type !== "Todos") rows = rows.filter(t => t.tipo === type);
      if (concept && concept !== "Todos") rows = rows.filter(t => t.concepto === concept);
      if (query) rows = rows.filter(t => `${t.tipo} ${t.concepto} ${t.descripcion}`.toLowerCase().includes(query));
      rows.sort((a, b) => sort === "date-asc" ? a.date - b.date : sort === "amount-desc" ? b.amount - a.amount : sort === "amount-asc" ? a.amount - b.amount : b.date - a.date);
      state.filtered = rows;
      renderTable("movementTable", ["Fecha", "Tipo", "Concepto", "Descripcion", "Importe"], rows.map(transactionRow));
    }

    function renderInvestments() {
      const total = sum(state.investments.map(i => i.total));
      const byType = groupBySum(state.investments, i => i.tipo || "Sin tipo", i => i.total);
      const summary = calculateSummary(document.getElementById("summaryMonth").value || currentMonthKey());
      document.getElementById("investmentKpis").innerHTML = [
        kpi("Valor actual", money(total), `${state.investments.length} posiciones`, "good"),
        kpi("Invertido", money(summary.investedTotal), "Segun Control Finanzas", ""),
        kpi("P/L", money(summary.profitLoss), pct(summary.profitLossPct), summary.profitLoss >= 0 ? "good" : "bad")
      ].join("");
      const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
      upsertChart("investmentChart", "doughnut", { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: COLORS, borderWidth: 2, borderColor: "#fff" }] }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "62%" });
      renderTable("investmentCheckTable", ["Tipo", "Invertido", "Valor actual", "Ganancia", "%"], INVESTMENT_TYPES.map(type => {
        const invested = summary.investedByType[type] || 0;
        const value = summary.valueByType[type] || 0;
        return [type, money(invested), money(value), amountCell(value - invested), pctGain(value, invested)];
      }));
      renderInvestmentEditTable();
    }

    function renderInvestmentEditTable() {
      const headers = ["DATA", "Nombre", "Tipo", "Cantidad", "Valor", "Total"];
      const body = state.investments.map((i, idx) => `<tr data-investment-index="${idx}">
        <td><input data-field="data" value="${escapeAttr(i.data)}"></td>
        <td><input data-field="nombre" value="${escapeAttr(i.nombre)}"></td>
        <td><input data-field="tipo" value="${escapeAttr(i.tipo)}"></td>
        <td><input data-field="cantidad" type="number" step="0.0001" value="${safeNumber(i.cantidad)}"></td>
        <td><input data-field="valor" type="number" step="0.0001" value="${safeNumber(i.valor)}"></td>
        <td><input data-field="total" type="number" step="0.01" value="${safeNumber(i.total)}"></td>
      </tr>`).join("");
      document.getElementById("investmentEditTable").innerHTML = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td class="empty" colspan="6">Sin posiciones.</td></tr>`}</tbody>`;
    }

    function addInvestmentRow() {
      state.investments.push({ rowNumber: null, data: "", nombre: "", tipo: "Cartera", cantidad: 0, valor: 0, total: 0 });
      renderInvestmentEditTable();
    }

    async function saveInvestments() {
      readInvestmentEditor();
      if (!state.config.scriptUrl || state.config.readMode !== "apps-script") {
        setNotice("Para modificar inversiones en Google Sheets necesitas modo Apps Script. Los cambios quedan solo en esta sesion.", "warn");
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
        setNotice("Cambios de inversiones enviados a Google Sheets.", "ok");
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
        appendLocal(movement);
        setNotice("Movimiento anadido solo a esta sesion. Configura Apps Script para escribir en Google Sheets.", "warn");
        event.target.reset();
        setDefaultDate();
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
        appendLocal(movement);
        setNotice("Movimiento enviado a Google Sheets.", "ok");
        event.target.reset();
        setDefaultDate();
      } catch (error) {
        appendLocal(movement);
        setNotice(`No se pudo confirmar el envio: ${error.message}. Se anadio localmente.`, "warn");
      } finally {
        btn.disabled = false;
      }
    }

    function addLocalMovement() {
      appendLocal(movementFromForm());
      document.getElementById("movementForm").reset();
      setDefaultDate();
      setNotice("Movimiento anadido solo a esta sesion.", "warn");
    }

    function movementFromForm() {
      const type = prettyType(document.getElementById("formType").value);
      const raw = Math.abs(Number(document.getElementById("formAmount").value || 0));
      return normalizeTransaction({
        fecha: document.getElementById("formDate").value,
        tipo: type,
        concepto: prettyType(document.getElementById("formConcept").value),
        descripcion: document.getElementById("formDescription").value.trim(),
        importe: type === "Ingreso" ? raw : -raw
      });
    }

    function appendLocal(movement) {
      state.transactions.push(movement);
      syncOptions();
      renderAll();
    }

    function exportFilteredCsv() {
      const rows = [["FECHA", "TIPO", "CONCEPTO", "DESCRIPCION", "IMPORTE"], ...state.filtered.map(t => [formatDate(t.date), t.tipo, t.concepto, t.descripcion, t.amount])];
      const csv = rows.map(r => r.map(csvCell).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "control_finanzas_filtrado.csv";
      a.click();
      URL.revokeObjectURL(url);
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

    function groupMonthly(transactions) {
      const grouped = {};
      transactions.forEach(t => {
        const key = monthKey(t.date);
        grouped[key] ||= { income: 0, expenses: 0, investment: 0, balance: 0 };
        if (isIncome(t)) grouped[key].income += t.amount;
        else if (isInvestment(t)) grouped[key].investment += Math.abs(t.amount);
        else if (isMonthlyExpense(t)) grouped[key].expenses += Math.abs(t.amount);
        grouped[key].balance = grouped[key].income - grouped[key].expenses - grouped[key].investment;
      });
      return grouped;
    }

    function computeWealth() {
      const grouped = groupMonthly(state.transactions);
      let bank = Number(state.config.initialCash || 0);
      return Object.keys(grouped).sort().map(month => {
        bank += grouped[month].income - grouped[month].expenses - grouped[month].investment;
        return { month, bank };
      });
    }

    function isIncome(t) { return normalizeType(t.tipo) === "ingreso" || (normalizeType(t.tipo) === "efectivo" && t.amount > 0); }
    function isInvestment(t) { return normalizeType(t.tipo) === "inversion"; }
    function isMonthlyExpense(t) { return (normalizeType(t.tipo) === "gasto") || (normalizeType(t.tipo) === "efectivo" && t.amount < 0); }
    function normalizeType(value) { return removeAccents(String(value || "")).toLowerCase().trim(); }
    function prettyType(value) {
      const n = normalizeType(value);
      const map = { inversion: "Inversion", descripcion: "Descripcion" };
      return map[n] || String(value || "").trim();
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

    function renderTable(id, headers, rows) {
      const table = document.getElementById(id);
      if (!rows.length) {
        table.innerHTML = `<tbody><tr><td class="empty" colspan="${headers.length}">Sin datos para mostrar.</td></tr></tbody>`;
        return;
      }
      table.innerHTML = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
    }

    function transactionRow(t) { return [formatDate(t.date), tag(t.tipo), escapeHtml(t.concepto), escapeHtml(t.descripcion), amountCell(t.amount)]; }
    function upsertChart(canvasId, type, data, options) {
      if (state.charts[canvasId]) state.charts[canvasId].destroy();
      state.charts[canvasId] = new Chart(document.getElementById(canvasId), { type, data, options });
    }
    function moneyAxisOptions(legend = true) { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: legend } }, scales: { y: { ticks: { callback: v => money(v, 0) } } } }; }
    function quickSummaryHtml(summary) { return ""; }
    function summaryItem(title, value, tone) { return `<div class="summary-item"><span>${escapeHtml(title)}</span><strong class="${tone || ""}">${escapeHtml(value)}</strong></div>`; }
    function kpi(title, value, detail, tone) { return `<article class="panel kpi ${tone || ""}"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail || "")}</small></article>`; }
    function tag(value) { return `<span class="tag">${escapeHtml(value || "Sin tipo")}</span>`; }
    function amountCell(value) { return `<span class="amount ${value >= 0 ? "positive" : "negative"}">${money(value)}</span>`; }
    function pctOf(value, total) { return total ? pct(value / total) : "0,0 %"; }
    function pctGain(value, invested) { return invested ? pct((value - invested) / invested) : "0,0 %"; }
    function sum(values) { return values.reduce((a, b) => a + (Number(b) || 0), 0); }
    function unique(values) { return [...new Set(values.filter(v => v !== undefined && v !== null && String(v).trim() !== ""))]; }
    function groupBySum(items, keyFn, valueFn) { return items.reduce((acc, item) => { const key = keyFn(item) || "Otros"; acc[key] = (acc[key] || 0) + (Number(valueFn(item)) || 0); return acc; }, {}); }
    function currentMonthKey() { return monthKey(new Date()); }
    function monthKey(date) { return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : ""; }
    function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }
    function formatDate(date) { return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""; }
    function money(value, decimals = 2) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value) || 0); }
    function pct(value) { return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 }).format(Number(value) || 0); }
    function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
    function safeNumber(value) { return Number.isFinite(value) ? value : 0; }
    function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
    function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
    function removeAccents(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
    function setStatus(kind, text, detail) {
      document.getElementById("statusDot").className = `dot ${kind === "ok" ? "ok" : kind === "bad" ? "bad" : ""}`;
      document.getElementById("statusText").textContent = text;
      document.getElementById("statusDetail").textContent = detail;
    }
    function setNotice(message, type) {
      const el = document.getElementById("sourceNotice");
      el.textContent = message;
      el.className = `notice ${type === "ok" ? "ok" : type === "warn" ? "warn" : ""}`;
    }

