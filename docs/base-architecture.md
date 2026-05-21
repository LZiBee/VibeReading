# 底层架构决策：VS Code 式论文阅读工作台

版本：v0.1

日期：2026-05-18

## 1. 最终决策

本项目底层采用：

```text
Electron + React + TypeScript + 自研 Workbench Core
```

具体含义：

- 使用 Electron 做跨平台桌面运行时。
- 使用 React + TypeScript 实现主界面。
- 使用 Vite 作为前端构建工具。
- 自研一个轻量 Workbench Core，提供类似 VS Code 的布局、命令、视图、编辑器、快捷键、主题和扩展点。
- 不 fork VS Code / Code-OSS。
- 不以 Eclipse Theia 作为主底座。
- Tauri 暂不作为第一版主底座，但架构上保留未来迁移或实验空间。

一句话结论：

> 做一个“像 VS Code 的论文阅读工作台”，而不是“改一个 VS Code”。

## 2. 为什么选 Electron

这个软件的核心不是简单表单应用，而是一个复杂的桌面工作台：

- PDF.js 长文档渲染。
- 文本层和高亮 overlay。
- 区域截图。
- Tiptap 富文本笔记。
- React Flow 知识图谱。
- 流式 AI 对话。
- 本地 SQLite、FTS5、向量检索。
- 本地文件系统访问。
- 多窗口、菜单、快捷键、系统托盘、剪贴板、截图、Keychain。
- 后续插件化。

Electron 的优势：

- VS Code 本身就是 Electron 路线，适合这种工作台型软件。
- Chromium 渲染环境一致，PDF.js、Canvas、Web Worker、复杂前端组件更稳定。
- Node.js 能力成熟，适合本地文件、SQLite、索引、子进程和插件宿主。
- 生态成熟，打包、自动更新、崩溃日志、深链、系统集成方案完整。
- 第三方插件如果以 JS/TS 编写，Electron 更容易隔离到 extension host 进程。

代价：

- 安装包和内存占用比 Tauri 大。
- 需要严格遵守 Electron 安全规则。

这个代价可以通过架构控制：

- 大模块按需加载。
- PDF 页面虚拟渲染。
- 图谱和 AI 面板懒加载。
- 数据库和索引放到 Worker / utility process。
- 渲染进程禁用 Node.js。
- 使用 contextIsolation 和安全 IPC。

## 3. 为什么不选 Tauri 作为第一版底座

Tauri 的优点明显：

- 安装包小。
- Rust 后端性能好。
- 系统 WebView 资源占用低。

但第一版不建议主用 Tauri，原因是：

- 本软件前端复杂度高，对 Canvas、PDF.js、Web Worker、截图和复杂布局一致性要求高。
- Tauri 依赖系统 WebView，不同平台之间的渲染行为和 Web 能力可能有差异。
- 如果要做 VS Code 式插件宿主，JS/TS 扩展运行、隔离、调试和热加载在 Electron 下更自然。
- 团队早期需要快速验证产品形态，TypeScript 全栈更利于迭代。

Tauri 可以作为未来方向：

- 如果第一版稳定后，发现安装包体积和内存是核心痛点，可以评估 Tauri 壳层。
- 数据层、AI 层、PDF 层、笔记层都要通过接口隔离，避免和 Electron 绑定过深。
- 未来可以把高性能部分迁到 Rust sidecar，而不是一开始就重写整个桌面壳。

## 4. 为什么不 fork VS Code / Code-OSS

不建议 fork VS Code 的原因：

- VS Code 是代码编辑器产品，核心模型围绕文件、语言服务、调试、终端和代码扩展。
- 论文阅读器需要 PDF、笔记、AI 图谱、参考文献、待读表和社区，不应该被代码编辑器模型牵着走。
- 深度修改 Code-OSS 的 workbench 成本高，升级困难。
- 产品会显得像“魔改 IDE”，而不是一个轻便的论文阅读工具。

可以学习 VS Code：

- Activity Bar。
- Side Bar。
- Editor Area。
- Panel。
- Status Bar。
- Command Palette。
- Keybindings。
- Theme Tokens。
- Extension Points。

