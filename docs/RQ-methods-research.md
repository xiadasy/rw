# RQ 跑力公开方法调研（供 RW 实现参考）

> RW 是刘伟个人使用的训练分析网页，与 RQ 跑力（RunningQuotient）没有任何关联，也不是其官方产品。
> 本文只整理 RQ 在公开文章与帮助手册中**已写明**的方法，RW 只实现这些已公开的内容和公认的标准方法（Daniels 跑力公式、Banister 冲击-反应模型）。
> RQ 未公开的细节（精确回归、权重、阈值）在 RW 中由我们自行设定，下文用 **【RW 自定】** 标出，代表推测或工程取舍，不代表 RQ 的真实算法。
> 调研时间：2026-11-25（上海时间）。

可信度标记：**高** = 官方原文明确写出；**中** = 官方给出例子或范围，需要推导；**低** = 官方未写明，RW 自定。

---

## 1. 跑力的定义

| 结论 | 可信度 | 出处 |
|---|---|---|
| 「跑力」一词来自 Jack Daniels《丹尼尔博士跑步方程式》的 VDOT，综合了最大摄氧量、跑步经济性和意志力 | 高 | https://runningquotient-support.gitbook.io/rqsupport/analysis/run-level ；https://www.runningquotient.com/article/single/154 |
| RQ 把跑力分成「即时跑力」（单次）和「当前跑力」（稳定实力），另有「竞赛跑力」（由成绩计算） | 高 | 同上；https://runningquotient-support.gitbook.io/rqsupport/analysis/run-level/xiang-tong-cheng-ji-de-pao-zhe-pao-li-wei-shen-me-bu-yi-yang |
| 初跑者约 20–30，规律训练 40 以上，业余高手 55 以上，精英 65 以上 | 高 | https://runningquotient-support.gitbook.io/rq-3/premiummore/whattorun |

### 1.1 即时跑力（单次）

| 结论 | 可信度 | 出处 |
|---|---|---|
| 主要依据心率，再结合配速、坡度、时间（里程）计算单次跑力 | 高 | https://runningquotient-support.gitbook.io/rqsupport/analysis/what-is-runlevel |
| 原理是「心率与配速的线性规律」：在稳定状态下找出两者关系，推估当天跑力 | 高 | https://www.runningquotient.com/article/single/38 |
| 计算条件：最大/安静心率设定正确；心率区间在 1.0–4.0 之间（即储备心率 59%–88%）；稳定配速 10 分钟以上；坡度小于 5% | 高 | 同上 |
| 强度 4 区以上心率跟不上强度变化，关系变成非线性，这些区段自动排除 | 高 | 同上 |
| 间歇课、起伏大、记录太短（10–15 分钟以内）、心率设定错误时算不出即时跑力 | 高 | https://runningquotient-support.gitbook.io/rqsupport/analysis/what-is-runlevel/why-no-show-runlevel |
| 「最大摄氧量百分比与储备心率百分比非常接近」 | 高 | https://www.runningquotient.com/article/single/12 |
| 轻松跑的即时跑力会偏低（RQ 有专文讨论） | 中 | 文章 38 页面的相关文章标题「為什麼輕鬆跑的即時跑力會比較低？」 |

**RW 实现**：RQ 用的是逐秒数据回归，Garmin CSV 只有每次的平均值，所以 RW 用平均值近似。
- 【RW 自定】即时跑力 = VO₂(坡度调整配速) ÷ 储备心率%，即用「%VO₂max ≈ %HRR」把当次配速对应的摄氧量折算成最大摄氧量。VO₂(v) 用 Daniels 公式。
- 【RW 自定】入选条件：平均心率落在 HRR 59%–88%；移动时间 ≥ 15 分钟（平均值需要更长时间才稳定）；不是间歇课（标题含 `数字x数字`、`间歇` 等，或最佳配速明显快于平均配速）；每公里爬升 < 20 m；不是跑步机或越野；没有 GPS 或心率异常。

### 1.2 当前跑力

