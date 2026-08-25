// Resumen de variación de inversión (el que se manda por Telegram).
//
// Había dos implementaciones que discrepaban: la de modo "real" leía la hoja por su
// cuenta y descartaba las posiciones sin VALOR ANTERIOR, y la de modo "estimado" les
// daba variación 0. Como "real" es el modo por defecto, una posición recién añadida
// desaparecía del aviso sin que nada lo dijera.
import test from "node:test";
import assert from "node:assert/strict";
import { loadAppsScript } from "./load-apps-script.mjs";

const INVESTMENT_SHEET = "Inversiones";
const TOTALS_SHEET = "Inversión Totales";
const INVESTMENT_HEADERS = ["DATA", "NOMBRE", "SHORT NAME", "TIPO", "CANTIDAD", "VALOR", "VALOR TOTAL", "VALOR ANTERIOR", "DIVISA"];

function setup(gs, filas) {
  gs.__spreadsheet.addSheet(INVESTMENT_SHEET, [INVESTMENT_HEADERS, ...filas]);
  gs.__spreadsheet.addSheet(TOTALS_SHEET, [gs.investmentTotalsHeaders_(), ["Bolsa", 0, 0, 0, 0, 0, 0, 0, 1]]);
}

// Se copia con spread: los arrays nacen dentro del vm y su prototipo no es el de este
// realm, así que deepEqual estricto los rechazaría aunque el contenido coincida.
const nombresDe = (resumen, tipo) => [...resumen[tipo].positions].map(p => p.name);

test("una posición sin VALOR ANTERIOR sigue apareciendo, con variación 0", () => {
  const gs = loadAppsScript();
  setup(gs, [
    ["IWDA", "ETF World", "IWDA", "Bolsa", 10, 100, 1000, 90, "EUR"],
    // Recién añadida: todavía no tiene cierre anterior.
    ["VWCE", "ETF All World", "VWCE", "Bolsa", 5, 200, 1000, "", "EUR"]
  ]);

  const resumen = gs.buildInvestmentVariationSummary_(INVESTMENT_SHEET);

  assert.deepEqual(nombresDe(resumen, "Bolsa").sort(), ["IWDA", "VWCE"],
    "la posición sin cierre anterior no se cae del resumen");
  const nueva = resumen.Bolsa.positions.find(p => p.name === "VWCE");
  assert.equal(nueva.variation, 0, "sin cierre anterior, variación 0 en vez de descartarla");
  assert.equal(nueva.current, 1000);
});

test("los dos modos dan el mismo resumen para la misma cartera", () => {
  const gs = loadAppsScript();
  const filas = [
    ["IWDA", "ETF World", "IWDA", "Bolsa", 10, 100, 1000, 90, "EUR"],
    ["VWCE", "ETF All World", "VWCE", "Bolsa", 5, 200, 1000, "", "EUR"]
  ];
  setup(gs, filas);

  const real = gs.buildInvestmentVariationSummary_(INVESTMENT_SHEET);
  const inversiones = gs.readInvestments_(INVESTMENT_SHEET);
  const categorias = gs.readInvestmentCategoriesForTotals_(TOTALS_SHEET, INVESTMENT_SHEET, inversiones);
  const estimado = gs.buildInvestmentVariationSummaryFromInvestments_(inversiones, categorias);

  assert.deepEqual(nombresDe(real, "Bolsa"), nombresDe(estimado, "Bolsa"));
  assert.deepEqual(nombresDe(real, "all"), nombresDe(estimado, "all"));
  assert.equal(real.all.total, estimado.all.total);
  assert.equal(real.all.variation, estimado.all.variation);
});

test("la variación se calcula sobre el cierre anterior cuando existe", () => {
  const gs = loadAppsScript();
  setup(gs, [["IWDA", "ETF World", "IWDA", "Bolsa", 10, 100, 1000, 90, "EUR"]]);

  const resumen = gs.buildInvestmentVariationSummary_(INVESTMENT_SHEET);
  const posicion = resumen.Bolsa.positions[0];

  assert.equal(posicion.current, 1000);
  assert.equal(posicion.previous, 900, "10 participaciones x 90 de cierre anterior");
  assert.equal(posicion.variation, 100);
});

test("las cabeceras inglesas recuperan SHARES desde VALUE y PRICE si Sheets entrega cero", () => {
  const gs = loadAppsScript();
  const headers = ["CURRENCY", "TICKER", "NAME", "SHORT NAME", "TYPE", "SHARES", "PRICE", "VALUE", "LAST PRICE", "VARIATION"];
  gs.__spreadsheet.addSheet(INVESTMENT_SHEET, [
    headers,
    ["EUR", "VWCE", "ETF All World", "VWCE", "Bolsa", 0, 200, 1000, 190, 0.05]
  ]);

  const [position] = gs.readInvestments_(INVESTMENT_SHEET);

  assert.equal(position.cantidad, 5);
  assert.equal(position.total, 1000);
});


// El resumen "Invertido" del mensaje general: el coste solo existe agregado por
// categoria en la hoja de totales, asi que sin COST no hay linea que mostrar.
test("la linea Invertido compara el valor actual con el coste", () => {
  const gs = loadAppsScript();

  assert.equal(
    gs.formatInvestedLine_(800, 900),
    "Invertido: 800,00\u20AC | +12,50% | +100,00");
  assert.equal(
    gs.formatInvestedLine_(800, 720),
    "Invertido: 800,00\u20AC | -10,00% | -80,00");
});

test("sin coste registrado no se emite linea Invertido", () => {
  const gs = loadAppsScript();

  assert.equal(gs.formatInvestedLine_(0, 900), null, "un +0,00% sobre coste 0 seria enganoso");
  assert.equal(gs.formatInvestedLine_("", 900), null);
});

test("el mensaje general intercala el resumen Invertido bajo el Total y cada categoria", () => {
  const gs = loadAppsScript();
  setup(gs, [["IWDA", "ETF World", "IWDA", "Bolsa", 10, 100, 1000, 90, "EUR"]]);
  const resumen = gs.buildInvestmentVariationSummary_(INVESTMENT_SHEET);
  resumen.costs = { __all: 800, [gs.normalizeType_("Bolsa")]: 800 };

  const lineas = gs.formatGeneralInvestmentMessage_(resumen).split("\n");

  assert.match(lineas[1], /^<b>Total:<\/b>/);
  assert.equal(lineas[2], "Invertido: 800,00\u20AC | +25,00% | +200,00");
  assert.equal(lineas[3], "");
  assert.match(lineas[4], /^\u{1F4B0} Bolsa: /u);
  assert.equal(lineas[5], "Invertido: 800,00\u20AC | +25,00% | +200,00");
});

test("una categoria sin coste no rompe el resto del mensaje general", () => {
  const gs = loadAppsScript();
  setup(gs, [["IWDA", "ETF World", "IWDA", "Bolsa", 10, 100, 1000, 90, "EUR"]]);
  const resumen = gs.buildInvestmentVariationSummary_(INVESTMENT_SHEET);
  resumen.costs = { __all: 0 };

  const lineas = gs.formatGeneralInvestmentMessage_(resumen).split("\n");

  assert.ok(lineas.every(linea => !linea.includes("Invertido")));
  assert.equal(lineas[2], "", "la linea en blanco de separacion se mantiene");
  assert.match(lineas[3], /^\u{1F4B0} Bolsa: /u);
});