但不直接基于 VS Code 源码开发。

## 5. 为什么不以 Theia 作为主底座

Eclipse Theia 很适合做 IDE 类产品，它支持 Theia 扩展、Theia 插件和 VS Code 扩展机制。

但本项目第一版不以 Theia 为主底座：

- Theia 的抽象是 IDE 平台，概念和依赖较重。
- 它会带来命令、菜单、插件、语言服务、工作区等大量 IDE 语义。
- 本项目的主要对象是论文、笔记、问题图谱、参考文献，而不是代码工程。
- 轻便简洁的产品体验更适合自研专用 Workbench。

Theia 可以作为参考：

- 插件宿主隔离方式。
- 贡献点设计。
- 命令和菜单注册机制。
- VS Code 扩展 API 兼容策略。

## 6. Workbench UI 结构

整体采用 VS Code 式竖向工作台，但视觉更轻、更扁平。

```text
┌──────────────────────────────────────────────────────────┐
│ Title Bar / Command Center                               │
├──┬──────────────────┬──────────────────────┬────────────┤
│  │ Primary Side Bar │ Editor Area          │ Aux Side   │
│A │                  │                      │ Bar        │
│c │ - 文献库         │ - PDF Editor Tab     │ - AI       │
│t │ - 搜索           │ - Note Editor Tab    │ - 引用     │
│i │ - 待读表         │ - Graph View Tab     │ - 大纲     │
│v │ - 图谱           │                      │ - 注释     │
│i │                  │                      │            │
│t │                  │                      │            │
│y │                  │                      │            │
│  ├──────────────────┴──────────────────────┴────────────┤
│  │ Bottom Panel                                          │
│  │ - 全局检索 / 任务 / 日志 / 导出进度                   │
├──┴───────────────────────────────────────────────────────┤
│ Status Bar                                                │
└──────────────────────────────────────────────────────────┘
```

核心区域：

- Activity Bar：左侧竖排图标，只保留关键入口。
- Primary Side Bar：文献库、搜索、待读表、标签、社区。
- Editor Area：PDF、笔记、思维导图、设置页都作为可切换 editor。
- Auxiliary Side Bar：AI、引用、注释、公式、页面大纲。
- Bottom Panel：全局搜索结果、后台任务、导入进度、索引状态。
- Status Bar：当前论文、页码、模型、索引状态、同步状态。

## 7. UI 风格

风格关键词：

```text
扁平
轻量
克制
高信息密度
竖向工作流
少装饰
弱卡片
强状态
强导航
```

设计规则：

- 不做营销式首页。
- 不做大面积渐变背景。
- 不做浮夸卡片堆叠。
- 使用 1px 分割线、低对比背景、紧凑工具栏。
- 左侧图标导航固定，减少迷路。
- 中央永远优先给 PDF / 笔记 / 图谱。
- AI 是工作面板，不是全屏聊天应用。
- 笔记和图谱是主角，聊天只是输入和生成手段。

UI 技术：

```text
React
TypeScript
CSS Variables
Radix UI Primitives
@vscode/codicons
react-resizable-panels
```

说明：

- Radix UI 只用作无样式可访问组件基础，不采用重型 UI 框架。
- 图标优先使用 `@vscode/codicons`，保证 VS Code 式工具气质。
- 布局使用 `react-resizable-panels`，自研 Workbench Layout，不引入过重 docking 框架。
- 后续如果需要复杂拖拽停靠，再评估 Dockview。

## 8. Workbench Core 能力

Workbench Core 是本项目最重要的底层模块。

它不负责具体业务，而负责“软件如何被扩展”。

### 8.1 命令系统

所有动作都注册为命令：

```text
paper.open
paper.import
pdf.highlight
pdf.screenshot
note.insertSelection
ai.askSelection
ai.expandQuestion
graph.openPaperMap
citation.addToReadingList
zotero.connect
zotero.syncLibrary
zotero.captureFromUrl
```

命令可以被以下入口调用：

- 按钮。
- 右键菜单。
- 快捷键。
- 命令面板。
- 插件。
- AI 工具调用。

### 8.2 视图注册

每个侧边栏视图都是可注册的：

