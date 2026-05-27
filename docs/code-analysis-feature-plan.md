# 代码解析功能初版计划书

日期：2026-05-24

## 1. 目标

在当前论文阅读工作台中新增“代码解析”能力，让用户可以从一篇带 GitHub 仓库链接的论文出发，完成以下闭环：

1. 在 AI 栏点击“代码解析”按钮。
2. 弹出类似 markmap / PPT 生成的进度菜单。
3. 检查当前论文是否已有 MinerU 解析结果。
4. 未解析时允许用户先解析论文，解析完成后继续代码解析流程。
5. 从解析文本中识别论文对应 GitHub 仓库链接。
6. 未识别到仓库链接时允许用户手动输入。
7. 根据仓库链接拉取代码到本地缓存。
8. 扫描并分析仓库结构。
9. 将论文段落、方法模块、实验描述与代码文件建立对应关系。
10. 生成一份 Markdown 代码解析笔记，写入当前论文的笔记列表，并可用当前 Milkdown/Markdown 笔记编辑器查看。

一句话结论：

> 第一版采用“固定工作流 + skill 风格提示词 + 进度弹窗 + 手动确认”的方式实现，不做开放式自主 Agent，也不在 Renderer 直接访问文件系统或执行 Git。

## 2. MVP 范围

### 2.1 第一版必须完成

- AI 栏新增“代码解析”入口。
- 点击后打开进度弹窗。
- 识别当前论文解析状态：已解析 / 未解析。
- 未解析时展示“解析文章”按钮。
- 已解析时扫描 MinerU 输出里的 GitHub 仓库候选链接。
- 支持多候选链接选择。
- 没有候选链接时支持手动输入 GitHub URL。
- 支持拉取仓库到本地缓存目录。
- 支持扫描仓库文件树、README、配置文件、核心源码目录。
- 支持调用 AI 生成论文与代码对应说明。
- 自动生成 Markdown 笔记并加入当前论文笔记。

### 2.2 第一版暂缓

- 不执行仓库里的训练、推理、安装脚本。
- 不自动安装依赖。
- 不写入或修改被拉取的仓库。
- 不做完整 IDE 式代码编辑器。
- 不做跨多仓库复杂依赖图。
- 不做 GitHub OAuth 或私有仓库访问。
- 不做完整数据库迁移，先沿用当前应用状态和笔记保存链路，后续再迁到 `packages/db`。

## 3. 产品交互

## 3.1 AI 栏入口

在 AI 栏快捷操作区增加一个按钮：

```text
代码解析
```

建议图标：

- `codicon-code`
- 或 `codicon-github`

按钮启用条件：

- 当前有选中的 PDF。
- PDF 已在 Library 或打开列表中。

按钮点击后执行 Workbench 命令：

```text
codeAnalysis.analyzeCurrentPaper
```

## 3.2 进度弹窗

弹窗风格对齐当前 PPT / markmap 进度面板，不做新的一套交互。

步骤建议：

```text
1. 检查文章
2. 解析文章
3. 识别仓库
4. 确认仓库
5. 拉取仓库
6. 扫描代码
7. 论文代码对齐
8. 生成笔记
```

每一步展示：

- 状态：等待中 / 进行中 / 成功 / 失败 / 跳过。
- 简短说明。
- 调试详情，可展开查看。
- 失败原因和重试入口。

## 3.3 状态分支

### 情况 A：论文已解析且识别到仓库

```text
点击代码解析
-> 检查到 MinerU 解析结果
-> 扫描出 GitHub 候选链接
-> 用户确认仓库
-> 拉取仓库
-> 分析代码
-> 生成笔记
```

### 情况 B：论文未解析

```text
点击代码解析
-> 提示“当前论文还未解析”
-> 用户点击“解析文章”
-> 复用 MinerU 解析流程
-> 解析完成后自动继续识别仓库
```

这里应复用 markmap 已经跑通的“未解析先提示解析，解析后继续生成”的闭环。

### 情况 C：论文已解析但没有识别到仓库

