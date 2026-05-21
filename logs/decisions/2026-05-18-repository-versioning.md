# 记录远程仓库与统一版本策略

- 日期：2026-05-18
- 状态：已采用
- 背景：项目需要明确正式 GitHub 仓库，并让 AI 后续开发时统一记录版本号、提交信息和变更内容。
- 方案：记录 `https://github.com/LZiBee/VibeReading.git` 为正式远程仓库；早期阶段根应用和所有内部包统一使用同一个语义化版本号；提交信息采用 Conventional Commits 风格，摘要使用中文。
- 取舍原因：统一版本号能降低早期 monorepo 管理成本；中文提交摘要便于 vibe coding 过程中快速阅读；`CHANGELOG.md` 和 `logs/commits/` 同时存在，分别面向用户变更和 AI 上下文。
- 影响范围：`VERSION`、`package.json`、`apps/*/package.json`、`packages/*/package.json`、`CHANGELOG.md`、`logs/commits/`。
- 后续动作：正式提交前确认 Git 根目录指向 `E:/THESIS_AGENT`，不要在 `E:/` 上级目录直接提交。

