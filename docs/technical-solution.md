# 论文阅读与 AI 知识图谱软件技术方案

版本：v0.1

日期：2026-05-18

## 1. 产品定位

本软件不是传统的“PDF 阅读器 + 竖向聊天窗口”，而是一个面向科研论文阅读的 **AI 知识图谱工作台**。

核心目标是帮助用户在阅读论文时完成三件事：

1. 高效阅读 PDF：具备常用 PDF 阅读、搜索、注释、高亮、截图、公式处理能力。
2. 深度理解论文：用户可以围绕原文片段、公式、图表、参考文献向 AI 提问。
3. 组织阅读思考：把问题、AI 回答、原文证据、截图、公式、用户笔记和参考文献自动沉淀为可检索、可展开、可分享的知识网络。

最具差异化的功能是：

1. **横向展开式笔记系统**：突破传统 Chat 从上往下滚动的线性结构，每个问题都可以横向生成多个相关问题分支。
2. **一键生成论文问答思维导图**：自动把用户对某篇论文的提问、回答、证据、笔记和参考文献组织成网络图。
3. **参考文献悬浮预览**：鼠标悬停正文引用，例如 `[12]` 或 `(Smith et al., 2021)`，自动显示对应参考文献信息，并可一键加入待读表。
4. **可扩展 AI 接入层**：像 CC-switch 一样，支持用户通过第三方中转站的 Base URL、API Key、模型名接入不同模型。
5. **社区化知识分享**：后续支持分享书单、阅读路径、论文问答图谱和公开笔记，但不默认分享 PDF 原文。
6. **Zotero 生态接入**：可选连接 Zotero 文献库，并借助 Zotero translators 抓取网页、DOI 和出版商页面的参考文献元数据。

## 2. 需求总结

### 2.1 PDF 阅读能力

基础功能：

- 打开本地 PDF。
- 页码跳转。
- 缩放。
- 文本搜索。
- 目录导航。
- 缩略图导航。
- 文本选择。
- 高亮。
- 下划线。
- 批注。
- 颜色标签。
- 阅读进度保存。
- PDF 内区域截图。
- 导出带注释 PDF。

论文阅读增强功能：

- 句子收藏。
- 片段收藏。
- 公式收藏。
- 图表截图收藏。
- 从 PDF 片段生成笔记。
- 从 PDF 片段发起 AI 提问。
- 从 PDF 片段生成横向问题。
- 点击引用来源回跳到 PDF 原文位置。

### 2.2 AI 接入能力

必须支持：

- 官方模型：OpenAI、Anthropic、Gemini、DeepSeek 等。
- 第三方中转：用户填写 Base URL、API Key、模型名。
- OpenAI-compatible API。
- 自定义请求头。
- 流式输出。
- 模型连接测试。
- 拉取模型列表。
- 聊天模型和 Embedding 模型分开配置。
- 本地模型：Ollama、LM Studio、vLLM、LocalAI。
- 每个任务使用不同模型，例如翻译用便宜模型，复杂解释用强模型。

### 2.3 笔记系统

传统 Chat 的问题：

- 信息只能从上往下读。
- 不同问题之间关系不清晰。
- AI 回答难以复用到笔记。
- 很难知道一个结论来自哪一页、哪段原文或哪个参考文献。
- 读完整篇论文后，问题、证据和想法散落在聊天记录里。

本软件的笔记系统要解决：

- 每个问题都可以横向展开。
- 每个回答都可以一键插入笔记。
- 每段笔记都保留来源。
- 每个问题、回答、原文片段、截图、公式、参考文献都是图谱节点。
- 一篇论文可以自动生成阅读思维导图。
- 用户可以在图谱中继续追问、重组、合并、导出。

### 2.4 参考文献能力

核心需求：

- 正文引用悬浮预览。
- 从引用跳转到参考文献列表。
- 从参考文献列表跳回正文引用位置。
- 显示标题、作者、年份、期刊/会议、DOI、arXiv、摘要。
- 连接 Zotero 个人文献库和群组文献库，导入条目、集合、标签、笔记和附件元数据。
- 使用 Zotero Web API 做增量同步，保留本地条目和 Zotero item key / collection key 的映射。
- 使用 Zotero translators 或 translation-server 抓取网页、DOI、arXiv、出版商页面和学术数据库页面的元数据。
- 一键加入待读表。
- 记录“为什么加入待读”。
- 可选将待读状态、标签或精选笔记写回 Zotero，默认不写回，避免污染用户原始文献库。
- 后续可对当前论文和参考文献进行 AI 对比。

### 2.5 社区能力

后续规划：

- 分享书单。
- 分享论文阅读图谱。
- 分享问题链。
- 分享公开笔记。
- 分享主题阅读路线。
- 查看某篇论文的社区常见问题。
- 查看某个主题下高质量阅读路径。
- 复制他人的公开图谱到自己的本地工作区继续编辑。