```text
点击代码解析
-> 检查到 MinerU 解析结果
-> 没有找到可靠 GitHub 链接
-> 用户手动输入仓库 URL
-> 校验 URL
-> 拉取仓库
-> 分析代码
-> 生成笔记
```

### 情况 D：识别到多个仓库候选

弹窗显示候选列表：

```text
推荐  https://github.com/SysCV/SAM-HQ
备选  https://github.com/facebookresearch/segment-anything
低置信度  https://github.com/open-mmlab/mmdetection
```

每个候选显示：

- URL。
- 置信度。
- 命中位置：摘要前、正文、脚注、参考文献、附录。
- 命中上下文。
- 选择按钮。

默认选中最高置信度候选，但必须允许用户手动改选。

## 4. 仓库链接识别策略

## 4.1 基本判断

根据前序 MinerU 实测，仓库链接优先从 MinerU 输出 Markdown 中扫描：

```text
MinerU result.markdown / full.md
-> github.com 正则抽取
-> URL 规范化
-> 上下文打分
-> 候选排序
```

暂不依赖 MinerU 是否提供特殊链接节点。当前实测结论是：可稳定从 `full.md` 文本中抽到链接。

## 4.2 MVP 支持的 URL

第一版只支持 GitHub 仓库：

```text
https://github.com/{owner}/{repo}
http://github.com/{owner}/{repo}
github.com/{owner}/{repo}
```

统一规范化为：

```text
https://github.com/{owner}/{repo}
```

需要过滤：

- `github.com/{owner}` 这类不完整链接。
- `github.com/{owner}/{repo}/issues/...`
- `github.com/{owner}/{repo}/pull/...`
- `github.com/{owner}/{repo}/blob/...`，可回退到仓库根路径。
- 明显不是仓库的页面链接。

## 4.3 置信度打分

建议打分维度：

| 维度 | 加分或降权 |
|---|---|
| 出现在标题页、摘要后、引言前 | 高加分 |
| 上下文包含 `code`、`source code`、`implementation`、`project page`、`available at` | 高加分 |
| 仓库名与论文标题、方法缩写相似 | 加分 |
| 同一链接在正文重复出现 | 加分 |
| 出现在 reference / bibliography | 降权 |
| 上下文像第三方依赖，例如 PyTorch、Detectron、MMDetection | 降权 |
| 只出现在对比方法或参考文献条目里 | 降权 |
| 链接过多且没有明确官方上下文 | 需要用户确认 |

第一版可以先给出简单分数：

```ts
type RepositoryCandidateConfidence = 'high' | 'medium' | 'low'
```

后续再升级成 0 到 1 的数值评分。

## 4.4 反例过滤

前序样本中已经遇到两类反例：

- 论文正文只出现依赖库链接。
- 参考文献里出现其他论文项目仓库。

因此第一版必须避免“扫到第一个 GitHub 就自动拉取”。所有候选都要经过上下文打分；低置信度候选进入手动确认，不直接执行。

## 5. 仓库拉取策略

## 5.1 执行位置

仓库拉取必须在 Main / Worker 侧执行，Renderer 只发起受控任务：

```text
Renderer AI 栏
-> Workbench command
-> Preload 受控 API
-> Main code analysis task
-> Git clone / cache
-> 状态事件回传 Renderer
```

Renderer 不直接访问：

- 文件系统。
- Git 命令。
- 仓库本地路径。
- API Key。

## 5.2 本地缓存位置

建议放在应用数据目录下：

```text
{userData}/repositories/{paperHash}/{owner}__{repo}/
```

同时保存元数据：

```text
repository.json
```

字段建议：

- `url`
- `owner`
- `repo`
- `localPath`
- `defaultBranch`
- `commitSha`
- `clonedAt`
- `updatedAt`
- `paperPathHash`

日志里不要记录完整隐私路径，只记录脱敏后的仓库名、论文显示名和任务 ID。

## 5.3 拉取方式

第一版优先：

```text
git clone --depth 1 {url}
```

如果本地已存在：

- 默认复用缓存。
- 提供“重新拉取”或“刷新仓库”入口。
- 刷新时用受控参数调用 `git fetch`，不要拼接 shell 字符串。

