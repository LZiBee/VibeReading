# PPT Skill 集成技术路线实现

日期：2026-05-23

## 1. 目标

在当前论文阅读工作台中新增“基于 skill 路线的自动生成 PPT”能力，满足以下要求：

- 从论文、笔记、AI 问答、截图和参考文献中组织内容生成可编辑 `.pptx`
- 不把 Claude Code / Anthropic 的运行时直接嵌入产品，而是借用其 skill 组织方式
- 与现有 `packages/ai`、`packages/workbench`、`packages/pdf`、`packages/notes`、`packages/shared`、`packages/db` 解耦协作
- 保持 Renderer 不直接访问文件系统、数据库和密钥
- 先支持固定工作流，后续再逐步升级为更自主的 Agent

一句话结论：

> 采用“Anthropic skill 风格的任务说明 + 本地固定工作流 + 独立 PPT 导出包”的路线集成 `powerpoint-skill` 思路，而不是把 Claude 原生 skill 运行时整体接入桌面应用。

## 2. 总体判断

### 2.1 可以复用的部分

`powerpoint-skill` 和 Anthropic 官方 skills 最值得复用的是：

- `SKILL.md` 中的任务拆解方式
- 结构化产出约束
- 数学公式、图示、模板、审计脚本的组织思路
- “先生成中间结构，再渲染最终文档”的分层方法

### 2.2 不建议直接复用的部分

不建议把以下部分原样照搬进产品：

- Claude Code 的原生 skill 触发机制
- 与特定模型运行时耦合的工具协议
- 依赖开发机环境的完整外部流水线
- 以终端交互为中心的人工修正流程

原因是本项目是一个 Electron 桌面产品，不是 Claude Code 运行时本身。产品侧更需要稳定的命令链路、可追踪任务状态、可恢复导出任务和清晰的模块边界。

## 3. 技术路线

## 3.1 路线摘要

第一阶段采用：

```text
Skill 规范层
-> AI 结构化编排层
-> PPT 导出执行层
-> Workbench 命令接入层
-> Main/Preload 文件导出层
```

其中：

- Skill 规范层借鉴 Anthropic / `powerpoint-skill` 的写法，用于定义任务流程和输出约束
- AI 编排层放在 `packages/ai`，负责把论文内容整理成 `DeckSpec`
- PPT 导出执行层单独拆成新包，负责把 `DeckSpec` 转成 `.pptx`
- Workbench 负责提供命令、菜单和任务入口
- Main / Preload 负责导出路径、文件写入和长任务调度

## 3.2 为什么先不做重 Agent

“自动生成 PPT”虽然看起来像 Agent 场景，但它的主流程相对确定：

1. 收集材料
2. 生成大纲
3. 生成每页结构
4. 生成图示/公式资源
5. 渲染 PPT
6. 审计并导出

因此第一版更适合做成固定工作流，而不是开放式自主 Agent。这样可以：

- 降低幻觉和版式失控风险
- 更容易做失败重试和结果缓存
- 更容易插入人工确认步骤
- 更容易与现有命令系统集成

后续如果需要“自动补图、自动改写、自动多版本导出”，再把固定工作流升级为 Agent 编排即可。

## 4. 推荐架构

## 4.1 新增包与职责

建议新增：

```text
packages/ppt/
```

职责：

- `DeckSpec` 到 `.pptx` 的纯导出逻辑
- 模板、主题、版式、元素摆放
- 公式、图示、图片、封面、参考文献页渲染
- 版式审计与导出结果校验

说明：

- 当前 `docs/development/code-area.md` 还未列出 `packages/ppt`
- 真正开始实现时，需要同步补充代码区文档
- 不建议把这些逻辑塞进 `packages/ai` 或 `packages/notes`

## 4.2 各包分工

### `packages/shared`

定义跨包协议：

- `DeckIntent`
- `DeckSpec`
- `SlideSpec`
- `SlideElementSpec`
- `SlideAssetRef`
- `PptExportJob`
- `PptExportResult`
- `PptThemeConfig`
- `PptAuditIssue`

### `packages/ai`

负责内容理解与结构化编排：

