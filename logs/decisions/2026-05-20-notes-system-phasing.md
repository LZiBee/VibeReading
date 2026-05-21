# 笔记系统分阶段实施

- 日期：2026-05-20
- 状态：已采纳
- 背景：现有笔记工作流已可用，但模板、来源引用、回链和历史版本仍分散在 UI 与领域层之间。
- 方案：先落地 `shared` / `notes` / `renderer` 的模板与引用契约，再补 `db` 的模板、回链和版本表，最后把持久化从 App 状态迁到数据库。
- 取舍原因：先稳住现有工作流，避免一次性把编辑器、存储和模板系统一起重写。
- 影响范围：`packages/shared`、`packages/notes`、`apps/desktop/src/renderer`、`packages/db`
- 后续动作：优先实现模板注册表和 `note` / `note_block` 来源引用，再进入数据库迁移。
