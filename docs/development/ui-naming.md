# 当前工作台 UI 命名索引

本文档用于给当前已经落地的桌面端 UI 建立统一叫法，方便后续直接按名字指定修改区域。
对应的视觉风格约定见 `ui-style-guide.md`。

## 使用方式

- 优先使用 `ID + 中文名` 指定位置，例如：`改 AI.COMPOSER（AI 输入区）高度`。
- 需要更细时，直接说父级和子级，例如：`改 PDF.TOOLBAR / PDF.TOOLBAR.ZOOM`。
- 本索引只覆盖当前 `apps/desktop/src/renderer` 已实现界面，不覆盖技术方案里尚未落地的未来面板。
- 主要代码锚点集中在 `apps/desktop/src/renderer/App.tsx`、`apps/desktop/src/renderer/components/PdfViewer.tsx`、`apps/desktop/src/renderer/styles.css`。

## 全局与工作台骨架

| ID | 中文名 | 位置 / 用途 | 代码锚点 |
|---|---|---|---|
| `APP.SHELL` | 工作台壳层 | 整个桌面主界面的最外层容器 | `App.tsx` `app-shell` / `.app-shell` |
| `TITLEBAR.ROOT` | 顶栏 | 最上方自定义标题栏 | `App.tsx` `titlebar` / `.titlebar` |
| `TITLEBAR.BRAND` | 品牌区 | 左上角图标和 `Inspiration` 名称 | `App.tsx` `brand` / `.brand` |
| `TITLEBAR.MENU` | 菜单区 | `File`、`Edit`、`Selection`、`View`、`Go`、`Run` | `App.tsx` `menubar` / `.menubar` |
| `TITLEBAR.VIEW_MENU` | View 菜单弹层 | 打开或恢复 PDF、Note、AI 面板 | `App.tsx` `menu-popover` / `.menu-popover` |
| `TITLEBAR.NAV` | 顶栏导航区 | 返回、前进两个箭头按钮 | `App.tsx` `titlebar-center` 中前两个 `nav-button` |
| `TITLEBAR.COMMAND` | 命令中心 | `Open PDF / Run Command` 按钮 | `App.tsx` `command-center` / `.command-center` |
| `TITLEBAR.STATUS` | 顶栏状态区 | 顶栏右侧 `Ready` 圆点状态 | `App.tsx` `titlebar-status` / `.titlebar-status` |
| `TITLEBAR.RUNTIME` | 运行时信息区 | 顶栏右侧 `Electron x.x.x` | `App.tsx` `runtime` / `.runtime` |
| `WORKSPACE.ROOT` | 主工作区 | 顶栏和底部状态栏之间的主体区域 | `App.tsx` `workspace` / `.workspace` |
| `WORKBENCH.ROOT` | 停靠布局区 | 负责 Library、PDF、Note、AI 的停靠布局 | `App.tsx` `WorkbenchPanelLayout` / `.workbench-layout-shell` |
| `WORKBENCH.RESIZE_HANDLE` | 面板分隔线 | 各停靠面板之间可拖动的分隔线 | `App.tsx` `PanelResizeHandle` / `.workbench-panel-resize-handle` |
| `WORKBENCH.DOCK_PREVIEW` | 停靠预览区 | 拖拽面板时出现的蓝色落点预览 | `App.tsx` `dropPreview` / `.dock-preview` |
| `STATUSBAR.ROOT` | 底部状态栏 | 窗口最下方状态信息条 | `App.tsx` `statusbar` / `.statusbar` |
| `MODAL.NOTE_CLOSE` | 笔记关闭确认弹窗 | 关闭未保存笔记时的确认对话框 | `App.tsx` `confirm-modal` / `.confirm-modal` |

## 左侧主导航与主侧栏

