/* 版本化、本地课表。实际活动只作参考，完成状态仅用户设置。 */
(function(G) {
    'use strict';
    const KEY = 'rw.plan.v1',
        MAX_BYTES = 262144,
        MAX_ITEMS = 500;
    const statuses = ['未确认', '已确认', '完成', '跳过'];
    const types = ['轻松跑', '休息', '长距离', '节奏跑', '间歇', '比赛', '其他'];
    const fields = ['id', 'date', 'type', 'structure', 'km', 'goal', 'status', 'rpe', 'feedback'];
    const bytes = s => new TextEncoder().encode(s).length;

    function validate(doc) {
        const fail = msg => {
            throw Error('课表格式错误：' + msg);
        };
        if (!doc || typeof doc !== 'object' || Array.isArray(doc) || Object.keys(doc).sort().join(',') !== 'items,version' || doc.version !== 1 || !Array.isArray(doc.items)) fail('需要 version:1 和 items 数组');
        if (doc.items.length > MAX_ITEMS) fail('最多 500 条');
        if (bytes(JSON.stringify(doc)) > MAX_BYTES) fail('超过 256KB');
        const ids = new Set();
        const items = doc.items.map(x => {
            if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).sort().join(',') !== fields.slice().sort().join(',')) fail('记录字段不匹配');
            if (typeof x.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(x.id) || ids.has(x.id)) fail('编号无效或重复');
            ids.add(x.id);
            if (!G.RW.validDate(x.date)) fail('日期无效');
            if (!types.includes(x.type) || !statuses.includes(x.status)) fail('类型或状态无效');
            if (typeof x.km !== 'number' || !Number.isFinite(x.km) || x.km < 0 || x.km > 200) fail('计划公里应为 0–200');
            if (x.rpe !== null && (!Number.isInteger(x.rpe) || x.rpe < 1 || x.rpe > 10)) fail('RPE 应为 1–10 或空');
            for (const k of ['structure', 'goal', 'feedback'])
                if (typeof x[k] !== 'string' || x[k].length > 2000) fail('文字字段应在 2000 字以内');
            return Object.fromEntries(fields.map(k => [k, x[k]]));
        });
        return {
            version: 1,
            items
        };
    }

    function parse(text) {
        if (typeof text !== 'string' || bytes(text) > MAX_BYTES) throw Error('导入文件不得超过 256KB。');
        let doc;
        try {
            doc = JSON.parse(text);
        } catch (_) {
            throw Error('无法解析 JSON，请检查文件。');
        }
        return validate(doc);
    }

    function load(storage = G.localStorage) {
        const text = storage.getItem(KEY);
        return text ? parse(text) : {
            version: 1,
            items: []
        };
    }

    function save(doc, storage = G.localStorage) {
        const clean = validate(doc);
        storage.setItem(KEY, JSON.stringify(clean));
        return clean;
    }

    function id() {
        return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }

    function draft(today, raceDate) {
        if (!G.RW.validDate(today) || !G.RW.validDate(raceDate)) throw Error('请先设置有效比赛日期。');
        const n = G.RW.diffDays(raceDate, today);
        if (n < 1 || n > 21) throw Error('仅能为未来 21 天内的比赛生成草案。');
        return {
            version: 1,
            items: Array.from({
                length: n - 1
            }, (_, i) => {
                const remaining = n - i - 1,
                    rest = remaining <= 1 || i % 3 === 2;
                return {
                    id: id(),
                    date: G.RW.addDays(today, i + 1),
                    type: rest ? '休息' : '轻松跑',
                    structure: rest ? '休息，按体感调整。' : '可交谈强度，不加速；不适即停止，可改休息。',
                    km: rest ? 0 : remaining > 7 ? 5 : 3,
                    goal: '保守减量草案，非 2:45 达标承诺',
                    status: '未确认',
                    rpe: null,
                    feedback: ''
                };
            })
        };
    }

    function weeks(doc, activities = []) {
        const groups = {};
        validate(doc).items.forEach(x => {
            const key = G.RW.mondayOf(x.date);
            const w = groups[key] || (groups[key] = {
                week: key,
                km: 0,
                actualKm: 0,
                counts: Object.fromEntries(statuses.map(s => [s, 0])),
                items: []
            });
            w.km += x.km;
            w.counts[x.status]++;
            w.items.push(x);
        });
        Object.values(groups).forEach(w => {
            w.items.sort((a, b) => a.date.localeCompare(b.date));
            w.actualKm = activities.filter(a => a.day >= w.week && a.day <= G.RW.addDays(w.week, 6)).reduce((n, a) => n + a.km, 0);
        });
        return Object.values(groups).sort((a, b) => a.week.localeCompare(b.week));
    }
    G.RWPlan = {
        KEY,
        MAX_BYTES,
        statuses,
        types,
        validate,
        parse,
        load,
        save,
        id,
        draft,
        weeks
    };
})(typeof window !== 'undefined' ? window : globalThis);