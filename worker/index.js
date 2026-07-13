const PAGE="<!doctype html>\n<html lang=\"zh-Hant-TW\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n  <meta name=\"theme-color\" content=\"#071018\">\n  <meta name=\"description\" content=\"台股官方盤後資料智能選股、多因子趨勢預測、歷史驗證與投資紀錄工具\">\n  <link rel=\"manifest\" href=\"/manifest.webmanifest?v=15.5\">\n  <link rel=\"icon\" href=\"/icon.svg?v=15.5\" type=\"image/svg+xml\">\n  <link rel=\"stylesheet\" href=\"/styles.css?v=15.5\">\n  <title>台股智選</title>\n</head>\n<body>\n  <header class=\"topbar\">\n    <div><h1>台股智選</h1><div id=\"marketDate\" class=\"sub\">正在核對官方資料日期…</div></div>\n    <div class=\"top-actions\"><span id=\"dataMode\" class=\"badge\">資料載入中</span><button id=\"accountBtn\" class=\"account-btn\" type=\"button\">登入</button></div>\n  </header>\n  <main id=\"app\" class=\"app-shell\"></main>\n  <nav class=\"bottom-nav\" aria-label=\"主要功能\">\n    <button type=\"button\" data-tab=\"home\" class=\"active\"><span>⌂</span>首頁</button>\n    <button type=\"button\" data-tab=\"opportunities\"><span>◆</span>智能選股</button>\n    <button type=\"button\" data-tab=\"forecast\"><span>⌁</span>趨勢預測</button>\n    <button type=\"button\" data-tab=\"verify\"><span>✓</span>預測驗證</button>\n    <button type=\"button\" data-tab=\"mine\"><span>◎</span>我的</button>\n  </nav>\n  <div id=\"modalRoot\"></div>\n  <script src=\"/app.js?v=15.5\" defer></script>\n  <script src=\"/patch.js?v=15.5\" defer></script>\n  <script src=\"/smart.js?v=15.5\" defer></script>\n</body>\n</html>\n";
const APP="'use strict';\n\nconst EDGE='/api/market-data';\nconst SUPABASE_URL='https://lfkdkdyaatdlizryiyon.supabase.co';\nconst SUPABASE_KEY='sb_publishable_r3h9eQIYdIqScvmc77avAg_OLgBT6lh';\nconst MODEL_VERSION='v15.5-grouped-multifactor';\nconst DISCLAIMER='未來漲跌預測是依公開資料、技術指標與固定權重計算的機率估計，僅供研究參考，不構成投資建議、買賣邀約或獲利保證。模型可能因突發消息、流動性、資料延遲及市場情緒而失準，投資人應自行判斷並承擔風險。';\n\nconst S={\n  tab:'home',stocks:[],mode:'loading',date:'',fundStatus:'loading',fundPeriod:'',loading:true,\n  historyCache:new Map(),historySignals:new Map(),backtestCache:new Map(),detailSymbol:null,forecastQuery:'',verifyQuery:'',verifySymbol:'',\n  mineSub:'watch',session:null,dataStatus:{},sourceDates:{},fundDates:{},syncState:'本機模式'\n};\n\nconst app=document.querySelector('#app');\nconst modalRoot=document.querySelector('#modalRoot');\nconst q=(s,r=document)=>r.querySelector(s);\nconst qa=(s,r=document)=>[...r.querySelectorAll(s)];\nconst clamp=(v,min,max)=>Math.max(min,Math.min(max,v));\nconst safe=v=>v==null||Number.isNaN(Number(v))?null:Number(v);\nconst fmt=(v,d=2)=>v==null||Number.isNaN(Number(v))?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d});\nconst pct=(v,d=2)=>v==null||Number.isNaN(Number(v))?'—':`${v>0?'+':''}${fmt(v,d)}%`;\nconst cls=v=>v>0?'up':v<0?'down':'neutral';\nconst today=()=>new Date().toISOString().slice(0,10);\nconst uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;\nconst esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst reasonDash=reason=>`—（${reason}）`;\n\nfunction readLocal(key,fallback=[]){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}\nfunction writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}\nfunction getWatchlist(){return readLocal('twss-watchlist-v15',[])}\nfunction setWatchlist(v){writeLocal('twss-watchlist-v15',v)}\nfunction getPredictions(){return readLocal('twss-predictions-v15',[])}\nfunction setPredictions(v){writeLocal('twss-predictions-v15',v)}\nfunction getJournal(){return readLocal('twss-journal-v15',[])}\nfunction setJournal(v){writeLocal('twss-journal-v15',v)}\nfunction isWatched(symbol){return getWatchlist().some(x=>x.symbol===symbol)}\n\nconst wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));\nasync function fetchJson(url,timeout=90000,retries=1){\n  let lastError;\n  for(let attempt=0;attempt<=retries;attempt++){\n    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);\n    try{\n      const r=await fetch(url,{cache:'default',signal:controller.signal,headers:{accept:'application/json'}});\n      if(!r.ok){const error=new Error(`HTTP ${r.status}`);error.status=r.status;throw error}\n      return await r.json();\n    }catch(error){\n      lastError=error;const retryable=error.name==='AbortError'||error.status===429||error.status>=500;\n      if(!retryable||attempt===retries)throw error;\n      await wait(1400*(attempt+1));\n    }finally{clearTimeout(timer)}\n  }\n  throw lastError;\n}\n\nfunction normalizeStock(item){return{\n  symbol:'',name:'',industry:'未分類',market:'上市',instrumentType:'股票',close:null,change:null,open:null,high:null,low:null,\n  volume:null,value:null,transactions:null,pe:null,pb:null,yield:null,revenue:null,revenuePreviousMonth:null,revenueLastYearMonth:null,revenueYtd:null,revenueLastYearYtd:null,rev:null,revMom:null,revYtd:null,revAcceleration:null,revPeriod:null,\n  eps:null,roe:null,roeEstimated:false,roePeriod:null,grossMargin:null,operatingMargin:null,netMargin:null,debt:null,equityRatio:null,\n  foreign:null,trust:null,dealer:null,inst:null,marginBalance:null,marginChange:null,shortBalance:null,shortChange:null,disp:null,full:null,demo:false,\n  ...item,symbol:String(item.symbol||'')\n}}\n\nasync function loadStocks(){\n  S.loading=true;render();\n  try{\n    const payload=await fetchJson(`${EDGE}?type=stocks`,120000);\n    if(!Array.isArray(payload.stocks)||payload.stocks.length<20)throw new Error(payload.error||'盤後資料筆數不足');\n    S.stocks=payload.stocks.map(normalizeStock);S.mode=payload.mode||'partial';S.date=payload.date||today();S.dataStatus=payload.sourceStatus||{};S.sourceDates=payload.dates||{};S.loading=false;\n    q('#marketDate').textContent=`最新交易日 ${S.date} · 盤後資料（非即時）`;\n    q('#dataMode').textContent=S.mode==='live'?'官方日期已核對':S.mode==='partial'?'部分官方資料':'資料不足';\n    render();loadFundamentals();\n  }catch(error){\n    S.loading=false;app.innerHTML=`<div class=\"card error-card\"><h3>股票資料載入失敗</h3><p class=\"muted\">${esc(error.message)}</p><button id=\"retryLoad\" class=\"btn\">重新載入</button></div>`;q('#retryLoad').onclick=loadStocks;\n  }\n}\n\nasync function loadFundamentals(){\n  S.fundStatus='loading';render();\n  const merged=new Map();let revenueOk=false,financialOk=false;const periods=[];\n  const applyPayload=(payload,type)=>{\n    const rows=payload?.fundamentals||[];\n    if(type==='revenue'&&rows.some(x=>x.rev!=null))revenueOk=true;\n    if(type==='financials'&&rows.some(x=>x.roe!=null||x.eps!=null))financialOk=true;\n    if(payload?.period)periods.push(payload.period);\n    if(payload?.dates)S.fundDates[type]=payload.dates;\n    rows.forEach(row=>merged.set(String(row.symbol),{...(merged.get(String(row.symbol))||{}),...row}));\n    S.stocks=S.stocks.map(stock=>({...stock,...(merged.get(stock.symbol)||{})}));\n    S.fundStatus=revenueOk||financialOk?'partial':'loading';render();\n  };\n  try{applyPayload(await fetchJson(`${EDGE}?type=revenue`,90000),'revenue')}catch{}\n  await wait(1600);\n  try{applyPayload(await fetchJson(`${EDGE}?type=financials`,180000),'financials')}catch{}\n  S.fundStatus=revenueOk&&financialOk?'ready':revenueOk||financialOk?'partial':'error';\n  S.fundPeriod=periods.sort().at(-1)||'';render();\n  if(S.detailSymbol)openDetail(S.detailSymbol,false);\n}\n\nasync function getHistory(symbol){\n  const cached=S.historyCache.get(symbol);if(cached)return cached instanceof Promise?cached:Promise.resolve(cached);\n  const promise=(async()=>{const payload=await fetchJson(`${EDGE}?type=history&symbol=${encodeURIComponent(symbol)}&months=12`,90000);if(!Array.isArray(payload.history)||payload.history.length<20)throw new Error(payload.error||'歷史日線不足');const rows=payload.history.map(x=>({date:x.date,open:safe(x.open),high:safe(x.high),low:safe(x.low),close:safe(x.close),volume:safe(x.volume),value:safe(x.value),transactions:safe(x.transactions)})).filter(x=>x.close!=null&&x.high!=null&&x.low!=null);const result={rows,indicators:computeIndicators(rows),source:payload.source||'TWSE'};S.historyCache.set(symbol,result);return result})();\n  S.historyCache.set(symbol,promise);try{return await promise}catch(error){S.historyCache.delete(symbol);throw error}\n}\n\n/* Supabase auth and optional cloud sync */\nconst SESSION_KEY='twss-supabase-session-v15';\nfunction storeSession(session){S.session=session;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);q('#accountBtn').textContent=session?'帳戶':'登入'}\nasync function sb(path,options={}){\n  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};\n  if(options.auth!==false&&S.session?.access_token)headers.Authorization=`Bearer ${S.session.access_token}`;\n  const r=await fetch(SUPABASE_URL+path,{method:options.method||'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body),cache:'no-store'});\n  let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return data;\n}\nasync function refreshSession(){\n  if(!S.session)return false;if((S.session.expires_at||0)>Date.now()/1000+90)return true;\n  if(!S.session.refresh_token){storeSession(null);return false}\n  try{const s=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:S.session.refresh_token},auth:false});s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);return true}catch{storeSession(null);return false}\n}\nasync function login(email,password){const s=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},auth:false});s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);await cloudPull()}\nasync function signup(email,password){const s=await sb(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin)}`,{method:'POST',body:{email,password},auth:false});if(s?.access_token){s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);await cloudPull();return true}return false}\nasync function cloudPull(){\n  if(!await refreshSession())return;S.syncState='同步中…';\n  try{\n    const [pred,journal]=await Promise.all([\n      sb('/rest/v1/prediction_logs?select=*&order=prediction_date.desc'),\n      sb('/rest/v1/investment_journal?select=*&order=entry_date.desc')\n    ]);\n    if(pred?.length)setPredictions(pred.map(x=>({...x,local_id:x.id})));\n    if(journal?.length)setJournal(journal.map(x=>({...x,local_id:x.id})));\n    S.syncState='雲端已同步';render();\n  }catch(e){S.syncState=`同步失敗：${e.message}`}\n}\nasync function upsertPredictionCloud(record){if(!await refreshSession())return;const body={user_id:S.session.user?.id||decodeJwtSub(S.session.access_token),symbol:record.symbol,stock_name:record.stock_name,prediction_date:record.prediction_date,horizon_days:record.horizon_days,reference_price:record.reference_price,predicted_direction:record.predicted_direction,up_probability:record.up_probability,neutral_probability:record.neutral_probability,down_probability:record.down_probability,confidence:record.confidence,expected_low:record.expected_low,expected_high:record.expected_high,model_version:record.model_version,factors:record.factors,evaluated_at:record.evaluated_at||null,actual_price:record.actual_price??null,actual_return_pct:record.actual_return_pct??null,actual_direction:record.actual_direction||null,is_correct:record.is_correct??null};await sb('/rest/v1/prediction_logs?on_conflict=user_id,symbol,prediction_date,horizon_days,model_version',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body})}\nasync function upsertJournalCloud(record){if(!await refreshSession())return;const userId=S.session.user?.id||decodeJwtSub(S.session.access_token);const body={user_id:userId,symbol:record.symbol,stock_name:record.stock_name,entry_date:record.entry_date,action:record.action,price:record.price??null,quantity:record.quantity??null,horizon:record.horizon||null,thesis:record.thesis||null,risk_plan:record.risk_plan||null,target_plan:record.target_plan||null,emotion:record.emotion||null,followed_plan:record.followed_plan??null,exit_price:record.exit_price??null,exit_date:record.exit_date||null,return_pct:record.return_pct??null,result_note:record.result_note||null,tags:record.tags||[]};if(record.id&&String(record.id).includes('-'))await sb(`/rest/v1/investment_journal?id=eq.${record.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body});else await sb('/rest/v1/investment_journal',{method:'POST',headers:{Prefer:'return=minimal'},body})}\nfunction decodeJwtSub(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{return null}}\nasync function initSession(){try{S.session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{S.session=null}q('#accountBtn').textContent=S.session?'帳戶':'登入';if(S.session&&await refreshSession()){try{S.session.user=await sb('/auth/v1/user');storeSession(S.session)}catch{}cloudPull()}}\n\nfunction mean(values){const v=values.filter(x=>x!=null&&Number.isFinite(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}\nfunction sma(values,period){return values.length>=period?mean(values.slice(-period)):null}\nfunction emaSeries(values,period){if(!values.length)return[];const m=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*m+out[i-1]*(1-m));return out}\nfunction std(values){const m=mean(values);return m==null?null:Math.sqrt(mean(values.map(v=>(v-m)**2)))}\nfunction calcRsi(values,period=14){if(values.length<=period)return null;const changes=values.slice(1).map((v,i)=>v-values[i]);let gains=0,losses=0;for(const c of changes.slice(0,period)){if(c>0)gains+=c;else losses-=c}let avgGain=gains/period,avgLoss=losses/period;for(const c of changes.slice(period)){avgGain=(avgGain*(period-1)+Math.max(c,0))/period;avgLoss=(avgLoss*(period-1)+Math.max(-c,0))/period}if(avgLoss===0)return 100;return 100-100/(1+avgGain/avgLoss)}\nfunction calcAtr(rows,period=14){if(rows.length<=period)return null;const tr=rows.slice(1).map((r,i)=>Math.max(r.high-r.low,Math.abs(r.high-rows[i].close),Math.abs(r.low-rows[i].close)));return mean(tr.slice(-period))}\nfunction computeIndicators(rows){\n  const closes=rows.map(r=>r.close).filter(v=>v!=null),volumes=rows.map(r=>r.volume).filter(v=>v!=null);if(closes.length<20)return null;\n  const ma5=sma(closes,5),ma20=sma(closes,20),ma60=sma(closes,60),ema12=emaSeries(closes,12),ema26=emaSeries(closes,26);\n  const macdSeries=closes.map((_,i)=>(ema12[i]??0)-(ema26[i]??0)),signalSeries=emaSeries(macdSeries,9);\n  const macd=macdSeries.at(-1),signal=signalSeries.at(-1),histogram=macd-signal,rsi14=calcRsi(closes,14),atr14=calcAtr(rows,14),last=closes.at(-1);\n  const w20=closes.slice(-20),mid=mean(w20),dev=std(w20),upper=mid==null||dev==null?null:mid+2*dev,lower=mid==null||dev==null?null:mid-2*dev;\n  const momentum5=closes.length>5?(last/closes.at(-6)-1)*100:null,momentum20=closes.length>20?(last/closes.at(-21)-1)*100:null;\n  const volume5=sma(volumes,5),volume20=sma(volumes,20),volumeRatio=volume5!=null&&volume20?volume5/volume20:null;\n  const recent=rows.slice(-20),support=recent.length?Math.min(...recent.map(r=>r.low)):null,resistance=recent.length?Math.max(...recent.map(r=>r.high)):null;\n  return{ma5,ma20,ma60,rsi14,atr14,atrPct:atr14&&last?atr14/last*100:null,macd,signal,histogram,bollingerUpper:upper,bollingerMiddle:mid,bollingerLower:lower,momentum5,momentum20,volume5,volume20,volumeRatio,support,resistance,last,rows:rows.length}\n}\n\nfunction calculateForecast(stock,indicators){\n  const isEtf=stock.instrumentType==='ETF'||/^00\\d{2,4}$/.test(stock.symbol);\n  let technical=0,fundamental=0,chip=0,valuation=0,riskPenalty=0;const positive=[],negative=[],missing=[];\n  if(indicators){\n    if(stock.close>indicators.ma5){technical+=7;positive.push('股價站上 5 日均線')}else technical-=5;\n    if(indicators.ma5!=null&&indicators.ma20!=null&&indicators.ma5>indicators.ma20){technical+=10;positive.push('短期均線偏多')}else technical-=7;\n    if(indicators.ma20!=null&&indicators.ma60!=null){if(indicators.ma20>indicators.ma60){technical+=13;positive.push('20 日均線高於 60 日均線')}else{technical-=11;negative.push('中期均線偏弱')}}else missing.push('60 日均線');\n    if(indicators.histogram!=null){if(indicators.histogram>0){technical+=10;positive.push('MACD 柱狀體為正')}else{technical-=10;negative.push('MACD 柱狀體為負')}}\n    if(indicators.rsi14!=null){if(indicators.rsi14>=50&&indicators.rsi14<=68)technical+=8;else if(indicators.rsi14>75){technical-=9;riskPenalty+=7;negative.push('RSI 過熱')}else if(indicators.rsi14<35){technical-=4;riskPenalty+=4;negative.push('RSI 偏弱')}}\n    if(indicators.momentum5!=null)technical+=clamp(indicators.momentum5*1.2,-10,10);\n    if(indicators.momentum20!=null)technical+=clamp(indicators.momentum20*.6,-12,12);\n    if(indicators.volumeRatio!=null){if(indicators.volumeRatio>1.15&&(stock.change||0)>0){technical+=6;positive.push('量價同步')}if(indicators.volumeRatio>1.5&&(stock.change||0)<0){technical-=7;negative.push('下跌放量')}}\n    if(indicators.atrPct!=null&&indicators.atrPct>5){riskPenalty+=9;negative.push('短線波動較大')}\n  }else missing.push('歷史價格與技術指標');\n  if(!isEtf){\n    if(stock.rev!=null){if(stock.rev>=30){fundamental+=20;positive.push('月營收年增強勁')}else if(stock.rev>=10)fundamental+=13;else if(stock.rev>0)fundamental+=5;else{fundamental-=10;negative.push('月營收年增為負')}}else missing.push('月營收年增率');\n    if(stock.revMom!=null)fundamental+=clamp(stock.revMom*.25,-7,7);\n    if(stock.revYtd!=null)fundamental+=clamp(stock.revYtd*.18,-6,8);\n    if(stock.roe!=null){if(stock.roe>=15){fundamental+=14;positive.push('ROE 表現佳')}else if(stock.roe>=8)fundamental+=8;else if(stock.roe<0)fundamental-=10}else missing.push('ROE');\n    if(stock.eps!=null)fundamental+=stock.eps>0?6:-8;else missing.push('EPS');\n    if(stock.operatingMargin!=null)fundamental+=stock.operatingMargin>10?5:stock.operatingMargin<0?-7:1;\n    if(stock.debt!=null){if(stock.debt>75){fundamental-=7;riskPenalty+=5;negative.push('負債比偏高')}else if(stock.debt<50)fundamental+=3}else missing.push('負債比');\n    if(stock.pe!=null&&stock.pe>0){if(stock.pe<=15)valuation+=12;else if(stock.pe<=25)valuation+=7;else if(stock.pe<=35)valuation+=2;else{valuation-=7;negative.push('本益比偏高')}}else missing.push('本益比');\n    if(stock.pb!=null)valuation+=stock.pb<=2?5:stock.pb<=3?2:stock.pb>6?-4:0;\n    if(stock.yield!=null&&stock.yield>=3)valuation+=3;\n  }else{\n    if(stock.yield!=null){valuation+=stock.yield>=5?8:stock.yield>=3?5:2;positive.push(`ETF 殖利率 ${fmt(stock.yield)}%`)}\n    if((stock.volume||0)>=5000){fundamental+=8;positive.push('ETF 成交量充足')}else if((stock.volume||0)<500){riskPenalty+=8;negative.push('ETF 流動性偏低')}\n  }\n  if(stock.foreign!=null){if(stock.foreign>0){chip+=10;positive.push('外資買超')}else if(stock.foreign<0)chip-=8}else missing.push('外資買賣超');\n  if(stock.trust!=null)chip+=stock.trust>0?7:stock.trust<0?-5:0;if(stock.dealer!=null)chip+=stock.dealer>0?3:stock.dealer<0?-2:0;\n  if(stock.marginChange!=null&&stock.marginChange>0&&(stock.change||0)<0){chip-=4;riskPenalty+=3;negative.push('下跌且融資增加')}\n  const tn=clamp(technical,-55,55),fn=clamp(fundamental,-35,35),cn=clamp(chip,-20,20),vn=clamp(valuation,-15,15);\n  const composite=isEtf?tn*.68+fn*.10+cn*.16+vn*.06-riskPenalty*.4:tn*.52+fn*.26+cn*.15+vn*.07-riskPenalty*.35;\n  const neutralProbability=clamp(29-Math.abs(composite)*.25+(indicators?.atrPct>5?5:0),12,38),directional=100-neutralProbability,upShare=1/(1+Math.exp(-composite/11));\n  let up=Math.round(directional*upShare),down=Math.round(directional-directional*upShare),neutral=100-up-down;\n  const required=isEtf?[stock.volume,stock.value,stock.yield,stock.foreign,stock.inst,indicators?.ma20,indicators?.ma60,indicators?.rsi14,indicators?.macd,indicators?.atrPct]:[stock.rev,stock.revMom,stock.roe,stock.eps,stock.pe,stock.pb,stock.debt,stock.foreign,indicators?.ma20,indicators?.rsi14,indicators?.macd,indicators?.atrPct];\n  const available=required.filter(v=>v!=null).length;\n  const completeness=Math.round(available/required.length*100),confidence=clamp(Math.round(completeness*.78+Math.min(Math.abs(composite),30)*.55-riskPenalty),25,90);\n  const shortLabel=up>=down+12?'短期偏多':down>=up+12?'短期偏空':'短期震盪';\n  const mediumScore=(indicators?.ma20&&indicators?.ma60?(indicators.ma20>indicators.ma60?18:-18):0)+(isEtf?fn*.15+vn*.15+cn*.45:fn*.55+vn*.2+cn*.25);\n  const mediumLabel=mediumScore>=10?'中期偏多':mediumScore<=-10?'中期偏空':'中期盤整';\n  const atrPct=indicators?.atrPct??Math.max(2,Math.abs(stock.change||0)*.8),expectedMove5=clamp(atrPct*Math.sqrt(5)*.75,2,18);\n  return{up,down,neutral,confidence,completeness,shortLabel,mediumLabel,composite:+composite.toFixed(1),technical:+tn.toFixed(1),fundamental:+fn.toFixed(1),chip:+cn.toFixed(1),valuation:+vn.toFixed(1),riskPenalty,expectedMove5,expectedLow:stock.close*(1-expectedMove5/100),expectedHigh:stock.close*(1+expectedMove5/100),positive:[...new Set(positive)].slice(0,8),negative:[...new Set(negative)].slice(0,8),missing:[...new Set(missing)].slice(0,8)}\n}\n\nfunction opportunityScore(stock){let score=0;if(stock.rev!=null)score+=stock.rev>=30?28:stock.rev>=20?24:stock.rev>=10?20:stock.rev>0?10:0;if(stock.revMom!=null)score+=stock.revMom>=10?10:stock.revMom>0?6:0;if(stock.revYtd!=null)score+=stock.revYtd>=10?7:stock.revYtd>0?3:0;if(stock.roe!=null)score+=stock.roe>=15?15:stock.roe>=10?12:stock.roe>=8?8:0;if(stock.eps!=null&&stock.eps>0)score+=5;if(stock.pe!=null&&stock.pe>0)score+=stock.pe<=15?10:stock.pe<=25?7:stock.pe<=35?3:0;if(stock.pb!=null)score+=stock.pb<=2?4:stock.pb<=3?2:0;if(stock.foreign>0)score+=6;if(stock.trust>0)score+=4;if((stock.volume||0)>=1000)score+=6;else if((stock.volume||0)>=500)score+=3;if(stock.debt!=null&&stock.debt<=55)score+=3;return Math.min(100,Math.round(score))}\nfunction instrumentGroup(stock){if(stock.instrumentType==='ETF'||/^00\\d{2,4}$/.test(stock.symbol))return'etf';return stock.market==='上櫃'?'otc':'listed'}\nfunction opportunityEligible(stock){const group=instrumentGroup(stock),floor=group==='otc'?100:300;return group!=='etf'&&stock.rev!=null&&stock.rev>=10&&(stock.volume||0)>=floor&&(stock.pe==null||(stock.pe>0&&stock.pe<=35))&&(stock.roe==null||stock.roe>=8)&&stock.disp!==true&&stock.full!==true}\n\nfunction marketEnvironment(){\n  const tradable=S.stocks.filter(x=>x.change!=null),up=tradable.filter(x=>x.change>0).length,down=tradable.filter(x=>x.change<0).length,flat=tradable.length-up-down;\n  const avgChange=mean(tradable.map(x=>x.change))||0,totalVolume=S.stocks.reduce((a,x)=>a+(x.volume||0),0),foreign=S.stocks.reduce((a,x)=>a+(x.foreign||0),0),inst=S.stocks.reduce((a,x)=>a+(x.inst||0),0);\n  const breadth=tradable.length?up/tradable.length*100:0;\n  const label=breadth>=60&&avgChange>0?'市場偏多':breadth<=40&&avgChange<0?'市場偏空':'市場震盪';\n  const confidence=clamp(Math.round(Math.abs(breadth-50)*1.3+Math.abs(avgChange)*8),30,85);\n  const industries=[...new Set(S.stocks.map(x=>x.industry).filter(Boolean))].map(industry=>{\n    const rows=S.stocks.filter(x=>x.industry===industry),valid=rows.filter(x=>x.change!=null);return{industry,count:rows.length,avgChange:mean(valid.map(x=>x.change))||0,breadth:valid.length?valid.filter(x=>x.change>0).length/valid.length*100:0,rev:mean(rows.map(x=>x.rev)),foreign:rows.reduce((a,x)=>a+(x.foreign||0),0)}\n  }).filter(x=>x.count>=3).sort((a,b)=>(b.avgChange+b.breadth/100)-(a.avgChange+a.breadth/100));\n  return{up,down,flat,avgChange,totalVolume,foreign,inst,breadth,label,confidence,industries}\n}\n\nfunction percentile(values,value,higherIsBetter=true){const v=values.filter(x=>x!=null&&Number.isFinite(x));if(!v.length||value==null)return null;const rank=v.filter(x=>higherIsBetter?x<=value:x>=value).length;return Math.round(rank/v.length*100)}\nfunction peerComparison(stock){\n  const group=instrumentGroup(stock);let peers=S.stocks.filter(x=>instrumentGroup(x)===group&&x.industry===stock.industry&&x.symbol!==stock.symbol);if(peers.length<4)peers=S.stocks.filter(x=>instrumentGroup(x)===group&&x.symbol!==stock.symbol);\n  const definitions=group==='etf'?\n    [['殖利率','yield',true,'%'],['成交量','volume',true,' 張'],['成交金額','value',true,' 元'],['三大法人','inst',true,' 張'],['單日漲跌','change',true,'%']]:\n    [['月營收年增','rev',true,'%'],['ROE','roe',true,'%'],['本益比','pe',false,''],['殖利率','yield',true,'%'],['外資買賣超','foreign',true,' 張'],['單日漲跌','change',true,'%']];\n  const rows=definitions.map(([label,key,higher,suffix])=>({label,value:stock[key],median:median(peers.map(x=>x[key])),percentile:percentile(peers.map(x=>x[key]),stock[key],higher),suffix,higher}));\n  return{peerCount:peers.length,rows}\n}\nfunction median(values){const v=values.filter(x=>x!=null&&Number.isFinite(x)).sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}\n\nfunction nextRevenueWindow(){const now=new Date(),next=new Date(now.getFullYear(),now.getMonth()+1,1);return`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')} 上旬`}\nfunction buildEvents(stock,indicators){\n  const events=instrumentGroup(stock)==='etf'?[{icon:'◷',title:'ETF 定期觀察',detail:'追蹤指數成分調整、折溢價、流動性與配息公告',level:'info'}]:[{icon:'◷',title:'下次月營收觀察窗口',detail:nextRevenueWindow(),level:'info'}];\n  if(stock.rev!=null&&stock.rev<0)events.push({icon:'!',title:'營收年增轉負',detail:`最新月營收年增 ${pct(stock.rev)}`,level:'bad'});\n  if(stock.revMom!=null&&stock.revMom<=-15)events.push({icon:'!',title:'單月營收明顯下滑',detail:`月增率 ${pct(stock.revMom)}`,level:'bad'});\n  if(Math.abs(stock.change||0)>=5)events.push({icon:'↕',title:'單日價格波動較大',detail:`今日漲跌 ${pct(stock.change)}`,level:'warn'});\n  if(indicators?.volumeRatio>=1.5)events.push({icon:'▥',title:'成交量明顯放大',detail:`5 日／20 日量能比 ${fmt(indicators.volumeRatio)} 倍`,level:'warn'});\n  if(indicators?.rsi14>=70)events.push({icon:'▲',title:'RSI 進入偏熱區',detail:`RSI ${fmt(indicators.rsi14)}`,level:'warn'});\n  if(indicators?.rsi14<=30)events.push({icon:'▼',title:'RSI 進入偏弱區',detail:`RSI ${fmt(indicators.rsi14)}`,level:'bad'});\n  if(stock.foreign!=null&&stock.foreign<-1000)events.push({icon:'外',title:'外資當日賣超',detail:`${fmt(stock.foreign,0)} 張`,level:'bad'});\n  if(stock.marginChange!=null&&stock.marginChange>0&&(stock.change||0)<0)events.push({icon:'融',title:'下跌伴隨融資增加',detail:`融資增減 ${fmt(stock.marginChange,0)} 張`,level:'warn'});\n  if(indicators?.resistance&&stock.close>=indicators.resistance*.98)events.push({icon:'壓',title:'接近 20 日壓力',detail:`壓力約 ${fmt(indicators.resistance)} 元`,level:'warn'});\n  if(indicators?.support&&stock.close<=indicators.support*1.02)events.push({icon:'撐',title:'接近 20 日支撐',detail:`支撐約 ${fmt(indicators.support)} 元`,level:'bad'});\n  if(stock.disp===true)events.push({icon:'處',title:'處置股票',detail:'交易限制可能影響流動性',level:'bad'});\n  if(stock.full===true)events.push({icon:'全',title:'全額交割股票',detail:'交易風險較高',level:'bad'});\n  return events;\n}\n\nfunction scenarioAnalysis(stock,forecast,indicators){\n  const atr=indicators?.atrPct??forecast.expectedMove5/Math.sqrt(5)/.75;\n  const support=indicators?.support??stock.close*(1-forecast.expectedMove5/100),resistance=indicators?.resistance??stock.close*(1+forecast.expectedMove5/100);\n  return[\n    {type:'good',title:'樂觀情境',prob:forecast.up,range:[Math.max(stock.close,resistance*.99),stock.close*(1+clamp(forecast.expectedMove5*1.15,3,22)/100)],trigger:'突破壓力、量能維持，法人籌碼未轉弱'},\n    {type:'base',title:'中性情境',prob:forecast.neutral,range:[stock.close*(1-clamp(atr*.7,1.5,8)/100),stock.close*(1+clamp(atr*.7,1.5,8)/100)],trigger:'量價與籌碼缺乏明確方向，維持區間震盪'},\n    {type:'bad',title:'悲觀情境',prob:forecast.down,range:[stock.close*(1-clamp(forecast.expectedMove5*1.2,3,24)/100),Math.min(stock.close,support*1.01)],trigger:'跌破支撐、下跌放量或法人轉為持續賣超'}\n  ]\n}\n\nfunction directionFromReturn(ret){return ret>1.5?'up':ret<-1.5?'down':'neutral'}\nfunction directionFromForecast(f){return f.up>=f.down+12?'up':f.down>=f.up+12?'down':'neutral'}\nfunction recordPrediction(stock,forecast){\n  const list=getPredictions(),key=`${stock.symbol}-${today()}-5-${MODEL_VERSION}`;if(list.some(x=>x.key===key))return;\n  const rec={key,local_id:uid(),symbol:stock.symbol,stock_name:stock.name,prediction_date:today(),horizon_days:5,reference_price:stock.close,predicted_direction:directionFromForecast(forecast),up_probability:forecast.up,neutral_probability:forecast.neutral,down_probability:forecast.down,confidence:forecast.confidence,expected_low:forecast.expectedLow,expected_high:forecast.expectedHigh,model_version:MODEL_VERSION,factors:{technical:forecast.technical,fundamental:forecast.fundamental,chip:forecast.chip,valuation:forecast.valuation,completeness:forecast.completeness},created_at:new Date().toISOString()};\n  list.unshift(rec);setPredictions(list);upsertPredictionCloud(rec).catch(()=>{});\n}\nfunction evaluatePredictionsForSymbol(symbol,history){\n  const list=getPredictions();let changed=false;\n  list.forEach(rec=>{\n    if(rec.symbol!==symbol||rec.evaluated_at)return;const startIndex=history.findIndex(r=>r.date>=rec.prediction_date);if(startIndex<0||history.length<=startIndex+5)return;const actual=history[startIndex+5],ret=(actual.close/rec.reference_price-1)*100,dir=directionFromReturn(ret);Object.assign(rec,{evaluated_at:new Date().toISOString(),actual_price:actual.close,actual_return_pct:+ret.toFixed(2),actual_direction:dir,is_correct:dir===rec.predicted_direction});changed=true;upsertPredictionCloud(rec).catch(()=>{})\n  });if(changed)setPredictions(list)\n}\n\nfunction runTechnicalBacktest(stock,history){\n  const key=`${stock.symbol}-${history.at(-1)?.date||''}`;if(S.backtestCache.has(key))return S.backtestCache.get(key);\n  const samples=[];\n  for(let i=60;i<history.length-5;i+=5){const slice=history.slice(0,i+1),ind=computeIndicators(slice);if(!ind)continue;const historicalStock={...stock,close:slice.at(-1).close,change:slice.length>1?(slice.at(-1).close/slice.at(-2).close-1)*100:0,rev:null,revMom:null,revYtd:null,roe:null,eps:null,operatingMargin:null,debt:null,pe:null,pb:null,yield:null,foreign:null,trust:null,dealer:null,marginChange:null};const f=calculateForecast(historicalStock,ind),pred=directionFromForecast(f),future=history[i+5],ret=(future.close/slice.at(-1).close-1)*100,actual=directionFromReturn(ret);samples.push({date:slice.at(-1).date,pred,actual,ret:+ret.toFixed(2),correct:pred===actual,confidence:f.confidence})}\n  const correct=samples.filter(x=>x.correct).length,returns=samples.map(x=>x.ret),result={samples,count:samples.length,hitRate:samples.length?correct/samples.length*100:null,avgReturn:mean(returns),avgWin:mean(samples.filter(x=>x.ret>0).map(x=>x.ret)),avgLoss:mean(samples.filter(x=>x.ret<0).map(x=>x.ret))};S.backtestCache.set(key,result);return result\n}\n\nfunction statusCard(){\n  const rev=S.stocks.filter(x=>x.rev!=null).length,fin=S.stocks.filter(x=>x.roe!=null||x.eps!=null).length,chip=S.stocks.filter(x=>x.foreign!=null||x.inst!=null).length;\n  const c=S.fundStatus==='ready'?'ok':S.fundStatus==='error'?'bad':'';const label=S.fundStatus==='ready'?'基本面已更新':S.fundStatus==='partial'?'部分基本面資料':S.fundStatus==='error'?'基本面暫缺':'基本面載入中';\n  return`<div class=\"card data-health\"><div><b>資料完整度</b><div class=\"muted\">月營收 ${rev} 檔 · 財報 ${fin} 檔 · 法人 ${chip} 檔${S.fundPeriod?` · ${S.fundPeriod}`:''}</div></div><span class=\"status-pill ${c}\">${label}</span></div>`\n}\nfunction disclaimer(){return`<div class=\"disclaimer\">${DISCLAIMER}</div>`}\nfunction metric(label,value,note=''){return`<div class=\"metric\"><small>${label}</small><b>${value}</b>${note?`<em>${note}</em>`:''}</div>`}\nfunction valueOrReason(v,suffix='',reason='API 未回傳'){return v==null?reasonDash(reason):`${fmt(v)}${suffix}`}\nfunction sourceDateSummary(){\n  const dates=S.sourceDates||{},price=dates.price?.latest||S.date||'—',institutional=dates.institutional?.latest||'尚未提供',margin=dates.margin?.latest||'尚未提供';\n  return`行情 ${price} · 法人 ${institutional} · 融資券 ${margin}`\n}\nfunction etfSnapshotScore(stock){const volume=Math.max(0,Math.log10(Math.max(stock.volume||0,1))-2)*13,value=Math.max(0,Math.log10(Math.max(stock.value||0,1))-6)*8,momentum=clamp((stock.change||0)*4+10,0,24),chip=stock.inst!=null&&stock.volume?clamp(stock.inst/stock.volume*25+7,0,18):0,dividend=stock.yield==null?0:clamp(stock.yield*2,0,12);return clamp(Math.round(volume+value+momentum+chip+dividend),0,100)}\nfunction groupedHomeRows(group){\n  if(typeof globalThis.twssGroupRanking==='function')return globalThis.twssGroupRanking(group,5);\n  const rows=S.stocks.filter(stock=>instrumentGroup(stock)===group);\n  if(group==='etf')return rows.filter(stock=>(stock.volume||0)>=500).map(stock=>({stock,score:etfSnapshotScore(stock)})).sort((a,b)=>b.score-a.score).slice(0,5);\n  return rows.filter(opportunityEligible).map(stock=>({stock,score:opportunityScore(stock)})).sort((a,b)=>b.score-a.score).slice(0,5)\n}\n\nfunction homePage(){\n  const env=marketEnvironment(),rank=(title,rows,value)=>`<div class=\"card\"><h3>${title}</h3><div class=\"rank-list\">${rows.slice(0,5).map((item,i)=>{const stock=item.stock||item;return`<div class=\"rank clickable\" data-detail=\"${stock.symbol}\"><b>${i+1}</b><span><b>${stock.name}</b><small class=\"muted\"> ${stock.symbol}</small></span><b class=\"${cls(stock.change)}\">${value(item,stock)}</b></div>`}).join('')||'<div class=\"muted\">目前沒有符合最低流動性與資料條件的標的</div>'}</div></div>`;\n  const rev=[...S.stocks].filter(x=>instrumentGroup(x)!=='etf'&&x.rev!=null).sort((a,b)=>b.rev-a.rev),inst=[...S.stocks].filter(x=>x.inst!=null).sort((a,b)=>b.inst-a.inst),listed=groupedHomeRows('listed'),otc=groupedHomeRows('otc'),etf=groupedHomeRows('etf');\n  const counts={listed:S.stocks.filter(x=>instrumentGroup(x)==='listed').length,otc:S.stocks.filter(x=>instrumentGroup(x)==='otc').length,etf:S.stocks.filter(x=>instrumentGroup(x)==='etf').length};\n  return`<h2>盤後市場儀表板</h2><div class=\"muted\">官方盤後資料整理，不是即時報價。</div>\n  <div class=\"grid\">${metric('最新日期',S.date||'—')}${metric('上市股票',fmt(counts.listed,0))}${metric('上櫃股票',fmt(counts.otc,0))}${metric('ETF',fmt(counts.etf,0))}</div>\n  <div class=\"card accent\"><div class=\"head\"><div><small class=\"muted\">大盤環境</small><div class=\"price\">${env.label}</div><div class=\"muted\">上漲 ${env.up} · 下跌 ${env.down} · 平盤 ${env.flat}</div></div><div><small class=\"muted\">多頭家數比</small><div class=\"score\">${fmt(env.breadth,0)}%</div><div class=\"muted\">平均漲跌 ${pct(env.avgChange)}</div></div></div><div class=\"grid\" style=\"margin-top:10px\">${metric('市場成交量',`${fmt(env.totalVolume,0)} 張`)}${metric('外資合計',`${fmt(env.foreign,0)} 張`)}${metric('三大法人合計',`${fmt(env.inst,0)} 張`)}${metric('環境信心',`${env.confidence}%`)}</div></div>\n  ${statusCard()}\n  <div class=\"card\"><h3>產業相對強弱</h3><div class=\"rank-list\">${env.industries.slice(0,6).map((x,i)=>`<div class=\"rank\"><b>${i+1}</b><span><b>${x.industry}</b><small class=\"muted\"> ${x.count} 檔 · 上漲家數 ${fmt(x.breadth,0)}%</small></span><b class=\"${cls(x.avgChange)}\">${pct(x.avgChange)}</b></div>`).join('')}</div></div>\n  <div class=\"notice\"><b>分組排名</b><br>上市、上櫃與 ETF 使用各自適用因子，只與同組商品比較，不會混在同一個名次。</div>\n  ${rank('上市機會榜',listed,item=>`${item.score} 分`)}${rank('上櫃機會榜',otc,item=>`${item.score} 分`)}${rank('ETF 觀察榜',etf,item=>`${item.score} 分`)}${rank('月營收年增排行（股票）',rev,(item,stock)=>pct(stock.rev))}${rank('三大法人買超排行',inst,(item,stock)=>`${fmt(stock.inst,0)} 張`)}${disclaimer()}`\n}\n\nfunction opportunityCard(stock){\n  return`<article class=\"card accent clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b>${stock.name}</b><div class=\"muted\">${stock.symbol} · ${stock.industry}</div></div><div><small class=\"muted\">機會分數</small><div class=\"score\">${opportunityScore(stock)}</div></div></div><div><span class=\"price\">${fmt(stock.close)}</span> <b class=\"${cls(stock.change)}\">${pct(stock.change)}</b></div><div class=\"grid\">${metric('月營收年增',pct(stock.rev),stock.revPeriod||'最新公開月')}${metric('月營收月增',pct(stock.revMom))}${metric(stock.roeEstimated?'年化推估 ROE':'ROE',stock.roe==null?reasonDash('API 未回傳'):`${fmt(stock.roe)}%`,stock.roePeriod||'')}${metric('本益比',valueOrReason(stock.pe))}</div><div class=\"rules\" style=\"margin-top:10px\"><span>成交量 ${fmt(stock.volume,0)} 張</span>${stock.foreign!=null?`<span>外資 ${fmt(stock.foreign,0)} 張</span>`:''}<span>${stock.industry}</span></div><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn grow\" data-forecast=\"${stock.symbol}\">深度預測</button><button class=\"btn secondary\" data-watch=\"${stock.symbol}\">${isWatched(stock.symbol)?'★ 已自選':'＋自選'}</button></div></article>`\n}\nfunction opportunitiesPage(){\n  const selected=S.stocks.filter(opportunityEligible).sort((a,b)=>opportunityScore(b)-opportunityScore(a));\n  return`<h2>機會股</h2><p class=\"muted\">月營收成長為核心，再綜合財報品質、估值、法人與流動性固定計分。</p><div class=\"card\"><h3>固定門檻</h3><div class=\"rules\"><span>月營收年增 ≥ 10%</span><span>成交量 ≥ 500 張</span><span>本益比 ≤ 35</span><span>ROE ≥ 8%（有資料時）</span><span>排除已確認風險股</span></div></div>${statusCard()}${selected.length?`<div class=\"list two-col\">${selected.map(opportunityCard).join('')}</div>`:`<div class=\"card empty\"><h3>目前沒有完整符合條件的股票</h3><p class=\"muted\">可能是資料仍在載入，或目前沒有股票同時達到固定門檻。</p></div>`}${disclaimer()}`\n}\n\nfunction stockSearchResults(query,attr){\n  const text=query.trim().toLowerCase();if(!text)return'';const rows=S.stocks.filter(x=>x.symbol.includes(text)||x.name.toLowerCase().includes(text)).slice(0,12);\n  return rows.length?`<div class=\"search-results\">${rows.map(x=>`<button class=\"search-result\" ${attr}=\"${x.symbol}\"><span><b>${x.name}</b><small class=\"muted\"> ${x.symbol} · ${x.industry}</small></span><span class=\"${cls(x.change)}\">${pct(x.change)}</span></button>`).join('')}</div>`:'<div class=\"muted\" style=\"margin-top:10px\">找不到符合的股票</div>'\n}\nfunction forecastPage(){\n  const top=[...S.stocks].filter(x=>x.rev!=null).sort((a,b)=>opportunityScore(b)-opportunityScore(a)).slice(0,8);\n  return`<h2>未來漲跌預測</h2><p class=\"muted\">整合歷史日線、MA、RSI、MACD、布林通道、ATR、量價、基本面、法人籌碼、大盤與產業環境。</p><div class=\"notice\"><b>僅供參考使用</b><br>${DISCLAIMER}</div><div class=\"card\"><h3>搜尋股票</h3><div class=\"search-row\"><input id=\"forecastSearch\" value=\"${esc(S.forecastQuery)}\" placeholder=\"輸入代號或名稱，例如 3702 大聯大\"><button id=\"forecastSearchBtn\" class=\"btn\">搜尋</button></div>${stockSearchResults(S.forecastQuery,'data-forecast')}</div><div class=\"card\"><h3>優先分析清單</h3><div class=\"rank-list\">${top.map((x,i)=>`<div class=\"rank clickable\" data-forecast=\"${x.symbol}\"><b>${i+1}</b><span><b>${x.name}</b><small class=\"muted\"> ${x.symbol}</small></span><b>${opportunityScore(x)} 分</b></div>`).join('')}</div></div>${disclaimer()}`\n}\n\nfunction predictionStats(){\n  const rows=getPredictions(),evaluated=rows.filter(x=>x.evaluated_at),recent30=evaluated.filter(x=>(Date.now()-new Date(x.prediction_date).getTime())<=30*864e5),recent90=evaluated.filter(x=>(Date.now()-new Date(x.prediction_date).getTime())<=90*864e5);\n  const rate=list=>list.length?list.filter(x=>x.is_correct).length/list.length*100:null;\n  return{rows,evaluated,rate30:rate(recent30),rate90:rate(recent90),pending:rows.filter(x=>!x.evaluated_at).length}\n}\nfunction verifyPage(){\n  const stats=predictionStats(),selected=S.verifySymbol?S.stocks.find(x=>x.symbol===S.verifySymbol):null,cached=selected?[...S.backtestCache.entries()].find(([k])=>k.startsWith(selected.symbol+'-'))?.[1]:null;\n  return`<h2>預測驗證</h2><p class=\"muted\">保存每次預測，五個交易日後比對實際結果；另提供不使用未來資料的技術面走勢回測。</p><div class=\"stat-strip\">${metric('已評估',fmt(stats.evaluated.length,0))}${metric('待評估',fmt(stats.pending,0))}${metric('近 30 日命中率',stats.rate30==null?'尚無樣本':`${fmt(stats.rate30,1)}%`)}${metric('近 90 日命中率',stats.rate90==null?'尚無樣本':`${fmt(stats.rate90,1)}%`)}</div>\n  <div class=\"card\"><h3>選擇股票進行歷史驗證</h3><div class=\"search-row\"><input id=\"verifySearch\" value=\"${esc(S.verifyQuery)}\" placeholder=\"股票代號或名稱\"><button id=\"verifySearchBtn\" class=\"btn\">搜尋</button></div>${stockSearchResults(S.verifyQuery,'data-verify')}</div>\n  ${selected?`<div class=\"card accent\"><div class=\"head\"><div><h3>${selected.name} ${selected.symbol}</h3><div class=\"muted\">技術面走勢回測，每 5 個交易日取樣一次</div></div><button class=\"btn small-btn\" id=\"runBacktest\" data-symbol=\"${selected.symbol}\">${cached?'重新回測':'開始回測'}</button></div>${cached?backtestHtml(cached):'<div class=\"muted\">按下開始回測後，會讀取近 12 個月日線並驗證方向。</div>'}</div>`:''}\n  <div class=\"card\"><h3>最近預測紀錄</h3>${stats.rows.length?`<div class=\"table-wrap\"><table><thead><tr><th>股票／日期</th><th>預測</th><th>信心</th><th>實際</th><th>結果</th></tr></thead><tbody>${stats.rows.slice(0,30).map(x=>`<tr><td>${x.stock_name||x.symbol}<br><small class=\"muted\">${x.prediction_date}</small></td><td>${directionLabel(x.predicted_direction)}</td><td>${fmt(x.confidence,0)}%</td><td>${x.actual_return_pct==null?'待評估':pct(x.actual_return_pct)}</td><td>${x.evaluated_at?(x.is_correct?'<span class=\"tag\">正確</span>':'<span class=\"tag bad\">不符</span>'):'<span class=\"tag info\">等待中</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class=\"empty muted\">尚未產生預測紀錄。開啟任一股票的深度預測後會自動保存。</div>'}</div>\n  <div class=\"notice\">命中率只反映既有樣本，樣本不足或市場狀態改變時，不代表未來仍有相同表現。</div>${disclaimer()}`\n}\nfunction directionLabel(value){return value==='up'?'偏多':value==='down'?'偏空':'震盪'}\nfunction backtestHtml(b){return`<div class=\"grid\" style=\"margin-top:12px\">${metric('回測樣本',fmt(b.count,0))}${metric('方向命中率',b.hitRate==null?'—':`${fmt(b.hitRate,1)}%`)}${metric('樣本平均報酬',pct(b.avgReturn))}${metric('平均獲利／虧損',`${pct(b.avgWin)} / ${pct(b.avgLoss)}`)}</div><div class=\"table-wrap\" style=\"margin-top:10px\"><table><thead><tr><th>日期</th><th>預測</th><th>5 日報酬</th><th>結果</th></tr></thead><tbody>${b.samples.slice(-12).reverse().map(x=>`<tr><td>${x.date}</td><td>${directionLabel(x.pred)}</td><td class=\"${cls(x.ret)}\">${pct(x.ret)}</td><td>${x.correct?'✓':'×'}</td></tr>`).join('')}</tbody></table></div><div class=\"muted small\" style=\"margin-top:8px\">此回測只使用當時之前的價格與成交量，不套用現在的月營收或財報資料，避免偷看未來。</div>`}\n\nfunction journalStats(){const all=getJournal(),closed=all.filter(x=>x.return_pct!=null),wins=closed.filter(x=>x.return_pct>0),followed=all.filter(x=>x.followed_plan!=null);return{all,closed,winRate:closed.length?wins.length/closed.length*100:null,avgReturn:mean(closed.map(x=>x.return_pct)),followRate:followed.length?followed.filter(x=>x.followed_plan).length/followed.length*100:null}}\nfunction minePage(){\n  return`<h2>我的</h2><div class=\"segmented\"><button data-mine=\"watch\" class=\"${S.mineSub==='watch'?'active':''}\">自選清單</button><button data-mine=\"journal\" class=\"${S.mineSub==='journal'?'active':''}\">投資紀錄</button></div>${S.mineSub==='watch'?watchSection():journalSection()}${disclaimer()}`\n}\nfunction watchSection(){\n  const items=getWatchlist();\n  const rows=items.map(item=>({item,stock:S.stocks.find(x=>x.symbol===item.symbol)})).filter(x=>x.stock);\n  if(!rows.length)return '<div class=\"card empty\"><h3>尚未加入自選股票</h3><p class=\"muted\">可在機會股或股票詳細頁加入。</p></div>';\n  return `<div class=\"list two-col\">${rows.map(({item,stock})=>{\n    const gain=item.addedPrice&&stock.close?(stock.close/item.addedPrice-1)*100:null;\n    return `<div class=\"card clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b>${stock.name}</b><div class=\"muted\">${stock.symbol} · ${stock.industry}</div></div><button class=\"icon-btn\" data-watch=\"${stock.symbol}\">移除</button></div><div class=\"grid\">${metric('目前價格',fmt(stock.close))}${metric('加入後漲跌',`<span class=\"${cls(gain)}\">${pct(gain)}</span>`)}${metric('月營收年增',pct(stock.rev))}${metric('機會分數',opportunityScore(stock))}</div><button class=\"btn\" data-forecast=\"${stock.symbol}\" style=\"width:100%;margin-top:10px\">查看趨勢預測</button></div>`;\n  }).join('')}</div>`;\n}\nfunction journalSection(){\n  const stats=journalStats();\n  const header=`<div class=\"stat-strip\">${metric('紀錄筆數',fmt(stats.all.length,0))}${metric('已完成交易',fmt(stats.closed.length,0))}${metric('勝率',stats.winRate==null?'尚無樣本':`${fmt(stats.winRate,1)}%`)}${metric('遵守計畫率',stats.followRate==null?'尚無資料':`${fmt(stats.followRate,1)}%`)}</div><div class=\"row\"><button id=\"newJournal\" class=\"btn grow\">＋新增投資紀錄</button><button id=\"exportJournal\" class=\"btn secondary\">匯出 JSON</button></div>`;\n  if(!stats.all.length)return `${header}<div class=\"card empty\"><h3>尚未建立投資紀錄</h3><p class=\"muted\">記錄當時理由、預期、風險與結果，之後才能檢查自己是否遵守計畫。</p></div>`;\n  return `${header}<div class=\"list\">${stats.all.map(x=>`<div class=\"card journal-item ${x.action}\"><div class=\"head\"><div><b>${x.stock_name||x.symbol} ${x.symbol}</b><div class=\"muted\">${x.entry_date} · ${actionLabel(x.action)} · ${horizonLabel(x.horizon)}</div></div>${x.return_pct!=null?`<b class=\"${cls(x.return_pct)}\">${pct(x.return_pct)}</b>`:''}</div>${x.thesis?`<p>${esc(x.thesis)}</p>`:''}<div class=\"rules\">${x.risk_plan?`<span>風險：${esc(x.risk_plan)}</span>`:''}${x.target_plan?`<span>目標：${esc(x.target_plan)}</span>`:''}${x.followed_plan!=null?`<span>遵守計畫：${x.followed_plan?'是':'否'}</span>`:''}</div><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn secondary\" data-edit-journal=\"${x.local_id||x.id}\">編輯</button><button class=\"btn danger\" data-delete-journal=\"${x.local_id||x.id}\">刪除</button></div></div>`).join('')}</div>`;\n}\nfunction actionLabel(a){return({observe:'觀察',buy:'買入紀錄',sell:'賣出紀錄',review:'事後檢討'})[a]||a}\nfunction horizonLabel(h){return({short:'短線 1–5 日',swing:'波段 1–4 週',medium:'中期 1–6 月',long:'長期 6 月以上'})[h]||'未設定期間'}\n\nfunction sparkline(rows){const values=rows.slice(-60).map(r=>r.close).filter(v=>v!=null);if(values.length<2)return'';const w=600,h=84,min=Math.min(...values),max=Math.max(...values),range=max-min||1;const points=values.map((v,i)=>`${i/(values.length-1)*w},${h-(v-min)/range*(h-8)-4}`).join(' '),area=`0,${h} ${points} ${w},${h}`;return`<svg class=\"sparkline\" viewBox=\"0 0 ${w} ${h}\" preserveAspectRatio=\"none\"><polygon class=\"area\" points=\"${area}\"></polygon><polyline points=\"${points}\"></polyline></svg>`}\nfunction probabilitySection(f){return`<div class=\"prob-grid\"><div class=\"prob-box\"><small class=\"muted\">上漲機率</small><b class=\"up\">${f.up}%</b><div class=\"progress\"><span class=\"bar-up\" style=\"width:${f.up}%\"></span></div></div><div class=\"prob-box\"><small class=\"muted\">震盪機率</small><b class=\"neutral\">${f.neutral}%</b><div class=\"progress\"><span class=\"bar-neutral\" style=\"width:${f.neutral}%\"></span></div></div><div class=\"prob-box\"><small class=\"muted\">下跌機率</small><b class=\"down\">${f.down}%</b><div class=\"progress\"><span class=\"bar-down\" style=\"width:${f.down}%\"></span></div></div></div>`}\nfunction factorSection(f){const rows=[['技術面',f.technical,55],['基本面',f.fundamental,35],['籌碼面',f.chip,20],['估值面',f.valuation,15]];return`<div class=\"factor-list\">${rows.map(([label,value,max])=>`<div class=\"factor\"><span>${label}</span><div class=\"track\"><span style=\"width:${clamp((value+max)/(max*2)*100,0,100)}%\"></span></div><b class=\"${cls(value)}\">${value>0?'+':''}${fmt(value,1)}</b></div>`).join('')}</div>`}\nfunction scenarioHtml(stock,forecast,indicators){return scenarioAnalysis(stock,forecast,indicators).map(s=>`<div class=\"card scenario ${s.type}\"><div class=\"head\"><div><b>${s.title}</b><div class=\"muted\">觸發條件：${s.trigger}</div></div><b>${s.prob}%</b></div><div class=\"price\">${fmt(s.range[0])}～${fmt(s.range[1])}</div><div class=\"muted\">5 個交易日情境區間，非價格保證。</div></div>`).join('')}\nfunction marketIndustryHtml(stock){const env=marketEnvironment(),industry=env.industries.find(x=>x.industry===stock.industry);return`<div class=\"grid\">${metric('大盤環境',env.label)}${metric('多頭家數比',`${fmt(env.breadth,0)}%`)}${metric(`${stock.industry}平均漲跌`,industry?pct(industry.avgChange):reasonDash('同業不足'))}${metric(`${stock.industry}上漲家數`,industry?`${fmt(industry.breadth,0)}%`:reasonDash('同業不足'))}${metric('市場外資合計',`${fmt(env.foreign,0)} 張`)}${metric('產業外資合計',industry?`${fmt(industry.foreign,0)} 張`:reasonDash('同業不足'))}</div>`}\nfunction peerHtml(stock){const peer=peerComparison(stock);return`<div class=\"card\"><div class=\"muted\">比較群組：${stock.industry}，共 ${peer.peerCount} 檔可比較股票</div>${peer.rows.map(r=>`<div class=\"peer-row\"><span>${r.label}</span><div><div class=\"peer-track\"><span style=\"width:${r.percentile??0}%\"></span></div><small class=\"muted\">同業中位數 ${r.median==null?'—':`${fmt(r.median)}${r.suffix}`}</small></div><b>${r.value==null?'—':`${fmt(r.value)}${r.suffix}`}<br><small class=\"muted\">前 ${r.percentile==null?'—':100-r.percentile+1}%</small></b></div>`).join('')}</div>`}\nfunction eventHtml(stock,indicators){const events=buildEvents(stock,indicators);return`<div class=\"card\">${events.map(e=>`<div class=\"event\"><div class=\"event-icon\">${e.icon}</div><div><b>${e.title}</b><div class=\"muted\">${e.detail}</div></div><span class=\"tag ${e.level==='bad'?'bad':e.level==='warn'?'warn':'info'}\">${e.level==='bad'?'風險':e.level==='warn'?'注意':'事件'}</span></div>`).join('')}</div>`}\n\nfunction detailHtml(stock,state){\n  const indicators=state?.indicators||null,history=state?.rows||[],forecast=calculateForecast(stock,indicators);\n  const historyLoading=state?.loading,historyError=state?.error;\n  const isEtf=instrumentGroup(stock)==='etf',notApplicable=reasonDash('ETF 不適用'),revenueAmount=value=>value==null?reasonDash('官方未提供'):`${fmt(value/1000,0)} 百萬元`;\n  const periodLine=isEtf?'ETF 無公司層級月營收與財報指標':`月營收 ${S.fundDates?.revenue?.period||stock.revPeriod||'載入中'} · 財報 ${S.fundDates?.financials?.period||stock.roePeriod||'載入中'}`;\n  const basicMetrics=isEtf?`${metric('商品類型','ETF')}${metric('殖利率',valueOrReason(stock.yield,'%'))}${metric('本益比',notApplicable)}${metric('股價淨值比',notApplicable)}${metric('月營收',notApplicable)}${metric('ROE',notApplicable)}`:`${metric('本益比',valueOrReason(stock.pe))}${metric('股價淨值比',valueOrReason(stock.pb))}${metric('殖利率',valueOrReason(stock.yield,'%'))}${metric('當月營收',revenueAmount(stock.revenue),stock.revPeriod||'')}${metric('上月營收',revenueAmount(stock.revenuePreviousMonth))}${metric('去年同月營收',revenueAmount(stock.revenueLastYearMonth))}${metric('本年累計營收',revenueAmount(stock.revenueYtd))}${metric('去年同期累計',revenueAmount(stock.revenueLastYearYtd))}${metric('月營收年增',stock.rev==null?reasonDash('官方未提供'):pct(stock.rev))}${metric('月營收月增',stock.revMom==null?reasonDash('官方未提供'):pct(stock.revMom))}${metric('累計營收年增',stock.revYtd==null?reasonDash('官方未提供'):pct(stock.revYtd))}${metric('成長加速度',stock.revAcceleration==null?reasonDash('資料不足'):pct(stock.revAcceleration),'單月年增－累計年增')}${metric('EPS',valueOrReason(stock.eps))}${metric(stock.roeEstimated?'年化推估 ROE':'ROE',valueOrReason(stock.roe,'%'),stock.roePeriod||'')}${metric('毛利率',valueOrReason(stock.grossMargin,'%'))}${metric('營業利益率',valueOrReason(stock.operatingMargin,'%'))}${metric('淨利率',valueOrReason(stock.netMargin,'%'))}${metric('負債比',valueOrReason(stock.debt,'%'))}${metric('權益比率',valueOrReason(stock.equityRatio,'%'))}${metric('資料期間',stock.roePeriod||stock.revPeriod||'—')}`;\n  return`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\" type=\"button\">×</button><div class=\"head\"><div><h2>${stock.name} ${stock.symbol}</h2><div class=\"muted\">${stock.market} · ${stock.industry} · 行情 ${S.sourceDates?.price?.[stock.market==='上市'?'twse':'tpex']||S.date}</div></div><button class=\"btn secondary small-btn\" data-watch=\"${stock.symbol}\">${isWatched(stock.symbol)?'★ 已自選':'☆ 加入自選'}</button></div><div><span class=\"price\">${fmt(stock.close)} 元</span> <b class=\"${cls(stock.change)}\">${pct(stock.change)}</b></div><div class=\"notice\"><b>各資料來源日期</b><br>${sourceDateSummary()}。${periodLine}。</div>\n  ${historyLoading?'<div class=\"card\"><div class=\"loading\"><span class=\"spinner\"></span>正在讀取歷史日線並計算技術指標…</div></div>':''}${historyError?`<div class=\"card warn-card\"><b>歷史日線暫時無法取得</b><p class=\"muted\">目前先使用基本面與籌碼進行低信心估計。${esc(historyError)}</p></div>`:''}${history.length?sparkline(history):''}\n  <h3 class=\"section-title\">未來漲跌預測（5 個交易日）</h3><div class=\"card accent\"><div class=\"head\"><div><small class=\"muted\">判斷</small><div class=\"price\">${forecast.shortLabel}</div><div class=\"muted\">中期：${forecast.mediumLabel}</div></div><div><small class=\"muted\">預測信心</small><div class=\"score\">${forecast.confidence}%</div><div class=\"muted\">資料完整度 ${forecast.completeness}%</div></div></div>${probabilitySection(forecast)}<div class=\"grid\" style=\"margin-top:10px\">${metric('5 日合理波動區間',`${fmt(forecast.expectedLow)}～${fmt(forecast.expectedHigh)}`,`推估 ±${fmt(forecast.expectedMove5,1)}%`)}${metric('綜合方向分數',`${forecast.composite>0?'+':''}${forecast.composite}`,'正值偏多、負值偏空')}</div></div><div class=\"notice\"><b>僅供參考使用</b><br>${DISCLAIMER}</div>\n  <h3 class=\"section-title\">三種情境分析</h3>${scenarioHtml(stock,forecast,indicators)}\n  <h3 class=\"section-title\">大盤與產業環境</h3><div class=\"card\">${marketIndustryHtml(stock)}</div>\n  <h3 class=\"section-title\">同業比較</h3>${peerHtml(stock)}\n  <h3 class=\"section-title\">重要事件與風險提醒</h3>${eventHtml(stock,indicators)}\n  <h3 class=\"section-title\">評估構成</h3><div class=\"card\">${factorSection(forecast)}</div><div class=\"card\"><h3>支持因素</h3>${forecast.positive.length?forecast.positive.map(x=>`<span class=\"tag\">${x}</span>`).join(''):'<span class=\"muted\">目前沒有明顯正向訊號</span>'}<h3 style=\"margin-top:14px\">風險因素</h3>${forecast.negative.length?forecast.negative.map(x=>`<span class=\"tag warn\">${x}</span>`).join(''):'<span class=\"muted\">目前沒有明顯負向訊號</span>'}<h3 style=\"margin-top:14px\">資料缺口</h3>${forecast.missing.length?forecast.missing.map(x=>`<span class=\"tag bad\">${x}</span>`).join(''):'<span class=\"tag\">主要資料完整</span>'}</div>\n  <h3 class=\"section-title\">技術面分析</h3><div class=\"grid three\">${metric('MA5',valueOrReason(indicators?.ma5))}${metric('MA20',valueOrReason(indicators?.ma20))}${metric('MA60',valueOrReason(indicators?.ma60))}${metric('RSI 14',valueOrReason(indicators?.rsi14))}${metric('MACD',valueOrReason(indicators?.macd))}${metric('MACD 柱狀體',valueOrReason(indicators?.histogram))}${metric('ATR 14',valueOrReason(indicators?.atr14),indicators?.atrPct!=null?`${fmt(indicators.atrPct)}%`:'')}${metric('量能比 5/20',valueOrReason(indicators?.volumeRatio,' 倍'))}${metric('20 日動能',valueOrReason(indicators?.momentum20,'%'))}${metric('布林上軌',valueOrReason(indicators?.bollingerUpper))}${metric('布林中軌',valueOrReason(indicators?.bollingerMiddle))}${metric('布林下軌',valueOrReason(indicators?.bollingerLower))}${metric('20 日支撐',valueOrReason(indicators?.support))}${metric('20 日壓力',valueOrReason(indicators?.resistance))}${metric('歷史日線筆數',indicators?.rows==null?reasonDash('尚未取得'):fmt(indicators.rows,0))}</div>\n  <h3 class=\"section-title\">${isEtf?'ETF 指標':'基本面與估值'}</h3><div class=\"grid three\">${basicMetrics}</div>${isEtf?'<div class=\"notice\">ETF 是一籃子資產，不適用單一公司的月營收、EPS、ROE、本益比與負債比；排名改看流動性、20／60 日動能、法人、波動風險與殖利率。</div>':stock.roeEstimated?'<div class=\"notice\">ROE 是依最新公開累計淨利與股東權益推算的年化值，並非官方直接公布的單一指標。</div>':''}\n  <h3 class=\"section-title\">籌碼與交易資訊</h3><div class=\"grid three\">${metric('外資買賣超',stock.foreign==null?reasonDash('該資料日無資料'):`${fmt(stock.foreign,0)} 張`)}${metric('投信買賣超',stock.trust==null?reasonDash('該資料日無資料'):`${fmt(stock.trust,0)} 張`)}${metric('自營商買賣超',stock.dealer==null?reasonDash('該資料日無資料'):`${fmt(stock.dealer,0)} 張`)}${metric('三大法人合計',stock.inst==null?reasonDash('該資料日無資料'):`${fmt(stock.inst,0)} 張`)}${metric('融資增減',stock.marginChange==null?reasonDash('官方未提供'):`${fmt(stock.marginChange,0)} 張`)}${metric('融資餘額',stock.marginBalance==null?reasonDash('官方未提供'):`${fmt(stock.marginBalance,0)} 張`)}${metric('融券增減',stock.shortChange==null?reasonDash('官方未提供'):`${fmt(stock.shortChange,0)} 張`)}${metric('融券餘額',stock.shortBalance==null?reasonDash('官方未提供'):`${fmt(stock.shortBalance,0)} 張`)}${metric('成交量',stock.volume==null?reasonDash('API 未回傳'):`${fmt(stock.volume,0)} 張`)}${metric('開盤',valueOrReason(stock.open))}${metric('最高',valueOrReason(stock.high))}${metric('最低',valueOrReason(stock.low))}${metric('成交金額',stock.value==null?reasonDash('API 未回傳'):`${fmt(stock.value/100000000,2)} 億元`)}${metric('成交筆數',stock.transactions==null?reasonDash('API 未回傳'):fmt(stock.transactions,0))}${metric('收盤',valueOrReason(stock.close))}</div>\n  <div class=\"row\" style=\"margin-top:16px\"><button class=\"btn grow\" data-journal-stock=\"${stock.symbol}\">新增投資紀錄</button><button class=\"btn secondary\" data-verify-stock=\"${stock.symbol}\">查看預測驗證</button></div>${disclaimer()}</div></div>`\n}\n\nasync function openDetail(symbol,loadHistory=true){\n  const stock=S.stocks.find(x=>x.symbol===symbol);if(!stock)return;S.detailSymbol=symbol;const cached=S.historyCache.get(symbol),resolved=cached&&!(cached instanceof Promise)?cached:null;\n  modalRoot.innerHTML=detailHtml(stock,resolved?{...resolved,loading:false}:{loading:loadHistory,rows:[]});bindModal();if(!loadHistory&&!cached)return;if(resolved){const f=calculateForecast(stock,resolved.indicators);recordPrediction(stock,f);evaluatePredictionsForSymbol(symbol,resolved.rows);return}\n  try{const result=await getHistory(symbol);if(S.detailSymbol!==symbol)return;modalRoot.innerHTML=detailHtml(stock,{...result,loading:false});bindModal();const f=calculateForecast(stock,result.indicators);recordPrediction(stock,f);evaluatePredictionsForSymbol(symbol,result.rows)}catch(error){if(S.detailSymbol!==symbol)return;modalRoot.innerHTML=detailHtml(stock,{loading:false,error:error.message,rows:[]});bindModal();recordPrediction(stock,calculateForecast(stock,null))}\n}\nfunction closeModal(){S.detailSymbol=null;modalRoot.innerHTML=''}\n\nfunction toggleWatch(symbol){\n  const list=getWatchlist(),index=list.findIndex(x=>x.symbol===symbol);\n  if(index>=0)list.splice(index,1);else{const stock=S.stocks.find(x=>x.symbol===symbol);list.push({symbol,addedPrice:stock?.close??null,addedAt:new Date().toISOString(),note:''})}\n  setWatchlist(list);render();if(S.detailSymbol)openDetail(S.detailSymbol,false)\n}\n\nfunction render(){\n  qa('.bottom-nav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===S.tab));\n  if(S.loading&&!S.stocks.length){app.innerHTML='<div class=\"card empty\"><div class=\"loading\"><span class=\"spinner\"></span>正在載入官方盤後資料…</div></div>';bind();return}\n  app.innerHTML=S.tab==='home'?homePage():S.tab==='opportunities'?opportunitiesPage():S.tab==='forecast'?forecastPage():S.tab==='verify'?verifyPage():minePage();bind()\n}\n\nfunction bind(){\n  qa('.bottom-nav button').forEach(button=>button.onclick=()=>{S.tab=button.dataset.tab;render()});\n  qa('[data-detail]').forEach(element=>element.onclick=event=>{if(!event.target.closest('button'))openDetail(element.dataset.detail)});\n  qa('[data-forecast]').forEach(element=>element.onclick=event=>{event.stopPropagation();openDetail(element.dataset.forecast)});\n  qa('[data-watch]').forEach(button=>button.onclick=event=>{event.stopPropagation();toggleWatch(button.dataset.watch)});\n  const forecastSearch=q('#forecastSearch');if(forecastSearch){forecastSearch.oninput=e=>S.forecastQuery=e.target.value;forecastSearch.onkeydown=e=>{if(e.key==='Enter'){S.forecastQuery=e.target.value;render()}}}\n  q('#forecastSearchBtn')?.addEventListener('click',()=>{S.forecastQuery=q('#forecastSearch')?.value||'';render()});\n  const verifySearch=q('#verifySearch');if(verifySearch){verifySearch.oninput=e=>S.verifyQuery=e.target.value;verifySearch.onkeydown=e=>{if(e.key==='Enter'){S.verifyQuery=e.target.value;render()}}}\n  q('#verifySearchBtn')?.addEventListener('click',()=>{S.verifyQuery=q('#verifySearch')?.value||'';render()});\n  qa('[data-verify]').forEach(button=>button.onclick=()=>{S.verifySymbol=button.dataset.verify;S.verifyQuery='';render()});\n  q('#runBacktest')?.addEventListener('click',async e=>{\n    const symbol=e.currentTarget.dataset.symbol,stock=S.stocks.find(x=>x.symbol===symbol);e.currentTarget.disabled=true;e.currentTarget.textContent='回測中…';\n    try{const history=await getHistory(symbol),result=runTechnicalBacktest(stock,history.rows);evaluatePredictionsForSymbol(symbol,history.rows);render()}catch(error){alert(`回測失敗：${error.message}`);render()}\n  });\n  qa('[data-mine]').forEach(button=>button.onclick=()=>{S.mineSub=button.dataset.mine;render()});\n  q('#newJournal')?.addEventListener('click',()=>openJournalModal());\n  q('#exportJournal')?.addEventListener('click',exportJournal);\n  qa('[data-edit-journal]').forEach(button=>button.onclick=()=>openJournalModal(getJournal().find(x=>String(x.local_id||x.id)===String(button.dataset.editJournal))));\n  qa('[data-delete-journal]').forEach(button=>button.onclick=()=>deleteJournal(button.dataset.deleteJournal));\n}\n\nfunction bindModal(){\n  q('.sheet-close',modalRoot)?.addEventListener('click',closeModal);\n  q('.modal',modalRoot)?.addEventListener('click',e=>{if(e.target.classList.contains('modal'))closeModal()});\n  qa('[data-watch]',modalRoot).forEach(button=>button.onclick=e=>{e.stopPropagation();toggleWatch(button.dataset.watch)});\n  qa('[data-journal-stock]',modalRoot).forEach(button=>button.onclick=()=>{const symbol=button.dataset.journalStock,stock=S.stocks.find(x=>x.symbol===symbol);openJournalModal(null,stock)});\n  qa('[data-verify-stock]',modalRoot).forEach(button=>button.onclick=()=>{S.verifySymbol=button.dataset.verifyStock;S.tab='verify';closeModal();render()});\n}\n\nfunction exportJournal(){\n  const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),journal:getJournal()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`台股智選-投資紀錄-${today()}.json`;a.click();URL.revokeObjectURL(url)\n}\nfunction deleteJournal(id){if(!confirm('確定刪除這筆紀錄？'))return;const list=getJournal().filter(x=>String(x.local_id||x.id)!==String(id));setJournal(list);render()}\n\nfunction openJournalModal(record=null,stock=null){\n  const r=record||{},selected=stock||S.stocks.find(x=>x.symbol===r.symbol),symbol=selected?.symbol||r.symbol||'',name=selected?.name||r.stock_name||'';\n  modalRoot.innerHTML=`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\" type=\"button\">×</button><h2>${record?'編輯':'新增'}投資紀錄</h2><div class=\"form-grid\">\n    <label>股票代號<input id=\"jSymbol\" value=\"${esc(symbol)}\" placeholder=\"例如 2330\"></label>\n    <label>股票名稱<input id=\"jName\" value=\"${esc(name)}\" placeholder=\"例如 台積電\"></label>\n    <label>日期<input id=\"jDate\" type=\"date\" value=\"${esc(r.entry_date||today())}\"></label>\n    <label>類型<select id=\"jAction\"><option value=\"observe\">觀察</option><option value=\"buy\">買入紀錄</option><option value=\"sell\">賣出紀錄</option><option value=\"review\">事後檢討</option></select></label>\n    <label>價格<input id=\"jPrice\" type=\"number\" step=\"0.01\" value=\"${r.price??selected?.close??''}\"></label>\n    <label>數量（股或張，自行統一）<input id=\"jQty\" type=\"number\" step=\"0.01\" value=\"${r.quantity??''}\"></label>\n    <label>預計持有時間<select id=\"jHorizon\"><option value=\"\">未設定</option><option value=\"short\">短線 1–5 日</option><option value=\"swing\">波段 1–4 週</option><option value=\"medium\">中期 1–6 月</option><option value=\"long\">長期 6 月以上</option></select></label>\n    <label>當時情緒<input id=\"jEmotion\" value=\"${esc(r.emotion||'')}\" placeholder=\"冷靜、焦慮、追高…\"></label>\n  </div>\n  <label>判斷理由<textarea id=\"jThesis\" placeholder=\"當時為什麼關注或交易？\">${esc(r.thesis||'')}</textarea></label>\n  <label>風險計畫<textarea id=\"jRisk\" placeholder=\"什麼條件代表判斷失效？\">${esc(r.risk_plan||'')}</textarea></label>\n  <label>目標計畫<textarea id=\"jTarget\" placeholder=\"原先預期的目標或觀察區間\">${esc(r.target_plan||'')}</textarea></label>\n  <div class=\"form-grid\"><label>出場價格<input id=\"jExitPrice\" type=\"number\" step=\"0.01\" value=\"${r.exit_price??''}\"></label><label>出場日期<input id=\"jExitDate\" type=\"date\" value=\"${esc(r.exit_date||'')}\"></label></div>\n  <label>結果檢討<textarea id=\"jResult\" placeholder=\"實際發生什麼？下次要改進什麼？\">${esc(r.result_note||'')}</textarea></label>\n  <label>是否遵守原本計畫<select id=\"jFollow\"><option value=\"\">尚未評估</option><option value=\"true\">有遵守</option><option value=\"false\">未遵守</option></select></label>\n  <button id=\"saveJournal\" class=\"btn\" style=\"width:100%;margin-top:12px\">儲存紀錄</button></div></div>`;\n  q('#jAction',modalRoot).value=r.action||'observe';q('#jHorizon',modalRoot).value=r.horizon||'';q('#jFollow',modalRoot).value=r.followed_plan==null?'':String(r.followed_plan);bindModal();\n  q('#saveJournal',modalRoot).onclick=async()=>{\n    const symbolValue=q('#jSymbol',modalRoot).value.trim(),price=safe(q('#jPrice',modalRoot).value),exitPrice=safe(q('#jExitPrice',modalRoot).value);if(!/^\\d{4}$/.test(symbolValue)){alert('請輸入四碼股票代號');return}\n    const item={...r,local_id:r.local_id||r.id||uid(),symbol:symbolValue,stock_name:q('#jName',modalRoot).value.trim(),entry_date:q('#jDate',modalRoot).value||today(),action:q('#jAction',modalRoot).value,price,quantity:safe(q('#jQty',modalRoot).value),horizon:q('#jHorizon',modalRoot).value||null,emotion:q('#jEmotion',modalRoot).value.trim(),thesis:q('#jThesis',modalRoot).value.trim(),risk_plan:q('#jRisk',modalRoot).value.trim(),target_plan:q('#jTarget',modalRoot).value.trim(),exit_price:exitPrice,exit_date:q('#jExitDate',modalRoot).value||null,result_note:q('#jResult',modalRoot).value.trim(),followed_plan:q('#jFollow',modalRoot).value===''?null:q('#jFollow',modalRoot).value==='true'};\n    item.return_pct=price&&exitPrice?+((exitPrice/price-1)*100).toFixed(2):r.return_pct??null;const list=getJournal(),index=list.findIndex(x=>String(x.local_id||x.id)===String(item.local_id));if(index>=0)list[index]=item;else list.unshift(item);setJournal(list);upsertJournalCloud(item).catch(()=>{});closeModal();S.tab='mine';S.mineSub='journal';render()\n  }\n}\n\nfunction openAccountModal(){\n  if(S.session){modalRoot.innerHTML=`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>雲端帳戶</h2><div class=\"card\"><b>${esc(S.session.user?.email||'已登入')}</b><p class=\"muted\">預測紀錄與投資紀錄會同步至 Supabase。自選清單目前仍保留在此裝置。</p><div class=\"row\"><button id=\"syncCloud\" class=\"btn grow\">立即同步</button><button id=\"logout\" class=\"btn danger\">登出</button></div></div><div class=\"muted\">${esc(S.syncState)}</div></div></div>`;bindModal();q('#syncCloud',modalRoot).onclick=cloudPull;q('#logout',modalRoot).onclick=()=>{storeSession(null);closeModal();render()};return}\n  modalRoot.innerHTML=`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>登入台股智選</h2><p class=\"muted\">登入後同步預測紀錄與投資紀錄。</p><label>電子郵件<input id=\"authEmail\" type=\"email\" autocomplete=\"email\"></label><label>密碼<input id=\"authPass\" type=\"password\" autocomplete=\"current-password\" placeholder=\"至少 6 個字元\"></label><div class=\"row\" style=\"margin-top:12px\"><button id=\"loginBtn\" class=\"btn grow\">登入</button><button id=\"signupBtn\" class=\"btn secondary\">建立帳戶</button></div><div id=\"authMsg\" class=\"muted\" style=\"margin-top:10px\"></div></div></div>`;bindModal();\n  const act=async type=>{const email=q('#authEmail',modalRoot).value.trim(),password=q('#authPass',modalRoot).value,msg=q('#authMsg',modalRoot);if(!email||password.length<6){msg.textContent='請輸入有效電子郵件，密碼至少 6 個字元。';return}msg.textContent='處理中…';try{if(type==='login'){await login(email,password);closeModal();render()}else{const ok=await signup(email,password);msg.textContent=ok?'帳戶已建立並登入':'驗證信已寄出，完成驗證後再登入。'}}catch(e){msg.textContent=e.message}};\n  q('#loginBtn',modalRoot).onclick=()=>act('login');q('#signupBtn',modalRoot).onclick=()=>act('signup')\n}\n\ndocument.querySelector('#accountBtn').onclick=openAccountModal;\nif('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js?v=15.5',{updateViaCache:'none'}).catch(()=>{});\ninitSession();render();loadStocks();\n";
const PATCH="(() => {\n  'use strict';\n  const PATCH_VERSION = 'v15.5';\n  const PREDICTION_KEY = 'twss-predictions-v15';\n  const JOURNAL_KEY = 'twss-journal-v15';\n  const patchState = { verifyQuery: '', mineTab: 'watch', backtestCache: new Map() };\n  const localRead = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };\n  const localWrite = (key, value) => localStorage.setItem(key, JSON.stringify(value));\n  const getPredictionLogs = () => localRead(PREDICTION_KEY, []);\n  const setPredictionLogs = value => localWrite(PREDICTION_KEY, value);\n  const getJournal = () => localRead(JOURNAL_KEY, []);\n  const setJournal = value => localWrite(JOURNAL_KEY, value);\n  const createId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;\n  const escapeText = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[char]));\n  const average = values => { const valid = values.filter(value => value != null && Number.isFinite(value)); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; };\n  const median = values => { const valid = values.filter(value => value != null && Number.isFinite(value)).sort((a, b) => a - b); if (!valid.length) return null; const middle = Math.floor(valid.length / 2); return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2; };\n  const directionFromReturn = value => value > 1.5 ? 'up' : value < -1.5 ? 'down' : 'neutral';\n  const directionFromForecast = value => value.up >= value.down + 12 ? 'up' : value.down >= value.up + 12 ? 'down' : 'neutral';\n  const directionLabel = value => value === 'up' ? '偏多' : value === 'down' ? '偏空' : '震盪';\n\n  function marketEnvironment() {\n    const tradable = S.stocks.filter(stock => stock.change != null);\n    const up = tradable.filter(stock => stock.change > 0).length;\n    const down = tradable.filter(stock => stock.change < 0).length;\n    const flat = tradable.length - up - down;\n    const avgChange = average(tradable.map(stock => stock.change)) || 0;\n    const breadth = tradable.length ? up / tradable.length * 100 : 0;\n    const foreign = S.stocks.reduce((sum, stock) => sum + (stock.foreign || 0), 0);\n    const institutions = S.stocks.reduce((sum, stock) => sum + (stock.inst || 0), 0);\n    const label = breadth >= 60 && avgChange > 0 ? '市場偏多' : breadth <= 40 && avgChange < 0 ? '市場偏空' : '市場震盪';\n    const industries = [...new Set(S.stocks.map(stock => stock.industry).filter(Boolean))].map(industry => {\n      const stocks = S.stocks.filter(stock => stock.industry === industry);\n      const valid = stocks.filter(stock => stock.change != null);\n      return {\n        industry,\n        count: stocks.length,\n        avgChange: average(valid.map(stock => stock.change)) || 0,\n        breadth: valid.length ? valid.filter(stock => stock.change > 0).length / valid.length * 100 : 0,\n        revenueGrowth: average(stocks.map(stock => stock.rev)),\n        foreign: stocks.reduce((sum, stock) => sum + (stock.foreign || 0), 0)\n      };\n    }).filter(row => row.count >= 3).sort((a, b) => (b.avgChange + b.breadth / 100) - (a.avgChange + a.breadth / 100));\n    return { up, down, flat, avgChange, breadth, foreign, institutions, label, industries };\n  }\n\n  function percentile(values, value, higherIsBetter = true) {\n    const valid = values.filter(item => item != null && Number.isFinite(item));\n    if (!valid.length || value == null) return null;\n    const rank = valid.filter(item => higherIsBetter ? item <= value : item >= value).length;\n    return Math.round(rank / valid.length * 100);\n  }\n\n  function peerComparison(stock) {\n    const peers = S.stocks.filter(item => item.industry === stock.industry);\n    const definitions = [\n      ['月營收年增', 'rev', true, '%'], ['ROE', 'roe', true, '%'], ['EPS', 'eps', true, ''],\n      ['本益比', 'pe', false, ' 倍'], ['殖利率', 'yield', true, '%'], ['外資買賣超', 'foreign', true, ' 張']\n    ];\n    return {\n      peerCount: peers.length,\n      rows: definitions.map(([label, key, high, suffix]) => ({\n        label, suffix, value: stock[key], median: median(peers.map(item => item[key])),\n        percentile: percentile(peers.map(item => item[key]), stock[key], high)\n      }))\n    };\n  }\n\n  function nextRevenueWindow() {\n    const now = new Date();\n    const month = new Date(now.getFullYear(), now.getMonth() + 1, 1);\n    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')} 上旬`;\n  }\n\n  function buildEvents(stock, indicators) {\n    const events = [\n      { icon: '▣', title: '下次月營收觀察窗', detail: `預估於 ${nextRevenueWindow()} 前後公布，實際時間以公司公告為準。`, level: 'info' }\n    ];\n    if (Math.abs(stock.change || 0) >= 7) events.push({ icon: '!', title: '單日波動較大', detail: `盤後漲跌幅 ${pct(stock.change)}，短線預測不確定性提高。`, level: 'warn' });\n    if (indicators?.volumeRatio >= 1.5) events.push({ icon: '◫', title: '成交量明顯放大', detail: `近 5 日量能約為 20 日平均的 ${fmt(indicators.volumeRatio, 2)} 倍。`, level: 'warn' });\n    if (indicators?.rsi14 >= 75) events.push({ icon: '▲', title: 'RSI 進入過熱區', detail: `RSI 14 為 ${fmt(indicators.rsi14)}，短線追價風險較高。`, level: 'warn' });\n    if (indicators?.rsi14 <= 30) events.push({ icon: '▼', title: 'RSI 進入超賣區', detail: `RSI 14 為 ${fmt(indicators.rsi14)}，仍需觀察是否止跌。`, level: 'warn' });\n    if (stock.rev != null && stock.rev < 0) events.push({ icon: '↘', title: '月營收年增為負', detail: `最新月營收年增 ${pct(stock.rev)}，成長動能需持續追蹤。`, level: 'bad' });\n    if (stock.debt != null && stock.debt >= 70) events.push({ icon: '!', title: '負債比偏高', detail: `負債比 ${fmt(stock.debt)}%，財務彈性風險較高。`, level: 'bad' });\n    if (stock.foreign != null && stock.foreign < 0) events.push({ icon: '◁', title: '外資當日賣超', detail: `外資買賣超 ${fmt(stock.foreign, 0)} 張。`, level: 'warn' });\n    if (events.length === 1) events.push({ icon: '✓', title: '目前未偵測重大量價警示', detail: '仍應留意公司公告、產業消息及整體市場變化。', level: 'info' });\n    return events;\n  }\n  function scenarioAnalysis(stock, forecast, indicators) {\n    const volatility = forecast.expectedMove5 || 5;\n    const support = indicators?.support || stock.close * (1 - volatility / 100);\n    const resistance = indicators?.resistance || stock.close * (1 + volatility / 100);\n    const optimism = Math.max(10, forecast.up);\n    const pessimism = Math.max(10, forecast.down);\n    const neutralProbability = Math.max(10, 100 - optimism - pessimism);\n    return [\n      { type: 'positive', title: '樂觀情境', probability: optimism, low: Math.max(stock.close, resistance * .99), high: stock.close * (1 + volatility * 1.35 / 100), trigger: '突破壓力且成交量同步增加' },\n      { type: 'neutral', title: '中性情境', probability: neutralProbability, low: stock.close * (1 - volatility * .55 / 100), high: stock.close * (1 + volatility * .55 / 100), trigger: '量能持平，價格維持區間整理' },\n      { type: 'negative', title: '悲觀情境', probability: pessimism, low: stock.close * (1 - volatility * 1.35 / 100), high: Math.min(stock.close, support * 1.01), trigger: '跌破支撐或法人籌碼持續轉弱' }\n    ];\n  }\n\n  function recordPrediction(stock, forecast) {\n    const logs = getPredictionLogs();\n    const date = S.date || new Date().toISOString().slice(0, 10);\n    const exists = logs.some(log => log.symbol === stock.symbol && log.prediction_date === date && log.model_version === PATCH_VERSION);\n    if (exists) return;\n    logs.unshift({\n      local_id: createId(), symbol: stock.symbol, stock_name: stock.name, prediction_date: date,\n      horizon_days: 5, reference_price: stock.close, predicted_direction: directionFromForecast(forecast),\n      up_probability: forecast.up, neutral_probability: forecast.neutral, down_probability: forecast.down,\n      confidence: forecast.confidence, expected_low: forecast.expectedLow, expected_high: forecast.expectedHigh,\n      model_version: PATCH_VERSION, factors: { composite: forecast.composite, technical: forecast.technical, fundamental: forecast.fundamental, chip: forecast.chip, valuation: forecast.valuation },\n      evaluated_at: null, actual_price: null, actual_return_pct: null, actual_direction: null, is_correct: null,\n      created_at: new Date().toISOString()\n    });\n    setPredictionLogs(logs.slice(0, 500));\n  }\n\n  function evaluatePredictions(symbol, history) {\n    const logs = getPredictionLogs();\n    let changed = false;\n    for (const log of logs) {\n      if (log.symbol !== symbol || log.evaluated_at) continue;\n      const index = history.findIndex(row => row.date >= log.prediction_date);\n      if (index < 0 || history.length <= index + 5) continue;\n      const actual = history[index + 5];\n      const returnPct = (actual.close / log.reference_price - 1) * 100;\n      const direction = directionFromReturn(returnPct);\n      Object.assign(log, { evaluated_at: new Date().toISOString(), actual_price: actual.close, actual_return_pct: +returnPct.toFixed(2), actual_direction: direction, is_correct: direction === log.predicted_direction });\n      changed = true;\n    }\n    if (changed) setPredictionLogs(logs);\n  }\n\n  function runTechnicalBacktest(stock, history) {\n    const key = `${stock.symbol}-${history.at(-1)?.date || ''}`;\n    if (patchState.backtestCache.has(key)) return patchState.backtestCache.get(key);\n    const samples = [];\n    for (let index = 80; index < history.length - 5; index += 5) {\n      const past = history.slice(0, index + 1);\n      const indicators = computeIndicators(past);\n      if (!indicators) continue;\n      const snapshot = { ...stock, close: past.at(-1).close, change: null, rev: null, revMom: null, revYtd: null, roe: null, eps: null, pe: null, pb: null, yield: null, debt: null, foreign: null, trust: null, dealer: null, marginChange: null };\n      const forecast = calculateForecast(snapshot, indicators);\n      const predicted = directionFromForecast(forecast);\n      const returnPct = (history[index + 5].close / past.at(-1).close - 1) * 100;\n      const actual = directionFromReturn(returnPct);\n      samples.push({ date: past.at(-1).date, predicted, actual, returnPct: +returnPct.toFixed(2), correct: predicted === actual });\n    }\n    const result = {\n      count: samples.length,\n      hitRate: samples.length ? samples.filter(item => item.correct).length / samples.length * 100 : null,\n      avgReturn: average(samples.map(item => item.returnPct)),\n      avgWin: average(samples.filter(item => item.returnPct > 0).map(item => item.returnPct)),\n      avgLoss: average(samples.filter(item => item.returnPct < 0).map(item => item.returnPct)),\n      samples\n    };\n    patchState.backtestCache.set(key, result);\n    return result;\n  }\n\n  function predictionStats() {\n    const all = getPredictionLogs();\n    const evaluated = all.filter(log => log.evaluated_at);\n    const correct = evaluated.filter(log => log.is_correct);\n    const last30 = evaluated.filter(log => Date.now() - new Date(log.prediction_date).getTime() <= 30 * 86400000);\n    const last90 = evaluated.filter(log => Date.now() - new Date(log.prediction_date).getTime() <= 90 * 86400000);\n    const accuracy = rows => rows.length ? rows.filter(row => row.is_correct).length / rows.length * 100 : null;\n    return { all, evaluated, accuracy: accuracy(evaluated), accuracy30: accuracy(last30), accuracy90: accuracy(last90), correct: correct.length };\n  }\n\n  function scenarioHtml(stock, forecast, indicators) {\n    return scenarioAnalysis(stock, forecast, indicators).map(item => `<div class=\"card patch-scenario ${item.type}\"><div class=\"head\"><div><b>${item.title}</b><div class=\"muted\">觸發條件：${item.trigger}</div></div><b>${item.probability}%</b></div><div class=\"price\">${fmt(item.low)}～${fmt(item.high)}</div><div class=\"muted\">5 個交易日情境區間，非價格保證。</div></div>`).join('');\n  }\n\n  function peerHtml(stock) {\n    const peer = peerComparison(stock);\n    return `<div class=\"card\"><div class=\"muted\">比較群組：${stock.industry}，共 ${peer.peerCount} 檔</div>${peer.rows.map(row => `<div class=\"patch-peer\"><span>${row.label}</span><div><div class=\"patch-track\"><span style=\"width:${row.percentile || 0}%\"></span></div><small class=\"muted\">同業中位數 ${row.median == null ? '—' : `${fmt(row.median)}${row.suffix}`}</small></div><b>${row.value == null ? '—' : `${fmt(row.value)}${row.suffix}`}<br><small class=\"muted\">百分位 ${row.percentile == null ? '—' : row.percentile}</small></b></div>`).join('')}</div>`;\n  }\n\n  function marketIndustryHtml(stock) {\n    const environment = marketEnvironment();\n    const industry = environment.industries.find(item => item.industry === stock.industry);\n    return `<div class=\"grid\">${metric('大盤環境', environment.label)}${metric('上漲家數比', `${fmt(environment.breadth, 0)}%`)}${metric(`${stock.industry}平均漲跌`, industry ? pct(industry.avgChange) : reasonDash('同業不足'))}${metric(`${stock.industry}上漲家數`, industry ? `${fmt(industry.breadth, 0)}%` : reasonDash('同業不足'))}${metric('市場外資合計', `${fmt(environment.foreign, 0)} 張`)}${metric('產業外資合計', industry ? `${fmt(industry.foreign, 0)} 張` : reasonDash('同業不足'))}</div>`;\n  }\n\n  function eventHtml(stock, indicators) {\n    return `<div class=\"card\">${buildEvents(stock, indicators).map(event => `<div class=\"patch-event\"><div class=\"patch-event-icon\">${event.icon}</div><div><b>${event.title}</b><div class=\"muted\">${event.detail}</div></div><span class=\"tag ${event.level === 'bad' ? 'bad' : event.level === 'warn' ? 'warn' : 'info'}\">${event.level === 'bad' ? '風險' : event.level === 'warn' ? '注意' : '事件'}</span></div>`).join('')}</div>`;\n  }\n  function verifyPage() {\n    const stats = predictionStats();\n    const query = patchState.verifyQuery.trim().toLowerCase();\n    const matches = query ? S.stocks.filter(stock => stock.symbol.includes(query) || stock.name.toLowerCase().includes(query)).slice(0, 10) : [];\n    const rows = stats.all.filter(log => !query || log.symbol.includes(query) || String(log.stock_name || '').toLowerCase().includes(query));\n    return `<h2>預測驗證</h2><p class=\"muted\">系統會保存每次預測，五個交易日後比對實際收盤價。歷史回測只使用當時以前的價量資料。</p>\n      <div class=\"grid\">${metric('已保存預測', fmt(stats.all.length, 0))}${metric('已完成驗證', fmt(stats.evaluated.length, 0))}${metric('整體命中率', stats.accuracy == null ? '尚無樣本' : `${fmt(stats.accuracy, 1)}%`)}${metric('近 90 日命中率', stats.accuracy90 == null ? '尚無樣本' : `${fmt(stats.accuracy90, 1)}%`)}</div>\n      <div class=\"card\"><h3>查詢個股回測</h3><div class=\"search-row\"><input id=\"patchVerifySearch\" value=\"${escapeText(patchState.verifyQuery)}\" placeholder=\"輸入代號或名稱\"><button id=\"patchVerifyButton\" class=\"btn\">查詢</button></div>${matches.length ? `<div class=\"search-results\">${matches.map(stock => `<button class=\"search-result\" data-patch-backtest=\"${stock.symbol}\"><span><b>${stock.name}</b><small class=\"muted\"> ${stock.symbol}</small></span><span>執行回測</span></button>`).join('')}</div>` : ''}</div>\n      <div class=\"card\"><h3>預測紀錄</h3>${rows.length ? `<div class=\"table-wrap\"><table><thead><tr><th>日期</th><th>股票</th><th>預測</th><th>機率</th><th>實際</th><th>結果</th></tr></thead><tbody>${rows.slice(0, 80).map(log => `<tr><td>${log.prediction_date}</td><td>${log.stock_name || log.symbol}</td><td>${directionLabel(log.predicted_direction)}</td><td>${fmt(log.up_probability, 0)}/${fmt(log.neutral_probability, 0)}/${fmt(log.down_probability, 0)}</td><td class=\"${cls(log.actual_return_pct)}\">${log.actual_return_pct == null ? '待驗證' : pct(log.actual_return_pct)}</td><td>${log.is_correct == null ? '—' : log.is_correct ? '✓' : '×'}</td></tr>`).join('')}</tbody></table></div>` : '<div class=\"empty muted\">開啟任何股票的趨勢預測後，就會開始累積紀錄。</div>'}</div>${disclaimer()}`;\n  }\n\n  function backtestHtml(result) {\n    return `<div class=\"grid\">${metric('回測樣本', fmt(result.count, 0))}${metric('方向命中率', result.hitRate == null ? '—' : `${fmt(result.hitRate, 1)}%`)}${metric('樣本平均報酬', pct(result.avgReturn))}${metric('平均獲利／虧損', `${pct(result.avgWin)} / ${pct(result.avgLoss)}`)}</div><div class=\"table-wrap\" style=\"margin-top:10px\"><table><thead><tr><th>日期</th><th>預測</th><th>5 日報酬</th><th>結果</th></tr></thead><tbody>${result.samples.slice(-15).reverse().map(item => `<tr><td>${item.date}</td><td>${directionLabel(item.predicted)}</td><td class=\"${cls(item.returnPct)}\">${pct(item.returnPct)}</td><td>${item.correct ? '✓' : '×'}</td></tr>`).join('')}</tbody></table></div><div class=\"muted small\" style=\"margin-top:8px\">回測不套用目前的營收、財報或法人資料，避免偷看未來；因此結果和當下完整模型不完全相同。</div>`;\n  }\n\n  function journalStats() {\n    const all = getJournal();\n    const closed = all.filter(item => item.return_pct != null);\n    const wins = closed.filter(item => item.return_pct > 0);\n    const followed = all.filter(item => item.followed_plan != null);\n    return {\n      all, closed,\n      winRate: closed.length ? wins.length / closed.length * 100 : null,\n      averageReturn: average(closed.map(item => item.return_pct)),\n      followRate: followed.length ? followed.filter(item => item.followed_plan).length / followed.length * 100 : null\n    };\n  }\n\n  function watchSection() {\n    const items = getWatchlist();\n    const rows = items.map(item => ({ item, stock: S.stocks.find(stock => stock.symbol === item.symbol) })).filter(row => row.stock);\n    if (!rows.length) return '<div class=\"card empty\"><h3>尚未加入自選股票</h3><p class=\"muted\">可在機會股或股票詳細頁加入。</p></div>';\n    return `<div class=\"list two-col\">${rows.map(({ item, stock }) => { const gain = item.addedPrice && stock.close ? (stock.close / item.addedPrice - 1) * 100 : null; const etf = instrumentGroup(stock) === 'etf'; return `<div class=\"card clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b>${stock.name}</b><div class=\"muted\">${stock.symbol} · ${stock.industry}</div></div><button class=\"icon-btn\" data-watch=\"${stock.symbol}\">移除</button></div><div class=\"grid\">${metric('目前價格', fmt(stock.close))}${metric('加入後漲跌', `<span class=\"${cls(gain)}\">${pct(gain)}</span>`)}${metric(etf ? '商品類型' : '月營收年增', etf ? 'ETF' : pct(stock.rev))}${metric(etf ? '成交量' : '機會分數', etf ? `${fmt(stock.volume, 0)} 張` : opportunityScore(stock))}</div><button class=\"btn\" data-forecast=\"${stock.symbol}\" style=\"width:100%;margin-top:10px\">查看趨勢預測</button></div>`; }).join('')}</div>`;\n  }\n\n  function actionLabel(value) { return ({ observe: '觀察', buy: '買入紀錄', sell: '賣出紀錄', review: '事後檢討' })[value] || value; }\n  function horizonLabel(value) { return ({ short: '短線 1–5 日', swing: '波段 1–4 週', medium: '中期 1–6 月', long: '長期 6 月以上' })[value] || '未設定期間'; }\n  function journalSection() {\n    const stats = journalStats();\n    const header = `<div class=\"grid\">${metric('紀錄筆數', fmt(stats.all.length, 0))}${metric('已完成交易', fmt(stats.closed.length, 0))}${metric('勝率', stats.winRate == null ? '尚無樣本' : `${fmt(stats.winRate, 1)}%`)}${metric('遵守計畫率', stats.followRate == null ? '尚無資料' : `${fmt(stats.followRate, 1)}%`)}</div><div class=\"row\" style=\"margin-top:10px\"><button id=\"patchNewJournal\" class=\"btn grow\">＋新增投資紀錄</button><button id=\"patchExportJournal\" class=\"btn secondary\">匯出</button></div>`;\n    if (!stats.all.length) return `${header}<div class=\"card empty\"><h3>尚未建立投資紀錄</h3><p class=\"muted\">記錄當時理由、風險與結果，之後才能檢查自己是否遵守計畫。</p></div>`;\n    return `${header}<div class=\"list\">${stats.all.map(item => `<div class=\"card patch-journal\"><div class=\"head\"><div><b>${item.stock_name || item.symbol} ${item.symbol}</b><div class=\"muted\">${item.entry_date} · ${actionLabel(item.action)} · ${horizonLabel(item.horizon)}</div></div>${item.return_pct != null ? `<b class=\"${cls(item.return_pct)}\">${pct(item.return_pct)}</b>` : ''}</div>${item.thesis ? `<p>${escapeText(item.thesis)}</p>` : ''}<div class=\"rules\">${item.risk_plan ? `<span>風險：${escapeText(item.risk_plan)}</span>` : ''}${item.target_plan ? `<span>目標：${escapeText(item.target_plan)}</span>` : ''}${item.followed_plan != null ? `<span>遵守計畫：${item.followed_plan ? '是' : '否'}</span>` : ''}</div><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn secondary\" data-patch-edit=\"${item.local_id}\">編輯</button><button class=\"btn danger\" data-patch-delete=\"${item.local_id}\">刪除</button></div></div>`).join('')}</div>`;\n  }\n\n  function minePage() {\n    return `<h2>我的</h2><div class=\"patch-tabs\"><button data-patch-mine=\"watch\" class=\"${patchState.mineTab === 'watch' ? 'active' : ''}\">自選清單</button><button data-patch-mine=\"journal\" class=\"${patchState.mineTab === 'journal' ? 'active' : ''}\">投資紀錄</button></div>${patchState.mineTab === 'watch' ? watchSection() : journalSection()}${disclaimer()}`;\n  }\n  function openJournalModal(record = null, stock = null) {\n    const item = record || { local_id: createId(), symbol: stock?.symbol || '', stock_name: stock?.name || '', entry_date: new Date().toISOString().slice(0, 10), action: 'observe', price: stock?.close ?? null, quantity: null, horizon: 'swing', thesis: '', risk_plan: '', target_plan: '', emotion: '', followed_plan: null, exit_price: null, exit_date: '', return_pct: null, result_note: '' };\n    modalRoot.innerHTML = `<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>${record ? '編輯' : '新增'}投資紀錄</h2><div class=\"grid\"><label class=\"muted\">股票代號<input id=\"journalSymbol\" value=\"${escapeText(item.symbol)}\"></label><label class=\"muted\">股票名稱<input id=\"journalName\" value=\"${escapeText(item.stock_name || '')}\"></label><label class=\"muted\">日期<input id=\"journalDate\" type=\"date\" value=\"${item.entry_date}\"></label><label class=\"muted\">類型<select id=\"journalAction\"><option value=\"observe\">觀察</option><option value=\"buy\">買入紀錄</option><option value=\"sell\">賣出紀錄</option><option value=\"review\">事後檢討</option></select></label><label class=\"muted\">價格<input id=\"journalPrice\" type=\"number\" step=\"0.01\" value=\"${item.price ?? ''}\"></label><label class=\"muted\">數量／張數<input id=\"journalQuantity\" type=\"number\" step=\"0.001\" value=\"${item.quantity ?? ''}\"></label><label class=\"muted\">預計期間<select id=\"journalHorizon\"><option value=\"short\">短線 1–5 日</option><option value=\"swing\">波段 1–4 週</option><option value=\"medium\">中期 1–6 月</option><option value=\"long\">長期 6 月以上</option></select></label><label class=\"muted\">當時情緒<input id=\"journalEmotion\" value=\"${escapeText(item.emotion || '')}\" placeholder=\"例如：冷靜、害怕錯過\"></label></div><label class=\"muted\">決策理由<textarea id=\"journalThesis\">${escapeText(item.thesis || '')}</textarea></label><label class=\"muted\">風險計畫<textarea id=\"journalRisk\">${escapeText(item.risk_plan || '')}</textarea></label><label class=\"muted\">目標計畫<textarea id=\"journalTarget\">${escapeText(item.target_plan || '')}</textarea></label><div class=\"grid\"><label class=\"muted\">出場價格<input id=\"journalExitPrice\" type=\"number\" step=\"0.01\" value=\"${item.exit_price ?? ''}\"></label><label class=\"muted\">出場日期<input id=\"journalExitDate\" type=\"date\" value=\"${item.exit_date || ''}\"></label></div><label class=\"muted\">事後檢討<textarea id=\"journalResult\">${escapeText(item.result_note || '')}</textarea></label><label class=\"muted\"><input id=\"journalFollowed\" type=\"checkbox\" style=\"width:auto\" ${item.followed_plan ? 'checked' : ''}> 有遵守原本計畫</label><button id=\"journalSave\" class=\"btn\" style=\"width:100%;margin-top:12px\">儲存紀錄</button></div></div>`;\n    q('#journalAction').value = item.action || 'observe';\n    q('#journalHorizon').value = item.horizon || 'swing';\n    q('.sheet-close', modalRoot).onclick = closeModal;\n    q('#journalSave').onclick = () => {\n      const price = Number(q('#journalPrice').value) || null;\n      const exitPrice = Number(q('#journalExitPrice').value) || null;\n      const saved = {\n        ...item,\n        symbol: q('#journalSymbol').value.trim(), stock_name: q('#journalName').value.trim(), entry_date: q('#journalDate').value,\n        action: q('#journalAction').value, price, quantity: Number(q('#journalQuantity').value) || null, horizon: q('#journalHorizon').value,\n        emotion: q('#journalEmotion').value.trim(), thesis: q('#journalThesis').value.trim(), risk_plan: q('#journalRisk').value.trim(), target_plan: q('#journalTarget').value.trim(),\n        exit_price: exitPrice, exit_date: q('#journalExitDate').value || '', result_note: q('#journalResult').value.trim(), followed_plan: q('#journalFollowed').checked,\n        return_pct: price && exitPrice ? +((exitPrice / price - 1) * 100).toFixed(2) : null, updated_at: new Date().toISOString()\n      };\n      if (!saved.symbol) { alert('請輸入股票代號'); return; }\n      const list = getJournal();\n      const index = list.findIndex(row => row.local_id === saved.local_id);\n      if (index >= 0) list[index] = saved; else list.unshift(saved);\n      setJournal(list); closeModal(); patchState.mineTab = 'journal'; S.tab = 'mine'; render();\n    };\n  }\n\n  function bindPatch() {\n    q('#patchVerifySearch')?.addEventListener('input', event => { patchState.verifyQuery = event.target.value; });\n    q('#patchVerifyButton')?.addEventListener('click', () => { patchState.verifyQuery = q('#patchVerifySearch')?.value || ''; render(); });\n    qa('[data-patch-backtest]').forEach(button => button.onclick = async () => {\n      const symbol = button.dataset.patchBacktest;\n      const stock = S.stocks.find(item => item.symbol === symbol);\n      modalRoot.innerHTML = '<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>歷史回測</h2><div class=\"loading\"><span class=\"spinner\"></span>正在讀取歷史資料並回測…</div></div></div>';\n      q('.sheet-close', modalRoot).onclick = closeModal;\n      try {\n        const history = await getHistory(symbol);\n        evaluatePredictions(symbol, history.rows);\n        const result = runTechnicalBacktest(stock, history.rows);\n        modalRoot.innerHTML = `<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>${stock.name} ${symbol} 回測</h2>${backtestHtml(result)}<div class=\"notice\"><b>回測限制</b><br>歷史表現不代表未來結果，樣本數過少時不應視為可靠依據。</div></div></div>`;\n        q('.sheet-close', modalRoot).onclick = closeModal;\n      } catch (error) {\n        modalRoot.innerHTML = `<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>回測失敗</h2><div class=\"notice\">${escapeText(error.message)}</div></div></div>`;\n        q('.sheet-close', modalRoot).onclick = closeModal;\n      }\n    });\n    qa('[data-patch-mine]').forEach(button => button.onclick = () => { patchState.mineTab = button.dataset.patchMine; render(); });\n    q('#patchNewJournal')?.addEventListener('click', () => openJournalModal());\n    q('#patchExportJournal')?.addEventListener('click', () => {\n      const blob = new Blob([JSON.stringify(getJournal(), null, 2)], { type: 'application/json' });\n      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `台股智選-投資紀錄-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);\n    });\n    qa('[data-patch-edit]').forEach(button => button.onclick = () => openJournalModal(getJournal().find(item => item.local_id === button.dataset.patchEdit)));\n    qa('[data-patch-delete]').forEach(button => button.onclick = () => { if (!confirm('確定刪除這筆紀錄？')) return; setJournal(getJournal().filter(item => item.local_id !== button.dataset.patchDelete)); render(); });\n    qa('[data-patch-journal-stock]').forEach(button => button.onclick = () => openJournalModal(null, S.stocks.find(stock => stock.symbol === button.dataset.patchJournalStock)));\n    qa('[data-patch-verify-stock]').forEach(button => button.onclick = () => { closeModal(); patchState.verifyQuery = button.dataset.patchVerifyStock; S.tab = 'verify'; render(); });\n  }\n\n  const originalOpenDetail = openDetail;\n  openDetail = async function patchedOpenDetail(symbol, loadHistory = true) {\n    await originalOpenDetail(symbol, loadHistory);\n    const stock = S.stocks.find(item => item.symbol === symbol);\n    if (!stock) return;\n    try {\n      const history = await getHistory(symbol);\n      const forecast = calculateForecast(stock, history.indicators);\n      recordPrediction(stock, forecast);\n      evaluatePredictions(symbol, history.rows);\n    } catch {\n      recordPrediction(stock, calculateForecast(stock, null));\n    }\n  };\n\n  const originalBind = bind;\n  bind = function patchedBind() { originalBind(); bindPatch(); };\n  const originalRender = render;\n  render = function patchedRender() {\n    qa('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.tab === S.tab));\n    if (S.tab === 'verify') { app.innerHTML = verifyPage(); bind(); return; }\n    if (S.tab === 'mine') { app.innerHTML = minePage(); bind(); return; }\n    originalRender();\n  };\n\n  function updateNavigation() {\n    const nav = q('.bottom-nav');\n    if (!nav) return;\n    const watchButton = q('[data-tab=\"watch\"]', nav);\n    if (watchButton) { watchButton.dataset.tab = 'mine'; watchButton.innerHTML = '<span>◎</span>我的'; }\n    if (!q('[data-tab=\"verify\"]', nav)) {\n      const verifyButton = document.createElement('button');\n      verifyButton.type = 'button'; verifyButton.dataset.tab = 'verify'; verifyButton.innerHTML = '<span>✓</span>預測驗證';\n      nav.insertBefore(verifyButton, watchButton);\n    }\n  }\n\n  updateNavigation();\n  render();\n})();\n";
const SMART="(() => {\n  'use strict';\n\n  const VERSION = 'v15.5';\n  const SIGNAL_KEY = 'twss-smart-history-signals-v15.5';\n  const SIGNAL_TTL = 12 * 60 * 60 * 1000;\n  const groupLabels = { listed: '上市股票', otc: '上櫃股票', etf: 'ETF' };\n  const labels = {\n    balanced: '綜合型', value: '價值型', growth: '成長型',\n    dividend: '高股息', momentum: '動能型'\n  };\n  const notes = {\n    balanced: '依各組適用因子平均判斷，缺資料不會自動得到預設分。',\n    value: '偏重同組及同產業中的估值、殖利率與財務品質。',\n    growth: '偏重月營收年增、累計年增、成長加速度與財務品質。',\n    dividend: '偏重殖利率、估值與流動性；ETF 不使用公司基本面。',\n    momentum: '偏重 20／60 日趨勢、法人流向、成交量與相對強弱。'\n  };\n  const baseWeights = {\n    listed: { revenue: 25, quality: 20, valuation: 15, chip: 15, momentum: 15, liquidity: 10 },\n    otc: { revenue: 30, quality: 20, liquidity: 20, momentum: 15, valuation: 10, chip: 5 },\n    etf: { liquidity: 35, momentum: 30, chip: 15, risk: 10, dividend: 10 }\n  };\n  const factorLabels = { revenue: '營收', quality: '品質', valuation: '估值', chip: '法人', momentum: '動能', liquidity: '流動性', risk: '低波動', dividend: '殖利率' };\n  const strategyBoost = {\n    balanced: {},\n    value: { valuation: 1.65, quality: 1.2, dividend: 1.25, momentum: .7, revenue: .75 },\n    growth: { revenue: 1.55, quality: 1.2, momentum: 1.1, valuation: .65, dividend: .65 },\n    dividend: { dividend: 1.8, valuation: 1.2, quality: 1.1, liquidity: 1.1, momentum: .75, revenue: .75 },\n    momentum: { momentum: 1.8, chip: 1.35, liquidity: 1.2, quality: .65, valuation: .65, revenue: .8 }\n  };\n  const groupFloorVolume = { listed: 300, otc: 100, etf: 500 };\n  const defaults = {\n    group: 'listed', strategy: 'balanced', industry: '全部產業',\n    minPrice: '', maxPrice: '', maxPe: '35', minYield: '',\n    minRev: '', minRoe: '', minVolume: '300', complete: false\n  };\n\n  let draft = { ...defaults };\n  let applied = { ...defaults };\n  const historyQueue = [];\n  const historyAttempted = new Set();\n  let historyRunning = false;\n\n  const n = value => value === '' || value == null ? null : Number(value);\n  const cap = value => clamp(Math.round(value), 0, 100);\n  const finite = value => value != null && Number.isFinite(Number(value));\n  const logValue = value => finite(value) && Number(value) > 0 ? Math.log10(Number(value)) : null;\n\n  function stockGroup(stock) {\n    if (stock.instrumentType === 'ETF' || /^00\\d{2,4}$/.test(stock.symbol)) return 'etf';\n    return stock.market === '上櫃' ? 'otc' : 'listed';\n  }\n\n  function validForGroup(stock, group) {\n    if (group === 'etf') return /^00\\d{2,4}$/.test(stock.symbol);\n    return /^[1-9]\\d{3}$/.test(stock.symbol) && stockGroup(stock) === group;\n  }\n\n  function historySignal(stock) {\n    return S.historySignals.get(stock.symbol) || null;\n  }\n\n  function metricValue(stock, key) {\n    const signal = historySignal(stock);\n    const instRatio = finite(stock.inst) && finite(stock.volume) && stock.volume > 0\n      ? stock.inst / stock.volume * 100 : null;\n    const amplitude = finite(stock.high) && finite(stock.low) && finite(stock.close) && stock.close > 0\n      ? (stock.high - stock.low) / stock.close * 100 : null;\n    const closePosition = finite(stock.high) && finite(stock.low) && stock.high > stock.low && finite(stock.close)\n      ? (stock.close - stock.low) / (stock.high - stock.low) * 100 : null;\n    return {\n      rev: stock.rev, revYtd: stock.revYtd, revMom: stock.revMom,\n      revAcceleration: stock.revAcceleration,\n      roe: stock.roe, eps: stock.eps, grossMargin: stock.grossMargin,\n      operatingMargin: stock.operatingMargin, debt: stock.debt,\n      pe: stock.pe > 0 ? stock.pe : null, pb: stock.pb > 0 ? stock.pb : null,\n      yield: stock.yield, instRatio, foreign: stock.foreign,\n      change: stock.change, closePosition,\n      volumeLog: logValue(stock.volume), valueLog: logValue(stock.value),\n      return20: signal?.return20, return60: signal?.return60,\n      volumeRatio: signal?.volumeRatio, atrPct: signal?.atrPct,\n      amplitude\n    }[key];\n  }\n\n  function makeContext(rows) {\n    const keys = [\n      'rev', 'revYtd', 'revMom', 'revAcceleration', 'roe', 'eps', 'grossMargin',\n      'operatingMargin', 'debt', 'pe', 'pb', 'yield', 'instRatio', 'foreign',\n      'change', 'closePosition', 'volumeLog', 'valueLog', 'return20', 'return60',\n      'volumeRatio', 'atrPct', 'amplitude'\n    ];\n    return Object.fromEntries(keys.map(key => [key, rows.map(stock => metricValue(stock, key)).filter(finite)]));\n  }\n\n  function percentile(values, value, higher = true) {\n    if (!finite(value) || !values.length) return null;\n    const rank = values.filter(item => higher ? item <= value : item >= value).length;\n    return cap(rank / values.length * 100);\n  }\n\n  function subScore(ctx, stock, definitions) {\n    let score = 0, available = 0, total = 0;\n    definitions.forEach(([key, weight, higher = true]) => {\n      total += weight;\n      const value = metricValue(stock, key);\n      const ranked = percentile(ctx[key] || [], value, higher);\n      if (ranked == null) return;\n      score += ranked * weight;\n      available += weight;\n    });\n    return available ? { score: score / available, coverage: available / total } : null;\n  }\n\n  function factors(stock, ctx, group) {\n    const common = {\n      revenue: subScore(ctx, stock, [\n        ['rev', .42], ['revYtd', .28], ['revMom', .15], ['revAcceleration', .15]\n      ]),\n      quality: subScore(ctx, stock, [\n        ['roe', .34], ['eps', .14], ['grossMargin', .17],\n        ['operatingMargin', .18], ['debt', .17, false]\n      ]),\n      valuation: subScore(ctx, stock, [\n        ['pe', .42, false], ['pb', .28, false], ['yield', .30]\n      ]),\n      chip: subScore(ctx, stock, [['instRatio', .7], ['foreign', .3]]),\n      momentum: subScore(ctx, stock, [\n        ['return20', .32], ['return60', .28], ['volumeRatio', .15],\n        ['change', .15], ['closePosition', .10]\n      ]),\n      liquidity: subScore(ctx, stock, [['volumeLog', .55], ['valueLog', .45]]),\n      risk: subScore(ctx, stock, [['atrPct', .65, false], ['amplitude', .35, false]]),\n      dividend: subScore(ctx, stock, [['yield', 1]])\n    };\n    if (group === 'etf') return {\n      liquidity: common.liquidity, momentum: common.momentum,\n      chip: common.chip, risk: common.risk, dividend: common.dividend\n    };\n    return common;\n  }\n\n  function scoreStock(stock, ctx, group, strategy) {\n    const values = factors(stock, ctx, group);\n    const boosts = strategyBoost[strategy] || {};\n    let weighted = 0, availableWeight = 0, totalWeight = 0, factorCoverage = 0;\n    Object.entries(baseWeights[group]).forEach(([key, base]) => {\n      const weight = base * (boosts[key] || 1);\n      totalWeight += weight;\n      if (!values[key]) return;\n      weighted += values[key].score * weight;\n      availableWeight += weight;\n      factorCoverage += values[key].coverage * weight;\n    });\n    if (!availableWeight) return { score: 0, confidence: 0, factors: values };\n    const completeness = factorCoverage / totalWeight;\n    let result = weighted / availableWeight * (.62 + completeness * .38);\n    if (stock.disp === true) result -= 12;\n    if (stock.full === true) result -= 18;\n    if (group === 'otc' && metricValue(stock, 'amplitude') > 8) result -= 4;\n    return { score: cap(result), confidence: cap(completeness * 100), factors: values };\n  }\n\n  function reasons(stock, group) {\n    const out = [];\n    const signal = historySignal(stock);\n    if (group === 'etf') {\n      if (signal?.return20 != null) out.push(`20日 ${pct(signal.return20)}`);\n      if ((stock.volume || 0) >= 5000) out.push('成交量充足');\n      if (stock.inst > 0) out.push('法人買超');\n      if (stock.yield >= 4) out.push(`殖利率 ${fmt(stock.yield)}%`);\n    } else {\n      if (stock.rev >= 10) out.push(`營收年增 ${pct(stock.rev)}`);\n      if (stock.revAcceleration >= 5) out.push(`成長加速 ${pct(stock.revAcceleration)}`);\n      if (stock.roe >= 10) out.push(`ROE ${fmt(stock.roe)}%`);\n      if (stock.pe > 0 && stock.pe <= 15) out.push(`本益比 ${fmt(stock.pe)}`);\n      if (stock.inst > 0) out.push('法人買超');\n      if (signal?.return20 > 0) out.push(`20日動能 ${pct(signal.return20)}`);\n    }\n    if (!out.length) out.push('同組多因子表現較均衡');\n    return out.slice(0, 4);\n  }\n\n  function matches(stock, filters, group) {\n    if (!validForGroup(stock, group) || stock.close == null) return false;\n    if (group !== 'etf' && filters.industry !== '全部產業' && stock.industry !== filters.industry) return false;\n    if (n(filters.minPrice) != null && stock.close < n(filters.minPrice)) return false;\n    if (n(filters.maxPrice) != null && stock.close > n(filters.maxPrice)) return false;\n    const floor = Math.max(groupFloorVolume[group], n(filters.minVolume) || 0);\n    if (!finite(stock.volume) || stock.volume < floor) return false;\n    if (group !== 'etf') {\n      if (n(filters.maxPe) != null && finite(stock.pe) && stock.pe > 0 && stock.pe > n(filters.maxPe)) return false;\n      if (n(filters.minRev) != null && (!finite(stock.rev) || stock.rev < n(filters.minRev))) return false;\n      if (n(filters.minRoe) != null && (!finite(stock.roe) || stock.roe < n(filters.minRoe))) return false;\n    }\n    if (n(filters.minYield) != null && (!finite(stock.yield) || stock.yield < n(filters.minYield))) return false;\n    if (filters.complete) {\n      const required = group === 'etf'\n        ? [stock.volume, stock.change, historySignal(stock)?.return20]\n        : [stock.rev, stock.roe ?? stock.eps, stock.pe ?? stock.pb, stock.volume];\n      if (required.some(value => !finite(value))) return false;\n    }\n    return stock.disp !== true && stock.full !== true;\n  }\n\n  function diversify(items, group, limit = 30) {\n    if (group === 'etf') return items.slice(0, limit);\n    const industryCounts = new Map();\n    const selected = [];\n    for (const item of items) {\n      const count = industryCounts.get(item.stock.industry) || 0;\n      if (count >= 4) continue;\n      selected.push(item);\n      industryCounts.set(item.stock.industry, count + 1);\n      if (selected.length >= limit) break;\n    }\n    return selected;\n  }\n\n  function groupRanking(group, limit = 5, strategy = 'balanced') {\n    const rows = S.stocks.filter(stock => validForGroup(stock, group));\n    const ctx = makeContext(rows);\n    const filters = { ...defaults, group, strategy, minVolume: String(groupFloorVolume[group]) };\n    return diversify(rows.filter(stock => matches(stock, filters, group)).map(stock => ({\n      stock, ...scoreStock(stock, ctx, group, strategy), reasons: reasons(stock, group)\n    })).sort((a, b) => b.score - a.score || b.confidence - a.confidence), group, limit);\n  }\n\n  function signalFromHistory(result) {\n    const rows = result.rows || [];\n    const close = rows.map(row => row.close).filter(finite);\n    const last = close.at(-1);\n    const changeFrom = days => close.length > days && last\n      ? (last / close[close.length - 1 - days] - 1) * 100 : null;\n    return {\n      return20: changeFrom(20), return60: changeFrom(60),\n      volumeRatio: result.indicators?.volumeRatio ?? null,\n      atrPct: result.indicators?.atrPct ?? null,\n      fetchedAt: Date.now()\n    };\n  }\n\n  function loadStoredSignals() {\n    try {\n      const stored = JSON.parse(sessionStorage.getItem(SIGNAL_KEY) || '{}');\n      Object.entries(stored).forEach(([symbol, signal]) => {\n        if (Date.now() - Number(signal?.fetchedAt || 0) <= SIGNAL_TTL) S.historySignals.set(symbol, signal);\n      });\n    } catch {}\n  }\n\n  function storeSignals() {\n    try { sessionStorage.setItem(SIGNAL_KEY, JSON.stringify(Object.fromEntries(S.historySignals))); } catch {}\n  }\n\n  function queueHistory(stocks) {\n    stocks.slice(0, 5).forEach(stock => {\n      if (S.historySignals.has(stock.symbol) || historyAttempted.has(stock.symbol)) return;\n      historyAttempted.add(stock.symbol);\n      historyQueue.push(stock);\n    });\n    runHistoryQueue();\n  }\n\n  async function runHistoryQueue() {\n    if (historyRunning) return;\n    historyRunning = true;\n    while (historyQueue.length) {\n      const stock = historyQueue.shift();\n      await wait(1500);\n      try {\n        const result = await getHistory(stock.symbol);\n        S.historySignals.set(stock.symbol, signalFromHistory(result));\n        storeSignals();\n        if (S.tab === 'opportunities') render();\n      } catch {}\n    }\n    historyRunning = false;\n  }\n\n  function card(item, group) {\n    const stock = item.stock;\n    const signal = historySignal(stock);\n    const historical = signal ? `歷史動能已納入` : '歷史動能待補';\n    const metrics = group === 'etf'\n      ? `${metric('20日動能', signal ? pct(signal.return20) : reasonDash('逐檔補抓中'))}${metric('法人買賣超', stock.inst == null ? reasonDash('官方無資料') : `${fmt(stock.inst, 0)} 張`)}${metric('成交量', `${fmt(stock.volume, 0)} 張`)}${metric('殖利率', stock.yield == null ? reasonDash('官方無資料') : `${fmt(stock.yield)}%`)}`\n      : `${metric('月營收年增', stock.rev == null ? reasonDash('官方無資料') : pct(stock.rev))}${metric('成長加速度', stock.revAcceleration == null ? reasonDash('資料不足') : pct(stock.revAcceleration))}${metric('ROE', valueOrReason(stock.roe, '%'))}${metric('本益比', valueOrReason(stock.pe))}`;\n    return `<article class=\"card smart-card clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b class=\"smart-name\">${esc(stock.name)}</b><div class=\"muted\">${stock.symbol} · ${esc(groupLabels[group])} · ${esc(stock.industry)}</div></div><div class=\"smart-score\"><small>組內分數</small><strong>${item.score}</strong></div></div><div class=\"smart-price\"><span class=\"price\">${fmt(stock.close)}</span><b class=\"${cls(stock.change)}\">${pct(stock.change)}</b></div><div class=\"rules smart-reasons\">${item.reasons.map(reason => `<span>${esc(reason)}</span>`).join('')}</div><div class=\"grid smart-metrics\">${metrics}</div><div class=\"smart-confidence\"><span>資料信心 ${item.confidence}%</span><span>${historical}</span></div><div class=\"row smart-actions\"><button class=\"btn grow\" data-forecast=\"${stock.symbol}\">深度預測</button><button class=\"btn secondary\" data-watch=\"${stock.symbol}\">${isWatched(stock.symbol) ? '★ 已自選' : '＋自選'}</button></div></article>`;\n  }\n\n  function input(id, label, value, extra = '') {\n    return `<label class=\"smart-field\"><span>${label}</span><input id=\"${id}\" type=\"number\" value=\"${esc(value)}\" ${extra}></label>`;\n  }\n\n  function allowedStrategies(group) {\n    return group === 'etf' ? ['balanced', 'dividend', 'momentum'] : Object.keys(labels);\n  }\n\n  opportunitiesPage = function () {\n    const group = applied.group;\n    const groupRows = S.stocks.filter(stock => validForGroup(stock, group));\n    const ctx = makeContext(groupRows);\n    const allRanked = groupRows\n      .filter(stock => matches(stock, applied, group))\n      .map(stock => ({\n        stock,\n        ...scoreStock(stock, ctx, group, applied.strategy),\n        reasons: reasons(stock, group)\n      }))\n      .sort((a, b) => b.score - a.score || b.confidence - a.confidence);\n    const ranked = diversify(allRanked, group);\n    if (S.fundStatus !== 'loading') setTimeout(() => queueHistory(ranked.map(item => item.stock)), 0);\n    const industries = ['全部產業', ...new Set(groupRows.map(stock => stock.industry).filter(Boolean))]\n      .sort((a, b) => a === '全部產業' ? -1 : b === '全部產業' ? 1 : a.localeCompare(b, 'zh-Hant'));\n    const counts = Object.fromEntries(Object.keys(groupLabels).map(key => [key, S.stocks.filter(stock => validForGroup(stock, key)).length]));\n    const strategies = allowedStrategies(draft.group);\n    const formula = Object.entries(baseWeights[draft.group]).map(([key, weight]) => `${factorLabels[key]} ${weight}%`).join('、');\n    return `<div class=\"smart-hero\"><div><small>SMART SCREENER · ${VERSION}</small><h2>智能選股</h2><p>上市、上櫃與 ETF 分開比較，依各組適用指標計分。</p></div><span class=\"status-pill ${S.mode === 'live' ? 'good' : 'warn'}\">${S.mode === 'live' ? '官方日期已核對' : '部分官方資料'}</span></div>${statusCard()}<section class=\"card smart-filter-card\"><div class=\"head\"><div><h3>商品分組</h3><div class=\"muted\">不同商品不會互相比名次。</div></div><button id=\"smartReset\" class=\"btn secondary\">重設</button></div><div class=\"smart-groups\">${Object.entries(groupLabels).map(([key, label]) => `<button class=\"${draft.group === key ? 'active' : ''}\" data-smart-group=\"${key}\">${label}<small>${counts[key]}</small></button>`).join('')}</div><h3 class=\"smart-subtitle\">選股策略</h3><div class=\"smart-strategies\">${strategies.map(key => `<button class=\"${draft.strategy === key ? 'active' : ''}\" data-smart-strategy=\"${key}\">${labels[key]}</button>`).join('')}</div><div class=\"notice smart-note\"><b>${groupLabels[draft.group]} · ${labels[draft.strategy]}</b>：${notes[draft.strategy]}<br><small>基準權重：${formula}</small></div>${draft.group === 'etf' ? '' : `<label class=\"smart-field smart-industry\"><span>產業類別</span><select id=\"smartIndustry\">${industries.map(industry => `<option value=\"${esc(industry)}\" ${draft.industry === industry ? 'selected' : ''}>${esc(industry)}</option>`).join('')}</select></label>`}<div class=\"smart-filter-grid\">${input('smartMinPrice', '最低股價（元）', draft.minPrice, 'min=\"0\" placeholder=\"不限\"')}${input('smartMaxPrice', '最高股價（元）', draft.maxPrice, 'min=\"0\" placeholder=\"不限\"')}${draft.group === 'etf' ? '' : input('smartMaxPe', '最高本益比', draft.maxPe, 'min=\"0\"')}${input('smartMinYield', '最低殖利率（%）', draft.minYield, 'step=\"0.5\" placeholder=\"不限\"')}${draft.group === 'etf' ? '' : input('smartMinRev', '最低月營收年增（%）', draft.minRev, 'placeholder=\"不限\"')}${draft.group === 'etf' ? '' : input('smartMinRoe', '最低 ROE（%）', draft.minRoe, 'placeholder=\"不限\"')}${input('smartMinVolume', '最低成交量（張）', draft.minVolume, 'step=\"100\"')}<label class=\"smart-check\"><input id=\"smartComplete\" type=\"checkbox\" ${draft.complete ? 'checked' : ''}><span>只看資料完整標的</span></label></div><button id=\"smartApply\" class=\"btn smart-apply\">開始智能選股 <span>→</span></button></section><div class=\"smart-results-head\"><div><h3>${groupLabels[group]}排名</h3><div class=\"muted\">${labels[applied.strategy]} · 組內百分位${group === 'etf' ? '' : ' · 每產業最多 4 檔'}</div></div><b>${ranked.length} 檔</b></div>${ranked.length ? `<div class=\"list two-col smart-results\">${ranked.map(item => card(item, group)).join('')}</div>` : `<div class=\"card empty\"><h3>目前沒有符合條件的標的</h3><p class=\"muted\">可放寬成交量、估值或成長門檻；ETF 不使用公司月營收與 ROE。</p></div>`}<div class=\"notice\"><b>評分說明</b><br>分數只與同組商品比較；缺資料不會得到預設分，會降低資料信心與完整度加權。歷史日線只為目前分組前 5 名逐檔補抓，每次間隔 1.5 秒。排名僅供研究，不保證獲利。</div>${disclaimer()}`;\n  };\n\n  function read() {\n    draft = {\n      ...draft,\n      industry: q('#smartIndustry')?.value || draft.industry || '全部產業',\n      minPrice: q('#smartMinPrice')?.value ?? draft.minPrice,\n      maxPrice: q('#smartMaxPrice')?.value ?? draft.maxPrice,\n      maxPe: q('#smartMaxPe')?.value ?? draft.maxPe,\n      minYield: q('#smartMinYield')?.value ?? draft.minYield,\n      minRev: q('#smartMinRev')?.value ?? draft.minRev,\n      minRoe: q('#smartMinRoe')?.value ?? draft.minRoe,\n      minVolume: q('#smartMinVolume')?.value ?? draft.minVolume,\n      complete: Boolean(q('#smartComplete')?.checked)\n    };\n  }\n\n  function bindSmart() {\n    qa('[data-smart-group]').forEach(button => button.onclick = () => {\n      read();\n      draft.group = button.dataset.smartGroup;\n      draft.industry = '全部產業';\n      draft.minVolume = String(groupFloorVolume[draft.group]);\n      if (!allowedStrategies(draft.group).includes(draft.strategy)) draft.strategy = 'balanced';\n      applied = { ...draft };\n      render();\n    });\n    qa('[data-smart-strategy]').forEach(button => button.onclick = () => {\n      read(); draft.strategy = button.dataset.smartStrategy; render();\n    });\n    q('#smartApply')?.addEventListener('click', () => {\n      read(); applied = { ...draft }; render(); scrollTo({ top: 0, behavior: 'smooth' });\n    });\n    q('#smartReset')?.addEventListener('click', () => {\n      draft = { ...defaults }; applied = { ...defaults }; render();\n    });\n  }\n\n  loadStoredSignals();\n  globalThis.twssGroupRanking = groupRanking;\n  const oldBind = bind;\n  bind = function () { oldBind(); bindSmart(); };\n  const button = q('.bottom-nav [data-tab=\"opportunities\"]');\n  if (button) button.innerHTML = '<span>◆</span>智能選股';\n  render();\n})();\n";
const STYLES=":root{\n  color-scheme:dark;--bg:#071018;--panel:#10212d;--panel2:#0b1721;--line:#29404d;--text:#f4f8fa;--muted:#9fb0bc;--primary:#14b8a6;--primary2:#0f766e;--up:#ff4d57;--down:#22c55e;--warn:#fbbf24;--danger:#fb7185;--blue:#60a5fa;--shadow:0 12px 40px rgba(0,0,0,.22)\n}\n*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:radial-gradient(circle at top,#0c1d28 0,var(--bg) 38%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,\"Noto Sans TC\",\"Segoe UI\",sans-serif;min-height:100vh}button,input,select,textarea{font:inherit}button{-webkit-tap-highlight-color:transparent}.topbar{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;background:rgba(7,16,24,.92);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.topbar h1{margin:0;font-size:20px}.sub{color:var(--muted);font-size:11px;margin-top:2px}.top-actions{display:flex;align-items:center;gap:7px}.badge,.status-pill{display:inline-flex;align-items:center;gap:4px;border:1px solid #7a5b1b;color:var(--warn);background:#312916;border-radius:999px;padding:6px 9px;font-size:11px;white-space:nowrap}.status-pill.ok{border-color:#176660;color:#5eead4;background:#0c3735}.status-pill.bad{border-color:#6d2638;color:var(--danger);background:#421d29}.account-btn,.icon-btn{border:1px solid var(--line);background:#142936;color:var(--text);border-radius:999px;padding:7px 10px;font-size:11px}.app-shell{max-width:820px;margin:0 auto;padding:18px 16px 112px}h2{margin:0 0 6px;font-size:26px;letter-spacing:-.02em}h3{margin:0 0 10px;font-size:17px}p{line-height:1.6}.muted{color:var(--muted);font-size:13px}.small{font-size:11px}.card{background:linear-gradient(180deg,rgba(16,33,45,.97),rgba(12,26,36,.97));border:1px solid var(--line);border-radius:18px;padding:15px;margin:12px 0;box-shadow:var(--shadow)}.card.clickable{cursor:pointer}.card.accent{border-color:#1b6c66}.card.warn-card{border-color:#7a5b1b;background:#2c2618}.card.error-card{border-color:#6d2638;background:#321a24}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.metric{min-width:0;background:var(--panel2);border:1px solid rgba(41,64,77,.62);border-radius:14px;padding:11px}.metric.highlight{border-color:#1b6c66;background:#0b292b}.metric small,.metric em{display:block;color:var(--muted);font-size:10px;line-height:1.35;font-style:normal}.metric b{display:block;margin-top:5px;font-size:17px;word-break:break-word}.metric .big{font-size:27px}.row{display:flex;gap:8px;align-items:center}.row.wrap{flex-wrap:wrap}.row>.grow{flex:1;min-width:0}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.price{font-size:28px;font-weight:900;letter-spacing:-.02em}.score{font-size:28px;font-weight:900;color:var(--primary);text-align:right}.up{color:var(--up)}.down{color:var(--down)}.neutral{color:var(--warn)}.blue{color:var(--blue)}.btn{border:0;border-radius:13px;padding:12px 14px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--primary),var(--primary2))}.btn.secondary{background:#142936;border:1px solid var(--line)}.btn.danger{background:#4a1f2c;color:#fecdd3}.btn.small-btn{padding:8px 10px;font-size:12px}.btn:disabled{opacity:.5}input,select,textarea{width:100%;border:1px solid var(--line);background:#09151e;color:var(--text);border-radius:13px;padding:12px;outline:none}textarea{min-height:110px;resize:vertical}input:focus,select:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(20,184,166,.12)}label{display:block;color:var(--muted);font-size:12px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.search-row{display:grid;grid-template-columns:1fr auto;gap:8px}.search-results{display:grid;gap:8px;margin-top:10px}.search-result{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:12px;padding:10px;text-align:left}.tag{display:inline-flex;align-items:center;border-radius:999px;padding:6px 9px;margin:3px 3px 3px 0;font-size:10px;background:#0c3735;color:#5eead4}.tag.warn{background:#3d2d19;color:var(--warn)}.tag.bad{background:#4a1f2c;color:var(--danger)}.tag.info{background:#162f46;color:#93c5fd}.rules{display:flex;flex-wrap:wrap;gap:7px}.rules span{padding:7px 9px;border-radius:10px;background:var(--panel2);color:#c2d0d8;font-size:11px}.rank-list{display:grid}.rank{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(41,64,77,.6)}.rank:last-child{border-bottom:0}.list{display:grid;gap:10px}.progress{height:10px;background:#09151e;border-radius:999px;overflow:hidden;border:1px solid var(--line)}.progress>span{display:block;height:100%;border-radius:inherit}.bar-up{background:linear-gradient(90deg,#ef4444,#fb7185)}.bar-neutral{background:linear-gradient(90deg,#d97706,#fbbf24)}.bar-down{background:linear-gradient(90deg,#16a34a,#4ade80)}.prob-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.prob-box{background:var(--panel2);border-radius:13px;padding:10px;border:1px solid var(--line)}.prob-box b{font-size:20px;display:block;margin-top:3px}.factor-list{display:grid;gap:8px}.factor{display:grid;grid-template-columns:88px 1fr auto;align-items:center;gap:9px;font-size:12px}.factor .track{height:8px;border-radius:999px;background:#09151e;overflow:hidden}.factor .track span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),#5eead4)}.data-health{display:flex;justify-content:space-between;gap:12px;align-items:center}.empty{text-align:center;padding:32px 12px}.notice{font-size:12px;line-height:1.65;color:var(--warn);border:1px solid #7a5b1b;background:#2c2618;border-radius:14px;padding:11px;margin:12px 0}.disclaimer{font-size:11px;color:var(--muted);border:1px dashed var(--line);border-radius:13px;padding:12px;margin-top:14px;line-height:1.65}.bottom-nav{position:fixed;z-index:30;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,820px);display:grid;grid-template-columns:repeat(5,1fr);padding:7px 6px max(9px,env(safe-area-inset-bottom));background:rgba(7,16,24,.94);backdrop-filter:blur(18px);border-top:1px solid var(--line)}.bottom-nav button{border:0;background:transparent;color:var(--muted);padding:7px 2px;font-size:9px}.bottom-nav button span{display:block;font-size:19px;margin-bottom:2px}.bottom-nav button.active{color:var(--primary)}.modal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.72);display:flex;align-items:flex-end}.sheet{width:min(100%,820px);max-height:94vh;overflow-y:auto;margin:0 auto;background:var(--bg);border:1px solid var(--line);border-bottom:0;border-radius:24px 24px 0 0;padding:17px 16px max(24px,env(safe-area-inset-bottom));box-shadow:0 -20px 70px rgba(0,0,0,.5)}.sheet-close{float:right;border:0;background:#4a1f2c;color:var(--danger);border-radius:10px;width:36px;height:36px;font-size:20px}.section-title{margin:20px 0 10px;font-size:18px}.loading{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}.spinner{width:16px;height:16px;border:2px solid var(--line);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.sparkline{width:100%;height:84px;display:block;margin:8px 0}.sparkline polyline{fill:none;stroke:var(--primary);stroke-width:2.5;vector-effect:non-scaling-stroke}.sparkline .area{fill:rgba(20,184,166,.12);stroke:none}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}.segmented{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;padding:4px;background:#08131b;border-radius:13px;border:1px solid var(--line)}.segmented button{border:0;border-radius:10px;padding:9px;background:transparent;color:var(--muted)}.segmented button.active{background:#15303c;color:#fff}.scenario{border-left:4px solid var(--line)}.scenario.good{border-left-color:var(--up)}.scenario.base{border-left-color:var(--warn)}.scenario.bad{border-left-color:var(--down)}.event{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:start;padding:10px 0;border-bottom:1px solid var(--line)}.event:last-child{border-bottom:0}.event-icon{width:34px;height:34px;border-radius:10px;background:#132a36;display:grid;place-items:center}.peer-row{display:grid;grid-template-columns:100px 1fr auto;gap:10px;align-items:center;padding:8px 0}.peer-track{height:8px;background:#09151e;border-radius:99px;overflow:hidden}.peer-track span{display:block;height:100%;background:linear-gradient(90deg,#0f766e,#5eead4)}.stat-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tabs-inline{display:flex;gap:8px;overflow:auto;margin:12px 0}.tabs-inline button{white-space:nowrap;border:1px solid var(--line);background:#12232f;color:var(--muted);border-radius:99px;padding:8px 12px}.tabs-inline button.active{background:#0c3735;color:#5eead4;border-color:#176660}.journal-item{border-left:3px solid var(--primary)}.journal-item.buy{border-left-color:var(--up)}.journal-item.sell{border-left-color:var(--down)}\n@media(min-width:700px){.app-shell{padding-left:24px;padding-right:24px}.list.two-col{grid-template-columns:repeat(2,minmax(0,1fr))}.modal{align-items:center;padding:18px}.sheet{border-radius:24px;border-bottom:1px solid var(--line)}}\n@media(max-width:560px){.grid.three,.grid.four{grid-template-columns:repeat(2,minmax(0,1fr))}.stat-strip{grid-template-columns:repeat(2,1fr)}.badge{display:none}.factor{grid-template-columns:72px 1fr auto}.prob-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.peer-row{grid-template-columns:86px 1fr auto}}\n.bottom-nav{grid-template-columns:repeat(5,1fr)!important}.patch-scenarios{display:grid;gap:8px}.patch-scenario{margin:0}.patch-scenario.positive{border-color:#7b2633}.patch-scenario.neutral{border-color:#7a5b1b}.patch-scenario.negative{border-color:#176b3b}.patch-peer{display:grid;grid-template-columns:90px 1fr 82px;gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);font-size:12px}.patch-peer:last-child{border-bottom:0}.patch-peer>b{text-align:right}.patch-track{height:8px;background:#09151e;border-radius:999px;overflow:hidden}.patch-track span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),#5eead4)}.patch-event{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.patch-event:last-child{border-bottom:0}.patch-event-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#162936;color:var(--warn);font-weight:900}.patch-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.patch-tabs button{border:1px solid var(--line);background:#10212d;color:var(--muted);border-radius:12px;padding:11px}.patch-tabs button.active{color:#5eead4;border-color:#1b6c66;background:#0b292b}.patch-journal{border-left:3px solid var(--primary)}textarea{min-height:88px}.sheet label{display:block;margin-top:10px}.table-wrap{overflow-x:auto}.small{font-size:11px}@media(min-width:700px){.patch-scenarios{grid-template-columns:repeat(3,1fr)}}@media(max-width:420px){.bottom-nav button{font-size:8px!important}.bottom-nav button span{font-size:16px!important}.patch-peer{grid-template-columns:72px 1fr 70px}}\n.smart-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:18px 0 6px}.smart-hero h2{font-size:28px;margin:4px 0}.smart-hero p{margin:0;color:var(--muted);max-width:620px;line-height:1.7}.smart-hero small{color:#5eead4;font-weight:800;letter-spacing:.14em}.smart-filter-card{border-color:#24615f;background:linear-gradient(145deg,rgba(16,33,45,.98),rgba(9,28,34,.98))}.smart-strategies{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:16px 0 10px}.smart-strategies button{border:1px solid var(--line);border-radius:10px;background:#0b1721;color:var(--muted);padding:11px 6px;font-weight:750}.smart-strategies button.active{color:#061512;border-color:#5eead4;background:linear-gradient(135deg,#5eead4,#14b8a6)}.smart-note{margin:0 0 14px;padding:10px 12px}.smart-industry{display:grid!important;grid-template-columns:110px 1fr;align-items:center;margin-bottom:12px}.smart-field{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:12px}.smart-field input,.smart-field select{height:43px}.smart-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.smart-check{min-height:43px;display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:12px}.smart-check input{width:18px;height:18px;accent-color:var(--primary)}.smart-apply{width:100%;min-height:50px;margin-top:15px;font-size:15px;background:linear-gradient(135deg,#14b8a6,#0f766e)}.smart-results-head{display:flex;align-items:flex-end;justify-content:space-between;margin:23px 0 10px}.smart-results-head h3{margin:0 0 4px}.smart-results-head>b{color:#5eead4;background:#0b292b;border:1px solid #1b6c66;border-radius:999px;padding:7px 11px}.smart-card{position:relative;overflow:hidden}.smart-card:before{content:\"\";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(var(--primary),#60a5fa)}.smart-name{font-size:17px}.smart-score{text-align:right}.smart-score small,.smart-score strong{display:block}.smart-score small{color:var(--muted);font-size:10px}.smart-score strong{font-size:29px;color:#5eead4}.smart-price{display:flex;align-items:baseline;gap:10px;margin:9px 0}.smart-reasons span{color:#bffdf5;border-color:#1b6c66;background:#0b292b}.smart-metrics{margin-top:10px}.smart-actions{margin-top:11px}@media(max-width:760px){.smart-strategies{grid-template-columns:repeat(2,1fr)}.smart-strategies button:last-child{grid-column:1/-1}.smart-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.smart-industry{grid-template-columns:1fr}}@media(max-width:420px){.smart-filter-grid{grid-template-columns:1fr}.smart-hero{display:block}}\n.smart-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:14px 0 4px}.smart-groups button{display:flex;justify-content:center;align-items:center;gap:7px;border:1px solid var(--line);border-radius:13px;background:#0b1721;color:var(--muted);padding:13px 8px;font-weight:850}.smart-groups button small{padding:2px 7px;border-radius:999px;background:#152a36;color:#b8c8d2}.smart-groups button.active{color:#061512;border-color:#5eead4;background:linear-gradient(135deg,#5eead4,#14b8a6)}.smart-groups button.active small{background:rgba(6,21,18,.18);color:#061512}.smart-subtitle{font-size:13px;margin:16px 0 -8px;color:#d6e4ea}.smart-confidence{display:flex;justify-content:space-between;gap:8px;margin-top:10px;color:var(--muted);font-size:10px}.smart-confidence span:first-child{color:#5eead4}.smart-card .metric b{font-size:15px}@media(max-width:520px){.smart-groups{grid-template-columns:1fr}.smart-groups button{justify-content:space-between}.smart-confidence{flex-direction:column}}\n";
const MANIFEST="{\"name\":\"台股智選\",\"short_name\":\"台股智選\",\"description\":\"台股官方盤後資料智能選股、趨勢預測、預測驗證與投資紀錄\",\"start_url\":\"/?source=pwa&v=15.5\",\"scope\":\"/\",\"display\":\"standalone\",\"background_color\":\"#071018\",\"theme_color\":\"#071018\",\"lang\":\"zh-Hant-TW\",\"icons\":[{\"src\":\"/icon.svg?v=15.5\",\"sizes\":\"any\",\"type\":\"image/svg+xml\",\"purpose\":\"any maskable\"}]}\n";
const ICON="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><rect width=\"512\" height=\"512\" rx=\"112\" fill=\"#071018\"/><path d=\"M92 350l92-92 66 58 148-164\" fill=\"none\" stroke=\"#14b8a6\" stroke-width=\"42\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M323 152h75v75\" fill=\"none\" stroke=\"#14b8a6\" stroke-width=\"42\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"184\" cy=\"258\" r=\"22\" fill=\"#f4f8fa\"/><circle cx=\"250\" cy=\"316\" r=\"22\" fill=\"#f4f8fa\"/></svg>\n";
const SERVICE_WORKER="const CACHE='twss-v15-5-vercel';\nconst STATIC=[\n  '/',\n  '/app.js?v=15.5',\n  '/patch.js?v=15.5',\n  '/smart.js?v=15.5',\n  '/styles.css?v=15.5',\n  '/manifest.webmanifest?v=15.5',\n  '/icon.svg?v=15.5'\n];\n\nself.addEventListener('install',event=>event.waitUntil(\n  caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())\n));\n\nself.addEventListener('activate',event=>event.waitUntil(\n  caches.keys()\n    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))\n    .then(()=>self.clients.claim())\n));\n\nself.addEventListener('fetch',event=>{\n  if(event.request.method!=='GET')return;\n  const url=new URL(event.request.url);\n  if(url.origin!==location.origin)return;\n  if(url.pathname.startsWith('/api/')){\n    event.respondWith(fetch(event.request));\n    return;\n  }\n  if(event.request.mode==='navigate'){\n    event.respondWith(\n      fetch(event.request,{cache:'no-store'})\n        .then(response=>{\n          const copy=response.clone();\n          caches.open(CACHE).then(cache=>cache.put('/',copy));\n          return response;\n        })\n        .catch(()=>caches.match('/'))\n    );\n    return;\n  }\n  event.respondWith(\n    caches.match(event.request)\n      .then(cached=>cached||fetch(event.request).then(response=>{\n        const copy=response.clone();\n        caches.open(CACHE).then(cache=>cache.put(event.request,copy));\n        return response;\n      }))\n  );\n});\n";

