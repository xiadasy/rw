const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
require('../assets/engine.js'); require('../assets/analysis.js'); require('../assets/planner.js');
const W = globalThis.RW, A = globalThis.RWAnalysis, P = globalThis.RWPlan;
test('新增数据字段存在，Python/JS字段与动态0缺失一致，小数秒一致', () => {
  const fields = ['maxCad', 'vratio', 'vosc', 'gct', 'stride', 'power', 'maxPower', 'np', 'resp', 'steps', 'minEle', 'maxEle', 'desc'];
  const data = require('../data/activities.json'); assert.ok(data.activities.length > 0); assert.equal(data.activities.length, data.meta.count);
  const ctx = {window:{}}; require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../data/activities.js'),'utf8'), ctx);
  assert.deepEqual(structuredClone(ctx.window.RW_DATA), data);
  for (const a of data.activities) for (const key of fields) assert.ok(key in a);
  const r = { '活动类型': '跑步', '日期': '2026-11-25 07:00:00', '距离': '5', '时间': '00:25:00.5', '平均步频': '0', '平均垂直步幅比': '--', '平均垂直摆动': '0', '平均步长': '0', '平均触地时间': '0', '平均功率': '0', '平均呼吸频率': '0' };
  const js = W.normalizeRow(r);
  const py = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; from scripts.build_data import normalize; print(json.dumps(normalize(json.loads(sys.argv[1]))))', JSON.stringify(r)], { encoding: 'utf8' }));
  assert.deepEqual(js, py);
  for (const k of ['cad', 'stride', 'vratio', 'vosc', 'gct', 'power', 'resp']) assert.equal(js[k], null);
  const durations = ['00:07:26.9', '120:00', '23:60', '1:99:00', '42', '00:00', '--'];
  const converted = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; from scripts.build_data import dur; print(json.dumps([dur(x) for x in json.loads(sys.argv[1])]))', JSON.stringify(durations)], { encoding: 'utf8' }));
  assert.deepEqual(durations.map(W.dur), converted);
});
test('技术组样本计数、缺失忽略、样本少', () => {
  const xs = Array.from({ length: 5 }, (_, n) => ({ day: n === 0 ? '2026-01-01' : '2026-11-25', km: 5, movS: W.paceAt(55, 0.65) * 5, cad: n === 0 ? null : 180, stride: 0 }));
  const g = A.technique(xs, 55, '2026-11-25')[0];
  assert.equal(g.count, 5); assert.equal(g.small, false); assert.equal(g.means.cad, 180); assert.equal(g.means.stride, null);
  assert.equal(g.recentCount, 4); assert.equal(g.beforeCount, 1);
  assert.equal(A.technique(xs.slice(1), 55, '2026-11-25')[0].small, true);
});
test('统计周/月/年/总、加权心率、未知负荷', () => {
  const xs = [{ day: '2026-11-01', km: 5, movS: 1000, hr: 120, load: 10, asc: 20, ivdot: 50 }, { day: '2026-11-02', km: 10, movS: 2000, hr: 150, load: null, asc: null, ivdot: null }];
  assert.equal(A.aggregate(xs, '周').length, 2);
  for (const period of ['月', '年', '总']) {
    const g = A.aggregate(xs, period)[0]; assert.equal(g.hr, 140); assert.equal(g.pace, 200); assert.equal(g.load, null); assert.equal(g.asc, null); assert.equal(g.vdot, 50); assert.equal(g.count, 2); assert.equal(g.records.longest.km, 10);
  }
});
test('回正推演边界及从昨天收盘开始，不误用今日收盘', () => {
  const r = { iT: 1, ctl: [10, 100], atl: [20, 0], load: [0, 100] };
  assert.equal(W.daysToPositive(r, 0, 0), null);
  assert.ok(W.daysToPositive(r, 0, 60) > 0);
  assert.equal(W.daysToPositive({ iT: 0, ctl: [20], atl: [30], load: [0] }, 0.6), 0);
  assert.equal(W.daysToPositive(r, -1), null);
  assert.equal(W.daysToPositive({ ...r, ctl: [20, 100], atl: [10, 0] }, 0.6), 0);
  const projection = W.projectTaper({ ...r, today: '2026-11-25' }, 0, 1);
  assert.equal(projection[0].tsb, -10);
  assert.equal(projection[1].day, '2026-11-26');
  assert.ok(Math.abs(projection[1].tsb - (10 * 41 / 42 - 20 * 6 / 7)) < 1e-10);
});
test('21天减量草案三周递减、有M课、前一天4km且未确认', () => {
  const d = P.draft('2026-11-15', '2026-12-06', 100, { E: '5:00–5:30/km', M: '4:00–4:15/km' });
  const sums = [0, 1, 2].map(n => d.items.slice(n * 7, n * 7 + 7).reduce((s, x) => s + x.km, 0));
  assert.ok(sums[0] > sums[1] && sums[1] > sums[2]);
  assert.ok(d.items.some(x => x.structure.includes('M配速')));
  assert.ok(d.items.every(x => x.status === '未确认' && x.goal.includes('5:00')));
  assert.equal(d.items.at(-1).date, '2026-12-05'); assert.equal(d.items.at(-1).km, 4);
  assert.match(d.items.at(-1).structure, /加速/); P.validate(d);
  assert.throws(() => P.draft('2026-11-14', '2026-12-06'));
});
