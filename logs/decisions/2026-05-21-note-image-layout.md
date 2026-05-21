# Note 图片排版状态落在媒体块内容

- 日期：2026-05-21
- 状态：已采用
- 背景：Note 已有 `image` / `screenshot` 块和本地持久化清洗链路，新增图片拖拽落点、缩放、裁剪和环绕样式需要跨重启保留。
- 方案：在 `MediaNoteBlockContent` 中保存 `displayWidth`、`displayHeight`、`wrapStyle` 和 `crop`，Renderer 只负责交互与渲染，主进程清洗时保留这些字段。
- 取舍原因：避免为当前轻量 Note 编辑器引入新的全局布局状态或重型富文本依赖，也避免 Renderer 临时状态重启丢失。
- 影响范围：`packages/notes`、`apps/desktop/src/renderer/components/note`、`apps/desktop/src/main`。
- 后续动作：若后续接入完整图像裁剪器，可继续复用 `crop` 字段并把当前微调按钮替换为可视化裁剪框。
