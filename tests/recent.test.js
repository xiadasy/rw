const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../assets/engine');
const W=globalThis.RW, day='2026-11-25', cfg={today:day,maxHr:195,restHr:48};
const run=(date,time,other={})=>({day:date,start:date+' 06:00:00',id:date,title:'跑步',type:'跑步',km:5,movS:time,elapsedS:time,hr:160,maxHr:180,...other});
test('42天边界、未来过滤、不回填、不受PB及目标影响',()=>{
  const acts=[run('2026-10-14',1000),run('2026-10-15',1250),run(day,1600),run('2026-11-26',950)];
  const r=W.analyze(acts,cfg);assert.equal(r.curNow,W.vdot(5000,1250));assert.equal(r.recent.count,2);
  assert.deepEqual(W.analyze(acts,{...cfg,pb:'1:59:59',goal:'2:50:00'}).cur,r.cur);
  const old=W.analyze(acts.slice(0,1),cfg);assert.equal(old.curNow,null);assert.equal(W.raceTime(old.curNow,5000),null);assert.equal(W.paceAt(old.curNow,.8),null);
});
test('主段采用整段耗时、确认比赛优先、排除室内与越野',()=>{
  const acts=[run('2026-11-20',1300),run('2026-11-21',1280,{elapsedS:1400}),run('2026-11-22',1060,{type:'越野跑'}),run(day,1050,{type:'跑步机'})];
  assert.equal(W.analyze(acts,cfg).curNow,W.vdot(5000,1300));
  const r=W.analyze(acts,cfg,{'2026-11-21':true});assert.equal(r.curNow,W.vdot(5000,1400));assert.equal(r.recent.count,2);assert.equal(r.recent.races,1);
});
test('四个周一至周日；空周计零，负荷未知和覆盖不足分别处理',()=>{
  const x=(day,km,load)=>({day,km,load});const a=[x('2026-10-26',12,4),x('2026-11-22',8,8),x('2026-11-23',200,300)];
  assert.deepEqual(W.completeWeeks(a,day),{start:'2026-10-26',end:'2026-11-22',covered:true,unknown:0,km:5,load:3});
  assert.equal(W.completeWeeks(a.slice(1),day).km,null);const u=W.completeWeeks([...a,x('2026-10-30',4,null)],day);assert.equal(u.km,6);assert.equal(u.load,null);assert.equal(u.unknown,1);
});