社区中默认只分享：

- DOI。
- arXiv ID。
- 论文元数据。
- 用户自己的笔记。
- 问题图谱。
- 阅读路径。
- 书单。

默认不分享：

- PDF 原文。
- 私有 API Key。
- 私有聊天记录。
- 未公开的本地笔记。

## 3. 总体技术路线

### 3.1 推荐路线

推荐采用：

```text
桌面端：Electron + React + TypeScript + 自研 Workbench Core
PDF 内核：Mozilla PDF.js
编辑器：Tiptap / ProseMirror
图谱视图：React Flow + ELK / Dagre
本地数据库：SQLite
全文检索：SQLite FTS5
向量检索：sqlite-vec
AI 接入：自研 Provider Adapter，兼容 OpenAI-compatible API
论文解析：PDF.js 基础解析 + GROBID 可选服务
文献库同步：Zotero Web API 可选接入
网页元数据抓取：Zotero translators / translation-server 可选服务
公式渲染：KaTeX，必要时扩展 MathJax
截图：PDF.js canvas 裁剪 + Electron desktopCapturer
```

底层架构已单独定稿，见 `docs/base-architecture.md`。

核心原则是：做一个 **像 VS Code 的论文阅读工作台**，而不是 fork VS Code，也不是把产品直接建在 Theia 这类 IDE 框架上。

第一版底座确定为：

```text
Electron + React + TypeScript + Vite
自研 Workbench Core
Radix UI Primitives + CSS Variables
@vscode/codicons
react-resizable-panels
SQLite + FTS5 + sqlite-vec
```

Workbench Core 需要从第一版就提供：

- 命令系统。
- 快捷键系统。
- 视图注册。
- 编辑器注册。
- 菜单注册。
- 主题 token。
- Context Key。
- 内部插件机制。

### 3.2 为什么不直接做成普通 Chatbox

Chatbox 适合作为 AI 客户端参考，也可以用于早期 PoC，但本产品的核心交互已经不是线性聊天，而是：

- PDF 原文。
- 结构化笔记。
- 横向问题树。
- 图谱视图。
- 参考文献网络。
- 社区书单和阅读路径。

因此正式产品建议采用独立架构。可以参考 Chatbox 的模型配置、流式对话、Provider 管理方式，但不要把产品主 UI 强绑定成聊天软件。

如果项目计划完全开源，可以考虑 fork Chatbox CE 快速验证 AI 对话和 Provider 配置。

如果项目计划未来闭源商业化，建议不要深度 fork GPL/AGPL 项目，优先用许可证更宽松的基础组件，例如 PDF.js、SQLite、React Flow、Tiptap 等，并在正式开发前复核每个依赖的许可证。

### 3.3 架构图

```text
┌────────────────────────────────────────────────────────────┐
│ Desktop App: Electron + React + TypeScript + Workbench     │
├────────────────────────────────────────────────────────────┤
│ UI Layer                                                   │
│ - PDF Reader                                               │
│ - AI Panel                                                 │
│ - Note Editor                                              │
│ - Mind Map / Graph View                                    │
│ - Reading List                                             │
│ - Community Pages                                          │
├────────────────────────────────────────────────────────────┤
│ Domain Layer                                               │
│ - Paper Service                                            │
│ - Annotation Service                                       │
│ - Note Graph Service                                       │
│ - AI Service                                               │
│ - RAG Service                                              │
│ - Citation Service                                         │
│ - Screenshot / Formula Service                             │
├────────────────────────────────────────────────────────────┤
│ Infrastructure Layer                                       │
│ - SQLite                                                   │
│ - FTS5                                                     │
│ - sqlite-vec                                               │
│ - Local File Storage                                       │
│ - OS Keychain / safeStorage                                │
│ - Provider Adapter                                         │
├────────────────────────────────────────────────────────────┤
│ External Services                                          │
│ - OpenAI-compatible APIs                                   │
│ - Official Model Providers                                 │
│ - Ollama / Local Models                                    │
│ - GROBID                                                   │
│ - Zotero Web API                                           │
│ - Zotero translators / translation-server                  │
│ - Crossref / OpenAlex / Semantic Scholar                   │
│ - Future Community Backend                                 │
└────────────────────────────────────────────────────────────┘
```

## 4. 模块设计

### 4.1 PDF Reader 模块

职责：

- 加载 PDF。
- 渲染页面。
- 提取页面文本。
- 获取文本坐标。
- 处理选择区域。
- 生成高亮 overlay。
- 支持搜索和目录。
- 支持区域截图。
- 支持引用热点 overlay。

建议实现：

- 使用 `pdfjs-dist`。
- PDF 页面由 canvas 渲染。
- 文本层使用 PDF.js text layer。
- 注释层使用自定义 overlay。
- 引用热点层使用自定义 overlay。
- PDF 文件原文不直接修改，注释先存数据库。

注释保存策略：