const SUPABASE_EDGE = "https://lfkdkdyaatdlizryiyon.supabase.co/functions/v1/twss-market-data";
const TWSE_OPEN = "https://openapi.twse.com.tw/v1";
const TWSE_WEB = "https://www.twse.com.tw";
const TPEX_OPEN = "https://www.tpex.org.tw/openapi/v1";
const VERSION = "15.5";

const FINANCIAL_CATEGORIES = ["ci", "fh", "basi", "bd", "ins", "mim"];

const industryNames = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "07": "化學生技醫療",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "14": "建材營造",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融保險業",
  "18": "貿易百貨",
  "19": "綜合",
  "20": "其他業",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "35": "綠能環保",
  "36": "數位雲端",
  "37": "運動休閒",
  "38": "居家生活",
};

let stockCache = null;
let revenueCache = null;
let financialCache = null;

const requestQueues = new Map();
const SOURCE_POLICIES = [
  { match: "openapi.twse.com.tw", key: "twse-openapi", gap: 1_200, limit: 2 },
  { match: "www.twse.com.tw", key: "twse-web", gap: 1_500, limit: 1 },
  { match: "www.tpex.org.tw", key: "tpex-openapi", gap: 1_200, limit: 2 },
  { match: "mops.twse.com.tw", key: "mops", gap: 1_800, limit: 1 },
  { match: "supabase.co", key: "supabase", gap: 350, limit: 2 },
];

