# AI 协作总约定

本项目采用 vibe coding 方式推进，所有 AI 和人类协作者默认使用中文沟通、记录和总结。代码标识符、文件名、包名可以使用英文；文档、注释、日志、任务说明、提交说明优先使用中文。

## 开发前必须先读

每次开始开发前，先阅读：

1. `docs/development/code-area.md`：代码区目录、模块边界、文件放置规则。
2. `docs/development/logging-standard.md`：进度日志和报错日志的记录规范。
3. `docs/development/versioning-and-commits.md`：仓库、版本号、提交信息和变更记录规范。
4. `docs/base-architecture.md`：底层架构决策。
5. `docs/technical-solution.md`：产品和技术方案。

## 项目仓库

正式远程仓库：

```text
https://github.com/LZiBee/VibeReading.git
```

当前本地工作目录是 `E:/THESIS_AGENT`。如果要执行 Git 提交，必须先确认 `git rev-parse --show-toplevel` 指向项目目录；如果仍然指向 `E:/`，不要提交，避免把上级目录的无关文件加入版本历史。

## 工作流程

1. 明确本次任务目标，并在 `logs/progress/YYYY-MM-DD.md` 记录“开始做什么”。
2. 按代码区边界修改文件，不把临时代码、实验文件混进正式模块。
3. 每遇到命令失败、构建失败、测试失败、运行时报错，都记录到 `logs/errors/YYYY-MM-DD.md`。
4. 重要阶段完成后，更新 `logs/progress/YYYY-MM-DD.md`，写清楚已完成、修改文件、验证结果和下一步。
5. 如果做出架构取舍，补充到 `logs/decisions/`。
6. 如果完成 Git commit，补充 `logs/commits/YYYY-MM.md`。
7. 如果修改用户可见能力、版本号或发布内容，同步更新 `CHANGELOG.md`。

## 关键约束

- Renderer 不直接访问文件系统、数据库、API Key。
- 业务模块通过 `packages/workbench` 的命令、视图、编辑器和菜单机制接入。
- 通用类型、结果结构、事件协议放在 `packages/shared`，不要复制多份。
- 数据库访问集中在 `packages/db`，UI 不直接写 SQL。
- AI Provider、RAG、PDF、Notes、Graph、Citations 分别独立成包，避免互相硬耦合。
- 所有包含密钥、令牌、个人隐私、论文原文路径的日志必须脱敏。