- 读取论文、笔记、AI 回答、截图、引用信息
- 产出 `DeckIntent`
- 生成 `DeckSpec`
- 按 schema 校验结构
- 调用审计器进行内容压缩、分页、重写和补充说明

建议目录：

```text
packages/ai/src/
  ppt/
    workflow/
    prompts/
    schema/
    tools/
    services/
```

### `packages/ppt`

负责最终导出：

```text
packages/ppt/src/
  templates/
  themes/
  renderers/
  assets/
  audit/
  pipeline/
```

### `packages/workbench`

负责接入产品命令和菜单：

- `ppt.generateFromPaper`
- `ppt.generateFromNote`
- `ppt.generateFromSelection`
- `ppt.exportDeck`
- `ppt.openJobHistory`

### `packages/db`

负责持久化：

- 导出任务历史
- 任务状态
- 生成参数
- 选用模板
- 人工修订过的 `DeckSpec`
- 最终导出文件记录

### `apps/desktop/src/main` 与 `preload`

负责：

- 文件保存对话框
- 输出目录访问
- 后台任务调度
- 长任务状态广播

## 5. Anthropic Skill 风格的接入方式

## 5.1 接入原则

采用 Anthropic skill 的“组织方式”，而不是其“专属运行时”：

- 保留 `SKILL.md` 的任务规范价值
- 不依赖 Claude Code 自动触发
- 不依赖 Anthropic 专属 agent/tool 协议
- 由本项目自己的命令系统驱动执行

## 5.2 仓库内建议形态

建议在仓库中维护一份产品内参考 skill：

```text
docs/skills/ppt-export-skill.md
```

或在后续需要时，增加：

```text
packages/ai/src/ppt/skill/
  SKILL.md
  templates/
  examples/
  checklists/
```

作用不是给 Claude Code 直接安装，而是：

- 给开发者和模型统一提示规范
- 给 `packages/ai` 的工作流提供明确步骤
- 给测试和回归提供固定 checklist

## 5.3 推荐的 Skill 内容结构

建议包含：

1. 任务目标
2. 输入材料类型
3. 输出 schema
4. 幻灯片页数约束
5. 受众和语言风格
6. 公式与图示处理规则
7. 引用与致谢规则
8. 失败时的回退策略
9. 导出前审计清单

## 6. 数据结构设计

## 6.1 核心中间结构

建议第一版采用强约束 JSON 中间层，而不是直接让模型输出 PPT 指令。

### `DeckIntent`

表示一次导出的意图：

```ts
type DeckIntent = {
  sourceType: 'paper' | 'note' | 'selection' | 'conversation'
  sourceIds: string[]
  audience: 'self-study' | 'group-meeting' | 'class-report' | 'thesis-defense'
  language: 'zh-CN' | 'en-US'
  tone: 'academic' | 'briefing' | 'teaching'
  targetSlideCount: number
  templateId?: string
  includeReferences: boolean
  includeAgenda: boolean
  includeAppendix: boolean
}
```

### `DeckSpec`

表示完整演示文稿：

```ts
type DeckSpec = {
  title: string
  subtitle?: string
  themeId: string
  language: 'zh-CN' | 'en-US'
  audience: string
  slides: SlideSpec[]
  assets: SlideAssetRef[]
  citations: DeckCitationRef[]
  meta: {
    generatedAt: string
    sourceIds: string[]
    generatorVersion: string
  }
}
```

### `SlideSpec`

```ts
type SlideSpec = {
  id: string
  kind:
    | 'cover'
    | 'agenda'
    | 'section'
    | 'bullet'
    | 'two-column'
    | 'figure'
    | 'table'
    | 'quote'
    | 'comparison'
    | 'timeline'
    | 'references'
    | 'appendix'
  title: string
  notes?: string
  elements: SlideElementSpec[]
  sourceRefs: SourceRef[]
}
```

### `SlideElementSpec`

```ts
type SlideElementSpec =
  | { type: 'text'; text: string; style?: string }
  | { type: 'bullet-list'; items: string[]; style?: string }
  | { type: 'image'; assetId: string; caption?: string }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'quote'; text: string; citationId?: string }
  | { type: 'formula'; latex: string; displayMode?: boolean }
  | { type: 'diagram'; diagramKind: 'mermaid' | 'graphviz'; source: string }
```

