# 代码解析功能采用固定工作流

- 日期：2026-05-24
- 状态：已采用
- 背景：需要为论文关联 GitHub 仓库识别、仓库拉取、代码分析、论文代码对应笔记生成设计第一版能力。功能涉及文件系统、Git、AI、MinerU 解析结果和笔记写入，不能让 Renderer 直接处理本地仓库。
- 方案：第一版采用“固定工作流 + skill 风格提示词 + 进度弹窗 + 手动确认”的路线。AI 栏只负责发起命令和展示状态；仓库拉取与扫描放到 Main/Worker；AI 负责论文代码对齐、注释和 Markdown 笔记生成；结果写入当前论文笔记。
- 取舍原因：
  - 固定工作流更容易复用现有 PPT / markmap 进度弹窗模式。
  - 代码仓库链接可能包含第三方依赖或参考文献仓库，必须保留人工确认。
  - 拉取仓库和扫描文件属于高权限长任务，必须留在 Renderer 之外。
  - 初版目标是稳定生成可编辑 Markdown 笔记，不需要开放式 Agent 或完整 IDE。
- 影响范围：
  - `packages/workbench` 需要新增代码解析命令。
  - `packages/shared` 需要新增代码解析任务、仓库候选、代码引用等协议类型。
  - `packages/ai` 需要新增代码分析 skill 风格 prompt、审计和 Markdown 组装逻辑。
  - 后续建议新增 `packages/code-analysis` 承担仓库静态扫描。
  - `apps/desktop/src/main` / `preload` 需要提供受控仓库拉取与任务状态 API。
- 后续动作：
  - 按 `docs/code-analysis-feature-plan.md` 拆分 Phase 1 到 Phase 6 实现任务。
  - 用已经收录的带仓库链接论文做仓库识别回归样本。