```ts
registerView({
  id: 'library',
  title: '文献库',
  icon: 'library',
  location: 'primary-sidebar',
  component: LibraryView
})
```

后续新增社区、同步、插件市场，不需要改主框架。

### 8.3 编辑器注册

PDF、笔记、图谱都是 editor：

```ts
registerEditor({
  id: 'pdf-reader',
  canOpen: resource => resource.type === 'paper-pdf',
  component: PdfEditor
})
```

编辑器类型：

- PDF Editor。
- Note Editor。
- Graph Editor。
- Search Editor。
- Settings Editor。
- Community List Editor。

### 8.4 右键菜单和工具栏

通过贡献点注册：

```text
menus.pdfSelection
menus.annotation
menus.noteBlock
menus.graphNode
menus.citationHover
toolbars.pdf
toolbars.note
toolbars.graph
```

这样以后新增功能，例如“生成 Anki 卡片”，只需要注册菜单项。

### 8.5 快捷键

快捷键绑定命令：

```json
{
  "key": "Ctrl+Shift+E",
  "command": "ai.expandQuestion",
  "when": "pdfSelection || questionNodeFocused"
}
```

### 8.6 Context Key

参考 VS Code 的 context key 思路：

```text
pdfSelection
paperOpen
noteFocused
graphNodeFocused
aiStreaming
citationHovered
```

按钮、菜单和快捷键根据上下文显示或禁用。

### 8.7 Theme Tokens

不要在组件里写死颜色。

统一使用 token：

```text
--app-bg
--sidebar-bg
--editor-bg
--panel-bg
--border-muted
--text-primary
--text-secondary
--accent
--selection-bg
--annotation-yellow
--annotation-green
```

后续支持：

- Light。
- Dark。
- High Contrast。
- 跟随系统。
- 用户自定义主题。

## 9. 进程与服务架构

Electron 进程划分：

```text
Main Process
  - 窗口生命周期
  - 菜单和快捷键
  - 文件系统
  - 安全 IPC
  - 协议注册
  - Keychain / safeStorage

Preload
  - 暴露受控 API
  - 不暴露完整 ipcRenderer

Renderer
  - React UI
  - PDF.js
  - Tiptap
  - React Flow
  - Workbench Core

Worker / Utility Process
  - SQLite
  - FTS5
  - sqlite-vec
  - 文档索引
  - RAG 检索
  - 后台导入任务

Optional Sidecars
  - GROBID
  - Zotero translation-server
  - OCR
  - 本地 embedding 服务
```

原则：

- Renderer 不直接访问文件系统。
- Renderer 不直接访问 API Key。
- 数据库不跑在 UI 线程。
- PDF 渲染和索引任务分离。
- 所有长任务进入任务队列。

## 10. 插件化路线

第一阶段不要做公开插件市场，但底层按插件化组织。

### 10.1 内部插件

每个业务模块都是内部插件：

```text
@app/plugin-library
@app/plugin-pdf
@app/plugin-notes
@app/plugin-ai
@app/plugin-graph
@app/plugin-citations
@app/plugin-zotero
@app/plugin-reading-list
@app/plugin-community
```

每个插件通过 `activate(context)` 注册命令、视图、编辑器、菜单。

```ts
export function activate(context: AppExtensionContext) {
  context.commands.registerCommand('ai.askSelection', askSelection)
  context.views.registerView(...)
  context.menus.registerMenuItem(...)
}
```

### 10.2 外部插件

后续再支持第三方插件。

外部插件必须运行在独立 extension host：

```text
Extension Host Process
  - 运行第三方 JS 插件
  - 只通过受控 API 访问主程序
  - 禁止直接访问用户 PDF 和 API Key
  - 权限声明
```

插件权限示例：

```json
{
  "permissions": [
    "paper:read",
    "note:write",
    "ai:invoke",
    "graph:write"
  ]
}
```

第一版只做内部插件机制，公开插件系统至少放到 Beta 之后。

## 11. 本地数据底座

使用 SQLite 作为唯一主数据库。

原因：