```text
优先保存到本地数据库
需要导出时再把注释写入新 PDF 文件
```

这样可以避免：

- 频繁改写 PDF 文件。
- 同步冲突。
- PDF 损坏。
- 注释坐标难以维护。

### 4.2 AI Provider 模块

职责：

- 管理模型服务商。
- 保存 Base URL、API Key、模型名。
- 支持 OpenAI-compatible 请求。
- 支持官方 API。
- 支持本地模型。
- 支持流式输出。
- 支持模型连接测试。
- 支持聊天模型和 Embedding 模型分离。

Provider 配置结构：

```ts
type ModelProvider = {
  id: string
  name: string
  protocol:
    | 'openai-compatible'
    | 'anthropic-compatible'
    | 'gemini'
    | 'ollama'
    | 'custom'
  baseUrl: string
  apiKeySecretRef?: string
  models: string[]
  defaultChatModel: string
  defaultEmbeddingModel?: string
  supportsStream: boolean
  supportsVision: boolean
  supportsEmbeddings: boolean
  customHeaders?: Record<string, string>
}
```

第三方中转站调用方式：

```http
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json
```

请求示例：

```json
{
  "model": "gpt-4.1",
  "messages": [
    {
      "role": "system",
      "content": "你是一个严谨的论文阅读助手。回答必须尽量引用论文页码和原文来源。"
    },
    {
      "role": "user",
      "content": "解释这段论文内容。"
    }
  ],
  "stream": true
}
```

配置导入方式：

1. 手动填写 Base URL、API Key、Model。
2. JSON 导入。
3. URL Scheme 导入服务商配置。

URL Scheme 不建议携带 API Key。推荐只导入 Base URL、协议、模型名，API Key 由用户在软件内粘贴。

密钥存储：

- Windows：Credential Manager 或 Electron safeStorage。
- macOS：Keychain。
- Linux：Secret Service。
- 兜底：本地加密 SQLite 字段。

### 4.3 RAG 检索问答模块

职责：

- 导入 PDF 后建立文本索引。
- 支持当前片段问答。
- 支持当前页问答。
- 支持当前章节问答。
- 支持整篇论文问答。
- 支持多篇论文问答。
- 回答中返回来源页码和原文片段。

处理流程：

```text
导入 PDF
→ 提取页面文本
→ 识别章节结构
→ 清洗文本
→ 切分 chunk
→ 写入 SQLite
→ 建立 FTS5 关键词索引
→ 生成 embedding
→ 写入 sqlite-vec
→ 用户提问
→ 关键词检索 + 向量检索
→ 合并去重
→ 构造 prompt
→ 模型回答
→ 生成来源引用
```

检索范围：

- 当前选中文本。
- 当前页。
- 当前章节。
- 当前论文。
- 整个文献库。
- 用户笔记。
- AI 回答。
- 截图 OCR。
- 公式 LaTeX。
- 参考文献元数据。

回答必须支持：

- 插入当前笔记。
- 作为新笔记。
- 复制 Markdown。
- 复制 LaTeX。
- 复制纯文本。
- 复制带引用版本。
- 复制无引用版本。
- 转成表格。
- 转成综述段落。
- 转成 Anki 卡片。

### 4.4 笔记编辑器模块

职责：

- 富文本笔记。
- Markdown 互转。
- 公式编辑和渲染。
- 图片和截图嵌入。
- AI 回答插入。
- 来源引用。
- 块级结构化存储。

建议实现：

- 编辑器：Tiptap / ProseMirror。
- 公式渲染：KaTeX。
- 块级存储：每个段落、公式、截图、AI 回答都作为 note block。
- 每个 note block 可挂 source refs。

笔记块类型：

```text
paragraph
heading
quote
pdf_excerpt
ai_answer
formula
image
screenshot
table
todo
reference
question_node
```

来源引用结构：

```ts
type SourceRef = {
  type:
    | 'paper'
    | 'page'
    | 'annotation'
    | 'pdf_selection'
    | 'screenshot'
    | 'formula'
    | 'ai_message'
    | 'reference'
    | 'zotero_item'
  paperId?: string
  pageNo?: number
  annotationId?: string
  messageId?: string
  referenceId?: string
  zoteroItemKey?: string
  rect?: { x: number; y: number; width: number; height: number }
  textHash?: string
  quote?: string
}
```

### 4.5 横向展开式问题系统

职责：

- 把用户问题变成节点。
- 把 AI 回答变成节点。
- 把原文证据变成节点。
- 从某个问题横向生成多个相关问题。
- 保留问题之间的关系。
- 支持从任意节点继续追问。

问题展开按钮：

- 横向展开。
- 找证据。
- 找反例。
- 对比已有方法。
- 解释公式。
- 生成实验解读。
- 生成后续阅读。
- 转成笔记。

横向展开示例：

