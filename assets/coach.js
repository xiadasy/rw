/* RW 本地规则教练：纯函数，所有阈值与出处见 docs/COACH-playbook.md。 */
(function (G) {
  'use strict';
  const ev = (values, rule, source = 'RW 自定') => ({ values, rule, source });
  const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  function advise(i) {
    const W = G.RW;
    const days = W.validDate(i.raceDate) ? W.diffDays(i.raceDate, i.today) : null;
    const ts = i.tsbSeries || [], t = ts.at(-1) ?? null;
    const sessions = i.recentSessions || [], races = i.raceVdots || [];
    const j = i.journalToday, risks = [];
    const baseline = typeof i.restHrBaseline === 'number' ? i.restHrBaseline : i.restHrBaseline?.value;
    const hrDelta = Number.isFinite(i.restHrToday) && Number.isFinite(baseline) ? i.restHrToday - baseline : null;
    const avgKm = mean(i.weekKm4 || []);
    const phase = days === null || days < -14 ? '无比赛' : days < 0 && days >= -14 ? '赛后恢复' : days === 0 ? '比赛日' : days >= 1 && days <= 7 ? '赛前一周' : days >= 8 && days <= 21 ? '减量期' : days > 21 && days <= 84 ? '专项期' : '基础期';
    const paceText = i.paces?.E || '按可交谈体感，不追配速';
    let today = {
      type: '轻松跑', zone: 'E', durationMin: [40, 50], kmRange: null, paceText,
      summary: `今天 40–50 分钟 E 区轻松跑，${paceText}。腿重就直接改休息。`,
      reasons: [ev({ 阶段: phase, 四周周均公里: avgKm ?? '未知' }, '基础分配约80%轻松；周量增长≤10%、长跑≤周量30%–35%仅经验参考。')]
    };
    function change(type, zone, durationMin, summary, evidence, pace = paceText) {
      today = { type, zone, durationMin, kmRange: null, paceText: pace, summary, reasons: [...today.reasons, evidence] };
    }
    if (phase === '减量期') {
      today.reasons.push(ev({ 距比赛天数: days, 周量比例: '60%–80%' }, '减量保持少量强度，降低总量；中长跑限约22–26km且距比赛≥10天。', 'Pfitzinger'));
      if ([11, 18].includes(days)) change('马拉松配速', 'M', [35, 50], `今天少量 M 配速保持：轻松热身后2×2km@M，组间慢跑；${i.paces?.M || '不追目标配速'}，不补跑量。`, ev({ 距比赛天数: days }, 'RW减量课安排，保持强度而非冲刺训练。'), i.paces?.M || paceText);
    }
    if (phase === '赛前一周') {
      today.reasons.push(ev({ 距比赛天数: days, 周量比例: '约40%' }, '赛前一周以轻松为主。', 'Pfitzinger'));
      if ([4, 5].includes(days)) change('短M配速', 'M', [30, 45], '今天热身后2×2–3km@M，组间慢跑；保持感觉，不跑到力竭。', ev({ 距比赛天数: days }, '赛前4–5天一次短M保持课为RW具体安排。'), i.paces?.M || paceText);
      if (days === 1) change('赛前一天', 'E', [0, 20], '赛前一天：休息，或20分钟轻松跑加4×20秒放松加速；腿重选休息。', ev({ 距比赛天数: days }, '赛前一天不补训练量。'));
    }
    const goalPace = Number.isFinite(i.goalS) && i.raceDist > 0 ? W.fmtPace(i.goalS / (i.raceDist / 1000)) + '/km' : '目标未设置';
    if (phase === '比赛日') change('比赛日', '比赛', [0, 15], `比赛日：短时间轻松热身，前半按目标配速 ${goalPace} 或略慢；身体不适及时停下，后半按体感调整。`, ev({ 目标配速: goalPace }, '避免前半程过快，目标不是必须执行的医疗或达标处方。'), goalPace);
    if (phase === '赛后恢复') change('恢复跑或休息', 'E', [0, 25], '赛后恢复：休息或很轻松活动，不安排强度；先等身体恢复。', ev({ 赛后天数: -days }, '赛后1–14天保守恢复，按距离与体感调整。', '通用运动医学建议'));
    const hardYesterday = sessions.some(x => x.day === W.addDays(i.today, -1) && (['T', 'A', 'I', 'R'].includes(x.zoneCode) || x.isRace));
    if (hardYesterday) change('轻松跑或休息', 'E', [0, 40], '昨天强度较高，今天只轻松跑或休息，不追加质量课。', ev({ 昨日高强度: '是' }, '硬-易交替。', 'Daniels'));
    const lowDays = ts.filter(x => Number.isFinite(x) && x < -10).length;
    const consecutive = ts.length >= 3 && ts.slice(-3).every(x => Number.isFinite(x) && x < -10);
    if (t !== null && t < -6 && t >= -10) change('轻松跑', 'E', [20, 40], '今天以轻松为主，腿重就休息，不做强度。', ev({ 今日状况: t }, '−10至−6为RW疲惫参考区。'));
    if (consecutive) {
      const e = ev({ 连续低于负10天数: 3 }, '连续至少三天低于−10，优先恢复；不是诊断。', 'RQ 公开');
      risks.push({ level: '高', text: '连续低状况，注意恢复。', reasons: [e] });
      change('恢复跑或休息', 'E', [0, 25], '连续疲劳，今天休息或很轻松恢复跑。', e);
    }
    if (t !== null && t < -16) change('休息', '休息', [0, 0], '今天休息，不安排跑步；先补足睡眠并观察体感。', ev({ 今日状况: t }, '低于−16采用保守休息；RQ不同文章阈值不同，RW不作诊断。', 'RQ 公开'));
    if (hrDelta !== null && hrDelta >= 5) {
      const e = ev({ 静息心率增量: hrDelta, 基线: baseline }, '较基线上升≥5提示；≥7改恢复或休息（RW经验阈值）。');
      risks.push({ level: hrDelta >= 7 ? '高' : '中', text: '静息心率升高，结合睡眠与身体感受。', reasons: [e] });
      if (hrDelta >= 7) change('恢复跑或休息', 'E', [0, 20], '静息心率明显升高，今天休息或很轻松恢复，不做强度。', e);
    }
    const missing = [];
    if (!Number.isFinite(i.curVdot)) missing.push('无近期即时跑力');
    if (!j) missing.push('无今昨日志');
    if (!W.validDate(i.dataLastDay) || W.diffDays(i.today, i.dataLastDay) > 3) missing.push('活动数据过期');
    if ((i.unknownLoadDays || 0) >= 3) missing.push('近14天未知负荷至少3天');
    const confidence = missing.length ? '低' : races.length ? '高' : '中';
    if (missing.length) {
      const e = ev({ 缺失: missing.join('、') }, '证据不足采用保守建议，数据过期或未知负荷多时不安排强度。');
      risks.push({ level: '中', text: '数据不足，建议偏保守。', reasons: [e] });
      if (!['休息', '恢复跑或休息'].includes(today.type)) {
        if (today.type === '比赛日') {
          change('比赛日', '比赛', [0, 15],
            `数据不足，建议偏保守，身体不适不要参赛。若健康且决定参赛：轻松热身，前半按目标配速 ${goalPace} 或略慢，后半按体感。`, e, goalPace);
        } else if (today.type === '赛前一天') {
          today.summary += ' 数据不足，建议偏保守，优先选休息。';
          today.reasons.push(e);
        } else {
          change('轻松跑或休息', 'E', [0, Math.min(30, today.durationMin[1])],
            '数据不足，建议偏保守：休息或短时间轻松跑，不追加强度。', e);
        }
      }
    }
    const done = sessions.filter(x => x.day === i.today);
    if (done.length) change('已完成', '恢复', [0, 0], `今日已完成 ${done.reduce((s, x) => s + x.km, 0).toFixed(1)} km，接下来以恢复为主，舒适范围内补充拉伸，不再安排跑步。`, ev({ 今日公里: done.reduce((s, x) => s + x.km, 0) }, '当日活动去重，不重复开课。'));
    if (j && (j.pain || (j.feeling === '很差' && j.fatigue >= 8))) {
      const e = ev({ 病痛: j.pain ? '有' : '无', 感觉: j.feeling ?? '未知', 疲劳: j.fatigue ?? '未知' }, '病痛或很差且疲劳≥8优先休息；疼痛持续或加重应就医。', '通用运动医学建议');
      risks.push({ level: '高', text: '停止训练；疼痛持续或加重请就医。', reasons: [e] });
      change('休息', '休息', [0, 0], `${done.length ? '今日已有活动，接下来' : '今天'}休息，停止训练；若疼痛持续或加重请就医。`, e);
    }
    const short = races.filter(x => Number.isFinite(x.vdot) &&
      ((x.dist >= 4900 && x.dist <= 5250) || (x.dist >= 9850 && x.dist <= 10400)));
    const long = races.filter(x => Number.isFinite(x.vdot) &&
      ((x.dist >= 20900 && x.dist <= 21900) || (x.dist >= 41900 && x.dist <= 43300)));
    const delta = short.length && long.length ? mean(long.map(x => x.vdot)) - mean(short.map(x => x.vdot)) : null;
    const limiters = ['耐力', '速度'].map(key => ({
      key, level: delta === null ? '证据不足' : ((key === '耐力' && delta < -1.5) || (key === '速度' && delta > 1.5)) ? '主要' : '证据不足',
      text: delta === null ? '需手动确认至少一场长距离与一场短距离比赛。' : `长减短比赛VDOT差 ${delta.toFixed(1)}，仅作类型参考。`,
      reasons: [ev({ 长距离场数: long.length, 短距离场数: short.length, 长减短VDOT: delta ?? '未知' }, '差值小于−1.5提示耐力，大于+1.5提示速度；RW阈值。')]
    }));
    const is245 = i.raceDist === 42195 && i.goalS === 9900;
    limiters.push({ key: '跑量', level: avgKm === null || !is245 ? '证据不足' : avgKm < 70 ? '主要' : avgKm < 90 ? '次要' : '证据不足', text: '2:45目标的周均70/90km仅经验参考，不是硬标准，更不能临赛补量。', reasons: [ev({ 四周周均公里: avgKm ?? '未知', 目标秒: i.goalS ?? '未知' }, '仅对全马2:45用<70主要、70–90次要的RW经验阈值。')] });
    const fatigueMean = i.journalFatigueMean ?? j?.fatigue ?? null;
    limiters.push({ key: '恢复', level: lowDays >= 3 || fatigueMean >= 7 ? '主要' : '证据不足', text: '结合状况与日志，不能仅凭模型诊断。', reasons: [ev({ 低于负10天数: lowDays, 日志疲劳均值: fatigueMean ?? '未知' }, '近14天≥3天低于−10或日志疲劳均值≥7提示恢复短板。')] });
    const goalVdot = W.vdot(i.raceDist, i.goalS);
    return {
      phase, today,
      gap: { goalVdot, curVdot: i.curVdot ?? null, diff: Number.isFinite(i.curVdot) && goalVdot !== null ? goalVdot - i.curVdot : null,
        goalPace, predicted: W.raceTime(i.curVdot, i.raceDist), pbVdot: W.vdot(i.raceDist, i.pbS), limiters,
        note: `当前跑力为心率近似，可能偏低或偏高。${days !== null && days >= 0 && days <= 21 ? '现在补短板来不及，以保持状态和恢复为主，短板留到赛后周期。' : '循序渐进，不以模型替代身体感受。'}` },
      risks, confidence, confidenceText: missing.length ? `数据不足，建议偏保守：${missing.join('；')}。` : '活动和今昨自评可用；仍是平均值近似，非医学判断。'
    };
  }
  G.RWCoach = { advise };
})(typeof window !== 'undefined' ? window : globalThis);