## 6.2 设计原则

- AI 只负责生成语义结构，不直接决定底层 PowerPoint API 调用
- 导出器负责把语义结构映射到模板和版式
- 每一页都保留 `SourceRef`
- 每个图片、公式、图示都先转成可管理资产

## 7. 执行链路

## 7.1 命令入口

推荐命令：

```text
ppt.generateFromPaper
ppt.generateFromNote
ppt.generateFromSelection
ppt.exportDeck
ppt.retryJob
```

典型交互：

1. 用户在论文、笔记或 AI 面板发起“生成 PPT”
2. Workbench 打开参数表单
3. Renderer 调用受控 API 创建导出任务
4. Main/后台任务开始执行
5. AI 工作流生成 `DeckSpec`
6. PPT 导出器生成 `.pptx`
7. 审计通过后写入磁盘
8. UI 展示导出完成与问题列表

## 7.2 工作流步骤

### 第 1 步：材料收集

由 `packages/ai` 聚合：

- 当前论文元数据
- 选中的 PDF 片段
- 关联截图
- 结构化笔记
- AI 回答
- 参考文献信息

### 第 2 步：生成演示大纲

输出：

- 封面
- 议程
- 章节页
- 核心方法页
- 实验/结果页
- 结论页
- 参考文献页

此阶段只产出页面骨架，不产出最终措辞。

### 第 3 步：生成逐页 `SlideSpec`

为每页补足：

- 标题
- 要点
- 插图位
- 公式位
- 表格位
- 页内备注
- 来源引用

### 第 4 步：补资产

由本地工具准备：

- PDF 区域截图
- 论文图表裁切
- 公式渲染
- Mermaid / Graphviz 图示

### 第 5 步：版式审计

检查：

- 标题是否过长
- 要点是否超页
- 图片是否缺失
- 表格是否过宽
- 公式是否溢出
- 引用是否缺失

### 第 6 步：导出 PPTX

使用模板与主题，把 `DeckSpec` 渲染为 `.pptx`。

## 8. 导出层技术选型

## 8.1 第一阶段推荐

首选：

```text
PptxGenJS
```

原因：

- 与当前 TypeScript / Electron 工程栈一致
- 可直接生成原生 `.pptx`
- 不强依赖外部 Office 环境
- 方便先做 MVP

## 8.2 第二阶段增强

借鉴 `powerpoint-skill` 的这些能力：

- `PptxGenJS` 基础导出
- LaTeX 渲染
- Mermaid / Graphviz 图示渲染
- OMML 公式注入
- 版式重叠检查

可按需分批接入，不建议第一版一次性把所有外部依赖都拉进来。

## 8.3 暂不建议的做法

第一版暂不建议：

- 直接把 `pandoc + TeX + LibreOffice + Python + Graphviz` 整套依赖作为强制安装前置
- 直接依赖开发机命令行环境导出生产 PPT
- Renderer 直接读写导出文件

## 9. 与 `powerpoint-skill` 的映射关系

## 9.1 建议直接借鉴的部分

- Skill 文档结构
- 演示文稿内容规划流程
- 数学公式与图示资源生成思路
- 导出后审计思路
- 示例模板和版式分类方式

## 9.2 建议本地重写的部分

- 与 Claude Code 绑定的触发流程
- 终端交互流程
- 对外部系统命令的硬编码依赖
- 面向开发机的目录约定

## 9.3 推荐集成顺序

1. 先借内容结构和导出层设计
2. 再借资产处理脚本
3. 最后按需吸收高阶审计能力

## 10. 任务模型与状态管理

## 10.1 导出任务状态

建议在 `packages/db` 保存：

```ts
type PptExportJobStatus =
  | 'queued'
  | 'collecting'
  | 'outlining'
  | 'drafting'
  | 'rendering-assets'
  | 'auditing'
  | 'exporting'
  | 'completed'
  | 'failed'
  | 'cancelled'
```