function pick(row, ...keys) {
  if (!row) return undefined;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
}

function numeric(value) {
  if (value == null) return null;
  const raw = String(value)
    .trim()
    .replaceAll(",", "")
    .replaceAll("%", "")
    .replaceAll("−", "-");
  if (!raw || ["-", "--", "---", "N/A", "null"].includes(raw)) return null;
  const parsed = Number(raw.replace(/^\+/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function prefer(value, fallback = null) {
  return value == null || value === "" ? fallback : value;
}

function industry(value) {
  const raw = text(value);
  return industryNames[raw.padStart(2, "0")] || raw || "未分類";
}

function tableToRows(fields, data) {
  if (!Array.isArray(fields) || !Array.isArray(data)) return [];
  return data.map((item) => {
    if (!Array.isArray(item)) return item;
    const row = {};
    fields.forEach((field, index) => {
      if (row[field] === undefined) row[field] = item[index];
    });
    return row;
  });
}

function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) {
    return value.data.some(Array.isArray)
      ? tableToRows(value.fields, value.data)
      : value.data;
  }
  const table = Array.isArray(value?.tables)
    ? value.tables.find((item) => Array.isArray(item?.data) && item.data.length)
    : null;
  return table ? tableToRows(table.fields, table.data) : [];
}

function rowsFromNamedTable(value, titleText) {
  const table = Array.isArray(value?.tables)
    ? value.tables.find(
        (item) => text(item?.title).includes(titleText) && Array.isArray(item?.data),
      )
    : null;
  return table ? tableToRows(table.fields, table.data) : [];
}

function twseMarginRows(value) {
  const table = Array.isArray(value?.tables)
    ? value.tables.find(
        (item) =>
          text(item?.title).includes("融資融券彙總") && Array.isArray(item?.data),
      )
    : null;
  if (!table) return [];
  return table.data
    .filter(Array.isArray)
    .map((item) => ({
      股票代號: text(item[0]),
      股票名稱: item[1],
      融資買進: item[2],
      融資賣出: item[3],
      融資現金償還: item[4],
      融資前日餘額: item[5],
      融資今日餘額: item[6],
      融券買進: item[8],
      融券賣出: item[9],
      融券現券償還: item[10],
      融券前日餘額: item[11],
      融券今日餘額: item[12],
    }))
    .filter((row) => /^\d{4}$/.test(row.股票代號));
}

function symbolOf(row) {
  return text(
    pick(
      row,
      "Code",
      "股票代號",
      "證券代號",
      "公司代號",
      "SecuritiesCompanyCode",
      "代號",
      "Symbol",
    ),
  );
}

function instrumentTypeOf(symbol) {
  if (/^00\d{2,4}$/.test(symbol)) return "ETF";
  if (/^[1-9]\d{3}$/.test(symbol)) return "股票";
  return "其他";
}

function isSupportedSymbol(symbol) {
  return instrumentTypeOf(symbol) !== "其他";
}

function isCompanySymbol(symbol) {
  return instrumentTypeOf(symbol) === "股票";
}

function nameOf(row) {
  return text(
    pick(
      row,
      "Name",
      "股票名稱",
      "證券名稱",
      "公司名稱",
      "公司簡稱",
      "CompanyName",
      "名稱",
    ),
  );
}

function mapBySymbol(items) {
  return new Map(
    items.map((row) => [symbolOf(row), row]).filter(([symbol]) => symbol),
  );
}

function sharesToLots(value) {
  const parsed = numeric(value);
  return parsed == null ? null : parsed / 1000;
}

function dateText(value) {
  const raw = text(value).replaceAll("/", "").replaceAll("-", "");
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (/^\d{7}$/.test(raw)) {
    const year = Number(raw.slice(0, 3)) + 1911;
    return `${year}-${raw.slice(3, 5)}-${raw.slice(5, 7)}`;
  }
  return text(value);
}

function dateFromTitle(value) {
  const match = text(value).match(/(\d{3})年(\d{2})月(\d{2})日/);
  if (!match) return "";
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}

function payloadDate(payload, fallbackRows = []) {
  return (
    dateText(payload?.date) ||
    dateFromTitle(payload?.title) ||
    dateFromTitle(payload?.tables?.find((table) => table?.title)?.title) ||
    dateText(pick(fallbackRows[0], "Date", "日期", "出表日期", "資料日期"))
  );
}

function latestDate(...values) {
  const dates = values
    .flat(Infinity)
    .map(dateText)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return dates.sort().at(-1) || "";
}

function queryDate(value) {
  return dateText(value).replaceAll("-", "");
}

function periodText(row) {
  const direct = text(
    pick(row, "資料年月", "年月", "YearMonth", "DataYearMonth"),
  )
    .replaceAll("/", "")
    .replaceAll("-", "");
  if (/^\d{6}$/.test(direct)) {
    return `${direct.slice(0, 4)}-${direct.slice(4, 6)}`;
  }
  if (/^\d{5}$/.test(direct)) {
    return `${Number(direct.slice(0, 3)) + 1911}-${direct.slice(3, 5)}`;
  }
  const year = numeric(pick(row, "年度", "年", "Year"));
  const month = numeric(pick(row, "月份", "月", "Month"));
  if (year != null && month != null) {
    return `${year < 1911 ? year + 1911 : year}-${String(month).padStart(2, "0")}`;
  }
  return dateText(pick(row, "出表日期", "資料日期", "Date")).slice(0, 7);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sourcePolicy(url) {
  return (
    SOURCE_POLICIES.find((policy) => url.includes(policy.match)) || {
      key: "other",
      gap: 500,
      limit: 2,
    }
  );
}

function queueFor(policy) {
  if (!requestQueues.has(policy.key)) {
    requestQueues.set(policy.key, {
      active: 0,
      lastStartedAt: 0,
      launching: false,
      jobs: [],
      policy,
    });
  }
  return requestQueues.get(policy.key);
}

function pumpQueue(state) {
  if (state.launching) return;
  state.launching = true;
  void (async () => {
    while (state.active < state.policy.limit && state.jobs.length) {
      const wait = Math.max(
        0,
        state.lastStartedAt + state.policy.gap - Date.now(),
      );
      if (wait) await sleep(wait);
      const job = state.jobs.shift();
      state.active += 1;
      state.lastStartedAt = Date.now();
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          state.active -= 1;
          pumpQueue(state);
        });
    }
    state.launching = false;
    if (state.active < state.policy.limit && state.jobs.length) pumpQueue(state);
  })();
}

