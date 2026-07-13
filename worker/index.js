const PAGE="<!doctype html>\n<html lang=\"zh-Hant-TW\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n  <meta name=\"theme-color\" content=\"#071018\">\n  <meta name=\"description\" content=\"台股官方盤後資料智能選股、多因子趨勢預測、歷史驗證與投資紀錄工具\">\n  <link rel=\"manifest\" href=\"/manifest.webmanifest?v=15.4\">\n  <link rel=\"icon\" href=\"/icon.svg?v=15.4\" type=\"image/svg+xml\">\n  <link rel=\"stylesheet\" href=\"/styles.css?v=15.4\">\n  <title>台股智選</title>\n</head>\n<body>\n  <header class=\"topbar\">\n    <div><h1>台股智選</h1><div id=\"marketDate\" class=\"sub\">正在核對官方資料日期…</div></div>\n    <div class=\"top-actions\"><span id=\"dataMode\" class=\"badge\">資料載入中</span><button id=\"accountBtn\" class=\"account-btn\" type=\"button\">登入</button></div>\n  </header>\n  <main id=\"app\" class=\"app-shell\"></main>\n  <nav class=\"bottom-nav\" aria-label=\"主要功能\">\n    <button type=\"button\" data-tab=\"home\" class=\"active\"><span>⌂</span>首頁</button>\n    <button type=\"button\" data-tab=\"opportunities\"><span>◆</span>智能選股</button>\n    <button type=\"button\" data-tab=\"forecast\"><span>⌁</span>趨勢預測</button>\n    <button type=\"button\" data-tab=\"verify\"><span>✓</span>預測驗證</button>\n    <button type=\"button\" data-tab=\"mine\"><span>◎</span>我的</button>\n  </nav>\n  <div id=\"modalRoot\"></div>\n  <script src=\"/app.js?v=15.4\" defer></script>\n  <script src=\"/patch.js?v=15.4\" defer></script>\n  <script src=\"/smart.js?v=15.4\" defer></script>\n</body>\n</html>\n";
const APP="'use strict';\n\nconst EDGE='/api/market-data';\nconst SUPABASE_URL='https://lfkdkdyaatdlizryiyon.supabase.co';\nconst SUPABASE_KEY='sb_publishable_r3h9eQIYdIqScvmc77avAg_OLgBT6lh';\nconst MODEL_VERSION='v15.4-multifactor';\nconst DISCLAIMER='未來漲跌預測是依公開資料、技術指標與固定權重計算的機率估計，僅供研究參考，不構成投資建議、買賣邀約或獲利保證。模型可能因突發消息、流動性、資料延遲及市場情緒而失準，投資人應自行判斷並承擔風險。';\n\nconst S={\n  tab:'home',stocks:[],mode:'loading',date:'',fundStatus:'loading',fundPeriod:'',loading:true,\n  historyCache:new Map(),backtestCache:new Map(),detailSymbol:null,forecastQuery:'',verifyQuery:'',verifySymbol:'',\n  mineSub:'watch',session:null,dataStatus:{},sourceDates:{},fundDates:{},syncState:'本機模式'\n};\n\nconst app=document.querySelector('#app');\nconst modalRoot=document.querySelector('#modalRoot');\nconst q=(s,r=document)=>r.querySelector(s);\nconst qa=(s,r=document)=>[...r.querySelectorAll(s)];\nconst clamp=(v,min,max)=>Math.max(min,Math.min(max,v));\nconst safe=v=>v==null||Number.isNaN(Number(v))?null:Number(v);\nconst fmt=(v,d=2)=>v==null||Number.isNaN(Number(v))?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d});\nconst pct=(v,d=2)=>v==null||Number.isNaN(Number(v))?'—':`${v>0?'+':''}${fmt(v,d)}%`;\nconst cls=v=>v>0?'up':v<0?'down':'neutral';\nconst today=()=>new Date().toISOString().slice(0,10);\nconst uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;\nconst esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst reasonDash=reason=>`—（${reason}）`;\n\nfunction readLocal(key,fallback=[]){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}\nfunction writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}\nfunction getWatchlist(){return readLocal('twss-watchlist-v15',[])}\nfunction setWatchlist(v){writeLocal('twss-watchlist-v15',v)}\nfunction getPredictions(){return readLocal('twss-predictions-v15',[])}\nfunction setPredictions(v){writeLocal('twss-predictions-v15',v)}\nfunction getJournal(){return readLocal('twss-journal-v15',[])}\nfunction setJournal(v){writeLocal('twss-journal-v15',v)}\nfunction isWatched(symbol){return getWatchlist().some(x=>x.symbol===symbol)}\n\nasync function fetchJson(url,timeout=22000){\n  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);\n  const requestUrl=url.startsWith('/api/')?`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`:url;\n  try{const r=await fetch(requestUrl,{cache:'no-store',signal:controller.signal,headers:{accept:'application/json','cache-control':'no-cache'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}\n}\n\nfunction normalizeStock(item){return{\n  symbol:'',name:'',industry:'未分類',market:'上市',close:null,change:null,open:null,high:null,low:null,\n  volume:null,value:null,transactions:null,pe:null,pb:null,yield:null,revenue:null,rev:null,revMom:null,revYtd:null,revPeriod:null,\n  eps:null,roe:null,roeEstimated:false,roePeriod:null,grossMargin:null,operatingMargin:null,netMargin:null,debt:null,equityRatio:null,\n  foreign:null,trust:null,dealer:null,inst:null,marginBalance:null,marginChange:null,shortBalance:null,shortChange:null,disp:null,full:null,demo:false,\n  ...item,symbol:String(item.symbol||'')\n}}\n\nasync function loadStocks(){\n  S.loading=true;render();\n  try{\n    const payload=await fetchJson(`${EDGE}?type=stocks`,24000);\n    if(!Array.isArray(payload.stocks)||payload.stocks.length<20)throw new Error(payload.error||'盤後資料筆數不足');\n    S.stocks=payload.stocks.map(normalizeStock);S.mode=payload.mode||'partial';S.date=payload.date||today();S.dataStatus=payload.sourceStatus||{};S.sourceDates=payload.dates||{};S.loading=false;\n    q('#marketDate').textContent=`最新交易日 ${S.date} · 盤後資料（非即時）`;\n    q('#dataMode').textContent=S.mode==='live'?'官方日期已核對':S.mode==='partial'?'部分官方資料':'資料不足';\n    render();loadFundamentals();\n  }catch(error){\n    S.loading=false;app.innerHTML=`<div class=\"card error-card\"><h3>股票資料載入失敗</h3><p class=\"muted\">${esc(error.message)}</p><button id=\"retryLoad\" class=\"btn\">重新載入</button></div>`;q('#retryLoad').onclick=loadStocks;\n  }\n}\n\nasync function loadFundamentals(){\n  S.fundStatus='loading';render();\n  const settled=await Promise.allSettled([fetchJson(`${EDGE}?type=revenue`,32000),fetchJson(`${EDGE}?type=financials`,36000)]);\n  const merged=new Map();let revenueOk=false,financialOk=false;const periods=[];\n  settled.forEach((result,index)=>{\n    if(result.status!=='fulfilled')return;const payload=result.value||{},rows=payload.fundamentals||[];\n    if(index===0&&rows.some(x=>x.rev!=null))revenueOk=true;\n    if(index===1&&rows.some(x=>x.roe!=null||x.eps!=null))financialOk=true;\n    if(payload.period)periods.push(payload.period);\n    if(payload.dates)S.fundDates[index===0?'revenue':'financials']=payload.dates;\n    rows.forEach(row=>merged.set(String(row.symbol),{...(merged.get(String(row.symbol))||{}),...row}));\n  });\n  S.stocks=S.stocks.map(stock=>({...stock,...(merged.get(stock.symbol)||{})}));\n  S.fundStatus=revenueOk&&financialOk?'ready':revenueOk||financialOk?'partial':'error';\n  S.fundPeriod=periods.sort().at(-1)||'';render();\n  if(S.detailSymbol)openDetail(S.detailSymbol,false);\n}\n\nasync function getHistory(symbol){\n  const cached=S.historyCache.get(symbol);if(cached)return cached instanceof Promise?cached:Promise.resolve(cached);\n  const promise=(async()=>{const payload=await fetchJson(`${EDGE}?type=history&symbol=${encodeURIComponent(symbol)}&months=12`,42000);if(!Array.isArray(payload.history)||payload.history.length<20)throw new Error(payload.error||'歷史日線不足');const rows=payload.history.map(x=>({date:x.date,open:safe(x.open),high:safe(x.high),low:safe(x.low),close:safe(x.close),volume:safe(x.volume),value:safe(x.value),transactions:safe(x.transactions)})).filter(x=>x.close!=null&&x.high!=null&&x.low!=null);const result={rows,indicators:computeIndicators(rows),source:payload.source||'TWSE'};S.historyCache.set(symbol,result);return result})();\n  S.historyCache.set(symbol,promise);try{return await promise}catch(error){S.historyCache.delete(symbol);throw error}\n}\n\n/* Supabase auth and optional cloud sync */\nconst SESSION_KEY='twss-supabase-session-v15';\nfunction storeSession(session){S.session=session;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);q('#accountBtn').textContent=session?'帳戶':'登入'}\nasync function sb(path,options={}){\n  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};\n  if(options.auth!==false&&S.session?.access_token)headers.Authorization=`Bearer ${S.session.access_token}`;\n  const r=await fetch(SUPABASE_URL+path,{method:options.method||'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body),cache:'no-store'});\n  let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return data;\n}\nasync function refreshSession(){\n  if(!S.session)return false;if((S.session.expires_at||0)>Date.now()/1000+90)return true;\n  if(!S.session.refresh_token){storeSession(null);return false}\n  try{const s=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:S.session.refresh_token},auth:false});s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);return true}catch{storeSession(null);return false}\n}\nasync function login(email,password){const s=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},auth:false});s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);await cloudPull()}\nasync function signup(email,password){const s=await sb(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin)}`,{method:'POST',body:{email,password},auth:false});if(s?.access_token){s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);await cloudPull();return true}return false}\nasync function cloudPull(){\n  if(!await refreshSession())return;S.syncState='同步中…';\n  try{\n    const [pred,journal]=await Promise.all([\n      sb('/rest/v1/prediction_logs?select=*&order=prediction_date.desc'),\n      sb('/rest/v1/investment_journal?select=*&order=entry_date.desc')\n    ]);\n    if(pred?.length)setPredictions(pred.map(x=>({...x,local_id:x.id})));\n    if(journal?.length)setJournal(journal.map(x=>({...x,local_id:x.id})));\n    S.syncState='雲端已同步';render();\n  }catch(e){S.syncState=`同步失敗：${e.message}`}\n}\nasync function upsertPredictionCloud(record){if(!await refreshSession())return;const body={user_id:S.session.user?.id||decodeJwtSub(S.session.access_token),symbol:record.symbol,stock_name:record.stock_name,prediction_date:record.prediction_date,horizon_days:record.horizon_days,reference_price:record.reference_price,predicted_direction:record.predicted_direction,up_probability:record.up_probability,neutral_probability:record.neutral_probability,down_probability:record.down_probability,confidence:record.confidence,expected_low:record.expected_low,expected_high:record.expected_high,model_version:record.model_version,factors:record.factors,evaluated_at:record.evaluated_at||null,actual_price:record.actual_price??null,actual_return_pct:record.actual_return_pct??null,actual_direction:record.actual_direction||null,is_correct:record.is_correct??null};await sb('/rest/v1/prediction_logs?on_conflict=user_id,symbol,prediction_date,horizon_days,model_version',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body})}\nasync function upsertJournalCloud(record){if(!await refreshSession())return;const userId=S.session.user?.id||decodeJwtSub(S.session.access_token);const body={user_id:userId,symbol:record.symbol,stock_name:record.stock_name,entry_date:record.entry_date,action:record.action,price:record.price??null,quantity:record.quantity??null,horizon:record.horizon||null,thesis:record.thesis||null,risk_plan:record.risk_plan||null,target_plan:record.target_plan||null,emotion:record.emotion||null,followed_plan:record.followed_plan??null,exit_price:record.exit_price??null,exit_date:record.exit_date||null,return_pct:record.return_pct??null,result_note:record.result_note||null,tags:record.tags||[]};if(record.id&&String(record.id).includes('-'))await sb(`/rest/v1/investment_journal?id=eq.${record.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body});else await sb('/rest/v1/investment_journal',{method:'POST',headers:{Prefer:'return=minimal'},body})}\nfunction decodeJwtSub(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{return null}}\nasync function initSession(){try{S.session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{S.session=null}q('#accountBtn').textContent=S.session?'帳戶':'登入';if(S.session&&await refreshSession()){try{S.session.user=await sb('/auth/v1/user');storeSession(S.session)}catch{}cloudPull()}}\n\nfunction mean(values){const v=values.filter(x=>x!=null&&Number.isFinite(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}\nfunction sma(values,period){return values.length>=period?mean(values.slice(-period)):null}\nfunction emaSeries(values,period){if(!values.length)return[];const m=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*m+out[i-1]*(1-m));return out}\nfunction std(values){const m=mean(values);return m==null?null:Math.sqrt(mean(values.map(v=>(v-m)**2)))}\nfunction calcRsi(values,period=14){if(values.length<=period)return null;const changes=values.slice(1).map((v,i)=>v-values[i]);let gains=0,losses=0;for(const c of changes.slice(0,period)){if(c>0)gains+=c;else losses-=c}let avgGain=gains/period,avgLoss=losses/period;for(const c of changes.slice(period)){avgGain=(avgGain*(period-1)+Math.max(c,0))/period;avgLoss=(avgLoss*(period-1)+Math.max(-c,0))/period}if(avgLoss===0)return 100;return 100-100/(1+avgGain/avgLoss)}\nfunction calcAtr(rows,period=14){if(rows.length<=period)return null;const tr=rows.slice(1).map((r,i)=>Math.max(r.high-r.low,Math.abs(r.high-rows[i].close),Math.abs(r.low-rows[i].close)));return mean(tr.slice(-period))}\nfunction computeIndicators(rows){\n  const closes=rows.map(r=>r.close).filter(v=>v!=null),volumes=rows.map(r=>r.volume).filter(v=>v!=null);if(closes.length<20)return null;\n  const ma5=sma(closes,5),ma20=sma(closes,20),ma60=sma(closes,60),ema12=emaSeries(closes,12),ema26=emaSeries(closes,26);\n  const macdSeries=closes.map((_,i)=>(ema12[i]??0)-(ema26[i]??0)),signalSeries=emaSeries(macdSeries,9);\n  const macd=macdSeries.at(-1),signal=signalSeries.at(-1),histogram=macd-signal,rsi14=calcRsi(closes,14),atr14=calcAtr(rows,14),last=closes.at(-1);\n  const w20=closes.slice(-20),mid=mean(w20),dev=std(w20),upper=mid==null||dev==null?null:mid+2*dev,lower=mid==null||dev==null?null:mid-2*dev;\n  const momentum5=closes.length>5?(last/closes.at(-6)-1)*100:null,momentum20=closes.length>20?(last/closes.at(-21)-1)*100:null;\n  const volume5=sma(volumes,5),volume20=sma(volumes,20),volumeRatio=volume5!=null&&volume20?volume5/volume20:null;\n  const recent=rows.slice(-20),support=recent.length?Math.min(...recent.map(r=>r.low)):null,resistance=recent.length?Math.max(...recent.map(r=>r.high)):null;\n  return{ma5,ma20,ma60,rsi14,atr14,atrPct:atr14&&last?atr14/last*100:null,macd,signal,histogram,bollingerUpper:upper,bollingerMiddle:mid,bollingerLower:lower,momentum5,momentum20,volume5,volume20,volumeRatio,support,resistance,last,rows:rows.length}\n}\n\nfunction calculateForecast(stock,indicators){\n  let technical=0,fundamental=0,chip=0,valuation=0,riskPenalty=0;const positive=[],negative=[],missing=[];\n  if(indicators){\n    if(stock.close>indicators.ma5){technical+=7;positive.push('股價站上 5 日均線')}else technical-=5;\n    if(indicators.ma5!=null&&indicators.ma20!=null&&indicators.ma5>indicators.ma20){technical+=10;positive.push('短期均線偏多')}else technical-=7;\n    if(indicators.ma20!=null&&indicators.ma60!=null){if(indicators.ma20>indicators.ma60){technical+=13;positive.push('20 日均線高於 60 日均線')}else{technical-=11;negative.push('中期均線偏弱')}}else missing.push('60 日均線');\n    if(indicators.histogram!=null){if(indicators.histogram>0){technical+=10;positive.push('MACD 柱狀體為正')}else{technical-=10;negative.push('MACD 柱狀體為負')}}\n    if(indicators.rsi14!=null){if(indicators.rsi14>=50&&indicators.rsi14<=68)technical+=8;else if(indicators.rsi14>75){technical-=9;riskPenalty+=7;negative.push('RSI 過熱')}else if(indicators.rsi14<35){technical-=4;riskPenalty+=4;negative.push('RSI 偏弱')}}\n    if(indicators.momentum5!=null)technical+=clamp(indicators.momentum5*1.2,-10,10);\n    if(indicators.momentum20!=null)technical+=clamp(indicators.momentum20*.6,-12,12);\n    if(indicators.volumeRatio!=null){if(indicators.volumeRatio>1.15&&(stock.change||0)>0){technical+=6;positive.push('量價同步')}if(indicators.volumeRatio>1.5&&(stock.change||0)<0){technical-=7;negative.push('下跌放量')}}\n    if(indicators.atrPct!=null&&indicators.atrPct>5){riskPenalty+=9;negative.push('短線波動較大')}\n  }else missing.push('歷史價格與技術指標');\n  if(stock.rev!=null){if(stock.rev>=30){fundamental+=20;positive.push('月營收年增強勁')}else if(stock.rev>=10)fundamental+=13;else if(stock.rev>0)fundamental+=5;else{fundamental-=10;negative.push('月營收年增為負')}}else missing.push('月營收年增率');\n  if(stock.revMom!=null)fundamental+=clamp(stock.revMom*.25,-7,7);\n  if(stock.revYtd!=null)fundamental+=clamp(stock.revYtd*.18,-6,8);\n  if(stock.roe!=null){if(stock.roe>=15){fundamental+=14;positive.push('ROE 表現佳')}else if(stock.roe>=8)fundamental+=8;else if(stock.roe<0)fundamental-=10}else missing.push('ROE');\n  if(stock.eps!=null)fundamental+=stock.eps>0?6:-8;else missing.push('EPS');\n  if(stock.operatingMargin!=null)fundamental+=stock.operatingMargin>10?5:stock.operatingMargin<0?-7:1;\n  if(stock.debt!=null){if(stock.debt>75){fundamental-=7;riskPenalty+=5;negative.push('負債比偏高')}else if(stock.debt<50)fundamental+=3}else missing.push('負債比');\n  if(stock.pe!=null&&stock.pe>0){if(stock.pe<=15)valuation+=12;else if(stock.pe<=25)valuation+=7;else if(stock.pe<=35)valuation+=2;else{valuation-=7;negative.push('本益比偏高')}}else missing.push('本益比');\n  if(stock.pb!=null)valuation+=stock.pb<=2?5:stock.pb<=3?2:stock.pb>6?-4:0;\n  if(stock.yield!=null&&stock.yield>=3)valuation+=3;\n  if(stock.foreign!=null){if(stock.foreign>0){chip+=10;positive.push('外資買超')}else if(stock.foreign<0)chip-=8}else missing.push('外資買賣超');\n  if(stock.trust!=null)chip+=stock.trust>0?7:stock.trust<0?-5:0;if(stock.dealer!=null)chip+=stock.dealer>0?3:stock.dealer<0?-2:0;\n  if(stock.marginChange!=null&&stock.marginChange>0&&(stock.change||0)<0){chip-=4;riskPenalty+=3;negative.push('下跌且融資增加')}\n  const tn=clamp(technical,-55,55),fn=clamp(fundamental,-35,35),cn=clamp(chip,-20,20),vn=clamp(valuation,-15,15);\n  const composite=tn*.52+fn*.26+cn*.15+vn*.07-riskPenalty*.35;\n  const neutralProbability=clamp(29-Math.abs(composite)*.25+(indicators?.atrPct>5?5:0),12,38),directional=100-neutralProbability,upShare=1/(1+Math.exp(-composite/11));\n  let up=Math.round(directional*upShare),down=Math.round(directional-directional*upShare),neutral=100-up-down;\n  const available=[stock.rev,stock.revMom,stock.roe,stock.eps,stock.pe,stock.pb,stock.debt,stock.foreign,indicators?.ma20,indicators?.rsi14,indicators?.macd,indicators?.atrPct].filter(v=>v!=null).length;\n  const completeness=Math.round(available/12*100),confidence=clamp(Math.round(completeness*.78+Math.min(Math.abs(composite),30)*.55-riskPenalty),25,90);\n  const shortLabel=up>=down+12?'短期偏多':down>=up+12?'短期偏空':'短期震盪';\n  const mediumScore=(indicators?.ma20&&indicators?.ma60?(indicators.ma20>indicators.ma60?18:-18):0)+fn*.55+vn*.2+cn*.25;\n  const mediumLabel=mediumScore>=10?'中期偏多':mediumScore<=-10?'中期偏空':'中期盤整';\n  const atrPct=indicators?.atrPct??Math.max(2,Math.abs(stock.change||0)*.8),expectedMove5=clamp(atrPct*Math.sqrt(5)*.75,2,18);\n  return{up,down,neutral,confidence,completeness,shortLabel,mediumLabel,composite:+composite.toFixed(1),technical:+tn.toFixed(1),fundamental:+fn.toFixed(1),chip:+cn.toFixed(1),valuation:+vn.toFixed(1),riskPenalty,expectedMove5,expectedLow:stock.close*(1-expectedMove5/100),expectedHigh:stock.close*(1+expectedMove5/100),positive:[...new Set(positive)].slice(0,8),negative:[...new Set(negative)].slice(0,8),missing:[...new Set(missing)].slice(0,8)}\n}\n\nfunction opportunityScore(stock){let score=0;if(stock.rev!=null)score+=stock.rev>=30?28:stock.rev>=20?24:stock.rev>=10?20:stock.rev>0?10:0;if(stock.revMom!=null)score+=stock.revMom>=10?10:stock.revMom>0?6:0;if(stock.revYtd!=null)score+=stock.revYtd>=10?7:stock.revYtd>0?3:0;if(stock.roe!=null)score+=stock.roe>=15?15:stock.roe>=10?12:stock.roe>=8?8:0;if(stock.eps!=null&&stock.eps>0)score+=5;if(stock.pe!=null&&stock.pe>0)score+=stock.pe<=15?10:stock.pe<=25?7:stock.pe<=35?3:0;if(stock.pb!=null)score+=stock.pb<=2?4:stock.pb<=3?2:0;if(stock.foreign>0)score+=6;if(stock.trust>0)score+=4;if((stock.volume||0)>=1000)score+=6;else if((stock.volume||0)>=500)score+=3;if(stock.debt!=null&&stock.debt<=55)score+=3;return Math.min(100,Math.round(score))}\nfunction opportunityEligible(stock){return stock.rev!=null&&stock.rev>=10&&(stock.volume||0)>=500&&(stock.pe==null||(stock.pe>0&&stock.pe<=35))&&(stock.roe==null||stock.roe>=8)&&stock.disp!==true&&stock.full!==true}\n\nfunction marketEnvironment(){\n  const tradable=S.stocks.filter(x=>x.change!=null),up=tradable.filter(x=>x.change>0).length,down=tradable.filter(x=>x.change<0).length,flat=tradable.length-up-down;\n  const avgChange=mean(tradable.map(x=>x.change))||0,totalVolume=S.stocks.reduce((a,x)=>a+(x.volume||0),0),foreign=S.stocks.reduce((a,x)=>a+(x.foreign||0),0),inst=S.stocks.reduce((a,x)=>a+(x.inst||0),0);\n  const breadth=tradable.length?up/tradable.length*100:0;\n  const label=breadth>=60&&avgChange>0?'市場偏多':breadth<=40&&avgChange<0?'市場偏空':'市場震盪';\n  const confidence=clamp(Math.round(Math.abs(breadth-50)*1.3+Math.abs(avgChange)*8),30,85);\n  const industries=[...new Set(S.stocks.map(x=>x.industry).filter(Boolean))].map(industry=>{\n    const rows=S.stocks.filter(x=>x.industry===industry),valid=rows.filter(x=>x.change!=null);return{industry,count:rows.length,avgChange:mean(valid.map(x=>x.change))||0,breadth:valid.length?valid.filter(x=>x.change>0).length/valid.length*100:0,rev:mean(rows.map(x=>x.rev)),foreign:rows.reduce((a,x)=>a+(x.foreign||0),0)}\n  }).filter(x=>x.count>=3).sort((a,b)=>(b.avgChange+b.breadth/100)-(a.avgChange+a.breadth/100));\n  return{up,down,flat,avgChange,totalVolume,foreign,inst,breadth,label,confidence,industries}\n}\n\nfunction percentile(values,value,higherIsBetter=true){const v=values.filter(x=>x!=null&&Number.isFinite(x));if(!v.length||value==null)return null;const rank=v.filter(x=>higherIsBetter?x<=value:x>=value).length;return Math.round(rank/v.length*100)}\nfunction peerComparison(stock){\n  let peers=S.stocks.filter(x=>x.industry===stock.industry&&x.symbol!==stock.symbol);if(peers.length<4)peers=S.stocks.filter(x=>x.market===stock.market&&x.symbol!==stock.symbol);\n  const rows=[\n    ['月營收年增',stock.rev,peers.map(x=>x.rev),true,'%'],['ROE',stock.roe,peers.map(x=>x.roe),true,'%'],['本益比',stock.pe,peers.map(x=>x.pe),false,''],['殖利率',stock.yield,peers.map(x=>x.yield),true,'%'],['外資買賣超',stock.foreign,peers.map(x=>x.foreign),true,' 張'],['單日漲跌',stock.change,peers.map(x=>x.change),true,'%']\n  ].map(([label,value,values,higher,suffix])=>({label,value,median:median(values),percentile:percentile(values,value,higher),suffix,higher}));\n  return{peerCount:peers.length,rows}\n}\nfunction median(values){const v=values.filter(x=>x!=null&&Number.isFinite(x)).sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}\n\nfunction nextRevenueWindow(){const now=new Date(),next=new Date(now.getFullYear(),now.getMonth()+1,1);return`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')} 上旬`}\nfunction buildEvents(stock,indicators){\n  const events=[{icon:'◷',title:'下次月營收觀察窗口',detail:nextRevenueWindow(),level:'info'}];\n  if(stock.rev!=null&&stock.rev<0)events.push({icon:'!',title:'營收年增轉負',detail:`最新月營收年增 ${pct(stock.rev)}`,level:'bad'});\n  if(stock.revMom!=null&&stock.revMom<=-15)events.push({icon:'!',title:'單月營收明顯下滑',detail:`月增率 ${pct(stock.revMom)}`,level:'bad'});\n  if(Math.abs(stock.change||0)>=5)events.push({icon:'↕',title:'單日價格波動較大',detail:`今日漲跌 ${pct(stock.change)}`,level:'warn'});\n  if(indicators?.volumeRatio>=1.5)events.push({icon:'▥',title:'成交量明顯放大',detail:`5 日／20 日量能比 ${fmt(indicators.volumeRatio)} 倍`,level:'warn'});\n  if(indicators?.rsi14>=70)events.push({icon:'▲',title:'RSI 進入偏熱區',detail:`RSI ${fmt(indicators.rsi14)}`,level:'warn'});\n  if(indicators?.rsi14<=30)events.push({icon:'▼',title:'RSI 進入偏弱區',detail:`RSI ${fmt(indicators.rsi14)}`,level:'bad'});\n  if(stock.foreign!=null&&stock.foreign<-1000)events.push({icon:'外',title:'外資當日賣超',detail:`${fmt(stock.foreign,0)} 張`,level:'bad'});\n  if(stock.marginChange!=null&&stock.marginChange>0&&(stock.change||0)<0)events.push({icon:'融',title:'下跌伴隨融資增加',detail:`融資增減 ${fmt(stock.marginChange,0)} 張`,level:'warn'});\n  if(indicators?.resistance&&stock.close>=indicators.resistance*.98)events.push({icon:'壓',title:'接近 20 日壓力',detail:`壓力約 ${fmt(indicators.resistance)} 元`,level:'warn'});\n  if(indicators?.support&&stock.close<=indicators.support*1.02)events.push({icon:'撐',title:'接近 20 日支撐',detail:`支撐約 ${fmt(indicators.support)} 元`,level:'bad'});\n  if(stock.disp===true)events.push({icon:'處',title:'處置股票',detail:'交易限制可能影響流動性',level:'bad'});\n  if(stock.full===true)events.push({icon:'全',title:'全額交割股票',detail:'交易風險較高',level:'bad'});\n  return events;\n}\n\nfunction scenarioAnalysis(stock,forecast,indicators){\n  const atr=indicators?.atrPct??forecast.expectedMove5/Math.sqrt(5)/.75;\n  const support=indicators?.support??stock.close*(1-forecast.expectedMove5/100),resistance=indicators?.resistance??stock.close*(1+forecast.expectedMove5/100);\n  return[\n    {type:'good',title:'樂觀情境',prob:forecast.up,range:[Math.max(stock.close,resistance*.99),stock.close*(1+clamp(forecast.expectedMove5*1.15,3,22)/100)],trigger:'突破壓力、量能維持，法人籌碼未轉弱'},\n    {type:'base',title:'中性情境',prob:forecast.neutral,range:[stock.close*(1-clamp(atr*.7,1.5,8)/100),stock.close*(1+clamp(atr*.7,1.5,8)/100)],trigger:'量價與籌碼缺乏明確方向，維持區間震盪'},\n    {type:'bad',title:'悲觀情境',prob:forecast.down,range:[stock.close*(1-clamp(forecast.expectedMove5*1.2,3,24)/100),Math.min(stock.close,support*1.01)],trigger:'跌破支撐、下跌放量或法人轉為持續賣超'}\n  ]\n}\n\nfunction directionFromReturn(ret){return ret>1.5?'up':ret<-1.5?'down':'neutral'}\nfunction directionFromForecast(f){return f.up>=f.down+12?'up':f.down>=f.up+12?'down':'neutral'}\nfunction recordPrediction(stock,forecast){\n  const list=getPredictions(),key=`${stock.symbol}-${today()}-5-${MODEL_VERSION}`;if(list.some(x=>x.key===key))return;\n  const rec={key,local_id:uid(),symbol:stock.symbol,stock_name:stock.name,prediction_date:today(),horizon_days:5,reference_price:stock.close,predicted_direction:directionFromForecast(forecast),up_probability:forecast.up,neutral_probability:forecast.neutral,down_probability:forecast.down,confidence:forecast.confidence,expected_low:forecast.expectedLow,expected_high:forecast.expectedHigh,model_version:MODEL_VERSION,factors:{technical:forecast.technical,fundamental:forecast.fundamental,chip:forecast.chip,valuation:forecast.valuation,completeness:forecast.completeness},created_at:new Date().toISOString()};\n  list.unshift(rec);setPredictions(list);upsertPredictionCloud(rec).catch(()=>{});\n}\nfunction evaluatePredictionsForSymbol(symbol,history){\n  const list=getPredictions();let changed=false;\n  list.forEach(rec=>{\n    if(rec.symbol!==symbol||rec.evaluated_at)return;const startIndex=history.findIndex(r=>r.date>=rec.prediction_date);if(startIndex<0||history.length<=startIndex+5)return;const actual=history[startIndex+5],ret=(actual.close/rec.reference_price-1)*100,dir=directionFromReturn(ret);Object.assign(rec,{evaluated_at:new Date().toISOString(),actual_price:actual.close,actual_return_pct:+ret.toFixed(2),actual_direction:dir,is_correct:dir===rec.predicted_direction});changed=true;upsertPredictionCloud(rec).catch(()=>{})\n  });if(changed)setPredictions(list)\n}\n\nfunction runTechnicalBacktest(stock,history){\n  const key=`${stock.symbol}-${history.at(-1)?.date||''}`;if(S.backtestCache.has(key))return S.backtestCache.get(key);\n  const samples=[];\n  for(let i=60;i<history.length-5;i+=5){const slice=history.slice(0,i+1),ind=computeIndicators(slice);if(!ind)continue;const historicalStock={...stock,close:slice.at(-1).close,change:slice.length>1?(slice.at(-1).close/slice.at(-2).close-1)*100:0,rev:null,revMom:null,revYtd:null,roe:null,eps:null,operatingMargin:null,debt:null,pe:null,pb:null,yield:null,foreign:null,trust:null,dealer:null,marginChange:null};const f=calculateForecast(historicalStock,ind),pred=directionFromForecast(f),future=history[i+5],ret=(future.close/slice.at(-1).close-1)*100,actual=directionFromReturn(ret);samples.push({date:slice.at(-1).date,pred,actual,ret:+ret.toFixed(2),correct:pred===actual,confidence:f.confidence})}\n  const correct=samples.filter(x=>x.correct).length,returns=samples.map(x=>x.ret),result={samples,count:samples.length,hitRate:samples.length?correct/samples.length*100:null,avgReturn:mean(returns),avgWin:mean(samples.filter(x=>x.ret>0).map(x=>x.ret)),avgLoss:mean(samples.filter(x=>x.ret<0).map(x=>x.ret))};S.backtestCache.set(key,result);return result\n}\n\nfunction statusCard(){\n  const rev=S.stocks.filter(x=>x.rev!=null).length,fin=S.stocks.filter(x=>x.roe!=null||x.eps!=null).length,chip=S.stocks.filter(x=>x.foreign!=null||x.inst!=null).length;\n  const c=S.fundStatus==='ready'?'ok':S.fundStatus==='error'?'bad':'';const label=S.fundStatus==='ready'?'基本面已更新':S.fundStatus==='partial'?'部分基本面資料':S.fundStatus==='error'?'基本面暫缺':'基本面載入中';\n  return`<div class=\"card data-health\"><div><b>資料完整度</b><div class=\"muted\">月營收 ${rev} 檔 · 財報 ${fin} 檔 · 法人 ${chip} 檔${S.fundPeriod?` · ${S.fundPeriod}`:''}</div></div><span class=\"status-pill ${c}\">${label}</span></div>`\n}\nfunction disclaimer(){return`<div class=\"disclaimer\">${DISCLAIMER}</div>`}\nfunction metric(label,value,note=''){return`<div class=\"metric\"><small>${label}</small><b>${value}</b>${note?`<em>${note}</em>`:''}</div>`}\nfunction valueOrReason(v,suffix='',reason='API 未回傳'){return v==null?reasonDash(reason):`${fmt(v)}${suffix}`}\nfunction sourceDateSummary(){\n  const dates=S.sourceDates||{},price=dates.price?.latest||S.date||'—',institutional=dates.institutional?.latest||'尚未提供',margin=dates.margin?.latest||'尚未提供';\n  return`行情 ${price} · 法人 ${institutional} · 融資券 ${margin}`\n}\n\nfunction homePage(){\n  const env=marketEnvironment(),rank=(title,rows,value)=>`<div class=\"card\"><h3>${title}</h3><div class=\"rank-list\">${rows.slice(0,5).map((s,i)=>`<div class=\"rank clickable\" data-detail=\"${s.symbol}\"><b>${i+1}</b><span><b>${s.name}</b><small class=\"muted\"> ${s.symbol}</small></span><b class=\"${cls(s.change)}\">${value(s)}</b></div>`).join('')}</div></div>`;\n  const rev=[...S.stocks].filter(x=>x.rev!=null).sort((a,b)=>b.rev-a.rev),inst=[...S.stocks].filter(x=>x.inst!=null).sort((a,b)=>b.inst-a.inst),opp=[...S.stocks].filter(opportunityEligible).sort((a,b)=>opportunityScore(b)-opportunityScore(a));\n  return`<h2>盤後市場儀表板</h2><div class=\"muted\">官方盤後資料整理，不是即時報價。</div>\n  <div class=\"grid\">${metric('最新日期',S.date||'—')}${metric('上市櫃股票',fmt(S.stocks.length,0))}</div>\n  <div class=\"card accent\"><div class=\"head\"><div><small class=\"muted\">大盤環境</small><div class=\"price\">${env.label}</div><div class=\"muted\">上漲 ${env.up} · 下跌 ${env.down} · 平盤 ${env.flat}</div></div><div><small class=\"muted\">多頭家數比</small><div class=\"score\">${fmt(env.breadth,0)}%</div><div class=\"muted\">平均漲跌 ${pct(env.avgChange)}</div></div></div><div class=\"grid\" style=\"margin-top:10px\">${metric('市場成交量',`${fmt(env.totalVolume,0)} 張`)}${metric('外資合計',`${fmt(env.foreign,0)} 張`)}${metric('三大法人合計',`${fmt(env.inst,0)} 張`)}${metric('環境信心',`${env.confidence}%`)}</div></div>\n  ${statusCard()}\n  <div class=\"card\"><h3>產業相對強弱</h3><div class=\"rank-list\">${env.industries.slice(0,6).map((x,i)=>`<div class=\"rank\"><b>${i+1}</b><span><b>${x.industry}</b><small class=\"muted\"> ${x.count} 檔 · 上漲家數 ${fmt(x.breadth,0)}%</small></span><b class=\"${cls(x.avgChange)}\">${pct(x.avgChange)}</b></div>`).join('')}</div></div>\n  ${rank('機會分數排行',opp,s=>`${opportunityScore(s)} 分`)}${rank('月營收年增排行',rev,s=>pct(s.rev))}${rank('三大法人買超排行',inst,s=>`${fmt(s.inst,0)} 張`)}${disclaimer()}`\n}\n\nfunction opportunityCard(stock){\n  return`<article class=\"card accent clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b>${stock.name}</b><div class=\"muted\">${stock.symbol} · ${stock.industry}</div></div><div><small class=\"muted\">機會分數</small><div class=\"score\">${opportunityScore(stock)}</div></div></div><div><span class=\"price\">${fmt(stock.close)}</span> <b class=\"${cls(stock.change)}\">${pct(stock.change)}</b></div><div class=\"grid\">${metric('月營收年增',pct(stock.rev),stock.revPeriod||'最新公開月')}${metric('月營收月增',pct(stock.revMom))}${metric(stock.roeEstimated?'年化推估 ROE':'ROE',stock.roe==null?reasonDash('API 未回傳'):`${fmt(stock.roe)}%`,stock.roePeriod||'')}${metric('本益比',valueOrReason(stock.pe))}</div><div class=\"rules\" style=\"margin-top:10px\"><span>成交量 ${fmt(stock.volume,0)} 張</span>${stock.foreign!=null?`<span>外資 ${fmt(stock.foreign,0)} 張</span>`:''}<span>${stock.industry}</span></div><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn grow\" data-forecast=\"${stock.symbol}\">深度預測</button><button class=\"btn secondary\" data-watch=\"${stock.symbol}\">${isWatched(stock.symbol)?'★ 已自選':'＋自選'}</button></div></article>`\n}\nfunction opportunitiesPage(){\n  const selected=S.stocks.filter(opportunityEligible).sort((a,b)=>opportunityScore(b)-opportunityScore(a));\n  return`<h2>機會股</h2><p class=\"muted\">月營收成長為核心，再綜合財報品質、估值、法人與流動性固定計分。</p><div class=\"card\"><h3>固定門檻</h3><div class=\"rules\"><span>月營收年增 ≥ 10%</span><span>成交量 ≥ 500 張</span><span>本益比 ≤ 35</span><span>ROE ≥ 8%（有資料時）</span><span>排除已確認風險股</span></div></div>${statusCard()}${selected.length?`<div class=\"list two-col\">${selected.map(opportunityCard).join('')}</div>`:`<div class=\"card empty\"><h3>目前沒有完整符合條件的股票</h3><p class=\"muted\">可能是資料仍在載入，或目前沒有股票同時達到固定門檻。</p></div>`}${disclaimer()}`\n}\n\nfunction stockSearchResults(query,attr){\n  const text=query.trim().toLowerCase();if(!text)return'';const rows=S.stocks.filter(x=>x.symbol.includes(text)||x.name.toLowerCase().includes(text)).slice(0,12);\n  return rows.length?`<div class=\"search-results\">${rows.map(x=>`<button class=\"search-result\" ${attr}=\"${x.symbol}\"><span><b>${x.name}</b><small class=\"muted\"> ${x.symbol} · ${x.industry}</small></span><span class=\"${cls(x.change)}\">${pct(x.change)}</span></button>`).join('')}</div>`:'<div class=\"muted\" style=\"margin-top:10px\">找不到符合的股票</div>'\n}\nfunction forecastPage(){\n  const top=[...S.stocks].filter(x=>x.rev!=null).sort((a,b)=>opportunityScore(b)-opportunityScore(a)).slice(0,8);\n  return`<h2>未來漲跌預測</h2><p class=\"muted\">整合歷史日線、MA、RSI、MACD、布林通道、ATR、量價、基本面、法人籌碼、大盤與產業環境。</p><div class=\"notice\"><b>僅供參考使用</b><br>${DISCLAIMER}</div><div class=\"card\"><h3>搜尋股票</h3><div class=\"search-row\"><input id=\"forecastSearch\" value=\"${esc(S.forecastQuery)}\" placeholder=\"輸入代號或名稱，例如 3702 大聯大\"><button id=\"forecastSearchBtn\" class=\"btn\">搜尋</button></div>${stockSearchResults(S.forecastQuery,'data-forecast')}</div><div class=\"card\"><h3>優先分析清單</h3><div class=\"rank-list\">${top.map((x,i)=>`<div class=\"rank clickable\" data-forecast=\"${x.symbol}\"><b>${i+1}</b><span><b>${x.name}</b><small class=\"muted\"> ${x.symbol}</small></span><b>${opportunityScore(x)} 分</b></div>`).join('')}</div></div>${disclaimer()}`\n}\n\nfunction predictionStats(){\n  const rows=getPredictions(),evaluated=rows.filter(x=>x.evaluated_at),recent30=evaluated.filter(x=>(Date.now()-new Date(x.prediction_date).getTime())<=30*864e5),recent90=evaluated.filter(x=>(Date.now()-new Date(x.prediction_date).getTime())<=90*864e5);\n  const rate=list=>list.length?list.filter(x=>x.is_correct).length/list.length*100:null;\n  return{rows,evaluated,rate30:rate(recent30),rate90:rate(recent90),pending:rows.filter(x=>!x.evaluated_at).length}\n}\nfunction verifyPage(){\n  const stats=predictionStats(),selected=S.verifySymbol?S.stocks.find(x=>x.symbol===S.verifySymbol):null,cached=selected?[...S.backtestCache.entries()].find(([k])=>k.startsWith(selected.symbol+'-'))?.[1]:null;\n  return`<h2>預測驗證</h2><p class=\"muted\">保存每次預測，五個交易日後比對實際結果；另提供不使用未來資料的技術面走勢回測。</p><div class=\"stat-strip\">${metric('已評估',fmt(stats.evaluated.length,0))}${metric('待評估',fmt(stats.pending,0))}${metric('近 30 日命中率',stats.rate30==null?'尚無樣本':`${fmt(stats.rate30,1)}%`)}${metric('近 90 日命中率',stats.rate90==null?'尚無樣本':`${fmt(stats.rate90,1)}%`)}</div>\n  <div class=\"card\"><h3>選擇股票進行歷史驗證</h3><div class=\"search-row\"><input id=\"verifySearch\" value=\"${esc(S.verifyQuery)}\" placeholder=\"股票代號或名稱\"><button id=\"verifySearchBtn\" class=\"btn\">搜尋</button></div>${stockSearchResults(S.verifyQuery,'data-verify')}</div>\n  ${selected?`<div class=\"card accent\"><div class=\"head\"><div><h3>${selected.name} ${selected.symbol}</h3><div class=\"muted\">技術面走勢回測，每 5 個交易日取樣一次</div></div><button class=\"btn small-btn\" id=\"runBacktest\" data-symbol=\"${selected.symbol}\">${cached?'重新回測':'開始回測'}</button></div>${cached?backtestHtml(cached):'<div class=\"muted\">按下開始回測後，會讀取近 12 個月日線並驗證方向。</div>'}</div>`:''}\n  <div class=\"card\"><h3>最近預測紀錄</h3>${stats.rows.length?`<div class=\"table-wrap\"><table><thead><tr><th>股票／日期</th><th>預測</th><th>信心</th><th>實際</th><th>結果</th></tr></thead><tbody>${stats.rows.slice(0,30).map(x=>`<tr><td>${x.stock_name||x.symbol}<br><small class=\"muted\">${x.prediction_date}</small></td><td>${directionLabel(x.predicted_direction)}</td><td>${fmt(x.confidence,0)}%</td><td>${x.actual_return_pct==null?'待評估':pct(x.actual_return_pct)}</td><td>${x.evaluated_at?(x.is_correct?'<span class=\"tag\">正確</span>':'<span class=\"tag bad\">不符</span>'):'<span class=\"tag info\">等待中</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class=\"empty muted\">尚未產生預測紀錄。開啟任一股票的深度預測後會自動保存。</div>'}</div>\n  <div class=\"notice\">命中率只反映既有樣本，樣本不足或市場狀態改變時，不代表未來仍有相同表現。</div>${disclaimer()}`\n}\nfunction directionLabel(value){return value==='up'?'偏多':value==='down'?'偏空':'震盪'}\nfunction backtestHtml(b){return`<div class=\"grid\" style=\"margin-top:12px\">${metric('回測樣本',fmt(b.count,0))}${metric('方向命中率',b.hitRate==null?'—':`${fmt(b.hitRate,1)}%`)}${metric('樣本平均報酬',pct(b.avgReturn))}${metric('平均獲利／虧損',`${pct(b.avgWin)} / ${pct(b.avgLoss)}`)}</div><div class=\"table-wrap\" style=\"margin-top:10px\"><table><thead><tr><th>日期</th><th>預測</th><th>5 日報酬</th><th>結果</th></tr></thead><tbody>${b.samples.slice(-12).reverse().map(x=>`<tr><td>${x.date}</td><td>${directionLabel(x.pred)}</td><td class=\"${cls(x.ret)}\">${pct(x.ret)}</td><td>${x.correct?'✓':'×'}</td></tr>`).join('')}</tbody></table></div><div class=\"muted small\" style=\"margin-top:8px\">此回測只使用當時之前的價格與成交量，不套用現在的月營收或財報資料，避免偷看未來。</div>`}\n\nfunction journalStats(){const all=getJournal(),closed=all.filter(x=>x.return_pct!=null),wins=closed.filter(x=>x.return_pct>0),followed=all.filter(x=>x.followed_plan!=null);return{all,closed,winRate:closed.length?wins.length/closed.length*100:null,avgReturn:mean(closed.map(x=>x.return_pct)),followRate:followed.length?followed.filter(x=>x.followed_plan).length/followed.length*100:null}}\nfunction minePage(){\n  return`<h2>我的</h2><div class=\"segmented\"><button data-mine=\"watch\" class=\"${S.mineSub==='watch'?'active':''}\">自選清單</button><button data-mine=\"journal\" class=\"${S.mineSub==='journal'?'active':''}\">投資紀錄</button></div>${S.mineSub==='watch'?watchSection():journalSection()}${disclaimer()}`\n}\nfunction watchSection(){\n  const items=getWatchlist();\n  const rows=items.map(item=>({item,stock:S.stocks.find(x=>x.symbol===item.symbol)})).filter(x=>x.stock);\n  if(!rows.length)return '<div class=\"card empty\"><h3>尚未加入自選股票</h3><p class=\"muted\">可在機會股或股票詳細頁加入。</p></div>';\n  return `<div class=\"list two-col\">${rows.map(({item,stock})=>{\n    const gain=item.addedPrice&&stock.close?(stock.close/item.addedPrice-1)*100:null;\n    return `<div class=\"card clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b>${stock.name}</b><div class=\"muted\">${stock.symbol} · ${stock.industry}</div></div><button class=\"icon-btn\" data-watch=\"${stock.symbol}\">移除</button></div><div class=\"grid\">${metric('目前價格',fmt(stock.close))}${metric('加入後漲跌',`<span class=\"${cls(gain)}\">${pct(gain)}</span>`)}${metric('月營收年增',pct(stock.rev))}${metric('機會分數',opportunityScore(stock))}</div><button class=\"btn\" data-forecast=\"${stock.symbol}\" style=\"width:100%;margin-top:10px\">查看趨勢預測</button></div>`;\n  }).join('')}</div>`;\n}\nfunction journalSection(){\n  const stats=journalStats();\n  const header=`<div class=\"stat-strip\">${metric('紀錄筆數',fmt(stats.all.length,0))}${metric('已完成交易',fmt(stats.closed.length,0))}${metric('勝率',stats.winRate==null?'尚無樣本':`${fmt(stats.winRate,1)}%`)}${metric('遵守計畫率',stats.followRate==null?'尚無資料':`${fmt(stats.followRate,1)}%`)}</div><div class=\"row\"><button id=\"newJournal\" class=\"btn grow\">＋新增投資紀錄</button><button id=\"exportJournal\" class=\"btn secondary\">匯出 JSON</button></div>`;\n  if(!stats.all.length)return `${header}<div class=\"card empty\"><h3>尚未建立投資紀錄</h3><p class=\"muted\">記錄當時理由、預期、風險與結果，之後才能檢查自己是否遵守計畫。</p></div>`;\n  return `${header}<div class=\"list\">${stats.all.map(x=>`<div class=\"card journal-item ${x.action}\"><div class=\"head\"><div><b>${x.stock_name||x.symbol} ${x.symbol}</b><div class=\"muted\">${x.entry_date} · ${actionLabel(x.action)} · ${horizonLabel(x.horizon)}</div></div>${x.return_pct!=null?`<b class=\"${cls(x.return_pct)}\">${pct(x.return_pct)}</b>`:''}</div>${x.thesis?`<p>${esc(x.thesis)}</p>`:''}<div class=\"rules\">${x.risk_plan?`<span>風險：${esc(x.risk_plan)}</span>`:''}${x.target_plan?`<span>目標：${esc(x.target_plan)}</span>`:''}${x.followed_plan!=null?`<span>遵守計畫：${x.followed_plan?'是':'否'}</span>`:''}</div><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn secondary\" data-edit-journal=\"${x.local_id||x.id}\">編輯</button><button class=\"btn danger\" data-delete-journal=\"${x.local_id||x.id}\">刪除</button></div></div>`).join('')}</div>`;\n}\nfunction actionLabel(a){return({observe:'觀察',buy:'買入紀錄',sell:'賣出紀錄',review:'事後檢討'})[a]||a}\nfunction horizonLabel(h){return({short:'短線 1–5 日',swing:'波段 1–4 週',medium:'中期 1–6 月',long:'長期 6 月以上'})[h]||'未設定期間'}\n\nfunction sparkline(rows){const values=rows.slice(-60).map(r=>r.close).filter(v=>v!=null);if(values.length<2)return'';const w=600,h=84,min=Math.min(...values),max=Math.max(...values),range=max-min||1;const points=values.map((v,i)=>`${i/(values.length-1)*w},${h-(v-min)/range*(h-8)-4}`).join(' '),area=`0,${h} ${points} ${w},${h}`;return`<svg class=\"sparkline\" viewBox=\"0 0 ${w} ${h}\" preserveAspectRatio=\"none\"><polygon class=\"area\" points=\"${area}\"></polygon><polyline points=\"${points}\"></polyline></svg>`}\nfunction probabilitySection(f){return`<div class=\"prob-grid\"><div class=\"prob-box\"><small class=\"muted\">上漲機率</small><b class=\"up\">${f.up}%</b><div class=\"progress\"><span class=\"bar-up\" style=\"width:${f.up}%\"></span></div></div><div class=\"prob-box\"><small class=\"muted\">震盪機率</small><b class=\"neutral\">${f.neutral}%</b><div class=\"progress\"><span class=\"bar-neutral\" style=\"width:${f.neutral}%\"></span></div></div><div class=\"prob-box\"><small class=\"muted\">下跌機率</small><b class=\"down\">${f.down}%</b><div class=\"progress\"><span class=\"bar-down\" style=\"width:${f.down}%\"></span></div></div></div>`}\nfunction factorSection(f){const rows=[['技術面',f.technical,55],['基本面',f.fundamental,35],['籌碼面',f.chip,20],['估值面',f.valuation,15]];return`<div class=\"factor-list\">${rows.map(([label,value,max])=>`<div class=\"factor\"><span>${label}</span><div class=\"track\"><span style=\"width:${clamp((value+max)/(max*2)*100,0,100)}%\"></span></div><b class=\"${cls(value)}\">${value>0?'+':''}${fmt(value,1)}</b></div>`).join('')}</div>`}\nfunction scenarioHtml(stock,forecast,indicators){return scenarioAnalysis(stock,forecast,indicators).map(s=>`<div class=\"card scenario ${s.type}\"><div class=\"head\"><div><b>${s.title}</b><div class=\"muted\">觸發條件：${s.trigger}</div></div><b>${s.prob}%</b></div><div class=\"price\">${fmt(s.range[0])}～${fmt(s.range[1])}</div><div class=\"muted\">5 個交易日情境區間，非價格保證。</div></div>`).join('')}\nfunction marketIndustryHtml(stock){const env=marketEnvironment(),industry=env.industries.find(x=>x.industry===stock.industry);return`<div class=\"grid\">${metric('大盤環境',env.label)}${metric('多頭家數比',`${fmt(env.breadth,0)}%`)}${metric(`${stock.industry}平均漲跌`,industry?pct(industry.avgChange):reasonDash('同業不足'))}${metric(`${stock.industry}上漲家數`,industry?`${fmt(industry.breadth,0)}%`:reasonDash('同業不足'))}${metric('市場外資合計',`${fmt(env.foreign,0)} 張`)}${metric('產業外資合計',industry?`${fmt(industry.foreign,0)} 張`:reasonDash('同業不足'))}</div>`}\nfunction peerHtml(stock){const peer=peerComparison(stock);return`<div class=\"card\"><div class=\"muted\">比較群組：${stock.industry}，共 ${peer.peerCount} 檔可比較股票</div>${peer.rows.map(r=>`<div class=\"peer-row\"><span>${r.label}</span><div><div class=\"peer-track\"><span style=\"width:${r.percentile??0}%\"></span></div><small class=\"muted\">同業中位數 ${r.median==null?'—':`${fmt(r.median)}${r.suffix}`}</small></div><b>${r.value==null?'—':`${fmt(r.value)}${r.suffix}`}<br><small class=\"muted\">前 ${r.percentile==null?'—':100-r.percentile+1}%</small></b></div>`).join('')}</div>`}\nfunction eventHtml(stock,indicators){const events=buildEvents(stock,indicators);return`<div class=\"card\">${events.map(e=>`<div class=\"event\"><div class=\"event-icon\">${e.icon}</div><div><b>${e.title}</b><div class=\"muted\">${e.detail}</div></div><span class=\"tag ${e.level==='bad'?'bad':e.level==='warn'?'warn':'info'}\">${e.level==='bad'?'風險':e.level==='warn'?'注意':'事件'}</span></div>`).join('')}</div>`}\n\nfunction detailHtml(stock,state){\n  const indicators=state?.indicators||null,history=state?.rows||[],forecast=calculateForecast(stock,indicators);\n  const historyLoading=state?.loading,historyError=state?.error;\n  return`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\" type=\"button\">×</button><div class=\"head\"><div><h2>${stock.name} ${stock.symbol}</h2><div class=\"muted\">${stock.market} · ${stock.industry} · 行情 ${S.sourceDates?.price?.[stock.market==='上市'?'twse':'tpex']||S.date}</div></div><button class=\"btn secondary small-btn\" data-watch=\"${stock.symbol}\">${isWatched(stock.symbol)?'★ 已自選':'☆ 加入自選'}</button></div><div><span class=\"price\">${fmt(stock.close)} 元</span> <b class=\"${cls(stock.change)}\">${pct(stock.change)}</b></div><div class=\"notice\"><b>各資料來源日期</b><br>${sourceDateSummary()}。月營收 ${S.fundDates?.revenue?.period||stock.revPeriod||'載入中'} · 財報 ${S.fundDates?.financials?.period||stock.roePeriod||'載入中'}。</div>\n  ${historyLoading?'<div class=\"card\"><div class=\"loading\"><span class=\"spinner\"></span>正在讀取歷史日線並計算技術指標…</div></div>':''}${historyError?`<div class=\"card warn-card\"><b>歷史日線暫時無法取得</b><p class=\"muted\">目前先使用基本面與籌碼進行低信心估計。${esc(historyError)}</p></div>`:''}${history.length?sparkline(history):''}\n  <h3 class=\"section-title\">未來漲跌預測（5 個交易日）</h3><div class=\"card accent\"><div class=\"head\"><div><small class=\"muted\">判斷</small><div class=\"price\">${forecast.shortLabel}</div><div class=\"muted\">中期：${forecast.mediumLabel}</div></div><div><small class=\"muted\">預測信心</small><div class=\"score\">${forecast.confidence}%</div><div class=\"muted\">資料完整度 ${forecast.completeness}%</div></div></div>${probabilitySection(forecast)}<div class=\"grid\" style=\"margin-top:10px\">${metric('5 日合理波動區間',`${fmt(forecast.expectedLow)}～${fmt(forecast.expectedHigh)}`,`推估 ±${fmt(forecast.expectedMove5,1)}%`)}${metric('綜合方向分數',`${forecast.composite>0?'+':''}${forecast.composite}`,'正值偏多、負值偏空')}</div></div><div class=\"notice\"><b>僅供參考使用</b><br>${DISCLAIMER}</div>\n  <h3 class=\"section-title\">三種情境分析</h3>${scenarioHtml(stock,forecast,indicators)}\n  <h3 class=\"section-title\">大盤與產業環境</h3><div class=\"card\">${marketIndustryHtml(stock)}</div>\n  <h3 class=\"section-title\">同業比較</h3>${peerHtml(stock)}\n  <h3 class=\"section-title\">重要事件與風險提醒</h3>${eventHtml(stock,indicators)}\n  <h3 class=\"section-title\">評估構成</h3><div class=\"card\">${factorSection(forecast)}</div><div class=\"card\"><h3>支持因素</h3>${forecast.positive.length?forecast.positive.map(x=>`<span class=\"tag\">${x}</span>`).join(''):'<span class=\"muted\">目前沒有明顯正向訊號</span>'}<h3 style=\"margin-top:14px\">風險因素</h3>${forecast.negative.length?forecast.negative.map(x=>`<span class=\"tag warn\">${x}</span>`).join(''):'<span class=\"muted\">目前沒有明顯負向訊號</span>'}<h3 style=\"margin-top:14px\">資料缺口</h3>${forecast.missing.length?forecast.missing.map(x=>`<span class=\"tag bad\">${x}</span>`).join(''):'<span class=\"tag\">主要資料完整</span>'}</div>\n  <h3 class=\"section-title\">技術面分析</h3><div class=\"grid three\">${metric('MA5',valueOrReason(indicators?.ma5))}${metric('MA20',valueOrReason(indicators?.ma20))}${metric('MA60',valueOrReason(indicators?.ma60))}${metric('RSI 14',valueOrReason(indicators?.rsi14))}${metric('MACD',valueOrReason(indicators?.macd))}${metric('MACD 柱狀體',valueOrReason(indicators?.histogram))}${metric('ATR 14',valueOrReason(indicators?.atr14),indicators?.atrPct!=null?`${fmt(indicators.atrPct)}%`:'')}${metric('量能比 5/20',valueOrReason(indicators?.volumeRatio,' 倍'))}${metric('20 日動能',valueOrReason(indicators?.momentum20,'%'))}${metric('布林上軌',valueOrReason(indicators?.bollingerUpper))}${metric('布林中軌',valueOrReason(indicators?.bollingerMiddle))}${metric('布林下軌',valueOrReason(indicators?.bollingerLower))}${metric('20 日支撐',valueOrReason(indicators?.support))}${metric('20 日壓力',valueOrReason(indicators?.resistance))}${metric('歷史日線筆數',indicators?.rows==null?reasonDash('尚未取得'):fmt(indicators.rows,0))}</div>\n  <h3 class=\"section-title\">基本面與估值</h3><div class=\"grid three\">${metric('本益比',valueOrReason(stock.pe))}${metric('股價淨值比',valueOrReason(stock.pb))}${metric('殖利率',valueOrReason(stock.yield,'%'))}${metric('當月營收',stock.revenue==null?reasonDash('API 未回傳'):`${fmt(stock.revenue/1000,0)} 百萬元`,stock.revPeriod||'')}${metric('月營收年增',pct(stock.rev))}${metric('月營收月增',pct(stock.revMom))}${metric('累計營收年增',pct(stock.revYtd))}${metric('EPS',valueOrReason(stock.eps))}${metric(stock.roeEstimated?'年化推估 ROE':'ROE',valueOrReason(stock.roe,'%'),stock.roePeriod||'')}${metric('毛利率',valueOrReason(stock.grossMargin,'%'))}${metric('營業利益率',valueOrReason(stock.operatingMargin,'%'))}${metric('淨利率',valueOrReason(stock.netMargin,'%'))}${metric('負債比',valueOrReason(stock.debt,'%'))}${metric('權益比率',valueOrReason(stock.equityRatio,'%'))}${metric('資料期間',stock.roePeriod||stock.revPeriod||'—')}</div>${stock.roeEstimated?'<div class=\"notice\">ROE 是依最新公開累計淨利與股東權益推算的年化值，並非官方直接公布的單一指標。</div>':''}\n  <h3 class=\"section-title\">籌碼與交易資訊</h3><div class=\"grid three\">${metric('外資買賣超',stock.foreign==null?reasonDash('該資料日無資料'):`${fmt(stock.foreign,0)} 張`)}${metric('投信買賣超',stock.trust==null?reasonDash('該資料日無資料'):`${fmt(stock.trust,0)} 張`)}${metric('自營商買賣超',stock.dealer==null?reasonDash('該資料日無資料'):`${fmt(stock.dealer,0)} 張`)}${metric('三大法人合計',stock.inst==null?reasonDash('該資料日無資料'):`${fmt(stock.inst,0)} 張`)}${metric('融資增減',stock.marginChange==null?reasonDash('官方未提供'):`${fmt(stock.marginChange,0)} 張`)}${metric('融資餘額',stock.marginBalance==null?reasonDash('官方未提供'):`${fmt(stock.marginBalance,0)} 張`)}${metric('融券增減',stock.shortChange==null?reasonDash('官方未提供'):`${fmt(stock.shortChange,0)} 張`)}${metric('融券餘額',stock.shortBalance==null?reasonDash('官方未提供'):`${fmt(stock.shortBalance,0)} 張`)}${metric('成交量',stock.volume==null?reasonDash('API 未回傳'):`${fmt(stock.volume,0)} 張`)}${metric('開盤',valueOrReason(stock.open))}${metric('最高',valueOrReason(stock.high))}${metric('最低',valueOrReason(stock.low))}${metric('成交金額',stock.value==null?reasonDash('API 未回傳'):`${fmt(stock.value/100000000,2)} 億元`)}${metric('成交筆數',stock.transactions==null?reasonDash('API 未回傳'):fmt(stock.transactions,0))}${metric('收盤',valueOrReason(stock.close))}</div>\n  <div class=\"row\" style=\"margin-top:16px\"><button class=\"btn grow\" data-journal-stock=\"${stock.symbol}\">新增投資紀錄</button><button class=\"btn secondary\" data-verify-stock=\"${stock.symbol}\">查看預測驗證</button></div>${disclaimer()}</div></div>`\n}\n\nasync function openDetail(symbol,loadHistory=true){\n  const stock=S.stocks.find(x=>x.symbol===symbol);if(!stock)return;S.detailSymbol=symbol;const cached=S.historyCache.get(symbol),resolved=cached&&!(cached instanceof Promise)?cached:null;\n  modalRoot.innerHTML=detailHtml(stock,resolved?{...resolved,loading:false}:{loading:loadHistory,rows:[]});bindModal();if(!loadHistory&&!cached)return;if(resolved){const f=calculateForecast(stock,resolved.indicators);recordPrediction(stock,f);evaluatePredictionsForSymbol(symbol,resolved.rows);return}\n  try{const result=await getHistory(symbol);if(S.detailSymbol!==symbol)return;modalRoot.innerHTML=detailHtml(stock,{...result,loading:false});bindModal();const f=calculateForecast(stock,result.indicators);recordPrediction(stock,f);evaluatePredictionsForSymbol(symbol,result.rows)}catch(error){if(S.detailSymbol!==symbol)return;modalRoot.innerHTML=detailHtml(stock,{loading:false,error:error.message,rows:[]});bindModal();recordPrediction(stock,calculateForecast(stock,null))}\n}\nfunction closeModal(){S.detailSymbol=null;modalRoot.innerHTML=''}\n\nfunction toggleWatch(symbol){\n  const list=getWatchlist(),index=list.findIndex(x=>x.symbol===symbol);\n  if(index>=0)list.splice(index,1);else{const stock=S.stocks.find(x=>x.symbol===symbol);list.push({symbol,addedPrice:stock?.close??null,addedAt:new Date().toISOString(),note:''})}\n  setWatchlist(list);render();if(S.detailSymbol)openDetail(S.detailSymbol,false)\n}\n\nfunction render(){\n  qa('.bottom-nav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===S.tab));\n  if(S.loading&&!S.stocks.length){app.innerHTML='<div class=\"card empty\"><div class=\"loading\"><span class=\"spinner\"></span>正在載入官方盤後資料…</div></div>';bind();return}\n  app.innerHTML=S.tab==='home'?homePage():S.tab==='opportunities'?opportunitiesPage():S.tab==='forecast'?forecastPage():S.tab==='verify'?verifyPage():minePage();bind()\n}\n\nfunction bind(){\n  qa('.bottom-nav button').forEach(button=>button.onclick=()=>{S.tab=button.dataset.tab;render()});\n  qa('[data-detail]').forEach(element=>element.onclick=event=>{if(!event.target.closest('button'))openDetail(element.dataset.detail)});\n  qa('[data-forecast]').forEach(element=>element.onclick=event=>{event.stopPropagation();openDetail(element.dataset.forecast)});\n  qa('[data-watch]').forEach(button=>button.onclick=event=>{event.stopPropagation();toggleWatch(button.dataset.watch)});\n  const forecastSearch=q('#forecastSearch');if(forecastSearch){forecastSearch.oninput=e=>S.forecastQuery=e.target.value;forecastSearch.onkeydown=e=>{if(e.key==='Enter'){S.forecastQuery=e.target.value;render()}}}\n  q('#forecastSearchBtn')?.addEventListener('click',()=>{S.forecastQuery=q('#forecastSearch')?.value||'';render()});\n  const verifySearch=q('#verifySearch');if(verifySearch){verifySearch.oninput=e=>S.verifyQuery=e.target.value;verifySearch.onkeydown=e=>{if(e.key==='Enter'){S.verifyQuery=e.target.value;render()}}}\n  q('#verifySearchBtn')?.addEventListener('click',()=>{S.verifyQuery=q('#verifySearch')?.value||'';render()});\n  qa('[data-verify]').forEach(button=>button.onclick=()=>{S.verifySymbol=button.dataset.verify;S.verifyQuery='';render()});\n  q('#runBacktest')?.addEventListener('click',async e=>{\n    const symbol=e.currentTarget.dataset.symbol,stock=S.stocks.find(x=>x.symbol===symbol);e.currentTarget.disabled=true;e.currentTarget.textContent='回測中…';\n    try{const history=await getHistory(symbol),result=runTechnicalBacktest(stock,history.rows);evaluatePredictionsForSymbol(symbol,history.rows);render()}catch(error){alert(`回測失敗：${error.message}`);render()}\n  });\n  qa('[data-mine]').forEach(button=>button.onclick=()=>{S.mineSub=button.dataset.mine;render()});\n  q('#newJournal')?.addEventListener('click',()=>openJournalModal());\n  q('#exportJournal')?.addEventListener('click',exportJournal);\n  qa('[data-edit-journal]').forEach(button=>button.onclick=()=>openJournalModal(getJournal().find(x=>String(x.local_id||x.id)===String(button.dataset.editJournal))));\n  qa('[data-delete-journal]').forEach(button=>button.onclick=()=>deleteJournal(button.dataset.deleteJournal));\n}\n\nfunction bindModal(){\n  q('.sheet-close',modalRoot)?.addEventListener('click',closeModal);\n  q('.modal',modalRoot)?.addEventListener('click',e=>{if(e.target.classList.contains('modal'))closeModal()});\n  qa('[data-watch]',modalRoot).forEach(button=>button.onclick=e=>{e.stopPropagation();toggleWatch(button.dataset.watch)});\n  qa('[data-journal-stock]',modalRoot).forEach(button=>button.onclick=()=>{const symbol=button.dataset.journalStock,stock=S.stocks.find(x=>x.symbol===symbol);openJournalModal(null,stock)});\n  qa('[data-verify-stock]',modalRoot).forEach(button=>button.onclick=()=>{S.verifySymbol=button.dataset.verifyStock;S.tab='verify';closeModal();render()});\n}\n\nfunction exportJournal(){\n  const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),journal:getJournal()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`台股智選-投資紀錄-${today()}.json`;a.click();URL.revokeObjectURL(url)\n}\nfunction deleteJournal(id){if(!confirm('確定刪除這筆紀錄？'))return;const list=getJournal().filter(x=>String(x.local_id||x.id)!==String(id));setJournal(list);render()}\n\nfunction openJournalModal(record=null,stock=null){\n  const r=record||{},selected=stock||S.stocks.find(x=>x.symbol===r.symbol),symbol=selected?.symbol||r.symbol||'',name=selected?.name||r.stock_name||'';\n  modalRoot.innerHTML=`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\" type=\"button\">×</button><h2>${record?'編輯':'新增'}投資紀錄</h2><div class=\"form-grid\">\n    <label>股票代號<input id=\"jSymbol\" value=\"${esc(symbol)}\" placeholder=\"例如 2330\"></label>\n    <label>股票名稱<input id=\"jName\" value=\"${esc(name)}\" placeholder=\"例如 台積電\"></label>\n    <label>日期<input id=\"jDate\" type=\"date\" value=\"${esc(r.entry_date||today())}\"></label>\n    <label>類型<select id=\"jAction\"><option value=\"observe\">觀察</option><option value=\"buy\">買入紀錄</option><option value=\"sell\">賣出紀錄</option><option value=\"review\">事後檢討</option></select></label>\n    <label>價格<input id=\"jPrice\" type=\"number\" step=\"0.01\" value=\"${r.price??selected?.close??''}\"></label>\n    <label>數量（股或張，自行統一）<input id=\"jQty\" type=\"number\" step=\"0.01\" value=\"${r.quantity??''}\"></label>\n    <label>預計持有時間<select id=\"jHorizon\"><option value=\"\">未設定</option><option value=\"short\">短線 1–5 日</option><option value=\"swing\">波段 1–4 週</option><option value=\"medium\">中期 1–6 月</option><option value=\"long\">長期 6 月以上</option></select></label>\n    <label>當時情緒<input id=\"jEmotion\" value=\"${esc(r.emotion||'')}\" placeholder=\"冷靜、焦慮、追高…\"></label>\n  </div>\n  <label>判斷理由<textarea id=\"jThesis\" placeholder=\"當時為什麼關注或交易？\">${esc(r.thesis||'')}</textarea></label>\n  <label>風險計畫<textarea id=\"jRisk\" placeholder=\"什麼條件代表判斷失效？\">${esc(r.risk_plan||'')}</textarea></label>\n  <label>目標計畫<textarea id=\"jTarget\" placeholder=\"原先預期的目標或觀察區間\">${esc(r.target_plan||'')}</textarea></label>\n  <div class=\"form-grid\"><label>出場價格<input id=\"jExitPrice\" type=\"number\" step=\"0.01\" value=\"${r.exit_price??''}\"></label><label>出場日期<input id=\"jExitDate\" type=\"date\" value=\"${esc(r.exit_date||'')}\"></label></div>\n  <label>結果檢討<textarea id=\"jResult\" placeholder=\"實際發生什麼？下次要改進什麼？\">${esc(r.result_note||'')}</textarea></label>\n  <label>是否遵守原本計畫<select id=\"jFollow\"><option value=\"\">尚未評估</option><option value=\"true\">有遵守</option><option value=\"false\">未遵守</option></select></label>\n  <button id=\"saveJournal\" class=\"btn\" style=\"width:100%;margin-top:12px\">儲存紀錄</button></div></div>`;\n  q('#jAction',modalRoot).value=r.action||'observe';q('#jHorizon',modalRoot).value=r.horizon||'';q('#jFollow',modalRoot).value=r.followed_plan==null?'':String(r.followed_plan);bindModal();\n  q('#saveJournal',modalRoot).onclick=async()=>{\n    const symbolValue=q('#jSymbol',modalRoot).value.trim(),price=safe(q('#jPrice',modalRoot).value),exitPrice=safe(q('#jExitPrice',modalRoot).value);if(!/^\\d{4}$/.test(symbolValue)){alert('請輸入四碼股票代號');return}\n    const item={...r,local_id:r.local_id||r.id||uid(),symbol:symbolValue,stock_name:q('#jName',modalRoot).value.trim(),entry_date:q('#jDate',modalRoot).value||today(),action:q('#jAction',modalRoot).value,price,quantity:safe(q('#jQty',modalRoot).value),horizon:q('#jHorizon',modalRoot).value||null,emotion:q('#jEmotion',modalRoot).value.trim(),thesis:q('#jThesis',modalRoot).value.trim(),risk_plan:q('#jRisk',modalRoot).value.trim(),target_plan:q('#jTarget',modalRoot).value.trim(),exit_price:exitPrice,exit_date:q('#jExitDate',modalRoot).value||null,result_note:q('#jResult',modalRoot).value.trim(),followed_plan:q('#jFollow',modalRoot).value===''?null:q('#jFollow',modalRoot).value==='true'};\n    item.return_pct=price&&exitPrice?+((exitPrice/price-1)*100).toFixed(2):r.return_pct??null;const list=getJournal(),index=list.findIndex(x=>String(x.local_id||x.id)===String(item.local_id));if(index>=0)list[index]=item;else list.unshift(item);setJournal(list);upsertJournalCloud(item).catch(()=>{});closeModal();S.tab='mine';S.mineSub='journal';render()\n  }\n}\n\nfunction openAccountModal(){\n  if(S.session){modalRoot.innerHTML=`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>雲端帳戶</h2><div class=\"card\"><b>${esc(S.session.user?.email||'已登入')}</b><p class=\"muted\">預測紀錄與投資紀錄會同步至 Supabase。自選清單目前仍保留在此裝置。</p><div class=\"row\"><button id=\"syncCloud\" class=\"btn grow\">立即同步</button><button id=\"logout\" class=\"btn danger\">登出</button></div></div><div class=\"muted\">${esc(S.syncState)}</div></div></div>`;bindModal();q('#syncCloud',modalRoot).onclick=cloudPull;q('#logout',modalRoot).onclick=()=>{storeSession(null);closeModal();render()};return}\n  modalRoot.innerHTML=`<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>登入台股智選</h2><p class=\"muted\">登入後同步預測紀錄與投資紀錄。</p><label>電子郵件<input id=\"authEmail\" type=\"email\" autocomplete=\"email\"></label><label>密碼<input id=\"authPass\" type=\"password\" autocomplete=\"current-password\" placeholder=\"至少 6 個字元\"></label><div class=\"row\" style=\"margin-top:12px\"><button id=\"loginBtn\" class=\"btn grow\">登入</button><button id=\"signupBtn\" class=\"btn secondary\">建立帳戶</button></div><div id=\"authMsg\" class=\"muted\" style=\"margin-top:10px\"></div></div></div>`;bindModal();\n  const act=async type=>{const email=q('#authEmail',modalRoot).value.trim(),password=q('#authPass',modalRoot).value,msg=q('#authMsg',modalRoot);if(!email||password.length<6){msg.textContent='請輸入有效電子郵件，密碼至少 6 個字元。';return}msg.textContent='處理中…';try{if(type==='login'){await login(email,password);closeModal();render()}else{const ok=await signup(email,password);msg.textContent=ok?'帳戶已建立並登入':'驗證信已寄出，完成驗證後再登入。'}}catch(e){msg.textContent=e.message}};\n  q('#loginBtn',modalRoot).onclick=()=>act('login');q('#signupBtn',modalRoot).onclick=()=>act('signup')\n}\n\ndocument.querySelector('#accountBtn').onclick=openAccountModal;\nif('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js?v=15.4',{updateViaCache:'none'}).catch(()=>{});\ninitSession();render();loadStocks();\n";
const PATCH="(() => {\n  'use strict';\n  const PATCH_VERSION = 'v15.4';\n  const PREDICTION_KEY = 'twss-predictions-v15';\n  const JOURNAL_KEY = 'twss-journal-v15';\n  const patchState = { verifyQuery: '', mineTab: 'watch', backtestCache: new Map() };\n  const localRead = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };\n  const localWrite = (key, value) => localStorage.setItem(key, JSON.stringify(value));\n  const getPredictionLogs = () => localRead(PREDICTION_KEY, []);\n  const setPredictionLogs = value => localWrite(PREDICTION_KEY, value);\n  const getJournal = () => localRead(JOURNAL_KEY, []);\n  const setJournal = value => localWrite(JOURNAL_KEY, value);\n  const createId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;\n  const escapeText = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[char]));\n  const average = values => { const valid = values.filter(value => value != null && Number.isFinite(value)); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; };\n  const median = values => { const valid = values.filter(value => value != null && Number.isFinite(value)).sort((a, b) => a - b); if (!valid.length) return null; const middle = Math.floor(valid.length / 2); return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2; };\n  const directionFromReturn = value => value > 1.5 ? 'up' : value < -1.5 ? 'down' : 'neutral';\n  const directionFromForecast = value => value.up >= value.down + 12 ? 'up' : value.down >= value.up + 12 ? 'down' : 'neutral';\n  const directionLabel = value => value === 'up' ? '偏多' : value === 'down' ? '偏空' : '震盪';\n\n  function marketEnvironment() {\n    const tradable = S.stocks.filter(stock => stock.change != null);\n    const up = tradable.filter(stock => stock.change > 0).length;\n    const down = tradable.filter(stock => stock.change < 0).length;\n    const flat = tradable.length - up - down;\n    const avgChange = average(tradable.map(stock => stock.change)) || 0;\n    const breadth = tradable.length ? up / tradable.length * 100 : 0;\n    const foreign = S.stocks.reduce((sum, stock) => sum + (stock.foreign || 0), 0);\n    const institutions = S.stocks.reduce((sum, stock) => sum + (stock.inst || 0), 0);\n    const label = breadth >= 60 && avgChange > 0 ? '市場偏多' : breadth <= 40 && avgChange < 0 ? '市場偏空' : '市場震盪';\n    const industries = [...new Set(S.stocks.map(stock => stock.industry).filter(Boolean))].map(industry => {\n      const stocks = S.stocks.filter(stock => stock.industry === industry);\n      const valid = stocks.filter(stock => stock.change != null);\n      return {\n        industry,\n        count: stocks.length,\n        avgChange: average(valid.map(stock => stock.change)) || 0,\n        breadth: valid.length ? valid.filter(stock => stock.change > 0).length / valid.length * 100 : 0,\n        revenueGrowth: average(stocks.map(stock => stock.rev)),\n        foreign: stocks.reduce((sum, stock) => sum + (stock.foreign || 0), 0)\n      };\n    }).filter(row => row.count >= 3).sort((a, b) => (b.avgChange + b.breadth / 100) - (a.avgChange + a.breadth / 100));\n    return { up, down, flat, avgChange, breadth, foreign, institutions, label, industries };\n  }\n\n  function percentile(values, value, higherIsBetter = true) {\n    const valid = values.filter(item => item != null && Number.isFinite(item));\n    if (!valid.length || value == null) return null;\n    const rank = valid.filter(item => higherIsBetter ? item <= value : item >= value).length;\n    return Math.round(rank / valid.length * 100);\n  }\n\n  function peerComparison(stock) {\n    const peers = S.stocks.filter(item => item.industry === stock.industry);\n    const definitions = [\n      ['月營收年增', 'rev', true, '%'], ['ROE', 'roe', true, '%'], ['EPS', 'eps', true, ''],\n      ['本益比', 'pe', false, ' 倍'], ['殖利率', 'yield', true, '%'], ['外資買賣超', 'foreign', true, ' 張']\n    ];\n    return {\n      peerCount: peers.length,\n      rows: definitions.map(([label, key, high, suffix]) => ({\n        label, suffix, value: stock[key], median: median(peers.map(item => item[key])),\n        percentile: percentile(peers.map(item => item[key]), stock[key], high)\n      }))\n    };\n  }\n\n  function nextRevenueWindow() {\n    const now = new Date();\n    const month = new Date(now.getFullYear(), now.getMonth() + 1, 1);\n    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')} 上旬`;\n  }\n\n  function buildEvents(stock, indicators) {\n    const events = [\n      { icon: '▣', title: '下次月營收觀察窗', detail: `預估於 ${nextRevenueWindow()} 前後公布，實際時間以公司公告為準。`, level: 'info' }\n    ];\n    if (Math.abs(stock.change || 0) >= 7) events.push({ icon: '!', title: '單日波動較大', detail: `盤後漲跌幅 ${pct(stock.change)}，短線預測不確定性提高。`, level: 'warn' });\n    if (indicators?.volumeRatio >= 1.5) events.push({ icon: '◫', title: '成交量明顯放大', detail: `近 5 日量能約為 20 日平均的 ${fmt(indicators.volumeRatio, 2)} 倍。`, level: 'warn' });\n    if (indicators?.rsi14 >= 75) events.push({ icon: '▲', title: 'RSI 進入過熱區', detail: `RSI 14 為 ${fmt(indicators.rsi14)}，短線追價風險較高。`, level: 'warn' });\n    if (indicators?.rsi14 <= 30) events.push({ icon: '▼', title: 'RSI 進入超賣區', detail: `RSI 14 為 ${fmt(indicators.rsi14)}，仍需觀察是否止跌。`, level: 'warn' });\n    if (stock.rev != null && stock.rev < 0) events.push({ icon: '↘', title: '月營收年增為負', detail: `最新月營收年增 ${pct(stock.rev)}，成長動能需持續追蹤。`, level: 'bad' });\n    if (stock.debt != null && stock.debt >= 70) events.push({ icon: '!', title: '負債比偏高', detail: `負債比 ${fmt(stock.debt)}%，財務彈性風險較高。`, level: 'bad' });\n    if (stock.foreign != null && stock.foreign < 0) events.push({ icon: '◁', title: '外資當日賣超', detail: `外資買賣超 ${fmt(stock.foreign, 0)} 張。`, level: 'warn' });\n    if (events.length === 1) events.push({ icon: '✓', title: '目前未偵測重大量價警示', detail: '仍應留意公司公告、產業消息及整體市場變化。', level: 'info' });\n    return events;\n  }\n  function scenarioAnalysis(stock, forecast, indicators) {\n    const volatility = forecast.expectedMove5 || 5;\n    const support = indicators?.support || stock.close * (1 - volatility / 100);\n    const resistance = indicators?.resistance || stock.close * (1 + volatility / 100);\n    const optimism = Math.max(10, forecast.up);\n    const pessimism = Math.max(10, forecast.down);\n    const neutralProbability = Math.max(10, 100 - optimism - pessimism);\n    return [\n      { type: 'positive', title: '樂觀情境', probability: optimism, low: Math.max(stock.close, resistance * .99), high: stock.close * (1 + volatility * 1.35 / 100), trigger: '突破壓力且成交量同步增加' },\n      { type: 'neutral', title: '中性情境', probability: neutralProbability, low: stock.close * (1 - volatility * .55 / 100), high: stock.close * (1 + volatility * .55 / 100), trigger: '量能持平，價格維持區間整理' },\n      { type: 'negative', title: '悲觀情境', probability: pessimism, low: stock.close * (1 - volatility * 1.35 / 100), high: Math.min(stock.close, support * 1.01), trigger: '跌破支撐或法人籌碼持續轉弱' }\n    ];\n  }\n\n  function recordPrediction(stock, forecast) {\n    const logs = getPredictionLogs();\n    const date = S.date || new Date().toISOString().slice(0, 10);\n    const exists = logs.some(log => log.symbol === stock.symbol && log.prediction_date === date && log.model_version === PATCH_VERSION);\n    if (exists) return;\n    logs.unshift({\n      local_id: createId(), symbol: stock.symbol, stock_name: stock.name, prediction_date: date,\n      horizon_days: 5, reference_price: stock.close, predicted_direction: directionFromForecast(forecast),\n      up_probability: forecast.up, neutral_probability: forecast.neutral, down_probability: forecast.down,\n      confidence: forecast.confidence, expected_low: forecast.expectedLow, expected_high: forecast.expectedHigh,\n      model_version: PATCH_VERSION, factors: { composite: forecast.composite, technical: forecast.technical, fundamental: forecast.fundamental, chip: forecast.chip, valuation: forecast.valuation },\n      evaluated_at: null, actual_price: null, actual_return_pct: null, actual_direction: null, is_correct: null,\n      created_at: new Date().toISOString()\n    });\n    setPredictionLogs(logs.slice(0, 500));\n  }\n\n  function evaluatePredictions(symbol, history) {\n    const logs = getPredictionLogs();\n    let changed = false;\n    for (const log of logs) {\n      if (log.symbol !== symbol || log.evaluated_at) continue;\n      const index = history.findIndex(row => row.date >= log.prediction_date);\n      if (index < 0 || history.length <= index + 5) continue;\n      const actual = history[index + 5];\n      const returnPct = (actual.close / log.reference_price - 1) * 100;\n      const direction = directionFromReturn(returnPct);\n      Object.assign(log, { evaluated_at: new Date().toISOString(), actual_price: actual.close, actual_return_pct: +returnPct.toFixed(2), actual_direction: direction, is_correct: direction === log.predicted_direction });\n      changed = true;\n    }\n    if (changed) setPredictionLogs(logs);\n  }\n\n  function runTechnicalBacktest(stock, history) {\n    const key = `${stock.symbol}-${history.at(-1)?.date || ''}`;\n    if (patchState.backtestCache.has(key)) return patchState.backtestCache.get(key);\n    const samples = [];\n    for (let index = 80; index < history.length - 5; index += 5) {\n      const past = history.slice(0, index + 1);\n      const indicators = computeIndicators(past);\n      if (!indicators) continue;\n      const snapshot = { ...stock, close: past.at(-1).close, change: null, rev: null, revMom: null, revYtd: null, roe: null, eps: null, pe: null, pb: null, yield: null, debt: null, foreign: null, trust: null, dealer: null, marginChange: null };\n      const forecast = calculateForecast(snapshot, indicators);\n      const predicted = directionFromForecast(forecast);\n      const returnPct = (history[index + 5].close / past.at(-1).close - 1) * 100;\n      const actual = directionFromReturn(returnPct);\n      samples.push({ date: past.at(-1).date, predicted, actual, returnPct: +returnPct.toFixed(2), correct: predicted === actual });\n    }\n    const result = {\n      count: samples.length,\n      hitRate: samples.length ? samples.filter(item => item.correct).length / samples.length * 100 : null,\n      avgReturn: average(samples.map(item => item.returnPct)),\n      avgWin: average(samples.filter(item => item.returnPct > 0).map(item => item.returnPct)),\n      avgLoss: average(samples.filter(item => item.returnPct < 0).map(item => item.returnPct)),\n      samples\n    };\n    patchState.backtestCache.set(key, result);\n    return result;\n  }\n\n  function predictionStats() {\n    const all = getPredictionLogs();\n    const evaluated = all.filter(log => log.evaluated_at);\n    const correct = evaluated.filter(log => log.is_correct);\n    const last30 = evaluated.filter(log => Date.now() - new Date(log.prediction_date).getTime() <= 30 * 86400000);\n    const last90 = evaluated.filter(log => Date.now() - new Date(log.prediction_date).getTime() <= 90 * 86400000);\n    const accuracy = rows => rows.length ? rows.filter(row => row.is_correct).length / rows.length * 100 : null;\n    return { all, evaluated, accuracy: accuracy(evaluated), accuracy30: accuracy(last30), accuracy90: accuracy(last90), correct: correct.length };\n  }\n\n  function scenarioHtml(stock, forecast, indicators) {\n    return scenarioAnalysis(stock, forecast, indicators).map(item => `<div class=\"card patch-scenario ${item.type}\"><div class=\"head\"><div><b>${item.title}</b><div class=\"muted\">觸發條件：${item.trigger}</div></div><b>${item.probability}%</b></div><div class=\"price\">${fmt(item.low)}～${fmt(item.high)}</div><div class=\"muted\">5 個交易日情境區間，非價格保證。</div></div>`).join('');\n  }\n\n  function peerHtml(stock) {\n    const peer = peerComparison(stock);\n    return `<div class=\"card\"><div class=\"muted\">比較群組：${stock.industry}，共 ${peer.peerCount} 檔</div>${peer.rows.map(row => `<div class=\"patch-peer\"><span>${row.label}</span><div><div class=\"patch-track\"><span style=\"width:${row.percentile || 0}%\"></span></div><small class=\"muted\">同業中位數 ${row.median == null ? '—' : `${fmt(row.median)}${row.suffix}`}</small></div><b>${row.value == null ? '—' : `${fmt(row.value)}${row.suffix}`}<br><small class=\"muted\">百分位 ${row.percentile == null ? '—' : row.percentile}</small></b></div>`).join('')}</div>`;\n  }\n\n  function marketIndustryHtml(stock) {\n    const environment = marketEnvironment();\n    const industry = environment.industries.find(item => item.industry === stock.industry);\n    return `<div class=\"grid\">${metric('大盤環境', environment.label)}${metric('上漲家數比', `${fmt(environment.breadth, 0)}%`)}${metric(`${stock.industry}平均漲跌`, industry ? pct(industry.avgChange) : reasonDash('同業不足'))}${metric(`${stock.industry}上漲家數`, industry ? `${fmt(industry.breadth, 0)}%` : reasonDash('同業不足'))}${metric('市場外資合計', `${fmt(environment.foreign, 0)} 張`)}${metric('產業外資合計', industry ? `${fmt(industry.foreign, 0)} 張` : reasonDash('同業不足'))}</div>`;\n  }\n\n  function eventHtml(stock, indicators) {\n    return `<div class=\"card\">${buildEvents(stock, indicators).map(event => `<div class=\"patch-event\"><div class=\"patch-event-icon\">${event.icon}</div><div><b>${event.title}</b><div class=\"muted\">${event.detail}</div></div><span class=\"tag ${event.level === 'bad' ? 'bad' : event.level === 'warn' ? 'warn' : 'info'}\">${event.level === 'bad' ? '風險' : event.level === 'warn' ? '注意' : '事件'}</span></div>`).join('')}</div>`;\n  }\n  function verifyPage() {\n    const stats = predictionStats();\n    const query = patchState.verifyQuery.trim().toLowerCase();\n    const matches = query ? S.stocks.filter(stock => stock.symbol.includes(query) || stock.name.toLowerCase().includes(query)).slice(0, 10) : [];\n    const rows = stats.all.filter(log => !query || log.symbol.includes(query) || String(log.stock_name || '').toLowerCase().includes(query));\n    return `<h2>預測驗證</h2><p class=\"muted\">系統會保存每次預測，五個交易日後比對實際收盤價。歷史回測只使用當時以前的價量資料。</p>\n      <div class=\"grid\">${metric('已保存預測', fmt(stats.all.length, 0))}${metric('已完成驗證', fmt(stats.evaluated.length, 0))}${metric('整體命中率', stats.accuracy == null ? '尚無樣本' : `${fmt(stats.accuracy, 1)}%`)}${metric('近 90 日命中率', stats.accuracy90 == null ? '尚無樣本' : `${fmt(stats.accuracy90, 1)}%`)}</div>\n      <div class=\"card\"><h3>查詢個股回測</h3><div class=\"search-row\"><input id=\"patchVerifySearch\" value=\"${escapeText(patchState.verifyQuery)}\" placeholder=\"輸入代號或名稱\"><button id=\"patchVerifyButton\" class=\"btn\">查詢</button></div>${matches.length ? `<div class=\"search-results\">${matches.map(stock => `<button class=\"search-result\" data-patch-backtest=\"${stock.symbol}\"><span><b>${stock.name}</b><small class=\"muted\"> ${stock.symbol}</small></span><span>執行回測</span></button>`).join('')}</div>` : ''}</div>\n      <div class=\"card\"><h3>預測紀錄</h3>${rows.length ? `<div class=\"table-wrap\"><table><thead><tr><th>日期</th><th>股票</th><th>預測</th><th>機率</th><th>實際</th><th>結果</th></tr></thead><tbody>${rows.slice(0, 80).map(log => `<tr><td>${log.prediction_date}</td><td>${log.stock_name || log.symbol}</td><td>${directionLabel(log.predicted_direction)}</td><td>${fmt(log.up_probability, 0)}/${fmt(log.neutral_probability, 0)}/${fmt(log.down_probability, 0)}</td><td class=\"${cls(log.actual_return_pct)}\">${log.actual_return_pct == null ? '待驗證' : pct(log.actual_return_pct)}</td><td>${log.is_correct == null ? '—' : log.is_correct ? '✓' : '×'}</td></tr>`).join('')}</tbody></table></div>` : '<div class=\"empty muted\">開啟任何股票的趨勢預測後，就會開始累積紀錄。</div>'}</div>${disclaimer()}`;\n  }\n\n  function backtestHtml(result) {\n    return `<div class=\"grid\">${metric('回測樣本', fmt(result.count, 0))}${metric('方向命中率', result.hitRate == null ? '—' : `${fmt(result.hitRate, 1)}%`)}${metric('樣本平均報酬', pct(result.avgReturn))}${metric('平均獲利／虧損', `${pct(result.avgWin)} / ${pct(result.avgLoss)}`)}</div><div class=\"table-wrap\" style=\"margin-top:10px\"><table><thead><tr><th>日期</th><th>預測</th><th>5 日報酬</th><th>結果</th></tr></thead><tbody>${result.samples.slice(-15).reverse().map(item => `<tr><td>${item.date}</td><td>${directionLabel(item.predicted)}</td><td class=\"${cls(item.returnPct)}\">${pct(item.returnPct)}</td><td>${item.correct ? '✓' : '×'}</td></tr>`).join('')}</tbody></table></div><div class=\"muted small\" style=\"margin-top:8px\">回測不套用目前的營收、財報或法人資料，避免偷看未來；因此結果和當下完整模型不完全相同。</div>`;\n  }\n\n  function journalStats() {\n    const all = getJournal();\n    const closed = all.filter(item => item.return_pct != null);\n    const wins = closed.filter(item => item.return_pct > 0);\n    const followed = all.filter(item => item.followed_plan != null);\n    return {\n      all, closed,\n      winRate: closed.length ? wins.length / closed.length * 100 : null,\n      averageReturn: average(closed.map(item => item.return_pct)),\n      followRate: followed.length ? followed.filter(item => item.followed_plan).length / followed.length * 100 : null\n    };\n  }\n\n  function watchSection() {\n    const items = getWatchlist();\n    const rows = items.map(item => ({ item, stock: S.stocks.find(stock => stock.symbol === item.symbol) })).filter(row => row.stock);\n    if (!rows.length) return '<div class=\"card empty\"><h3>尚未加入自選股票</h3><p class=\"muted\">可在機會股或股票詳細頁加入。</p></div>';\n    return `<div class=\"list two-col\">${rows.map(({ item, stock }) => { const gain = item.addedPrice && stock.close ? (stock.close / item.addedPrice - 1) * 100 : null; return `<div class=\"card clickable\" data-detail=\"${stock.symbol}\"><div class=\"head\"><div><b>${stock.name}</b><div class=\"muted\">${stock.symbol} · ${stock.industry}</div></div><button class=\"icon-btn\" data-watch=\"${stock.symbol}\">移除</button></div><div class=\"grid\">${metric('目前價格', fmt(stock.close))}${metric('加入後漲跌', `<span class=\"${cls(gain)}\">${pct(gain)}</span>`)}${metric('月營收年增', pct(stock.rev))}${metric('機會分數', opportunityScore(stock))}</div><button class=\"btn\" data-forecast=\"${stock.symbol}\" style=\"width:100%;margin-top:10px\">查看趨勢預測</button></div>`; }).join('')}</div>`;\n  }\n\n  function actionLabel(value) { return ({ observe: '觀察', buy: '買入紀錄', sell: '賣出紀錄', review: '事後檢討' })[value] || value; }\n  function horizonLabel(value) { return ({ short: '短線 1–5 日', swing: '波段 1–4 週', medium: '中期 1–6 月', long: '長期 6 月以上' })[value] || '未設定期間'; }\n  function journalSection() {\n    const stats = journalStats();\n    const header = `<div class=\"grid\">${metric('紀錄筆數', fmt(stats.all.length, 0))}${metric('已完成交易', fmt(stats.closed.length, 0))}${metric('勝率', stats.winRate == null ? '尚無樣本' : `${fmt(stats.winRate, 1)}%`)}${metric('遵守計畫率', stats.followRate == null ? '尚無資料' : `${fmt(stats.followRate, 1)}%`)}</div><div class=\"row\" style=\"margin-top:10px\"><button id=\"patchNewJournal\" class=\"btn grow\">＋新增投資紀錄</button><button id=\"patchExportJournal\" class=\"btn secondary\">匯出</button></div>`;\n    if (!stats.all.length) return `${header}<div class=\"card empty\"><h3>尚未建立投資紀錄</h3><p class=\"muted\">記錄當時理由、風險與結果，之後才能檢查自己是否遵守計畫。</p></div>`;\n    return `${header}<div class=\"list\">${stats.all.map(item => `<div class=\"card patch-journal\"><div class=\"head\"><div><b>${item.stock_name || item.symbol} ${item.symbol}</b><div class=\"muted\">${item.entry_date} · ${actionLabel(item.action)} · ${horizonLabel(item.horizon)}</div></div>${item.return_pct != null ? `<b class=\"${cls(item.return_pct)}\">${pct(item.return_pct)}</b>` : ''}</div>${item.thesis ? `<p>${escapeText(item.thesis)}</p>` : ''}<div class=\"rules\">${item.risk_plan ? `<span>風險：${escapeText(item.risk_plan)}</span>` : ''}${item.target_plan ? `<span>目標：${escapeText(item.target_plan)}</span>` : ''}${item.followed_plan != null ? `<span>遵守計畫：${item.followed_plan ? '是' : '否'}</span>` : ''}</div><div class=\"row\" style=\"margin-top:10px\"><button class=\"btn secondary\" data-patch-edit=\"${item.local_id}\">編輯</button><button class=\"btn danger\" data-patch-delete=\"${item.local_id}\">刪除</button></div></div>`).join('')}</div>`;\n  }\n\n  function minePage() {\n    return `<h2>我的</h2><div class=\"patch-tabs\"><button data-patch-mine=\"watch\" class=\"${patchState.mineTab === 'watch' ? 'active' : ''}\">自選清單</button><button data-patch-mine=\"journal\" class=\"${patchState.mineTab === 'journal' ? 'active' : ''}\">投資紀錄</button></div>${patchState.mineTab === 'watch' ? watchSection() : journalSection()}${disclaimer()}`;\n  }\n  function openJournalModal(record = null, stock = null) {\n    const item = record || { local_id: createId(), symbol: stock?.symbol || '', stock_name: stock?.name || '', entry_date: new Date().toISOString().slice(0, 10), action: 'observe', price: stock?.close ?? null, quantity: null, horizon: 'swing', thesis: '', risk_plan: '', target_plan: '', emotion: '', followed_plan: null, exit_price: null, exit_date: '', return_pct: null, result_note: '' };\n    modalRoot.innerHTML = `<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>${record ? '編輯' : '新增'}投資紀錄</h2><div class=\"grid\"><label class=\"muted\">股票代號<input id=\"journalSymbol\" value=\"${escapeText(item.symbol)}\"></label><label class=\"muted\">股票名稱<input id=\"journalName\" value=\"${escapeText(item.stock_name || '')}\"></label><label class=\"muted\">日期<input id=\"journalDate\" type=\"date\" value=\"${item.entry_date}\"></label><label class=\"muted\">類型<select id=\"journalAction\"><option value=\"observe\">觀察</option><option value=\"buy\">買入紀錄</option><option value=\"sell\">賣出紀錄</option><option value=\"review\">事後檢討</option></select></label><label class=\"muted\">價格<input id=\"journalPrice\" type=\"number\" step=\"0.01\" value=\"${item.price ?? ''}\"></label><label class=\"muted\">數量／張數<input id=\"journalQuantity\" type=\"number\" step=\"0.001\" value=\"${item.quantity ?? ''}\"></label><label class=\"muted\">預計期間<select id=\"journalHorizon\"><option value=\"short\">短線 1–5 日</option><option value=\"swing\">波段 1–4 週</option><option value=\"medium\">中期 1–6 月</option><option value=\"long\">長期 6 月以上</option></select></label><label class=\"muted\">當時情緒<input id=\"journalEmotion\" value=\"${escapeText(item.emotion || '')}\" placeholder=\"例如：冷靜、害怕錯過\"></label></div><label class=\"muted\">決策理由<textarea id=\"journalThesis\">${escapeText(item.thesis || '')}</textarea></label><label class=\"muted\">風險計畫<textarea id=\"journalRisk\">${escapeText(item.risk_plan || '')}</textarea></label><label class=\"muted\">目標計畫<textarea id=\"journalTarget\">${escapeText(item.target_plan || '')}</textarea></label><div class=\"grid\"><label class=\"muted\">出場價格<input id=\"journalExitPrice\" type=\"number\" step=\"0.01\" value=\"${item.exit_price ?? ''}\"></label><label class=\"muted\">出場日期<input id=\"journalExitDate\" type=\"date\" value=\"${item.exit_date || ''}\"></label></div><label class=\"muted\">事後檢討<textarea id=\"journalResult\">${escapeText(item.result_note || '')}</textarea></label><label class=\"muted\"><input id=\"journalFollowed\" type=\"checkbox\" style=\"width:auto\" ${item.followed_plan ? 'checked' : ''}> 有遵守原本計畫</label><button id=\"journalSave\" class=\"btn\" style=\"width:100%;margin-top:12px\">儲存紀錄</button></div></div>`;\n    q('#journalAction').value = item.action || 'observe';\n    q('#journalHorizon').value = item.horizon || 'swing';\n    q('.sheet-close', modalRoot).onclick = closeModal;\n    q('#journalSave').onclick = () => {\n      const price = Number(q('#journalPrice').value) || null;\n      const exitPrice = Number(q('#journalExitPrice').value) || null;\n      const saved = {\n        ...item,\n        symbol: q('#journalSymbol').value.trim(), stock_name: q('#journalName').value.trim(), entry_date: q('#journalDate').value,\n        action: q('#journalAction').value, price, quantity: Number(q('#journalQuantity').value) || null, horizon: q('#journalHorizon').value,\n        emotion: q('#journalEmotion').value.trim(), thesis: q('#journalThesis').value.trim(), risk_plan: q('#journalRisk').value.trim(), target_plan: q('#journalTarget').value.trim(),\n        exit_price: exitPrice, exit_date: q('#journalExitDate').value || '', result_note: q('#journalResult').value.trim(), followed_plan: q('#journalFollowed').checked,\n        return_pct: price && exitPrice ? +((exitPrice / price - 1) * 100).toFixed(2) : null, updated_at: new Date().toISOString()\n      };\n      if (!saved.symbol) { alert('請輸入股票代號'); return; }\n      const list = getJournal();\n      const index = list.findIndex(row => row.local_id === saved.local_id);\n      if (index >= 0) list[index] = saved; else list.unshift(saved);\n      setJournal(list); closeModal(); patchState.mineTab = 'journal'; S.tab = 'mine'; render();\n    };\n  }\n\n  function bindPatch() {\n    q('#patchVerifySearch')?.addEventListener('input', event => { patchState.verifyQuery = event.target.value; });\n    q('#patchVerifyButton')?.addEventListener('click', () => { patchState.verifyQuery = q('#patchVerifySearch')?.value || ''; render(); });\n    qa('[data-patch-backtest]').forEach(button => button.onclick = async () => {\n      const symbol = button.dataset.patchBacktest;\n      const stock = S.stocks.find(item => item.symbol === symbol);\n      modalRoot.innerHTML = '<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>歷史回測</h2><div class=\"loading\"><span class=\"spinner\"></span>正在讀取歷史資料並回測…</div></div></div>';\n      q('.sheet-close', modalRoot).onclick = closeModal;\n      try {\n        const history = await getHistory(symbol);\n        evaluatePredictions(symbol, history.rows);\n        const result = runTechnicalBacktest(stock, history.rows);\n        modalRoot.innerHTML = `<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>${stock.name} ${symbol} 回測</h2>${backtestHtml(result)}<div class=\"notice\"><b>回測限制</b><br>歷史表現不代表未來結果，樣本數過少時不應視為可靠依據。</div></div></div>`;\n        q('.sheet-close', modalRoot).onclick = closeModal;\n      } catch (error) {\n        modalRoot.innerHTML = `<div class=\"modal\"><div class=\"sheet\"><button class=\"sheet-close\">×</button><h2>回測失敗</h2><div class=\"notice\">${escapeText(error.message)}</div></div></div>`;\n        q('.sheet-close', modalRoot).onclick = closeModal;\n      }\n    });\n    qa('[data-patch-mine]').forEach(button => button.onclick = () => { patchState.mineTab = button.dataset.patchMine; render(); });\n    q('#patchNewJournal')?.addEventListener('click', () => openJournalModal());\n    q('#patchExportJournal')?.addEventListener('click', () => {\n      const blob = new Blob([JSON.stringify(getJournal(), null, 2)], { type: 'application/json' });\n      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `台股智選-投資紀錄-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);\n    });\n    qa('[data-patch-edit]').forEach(button => button.onclick = () => openJournalModal(getJournal().find(item => item.local_id === button.dataset.patchEdit)));\n    qa('[data-patch-delete]').forEach(button => button.onclick = () => { if (!confirm('確定刪除這筆紀錄？')) return; setJournal(getJournal().filter(item => item.local_id !== button.dataset.patchDelete)); render(); });\n    qa('[data-patch-journal-stock]').forEach(button => button.onclick = () => openJournalModal(null, S.stocks.find(stock => stock.symbol === button.dataset.patchJournalStock)));\n    qa('[data-patch-verify-stock]').forEach(button => button.onclick = () => { closeModal(); patchState.verifyQuery = button.dataset.patchVerifyStock; S.tab = 'verify'; render(); });\n  }\n\n  const originalDetailHtml = detailHtml;\n  detailHtml = function patchedDetailHtml(stock, historyState) {\n    let html = originalDetailHtml(stock, historyState);\n    const indicators = historyState?.indicators || null;\n    const forecast = calculateForecast(stock, indicators);\n    const extra = `<h3 class=\"section-title\">三種預測情境</h3><div class=\"patch-scenarios\">${scenarioHtml(stock, forecast, indicators)}</div><h3 class=\"section-title\">大盤與產業環境</h3>${marketIndustryHtml(stock)}<h3 class=\"section-title\">同業比較</h3>${peerHtml(stock)}<h3 class=\"section-title\">近期事件與風險</h3>${eventHtml(stock, indicators)}<div class=\"row\" style=\"margin-top:16px\"><button class=\"btn grow\" data-patch-journal-stock=\"${stock.symbol}\">新增投資紀錄</button><button class=\"btn secondary\" data-patch-verify-stock=\"${stock.symbol}\">查看預測驗證</button></div>`;\n    const index = html.lastIndexOf('<div class=\"disclaimer\">');\n    return index >= 0 ? html.slice(0, index) + extra + html.slice(index) : html.replace(/<\\/div><\\/div>$/, `${extra}</div></div>`);\n  };\n\n  const originalOpenDetail = openDetail;\n  openDetail = async function patchedOpenDetail(symbol, loadHistory = true) {\n    await originalOpenDetail(symbol, loadHistory);\n    const stock = S.stocks.find(item => item.symbol === symbol);\n    if (!stock) return;\n    try {\n      const history = await getHistory(symbol);\n      const forecast = calculateForecast(stock, history.indicators);\n      recordPrediction(stock, forecast);\n      evaluatePredictions(symbol, history.rows);\n    } catch {\n      recordPrediction(stock, calculateForecast(stock, null));\n    }\n  };\n\n  const originalBind = bind;\n  bind = function patchedBind() { originalBind(); bindPatch(); };\n  const originalRender = render;\n  render = function patchedRender() {\n    qa('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.tab === S.tab));\n    if (S.tab === 'verify') { app.innerHTML = verifyPage(); bind(); return; }\n    if (S.tab === 'mine') { app.innerHTML = minePage(); bind(); return; }\n    originalRender();\n  };\n\n  function updateNavigation() {\n    const nav = q('.bottom-nav');\n    if (!nav) return;\n    const watchButton = q('[data-tab=\"watch\"]', nav);\n    if (watchButton) { watchButton.dataset.tab = 'mine'; watchButton.innerHTML = '<span>◎</span>我的'; }\n    if (!q('[data-tab=\"verify\"]', nav)) {\n      const verifyButton = document.createElement('button');\n      verifyButton.type = 'button'; verifyButton.dataset.tab = 'verify'; verifyButton.innerHTML = '<span>✓</span>預測驗證';\n      nav.insertBefore(verifyButton, watchButton);\n    }\n  }\n\n  updateNavigation();\n  render();\n})();\n";
const SMART="(() => {\n  'use strict';\n  const labels={balanced:'綜合型',value:'價值型',growth:'成長型',dividend:'高股息',momentum:'動能型'};\n  const notes={balanced:'基本面、估值、籌碼與流動性平均考量',value:'偏重低本益比、低股價淨值比與財務品質',growth:'偏重月營收成長、ROE 與 EPS',dividend:'偏重殖利率，同時避開流動性過弱標的',momentum:'偏重當日漲勢、法人買超與成交活絡度'};\n  const defaults={strategy:'balanced',industry:'全部產業',minPrice:'',maxPrice:'',maxPe:'35',minYield:'0',minRev:'0',minRoe:'0',minVolume:'500',complete:false};\n  let draft={...defaults},applied={...defaults};\n  const n=value=>value===''||value==null?null:Number(value);\n  const cap=value=>clamp(Math.round(value),0,100);\n\n  function factors(stock){\n    return{\n      pe:stock.pe==null||stock.pe<=0?20:cap(118-stock.pe*3.2),\n      pb:stock.pb==null?25:cap(112-stock.pb*25),\n      dividend:stock.yield==null?15:cap(stock.yield*15),\n      growth:stock.rev==null?20:cap(46+stock.rev*1.45+(stock.revYtd||0)*.45),\n      quality:stock.roe==null?25:cap(stock.roe*5.2+(stock.eps>0?12:-10)-Math.max(0,(stock.debt||0)-60)),\n      chip:cap(48+Math.sign(stock.foreign||0)*Math.min(24,Math.log10(Math.abs(stock.foreign||0)+1)*6)+Math.sign(stock.trust||0)*10),\n      momentum:cap(50+(stock.change||0)*8+((stock.foreign||0)>0?8:0)),\n      liquidity:stock.volume==null?10:cap(Math.log10(Math.max(stock.volume,1))*29-24)\n    }\n  }\n  function score(stock,strategy){\n    const f=factors(stock),formula={\n      balanced:f.pe*.16+f.pb*.11+f.dividend*.1+f.growth*.2+f.quality*.18+f.chip*.1+f.momentum*.07+f.liquidity*.08,\n      value:f.pe*.34+f.pb*.25+f.dividend*.13+f.quality*.16+f.liquidity*.12,\n      growth:f.growth*.42+f.quality*.25+f.momentum*.1+f.chip*.1+f.liquidity*.13,\n      dividend:f.dividend*.46+f.pe*.15+f.quality*.18+f.pb*.09+f.liquidity*.12,\n      momentum:f.momentum*.43+f.chip*.22+f.liquidity*.2+f.growth*.1+f.quality*.05\n    };return cap(formula[strategy]??formula.balanced)\n  }\n  function reasons(stock,strategy){\n    const out=[];\n    if(stock.rev!=null&&stock.rev>=10)out.push(`營收年增 ${pct(stock.rev)}`);\n    if(stock.roe!=null&&stock.roe>=10)out.push(`ROE ${fmt(stock.roe)}%`);\n    if(stock.pe!=null&&stock.pe>0&&stock.pe<=15)out.push(`本益比 ${fmt(stock.pe)}`);\n    if(stock.pb!=null&&stock.pb<=1.8)out.push(`淨值比 ${fmt(stock.pb)}`);\n    if(stock.yield!=null&&stock.yield>=4)out.push(`殖利率 ${fmt(stock.yield)}%`);\n    if(stock.foreign>0)out.push('外資買超');\n    if(stock.change>=1)out.push('短線動能偏強');\n    if((stock.volume||0)>=1000)out.push('成交量充足');\n    if(!out.length)out.push(`${labels[strategy]}條件較均衡`);return out.slice(0,4)\n  }\n  function match(stock,f){\n    if(f.industry!=='全部產業'&&stock.industry!==f.industry)return false;\n    if(n(f.minPrice)!=null&&(stock.close==null||stock.close<n(f.minPrice)))return false;\n    if(n(f.maxPrice)!=null&&(stock.close==null||stock.close>n(f.maxPrice)))return false;\n    if(stock.pe!=null&&n(f.maxPe)!=null&&stock.pe>n(f.maxPe))return false;\n    if(stock.yield!=null&&n(f.minYield)!=null&&stock.yield<n(f.minYield))return false;\n    if(stock.rev!=null&&n(f.minRev)!=null&&stock.rev<n(f.minRev))return false;\n    if(stock.roe!=null&&n(f.minRoe)!=null&&stock.roe<n(f.minRoe))return false;\n    if(n(f.minVolume)!=null&&(stock.volume==null||stock.volume<n(f.minVolume)))return false;\n    if(f.complete&&[stock.pe,stock.yield,stock.rev,stock.roe].some(v=>v==null))return false;\n    return stock.close!=null&&/^\\d{4}$/.test(stock.symbol)\n  }\n  function card(item){const s=item.stock;return`<article class=\"card smart-card clickable\" data-detail=\"${s.symbol}\"><div class=\"head\"><div><b class=\"smart-name\">${esc(s.name)}</b><div class=\"muted\">${s.symbol} · ${esc(s.market)} · ${esc(s.industry)}</div></div><div class=\"smart-score\"><small>匹配分數</small><strong>${item.score}</strong></div></div><div class=\"smart-price\"><span class=\"price\">${fmt(s.close)}</span><b class=\"${cls(s.change)}\">${pct(s.change)}</b></div><div class=\"rules smart-reasons\">${item.reasons.map(r=>`<span>${esc(r)}</span>`).join('')}</div><div class=\"grid smart-metrics\">${metric('月營收年增',pct(s.rev))}${metric('ROE',valueOrReason(s.roe,'%'))}${metric('本益比',valueOrReason(s.pe))}${metric('殖利率',valueOrReason(s.yield,'%'))}</div><div class=\"row smart-actions\"><button class=\"btn grow\" data-forecast=\"${s.symbol}\">深度預測</button><button class=\"btn secondary\" data-watch=\"${s.symbol}\">${isWatched(s.symbol)?'★ 已自選':'＋自選'}</button></div></article>`}\n  function input(id,label,value,extra=''){return`<label class=\"smart-field\"><span>${label}</span><input id=\"${id}\" type=\"number\" value=\"${esc(value)}\" ${extra}></label>`}\n  opportunitiesPage=function(){\n    const industries=['全部產業',...new Set(S.stocks.map(s=>s.industry).filter(Boolean))].sort((a,b)=>a==='全部產業'?-1:b==='全部產業'?1:a.localeCompare(b,'zh-Hant'));\n    const ranked=S.stocks.filter(s=>match(s,applied)).map(stock=>({stock,score:score(stock,applied.strategy),reasons:reasons(stock,applied.strategy)})).sort((a,b)=>b.score-a.score);\n    return`<div class=\"smart-hero\"><div><small>SMART SCREENER · v15.4</small><h2>智能選股</h2><p>從台股公開行情、月營收、財報與法人籌碼中，找出最符合你策略的標的。</p></div><span class=\"status-pill ${S.mode==='live'?'good':'warn'}\">${S.mode==='live'?'官方日期已核對':'部分官方資料'}</span></div>${statusCard()}<section class=\"card smart-filter-card\"><div class=\"head\"><div><h3>篩選條件</h3><div class=\"muted\">先選策略，再設定你在意的最低門檻。</div></div><button id=\"smartReset\" class=\"btn secondary\">重設</button></div><div class=\"smart-strategies\">${Object.entries(labels).map(([key,label])=>`<button class=\"${draft.strategy===key?'active':''}\" data-smart-strategy=\"${key}\">${label}</button>`).join('')}</div><div class=\"notice smart-note\"><b>${labels[draft.strategy]}</b>：${notes[draft.strategy]}</div><label class=\"smart-field smart-industry\"><span>產業類別</span><select id=\"smartIndustry\">${industries.map(i=>`<option value=\"${esc(i)}\" ${draft.industry===i?'selected':''}>${esc(i)}</option>`).join('')}</select></label><div class=\"smart-filter-grid\">${input('smartMinPrice','最低股價（元）',draft.minPrice,'min=\"0\" placeholder=\"不限\"')}${input('smartMaxPrice','最高股價（元）',draft.maxPrice,'min=\"0\" placeholder=\"不限\"')}${input('smartMaxPe','最高本益比',draft.maxPe,'min=\"0\"')}${input('smartMinYield','最低殖利率（%）',draft.minYield,'step=\"0.5\"')}${input('smartMinRev','最低月營收年增（%）',draft.minRev)}${input('smartMinRoe','最低 ROE（%）',draft.minRoe)}${input('smartMinVolume','最低成交量（張）',draft.minVolume,'step=\"100\"')}<label class=\"smart-check\"><input id=\"smartComplete\" type=\"checkbox\" ${draft.complete?'checked':''}><span>排除基本面資料不足</span></label></div><button id=\"smartApply\" class=\"btn smart-apply\">開始智能選股 <span>→</span></button></section><div class=\"smart-results-head\"><div><h3>篩選結果</h3><div class=\"muted\">${labels[applied.strategy]} · 依匹配分數排序</div></div><b>${ranked.length} 檔</b></div>${ranked.length?`<div class=\"list two-col smart-results\">${ranked.slice(0,30).map(card).join('')}</div>`:`<div class=\"card empty\"><h3>目前沒有符合條件的股票</h3><p class=\"muted\">可嘗試放寬本益比、營收年增或成交量門檻。</p></div>`}<div class=\"notice\"><b>評分說明</b><br>智能分數是固定、可重現的多因子排名，不是保證獲利的 AI 預言。</div>${disclaimer()}`\n  };\n  function read(){draft={...draft,industry:q('#smartIndustry')?.value||'全部產業',minPrice:q('#smartMinPrice')?.value??'',maxPrice:q('#smartMaxPrice')?.value??'',maxPe:q('#smartMaxPe')?.value??'',minYield:q('#smartMinYield')?.value??'',minRev:q('#smartMinRev')?.value??'',minRoe:q('#smartMinRoe')?.value??'',minVolume:q('#smartMinVolume')?.value??'',complete:Boolean(q('#smartComplete')?.checked)}}\n  function bindSmart(){qa('[data-smart-strategy]').forEach(button=>button.onclick=()=>{read();draft.strategy=button.dataset.smartStrategy;render()});q('#smartApply')?.addEventListener('click',()=>{read();applied={...draft};render();scrollTo({top:0,behavior:'smooth'})});q('#smartReset')?.addEventListener('click',()=>{draft={...defaults};applied={...defaults};render()})}\n  const oldBind=bind;bind=function(){oldBind();bindSmart()};\n  const button=q('.bottom-nav [data-tab=\"opportunities\"]');if(button)button.innerHTML='<span>◆</span>智能選股';render();\n})();\n";
const STYLES=":root{\n  color-scheme:dark;--bg:#071018;--panel:#10212d;--panel2:#0b1721;--line:#29404d;--text:#f4f8fa;--muted:#9fb0bc;--primary:#14b8a6;--primary2:#0f766e;--up:#ff4d57;--down:#22c55e;--warn:#fbbf24;--danger:#fb7185;--blue:#60a5fa;--shadow:0 12px 40px rgba(0,0,0,.22)\n}\n*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:radial-gradient(circle at top,#0c1d28 0,var(--bg) 38%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,\"Noto Sans TC\",\"Segoe UI\",sans-serif;min-height:100vh}button,input,select,textarea{font:inherit}button{-webkit-tap-highlight-color:transparent}.topbar{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;background:rgba(7,16,24,.92);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.topbar h1{margin:0;font-size:20px}.sub{color:var(--muted);font-size:11px;margin-top:2px}.top-actions{display:flex;align-items:center;gap:7px}.badge,.status-pill{display:inline-flex;align-items:center;gap:4px;border:1px solid #7a5b1b;color:var(--warn);background:#312916;border-radius:999px;padding:6px 9px;font-size:11px;white-space:nowrap}.status-pill.ok{border-color:#176660;color:#5eead4;background:#0c3735}.status-pill.bad{border-color:#6d2638;color:var(--danger);background:#421d29}.account-btn,.icon-btn{border:1px solid var(--line);background:#142936;color:var(--text);border-radius:999px;padding:7px 10px;font-size:11px}.app-shell{max-width:820px;margin:0 auto;padding:18px 16px 112px}h2{margin:0 0 6px;font-size:26px;letter-spacing:-.02em}h3{margin:0 0 10px;font-size:17px}p{line-height:1.6}.muted{color:var(--muted);font-size:13px}.small{font-size:11px}.card{background:linear-gradient(180deg,rgba(16,33,45,.97),rgba(12,26,36,.97));border:1px solid var(--line);border-radius:18px;padding:15px;margin:12px 0;box-shadow:var(--shadow)}.card.clickable{cursor:pointer}.card.accent{border-color:#1b6c66}.card.warn-card{border-color:#7a5b1b;background:#2c2618}.card.error-card{border-color:#6d2638;background:#321a24}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.metric{min-width:0;background:var(--panel2);border:1px solid rgba(41,64,77,.62);border-radius:14px;padding:11px}.metric.highlight{border-color:#1b6c66;background:#0b292b}.metric small,.metric em{display:block;color:var(--muted);font-size:10px;line-height:1.35;font-style:normal}.metric b{display:block;margin-top:5px;font-size:17px;word-break:break-word}.metric .big{font-size:27px}.row{display:flex;gap:8px;align-items:center}.row.wrap{flex-wrap:wrap}.row>.grow{flex:1;min-width:0}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.price{font-size:28px;font-weight:900;letter-spacing:-.02em}.score{font-size:28px;font-weight:900;color:var(--primary);text-align:right}.up{color:var(--up)}.down{color:var(--down)}.neutral{color:var(--warn)}.blue{color:var(--blue)}.btn{border:0;border-radius:13px;padding:12px 14px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--primary),var(--primary2))}.btn.secondary{background:#142936;border:1px solid var(--line)}.btn.danger{background:#4a1f2c;color:#fecdd3}.btn.small-btn{padding:8px 10px;font-size:12px}.btn:disabled{opacity:.5}input,select,textarea{width:100%;border:1px solid var(--line);background:#09151e;color:var(--text);border-radius:13px;padding:12px;outline:none}textarea{min-height:110px;resize:vertical}input:focus,select:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(20,184,166,.12)}label{display:block;color:var(--muted);font-size:12px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.search-row{display:grid;grid-template-columns:1fr auto;gap:8px}.search-results{display:grid;gap:8px;margin-top:10px}.search-result{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:12px;padding:10px;text-align:left}.tag{display:inline-flex;align-items:center;border-radius:999px;padding:6px 9px;margin:3px 3px 3px 0;font-size:10px;background:#0c3735;color:#5eead4}.tag.warn{background:#3d2d19;color:var(--warn)}.tag.bad{background:#4a1f2c;color:var(--danger)}.tag.info{background:#162f46;color:#93c5fd}.rules{display:flex;flex-wrap:wrap;gap:7px}.rules span{padding:7px 9px;border-radius:10px;background:var(--panel2);color:#c2d0d8;font-size:11px}.rank-list{display:grid}.rank{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(41,64,77,.6)}.rank:last-child{border-bottom:0}.list{display:grid;gap:10px}.progress{height:10px;background:#09151e;border-radius:999px;overflow:hidden;border:1px solid var(--line)}.progress>span{display:block;height:100%;border-radius:inherit}.bar-up{background:linear-gradient(90deg,#ef4444,#fb7185)}.bar-neutral{background:linear-gradient(90deg,#d97706,#fbbf24)}.bar-down{background:linear-gradient(90deg,#16a34a,#4ade80)}.prob-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.prob-box{background:var(--panel2);border-radius:13px;padding:10px;border:1px solid var(--line)}.prob-box b{font-size:20px;display:block;margin-top:3px}.factor-list{display:grid;gap:8px}.factor{display:grid;grid-template-columns:88px 1fr auto;align-items:center;gap:9px;font-size:12px}.factor .track{height:8px;border-radius:999px;background:#09151e;overflow:hidden}.factor .track span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),#5eead4)}.data-health{display:flex;justify-content:space-between;gap:12px;align-items:center}.empty{text-align:center;padding:32px 12px}.notice{font-size:12px;line-height:1.65;color:var(--warn);border:1px solid #7a5b1b;background:#2c2618;border-radius:14px;padding:11px;margin:12px 0}.disclaimer{font-size:11px;color:var(--muted);border:1px dashed var(--line);border-radius:13px;padding:12px;margin-top:14px;line-height:1.65}.bottom-nav{position:fixed;z-index:30;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,820px);display:grid;grid-template-columns:repeat(5,1fr);padding:7px 6px max(9px,env(safe-area-inset-bottom));background:rgba(7,16,24,.94);backdrop-filter:blur(18px);border-top:1px solid var(--line)}.bottom-nav button{border:0;background:transparent;color:var(--muted);padding:7px 2px;font-size:9px}.bottom-nav button span{display:block;font-size:19px;margin-bottom:2px}.bottom-nav button.active{color:var(--primary)}.modal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.72);display:flex;align-items:flex-end}.sheet{width:min(100%,820px);max-height:94vh;overflow-y:auto;margin:0 auto;background:var(--bg);border:1px solid var(--line);border-bottom:0;border-radius:24px 24px 0 0;padding:17px 16px max(24px,env(safe-area-inset-bottom));box-shadow:0 -20px 70px rgba(0,0,0,.5)}.sheet-close{float:right;border:0;background:#4a1f2c;color:var(--danger);border-radius:10px;width:36px;height:36px;font-size:20px}.section-title{margin:20px 0 10px;font-size:18px}.loading{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}.spinner{width:16px;height:16px;border:2px solid var(--line);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.sparkline{width:100%;height:84px;display:block;margin:8px 0}.sparkline polyline{fill:none;stroke:var(--primary);stroke-width:2.5;vector-effect:non-scaling-stroke}.sparkline .area{fill:rgba(20,184,166,.12);stroke:none}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 7px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}.segmented{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;padding:4px;background:#08131b;border-radius:13px;border:1px solid var(--line)}.segmented button{border:0;border-radius:10px;padding:9px;background:transparent;color:var(--muted)}.segmented button.active{background:#15303c;color:#fff}.scenario{border-left:4px solid var(--line)}.scenario.good{border-left-color:var(--up)}.scenario.base{border-left-color:var(--warn)}.scenario.bad{border-left-color:var(--down)}.event{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:start;padding:10px 0;border-bottom:1px solid var(--line)}.event:last-child{border-bottom:0}.event-icon{width:34px;height:34px;border-radius:10px;background:#132a36;display:grid;place-items:center}.peer-row{display:grid;grid-template-columns:100px 1fr auto;gap:10px;align-items:center;padding:8px 0}.peer-track{height:8px;background:#09151e;border-radius:99px;overflow:hidden}.peer-track span{display:block;height:100%;background:linear-gradient(90deg,#0f766e,#5eead4)}.stat-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tabs-inline{display:flex;gap:8px;overflow:auto;margin:12px 0}.tabs-inline button{white-space:nowrap;border:1px solid var(--line);background:#12232f;color:var(--muted);border-radius:99px;padding:8px 12px}.tabs-inline button.active{background:#0c3735;color:#5eead4;border-color:#176660}.journal-item{border-left:3px solid var(--primary)}.journal-item.buy{border-left-color:var(--up)}.journal-item.sell{border-left-color:var(--down)}\n@media(min-width:700px){.app-shell{padding-left:24px;padding-right:24px}.list.two-col{grid-template-columns:repeat(2,minmax(0,1fr))}.modal{align-items:center;padding:18px}.sheet{border-radius:24px;border-bottom:1px solid var(--line)}}\n@media(max-width:560px){.grid.three,.grid.four{grid-template-columns:repeat(2,minmax(0,1fr))}.stat-strip{grid-template-columns:repeat(2,1fr)}.badge{display:none}.factor{grid-template-columns:72px 1fr auto}.prob-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.peer-row{grid-template-columns:86px 1fr auto}}\n.bottom-nav{grid-template-columns:repeat(5,1fr)!important}.patch-scenarios{display:grid;gap:8px}.patch-scenario{margin:0}.patch-scenario.positive{border-color:#7b2633}.patch-scenario.neutral{border-color:#7a5b1b}.patch-scenario.negative{border-color:#176b3b}.patch-peer{display:grid;grid-template-columns:90px 1fr 82px;gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);font-size:12px}.patch-peer:last-child{border-bottom:0}.patch-peer>b{text-align:right}.patch-track{height:8px;background:#09151e;border-radius:999px;overflow:hidden}.patch-track span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),#5eead4)}.patch-event{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.patch-event:last-child{border-bottom:0}.patch-event-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#162936;color:var(--warn);font-weight:900}.patch-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.patch-tabs button{border:1px solid var(--line);background:#10212d;color:var(--muted);border-radius:12px;padding:11px}.patch-tabs button.active{color:#5eead4;border-color:#1b6c66;background:#0b292b}.patch-journal{border-left:3px solid var(--primary)}textarea{min-height:88px}.sheet label{display:block;margin-top:10px}.table-wrap{overflow-x:auto}.small{font-size:11px}@media(min-width:700px){.patch-scenarios{grid-template-columns:repeat(3,1fr)}}@media(max-width:420px){.bottom-nav button{font-size:8px!important}.bottom-nav button span{font-size:16px!important}.patch-peer{grid-template-columns:72px 1fr 70px}}\n.smart-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:18px 0 6px}.smart-hero h2{font-size:28px;margin:4px 0}.smart-hero p{margin:0;color:var(--muted);max-width:620px;line-height:1.7}.smart-hero small{color:#5eead4;font-weight:800;letter-spacing:.14em}.smart-filter-card{border-color:#24615f;background:linear-gradient(145deg,rgba(16,33,45,.98),rgba(9,28,34,.98))}.smart-strategies{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:16px 0 10px}.smart-strategies button{border:1px solid var(--line);border-radius:10px;background:#0b1721;color:var(--muted);padding:11px 6px;font-weight:750}.smart-strategies button.active{color:#061512;border-color:#5eead4;background:linear-gradient(135deg,#5eead4,#14b8a6)}.smart-note{margin:0 0 14px;padding:10px 12px}.smart-industry{display:grid!important;grid-template-columns:110px 1fr;align-items:center;margin-bottom:12px}.smart-field{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:12px}.smart-field input,.smart-field select{height:43px}.smart-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.smart-check{min-height:43px;display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;font-size:12px}.smart-check input{width:18px;height:18px;accent-color:var(--primary)}.smart-apply{width:100%;min-height:50px;margin-top:15px;font-size:15px;background:linear-gradient(135deg,#14b8a6,#0f766e)}.smart-results-head{display:flex;align-items:flex-end;justify-content:space-between;margin:23px 0 10px}.smart-results-head h3{margin:0 0 4px}.smart-results-head>b{color:#5eead4;background:#0b292b;border:1px solid #1b6c66;border-radius:999px;padding:7px 11px}.smart-card{position:relative;overflow:hidden}.smart-card:before{content:\"\";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(var(--primary),#60a5fa)}.smart-name{font-size:17px}.smart-score{text-align:right}.smart-score small,.smart-score strong{display:block}.smart-score small{color:var(--muted);font-size:10px}.smart-score strong{font-size:29px;color:#5eead4}.smart-price{display:flex;align-items:baseline;gap:10px;margin:9px 0}.smart-reasons span{color:#bffdf5;border-color:#1b6c66;background:#0b292b}.smart-metrics{margin-top:10px}.smart-actions{margin-top:11px}@media(max-width:760px){.smart-strategies{grid-template-columns:repeat(2,1fr)}.smart-strategies button:last-child{grid-column:1/-1}.smart-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.smart-industry{grid-template-columns:1fr}}@media(max-width:420px){.smart-filter-grid{grid-template-columns:1fr}.smart-hero{display:block}}\n";
const MANIFEST="{\"name\":\"台股智選\",\"short_name\":\"台股智選\",\"description\":\"台股官方盤後資料智能選股、趨勢預測、預測驗證與投資紀錄\",\"start_url\":\"/?source=pwa&v=15.4\",\"scope\":\"/\",\"display\":\"standalone\",\"background_color\":\"#071018\",\"theme_color\":\"#071018\",\"lang\":\"zh-Hant-TW\",\"icons\":[{\"src\":\"/icon.svg?v=15.4\",\"sizes\":\"any\",\"type\":\"image/svg+xml\",\"purpose\":\"any maskable\"}]}\n";
const ICON="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><rect width=\"512\" height=\"512\" rx=\"112\" fill=\"#071018\"/><path d=\"M92 350l92-92 66 58 148-164\" fill=\"none\" stroke=\"#14b8a6\" stroke-width=\"42\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M323 152h75v75\" fill=\"none\" stroke=\"#14b8a6\" stroke-width=\"42\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"184\" cy=\"258\" r=\"22\" fill=\"#f4f8fa\"/><circle cx=\"250\" cy=\"316\" r=\"22\" fill=\"#f4f8fa\"/></svg>\n";
const SERVICE_WORKER="const CACHE='twss-v15-4-sites';\nconst STATIC=[\n  '/',\n  '/app.js?v=15.4',\n  '/patch.js?v=15.4',\n  '/smart.js?v=15.4',\n  '/styles.css?v=15.4',\n  '/manifest.webmanifest?v=15.4',\n  '/icon.svg?v=15.4'\n];\n\nself.addEventListener('install',event=>event.waitUntil(\n  caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())\n));\n\nself.addEventListener('activate',event=>event.waitUntil(\n  caches.keys()\n    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))\n    .then(()=>self.clients.claim())\n));\n\nself.addEventListener('fetch',event=>{\n  if(event.request.method!=='GET')return;\n  const url=new URL(event.request.url);\n  if(url.origin!==location.origin)return;\n  if(url.pathname.startsWith('/api/')){\n    event.respondWith(fetch(event.request,{cache:'no-store'}));\n    return;\n  }\n  if(event.request.mode==='navigate'){\n    event.respondWith(\n      fetch(event.request,{cache:'no-store'})\n        .then(response=>{\n          const copy=response.clone();\n          caches.open(CACHE).then(cache=>cache.put('/',copy));\n          return response;\n        })\n        .catch(()=>caches.match('/'))\n    );\n    return;\n  }\n  event.respondWith(\n    caches.match(event.request)\n      .then(cached=>cached||fetch(event.request).then(response=>{\n        const copy=response.clone();\n        caches.open(CACHE).then(cache=>cache.put(event.request,copy));\n        return response;\n      }))\n  );\n});\n";

