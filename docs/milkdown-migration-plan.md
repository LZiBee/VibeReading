# Milkdown 迁移计划书

## 1. 背景

当前笔记模块已经具备一定的结构化能力，但编辑器核心仍是自研块编辑方案，主要特点如下：

- 数据层以 `NoteDocument -> NoteBlock[]` 为核心，块内保存 `content`、`style`、`markdown` 和 `sourceRefs`
- Renderer 侧编辑器位于 `apps/desktop/src/renderer/components/note/NotePanelContent.tsx`
- 当前编辑行为由大量自定义交互组成，包括：
  - 跨块选择
  - 来源跳转
  - 图片拖拽插入、缩放、裁剪、环绕
  - MinerU 内容拖入
  - 块级撤销/恢复
  - Markdown 复制与 HTML/PDF/Word 导出

当前问题不主要集中在“有没有 Markdown”，而是集中在“编辑器基础能力由业务代码自己承担”，导致以下风险持续累积：

- 光标、选区、输入法、复制粘贴、撤销重做等基础行为维护成本高
- 新增块类型时，Renderer 侧交互改动面很大
- 长文编辑、跨块操作、复杂粘贴和格式保持容易继续出现边界问题
- 后续要接 AI 富文本插入、可扩展节点、插件能力时，现有实现扩展成本较高

因此本次方案不是“整体替换笔记系统”，而是“尝试将笔记编辑内核迁移到 Milkdown，并保留现有数据模型和业务能力”。

## 2. 目标

### 2.1 主目标

- 在不破坏现有 `NoteDocument / NoteBlock / SourceRef` 数据模型的前提下，引入 Milkdown 作为新的编辑器内核
- 先解决编辑器基础能力问题，再逐步迁移高级业务能力
- 在迁移全程保留可快速回滚的路径，避免一次性替换导致笔记模块不可用

### 2.2 非目标

本轮不追求一次完成以下内容：

- 一次性移除旧版 `NotePanelContent` 的全部逻辑
- 一次性将所有自定义块完整迁移为 Milkdown 节点
- 一次性重做导出链路、AI 插入链路、Graph 联动链路
- 一次性调整数据库结构

## 3. 方案原则

### 3.1 保留数据模型，替换编辑内核

本次迁移优先保留以下稳定接口：

- `packages/notes/src/index.ts` 中的 `NoteDocument`
- `packages/notes/src/index.ts` 中的 `NoteBlock`
- `packages/shared/src` 中的 `SourceRef`
- 主进程侧已有的持久化结构和导出链路

替换范围优先限定在：

- Renderer 侧 Note 编辑器正文区域
- Note 编辑器内部的编辑状态组织方式
- Markdown 与内部结构之间的转换适配层

### 3.2 双轨迁移，不做一次性切换

迁移期间同时保留：

- 旧版编辑器：当前 `NotePanelContent` 方案
- 新版编辑器：Milkdown 驱动的实验版编辑器

两者通过实验开关切换，默认仍使用旧版，确保：

- 当前开发不被阻断
- 出现数据映射或编辑器崩溃时可立即退回旧版

### 3.3 先迁移通用块，再迁移业务块

优先迁移：

- `paragraph`
- `heading`
- `quote`
- `todo`
- `formula`
- `table`
- `image`

后续再迁移：

- `pdf_excerpt`
- `ai_answer`
- `reference`
- `question_node`
- `screenshot`
- MinerU 相关来源块行为

### 3.4 回滚优先于彻底性

如果出现以下任一情况，优先回滚到旧版编辑器，而不是继续热修新版：

- 新版编辑器保存后无法稳定恢复为原有 `NoteBlock[]`
- `sourceRefs` 丢失或跳转能力失效
- 图片块和截图块出现大规模丢数据风险
- 导出链路不再稳定
- 长文编辑性能显著下降且短期无法修复

## 4. 当前实现与 Milkdown 的差距

### 4.1 当前实现强绑定的能力

当前笔记模块存在以下强绑定点：

1. 数据结构是块数组，不是单一 Markdown 文本
2. 每块都可能带 `sourceRefs`
3. 块样式独立保存于 `NoteBlockStyle`
4. 图片块支持：
   - 独立尺寸
   - 环绕方式
   - 裁剪参数
5. 来源块支持：
   - Ctrl/Command 跳回 PDF
   - 失效来源降级
6. 与 MinerU 存在拖拽和映射关系
7. 与主进程持久化、导出、恢复逻辑已耦合

### 4.2 Milkdown 能提供的核心价值

Milkdown 适合作为迁移目标，主要因为：

- 基于 ProseMirror，编辑器基础交互成熟
- 以 Markdown 为核心，可做所见即所得与文档结构化转换
- 插件化能力强，适合自定义节点和行为
- React 集成路径清晰，能嵌入当前 Electron Renderer
- 更适合作为“可扩展编辑内核”，而不是完整成品应用