function scheduledRequest(url, task) {
  const state = queueFor(sourcePolicy(url));
  return new Promise((resolve, reject) => {
    state.jobs.push({ task, resolve, reject });
    pumpQueue(state);
  });
}

async function fetchAttempt(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": `TaiwanStockSmartPicker/${VERSION}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Upstream ${response.status}`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get("retry-after")) || null;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeout = 24_000, retries = 2) {
  return scheduledRequest(url, async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fetchAttempt(url, timeout);
      } catch (error) {
        lastError = error;
        const retryable =
          error?.name === "AbortError" ||
          error?.status === 408 ||
          error?.status === 429 ||
          error?.status >= 500;
        if (!retryable || attempt === retries) throw error;
        const retryAfter = error?.retryAfter ? error.retryAfter * 1_000 : 0;
        await sleep(Math.max(retryAfter, 1_200 * 2 ** attempt) + 150);
      }
    }
    throw lastError;
  });
}

async function fetchEdge(search, timeout = 38_000) {
  return fetchJson(`${SUPABASE_EDGE}${search}`, timeout);
}

function institutionalFields(row, existing = {}) {
  const foreign = sharesToLots(
    pick(
      row,
      "Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference",
      "ForeignInvestorsInclude MainlandAreaInvestors-Difference",
      "ForeignInvestorsIncludeMainlandAreaInvestors-Difference",
      "ForeignInvestorsBuySell",
      "ForeignInvestorsNetBuySell",
      "ForeignInvestmentBuySell",
      "ForeignInvestmentNetBuySell",
      "外陸資買賣超股數(不含外資自營商)",
      "外資及陸資買賣超股數(不含外資自營商)",
      "外資及陸資買賣超股數",
      "外資買賣超",
    ),
  );
  const trust = sharesToLots(
    pick(
      row,
      "SecuritiesInvestmentTrustCompanies-Difference",
      "InvestmentTrustBuySell",
      "InvestmentTrustNetBuySell",
      "投信買賣超股數",
      "投信買賣超",
    ),
  );
  let dealer = sharesToLots(
    pick(
      row,
      "Dealers-Difference",
      "DealerBuySell",
      "DealerNetBuySell",
      "DealersBuySell",
      "DealersNetBuySell",
      "自營商買賣超股數",
      "自營商買賣超",
    ),
  );
  if (dealer == null) {
    const own = sharesToLots(
      pick(row, "DealerSelfBuySell", "自營商買賣超股數(自行買賣)"),
    );
    const hedge = sharesToLots(
      pick(row, "DealerHedgingBuySell", "自營商買賣超股數(避險)"),
    );
    dealer = own == null && hedge == null ? null : (own || 0) + (hedge || 0);
  }
  const total = sharesToLots(
    pick(
      row,
      "TotalDifference",
      "TotalBuySell",
      "TotalNetBuySell",
      "三大法人買賣超股數",
      "合計買賣超",
    ),
  );
  return {
    foreign: prefer(foreign, existing.foreign),
    trust: prefer(trust, existing.trust),
    dealer: prefer(dealer, existing.dealer),
    inst: prefer(
      total,
      foreign == null && trust == null && dealer == null
        ? existing.inst
        : (foreign || 0) + (trust || 0) + (dealer || 0),
    ),
  };
}