```text
原问题：这篇论文的方法创新点是什么？

展开问题：
1. 它解决了前人方法的什么缺陷？
2. 核心公式中的每个变量代表什么？
3. 实验是否充分证明了这个创新？
4. 这个方法和 Transformer / GNN / Diffusion 有什么关系？
5. 这篇论文的局限是什么？
6. 哪些参考文献是理解这个方法必须读的？
```

节点类型：

```text
paper
section
excerpt
question
answer
user_note
formula
figure
screenshot
reference
reading_item
concept
claim
evidence
```

边类型：

```text
contains
asks
answers
expands
supports
contradicts
mentions
cites
derived_from
similar_to
should_read
belongs_to
```

### 4.6 思维导图 / 网络图模块

职责：

- 对一篇论文生成问答图谱。
- 显示用户阅读过程中的所有问题分支。
- 将 PDF 原文、高亮、AI 回答、笔记、截图、公式、参考文献连接起来。
- 支持点击节点回到 PDF、笔记或聊天。
- 支持导出图片、Markdown、JSON。

建议实现：

- 图谱渲染：React Flow。
- 自动布局：ELK 或 Dagre。
- 大规模图谱分析：后续可加 Cytoscape.js。
- 节点位置保存到 SQLite。

图谱生成方式：

1. 实时生成：用户每次提问、插入笔记、添加参考文献时同步生成节点和边。
2. 一键整理：用户点击“生成本文阅读图谱”，AI 根据现有节点进行合并、命名和分组。
3. 手动编辑：用户可拖动、合并、删除、重命名节点。

图谱视图分层：

- 总览模式：只显示核心问题、方法、实验、结论、参考文献。
- 问答模式：显示所有问题和回答。
- 证据模式：突出原文片段、高亮和页码。
- 文献网络模式：突出参考文献和待读表。

### 4.7 参考文献悬浮预览模块

职责：

- 解析文末参考文献。
- 识别正文 citation callout。
- 把正文引用和文末条目连接起来。
- 鼠标悬停时显示元数据。
- 支持一键加入待读表。
- 支持从待读表反查来源论文和上下文。

处理流程：

```text
导入 PDF
→ PDF.js 提取正文文本和坐标
→ GROBID 解析参考文献列表
→ 识别正文引用标记
→ 建立 citation callout 到 bibliography entry 的映射
→ 用 Crossref / OpenAlex / Semantic Scholar 补全 DOI、摘要、作者等元数据
→ 缓存到本地数据库
→ 在 PDF text layer 上添加 hover hotspot
```

第一阶段支持：

- `[1]`
- `[1, 2, 5]`
- `[1-4]`
- `1,2,5` 格式的数字引用。

第二阶段支持：

- `(Smith et al., 2021)`
- `(Smith and Lee, 2020)`
- `Smith et al. (2021)`。

悬浮卡片内容：

```text
标题
作者
年份
发表 venue
DOI / arXiv
摘要
本文引用它的上下文
按钮：加入待读 / 打开 DOI / 查找 PDF / 与当前论文对比
```

待读表字段：

```text
title
authors
year
doi
arxiv_id
source_paper_id
source_page_no
source_context
reason
priority
status
tags
created_at
```

状态：

```text
to_read
reading
skimmed
read
ignored
```

### 4.8 Zotero 集成模块

职责：

- 通过 Zotero Web API 连接用户的个人文献库和群组文献库。
- 同步 Zotero collections、items、tags、notes 和附件元数据。
- 将 Zotero 条目映射到本地 `papers`、`references` 和 `reading_items`。
- 使用 Zotero translators 或 translation-server 从网页、DOI、arXiv、出版商页面和学术数据库页面抓取元数据。
- 支持从 Zotero 条目导入 PDF 附件，但必须由用户明确授权，且 Renderer 不直接访问 Zotero token 或本地文件系统。
- 支持可选写回待读状态、标签或精选笔记；默认只读同步，避免修改用户原始 Zotero 文献库。

建议实现：

- Zotero OAuth、API token、同步游标和请求重试逻辑放在主进程、Worker 或后台服务中。
- Token 使用 Electron safeStorage / OS Keychain 存储，只在受控服务层解密。
- `packages/citations` 提供 Zotero adapter，`packages/db` 保存同步映射，`packages/workbench` 注册命令和视图入口。
- 抓取能力优先封装为 `MetadataCaptureService`，内部可按来源选择 Zotero translators、Crossref、OpenAlex、Semantic Scholar 或 GROBID。
- translation-server 作为可选 sidecar，不作为第一版强依赖；如果未安装或启动失败，降级到 DOI / URL 手动补全。

Workbench 命令示例：

```text
zotero.connect
zotero.syncLibrary
zotero.importSelected
zotero.captureFromUrl
zotero.openInZotero
zotero.disconnect
```

同步流程：

```text
用户授权 Zotero
→ 主进程保存 token secret ref
→ 后台任务拉取 libraries / collections / items
→ 写入本地 Zotero 映射表
→ 合并到 papers / references / reading_items
→ 更新全文索引和参考文献图谱节点
→ UI 通过任务进度和命令结果刷新
```

