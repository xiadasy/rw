# RW v2 · 训练控制台

简体中文静态跑步训练网页。直接打开 `index.html`，无需后端、账户或外部服务；Chart.js 随仓库提供。

## 实际功能

- **首页**：今日状况、42/7体能疲劳、数据新鲜度/缺失警示、比赛目标和课表入口。
- **跑力 / 负荷**：平均心率与配速近似、手动确认比赛、历史趋势与减量情景模拟（保留负荷比例/完整休息天数，不是处方）。EWMA从0开始，TSB使用前一天；未来和非法日期记录被过滤。上海日期固定为 Asia/Shanghai。
- **跑量 / 区间 / 配速表**：周跑量、按年份分组的月表、平均强度区间与配速参考。
- **计算器**：默认5公里23:00，Daniels VDOT或Riegel等效换算（指数1.03–1.15）；明确输入VDOT；VO2max默认62，不能直接单值预测，只有用户主动假设等于VDOT才显示整分钟理论参考，非成绩预测。马拉松成绩↔配速及5公里/10公里/半程/30公里/40公里/终点累计分段。
- **课表**：默认空，本地新建/编辑日期、类型、结构、公里、目标、状态、RPE和反馈；周计划/真实公里及四种状态计数；严格校验JSON导入导出。未来21天内可预览并确认保存保守的赛前减量草案，非2:45达标承诺。GPS仅作同日参考，不自动完成。
- **记录 / 设置**：真实训练搜索/月份筛选/分页、手动比赛确认、心率和比赛目标设置、Garmin CSV本地合并/替换、导出活动JSON。

## 重要口径

负荷是 **RW平均值计点**，不是TRIMP、没有性别系数，不冒充RQ公式。RQ各版本不同，阈值不可套用；参考区不是最优训练区，也不是过度训练诊断。无校准开关、无推荐校准、无固定4%修正。默认静息心率48是假设值，请按实测设置。

缺少可信心率和配速基准的负荷为 `null`。图表保留空值；EWMA按0更新仅为数据不完整下界，并非没有训练。只有平均值，没有逐秒数据，不能还原间歇强度。

所有持久化仅当前浏览器 localStorage，无云同步。换设备/来源或清理浏览器会影响数据，请导出备份。存储受限时保存会提示失败。

## 更新真实记录

在设置页导入Garmin活动CSV，仅改变浏览器副本，不改仓库文件。也保留历史转换脚本：

```bash
python3 scripts/build_data.py 路径/Activities.csv
```

该命令会重建 `data/activities.json` 与 `data/activities.js`，仅在确实需要更新内置数据时使用。无需提交CSV。

## 测试（Node内置，无需安装依赖）

```bash
node --test tests/*.test.js
TZ=America/Los_Angeles node --test tests/*.test.js
node --check assets/engine.js
node --check assets/calculators.js
node --check assets/planner.js
node --check assets/app.js
```

测试覆盖日期跨年/闰年/上海午夜、时间配速、5公里23分钟VDOT与换算、无效输入、42/7边界、前一天TSB、未知负荷、未来活动、手动比赛及课表校验/存储。另已通过1440/390/320宽度全导航静态渲染、计算器和课表交互/导入导出/刷新持久化及460条原CSV导入验收；未做iPhone Safari真机测试。

## 模块与交接

- `assets/engine.js`：分析及纯函数 `RW.loadSeries`
- `assets/calculators.js`：独立纯计算
- `assets/planner.js`：版本化 `rw.plan.v1` 课表
- `assets/app.js` / `style.css` / `index.html`：界面和本地操作
- `data/`：原活动数据
- `docs/HANDOFF-v2.md`：完整数据结构、存储、限制与未来集成边界

不含插件、embed、PWA、MCP服务或iOS实现。未来HTTPS鉴权MCP及真正iOS小组件需另行建设；阿尔克待用户提供链接。历史调研资料保留于 `docs/`，不代表当前实现是第三方算法复刻。

## 模型与未来集成说明
公开来源复核、RQ不同版本阈值差异、VO2max与VDOT区分、真正iPhone组件/Scriptable及HTTPS MCP后续条件，见 [v2审计](docs/V2-audit-and-next.md)。静态JSON不是MCP服务，当前没有Garmin自动同步。

### 可选浏览器回归
安装Python Playwright与Chromium（测试依赖，不是网页运行依赖），先运行 `python3 -m http.server 8766 --bind 127.0.0.1`，另开终端运行：
```bash
python3 tests/browser_smoke.py
python3 tests/browser_interactions.py
```
可用环境变量 `CHROME_BIN` 指定Chromium路径、`RW_TEST_URL` 指定静态服务、`RW_TEST_ARTIFACTS` 指定截图/报告目录；默认输出到已忽略的test-artifacts目录。测试只用隔离浏览器上下文及合成数据，不登录任何账户。