function marginFields(row, existing = {}) {
  const marginBalance = numeric(
    pick(
      row,
      "MarginPurchaseBalance",
      "BalanceOfMarginPurchase",
      "TodayBalanceOfMarginPurchase",
      "融資今日餘額",
      "資餘額",
    ),
  );
  const previousMargin = numeric(
    pick(
      row,
      "MarginPurchaseBalancePreviousDay",
      "PreviousBalanceOfMarginPurchase",
      "融資前日餘額",
      "前資餘額",
    ),
  );
  const shortBalance = numeric(
    pick(
      row,
      "ShortSaleBalance",
      "BalanceOfShortSale",
      "TodayBalanceOfShortSale",
      "融券今日餘額",
      "券餘額",
    ),
  );
  const previousShort = numeric(
    pick(
      row,
      "ShortSaleBalancePreviousDay",
      "PreviousBalanceOfShortSale",
      "融券前日餘額",
      "前券餘額",
    ),
  );
  const marginBuy = numeric(
    pick(row, "MarginPurchase", "MarginPurchaseBuy", "融資買進", "資買"),
  );
  const marginSell = numeric(
    pick(
      row,
      "MarginSales",
      "MarginSale",
      "MarginPurchaseSale",
      "融資賣出",
      "資賣",
    ),
  );
  const cashRedemption = numeric(
    pick(row, "CashRedemption", "融資現金償還", "現償"),
  );
  const shortSell = numeric(pick(row, "ShortSale", "融券賣出", "券賣"));
  const shortBuy = numeric(
    pick(
      row,
      "ShortConvering",
      "ShortCovering",
      "ShortBuy",
      "融券買進",
      "券買",
    ),
  );
  const stockRedemption = numeric(
    pick(row, "StockRedemption", "融券現券償還", "券償"),
  );
  const marginFlow =
    marginBuy == null && marginSell == null && cashRedemption == null
      ? null
      : (marginBuy || 0) - (marginSell || 0) - (cashRedemption || 0);
  const shortFlow =
    shortSell == null && shortBuy == null && stockRedemption == null
      ? null
      : (shortSell || 0) - (shortBuy || 0) - (stockRedemption || 0);
  const marginChange = prefer(
    numeric(pick(row, "ChangeOfMarginPurchase", "融資增減", "資增減")),
    marginBalance != null && previousMargin != null
      ? marginBalance - previousMargin
      : prefer(marginFlow, existing.marginChange),
  );
  const shortChange = prefer(
    numeric(pick(row, "ChangeOfShortSale", "融券增減", "券增減")),
    shortBalance != null && previousShort != null
      ? shortBalance - previousShort
      : prefer(shortFlow, existing.shortChange),
  );
  return {
    marginBalance: prefer(marginBalance, existing.marginBalance),
    marginChange,
    shortBalance: prefer(shortBalance, existing.shortBalance),
    shortChange,
  };
}