抓取流程：

```text
用户输入 URL / DOI / arXiv ID
→ MetadataCaptureService 选择抓取器
→ 优先调用 Zotero translators / translation-server
→ 使用 Crossref / OpenAlex / Semantic Scholar 补全和交叉校验
→ 展示候选元数据
→ 用户确认后写入本地文献库或待读表
```

安全边界：

- Renderer 只能触发 `zotero.*` 命令或读取脱敏同步状态。
- 不在日志中记录 Zotero access token、refresh token、私有群组名称或本地附件绝对路径。
- 不自动上传 PDF 原文到第三方服务；抓取网页元数据时只发送用户明确输入的 URL / DOI。
- 写回 Zotero 前必须显示变更摘要并要求用户确认。

### 4.9 截图和公式模块

PDF 内截图：

- 用户框选 PDF 区域。
- 从 PDF.js canvas 裁剪图片。
- 保存图片文件。
- 保存页码和坐标。
- 可插入笔记。
- 可发送给 AI 解释。
- 可 OCR。

桌面截图：

- 使用 Electron desktopCapturer。
- 支持截取屏幕、窗口、区域。
- 插入笔记。
- 发送给 AI。

公式处理：

- 笔记中支持 `$...$` 和 `$$...$$`。
- KaTeX 实时渲染。
- 点击公式切换 LaTeX 源码编辑。
- 支持复制为 LaTeX、Markdown、图片。
- PDF 中复杂公式可先保存为截图，再通过视觉模型或公式 OCR 转 LaTeX。

### 4.10 社区模块

社区功能建议后置，但本地数据结构需要提前兼容。

社区可分享对象：

- 书单。
- 论文阅读图谱。
- 问题链。
- 公开笔记。
- 主题阅读路径。
- 参考文献待读路线。

社区不默认分享：

- PDF 文件。
- 私有笔记。
- 私有聊天。
- API Key。

后端建议：

```text
API Server：Node.js / NestJS 或 FastAPI
数据库：PostgreSQL
搜索：PostgreSQL full-text / Meilisearch
对象存储：S3-compatible
认证：Email / OAuth
权限：private / unlisted / public
```

社区对象结构要和本地图谱保持兼容，方便用户把公开图谱复制到本地继续编辑。

## 5. 数据模型草案

### 5.1 论文和 PDF

```sql
papers (
  id TEXT PRIMARY KEY,
  title TEXT,
  authors_json TEXT,
  year INTEGER,
  doi TEXT,
  arxiv_id TEXT,
  venue TEXT,
  abstract TEXT,
  file_path TEXT,
  fingerprint TEXT,
  created_at TEXT,
  updated_at TEXT
);

paper_pages (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  text TEXT,
  spans_json TEXT,
  width REAL,
  height REAL
);
```

### 5.2 注释和收藏

```sql
annotations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  type TEXT NOT NULL,
  color TEXT,
  quad_points_json TEXT,
  selected_text TEXT,
  note TEXT,
  tags_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

favorites (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  annotation_id TEXT,
  text TEXT NOT NULL,
  context TEXT,
  comment TEXT,
  tags_json TEXT,
  created_at TEXT
);
```

### 5.3 笔记

```sql
notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  type TEXT,
  paper_id TEXT,
  created_at TEXT,
  updated_at TEXT
);

note_blocks (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  parent_id TEXT,
  type TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  content_json TEXT,
  markdown TEXT,
  source_refs_json TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 5.4 问答和图谱

```sql
chats (
  id TEXT PRIMARY KEY,
  paper_id TEXT,
  scope TEXT,
  provider_id TEXT,
  model TEXT,
  created_at TEXT,
  updated_at TEXT
);

chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT,
  created_at TEXT
);

graph_nodes (
  id TEXT PRIMARY KEY,
  paper_id TEXT,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT,
  ref_id TEXT,
  source_refs_json TEXT,
  position_json TEXT,
  style_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

graph_edges (
  id TEXT PRIMARY KEY,
  paper_id TEXT,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL,
  created_at TEXT
);
```

### 5.5 检索

```sql
chunks (
  id TEXT PRIMARY KEY,
  paper_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  section TEXT,
  page_start INTEGER,
  page_end INTEGER,
  text TEXT NOT NULL,
  bbox_refs_json TEXT,
  embedding_model TEXT,
  created_at TEXT
);
```

FTS5 建议建立：

```text
paper_text_fts
notes_fts
annotations_fts
ai_messages_fts
references_fts
```

向量索引建议建立：

```text
chunk_embeddings
note_embeddings
message_embeddings
```

### 5.6 参考文献和待读表

```sql
references (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  raw_text TEXT,
  title TEXT,
  authors_json TEXT,
  year INTEGER,
  venue TEXT,
  doi TEXT,
  arxiv_id TEXT,
  url TEXT,
  abstract TEXT,
  metadata_source TEXT,
  created_at TEXT,
  updated_at TEXT
);

citation_mentions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  reference_id TEXT,
  page_no INTEGER,
  mention_text TEXT,
  rect_json TEXT,
  context TEXT,
  confidence REAL,
  created_at TEXT
);