### 4.3 Milkdown 不能直接替代的部分

Milkdown 不是接入即获得以下能力：

- 现有 `NoteBlock[]` 数据结构
- `SourceRef` 业务语义
- PDF 来源跳转
- 图片裁剪和环绕的现有保存格式
- MinerU 拖入与来源框同步
- 现有导出链路的业务约束

因此迁移必须增加适配层，而不是直接把现有数据喂给 Milkdown。

## 5. 迁移总体路径

## 5.1 阶段 0：准备期

目标：

- 在不影响旧版编辑器的前提下，为 Milkdown 接入建立隔离目录和实验开关

工作项：

- 新增 `packages/notes` 内的编辑器适配层目录
- 新增 `apps/desktop/src/renderer/components/note/milkdown/` 实验目录
- 增加 `note editor engine` 实验开关
- 约定新旧编辑器共用同一份 `NoteDocument`

产出：

- 实验开关设计
- 新旧编辑器装配点
- 不影响现有功能的空壳接入

验收：

- 打开 Note 面板时仍默认使用旧版
- 切换实验开关后可以加载一个空白的 Milkdown 编辑器容器

## 5.2 阶段 1：最小可用接入

目标：

- 让 Milkdown 能编辑基础文本内容，并和现有 `NoteDocument` 相互转换

工作项：

- 建立 `NoteDocument <-> Milkdown 文档状态` 的转换器
- 第一批仅支持：
  - `paragraph`
  - `heading`
  - `quote`
  - `todo`
  - `formula`
  - `table`
- 支持标题编辑
- 支持保存回当前 `NoteDocument`
- 保留 Markdown 复制能力

产出：

- `toMilkdownDoc(note)`
- `fromMilkdownDoc(editorState)`
- 基础块映射测试样例

验收：

- 基础文本类笔记可打开、编辑、保存、重新加载
- 块顺序不丢失
- 标题和 Markdown 导出结果可接受

回滚条件：

- 任一基础块保存后内容错乱
- 一次编辑导致整篇 Note 无法恢复

## 5.3 阶段 2：保留旧能力的混合期

目标：

- 新版承担基础文本编辑，旧版继续托管复杂媒体和来源能力

工作项：

- 对复杂块先做“只读占位节点”：
  - `pdf_excerpt`
  - `ai_answer`
  - `reference`
  - `question_node`
  - `screenshot`
  - `image`
- 占位节点先支持：
  - 显示块类型
  - 显示摘要文本
  - 显示来源是否存在
  - 点按后回退到旧版块编辑
- 为复杂块建立“编辑回旧版”的兜底入口

产出：

- 混合编辑模式
- 复杂块占位节点渲染器
- “在旧版编辑此块”的入口

验收：

- 含复杂块的旧笔记可以安全打开
- 不支持完全编辑的块不会 silently 丢失
- 用户始终能退回旧版编辑复杂块

回滚条件：

- 占位节点保存时误删复杂块内容
- 来源信息丢失

## 5.4 阶段 3：业务块定制化迁移

目标：

- 把论文场景的关键块真正迁移到 Milkdown 自定义节点

优先顺序：

1. `pdf_excerpt`
2. `ai_answer`
3. `reference`
4. `image` / `screenshot`

工作项：

- 将 `sourceRefs` 挂入节点属性
- 为 `pdf_excerpt` 增加来源跳转事件
- 为 `ai_answer` 增加样式和只读区域策略
- 为 `reference` 增加引用展示
- 为媒体块逐步补齐：
  - 显示尺寸
  - 环绕方式
  - 裁剪参数

验收：

- `sourceRefs` 可稳定随节点保存和恢复
- PDF 跳转仍可用
- AI 插入内容能稳定保存

回滚条件：

- 业务节点属性与 `NoteBlock` 无法双向稳定映射

## 5.5 阶段 4：替换默认编辑器

目标：

- 在新版编辑器能力覆盖率足够后，将 Milkdown 升级为默认实现

前置条件：

- 文本类笔记稳定
- 含来源块的笔记稳定
- 含图片和截图块的笔记稳定
- 导出链路验证通过
- 性能和崩溃率可接受

动作：

- 默认打开新版编辑器
- 保留隐藏回滚开关一个版本周期
- 对旧版编辑器进入维护冻结状态

## 6. 回滚方案

### 6.1 回滚目标

确保任何阶段都能在短时间内恢复到旧版编辑器，不影响：

- 已保存笔记读取
- PDF 来源跳转
- 导出
- AI 插入
- MinerU 生成内容

### 6.2 回滚手段

#### 方案 A：运行时开关回滚

实现一个运行时实验开关，例如：

- 应用配置中的 `noteEditorEngine: 'legacy' | 'milkdown'`
- 默认值为 `legacy`

用途：

