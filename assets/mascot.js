/* RW 原创小人：圆头、RW 绿头带，纯 SVG + CSS 动画，不使用外部素材。
 * 四种状态：奔跑 / 正常 / 疲惫 / 躺平。prefers-reduced-motion 时停止动画（见 style.css）。 */
(function (G) {
  'use strict';
  const SKIN = '#f3e7d3', SHIRT = '#A8DC0C', SHORTS = '#2b3340', LINE = '#1b2014';

  // 头部：脸、头带与飘带。eyes: 'open' | 'tired' | 'closed'
  function head(cx, cy, eyes, tilt = 0) {
    const eye = eyes === 'closed'
      ? `<path d="M${cx - 8} ${cy + 1}q3 3 6 0M${cx + 2} ${cy + 1}q3 3 6 0" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>`
      : eyes === 'tired'
        ? `<path d="M${cx - 8} ${cy}h6M${cx + 2} ${cy}h6" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>`
        : `<circle cx="${cx - 5}" cy="${cy}" r="2.4" fill="${LINE}"/><circle cx="${cx + 5}" cy="${cy}" r="2.4" fill="${LINE}"/>`;
    const mouth = eyes === 'tired'
      ? `<ellipse cx="${cx}" cy="${cy + 9}" rx="3.2" ry="4" fill="${LINE}"/>`
      : `<path d="M${cx - 5} ${cy + 7}q5 5 10 0" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    return `<g class="m-head" transform="rotate(${tilt} ${cx} ${cy})">
      <path class="m-ribbon" d="M${cx - 17} ${cy - 9}q-12 -2 -20 6M${cx - 17} ${cy - 7}q-10 4 -16 13" stroke="${SHIRT}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="18" fill="${SKIN}"/>
      <path d="M${cx - 18} ${cy - 7}Q${cx} ${cy - 15} ${cx + 18} ${cy - 7}L${cx + 17.5} ${cy - 1}Q${cx} ${cy - 9} ${cx - 17.5} ${cy - 1}Z" fill="${SHIRT}"/>
      <circle cx="${cx - 11}" cy="${cy + 6}" r="3" fill="#f2a58e" opacity=".55"/><circle cx="${cx + 11}" cy="${cy + 6}" r="3" fill="#f2a58e" opacity=".55"/>
      ${eye}${mouth}
    </g>`;
  }
  // 以关节为原点的四肢；动画只旋转 g
  const limb = (cls, x, y, d, color = SKIN, w = 7) =>
    `<g class="${cls}" style="transform-origin:${x}px ${y}px"><path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;

  function upright(kind) {
    // 肩 (100,70)，髋 (100,104)
    return `<g class="m-body">
      ${limb('m-arm m-back', 100, 72, 'M100 72L100 90L111 96', '#d9ccb6')}
      ${limb('m-leg m-back', 100, 104, 'M100 104L102 126L96 146', '#d9ccb6', 8)}
      <path d="M100 66L100 104" stroke="${SHIRT}" stroke-width="16" stroke-linecap="round"/>
      <path d="M93 100h14v8h-14z" fill="${SHORTS}"/>
      ${limb('m-leg m-front', 100, 104, 'M100 104L102 126L96 146', SKIN, 8)}
      ${limb('m-arm m-front', 100, 72, 'M100 72L100 90L111 96')}
      ${head(100, 44, 'open', kind === 'run' ? 6 : 0)}
    </g>`;
  }
  function tired() {
    return `<g class="m-body">
      ${limb('m-leg', 118, 104, 'M118 104L112 126L116 146', '#d9ccb6', 8)}
      ${limb('m-leg', 118, 104, 'M118 104L126 126L130 146', SKIN, 8)}
      <g class="m-breath" style="transform-origin:118px 104px">
        <path d="M118 104L86 82" stroke="${SHIRT}" stroke-width="16" stroke-linecap="round"/>
        <path d="M112 98l12 6l-4 7l-12-6z" fill="${SHORTS}"/>
        <path d="M88 84L104 112M84 86L118 116" stroke="${SKIN}" stroke-width="7" stroke-linecap="round"/>
        ${head(70, 74, 'tired', 18)}
      </g>
      <path class="m-sweat" d="M56 52q-6 9 0 11q6 -2 0 -11z" fill="#7fc3e6"/>
      <path class="m-sweat s2" d="M86 50q-5 8 0 10q5 -2 0 -10z" fill="#7fc3e6"/>
    </g>`;
  }
  function lying() {
    return `<g class="m-body">
      <ellipse cx="104" cy="146" rx="78" ry="5" fill="#00000040"/>
      <path d="M118 136L146 132L168 136M118 140L148 140L170 142" stroke="${SKIN}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <g class="m-chest" style="transform-origin:96px 140px"><path d="M70 138L118 138" stroke="${SHIRT}" stroke-width="16" stroke-linecap="round"/></g>
      <path d="M112 132h12v13h-12z" fill="${SHORTS}"/>
      <path d="M80 134L96 122L108 126" stroke="${SKIN}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${head(50, 126, 'closed', -12)}
      <text class="m-z z1" x="58" y="96" fill="${SHIRT}" font-size="16" font-weight="800">z</text>
      <text class="m-z z2" x="70" y="80" fill="${SHIRT}" font-size="20" font-weight="800">z</text>
      <text class="m-z z3" x="84" y="62" fill="${SHIRT}" font-size="24" font-weight="800">Z</text>
    </g>`;
  }
  function svg(state) {
    const cls = { 奔跑: 'running', 正常: 'normal', 疲惫: 'tired', 躺平: 'lying' }[state] || 'normal';
    const speed = cls === 'running'
      ? '<g class="m-speed" stroke="#A8DC0C" stroke-width="3" stroke-linecap="round" opacity=".7"><path d="M22 70h26"/><path d="M14 92h30"/><path d="M26 114h20"/></g>'
      : '';
    const art = cls === 'tired' ? tired() : cls === 'lying' ? lying() : upright(cls === 'running' ? 'run' : 'jog');
    return `<svg class="mascot ${cls}" viewBox="0 0 200 160" role="img" aria-label="RW小人：${state}">
      <path d="M18 150H182" stroke="#ffffff1f" stroke-width="2" stroke-linecap="round"/>
      ${speed}${art}
    </svg>`;
  }
  G.RWMascot = { svg };
})(typeof window !== 'undefined' ? window : globalThis);
