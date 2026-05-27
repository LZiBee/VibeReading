# 论文段落与代码文件对齐计划方案

日期：2026-05-25  
关联功能：代码解析 Phase 4+

## 1. 目标

在已有“识别 GitHub 仓库 -> 确认仓库 -> Main 侧拉取/缓存 -> 扫描代码结构”的基础上，新增论文段落与代码文件的对齐能力，最终生成一份可写入当前论文笔记的 Markdown 分析结果。

第一版要回答三个问题：

1. 论文的哪些段落、章节、图表说明和实验描述，与仓库中的哪些文件最相关。
2. 每条对应关系为什么成立，证据来自论文哪里、代码哪里。
3. 用户应该按什么顺序阅读仓库，才能最快理解论文实现。

一句话原则：

> 先用可解释规则做候选召回，再用 AI 做重排、解释和 Markdown 组织；所有结论必须带论文来源和代码来源，不把没有证据的推断写成确定关系。

## 2. 当前基础

已完成的 Phase 1-3 能力：

- Renderer AI 栏已有“代码解析”入口。
- 弹窗已有步骤：`check-paper`、`parse-paper`、`discover-repository`、`confirm-repository`、`fetch-repository`、`scan-code`、`align-code`、`generate-note`。
- 已能从 MinerU Markdown/blocks 识别 GitHub 仓库候选，并支持手动输入。
- 已能把确认后的 GitHub URL 交给 Main 侧 `code-analysis:prepare-repository`。
- Main 侧已用 `git clone --depth=1` 拉取仓库到 Electron `userData` 缓存，已有缓存会复用。
- 已返回仓库 `commit`、`branch`、文件数、语言统计和关键文件列表。

下一步不需要重做仓库识别和 clone，而是在 `scan-code` 之后补齐 `align-code` 与 `generate-note` 的真实流程。

## 3. 非目标

MVP 不做以下事情：

- 不执行仓库代码。
- 不安装仓库依赖。
- 不修改被拉取的仓库文件。
- 不把完整仓库或完整 PDF 上传给模型。
- 不做 IDE 级代码编辑器。
- 不做跨多个仓库的复杂依赖追踪。
- 不把 Renderer 变成文件系统、Git 或数据库访问者。

## 4. 输入与输出

### 4.1 输入

论文侧输入：

- `MineruParseResult.title`
- `MineruParseResult.markdown`
- `MineruParseResult.blocks`
- block 字段：`id`、`type`、`pageNo`、`text`、`caption`、`headingLevel`、`rect`

仓库侧输入：

- `CodeRepositoryPreparationResult.normalizedUrl`
- `owner`、`repo`、`commit`、`branch`
- `languageCounts`
- `importantFiles`
- 后续新增的代码摘要：文件路径、角色、大小、摘要片段、符号列表、imports、README 命中片段

用户侧输入：

- 用户确认的仓库 URL。
- 后续可选：用户手动指定重点文件、排除文件或重新运行 AI 对齐。

### 4.2 输出

核心输出是 `PaperCodeAlignmentResult`，它既能驱动 UI，又能生成 Markdown 笔记。

建议共享类型草案：

```ts
export type PaperCodeAlignmentConfidence = 'high' | 'medium' | 'low'

export type PaperCodePaperRef = {
  blockId: EntityId
  pageNo: number
  sectionTitle?: string
  blockType: MineruBlockType
  textExcerpt: string
}

export type PaperCodeFileRole =
  | 'readme'
  | 'model'
  | 'training'
  | 'inference'
  | 'evaluation'
  | 'dataset'
  | 'config'
  | 'notebook'
  | 'script'
  | 'utility'
  | 'document'
  | 'unknown'

export type PaperCodeFileSummary = {
  path: string
  role: PaperCodeFileRole
  language?: string
  size: number
  symbols: string[]
  imports: string[]
  excerpt: string
  evidenceTerms: string[]
}

export type PaperCodeAlignmentMatch = {
  id: EntityId
  paperRefs: PaperCodePaperRef[]
  codeRefs: Array<{
    path: string
    role: PaperCodeFileRole
    symbols?: string[]
    startLine?: number
    endLine?: number
    excerpt?: string
  }>
  score: number
  confidence: PaperCodeAlignmentConfidence
  evidence: string[]
  reason: string
  reviewRequired: boolean
}

export type PaperCodeAlignmentResult = {
  paperTitle: string
  repositoryUrl: string
  commit?: string
  generatedAt: string
  matchedBlockCount: number
  matchedFileCount: number
  highConfidenceCount: number
  matches: PaperCodeAlignmentMatch[]
  warnings: string[]
  markdown: string
}
```