reading_items (
  id TEXT PRIMARY KEY,
  reference_id TEXT,
  title TEXT,
  authors_json TEXT,
  year INTEGER,
  doi TEXT,
  arxiv_id TEXT,
  source_paper_id TEXT,
  source_page_no INTEGER,
  source_context TEXT,
  reason TEXT,
  priority INTEGER,
  status TEXT,
  tags_json TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 5.7 模型配置

```sql
model_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_secret_ref TEXT,
  models_json TEXT,
  default_chat_model TEXT,
  default_embedding_model TEXT,
  supports_stream INTEGER,
  supports_vision INTEGER,
  supports_embeddings INTEGER,
  custom_headers_json TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 5.8 Zotero 同步和元数据抓取

```sql
zotero_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  display_name TEXT,
  api_base_url TEXT,
  access_token_secret_ref TEXT,
  refresh_token_secret_ref TEXT,
  last_sync_version INTEGER,
  last_synced_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

zotero_libraries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  library_type TEXT NOT NULL,
  library_id TEXT NOT NULL,
  name TEXT,
  last_sync_version INTEGER,
  last_synced_at TEXT
);

zotero_item_mappings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  zotero_item_key TEXT NOT NULL,
  local_entity_type TEXT NOT NULL,
  local_entity_id TEXT NOT NULL,
  zotero_version INTEGER,
  sync_direction TEXT NOT NULL,
  last_synced_at TEXT,
  conflict_state TEXT
);

metadata_capture_jobs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_input TEXT NOT NULL,
  preferred_adapter TEXT,
  status TEXT NOT NULL,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

同步方向：

```text
read_only
write_tags
write_notes
bidirectional
```

## 6. 推荐目录结构

```text
thesis-agent/
  apps/
    desktop/
      src/
        main/
        renderer/
  packages/
    ai/
      src/
        providers/
        prompts/
        rag/
    pdf/
      src/
        reader/
        annotations/
        citations/
    notes/
      src/
        editor/
        blocks/
        graph/
    db/
      src/
        migrations/
        repositories/
    citations/
      src/
        parser/
        metadata/
        zotero/
        capture/
    shared/
      src/
        types/
        utils/
  docs/
    technical-solution.md
    product-requirements.md
    database-schema.md
    api-design.md
```

## 7. 开发阶段规划

### Phase 0：技术验证

目标：

- 验证 PDF.js 文本坐标、高亮 overlay、区域截图。
- 验证 OpenAI-compatible Provider。
- 验证 Tiptap 公式笔记。
- 验证 React Flow 图谱节点和自动布局。
- 验证 GROBID 解析参考文献。
- 验证 Zotero Web API 只读同步和 Zotero translators / translation-server 元数据抓取。

输出：

- 可打开一篇 PDF。
- 可选中文本提问。
- 可把回答插入笔记。
- 可生成简单问题图谱。
- 可识别数字引用 `[1]` 并悬浮显示文末条目。
- 可从 Zotero 或 URL 抓取一条候选文献元数据。

### Phase 1：本地论文阅读 MVP

目标：

- 完成基础 PDF 阅读。
- 完成高亮、注释、收藏。
- 完成本地 SQLite 数据库。
- 完成文献库列表。
- 完成笔记编辑器。

关键验收：

- 用户能导入 PDF。
- 用户能高亮和收藏句子。
- 用户能写笔记并保留来源。
- 用户能搜索当前论文内容和笔记。

### Phase 2：AI 阅读助手

目标：

- 支持第三方中转站。
- 支持官方模型。
- 支持本地模型。
- 支持当前片段问答。
- 支持整篇论文 RAG。
- 回答带来源。

关键验收：

- 用户可以填写 Base URL、API Key、Model。
- 用户可以测试连接。
- 用户可以选中 PDF 片段提问。
- 用户可以将 AI 回答复制或插入笔记。
- AI 回答可以跳回 PDF 来源页。

### Phase 3：横向笔记和思维导图

目标：

- 问题、回答、原文片段、笔记全部节点化。
- 支持横向展开问题。
- 支持一键生成本文阅读图谱。
- 支持图谱节点回跳。

关键验收：

- 每个问题都能生成分支问题。
- 问题和回答会自动进入图谱。
- 用户点击“生成本文阅读图谱”能看到可编辑网络图。
- 图谱节点能跳回 PDF、笔记或 AI 对话。

### Phase 4：参考文献悬浮预览和待读表

目标：