可选降级：

- 如果用户没有安装 Git，后续可通过 GitHub zip 下载兜底。
- MVP 可以先提示“未检测到 Git，请安装 Git 后重试”。

## 5.4 安全约束

- 只允许 HTTPS GitHub URL。
- 不支持 `file://`、`ssh://`、本地路径或任意 shell 参数。
- 不执行仓库里的任何脚本。
- 不安装依赖。
- 不上传完整仓库到模型。
- 只把筛选后的 README、文件树、关键片段和必要摘要送入 AI。

## 6. 代码分析流程

## 6.1 总体流水线

```text
论文解析结果
-> 仓库候选识别
-> 用户确认仓库
-> 拉取仓库
-> 本地静态扫描
-> 论文结构摘要
-> 代码结构摘要
-> 论文段落与代码模块对齐
-> AI 自动注释
-> Markdown 笔记生成
```

## 6.2 本地静态扫描

不依赖 AI 的扫描内容：

- 文件树。
- README / docs。
- package 配置：`package.json`、`pyproject.toml`、`requirements.txt`、`setup.py`、`environment.yml`。
- 训练入口：`train.py`、`tools/train*`、`scripts/train*`。
- 推理入口：`infer.py`、`demo.py`、`predict.py`、`app.py`。
- 评估入口：`eval.py`、`test.py`、`tools/test*`。
- 数据集相关：`datasets/`、`data/`、`dataloader`。
- 模型相关：`models/`、`modeling/`、`networks/`、`modules/`、`architecture`。
- 配置相关：`configs/`、`config/`、`*.yaml`、`*.json`。
- Notebook 和 demo 文件。

输出结构：

```ts
type RepositoryInventory = {
  rootName: string
  url: string
  commitSha?: string
  languages: Array<{ language: string; fileCount: number }>
  packageManagers: string[]
  readmeFiles: CodeFileRef[]
  entrypoints: CodeFileRef[]
  modelFiles: CodeFileRef[]
  trainingFiles: CodeFileRef[]
  evaluationFiles: CodeFileRef[]
  datasetFiles: CodeFileRef[]
  configFiles: CodeFileRef[]
  docsFiles: CodeFileRef[]
  warnings: string[]
}
```

## 6.3 AI 对齐分析

AI 输入只使用压缩后的上下文：

- 论文标题和摘要。
- MinerU 章节标题与关键方法段落。
- 论文中的算法、公式、模型结构、实验设置片段。
- 仓库 README 摘要。
- 文件树摘要。
- 关键文件片段，每个文件限制行数和字符数。

AI 产出：

```ts
type PaperCodeMapping = {
  paperSection: string
  paperPageNo?: number
  paperSourceRefs: SourceRef[]
  codeRefs: CodeReference[]
  explanation: string
  confidence: 'high' | 'medium' | 'low'
  openQuestions: string[]
}
```

`CodeReference` 建议：

```ts
type CodeReference = {
  repositoryId: string
  path: string
  startLine?: number
  endLine?: number
  symbolName?: string
  role:
    | 'model'
    | 'training'
    | 'inference'
    | 'evaluation'
    | 'dataset'
    | 'config'
    | 'utility'
    | 'demo'
    | 'document'
  reason: string
}
```

## 6.4 AI 自动注释

第一版不把注释写入代码文件，只生成笔记里的“自动注释”区块。

注释粒度：

- 仓库级：这个仓库如何对应论文。
- 目录级：核心目录职责。
- 文件级：每个关键文件对应论文哪个模块。
- 片段级：关键函数或类的作用，为什么与论文段落相关。

示例：

```md
### `models/sam_hq/modeling/mask_decoder_hq.py`

对应论文中 HQ-Output Token 与 mask decoder 改造部分。这个文件扩展了基础 SAM 的 mask decoder，用于生成更高质量的分割结果。

论文来源：方法部分，第 3 页附近。
代码角色：model
置信度：high
```

## 7. Markdown 笔记输出

## 7.1 生成方式

第一版生成一份新的笔记，标题建议：

```text
代码解析：{论文标题}
```

