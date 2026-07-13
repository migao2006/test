import assert from "node:assert/strict";
import worker from "../worker/index.js";

const listedSymbols = Array.from({ length: 25 }, (_, index) => String(1101 + index));
const otcSymbols = Array.from({ length: 25 }, (_, index) => String(4101 + index));

const listedOpenApi = listedSymbols.map((Code, index) => ({
  Date: "1150709",
  Code,
  Name: `上市測試${index + 1}`,
  ClosingPrice: "99",
  Change: "0",
  OpeningPrice: "99",
  HighestPrice: "100",
  LowestPrice: "98",
  TradeVolume: "900000",
  TradeValue: "90000000",
  Transaction: "4500",
}));

const listedWebRows = listedSymbols.map((symbol, index) => [
  symbol,
  `上市測試${index + 1}`,
  "1,000,000",
  "5,000",
  "100,000,000",
  "100",
  "102",
  "98",
  "100",
  index === 0 ? "<p style= color:green>-</p>" : "<p style= color:red>+</p>",
  "1",
  "99",
  "10",
  "100",
  "20",
  "15",
]);

const otc = otcSymbols.map((SecuritiesCompanyCode, index) => ({
  Date: "1150713",
  SecuritiesCompanyCode,
  CompanyName: `上櫃測試${index + 1}`,
  Close: "50",
  Change: "0.5",
  Open: "49.5",
  High: "51",
  Low: "49",
  TradingShares: "600000",
  TransactionAmount: "30000000",
  TransactionNumber: "2000",
}));

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const fullFetch = async (input) => {
  const url = String(input);
  if (url.includes("afterTrading/MI_INDEX")) {
    return json({
      stat: "OK",
      date: "20260713",
      tables: [
        {
          title: "115年07月13日 每日收盤行情(全部)",
          fields: [
            "證券代號",
            "證券名稱",
            "成交股數",
            "成交筆數",
            "成交金額",
            "開盤價",
            "最高價",
            "最低價",
            "收盤價",
            "漲跌(+/-)",
            "漲跌價差",
            "最後揭示買價",
            "最後揭示買量",
            "最後揭示賣價",
            "最後揭示賣量",
            "本益比",
          ],
          data: listedWebRows,
        },
      ],
    });
  }
  if (url.includes("afterTrading/BWIBBU_d")) {
    return json({
      stat: "OK",
      date: "20260713",
      fields: ["證券代號", "證券名稱", "收盤價", "殖利率(%)", "股利年度", "本益比", "股價淨值比", "財報年/季"],
      data: listedSymbols.map((symbol) => [symbol, "測試", "100", "4", "114", "15", "2", "115/1"]),
    });
  }
  if (url.includes("marginTrading/MI_MARGN")) {
    return json({
      stat: "OK",
      date: "20260709",
      tables: [
        {},
        {
          title: "115年07月09日 融資融券彙總 (股票)",
          fields: ["代號", "名稱", "買進", "賣出", "現金償還", "前日餘額", "今日餘額", "次一營業日限額", "買進", "賣出", "現券償還", "前日餘額", "今日餘額", "次一營業日限額", "資券互抵", "註記"],
          data: listedSymbols.map((symbol) => [symbol, "測試", "30", "5", "3", "100", "122", "999", "1", "2", "1", "18", "18", "999", "0", ""]),
        },
      ],
    });
  }
  if (url.includes("STOCK_DAY_ALL")) return json(listedOpenApi);
  if (url.includes("BWIBBU_ALL")) {
    return json(listedSymbols.map((Code) => ({ Date: "1150709", Code, PEratio: "14", PBratio: "1.8", DividendYield: "3.5" })));
  }
  if (url.includes("t187ap03_L")) {
    return json(listedSymbols.map((公司代號) => ({ 出表日期: "1150713", 公司代號, 產業別: "24" })));
  }
  if (url.includes("exchangeReport/MI_MARGN")) {
    return json(listedSymbols.map((股票代號) => ({ 股票代號, 融資今日餘額: "120", 融資買進: "30", 融資賣出: "5", 融資現金償還: "3", 融券今日餘額: "18", 融券賣出: "2", 融券買進: "1", 融券現券償還: "1" })));
  }
  if (url.includes("fund/T86")) {
    return json({
      stat: "OK",
      date: "20260713",
      title: "115年07月13日 三大法人買賣超日報",
      fields: ["證券代號", "外陸資買賣超股數(不含外資自營商)", "投信買賣超股數", "自營商買賣超股數", "三大法人買賣超股數"],
      data: listedSymbols.map((symbol) => [symbol, "200000", "50000", "-10000", "240000"]),
    });
  }
  if (url.includes("tpex_mainboard_daily_close_quotes")) return json(otc);
  if (url.includes("tpex_mainboard_peratio_analysis")) {
    return json(otcSymbols.map((SecuritiesCompanyCode) => ({ Date: "1150713", SecuritiesCompanyCode, PriceEarningRatio: "12", PriceBookRatio: "1.5", YieldRatio: "5" })));
  }
  if (url.includes("mopsfin_t187ap03_O")) {
    return json(otcSymbols.map((SecuritiesCompanyCode) => ({ Date: "1150713", SecuritiesCompanyCode, SecuritiesIndustryCode: "25" })));
  }
  if (url.includes("tpex_mainboard_margin_balance")) {
    return json(otcSymbols.map((SecuritiesCompanyCode) => ({ Date: "1150709", SecuritiesCompanyCode, MarginPurchaseBalancePreviousDay: "200", MarginPurchase: "40", MarginSales: "8", CashRedemption: "2", MarginPurchaseBalance: "230", ShortSaleBalancePreviousDay: "40", ShortSale: "8", ShortConvering: "2", StockRedemption: "1", ShortSaleBalance: "45" })));
  }
  if (url.includes("tpex_3insti_daily_trading")) {
    return json(otcSymbols.map((SecuritiesCompanyCode) => ({
      Date: "1150713",
      SecuritiesCompanyCode,
      "Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference": "300000",
      "SecuritiesInvestmentTrustCompanies-Difference": "100000",
      "Dealers-Difference": "-50000",
      TotalDifference: "350000",
    })));
  }
  if (url.includes("t187ap05_L")) {
    return json(listedSymbols.map((公司代號) => ({ 出表日期: "1150712", 資料年月: "11506", 公司代號, "營業收入-當月營收": "1000000", "營業收入-上月比較增減(%)": "2", "營業收入-去年同月增減(%)": "15", "累計營業收入-前期比較增減(%)": "10" })));
  }
  if (url.includes("mopsfin_t187ap05_O")) {
    return json(otcSymbols.map((公司代號) => ({ 出表日期: "1150713", 資料年月: "11506", 公司代號, "營業收入-當月營收": "500000", "營業收入-上月比較增減(%)": "3", "營業收入-去年同月增減(%)": "20", "累計營業收入-前期比較增減(%)": "12" })));
  }
  if (url.includes("t187ap06_L_ci")) {
    return json(listedSymbols.map((公司代號) => ({ 出表日期: "1150713", 年度: "115", 季別: "1", 公司代號, 營業收入: "1000", "營業毛利（毛損）": "400", "營業利益（損失）": "200", "本期淨利（淨損）": "150", "基本每股盈餘（元）": "2.5" })));
  }
  if (url.includes("t187ap07_L_ci")) {
    return json(listedSymbols.map((公司代號) => ({ 出表日期: "1150713", 年度: "115", 季別: "1", 公司代號, 資產總額: "1000", 負債總額: "400", 權益總額: "600" })));
  }
  if (url.includes("mopsfin_t187ap06_O_ci")) {
    return json(otcSymbols.map((SecuritiesCompanyCode) => ({ Date: "1150713", Year: "115", Season: "1", SecuritiesCompanyCode, 營業收入: "1000", "營業毛利（毛損）": "300", "營業利益（損失）": "100", "本期淨利（淨損）": "80", "基本每股盈餘（元）": "1.5" })));
  }
  if (url.includes("mopsfin_t187ap07_O_ci")) {
    return json(otcSymbols.map((SecuritiesCompanyCode) => ({ Date: "1150713", 年度: "115", 季別: "1", SecuritiesCompanyCode, 資產總計: "1000", 負債總計: "300", 權益總計: "700" })));
  }
  if (/t187ap0[67]_[LO]_|mopsfin_t187ap0[67]_O_/.test(url)) return json([]);
  if (url.includes("supabase.co/functions/v1/twss-market-data")) {
    if (url.includes("type=stocks")) return json({ stocks: [], date: "2026-07-09" });
    return json({ fundamentals: [] });
  }
  return json({ error: "unmocked URL", url }, 404);
};

