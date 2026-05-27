# PPT Skill 集成路线决策

- 日期：2026-05-23
- 状态：已采用

## 背景

项目后续规划支持从论文、笔记、AI 问答和截图自动生成汇报 PPT。当前讨论的候选路线有两类：

- 直接引入 Anthropic / Claude Code 风格的 skill 运行时
- 借用 Anthropic skill 的组织方式，在现有 Electron + Workbench 架构内自建导出工作流

同时，外部已有 `powerpoint-skill` 一类开源方案，具备较成熟的文档结构、脚本资产和导出思路，但与本项目当前运行时并不一致。

## 决策

采用“Anthropic skill 风格组织方式 + 本地固定工作流 + 独立 PPT 导出包”的路线实现 PPT 生成功能。

具体约束如下：

1. 不把 Claude Code / Anthropic 原生 skill 运行时直接嵌入产品
2. 借鉴 `powerpoint-skill` 的任务拆解、审计思路和资源组织方式
3. 在项目内新增独立 `packages/ppt` 负责 `.pptx` 导出
4. `packages/ai` 负责生成结构化 `DeckSpec`，不直接承担底层 PowerPoint 渲染
5. `packages/workbench` 负责命令、菜单和任务入口
6. Main / Preload 负责文件导出和长任务调度

## 取舍原因

### 采用该方案的原因

- 与当前 Electron + React + TypeScript + Workbench 架构最兼容
- 能复用 skill 的结构化规范，而不被特定模型运行时锁死
- 更适合做任务状态管理、失败重试和人工确认
- 更容易遵守 Renderer 不直接读写文件系统的安全边界
- 可以先做固定工作流，后续再平滑升级为 Agent

### 不采用“直接嵌入 Anthropic 原生运行时”的原因

- 与当前产品运行时不一致
- 工具触发机制、权限模型和执行链路不适合直接移植到桌面产品
- 会抬高模型与平台耦合度

### 不采用“一次性全量引入 `powerpoint-skill` 完整依赖”的原因

- `pandoc`、TeX、LibreOffice、Graphviz、Python 等依赖链过重
- 第一版目标是跑通 MVP，而不是一次性覆盖所有高级导出能力
- 打包、安装、跨平台维护成本过高

## 影响范围

- `packages/shared`
- `packages/ai`
- 新增 `packages/ppt`
- `packages/workbench`
- `packages/db`
- `apps/desktop/src/main`
- `apps/desktop/src/preload`
- `docs/development/code-area.md`

## 后续动作

1. 依据 `docs/ppt-skill-integration-technical-route.md` 拆分实现任务
2. 先定义 `DeckSpec`、`SlideSpec` 和导出任务状态
3. 先用 `PptxGenJS` 跑通最小可用导出链路
4. 实现稳定后再分批吸收图示、公式和审计增强能力
