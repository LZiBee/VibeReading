# 纳入 Zotero Web API 与 translators 接入

- 日期：2026-05-19
- 状态：已采用
- 背景：软件需要更好地融入科研文献管理生态，用户提出可考虑接入 Zotero Web API 和 Zotero 的抓取能力。
- 方案：将 Zotero 作为参考文献和文献库生态接入能力纳入规划。第一阶段优先支持 Zotero Web API 只读同步个人库、群组库、集合、条目、标签和笔记；元数据抓取通过 Zotero translators / translation-server 作为可选能力接入，并与 Crossref、OpenAlex、Semantic Scholar、GROBID 形成互补。
- 取舍原因：Zotero 原生插件依赖 Zotero 桌面端内部 API，不适合作为本软件的通用插件运行时；Web API 和 translators 更适合以受控服务形式接入，符合 Renderer 不接触 token、文件系统和数据库的架构边界。
- 影响范围：`packages/citations` 需要新增 Zotero adapter 和 metadata capture 能力；`packages/db` 需要保存 Zotero account、library、item mapping 和抓取任务；`packages/workbench` 需要注册 `zotero.*` 命令；`apps/desktop` 负责 OAuth、安全存储和可选 sidecar 生命周期。
- 后续动作：实现前先细化 Zotero OAuth、同步冲突、写回权限、translation-server 打包策略和许可证清单。

