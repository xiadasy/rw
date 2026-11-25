'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../assets/engine.js');
require('../assets/calculators.js');
require('../assets/planner.js');
const E = globalThis.RW, C = globalThis.RWCalc, P = globalThis.RWPlan;
const close = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const activity = (day, extra = {}) => ({ id: day + ' 07:00:00', start: day + ' 07:00:00', day, type: '跑步', title: '轻松跑', km: 5, movS: 1380, timeS: 1390, elapsedS: 1400, hr: 150, maxHr: 185, ...extra });
const settings = { today: '2026-11-25', maxHr: 185, restHr: 48 };

test('日期：跨年、闰年与非法日期', () => {
  assert.equal(E.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(E.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(E.addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(E.diffDays('2024-03-01', '2024-02-28'), 2);
  assert.equal(E.mondayOf('2026-01-01'), '2025-12-29');
  for (const d of ['2025-02-29', '2026-02-30', '2026-13-01', '', '2026-1-01', null]) assert.equal(E.validDate(d), false);
});
test('上海午夜不受宿主时区影响', () => {
  assert.equal(E.shanghaiToday(new Date('2026-12-31T15:59:59Z')), '2026-12-31');
  assert.equal(E.shanghaiToday(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
  assert.equal(E.shanghaiToday(new Date('2024-02-28T16:00:00Z')), '2024-02-29');
});
test('严格时间和配速解析', () => {
  assert.equal(E.parseHMS('23:00'), 1380);
  assert.equal(E.dur('4:36'), 276);
  assert.equal(E.parseHMS('2:45:00'), 9900);
  for (const s of ['', ' ', null, undefined, Infinity, 'Infinity:00', '-1:30', '4:60', '1:60:00', '1::00', '1:2', '12', '1:00:00:00', '0:00', '4:30abc']) assert.equal(E.parseHMS(s), null, String(s));
});
test('5公里23分钟：已知 VDOT 与 Daniels / Riegel 换算', () => {
  const V = E.vdot(5000, 1380);
  close(V, 42.2736081669, 0.00001);
  close(E.raceTime(V, 5000), 1380, 0.0001);
  const r = C.equivalent();
  close(r.rows[0].seconds, 1380, 0.0001);
  close(r.rows[1].seconds, 2862.41591188, 0.001);
  const g = C.equivalent({ method: 'riegel' });
  close(g.rows[1].seconds, 1380 * 2 ** 1.06);
  assert.equal(C.equivalent({ mode: 'vdot', value: V }).rows.length, 4);
});
test('Daniels 与计算器拒绝非法输入，不返回 NaN', () => {
  for (const n of [0, -1, NaN, Infinity, null, undefined, '', '62']) {
    assert.equal(E.vdot(n, 1380), null); assert.equal(E.vdot(5000, n), null);
    assert.equal(E.raceTime(n, 5000), null); assert.equal(E.raceTime(42, n), null);
  }
  for (const input of [{ seconds: null }, { meters: -5 }, { exponent: 1.02 }, { exponent: 1.16 }, { mode: 'vdot', value: Infinity }, { method: 'x' }]) assert.throws(() => C.equivalent(input));
  assert.throws(() => C.marathon({ seconds: null }));
  assert.equal(E.fmtT(NaN), '—'); assert.equal(E.fmtPace(null), '—');
});
test('VO2max 默认62不能直接预测，主动假设仅整分钟理论参考', () => {
  const r = C.equivalent({ mode: 'vo2max' }); assert.deepEqual(r.rows, []); assert.equal(r.vdot, null);
  const t = C.equivalent({ mode: 'vo2max', assume: true }); assert.equal(t.theoretical, true);
  t.rows.forEach(x => assert.equal(x.seconds % 60, 0)); assert.match(t.message, /非成绩预测/);
});
test('马拉松成绩配速双向与累计分段', () => {
  const r = C.marathon({ seconds: 12600 }); close(r.pace, 12600 / 42.195);
  close(C.marathon({ source: 'pace', pace: r.pace }).seconds, 12600);
  assert.deepEqual(r.splits.map(x => x.km), [5, 10, 21.0975, 30, 40, 42.195]);
  close(r.splits.at(-1).seconds, 12600);
});
test('42/7 负荷：初值0、TSB用前一天、无未来种子', () => {
  const s = E.loadSeries([42, 0, 0]);
  close(s.ctl[0], 1); close(s.atl[0], 6); close(s.tsb[0], 0); close(s.tsb[1], -5);
  close(s.ctl[1], 41 / 42); close(s.atl[1], 36 / 7);
  assert.deepEqual(E.loadSeries([42, 9999]).ctl.slice(0, 1), s.ctl.slice(0, 1));
  const constant = E.loadSeries(Array(42).fill(42)); close(constant.ctl[41], 42 * (1 - (41 / 42) ** 42));
  close(constant.atl[6], 42 * (1 - (6 / 7) ** 7));
  assert.deepEqual(E.loadSeries([]).ctl, []);
});
test('未知负荷：null 标记和不完整下界', () => {
  const s = E.loadSeries([42, null, 0]); assert.deepEqual(s.unknownDays, [1]); close(s.ctl[1], 41 / 42); assert.equal(s.quality, 'incomplete-lower-bound');
  const r = E.analyze([activity('2026-11-24', { hr: null, type: '跑步机' })], settings);
  assert.equal(r.segs[0].loadBy, 'unknown'); assert.equal(r.segs[0].load, null);
  assert.equal(r.sessions[0].load, null); assert.equal(r.load[0], null); assert.equal(r.weekList[0].load, null);
  assert.deepEqual(r.unknownDays, ['2026-11-24']); close(r.ctl[0], 0);
  const outdoor = E.analyze([activity('2026-11-24', { hr: null })], settings);
  assert.equal(outdoor.load[0], null); // 不默认使用跑力50造配速负荷
  const noBaseline = E.analyze([activity('2026-11-24', { maxHr: null })], { today: settings.today });
  assert.equal(noBaseline.maxHr, null); assert.equal(noBaseline.load[0], null);
});
test('分析过滤未来与非法日期，不影响历史', () => {
  const base = activity('2026-11-24');
  const r = E.analyze([base, activity('2026-11-26'), activity('2026-02-30')], settings);
  assert.equal(r.filteredCount, 2); assert.equal(r.segs.length, 1); assert.equal(r.days.at(-1), settings.today);
  assert.deepEqual(r.ctl, E.analyze([base], settings).ctl);
  assert.equal(E.analyze([activity('2026-11-26')], settings), null);
});
test('比赛必须手动 true，优先elapsedS，其次timeS', () => {
  const a = activity('2026-11-24', { hr: 172 });
  const auto = E.analyze([a], settings); assert.equal(auto.sessions[0].autoRace, true); assert.equal(auto.sessions[0].isRace, false); assert.equal(auto.sessions[0].raceVdot, null);
  for (const value of [false, 'true', 1]) assert.equal(E.analyze([a], settings, { [a.id]: value }).sessions[0].isRace, false);
  const manual = E.analyze([a], settings, { [a.id]: true }); close(manual.sessions[0].raceVdot, E.vdot(5000, 1400));
  const b = { ...a, elapsedS: null }; close(E.analyze([b], settings, { [b.id]: true }).sessions[0].raceVdot, E.vdot(5000, 1390));
});
test('旧校准设置不影响跑力、负荷和换算', () => {
  const acts = [activity('2026-11-23'), activity('2026-11-24')];
  const a = E.analyze(acts, settings), b = E.analyze(acts, { ...settings, calib: 50, calibOn: true });
  assert.equal(b.calib, 0); assert.equal(b.suggestCalib, null); assert.deepEqual(a.cur, b.cur); assert.deepEqual(a.load, b.load); assert.equal(E.raceTime(a.curNow, 42195), E.raceTime(b.curNow, 42195));
});
const item = () => ({ id: 'p_1', date: '2026-11-25', type: '轻松跑', structure: '轻松', km: 5, goal: '恢复', status: '未确认', rpe: null, feedback: '' });
test('计划严格schema、大小上限、版本、字段、日期与RPE', () => {
  const good = { version: 1, items: [item()] }; assert.deepEqual(P.parse(JSON.stringify(good)), good);
  for (const patch of [{ date: '2026-02-30' }, { km: '5' }, { km: Infinity }, { km: -1 }, { status: '自动完成' }, { rpe: 0 }, { rpe: 1.5 }, { rpe: 11 }, { structure: 1 }, { feedback: 'x'.repeat(2001) }, { extra: true }]) assert.throws(() => P.validate({ version: 1, items: [{ ...item(), ...patch }] }));
  assert.throws(() => P.validate({ ...good, version: 2 })); assert.throws(() => P.validate({ ...good, extra: true }));
  assert.throws(() => P.validate({ version: 1, items: [item(), item()] }));
  assert.throws(() => P.parse('x'.repeat(P.MAX_BYTES + 1))); assert.throws(() => P.parse('{'));
});
test('课表本地默认空、保存/导入往返、实际活动不改变状态', () => {
  const values = new Map(), storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
  assert.deepEqual(P.load(storage), { version: 1, items: [] });
  P.save({ version: 1, items: [item()] }, storage);
  assert.ok(values.has('rw.plan.v1'));
  const doc = P.load(storage), weeks = P.weeks(doc, [activity('2026-11-25')]);
  assert.equal(weeks[0].km, 5); assert.equal(weeks[0].actualKm, 5); assert.equal(weeks[0].counts['未确认'], 1); assert.equal(doc.items[0].status, '未确认');
  assert.throws(() => P.load({ getItem: () => 'bad json' }));
});
test('赛前减量草案仅未来21天、轻松跑休息、未确认', () => {
  const r = P.draft('2026-11-25', '2026-12-06'); P.validate(r);
  assert.equal(r.items.length, 10);
  for (const x of r.items) { assert.ok(x.date > '2026-11-25' && x.date < '2026-12-06'); assert.ok(['轻松跑', '休息'].includes(x.type)); assert.equal(x.status, '未确认'); }
  assert.equal(P.draft('2026-11-25', '2026-11-26').items.length, 0);
  for (const date of ['2026-11-25', '2026-11-24', '2026-12-17', 'bad']) assert.throws(() => P.draft('2026-11-25', date));
});

test('Garmin小数秒与长分钟解析不丢失记录', () => {
  close(E.dur('00:07:26.9'),446.9); close(E.dur('120:00'),7200);
  close(E.dur('4:36.5'),276.5);
  assert.equal(E.dur('00:07:60.1'),null);
});
test('减量模拟的比赛日为前一天收盘且不加入比赛负荷',()=>{
 const r=E.analyze([activity('2026-11-24')],settings);
 const out=E.simulateTaper(r,{base:10,raceDate:'2026-11-27',factor:()=>0});
 assert.equal(out.at(-1).race,true); assert.equal(out.at(-1).load,0);
 close(out.at(-1).tsb,out.at(-2).ctl-out.at(-2).atl);
 close(out.at(-1).ctl,out.at(-2).ctl);
});