## 5. 对齐流水线

### 5.1 论文侧结构化

输入 MinerU blocks 后，先生成论文结构单元 `PaperSectionUnit[]`：

1. 按 heading block 建章节树，给每个段落归属最近的标题。
2. 合并过短、连续、同页且同章节的段落，避免 AI 处理碎片化文本。
3. 保留图、表、公式的 caption，尤其是 architecture、pipeline、ablation、implementation、training details。
4. 标注章节角色：`abstract`、`introduction`、`method`、`experiments`、`results`、`appendix`、`references`。
5. 默认过滤参考文献、致谢、作者信息、版权信息和过短噪声段落。

论文单元需要保留 `blockId` 和 `pageNo`，这样后续笔记可以回到 PDF 页和 MinerU block。

### 5.2 代码侧摘要增强

当前 Phase 3 只返回关键文件列表，Phase 4 需要补一个只读摘要层：

1. Main/Worker 在本地仓库缓存中读取有限数量文件。
2. 忽略 `.git`、`node_modules`、`dist`、`build`、`checkpoints`、`weights`、`runs`、`outputs`、大数据目录和二进制文件。
3. 单文件读取设置上限，例如 80KB；总摘要字符数设置上限，例如 200KB。
4. 提取文件角色：README、模型、训练、推理、评估、数据集、配置、Notebook、脚本、文档。
5. 提取轻量符号：
   - Python：`class`、`def`、顶层常量、常见 `argparse` 参数。
   - TS/JS：`export`、`function`、`class`、React component。
   - Notebook：标题、markdown cell、代码 cell 的 import 和函数名。
6. 提取 imports 和关键配置名，帮助判断文件职责。

第一版可以用正则和路径规则实现，后续再接 tree-sitter 或语言服务。

### 5.3 规则候选召回

先做规则召回，得到 `PaperCodeAlignmentCandidate[]`，再交给 AI 重排。

规则特征：

- 章节角色与文件角色匹配：
  - Method / Model / Architecture -> `models/`、`modeling/`、`network/`、`modules/`
  - Training Details -> `train.py`、`trainer`、`engine`、`loss`
  - Inference / Demo -> `demo.py`、`infer.py`、`predict.py`、`app.py`
  - Experiments / Evaluation -> `eval.py`、`test.py`、`metrics`
  - Dataset -> `data/`、`datasets/`、`dataloader`
  - Implementation Details -> README、config、requirements、scripts
- 关键词匹配：
  - 论文术语、方法缩写、模块名、loss 名、dataset 名、metric 名。
  - 文件名、目录名、符号名、README 小节标题。
- 命名归一化：
  - `HQ-Output Token`、`hq_output_token`、`HQOutputToken` 视为相近 token。
  - 去掉大小写、连字符、下划线差异。
- 证据增强：
  - 同一术语同时出现在论文段落、README 和源码符号中，加分。
  - 论文图表 caption 和文件路径同时命中 architecture/model/config，加分。
- 降权规则：
  - 参考文献段落命中仓库名，降权。
  - 第三方依赖文件、vendor、example 外部库，降权。
  - 大量通用词命中，例如 model、data、train 单独出现，不作为强证据。

建议初始评分：

```text
总分 = 章节角色分 + 路径角色分 + token 命中分 + README 证据分 + 符号证据分 - 噪声惩罚
```

置信度建议：

- `high`：同一映射至少有两个独立证据，例如段落术语 + 文件路径 + 符号名。
- `medium`：有明确路径或 README 证据，但源码符号不强。
- `low`：只有弱关键词或通用路径命中，需要人工确认。