| ID | 中文名 | 位置 / 用途 | 代码锚点 |
|---|---|---|---|
| `ACTIVITYBAR.ROOT` | Activity Bar 主导航栏 | 工作区最左侧竖向图标栏 | `App.tsx` `activitybar` / `.activitybar` |
| `ACTIVITYBAR.LIBRARY` | 文献库入口 | 左侧第 1 个书架图标 | `App.tsx` `activityItems.library` |
| `ACTIVITYBAR.FAVORITES` | 收藏入口 | 左侧第 2 个星标图标 | `App.tsx` `activityItems.favorites` |
| `ACTIVITYBAR.NOTE` | 笔记入口 | 左侧第 3 个笔记本图标 | `App.tsx` `activityItems.note` |
| `ACTIVITYBAR.GRAPH` | 问答图入口 | 左侧第 4 个层级图图标 | `App.tsx` `activityItems.graph` |
| `PANEL.LIBRARY` | 主侧栏面板 | 承载 Library / Favorites / Notes / Graph 四种主视图的停靠面板 | `App.tsx` `panelId === 'library'` |
| `SIDEBAR.LIBRARY.HEADER` | 文献库头部 | 当前 `Library` 视图顶部标题行 | `App.tsx` `SectionHeader title="Library"` |
| `SIDEBAR.LIBRARY.IMPORT` | 导入论文按钮 | `Import Paper` 按钮 | `App.tsx` `wide-command` |
| `SIDEBAR.LIBRARY.SORTBAR` | 文献排序条 | `最近 / 名称 / 路径` 排序切换 | `App.tsx` `library-sortbar` / `.library-sortbar` |
| `SIDEBAR.LIBRARY.LIST` | 论文列表 | 已打开或已导入论文的列表容器 | `App.tsx` `sortedPdfPaths.map(...)` |
| `SIDEBAR.LIBRARY.ITEM` | 论文条目卡 | 单篇论文在列表中的一行 | `App.tsx` `resource-row-shell` / `.resource-row` |
| `SIDEBAR.LIBRARY.PROGRESS` | 阅读进度条 | 论文条目内的绿色阅读进度条和即时提示 | `App.tsx` `resource-reading-progress` / `.resource-reading-progress` |
| `SIDEBAR.FAVORITES.HEADER` | 收藏视图头部 | `Favorites` 视图顶部标题行 | `App.tsx` `SectionHeader title="Favorites"` |
| `SIDEBAR.FAVORITES.LIST` | 收藏列表 | 收藏视图内容区 | `App.tsx` `FavoritesView` / `.sidebar-content` |
| `SIDEBAR.FAVORITES.ITEM` | 收藏条目卡 | 单个收藏项，可指向论文、笔记或 AI 回答 | `App.tsx` `favorite-row-shell` / `.favorite-row` |
| `SIDEBAR.NOTES.HEADER` | 笔记主视图头部 | 左侧 `Notes` 视图顶部标题行 | `App.tsx` `SectionHeader title="Notes"` |
| `SIDEBAR.NOTES.CURRENT_PDF` | 当前论文卡 | `Notes` 视图顶部显示当前 PDF 的卡片 | `App.tsx` `CurrentPdfNotes` 首个 `resource-row` |
| `SIDEBAR.NOTES.LIST` | 当前论文笔记列表 | 当前 PDF 下的笔记条目列表 | `App.tsx` `CurrentPdfNotes` / `.sidebar-note-card-shell` |
| `SIDEBAR.NOTES.NEW` | 新建当前 PDF 笔记入口 | 当前 PDF 没有笔记时出现的创建入口 | `App.tsx` `新增当前 PDF 笔记` 按钮 |
| `SIDEBAR.GRAPH.HEADER` | 问答图主视图头部 | 左侧 `Graph` 视图顶部标题行 | `App.tsx` `SectionHeader title="Graph"` |
| `SIDEBAR.GRAPH.PAPER_CARD` | 图谱论文卡 | `Graph` 视图中每篇论文的入口卡片 | `App.tsx` `CurrentPdfGraph` 顶部 `resource-row` |
| `SIDEBAR.GRAPH.TREE` | 问答树 | 按论文分组的 AI 对话树容器 | `App.tsx` `.graph-tree` |
| `SIDEBAR.GRAPH.QUESTION` | 问题节点 | 问答树中的问题行 | `App.tsx` `.graph-tree-row.question` |
| `SIDEBAR.GRAPH.ANSWER` | 回答节点 | 问答树中的回答预览行 | `App.tsx` `.graph-tree-row.answer` |
| `SIDEBAR.GRAPH.STATUS` | 处理状态行 | 问答树中的发送中、完成、失败状态行 | `App.tsx` `.graph-tree-row.status` |