## 10.2 任务表建议字段

- `id`
- `source_type`
- `source_ids_json`
- `intent_json`
- `deck_spec_json`
- `theme_id`
- `status`
- `progress_message`
- `output_file_path`
- `error_message`
- `created_at`
- `updated_at`

## 10.3 UI 反馈

建议在 Bottom Panel 或导出任务面板中显示：

- 当前阶段
- 已完成页数
- 审计警告
- 最终导出路径
- 失败原因与重试入口

## 11. MVP 范围

## 11.1 MVP 目标

第一版只做以下闭环：

1. 从当前论文生成 8 到 12 页学术汇报 PPT
2. 支持中文标题与正文
3. 支持封面、目录、方法、结果、结论、参考文献页
4. 支持从 PDF 裁切图表
5. 支持把关键 AI 总结转成要点
6. 导出为可编辑 `.pptx`

## 11.2 MVP 暂缓项

- 多套高级主题市场
- 复杂动画
- 大规模图表示意自动生成
- 完整 OMML 公式体系
- 直接复用全部 `powerpoint-skill` 外部依赖
- 多轮自主 Agent 改写

## 12. 分阶段实施

## Phase 0：方案定稿

产出：

- 本文档
- 决策日志
- 任务拆分文档

## Phase 1：中间结构与命令链路

实现：

- `packages/shared` 中的 `DeckSpec` 协议
- `packages/ai` 中的 PPT 工作流骨架
- `packages/workbench` 中的 PPT 命令
- `main/preload` 导出任务桥接

验收：

- 能创建导出任务
- 能保存 `DeckIntent`
- 能看到任务状态流转

## Phase 2：基础导出器

实现：

- 新增 `packages/ppt`
- 接入 `PptxGenJS`
- 先支持封面、要点页、图片页、参考文献页

验收：

- 能根据假数据 `DeckSpec` 导出有效 `.pptx`

## Phase 3：论文材料接入

实现：

- 从 `packages/pdf` 获取截图
- 从 `packages/notes` 获取结构化内容
- 从 `packages/ai` 获取总结文本

验收：

- 能从真实论文材料导出第一版汇报 PPT

## Phase 4：审计与质量提升

实现：

- 页内字数限制
- 图片缺失检查
- 表格宽度检查
- 引用缺失检查
- 简单自动重写策略

验收：

- 导出失败能给出明确问题
- 导出成功的版式稳定性明显提高

## Phase 5：高阶资产能力

按需接入：

- Mermaid
- Graphviz
- LaTeX 高级公式
- OMML
- 更多模板

## 13. 主要风险

## 13.1 版式不稳定

风险：

- AI 输出密度不稳定
- 不同页面元素组合差异大

应对：

- 先限制页面类型
- 引入字数预算和图片位预算
- 增加导出前审计器

## 13.2 依赖链过重

风险：

- 一次性引入 `powerpoint-skill` 的完整依赖会显著抬高安装和打包复杂度

应对：

- MVP 仅保留 Node/TS 主路径
- 高阶脚本按插件式接入

## 13.3 模型输出不稳定

风险：

- 同一论文可能输出不同结构

应对：

- 强制 schema
- 先生成大纲，再生成逐页结构
- 审计失败时自动压缩或回退

## 13.4 模块边界漂移

风险：

- 导出逻辑被塞进 Renderer 或 `packages/ai`

应对：

- 业务导出统一归入 `packages/ppt`
- 文件写入统一放主进程

## 14. 最终建议

推荐采用以下结论作为实现起点：

1. 不直接接入 Claude Code / Anthropic 原生 skill 运行时
2. 借用 Anthropic skill 的组织方式和 `powerpoint-skill` 的任务结构
3. 在项目内新增独立 `packages/ppt`
4. 使用 `packages/ai` 生成 `DeckSpec`
5. 使用 `PptxGenJS` 完成第一版导出
6. 后续按需吸收 `powerpoint-skill` 的公式、图示和审计能力

这条路线兼顾了：

- 与现有架构的兼容性
- 第一版实现成本
- 后续升级为 Agent 的空间
- 对外部模型和运行时的低耦合