- 本地优先。
- 单文件易备份。
- 事务可靠。
- 支持 FTS5。
- 可接 sqlite-vec。
- 适合论文、笔记、注释、图谱、待读表统一管理。

推荐：

```text
SQLite + WAL
better-sqlite3
SQLite FTS5
sqlite-vec
drizzle / kysely 作为类型安全查询层
```

数据库运行位置：

```text
Worker / Utility Process
```

不要在 Renderer 直接操作数据库。

文件存储：

```text
workspace/
  library.db
  papers/
  screenshots/
  exports/
  cache/
  indexes/
```

## 12. 包结构

建议 monorepo：

```text
thesis-agent/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
  packages/
    workbench/
      src/
        commands/
        keybindings/
        views/
        editors/
        menus/
        layout/
        themes/
        extensions/
    ui/
      src/
        primitives/
        icons/
        tokens/
    pdf/
      src/
        reader/
        text-layer/
        annotations/
        screenshots/
    notes/
      src/
        editor/
        blocks/
        markdown/
    ai/
      src/
        providers/
        streaming/
        prompts/
        tools/
    rag/
      src/
        chunking/
        retrieval/
        rerank/
    graph/
      src/
        nodes/
        edges/
        layout/
    citations/
      src/
        parser/
        hover/
        metadata/
        zotero/
        capture/
    db/
      src/
        migrations/
        repositories/
        search/
    shared/
      src/
        types/
        result/
        events/
  docs/
```

## 13. 第一版技术栈定稿

| 层级 | 选择 |
|---|---|
| 桌面运行时 | Electron |
| 主语言 | TypeScript |
| 前端框架 | React |
| 构建工具 | Vite |
| UI 基础 | Radix UI Primitives + 自研 CSS Tokens |
| 图标 | @vscode/codicons |
| 布局 | 自研 Workbench Layout + react-resizable-panels |
| PDF | PDF.js |
| 笔记编辑器 | Tiptap / ProseMirror |
| 图谱 | React Flow + ELK / Dagre |
| 本地数据库 | SQLite |
| SQL 访问 | better-sqlite3 + drizzle/kysely |
| 全文搜索 | SQLite FTS5 |
| 向量检索 | sqlite-vec |
| AI 接入 | 自研 Provider Adapter |
| 密钥 | Electron safeStorage / OS Keychain |
| 后台任务 | Worker Threads / Electron Utility Process |
| 打包 | electron-builder 或 Electron Forge |
| 自动更新 | electron-updater，后续按分发渠道确定 |

## 14. 第一阶段不要做的事

为了保持底层干净，第一阶段不要做：

- 不 fork VS Code。
- 不直接上 Theia。
- 不做公开插件市场。
- 不做复杂拖拽 docking。
- 不引入重型 UI 框架。
- 不把 AI 聊天作为主界面。
- 不让 Renderer 直接访问 Node.js、文件系统或 API Key。
- 不把业务逻辑写死在 React 组件里。

## 15. 最小底座原型

最小原型应该先验证这条链：

```text
Electron 启动
→ Workbench Layout 显示
→ Activity Bar 切换文献库 / 搜索 / 待读表
→ Editor Area 打开 PDF Tab
→ Auxiliary Side Bar 打开 AI 面板
→ 选中 PDF 文本
→ 执行 command: ai.askSelection
→ AI 回答插入 Note Editor
→ 自动创建 Graph Node
```

如果这条链跑通，说明底层方向正确。

## 16. 架构边界原则

必须遵守：

- UI 只调用服务接口，不直接操作数据库。
- PDF、Notes、AI、Graph、Citations 都通过 Workbench 贡献点接入。
- 命令是交互中心，不让按钮直接写业务流程。
- 所有来源引用使用统一 `SourceRef`。
- AI Provider 和 RAG 解耦。
- 本地数据和社区数据结构提前兼容，但社区后端后置。
- 插件机制先内部化，成熟后再开放外部插件。

这套底层能同时满足：

- VS Code 式轻量工作台体验。
- 后续插件化。
- PDF 阅读复杂交互。
- AI Provider 灵活接入。
- 横向笔记和知识图谱。
- 参考文献悬浮预览。
- 未来社区和同步。