- 支持数字引用悬浮预览。
- 支持参考文献元数据补全。
- 支持一键加入待读表。
- 支持从待读表回溯来源上下文。
- 支持连接 Zotero Web API，同步 Zotero 条目、集合和标签。
- 支持使用 Zotero translators / translation-server 从网页和 DOI 抓取元数据。

关键验收：

- 鼠标悬停 `[12]` 能显示参考文献信息。
- 点击“加入待读”后出现在待读表。
- 待读表记录它来自哪篇论文、哪一页、哪段上下文。
- 用户授权后可以从 Zotero 导入指定 collection，并看到同步状态。
- 用户输入 URL / DOI 后可以获得候选元数据，确认后加入本地文献库或待读表。

### Phase 5：社区和同步

目标：

- 支持账号。
- 支持云同步。
- 支持公开书单。
- 支持公开阅读图谱。
- 支持复制社区图谱到本地。

关键验收：

- 用户能分享书单。
- 用户能浏览某篇论文的公开问题图谱。
- 用户能复制公开阅读路径到自己的工作区。
- 用户可以控制哪些内容公开，哪些内容私有。

## 8. 扩展性设计

### 8.1 AI Provider 可扩展

新增模型服务商时，只需要实现统一接口：

```ts
interface ChatProvider {
  id: string
  listModels(): Promise<ModelInfo[]>
  chat(input: ChatInput): AsyncIterable<ChatChunk>
  embed?(input: EmbedInput): Promise<EmbeddingResult>
  testConnection(): Promise<TestResult>
}
```

### 8.2 文档解析可扩展

不同解析器实现统一接口：

```ts
interface PaperParser {
  parse(filePath: string): Promise<ParsedPaper>
}
```

可接入：

- PDF.js parser。
- GROBID parser。
- Docling parser。
- OCR parser。
- arXiv source parser。

### 8.3 图谱节点可扩展

新增节点类型时，只需要：

- 注册节点类型。
- 定义渲染组件。
- 定义右键菜单。
- 定义可建立的边类型。
- 定义检索和导出规则。

### 8.4 社区对象可扩展

本地对象和社区对象都采用：

```text
entity + metadata + source_refs + permissions
```

这样后续可以分享：

- 单条笔记。
- 一组问题。
- 一个图谱子树。
- 一本书单。
- 一个主题阅读路线。

## 9. 安全和隐私

必须遵守：

- API Key 不明文存储。
- URL 导入不默认包含 API Key。
- 用户明确授权后才把 PDF 内容发送给云端模型。
- 本地模式下所有 PDF、笔记、图谱都保存在用户设备。
- 社区分享默认不包含 PDF 文件。
- AI 回答中标注哪些内容来自论文，哪些是模型推理。
- 敏感论文支持“仅本地模型”模式。
- Zotero token 只存储在安全存储中，Renderer 不直接读取。
- Zotero 写回默认关闭，开启前必须展示将写回的字段和目标 library。
- translation-server 抓取 URL 时只发送用户明确输入的 URL，不把本地论文路径或隐私笔记附带出去。

## 10. 主要技术风险

### 10.1 PDF 坐标和文本恢复

风险：

- PDF 文本层顺序不稳定。
- 高亮位置可能因缩放、旋转、不同渲染方式出现偏差。
- 版本不同的 PDF 可能导致注释恢复困难。

应对：

- 同时保存 PDF 坐标、页码、文本 hash、前后文。
- 高亮 overlay 基于 PDF 坐标而不是屏幕坐标。
- 对每个注释保存恢复置信度。

### 10.2 参考文献解析准确率

风险：

- 不同论文引用格式不同。
- 作者年份引用难以精准匹配。
- 扫描版 PDF 无文本层。

应对：

- 第一阶段只做数字引用。
- GROBID + 规则匹配 + 元数据 API 多路校验。
- 允许用户手动修正引用映射。
- 对每个映射保存 confidence。

### 10.3 AI 回答可信度

风险：

- 模型幻觉。
- 回答和原文来源不一致。
- 第三方中转站模型能力不稳定。

应对：

- 默认要求回答带页码引用。
- 提供“仅根据论文回答”模式。
- 明确展示检索到的上下文。
- 支持用户切换模型。
- 对关键结论提供“找证据”按钮。

### 10.4 许可证风险

风险：

- 一些开源项目 GPL/AGPL，不适合闭源商业化。
- 一些组件有商业授权限制。

应对：

- 正式开发前建立依赖许可证清单。
- 不深度 fork GPL/AGPL 项目作为闭源商业产品底座。
- 优先使用许可证清晰且宽松的基础库。

### 10.5 Zotero 同步和抓取风险

风险：

- Zotero API 权限、同步版本和群组库权限处理不当，可能造成重复导入或写回冲突。
- translation-server 作为可选 sidecar，安装、启动和跨平台打包都有额外成本。
- 网页抓取结果可能因站点结构变化、登录墙或反爬策略而失败。

应对：

