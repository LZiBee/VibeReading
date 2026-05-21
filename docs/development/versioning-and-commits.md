# 版本号与提交记录规范

本文档规定项目远程仓库、版本号、提交信息、变更记录和提交记录的统一写法。所有说明文字默认使用中文。

## 项目仓库

正式远程仓库：

```text
https://github.com/LZiBee/VibeReading.git
```

项目本地工作目录：

```text
E:/THESIS_AGENT
```

当前仓库状态记录：

- 远程仓库名：`LZiBee/VibeReading`
- 仓库地址：`https://github.com/LZiBee/VibeReading.git`
- 2026-05-18 已确认仓库页面可访问。
- 2026-05-19 已在 `E:/THESIS_AGENT` 初始化独立 Git 仓库，当前本地 `git rev-parse --show-toplevel` 指向 `E:/THESIS_AGENT`。
- 外层磁盘 `E:/` 仍可能存在无关 Git 仓库；开发和提交命令必须在 `E:/THESIS_AGENT` 内执行，避免误操作上级目录。

提交前检查命令：

```bash
git rev-parse --show-toplevel
git status --short
```

要求：

- `git rev-parse --show-toplevel` 必须指向项目根目录。
- `git status --short` 中只能出现本项目相关文件。
- 如果 Git 根目录仍然是 `E:/`，不要提交。

## 版本号规则

项目采用语义化版本号：

```text
MAJOR.MINOR.PATCH
```

当前初始版本：

```text
0.1.0
```

版本号记录位置：

- 根目录 `VERSION`
- 根目录 `package.json` 的 `version`
- `apps/*/package.json` 的 `version`
- `packages/*/package.json` 的 `version`
- `CHANGELOG.md`

早期阶段采用统一版本策略：根应用和所有内部包保持同一个版本号。除非后续写入新的架构决策，否则不要让某个内部包单独跳版本。

## 版本递增规则

`0.x` 阶段还没有稳定公开 API，版本递增规则如下：

| 类型 | 递增 | 使用场景 |
|---|---|---|
| 里程碑功能 | `0.MINOR.0` | 完成一个阶段、MVP 功能闭环、明显新增用户可见能力 |
| 修复和小改 | `0.MINOR.PATCH` | 修复 bug、补文档、调整配置、小范围重构 |
| 重大破坏性调整 | 记录决策后递增 `MINOR` | 大幅调整目录、模块边界、数据模型、IPC 协议 |

进入 `1.0.0` 后再严格使用：

- `MAJOR`：破坏性变更。
- `MINOR`：向后兼容的新功能。
- `PATCH`：向后兼容的修复。

## 变更记录

变更记录统一写入：

```text
CHANGELOG.md
```

结构：

```md
## [Unreleased]

### 新增
### 变更
### 修复
### 文档
### 内部

## [0.1.0] - YYYY-MM-DD
```

规则：

- 每次有用户可见变化、架构变化、数据结构变化、构建流程变化，都要写入 `[Unreleased]`。
- 发布新版本时，把 `[Unreleased]` 中内容移动到对应版本号。
- 只写对项目有意义的变化，不记录琐碎临时过程。
- 报错排查过程不要写进 `CHANGELOG.md`，应写入 `logs/errors/`。

## 提交信息格式

提交信息采用 Conventional Commits 风格，摘要使用中文：

```text
type(scope): 中文摘要
```

常用类型：

| 类型 | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 文档 |
| `refactor` | 重构 |
| `test` | 测试 |
| `build` | 构建、依赖、脚手架 |
| `ci` | CI/CD |
| `chore` | 杂项维护 |
| `perf` | 性能优化 |
| `style` | 格式调整，不影响行为 |
| `revert` | 回滚 |

常用 scope：

```text
repo
docs
desktop
workbench
ui
pdf
notes
ai
rag
graph
citations
db
shared
logs
release
```

示例：

```text
docs(repo): 记录远程仓库和版本规范
feat(workbench): 增加命令注册接口
fix(pdf): 修复选区坐标恢复偏移
build(desktop): 初始化 Electron Vite 构建配置
```

## 提交正文要求

简单提交可以只写一行摘要。重要提交建议写正文：

```text
docs(repo): 记录远程仓库和版本规范

- 记录 GitHub 远程仓库地址
- 增加版本号递增规则
- 增加提交记录模板

验证：
- 已检查文档可按 UTF-8 读取
```

正文要求：

- 写清楚核心改动。
- 写清楚验证方式。
- 如果关联日志，写明日志文件路径。
- 如果没有运行测试，要说明原因。

## 提交记录

除了 Git 自身提交历史，项目还保留 AI 友好的提交记录索引：

```text
logs/commits/YYYY-MM.md
```

记录时机：

- 每次完成真实 Git commit 后。
- 每次版本发布后。
- 每次需要解释提交背景时。

提交记录模板：

```md
## YYYY-MM-DD HH:mm - commit 摘要

- Commit：
- 版本：
- 类型：
- 范围：
- 关联任务：
- 主要改动：
- 验证：
- 关联日志：
```

要求：

- `Commit` 填写完整或至少前 12 位哈希。
- 如果只是准备提交但尚未 commit，状态写为“待提交”，commit 哈希留空。
- 提交记录不替代 Git 历史，只用于帮助 AI 快速理解上下文。

## 发布流程

发布一个版本时按以下顺序执行：

1. 确认工作区只包含本项目文件。
2. 运行检查命令，例如 `npm run check`。
3. 更新 `VERSION`。
4. 更新根 `package.json`、`apps/*/package.json`、`packages/*/package.json` 的版本。
5. 更新 `CHANGELOG.md`，把 `[Unreleased]` 内容归档到新版本。
6. 在 `logs/progress/YYYY-MM-DD.md` 记录发布准备。
7. 创建提交，提交信息使用 `chore(release): 发布 vX.Y.Z`。
8. 创建 Git tag：`vX.Y.Z`。
9. 在 `logs/commits/YYYY-MM.md` 记录提交哈希和 tag。

## AI 执行要求

AI 每次涉及版本、提交、发布时必须：

- 先阅读本文件。
- 不在 Git 根目录异常时提交。
- 修改版本号时同步所有版本记录位置。
- 修改用户可见能力时同步 `CHANGELOG.md`。
- 完成 commit 后补 `logs/commits/YYYY-MM.md`。