- 开发期人工切换
- 线上实验灰度
- 出问题时无需改数据即可退回旧版

#### 方案 B：保留双渲染入口

在装配层保留两个组件：

- `LegacyNotePanelContent`
- `MilkdownNotePanelContent`

由上层根据开关决定挂载哪一个，而不是直接改写现有组件。

#### 方案 C：不改持久化结构

在新版稳定前，不修改数据库或主进程持久化结构，避免出现：

- 升级后旧版读不回
- 回滚后新数据无法识别

即：

- 数据源仍以 `NoteDocument` 和 `NoteBlock[]` 为准
- Milkdown 仅作为 Renderer 内部编辑状态

#### 方案 D：复杂块保留旧链路

在完全迁移前，复杂块仍可以：

- 占位显示
- 打开旧版块编辑
- 使用旧版导出逻辑

这样即使 Milkdown 方案中断，也不会伤及关键业务块。

### 6.3 回滚触发条件

满足任一条件即触发回滚：

- 编辑后 `NoteBlock[]` 不可逆
- 多次保存后内容漂移
- `sourceRefs` 丢失
- 图片参数丢失
- 打开旧笔记崩溃
- 导出失败率明显上升
- 大量出现输入卡顿、焦点异常、复制粘贴异常

### 6.4 回滚操作步骤

1. 将实验开关切回 `legacy`
2. 停止默认入口使用新版
3. 保留新版代码，但冻结对外暴露
4. 补充错误日志和阶段性复盘文档
5. 仅在修复完数据映射问题后再重新开启实验

## 7. 风险清单

### 7.1 数据映射风险

- `NoteBlockStyle` 不是标准 Markdown 语义，需自定义持久化
- `sourceRefs` 不属于通用 Markdown，必须挂在节点元数据中
- `image/screenshot` 的裁剪、尺寸、环绕是自定义属性

应对：

- 明确区分“可由 Markdown 表达”和“必须由节点属性表达”的字段
- 为双向转换器编写用例样本

### 7.2 复杂交互回归风险

- 当前跨块选择和来源跳转是自定义实现
- Milkdown 接入后交互层会更换

应对：

- 第一阶段不强行重做全部交互
- 来源跳转先以只读节点或 command 方式接入

### 7.3 性能风险

- 长文笔记 + 复杂节点 + 图片块可能让编辑器性能下降

应对：

- 阶段 1 先验证纯文本笔记
- 阶段 2 再引入复杂节点
- 阶段 3 才处理高频媒体场景

### 7.4 心智切换风险

- 用户已适应当前块式交互
- 新版可能更接近文档编辑器，而不是块列表

应对：

- 先在实验开关下验证
- 保持标题栏、工具栏和来源跳转入口的现有工作流不突变

## 8. 目录与代码建议

建议新增或调整如下目录：

```text
packages/notes/src/
  editor/
    milkdown/
      schema/
      plugins/
      adapters/
      serializers/
      parsers/

apps/desktop/src/renderer/components/note/
  milkdown/
    MilkdownNoteEditor.tsx
    MilkdownNoteToolbar.tsx
    MilkdownNoteFallbackBlock.tsx
```

职责约束：

- `packages/notes`：放编辑器内核适配、节点定义、转换器
- `apps/desktop`：放 Renderer 装配与 UI 组件
- `shared`：仅在必须跨模块共享类型时补充类型

## 9. 验收标准

### 9.1 第一阶段验收

- 基础文本笔记可编辑
- 不破坏保存和恢复
- Markdown 复制可用
- 旧版一键回滚可用

### 9.2 第二阶段验收

- 含复杂块的笔记可安全打开
- 复杂块不会丢失
- 来源跳转仍可从旧链路触发

### 9.3 第三阶段验收

- `pdf_excerpt` 和 `ai_answer` 节点稳定
- 图片块基础属性可保存
- 性能可接受

### 9.4 最终替换验收

- 新版默认开启后，旧版仍可作为应急回退入口保留至少一个版本周期

## 10. 建议执行顺序

建议先做：

1. 文档与决策落地
2. 引入 Milkdown 依赖和实验开关
3. 做最小 PoC，只跑基础文本笔记
4. 补转换器和测试样例
5. 再迁移业务块

不建议一上来就做：

1. 图片裁剪
2. MinerU 深度联动
3. 全量导出改造
4. 一次性替换默认编辑器

## 11. 本次计划结论

本项目适合尝试迁移 Milkdown，但必须按“双轨迁移 + 运行时回滚 + 保留原数据模型”的方式推进。

最稳妥的落地策略是：

- 旧版继续承担生产可用性
- 新版先做实验内核
- 先收下编辑器基础能力收益
- 再逐步吸纳论文场景的复杂业务块

只有当 `NoteBlock[]`、`sourceRefs`、媒体块、导出链路都验证稳定后，Milkdown 才适合成为默认实现。