内容以 Markdown 为主，可由 Milkdown 打开和继续编辑。

## 7.2 推荐结构

```md
# 代码解析：{论文标题}

> 仓库：{repoUrl}
> Commit：{commitSha}
> 生成时间：{generatedAt}

## 1. 解析结论

- 这篇论文的主仓库是 ...
- 代码结构主要分为 ...
- 与论文方法最相关的文件是 ...

## 2. 仓库结构

```text
repo/
  models/
  datasets/
  train.py
  demo.py
```

## 3. 论文与代码对应表

| 论文位置 | 代码位置 | 对应说明 | 置信度 |
|---|---|---|---|
| Method, p.3 | `models/...` | ... | high |

## 4. 关键模块注释

### `path/to/file.py`

说明...

```python
def forward(...):
    ...
```

## 5. 如何阅读这个仓库

1. 先看 README。
2. 再看模型定义。
3. 再看训练和评估入口。

## 6. 待人工确认

- 哪些映射置信度低。
- 哪些文件可能是第三方依赖或未在论文中解释。
```

## 7.3 代码显示器

MVP：

- 使用 Markdown 代码围栏展示关键片段。
- 交给当前 Milkdown/Markdown 笔记编辑器渲染。
- 在代码块上方显示文件路径、行号范围和说明。

下一阶段：

- 增加专门的 `code_reference` 笔记块或代码预览组件。
- 可选使用 Shiki / CodeMirror 做更漂亮的语法高亮。
- 支持点击代码引用打开只读代码片段弹窗。
- 支持 AI 注释作为行旁说明，但仍不修改仓库文件。

## 8. Skill 风格设计

## 8.1 接入原则

复用 PPT / markmap 的做法：

- 借用 skill 的任务组织方式。
- 不接入 Claude Code 原生 skill 运行时。
- 本产品自己的命令和任务队列负责执行。
- AI 只负责分析、对齐和生成文本，不直接执行 Git 或读写文件。

## 8.2 推荐 skill 列表

```text
code.repository.discover
code.repository.fetch
code.repository.inventory
code.paper.digest
code.paper.align
code.annotation.generate
code.note.compose
code.analysis.audit
```

### `code.repository.discover`

目标：从 MinerU Markdown 中提取并排序仓库候选链接。

输入：

- 论文标题。
- MinerU Markdown。
- MinerU blocks。

输出：

- `RepositoryCandidate[]`。

约束：

- 不把第一个 GitHub 链接直接当成主仓库。
- 必须区分正文仓库链接与参考文献/依赖链接。

### `code.repository.fetch`

目标：拉取用户确认的仓库。

输入：

- 规范化 GitHub URL。
- 当前论文 ID 或路径 hash。

输出：

- `RepositoryRef`。
- 本地缓存元数据。

约束：

- 只允许 HTTPS GitHub。
- 不执行仓库脚本。

### `code.repository.inventory`

目标：扫描仓库结构并生成压缩摘要。

输入：

- 本地仓库缓存路径。

输出：

- 文件树摘要。
- 关键文件列表。
- README 摘要。
- 语言和框架判断。

约束：

- 忽略 `.git`、大文件、二进制、构建产物、数据集目录。
- 单文件读取大小有限制。

### `code.paper.align`

目标：建立论文结构与代码模块的对应关系。

输入：

- 论文摘要和关键章节。
- 仓库 inventory。
- 关键代码片段。

输出：

- `PaperCodeMapping[]`。

约束：

- 必须标记置信度。
- 不能把没有证据的推断写成确定结论。

### `code.annotation.generate`

目标：为关键文件和代码片段生成解释性注释。

输出：

- 文件级说明。
- 函数/类级说明。
- 与论文段落的对应说明。

### `code.note.compose`

目标：把分析结果组装成 Markdown 笔记。

输出：

- Markdown 文本。
- 可选 `SourceRef` 和 `CodeReference` 元数据。

### `code.analysis.audit`

目标：审计输出质量。

检查：

- 是否有仓库 URL。
- 是否有 commit 信息。
- 是否至少包含 3 个关键代码引用。
- 是否标记低置信度映射。
- 是否误把依赖仓库当作主仓库。
- 是否生成过长代码片段。

