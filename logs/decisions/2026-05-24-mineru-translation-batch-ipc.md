# MinerU 全文翻译批量 IPC

- 日期：2026-05-24
- 状态：已采用
- 背景：全文翻译最初复用 PDF 选区翻译链路，对每个 MinerU block 单独发起 AI 请求；整篇论文 block 数量较多时，请求延迟会被线性放大。
- 方案：新增 `translation:batch` 受控 IPC，由 Renderer 每批提交最多若干个 MinerU block，Main 侧构造结构化 JSON 翻译 prompt，并按 block `id` 解析回填译文；默认设置为每批 5 个 block。
- 取舍原因：相比继续复用 `selection:explain`，批量 IPC 能减少请求次数，并让全文翻译 prompt 独立于短文本选区释义；相比 Renderer 直接拼接通用 AI 请求，Main 侧解析更符合受控桥接边界。
- 影响范围：`packages/shared` 增加批量翻译协议类型；`apps/desktop` 的 preload、main、renderer 和设置页接入批量翻译与批量大小配置。
- 后续动作：如果模型返回 JSON 稳定性不足，可增加单批失败后的逐 block fallback；如需更细粒度联动，可将翻译结果前移到持久化句子模型。
