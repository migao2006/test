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
| 月營收 | TWSE `t187ap05_L`、TPEx `mopsfin_t187ap05_O` | 2026-06 | 修正 `營業收入-` 與 `累計營業收入-` 欄位前綴 |
| 財報 | TWSE / TPEx `t187ap06`、`t187ap07` | 2026 Q1 | 合併 `ci`、`fh`、`basi`、`bd`、`ins`、`mim` 六種產業格式 |

## TPEx 三大法人實際欄位

- `Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference`
- `SecuritiesInvestmentTrustCompanies-Difference`
- `Dealers-Difference`
- `TotalDifference`

## 月營收實際欄位

- `營業收入-當月營收`
- `營業收入-上月比較增減(%)`
- `營業收入-去年同月增減(%)`
- `累計營業收入-前期比較增減(%)`

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