| 结论 | 可信度 | 出处 |
|---|---|---|
| 当前跑力 =「跑者目前稳定的实力」，用过去 **42 天**的即时跑力计算 | 高 | https://www.runningquotient.com/site/qa |
| 同时参考近期设为「比赛」的记录和各距离最佳成绩，离今天越近权重越高 | 高 | https://www.runningquotient.com/article/single/154 |
| 停练会衰退：停练 2–4 周后开始下降，4 周约 −6%，9 周约 −19% | 高 | 同上 |
| 当前跑力旁的箭头表示最近三周的趋势 | 高 | https://www.runningquotient.com/site/qa |
| 竞赛跑力：用最近 6 个月内各距离最佳成绩分别算出跑力再取平均；备战全马时建议参考半马竞赛跑力 | 高 | https://runningquotient-support.gitbook.io/rq/rq-webside/running-tools/runleveltest |

**RW 实现**
- 【RW 自定】当前跑力 = 42 天内即时跑力的加权平均。权重按天数线性递减，今天为 1，42 天前为 0.5；比赛记录的竞赛跑力（Daniels 公式）权重 ×3。RQ 没有公开具体权重。
- 【RW 自定】停练衰退：14 天内不衰退，14→28 天线性降到 −6%，28→63 天线性降到 −19%，按文章给出的两个点插值。
- 【RW 自定】「比赛」可在记录列表手动标记；自动候选的条件是：主段距离接近 5K/10K/半马/全马，且平均心率 ≥ 85% HRR。

## 2. 心率区间

| 结论 | 可信度 | 出处 |
|---|---|---|
| RQ 固定用储备心率法（HRR%），只需要用户提供实测最大心率和站姿安静心率 | 高 | https://www.runningquotient.com/article/single/310 |
| 目标心率 = (最大心率 − 安静心率) × 储备心率% + 安静心率 | 高 | https://www.runningquotient.com/article/single/12 |
| 1 区 59–74%，2 区 74–84%，3 区 84–88%，4 区 88–95%，5 区 95–100%（早期叫 E/M/T/A/I；A 区由徐国峰补充，Daniels 原书没有 A 区） | 高 | 同上；https://www.runningquotient.com/article/single/311 |
| 小数表示区间内的位置，例如 2.4 ≈ HRR 78% | 高 | 徐国峰博客 http://rocky549.blogspot.com/2015/10/blog-post_14.html |
| 最大心率必须实测，不能用公式；RQ 列出个人历史最大心率前十名帮助确认 | 高 | 文章 310、311；https://www.runningquotient.com/article/single/9 |

**RW 实现**：完全照此实现，区间小数也照算；另外提供「阈值心率法」（Friel %LTHR）作为对照，属于公认标准，不是 RQ 方法。

## 3. 配速区间（6 区）

| 结论 | 可信度 | 出处 |
|---|---|---|
| 6 区：1 有氧耐力（E）、2 马拉松（M）、3 节奏/乳酸阈值（T）、4 无氧耐力（A）、5 最大摄氧量（I）、6 速度与经济性（R） | 高 | https://runningquotient-support.gitbook.io/rq/rq-webside/dashboard/my-runlevel |
| 由当前跑力推出配速区间；间歇课应看配速而不是心率 | 高 | https://www.runningquotient.com/article/single/11 |
| 例：跑力 50.5 → 有氧慢跑 5:30–4:53/km，I 配速 3:55/km 以内，全马潜力 3:17 内 | 高（例子） | https://www.runningquotient.com/article/single/154 |
| 各区精确的 %VO₂max 没有公开 | — | — |

**RW 实现**：【RW 自定】用 Daniels 方法，按 %VO₂max 解出速度：E 59–74%、M 74–84%、T 84–88%、A 88–95%、I 95–100%、R 105–115%。用跑力 50.5 核对：E 快端 4:51（RQ 例子 4:53），I 快端 3:58（RQ 例子 3:55 以内），配速区间基本吻合。但 Daniels 公式算出的全马是 3:09:04，RQ 例子写的是「3 小时 17 分内」，说明 RQ 的全马推估可能比 Daniels 保守约 4%（只有一个例子，不能确定）。RW 的预测用 Daniels 公式，并在页面上注明全马偏乐观。E 慢端 RQ 例子是 5:30，约等于 63%，所以 RW 的 E 慢端会比 RQ 慢一些。R 区只作参考。可信度：中。

