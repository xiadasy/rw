# RW · 跑步训练分析

RW 是我自己用的跑步训练分析网页，只有一个静态页面，不需要后端。
方法参考 Jack Daniels 跑力公式、Banister 冲击-反应（体能/疲劳）模型和公开的跑步科学文章，**与任何商业平台无关**。所有数值都是估算，只作训练参考。

## 打开方式

- 本地：直接双击 `index.html`；或在仓库目录运行 `python3 -m http.server 8000`，再打开 http://localhost:8000
- GitHub Pages：仓库 Settings → Pages → Source 选 `main` 分支根目录，即可在手机上访问（仓库保持私有时需要相应的 Pages 权限）。

## 页面

| 页 | 内容 |
|---|---|
| 总览 | 比赛倒计时、目标与推估、当前跑力 / 体能 / 疲劳 / 状况、状况色带、默认减量估计、近 12 周跑量 |
| 跑力 | 当前跑力与即时跑力趋势、比赛点、目标线、取样统计、竞赛跑力与校准建议 |
| 负荷 | 体能(CTL 42 天)/疲劳(ATL 7 天)/状况(TSB) 曲线和色带、**减量模拟器**（方案、比例、休息天、自动求解到 +2）、每周训练指数、跑量甜区 |
| 跑量 | 周跑量、月度表、最长 10 次 |
| 区间 | 心率区间、配速区间、各区训练指数分布 |
| 配速表 | 按跑力推出 E/M/T/A/I/R 六区配速、储备心率区间、阈值心率对照 |
| 预测 | Daniels 比赛成绩预测与计算器 |
| 记录 | 全部训练，筛选/排序/搜索，星号标记比赛，标出被排除的原因 |
| 方法 | 所有公式和 RW 自定的参数 |
| 设置 | 静息/最大/阈值心率、比赛与目标、校准开关、导入 CSV、导出 |

设置、手动标记的比赛、浏览器内导入的数据都存在本机浏览器 localStorage，不上传。

## 更新数据

方法一（推荐，数据进仓库）：

1. 在 Garmin Connect「活动」列表导出 CSV（Activities.csv）。
2. 运行：
   ```bash
   python3 scripts/build_data.py ~/Downloads/Activities.csv
   ```
   会生成 `data/activities.json` 和 `data/activities.js`（页面读取后者，`file://` 也能打开）。
3. `git add data && git commit -m "更新数据" && git push`

方法二（临时）：页面「设置 → 导入 CSV」，选择合并或替换，只存在当前浏览器。

## 需要自己确认的参数

- **静息心率默认 48，是假设值**。请在设置里改成晨起实测值，它直接影响心率区间、即时跑力和训练指数。
- 最大心率默认取记录中最大心率的第 99 百分位；有实测值请填写。
- 只有每次训练的平均值（没有逐秒数据），所以间歇课的训练指数会偏低，即时跑力只取稳定跑。

## 目录

```
index.html              页面骨架
assets/style.css        样式（暗色主题）
assets/engine.js        计算引擎：解析、合并、跑力、训练指数、CTL/ATL/TSB、减量模拟、预测
assets/app.js           界面与图表
assets/vendor/          Chart.js 4.4.6
data/activities.*       训练数据（由脚本生成）
scripts/build_data.py   Garmin CSV → JSON
docs/RQ-methods-research.md  公开方法调研笔记（带来源链接和可信度）
```
