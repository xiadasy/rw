# RW 源码说明（给其他 AI 模型 / 开发者）

RW 是刘伟个人使用的**纯静态、本地优先**跑步训练分析网站（简体中文、手机优先），目标是备战全马（上海马拉松 2026-12-06，目标 2:45，PB 2:38:07）。线上：GitHub Pages（xiadasy/rw）。没有后端、账户、埋点或外部请求（CSP `connect-src 'none'`），所有个人数据只在浏览器 localStorage。

> 本压缩包**不含**真实训练数据：`data/activities.js` 是合成示例（真实数据由 `scripts/build_data.py` 从 Garmin 导出的 CSV 生成，不随包分发）。请勿在改动中引入网络请求、第三方 CDN 或登录。

## 运行

```bash
python3 -m http.server 8766      # 打开 http://127.0.0.1:8766/
node --test tests/*.test.js      # 纯函数单元测试（37 个）
CHROME_BIN=/usr/bin/google-chrome python3 tests/browser_smoke.py         # 三种视口截图 + 溢出/NaN 检查（需 playwright）
CHROME_BIN=/usr/bin/google-chrome python3 tests/browser_interactions.py  # 关键交互
```
发布时把 `index.html` 里所有 `?v=4-20261125` 缓存键一起改掉。

## 架构与加载顺序（index.html）

| 文件 | 职责 | 全局 |
|---|---|---|
| `data/activities.js` | 活动数据 `window.RW_DATA={meta,activities}` | RW_DATA |
| `assets/engine.js` | CSV 解析/标准化、时间解析、上海日期、训练合并、跑力近似、负荷、42/7 EWMA、比赛确认、日周月统计、格式化 `fmtT/fmtHMS/fmtPace` | `RW` |
| `assets/calculators.js` | 成绩等效（Daniels/Riegel）、马拉松成绩↔配速与分段 | `RWCalc` |
| `assets/planner.js` | RW 自建课表 schema 校验、存取、减量草案、按周分组 | `RWPlan` |
| `assets/journal.js` | 每日日志（静息心率/体重/疲劳/感觉/病痛/备注）与静息心率中位数 | `RWJournal` |
| `assets/coach.js` | 确定性规则“私教”：输入指标 → 今日建议、风险、置信度，每条都带证据 `{values,rule,source}` | `RWCoach` |
| `assets/garminplan.js` | Garmin 日历课表 JSON 导入/校验/存取、英文目标中文化、到比赛日的空档计算 | `RWGarminPlan` |
| `assets/analysis.js` | 技术指标按配速区聚合、周期统计、PB | `RWAnalysis` |
| `assets/mascot.js` | 线条跑者 SVG：关节角正向运动学生成 16 帧，四态 在线/稳定/疲劳/恢复 | `RWMascot` |
| `assets/quotes.js` | 原创激励手记，按日期轮换 | `RWQuotes` |
| `assets/views.js` | v3/v4 页面：状态、分析三页、记录、训练日志、课表（含 Garmin）、工具外壳 | `RWViews` |
| `assets/app.js` | 路由（hash）、旧页面（计算器、RW 课表编辑器、设置、负荷图）、图表、导入导出；最后调用 `RWViews.install()` | — |
| `assets/style.css` | 暗色主题；文件末尾 “v4” 段是最新样式（指标块、跑者、Garmin、移动端） | — |

路由：`#status`、`#analysis/fitness|vdot|tech`、`#records`、`#training/journal|plan`、`#tools/calc|settings`。`pages[route]()` 返回 HTML 字符串，`pages[route].after()` 绑定事件。所有用户文字都要经过 `esc()`。

## 数据流

