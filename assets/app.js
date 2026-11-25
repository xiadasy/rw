/* RW 界面：读取数据 → 调用 engine.js → 渲染各页。所有设置保存在浏览器 localStorage。 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const LS = { set: 'rw.settings', race: 'rw.races', acts: 'rw.activities', ui: 'rw.ui' };
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('浏览器存储已满或不可用：' + e.message); } };

  let settings = Object.assign({}, RW.DEFAULTS, load(LS.set, {}));
  let raceOv = load(LS.race, {});
  let ui = Object.assign({ vdotR: '365', loadR: '180', volR: '52', zoneR: '12', recF: 'all', recQ: '', recM: '', recSort: 'date', recN: 80, taperPlan: 'pfitz', taperPct: 60, taperRest: 0, paceV: '' }, load(LS.ui, {}));
  const saveUI = () => save(LS.ui, ui);
  let R = null; const charts = [];

  function activities() {
    const imp = load(LS.acts, null);
    if (imp && imp.activities && imp.activities.length) return { acts: imp.activities, meta: imp.meta, imported: true };
    const d = window.RW_DATA || { activities: [], meta: {} };
    return { acts: d.activities, meta: d.meta, imported: false };
  }
  function recompute() {
    const d = activities();
    R = d.acts.length ? RW.analyze(d.acts, settings, raceOv) : null;
    if (R) R.meta = d.meta, R.imported = d.imported;
    $('#dataMeta').textContent = R ? `数据 ${d.meta.first || R.days[0]} 至 ${d.meta.last || ''} · ${d.acts.length} 条记录${d.imported ? '（已导入）' : ''}` : '';
  }

  // ---------- 小工具 ----------
  const f1 = x => x == null || !Number.isFinite(x) ? '—' : x.toFixed(1);
  const f0 = x => x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('zh-CN');
  const sgn = x => x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = d => d ? `${+d.slice(5, 7)}月${+d.slice(8, 10)}日` : '';
  const segBtns = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${ui[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const goalS = () => RW.parseHMS(settings.goal); const pbS = () => RW.parseHMS(settings.pb);
  const raceDist = () => +settings.raceDist || 42195;
  const pace1 = s => { if (!s) return '—'; const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };
  const distName = m => m === 42195 ? '全马' : m === 21097.5 ? '半马' : (m / 1000) + ' 公里';
  const curCal = () => R.suggestCalib ? R.curNow - R.calib + R.suggestCalib.value : null;
  function lastN(n) { return Math.max(0, R.iT - n + 1); }
  const C = { acc: '#A8DC0C', blue: '#5aa9ff', orange: '#ff9f43', red: '#ff5d5d', yellow: '#ffd23f', cyan: '#38d6c4', grid: 'rgba(255,255,255,.06)', t2: '#a9b19f', t3: '#737b6a' };
  const BAND_COLORS = { fresh: C.cyan, good: C.acc, ok: C.blue, train: C.yellow, tired: C.orange, very: C.red };

  function chart(id, cfg) {
    const cv = document.getElementById(id); if (!cv) return;
    const ch = new Chart(cv.getContext('2d'), cfg); charts.push(ch); return ch;
  }
  function baseOpts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: C.t2, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 12 } } },
        tooltip: { backgroundColor: '#1d2219', borderColor: '#323829', borderWidth: 1, titleColor: '#ecf1e4', bodyColor: '#ecf1e4', padding: 10 } },
      scales: { x: { ticks: { color: C.t3, maxTicksLimit: 7, maxRotation: 0, autoSkip: true }, grid: { color: C.grid } },
        y: { ticks: { color: C.t3 }, grid: { color: C.grid } } }
    }, extra || {});
  }
  // 状况色带背景插件
  const bandPlugin = {
    id: 'bands', beforeDraw(ch, _a, opt) {
      if (!opt || !opt.on) return; const y = ch.scales.y; const { left, right } = ch.chartArea; const ctx = ch.ctx;
      const bands = [[5, 99, C.cyan], [0, 5, C.acc], [-2, 0, C.blue], [-7, -2, C.yellow], [-10, -7, C.orange], [-99, -10, C.red]];
      ctx.save(); bands.forEach(([lo, hi, col]) => {
        const y1 = y.getPixelForValue(Math.min(hi, y.max)), y2 = y.getPixelForValue(Math.max(lo, y.min)); if (y2 <= y1) return;
        ctx.fillStyle = col + '14'; ctx.fillRect(left, y1, right - left, y2 - y1);
      }); ctx.restore();
    }
  };
  Chart.register(bandPlugin);
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  // ---------- 页面 ----------
  const pages = {};

  pages.overview = () => {
    const i = R.iT; const tsb = R.tsb[i]; const band = RW.tsbBand(tsb);
    const daysTo = RW.diffDays(settings.raceDate, R.today);
    const pred = RW.raceTime(R.curNow, raceDist()); const g = goalS();
    const need = g ? RW.vdot(raceDist(), g) : null; const cal = curCal();
    const predCal = cal ? RW.raceTime(cal, raceDist()) : null;
    const thisW = R.weekList[R.weekList.length - 1];
    const k28 = R.sessions.filter(x => RW.diffDays(R.today, x.day) < 28).reduce((t, x) => t + x.km, 0);
    const pos = v => Math.max(0, Math.min(100, (v + 20) / 35 * 100));
    const taper = defaultTaper(); const tEnd = taper ? taper[taper.length - 1] : null;
    const alerts = [];
    if (R.run10 >= 7) alerts.push(['bad', `状况已连续 ${R.run10} 天低于 −10，属于过量训练，建议立即减量休息。`]);
    else if (R.run8 >= 3) alerts.push(['warn', `状况已连续 ${R.run8} 天低于 −8，属于过度疲劳，建议接下来几天减量。`]);
    return `
    <div class="grid">
      <section class="card hl c12"><div class="hero">
        <div><div class="race">${esc(settings.raceName)} · ${settings.raceDate.slice(0, 4)}年${md(settings.raceDate)} · ${distName(raceDist())}</div>
          <div class="count">${daysTo >= 0 ? daysTo : '—'}<small>${daysTo >= 0 ? '天后开跑' : '比赛已过'}</small></div></div>
        <div class="goal">
          <div><span>目标</span><b>${esc(settings.goal)}</b><span>需要跑力 ${f1(need)} · 配速 ${g ? pace1(g / (raceDist() / 1000)) : '—'}/km</span></div>
          <div><span>当前跑力推估</span><b>${RW.fmtT(pred)}</b><span>${g ? (pred > g ? '比目标慢 ' : '比目标快 ') + RW.fmtT(Math.abs(pred - g)) : ''}</span></div>
          ${predCal ? `<div><span>校准后推估</span><b>${RW.fmtT(predCal)}</b><span>${g ? (predCal > g ? '比目标慢 ' : '比目标快 ') + RW.fmtT(Math.abs(predCal - g)) : ''}</span></div>` : ''}
          <div><span>PB</span><b>${esc(settings.pb)}</b><span>对应跑力 ${f1(pbS() ? RW.vdot(raceDist(), pbS()) : null)}</span></div>
        </div></div></section>
      ${alerts.map(([k, t]) => `<div class="c12 callout ${k}">${t}</div>`).join('')}
      <section class="card kpi c3"><div class="lab">当前跑力</div><div class="val">${f1(R.curNow)}${R.trend3w != null ? `<small class="${R.trend3w >= 0 ? 'up' : 'down'}">${R.trend3w >= 0 ? '▲' : '▼'} ${Math.abs(R.trend3w).toFixed(1)}</small>` : ''}</div>
        <div class="det">近 42 天即时跑力加权；箭头为近 3 周变化${cal ? `。按比赛日差值校准为 ${f1(cal)}` : ''}</div></section>
      <section class="card kpi c3"><div class="lab">体能</div><div class="val">${f1(R.ctl[i - 1] ?? R.ctl[i])}</div><div class="det">近 6 周训练指数的指数加权平均，相当于“油箱容量”${R.monkey ? `；你的跑量甜区约 ${f1(R.sweet)}` : ''}</div></section>
      <section class="card kpi c3"><div class="lab">疲劳</div><div class="val">${f1(R.atl[i - 1] ?? R.atl[i])}</div><div class="det">近 7 天的指数加权平均，涨得快也退得快</div></section>
      <section class="card kpi c3"><div class="lab">状况 <span class="pill ${band.key}">${band.label}</span></div><div class="val">${sgn(tsb)}</div><div class="det">今天状况 = 昨天体能 − 昨天疲劳。${band.tip}</div></section>
      <section class="card c8"><div class="row"><h3>状况在哪个区间</h3><span class="pill ${band.key}">${band.label} ${sgn(tsb)}</span></div>
        <div class="band" style="background:linear-gradient(90deg,${C.red} 0 ${pos(-10)}%,${C.orange} ${pos(-10)}% ${pos(-7)}%,${C.yellow} ${pos(-7)}% ${pos(-2)}%,${C.blue} ${pos(-2)}% ${pos(0)}%,${C.acc} ${pos(0)}% ${pos(5)}%,${C.cyan} ${pos(5)}% 100%)"><div class="mk" style="left:calc(${pos(tsb)}% - 2px)"></div>
          ${[-10, -7, -2, 0, 5].map(v => `<span class="tk" style="left:${pos(v)}%">${v > 0 ? '+' + v : v}</span>`).join('')}</div>
        <div class="chart short"><canvas id="ovTsb"></canvas></div>
        <div class="note">色带：低于 −10 非常疲劳；−10 ~ −7 疲劳偏高；−7 ~ −2 有效训练；−2 ~ 0 普通；0 ~ +5 状况良好（全马赛前目标）；高于 +5 偏松。</div></section>
      <section class="card c4"><h3>赛前减量预估</h3>
        ${tEnd ? `<div class="kpi"><div class="lab">按默认三周减量，${md(settings.raceDate)} 早晨状况</div><div class="val">${sgn(tEnd.tsb)}</div>
        <div class="det">体能 ${f1(R.ctl[i])} → ${f1(tEnd.ctl)}，疲劳 ${f1(R.atl[i])} → ${f1(tEnd.atl)}。目标 0 ~ +5。</div></div>
        <p class="note">默认：赛前 7–13 天训练指数减 40%，最后 6 天减 60%，强度保持。到「负荷」页可以自己调。</p>` : '<p class="empty">比赛日期已过或未设置。</p>'}
        <div class="kpi" style="margin-top:14px"><div class="lab">本周 / 近 4 周周均</div><div class="val">${f1(thisW.km)}<small>/ ${f1(k28 / 4)} 公里</small></div></div></section>
      <section class="card c12"><div class="row"><h3>近 12 周跑量与训练指数</h3></div><div class="chart"><canvas id="ovWeeks"></canvas></div></section>
    </div>`;
  };
  pages.overview.after = () => {
    const n = 90, s = lastN(n), lab = R.days.slice(s, R.iT + 1).map(d => d.slice(5));
    chart('ovTsb', { type: 'line', data: { labels: lab, datasets: [{ label: '状况', data: R.tsb.slice(s, R.iT + 1).map(v => +v.toFixed(1)), borderColor: '#fff', borderWidth: 2, pointRadius: 0, tension: .3 }] },
      options: baseOpts({ plugins: { legend: { display: false }, bands: { on: true } }, scales: { x: { ticks: { color: C.t3, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid }, suggestedMin: -12, suggestedMax: 8 } } }) });
    const W = R.weekList.slice(-12);
    chart('ovWeeks', { data: { labels: W.map(w => w.week.slice(5)), datasets: [
      { type: 'bar', label: '跑量（公里）', data: W.map(w => +w.km.toFixed(1)), backgroundColor: C.acc + 'cc', borderRadius: 6, yAxisID: 'y' },
      { type: 'line', label: '周训练指数', data: W.map(w => +w.load.toFixed(0)), borderColor: C.blue, backgroundColor: C.blue, pointRadius: 3, tension: .3, yAxisID: 'y2' }] },
      options: baseOpts({ scales: { x: { ticks: { color: C.t3 }, grid: { display: false } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid }, title: { display: true, text: '公里', color: C.t3 } }, y2: { position: 'right', ticks: { color: C.t3 }, grid: { display: false }, title: { display: true, text: '训练指数', color: C.t3 } } } }) });
  };

  function defaultTaper() {
    if (RW.diffDays(settings.raceDate, R.today) <= 0) return null;
    const base = baseLoad();
    return RW.simulateTaper(R, { base, raceDate: settings.raceDate, factor: RW.pfitz });
  }
  function baseLoad() { const s = lastN(28); return R.load.slice(s, R.iT + 1).reduce((t, x) => t + x, 0) / 28; }

  pages.vdot = () => {
    const r = ui.vdotR; const segs = R.segs.filter(s => r === 'all' || RW.diffDays(R.today, s.day) < +r);
    const reasons = {}; segs.forEach(s => { const k = s.ivdot ? '计入即时跑力' : s.ivReason || '其他'; reasons[k] = (reasons[k] || 0) + 1; });
    const cal = curCal();
    return `<h2>跑力</h2><p class="lead">即时跑力来自每次稳定跑步的心率与配速关系；当前跑力是最近 42 天即时跑力的加权平均，比赛记录权重更高。</p>
    <div class="grid">
      <section class="card c12"><div class="row"><h3>跑力趋势</h3>${segBtns('vdotR', [['90', '3 个月'], ['180', '6 个月'], ['365', '12 个月'], ['all', '全部']])}</div>
        <div class="chart tall"><canvas id="vdChart"></canvas></div>
        <div class="note">绿线：当前跑力。灰点：单次即时跑力。红点：比赛（竞赛跑力，按标准距离计算）。虚线：达成目标 ${esc(settings.goal)} 所需跑力。</div></section>
      <section class="card c6"><h3>即时跑力取样情况</h3><div class="scroll"><table><tr><th>原因</th><th>次数</th></tr>
        ${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table></div>
        <p class="note">只有平均心率在储备心率 59%–88%（1.0–4.0 区）、15 分钟以上、非间歇、爬升不大的记录才算即时跑力。高强度时心率跟不上配速，算出来没有意义。</p></section>
      <section class="card c6"><h3>竞赛跑力（近 6 个月比赛）</h3>
        ${R.bestList.length ? `<div class="scroll"><table><tr><th>日期</th><th>距离</th><th>用时</th><th>竞赛跑力</th></tr>
          ${R.bestList.map(x => `<tr><td>${x.day}</td><td>${x.raceDist || f1(x.main.km) + ' km'}</td><td>${RW.fmtT(x.main.movS)}</td><td>${f1(x.raceVdot)}</td></tr>`).join('')}</table></div>
          <p class="note">平均竞赛跑力 ${f1(R.compVdot)}${R.runnerType ? `，跑者类型：${R.runnerType}` : '；需要同时有短距离和长距离比赛才能判断跑者类型'}。在「记录」页点红色星号可以标记或取消比赛。</p>`
        : '<p class="empty">近 6 个月没有识别到比赛。可以在「记录」页手动标记。</p>'}
        ${cal ? `<div class="callout" style="margin-top:12px">你的比赛日竞赛跑力比前后三周的即时跑力平均高 ${f1(R.suggestCalib.value)}（${R.suggestCalib.n} 场比赛）。按这个差值校准，当前跑力约 ${f1(cal)}。可以在「设置」里开启校准。</div>` : ''}</section>
    </div>`;
  };
  pages.vdot.after = () => {
    const r = ui.vdotR; const s = r === 'all' ? 0 : lastN(+r); const days = R.days.slice(s, R.iT + 1);
    const g = goalS(); const need = g ? RW.vdot(raceDist(), g) : null;
    const ivPts = R.segs.filter(x => x.ivdot && x.day >= days[0]).map(x => ({ x: x.day, y: +x.ivdot.toFixed(1) }));
    const racePts = R.sessions.filter(x => x.raceVdot && x.day >= days[0]).map(x => ({ x: x.day, y: +x.raceVdot.toFixed(1) }));
    chart('vdChart', { data: { labels: days, datasets: [
      { type: 'line', label: '当前跑力', data: days.map((d, k) => R.cur[s + k] == null ? null : +R.cur[s + k].toFixed(2)), borderColor: C.acc, backgroundColor: C.acc + '22', fill: true, borderWidth: 2.5, pointRadius: 0, tension: .3 },
      { type: 'scatter', label: '即时跑力', data: ivPts, backgroundColor: 'rgba(200,210,190,.35)', pointRadius: 2.5 },
      { type: 'scatter', label: '比赛', data: racePts, backgroundColor: C.red, pointRadius: 5 },
      need ? { type: 'line', label: '目标所需', data: days.map(() => +need.toFixed(1)), borderColor: C.orange, borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0 } : null].filter(Boolean) },
      options: baseOpts({ interaction: { mode: 'nearest', intersect: false }, scales: { x: { type: 'category', ticks: { color: C.t3, maxTicksLimit: 7, maxRotation: 0, callback(v) { return this.getLabelForValue(v).slice(2).replace(/-/g, '/'); } }, grid: { color: C.grid } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid }, suggestedMin: 45, suggestedMax: 64 } } }) });
  };

  pages.load = () => {
    const i = R.iT; const base = baseLoad(); const nd = RW.diffDays(settings.raceDate, R.today);
    const sim = nd > 0 ? runTaper() : null; const end = sim ? sim[sim.length - 1] : null;
    const solve = nd > 0 ? solveFactor(2) : null; const band = end ? RW.tsbBand(end.tsb) : null;
    return `<h2>训练负荷</h2><p class="lead">训练指数 = 强度 × 时间。体能（42 天）与疲劳（7 天）都是训练指数的指数加权平均，状况 = 昨天体能 − 昨天疲劳。</p>
    <div class="grid">
      <section class="card c12"><div class="row"><h3>体能 · 疲劳 · 状况</h3>${segBtns('loadR', [['90', '3 个月'], ['180', '6 个月'], ['365', '12 个月'], ['all', '全部']])}</div>
        <div class="chart"><canvas id="ldLines"></canvas></div>
        <div class="chart short" style="margin-top:8px"><canvas id="ldTsb"></canvas></div>
        <div class="legend"><span><i style="background:${C.red}"></i>&lt; −10 非常疲劳</span><span><i style="background:${C.orange}"></i>−10 ~ −7 疲劳偏高</span><span><i style="background:${C.yellow}"></i>−7 ~ −2 有效训练</span><span><i style="background:${C.blue}"></i>−2 ~ 0 普通</span><span><i style="background:${C.acc}"></i>0 ~ +5 良好</span><span><i style="background:${C.cyan}"></i>&gt; +5 偏松</span></div>
        <p class="note">参考：训练期 −2 ~ −7 最有效；连续 3 天低于 −8 属过度疲劳；连续 7 天低于 −10 属过量训练；全马比赛日 0 ~ +5。当前连续低于 −8 的天数：${R.run8}。</p></section>
      <section class="card c12 hl"><div class="row"><h3>减量模拟器 · 推演到 ${md(settings.raceDate)}</h3>${end ? `<span class="pill ${band.key}">比赛日早晨 ${sgn(end.tsb)} · ${band.label}</span>` : ''}</div>
        ${nd > 0 ? `<div class="form" style="margin-bottom:14px">
          <label class="f">减量方案<select id="tpPlan"><option value="pfitz" ${ui.taperPlan === 'pfitz' ? 'selected' : ''}>三周减量（−22.5% / −40% / −60%）</option><option value="flat" ${ui.taperPlan === 'flat' ? 'selected' : ''}>每天固定比例</option><option value="keep" ${ui.taperPlan === 'keep' ? 'selected' : ''}>保持当前量</option><option value="rest" ${ui.taperPlan === 'rest' ? 'selected' : ''}>全休</option></select></label>
          <label class="f ${ui.taperPlan === 'flat' ? '' : 'hide'}">每天练基准的 <b id="tpPctV">${ui.taperPct}%</b><input type="range" id="tpPct" min="0" max="120" step="5" value="${ui.taperPct}"></label>
          <label class="f">赛前完全休息<select id="tpRest">${[0, 1, 2, 3].map(n => `<option value="${n}" ${+ui.taperRest === n ? 'selected' : ''}>${n ? '最后 ' + n + ' 天' : '不休息'}</option>`).join('')}</select></label>
          <div class="kpi"><div class="lab">基准日均训练指数</div><div class="val" style="font-size:24px">${f1(base)}</div><div class="det">近 28 天平均</div></div>
        </div>
        <div class="chart"><canvas id="tpChart"></canvas></div>
        <div class="grid" style="margin-top:12px">
          <div class="c4 kpi"><div class="lab">比赛日早晨状况</div><div class="val">${sgn(end.tsb)}</div><div class="det">目标 0 ~ +5，比赛周不建议超过 +3</div></div>
          <div class="c4 kpi"><div class="lab">体能变化</div><div class="val">${f1(R.ctl[i])} → ${f1(end.ctl)}</div><div class="det">减量期体能小幅下降是正常的，油箱变小一点，但疲劳退得更快</div></div>
          <div class="c4 kpi"><div class="lab">让比赛日状况落在 +2</div><div class="val">${solve != null ? Math.round(solve * 100) + '%' : '—'}</div><div class="det">每天练基准的这个比例（约 ${solve != null ? f1(base * solve) : '—'} 训练指数/天），强度保持</div></div>
        </div>
        <div class="scroll" style="margin-top:10px"><table><tr><th class="l">日期</th><th>距比赛</th><th>建议训练指数</th><th>早晨状况</th><th>体能</th><th>疲劳</th></tr>
          ${sim.slice(1).map(d => `<tr class="${d.race ? 'me' : ''}"><td class="l">${md(d.day)}</td><td>${RW.diffDays(settings.raceDate, d.day) || '比赛日'}</td><td>${d.race ? '比赛' : f1(d.load)}</td><td>${sgn(d.tsb)}</td><td>${f1(d.ctl)}</td><td>${f1(d.atl)}</td></tr>`).join('')}</table></div>
        <p class="note">训练指数换算参考：1 区轻松跑 1 分钟 ≈ 0.2，马拉松配速 ≈ 0.4，乳酸阈值 ≈ 0.6，I 强度 ≈ 1.0。比如 10 训练指数 ≈ 50 分钟轻松跑。减量只减量、不降强度。</p>`
        : '<p class="empty">比赛日期已过，请到「设置」更新下一场比赛。</p>'}</section>
      <section class="card c6"><h3>每周训练指数</h3><div class="chart"><canvas id="ldWeek"></canvas></div><p class="note">质量课单次 15–30、很重的课 30–50、全马常超过 100；重课后安排 5–15 的恢复。</p></section>
      <section class="card c6"><h3>跑量甜区（当前跑力 vs 体能）</h3><div class="chart"><canvas id="ldScatter"></canvas></div>
        <p class="note">${R.sweet ? `跑力最高的那些周，体能中位数约 ${f1(R.sweet)}，属于「${R.monkey}」（小 10–15、中小 15–20、中大 20–25、大 25–30、超大 30 以上）。再往上加量不一定带来更高跑力，应转向提高质量。数据最好有半年以上、量有高有低。` : '数据少于半年，暂不判断。'}</p></section>
    </div>`;
  };
  function taperFactor() {
    const p = ui.taperPlan;
    if (p === 'keep') return () => 1; if (p === 'rest') return () => 0;
    if (p === 'flat') return () => ui.taperPct / 100; return RW.pfitz;
  }
  function runTaper() { return RW.simulateTaper(R, { base: baseLoad(), raceDate: settings.raceDate, factor: taperFactor(), restDays: +ui.taperRest }); }
  function solveFactor(target) {
    const end = f => { const s = RW.simulateTaper(R, { base: baseLoad(), raceDate: settings.raceDate, factor: () => f, restDays: +ui.taperRest }); return s[s.length - 1].tsb; };
    let lo = 0, hi = 2; if (end(lo) < target) return 0; if (end(hi) > target) return null;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (end(m) > target) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  pages.load.after = () => {
    const r = ui.loadR; const s = r === 'all' ? 0 : lastN(+r); const days = R.days.slice(s, R.iT + 1);
    const lab = days.map(d => d.slice(2).replace(/-/g, '/'));
    chart('ldLines', { data: { labels: lab, datasets: [
      { type: 'line', label: '体能', data: R.ctl.slice(s, R.iT + 1).map(v => +v.toFixed(1)), borderColor: C.blue, borderWidth: 2.5, pointRadius: 0, tension: .3 },
      { type: 'line', label: '疲劳', data: R.atl.slice(s, R.iT + 1).map(v => +v.toFixed(1)), borderColor: C.red, borderWidth: 1.5, pointRadius: 0, tension: .3 },
      { type: 'bar', label: '当日训练指数', data: R.load.slice(s, R.iT + 1).map(v => +v.toFixed(1)), backgroundColor: 'rgba(200,210,190,.22)', yAxisID: 'y2', barPercentage: 1, categoryPercentage: 1 }] },
      options: baseOpts({ scales: { x: { ticks: { color: C.t3, maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid }, beginAtZero: true }, y2: { position: 'right', ticks: { color: C.t3 }, grid: { display: false }, beginAtZero: true } } }) });
    const tv = R.tsb.slice(s, R.iT + 1);
    chart('ldTsb', { type: 'bar', data: { labels: lab, datasets: [{ label: '状况', data: tv.map(v => +v.toFixed(1)), backgroundColor: tv.map(v => BAND_COLORS[RW.tsbBand(v).key] + 'cc'), barPercentage: 1, categoryPercentage: 1 }] },
      options: baseOpts({ plugins: { legend: { display: false }, bands: { on: true } }, scales: { x: { ticks: { color: C.t3, maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid } } } }) });
    if (RW.diffDays(settings.raceDate, R.today) > 0) {
      const sim = runTaper(); const back = 21; const s2 = lastN(back);
      const hist = R.days.slice(s2, R.iT).map((d, k) => ({ day: d, ctl: R.ctl[s2 + k], atl: R.atl[s2 + k], tsb: R.tsb[s2 + k] }));
      const all = hist.concat(sim); const nh = hist.length;
      chart('tpChart', { data: { labels: all.map(d => d.day.slice(5)), datasets: [
        { type: 'line', label: '状况', data: all.map(d => +d.tsb.toFixed(1)), borderColor: '#fff', borderWidth: 2.5, pointRadius: all.map((d, k) => k === all.length - 1 ? 5 : 0), pointBackgroundColor: C.acc, tension: .3, segment: { borderDash: c => c.p0DataIndex >= nh ? [6, 4] : undefined }, yAxisID: 'y' },
        { type: 'line', label: '体能', data: all.map(d => +d.ctl.toFixed(1)), borderColor: C.blue, borderWidth: 1.5, pointRadius: 0, tension: .3, yAxisID: 'y2', segment: { borderDash: c => c.p0DataIndex >= nh ? [6, 4] : undefined } },
        { type: 'line', label: '疲劳', data: all.map(d => +d.atl.toFixed(1)), borderColor: C.red, borderWidth: 1.5, pointRadius: 0, tension: .3, yAxisID: 'y2', segment: { borderDash: c => c.p0DataIndex >= nh ? [6, 4] : undefined } }] },
        options: baseOpts({ plugins: { legend: { labels: { color: C.t2, boxWidth: 10, usePointStyle: true } }, bands: { on: true } }, scales: { x: { ticks: { color: C.t3, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid }, title: { display: true, text: '状况', color: C.t3 } }, y2: { position: 'right', ticks: { color: C.t3 }, grid: { display: false }, title: { display: true, text: '体能 / 疲劳', color: C.t3 } } } }) });
    }
    const W = R.weekList.slice(-26);
    chart('ldWeek', { type: 'bar', data: { labels: W.map(w => w.week.slice(5)), datasets: [{ label: '周训练指数', data: W.map(w => +w.load.toFixed(0)), backgroundColor: W.map((w, k) => k >= W.length - 12 ? C.acc + 'cc' : 'rgba(168,220,12,.35)'), borderRadius: 5 }] }, options: baseOpts({ plugins: { legend: { display: false } } }) });
    const sc = R.scatter;
    chart('ldScatter', { type: 'scatter', data: { datasets: [{ label: '每周', data: sc.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) })), backgroundColor: C.acc + '99', pointRadius: 4 }] },
      options: baseOpts({ interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `体能 ${c.parsed.x} · 跑力 ${c.parsed.y}` } } }, scales: { x: { title: { display: true, text: '体能', color: C.t3 }, ticks: { color: C.t3 }, grid: { color: C.grid } }, y: { title: { display: true, text: '当前跑力', color: C.t3 }, ticks: { color: C.t3 }, grid: { color: C.grid } } } }) });
  };

  pages.volume = () => {
    const n = ui.volR === 'all' ? R.weekList.length : +ui.volR; const W = R.weekList.slice(-n);
    const km = W.reduce((t, w) => t + w.km, 0), cnt = W.reduce((t, w) => t + w.n, 0), hrs = W.reduce((t, w) => t + w.movS, 0) / 3600;
    const from = W[0].week; const ss = R.sessions.filter(x => x.day >= from);
    const longest = ss.slice().sort((a, b) => b.km - a.km).slice(0, 10);
    const M = R.monthList.filter(m => m.month >= from.slice(0, 7));
    return `<h2>跑量</h2><p class="lead">同一天热身、主课、放松在 30 分钟内接连记录的，合并为一次训练。</p>
    <div class="grid">
      <section class="card c12"><div class="row"><h3>每周跑量</h3>${segBtns('volR', [['12', '12 周'], ['26', '26 周'], ['52', '52 周'], ['all', '全部']])}</div>
        <div class="grid" style="margin-bottom:10px">
          <div class="c3 kpi"><div class="lab">总里程</div><div class="val">${f0(km)}<small>公里</small></div></div>
          <div class="c3 kpi"><div class="lab">周均</div><div class="val">${f1(km / W.length)}<small>公里</small></div></div>
          <div class="c3 kpi"><div class="lab">训练次数</div><div class="val">${cnt}<small>次</small></div></div>
          <div class="c3 kpi"><div class="lab">训练时长</div><div class="val">${f0(hrs)}<small>小时</small></div></div></div>
        <div class="chart"><canvas id="volW"></canvas></div><p class="note">深色柱为最近 12 周；本周未结束。</p></section>
      <section class="card c6"><h3>月度</h3><div class="scroll"><table><tr><th>月份</th><th>里程</th><th>次数</th><th>最长</th><th>周均</th><th>训练指数</th></tr>
        ${M.slice().reverse().map(m => { const dIn = new Date(Date.UTC(+m.month.slice(0, 4), +m.month.slice(5, 7), 0)).getUTCDate(); const effDays = m.month === R.today.slice(0, 7) ? +R.today.slice(8, 10) : dIn; return `<tr><td>${m.month}</td><td>${f1(m.km)}</td><td>${m.n}</td><td>${f1(m.longest)}</td><td>${f1(m.km / effDays * 7)}</td><td>${f0(m.load)}</td></tr>`; }).join('')}</table></div></section>
      <section class="card c6"><h3>最长的 10 次</h3><div class="scroll"><table><tr><th>日期</th><th>公里</th><th>用时</th><th>配速</th><th>心率</th></tr>
        ${longest.map(x => `<tr><td>${x.day}</td><td>${f1(x.km)}</td><td>${RW.fmtT(x.movS)}</td><td>${RW.fmtPace(x.paceS)}</td><td>${f0(x.hr)}</td></tr>`).join('')}</table></div></section>
    </div>`;
  };
  pages.volume.after = () => {
    const n = ui.volR === 'all' ? R.weekList.length : +ui.volR; const W = R.weekList.slice(-n);
    chart('volW', { type: 'bar', data: { labels: W.map(w => w.week.slice(2).replace(/-/g, '/')), datasets: [{ label: '公里', data: W.map(w => +w.km.toFixed(1)), backgroundColor: W.map((w, k) => k >= W.length - 12 ? C.acc : 'rgba(168,220,12,.35)'), borderRadius: 5 }] },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => { const w = W[c.dataIndex]; return `${w.n} 次 · 最长 ${w.longest.toFixed(1)} 公里`; } } } }, scales: { x: { ticks: { color: C.t3, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: C.t3 }, grid: { color: C.grid } } } }) });
  };

  const ZN = ['1 区以下', '1 区 E', '2 区 M', '3 区 T', '4 区 A', '5 区 I', '6 区 R'];
  pages.zones = () => `<h2>区间分布</h2><p class="lead">心率区间用储备心率法：1 区 59–74%、2 区 74–84%、3 区 84–88%、4 区 88–95%、5 区 95–100%。配速区间按当时的当前跑力换算。</p>
    <div class="grid"><section class="card c12"><div class="row"><h3>时间范围</h3>${segBtns('zoneR', [['4', '4 周'], ['8', '8 周'], ['12', '12 周'], ['26', '26 周'], ['all', '全部']])}</div>
      <p class="note" style="margin:0">CSV 只有每次的平均心率和平均配速，所以按每段的平均值整段归入一个区间；间歇课的快跑部分会被平均掉，高强度时间会被低估。</p></section>
      <section class="card c4"><h3>心率区间时间</h3><div class="chart"><canvas id="znHr"></canvas></div></section>
      <section class="card c4"><h3>配速区间时间</h3><div class="chart"><canvas id="znPace"></canvas></div></section>
      <section class="card c4"><h3>各强度训练指数</h3><div class="chart"><canvas id="znLoad"></canvas></div></section></div>`;
  pages.zones.after = () => {
    const from = ui.zoneR === 'all' ? '0000' : RW.addDays(R.today, -7 * +ui.zoneR + 1);
    const ss = R.segs.filter(s => s.day >= from && !s.exclude);
    const agg = key => { const a = new Array(7).fill(0); ss.forEach(s => { const z = s[key]; if (z == null) return; a[Math.min(6, Math.floor(z))] += key === 'zone' ? s.load : s.movS / 3600; }); return a; };
    const cols = ['#4b5243', C.acc, '#d6f36b', C.yellow, C.orange, C.red, '#c77dff'];
    const mk = (id, data, unit) => { const tot = data.reduce((t, x) => t + x, 0) || 1;
      chart(id, { type: 'bar', data: { labels: ZN, datasets: [{ data: data.map(v => +v.toFixed(1)), backgroundColor: cols, borderRadius: 5 }] },
        options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.x} ${unit} · ${Math.round(c.parsed.x / tot * 100)}%` } } }, scales: { x: { ticks: { color: C.t3 }, grid: { color: C.grid } }, y: { ticks: { color: C.t2 }, grid: { display: false } } } }) }); };
    mk('znHr', agg('hrZone'), '小时'); mk('znPace', agg('paceZone'), '小时'); mk('znLoad', agg('zone'), '训练指数');
  };

  pages.paces = () => {
    const V = +ui.paceV || R.curNow; const cal = curCal();
    const hr = p => Math.round(R.restHr + p * (R.maxHr - R.restHr));
    const use = { E: '长距离有氧、恢复', M: '马拉松配速课', T: '节奏跑、乳酸阈值', A: '无氧耐力间歇', I: '最大摄氧量间歇（3–5 分钟一趟）', R: '速度与跑步经济性（短冲）' };
    return `<h2>配速与心率区间</h2><p class="lead">配速区间由跑力推出：先按 Daniels 公式求出各强度（%VO₂max）对应的速度，再换算成配速。心率区间用储备心率法。</p>
    <div class="grid"><section class="card c12"><div class="row"><h3>用哪个跑力</h3>
      <div class="seg" id="pvSeg"><button data-v="" class="${!ui.paceV ? 'on' : ''}">当前 ${f1(R.curNow)}</button>${cal ? `<button data-v="${cal.toFixed(1)}" class="${ui.paceV === cal.toFixed(1) ? 'on' : ''}">校准 ${f1(cal)}</button>` : ''}${goalS() ? `<button data-v="${RW.vdot(raceDist(), goalS()).toFixed(1)}" class="${ui.paceV === RW.vdot(raceDist(), goalS()).toFixed(1) ? 'on' : ''}">目标 ${f1(RW.vdot(raceDist(), goalS()))}</button>` : ''}</div>
      <label class="f" style="flex-direction:row;align-items:center">自定义 <input id="pvIn" type="number" step="0.1" min="30" max="85" value="${ui.paceV}" placeholder="${f1(R.curNow)}" style="width:90px"></label></div>
      <div class="scroll"><table class="zt"><tr><th class="l">区间</th><th>每公里</th><th>每 400 米</th><th>%VO₂max</th><th>心率（bpm）</th><th class="l">用途</th></tr>
      ${RW.ZONES.map(Z => `<tr><td class="l">${Z.z} 区 ${Z.code} · ${Z.name}</td><td>${RW.fmtPace(RW.paceAt(V, Z.lo))} – ${RW.fmtPace(RW.paceAt(V, Z.hi))}</td><td>${Math.round(RW.paceAt(V, Z.lo) * .4)} – ${Math.round(RW.paceAt(V, Z.hi) * .4)} 秒</td><td>${Math.round(Z.lo * 100)}–${Math.round(Z.hi * 100)}%</td><td>${Z.z <= 5 ? hr(Z.lo) + ' – ' + hr(Z.hi) : '不看心率'}</td><td class="l">${use[Z.code]}</td></tr>`).join('')}</table></div>
      <p class="note">跑力 ${f1(V)}。目标配速 ${goalS() ? pace1(goalS() / (raceDist() / 1000)) : '—'}/km 对应约 ${goalS() ? Math.round(RW.vo2(raceDist() / (goalS() / 60)) / V * 100) : '—'}% VO₂max。R 区的百分比为 RW 自定，只作参考。间歇课按配速练，长跑和节奏跑可以看心率。</p></section>
      <section class="card c6"><h3>心率区间（储备心率法）</h3><div class="scroll"><table><tr><th class="l">区间</th><th>储备心率</th><th>心率</th></tr>
        ${[[1, .59, .74], [2, .74, .84], [3, .84, .88], [4, .88, .95], [5, .95, 1]].map(([z, a, b]) => `<tr><td class="l">${z} 区</td><td>${Math.round(a * 100)}–${Math.round(b * 100)}%</td><td>${hr(a)} – ${hr(b)}</td></tr>`).join('')}</table></div>
        <p class="note">安静心率 ${R.restHr}${settings.restHr == RW.DEFAULTS.restHr ? '（假设值，建议实测后到设置里修改）' : ''}，最大心率 ${R.maxHr}。目标心率 = 安静心率 + (最大心率 − 安静心率) × 百分比。</p></section>
      <section class="card c6"><h3>对照：阈值心率法（Friel）</h3><div class="scroll"><table><tr><th class="l">区间</th><th>%阈值心率</th><th>心率</th></tr>
        ${[['1 恢复', 0, .85], ['2 有氧', .85, .90], ['3 节奏', .90, .95], ['4 阈值下', .95, 1.0], ['5 阈值上', 1.0, 1.06]].map(([n, a, b]) => `<tr><td class="l">${n}</td><td>${a ? Math.round(a * 100) : '<'}${a ? '–' : ''}${Math.round(b * 100)}%</td><td>${a ? Math.round(a * R.lthr) : ''}${a ? ' – ' : '< '}${Math.round(b * R.lthr)}</td></tr>`).join('')}</table></div>
        <p class="note">阈值心率 ${R.lthr}${settings.lthr ? '' : '（未设置，暂按储备心率 88% 估算）'}。只作对照，RW 的分析一律用储备心率法。</p></section></div>`;
  };

  pages.predict = () => {
    const D = [['3 公里', 3000], ['5 公里', 5000], ['10 公里', 10000], ['半马', 21097.5], ['全马', 42195]];
    const g = goalS(); const need = g ? RW.vdot(raceDist(), g) : null; const pb = pbS();
    const cols = [['当前跑力', R.curNow]];
    const cal = curCal(); if (cal) cols.push(['校准后', cal]);
    if (R.compVdot) cols.push(['竞赛跑力', R.compVdot]);
    if (need) cols.push(['目标所需', need]);
    if (pb) cols.push(['PB 对应', RW.vdot(raceDist(), pb)]);
    const pred = RW.raceTime(R.curNow, raceDist());
    return `<h2>比赛预测</h2><p class="lead">按 Daniels 公式，同一跑力在各距离的等效成绩。前提是针对该距离做过专项训练、天气和赛道理想。</p>
    <div class="grid"><section class="card c12"><div class="scroll"><table><tr><th class="l">距离</th>${cols.map(c => `<th>${c[0]}<br><span style="color:var(--acc)">${f1(c[1])}</span></th>`).join('')}</tr>
      ${D.map(([n, m]) => `<tr class="${m === raceDist() ? 'me' : ''}"><td class="l">${n}</td>${cols.map(c => `<td>${RW.fmtT(RW.raceTime(c[1], m))}<br><span style="color:var(--text3);font-size:11px">${RW.fmtPace(RW.raceTime(c[1], m) / (m / 1000))}/km</span></td>`).join('')}</tr>`).join('')}</table></div>
      <p class="note">Daniels 的全马等效成绩偏乐观：跑量不足或耐力是短板时，全马实际会比表中慢。达不到短距离推估说明速度是短板，达不到半马/全马推估说明耐力是短板。</p></section>
      <section class="card c6"><h3>与目标对比</h3><div class="scroll"><table>
        <tr><td class="l">目标 ${esc(settings.goal)}</td><td>需要跑力 ${f1(need)}，配速 ${g ? pace1(g / (raceDist() / 1000)) : '—'}/km</td></tr>
        <tr><td class="l">当前跑力 ${f1(R.curNow)}</td><td>${RW.fmtT(pred)}${g ? '，' + (pred > g ? '慢 ' : '快 ') + RW.fmtT(Math.abs(pred - g)) : ''}</td></tr>
        ${cal ? `<tr><td class="l">校准后 ${f1(cal)}</td><td>${RW.fmtT(RW.raceTime(cal, raceDist()))}${g ? '，' + (RW.raceTime(cal, raceDist()) > g ? '慢 ' : '快 ') + RW.fmtT(Math.abs(RW.raceTime(cal, raceDist()) - g)) : ''}</td></tr>` : ''}
        ${pb ? `<tr><td class="l">PB ${esc(settings.pb)}</td><td>对应跑力 ${f1(RW.vdot(raceDist(), pb))}</td></tr>` : ''}
        <tr><td class="l">差距</td><td>${need ? '当前跑力还差 ' + f1(need - R.curNow) + ' 点' : '—'}</td></tr></table></div></section>
      <section class="card c6"><h3>自己算</h3><div class="form">
        <label class="f">距离（公里）<input id="pcD" type="number" step="0.1" value="${(raceDist() / 1000).toFixed(3).replace(/\.?0+$/, '')}"></label>
        <label class="f">成绩（时:分:秒）<input id="pcT" type="text" value="${esc(settings.goal)}"></label></div>
        <p id="pcOut" class="callout" style="margin-top:12px"></p></section></div>`;
  };
  pages.predict.after = () => {
    const upd = () => { const d = +$('#pcD').value * 1000, t = RW.parseHMS($('#pcT').value);
      $('#pcOut').textContent = d > 0 && t ? `跑力 ${RW.vdot(d, t).toFixed(1)}，配速 ${RW.fmtPace(t / (d / 1000))}/km；等效全马 ${RW.fmtT(RW.raceTime(RW.vdot(d, t), 42195))}，半马 ${RW.fmtT(RW.raceTime(RW.vdot(d, t), 21097.5))}，10 公里 ${RW.fmtT(RW.raceTime(RW.vdot(d, t), 10000))}。` : '请输入距离和成绩。'; };
    $('#pcD').oninput = upd; $('#pcT').oninput = upd; upd();
  };

  pages.records = () => {
    const months = [...new Set(R.sessions.map(x => x.day.slice(0, 7)))].reverse();
    return `<h2>训练记录</h2><p class="lead">共 ${R.sessions.length} 次训练（由 ${R.segs.length} 段记录合并）。红色星号表示比赛，点击可以切换，比赛会以 3 倍权重计入当前跑力。</p>
    <section class="card"><div class="row">${segBtns('recF', [['all', '全部'], ['race', '比赛'], ['quality', '质量课'], ['long', '长距离'], ['iv', '有即时跑力'], ['bad', '被排除']])}
      <div class="row" style="margin:0"><select id="recM"><option value="">全部月份</option>${months.map(m => `<option ${ui.recM === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="recSort"><option value="date" ${ui.recSort === 'date' ? 'selected' : ''}>按日期</option><option value="km" ${ui.recSort === 'km' ? 'selected' : ''}>按距离</option><option value="load" ${ui.recSort === 'load' ? 'selected' : ''}>按训练指数</option><option value="pace" ${ui.recSort === 'pace' ? 'selected' : ''}>按配速</option></select>
      <input id="recQ" type="search" placeholder="搜索标题" value="${esc(ui.recQ)}" style="width:150px"></div></div>
      <div id="recList"></div></section>`;
  };
  function recFilter() {
    let L = R.sessions.slice();
    const f = ui.recF;
    if (f === 'race') L = L.filter(x => x.isRace);
    if (f === 'quality') L = L.filter(x => x.interval || (x.zone != null && x.zone >= 2.5));
    if (f === 'long') L = L.filter(x => x.km >= 20);
    if (f === 'iv') L = L.filter(x => x.ivdot);
    if (f === 'bad') L = L.filter(x => x.segs.some(s => s.exclude || s.flags.some(g => g.k === 'treadmill')));
    if (ui.recM) L = L.filter(x => x.day.startsWith(ui.recM));
    if (ui.recQ) L = L.filter(x => x.segs.some(s => (s.title || '').includes(ui.recQ)));
    const so = { date: (a, b) => a.start < b.start ? 1 : -1, km: (a, b) => b.km - a.km, load: (a, b) => b.load - a.load, pace: (a, b) => a.paceS - b.paceS }[ui.recSort];
    return L.sort(so);
  }
  function renderRecList() {
    const L = recFilter(); const show = L.slice(0, ui.recN);
    $('#recList').innerHTML = `<div class="rec h"><span>日期</span><span>标题</span><span class="n">公里</span><span class="n">配速</span><span class="n hide-m">用时</span><span class="n hide-m">心率</span><span class="n hide-m">强度区</span><span class="n">负荷</span><span class="n">赛</span></div>` +
      show.map(x => {
        const fl = []; x.segs.forEach(s => s.flags.forEach(g => { if (g.k !== 'short') fl.push(`<span class="chip ${s.exclude ? 'x' : ''}">${esc(g.t)}</span>`); }));
        if (x.nSeg > 1) fl.unshift(`<span class="chip">合并 ${x.nSeg} 段</span>`);
        if (x.ivdot) fl.unshift(`<span class="chip" style="color:var(--acc)">即时跑力 ${f1(x.ivdot)}</span>`);
        if (x.raceVdot) fl.unshift(`<span class="chip" style="color:#ff8a8a">竞赛跑力 ${f1(x.raceVdot)}</span>`);
        return `<div class="rec"><span>${x.day.slice(2)}</span><span class="t" title="${esc(x.title)}">${esc(x.title)}</span><span class="n">${f1(x.km)}</span><span class="n">${RW.fmtPace(x.paceS)}</span><span class="n hide-m">${RW.fmtT(x.movS)}</span><span class="n hide-m">${f0(x.hr)}</span><span class="n hide-m">${x.zone != null ? x.zone.toFixed(1) : '—'}</span><span class="n">${f1(x.load)}</span><span class="n"><button class="star ${x.isRace ? 'on' : ''}" data-id="${esc(x.id)}" title="标记为比赛">★</button></span>${fl.length ? `<div class="flags">${fl.join('')}</div>` : ''}</div>`;
      }).join('') + (L.length > show.length ? `<div style="text-align:center;margin-top:12px"><button class="btn" id="recMore">再显示 80 条（共 ${L.length}）</button></div>` : '') + (L.length ? '' : '<p class="empty">没有符合条件的记录。</p>');
    document.querySelectorAll('.star').forEach(b => b.onclick = () => {
      const id = b.dataset.id; const x = R.sessions.find(s => s.id === id);
      raceOv[id] = !x.isRace; save(LS.race, raceOv); recompute(); renderRecList();
    });
    const m = $('#recMore'); if (m) m.onclick = () => { ui.recN += 80; saveUI(); renderRecList(); };
  }
  pages.records.after = () => {
    renderRecList();
    $('#recM').onchange = e => { ui.recM = e.target.value; ui.recN = 80; saveUI(); renderRecList(); };
    $('#recSort').onchange = e => { ui.recSort = e.target.value; saveUI(); renderRecList(); };
    $('#recQ').oninput = e => { ui.recQ = e.target.value; ui.recN = 80; saveUI(); renderRecList(); };
  };

  pages.method = () => `<h2>方法说明</h2><p class="lead">RW 用到的每一个公式。能公开查到依据的照做，查不到的写明是 RW 自己的取舍。调研笔记见仓库 docs/RQ-methods-research.md。</p>
  <div class="grid method">
  <section class="card c6"><h3>1. 跑力（Daniels VDOT）</h3>
    <p>由一次全力比赛的距离和时间推出。v 为米/分钟，t 为分钟：</p>
    <div class="eq">VO₂(v) = −4.60 + 0.182258·v + 0.000104·v²<br>%VO₂max(t) = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)<br>跑力 = VO₂(v) ÷ %VO₂max(t)</div>
    <p>比赛预测是反过来：给定跑力和距离，二分法解出时间。配速区间是给定 %VO₂max，解 VO₂(v) = 跑力 × 百分比 得到速度。</p></section>
  <section class="card c6"><h3>2. 即时跑力（单次）</h3>
    <p>储备心率百分比与最大摄氧量百分比很接近，所以一次稳定跑步的配速对应的摄氧量，除以当时用掉的储备心率比例，就是当天表现出的跑力：</p>
    <div class="eq">%HRR = (平均心率 − 安静心率) ÷ (最大心率 − 安静心率)<br>即时跑力 = VO₂(坡度调整配速) ÷ %HRR</div>
    <p>只取：%HRR 在 59%–88%（1.0–4.0 区）、移动时间 ≥ 15 分钟、不是间歇或变速课、每公里爬升 &lt; 20 米、不是跑步机或越野、没有 GPS 或心率异常的记录。强度太高时心率滞后，跑太慢时心率与配速关系也不稳定，所以排除。</p>
    <p>【RW 自定】逐秒回归做不到，这里用整段平均值近似。轻松跑算出来通常偏低，这是方法本身的特点。</p></section>
  <section class="card c6"><h3>3. 当前跑力</h3>
    <div class="eq">当前跑力 = Σ(权重 × 跑力) ÷ Σ权重　（取最近 42 天）<br>权重 = 1 − 0.5 × 距今天数 ÷ 42；比赛的竞赛跑力权重 × 3</div>
    <p>42 天窗口和“越近权重越高、参考比赛”是公开的说法；具体权重是【RW 自定】。停练衰退：14 天内不变，28 天 −6%，63 天 −19%，中间线性插值。</p>
    <p>校准（可选，默认关闭）：比赛日的竞赛跑力减去前后 21 天即时跑力中位数，取各场比赛的中位数作为偏移量。当前数据算出 ${R.suggestCalib ? '+' + f1(R.suggestCalib.value) + '（' + R.suggestCalib.n + ' 场）' : '—'}。它反映的是安静心率、最大心率设定和轻松跑偏低带来的系统误差。</p></section>
  <section class="card c6"><h3>4. 训练指数（单次负荷）</h3>
    <div class="eq">训练指数 = 每分钟计点 × 移动分钟数<br>计点：1 区 0.2 · 2 区 0.4 · 3 区 0.6 · 4 区 0.8 · 5 区 1.0 · 6 区 1.5 · 1 区以下 0.1</div>
    <p>强度 = max(心率强度 %HRR，配速强度 VO₂(v) ÷ 当前跑力)，再换算成区间。高强度间歇心率跟不上，用配速；炎热、越野配速慢但心率高，用心率；跑步机只用心率。</p>
    <p>E 0.2、M 0.4、T 0.6、I 1.0、R 1.5 是 Daniels 的计点；A 区 0.8 和 1 区以下 0.1 是【RW 自定】。Garmin 导出的 TSS 全为 0，不使用，所有记录统一用这一把尺。</p></section>
  <section class="card c6"><h3>5. 体能 · 疲劳 · 状况</h3>
    <div class="eq">体能ₜ = 体能ₜ₋₁ + (训练指数ₜ − 体能ₜ₋₁) ÷ 42<br>疲劳ₜ = 疲劳ₜ₋₁ + (训练指数ₜ − 疲劳ₜ₋₁) ÷ 7<br>今天的状况 = 昨天的体能 − 昨天的疲劳</div>
    <p>来自 Banister 冲击-反应模型。初值取前 42 天的日均训练指数【RW 自定】。体能像油箱容量，疲劳涨得快退得快。</p>
    <p>公开的参考值：训练期 −2 ~ −7 最有效；低于 −8 属过度训练，−10 建议休息；连续 3 天低于 −8 提醒过度疲劳，连续 7 天低于 −10 提醒过量训练；全马比赛日 0 ~ +5，比赛周不超过 +3。</p></section>
  <section class="card c6"><h3>6. 减量模拟</h3>
    <div class="eq">每天训练指数 = 近 28 天日均 × 系数<br>默认系数：赛前 14 天以上 0.775 · 7–13 天 0.6 · 最后 6 天 0.4</div>
    <p>按《进阶马拉松》：赛前三周开始减量，减量不减强度，里程依次减 20–25%、40%、60%。模拟器逐日推演体能和疲劳，得到比赛日早晨的状况，并用二分法求出让状况落在 +2 的固定比例。</p></section>
  <section class="card c6"><h3>7. 区间</h3>
    <div class="eq">心率区间：1 区 59–74% · 2 区 74–84% · 3 区 84–88% · 4 区 88–95% · 5 区 95–100%（储备心率）<br>目标心率 = 安静心率 + (最大心率 − 安静心率) × 百分比</div>
    <p>配速区间用同样的 %VO₂max 边界（R 区 105–115% 为【RW 自定】）。区间小数表示在区内的位置，例如 2.4 约为 78% HRR。</p></section>
  <section class="card c6"><h3>8. 数据清洗</h3>
    <p>跑步机：不计跑力，负荷只看心率。越野：不计跑力。配速快于 2:50/km、心率与配速明显不符：判为 GPS 误差，排除。平均心率低于 90、配速慢于 9:00/km：判为步行或心率带脱落，排除。不足 3 公里的热身/放松段保留，但不计跑力。</p>
    <p>同一天、下一段在上一段结束后 30 分钟内开始的记录合并成一次训练，用于次数统计；负荷按每段分别计算后相加。比赛距离按标准距离计算（GPS 多量的距离不算）。</p></section>
  <section class="card c6"><h3>9. 跑量甜区</h3>
    <p>每周取当周最后一天的体能与当前跑力画散点，跑力最高的 10% 周对应的体能中位数，作为“练到多少最划算”的参考。分类：小猴子 10–15，中小 15–20，中大 20–25，大 25–30，超大 30 以上。需要半年以上数据。</p></section>
  <section class="card c6"><h3>10. 做不到的部分</h3>
    <p>Garmin 的活动列表 CSV 只有每次的平均值，没有逐秒心率和配速，所以即时跑力、训练指数和区间时间都是近似；间歇课的负荷会偏低。有氧基础检测（心率漂移）需要逐秒数据，暂时不做。所有数值都会和其他平台不同。</p></section>
  </div>`;

  pages.settings = () => {
    const d = activities();
    return `<h2>设置</h2><p class="lead">修改后自动保存在这台设备的浏览器里，所有页面立即重算。</p>
    <div class="grid"><section class="card c12"><h3>心率</h3><div class="form">
      <label class="f">安静心率${settings.restHr == RW.DEFAULTS.restHr ? '<span class="tag">假设值</span>' : ''}<input data-s="restHr" type="number" value="${esc(settings.restHr)}"></label>
      <label class="f">最大心率${settings.maxHr ? '' : '<span class="tag">自动 ' + R.p99 + '</span>'}<input data-s="maxHr" type="number" placeholder="${R.p99}" value="${esc(settings.maxHr || '')}"></label>
      <label class="f">阈值心率${settings.lthr ? '' : '<span class="tag">估算</span>'}<input data-s="lthr" type="number" placeholder="${R.lthr}" value="${esc(settings.lthr || '')}"></label></div>
      <p class="note">安静心率请在早上醒来、站立 1–2 分钟后测量；最大心率要用实际跑出来的值，不要用年龄公式。自动最大心率取所有记录最大心率的 99 分位，避开偶发尖峰。历史最高的 10 次：${R.topMax.map(t => `${t.maxHr}（${t.day}）`).join('，')}。</p></section>
      <section class="card c12"><h3>比赛</h3><div class="form">
        <label class="f">比赛名称<input data-s="raceName" type="text" value="${esc(settings.raceName)}"></label>
        <label class="f">日期<input data-s="raceDate" type="date" value="${esc(settings.raceDate)}"></label>
        <label class="f">距离<select data-s="raceDist">${[[42195, '全马'], [21097.5, '半马'], [10000, '10 公里'], [5000, '5 公里']].map(([v, n]) => `<option value="${v}" ${+settings.raceDist === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f">目标成绩<input data-s="goal" type="text" value="${esc(settings.goal)}"></label>
        <label class="f">个人最佳<input data-s="pb" type="text" value="${esc(settings.pb)}"></label></div></section>
      <section class="card c12"><h3>跑力校准</h3><div class="form">
        <label class="f">开启校准<select data-s="calibOn"><option value="false" ${!settings.calibOn ? 'selected' : ''}>关闭</option><option value="true" ${settings.calibOn ? 'selected' : ''}>开启</option></select></label>
        <label class="f">偏移量<input data-s="calib" type="number" step="0.1" value="${esc(settings.calib || (R.suggestCalib ? R.suggestCalib.value.toFixed(1) : 0))}"></label></div>
        <p class="note">建议值 ${R.suggestCalib ? '+' + f1(R.suggestCalib.value) + '（来自 ' + R.suggestCalib.n + ' 场比赛）' : '—'}。开启后当前跑力、负荷强度和预测都会用校准后的跑力。先把安静心率和最大心率设准，比校准更好。</p></section>
      <section class="card c12"><h3>更新数据</h3>
        <p class="note" style="margin-top:0">在 Garmin Connect 网页版「活动」列表导出 CSV（中文或英文表头都可以），在这里导入。数据只保存在本机浏览器，不会上传。当前：${d.imported ? '已导入的数据' : '仓库内置数据'}，${d.acts.length} 条，${esc(d.meta.first || '')} 至 ${esc(d.meta.last || '')}。</p>
        <div class="row" style="justify-content:flex-start"><input type="file" id="csvFile" accept=".csv,text/csv">
          <select id="csvMode"><option value="merge">与现有数据合并</option><option value="replace">替换现有数据</option></select>
          <button class="btn pri" id="csvGo">导入</button><button class="btn" id="csvReset">恢复内置数据</button><button class="btn" id="exportJson">导出 JSON</button><button class="btn" id="resetAll">清除全部设置</button></div>
        <p id="csvMsg" class="note"></p></section></div>`;
  };
  pages.settings.after = () => {
    document.querySelectorAll('[data-s]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.s; let v = inp.value;
      if (['restHr', 'maxHr', 'lthr', 'raceDist', 'calib'].includes(k)) v = v === '' ? null : +v;
      if (k === 'calibOn') v = v === 'true';
      if (k === 'calibOn' && v && !settings.calib && R.suggestCalib) settings.calib = +R.suggestCalib.value.toFixed(1);
      settings[k] = v; save(LS.set, settings); recompute(); route();
    });
    $('#csvGo').onclick = () => {
      const f = $('#csvFile').files[0]; if (!f) { $('#csvMsg').textContent = '请先选择 CSV 文件。'; return; }
      const rd = new FileReader(); rd.onload = () => {
        const acts = RW.activitiesFromCSV(String(rd.result));
        if (!acts.length) { $('#csvMsg').textContent = '没有读到跑步记录，请确认是 Garmin Connect 导出的活动 CSV。'; return; }
        let all = acts;
        if ($('#csvMode').value === 'merge') { const m = new Map(activities().acts.map(a => [a.id, a])); acts.forEach(a => m.set(a.id, a)); all = [...m.values()].sort((a, b) => a.start < b.start ? -1 : 1); }
        save(LS.acts, { meta: { generated: new Date().toISOString().slice(0, 16), source: f.name, count: all.length, first: all[0].day, last: all[all.length - 1].day }, activities: all });
        recompute(); route(); setTimeout(() => { const m = $('#csvMsg'); if (m) m.textContent = `已导入 ${acts.length} 条跑步记录，现在共 ${all.length} 条。`; }, 0);
      }; rd.readAsText(f, 'utf-8');
    };
    $('#csvReset').onclick = () => { localStorage.removeItem(LS.acts); recompute(); route(); };
    $('#resetAll').onclick = () => { if (confirm('清除所有设置、比赛标记和导入的数据？')) { [LS.set, LS.race, LS.acts, LS.ui].forEach(k => localStorage.removeItem(k)); location.reload(); } };
    $('#exportJson').onclick = () => { const d = activities(); const b = new Blob([JSON.stringify({ meta: d.meta, activities: d.acts })], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'activities.json'; a.click(); };
  };

  // ---------- 路由 ----------
  function route() {
    charts.splice(0).forEach(c => c.destroy());
    let t = (location.hash || '#overview').slice(1); if (!pages[t]) t = 'overview';
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === t));
    const app = $('#app');
    if (!R) { app.innerHTML = '<section class="card"><h3>还没有数据</h3><p class="lead">到「设置」导入 Garmin Connect 导出的活动 CSV。</p></section>' + (t === 'settings' ? '' : ''); if (t !== 'settings') return; }
    app.innerHTML = pages[t]();
    app.querySelectorAll('.seg[data-key]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => { ui[sg.dataset.key] = b.dataset.v; saveUI(); route(); }));
    if (t === 'load' && R && RW.diffDays(settings.raceDate, R.today) > 0) {
      $('#tpPlan').onchange = e => { ui.taperPlan = e.target.value; saveUI(); route(); };
      $('#tpRest').onchange = e => { ui.taperRest = +e.target.value; saveUI(); route(); };
      const pct = $('#tpPct'); pct.oninput = () => { $('#tpPctV').textContent = pct.value + '%'; }; pct.onchange = () => { ui.taperPct = +pct.value; saveUI(); route(); };
    }
    if (t === 'paces') {
      document.querySelectorAll('#pvSeg button').forEach(b => b.onclick = () => { ui.paceV = b.dataset.v; saveUI(); route(); });
      $('#pvIn').onchange = e => { ui.paceV = e.target.value; saveUI(); route(); };
    }
    if (pages[t].after) pages[t].after();
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  recompute(); route();
})();
