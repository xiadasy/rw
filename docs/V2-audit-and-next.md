# v2 复核与后续可行性（2026-11-25，上海时间）

## 本轮直接打开核验的公开来源
- RQ 导引手册「体能」：https://runningquotient-support.gitbook.io/rq/rq-app/analysis/fitness 。确认今天状况=昨天体能-昨天疲劳；强调累计数据与心率设置。并未公开RW完整权重/代码。
- RQ 2024-10-15「从数据看状况」：https://www.runningquotient.com/article/single/275 。全马0～+5只是参考，存在个人例外；文中连续3天<-10为风险提示。RQ中文较旧/不同版本阈值不一，不能把其阈值作为RW诊断标准。
- V.O2 FAQ：https://support.vdoto2.com/v-o2-faq/ 。明确VDOT不是VO2max，相同最大摄氧量可因经济性等因素取得不同成绩。配速应据近期实际能力而不是目标能力。
- 搜索交叉核验：Jack Daniels 本人解释伪最大摄氧量：https://www.runnersworld.com/advanced/a20825580/threshold-training-finding-your-vdot/ 。成绩等效要求赛道、天气、专项训练相近。

## “阿尔克”仍待确认
公开检索出现Alke（https://getalke.com/，综合AI健身）与Orka Run（https://www.orkarun.com/，跑步自适应课表）等不同产品，没有足够证据认定用户指哪一个。请用户提供链接或截图后再比较，不把任何一个强行视作目标。

## iPhone 桌面小组件（本轮未实现）
- 真正原生WidgetKit组件需要宿主iOS App及Widget扩展、Xcode构建、签名和真机验证；不是把网页添加到主屏幕。Apple官方：https://developer.apple.com/documentation/widgetkit/ 。刷新由系统时间线等机制管理，不能承诺秒级实时。
- 较轻路径是用户自行安装Scriptable，再导入脚本：ListWidget + Script.setWidget()。官方文档检索：https://scriptable.app/docs/reference/listwidget/ （旧文档地址https://docs.scriptable.app/listwidget/本次抓取404，但检索仍有内容）。refreshAfterDate只指定最早刷新时间，实际由iOS决定，不能保证每15分钟刷新。
- 无论哪条路，Safari localStorage都不是组件可读取的云数据库；需要用户明确同意的数据摘要发布或私有HTTPS API。当前仓库数据虽公开，不应扩大公开字段。本轮不安装应用、不启动服务、不创建脚本组件，也不做embed/PWA冒充。

## MCP 云端读取（本轮未部署）
- MCP远程服务需要支持JSON-RPC初始化与tools/list、tools/call等生命周期的HTTPS Streamable HTTP端点，不能把静态JSON称MCP。已读官方规范：https://modelcontextprotocol.io/specification/2025-06-18/basic/transports 。后续实现时按当时最新规范重新核验。
- 需要用户选定/授权可运行代码的托管环境、服务认证（面向兼容客户端的OAuth等）、私有数据存储、日志脱敏/访问审计、Origin校验、速率限制。GitHub Pages只提供静态文件，不能承载该后端或保存秘密。
- 建议先只读工具：get_training_status(asOf)、list_activities(from,to)、get_plan(from,to)；明确dataThrough/observedAt/modelVersion/incomplete。课表写入工具下一阶段再加，必须预览+用户确认，具备版本冲突/幂等保护。
- Garmin自动同步是另外一项数据接入授权与作业，不因有MCP就自动实现。没有新的同步时，必须显示最后数据日期，绝不能把运行时间说成数据更新时间。
- 本轮网页的课表、设置、导入活动仍只存当前浏览器，AI和其他设备读不到；用户可手动导出JSON后交给下一BOT。

## 执行环境记录
尝试加载grokbot-pi-dispatch技能，目录内SKILL.md缺失；pi-task命令不存在。已发现Pi CLI，用明确任务书委托pi --print完成本地代码更改，禁止Pi提交/推送；由协调执行器最终验收、正常提交与推送一次。

## 本轮验收补充
- Pi完成主体后，协调执行器发现严格整数秒导致Garmin原CSV只导入450/460条，已修复小数秒和超过99分钟兼容，实际重新导入460条全部通过。
- 保留并改进了减量情景模拟（不自动优化到某个状态值）、记录搜索/月份筛选/分页；计算器隐藏不相关字段。
- 已使用独立无登录的headless Chromium渲染本地静态页面，验证1440、390、320宽度全部10个导航页面；非用户签名浏览器会话。已进行计算器、课表新建/编辑/导入导出/刷新持久化及草案确认交互验收。
- `incomplete-lower-bound`指体能/疲劳的已知负荷下界，两者差值TSB并不是下界；界面已注明方向不确定。无活动记录日期与真实休息不可区分，这是活动导出数据的边界。