globalThis.fetch = fullFetch;

async function payload(path) {
  const response = await worker.fetch(new Request(`https://example.test${path}`), {}, {});
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

const health = await payload("/api/health");
assert.equal(health.version, "15.4");
assert.deepEqual(health.markets, ["上市", "上櫃"]);

const stocks = await payload("/api/market-data?type=stocks&refresh=1");
assert.equal(stocks.stocks.length, 50);
assert.deepEqual(stocks.markets, { listed: 25, otc: 25, fallback: 0 });
assert.equal(stocks.mode, "live");
assert.equal(stocks.date, "2026-07-13");
assert.equal(stocks.dates.price.twse, "2026-07-13");
assert.equal(stocks.dates.price.tpex, "2026-07-13");
assert.equal(stocks.dates.margin.latest, "2026-07-09");

const listedStock = stocks.stocks.find((stock) => stock.symbol === "1101");
assert.equal(listedStock.close, 100);
assert.ok(listedStock.change < 0, "TWSE sign field should make the change negative");
assert.equal(listedStock.foreign, 200);
assert.equal(listedStock.trust, 50);
assert.equal(listedStock.dealer, -10);
assert.equal(listedStock.inst, 240);
assert.equal(listedStock.marginChange, 22);
assert.equal(listedStock.shortChange, 0);

const otcStock = stocks.stocks.find((stock) => stock.symbol === "4101");
assert.equal(otcStock.market, "上櫃");
assert.equal(otcStock.industry, "電腦及週邊設備業");
assert.equal(otcStock.pe, 12);
assert.equal(otcStock.foreign, 300);
assert.equal(otcStock.trust, 100);
assert.equal(otcStock.dealer, -50);
assert.equal(otcStock.inst, 350);
assert.equal(otcStock.marginChange, 30);
assert.equal(otcStock.shortChange, 5);

const revenue = await payload("/api/market-data?type=revenue&refresh=1");
assert.equal(revenue.fundamentals.length, 50);
assert.equal(revenue.period, "2026-06");
assert.equal(revenue.publishedAt, "2026-07-13");
assert.equal(revenue.fundamentals.find((row) => row.symbol === "4101").rev, 20);

const financials = await payload("/api/market-data?type=financials&refresh=1");
assert.equal(financials.fundamentals.length, 50);
assert.equal(financials.period, "2026 Q1");
const listedFinancial = financials.fundamentals.find((row) => row.symbol === "1101");
assert.equal(listedFinancial.eps, 2.5);
assert.equal(listedFinancial.grossMargin, 40);
assert.equal(listedFinancial.operatingMargin, 20);
assert.equal(listedFinancial.netMargin, 15);
assert.equal(listedFinancial.debt, 40);
assert.equal(listedFinancial.equityRatio, 60);
assert.equal(listedFinancial.roe, 100);
assert.equal(listedFinancial.roeEstimated, true);

const sources = await payload("/api/market-data?type=sources");
assert.equal(sources.sources.length, 4);
assert.equal(sources.auditedAt, "2026-07-13");

const appResponse = await worker.fetch(new Request("https://example.test/app.js?v=15.4"), {}, {});
const appSource = await appResponse.text();
assert.match(appSource, /官方日期已核對/);
assert.match(appSource, /各資料來源日期/);
assert.match(appSource, /_\=\$\{Date\.now\(\)\}/);

const smartResponse = await worker.fetch(new Request("https://example.test/smart.js?v=15.4"), {}, {});
const smartSource = await smartResponse.text();
assert.match(smartSource, /SMART SCREENER · v15\.4/);
assert.match(smartSource, /esc\(s\.market\)/);

const { default: fallbackWorker } = await import("../worker/index.js?fallback-test");
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("tpex.org.tw")) throw new Error("simulated TPEx outage");
  if (url.includes("supabase.co/functions/v1/twss-market-data") && url.includes("type=stocks")) {
    return json({
      date: "2026-07-13",
      stocks: otcSymbols.map((symbol, index) => ({ symbol, name: `上櫃備援${index + 1}`, market: "上櫃", industry: "未分類", close: 50 })),
    });
  }
  return fullFetch(input);
};

const fallbackResponse = await fallbackWorker.fetch(
  new Request("https://example.test/api/market-data?type=stocks&refresh=1"),
  {},
  {},
);
assert.equal(fallbackResponse.ok, true);
const fallbackStocks = await fallbackResponse.json();
assert.equal(fallbackStocks.mode, "partial");
assert.deepEqual(fallbackStocks.markets, { listed: 25, otc: 0, fallback: 25 });
assert.equal(fallbackStocks.stocks.length, 50);

console.log("Smoke tests passed: freshness routing, real official fields, six financial formats, fallback, and UI labels");
