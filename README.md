# 台股智選 v15.4

以臺灣證券交易所、櫃買中心及公開資訊觀測站的公開資料建立的上市櫃智能選股網站。這一版會先核對各來源的實際資料日期，再合併行情、估值、法人、融資融券、月營收與財報；不會再把「API 回傳成功」誤當成「資料就是今天」。

> 這是盤後研究工具，不是券商即時報價。休市日顯示最近一個交易日；三大法人、融資融券、月營收與財報都有各自的公布時程，畫面會分開標示日期或期別。

## 已修正的問題

- 上市行情改以指定最新交易日的 TWSE `MI_INDEX` 為主，可能延遲數日的 `STOCK_DAY_ALL` 僅作備援。
- 依 TPEx 官方實際欄位修正外資、投信、自營商、三大法人合計及融資融券解析。
- 依 MOPS 實際欄位修正月營收、月增、年增與累計年增。
- 財報由只讀一般業，擴充為一般業、金控、銀行、證券、保險及異業六種格式。
- 上市與上櫃的行情、估值、法人、融資融券日期分開回傳與顯示。
- API 回應與瀏覽器請求使用 `no-store`，前端請求加入時間戳，避免舊 Service Worker 持續顯示過期資料。

完整核對紀錄請見 [docs/API-AUDIT.md](docs/API-AUDIT.md)。

## 官方資料來源

- TWSE 指定交易日盤後介面：上市行情、估值、三大法人及融資融券。
- TWSE OpenAPI：公司資料與盤後來源失效時的備援。
- TPEx OpenAPI：上櫃行情、估值、公司資料、三大法人及融資融券。
- MOPS 開放資料：上市櫃月營收、六類綜合損益表與資產負債表。
- 原有 Supabase Edge：歷史日線與官方來源暫時失效時的備援。

## GitHub 與 Vercel 部署

1. 把本專案所有檔案上傳到一個新的 GitHub Repository。
2. 在 Vercel 選擇 **Add New → Project**，匯入該 Repository。
3. Framework Preset 選 **Other**，其餘保留預設後部署。

`public/` 是前端，`api/` 是 Vercel Edge API，`src/market-data.js` 是可讀的資料整合原始碼。程式不需要付費 API 金鑰。

## 本機檢查

需要 Node.js 20 或更新版本：

```sh
npm test
```

若要直接連線官方 API、查看各來源目前日期與欄位：

```sh
npm run audit
```

## API

- `GET /api/market-data?type=stocks`
- `GET /api/market-data?type=revenue`
- `GET /api/market-data?type=financials`
- `GET /api/market-data?type=history&symbol=2330&months=12`
- `GET /api/market-data?type=sources`
- `GET /api/health`

需要略過伺服器內部短期快取時，可加上 `refresh=1`。

## 免責聲明

未來漲跌預測是依公開資料、技術指標與固定權重計算的機率估計，僅供研究參考，不構成投資建議、買賣邀約或獲利保證。
