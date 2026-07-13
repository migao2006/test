const endpoints = {
  twseOpenPrice: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  twseInstitutional: "https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999",
  tpexPrice: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
  tpexValuation: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis",
  tpexInstitutional: "https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading",
  tpexMargin: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance",
  twseRevenue: "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
  tpexRevenue: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O",
};

const rocDate = (value) => {
  const raw = String(value || "").replaceAll("-", "").replaceAll("/", "");
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{7}$/.test(raw)) return `${Number(raw.slice(0, 3)) + 1911}-${raw.slice(3, 5)}-${raw.slice(5, 7)}`;
  return "";
};

async function get(name, url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "TaiwanStockSmartPicker-Audit/15.4" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const results = Object.fromEntries(
  await Promise.all(Object.entries(endpoints).map(async ([name, url]) => [name, await get(name, url)])),
);
const arrays = Object.fromEntries(
  Object.entries(results).map(([name, payload]) => [name, Array.isArray(payload) ? payload : payload.data || []]),
);

const twseInstitutionalDate = rocDate(results.twseInstitutional.date);
const tpexPriceDate = rocDate(arrays.tpexPrice[0]?.Date);
const latestTradeDate = [twseInstitutionalDate, tpexPriceDate].filter(Boolean).sort().at(-1);
const target = latestTradeDate.replaceAll("-", "");
const [twsePrice, twseValuation] = await Promise.all([
  get("twsePrice", `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${target}&type=ALLBUT0999&response=json`),
  get("twseValuation", `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${target}&selectType=ALL&response=json`),
]);

const twsePriceTable = twsePrice.tables?.find((table) => String(table.title || "").includes("每日收盤行情"));
const report = [
  { source: "TWSE 上市行情（指定日）", date: rocDate(twsePrice.date), rows: twsePriceTable?.data?.length || 0 },
  { source: "TWSE 上市估值（指定日）", date: rocDate(twseValuation.date), rows: twseValuation.data?.length || 0 },
  { source: "TWSE 三大法人", date: twseInstitutionalDate, rows: results.twseInstitutional.data?.length || 0 },
  { source: "TWSE OpenAPI 行情備援", date: rocDate(arrays.twseOpenPrice[0]?.Date), rows: arrays.twseOpenPrice.length },
  { source: "TPEx 上櫃行情", date: tpexPriceDate, rows: arrays.tpexPrice.length },
  { source: "TPEx 上櫃估值", date: rocDate(arrays.tpexValuation[0]?.Date), rows: arrays.tpexValuation.length },
  { source: "TPEx 三大法人", date: rocDate(arrays.tpexInstitutional[0]?.Date), rows: arrays.tpexInstitutional.length },
  { source: "TPEx 融資融券", date: rocDate(arrays.tpexMargin[0]?.Date), rows: arrays.tpexMargin.length },
  { source: "TWSE 月營收", date: rocDate(arrays.twseRevenue[0]?.出表日期), period: arrays.twseRevenue[0]?.資料年月, rows: arrays.twseRevenue.length },
  { source: "TPEx 月營收", date: rocDate(arrays.tpexRevenue[0]?.出表日期), period: arrays.tpexRevenue[0]?.資料年月, rows: arrays.tpexRevenue.length },
];

const requiredTpexInstitutional = [
  "Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference",
  "SecuritiesInvestmentTrustCompanies-Difference",
  "Dealers-Difference",
  "TotalDifference",
];
for (const field of requiredTpexInstitutional) {
  if (!(field in (arrays.tpexInstitutional[0] || {}))) throw new Error(`TPEx 法人欄位已變更：缺少 ${field}`);
}
if (!("營業收入-當月營收" in (arrays.twseRevenue[0] || {}))) {
  throw new Error("TWSE 月營收欄位已變更：缺少 營業收入-當月營收");
}
if (!twsePriceTable?.data?.length) throw new Error("TWSE 指定交易日行情無資料");

console.table(report);
console.log(`官方資料稽核完成；最新交易日 ${latestTradeDate}`);