```
Garmin CSV ──scripts/build_data.py──▶ data/activities.js ─┐
浏览器导入 CSV ─▶ localStorage rw.activities ─────────────┴▶ RW.analyze(activities, settings, raceOverrides)
                                                                 └▶ R = {days, load, ctl, atl, tsb, cur, curNow, segs, sessions, ...}
R + 日志 + 设置 ─▶ RWCoach.advise() ─▶ 状态页私教卡
calendar-plan.json ─(文件选择)─▶ RWGarminPlan.save ─▶ localStorage rw.garminPlan.v1 ─▶ 训练>课表
```
localStorage 键：`rw.settings`、`rw.races`、`rw.activities`、`rw.plan.v1`、`rw.journal.v1`、`rw.garminPlan.v1`。

Garmin 课表文件格式：`[{date:"YYYY-MM-DD", name, sport, steps:[{type, duration_or_distance, target}], total_distance_km, total_time:"h:mm:ss", notes?, source}]`。

## 关键公式（engine.js）

- **Daniels VDOT**：`vo2(v) = -4.6 + 0.182258v + 0.000104v²`（v 米/分钟），`%max(t) = 0.8 + 0.1894393e^(-0.012778t) + 0.2989558e^(-0.1932605t)`（t 分钟），`VDOT = vo2/%max`；`raceTime(vdot, 距离)` 二分反解；`paceAt(vdot, 强度比例)`。
- **当前跑力**：稳定跑的平均心率储备比例与配速近似反推（心率-配速近似，不等于实测 VO2max；无硬校准，calib 恒 0）。只有用户手动星标的比赛（`raceOverrides[id]===true`）参与竞赛跑力。
- **负荷（RW 计点）**：每段按心率强度与配速强度较高者归区，`load = pointsPerMin(zone) × 移动分钟`；缺心率且无配速基准时为 null（未知，不当 0）。不是 TRIMP，也不是 RQ 官方算法。
- **体能/疲劳/状况**：`ctl_t = ctl_{t-1} + (load_t − ctl_{t-1})/42`，`atl` 同理用 7；初值 0。今日 **状况 = 昨日体能 − 昨日疲劳**。
- **状况分区（RW 参考，借鉴 RQ 公开口径）**：>+5 充分恢复；0~+5 比赛窗口（全马赛日目标）；−2~0 平衡；−7~−2 有效训练；−10~−7 偏疲劳；<−10 过度疲劳风险（连续 3 天 <−8 需警惕）。
- **Riegel**：`T2 = T1 × (D2/D1)^k`，k 默认 1.06（1.03–1.15）。

## 常见改动入口

- 状态页布局/指标：`views.js` → `pages.status`、`tsbZone()`、`delta()`；样式 `.metrics`、`.m-grid`。
- 私教规则与文案：`coach.js` → `advise()`（阈值与出处见 `docs/COACH-playbook.md`），卡片渲染在 `views.js` → `coachCard()`。
- 跑者造型/动画：`mascot.js` → `L`（肢体长度）、`RUN/WALK`（步态关键帧：大腿角、膝屈曲、踝角）、`STATES`（每态的幅度、前倾、手臂、周期、强调色）、`frame()`（绘制）；CSS `.runner*` 与 `@keyframes rw-frame`。
- Garmin 课表展示：`views.js` → `garminSection()`、`garminCard()`；解析在 `garminplan.js`。
- 时长/配速格式：`RW.fmtHMS`（时:分:秒）、`RW.fmtT`（成绩，<1 小时为 m:ss）、`RW.fmtPace`（m:ss）。
- 记录页：`views.js` → `pages.records`；统计聚合 `analysis.js` → `aggregate()`。
- 计算器/设置/RW 课表编辑器：`app.js` → `pages.predict`、`pages.settings`、`pages.planner`。

## 约束（请保持）

1. 不引入外部网络请求、CDN、字体或登录；不提交真实 CSV/JSON 个人数据。
2. 未知数据保持未知（null/“无数据”），不编造、不用默认值冒充；界面上不出现无标签的裸“—”。
3. 时长一律 时:分:秒，配速 m:ss/km。
4. 界面只用简体中文；手机 390px / 320px 不出现横向溢出（smoke 测试会检查）。
5. 改完跑 `node --test tests/*.test.js` 和两个浏览器测试。