- 第一阶段只做只读同步和手动确认导入，不默认写回 Zotero。
- 本地保存 Zotero item key、library id、version 和同步方向，冲突时要求用户确认。
- translation-server 启动失败时降级到 DOI / Crossref / OpenAlex / Semantic Scholar 补全。
- 抓取结果先进入候选元数据确认页，用户确认后再写入本地库。

## 11. 初始技术选型表

| 模块 | 推荐技术 | 备注 |
|---|---|---|
| 桌面端 | Electron + React + TypeScript + 自研 Workbench Core | 生态成熟，便于复用 Web 技术和本地能力，也方便形成 VS Code 式可扩展工作台 |
| PDF 渲染 | PDF.js | 成熟、可控、适合自定义 overlay |
| 注释层 | 自定义 overlay + SQLite | 先存数据库，导出时写回 PDF |
| 富文本编辑器 | Tiptap / ProseMirror | 适合结构化块和扩展公式 |
| 公式渲染 | KaTeX | 快速、适合 LaTeX 渲染 |
| 图谱视图 | React Flow | 适合可编辑节点图 |
| 自动布局 | ELK / Dagre | 用于一键整理思维导图 |
| 本地数据库 | SQLite | 本地优先，稳定可迁移 |
| 全文检索 | SQLite FTS5 | 搜论文、笔记、AI 回答 |
| 向量检索 | sqlite-vec | 本地语义检索 |
| PDF 元数据/参考文献 | GROBID | 适合学术 PDF 解析 |
| 元数据补全 | Crossref / OpenAlex / Semantic Scholar | DOI、摘要、作者、引用信息 |
| Zotero 同步 | Zotero Web API | 连接个人库和群组库，支持条目、集合、标签和笔记同步 |
| 网页元数据抓取 | Zotero translators / translation-server | 复用 Zotero 生态抓取网页、DOI、出版商页面和学术数据库元数据 |
| 屏幕截图 | Electron desktopCapturer | 截取桌面窗口或屏幕 |
| PDF 区域截图 | PDF.js canvas 裁剪 | 清晰、无需系统截图权限 |
| 模型接入 | 自研 Provider Adapter | 支持官方和中转站 |
| 社区后端 | NestJS / FastAPI + PostgreSQL | 后期建设 |

## 12. MVP 最小可行范围

第一版不要做太大，建议只做以下闭环：

1. 导入并阅读 PDF。
2. 选中句子高亮、收藏。
3. 用户填写第三方 Base URL、API Key、Model。
4. 选中 PDF 原文向 AI 提问。
5. AI 回答可以插入笔记。
6. 用户可以对一个问题点击“横向展开”。
7. 系统自动生成问题节点和回答节点。
8. 用户点击“本文图谱”看到一张可编辑问答网络图。
9. 支持数字引用 `[1]` 的悬浮预览。
10. 支持一键加入待读表。

这个 MVP 已经能体现产品差异化。

暂缓：

- 社区。
- 云同步。
- 多人协作。
- 扫描 PDF OCR。
- 作者年份引用完整支持。
- Word/PDF 高质量导出。
- 多篇论文大型知识图谱。

## 13. 下一步建议

建议下一步产出三份更细文档：

1. `product-requirements.md`：完整 PRD，定义页面、交互、用户流程。
2. `database-schema.md`：数据库迁移和索引细节。
3. `mvp-roadmap.md`：把 Phase 0 到 Phase 2 拆成开发任务。

也可以先做技术原型：

```text
PDF.js 打开论文
→ 选中一句话
→ 弹出“提问 / 高亮 / 收藏”
→ 调用 OpenAI-compatible API
→ AI 回答插入 Tiptap 笔记
→ React Flow 生成一个问题-回答-原文的三节点图
```

只要这个闭环跑通，后续的公式、参考文献、社区都可以在同一架构上继续扩展。

## 14. 参考资料

技术选型和后续调研可优先查看这些官方资料：

- PDF.js：https://github.com/mozilla/pdf.js
- Chatbox CE：https://github.com/chatboxai/chatbox
- Electron desktopCapturer：https://www.electronjs.org/docs/latest/api/desktop-capturer
- Tiptap：https://tiptap.dev/docs
- KaTeX：https://katex.org/docs/api
- React Flow：https://reactflow.dev/
- ELKjs：https://github.com/kieler/elkjs
- SQLite FTS5：https://www.sqlite.org/fts5.html
- sqlite-vec：https://github.com/asg017/sqlite-vec
- GROBID：https://github.com/grobidOrg/grobid
- Zotero Web API：https://www.zotero.org/support/dev/web_api/v3/basics
- Zotero OAuth：https://www.zotero.org/support/dev/web_api/v3/oauth
- Zotero translators：https://www.zotero.org/support/dev/translators
- Zotero translation-server：https://github.com/zotero/translation-server
- Crossref REST API：https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- OpenAlex API：https://docs.openalex.org/
- Semantic Scholar API：https://api.semanticscholar.org/api-docs/
