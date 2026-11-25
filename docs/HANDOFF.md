# RW v3 交接

## 运行与隐私

静态文件，可直接file://打开或本地HTTP服务。所有脚本、图表依赖和数据在仓库中，运行时没有fetch、分析埋点、遥测或外部请求。未读取凭据，不接网络服务/大模型。不应提交原始CSV。生成数据460条。

默认比赛：上海马拉松，2026-12-06，42.195km，目标2:45；日期/目标可在工具设置修改。今天为Asia/Shanghai，不通过人为today设置驱动生产页面。浏览器交互测试固定时钟到2026-11-25，确保减量窗口断言可重复。

## 模块与路由

`engine.js`负责标准化、计算与EWMA；`analysis.js`负责纯聚合；`journal.js`负责严格版本化日志；`coach.js`负责纯规则建议；`mascot.js`/`quotes.js`提供原创展示。`app.js`管理原有计算器、课表、设置和路由，`views.js`安装v3页面，透过注入的只读访问器与刷新回调取当前状态，不复制计算公式。`planner.js`保持v1 schema。

底部状态/分析/记录/训练/工具；主路由简写转向默认子页。旧overview→status；load/volume/zones→analysis/fitness；vdot/paces→analysis/vdot；predict→tools/calc；planner→training/plan；settings→tools/settings。

## localStorage

|键|用途|
|---|---|
|rw.settings|静息/最大/阈值心率、比赛名/日期/距离、目标、PB；新增restHrManual布尔值；calib恒0|
|rw.races|会话id→布尔值，只有严格true是确认比赛|
|rw.activities|可选浏览器活动副本，meta+activities；缺省使用内置data/|
|rw.plan.v1|version:1, items数组；与v2完全兼容|
|rw.journal.v1|version:1, entries数组，每日最多一条|

课表单条：`{id,date,type,structure,km,goal,status,rpe,feedback}`；状态：未确认/已确认/完成/跳过。GPS只作参考，不自动标完成。草案点击生成不保存；确认时按日期去重、不覆盖既有计划，新增均未确认。

日志单条：`{date,restHr,weight,fatigue,feeling,pain,notes}`。日期有效且唯一；restHr为空或30–100整数；weight为空或30–150且最多一位小数；fatigue为空或1–10整数；feeling为空或很好/好/一般/差/很差；pain为布尔；notes为≤2000字符字符串。严格拒绝多字段/错版本/重复日期，256KB上限；导入parse后save，失败不覆盖。

`RWJournal.restHrFrom(entries,today)`返回`{value:中位数,count:条数}`或null。窗口为今日及前29天，排除未来、无心率日志；至少3条，偶数样本取中间两值平均。界面先验证日志。设置显式手动值优先；迁移时旧版非48的静息值视为手动；默认48未声明手动则用日志中位数，否则假设48。清除手动值不会删除日志。

## Coach接口

`RWCoach.advise(input)`不访问存储、时钟或网络，不修改输入，相同输入同输出。

输入由`views.js`组装：

```js
{
  today, raceDate, raceDist, goalS, pbS,
  tsbSeries, // 近14天早晨状况，最后一个为今天
  ctl, atl, curVdot, cur30dChange,
  weekKm4, // 四个连续7天窗口的公里
  longest28dKm,
  recentSessions: [{day, km, movS, zoneCode, loadBy, isRace}],
  raceVdots: [{dist, vdot}], // 六个月内严格确认比赛，dist为米
  journalToday, // 今日或昨日最近日志，或null
  journalFatigueMean, // 可选扩展：近14天已填日志疲劳均值
  restHrBaseline, // 日志中位数或null
  restHrToday, dataLastDay, unknownLoadDays,
  paces // E/M/T/A/I/R到区间配速文字
}
```

输出：

```js
{
  phase,
  today: {type, zone, durationMin:[lo,hi], kmRange:null, paceText, summary, reasons},
  gap: {goalVdot,curVdot,diff,goalPace,predicted,pbVdot,limiters,note},
  risks: [{level,text,reasons}], confidence, confidenceText
}
```

