/* v3 移动端页面。渲染与纯计算分离，所有用户文字经过转义。 */
(function (G) {
  'use strict';
  function install(c) {
    const { pages, esc, f, table, row, chart, field, download } = c;
    const $ = s => document.querySelector(s);
    const R = () => c.result();
    const S = () => c.settings();
    let journal, journalError = '', journalDate = RW.shanghaiToday(), month = journalDate.slice(0, 7);
    let fitnessDays = 90, vdotDays = 180, factor = 0.6;
    let rec = { type: '', year: '', month: '', search: '', period: '月', page: 1 };
    try { journal = RWJournal.load(); } catch (e) { journal = { version: 1, entries: [] }; journalError = e.message + ' 原存储未覆盖。'; }
    const sub = (group, links) => `<nav class="subtabs">${links.map(([path, name]) => `<a href="#${group}/${path}">${name}</a>`).join('')}</nav>`;
    const analysisNav = () => sub('analysis', [['fitness', '体能'], ['vdot', '跑力'], ['tech', '技术']]);
    const trainingNav = () => sub('training', [['journal', '日志'], ['plan', '课表']]);
    const toolsNav = () => sub('tools', [['calc', '计算器'], ['settings', '设置']]);
    const paces = () => Object.fromEntries(RW.ZONES.map(z => [z.code, `${RW.fmtPace(RW.paceAt(R()?.curNow, z.hi))}–${RW.fmtPace(RW.paceAt(R()?.curNow, z.lo))}/km`]));
    function heartSource() {
      const h = RWJournal.restHrFrom(journal.entries, RW.shanghaiToday());
      return effectiveSettings().restHr === S().restHr && (S().restHrManual || (S().restHr !== 48 && S().restHrManual !== false)) ? `静息心率来源：手动 ${S().restHr}` : h ? `静息心率来源：日志中位数 ${h.count} 条（${h.value}）` : '静息心率来源：48 为假设值';
    }
    function effectiveSettings() {
      const s = S(), h = RWJournal.restHrFrom(journal.entries, RW.shanghaiToday());
      const manual = s.restHrManual || (s.restHr != null && s.restHr !== 48 && s.restHrManual !== false);
      return { ...s, restHr: manual ? s.restHr : h?.value ?? 48 };
    }
    function advice() {
      const r = R();
      if (!r) return null;
      const today = r.today, recent = r.sessions.filter(x => RW.diffDays(today, x.day) < 14);
      const weeks = Array.from({ length: 4 }, (_, n) => r.segs.filter(x => {
        const d = RW.diffDays(today, x.day); return d >= n * 7 && d < (n + 1) * 7;
      }).reduce((s, x) => s + x.km, 0));
      const jt = journal.entries.find(x => x.date === today) || journal.entries.find(x => x.date === RW.addDays(today, -1)) || null;
      const fatigue = journal.entries.filter(x => RW.diffDays(today, x.date) >= 0 && RW.diffDays(today, x.date) < 14 && x.fatigue !== null).map(x => x.fatigue);
      const input = { today, raceDate: S().raceDate, raceDist: +S().raceDist, goalS: RW.dur(S().goal), pbS: RW.dur(S().pb),
        tsbSeries: r.tsb.slice(-14), ctl: r.ctl[r.iT], atl: r.atl[r.iT], curVdot: r.curNow,
        cur30dChange: r.curNow !== null && r.curAt(Math.max(0, r.iT - 30)) !== null ? r.curNow - r.curAt(Math.max(0, r.iT - 30)) : null,
        weekKm4: weeks, longest28dKm: Math.max(0, ...r.sessions.filter(x => RW.diffDays(today, x.day) < 28).map(x => x.km)),
        recentSessions: recent.map(x => ({ ...x, zoneCode: x.zone == null ? null : RW.ZONES[Math.max(0, Math.min(5, Math.floor(x.zone) - 1))].code })),
        raceVdots: r.sessions.filter(x => x.isRace && RW.diffDays(today, x.day) <= 183).map(x => ({ dist: x.main.km * 1000, vdot: x.raceVdot })),
        journalToday: jt, journalFatigueMean: fatigue.length ? fatigue.reduce((s, x) => s + x, 0) / fatigue.length : null,
        restHrBaseline: RWJournal.restHrFrom(journal.entries, today)?.value ?? null,
        restHrToday: journal.entries.find(x => x.date === today)?.restHr ?? null,
        dataLastDay: r.segs.at(-1)?.day, unknownLoadDays: r.unknownDays.filter(day => RW.diffDays(today, day) < 14).length, paces: paces() };
      const out = RWCoach.advise(input);
      // 明日预案：假设今天之后不再训练，用今天收盘的体能−疲劳作为明天状况；明天日志未知。
      try {
        const tomorrow = RW.addDays(today, 1);
        out.tomorrow = RWCoach.advise({ ...input, today: tomorrow, tsbSeries: [...input.tsbSeries, input.ctl - input.atl],
          journalToday: journal.entries.find(x => x.date === today) || null, restHrToday: null });
      } catch (e) { out.tomorrow = null; }
      return out;
    }
    function evidenceItems(reasons) {
      return reasons.map(e => {
        const values = Object.entries(e.values).map(([k, v]) => `<span class="ev-k">${esc(k)}</span> ${esc(typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(1) : v)}`).join('<i>·</i>');
        return `<li><div class="ev-v">${values}</div><div class="ev-r">${esc(e.rule)}</div><small>来源：${esc(e.source)}</small></li>`;
      }).join('');
    }
    function evidence(reasons) {
      return reasons.length ? `<details class="why"><summary>为什么 · 展开依据</summary><ul>${evidenceItems(reasons)}</ul></details>` : '';
    }
    function coachCard() {
      const a = advice();
      if (!a) return '';
      // 依据只出现一次：今日建议与各项风险的依据合并、去重后放进同一个折叠区。
      const seen = new Set(), all = [...a.today.reasons, ...a.risks.flatMap(x => x.reasons)].filter(e => {
        const key = e.rule + JSON.stringify(e.values); if (seen.has(key)) return false; seen.add(key); return true;
      });
      const t = a.today;
      const zoneOk = /^[EMTIR]$/.test(t.zone || '');
      const dose = t.type === '已完成' ? '' : t.durationMin ? (t.durationMin[1] === 0 ? '休息' : `${t.durationMin[0] ? t.durationMin[0] + '–' : '≤'}${t.durationMin[1]} 分钟${zoneOk ? ' · ' + t.zone + ' 区' : ''}`) : '';
      return `<section class="card coach">
        <div class="coach-head"><span class="eyebrow">私教今日建议</span><span class="pill">${esc(a.phase)}</span></div>
        <div class="coach-type"><b>${esc(t.type === '已完成' ? '今日训练已完成' : t.type)}</b>${dose ? `<span>${esc(dose)}</span>` : ''}</div>
        <p class="lead">${esc(t.summary)}</p>
        ${a.risks.map(x => `<p class="callout ${x.level === '高' ? 'bad' : 'warn'}"><b>${x.level}风险</b> ${esc(x.text)}</p>`).join('')}
        ${a.tomorrow ? `<div class="tomorrow"><b>明日预案 · ${esc(a.tomorrow.today.type || '')}</b><p>${esc(a.tomorrow.today.summary)}</p><small>假设今天不再训练；明早按实际状态和日志重新判断。</small></div>` : ''}
        ${evidence(all)}
        <p class="muted">置信度 ${a.confidence} · ${esc(a.confidenceText)}</p>
        <div class="row"><a class="btn pri" href="#training/journal">写今天的日志</a><a class="btn ghost" href="#training/plan">看课表 →</a></div>
      </section>`;
    }
    function gapCard() {
      const a = advice();
      if (!a) return '';
      const g = a.gap;
      return `<section class="card">
        <h3>目标差距与短板</h3>
        <p>目标 VDOT ${f(g.goalVdot)} · 当前 ${f(g.curVdot)} · 差值 ${f(g.diff)} · PB 对应 ${f(g.pbVdot)}</p>
        <p>${esc(g.note)}</p>
        ${g.limiters.map(x => `<h4>${x.key} · ${x.level}</h4><p>${esc(x.text)}</p>${evidence(x.reasons)}`).join('')}
      </section>`;
    }
    // 状况分区：沿用 RQ 公开口径思路（−2~−7 有效训练、<−10 过度疲劳风险、全马赛日 0~+5），阈值为 RW 参考。
    function tsbZone(t) {
      if (!Number.isFinite(t)) return { key: 'na', label: '数据不足' };
      if (t > 5) return { key: 'fresh', label: '充分恢复' };
      if (t >= 0) return { key: 'race', label: '比赛窗口' };
      if (t > -2) return { key: 'flat', label: '平衡' };
      if (t >= -7) return { key: 'train', label: '有效训练' };
      if (t >= -10) return { key: 'tired', label: '偏疲劳' };
      return { key: 'over', label: '过度疲劳风险' };
    }
    // invert：疲劳下降是好事，颜色反过来。
    function delta(now, prev, invert = false) {
      if (!Number.isFinite(now) || !Number.isFinite(prev)) return '<span class="d">较昨日 无数据</span>';
      const d = +(now - prev).toFixed(1), good = invert ? d < 0 : d > 0;
      return `<span class="d ${d === 0 ? '' : good ? 'pos' : 'neg'}">较昨日 ${d > 0 ? '+' : ''}${d.toFixed(1)}</span>`;
    }
    pages.status = () => {
      const r = R(), i = r.iT, t = r.tsb[i], a = advice(), z = tsbZone(t);
      const bad = a?.today.type === '休息' && a.risks.some(x => x.level === '高' && x.text.includes('就医'));
      const raceDays = RW.diffDays(S().raceDate, r.today);
      const goodBeforeRace = raceDays >= 0 && raceDays <= 21 && t >= 0;
      const state = bad || t < -10 ? '恢复' : t < -6 ? '疲劳' : t >= 3 || goodBeforeRace ? '在线' : '稳定';
      const head = { 在线: '状态在线，按计划推进', 稳定: '状态平稳，照常训练', 疲劳: '有点累，今天收着跑', 恢复: '先恢复，别硬撑' }[state];
      const quote = RWQuotes.forDate(r.today);
      const pos = Number.isFinite(t) ? Math.max(0, Math.min(100, (t + 20) / 30 * 100)) : null;
      const last = r.segs.at(-1);
      return `<section class="metrics" aria-label="今日核心指标">
          <div class="m-top">
            <div><span class="m-date">${esc(r.today)}</span>${RW.validDate(S().raceDate) && raceDays >= 0 ? `<span class="m-race">${esc(S().raceName || '目标赛')} · 还有 <b>${raceDays}</b> 天</span>` : ''}</div>
            <span class="m-src">最新活动 ${esc(last?.day || '—')}</span>
          </div>
          <div class="m-grid">
            <div class="m vdot"><span class="lab">跑力</span><b class="num">${f(r.curNow)}</b>${delta(r.curNow, r.curAt(i - 1))}</div>
            <div class="m"><span class="lab">体能 <i>42天</i></span><b class="num">${f(r.ctl[i])}</b>${delta(r.ctl[i], r.ctl[i - 1])}</div>
            <div class="m"><span class="lab">疲劳 <i>7天</i></span><b class="num">${f(r.atl[i])}</b>${delta(r.atl[i], r.atl[i - 1], true)}</div>
            <div class="m tsb z-${z.key}"><span class="lab">状况</span><b class="num">${Number.isFinite(t) && t > 0 ? '+' : ''}${f(t)}</b><span class="zone">${z.label}</span>${delta(t, r.tsb[i - 1])}</div>
          </div>
          ${pos === null ? '' : `<div class="tsb-scale" aria-hidden="true"><span class="mk" style="left:${pos.toFixed(1)}%"></span></div>
          <div class="tsb-ticks" aria-hidden="true"><span style="left:0%">−20</span><span style="left:${(10 / 30 * 100).toFixed(1)}%">−10</span><span style="left:${(18 / 30 * 100).toFixed(1)}%">−2</span><span style="left:${(20 / 30 * 100).toFixed(1)}%">0</span><span style="left:${(25 / 30 * 100).toFixed(1)}%">+5</span><span style="left:100%">+10</span></div>`}
          <p class="m-note">状况 = 昨日体能 − 昨日疲劳 · 跑力为心率-配速近似估算</p>
        </section>
        <section class="card runner-card s-${state}">
          <div class="runner-wrap">${RWMascot.svg(state)}</div>
          <div class="runner-text"><span class="eyebrow">今天 · ${state}</span><h3>${head}</h3><p>${heartSource()}</p></div>
        </section>
        ${coachCard()}
        <blockquote class="quote">${quote.text}<small>—— ${quote.author}</small></blockquote>
`;
    };
    const oldLoad = pages.load, oldLoadAfter = pages.load.after;
    pages['analysis/fitness'] = () => {
      const r = R(), n = RW.daysToPositive(r, factor, 60);
      const recent = r.segs.filter(x => RW.diffDays(r.today, x.day) < 28);
      const totalLoad = recent.some(x => x.load == null) ? '—（含未知）' : f(recent.reduce((s, x) => s + x.load, 0) / 4);
      const raceDays = RW.diffDays(S().raceDate, r.today);
      const raceMorning = raceDays >= 0 ? RW.projectTaper(r, factor, raceDays).at(-1)?.tsb : null;
      return `${analysisNav()}<h2>体能与恢复</h2>
        <section class="card">
          <div class="row">${[30, 90, 180].map(n => `<button class="btn" data-days="${n}">${n}天</button>`).join('')}</div>
          <div class="chart"><canvas id="fitnessTrend"></canvas></div>
          <p>近四周周均 ${f(recent.reduce((s, x) => s + x.km, 0) / 4)} km · 周均负荷 ${totalLoad}</p>
        </section>
        <section class="card"><h3>减量回正推演</h3>
          <label>近28天日均负荷比例 <select id="positiveFactor">
            ${[0.4, 0.6, 0.8].map(x => `<option value="${x}" ${x === factor ? 'selected' : ''}>${x * 100}%</option>`).join('')}
          </select></label>
          <p>${n === null ? '60 天内无法回正' : `从今天起约 ${n} 天回到非负状况`}；未知负荷按0推演，仅为参考。</p>
          <p>比赛日早晨推演状况：${f(raceMorning)}</p>
        </section>
        ${pages.zones()}${heartZones()}${oldLoad()}${gapCard()}`;
    };
    function heartZones() {
      const r = R();
      const rows = RW.ZONES.slice(0, 5).map(z => {
        const samples = r.segs.filter(a => a.hrr != null && a.hrr >= z.lo && a.hrr < (z.code === 'I' ? Infinity : z.hi));
        return row([`${z.code} · ${z.name}`, RW.fmtHMS(samples.reduce((s, a) => s + a.movS, 0)), String(samples.length)]);
      });
      return `<section class="card">
        <h3>心率区间时长（按整段平均心率归区，非逐秒）</h3>
        ${table(['心率区', '时长 时:分:秒', '次数'], rows)}
        <p>低于E及无心率段不列入。</p>
      </section>`;
    }
    pages['analysis/fitness'].after = () => {
      const r = R();
      chart('fitnessTrend', r.days.slice(-fitnessDays), [['体能', r.ctl.slice(-fitnessDays)], ['疲劳', r.atl.slice(-fitnessDays)], ['状况', r.tsb.slice(-fitnessDays)]]);
      oldLoadAfter?.();
      document.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { fitnessDays = +b.dataset.days; c.route(); });
      $('#positiveFactor').onchange = e => { factor = +e.target.value; c.route(); };
    };
    pages['analysis/vdot'] = () => {
      const r = R();
      const delta = n => r.curNow != null && r.curAt(Math.max(0, r.iT - n)) != null ? r.curNow - r.curAt(Math.max(0, r.iT - n)) : null;
      const pbRows = RWAnalysis.personalBests(r.sessions.map(s => ({ ...s.main, id: s.id })), c.races()).map(g => {
        const cells = [0, 1].map(n => {
          const a = g.best[n];
          return a ? `${a.day} ${RW.fmtT(a.elapsedS || a.timeS || a.movS)} ${a.confirmed ? '★' : ''}` : '无记录';
        });
        return row([g.km + 'km', ...cells]);
      });
      const predictions = [5000, 10000, 21097.5, 42195].map(d => row([d / 1000 + 'km', RW.fmtT(RW.raceTime(r.curNow, d))]));
      return `${analysisNav()}<h2>跑力 · ${f(r.curNow)}</h2>
        <p>心率-配速近似估算；30天变化 ${f(delta(30))} · 90天变化 ${f(delta(90))}</p>
        <section class="card">
          ${[90, 180, 365].map(n => `<button class="btn" data-vdays="${n}">${n}天</button>`).join('')}
          <div class="chart"><canvas id="powerTrend"></canvas></div>
        </section>
        ${pages.paces()}
        <section class="card"><h3>Daniels成绩预测</h3>
          <p>心率近似跑力推估，非实测；2:45全马所需 VDOT ${f(RW.vdot(42195, 9900))}</p>
          ${table(['距离', '推估成绩'], predictions)}
          <p>六个月竞赛跑力 ${f(r.compVdot)} · 类型 ${esc(r.runnerType || '证据不足')}。仅认手动确认比赛。</p>
          ${r.races.length ? '' : '<a href="#records">无确认比赛，去记录页标星</a>'}
        </section>
        <section class="card"><h3>PB 最佳 / 次佳</h3>
          <p>整段活动成绩，非官方、非分段最佳；主段距离带：5K 4.9–5.25 / 10K 9.85–10.4 / 半马 20.9–21.9 / 全马 41.9–43.3km。</p>
          ${table(['距离', '最佳', '次佳'], pbRows)}
          <p>用户设置 PB：${esc(S().pb)}（${+S().raceDist / 1000}km），单独列示。</p>
        </section>
        ${gapCard()}`;
    };
    pages['analysis/vdot'].after = () => {
      chart('powerTrend', R().days.slice(-vdotDays), [['跑力', R().cur.slice(-vdotDays)]]);
      document.querySelectorAll('[data-vdays]').forEach(b => b.onclick = () => { vdotDays = +b.dataset.vdays; c.route(); });
    };
    pages['analysis/tech'] = () => {
      const groups = RWAnalysis.technique(R().segs, R().curNow, R().today);
      const heads = ['配速区 / 样本', '步频 spm', '步长 m', '触地 ms', '垂直摆动 cm', '垂直比 %'];
      const allRows = groups.map(g => row([
        `${g.code} / ${g.count}${g.small ? '（样本少）' : ''}`,
        ...RWAnalysis.metrics.map(k => f(g.means[k]))
      ]));
      const trendRows = groups.map(g => row([
        `${g.code} ${g.recentCount}/${g.beforeCount}${Math.min(g.recentCount, g.beforeCount) < 5 ? ' 样本少' : ''}`,
        ...RWAnalysis.metrics.map(k => `${f(g.recent[k])} / ${f(g.before[k])}`)
      ]));
      return `${analysisNav()}<h2>技术 · 整段平均配速归区</h2>
        <p>按当前跑力 E/M/T/A/I 边界，均值忽略缺失；I含更快活动，E含更慢活动。不同路况、强度与设备可能造成差异。</p>
        <section class="card">${table(heads, allRows)}</section>
        <section class="card"><h3>近90天 vs 之前（同配速区，均值）</h3>
          ${table(heads, trendRows)}
          <p>腾空时间：无数据（CSV 未提供）<br>触地平衡：无数据（CSV 未提供）</p>
        </section>`;
    };
    function raceId(a) {
      return R().sessions.find(s => s.segs.some(seg => seg.id === a.id))?.id || a.id;
    }
    function filteredRecords() {
      return R().segs.filter(a => (!rec.type || (rec.type === '跑步机' ? /跑步机|treadmill/i.test(a.type) : !/跑步机|treadmill/i.test(a.type))) && (!rec.year || a.day.startsWith(rec.year)) && (!rec.month || a.day.slice(5, 7) === rec.month) && (!rec.search || a.title.toLowerCase().includes(rec.search.toLowerCase())));
    }
    function periodRecords(g) {
      const labels = { longest: '最长距离', fastest: '最快平均配速（≥5km整段）', climb: '最高已知爬升', load: '最大已知负荷' };
      const lines = Object.entries(labels).map(([k, label]) => {
        const a = g.records[k];
        const value = a ? (k === 'fastest' ? RW.fmtPace(a.movS / a.km) : f(a[k === 'longest' ? 'km' : k === 'climb' ? 'asc' : 'load'])) : '无';
        return `<p>${label}：${a ? `${a.day} ${esc(a.title)} · ` : ''}${value}</p>`;
      });
      return `<h4>${g.key}</h4>${lines.join('')}`;
    }
    pages.records = () => {
      const acts = filteredRecords(), groups = RWAnalysis.aggregate(acts, rec.period);
      const opt = (values, selected) => '<option value="">全部</option>' + values.map(x => `<option ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('');
      const years = [...new Set(R().segs.map(x => x.day.slice(0, 4)))].reverse();
      const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      const statsRows = groups.map(g => row([
        g.key, f(g.vdot), `${f(g.km)} / ${g.count}`, RW.fmtPace(g.pace) + '/km',
        g.load === null ? `${f(g.loadKnown)}<sup>*</sup>` : f(g.load), RW.fmtHMS(g.movS),
        f(g.hr), g.asc === null ? `${Math.round(g.ascKnown)}<sup>*</sup>` : String(Math.round(g.asc)), f(g.cad), f(g.stride)
      ]));
      const listRows = acts.slice().reverse().slice((rec.page - 1) * 30, rec.page * 30).map(a => {
        const on = c.races()[raceId(a)] === true;
        return `<li class="act"><button class="star ${on ? 'on' : ''}" data-race="${esc(raceId(a))}" aria-label="${on ? '取消比赛确认' : '确认为比赛'}">${on ? '★' : '☆'}</button>
          <div class="act-t"><span class="act-d">${a.day} · ${wd(a.day)}</span><span class="act-n">${esc(a.title)}</span></div>
          <div class="act-v"><b>${f(a.km)}<small>km</small></b><span>${RW.fmtPace(a.movS / a.km)}/km · ${RW.fmtHMS(a.movS)}</span></div></li>`;
      });
      return `<h2>记录与统计</h2>
        <section class="card"><div class="form">
          <label class="f">类型<select id="recType">${opt(['跑步', '跑步机'], rec.type)}</select></label>
          <label class="f">年<select id="recYear">${opt(years, rec.year)}</select></label>
          <label class="f">月<select id="recMonth">${opt(months, rec.month)}</select></label>
          <label class="f">标题搜索<input id="recSearch" value="${esc(rec.search)}"></label>
          <label class="f">统计周期<select id="recPeriod">
            ${['周', '月', '年', '总'].map(x => `<option ${x === rec.period ? 'selected' : ''}>${x}</option>`).join('')}
          </select></label>
        </div>
        <p class="muted">统计针对当前筛选；心率、步频、步长按已知样本时长加权。带 * 的负荷/爬升表示该周期有活动缺少该数据，只合计已知部分。时长为 时:分:秒。</p>
        ${table(['周期', '平均跑力', '公里 / 次数', '平均配速', '负荷', '时长', '心率', '爬升 m', '步频', '步长'], statsRows)}
        <details><summary>各周期个人记录</summary>${groups.map(periodRecords).join('')}</details>
        </section>
        <section class="card">
          <div class="coach-head"><h3>活动列表</h3><span class="pill">共 ${acts.length} 条</span></div><p class="muted">☆ 点亮为 ★ 表示你确认这是一场比赛，只有确认的比赛才参与竞赛跑力。</p>
          <ul class="act-list">${listRows.join('')}</ul>
          <div class="row pager"><button id="prevRecords" class="btn">上一页</button><span class="muted">第 ${rec.page} / ${Math.max(1, Math.ceil(acts.length / 30))} 页</span><button id="nextRecords" class="btn">下一页</button></div>
        </section>`;
    };
    pages.records.after = () => {
      for (const [id, key] of [['recType', 'type'], ['recYear', 'year'], ['recMonth', 'month'], ['recSearch', 'search'], ['recPeriod', 'period']]) $( '#' + id).onchange = e => { rec[key] = e.target.value; rec.page = 1; c.route(); };
      $('#prevRecords').onclick = () => { rec.page = Math.max(1, rec.page - 1); c.route(); };
      $('#nextRecords').onclick = () => { rec.page = Math.min(Math.max(1, Math.ceil(filteredRecords().length / 30)), rec.page + 1); c.route(); };
      document.querySelectorAll('[data-race]').forEach(b => b.onclick = () => { c.races()[b.dataset.race] = c.races()[b.dataset.race] !== true; localStorage.setItem('rw.races', JSON.stringify(c.races())); c.refresh(); c.route(); });
    };
    pages['training/journal'] = () => {
      const x = journal.entries.find(e => e.date === journalDate) || { restHr: null, weight: null, fatigue: null, feeling: null, pain: false, notes: '' };
      const first = month + '-01', offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
      const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate();
      const today = RW.shanghaiToday(), gdays = new Set((garmin?.items || []).map(x => x.date));
      const cells = Array.from({ length: days }, (_, n) => {
        const d = RW.addDays(first, n), km = actualKm(d), logged = journal.entries.some(e => e.date === d);
        // v3 曾在无日志的格子里显示一个裸“—”（含义是“当天未写日志”）；现在改为有内容才显示，用图例说明圆点含义。
        return `<button data-jdate="${d}" class="day ${d === journalDate ? 'selected' : ''} ${d === today ? 'is-today' : ''} ${km > 0 ? 'ran' : ''}" aria-label="${d}${km > 0 ? ' 跑步 ' + f(km) + ' 公里' : ''}${logged ? ' 已写日志' : ''}${gdays.has(d) ? ' 有 Garmin 课表' : ''}">
          <span class="dn">${n + 1}</span><span class="dk">${km > 0 ? f(km) : ''}</span>
          <span class="dots">${logged ? '<i class="j"></i>' : ''}${gdays.has(d) ? '<i class="g"></i>' : ''}</span></button>`;
      }).join('');
      return `${trainingNav()}<h2>每日日志</h2>
        <section class="card">
          <label>月份 <input id="journalMonth" type="month" value="${month}"></label>
          <div class="cal-legend"><span><b>7.2</b> 当天跑量 km</span><span><i class="j"></i> 已写日志</span><span><i class="g"></i> Garmin 课表</span></div>
          <div class="calendar">
            ${['一', '二', '三', '四', '五', '六', '日'].map(x => `<span>${x}</span>`).join('')}
            ${'<span></span>'.repeat(offset)}${cells}
          </div>
        </section>
        <section class="card"><h3>${journalDate} 自评</h3>
          <form id="journalForm" class="form">
            ${field('restHr', '静息心率（30–100，可空）', x.restHr ?? '', 'number', 'min="30" max="100" step="1"')}
            ${field('weight', '体重 kg（可空）', x.weight ?? '', 'number', 'min="30" max="150" step="0.1"')}
            <div class="f">
              <label for="fatigueRange">疲劳（可不填）</label>
              <input id="fatigueRange" name="fatigue" type="range" min="1" max="10" value="${x.fatigue ?? 5}">
              <label><input name="hasFatigue" type="checkbox" ${x.fatigue === null ? '' : 'checked'}>
                记录疲劳 <output id="fatigueValue">${x.fatigue ?? 5}</output>/10
              </label>
            </div>
            <label class="f">感觉<select name="feeling"><option value="">不填</option>
              ${RWJournal.feelings.map(v => `<option ${v === x.feeling ? 'selected' : ''}>${v}</option>`).join('')}
            </select></label>
            <label><input name="pain" type="checkbox" ${x.pain ? 'checked' : ''}>病痛 / 受伤</label>
            <label class="f wide">备注<textarea name="notes" maxlength="2000">${esc(x.notes)}</textarea></label>
            <button class="btn pri">保存当天日志</button>
          </form>
          <p id="journalMsg" role="status">${esc(journalError)}</p>
          <div class="row tools"><button id="journalExport" class="btn">导出日志 JSON</button>
          <label class="file-btn ghost">导入日志 JSON（替换）<input id="journalImport" type="file" accept=".json,application/json"></label></div>
        </section>`;
    };
    pages['training/journal'].after = () => {
      $('#journalMonth').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value) && RW.validDate(e.target.value + '-01')) { month = e.target.value; c.route(); } };
      document.querySelectorAll('[data-jdate]').forEach(b => b.onclick = () => { journalDate = b.dataset.jdate; c.route(); });
      const form = $('#journalForm');
      form.elements.fatigue.oninput = () => { form.elements.hasFatigue.checked = true; $('#fatigueValue').textContent = form.elements.fatigue.value; };
      form.onsubmit = e => {
        e.preventDefault();
        try {
          const d = Object.fromEntries(new FormData(form)), num = k => d[k] === '' ? null : Number(d[k]);
          const x = { date: journalDate, restHr: num('restHr'), weight: num('weight'), fatigue: d.hasFatigue ? num('fatigue') : null, feeling: d.feeling || null, pain: d.pain === 'on', notes: d.notes };
          journal = RWJournal.save({ version: 1, entries: [...journal.entries.filter(e => e.date !== journalDate), x] }); journalError = ''; c.refresh(); c.route(); $('#journalMsg').textContent = '已保存。';
        } catch (e) { $('#journalMsg').textContent = e.message; }
      };
      $('#journalExport').onclick = () => download('rw-journal.json', journal);
      $('#journalImport').onchange = async e => {
        try {
          const file = e.target.files[0]; if (!file) return;
          if (file.size > RWJournal.MAX_BYTES) throw Error('超过256KB。');
          journal = RWJournal.save(RWJournal.parse(await file.text())); journalError = ''; c.refresh(); c.route(); $('#journalMsg').textContent = '导入成功。';
        } catch (e) { $('#journalMsg').textContent = e.message + ' 未覆盖原存储。'; }
      };
    };
    // ---------- Garmin 日历课表（本机文件导入，只读展示，与 RW 自建课表并列） ----------
    let garmin = null, garminMsg = '';
    try { garmin = RWGarminPlan.load(); } catch (e) { garminMsg = '本机保存的 Garmin 课表无法读取：' + e.message; }
    const WD = ['日', '一', '二', '三', '四', '五', '六'];
    const wd = d => '周' + WD[new Date(d + 'T00:00:00Z').getUTCDay()];
    const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
    function actualKm(d) { return (R()?.segs || []).filter(a => a.day === d).reduce((s, a) => s + a.km, 0); }
    function garminCard(x, today) {
      const km = actualKm(x.date), past = x.date < today, isToday = x.date === today;
      const done = km > 0 ? `<span class="pill good">当天实际 ${f(km)} km</span>` : past ? '<span class="pill">当天无跑步记录</span>' : isToday ? '<span class="pill ok">今天</span>' : '';
      const steps = x.steps.map((st, i) => `<li><span class="st-n">${i + 1}</span><div><b>${esc(RWGarminPlan.fixTime(st.duration_or_distance) || '—')}</b>${st.target ? `<span>${esc(RWGarminPlan.zh(st.target))}</span>` : ''}</div></li>`).join('');
      return `<article class="gw ${isToday ? 'today' : ''} ${past ? 'past' : ''}">
        <div class="gw-date"><b>${md(x.date)}</b><span>${wd(x.date)}</span></div>
        <div class="gw-body">
          <div class="gw-title">${esc(x.name)}</div>
          <div class="gw-meta">${x.total_distance_km != null ? `<span>${f(x.total_distance_km)} km</span>` : ''}${x.total_time ? `<span>${esc(RW.fmtHMS(RW.parseHMS(x.total_time)) !== '—' ? RW.fmtHMS(RW.parseHMS(x.total_time)) : x.total_time)}</span>` : ''}${x.total_distance_km && RW.parseHMS(x.total_time) ? `<span>${RW.fmtPace(RW.parseHMS(x.total_time) / x.total_distance_km)}/km</span>` : ''}${done}</div>
          ${steps ? `<ol class="gw-steps">${steps}</ol>` : ''}
          ${x.notes ? `<p class="gw-note">${esc(x.notes)}</p>` : ''}
        </div>
      </article>`;
    }
    function garminSection() {
      const today = RW.shanghaiToday(), race = S().raceDate;
      if (!garmin) return `<section class="card garmin">
        <div class="coach-head"><h3>Garmin 日历课表</h3><span class="pill">未导入</span></div>
        <p class="lead">把从 Garmin Connect 日历整理出的 <code>calendar-plan.json</code> 选进来即可显示，文件只保存在这台设备的浏览器里，不上传。</p>
        <label class="file-btn">选择 calendar-plan.json<input id="garminImport" type="file" accept=".json,application/json"></label>
        <p id="garminMsg" role="status" class="muted">${esc(garminMsg)}</p>
      </section>`;
      const items = garmin.items, upcoming = items.filter(x => x.date >= RW.addDays(today, -7));
      const lastBeforeRace = items.filter(x => !RW.validDate(race) || x.date <= race).at(-1)?.date;
      const raceEntry = RW.validDate(race) && items.some(x => x.date === race);
      const gapList = RW.validDate(race) && race >= today ? RWGarminPlan.gaps(items, today, race) : [];
      const tail = gapList.find(g => g[1] === race);
      const inner = gapList.filter(g => g !== tail);
      const raceDays = RW.diffDays(race, today);
      const warn = tail ? `<div class="callout bad gap"><b>Garmin 日历从 ${md(tail[0])}（${wd(tail[0])}）到比赛日 ${md(race)} 没有安排任何训练</b>
          <p>空档 ${RW.diffDays(tail[1], tail[0]) + 1} 天${raceEntry ? '' : '，比赛日当天也没有赛事条目'}。距${esc(S().raceName || '比赛')}还有 ${raceDays} 天，赛前一周的轻松跑、短 M 配速保持课和赛前一天的安排需要补上，可在下方 RW 课表里生成减量草案再自己确认。</p></div>` : '';
      return `<section class="card garmin">
        <div class="coach-head"><h3>Garmin 日历课表</h3><span class="pill good">${items.length} 条</span></div>
        <p class="muted">${esc(garmin.fileName || '本机文件')} · 导入于 ${esc(garmin.importedAt.slice(0, 10))} · 仅存本机浏览器${lastBeforeRace ? ` · 最后一条 ${md(lastBeforeRace)}` : ''}</p>
        ${warn}
        <div class="gw-list">${upcoming.map(x => garminCard(x, today)).join('') || '<p class="empty">最近 7 天及以后没有 Garmin 训练。</p>'}</div>
        ${inner.length ? `<p class="muted">另有未安排日：${inner.map(g => g[0] === g[1] ? md(g[0]) : `${md(g[0])}–${md(g[1])}`).join('、')}（可能是休息日）。</p>` : ''}
        <div class="row tools"><label class="file-btn">重新导入<input id="garminImport" type="file" accept=".json,application/json"></label><button id="garminClear" class="btn ghost" type="button">移除 Garmin 课表</button></div>
        <p id="garminMsg" role="status" class="muted">${esc(garminMsg)}</p>
      </section>`;
    }
    function bindGarmin() {
      const input = $('#garminImport');
      if (input) input.onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          if (file.size > RWGarminPlan.MAX_BYTES) throw Error('文件超过 512KB。');
          const items = RWGarminPlan.parse(await file.text());
          garmin = RWGarminPlan.save(items, file.name); garminMsg = `已导入 ${items.length} 条 Garmin 训练。`;
        } catch (err) { garminMsg = '导入失败：' + err.message + ' 原数据未改动。'; }
        c.route();
      };
      const clear = $('#garminClear');
      if (clear) clear.onclick = () => { if (!confirm('移除本机保存的 Garmin 课表？')) return; RWGarminPlan.clear(); garmin = null; garminMsg = '已移除。'; c.route(); };
    }
    pages['training/plan'] = () => trainingNav() + garminSection() + `<h2 class="sec">RW 自建课表</h2>` + pages.planner();
    pages['training/plan'].after = () => { bindGarmin(); pages.planner.after?.(); };
    for (const [path, old, nav] of [['tools/calc', 'predict', toolsNav], ['tools/settings', 'settings', toolsNav]]) {
      pages[path] = () => nav() + (path === 'tools/settings' ? `<section class="card"><p>${heartSource()}</p><button id="clearRestHr" class="btn">清除手动静息心率，改用日志 / 假设值</button></section>` : '') + pages[old]();
      pages[path].after = () => {
        pages[old].after?.();
        if (path === 'tools/settings') $('#clearRestHr').onclick = () => { S().restHr = 48; S().restHrManual = false; localStorage.setItem('rw.settings', JSON.stringify(S())); c.refresh(); c.route(); };
      };
    }
    return { effectiveSettings, paces, baseKm: () => R() ? R().segs.filter(a => RW.diffDays(R().today, a.day) < 28).reduce((s, a) => s + a.km, 0) / 4 : 0 };
  }
  G.RWViews = { install };
})(typeof window !== 'undefined' ? window : globalThis);
