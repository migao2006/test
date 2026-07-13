(() => {
  'use strict';

  const VERSION = 'v15.5';
  const SIGNAL_KEY = 'twss-smart-history-signals-v15.5';
  const SIGNAL_TTL = 12 * 60 * 60 * 1000;
  const groupLabels = { listed: '上市股票', otc: '上櫃股票', etf: 'ETF' };
  const labels = {
    balanced: '綜合型', value: '價值型', growth: '成長型',
    dividend: '高股息', momentum: '動能型'
  };
  const notes = {
    balanced: '依各組適用因子平均判斷，缺資料不會自動得到預設分。',
    value: '偏重同組及同產業中的估值、殖利率與財務品質。',
    growth: '偏重月營收年增、累計年增、成長加速度與財務品質。',
    dividend: '偏重殖利率、估值與流動性；ETF 不使用公司基本面。',
    momentum: '偏重 20／60 日趨勢、法人流向、成交量與相對強弱。'
  };
  const baseWeights = {
    listed: { revenue: 25, quality: 20, valuation: 15, chip: 15, momentum: 15, liquidity: 10 },
    otc: { revenue: 30, quality: 20, liquidity: 20, momentum: 15, valuation: 10, chip: 5 },
    etf: { liquidity: 35, momentum: 30, chip: 15, risk: 10, dividend: 10 }
  };
  const factorLabels = { revenue: '營收', quality: '品質', valuation: '估值', chip: '法人', momentum: '動能', liquidity: '流動性', risk: '低波動', dividend: '殖利率' };
  const strategyBoost = {
    balanced: {},
    value: { valuation: 1.65, quality: 1.2, dividend: 1.25, momentum: .7, revenue: .75 },
    growth: { revenue: 1.55, quality: 1.2, momentum: 1.1, valuation: .65, dividend: .65 },
    dividend: { dividend: 1.8, valuation: 1.2, quality: 1.1, liquidity: 1.1, momentum: .75, revenue: .75 },
    momentum: { momentum: 1.8, chip: 1.35, liquidity: 1.2, quality: .65, valuation: .65, revenue: .8 }
  };
  const groupFloorVolume = { listed: 300, otc: 100, etf: 500 };
  const defaults = {
    group: 'listed', strategy: 'balanced', industry: '全部產業',
    minPrice: '', maxPrice: '', maxPe: '35', minYield: '',
    minRev: '', minRoe: '', minVolume: '300', complete: false
  };

  let draft = { ...defaults };
  let applied = { ...defaults };
  const historyQueue = [];
  const historyAttempted = new Set();
  let historyRunning = false;

  const n = value => value === '' || value == null ? null : Number(value);
  const cap = value => clamp(Math.round(value), 0, 100);
  const finite = value => value != null && Number.isFinite(Number(value));
  const logValue = value => finite(value) && Number(value) > 0 ? Math.log10(Number(value)) : null;

  function stockGroup(stock) {
    if (stock.instrumentType === 'ETF' || /^00\d{2,4}$/.test(stock.symbol)) return 'etf';
    return stock.market === '上櫃' ? 'otc' : 'listed';
  }

  function validForGroup(stock, group) {
    if (group === 'etf') return /^00\d{2,4}$/.test(stock.symbol);
    return /^[1-9]\d{3}$/.test(stock.symbol) && stockGroup(stock) === group;
  }

  function historySignal(stock) {
    return S.historySignals.get(stock.symbol) || null;
  }

  function metricValue(stock, key) {
    const signal = historySignal(stock);
    const instRatio = finite(stock.inst) && finite(stock.volume) && stock.volume > 0
      ? stock.inst / stock.volume * 100 : null;
    const amplitude = finite(stock.high) && finite(stock.low) && finite(stock.close) && stock.close > 0
      ? (stock.high - stock.low) / stock.close * 100 : null;
    const closePosition = finite(stock.high) && finite(stock.low) && stock.high > stock.low && finite(stock.close)
      ? (stock.close - stock.low) / (stock.high - stock.low) * 100 : null;
    return {
      rev: stock.rev, revYtd: stock.revYtd, revMom: stock.revMom,
      revAcceleration: stock.revAcceleration,
      roe: stock.roe, eps: stock.eps, grossMargin: stock.grossMargin,
      operatingMargin: stock.operatingMargin, debt: stock.debt,
      pe: stock.pe > 0 ? stock.pe : null, pb: stock.pb > 0 ? stock.pb : null,
      yield: stock.yield, instRatio, foreign: stock.foreign,
      change: stock.change, closePosition,
      volumeLog: logValue(stock.volume), valueLog: logValue(stock.value),
      return20: signal?.return20, return60: signal?.return60,
      volumeRatio: signal?.volumeRatio, atrPct: signal?.atrPct,
      amplitude
    }[key];
  }

  function makeContext(rows) {
    const keys = [
      'rev', 'revYtd', 'revMom', 'revAcceleration', 'roe', 'eps', 'grossMargin',
      'operatingMargin', 'debt', 'pe', 'pb', 'yield', 'instRatio', 'foreign',
      'change', 'closePosition', 'volumeLog', 'valueLog', 'return20', 'return60',
      'volumeRatio', 'atrPct', 'amplitude'
    ];
    return Object.fromEntries(keys.map(key => [key, rows.map(stock => metricValue(stock, key)).filter(finite)]));
  }

  function percentile(values, value, higher = true) {
    if (!finite(value) || !values.length) return null;
    const rank = values.filter(item => higher ? item <= value : item >= value).length;
    return cap(rank / values.length * 100);
  }

  function subScore(ctx, stock, definitions) {
    let score = 0, available = 0, total = 0;
    definitions.forEach(([key, weight, higher = true]) => {
      total += weight;
      const value = metricValue(stock, key);
      const ranked = percentile(ctx[key] || [], value, higher);
      if (ranked == null) return;
      score += ranked * weight;
      available += weight;
    });
    return available ? { score: score / available, coverage: available / total } : null;
  }

  function factors(stock, ctx, group) {
    const common = {
      revenue: subScore(ctx, stock, [
        ['rev', .42], ['revYtd', .28], ['revMom', .15], ['revAcceleration', .15]
      ]),
      quality: subScore(ctx, stock, [
        ['roe', .34], ['eps', .14], ['grossMargin', .17],
        ['operatingMargin', .18], ['debt', .17, false]
      ]),
      valuation: subScore(ctx, stock, [
        ['pe', .42, false], ['pb', .28, false], ['yield', .30]
      ]),
      chip: subScore(ctx, stock, [['instRatio', .7], ['foreign', .3]]),
      momentum: subScore(ctx, stock, [
        ['return20', .32], ['return60', .28], ['volumeRatio', .15],
        ['change', .15], ['closePosition', .10]
      ]),
      liquidity: subScore(ctx, stock, [['volumeLog', .55], ['valueLog', .45]]),
      risk: subScore(ctx, stock, [['atrPct', .65, false], ['amplitude', .35, false]]),
      dividend: subScore(ctx, stock, [['yield', 1]])
    };
    if (group === 'etf') return {
      liquidity: common.liquidity, momentum: common.momentum,
      chip: common.chip, risk: common.risk, dividend: common.dividend
    };
    return common;
  }

  function scoreStock(stock, ctx, group, strategy) {
    const values = factors(stock, ctx, group);
    const boosts = strategyBoost[strategy] || {};
    let weighted = 0, availableWeight = 0, totalWeight = 0, factorCoverage = 0;
    Object.entries(baseWeights[group]).forEach(([key, base]) => {
      const weight = base * (boosts[key] || 1);
      totalWeight += weight;
      if (!values[key]) return;
      weighted += values[key].score * weight;
      availableWeight += weight;
      factorCoverage += values[key].coverage * weight;
    });
    if (!availableWeight) return { score: 0, confidence: 0, factors: values };
    const completeness = factorCoverage / totalWeight;
    let result = weighted / availableWeight * (.62 + completeness * .38);
    if (stock.disp === true) result -= 12;
    if (stock.full === true) result -= 18;
    if (group === 'otc' && metricValue(stock, 'amplitude') > 8) result -= 4;
    return { score: cap(result), confidence: cap(completeness * 100), factors: values };
  }

  function reasons(stock, group) {
    const out = [];
    const signal = historySignal(stock);
    if (group === 'etf') {
      if (signal?.return20 != null) out.push(`20日 ${pct(signal.return20)}`);
      if ((stock.volume || 0) >= 5000) out.push('成交量充足');
      if (stock.inst > 0) out.push('法人買超');
      if (stock.yield >= 4) out.push(`殖利率 ${fmt(stock.yield)}%`);
    } else {
      if (stock.rev >= 10) out.push(`營收年增 ${pct(stock.rev)}`);
      if (stock.revAcceleration >= 5) out.push(`成長加速 ${pct(stock.revAcceleration)}`);
      if (stock.roe >= 10) out.push(`ROE ${fmt(stock.roe)}%`);
      if (stock.pe > 0 && stock.pe <= 15) out.push(`本益比 ${fmt(stock.pe)}`);
      if (stock.inst > 0) out.push('法人買超');
      if (signal?.return20 > 0) out.push(`20日動能 ${pct(signal.return20)}`);
    }
    if (!out.length) out.push('同組多因子表現較均衡');
    return out.slice(0, 4);
  }

  function matches(stock, filters, group) {
    if (!validForGroup(stock, group) || stock.close == null) return false;
    if (group !== 'etf' && filters.industry !== '全部產業' && stock.industry !== filters.industry) return false;
    if (n(filters.minPrice) != null && stock.close < n(filters.minPrice)) return false;
    if (n(filters.maxPrice) != null && stock.close > n(filters.maxPrice)) return false;
    const floor = Math.max(groupFloorVolume[group], n(filters.minVolume) || 0);
    if (!finite(stock.volume) || stock.volume < floor) return false;
    if (group !== 'etf') {
      if (n(filters.maxPe) != null && finite(stock.pe) && stock.pe > 0 && stock.pe > n(filters.maxPe)) return false;
      if (n(filters.minRev) != null && (!finite(stock.rev) || stock.rev < n(filters.minRev))) return false;
      if (n(filters.minRoe) != null && (!finite(stock.roe) || stock.roe < n(filters.minRoe))) return false;
    }
    if (n(filters.minYield) != null && (!finite(stock.yield) || stock.yield < n(filters.minYield))) return false;
    if (filters.complete) {
      const required = group === 'etf'
        ? [stock.volume, stock.change, historySignal(stock)?.return20]
        : [stock.rev, stock.roe ?? stock.eps, stock.pe ?? stock.pb, stock.volume];
      if (required.some(value => !finite(value))) return false;
    }
    return stock.disp !== true && stock.full !== true;
  }

  function diversify(items, group, limit = 30) {
    if (group === 'etf') return items.slice(0, limit);
    const industryCounts = new Map();
    const selected = [];
    for (const item of items) {
      const count = industryCounts.get(item.stock.industry) || 0;
      if (count >= 4) continue;
      selected.push(item);
      industryCounts.set(item.stock.industry, count + 1);
      if (selected.length >= limit) break;
    }
    return selected;
  }

  function groupRanking(group, limit = 5, strategy = 'balanced') {
    const rows = S.stocks.filter(stock => validForGroup(stock, group));
    const ctx = makeContext(rows);
    const filters = { ...defaults, group, strategy, minVolume: String(groupFloorVolume[group]) };
    return diversify(rows.filter(stock => matches(stock, filters, group)).map(stock => ({
      stock, ...scoreStock(stock, ctx, group, strategy), reasons: reasons(stock, group)
    })).sort((a, b) => b.score - a.score || b.confidence - a.confidence), group, limit);
  }

  function signalFromHistory(result) {
    const rows = result.rows || [];
    const close = rows.map(row => row.close).filter(finite);
    const last = close.at(-1);
    const changeFrom = days => close.length > days && last
      ? (last / close[close.length - 1 - days] - 1) * 100 : null;
    return {
      return20: changeFrom(20), return60: changeFrom(60),
      volumeRatio: result.indicators?.volumeRatio ?? null,
      atrPct: result.indicators?.atrPct ?? null,
      fetchedAt: Date.now()
    };
  }

  function loadStoredSignals() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SIGNAL_KEY) || '{}');
      Object.entries(stored).forEach(([symbol, signal]) => {
        if (Date.now() - Number(signal?.fetchedAt || 0) <= SIGNAL_TTL) S.historySignals.set(symbol, signal);
      });
    } catch {}
  }

  function storeSignals() {
    try { sessionStorage.setItem(SIGNAL_KEY, JSON.stringify(Object.fromEntries(S.historySignals))); } catch {}
  }

  function queueHistory(stocks) {
    stocks.slice(0, 5).forEach(stock => {
      if (S.historySignals.has(stock.symbol) || historyAttempted.has(stock.symbol)) return;
      historyAttempted.add(stock.symbol);
      historyQueue.push(stock);
    });
    runHistoryQueue();
  }

  async function runHistoryQueue() {
    if (historyRunning) return;
    historyRunning = true;
    while (historyQueue.length) {
      const stock = historyQueue.shift();
      await wait(1500);
      try {
        const result = await getHistory(stock.symbol);
        S.historySignals.set(stock.symbol, signalFromHistory(result));
        storeSignals();
        if (S.tab === 'opportunities') render();
      } catch {}
    }
    historyRunning = false;
  }

  function card(item, group) {
    const stock = item.stock;
    const signal = historySignal(stock);
    const historical = signal ? `歷史動能已納入` : '歷史動能待補';
    const metrics = group === 'etf'
      ? `${metric('20日動能', signal ? pct(signal.return20) : reasonDash('逐檔補抓中'))}${metric('法人買賣超', stock.inst == null ? reasonDash('官方無資料') : `${fmt(stock.inst, 0)} 張`)}${metric('成交量', `${fmt(stock.volume, 0)} 張`)}${metric('殖利率', stock.yield == null ? reasonDash('官方無資料') : `${fmt(stock.yield)}%`)}`
      : `${metric('月營收年增', stock.rev == null ? reasonDash('官方無資料') : pct(stock.rev))}${metric('成長加速度', stock.revAcceleration == null ? reasonDash('資料不足') : pct(stock.revAcceleration))}${metric('ROE', valueOrReason(stock.roe, '%'))}${metric('本益比', valueOrReason(stock.pe))}`;
    return `<article class="card smart-card clickable" data-detail="${stock.symbol}"><div class="head"><div><b class="smart-name">${esc(stock.name)}</b><div class="muted">${stock.symbol} · ${esc(groupLabels[group])} · ${esc(stock.industry)}</div></div><div class="smart-score"><small>組內分數</small><strong>${item.score}</strong></div></div><div class="smart-price"><span class="price">${fmt(stock.close)}</span><b class="${cls(stock.change)}">${pct(stock.change)}</b></div><div class="rules smart-reasons">${item.reasons.map(reason => `<span>${esc(reason)}</span>`).join('')}</div><div class="grid smart-metrics">${metrics}</div><div class="smart-confidence"><span>資料信心 ${item.confidence}%</span><span>${historical}</span></div><div class="row smart-actions"><button class="btn grow" data-forecast="${stock.symbol}">深度預測</button><button class="btn secondary" data-watch="${stock.symbol}">${isWatched(stock.symbol) ? '★ 已自選' : '＋自選'}</button></div></article>`;
  }

  function input(id, label, value, extra = '') {
    return `<label class="smart-field"><span>${label}</span><input id="${id}" type="number" value="${esc(value)}" ${extra}></label>`;
  }

  function allowedStrategies(group) {
    return group === 'etf' ? ['balanced', 'dividend', 'momentum'] : Object.keys(labels);
  }

  opportunitiesPage = function () {
    const group = applied.group;
    const groupRows = S.stocks.filter(stock => validForGroup(stock, group));
    const ctx = makeContext(groupRows);
    const allRanked = groupRows
      .filter(stock => matches(stock, applied, group))
      .map(stock => ({
        stock,
        ...scoreStock(stock, ctx, group, applied.strategy),
        reasons: reasons(stock, group)
      }))
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
    const ranked = diversify(allRanked, group);
    if (S.fundStatus !== 'loading') setTimeout(() => queueHistory(ranked.map(item => item.stock)), 0);
    const industries = ['全部產業', ...new Set(groupRows.map(stock => stock.industry).filter(Boolean))]
      .sort((a, b) => a === '全部產業' ? -1 : b === '全部產業' ? 1 : a.localeCompare(b, 'zh-Hant'));
    const counts = Object.fromEntries(Object.keys(groupLabels).map(key => [key, S.stocks.filter(stock => validForGroup(stock, key)).length]));
    const strategies = allowedStrategies(draft.group);
    const formula = Object.entries(baseWeights[draft.group]).map(([key, weight]) => `${factorLabels[key]} ${weight}%`).join('、');
    return `<div class="smart-hero"><div><small>SMART SCREENER · ${VERSION}</small><h2>智能選股</h2><p>上市、上櫃與 ETF 分開比較，依各組適用指標計分。</p></div><span class="status-pill ${S.mode === 'live' ? 'good' : 'warn'}">${S.mode === 'live' ? '官方日期已核對' : '部分官方資料'}</span></div>${statusCard()}<section class="card smart-filter-card"><div class="head"><div><h3>商品分組</h3><div class="muted">不同商品不會互相比名次。</div></div><button id="smartReset" class="btn secondary">重設</button></div><div class="smart-groups">${Object.entries(groupLabels).map(([key, label]) => `<button class="${draft.group === key ? 'active' : ''}" data-smart-group="${key}">${label}<small>${counts[key]}</small></button>`).join('')}</div><h3 class="smart-subtitle">選股策略</h3><div class="smart-strategies">${strategies.map(key => `<button class="${draft.strategy === key ? 'active' : ''}" data-smart-strategy="${key}">${labels[key]}</button>`).join('')}</div><div class="notice smart-note"><b>${groupLabels[draft.group]} · ${labels[draft.strategy]}</b>：${notes[draft.strategy]}<br><small>基準權重：${formula}</small></div>${draft.group === 'etf' ? '' : `<label class="smart-field smart-industry"><span>產業類別</span><select id="smartIndustry">${industries.map(industry => `<option value="${esc(industry)}" ${draft.industry === industry ? 'selected' : ''}>${esc(industry)}</option>`).join('')}</select></label>`}<div class="smart-filter-grid">${input('smartMinPrice', '最低股價（元）', draft.minPrice, 'min="0" placeholder="不限"')}${input('smartMaxPrice', '最高股價（元）', draft.maxPrice, 'min="0" placeholder="不限"')}${draft.group === 'etf' ? '' : input('smartMaxPe', '最高本益比', draft.maxPe, 'min="0"')}${input('smartMinYield', '最低殖利率（%）', draft.minYield, 'step="0.5" placeholder="不限"')}${draft.group === 'etf' ? '' : input('smartMinRev', '最低月營收年增（%）', draft.minRev, 'placeholder="不限"')}${draft.group === 'etf' ? '' : input('smartMinRoe', '最低 ROE（%）', draft.minRoe, 'placeholder="不限"')}${input('smartMinVolume', '最低成交量（張）', draft.minVolume, 'step="100"')}<label class="smart-check"><input id="smartComplete" type="checkbox" ${draft.complete ? 'checked' : ''}><span>只看資料完整標的</span></label></div><button id="smartApply" class="btn smart-apply">開始智能選股 <span>→</span></button></section><div class="smart-results-head"><div><h3>${groupLabels[group]}排名</h3><div class="muted">${labels[applied.strategy]} · 組內百分位${group === 'etf' ? '' : ' · 每產業最多 4 檔'}</div></div><b>${ranked.length} 檔</b></div>${ranked.length ? `<div class="list two-col smart-results">${ranked.map(item => card(item, group)).join('')}</div>` : `<div class="card empty"><h3>目前沒有符合條件的標的</h3><p class="muted">可放寬成交量、估值或成長門檻；ETF 不使用公司月營收與 ROE。</p></div>`}<div class="notice"><b>評分說明</b><br>分數只與同組商品比較；缺資料不會得到預設分，會降低資料信心與完整度加權。歷史日線只為目前分組前 5 名逐檔補抓，每次間隔 1.5 秒。排名僅供研究，不保證獲利。</div>${disclaimer()}`;
  };

  function read() {
    draft = {
      ...draft,
      industry: q('#smartIndustry')?.value || draft.industry || '全部產業',
      minPrice: q('#smartMinPrice')?.value ?? draft.minPrice,
      maxPrice: q('#smartMaxPrice')?.value ?? draft.maxPrice,
      maxPe: q('#smartMaxPe')?.value ?? draft.maxPe,
      minYield: q('#smartMinYield')?.value ?? draft.minYield,
      minRev: q('#smartMinRev')?.value ?? draft.minRev,
      minRoe: q('#smartMinRoe')?.value ?? draft.minRoe,
      minVolume: q('#smartMinVolume')?.value ?? draft.minVolume,
      complete: Boolean(q('#smartComplete')?.checked)
    };
  }

  function bindSmart() {
    qa('[data-smart-group]').forEach(button => button.onclick = () => {
      read();
      draft.group = button.dataset.smartGroup;
      draft.industry = '全部產業';
      draft.minVolume = String(groupFloorVolume[draft.group]);
      if (!allowedStrategies(draft.group).includes(draft.strategy)) draft.strategy = 'balanced';
      applied = { ...draft };
      render();
    });
    qa('[data-smart-strategy]').forEach(button => button.onclick = () => {
      read(); draft.strategy = button.dataset.smartStrategy; render();
    });
    q('#smartApply')?.addEventListener('click', () => {
      read(); applied = { ...draft }; render(); scrollTo({ top: 0, behavior: 'smooth' });
    });
    q('#smartReset')?.addEventListener('click', () => {
      draft = { ...defaults }; applied = { ...defaults }; render();
    });
  }

  loadStoredSignals();
  globalThis.twssGroupRanking = groupRanking;
  const oldBind = bind;
  bind = function () { oldBind(); bindSmart(); };
  const button = q('.bottom-nav [data-tab="opportunities"]');
  if (button) button.innerHTML = '<span>◆</span>智能選股';
  render();
})();
