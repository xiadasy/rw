# RW v2 交接

## 当前边界

纯静态网页，没有后端、账户、云同步、外部 API 或运行时外部依赖。Chart.js 来自仓库本地 vendor。直接打开 `index.html` 即可使用；主体实现由Pi完成，协调执行器另用本机临时静态服务与无登录headless Chromium验收；没有修改原始活动数据或提交CSV。发布提交见Git历史。测试脚本在tests/browser_smoke.py及browser_interactions.py，可独立复跑；测试产物默认被.gitignore排除。

全部持久化仅当前浏览器及当前来源（协议/域名/端口）；换设备、换来源或清理站点存储都不会自动迁移。请手动导出备份。浏览器限制 file:// 存储时会显示保存失败，不能承诺跨浏览器一致。

## 模块

- `assets/engine.js`：CSV 标准化、严格时间解析、日期验证、上海日期、训练合并、跑力近似、手动比赛与日/周/月统计。全局 `RW`，Node 加载后在 `globalThis.RW`。
- `assets/calculators.js`：纯函数 `RWCalc.equivalent`、`marathon`。默认 5公里23:00；Daniels 或 Riegel（指数1.03–1.15）。明确 VDOT 输入。VO2max 默认62，不能单值预测；仅主动假设 VDOT 等于输入后给出整分钟理论参考，非成绩预测。
- `assets/planner.js`：`RWPlan` 课表校验、解析、读写、草案与周分组。独立于真实记录。
- `assets/app.js`：路由、表单、反馈、图表、导入导出；无活动时仍可进入计算器、课表和设置。
- `assets/style.css` / `index.html`：暗色运动控制台，首页状态/新鲜度/目标/课表入口。月表按年份分组，行只写月份。主导航不再包含方法页。
- `tests/rw.test.js`：Node 内置测试，不依赖浏览器或服务。

## 计算口径

- `parseHMS` / `dur` 只接受 `mm:ss` 或 `hh:mm:ss`，支持Garmin小数秒及超过99分钟，秒及小时格式中的分钟须小于60；拒绝空、负数、非有限、零时长。Daniels 函数无效输入返回 null。
- 上海今天通过 `Intl.DateTimeFormat` 的 `Asia/Shanghai` 明确指定，不随宿主系统时区变化。`analyze` 的 `today` 参数仅供确定性测试；UI 不读取历史设置中的 today。
- 过滤非法日历日期及晚于今天的活动，不改变原文件。日内活动时间沿用数据中的本地记录时间；不是逐秒时间轴。
- 42/7 日 EWMA 初值为0，系数分别1/42、1/7；不是指数 e 衰减形式。今天 TSB 使用前一天收盘 CTL−ATL。暴露纯函数 `loadSeries(load)`，其中 `unknownDays` 为索引；`analyze` 输出的 `unknownDays` 为日期。
- 负荷为 **RW 平均值计点**，不是 TRIMP、无性别系数、不声称 RQ 公式，不硬乘4%。`calib` 恒0，`suggestCalib` 恒null，旧浏览器校准字段不起作用。
- 最大心率优先用户设置或可信历史99分位；无历史且未设置时不默认用185，保留缺失。无可信心率，且无可信配速/当前跑力基准时，单段 `load:null`、`loadBy:'unknown'`。同次/同日/周/月任一含未知时总负荷为null；日 EWMA 对未知按0更新，输出 `quality:'incomplete-lower-bound'`，体能/疲劳仅是数据不完整下界，不是无训练；TSB作为两者差值，偏差方向不确定。完整输入也仅为 `average-estimate`。无活动日期按0，不等于用户确认休息。历史起点前负荷未知导致初期偏低。
- 自动识别保留为候选，只有 `raceOverrides[id] === true` 才确认为比赛。竞赛使用主段 elapsedS，其次timeS，再其次movS；优先标准距离。用户需核对主段和官方成绩，合并不代表官方整场时间。
- 阈值仅 RW 参考提示，不是有效训练最优区、过度训练诊断或减量处方。RQ 各版本不同，不可套用。
- 图表对未知保留 null、不跨空值连线；数值格式化统一显示“—”。

