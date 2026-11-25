const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../assets/engine.js');
require('../assets/coach.js');
const W = globalThis.RW, C = globalThis.RWCoach;
const base = () => ({ today: '2026-11-25', raceDate: '2026-12-06', raceDist: 42195, goalS: 9900, pbS: 9600,
  tsbSeries: Array(14).fill(0), ctl: 30, atl: 30, curVdot: 58, cur30dChange: 1, weekKm4: [60, 60, 60, 60], longest28dKm: 28,
  recentSessions: [], raceVdots: [], journalToday: { date: '2026-11-25', pain: false, feeling: '好', fatigue: 4 },
  restHrBaseline: 48, restHrToday: 48, dataLastDay: '2026-11-25', unknownLoadDays: 0,
  paces: { E: '4:55–5:25/km', M: '4:10–4:25/km' } });
const advise = patch => C.advise({ ...base(), ...patch });
test('病痛最高优先，休息且建议就医，覆盖比赛与已跑', () => {
  const a = advise({ raceDate: '2026-11-25', recentSessions: [{ day: '2026-11-25', km: 5 }], journalToday: { pain: true } });
  assert.equal(a.today.type, '休息'); assert.match(a.today.summary, /就医/); assert.ok(a.risks.some(x => x.level === '高'));
  assert.equal(advise({ journalToday: { feeling: '很差', fatigue: 8 } }).today.type, '休息');
});
test('静息心率+7与+5、连续三天低于负10、低于负16', () => {
  assert.match(advise({ restHrToday: 55 }).today.type, /恢复|休息/);
  assert.ok(advise({ restHrToday: 53 }).risks.some(x => x.level === '中'));
  assert.ok(advise({ tsbSeries: [0, -11, -12, -13] }).risks.some(x => x.level === '高'));
  assert.equal(advise({ tsbSeries: [-17] }).today.type, '休息');
});
test('今日已跑去重、昨天I区硬易交替', () => {
  const a = advise({ recentSessions: [{ day: '2026-11-25', km: 10 }] });
  assert.equal(a.today.type, '已完成'); assert.match(a.today.summary, /不再安排跑步/);
  assert.equal(advise({ recentSessions: [{ day: '2026-11-24', km: 10, zoneCode: 'I' }] }).today.zone, 'E');
});
test('比赛周期11天、1天、0天、赛后3天', () => {
  assert.equal(advise({}).phase, '减量期');
  assert.equal(advise({ raceDate: '2026-11-26' }).today.type, '赛前一天');
  const a = advise({ raceDate: '2026-11-25' }); assert.equal(a.phase, '比赛日'); assert.match(a.today.paceText, /3:55/);
  assert.equal(advise({ raceDate: '2026-11-22' }).phase, '赛后恢复');
});
test('过期/未知负荷/无日志/无跑力均保守，置信度低', () => {
  for (const patch of [{ dataLastDay: '2026-11-20' }, { unknownLoadDays: 3 }, { journalToday: null }, { curVdot: null }]) {
    const a = advise(patch); assert.equal(a.confidence, '低'); assert.match(a.confidenceText, /数据不足/); assert.notEqual(a.today.zone, 'M');
  }
});
test('短板长短差-2为耐力主要；无比赛证据不足；周均60跑量主要', () => {
  const a = advise({ raceVdots: [{ dist: 21097.5, vdot: 58 }, { dist: 5000, vdot: 60 }] });
  assert.equal(a.gap.limiters.find(x => x.key === '耐力').level, '主要');
  assert.equal(advise({}).gap.limiters[0].level, '证据不足');
  assert.equal(a.gap.limiters.find(x => x.key === '跑量').level, '主要');
  assert.match(a.gap.note, /现在补短板来不及/);
});
test('证据完整、合法来源且输出确定性', () => {
  const input = base(), a = C.advise(input); assert.deepEqual(a, C.advise(input));
  assert.deepEqual(input, base());
  const allowed = new Set(['RQ 公开', 'Daniels', 'Pfitzinger', 'RW 自定', '通用运动医学建议']);
  for (const item of [a.today, ...a.risks, ...a.gap.limiters]) {
    assert.ok(item.reasons.length); for (const e of item.reasons) { assert.ok(allowed.has(e.source)); assert.ok(e.rule && Object.keys(e.values).length); }
  }
  assert.ok(a.gap.goalVdot > a.gap.curVdot);
});