## 4. 训练指数（单次训练负荷）

| 结论 | 可信度 | 出处 |
|---|---|---|
| 训练量 = 强度 × 时间，不用公里数 | 高 | https://runningquotient.com/article/single/291 ；https://www.runningquotient.com/article/single/105 |
| 按储备心率% 和配速%（相对当前跑力）给不同权重，逐秒累加，也考虑距离、坡度 | 高 | 文章 105 |
| 参考 Daniels 的分区计点：1 区 1 分钟 = 0.2，5 区 1 分钟 = 1.0（轻松 60 分钟 ≈ 间歇 12 分钟） | 高 | 文章 291 |
| 自动切换单位：高强度间歇用配速（心率滞后会低估）；越野、烈日、强风等配速慢但心率高时用心率 | 高 | https://www.runningquotient.com/article/single/310 |
| 量级：30–50 属很大负荷，全马 100 以上；质量课 15–30；高负荷后安排休息或 5–15 的轻量恢复；单次 > 40 会出现黄色警示 | 高 | 文章 105；https://runningquotient-support.gitbook.io/rq-3/premiummore/whattorun |
| 心率数据异常时可切换「纯配速分析」 | 高 | https://runningquotient-support.gitbook.io/rqsupport/analysis/training-mode |

**RW 实现**
- 每分钟计点按 Daniels 的常用值：E 0.2、M 0.4、T 0.6、I 1.0、R 1.5（Daniels 原书）。【RW 自定】A 区取 0.8（介于 T 和 I 之间），1 区以下取 0.1。
- 【RW 自定】CSV 只有平均值，所以每段取「心率强度（%HRR）」和「配速强度（VO₂(v) ÷ 当前跑力）」中较高者对应的区间，以此近似 RQ「间歇看配速、高温越野看心率」的自动切换。跑步机只用心率。
- Garmin 的 Training Stress Score 在这份导出里全部为 0；即使将来有数值，RW 也统一用训练指数，保持同一把尺（这是 RQ 文章 310 强调的原则）。

## 5. 体能、疲劳、状况

| 结论 | 可信度 | 出处 |
|---|---|---|
| 用 Banister（1975）的冲击-反应模型：状况 = 体能 − 疲劳 | 高 | https://www.runningquotient.com/article/single/99 ；https://www.runningquotient.com/article/single/275 |
| 体能主要参考过去 6 周（42 天）的训练加权；疲劳主要参考过去 7 天 | 高 | 文章 291 |
| **今天的状况 = 昨天的体能 − 昨天的疲劳** | 高 | 文章 275；https://runningquotient-support.gitbook.io/rq/rq-app/analysis/fitness |
| 训练期状况在 −2 ~ −7 最有效；低于 −8 属过度训练；−10 建议立即休息 | 高 | 文章 291 |
| 连续 3 天低于 −10 有过度训练风险；小秘书提醒：连续 3 天低于 −8 →「过度疲劳」，连续 7 天低于 −10 →「过量训练」 | 高 | https://www.runningquotient.com/site/qa ；文章 275 |
| 全马赛前状况最好在 0 ~ +5；比赛周转正但不要超过 +3；也有跑者在 −1 附近跑出好成绩 | 高 | 文章 275、291 |
| 小绿人状态文字：狀況良好 / 狀況普通 / 輕度疲勞 / 非常疲勞，具体分界没有公开 | 高（文字）/ 低（分界） | gitbook fitness 页 |
| 体能 ≈ 油箱容量，减量期体能下降不代表表现下降 | 高 | 文章 99 |