## 8.3 skill 文档落点

建议后续新增：

```text
docs/skills/code-analysis-skill.md
```

或在实现期放入：

```text
packages/ai/src/code/skill/
  SKILL.md
  prompts/
  checklists/
```

第一版推荐先放 `docs/skills/code-analysis-skill.md`，便于产品和开发共同迭代。

## 9. 模块设计

## 9.1 `packages/shared`

新增跨包类型：

```ts
type RepositoryCandidate
type RepositoryRef
type RepositoryInventory
type CodeReference
type PaperCodeMapping
type CodeAnalysisJob
type CodeAnalysisJobStatus
type CodeAnalysisResult
type CodeAnalysisAuditIssue
```

建议状态：

```ts
type CodeAnalysisJobStatus =
  | 'queued'
  | 'checking-paper'
  | 'parsing-paper'
  | 'discovering-repository'
  | 'waiting-repository-confirmation'
  | 'fetching-repository'
  | 'scanning-repository'
  | 'aligning-paper-code'
  | 'generating-note'
  | 'completed'
  | 'failed'
  | 'cancelled'
```

## 9.2 `packages/ai`

新增：

```text
packages/ai/src/code/
  index.ts
  repositoryDiscovery.ts
  prompts.ts
  noteComposer.ts
  audit.ts
  types.ts
```

职责：

- 仓库候选链接打分的纯逻辑。
- 论文与代码对齐 prompt。
- AI 输出解析与审计。
- Markdown 笔记组装。

## 9.3 新增 `packages/code-analysis`

建议新增专门业务包：

```text
packages/code-analysis/
```

职责：

- 仓库静态扫描。
- 文件树压缩。
- 关键文件筛选。
- 代码片段提取。
- 语言和框架识别。

说明：

- 这个包不负责 UI。
- 这个包不直接调用模型。
- 这个包可以被 Main / Worker 调用。
- Renderer 不能直接调用其中涉及文件系统的能力。

## 9.4 `packages/workbench`

新增命令：

```text
codeAnalysis.analyzeCurrentPaper
codeAnalysis.retryJob
codeAnalysis.cancelJob
codeAnalysis.openGeneratedNote
```

后续可选命令：

```text
codeAnalysis.refreshRepository
codeAnalysis.openRepositorySummary
codeAnalysis.copyMarkdown
```

## 9.5 `apps/desktop/src/main`

新增主进程任务能力：

```text
apps/desktop/src/main/codeAnalysis.ts
apps/desktop/src/main/repositoryCache.ts
```

职责：

- Git 检测。
- GitHub URL 校验。
- 仓库 clone / fetch。
- 缓存目录管理。
- 任务状态广播。
- 文件扫描调度。

## 9.6 `apps/desktop/src/preload`

新增受控 API：

```ts
window.thesisAgent.startCodeAnalysis(input)
window.thesisAgent.confirmCodeRepository(input)
window.thesisAgent.cancelCodeAnalysis(jobId)
window.thesisAgent.onCodeAnalysisProgress(listener)
```

Renderer 只通过这些 API 访问代码解析任务。

## 9.7 `apps/desktop/src/renderer`

新增或扩展：

```text
AI 栏快捷按钮
CodeAnalysisProgressDialog
RepositoryCandidatePicker
ManualRepositoryInput
```

第一版可以先放在 `App.tsx` 中对齐当前 PPT / markmap 实现；后续再拆成独立组件。

## 9.8 `packages/notes`

第一版不必新增复杂笔记类型。

优先方式：

- 生成 Markdown。
- 用现有 NoteDocument / Milkdown 入口打开。
- 为整篇生成笔记保存当前论文来源。

后续增强：

- 增加 `code_reference` 复杂块。
- 为每个代码引用保存 `CodeReference` 元数据。
- 让论文来源和代码来源都能点击跳转。

## 10. 数据结构草案