### 5.4 AI 重排与解释

AI 不负责全仓库搜索，只处理规则召回后的候选包。

输入内容：

- 论文标题和摘要。
- 章节树摘要。
- 候选论文段落：每条包含 blockId、pageNo、sectionTitle、textExcerpt。
- 候选代码文件：path、role、symbols、imports、excerpt。
- 规则召回分数和命中证据。

输出要求：

- 严格 JSON。
- 每条映射必须包含 `paperRefs`、`codeRefs`、`confidence`、`reason`、`evidence`。
- 证据不足时必须输出 `reviewRequired: true`。
- 不允许编造文件路径、函数名或论文页码。
- 不确定时写入 `warnings`，不要写成确定结论。

AI prompt 可放在：

```text
packages/ai/src/code/prompts/paper-code-alignment.md
```

### 5.5 Markdown 笔记生成

生成新笔记，标题建议：

```text
代码解析：{论文标题}
```

推荐结构：

```md
# 代码解析：{论文标题}

> 仓库：{normalizedUrl}
> Commit：{commit}
> 生成时间：{generatedAt}

## 1. 阅读结论

- 主实现入口是什么。
- 论文方法主要对应哪些目录和文件。
- 哪些映射需要人工确认。

## 2. 仓库结构速览

## 3. 论文段落与代码文件对齐表

| 论文位置 | 代码位置 | 置信度 | 说明 |
|---|---|---|---|

## 4. 按论文章节阅读代码

### Method

### Experiments

### Implementation Details

## 5. 关键文件注释

### `path/to/file.py`

说明、相关论文段落、建议阅读点。

## 6. 待人工确认
```

代码片段第一版只放短 excerpt，不放长文件内容。更完整的代码显示器留给下一阶段。

## 6. UI 呈现方案

复用现有代码解析进度弹窗：

1. `scan-code` 完成后进入 `align-code`。
2. `align-code` 显示：
   - “正在整理论文段落”
   - “正在摘要关键代码文件”
   - “正在生成候选映射”
   - “正在调用 AI 重排”
3. 完成后展示摘要：
   - 对齐到 X 个论文段落。
   - 对齐到 Y 个代码文件。
   - 高置信 Z 条，中置信 N 条，待确认 M 条。
4. `generate-note` 生成 Markdown，并提供：
   - “写入笔记”
   - “预览 Markdown”
   - “复制 Markdown”

初版弹窗不需要展示完整代码，只展示结果摘要和关键文件列表。完整内容进入 Milkdown 笔记里，由 Markdown 表格和代码围栏承载。

## 7. 模块边界

Renderer：

- 只触发受控 API。
- 只展示进度、候选、摘要和生成结果。
- 不直接读仓库文件。
- 不直接访问数据库或 API Key。

Preload：

- 暴露受控 API，例如 `alignPaperCode`、`generateCodeAnalysisNote`。
- 只传结构化参数和结果。

Main/Worker：

- 负责读取仓库缓存中的文件。
- 负责代码摘要和候选召回。
- 负责脱敏日志。
- 不执行仓库脚本。

`packages/shared`：

- 放通用类型、结果结构和 IPC 输入输出类型。

`packages/ai`：

- 放 prompt、AI JSON 输出解析、Markdown 组合和结果审计。

后续可新增 `packages/code-analysis`：

- 承载仓库扫描、代码摘要、规则召回等纯业务逻辑。
- 由 Main/Worker 调用，Renderer 不直接使用其中涉及文件系统的能力。

## 8. 分阶段实施

### Phase 4A：规则对齐 MVP

范围：

- 论文侧章节/段落结构化。
- 代码侧关键文件摘要。
- 规则候选召回。
- 生成不依赖 AI 的 Markdown 草稿。

验收：

- 对真实样本仓库能输出“论文位置 -> 代码文件”的候选表。
- 每条候选带分数、置信度和证据。
- 低置信映射明确标记“待确认”。

### Phase 4B：AI 重排与解释

范围：

- 增加 AI prompt 和 JSON schema。
- 只把候选摘要送给 AI。
- 输出解释、置信度和待确认项。