const SUPABASE_EDGE = "https://lfkdkdyaatdlizryiyon.supabase.co/functions/v1/twss-market-data";
const TWSE_OPEN = "https://openapi.twse.com.tw/v1";
const TWSE_WEB = "https://www.twse.com.tw";
const TPEX_OPEN = "https://www.tpex.org.tw/openapi/v1";
const VERSION = "15.4";

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

async function fetchJson(url, timeout = 16_000) {
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
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
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
  if (!/^\d{4}$/.test(symbol)) return null;
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
    name: nameOf(row) || text(existing.name),
    industry: industry(
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
    fetchJson(`${TWSE_WEB}/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999`, 20_000),
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
  const initialTwseInstitutionalPayload = fulfilled(initial[4], {});
  const initialTwseInstitutional = rows(initialTwseInstitutionalPayload);
  const tpexPricePayload = fulfilled(initial[5], []);
  const tpexPrices = rows(tpexPricePayload);
  const tpexValuationPayload = fulfilled(initial[6], []);
  const tpexValuations = rows(tpexValuationPayload);
  const tpexCompanies = rows(fulfilled(initial[7], []));
  const tpexMarginPayload = fulfilled(initial[8], []);
  const tpexMargin = rows(tpexMarginPayload);
  const tpexInstitutionalPayload = fulfilled(initial[9], []);
  const tpexInstitutional = rows(tpexInstitutionalPayload);
  const edge = fulfilled(initial[10], null);
  const edgeStocks = edge && Array.isArray(edge.stocks) ? edge.stocks : [];

  const openTwsePriceDate = payloadDate(twseOpenPricePayload, twseOpenPrices);
  const initialTwseInstitutionalDate = payloadDate(
    initialTwseInstitutionalPayload,
    initialTwseInstitutional,
  );
  const tpexPriceDate = payloadDate(tpexPricePayload, tpexPrices);
  const tpexMarginDate = payloadDate(tpexMarginPayload, tpexMargin);
  const targetDate = latestDate(
    initialTwseInstitutionalDate,
    tpexPriceDate,
    openTwsePriceDate,
  );
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
    target && initialTwseInstitutionalDate !== targetDate
      ? fetchJson(
          `${TWSE_WEB}/rwd/zh/fund/T86?date=${target}&response=json&selectType=ALLBUT0999`,
          20_000,
        )
      : Promise.resolve(initialTwseInstitutionalPayload),
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
    initialTwseInstitutionalPayload,
  );
  const refreshedTwseInstitutional = rows(refreshedTwseInstitutionalPayload);
  const twseInstitutional =
    refreshedTwseInstitutional.length >= 20
      ? refreshedTwseInstitutional
      : initialTwseInstitutional;
  const twseInstitutionalDate =
    refreshedTwseInstitutional.length >= 20
      ? payloadDate(refreshedTwseInstitutionalPayload, refreshedTwseInstitutional)
      : initialTwseInstitutionalDate;

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
      /^\d{4}$/.test(text(stock.symbol)) &&
      !officialSymbols.has(text(stock.symbol)),
  );
  const stocks = official.length >= 20 ? [...official, ...fallbackOnly] : edgeStocks;

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
  if (!/^\d{4}$/.test(symbol)) return null;
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
    rev: numeric(
      pick(
        row,
        "營業收入-去年同月增減(%)",
        "去年同月增減(%)",
        "去年同月增減百分比",
        "IncreaseDecreasePercentage",
        "YoY",
      ),
    ),
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
    revYtd: numeric(
      pick(
        row,
        "累計營業收入-前期比較增減(%)",
        "前期比較增減(%)",
        "累計營收前期比較增減(%)",
        "CumulativeIncreaseDecreasePercentage",
        "YTD",
      ),
    ),
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
    const data = rows(payload).filter((row) => /^\d{4}$/.test(symbolOf(row)));
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
    markets: ["上市", "上櫃"],
  };
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

