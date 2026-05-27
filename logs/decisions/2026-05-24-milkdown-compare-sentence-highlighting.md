# Milkdown 对照模式句子高亮策略

- 日期：2026-05-24
- 状态：已采用
- 背景：全文翻译对照 note 当前由 MinerU block 生成三列表格，用户本轮要求先实现只读阅览、圆形阅读指针和原文/译文句子联动高亮，不改变逐段翻译的数据结构。
- 方案：仅在 Milkdown 全文对照只读模式下，通过 ProseMirror inline Decoration 为原文列和译文列按句生成 `translation-sentence` span，并用同一行同一序号生成相同 `sentenceId`；hover 状态保存在 React 组件内，再同步给同 `sentenceId` 的左右 span。
- 取舍原因：当前对照模式不可编辑，Decoration 能避免直接改写 ProseMirror 托管 DOM，同时不需要扩展 note block 数据模型、Markdown 序列化或 Milkdown schema；如果后续要支持句级持久引用，再迁移为结构化句子模型。
- 影响范围：`apps/desktop/src/renderer/components/note/milkdown/MilkdownNoteEditor.tsx` 与 `apps/desktop/src/renderer/styles/note.css`。
- 后续动作：后续若做逐句翻译、句子重排或句级持久引用，应把 `sentenceId` 生成前移到 MinerU/translation 数据层。