```ts
type RepositoryCandidate = {
  id: string
  url: string
  normalizedUrl: string
  owner: string
  repo: string
  confidence: 'high' | 'medium' | 'low'
  score: number
  source: 'mineru-markdown' | 'manual'
  pageNo?: number
  context: string
  reason: string
  warnings: string[]
}

type RepositoryRef = {
  id: string
  url: string
  owner: string
  repo: string
  localPath?: string
  defaultBranch?: string
  commitSha?: string
  clonedAt?: string
  updatedAt?: string
}

type CodeAnalysisJob = {
  id: string
  paperId: string
  paperPath: string
  status: CodeAnalysisJobStatus
  repositoryCandidates: RepositoryCandidate[]
  selectedRepository?: RepositoryRef
  inventory?: RepositoryInventory
  mappings?: PaperCodeMapping[]
  noteId?: string
  markdown?: string
  warnings: string[]
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
```

## 11. 与现有功能的复用关系

## 11.1 复用 MinerU

复用现有 MinerU 解析状态：

- `mineruParseResultByPdfPath`
- `mineruCacheExistsByPdfPath`
- 当前解析弹窗和 API Key 配置。

未解析时不单独做新解析器，而是走已有 MinerU 流程。

## 11.2 复用 markmap 的状态闭环

代码解析与 markmap 一样，需要：

- 检查解析结果。
- 未解析时提示解析。
- 解析完成后自动继续原任务。

可以借鉴当前 `pendingMindmapAfterParsePath` 的做法，新增：

```text
pendingCodeAnalysisAfterParsePath
```

## 11.3 复用 PPT 的进度弹窗

代码解析进度比 PPT 多“仓库确认”和“手动输入”两个分支，但整体弹窗模式一致：

- 步骤列表。
- 当前消息。
- warning 分区。
- error 分区。
- 调试快照。
- 完成后操作按钮。

## 11.4 复用 Milkdown

MVP 不做独立代码编辑器，先输出 Markdown 笔记：

- 代码围栏展示片段。
- 表格展示论文到代码映射。
- 用户可以继续编辑、导出 Markdown / Word / PDF。

这和当前 Milkdown 导出能力可以自然衔接。

## 12. 分阶段实施计划

## Phase 0：计划与样本验证

产出：

- 本计划书。
- 前序样本论文作为回归集合。
- 仓库链接识别策略确认。

验收：

- 6 篇样本论文可作为链接识别测试输入。
- 至少包含 2 个反例用于依赖链接过滤。

## Phase 1：命令与弹窗骨架

实现：

- Workbench 新增 `codeAnalysis.analyzeCurrentPaper`。
- AI 栏新增“代码解析”按钮。
- Renderer 新增代码解析进度弹窗。
- 支持检查当前论文是否已解析。
- 未解析时提示解析。

验收：

- 点击按钮能打开弹窗。
- 已解析和未解析状态展示正确。
- 未解析时能进入现有 MinerU 解析流程。

## Phase 2：仓库候选识别与手动输入

实现：

- 从 MinerU Markdown 扫描 GitHub URL。
- 规范化 URL。
- 上下文打分。
- 候选列表展示。
- 手动 URL 输入与校验。

验收：

- 对 `HQ-SAM`、`Grounding-DINO`、`SAM2`、`COPL`、`MMCA`、`HQTrack` 能识别主仓库。
- 对依赖/参考仓库反例不会自动高置信度选中。
- 无链接论文可手动输入。

## Phase 3：仓库拉取与缓存

实现：

- Main 侧新增仓库缓存服务。
- 支持 `git clone --depth 1`。
- 支持读取 commit sha。
- 支持任务进度回传。
- 支持失败提示。

验收：

- 用户确认仓库后可拉取到本地缓存。
- Renderer 不直接访问本地仓库路径。
- 无 Git 环境时给出明确错误。

## Phase 4：仓库静态扫描

实现：

- 新增 `packages/code-analysis`。
- 生成文件树摘要。
- 识别 README、训练、推理、模型、数据集、配置、评估文件。
- 忽略大文件和二进制文件。

验收：

- 能为真实仓库生成 `RepositoryInventory`。
- 对大仓库扫描不会卡死 UI。
- 扫描结果能进入进度弹窗调试快照。