async function handleMarketData(request, url = new URL(request.url)) {
  const type = url.searchParams.get("type") || "stocks";
  const force = url.searchParams.get("refresh") === "1";
  try {
    if (type === "sources") return jsonResponse(sourcesPayload());
    if (type === "revenue") {
      if (!force && revenueCache?.expires > Date.now()) {
        return jsonResponse(revenueCache.payload);
      }
      const payload = await buildRevenue();
      revenueCache = { payload, expires: Date.now() + 900_000 };
      return jsonResponse(payload);
    }
    if (type === "financials") {
      if (!force && financialCache?.expires > Date.now()) {
        return jsonResponse(financialCache.payload);
      }
      const payload = await buildFinancials();
      financialCache = { payload, expires: Date.now() + 900_000 };
      return jsonResponse(payload);
    }
    if (type !== "stocks") {
      const forwarded = new URLSearchParams(url.searchParams);
      forwarded.delete("_");
      forwarded.delete("refresh");
      const payload = await fetchEdge(`?${forwarded.toString()}`);
      return jsonResponse(payload);
    }
    if (!force && stockCache?.expires > Date.now()) {
      return jsonResponse(stockCache.payload);
    }
    const payload = await buildStocks();
    stockCache = { payload, expires: Date.now() + 120_000 };
    return jsonResponse(payload);
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