**RW 实现**
- 体能 CTLₜ = CTLₜ₋₁ + (负荷ₜ − CTLₜ₋₁)/42；疲劳 ATL 同理取 7；这是公认的标准写法。【RW 自定】RQ 的具体权重形式没有公开。
- 今日状况 = 昨日体能 − 昨日疲劳（照 RQ 原文）。
- 【RW 自定】色带：> +5 偏松；0 ~ +5 状况良好（赛前目标）；−2 ~ 0 状况普通；−7 ~ −2 有效训练（轻度疲劳）；−10 ~ −7 疲劳偏高；< −10 非常疲劳。−2/−7/−8/−10/0/+5 这几个数都来自 RQ 原文，只是把它们拼成连续色带是 RW 的做法。
- 【RW 自定】初值：取前 42 天日均负荷作为体能和疲劳的初值，避免从 0 起步。

## 6. 减量（Taper）

| 结论 | 可信度 | 出处 |
|---|---|---|
| 引用 Pfitzinger《进阶马拉松》：赛前三周开始减量，维持强度、减少里程；赛前第 3 周 −20~25%，第 2 周 −40%，比赛周（赛前 6 天）−60% | 高 | https://www.runningquotient.com/article/single/32 |
| 用状况指数确认减量是否执行到位，比赛前一天状况升到 0 以上 | 高 | 文章 32、275 |

**RW 实现**：减量模拟器默认用上面的比例，按每天负荷 = 基准日均负荷 × (1 − 减量%) 推演到比赛日早晨的状况；也可以调比例，并自动求出让比赛日状况落在 +2 所需的减量比例。

## 7. 比赛预测与跑者类型

| 结论 | 可信度 | 出处 |
|---|---|---|
| 各距离最佳成绩由跑力推估（Daniels 等效） | 高 | gitbook my-runlevel；文章 154 |
| 达不到短距离推估成绩说明速度是短板，达不到半马/全马说明耐力是短板 | 高 | 同上 |
| 竞赛跑力分析：按各距离竞赛跑力的斜率分为均衡型、速度型、耐力型、其他型 | 高 | https://www.runningquotient.com/article/single/118 |

**RW 实现**：用 Daniels 公式由跑力反推 3K/5K/10K/半马/全马时间。【RW 自定】跑者类型的斜率阈值没有公开，RW 用「长距离竞赛跑力 − 短距离竞赛跑力」的差值是否超过 ±1.5 来判断。

## 8. 跑量建议（适合自己的训练量）

| 结论 | 可信度 | 出处 |
|---|---|---|
| 用「当前跑力 vs 体能指数」散点图找跑力最高或开始停滞时的体能指数，作为训练量的上限；需要半年以上、带心率、有高低量周期的数据 | 高 | https://www.runningquotient.com/article/single/227 ；https://runningquotient-support.gitbook.io/rq-3/fintess/current-runlevel-vs.-fitness-value-scatter-chart |
| 猴子分类（按体能指数）：小 10–15、中小 15–20、中大 20–25、大 25–30、超大 > 30 | 高 | 同上 |

**RW 实现**：画每周的「当前跑力 vs 体能」散点图，取跑力最高的 10% 周对应的体能中位数作为参考上限，并给出猴子分类。由于 RW 的训练指数是近似值，绝对数值和 RQ 不完全可比。

## 9. 其他

- 有氧基础检测：用 1 区配速跑 90 分钟，心率漂移 (B−A)/A < 10% 为优秀，< 5% 达到国家级（https://runningquotient-support.gitbook.io/rq/rq-webside/running-tools/aerobicbasistest）。需要逐秒数据，CSV 做不到，RW 暂不实现。
- 最大心率修正：半年到一年实测一次；安静心率新手每 3–4 周测一次（FAQ）。

## 10. RW 明确没有照搬的内容

- RQ 的逐秒回归和逐秒强度加权：CSV 没有逐秒数据，RW 用平均值近似，所以即时跑力和训练指数都会有偏差。
- RQ 的课表、AI 教练、排行榜、徽章：与数据分析无关，不做。
