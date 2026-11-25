/* Garmin 日历课表：用户从本机选择 calendar-plan.json 导入，只存当前浏览器 localStorage（rw.garminPlan.v1）。
 * 文件格式：[{date,name,sport,steps:[{type,duration_or_distance,target}],total_distance_km,total_time,notes?,source}]
 * 只读展示，不改写 RW 自建课表，也不上传任何数据。 */
(function (G) {
  'use strict';
  const KEY = 'rw.garminPlan.v1', MAX_BYTES = 524288, MAX_ITEMS = 400;
  const str = (v, n = 500) => typeof v === 'string' ? v.slice(0, n) : '';
  const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1000) ? v : null;
  function validate(list) {
    if (!Array.isArray(list)) throw Error('Garmin 课表应为数组（calendar-plan.json）。');
    if (list.length > MAX_ITEMS) throw Error('最多 400 条。');
    return list.map((x, i) => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error(`第 ${i + 1} 条不是对象。`);
      if (!G.RW.validDate(x.date)) throw Error(`第 ${i + 1} 条日期无效：${String(x.date).slice(0, 20)}`);
      const steps = Array.isArray(x.steps) ? x.steps.slice(0, 50).map(s => ({
        type: str(s?.type, 40), duration_or_distance: str(s?.duration_or_distance, 120), target: str(s?.target, 200)
      })) : [];
      return { date: x.date, name: str(x.name, 200) || '未命名训练', sport: str(x.sport, 40), steps,
        total_distance_km: num(x.total_distance_km), total_time: str(x.total_time, 20), notes: str(x.notes, 2000), source: str(x.source, 60) || 'garmin-calendar' };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
  function parse(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw Error('文件不得超过 512KB。');
    let doc; try { doc = JSON.parse(text); } catch (_) { throw Error('无法解析 JSON。'); }
    return validate(Array.isArray(doc) ? doc : doc?.items);
  }
  function load(storage = G.localStorage) {
    const t = storage.getItem(KEY); if (!t) return null;
    const d = JSON.parse(t); return { importedAt: str(d.importedAt, 40), fileName: str(d.fileName, 200), items: validate(d.items) };
  }
  function save(items, fileName, storage = G.localStorage, now = new Date()) {
    const doc = { importedAt: now.toISOString(), fileName: str(fileName, 200), items: validate(items) };
    storage.setItem(KEY, JSON.stringify(doc)); return doc;
  }
  function clear(storage = G.localStorage) { storage.removeItem(KEY); }
  // 英文目标描述的常见词翻成中文；配速保留原数字。
  const WORDS = [[/very easy/gi, '非常轻松'], [/easy/gi, '轻松'], [/conversational/gi, '可交谈强度'], [/reference/gi, '参考'],
    [/recovery/gi, '恢复'], [/tempo/gi, '节奏'], [/threshold/gi, '乳酸阈'], [/marathon pace/gi, '马拉松配速'], [/interval/gi, '间歇'],
    [/warm ?up/gi, '热身'], [/cool ?down/gi, '放松'], [/single/gi, '单段'], [/repeat/gi, '重复'], [/rest/gi, '休息'], [/no target/gi, '无目标']];
  const zh = s => WORDS.reduce((t, [re, w]) => t.replace(re, w), String(s || '')).replace(/;\s*/g, '；').replace(/,\s*/g, '，');
  const fixTime = s => String(s || '').replace(/≈\s*(\d{1,2}):(\d{2})(?!:)/g, (_, m, x) => `≈${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${x}`);
  // 计算从 from 到比赛日（含）之间没有 Garmin 训练的连续空档。
  function gaps(items, from, raceDate) {
    if (!G.RW.validDate(from) || !G.RW.validDate(raceDate) || raceDate < from) return [];
    const has = new Set(items.map(x => x.date)), out = [];
    let start = null;
    for (let d = from; d <= raceDate; d = G.RW.addDays(d, 1)) {
      if (!has.has(d)) { if (!start) start = d; } else if (start) { out.push([start, G.RW.addDays(d, -1)]); start = null; }
    }
    if (start) out.push([start, raceDate]);
    return out;
  }
  G.RWGarminPlan = { KEY, MAX_BYTES, validate, parse, load, save, clear, zh, fixTime, gaps };
})(typeof window !== 'undefined' ? window : globalThis);
