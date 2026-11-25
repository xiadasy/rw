# RW v4 · 本地跑步教练

简体中文、移动端优先的静态跑步工具。直接打开 `index.html` 或用本地静态服务器；无需账户、后端或外部服务。运行时不上传数据，Chart.js已内置。

## 五个入口

- **状态** `#status`：最上方是核心指标块（跑力、体能、疲劳、状况四个大数字＋较昨日变化＋状况分区色条），其下是线条跑者插画（在线/稳定/疲劳/恢复四态，用步态和姿态区分，16 帧逐帧动画），再下是私教今日建议＋明日预案（依据只折叠一次），最后是每日手记。支持减少动态效果。
- **分析** `#analysis/fitness`、`#analysis/vdot`、`#analysis/tech`：30/90/180天体能趋势、强度/心率平均值归区、减量回正与v2情景模拟；90/180/365天跑力、区间配速、Daniels预测、六个月确认比赛、整段主段PB最佳/次佳及目标短板；同配速区技术均值及近90天对比。
- **记录** `#records`：类型/年/月/标题筛选、分页、手动比赛星标；周/月/年/总统计及各周期最长/最快/爬升/负荷单次记录。
- **训练** `#training/journal`、`#training/plan`：课表页顶部是「Garmin 日历课表」——从本机选择 `calendar-plan.json` 导入（只存浏览器 localStorage，不上传），显示每次训练的步骤、目标和备注、当天实际跑量，并标出从最后一条到比赛日的空档；下方是 RW 自建课表。日志页月历（格子里只显示当天跑量，圆点表示已写日志 / 有 Garmin 课表）、自评静息心率/体重/疲劳/感觉/病痛/备注，严格导入导出；兼容v2课表编辑器。赛前21天可预览“上海马拉松2026-12-06减量期草案”（日期和名称以设置为准），含少量M配速与短促加速，用户确认后保存为未确认，同日不覆盖。
- **工具** `#tools/calc`、`#tools/settings`：保留Daniels/Riegel换算、VO2max主动假设模式、马拉松成绩↔配速与累计分段；心率/目标设置、本地CSV合并或替换、活动导出、恢复内置数据。

旧hash（如 `#overview`、`#load`、`#predict`、`#planner`、`#settings`）自动转向新路由。底部五入口支持iPhone安全区，内容留出底部空间。

## 计算与安全边界

- **无硬校准**：calib恒0；VO2max不等于VDOT；当前跑力仅为心率-配速近似，可能偏高/偏低。成绩预测非实测。
- 比赛只认 `raceOverrides[id]===true`；今天使用Asia/Shanghai。42/7 EWMA初值0，今日状况=昨日体能−昨日疲劳。
- 负荷为RW平均值计点，不是TRIMP或RQ官方算法；未知为null，EWMA按0仅为体能/疲劳下界，状况差值不是下界。平均值归区不能还原逐秒或间歇强度。
- 动态字段0与`--`为缺失；触地平衡、腾空时间没有数据，不换算。统计忽略缺失技术样本；负荷含未知明确标记。
- 静息心率可手动设置；未手动设置时，近30天≥3条日志静息心率采用中位数，否则48为假设值。设置页可清除手动值。
- 私教为本地确定性规则，病痛优先休息并提醒持续/加重就医；数据不足偏保守，不是医疗诊断或2:45达标承诺。每条阈值、来源、可信度见 [规则手册](docs/COACH-playbook.md)。

## 本地数据

持久化只在当前浏览器localStorage，换设备、来源或清理浏览器可能丢失，请导出备份。课表 `rw.plan.v1`、日志 `rw.journal.v1` 各有256KB限制，导入先完整校验，失败不覆盖。

设置页CSV导入只改变浏览器副本。重建仓库内置数据：

```bash
python3 scripts/build_data.py /workspace/garmin-data/activities.csv
```

本版生成460条活动，输出 `data/activities.json` 与 `data/activities.js`；不提交原CSV。

## 结构

- `assets/engine.js`：CSV标准化、日期、Daniels、负荷/跑力、减量及回正推演。
- `assets/coach.js`：纯函数 `RWCoach.advise(input)`，证据链、风险与短板。
- `assets/journal.js`：严格日志schema、存储、中位数。
- `assets/analysis.js`：技术配速分组、周期聚合、主段PB。
- `assets/mascot.js`、`quotes.js`：原创小人、22条原创手记。
- `assets/calculators.js`、`planner.js`：保留v2计算器及兼容课表。
- `assets/app.js`、`views.js`、`style.css`：本地状态、五入口路由与界面。
- [交接文档](docs/HANDOFF.md)：数据结构、接口、限制及未完成项。

## 测试

Node内置测试，无需安装依赖（字段一致性测试需Python3）：

```bash
node --test
TZ=America/Los_Angeles node --test
for f in assets/*.js; do node --check "$f"; done
```

32个测试覆盖原v2审计语义、教练优先级/阶段/证据/确定性、日志验证和窗口中位数、Python/JS字段一致性、技术分组、周期加权与未知负荷、减量回正、三周草案。原17项保留，草案断言更新为v3的保持课与赛前一天内容，没有放宽数据审计语义。

已有Python Playwright和Chromium的环境可运行（不需要网页联网）：

```bash
python3 -m http.server 8766 --bind 127.0.0.1
# 另一终端
CHROME_BIN=/usr/bin/google-chrome python3 tests/browser_smoke.py
CHROME_BIN=/usr/bin/google-chrome python3 tests/browser_interactions.py
```

冒烟遍历所有主/子路由，检查JS错误、横向溢出、NaN/undefined/Infinity，保存1440/390/320宽截图。交互覆盖计算器、课表预览/确认/导入导出、日志持久化/失败不覆盖/病痛、CSV、筛选和比赛标星。产物在忽略的 `test-artifacts/`；可用 `RW_TEST_URL`、`RW_TEST_ARTIFACTS` 改路径。尚未做iPhone Safari真机验证。

## 明确未做

仅本地，无自动Garmin同步、外部大模型、MCP服务、iPhone小组件或iOS实现；无会员/签到/福利。历史RQ调研文档保留供审计，不表示复刻第三方算法。网络集成和真机组件仍需单独建设。
