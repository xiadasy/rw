/* RW 计算引擎：Daniels 成绩等效公式与 RW 自定的平均值计点。
 * 负荷不是 TRIMP，无性别系数，不是 RQ 官方算法；RQ 各版本不同不可套用。
 * 42/7 日 EWMA 从 0 开始；未知负荷按 0 更新只是数据不完整下界。 */
(function (G) {
  'use strict';

  // ---------- CSV 解析与标准化（与 scripts/build_data.py 一致） ----------
  const ALIASES = {
    type: ['活动类型', 'Activity Type'], start: ['日期', 'Date'], title: ['标题', 'Title'],
    km: ['距离', 'Distance'], cal: ['热量消耗', 'Calories'], time: ['时间', 'Time'],
    hr: ['平均心率', 'Avg HR'], maxHr: ['最大心率', 'Max HR'], te: ['有氧效果', 'Aerobic TE'],
    cad: ['平均步频', 'Avg Run Cadence'], pace: ['平均配速', 'Avg Pace'], bestPace: ['最佳配速', 'Best Pace'],
    asc: ['累计爬升', 'Total Ascent'], desc: ['累计下降', 'Total Descent'], stride: ['平均步长', 'Avg Stride Length'],
    gct: ['平均触地时间', 'Avg Ground Contact Time'], gap: ['平均坡度调整配速', 'Avg GAP'],
    tss: ['Training Stress Score®'], power: ['平均功率', 'Avg Power'], laps: ['圈数', 'Number of Laps'],
    moving: ['移动时间', 'Moving Time'], elapsed: ['全程耗时', 'Elapsed Time']
  };

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
  }
  function num(v) {
    if (v == null) return null;
    const s = String(v).trim().replace(/[,'"]/g, '');
    if (s === '' || s === '--' || s === '-') return null;
    const x = Number(s); return Number.isFinite(x) ? x : null;
  }
  function dur(v) {
    if (v == null) return null;
    const s = String(v).trim(); if (s === '' || s === '--') return null;
    if (!/^\d+(?::\d{1,2})?:\d{2}(?:\.\d+)?$/.test(s)) return null;
    const p = s.split(':').map(Number);
    if (p[p.length - 1] >= 60 || (p.length === 3 && p[1] >= 60)) return null;
    const seconds = p.reduce((t, x) => t * 60 + x, 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  function pick(r, k) { for (const n of ALIASES[k]) if (n in r) return r[n]; return null; }
  function normalizeRow(r) {
    const type = String(pick(r, 'type') || '').trim();
    if (!/跑|run/i.test(type)) return null;
    const start = String(pick(r, 'start') || '').trim(); if (!validDate(start.slice(0, 10))) return null;
    const km = num(pick(r, 'km')); if (!km || km <= 0) return null;
    const timeS = dur(pick(r, 'time')); const movS = dur(pick(r, 'moving')) || timeS;
    if (!movS) return null;
    return {
      id: start, type, start, day: start.slice(0, 10), title: String(pick(r, 'title') || '').trim(),
      km: Math.round(km * 1000) / 1000, timeS, movS, elapsedS: dur(pick(r, 'elapsed')) || timeS,
      hr: num(pick(r, 'hr')), maxHr: num(pick(r, 'maxHr')), te: num(pick(r, 'te')), cad: num(pick(r, 'cad')),
      paceS: dur(pick(r, 'pace')), bestPaceS: dur(pick(r, 'bestPace')), asc: num(pick(r, 'asc')), desc: num(pick(r, 'desc')),
      stride: num(pick(r, 'stride')), gct: num(pick(r, 'gct')), gapS: dur(pick(r, 'gap')), tss: num(pick(r, 'tss')),
      power: num(pick(r, 'power')), laps: num(pick(r, 'laps')), cal: num(pick(r, 'cal'))
    };
  }
  function activitiesFromCSV(text) {
    const seen = new Set(); const out = [];
    parseCSV(text).map(normalizeRow).filter(Boolean).sort((a, b) => a.start < b.start ? -1 : 1)
      .forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); out.push(a); } });
    return out;
  }

  // ---------- 日期工具 ----------
  const DAY = 86400000;
  function validDate(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || +d.slice(0, 4) < 100) return false;
    const ms = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === d;
  }
  function shanghaiToday(now = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  const toMs = d => validDate(d) ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : NaN;
  const fromMs = ms => new Date(ms).toISOString().slice(0, 10);
  const addDays = (d, n) => fromMs(toMs(d) + n * DAY);
  const diffDays = (a, b) => Math.round((toMs(a) - toMs(b)) / DAY);
  const tsMs = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0, +s.slice(17, 19) || 0);
  function mondayOf(d) { const wd = (new Date(toMs(d)).getUTCDay() + 6) % 7; return addDays(d, -wd); }

  // ---------- Daniels 跑力公式 ----------
  const vo2 = v => -4.6 + 0.182258 * v + 0.000104 * v * v;           // v: 米/分钟
  const pctMax = t => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t: 分钟
  const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
  const vdot = (m, s) => {
    if (!positive(m) || !positive(s)) return null;
    const t = s / 60, v = vo2(m / t) / pctMax(t);
    return positive(v) ? v : null;
  };
  function raceTime(V, m) {
    if (!positive(V) || !positive(m)) return null;
    let lo = 0.001, hi = 600000;
    if ((vdot(m, lo) || 0) < V) return null;
    for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if ((vdot(m, mid) || 0) > V) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function velAt(V, f) { const c = 4.6 + f * V; return (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * c)) / (2 * 0.000104); }
  const paceAt = (V, f) => positive(V) && positive(f) ? 60000 / velAt(V, f) : null; // 秒/公里

  // 区间（RQ 公开的储备心率百分比；配速区间用相同的 %VO2max 边界，R 区为 RW 自定）
  const ZONES = [
    { z: 1, code: 'E', name: '有氧耐力', lo: 0.59, hi: 0.74, pts: 0.2 },
    { z: 2, code: 'M', name: '马拉松', lo: 0.74, hi: 0.84, pts: 0.4 },
    { z: 3, code: 'T', name: '乳酸阈值', lo: 0.84, hi: 0.88, pts: 0.6 },
    { z: 4, code: 'A', name: '无氧耐力', lo: 0.88, hi: 0.95, pts: 0.8 },
    { z: 5, code: 'I', name: '最大摄氧', lo: 0.95, hi: 1.00, pts: 1.0 },
    { z: 6, code: 'R', name: '速度经济', lo: 1.05, hi: 1.15, pts: 1.5 }
  ];
  function zoneDecimal(f) {               // 区间小数：2.4 ≈ 2 区内 40% 处
    if (f == null || !Number.isFinite(f)) return null;
    if (f < 0.59) return Math.max(0, f / 0.59);
    for (const Z of ZONES.slice(0, 5)) if (f < Z.hi) return Z.z + (f - Z.lo) / (Z.hi - Z.lo);
    return Math.min(6.99, 6 + (f - 1.0) / 0.15);
  }
  function pointsPerMin(zd) {              // Daniels 计点：E0.2 M0.4 T0.6 I1.0 R1.5；A0.8 与 <1 区 0.1 为 RW 自定
    if (zd == null) return 0;
    const z = Math.floor(zd); if (z < 1) return 0.1;
    return [0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.5][Math.min(z, 6)];
  }

  // ---------- 设置 ----------
  const DEFAULTS = {
    restHr: 48, maxHr: null, lthr: null, raceName: '上海马拉松', raceDate: '2026-12-06', raceDist: 42195,
    goal: '2:45:00', pb: '2:38:07', calib: 0, calibOn: false, today: null
  };
  const parseHMS = dur;

  // RW 平均值计点的日负荷；未知按 0 更新，体能/疲劳为已知负荷下界；两者差值并不是下界。
  function loadSeries(load) {
    const ctl = [], atl = [], tsb = [], unknownDays = [];
    let c = 0, a = 0;
    load.forEach((v, i) => {
      tsb.push(c - a);
      const known = typeof v === 'number' && Number.isFinite(v) && v >= 0;
      if (!known) unknownDays.push(i);
      const L = known ? v : 0;
      c += (L - c) / 42; a += (L - a) / 7;
      ctl.push(c); atl.push(a);
    });
    return { ctl, atl, tsb, unknownDays, quality: unknownDays.length ? 'incomplete-lower-bound' : 'average-estimate' };
  }

  // ---------- 数据质量 ----------
  const INTERVAL_RE = /(\d+\s*[x×X＊*]\s*\d+)|间歇|间隔|组|配速跑|法特莱克|fartlek|interval/i;
  function qualityFlags(a, maxHr, restHr) {
    const f = []; let exclude = false;
    const pace = a.movS / a.km;
    if (/跑步机|室内|treadmill|indoor/i.test(a.type)) f.push({ k: 'treadmill', t: '跑步机：配速来自脚步估算，不计跑力' });
    if (/越野|trail/i.test(a.type)) f.push({ k: 'trail', t: '越野：坡度大，不计跑力' });
    if (a.hr == null) f.push({ k: 'nohr', t: '没有心率：仅有可信配速基准时估算，否则负荷未知' });
    else if (a.hr < 90) { f.push({ k: 'lowhr', t: '平均心率过低：疑似步行或心率带脱落' }); exclude = true; }
    if (pace < 170) { f.push({ k: 'gps', t: '配速快于 2:50/km：GPS 误差' }); exclude = true; }
    else if (pace > 540 && a.km >= 0.5) { f.push({ k: 'slow', t: '配速慢于 9:00/km：疑似步行或暂停未停表' }); exclude = true; }
    if (!exclude && a.hr != null && a.hr >= 90 && maxHr > restHr) {
      const hrr = (a.hr - restHr) / (maxHr - restHr);
      const v = a.km * 1000 / (a.movS / 60);
      const est = hrr > 0 ? vo2(v) / hrr : 999;
      if (est > 85 || vdot(a.km * 1000, a.movS) > 85) { f.push({ k: 'mismatch', t: '心率与配速明显不符：疑似 GPS 漂移或心率异常' }); exclude = true; }
    }
    if (a.km < 3) f.push({ k: 'short', t: '不足 3 公里：多为热身或放松段' });
    return { flags: f, exclude };
  }

  // ---------- 主分析 ----------
  function analyze(rawActs, userSettings, raceOverrides) {
    const S = Object.assign({}, DEFAULTS, userSettings || {});
    S.calib = 0; S.calibOn = false;
    const today = validDate(S.today) ? S.today : shanghaiToday();
    const acts = rawActs.filter(a => validDate(a.day) && a.day <= today && positive(a.km) && positive(a.movS) && typeof a.start === 'string' && a.start.slice(0, 10) === a.day).slice().sort((a, b) => a.start < b.start ? -1 : 1);
    if (!acts.length) return null;
    // 最大心率默认值：记录中最大心率的 99 分位（避开偶发尖峰），并列出前十名供核对
    const mx = acts.map(a => a.maxHr).filter(x => Number.isFinite(x) && x >= 100 && x <= 240).sort((a, b) => a - b);
    const p99 = mx.length ? mx[Math.min(mx.length - 1, Math.floor(mx.length * 0.99))] : null;
    const maxHr = +S.maxHr || p99; const restHr = +S.restHr || 48;
    const lthr = +S.lthr || (maxHr > restHr ? Math.round(restHr + 0.88 * (maxHr - restHr)) : null);
    const topMax = acts.filter(a => a.maxHr).sort((a, b) => b.maxHr - a.maxHr).slice(0, 10).map(a => ({ day: a.day, maxHr: a.maxHr, title: a.title, km: a.km }));
    const hrrOf = hr => !Number.isFinite(hr) || maxHr == null || maxHr <= restHr ? null : (hr - restHr) / (maxHr - restHr);

    // 1. 单段基础量 + 数据质量
    const segs = acts.map(a => {
      const q = qualityFlags(a, maxHr, restHr);
      const paceS = a.movS / a.km;
      const gap = a.gapS && a.gapS > 150 && a.gapS < 900 ? a.gapS : paceS;
      const hrr = hrrOf(a.hr);
      const interval = INTERVAL_RE.test(a.title) || (a.bestPaceS && a.bestPaceS < paceS * 0.72 && a.km >= 5);
      const climb = a.asc != null && a.km > 0 ? a.asc / a.km : 0;
      return Object.assign({}, a, { paceS, gapPace: gap, hrr, interval, climb, flags: q.flags, exclude: q.exclude,
        pvdot: q.exclude || a.km < 1 ? null : vdot(a.km * 1000, a.movS) });
    });

    // 2. 合并同一次训练的热身 / 主课 / 放松段：同一天，且下一段在上一段结束后 30 分钟内开始
    const sessions = [];
    segs.forEach(s => {
      const last = sessions[sessions.length - 1];
      const st = tsMs(s.start);
      if (last && last.day === s.day && st - last._end <= 30 * 60000) {
        last.segs.push(s); last._end = Math.max(last._end, st + (s.elapsedS || s.movS) * 1000);
      } else sessions.push({ id: s.id, day: s.day, start: s.start, segs: [s], _end: st + (s.elapsedS || s.movS) * 1000 });
    });
    sessions.forEach(x => {
      const ss = x.segs; const main = ss.reduce((m, s) => s.km > m.km ? s : m, ss[0]);
      x.main = main; x.title = main.title || ss.find(s => s.title)?.title || '跑步';
      x.km = ss.reduce((t, s) => t + s.km, 0); x.movS = ss.reduce((t, s) => t + s.movS, 0);
      const hrT = ss.filter(s => s.hr != null).reduce((t, s) => t + s.movS, 0);
      x.hr = hrT ? ss.filter(s => s.hr != null).reduce((t, s) => t + s.hr * s.movS, 0) / hrT : null;
      x.maxHr = Math.max(...ss.map(s => s.maxHr || 0)) || null;
      x.asc = ss.reduce((t, s) => t + (s.asc || 0), 0); x.paceS = x.movS / x.km;
      x.treadmill = ss.some(s => s.flags.some(f => f.k === 'treadmill'));
      x.exclude = main.exclude; x.flags = main.flags; x.interval = main.interval; x.nSeg = ss.length;
      x.cad = main.cad; x.te = Math.max(...ss.map(s => s.te || 0)) || null;
    });

    // 3. 即时跑力（逐次）：VO2(坡度调整配速) ÷ 储备心率%，只取稳定、中低强度的记录
    segs.forEach(s => {
      s.ivdot = null; s.ivReason = '';
      const bad = s.exclude || s.flags.some(f => f.k === 'treadmill' || f.k === 'trail' || f.k === 'nohr');
      if (bad) { s.ivReason = '数据不适用'; return; }
      if (s.movS < 15 * 60) { s.ivReason = '不足 15 分钟'; return; }
      if (s.interval) { s.ivReason = '间歇或变速课'; return; }
      if (s.climb > 20) { s.ivReason = '爬升过大'; return; }
      if (s.hrr == null) { s.ivReason = '缺少可信心率基准'; return; }
      if (s.hrr < 0.59 || s.hrr > 0.88) { s.ivReason = s.hrr < 0.59 ? '强度低于 1 区' : '强度高于 4 区，心率失去线性'; return; }
      const v = 60000 / s.gapPace; s.ivdot = vo2(v) / s.hrr;
    });

    // 4. 比赛识别：主段接近标准距离且平均心率 ≥ 85% HRR，可在记录页手动改
    const BANDS = [[3, 2.95, 3.15, '3K'], [5, 4.9, 5.25, '5K'], [10, 9.85, 10.4, '10K'], [21.0975, 20.9, 21.9, '半马'], [42.195, 41.9, 43.3, '全马']];
    sessions.forEach(x => {
      const m = x.main; const band = BANDS.find(b => m.km >= b[1] && m.km <= b[2]);
      x.raceDist = band ? band[3] : null;
      x.autoRace = !!band && !m.exclude && m.hrr != null && m.hrr >= 0.85 && !x.treadmill;
      const ov = raceOverrides ? raceOverrides[x.id] : undefined;
      x.isRace = ov === true;
      // 比赛按标准距离计算（GPS 多出的距离不算），不在标准距离就按实测距离
      x.raceVdot = x.isRace && !m.exclude ? vdot((band ? band[0] : m.km) * 1000, m.elapsedS || m.timeS || m.movS) : null;
    });

    // 5. 日序列
    const first = acts[0].day;
    // today 已按上海时区确定，未来记录已过滤。
    const lastDay = today > acts[acts.length - 1].day ? today : acts[acts.length - 1].day;
    const nDays = diffDays(lastDay, first) + 1;
    const days = Array.from({ length: nDays }, (_, i) => addDays(first, i));
    const idx = {}; days.forEach((d, i) => { idx[d] = i; });

    const ivByDay = Array.from({ length: nDays }, () => []);
    segs.forEach(s => { if (s.ivdot) ivByDay[idx[s.day]].push(s.ivdot); });
    const raceByDay = Array.from({ length: nDays }, () => []);
    sessions.forEach(x => { if (x.raceVdot) raceByDay[idx[x.day]].push(x.raceVdot); });

    // 当前跑力：42 天内即时跑力加权平均（今天权重 1，42 天前 0.5），比赛权重 ×3；停练衰退
    const calib = 0;
    const cur = new Array(nDays).fill(null); let lastVal = null, lastIdx = -1;
    for (let i = 0; i < nDays; i++) {
      let sw = 0, sv = 0, n = 0;
      for (let j = Math.max(0, i - 41); j <= i; j++) {
        const w = 1 - 0.5 * (i - j) / 42;
        ivByDay[j].forEach(v => { sw += w; sv += w * v; n++; });
        raceByDay[j].forEach(v => { sw += 3 * w; sv += 3 * w * v; n++; });
      }
      if (n >= 3 || (n > 0 && lastVal == null)) { lastVal = sv / sw; lastIdx = i; cur[i] = lastVal + calib; }
      else if (lastVal != null) {
        const gap = i - lastIdx; let dec = 0;
        if (gap > 14 && gap <= 28) dec = 0.06 * (gap - 14) / 14;
        else if (gap > 28) dec = Math.min(0.25, 0.06 + 0.13 * (gap - 28) / 35);
        const recent = n > 0 ? sv / sw : lastVal;
        cur[i] = (n > 0 ? recent : lastVal * (1 - dec)) + calib;
      }
    }
    const curAt = i => { for (let k = i; k >= 0; k--) if (cur[k] != null) return cur[k]; return null; };

    // 6. 训练指数（单段）：每分钟计点 × 分钟；强度取心率强度与配速强度较高者
    segs.forEach(s => {
      const i = idx[s.day]; const V = curAt(i - 1) || curAt(i);
      const fHr = Number.isFinite(s.hrr) && s.hr >= 90 && s.hr <= maxHr && maxHr > restHr ? s.hrr : null;
      const usePace = !s.exclude && !s.flags.some(f => f.k === 'treadmill');
      const fPace = usePace && positive(V) && positive(s.gapPace) ? vo2(60000 / s.gapPace) / V : null;
      let f, by;
      if (fHr == null && fPace == null) { f = null; by = 'unknown'; }
      else if (fPace != null && (fHr == null || fPace > fHr)) { f = fPace; by = '配速'; }
      else { f = fHr; by = '心率'; }
      s.intensity = f; s.zone = zoneDecimal(f); s.loadBy = by;
      s.hrZone = fHr != null ? zoneDecimal(fHr) : null; s.paceZone = fPace != null ? zoneDecimal(fPace) : null;
      s.load = f == null ? null : pointsPerMin(s.zone) * s.movS / 60;
      s.unknown = s.load == null;
      if (s.unknown) s.flags.push({ k: 'unknown', t: '负荷未知：缺少可信心率或配速基准' });
    });
    sessions.forEach(x => {
      x.load = x.segs.some(s => s.load == null) ? null : x.segs.reduce((t, s) => t + s.load, 0);
      x.ivdot = x.segs.map(s => s.ivdot).filter(Boolean).reduce((m, v, _, arr) => m == null ? v : m, null);
      x.zone = x.main.zone; x.loadBy = x.main.loadBy;
    });
    const load = new Array(nDays).fill(0);
    segs.forEach(s => { const i = idx[s.day]; load[i] = s.load == null || load[i] == null ? null : load[i] + s.load; });

    // 7. 体能 / 疲劳 / 状况（Banister，时间常数 42 / 7 天；今天状况 = 昨天体能 − 昨天疲劳）
    const series = loadSeries(load);
    const { ctl, atl, tsb } = series;
    const unknownDays = series.unknownDays.map(i => days[i]);
    const iT = idx[today] != null ? idx[today] : nDays - 1;

    // 8. RW 参考区计数：阈值仅提示，不作诊断
    let run8 = 0, run10 = 0;
    for (let i = iT; i >= 0 && tsb[i] < -8; i--) run8++;
    for (let i = iT; i >= 0 && tsb[i] < -10; i--) run10++;

    // 9. 周 / 月统计（按合并后的训练次数）
    const weeks = {}; const months = {};
    sessions.forEach(x => {
      const w = mondayOf(x.day); const m = x.day.slice(0, 7);
      const W = weeks[w] || (weeks[w] = { week: w, km: 0, n: 0, longest: 0, load: 0, movS: 0 });
      W.km += x.km; W.n++; W.longest = Math.max(W.longest, x.km); W.load = W.load == null || x.load == null ? null : W.load + x.load; W.movS += x.movS;
      const M = months[m] || (months[m] = { month: m, km: 0, n: 0, longest: 0, load: 0, movS: 0 });
      M.km += x.km; M.n++; M.longest = Math.max(M.longest, x.km); M.load = M.load == null || x.load == null ? null : M.load + x.load; M.movS += x.movS;
    });
    const weekList = []; for (let w = mondayOf(first); w <= lastDay; w = addDays(w, 7)) weekList.push(weeks[w] || { week: w, km: 0, n: 0, longest: 0, load: 0, movS: 0 });
    weekList.forEach(W => { const e = Math.min(idx[addDays(W.week, 6)] ?? nDays - 1, nDays - 1); W.ctl = ctl[e]; W.cur = curAt(e); });
    const monthList = Object.values(months).sort((a, b) => a.month < b.month ? -1 : 1);

    // 10. 竞赛跑力（最近 6 个月比赛）与跑者类型
    const sixAgo = addDays(today, -183);
    const races = sessions.filter(x => x.raceVdot && x.day >= sixAgo);
    const bestBy = {}; races.forEach(x => { const k = x.raceDist || '其他'; if (!bestBy[k] || x.raceVdot > bestBy[k].raceVdot) bestBy[k] = x; });
    const bestList = Object.values(bestBy);
    const compVdot = bestList.length ? bestList.reduce((t, x) => t + x.raceVdot, 0) / bestList.length : null;
    let runnerType = null;
    const shortR = bestList.filter(x => ['3K', '5K', '10K'].includes(x.raceDist)); const longR = bestList.filter(x => ['半马', '全马'].includes(x.raceDist));
    if (shortR.length && longR.length) {
      const d = longR.reduce((t, x) => t + x.raceVdot, 0) / longR.length - shortR.reduce((t, x) => t + x.raceVdot, 0) / shortR.length;
      runnerType = d > 1.5 ? '耐力型' : d < -1.5 ? '速度型' : '均衡型';
    }

    // 11. 跑量建议：每周（当前跑力，体能）散点，取跑力最高 10% 周的体能中位数
    const sc = weekList.filter(W => W.cur && W.ctl).map(W => ({ x: W.ctl, y: W.cur, week: W.week }));
    let sweet = null, monkey = null;
    if (sc.length >= 26) {
      const top = sc.slice().sort((a, b) => b.y - a.y).slice(0, Math.max(3, Math.round(sc.length * 0.1)));
      const xs = top.map(p => p.x).sort((a, b) => a - b); sweet = xs[Math.floor(xs.length / 2)];
      monkey = sweet < 15 ? '小猴子' : sweet < 20 ? '中小猴子' : sweet < 25 ? '中大猴子' : sweet < 30 ? '大猴子' : '超大猴子';
    }

    // 12. 当前跑力趋势（三周）
    const v3 = curAt(Math.max(0, iT - 21));
    const curNow = curAt(iT);

    return {
      S, maxHr, restHr, lthr, p99, topMax, segs, sessions, days, idx, load, ctl, atl, tsb, cur, curAt, iT, today,
      curNow, trend3w: curNow != null && v3 != null ? curNow - v3 : null, run8, run10,
      weekList, monthList, races, bestList, compVdot, runnerType, scatter: sc, sweet, monkey, calib,
      unknownDays, quality: series.quality, filteredCount: rawActs.length - acts.length,
      suggestCalib: null
    };
  }

  // RW 参考色带：非最优区，不作过度训练诊断
  function tsbBand(t) {
    if (t == null) return { key: 'na', label: '—', tip: '' };
    const tip = '仅为 RW 参考区提示，不是过度训练诊断；请结合体感、睡眠与健康情况。RQ 各版本不同，不可套用。';
    if (t > 5) return { key: 'fresh', label: '恢复侧', tip };
    if (t >= 0) return { key: 'good', label: '非负区', tip };
    if (t >= -2) return { key: 'ok', label: '接近平衡', tip };
    if (t >= -7) return { key: 'train', label: '负荷侧', tip };
    if (t >= -10) return { key: 'tired', label: '负值较低', tip };
    return { key: 'very', label: '留意恢复', tip };
  }

  // 减量推演：从明天到比赛前一天，每天负荷 = 基准 × 系数；返回比赛日早晨状况
  function simulateTaper(R, opt) {
    const base = opt.base; const raceDate = opt.raceDate; const i0 = R.iT;
    let c = R.ctl[i0], a = R.atl[i0];
    const out = [{ day: R.today, ctl: c, atl: a, tsb: R.tsb[i0], load: R.load[i0] }];
    const nd = diffDays(raceDate, R.today);
    for (let k = 1; k <= nd; k++) {
      const d = addDays(R.today, k); const toRace = nd - k; // 距比赛还有几天
      const tsbMorning = c - a;
      if (toRace === 0) { out.push({ day: d, ctl: c, atl: a, tsb: tsbMorning, load: 0, race: true }); break; }
      let f = opt.factor(toRace, k);
      if (opt.restDays && toRace <= opt.restDays) f = 0;
      const L = base * f; c += (L - c) / 42; a += (L - a) / 7;
      out.push({ day: d, ctl: c, atl: a, tsb: tsbMorning, load: L });
    }
    return out;
  }
  // 【RW 自定】默认减量系数：按 RQ 文章引用的 Pfitzinger 比例，赛前第 3 周 −22.5%、第 2 周 −40%、最后 6 天 −60%
  const pfitz = toRace => toRace > 13 ? 0.775 : toRace > 6 ? 0.6 : 0.4;

  // ---------- 格式化 ----------
  function fmtT(s) { if (s == null || !Number.isFinite(s)) return '—'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  function fmtPace(s) { if (s == null || !Number.isFinite(s)) return '—'; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  G.RW = { validDate, shanghaiToday, loadSeries, dur, parseCSV, normalizeRow, activitiesFromCSV, analyze, simulateTaper, pfitz, tsbBand, vdot, raceTime, paceAt, velAt, vo2, ZONES, zoneDecimal, pointsPerMin, parseHMS, fmtT, fmtPace, addDays, diffDays, mondayOf, DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