## 停靠面板与页签

| ID | 中文名 | 位置 / 用途 | 代码锚点 |
|---|---|---|---|
| `PANEL.PDF` | PDF 面板 | 中央 PDF 阅读停靠面板 | `App.tsx` `panelId === 'editor'` |
| `PANEL.NOTE` | Note 面板 | 笔记编辑停靠面板 | `App.tsx` `panelId === 'note'` |
| `PANEL.AI` | AI 面板 | 右侧 AI 对话停靠面板 | `App.tsx` `panelId === 'ai'` |
| `PANEL.TITLEBAR` | 面板标题栏 | 可拖拽的灰白色浏览器式标题栏 | `App.tsx` `WorkbenchPanelFrame` / `.workbench-panel-titlebar` |
| `PANEL.CLOSE` | 面板关闭按钮 | PDF、Note、AI 面板右上角关闭入口 | `App.tsx` `workbench-titlebar-button` 关闭按钮 |

## PDF 面板

| ID | 中文名 | 位置 / 用途 | 代码锚点 |
|---|---|---|---|
| `PDF.TABS` | PDF 标签条 | PDF 面板标题栏中的已打开 PDF 页签区 | `App.tsx` `EditorTitlebarTabs` / `.pdf-title-tab-strip` |
| `PDF.TAB` | PDF 单个标签 | 单个已打开 PDF 标签 | `App.tsx` `.browser-pdf-tab` |
| `PDF.TAB.ADD` | 新开 PDF 按钮 | PDF 标签条右侧 `+` | `App.tsx` `.editor-tab-add` |
| `PDF.TOOLBAR` | PDF 顶部工具栏 | PDF 阅读区顶部整条工具栏 | `PdfViewer.tsx` `.pdf-toolbar` |
| `PDF.TOOLBAR.OVERVIEW` | 页面总览按钮 | 左上角打开缩略图总览 | `PdfViewer.tsx` `.pdf-overview-toggle` |
| `PDF.TOOLBAR.OPEN` | 打开 PDF 按钮 | 工具栏文件夹按钮 | `PdfViewer.tsx` `title="打开 PDF"` |
| `PDF.TOOLBAR.RELOAD` | 重载 PDF 按钮 | 工具栏刷新按钮，清空渲染缓存 | `PdfViewer.tsx` `title="重新加载 PDF（清除渲染缓存）"` |
| `PDF.TOOLBAR.BROWSE_MODE` | 浏览模式切换 | `滚动 / 翻页` 切换组 | `PdfViewer.tsx` `.pdf-browse-mode-control` |
| `PDF.TOOLBAR.RENDER_MODE` | 渲染模式切换 | `兼容 / PDF.js` 切换按钮 | `PdfViewer.tsx` `.pdf-render-mode-button` |
| `PDF.TOOLBAR.PAGE_NAV` | 页码导航组 | 上一页、页码、下一页 | `PdfViewer.tsx` `page-indicator` 附近按钮 |
| `PDF.TOOLBAR.ZOOM` | 缩放控制组 | 缩小、百分比、放大 | `PdfViewer.tsx` `zoom-reset-button` 附近 |
| `PDF.TOOLBAR.SELECT_TOOLS` | 选区与标注工具组 | 复制、鼠标工具、马克笔、批注、撤销 | `PdfViewer.tsx` `pdf-tool-button` 等按钮 |
| `PDF.TOOLBAR.COLOR_PICKER` | 高亮颜色面板 | 马克笔右侧颜色选择器 | `PdfViewer.tsx` `AnnotationColorPicker` |
| `PDF.TOOLBAR.AI_ACTION` | 选区问 AI 按钮 | 工具栏最右侧闪光按钮 | `PdfViewer.tsx` `title="用选区询问 AI"` |
| `PDF.TOOLBAR.STATUS_HINT` | 工具栏提示区 | 右侧快捷键提示和注释数量 | `PdfViewer.tsx` `.pdf-shortcut-hint` / `.pdf-annotation-count` |
| `PDF.EMPTY` | PDF 空状态页 | 尚未打开 PDF 时的占位页 | `PdfViewer.tsx` `.pdf-placeholder` |
| `PDF.STAGE` | PDF 阅读舞台 | 承载单页或连续滚动内容的核心阅读区 | `PdfViewer.tsx` `.pdf-stage` |
| `PDF.SCROLL_STRIP` | 连续滚动页带 | 滚动模式下的纵向页面串 | `PdfViewer.tsx` `PdfScrollStrip` / `.pdf-scroll-strip` |
| `PDF.PAGE_SINGLE` | 单页阅读画布区 | 翻页模式下的单页容器 | `PdfViewer.tsx` `.pdf-page-shell` / `.pdf-page` |
| `PDF.PAGE_NAV_FLOAT` | 浮动翻页按钮 | 翻页模式左右悬浮翻页按钮 | `PdfViewer.tsx` `.pdf-page-nav-buttons` |
| `PDF.ANNOTATION_LAYER` | 高亮层 | 渲染高亮块的覆盖层 | `PdfViewer.tsx` `.pdf-annotation-layer` |
| `PDF.TEXT_LAYER` | 文字层 | 负责选择、复制和定位文本的透明文字层 | `PdfViewer.tsx` `.pdf-text-layer` |
| `PDF.NOTE_LAYER` | 批注钉层 | 渲染批注钉子的覆盖层 | `PdfViewer.tsx` `.pdf-note-layer` |
| `PDF.SELECTION_POPOVER` | 选区浮动工具条 | 选中文字后出现的复制 / 批注 / 问 AI 小浮层 | `PdfViewer.tsx` `.selection-popover` |
| `PDF.NOTE_EDITOR_POPOVER` | 选区批注编辑器 | 选区浮层内展开的批注文本框 | `PdfViewer.tsx` `.annotation-note-editor` |
| `PDF.ANNOTATION_PREVIEW` | 批注预览卡 | 点击批注钉子后出现的批注预览卡 | `PdfViewer.tsx` `AnnotationPreview` / `.annotation-preview` |
| `PDF.LOADING_MASK` | PDF 加载遮罩 | `正在加载 PDF...` / `正在渲染...` 提示层 | `PdfViewer.tsx` `.pdf-loading` |
| `PDF.ERROR_MASK` | PDF 错误提示层 | PDF 读取或渲染失败提示 | `PdfViewer.tsx` `.pdf-error` |
| `PDF.OVERVIEW.DIALOG` | 页面总览面板 | 缩略图总览浮层 | `PdfViewer.tsx` `PdfOverviewPanel` / `.pdf-overview-panel` |
| `PDF.OVERVIEW.GRID` | 页面总览网格 | 总览中的缩略图网格 | `PdfViewer.tsx` `.pdf-overview-grid` |
| `PDF.OVERVIEW.THUMB` | 页面缩略图卡 | 总览或滚动模式中的单页位图卡片 | `PdfViewer.tsx` `PdfBitmapPage` / `.pdf-bitmap-page` |

