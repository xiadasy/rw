const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../assets/engine.js'); require('../assets/journal.js');
const J = globalThis.RWJournal;
const entry = date => ({ date, restHr: 48, weight: 60.1, fatigue: 5, feeling: '好', pain: false, notes: '' });
const doc = () => ({ version: 1, entries: [entry('2026-11-25')] });
test('日志严格schema、重复日期、范围、256KB', () => {
  assert.deepEqual(J.validate(doc()), doc());
  for (const patch of [{ restHr: 29 }, { restHr: 48.5 }, { weight: 60.11 }, { fatigue: 11 }, { feeling: '坏' }, { pain: '是' }, { notes: '字'.repeat(2001) }, { date: '2026-02-30' }, { extra: 1 }]) {
    assert.throws(() => J.validate({ version: 1, entries: [{ ...entry('2026-11-25'), ...patch }] }));
  }
  assert.throws(() => J.validate({ version: 1, entries: [entry('2026-11-25'), entry('2026-11-25')] }));
  assert.throws(() => J.parse(' '.repeat(262145)));
  assert.throws(() => J.validate({ ...doc(), version: 2 }));
});
test('日志本地往返与失败不覆盖', () => {
  let text = null;
  const storage = { getItem: () => text, setItem: (_, s) => { text = s; } };
  assert.deepEqual(J.load(storage), { version: 1, entries: [] });
  J.save(doc(), storage); const before = text;
  assert.deepEqual(J.parse(text), doc()); assert.deepEqual(J.load(storage), doc());
  assert.throws(() => J.save({ version: 1, entries: [{ ...entry('bad') }] }, storage));
  assert.equal(text, before);
});
test('静息心率中位数、少于3条、30天窗口排除未来', () => {
  const e = ['2026-10-27', '2026-11-01', '2026-11-25'].map(entry);
  e[0].restHr = 44; e[1].restHr = 50;
  assert.deepEqual(J.restHrFrom(e, '2026-11-25'), { value: 48, count: 3 });
  assert.equal(J.restHrFrom(e.slice(1), '2026-11-25'), null);
  assert.equal(J.restHrFrom(e, '2026-11-26'), null);
  assert.equal(J.restHrFrom([...e.slice(1), entry('2026-11-26')], '2026-11-25'), null);
  assert.deepEqual(J.restHrFrom([...e, { ...entry('2026-11-20'), restHr: 49 }], '2026-11-25'), { value: 48.5, count: 4 });
});