function signedDifference(row) {
  const difference = numeric(pick(row, "Change", "漲跌價差", "漲跌"));
  if (difference == null) return null;
  const sign = text(pick(row, "漲跌(+/-)", "漲跌符號"));
  if (sign.includes("-") || /green|down/i.test(sign)) return -Math.abs(difference);
  if (sign.includes("+") || /red|up/i.test(sign)) return Math.abs(difference);
  return difference;
}

function officialStock(row, market, maps, existing = {}) {
  const symbol = symbolOf(row);
  if (!isSupportedSymbol(symbol)) return null;
  const instrumentType = instrumentTypeOf(symbol);
  const valuation = maps.valuations.get(symbol);
  const company = maps.companies.get(symbol);
  const institutional = maps.institutional.get(symbol);
  const margin = maps.margin.get(symbol);
  const close = numeric(pick(row, "ClosingPrice", "Close", "收盤價", "收盤"));
  const difference = signedDifference(row);
  const previous = close != null && difference != null ? close - difference : null;
  const volume = numeric(pick(row, "TradeVolume", "TradingShares", "成交股數"));
  return {
    ...existing,
    symbol,
    instrumentType,
    name: nameOf(row) || text(existing.name),
    industry:
      instrumentType === "ETF"
        ? "ETF"
        : industry(
            pick(
              company,
              "產業別",
              "Industry",
              "產業類別",
              "SecuritiesIndustryCode",
            ) ?? existing.industry,
          ),
    market,
    close: prefer(close, existing.close),
    change:
      previous && difference != null ? (difference / previous) * 100 : existing.change,
    open: prefer(
      numeric(pick(row, "OpeningPrice", "Open", "開盤價", "開盤")),
      existing.open,
    ),
    high: prefer(
      numeric(pick(row, "HighestPrice", "High", "最高價", "最高")),
      existing.high,
    ),
    low: prefer(
      numeric(pick(row, "LowestPrice", "Low", "最低價", "最低")),
      existing.low,
    ),
    volume: volume == null ? existing.volume : volume / 1000,
    value: prefer(
      numeric(pick(row, "TradeValue", "TransactionAmount", "成交金額")),
      existing.value,
    ),
    transactions: prefer(
      numeric(pick(row, "Transaction", "TransactionNumber", "成交筆數")),
      existing.transactions,
    ),
    pe: prefer(
      numeric(pick(valuation, "PEratio", "PriceEarningRatio", "本益比")),
      prefer(numeric(pick(row, "本益比")), existing.pe),
    ),
    pb: prefer(
      numeric(pick(valuation, "PBratio", "PriceBookRatio", "股價淨值比")),
      existing.pb,
    ),
    yield: prefer(
      numeric(
        pick(valuation, "DividendYield", "YieldRatio", "殖利率(%)", "殖利率"),
      ),
      existing.yield,
    ),
    ...institutionalFields(institutional, existing),
    ...marginFields(margin, existing),
    demo: false,
  };
}

