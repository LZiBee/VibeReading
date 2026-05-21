# 代码区说明

本文档规定项目文件夹规划、代码放置位置和模块边界。后续 AI 实现功能时，必须先按本说明判断文件应该写到哪里。

## 总体目录

```text
THESIS_AGENT/
  apps/
    desktop/
      src/
        main/           Electron 主进程：窗口、菜单、系统能力、安全 IPC
        preload/        受控桥接层：暴露安全 API，不暴露完整 ipcRenderer
        renderer/       React 渲染进程：工作台 UI、页面、交互
  packages/
    workbench/          工作台内核：命令、视图、编辑器、菜单、布局、主题、插件点
    ui/                 通用 UI 基础组件、图标、设计 token
    pdf/                PDF 阅读、文本层、标注、截图、引用热点
    notes/              笔记编辑器、块结构、Markdown/富文本转换
    ai/                 模型 Provider、流式输出、提示词、AI 工具调用
    rag/                分块、检索、重排、上下文组装
    graph/              问题节点、知识图谱、布局、边关系
    citations/          参考文献解析、悬浮预览、元数据补全、Zotero 接入
    db/                 SQLite、迁移、仓储、全文索引、向量索引
    shared/             通用类型、Result、事件、常量、跨包协议
  docs/                 架构、需求、开发规范
  logs/                 开发进度、报错、架构决策
  scripts/              项目脚本，如初始化、检查、导入导出
  tests/                跨模块测试、集成测试、端到端测试
  workspace/            本地运行数据示例区，不提交真实数据
```

## 代码区职责

`apps/desktop` 只负责把各个包组装成桌面应用。不要把复杂业务逻辑直接写在应用入口里。

`packages/workbench` 是核心底座。命令系统、快捷键、视图注册、编辑器注册、菜单注册、布局、主题 token、内部插件机制都放这里。

`packages/ui` 只放通用 UI。它可以被 PDF、Notes、AI、Graph 等模块复用，但不能反向依赖业务包。

`packages/pdf` 负责 PDF 能力，包括 PDF.js 渲染、文本选择、高亮、批注、区域截图、引用热点。它不直接调用 AI，也不直接写业务笔记，而是通过命令或服务接口交互。

`packages/notes` 负责结构化笔记。所有笔记块都必须支持来源引用 `SourceRef`，方便从笔记跳回 PDF、AI 回答、截图或参考文献。

`packages/ai` 负责模型接入。OpenAI-compatible、官方模型、本地模型、中转站配置、流式输出都放这里。API Key 不进入 Renderer。

`packages/rag` 负责检索问答流程。它可以使用 `db` 读取索引，可以调用 `ai` 生成回答，但不要把 UI 状态写进这里。

`packages/graph` 负责问题图谱和知识网络。节点、边、布局算法、图谱导出都放这里。

`packages/citations` 负责参考文献能力。正文引用识别、文末条目解析、DOI/arXiv/OpenAlex/Crossref 元数据补全、Zotero Web API 同步适配、Zotero translators 抓取适配都放这里。

`packages/db` 是唯一数据库访问层。数据库迁移、Repository、FTS5、sqlite-vec 都放这里。UI 不直接写 SQL。

`packages/shared` 只能放无业务副作用的通用内容，例如类型、错误结构、事件协议、工具函数。

## 新文件放置规则

新增功能时，先判断它属于哪一层：

| 功能类型 | 放置位置 |
|---|---|
| Electron 窗口、菜单、托盘、系统能力 | `apps/desktop/src/main` |
| 安全 IPC 桥接 | `apps/desktop/src/preload` |
| 页面、面板、工作台容器 | `apps/desktop/src/renderer` |
| 命令、快捷键、视图注册、编辑器注册 | `packages/workbench/src` |
| 按钮、输入框、弹窗、主题 token | `packages/ui/src` |
| PDF 渲染、高亮、标注、截图 | `packages/pdf/src` |
| 笔记块、富文本编辑、Markdown 转换 | `packages/notes/src` |
| 模型配置、Provider、流式响应 | `packages/ai/src` |
| 文本分块、检索、上下文构造 | `packages/rag/src` |
| 图谱节点、边、布局、导出 | `packages/graph/src` |
| 引用识别、参考文献、悬浮预览、Zotero 接入 | `packages/citations/src` |
| 数据库 schema、迁移、仓储 | `packages/db/src` |
| 跨模块类型和协议 | `packages/shared/src` |

如果一个功能同时涉及多个模块，优先拆成：

1. `shared` 定义类型。
2. 业务包实现核心逻辑。
3. `workbench` 注册命令或视图。
4. `apps/desktop` 负责应用组装。

## 命名和语言约定

- 文档、日志、任务说明使用中文。
- 代码变量、函数、类型、文件名使用英文，便于生态工具和类型系统识别。
- UI 文案第一版默认中文。
- 代码注释优先中文，但只解释复杂意图，不重复代码本身。
- 报错日志里的原始错误可以保留英文，不要强行翻译。

## 模块边界原则

- Renderer 不直接访问文件系统、数据库、API Key。
- 所有长任务进入 Worker、Utility Process 或后台任务队列。
- 数据库只通过 `packages/db` 访问。
- AI 请求必须经过 `packages/ai` 的 Provider Adapter。
- RAG 回答必须带来源引用，来源结构统一使用 `SourceRef`。
- PDF 原文不直接修改，标注先存数据库，导出时再写入新 PDF。
- 组件不要硬编码颜色，统一使用主题 token。

## AI 开发检查清单

每次 AI 开发一个任务时，按下面顺序执行：

1. 阅读本文件和日志规范。
2. 在 `logs/progress/YYYY-MM-DD.md` 写开始记录。
3. 找到正确代码区，不跨模块乱放文件。
4. 修改代码或文档。
5. 运行能运行的检查、测试或构建命令。
6. 如果失败，把报错写入 `logs/errors/YYYY-MM-DD.md`。
7. 在进度日志里写完成情况、修改文件、验证结果、下一步。
