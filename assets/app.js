/* RW v2：静态训练控制台，持久化仅当前浏览器。 */
(function() {
    'use strict';
    const $ = s => document.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));
    const f = n => Number.isFinite(n) ? n.toFixed(1) : '—';
    const read = (k, d) => {
        try {
            return JSON.parse(localStorage.getItem(k)) || d;
        } catch (_) {
            return d;
        }
    };
    const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    let recordQuery = '', recordMonth = '', recordLimit = 60;
    let taperPct = 60, taperRest = 1;
    let settings = {
        ...RW.DEFAULTS,
        ...read('rw.settings', {}),
        calib: 0,
        calibOn: false,
        today: null
    };
    // v2非默认静息心率迁移为手动值，默认48仍视为假设。
    if (settings.restHrManual == null) settings.restHrManual = settings.restHr != null && settings.restHr !== 48;
    let raceOverrides = read('rw.races', {}),
        R, charts = [],
        plan, planError = '',
        editing = null,
        draft = null;
    try {
        plan = RWPlan.load();
    } catch (e) {
        plan = {
            version: 1,
            items: []
        };
        planError = e.message + '；未覆盖原存储，请导入有效备份。';
    }

    function dataset() {
        return read('rw.activities', null) || window.RW_DATA || {
            activities: [],
            meta: {}
        };
    }

    function recompute() {
        R = RW.analyze(dataset().activities || [], views ? views.effectiveSettings() : settings, raceOverrides);
        $('#dataMeta').textContent = `上海日期 ${RW.shanghaiToday()} · ${R ? R.segs.length : 0} 条有效记录 · 仅本机`;
    }
    const note = '<p class="note">来源：Daniels 成绩等效公式与 RW 平均值计点；负荷不是 TRIMP，无性别系数，不代表 RQ 公式。RQ 各版本不同，阈值不可套用。所有数值仅作参考。</p>';
    const field = (name, label, value = '', type = 'text', extra = '') => `<label class="f">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const options = (list, value) => list.map(x => `<option ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const table = (heads, rows) => `<div class="scroll"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    const kpi = (label, value, detail = '') => `<section class="card kpi c3"><div class="lab">${label}</div><div class="val">${value}</div><div class="det">${detail}</div></section>`;

    function download(name, value) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {
            type: 'application/json'
        }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function chart(id, labels, sets) {
        if (!window.Chart || !$('#' + id)) return;
        charts.push(new Chart($('#' + id), {
            type: 'line',
            data: {
                labels,
                datasets: sets.map((s, i) => ({
                    label: s[0],
                    data: s[1],
                    borderColor: ['#c4f45d', '#5cbcff', '#ff9676'][i],
                    backgroundColor: '#c4f45d55',
                    pointRadius: 0,
                    borderWidth: 2,
                    spanGaps: false
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#aebac9'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#8393a8',
                            maxTicksLimit: 8
                        },
                        grid: {
                            color: '#ffffff08'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#8393a8'
                        },
                        grid: {
                            color: '#ffffff08'
                        }
                    }
                }
            }
        }));
    }
    const pages = {};

    function quality() {
        const last = R.segs[R.segs.length - 1].day,
            age = RW.diffDays(R.today, last);
        return `<div class="callout ${age > 3 || R.unknownDays.length ? 'warn' : ''}"><b>数据${age > 3 ? '待更新' : '新鲜度'} · 最近 ${last}（${age} 天前）</b><br>${R.unknownDays.length ? `有 ${R.unknownDays.length} 个未知负荷日；图中保留空值，体能/疲劳将被低估；两者差值的偏差方向不确定。` : '平均值估算，休息日按无活动记录计 0，不等于已确认休息。'} ${R.maxHr == null ? '缺少最大心率基准，请在设置中核对；不会默认使用185造负荷。' : ''} ${R.filteredCount ? `已过滤 ${R.filteredCount} 条未来或非法记录。` : ''}<details><summary>数据质量说明</summary>未知日期：${R.unknownDays.join('、') || '无'}。默认静息心率为假设值；平均值无法还原间歇分段强度。历史起点前负荷未知，42/7 序列从 0 开始。</details></div>`;
    }
    pages.overview = () => {
        const i = R.iT,
            band = RW.tsbBand(R.tsb[i]);
        return `<div class="eyebrow">个人训练控制台 · v2</div><div class="page-title"><h2>把训练与恢复放在一起看</h2><a class="btn pri" href="#planner">打开训练课表 →</a></div>
    <div class="grid"><section class="card hl c12"><div class="hero"><div><div class="race">下一场 · ${esc(settings.raceName)}</div><div class="count">${RW.validDate(settings.raceDate) ? (RW.diffDays(settings.raceDate, R.today) < 0 ? '已结束' : RW.diffDays(settings.raceDate, R.today)) : '—'}<small>${RW.diffDays(settings.raceDate, R.today) >= 0 ? '天后开跑' : ''}</small></div></div><div class="goal"><div><span>比赛日期</span><b>${esc(settings.raceDate)}</b></div><div><span>用户目标 · 非达标承诺</span><b>${esc(settings.goal)}</b></div></div><a class="btn" href="#settings">调整目标</a></div></section><div class="c12">${quality()}</div>
    ${kpi('今日状况 · RW 参考区', f(R.tsb[i]), band.label)}${kpi('体能 · 42 天', f(R.ctl[i]), '今日已录入活动后的估算 · 初值 0')}${kpi('疲劳 · 7 天', f(R.atl[i]), '今日已录入活动后的估算 · 初值 0')}${kpi('当前跑力估算', f(R.curNow), '非实验室 VO2max，非成绩预测')}
    <section class="card c8"><h3>负荷与恢复趋势</h3><div class="chart"><canvas id="overviewChart"></canvas></div><p class="note">今天状况使用昨天体能减昨天疲劳。${band.tip}</p></section><section class="card c4"><h3>今天练什么，由你确认</h3><p class="lead">计划与真实记录分开。不会根据 GPS 自动完成训练。</p>${plan.items.filter(x => x.date === R.today).map(x => `<div class="today-plan"><b>${esc(x.type)} · ${f(x.km)} 公里</b><p>${esc(x.structure || '结构待填写')}</p><span class="pill">${esc(x.status)}</span></div>`).join('') || '<p class="empty">今天还没有课表，可新建或导入；不自动补课。</p>'}<a class="btn pri" href="#planner">新建课表 / 查看本周</a><p><a href="#predict">成绩换算与马拉松分段 →</a></p>${note}</section></div>`;
    };
    pages.overview.after = () => chart('overviewChart', R.days.slice(-90), [
        ['体能', R.ctl.slice(-90)],
        ['疲劳', R.atl.slice(-90)],
        ['状况', R.tsb.slice(-90)]
    ]);
    pages.load = () => `<h2>训练负荷</h2><p class="lead">RW 平均值计点 × 移动分钟；42/7 日 EWMA 从 0 开始。阈值仅提示，不诊断过度训练。</p>${quality()}<section class="card"><h3>每日负荷 · 未知保留空值</h3><div class="chart"><canvas id="loadChart"></canvas></div></section><section class="card"><h3>体能 / 疲劳 / 前一天差值</h3><div class="chart"><canvas id="stateChart"></canvas></div>${note}</section>${taperPanel()}`;
    pages.load.after = () => {
        chart('loadChart', R.days.slice(-180), [
            ['负荷', R.load.slice(-180)]
        ]);
        chart('stateChart', R.days.slice(-180), [
            ['体能', R.ctl.slice(-180)],
            ['疲劳', R.atl.slice(-180)],
            ['状况', R.tsb.slice(-180)]
        ]);
        bindTaper();
    };
    // 场景模拟不是训练处方，不自动求解目标状况，避免围着数值追负荷。
    function taperScenario() {
        const n = RW.diffDays(settings.raceDate, R.today);
        if (!(n > 0 && n <= 180)) return null;
        const base = R.load.slice(Math.max(0, R.iT - 27), R.iT + 1).reduce((sum, x) => sum + (Number.isFinite(x) ? x : 0), 0) / 28;
        return RW.simulateTaper(R, {
            base,
            raceDate: settings.raceDate,
            factor: () => taperPct / 100,
            restDays: taperRest
        });
    }

    function taperPanel() {
        const sim = taperScenario();
        if (!sim) return '<section class="card"><h3>减量情景模拟</h3><p class="note">设置未来180天内的比赛日期后可用。</p></section>';
        const end = sim.at(-1);
        return `<section class="card hl"><div class="row"><h3>减量情景模拟</h3><span class="pill">不写入真实记录或课表</span></div><p class="lead">从明天起，按近28天已知日均负荷的固定比例推演至比赛日早晨。未知负荷与缺失训练会影响模拟，非比赛准备度判断。</p><div class="form"><label class="f">保留的训练负荷比例<select id="taperPct">${[0,20,40,60,80,100].map(n => `<option value="${n}" ${n === taperPct ? 'selected' : ''}>${n}%</option>`).join('')}</select></label><label class="f">赛前完整休息天数<select id="taperRest">${[0,1,2,3].map(n=>`<option ${n === taperRest ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><div class="scenario-result">比赛日早晨状况 <b>${f(end.tsb)}</b><span>体能 ${f(end.ctl)} · 疲劳 ${f(end.atl)}</span></div><div class="chart"><canvas id="taperChart"></canvas></div><p class="note">训练负荷不是跑量，减量不等于按同一比例删减每一项训练。不为追求正值而完全停训；不适、疼痛或异常疲劳优先调整并咨询专业人员。</p></section>`;
    }

    function bindTaper() {
        const sim = taperScenario();
        if (!sim) return;
        chart('taperChart', sim.map(x => x.day), [
            ['体能', sim.map(x => x.ctl)],
            ['疲劳', sim.map(x => x.atl)],
            ['状况', sim.map(x => x.tsb)]
        ]);
        $('#taperPct').onchange = e => {
            taperPct = +e.target.value;
            route();
        };
        $('#taperRest').onchange = e => {
            taperRest = +e.target.value;
            route();
        };
    }
    pages.vdot = () => `<h2>跑力趋势</h2><p class="lead">稳定跑的平均心率与配速近似，非实验室测量。只有手动确认的比赛参与比赛权重；无任何校准偏移。</p><section class="card"><div class="chart tall"><canvas id="vdotChart"></canvas></div>${note}</section><section class="card"><h3>手动确认比赛</h3>${table(['日期', '标题', '竞赛用时', 'VDOT'], R.sessions.filter(x => x.isRace).map(x => row([x.day, esc(x.title), RW.fmtT(x.main.elapsedS || x.main.timeS || x.main.movS), f(x.raceVdot)])))}</section>`;
    pages.vdot.after = () => chart('vdotChart', R.days.slice(-365), [
        ['跑力估算', R.cur.slice(-365)]
    ]);
    pages.volume = () => {
        const years = [...new Set(R.monthList.map(m => m.month.slice(0, 4)))].reverse();
        return `<h2>跑量档案</h2><p class="lead">真实活动记录；月度按年分组，周统计按周一开始。</p><section class="card"><h3>近 26 周</h3><div class="chart"><canvas id="volumeChart"></canvas></div></section><div class="grid">${years.map(y => `<section class="card c6"><h3>${y}年</h3>${table(['月份', '公里', '次数', '最长', '负荷'], R.monthList.filter(m => m.month.startsWith(y)).reverse().map(m => row([`${+m.month.slice(5)}月`, f(m.km), m.n, f(m.longest), f(m.load)])))}</section>`).join('')}</div>`;
    };
    pages.volume.after = () => {
        const w = R.weekList.slice(-26);
        chart('volumeChart', w.map(x => x.week), [
            ['实际公里', w.map(x => x.km)]
        ]);
    };
    pages.zones = () => `<h2>平均强度区间</h2><p class="lead">每段平均值整体归区，不是逐秒区间；未知负荷单独提示。</p><section class="card">${table(['区间', '平均值归区分钟', 'RW 计点'], RW.ZONES.map(z => { const s = R.segs.filter(s => s.zone != null && Math.floor(s.zone) === z.z); return row([`${z.code} · ${z.name}`, f(s.reduce((n, x) => n + x.movS / 60, 0)), f(s.reduce((n, x) => n + x.load, 0))]); }))}<p class="note">未知负荷 ${R.segs.filter(s => s.load == null).length} 段；未计入上表。1 区以下另计 0.1 点/分钟。</p>${note}</section>`;
    pages.paces = () => `<h2>配速参考</h2><p class="lead">基于当前估算跑力 ${f(R.curNow)}；不替代个体训练处方。</p><section class="card">${table(['区间', '配速 /公里', '储备心率范围'], RW.ZONES.map(z => row([`${z.code} · ${z.name}`, `${RW.fmtPace(RW.paceAt(R.curNow, z.lo))}–${RW.fmtPace(RW.paceAt(R.curNow, z.hi))}`, z.z <= 5 && R.maxHr > R.restHr ? `${Math.round(R.restHr + z.lo * (R.maxHr - R.restHr))}–${Math.round(R.restHr + z.hi * (R.maxHr - R.restHr))}` : '无心率参考']))) }${note}</section>`;
    pages.predict = () => `<h2>跑步计算器</h2><p class="lead">独立输入，和活动估算跑力、目标设置互不绑定。</p><div class="grid"><section class="card c12"><h3>成绩等效换算</h3><form id="equivForm" class="form"><label class="f">输入模式<select name="mode"><option value="race">比赛成绩（默认 5公里 23:00）</option><option value="vdot">明确输入 VDOT</option><option value="vo2max">VO2max（默认 62）</option></select></label><label class="f">换算方法<select name="method"><option value="daniels">Daniels VDOT</option><option value="riegel">Riegel 幂律</option></select></label>${field('km', '原成绩距离（公里）', 5, 'number', 'step="any"')}${field('time', '原成绩时间', '23:00')}${field('value', 'VDOT / VO2max 输入值', 62, 'number', 'step="any"')}${field('exponent', 'Riegel 指数（1.03–1.15）', 1.06, 'number', 'min="1.03" max="1.15" step="0.01"')}<label class="check"><input name="assume" type="checkbox">仅 VO2max 模式：假设 VDOT 等于输入值</label><button class="btn pri">计算换算</button></form><div id="equivOut" aria-live="polite"></div></section><section class="card c12"><h3>马拉松 · 成绩 ↔ 配速</h3><form id="marathonForm" class="form"><label class="f">以哪个输入计算<select name="source"><option value="time">成绩 → 配速</option><option value="pace">配速 → 成绩</option></select></label>${field('time', '成绩（分:秒 / 时:分:秒）', '3:30:00')}${field('pace', '每公里配速（分:秒）', '4:59')}<button class="btn pri">计算并更新另一项</button></form><div id="marathonOut" aria-live="polite"></div><p class="note">42.195 公里匀速累计分段，不含补给停留与赛道误差。</p></section></div>`;
    pages.predict.after = () => {
        const eq = $('#equivForm'),
            mf = $('#marathonForm');

        function equivalent(e) {
            e?.preventDefault();
            const d = new FormData(eq);
            try {
                const result = RWCalc.equivalent({
                    mode: d.get('mode'),
                    method: d.get('method'),
                    meters: Number(d.get('km')) * 1000,
                    seconds: RW.parseHMS(d.get('time')),
                    value: Number(d.get('value')),
                    exponent: Number(d.get('exponent')),
                    assume: d.has('assume')
                });
                $('#equivOut').innerHTML = `<p class="callout">${result.message}${result.vdot && !result.theoretical ? ' VDOT：' + f(result.vdot) : ''}</p>${result.rows.length ? table(['距离', result.theoretical ? '整分钟理论参考（非预测）' : '等效成绩', '配速 /公里'], result.rows.map(x => row([x.name, result.theoretical ? Math.round(x.seconds / 60) + ' 分钟' : RW.fmtT(x.seconds), RW.fmtPace(x.pace)]))) : ''}`;
            } catch (err) {
                $('#equivOut').textContent = err.message;
            }
        }
        eq.onsubmit = equivalent;

        function modeFields() {
            const mode = eq.elements.mode.value,
                race = mode === 'race';
            ['km', 'time', 'method'].forEach(n => eq.elements[n].closest('label').hidden = !race);
            eq.elements.value.closest('label').hidden = race;
            eq.elements.assume.closest('label').hidden = mode !== 'vo2max';
            eq.elements.exponent.closest('label').hidden = !(race && eq.elements.method.value === 'riegel');
        }
        eq.elements.mode.onchange = () => {
            eq.elements.assume.checked = false;
            if (eq.elements.mode.value === 'vo2max') eq.elements.value.value = '62';
            modeFields();
            equivalent();
        };
        eq.elements.method.onchange = () => {
            modeFields();
            equivalent();
        };
        modeFields();

        function marathon(e) {
            e?.preventDefault();
            const d = new FormData(mf);
            try {
                const result = RWCalc.marathon({
                    source: d.get('source'),
                    seconds: RW.parseHMS(d.get('time')),
                    pace: RW.parseHMS(d.get('pace'))
                });
                if (d.get('source') === 'time') mf.elements.pace.value = RW.fmtPace(result.pace);
                else mf.elements.time.value = RW.fmtT(result.seconds);
                $('#marathonOut').innerHTML = `<p class="callout">成绩 ${RW.fmtT(result.seconds)} · 配速 ${RW.fmtPace(result.pace)}/公里</p>${table(['检查点', '累计时间'], result.splits.map(x => row([x.name, RW.fmtT(x.seconds)])))}`;
            } catch (err) {
                $('#marathonOut').textContent = err.message;
            }
        }
        mf.onsubmit = marathon;
        equivalent();
        marathon();
    };

    function recordMatches() {
        return R.sessions.filter(x => (!recordMonth || x.day.startsWith(recordMonth)) && (!recordQuery || (x.title + x.day).toLowerCase().includes(recordQuery.toLowerCase()))).slice().reverse();
    }

    function recordsTable() {
        const matches = recordMatches();
        return `<p class="note">${matches.length} 次训练，当前展示 ${Math.min(matches.length, recordLimit)} 次</p>${table(['日期', '标题', '公里', '移动用时', '负荷', '比赛确认'], matches.slice(0, recordLimit).map(x => row([x.day, `${esc(x.title)}${x.autoRace && !x.isRace ? '<span class="chip">比赛候选</span>' : ''}${x.load == null ? '<span class="chip">未知负荷</span>' : ''}`, f(x.km), RW.fmtT(x.movS), f(x.load), `<button class="star ${x.isRace ? 'on' : ''}" data-race="${esc(x.id)}" aria-label="切换比赛确认">★</button>`])))}${matches.length > recordLimit ? '<button class="btn" id="recordMore">再显示60次</button>' : ''}`;
    }
    pages.records = () => `<h2>真实训练记录</h2><p class="lead">★ 由你手动确认比赛；候选不会自动参与竞赛跑力。比赛用时优先全程耗时，请对照官方成绩核验。</p><section class="card"><div class="form"><label class="f">搜索标题或日期<input id="recordSearch" value="${esc(recordQuery)}" placeholder="例如 轻松 / 2026-11"></label><label class="f">月份<select id="recordMonth"><option value="">全部月份</option>${R.monthList.slice().reverse().map(m=>`<option value="${m.month}" ${recordMonth === m.month ? 'selected' : ''}>${m.month.slice(0,4)}年${+m.month.slice(5)}月</option>`).join('')}</select></label></div><div id="recordResults">${recordsTable()}</div></section>`;

    function bindRecordsTable() {
        document.querySelectorAll('[data-race]').forEach(b => b.onclick = () => {
            try {
                const x = R.sessions.find(x => x.id === b.dataset.race);
                raceOverrides[x.id] = !x.isRace;
                persist('rw.races', raceOverrides);
                recompute();
                $('#recordResults').innerHTML = recordsTable();
                bindRecordsTable();
            } catch (e) {
                alert('保存失败：' + e.message);
            }
        });
        if ($('#recordMore')) $('#recordMore').onclick = () => {
            recordLimit += 60;
            $('#recordResults').innerHTML = recordsTable();
            bindRecordsTable();
        };
    }
    pages.records.after = () => {
        const filter = () => {
            recordLimit = 60;
            $('#recordResults').innerHTML = recordsTable();
            bindRecordsTable();
        };
        $('#recordSearch').oninput = e => {
            recordQuery = e.target.value;
            filter();
        };
        $('#recordMonth').onchange = e => {
            recordMonth = e.target.value;
            filter();
        };
        bindRecordsTable();
    };
    pages.planner = () => {
        const x = editing || {
            date: RW.shanghaiToday(),
            type: '轻松跑',
            structure: '',
            km: 0,
            goal: '',
            status: '未确认',
            rpe: null,
            feedback: ''
        };
        return `<h2>训练课表</h2><p class="lead">计划 ≠ 真实记录 · 完成只由用户设置 · 仅当前浏览器，无云同步。</p><section class="card"><div class="row"><h3>${editing ? '编辑计划' : '新建计划'}</h3><button class="btn" id="generateDraft">生成赛前减量草案</button></div><p id="planMsg" role="status" class="callout">${esc(planError || '默认课表为空。请按实际情况填写；RPE 和反馈可留空。')}</p><div id="draftPreview"></div><form id="planForm" class="form">${field('date', '日期', x.date, 'date')}<label class="f">类型<select name="type">${options(RWPlan.types, x.type)}</select></label>${field('structure', '结构文字', x.structure, 'text', 'maxlength="2000"')}${field('km', '计划公里', x.km, 'number', 'min="0" max="200" step="any"')}${field('goal', '目标', x.goal, 'text', 'maxlength="2000"')}<label class="f">状态<select name="status">${options(RWPlan.statuses, x.status)}</select></label>${field('rpe', 'RPE（1–10，可空）', x.rpe ?? '', 'number', 'min="1" max="10" step="1"')}${field('feedback', '反馈', x.feedback, 'text', 'maxlength="2000"')}<button class="btn pri">${editing ? '保存修改' : '保存新计划'}</button><button type="button" class="btn" id="cancelEdit">取消编辑 / 清空表单</button></form><div class="row tools"><button class="btn" id="planExport">导出课表 JSON</button><label class="f">导入（替换课表，最大256KB）<input id="planImport" type="file" accept=".json,application/json"></label></div></section><div class="grid">${RWPlan.weeks(plan, R?.sessions || []).map(w => `<section class="card c12"><h3>${w.week} 这一周</h3><div class="week-summary">计划 ${f(w.km)} 公里 <span>真实记录 ${f(w.actualKm)} 公里</span> ${RWPlan.statuses.map(s => `${s} ${w.counts[s]}`).join(' · ')}</div>${table(['日期 / 类型', '计划公里', '结构 / 目标', '用户状态', 'RPE / 反馈', '同日实际参考', '操作'], w.items.map(x => row([`${x.date}<br>${esc(x.type)}`, f(x.km), `${esc(x.structure)}<br><small>${esc(x.goal)}</small>`, esc(x.status), `${x.rpe ?? '—'} / ${esc(x.feedback)}`, f((R?.sessions || []).filter(a => a.day === x.date).reduce((n, a) => n + a.km, 0)) + ' 公里', `<button class="btn" data-edit="${x.id}">编辑</button>`])))}</section>`).join('') || '<section class="card c12 empty">尚无计划，不编造已完成训练。</section>'}</div>`;
    };
    pages.planner.after = () => {
        const msg = text => {
            $('#planMsg').textContent = text;
        };
        const savePlan = next => {
            plan = RWPlan.save(next);
            planError = '';
        };
        $('#planForm').onsubmit = e => {
            e.preventDefault();
            try {
                const d = Object.fromEntries(new FormData(e.target));
                const item = {
                    ...d,
                    id: editing?.id || RWPlan.id(),
                    km: d.km.trim() === '' ? NaN : Number(d.km),
                    rpe: d.rpe === '' ? null : Number(d.rpe)
                };
                savePlan({
                    version: 1,
                    items: [...plan.items.filter(x => x.id !== item.id), item]
                });
                editing = null;
                route();
                msg('已保存课表，仅当前浏览器。');
            } catch (err) {
                msg('保存失败：' + err.message);
            }
        };
        $('#cancelEdit').onclick = () => {
            editing = null;
            route();
            msg('已退出编辑，原计划未变。');
        };
        document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
            editing = {
                ...plan.items.find(x => x.id === b.dataset.edit)
            };
            route();
            msg('正在编辑，修改后请保存。');
            window.scrollTo(0, 0);
        });
        $('#generateDraft').onclick = () => {
            try {
                draft = RWPlan.draft(RW.shanghaiToday(), settings.raceDate, views.baseKm(), views.paces());
                const previewRows = draft.items.map(x => row([
                    x.date, esc(x.type + ' · ' + x.structure + ' · ' + x.goal), f(x.km)
                ]));
                $('#draftPreview').innerHTML = `<div class="callout warn">
                    <h3>${esc(settings.raceName)} ${esc(settings.raceDate)} 减量期草案</h3>
                    <p>赛前 ${draft.items.length} 天，包含少量M配速和短促加速，非 2:45 达标承诺。
                    确认后追加为「未确认」，已有同日计划不重复添加。</p>
                    ${table(['日期', '类型 / 结构 / 目标配速区', '计划公里'], previewRows)}
                    <button id="confirmDraft" class="btn pri" type="button">确认并保存草案</button>
                    <button id="cancelDraft" class="btn" type="button">取消草案</button>
                </div>`;
                $('#cancelDraft').onclick = () => {
                    draft = null;
                    $('#draftPreview').innerHTML = '';
                    msg('已取消，未保存草案。');
                };
                $('#confirmDraft').onclick = () => {
                    try {
                        const dates = new Set(plan.items.map(x => x.date));
                        const fresh = draft.items.filter(x => !dates.has(x.date));
                        savePlan({
                            version: 1,
                            items: plan.items.concat(fresh)
                        });
                        draft = null;
                        route();
                        msg(`已保存 ${fresh.length} 条未确认草案。`);
                    } catch (err) {
                        msg('保存失败：' + err.message);
                    }
                };
            } catch (err) {
                msg(err.message);
            }
        };
        $('#planExport').onclick = () => {
            try {
                download('rw-plan-v1.json', RWPlan.validate(plan));
                msg('课表 JSON 已导出。');
            } catch (err) {
                msg('导出失败：' + err.message);
            }
        };
        $('#planImport').onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                if (file.size > RWPlan.MAX_BYTES) throw Error('文件超过256KB。');
                const next = RWPlan.parse(await file.text());
                if (!confirm(`将替换当前课表为 ${next.items.length} 条计划，是否继续？`)) {
                    msg('已取消导入。');
                    return;
                }
                savePlan(next);
                editing = null;
                route();
                msg(`已导入 ${plan.items.length} 条，完成状态来自文件，不由 GPS 设置。`);
            } catch (err) {
                msg('导入失败：' + err.message);
            }
        };
    };
    pages.settings = () => `<h2>本机设置</h2><p class="lead">所有持久化仅当前浏览器。没有后端，不上传数据；浏览器清理可能导致数据丢失。</p><section class="card"><h3>心率与目标</h3><form id="settingsForm" class="form">${field('restHr', '静息心率（默认48为假设）', settings.restHr, 'number')}<label><input name="restHrManual" type="checkbox" ${settings.restHrManual ? 'checked' : ''}>使用手动静息心率（勾选后覆盖日志）</label>${field('maxHr', '最大心率（空则取历史99分位）', settings.maxHr ?? '', 'number')}${field('lthr', '阈值心率（可空）', settings.lthr ?? '', 'number')}${field('raceName', '比赛名称', settings.raceName)}${field('raceDate', '比赛日期', settings.raceDate, 'date')}<label class="f">比赛距离<select name="raceDist">${[[5000, '5公里'], [10000, '10公里'], [21097.5, '半马'], [42195, '全马']].map(([v, n]) => `<option value="${v}" ${+settings.raceDist === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${field('goal', '目标时间', settings.goal)}${field('pb', '个人最佳时间', settings.pb)}<button class="btn pri">保存设置</button></form><p id="settingsMsg" role="status"></p></section><section class="card"><h3>真实记录数据</h3><p class="note">Garmin CSV 本地导入；不修改仓库原数据。可合并或替换当前浏览器副本。</p><div class="row"><input id="csvFile" type="file" accept=".csv,text/csv"><select id="csvMode"><option value="merge">合并</option><option value="replace">替换</option></select><button id="csvGo" class="btn">导入 CSV</button><button id="csvReset" class="btn">恢复内置数据</button><button id="activitiesExport" class="btn">导出活动 JSON</button></div><p id="csvMsg" role="status"></p>${note}</section>`;
    pages.settings.after = () => {
        $('#settingsForm').onsubmit = e => {
            e.preventDefault();
            try {
                const d = Object.fromEntries(new FormData(e.target));
                if (!RW.validDate(d.raceDate) || !RW.parseHMS(d.goal) || !RW.parseHMS(d.pb)) throw Error('请检查比赛日期、目标和个人最佳时间。');
                for (const k of ['restHr', 'maxHr', 'lthr', 'raceDist']) d[k] = d[k] === '' ? null : Number(d[k]);
                if (!(d.restHr >= 30 && d.restHr <= 100 && Number.isInteger(d.restHr)) || (d.maxHr != null && !(d.maxHr > d.restHr && d.maxHr <= 240)) || (d.lthr != null && !(d.lthr > d.restHr && d.lthr <= 240))) throw Error('请检查心率范围。');
                const next = {
                    ...settings,
                    ...d,
                    restHrManual: d.restHrManual === 'on',
                    calib: 0,
                    calibOn: false,
                    today: null
                };
                persist('rw.settings', next);
                settings = next;
                recompute();
                route();
                $('#settingsMsg').textContent = '设置已保存。';
            } catch (err) {
                $('#settingsMsg').textContent = '保存失败：' + err.message;
            }
        };
        $('#csvGo').onclick = async () => {
            try {
                const file = $('#csvFile').files[0];
                if (!file) throw Error('请先选择 CSV 文件。');
                if (file.size > 10 * 1024 * 1024) throw Error('CSV 不得超过10MB。');
                const imported = RW.activitiesFromCSV(await file.text());
                if (!imported.length) throw Error('未读到有效跑步记录。');
                const map = new Map(($('#csvMode').value === 'merge' ? dataset().activities : []).map(x => [x.id, x]));
                imported.forEach(x => map.set(x.id, x));
                persist('rw.activities', {
                    activities: [...map.values()],
                    meta: {
                        source: file.name
                    }
                });
                recompute();
                route();
                $('#csvMsg').textContent = `已导入 ${imported.length} 条；未来和非法记录不会参与分析。`;
            } catch (err) {
                $('#csvMsg').textContent = '导入失败：' + err.message;
            }
        };
        $('#csvReset').onclick = () => {
            try {
                localStorage.removeItem('rw.activities');
                recompute();
                route();
                $('#csvMsg').textContent = '已恢复内置记录，课表不变。';
            } catch (err) {
                $('#csvMsg').textContent = err.message;
            }
        };
        $('#activitiesExport').onclick = () => download('rw-activities.json', dataset());
    };

    const views = RWViews.install({ pages, esc, f, table, row, chart, field, kpi, download,
        result: () => R, settings: () => settings, races: () => raceOverrides, refresh: recompute, route });
    const redirects = {
        overview: 'status', load: 'analysis/fitness', volume: 'analysis/fitness', zones: 'analysis/fitness',
        vdot: 'analysis/vdot', paces: 'analysis/vdot', predict: 'tools/calc', planner: 'training/plan', settings: 'tools/settings',
        analysis: 'analysis/fitness', training: 'training/journal', tools: 'tools/calc'
    };
    function route() {
        charts.splice(0).forEach(c => c.destroy());
        let t = location.hash.slice(1) || 'status';
        t = redirects[t] || t;
        if (!pages[t]) t = 'status';
        if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
        document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === t.split('/')[0]));
        if (!R && !['tools/settings', 'training/plan', 'training/journal', 'tools/calc'].includes(t)) {
            $('#app').innerHTML = '<section class="card"><h2>还没有有效活动</h2><p>未来或非法日期记录不参与分析。仍可使用计算器、课表与设置。</p><a href="#settings">导入数据</a> · <a href="#planner">训练课表</a> · <a href="#predict">计算器</a></section>';
            return;
        }
        $('#app').innerHTML = pages[t]();
        pages[t].after?.();
    }
    window.addEventListener('hashchange', () => {
        route();
        window.scrollTo(0, 0);
    });
    recompute();
    route();
})();