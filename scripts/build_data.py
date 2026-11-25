#!/usr/bin/env python3
"""把 Garmin Connect 导出的活动 CSV（中文或英文表头）转换成 RW 使用的数据文件。

用法：
    python3 scripts/build_data.py 路径/activities.csv
输出：
    data/activities.json   标准化后的活动列表（只含原始字段，不含计算结果）
    data/activities.js     同样的数据，写成 window.RW_DATA = {...}，方便直接双击 index.html 打开

所有跑力、负荷、体能等计算都在浏览器里完成（assets/engine.js），这里只做清洗，
这样网页内导入 CSV 和本脚本得到的结果完全一致。
"""
import csv, json, re, sys, os, datetime, math

# 表头别名：中文导出在前，英文导出在后
ALIASES = {
    'type': ['活动类型', 'Activity Type'],
    'start': ['日期', 'Date'],
    'title': ['标题', 'Title'],
    'km': ['距离', 'Distance'],
    'cal': ['热量消耗', 'Calories'],
    'time': ['时间', 'Time'],
    'hr': ['平均心率', 'Avg HR'],
    'maxHr': ['最大心率', 'Max HR'],
    'te': ['有氧效果', 'Aerobic TE'],
    'cad': ['平均步频', 'Avg Run Cadence'],
    'pace': ['平均配速', 'Avg Pace'],
    'bestPace': ['最佳配速', 'Best Pace'],
    'asc': ['累计爬升', 'Total Ascent'],
    'desc': ['累计下降', 'Total Descent'],
    'stride': ['平均步长', 'Avg Stride Length'],
    'gct': ['平均触地时间', 'Avg Ground Contact Time'],
    'gap': ['平均坡度调整配速', 'Avg GAP'],
    'tss': ['Training Stress Score®'],
    'power': ['平均功率', 'Avg Power'],
    'maxCad': ['最高步频', '最大步频', 'Max Run Cadence'],
    'vratio': ['平均垂直步幅比', '平均垂直步幅比 %', 'Avg Vertical Ratio'],
    'vosc': ['平均垂直摆动', 'Avg Vertical Oscillation'],
    'maxPower': ['最大功率', 'Max Power'], 'np': ['Normalized Power® (NP®)'],
    'resp': ['平均呼吸频率', 'Avg Respiration Rate'], 'steps': ['步数', 'Steps'],
    'minEle': ['最低海拔', 'Min Elevation'], 'maxEle': ['最高海拔', 'Max Elevation'],
    'laps': ['圈数', 'Number of Laps'],
    'moving': ['移动时间', 'Moving Time'],
    'elapsed': ['全程耗时', 'Elapsed Time'],
}

RUN_WORDS = ('跑', 'Run', 'run')


def num(v):
    if v is None:
        return None
    s = str(v).strip().replace(',', '').replace("'", '').replace('"', '')
    if s in ('', '--', '-'):
        return None
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except ValueError:
        return None


def dur(v):
    """'01:02:03' / '41:50' / '00:00:58.5' -> 秒"""
    if v is None:
        return None
    s = str(v).strip()
    if s in ('', '--'):
        return None
    if not re.fullmatch(r'\d+(?::\d{1,2})?:\d{2}(?:\.\d+)?', s):
        return None
    try:
        parts = [float(x) for x in s.split(':')]
    except ValueError:
        return None
    if parts[-1] >= 60 or (len(parts) == 3 and parts[1] >= 60):
        return None
    t = 0.0
    for p in parts:
        t = t * 60 + p
    return t if math.isfinite(t) and t > 0 else None


def pick(row, key):
    for name in ALIASES[key]:
        if name in row:
            return row[name]
    return None


def normalize(row):
    typ = (pick(row, 'type') or '').strip()
    if not re.search(r'跑|run', typ, re.I):
        return None
    start = (pick(row, 'start') or '').strip()
    try:
        day = start[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) or datetime.date.fromisoformat(day).year < 100:
            return None
    except ValueError:
        return None
    km = num(pick(row, 'km'))
    if km is None or km <= 0:
        return None
    time_s = dur(pick(row, 'time'))
    moving = dur(pick(row, 'moving')) or time_s
    elapsed = dur(pick(row, 'elapsed')) or time_s
    if not moving:
        return None
    a = {
        'id': start,
        'type': typ,
        'start': start,
        'day': start[:10],
        'title': (pick(row, 'title') or '').strip(),
        'km': round(km, 3),
        'timeS': time_s,
        'movS': moving,
        'elapsedS': elapsed,
        'hr': num(pick(row, 'hr')),
        'maxHr': num(pick(row, 'maxHr')),
        'te': num(pick(row, 'te')),
        'cad': num(pick(row, 'cad')),
        'paceS': dur(pick(row, 'pace')),
        'bestPaceS': dur(pick(row, 'bestPace')),
        'asc': num(pick(row, 'asc')),
        'desc': num(pick(row, 'desc')),
        'stride': num(pick(row, 'stride')),
        'gct': num(pick(row, 'gct')),
        'gapS': dur(pick(row, 'gap')),
        'tss': num(pick(row, 'tss')),
        'power': num(pick(row, 'power')),
        'laps': num(pick(row, 'laps')),
        'cal': num(pick(row, 'cal')),
    }
    for key in ('maxCad', 'vratio', 'vosc', 'maxPower', 'np', 'resp', 'steps', 'minEle', 'maxEle'):
        a[key] = num(pick(row, key))
    for key in ('cad', 'stride', 'vratio', 'vosc', 'gct', 'power', 'resp'):
        if a[key] is not None and a[key] <= 0:
            a[key] = None
    return a


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    with open(src, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    acts = [a for a in (normalize(r) for r in rows) if a]
    acts.sort(key=lambda a: a['start'])
    # 同一开始时间去重
    seen, uniq = set(), []
    for a in acts:
        if a['id'] in seen:
            continue
        seen.add(a['id'])
        uniq.append(a)
    out = {
        'meta': {
            'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
            'source': os.path.basename(src),
            'count': len(uniq),
            'first': uniq[0]['day'] if uniq else None,
            'last': uniq[-1]['day'] if uniq else None,
        },
        'activities': uniq,
    }
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
    os.makedirs(root, exist_ok=True)
    js = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(root, 'activities.json'), 'w', encoding='utf-8') as f:
        f.write(js)
    with open(os.path.join(root, 'activities.js'), 'w', encoding='utf-8') as f:
        f.write('window.RW_DATA=' + js + ';\n')
    print(f"已写入 {len(uniq)} 条跑步记录（{out['meta']['first']} 至 {out['meta']['last']}）")


if __name__ == '__main__':
    main()
