(() => {
  'use strict';
  const labels={balanced:'綜合型',value:'價值型',growth:'成長型',dividend:'高股息',momentum:'動能型'};
  const notes={balanced:'基本面、估值、籌碼與流動性平均考量',value:'偏重低本益比、低股價淨值比與財務品質',growth:'偏重月營收成長、ROE 與 EPS',dividend:'偏重殖利率，同時避開流動性過弱標的',momentum:'偏重當日漲勢、法人買超與成交活絡度'};
  const defaults={strategy:'balanced',industry:'全部產業',minPrice:'',maxPrice:'',maxPe:'35',minYield:'0',minRev:'0',minRoe:'0',minVolume:'500',complete:false};
  let draft={...defaults},applied={...defaults};
  const n=value=>value===''||value==null?null:Number(value);
  const cap=value=>clamp(Math.round(value),0,100);

  function factors(stock){
    return{
      pe:stock.pe==null||stock.pe<=0?20:cap(118-stock.pe*3.2),
      pb:stock.pb==null?25:cap(112-stock.pb*25),
      dividend:stock.yield==null?15:cap(stock.yield*15),
      growth:stock.rev==null?20:cap(46+stock.rev*1.45+(stock.revYtd||0)*.45),
      quality:stock.roe==null?25:cap(stock.roe*5.2+(stock.eps>0?12:-10)-Math.max(0,(stock.debt||0)-60)),
      chip:cap(48+Math.sign(stock.foreign||0)*Math.min(24,Math.log10(Math.abs(stock.foreign||0)+1)*6)+Math.sign(stock.trust||0)*10),
      momentum:cap(50+(stock.change||0)*8+((stock.foreign||0)>0?8:0)),
      liquidity:stock.volume==null?10:cap(Math.log10(Math.max(stock.volume,1))*29-24)
    }
  }
  function score(stock,strategy){
    const f=factors(stock),formula={
      balanced:f.pe*.16+f.pb*.11+f.dividend*.1+f.growth*.2+f.quality*.18+f.chip*.1+f.momentum*.07+f.liquidity*.08,
      value:f.pe*.34+f.pb*.25+f.dividend*.13+f.quality*.16+f.liquidity*.12,
      growth:f.growth*.42+f.quality*.25+f.momentum*.1+f.chip*.1+f.liquidity*.13,
      dividend:f.dividend*.46+f.pe*.15+f.quality*.18+f.pb*.09+f.liquidity*.12,
      momentum:f.momentum*.43+f.chip*.22+f.liquidity*.2+f.growth*.1+f.quality*.05
    };return cap(formula[strategy]??formula.balanced)
  }
  function reasons(stock,strategy){
    const out=[];
    if(stock.rev!=null&&stock.rev>=10)out.push(`營收年增 ${pct(stock.rev)}`);
    if(stock.roe!=null&&stock.roe>=10)out.push(`ROE ${fmt(stock.roe)}%`);
    if(stock.pe!=null&&stock.pe>0&&stock.pe<=15)out.push(`本益比 ${fmt(stock.pe)}`);
    if(stock.pb!=null&&stock.pb<=1.8)out.push(`淨值比 ${fmt(stock.pb)}`);
    if(stock.yield!=null&&stock.yield>=4)out.push(`殖利率 ${fmt(stock.yield)}%`);
    if(stock.foreign>0)out.push('外資買超');
    if(stock.change>=1)out.push('短線動能偏強');
    if((stock.volume||0)>=1000)out.push('成交量充足');
    if(!out.length)out.push(`${labels[strategy]}條件較均衡`);return out.slice(0,4)
  }
  function match(stock,f){
    if(f.industry!=='全部產業'&&stock.industry!==f.industry)return false;
    if(n(f.minPrice)!=null&&(stock.close==null||stock.close<n(f.minPrice)))return false;
    if(n(f.maxPrice)!=null&&(stock.close==null||stock.close>n(f.maxPrice)))return false;
    if(stock.pe!=null&&n(f.maxPe)!=null&&stock.pe>n(f.maxPe))return false;
    if(stock.yield!=null&&n(f.minYield)!=null&&stock.yield<n(f.minYield))return false;
    if(stock.rev!=null&&n(f.minRev)!=null&&stock.rev<n(f.minRev))return false;
    if(stock.roe!=null&&n(f.minRoe)!=null&&stock.roe<n(f.minRoe))return false;
    if(n(f.minVolume)!=null&&(stock.volume==null||stock.volume<n(f.minVolume)))return false;
    if(f.complete&&[stock.pe,stock.yield,stock.rev,stock.roe].some(v=>v==null))return false;
    return stock.close!=null&&/^\d{4}$/.test(stock.symbol)
  }
  function card(item){const s=item.stock;return`<article class="card smart-card clickable" data-detail="${s.symbol}"><div class="head"><div><b class="smart-name">${esc(s.name)}</b><div class="muted">${s.symbol} · ${esc(s.market)} · ${esc(s.industry)}</div></div><div class="smart-score"><small>匹配分數</small><strong>${item.score}</strong></div></div><div class="smart-price"><span class="price">${fmt(s.close)}</span><b class="${cls(s.change)}">${pct(s.change)}</b></div><div class="rules smart-reasons">${item.reasons.map(r=>`<span>${esc(r)}</span>`).join('')}</div><div class="grid smart-metrics">${metric('月營收年增',pct(s.rev))}${metric('ROE',valueOrReason(s.roe,'%'))}${metric('本益比',valueOrReason(s.pe))}${metric('殖利率',valueOrReason(s.yield,'%'))}</div><div class="row smart-actions"><button class="btn grow" data-forecast="${s.symbol}">深度預測</button><button class="btn secondary" data-watch="${s.symbol}">${isWatched(s.symbol)?'★ 已自選':'＋自選'}</button></div></article>`}
  function input(id,label,value,extra=''){return`<label class="smart-field"><span>${label}</span><input id="${id}" type="number" value="${esc(value)}" ${extra}></label>`}
  opportunitiesPage=function(){
    const industries=['全部產業',...new Set(S.stocks.map(s=>s.industry).filter(Boolean))].sort((a,b)=>a==='全部產業'?-1:b==='全部產業'?1:a.localeCompare(b,'zh-Hant'));
    const ranked=S.stocks.filter(s=>match(s,applied)).map(stock=>({stock,score:score(stock,applied.strategy),reasons:reasons(stock,applied.strategy)})).sort((a,b)=>b.score-a.score);
    return`<div class="smart-hero"><div><small>SMART SCREENER · v15.4</small><h2>智能選股</h2><p>從台股公開行情、月營收、財報與法人籌碼中，找出最符合你策略的標的。</p></div><span class="status-pill ${S.mode==='live'?'good':'warn'}">${S.mode==='live'?'官方日期已核對':'部分官方資料'}</span></div>${statusCard()}<section class="card smart-filter-card"><div class="head"><div><h3>篩選條件</h3><div class="muted">先選策略，再設定你在意的最低門檻。</div></div><button id="smartReset" class="btn secondary">重設</button></div><div class="smart-strategies">${Object.entries(labels).map(([key,label])=>`<button class="${draft.strategy===key?'active':''}" data-smart-strategy="${key}">${label}</button>`).join('')}</div><div class="notice smart-note"><b>${labels[draft.strategy]}</b>：${notes[draft.strategy]}</div><label class="smart-field smart-industry"><span>產業類別</span><select id="smartIndustry">${industries.map(i=>`<option value="${esc(i)}" ${draft.industry===i?'selected':''}>${esc(i)}</option>`).join('')}</select></label><div class="smart-filter-grid">${input('smartMinPrice','最低股價（元）',draft.minPrice,'min="0" placeholder="不限"')}${input('smartMaxPrice','最高股價（元）',draft.maxPrice,'min="0" placeholder="不限"')}${input('smartMaxPe','最高本益比',draft.maxPe,'min="0"')}${input('smartMinYield','最低殖利率（%）',draft.minYield,'step="0.5"')}${input('smartMinRev','最低月營收年增（%）',draft.minRev)}${input('smartMinRoe','最低 ROE（%）',draft.minRoe)}${input('smartMinVolume','最低成交量（張）',draft.minVolume,'step="100"')}<label class="smart-check"><input id="smartComplete" type="checkbox" ${draft.complete?'checked':''}><span>排除基本面資料不足</span></label></div><button id="smartApply" class="btn smart-apply">開始智能選股 <span>→</span></button></section><div class="smart-results-head"><div><h3>篩選結果</h3><div class="muted">${labels[applied.strategy]} · 依匹配分數排序</div></div><b>${ranked.length} 檔</b></div>${ranked.length?`<div class="list two-col smart-results">${ranked.slice(0,30).map(card).join('')}</div>`:`<div class="card empty"><h3>目前沒有符合條件的股票</h3><p class="muted">可嘗試放寬本益比、營收年增或成交量門檻。</p></div>`}<div class="notice"><b>評分說明</b><br>智能分數是固定、可重現的多因子排名，不是保證獲利的 AI 預言。</div>${disclaimer()}`
  };
  function read(){draft={...draft,industry:q('#smartIndustry')?.value||'全部產業',minPrice:q('#smartMinPrice')?.value??'',maxPrice:q('#smartMaxPrice')?.value??'',maxPe:q('#smartMaxPe')?.value??'',minYield:q('#smartMinYield')?.value??'',minRev:q('#smartMinRev')?.value??'',minRoe:q('#smartMinRoe')?.value??'',minVolume:q('#smartMinVolume')?.value??'',complete:Boolean(q('#smartComplete')?.checked)}}
  function bindSmart(){qa('[data-smart-strategy]').forEach(button=>button.onclick=()=>{read();draft.strategy=button.dataset.smartStrategy;render()});q('#smartApply')?.addEventListener('click',()=>{read();applied={...draft};render();scrollTo({top:0,behavior:'smooth'})});q('#smartReset')?.addEventListener('click',()=>{draft={...defaults};applied={...defaults};render()})}
  const oldBind=bind;bind=function(){oldBind();bindSmart()};
  const button=q('.bottom-nav [data-tab="opportunities"]');if(button)button.innerHTML='<span>◆</span>智能選股';render();
})();
