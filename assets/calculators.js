/* 无外部依赖的纯计算；不将 VO2max 直接视为成绩跑力。 */
(function(G) {
    'use strict';
    const distances = [
        ['5公里', 5000],
        ['10公里', 10000],
        ['半马', 21097.5],
        ['全马', 42195]
    ];
    const pos = n => typeof n === 'number' && Number.isFinite(n) && n > 0;

    function equivalent({
        mode = 'race',
        method = 'daniels',
        meters = 5000,
        seconds = 1380,
        value = 62,
        exponent = 1.06,
        assume = false
    } = {}) {
        if (!['race', 'vdot', 'vo2max'].includes(mode)) throw Error('请选择有效输入模式。');
        if (!['daniels', 'riegel'].includes(method)) throw Error('请选择换算方法。');
        if (!pos(exponent) || exponent < 1.03 || exponent > 1.15) throw Error('Riegel 指数应为 1.03–1.15。');
        let V;
        if (mode === 'race') {
            if (!pos(meters) || !pos(seconds)) throw Error('请输入有效距离和时间（分:秒或时:分:秒）。');
            V = G.RW.vdot(meters, seconds);
        } else {
            if (!pos(value) || value < 10 || value > 100) throw Error('请输入 10–100 之间的数值。');
            if (mode === 'vo2max' && !assume) return {
                vdot: null,
                rows: [],
                theoretical: false,
                message: 'VO2max 无法单值预测成绩：还需要跑步经济性、耐力和专项训练信息。'
            };
            V = value;
        }
        if (!pos(V)) throw Error('输入超出可用范围，请检查成绩。');
        const theoretical = mode === 'vo2max';
        const rows = distances.map(([name, m]) => {
            let s = mode === 'race' && method === 'riegel' ? seconds * (m / meters) ** exponent : G.RW.raceTime(V, m);
            if (!pos(s)) throw Error('无法换算，请检查输入。');
            if (theoretical) s = Math.round(s / 60) * 60;
            return {
                name,
                meters: m,
                seconds: s,
                pace: s / (m / 1000)
            };
        });
        return {
            vdot: V,
            rows,
            theoretical,
            message: theoretical ? '假设 VDOT 等于输入，仅为整分钟理论参考，非成绩预测。' : '等效成绩换算不是完赛承诺；距离专项、天气和补给会影响实际表现。'
        };
    }

    function marathon({
        seconds,
        pace,
        source = 'time'
    }) {
        const s = source === 'pace' ? pace * 42.195 : seconds;
        if (!['time', 'pace'].includes(source) || !pos(s) || (source === 'pace' && !pos(pace))) throw Error('请输入有效成绩或每公里配速。');
        const p = s / 42.195;
        return {
            seconds: s,
            pace: p,
            splits: [
                ['5公里', 5],
                ['10公里', 10],
                ['半程', 21.0975],
                ['30公里', 30],
                ['40公里', 40],
                ['终点', 42.195]
            ].map(([name, km]) => ({
                name,
                km,
                seconds: p * km
            }))
        };
    }
    G.RWCalc = {
        equivalent,
        marathon,
        distances
    };
})(typeof window !== 'undefined' ? window : globalThis);