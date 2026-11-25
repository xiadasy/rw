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
    function evidence(reasons) {
      const items = reasons.map(e => {
        const values = Object.entries(e.values).map(([k, v]) => `${esc(k)}：${esc(typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(1) : v)}`).join('；');
        return `<li>${values}<br>${esc(e.rule)}<small>来源：${esc(e.source)}</small></li>`;
      });
      return `<details><summary>为什么 · 展开依据</summary><ul>${items.join('')}</ul></details>`;
    }
    function coachCard() {
      const a = advice();
      return a ? `<section class="card coach">
        <h3>私教今日建议 · ${a.phase}</h3>
        <p class="lead">${esc(a.today.summary)}</p>
        ${evidence(a.today.reasons)}
        ${a.risks.map(x => `<p class="callout">${x.level}风险：${esc(x.text)}</p>${evidence(x.reasons)}`).join('')}
        ${a.tomorrow ? `<p class="tomorrow"><b>明日预案（${esc(a.tomorrow.today.type || '')}）：</b>${esc(a.tomorrow.today.summary)}<small>假设今天不再训练；明早按实际状态和日志重新判断。</small></p>` : ''}
        <p class="muted">置信度：${a.confidence} · ${esc(a.confidenceText)}</p>
        <div class="row"><a class="btn" href="#training/journal">写今天的日志</a><a class="btn ghost" href="#analysis/fitness">查看分析与依据 →</a></div>
      </section>` : '';
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
    pages.status = () => {
      const r = R(), t = r.tsb[r.iT], a = advice();
      const bad = a?.today.type === '休息' && a.risks.some(x => x.level === '高' && x.text.includes('就医'));
      const raceDays = RW.diffDays(S().raceDate, r.today);
      const goodBeforeRace = raceDays >= 0 && raceDays <= 21 && t >= 0;
      const state = bad || t < -10 ? '躺平' : t < -6 ? '疲惫' : t >= 3 || goodBeforeRace ? '奔跑' : '正常';
      const quote = RWQuotes.forDate(r.today);
      return `<h2>今天，${state}</h2>
        <section class="card status-hero">
          ${RWMascot.svg(state)}
          <div><h3>${{ 奔跑: '状态在线，按计划推进', 正常: '状态平稳，照常训练', 疲惫: '有点累，今天收着跑', 躺平: '先恢复，别硬撑' }[state]}</h3>
            <p>依据：今日状况 ${f(t)}（RW 参考区，阈值为 RW 自定）${goodBeforeRace ? '；赛前21天内非负状况视为良好区' : ''}</p>
            <p>最新活动：${esc(r.segs.at(-1)?.day || '无')} · ${heartSource()}</p>
          </div>
        </section>
        ${coachCard()}
        <div class="grid">
          ${c.kpi('当前跑力', f(r.curNow), '心率-配速近似估算，非实测VDOT')}
          ${c.kpi('体能', f(r.ctl[r.iT]))}
          ${c.kpi('疲劳', f(r.atl[r.iT]))}
          ${c.kpi('状况', f(t), '昨天体能 − 昨天疲劳')}
        </div>
        <blockquote>${quote.text}<small>—— ${quote.author}</small></blockquote>
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
        return row([z.code, f(samples.reduce((s, a) => s + a.movS / 60, 0))]);
      });
      return `<section class="card">
        <h3>心率区间时长（按整段平均心率归区，非逐秒）</h3>
        ${table(['心率区', '分钟'], rows)}
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
          return a ? `${a.day} ${RW.fmtT(a.elapsedS || a.timeS || a.movS)} ${a.confirmed ? '★' : ''}` : '—';
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
        const value = a ? (k === 'fastest' ? RW.fmtPace(a.movS / a.km) : f(a[k === 'longest' ? 'km' : k === 'climb' ? 'asc' : 'load'])) : '—';
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
        g.key, f(g.vdot), `${f(g.km)} / ${g.count}`, RW.fmtPace(g.pace),
        g.load === null ? '—（含未知）' : f(g.load), RW.fmtT(g.movS),
        f(g.hr), f(g.asc), f(g.cad), f(g.stride)
      ]));
      const listRows = acts.slice().reverse().slice((rec.page - 1) * 30, rec.page * 30).map(a => row([
        `<button class="btn" data-race="${esc(raceId(a))}" aria-label="确认比赛">${c.races()[raceId(a)] === true ? '★' : '☆'}</button>`,
        `${a.day}<br>${esc(a.title)}`, f(a.km), RW.fmtPace(a.movS / a.km), RW.fmtT(a.movS)
      ]));
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
        <p>统计针对当前筛选；心率、步频、步长按已知样本时长加权；爬升含未知显示—。</p>
        ${table(['周期', '平均跑力', '公里 / 次数', '平均配速', '负荷', '时长', '心率', '爬升 m', '步频', '步长'], statsRows)}
        <details><summary>各周期个人记录</summary>${groups.map(periodRecords).join('')}</details>
        </section>
        <section class="card">
          <p>★ 只由你手动确认比赛。共 ${acts.length} 条，第 ${rec.page} 页。</p>
          <div class="rec-list">${table(['比赛', '日期 / 标题', '距离', '配速', '用时'], listRows)}</div>
          <button id="prevRecords" class="btn">上一页</button>
          <button id="nextRecords" class="btn">下一页</button>
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
      const cells = Array.from({ length: days }, (_, n) => {
        const d = RW.addDays(first, n), km = (R()?.segs || []).filter(a => a.day === d).reduce((s, a) => s + a.km, 0);
        return `<button data-jdate="${d}" class="day ${d === journalDate ? 'selected' : ''}">${n + 1}<small>${f(km)}km</small><small>${journal.entries.some(e => e.date === d) ? '● 日志' : '—'}</small></button>`;
      }).join('');
      return `${trainingNav()}<h2>每日日志</h2>
        <section class="card">
          <label>月份 <input id="journalMonth" type="month" value="${month}"></label>
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
          <button id="journalExport" class="btn">导出日志 JSON</button>
          <label>导入替换（256KB）<input id="journalImport" type="file" accept=".json,application/json"></label>
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
    for (const [path, old, nav] of [['training/plan', 'planner', trainingNav], ['tools/calc', 'predict', toolsNav], ['tools/settings', 'settings', toolsNav]]) {
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