## Phase 5：AI 对齐与注释生成

实现：

- `packages/ai/src/code` 新增 prompt 和输出解析。
- 生成 `PaperCodeMapping[]`。
- 生成文件级和片段级解释。
- 审计低置信度映射。

验收：

- 至少生成 3 个论文段落到代码文件的映射。
- 每个映射有说明和置信度。
- 不确定内容进入“待人工确认”，不伪装成确定结论。

## Phase 6：Markdown 笔记生成

实现：

- 组合 Markdown。
- 创建当前论文的新笔记。
- 打开笔记面板并选中新笔记。
- 支持用户继续用 Milkdown 编辑和导出。

验收：

- 代码解析完成后，当前论文笔记列表出现新笔记。
- 笔记包含仓库 URL、commit、结构摘要、映射表、关键模块注释。
- 代码片段显示正常。

## Phase 7：代码显示与交互增强

增强：

- 专门的代码片段预览弹窗。
- 语法高亮。
- 点击代码引用定位到片段。
- 代码引用块带路径、行号、复制按钮。
- 笔记内 AI 注释可折叠。

## 13. 验收标准

第一版完成时应满足：

- AI 栏有“代码解析”按钮。
- 解析状态检查准确。
- 未解析论文可先解析再继续。
- 已解析论文可识别 GitHub 仓库候选。
- 无链接时可手动输入。
- 可拉取公开 GitHub 仓库。
- 可扫描仓库结构。
- 可生成论文与代码对应 Markdown。
- Markdown 自动写入当前论文笔记。
- 失败时有明确错误提示和日志记录。
- Renderer 没有直接访问文件系统、Git 或密钥。

## 14. 风险与应对

## 14.1 错把依赖仓库当主仓库

风险：

- 论文里常出现第三方库、基线方法和参考文献仓库。

应对：

- 做上下文打分。
- 低置信度必须人工确认。
- 参考文献区域默认降权。

## 14.2 大仓库扫描过慢

风险：

- 仓库文件多、二进制多、数据目录大。

应对：

- 忽略 `.git`、`data`、`datasets/raw`、`checkpoints`、`weights`、`runs`、`outputs` 等目录。
- 限制扫描文件数、单文件大小和总字符数。
- 长任务放 Main/Worker。

## 14.3 AI 对齐幻觉

风险：

- 模型可能把不相关文件解释成论文实现。

应对：

- 每条映射必须带置信度。
- 低置信度进入待确认。
- prompt 明确“证据不足时不要确定匹配”。
- 审计要求至少引用代码路径和论文来源。

## 14.4 安全风险

风险：

- 仓库代码可能包含恶意脚本。

应对：

- 只 clone 和读取文本。
- 不执行任何仓库代码。
- 不安装依赖。
- URL 白名单只允许 HTTPS GitHub。

## 14.5 隐私风险

风险：

- 本地路径、论文原文、仓库路径进入日志或模型上下文。

应对：

- 日志脱敏。
- 发送给 AI 的内容只包含必要片段。
- 不上传完整 PDF 或完整仓库。

## 15. 最终建议

第一版先做一条稳的闭环：

```text
AI 栏按钮
-> 检查 MinerU 解析
-> 识别或手动输入 GitHub 仓库
-> 拉取仓库
-> 静态扫描
-> AI 论文代码对齐
-> 生成 Markdown 笔记
```

不要一开始就做完整 IDE、自动运行代码或复杂 Agent。先把“论文哪里对应代码哪里”这件事做准、做可追溯，再逐步升级代码显示器、行级注释和交互式代码阅读。

## 16. Phase 4 细化方案

论文段落与代码文件对齐的详细实施方案已单独整理到：

```text
docs/code-analysis-alignment-plan.md
```

这份方案把 Phase 4 拆成规则对齐 MVP、AI 重排与解释、Markdown 笔记写入、代码显示器增强和函数/类级对齐五个切片。后续实现应优先从 Phase 4A 开始，先跑通“论文段落 -> 代码文件 -> Markdown 笔记”的闭环，再接 AI rerank 和更细粒度代码显示。