## Note 面板

| ID | 中文名 | 位置 / 用途 | 代码锚点 |
|---|---|---|---|
| `NOTE.TABS` | Note 标签条 | Note 面板标题栏中的笔记页签区 | `App.tsx` `NoteTitlebarTabs` / `.pdf-title-tab-strip` |
| `NOTE.TAB` | Note 单个标签 | 单篇已打开笔记标签 | `App.tsx` `.browser-note-tab` |
| `NOTE.TAB.ADD` | 新建笔记按钮 | Note 标签条右侧 `+` | `App.tsx` `.editor-tab-add` |
| `NOTE.TEMPLATE.PAGE` | 笔记模板选择页 | 新建笔记时出现的模板选择页 | `App.tsx` `NoteTemplateChooser` / `.note-template-page` |
| `NOTE.TEMPLATE.TEXT` | 文字模板卡 | 论文笔记文字模板入口 | `App.tsx` `论文笔记文字模板` 按钮 |
| `NOTE.TEMPLATE.SCREENSHOT` | 截图模板卡 | PDF 分段截图笔记入口 | `App.tsx` `PDF 分段截图笔记` 按钮 |
| `NOTE.PAGE` | 笔记正文页 | 真正的笔记编辑页面 | `App.tsx` `.note-page` |
| `NOTE.KICKER` | 当前论文标识条 | 笔记页顶部显示当前 PDF 文件名的小条 | `App.tsx` `.note-page-kicker` |
| `NOTE.HEADER` | 笔记头部 | 纸张内的标题输入行，不承载按钮 | `NotePanelContent.tsx` `.note-header` |
| `NOTE.TITLE_INPUT` | 笔记标题输入框 | 笔记标题编辑框 | `App.tsx` `.note-title-input` |
| `NOTE.META` | 笔记元信息行 | 段数、字数、更新时间 | `NotePanelContent.tsx` `.note-meta` |
| `NOTE.PANEL_TOOLBAR` | Note 面板工具栏 | 纸张外侧的保存、收藏、导出、格式和插入入口 | `NotePanelContent.tsx` `.note-panel-toolbar` |
| `NOTE.FORMAT_TOOLBAR` | 笔记格式工具组 | 字体、字号、加粗、倾斜、下划线、高亮、分点和段落类型 | `NotePanelContent.tsx` `.note-format-toolbar` |
| `NOTE.INSERT_TOOLBAR` | 笔记插入工具组 | 插入段落、标题、截图等内容类型 | `NotePanelContent.tsx` `.note-insert-toolbar` |
| `NOTE.MARKDOWN_BODY` | Markdown 正文区 | 纸张内连续 Markdown 段落的容器 | `NotePanelContent.tsx` `.note-markdown-body` |
| `NOTE.MARKDOWN_SECTION` | 单段 Markdown 内容 | 一段具体的段落 / 标题 / 引用 / 截图说明，视觉上不再是块卡片 | `NotePanelContent.tsx` `NoteMarkdownSection` / `.note-markdown-section` |
| `NOTE.SOURCE_REFS` | 来源引用条 | 段落底部的来源标签列表 | `NotePanelContent.tsx` `.note-source-list` / `.note-source-chip` |
| `NOTE.EMPTY_TEXT` | 空笔记占位 | 没有任何段落时的纸张内占位文本 | `NotePanelContent.tsx` `.note-empty-markdown` |

