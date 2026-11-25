/* 活动整段聚合，缺失不参与均值；不推算 CSV 未提供的技术量。 */
(function (G) {
  'use strict';
  const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const metrics = ['cad', 'stride', 'gct', 'vosc', 'vratio'];
  function zoneOf(a, vdot) {
    if (!(vdot > 0) || !(a.km > 0) || !(a.movS > 0)) return null;
    const pace = a.movS / a.km;
    for (const z of G.RW.ZONES.slice(0, 4)) if (pace >= G.RW.paceAt(vdot, z.hi)) return z.code;
    return 'I';
  }
  function technique(acts, vdot, today) {
    return ['E', 'M', 'T', 'A', 'I'].map(code => {
      const samples = acts.filter(a => a.day <= today && zoneOf(a, vdot) === code);
      const avg = list => Object.fromEntries(metrics.map(k => [k, mean(list.map(a => a[k]).filter(x => Number.isFinite(x) && x > 0))]));
      const recent = samples.filter(a => G.RW.diffDays(today, a.day) < 90);
      const before = samples.filter(a => G.RW.diffDays(today, a.day) >= 90);
      return { code, count: samples.length, small: samples.length < 5, means: avg(samples), recent: avg(recent), before: avg(before), recentCount: recent.length, beforeCount: before.length };
    });
  }
  function aggregate(acts, period = '月') {
    const groups = new Map();
    for (const a of acts) {
      const key = period === '周' ? G.RW.mondayOf(a.day) : period === '年' ? a.day.slice(0, 4) : period === '总' ? '全部' : a.day.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    return [...groups].sort((a, b) => b[0].localeCompare(a[0])).map(([key, xs]) => {
      const sum = k => xs.reduce((s, a) => s + (a[k] ?? 0), 0);
      const weighted = k => {
        const known = xs.filter(a => Number.isFinite(a[k]) && (k === 'hr' || a[k] > 0));
        const sec = known.reduce((s, a) => s + a.movS, 0);
        return sec ? known.reduce((s, a) => s + a[k] * a.movS, 0) / sec : null;
      };
      const best = (list, val, descending = true) => list.slice().sort((a, b) => descending ? val(b) - val(a) : val(a) - val(b))[0] || null;
      return { key, count: xs.length, km: sum('km'), movS: sum('movS'), pace: sum('movS') / sum('km'),
        vdot: mean(xs.map(a => a.ivdot).filter(Number.isFinite)), hr: weighted('hr'), cad: weighted('cad'), stride: weighted('stride'),
        asc: xs.some(a => a.asc == null) ? null : sum('asc'), load: xs.some(a => a.load == null) ? null : sum('load'), ascKnown: sum('asc'), ascMissing: xs.filter(a => a.asc == null).length, loadKnown: sum('load'), loadMissing: xs.filter(a => a.load == null).length,
        records: { longest: best(xs, a => a.km), fastest: best(xs.filter(a => a.km >= 5), a => a.movS / a.km, false), climb: best(xs.filter(a => a.asc != null), a => a.asc), load: best(xs.filter(a => a.load != null), a => a.load) } };
    });
  }
  function personalBests(segs, overrides = {}) {
    const bands = [[5, 4.9, 5.25], [10, 9.85, 10.4], [21.0975, 20.9, 21.9], [42.195, 41.9, 43.3]];
    return bands.map(([km, lo, hi]) => {
      const best = segs.filter(a => a.km >= lo && a.km <= hi).slice()
        .sort((a, b) => (a.elapsedS || a.timeS || a.movS) - (b.elapsedS || b.timeS || b.movS))
        .slice(0, 2).map(a => ({ ...a, confirmed: overrides[a.id] === true }));
      return { km, best };
    });
  }
  G.RWAnalysis = { zoneOf, technique, aggregate, personalBests, metrics };
})(typeof window !== 'undefined' ? window : globalThis);
