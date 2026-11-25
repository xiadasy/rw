/* RW 跑者：原创几何线条跑者（奥运图标式比例），纯 SVG + CSS 帧动画，无外部素材。
 * 姿态由关节角正向运动学逐帧计算：髋—膝—踝—足、肩—肘—腕，头身比约 1:8。
 * 四种状态以步态与姿态区分，而非表情：
 *   在线（大步幅、腾空、前倾）/ 稳定（中等步幅轻松跑）/ 疲劳（步幅短、躯干塌、低臂）/ 恢复（放松步行）。
 * prefers-reduced-motion 时只显示一帧静态姿态（见 style.css）。 */
(function (G) {
  'use strict';
  const L = { torso: 46, neck: 6, head: 8.6, thigh: 40, shank: 40, foot: 12, upper: 27, fore: 24 };
  const GROUND = 176, HIPX = 96, N = 16;
  const rad = d => d * Math.PI / 180;
  // 周期性 Catmull-Rom 插值：keys = [[p, value], ...]，p ∈ [0,1)
  function interp(keys, p) {
    p = ((p % 1) + 1) % 1;
    const n = keys.length;
    let i = keys.findIndex((k, j) => { const nx = j + 1 < n ? keys[j + 1][0] : 1; return p >= k[0] && p < nx; });
    if (i < 0) i = n - 1;
    const k = j => keys[((j % n) + n) % n];
    const p1 = k(i)[0], p2 = i + 1 < n ? k(i + 1)[0] : 1;
    const t = (p - p1) / (p2 - p1);
    const v0 = k(i - 1)[1], v1 = k(i)[1], v2 = k(i + 1)[1], v3 = k(i + 2)[1];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  }
  // 跑步：触地 0–0.32，腾空 0.32–0.5（右腿）；角度单位：度，大腿以竖直向下为 0、向前为正。
  const RUN = {
    thigh: [[0, 26], [0.1, 13], [0.2, -4], [0.32, -22], [0.42, -16], [0.55, 8], [0.68, 34], [0.8, 44], [0.9, 37]],
    knee: [[0, 14], [0.1, 36], [0.2, 26], [0.32, 16], [0.42, 62], [0.55, 112], [0.68, 100], [0.8, 58], [0.9, 22]],
    ankle: [[0, 0], [0.1, -6], [0.25, 10], [0.32, 28], [0.45, 18], [0.6, 6], [0.8, -4], [0.9, -6]],
    stance: [0, 0.32]
  };
  const WALK = {
    thigh: [[0, 20], [0.15, 10], [0.35, -6], [0.55, -16], [0.7, -6], [0.85, 16]],
    knee: [[0, 4], [0.15, 14], [0.35, 6], [0.55, 30], [0.7, 58], [0.85, 20]],
    ankle: [[0, -8], [0.15, 0], [0.4, 6], [0.58, 22], [0.75, 4], [0.9, -6]],
    stance: [0, 0.6]
  };
  const STATES = {
    在线: { gait: RUN, scale: 1, kneeScale: 1, lean: 10, lift: 6, arm: [-10, 36], elbow: [78, 16], headTilt: 2, dur: 0.64, cls: 'on', accent: '#A8DC0C', label: '状态在线' },
    稳定: { gait: RUN, scale: 0.72, kneeScale: 0.78, lean: 6, lift: 3, arm: [-8, 26], elbow: [80, 10], headTilt: 0, dur: 0.78, cls: 'steady', accent: '#A8DC0C', label: '状态稳定' },
    疲劳: { gait: RUN, scale: 0.5, kneeScale: 0.62, lean: 15, lift: 1, arm: [-6, 14], elbow: [58, 6], headTilt: 16, dur: 0.95, cls: 'tired', accent: '#ff9f43', label: '有点疲劳' },
    恢复: { gait: WALK, scale: 0.9, kneeScale: 1, lean: 2, lift: 0, arm: [-2, 20], elbow: [18, 10], headTilt: -2, dur: 1.3, cls: 'recover', accent: '#5aa9ff', label: '恢复中' }
  };
  const ALIAS = { 奔跑: '在线', 正常: '稳定', 疲惫: '疲劳', 躺平: '恢复' };
  const pt = (o, len, deg) => [o[0] + len * Math.sin(rad(deg)), o[1] + len * Math.cos(rad(deg))];
  function leg(hip, p, s) {
    const g = s.gait;
    const th = interp(g.thigh, p) * s.scale, kn = interp(g.knee, p) * s.kneeScale, an = interp(g.ankle, p) * (0.5 + s.scale / 2);
    const knee = pt(hip, L.thigh, th), sh = th - kn, ankle = pt(knee, L.shank, sh);
    const heel = pt(ankle, 3, sh + 180 - 70), toe = pt(ankle, L.foot, sh + 90 - an);
    return { knee, ankle, toe, heel };
  }
  function pose(p, s) {
    // 先以髋 (0,0) 计算两腿，再把最低的足部放到地面；跑步腾空期额外抬升。
    const o = [0, 0], r = leg(o, p, s), l = leg(o, p + 0.5, s);
    const low = Math.max(r.toe[1], r.ankle[1] + 2.5, l.toe[1], l.ankle[1] + 2.5);
    let hipY = GROUND - low;
    const st = s.gait.stance[1];
    if (st < 0.5 && s.lift) {
      const q = ((p % 0.5) + 0.5) % 0.5;
      if (q > st) hipY -= s.lift * Math.sin(Math.PI * (q - st) / (0.5 - st));
    }
    const hip = [HIPX, hipY];
    const mv = a => [a[0] + HIPX, a[1] + hipY];
    const R = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, mv(v)]));
    const Lf = Object.fromEntries(Object.entries(l).map(([k, v]) => [k, mv(v)]));
    const shoulder = [hip[0] + L.torso * Math.sin(rad(s.lean)), hip[1] - L.torso * Math.cos(rad(s.lean))];
    const neckTop = [shoulder[0] + L.neck * Math.sin(rad(s.lean + s.headTilt)), shoulder[1] - L.neck * Math.cos(rad(s.lean + s.headTilt))];
    const headC = [neckTop[0] + (L.head + 1) * Math.sin(rad(s.lean + s.headTilt)), neckTop[1] - (L.head + 1) * Math.cos(rad(s.lean + s.headTilt))];
    // 手臂与对侧腿同步：右臂随左大腿
    const swing = q => interp(s.gait.thigh, q) / 44;
    const arm = q => {
      const a = s.arm[0] + s.arm[1] * swing(q), e = s.elbow[0] + s.elbow[1] * swing(q);
      const elbow = pt(shoulder, L.upper, a), wrist = pt(elbow, L.fore, a + e);
      return { elbow, wrist };
    };
    return { hip, shoulder, neckTop, headC, R, L: Lf, armR: arm(p + 0.5), armL: arm(p), airborne: GROUND - Math.max(R.toe[1], Lf.toe[1]) };
  }
  const n1 = v => Math.round(v * 10) / 10;
  // 锥形胶囊：从 a（半径 r1）到 b（半径 r2），两端为圆弧，用于肌肉体量感的肢体。
  function cap(a, b, r1, r2, cls) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const k = Math.max(-0.99, Math.min(0.99, (r1 - r2) / d)), c = Math.sqrt(1 - k * k);
    const o1 = [a[0] + r1 * (k * ux + c * nx), a[1] + r1 * (k * uy + c * ny)], o2 = [b[0] + r2 * (k * ux + c * nx), b[1] + r2 * (k * uy + c * ny)];
    const i2 = [b[0] + r2 * (k * ux - c * nx), b[1] + r2 * (k * uy - c * ny)], i1 = [a[0] + r1 * (k * ux - c * nx), a[1] + r1 * (k * uy - c * ny)];
    const P = q => `${n1(q[0])} ${n1(q[1])}`;
    return `<path class="${cls}" d="M${P(o1)}L${P(o2)}A${r2} ${r2} 0 0 0 ${P(i2)}L${P(i1)}A${r1} ${r1} 0 0 0 ${P(o1)}Z"/>`;
  }
  function limbSet(k, side, cls) {
    const g = side === 'R' ? k.R : k.L, a = side === 'R' ? k.armR : k.armL;
    const legs = cap(k.hip, g.knee, 6.4, 4.4, cls) + cap(g.knee, g.ankle, 4.4, 2.5, cls) + cap(g.heel, g.toe, 2.5, 2, cls + (cls === 'lm' ? ' shoe' : ' shoe-far'));
    const arms = cap(k.shoulder, a.elbow, 3.7, 2.8, cls) + cap(a.elbow, a.wrist, 2.8, 2.2, cls);
    return { legs, arms };
  }
  function frame(p, s, i) {
    const k = pose(p, s);
    const far = limbSet(k, 'L', 'lf'), near = limbSet(k, 'R', 'lm');
    const torso = cap(k.hip, k.shoulder, 7.2, 8.4, 'torso');
    const neck = cap(k.shoulder, k.neckTop, 3.4, 3, 'lm');
    const head = `<circle class="hd" cx="${n1(k.headC[0])}" cy="${n1(k.headC[1])}" r="${L.head}"/>`;
    const shadowW = n1(28 - Math.min(10, k.airborne) * 0.9);
    return `<g class="fr" style="--i:${i}"><ellipse class="sh" cx="${HIPX + 4}" cy="${GROUND + 3}" rx="${shadowW}" ry="2.4"/>${far.arms}${far.legs}${near.legs}${neck}${torso}${head}${near.arms}</g>`;
  }
  function svg(state) {
    const name = STATES[state] ? state : ALIAS[state] || '稳定', s = STATES[name];
    const frames = Array.from({ length: N }, (_, i) => frame(i / N, s, i)).join('');
    const trail = s.gait === RUN ? `<g class="trail"><path d="M34 ${GROUND - 72}h26M28 ${GROUND - 56}h24M38 ${GROUND - 40}h18"/></g>` : '';
    return `<svg class="runner ${s.cls}" viewBox="22 14 156 176" role="img" aria-label="RW 跑者：${s.label}" style="--acc:${s.accent};--dur:${s.dur}s;--n:${N}">
      <defs><linearGradient id="rwg-${s.cls}" x1="0" x2="1"><stop offset="0" stop-color="${s.accent}" stop-opacity="0"/><stop offset=".5" stop-color="${s.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${s.accent}" stop-opacity="0"/></linearGradient></defs>
      <path class="ground" d="M24 ${GROUND + 3}H176" stroke="url(#rwg-${s.cls})"/>
      <path class="ticks" d="M24 ${GROUND + 9}H176"/>
      ${trail}${frames}
    </svg>`;
  }
  G.RWMascot = { svg, pose, STATES, ALIAS, label: s => (STATES[s] || STATES[ALIAS[s]] || STATES.稳定).label };
})(typeof window !== 'undefined' ? window : globalThis);