## AI 面板

| ID | 中文名 | 位置 / 用途 | 代码锚点 |
|---|---|---|---|
| `AI.TABS` | AI 对话标签条 | AI 面板标题栏中的对话标签区 | `App.tsx` `AiTitlebarTabs` / `.pdf-title-tab-strip` |
| `AI.TAB` | AI 单个对话标签 | 单个对话或分支对话标签 | `App.tsx` `.browser-ai-tab` |
| `AI.TITLEBAR.NEW` | 新建对话按钮 | AI 标题栏右上角 `+` | `App.tsx` `title="新建对话"` |
| `AI.TITLEBAR.CONFIG` | AI 设置按钮 | AI 标题栏齿轮按钮 | `App.tsx` `title="AI 设置"` |
| `AI.TITLEBAR.HISTORY` | AI 历史按钮 | AI 标题栏时钟按钮 | `App.tsx` `title="历史记录"` |
| `AI.CONFIG.POPOVER` | AI 配置弹层 | 设置按钮展开后的配置区 | `App.tsx` `.ai-config-popover` |
| `AI.CONFIG.FORM` | AI 配置表单 | Provider、Base URL、Model、Key、系统提示词等表单 | `App.tsx` `.ai-provider-form` |
| `AI.HISTORY.POPOVER` | AI 历史弹层 | 历史记录浮层 | `App.tsx` `.ai-history-popover` |
| `AI.HISTORY.LIST` | AI 历史列表 | 历史记录中的对话列表 | `App.tsx` `.ai-history-list` |
| `AI.HISTORY.ITEM` | AI 历史条目 | 历史弹层中的单条对话项 | `App.tsx` `.ai-history-item` |
| `AI.CONVERSATION` | 当前对话正文区 | 展示当前对话问答内容的主体区域 | `App.tsx` `.ai-recent` |
| `AI.TURN_NAV` | 问题快速跳转条 | 对话正文右侧的小圆点导航列 | `App.tsx` `.ai-turn-navigator` |
| `AI.TURN_LIST` | 问答列表 | 当前对话的问答列表 | `App.tsx` `.ai-turn-list` |
| `AI.TURN` | 单轮问答块 | 一问一答的整体块 | `App.tsx` `.ai-turn` |
| `AI.MESSAGE.USER` | 用户问题气泡 | 单轮中的用户问题气泡 | `App.tsx` `.ai-user-bubble` |
| `AI.MESSAGE.ANSWER` | AI 回答正文 | 单轮中的 AI 回答正文容器 | `App.tsx` `.ai-answer-content` |
| `AI.ANSWER.ACTIONS` | 回答操作区 | 收藏、分支、复制按钮行 | `App.tsx` `.ai-answer-actions` |
| `AI.COMPOSER` | AI 输入区 | 底部输入器整体区域 | `App.tsx` `.ai-composer` |
| `AI.COMPOSER.RESIZE` | 输入区高度拖拽条 | 输入区顶部可上下拖动的高度调节条 | `App.tsx` `.ai-composer-resize-handle` |
| `AI.QUICK_ACTIONS` | 快捷任务条 | 输入框上方的论文任务快捷按钮行 | `App.tsx` `.ai-quick-actions` |
| `AI.CONTEXT_STRIP` | 上下文状态条 | 显示“当前论文上下文：PDF + 笔记”一行 | `App.tsx` `.ai-context-strip` |
| `AI.ATTACHMENT_LIST` | 附件条 | 已添加附件的 pill 列表 | `App.tsx` `.ai-attachment-list` |
| `AI.TEXTAREA` | AI 输入框 | 主要提问文本框 | `App.tsx` `.ai-composer textarea` |
| `AI.INPUT_TOOLBAR` | 输入区底部工具条 | 模型、思考强度、附件、发送所在底栏 | `App.tsx` `.ai-input-toolbar` |
| `AI.INPUT.MODEL_SELECT` | 模型下拉框 | 输入区底栏左侧模型选择 | `App.tsx` `aria-label="选择模型"` |
| `AI.INPUT.REASONING_SELECT` | 思考强度下拉框 | 输入区底栏左侧思考强度选择 | `App.tsx` `aria-label="选择思考强度"` |
| `AI.INPUT.ATTACH_BUTTON` | 附件按钮 | 输入区底栏右侧回形针按钮 | `App.tsx` `title="添加附件"` |
| `AI.INPUT.SEND_BUTTON` | 发送按钮 | 输入区底栏右侧发送按钮 | `App.tsx` `.send-button` |