`limiters`四项分别为耐力/速度/跑量/恢复，含level、text、reasons。所有建议/风险/短板都有Evidence数组：`{values:{中文名称:数值或文本},rule,source}`。gap、confidence等汇总字段本身不独立持有reasons，依据在today/risks/limiters中。完整来源、阈值、优先级与可信度见[规则手册](COACH-playbook.md)。不是伤病诊断或训练达标承诺。

## 数据审计

- Python与JS同步字段：maxCad、vratio、vosc、gct、stride、power、maxPower、np、resp、steps、minEle、maxEle、desc。动态cad/stride/vratio/vosc/gct/power/resp的0/--为null，其他可有真实0（例如海拔）。小数秒保留。
- 无校准；VO2max≠VDOT；42/7 EWMA从0开始；今日状况使用前一天收盘；未知负荷null并显式提示，按0更新体能/疲劳仅为下界。
- 手动比赛以合并会话id存储；记录页面整段星标映射到所属会话。PB使用各会话主段用时（elapsed优先，再time，再mov），距离带沿用v2，非官方或分段最好；用户PB另列。
- 周期统计按筛选后原始整段，平均跑力取有效ivdot均值；配速总秒/总公里；心率/步频/步长按已知样本时长加权。负荷有未知则整周期显示—（含未知）；缺爬升为—。
- 技术按当前跑力配速边界归E/M/T/A/I（E含更慢、I含更快），各字段均值分别忽略缺失，<5样本提醒。近90天与之前对照不是因果结论。无触地平衡/腾空时间，不由其他字段推算。
- `RW.daysToPositive(R,factor,maxDays)`从今天早晨状态开始，用之前28个日历日的日均负荷×比例逐日推演，已非负返回0，超过上限返回null。已有未知数据按0仅作保守模型推演，不声称精确回正。
- 三周草案周公里按四周周均的约77.5/60/40%分配，前一天4km可改休息（周均不足30km直接休息），部分周/四舍五入导致比例略有偏差。M课只保持不加量，不以目标成绩配速强迫训练。

## 回归与产物

`node --test`（32项）；跨时区同样运行；所有自写JS可`node --check`。浏览器脚本、截图路径与命令见README。冒烟包含file://，宽度1440/390/320遍历所有主/子路由；交互覆盖导入失败不覆盖及病痛安全。产物在忽略的test-artifacts，无需提交截图或合成导出文件。

## 未完成与已知限制

- iPhone小组件、MCP、自动Garmin同步均未做；没有外部大模型或云同步，仅本地。
- 未做iPhone Safari真机、系统小组件、离线PWA/service worker或跨设备同步。
- CSV是整段平均值，无逐秒心率/步态或官方分段；不能诊断伤病、还原真实强度时长、推算腾空/平衡。
- 课表是保守草案而非完整周期化训练处方；专项/基础期只给简单约束与轻松默认建议，不自动安排长期递增训练。
- 界面目前展示体重与日志供自评，不把体重变化转换成跑力预测。静息心率中位数不等于医学基线。
- localStorage非加密；共用设备需要用户自行备份和清理浏览器数据。

旧v2实现与研究记录仍保留于`HANDOFF-v2.md`及RQ研究文件，仅用于历史审计。


## 验收后修订（2026-11-25）
- `mascot.js` 重画：圆头 + RW 绿头带 + 绿背心，四态各有独立姿势与 CSS 动画（奔跑摆臂/速度线、正常轻晃、疲惫扶膝流汗、躺平呼吸 + Zzz），`prefers-reduced-motion` 时静止。
- 状态页顺序：小人 → 私教今日建议 → 四个指标 → 手记。私教卡新增「明日预案」：以今天收盘体能−疲劳作为明天状况、假设今天不再训练再跑一次 `RWCoach.advise`，只作预告，明早按日志重判。
- 依据中的小数统一保留 1 位；私教卡加「写今天的日志」入口。
- 宽度 ≥900px 时导航回到顶部居中；手机仍为底部五入口。
- 表格数字不再拆行，宽表在卡片内横向滚动；记录列表标题列可换行。
- 资源缓存参数统一为 `?v=3-20261125`。
