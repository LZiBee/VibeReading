# Inspiration / VibeReading

论文阅读与 AI 知识图谱工作台第一版骨架。

## 仓库

正式远程仓库：

```text
https://github.com/LZiBee/VibeReading.git
```

当前版本：`0.1.0`

版本号、提交信息和变更记录规范见：

- `docs/development/versioning-and-commits.md`
- `CHANGELOG.md`

## 当前范围

- Electron + React + TypeScript + Vite 桌面应用。
- VS Code 式 Workbench 初始布局。
- npm workspaces monorepo 包结构。
- Workbench / PDF / Notes / AI / Graph / DB / RAG / Citations 的最小接口边界。
- 安全 preload API：渲染进程不直接访问 Node.js。

## 启动

```bash
npm install
npm run dev
```

## 验证

```bash
npm run typecheck
npm run build
```

## 目录

```text
apps/
  desktop/      Electron 桌面应用
packages/
  ai/           AI Provider 接入层
  citations/    引用和参考文献能力
  db/           本地数据库边界
  graph/        图谱节点和边
  notes/        笔记块和来源引用
  pdf/          PDF 阅读、选区、注释接口
  rag/          检索问答边界
  shared/       共享类型
  ui/           UI token 和基础类型
  workbench/    命令、视图、编辑器、菜单、扩展上下文
```