## localStorage

| 键 | 结构 / 用途 |
| --- | --- |
| `rw.settings` | 心率、比赛日期/距离/名称、目标、PB；旧校准字段忽略 |
| `rw.races` | `{活动或合并训练id: true/false}`，仅严格true确认比赛 |
| `rw.activities` | `{activities: [...], meta: {...}}` 浏览器CSV导入副本 |
| `rw.plan.v1` | `{version:1, items:[...]}` 版本化课表 |
| `rw.ui` | 历史界面偏好，v2不再使用，未删除 |

课表记录必须且只能包含：

```json
{
  "id": "p_example",
  "date": "2026-11-25",
  "type": "轻松跑",
  "structure": "可交谈强度，可改休息",
  "km": 5,
  "goal": "恢复",
  "status": "未确认",
  "rpe": null,
  "feedback": ""
}
```

上例只是数据结构示范，不会自动写入默认课表。编号校验为1–80位ASCII字母/数字/下划线/连字符。

类型：轻松跑、休息、长距离、节奏跑、间歇、比赛、其他。状态：未确认、已确认、完成、跳过。公里是0–200有限数字；RPE是1–10整数或null；结构/目标/反馈各至多2000字符。日期严格验证，编号必须唯一；最多500条，JSON最大256KB（UTF-8字节），额外字段/错误版本/重复ID/错误类型全部拒绝。读取失败提示但不静默覆盖损坏存储。导入需确认替换，导出含完整版本结构。

生成草案只适用未来1–21天内比赛，范围是明天至赛前一天（比赛明天则草案为空）。模板仅轻松跑/休息，非2:45达标承诺；预览后用户确认才本地保存为未确认，已有同日计划不重复追加。周实际km来自该周真实活动，同日实际km仅供参考；绝不据GPS自动完成。完成状态仅用户表单选择或显式导入的状态。新建/编辑/导入/导出/失败均有反馈。

## 后续集成边界（未实现）

- **HTTPS + 鉴权 MCP**：未来如需外部工具访问，须另外建立 HTTPS 后端、明确身份授权、最小权限、数据校验、限流与审计，区分读取和写入确认。网页 localStorage 不是可远程访问的数据库；本次没有实现或启动 MCP 服务。
- **真正 iOS 小组件**：需要独立原生 App/WidgetKit、签名分发、App Group/受控同步和系统刷新策略；网页或 iframe 不能替代。当前不含 iOS 实现。
- 插件、embed、PWA 均未实现。不应把静态网页包装成已有平台集成。
- **阿尔克**：待用户提供准确产品/文档链接及授权边界，暂不假定接口、不访问账户。

## 验证

```bash
node --test tests/*.test.js
TZ=America/Los_Angeles node --test tests/*.test.js
node --check assets/engine.js
node --check assets/calculators.js
node --check assets/planner.js
node --check assets/app.js
```

17项Node测试通过（上海与洛杉矶宿主时区）；已完成1440/390/320宽度10个主导航页面的headless Chromium静态渲染、无横向页面溢出检查、计算器和课表交互/下载/导入/刷新持久化、真实460条CSV兼容验收。并非iPhone Safari真机测试，localStorage配额与iOS实际表现仍需真机验证。复核来源与后续iOS/MCP方案见 [V2-audit-and-next.md](V2-audit-and-next.md)。

### 补回的v1实用功能
- 负荷页减量模拟：基于近28天已知日均负荷，明日起保留0–100%的固定比例、可设置赛前0–3个完整休息日。只做情景演示，不自动求解/承诺最优状态，不写入课表。
- 真实记录可按月份筛选、标题/日期搜索、每60次分页。
- 计算器切换模式会隐藏无关字段，VO2max假设必须主动选择，离开模式会复位。