## 当前还没有落地的区块

下面这些名称在技术方案里出现过，但当前 Renderer 还没有真实 UI，后续如果你提到它们，我会先和你确认是要新做还是改现有区块。

| 预留 ID | 预留名称 | 当前情况 |
|---|---|---|
| `PANEL.BOTTOM` | 底部面板 | 当前没有独立 Bottom Panel。现在只有窗口最底部 `STATUSBAR.ROOT`。 |
| `PANEL.CITATIONS` | 引用面板 | 当前没有独立 Citations 栏。 |
| `EDITOR.GRAPH` | 中央图谱编辑器 | 当前没有中央 Graph Editor，现阶段只有左侧 `SIDEBAR.GRAPH.*` 问答树。 |
| `EDITOR.SETTINGS` | 设置编辑器 | 当前没有独立 Settings Editor。 |

## 后续沟通建议

- 最省事的说法：`改 ID + 中文名 + 目标效果`。
- 如果要指出按钮，优先说父级，例如：`改 PDF.TOOLBAR 里的 PDF.TOOLBAR.RENDER_MODE`。
- 如果你只记得位置，也可以说口语描述，我会优先按这份索引回译成统一名字再执行。

示例：

- `改 TITLEBAR.COMMAND，让它更像 VS Code 的命令面板。`
- `把 SIDEBAR.LIBRARY.PROGRESS 的绿色进度条做细一点。`
- `把 AI.QUICK_ACTIONS 改成两行卡片。`
- `把 NOTE.PANEL_TOOLBAR 的导出按钮挪到最右边。`
