const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
require('../assets/engine.js');
require('../assets/garminplan.js');
require('../assets/mascot.js');
const W = globalThis.RW, GP = globalThis.RWGarminPlan, M = globalThis.RWMascot;
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const sample = fs.readFileSync(path.join(__dirname, 'fixtures/calendar-plan.sample.json'), 'utf8');

test('fmtHMS 统一为 时:分:秒', () => {
  assert.equal(W.fmtHMS(11250), '3:07:30');
  assert.equal(W.fmtHMS(2040), '0:34:00');
  assert.equal(W.fmtHMS(59.6), '0:01:00');
  assert.equal(W.fmtHMS(null), '—');
});
test('Garmin 课表解析、排序、存取与非法输入', () => {
  const items = GP.parse(sample);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(x => x.date), ['2026-11-25', '2026-11-26', '2026-11-29']);
  assert.equal(items[0].notes, '示例备注：腿沉就休。');
  assert.equal(items[1].notes, '');
  const st = mem(); GP.save(items, 'calendar-plan.json', st, new Date('2026-11-25T04:00:00Z'));
  assert.equal(GP.load(st).items.length, 3);
  GP.clear(st); assert.equal(GP.load(st), null);
  assert.throws(() => GP.parse('{"a":1}'), /数组/);
  assert.throws(() => GP.parse('[{"date":"2026-02-30"}]'), /日期无效/);
  assert.throws(() => GP.parse('not json'), /JSON/);
});
test('Garmin 空档：最后一条之后到比赛日整段标出', () => {
  const items = GP.parse(sample);
  assert.deepEqual(GP.gaps(items, '2026-11-25', '2026-12-06'), [['2026-11-27', '2026-11-28'], ['2026-11-30', '2026-12-06']]);
  assert.deepEqual(GP.gaps(items, '2026-12-07', '2026-12-06'), []);
});
test('目标文字中文化、≈分:秒补成时:分:秒', () => {
  assert.equal(GP.zh('easy 5:30-6:00/km, conversational'), '轻松 5:30-6:00/km，可交谈强度');
  assert.equal(GP.fixTime('6.00 km (≈34:00)'), '6.00 km (≈0:34:00)');
  assert.equal(GP.fixTime('21 km (≈1:40:00)'), '21 km (≈1:40:00)');
});
test('跑者四态：几何有效、脚不穿地、头身比约 1:8、旧状态名兼容', () => {
  for (const s of ['在线', '稳定', '疲劳', '恢复']) {
    const svg = M.svg(s);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), s);
    assert.equal((svg.match(/class="fr"/g) || []).length, 16);
    for (let i = 0; i < 16; i++) {
      const k = M.pose(i / 16, M.STATES[s]);
      for (const leg of [k.R, k.L]) for (const p of [leg.toe, leg.ankle]) assert.ok(p[1] <= 176.01, `${s} 帧${i} 脚低于地面`);
      const height = Math.max(k.R.ankle[1], k.L.ankle[1]) - (k.headC[1] - 8.6);
      assert.ok(height / 17.2 > 6.5, `${s} 头身比过大`);
    }
  }
  assert.match(M.svg('奔跑'), /状态在线/);
  assert.match(M.svg('躺平'), /恢复中/);
});
