# PDF 选区释义与翻译统一路由

- 日期：2026-05-23
- 状态：已采用
- 背景：PDF 选区需要同时支持查词、短语释义和长句翻译，但第一版不希望在 UI 上拆成“查词”和“翻译”两个入口，以免打断阅读流。
- 方案：新增 Workbench 命令 `selection.explain` 作为唯一前台入口；Renderer 只传递选区文本与来源信息，经 preload 调用 `selection:explain` IPC；Main 进程先调用 `packages/dictionary` 的 `resolveSelectionIntent` 判断单词、短语、句子或段落，再决定走本地词典或当前 AI Provider 翻译。
- 取舍原因：本地词典逻辑独立在 `packages/dictionary`，避免塞进 PDF UI 或 AI Provider；Main 进程统一处理 AI 配置、缓存和 IPC 入参清洗，符合 Renderer 不直接访问 API Key 和业务核心能力的边界。
- 影响范围：新增 `packages/dictionary`，扩展 `packages/shared` 选区释义协议，桌面端新增 `selection:explain` IPC 与 PDF 选区结果卡片。
- 后续动作：扩大术语词典覆盖面；补“插入笔记”和术语表沉淀；若翻译链路需要流式输出，再把结果协议扩展为事件或任务式响应。
