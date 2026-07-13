# 台灣股票公開 API 核對紀錄

核對日期：2026-07-13（Asia/Taipei）

本次以官方 Swagger 文件與實際 JSON 回傳交叉檢查。核心原則是：每個來源都保留自己的資料日期；不能因為 HTTP 200 就把資料標成今天。

| 資料 | 主要官方端點 | 2026-07-13 實測期別 | 程式處理 |
|---|---|---:|---|
| 上市行情 | `www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX` | 2026-07-13 | 先取得最新交易日，再帶入 `date` 查詢每日收盤行情表 |
| 上市行情備援 | `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` | 2026-07-09 | 當時落後主要來源四日，因此只作備援 |
| 上市估值 | `www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d` | 2026-07-13 | 指定交易日取得本益比、殖利率及股價淨值比 |
| 上市三大法人 | `www.twse.com.tw/rwd/zh/fund/T86` | 2026-07-13 | 依 `fields` 與 `data` 對應，不依固定欄位位置猜測 |
| 上市融資融券 | `www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN` | 2026-07-09 | 以 TPEx 最新融資券日期查詢同日上市資料；重複欄名以欄位位置明確拆分 |
| 上櫃行情 | `www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes` | 2026-07-13 | 使用 `Date` 並只保留四碼股票代號 |
| 上櫃估值 | `www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis` | 2026-07-13 | 對應 `PriceEarningRatio`、`YieldRatio`、`PriceBookRatio` |
| 上櫃三大法人 | `www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading` | 2026-07-13 | 依官方完整英文欄位名稱解析 Difference 欄 |
| 上櫃融資融券 | `www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance` | 2026-07-09 | 修正 `MarginPurchaseBalancePreviousDay`、`MarginSales`、`ShortConvering` 等實際欄位 |
| 月營收 | TWSE `t187ap05_L`、TPEx `mopsfin_t187ap05_O` | 2026-06 | 解析當月、上月、去年同月、累計金額及三種增減率，不另做逐檔請求 |
| 財報 | TWSE / TPEx `t187ap06`、`t187ap07` | 2026 Q1 | 合併 `ci`、`fh`、`basi`、`bd`、`ins`、`mim` 六種產業格式 |

## TPEx 三大法人實際欄位

- `Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference`
- `SecuritiesInvestmentTrustCompanies-Difference`
- `Dealers-Difference`
- `TotalDifference`

## 月營收實際欄位

- `營業收入-當月營收`
- `營業收入-上月營收`
- `營業收入-去年當月營收`
- `營業收入-上月比較增減(%)`
- `營業收入-去年同月增減(%)`
- `累計營業收入-當月累計營收`
- `累計營業收入-去年累計營收`
- `累計營業收入-前期比較增減(%)`

系統以「單月年增－累計年增」作為成長加速度。這些欄位都來自同一份官方月營收快照，因此增加判斷資訊時不會增加 API 呼叫數。ETF 並非單一公司，這些欄位標示為「ETF 不適用」，不視為資料錯誤。

## 請求節流與快取

TWSE 與 TPEx 公開 Swagger 及一般回應標頭在本次核對時未揭露固定的每分鐘數字配額，因此程式採保守的自訂上限，而不是假設可以無限制並行。

| 來源 | 同時執行 | 新請求最短間隔 | 用途 |
|---|---:|---:|---|
| TWSE OpenAPI | 2 | 1.2 秒 | 上市行情備援、公司資料、月營收與財報 |
| TWSE 盤後介面 | 1 | 1.5 秒 | 指定日行情、估值、法人、融資融券 |
| TPEx OpenAPI | 2 | 1.2 秒 | 上櫃行情、估值、法人、融資融券、財報 |
| MOPS 介面 | 1 | 1.8 秒 | 保留給後續逐期歷史資料 |
| Supabase 備援 | 2 | 0.35 秒 | 歷史日線與官方來源失效備援 |

- 429、408、5xx 與逾時最多重試兩次，採指數退避並尊重 `Retry-After`。
- 股票行情快取 2 分鐘；月營收與財報快取 6 小時；歷史日線快取 1 小時。
- 前端依序讀取月營收與財報，中間等待 1.6 秒。
- 歷史日線只補抓使用者目前所選分組的前 5 名，每檔間隔 1.5 秒，不掃描全市場。

## 分組評分

| 分組 | 基準權重 | 最低成交量 |
|---|---|---:|
| 上市股票 | 營收 25%、品質 20%、估值 15%、法人 15%、動能 15%、流動性 10% | 300 張 |
| 上櫃股票 | 營收 30%、品質 20%、流動性 20%、動能 15%、估值 10%、法人 5% | 100 張 |
| ETF | 流動性 35%、動能 30%、法人 15%、低波動 10%、殖利率 10% | 500 張 |

各因子先在自己的分組內計算百分位。缺資料的子因子不給預設分，總分依可用因子重算並乘上完整度調整；另外顯示資料信心。上市與上櫃前 30 名再限制同產業最多 4 檔，避免單一產業占滿榜單；ETF 不做產業限制。

## 財報格式代碼

| 代碼 | 格式 |
|---|---|
| `ci` | 一般業 |
| `fh` | 金控業 |
| `basi` | 銀行業 |
| `bd` | 證券業 |
| `ins` | 保險業 |
| `mim` | 異業 |

金融、保險等格式本來就不一定有一般製造業的毛利率欄位；此時保留空值，不把不相容欄位硬算成零。

## 更新時的自動檢查

`npm run audit` 會直接查詢官方資料並檢查主要欄位是否仍存在。若官方改名或改版，腳本會以非零狀態結束，避免網站在未察覺的情況下繼續顯示錯誤欄位。