function fulfilled(result, fallback = null) {
  return result?.status === "fulfilled" ? result.value : fallback;
}

async function buildStocks() {
  const initial = await Promise.allSettled([
    fetchJson(`${TWSE_OPEN}/exchangeReport/STOCK_DAY_ALL`),
    fetchJson(`${TWSE_OPEN}/exchangeReport/BWIBBU_ALL`),
    fetchJson(`${TWSE_OPEN}/opendata/t187ap03_L`),
    fetchJson(`${TWSE_OPEN}/exchangeReport/MI_MARGN`),
    fetchJson(`${TPEX_OPEN}/tpex_mainboard_daily_close_quotes`),
    fetchJson(`${TPEX_OPEN}/tpex_mainboard_peratio_analysis`),
    fetchJson(`${TPEX_OPEN}/mopsfin_t187ap03_O`),
    fetchJson(`${TPEX_OPEN}/tpex_mainboard_margin_balance`),
    fetchJson(`${TPEX_OPEN}/tpex_3insti_daily_trading`),
    fetchEdge("?type=stocks", 20_000),
  ]);

  const twseOpenPricePayload = fulfilled(initial[0], []);
  const twseOpenPrices = rows(twseOpenPricePayload);
  const twseOpenValuationPayload = fulfilled(initial[1], []);
  const twseOpenValuations = rows(twseOpenValuationPayload);
  const twseCompanies = rows(fulfilled(initial[2], []));
  const twseOpenMargin = rows(fulfilled(initial[3], []));
  const tpexPricePayload = fulfilled(initial[4], []);
  const tpexPrices = rows(tpexPricePayload);
  const tpexValuationPayload = fulfilled(initial[5], []);
  const tpexValuations = rows(tpexValuationPayload);
  const tpexCompanies = rows(fulfilled(initial[6], []));
  const tpexMarginPayload = fulfilled(initial[7], []);
  const tpexMargin = rows(tpexMarginPayload);
  const tpexInstitutionalPayload = fulfilled(initial[8], []);
  const tpexInstitutional = rows(tpexInstitutionalPayload);
  const edge = fulfilled(initial[9], null);
  const edgeStocks =
    edge && Array.isArray(edge.stocks)
      ? edge.stocks.map((stock) => ({
          ...stock,
          symbol: text(stock.symbol),
          instrumentType:
            stock.instrumentType || instrumentTypeOf(text(stock.symbol)),
        }))
      : [];

  const openTwsePriceDate = payloadDate(twseOpenPricePayload, twseOpenPrices);
  const tpexPriceDate = payloadDate(tpexPricePayload, tpexPrices);
  const tpexMarginDate = payloadDate(tpexMarginPayload, tpexMargin);
  const targetDate = latestDate(tpexPriceDate, openTwsePriceDate);
  const target = queryDate(targetDate);
  const marginTarget = queryDate(tpexMarginDate);

  const refreshed = await Promise.allSettled([
    target
      ? fetchJson(
          `${TWSE_WEB}/rwd/zh/afterTrading/MI_INDEX?date=${target}&type=ALLBUT0999&response=json`,
          24_000,
        )
      : Promise.resolve(null),
    target
      ? fetchJson(
          `${TWSE_WEB}/rwd/zh/afterTrading/BWIBBU_d?date=${target}&selectType=ALL&response=json`,
          20_000,
        )
      : Promise.resolve(null),
    marginTarget
      ? fetchJson(
          `${TWSE_WEB}/rwd/zh/marginTrading/MI_MARGN?date=${marginTarget}&selectType=STOCK&response=json`,
          20_000,
        )
      : Promise.resolve(null),
    target
      ? fetchJson(
          `${TWSE_WEB}/rwd/zh/fund/T86?date=${target}&response=json&selectType=ALLBUT0999`,
          45_000,
        )
      : Promise.resolve(null),
  ]);

  const currentTwsePricePayload = fulfilled(refreshed[0], null);
  const currentTwsePrices = rowsFromNamedTable(
    currentTwsePricePayload,
    "每日收盤行情",
  );
  const twsePrices =
    currentTwsePrices.length >= 20 ? currentTwsePrices : twseOpenPrices;
  const twsePriceDate =
    currentTwsePrices.length >= 20
      ? payloadDate(currentTwsePricePayload, currentTwsePrices)
      : openTwsePriceDate;

  const currentTwseValuationPayload = fulfilled(refreshed[1], null);
  const currentTwseValuations = rows(currentTwseValuationPayload);
  const twseValuations =
    currentTwseValuations.length >= 20
      ? currentTwseValuations
      : twseOpenValuations;
  const twseValuationDate =
    currentTwseValuations.length >= 20
      ? payloadDate(currentTwseValuationPayload, currentTwseValuations)
      : payloadDate(twseOpenValuationPayload, twseOpenValuations);

  const currentTwseMarginPayload = fulfilled(refreshed[2], null);
  const currentTwseMargin = twseMarginRows(currentTwseMarginPayload);
  const twseMargin =
    currentTwseMargin.length >= 20 ? currentTwseMargin : twseOpenMargin;
  const twseMarginDate =
    currentTwseMargin.length >= 20
      ? payloadDate(currentTwseMarginPayload, currentTwseMargin)
      : "";

  const refreshedTwseInstitutionalPayload = fulfilled(
    refreshed[3],
    null,
  );
  const refreshedTwseInstitutional = rows(refreshedTwseInstitutionalPayload);
  const twseInstitutional = refreshedTwseInstitutional;
  const twseInstitutionalDate =
    refreshedTwseInstitutional.length >= 20
      ? payloadDate(refreshedTwseInstitutionalPayload, refreshedTwseInstitutional)
      : "";

  if (
    twsePrices.length < 20 &&
    tpexPrices.length < 20 &&
    edgeStocks.length < 20
  ) {
    throw new Error("TWSE、TPEx 與備援來源目前皆無法取得盤後資料");
  }

  const edgeMap = new Map(
    edgeStocks.map((row) => [text(pick(row, "symbol", "Code", "股票代號")), row]),
  );
  const listedMaps = {
    valuations: mapBySymbol(twseValuations),
    companies: mapBySymbol(twseCompanies),
    institutional: mapBySymbol(twseInstitutional),
    margin: mapBySymbol(twseMargin),
  };
  const otcMaps = {
    valuations: mapBySymbol(tpexValuations),
    companies: mapBySymbol(tpexCompanies),
    institutional: mapBySymbol(tpexInstitutional),
    margin: mapBySymbol(tpexMargin),
  };
  const listed = twsePrices
    .map((row) =>
      officialStock(row, "上市", listedMaps, edgeMap.get(symbolOf(row)) || {}),
    )
    .filter(Boolean);
  const otc = tpexPrices
    .map((row) =>
      officialStock(row, "上櫃", otcMaps, edgeMap.get(symbolOf(row)) || {}),
    )
    .filter(Boolean);
  const official = [...listed, ...otc];
  const officialSymbols = new Set(official.map((stock) => stock.symbol));
  const fallbackOnly = edgeStocks.filter(
    (stock) =>
      isSupportedSymbol(text(stock.symbol)) &&
      !officialSymbols.has(text(stock.symbol)),
  );
  const stocks = official.length >= 20 ? [...official, ...fallbackOnly] : edgeStocks;
  const instruments = {
    listed: stocks.filter(
      (stock) => stock.market === "上市" && stock.instrumentType !== "ETF",
    ).length,
    otc: stocks.filter(
      (stock) => stock.market === "上櫃" && stock.instrumentType !== "ETF",
    ).length,
    etf: stocks.filter((stock) => stock.instrumentType === "ETF").length,
  };

  const tpexValuationDate = payloadDate(
    tpexValuationPayload,
    tpexValuations,
  );
  const tpexInstitutionalDate = payloadDate(
    tpexInstitutionalPayload,
    tpexInstitutional,
  );
  const twseCompanyDate = dateText(pick(twseCompanies[0], "出表日期", "Date"));
  const tpexCompanyDate = dateText(pick(tpexCompanies[0], "Date", "出表日期"));
  const priceDate =
    latestDate(twsePriceDate, tpexPriceDate) ||
    text(edge?.date) ||
    new Date().toISOString().slice(0, 10);
  const bothMarkets = listed.length >= 20 && otc.length >= 20;

  return {
    ...(edge || {}),
    stocks,
    date: priceDate,
    mode: bothMarkets ? "live" : "partial",
    markets: {
      listed: listed.length,
      otc: otc.length,
      fallback: fallbackOnly.length,
    },
    instruments,
    dates: {
      price: {
        twse: twsePriceDate,
        tpex: tpexPriceDate,
        latest: priceDate,
      },
      valuation: {
        twse: twseValuationDate,
        tpex: tpexValuationDate,
        latest: latestDate(twseValuationDate, tpexValuationDate),
      },
      institutional: {
        twse: twseInstitutionalDate,
        tpex: tpexInstitutionalDate,
        latest: latestDate(twseInstitutionalDate, tpexInstitutionalDate),
      },
      margin: {
        twse: twseMarginDate,
        tpex: tpexMarginDate,
        latest: latestDate(twseMarginDate, tpexMarginDate),
      },
      company: {
        twse: twseCompanyDate,
        tpex: tpexCompanyDate,
        latest: latestDate(twseCompanyDate, tpexCompanyDate),
      },
    },
    sourceStatus: {
      price: `TWSE ${twsePriceDate || "日期未提供"} · TPEx ${tpexPriceDate || "日期未提供"}`,
      valuation: `TWSE ${twseValuationDate || "日期未提供"} · TPEx ${tpexValuationDate || "日期未提供"}`,
      company: `MOPS 上市 ${twseCompanies.length} 筆 · 上櫃 ${tpexCompanies.length} 筆`,
      institutional: `TWSE ${twseInstitutionalDate || "日期未提供"} · TPEx ${tpexInstitutionalDate || "日期未提供"}`,
      margin: `TWSE ${twseMarginDate || "日期未提供"} · TPEx ${tpexMarginDate || "日期未提供"}`,
      extended:
        edgeStocks.length >= 20 ? "Supabase Edge 備援已連線" : "官方來源模式",
    },
  };
}

