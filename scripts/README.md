# scripts 目录

本目录放项目自动化脚本，例如初始化、检查、导入导出、数据迁移辅助脚本。

脚本要写清楚用途、输入、输出和运行方式。涉及删除、覆盖、迁移数据的脚本必须先有显式确认或 dry-run 模式。

## 当前脚本

### `mineru_agent_parse.py`

- 用途：调用 MinerU 官方免登录 Agent API，上传本地 PDF，轮询解析任务状态，并输出返回的 `task_id`、`state`、`markdown_url` 和 Markdown 预览。
- 输入：本地 PDF 路径。
- 输出：终端中的任务状态与结果；可选保存 Markdown 到本地文件。
- 运行方式：

```bash
python scripts/mineru_agent_parse.py sample/NIPS-2012-large-scale-distributed-deep-networks-Paper.pdf
python scripts/mineru_agent_parse.py sample/1811.06965v5.pdf --output-markdown workspace/mineru/1811.06965v5.md
```

- 说明：当前脚本使用 `https://mineru.net/api/v1/agent/parse/file` 这套免 Token 轻量接口，更适合先验证返回结构；若后续需要更完整的付费/正式解析 API，可再单独补充。

### `mineru_precise_parse.py`

- 用途：调用 MinerU 官方精准解析 API，支持“本地文件上传模式”与“公开 URL 解析模式”，并下载 `full_zip_url` 对应的结果压缩包做结构检查。
- 输入：本地文件路径或公开文件 URL，以及包含 API token 的文本文件路径。
- 输出：终端中的 `batch_id`、轮询状态、`full_zip_url`；下载的结果 zip；压缩包内 `full.md`、`content_list.json`、`layout.json`、`model.json` 等文件预览。
- 运行方式：

```bash
python scripts/mineru_precise_parse.py sample/NIPS-2012-large-scale-distributed-deep-networks-Paper.pdf --token-file C:\Users\you\Desktop\mineru.txt
python scripts/mineru_precise_parse.py --source-url https://cdn-mineru.openxlab.org.cn/demo/example.pdf --token-file C:\Users\you\Desktop\mineru.txt
```

- 说明：如果本机无法解析 MinerU 返回的阿里云 OSS 上传域名，本地上传模式会失败，但公开 URL 模式仍可用于验证精准解析结果结构。