验收：

- 至少生成 3 条高/中置信映射。
- AI 输出不能引用不存在的文件或 block。
- 低证据结果进入待确认区。

### Phase 4C：写入笔记与 Milkdown 呈现

范围：

- 生成 Markdown 笔记。
- 写入当前论文笔记列表。
- 打开笔记面板并选中新笔记。

验收：

- 笔记包含仓库 URL、commit、结构摘要、对齐表、关键文件注释和待确认项。
- Milkdown 能正常显示表格和代码围栏。

### Phase 4D：代码显示器增强

范围：

- 增加只读代码片段预览弹窗。
- 支持 path、line range、copy。
- 后续可接 Shiki 或 CodeMirror 做语法高亮。

验收：

- 用户能从对齐表查看关键代码片段。
- 仍不修改仓库文件。

### Phase 4E：函数/类级细粒度对齐

范围：

- 从文件级映射升级到符号级映射。
- 对 Python/TS/JS 优先支持函数、类和导出符号。
- 后续评估 tree-sitter。

验收：

- 对关键文件能定位到函数/类级别。
- 笔记中可展示 `path#symbol` 或行号范围。

## 9. 验证策略

单元测试：

- 论文章节结构化：标题归属、参考文献过滤、短段落合并。
- token 归一化：camelCase、snake_case、连字符、大小写。
- 文件角色判断：model、training、inference、evaluation、dataset、config。
- 规则召回评分：强证据加分、参考文献降权、通用词降权。
- Markdown 生成：表格、代码围栏、低置信区。

集成验证：

- 使用 Library 中已有带仓库链接样本：
  - `SysCV/SAM-HQ`
  - `IDEA-Research/GroundingDINO`
  - `facebookresearch/sam2`
  - `PKU-RL/COPL`
  - `Mr-Bigworth/MMCA`
  - `jiawen-zhu/HQTrack`
- 每篇至少检查：
  - 是否能完成仓库缓存复用或拉取。
  - 是否能生成关键文件摘要。
  - 是否能输出至少 3 条候选映射。
  - 是否能生成 Markdown 笔记。

桌面端验证：

```text
npm run typecheck -w @thesis-agent/desktop
npm run build -w @thesis-agent/desktop
```

## 10. 风险与应对

### 10.1 错误对齐

风险：AI 或规则把无关文件解释成论文实现。

应对：

- 先规则召回，再 AI 重排。
- 所有映射必须有论文来源和代码来源。
- 低证据映射必须标记待确认。
- 输出审计阶段检查文件是否真实存在。

### 10.2 大仓库扫描慢

风险：仓库文件多、Notebook 大、模型权重大。

应对：

- 设置文件数、单文件大小、总字符数上限。
- 忽略权重、输出、缓存、数据目录。
- 长任务放 Main/Worker，Renderer 只收进度。

### 10.3 隐私泄露

风险：本地绝对路径、论文原文路径或过长源码片段进入日志/AI。

应对：

- 日志只写仓库名、任务阶段和脱敏错误。
- AI 输入只包含必要摘要。
- UI 展示相对路径，不展示本地缓存绝对路径。

### 10.4 AI 输出结构不稳定

风险：模型返回非 JSON 或引用不存在字段。

应对：

- 严格 JSON prompt。
- 增加解析失败修复或 fallback。
- 输出审计：校验 blockId、path、confidence、reason。
- 失败时保留规则对齐 Markdown 草稿。

## 11. 首个开发切片建议

建议下一次实现从 Phase 4A 开始，切片如下：

1. 在 `packages/shared` 增加对齐结果类型草案。
2. 在 Main 侧新增 `code-analysis:align-paper-code` IPC。
3. 在 Main 侧基于 MinerU blocks 和 `importantFiles` 做规则候选召回。
4. 先生成规则版 Markdown，不接 AI。
5. Renderer 在 `align-code` 和 `generate-note` 两步展示进度与摘要。

这个切片能尽快跑通“论文段落 -> 代码文件 -> Markdown 笔记”的闭环，再在下一轮把 AI rerank 接进去。