function revenueFundamental(row) {
  const symbol = symbolOf(row);
  if (!isCompanySymbol(symbol)) return null;
  const rev = numeric(
    pick(
      row,
      "營業收入-去年同月增減(%)",
      "去年同月增減(%)",
      "去年同月增減百分比",
      "IncreaseDecreasePercentage",
      "YoY",
    ),
  );
  const revYtd = numeric(
    pick(
      row,
      "累計營業收入-前期比較增減(%)",
      "前期比較增減(%)",
      "累計營收前期比較增減(%)",
      "CumulativeIncreaseDecreasePercentage",
      "YTD",
    ),
  );
  return {
    symbol,
    revenue: numeric(
      pick(
        row,
        "營業收入-當月營收",
        "當月營收",
        "CurrentMonthRevenue",
        "RevenueCurrentMonth",
      ),
    ),
    revenuePreviousMonth: numeric(
      pick(
        row,
        "營業收入-上月營收",
        "上月營收",
        "PreviousMonthRevenue",
      ),
    ),
    revenueLastYearMonth: numeric(
      pick(
        row,
        "營業收入-去年當月營收",
        "去年當月營收",
        "SameMonthLastYearRevenue",
      ),
    ),
    revenueYtd: numeric(
      pick(
        row,
        "累計營業收入-當月累計營收",
        "當月累計營收",
        "CumulativeRevenueCurrentMonth",
      ),
    ),
    revenueLastYearYtd: numeric(
      pick(
        row,
        "累計營業收入-去年累計營收",
        "去年累計營收",
        "CumulativeRevenueLastYear",
      ),
    ),
    rev,
    revMom: numeric(
      pick(
        row,
        "營業收入-上月比較增減(%)",
        "上月比較增減(%)",
        "上月比較增減百分比",
        "PreviousMonthIncreaseDecreasePercentage",
        "MoM",
      ),
    ),
    revYtd,
    revAcceleration:
      rev == null || revYtd == null ? null : Number((rev - revYtd).toFixed(4)),
    revPeriod: periodText(row),
  };
}

function quarterText(row) {
  const year = numeric(pick(row, "年度", "Year"));
  const quarter = numeric(pick(row, "季別", "季", "Quarter", "Season"));
  if (year != null && quarter != null) {
    return `${year < 1911 ? year + 1911 : year} Q${quarter}`;
  }
  return periodText(row);
}

function ratio(amount, base) {
  return amount == null || base == null || base === 0 ? null : (amount / base) * 100;
}

function financialFundamental(row, balance, category) {
  const symbol = symbolOf(row);
  if (!/^\d{4}$/.test(symbol)) return null;
  const operatingRevenue = numeric(
    pick(row, "營業收入", "營業收入合計", "OperatingRevenue", "收益", "收入"),
  );
  const grossProfit = numeric(
    pick(
      row,
      "營業毛利（毛損）淨額",
      "營業毛利（毛損）",
      "營業毛利(毛損)",
      "GrossProfitLoss",
    ),
  );
  const operatingIncome = numeric(
    pick(
      row,
      "營業利益（損失）",
      "營業利益(損失)",
      "營業利益",
      "OperatingIncomeLoss",
    ),
  );
  const netIncome = numeric(
    pick(
      row,
      "本期淨利（淨損）",
      "本期稅後淨利（淨損）",
      "本期稅後純益（純損）",
      "本期稅後淨利(淨損)",
      "ProfitLoss",
    ),
  );
  const assets = numeric(
    pick(balance, "資產總額", "資產總計", "Assets", "TotalAssets"),
  );
  const liabilities = numeric(
    pick(balance, "負債總額", "負債總計", "Liabilities", "TotalLiabilities"),
  );
  const equity = numeric(
    pick(balance, "權益總額", "權益總計", "Equity", "TotalEquity"),
  );
  const quarter = numeric(pick(row, "季別", "季", "Quarter", "Season"));
  const annualizer = quarter && quarter >= 1 && quarter <= 4 ? 4 / quarter : 1;
  const roe = netIncome != null && equity ? (netIncome / equity) * 100 * annualizer : null;
  return {
    symbol,
    eps: numeric(
      pick(
        row,
        "基本每股盈餘（元）",
        "基本每股盈餘",
        "基本每股盈餘(元)",
        "BasicEarningsPerShare",
      ),
    ),
    roe,
    roeEstimated: roe == null ? null : true,
    grossMargin: ratio(grossProfit, operatingRevenue),
    operatingMargin: ratio(operatingIncome, operatingRevenue),
    netMargin: ratio(netIncome, operatingRevenue),
    debt: ratio(liabilities, assets),
    equityRatio: ratio(equity, assets),
    roePeriod: quarterText(row),
    financialFormat: category,
  };
}

function mergeFundamentals(official, edgeRows) {
  const merged = new Map();
  edgeRows.forEach((row) => {
    const symbol = text(row.symbol);
    if (symbol) merged.set(symbol, { ...row, symbol });
  });
  official.forEach((row) => {
    if (!row?.symbol) return;
    const available = Object.fromEntries(
      Object.entries(row).filter(
        ([, value]) => value !== null && value !== undefined && value !== "",
      ),
    );
    merged.set(row.symbol, { ...(merged.get(row.symbol) || {}), ...available });
  });
  return [...merged.values()];
}

async function buildRevenue() {
  const settled = await Promise.allSettled([
    fetchJson(`${TWSE_OPEN}/opendata/t187ap05_L`, 20_000),
    fetchJson(`${TPEX_OPEN}/mopsfin_t187ap05_O`, 20_000),
    fetchEdge("?type=revenue", 20_000),
  ]);
  const listedPayload = fulfilled(settled[0], []);
  const otcPayload = fulfilled(settled[1], []);
  const listed = rows(listedPayload);
  const otc = rows(otcPayload);
  const edge = fulfilled(settled[2], null);
  const edgeRows = edge && Array.isArray(edge.fundamentals) ? edge.fundamentals : [];
  const official = [...listed, ...otc].map(revenueFundamental).filter(Boolean);
  if (official.length < 20 && edgeRows.length < 20) {
    throw new Error("公開資訊觀測站月營收資料暫時無法取得");
  }
  const fundamentals =
    official.length >= 20 ? mergeFundamentals(official, edgeRows) : edgeRows;
  const period =
    fundamentals
      .map((row) => text(row.revPeriod))
      .filter(Boolean)
      .sort()
      .at(-1) || text(edge?.period);
  const listedPublished = payloadDate(listedPayload, listed);
  const otcPublished = payloadDate(otcPayload, otc);
  return {
    ...(edge || {}),
    fundamentals,
    period,
    publishedAt: latestDate(listedPublished, otcPublished),
    dates: {
      period,
      published: {
        twse: listedPublished,
        tpex: otcPublished,
        latest: latestDate(listedPublished, otcPublished),
      },
    },
    source: "MOPS / TWSE / TPEx",
    sourceStatus: {
      listed: listed.length >= 20 ? "TWSE MOPS 官方" : "備援",
      otc: otc.length >= 20 ? "TPEx MOPS 官方" : "備援",
    },
  };
}

async function buildFinancials() {
  const requests = [];
  for (const category of FINANCIAL_CATEGORIES) {
    requests.push(
      {
        market: "listed",
        statement: "income",
        category,
        promise: fetchJson(
          `${TWSE_OPEN}/opendata/t187ap06_L_${category}`,
          24_000,
        ),
      },
      {
        market: "listed",
        statement: "balance",
        category,
        promise: fetchJson(
          `${TWSE_OPEN}/opendata/t187ap07_L_${category}`,
          24_000,
        ),
      },
      {
        market: "otc",
        statement: "income",
        category,
        promise: fetchJson(
          `${TPEX_OPEN}/mopsfin_t187ap06_O_${category}`,
          24_000,
        ),
      },
      {
        market: "otc",
        statement: "balance",
        category,
        promise: fetchJson(
          `${TPEX_OPEN}/mopsfin_t187ap07_O_${category}`,
          24_000,
        ),
      },
    );
  }
  const settled = await Promise.allSettled([
    ...requests.map((request) => request.promise),
    fetchEdge("?type=financials", 24_000),
  ]);
  const incomeRows = [];
  const balanceMap = new Map();
  const publicationDates = { listed: [], otc: [] };
  const counts = { listedIncome: 0, listedBalance: 0, otcIncome: 0, otcBalance: 0 };

  requests.forEach((request, index) => {
    const payload = fulfilled(settled[index], []);
    const data = rows(payload).filter((row) => isCompanySymbol(symbolOf(row)));
    const date = payloadDate(payload, data);
    if (date) publicationDates[request.market].push(date);
    if (request.statement === "income") {
      data.forEach((row) => incomeRows.push({ row, category: request.category }));
      counts[request.market === "listed" ? "listedIncome" : "otcIncome"] += data.length;
    } else {
      data.forEach((row) => balanceMap.set(symbolOf(row), row));
      counts[request.market === "listed" ? "listedBalance" : "otcBalance"] += data.length;
    }
  });

  const edge = fulfilled(settled.at(-1), null);
  const edgeRows = edge && Array.isArray(edge.fundamentals) ? edge.fundamentals : [];
  const official = incomeRows
    .map(({ row, category }) =>
      financialFundamental(row, balanceMap.get(symbolOf(row)), category),
    )
    .filter(Boolean);
  if (official.length < 20 && edgeRows.length < 20) {
    throw new Error("公開資訊觀測站財報資料暫時無法取得");
  }
  const fundamentals =
    official.length >= 20 ? mergeFundamentals(official, edgeRows) : edgeRows;
  const period =
    fundamentals
      .map((row) => text(row.roePeriod))
      .filter(Boolean)
      .sort()
      .at(-1) || text(edge?.period);
  const listedPublished = latestDate(publicationDates.listed);
  const otcPublished = latestDate(publicationDates.otc);
  return {
    ...(edge || {}),
    fundamentals,
    period,
    publishedAt: latestDate(listedPublished, otcPublished),
    dates: {
      period,
      published: {
        twse: listedPublished,
        tpex: otcPublished,
        latest: latestDate(listedPublished, otcPublished),
      },
    },
    source: "MOPS / TWSE / TPEx",
    sourceStatus: {
      listed:
        counts.listedIncome >= 20 && counts.listedBalance >= 20
          ? `TWSE MOPS 六類財報 ${counts.listedIncome} 檔`
          : "備援",
      otc:
        counts.otcIncome >= 20 && counts.otcBalance >= 20
          ? `TPEx MOPS 六類財報 ${counts.otcIncome} 檔`
          : "備援",
      formats: "一般業、金控、銀行、證券、保險及異業",
    },
  };
}

function sourcesPayload() {
  return {
    version: VERSION,
    auditedAt: "2026-07-13",
    freshnessPolicy:
      "以各來源實際回傳日期為準；上市行情優先使用指定交易日的 TWSE 盤後介面，OpenAPI 僅作備援。",
    requestPolicy: {
      parallelPerSource: "1–2",
      minimumGap: "1.2–1.8 秒",
      retries: "429、逾時及 5xx 最多重試 2 次並指數退避",
      history: "只逐步補抓目前分組前段候選，不做全市場逐檔請求",
    },
    sources: [
      {
        id: "twse",
        name: "臺灣證券交易所盤後介面／OpenAPI／T86",
        coverage: ["上市行情", "估值", "三大法人", "融資融券", "公司資料"],
      },
      {
        id: "tpex",
        name: "證券櫃檯買賣中心 OpenAPI",
        coverage: ["上櫃行情", "估值", "三大法人", "融資融券", "公司資料"],
      },
      {
        id: "mops",
        name: "公開資訊觀測站開放資料",
        coverage: ["上市櫃月營收", "六類綜合損益表", "六類資產負債表"],
      },
      {
        id: "supabase",
        name: "既有資料備援",
        coverage: ["歷史日線", "官方來源失效備援"],
      },
    ],
    failOpen: true,
  };
}

function healthPayload() {
  return {
    ok: true,
    service: "台股智選",
    version: VERSION,
    integrations: [
      "TWSE 指定交易日盤後資料 / OpenAPI / T86",
      "TPEx OpenAPI",
      "MOPS 六類損益與資產負債資料",
      "Supabase Edge 備援",
    ],
    markets: ["上市股票", "上櫃股票", "ETF"],
    rankingGroups: {
      listed: "上市股票獨立排名",
      otc: "上櫃股票獨立排名",
      etf: "ETF 獨立排名，不使用公司月營收與 ROE",
    },
  };
}

function jsonResponse(payload, init = {}, cacheSeconds = 0) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  if (cacheSeconds > 0) {
    headers.set(
      "vercel-cdn-cache-control",
      `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${Math.max(cacheSeconds, 600)}`,
    );
  }
  return new Response(JSON.stringify(payload), { ...init, headers });
}

async function handleMarketData(request, url = new URL(request.url)) {
  const type = url.searchParams.get("type") || "stocks";
  const force = url.searchParams.get("refresh") === "1";
  try {
    if (type === "sources") return jsonResponse(sourcesPayload(), {}, 3_600);
    if (type === "revenue") {
      if (!force && revenueCache?.expires > Date.now()) {
        return jsonResponse(revenueCache.payload, {}, 21_600);
      }
      const payload = await buildRevenue();
      revenueCache = { payload, expires: Date.now() + 21_600_000 };
      return jsonResponse(payload, {}, force ? 0 : 21_600);
    }
    if (type === "financials") {
      if (!force && financialCache?.expires > Date.now()) {
        return jsonResponse(financialCache.payload, {}, 21_600);
      }
      const payload = await buildFinancials();
      financialCache = { payload, expires: Date.now() + 21_600_000 };
      return jsonResponse(payload, {}, force ? 0 : 21_600);
    }
    if (type !== "stocks") {
      const forwarded = new URLSearchParams(url.searchParams);
      forwarded.delete("_");
      forwarded.delete("refresh");
      const payload = await fetchEdge(`?${forwarded.toString()}`);
      return jsonResponse(payload, {}, force ? 0 : 3_600);
    }
    if (!force && stockCache?.expires > Date.now()) {
      return jsonResponse(stockCache.payload, {}, 120);
    }
    const payload = await buildStocks();
    stockCache = { payload, expires: Date.now() + 120_000 };
    return jsonResponse(payload, {}, force ? 0 : 120);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "資料取得失敗" },
      { status: 502 },
    );
  }
}


function securityHeaders(contentType,cache="public, max-age=3600"){
  return {
    "content-type":contentType,
    "cache-control":cache,
    "x-content-type-options":"nosniff",
    "referrer-policy":"strict-origin-when-cross-origin",
    "permissions-policy":"camera=(), microphone=(), geolocation=()"
  };
}

export default {
  async fetch(request){
    const url=new URL(request.url);
    const path=url.pathname;
    if(path==="/api/market-data")return handleMarketData(request,url);
    if(path==="/api/health")return Response.json(healthPayload(),{headers:{"cache-control":"no-store, max-age=0"}});
    if(path==="/")return new Response(PAGE,{headers:{
      ...securityHeaders("text/html; charset=utf-8","no-cache, no-store, must-revalidate"),
      "content-security-policy":"default-src 'self'; connect-src 'self' https://lfkdkdyaatdlizryiyon.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    }});
    if(path==="/app.js")return new Response(APP,{headers:securityHeaders("text/javascript; charset=utf-8")});
    if(path==="/patch.js")return new Response(PATCH,{headers:securityHeaders("text/javascript; charset=utf-8")});
    if(path==="/smart.js")return new Response(SMART,{headers:securityHeaders("text/javascript; charset=utf-8")});
    if(path==="/styles.css")return new Response(STYLES,{headers:securityHeaders("text/css; charset=utf-8")});
    if(path==="/manifest.webmanifest")return new Response(MANIFEST,{headers:securityHeaders("application/manifest+json; charset=utf-8")});
    if(path==="/icon.svg")return new Response(ICON,{headers:securityHeaders("image/svg+xml; charset=utf-8")});
    if(path==="/sw.js")return new Response(SERVICE_WORKER,{headers:securityHeaders("text/javascript; charset=utf-8","no-cache, no-store, must-revalidate")});
    return new Response("Not found",{status:404,headers:securityHeaders("text/plain; charset=utf-8","no-store")});
  }
};
