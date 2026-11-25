/* 每日自评；导入先完整验证，失败不写存储。 */
(function (G) {
  'use strict';
  const KEY = 'rw.journal.v1', MAX_BYTES = 262144;
  const feelings = ['很好', '好', '一般', '差', '很差'];
  const fields = ['date', 'restHr', 'weight', 'fatigue', 'feeling', 'pain', 'notes'];
  const bytes = s => new TextEncoder().encode(s).length;
  function validate(doc) {
    const fail = () => { throw Error('日志格式错误：请检查日期、重复日期、字段或数值范围（最大256KB）。'); };
    if (!doc || Object.keys(doc).sort().join() !== 'entries,version' || doc.version !== 1 || !Array.isArray(doc.entries) || bytes(JSON.stringify(doc)) > MAX_BYTES) fail();
    const dates = new Set();
    const entries = doc.entries.map(x => {
      if (!x || Object.keys(x).sort().join() !== fields.slice().sort().join() || !G.RW.validDate(x.date) || dates.has(x.date)) fail();
      dates.add(x.date);
      for (const [k, lo, hi] of [['restHr', 30, 100], ['fatigue', 1, 10]]) {
        if (x[k] !== null && (!Number.isInteger(x[k]) || x[k] < lo || x[k] > hi)) fail();
      }
      if (x.weight !== null && (typeof x.weight !== 'number' || !Number.isFinite(x.weight) || x.weight < 30 || x.weight > 150 || Math.abs(x.weight * 10 - Math.round(x.weight * 10)) > 1e-8)) fail();
      if (x.feeling !== null && !feelings.includes(x.feeling)) fail();
      if (typeof x.pain !== 'boolean' || typeof x.notes !== 'string' || x.notes.length > 2000) fail();
      return Object.fromEntries(fields.map(k => [k, x[k]]));
    });
    return { version: 1, entries: entries.sort((a, b) => a.date.localeCompare(b.date)) };
  }
  function parse(text) {
    if (typeof text !== 'string' || bytes(text) > MAX_BYTES) throw Error('日志超过256KB。');
    let doc;
    try { doc = JSON.parse(text); } catch (_) { throw Error('无法解析日志JSON，请检查文件。'); }
    return validate(doc);
  }
  function load(storage = G.localStorage) {
    const s = storage.getItem(KEY);
    return s ? parse(s) : { version: 1, entries: [] };
  }
  function save(doc, storage = G.localStorage) {
    const clean = validate(doc);
    storage.setItem(KEY, JSON.stringify(clean));
    return clean;
  }
  function restHrFrom(entries, today) {
    const values = entries.filter(x => G.RW.diffDays(today, x.date) >= 0 && G.RW.diffDays(today, x.date) < 30 && Number.isInteger(x.restHr) && x.restHr >= 30 && x.restHr <= 100).map(x => x.restHr).sort((a, b) => a - b);
    if (values.length < 3) return null;
    const n = values.length;
    return { value: (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2, count: n };
  }
  G.RWJournal = { KEY, MAX_BYTES, feelings, validate, parse, load, save, restHrFrom };
})(typeof window !== 'undefined' ? window : globalThis);
