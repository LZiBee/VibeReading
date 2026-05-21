import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import yauzl from 'yauzl'
import type { MineruBlockType, MineruModelVersion, MineruParseBlock, MineruParseResult } from '@thesis-agent/shared'

const mineruApiBase = 'https://mineru.net/api/v4'
const defaultPollIntervalMs = 3000
const defaultMaxWaitMs = 300000

export type ParseMineruInput = {
  filePath: string
  apiKey: string
  modelVersion: MineruModelVersion
  language: string
  enableTable: boolean
  enableFormula: boolean
  isOcr: boolean
  autoClean: boolean
  pageRange: string
  sourceUrl?: string
}

type MineruJsonResponse<TData> = {
  code: number
  msg: string
  trace_id?: string
  data?: TData
}

type MineruCreateUploadResponse = {
  batch_id?: string
  file_urls?: string[]
}

type MineruCreateUrlResponse = {
  batch_id?: string
}

type MineruExtractResultItem = {
  data_id?: string
  file_name?: string
  state?: string
  err_msg?: string
  full_zip_url?: string
}

type MineruBatchResultResponse = {
  batch_id?: string
  extract_result?: MineruExtractResultItem[]
}

type MineruContentListItem = Record<string, unknown> & {
  type?: string
  bbox?: [number, number, number, number]
  page_idx?: number
}

type MineruLayoutPage = {
  page_idx?: number
  page_size?: [number, number]
}

type MineruLayout = {
  pdf_info?: MineruLayoutPage[]
}

type MineruModelItem = Record<string, unknown> & {
  type?: string
  bbox?: [number, number, number, number]
  merge_prev?: boolean
}

type MineruModel = MineruModelItem[][]

type NormalizedRect = {
  x: number
  y: number
  width: number
  height: number
}

type MineruBlockSegment = NonNullable<MineruParseBlock['segments']>[number]

const mineruContentBboxScale = 1000

export async function parsePdfWithMineru(input: ParseMineruInput): Promise<MineruParseResult> {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new Error('MinerU API Key 不能为空，请先在 AI 配置面板中填写。')
  }

  const batchId = input.sourceUrl?.trim()
    ? await createRemoteUrlBatch(input, apiKey)
    : await createLocalUploadBatch(input, apiKey)

  const extractResult = await waitForBatchResult(batchId, apiKey)
  const fullZipUrl = extractResult.full_zip_url?.trim()
  if (!fullZipUrl) {
    throw new Error(`MinerU 未返回 full_zip_url。当前状态：${extractResult.state ?? 'unknown'}`)
  }

  const zipResponse = await fetch(fullZipUrl)
  if (!zipResponse.ok) {
    throw new Error(`下载 MinerU 结果失败：HTTP ${zipResponse.status}`)
  }

  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer())
  const zipEntries = await unzipEntries(zipBuffer)
  const markdown = readZipTextEntry(zipEntries, 'full.md')
  const contentList = parseContentList(zipEntries)
  const layout = parseLayout(zipEntries)
  const model = parseModel(zipEntries)
  const blocks = normalizeMineruBlocks(contentList, layout, model, zipEntries, input.autoClean)
  const title = deriveMineruTitle(blocks, markdown, input.filePath)

  return {
    title,
    markdown,
    blocks
  }
}

async function createLocalUploadBatch(input: ParseMineruInput, apiKey: string): Promise<string> {
  const payload = {
    files: [
      {
        name: basename(input.filePath),
        data_id: basename(input.filePath).replace(/\.pdf$/i, '')
      }
    ],
    model_version: input.modelVersion,
    language: input.language,
    enable_table: input.enableTable,
    enable_formula: input.enableFormula,
    is_ocr: input.isOcr,
    page_range: input.pageRange
  }
  const data = await postMineruJson<MineruCreateUploadResponse>(`${mineruApiBase}/file-urls/batch`, apiKey, payload)
  const batchId = data.batch_id?.trim()
  const uploadUrl = data.file_urls?.[0]?.trim()
  if (!batchId || !uploadUrl) {
    throw new Error('MinerU 创建本地上传任务成功，但未返回 batch_id 或 upload URL。')
  }

  const fileBuffer = await readFile(input.filePath)
  let uploadResponse: Response
  try {
    uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileBuffer
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知网络错误'
    throw new Error(`上传 PDF 到 MinerU 临时对象存储失败：${message}`)
  }

  if (!uploadResponse.ok) {
    throw new Error(`上传 PDF 到 MinerU 临时对象存储失败：HTTP ${uploadResponse.status}`)
  }

  return batchId
}

async function createRemoteUrlBatch(input: ParseMineruInput, apiKey: string): Promise<string> {
  const sourceUrl = input.sourceUrl?.trim()
  if (!sourceUrl) {
    throw new Error('远程 URL 解析模式缺少 sourceUrl。')
  }

  const payload = {
    files: [
      {
        url: sourceUrl,
        is_ocr: input.isOcr,
        data_id: basename(input.filePath).replace(/\.pdf$/i, '') || 'remote-file'
      }
    ],
    model_version: input.modelVersion,
    language: input.language,
    enable_table: input.enableTable,
    enable_formula: input.enableFormula,
    page_range: input.pageRange
  }
  const data = await postMineruJson<MineruCreateUrlResponse>(`${mineruApiBase}/extract/task/batch`, apiKey, payload)
  const batchId = data.batch_id?.trim()
  if (!batchId) {
    throw new Error('MinerU 创建远程 URL 任务成功，但未返回 batch_id。')
  }
  return batchId
}

async function waitForBatchResult(batchId: string, apiKey: string): Promise<MineruExtractResultItem> {
  const startedAt = Date.now()
  let lastState = ''
  while (Date.now() - startedAt < defaultMaxWaitMs) {
    const response = await fetch(`${mineruApiBase}/extract-results/batch/${batchId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    })
    if (!response.ok) {
      throw new Error(`查询 MinerU 任务状态失败：HTTP ${response.status}`)
    }

    const payload = (await response.json()) as MineruJsonResponse<MineruBatchResultResponse>
    if (payload.code !== 0) {
      throw new Error(payload.msg || '查询 MinerU 任务状态失败。')
    }

    const result = payload.data?.extract_result?.[0]
    if (!result) {
      await sleep(defaultPollIntervalMs)
      continue
    }

    const state = String(result.state ?? '').toLowerCase()
    lastState = state
    if (state === 'done' || state === 'success' || state === 'completed' || state === 'finished') {
      return result
    }

    if (state.includes('fail') || state.includes('error') || state.includes('reject') || state.includes('cancel')) {
      throw new Error(result.err_msg?.trim() || `MinerU 解析失败：${result.state ?? 'unknown'}`)
    }

    await sleep(defaultPollIntervalMs)
  }

  throw new Error(`MinerU 解析超时，最后状态：${lastState || 'unknown'}`)
}

async function postMineruJson<TData>(url: string, apiKey: string, payload: Record<string, unknown>): Promise<TData> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    throw new Error(`请求 MinerU 失败：HTTP ${response.status}`)
  }

  const result = (await response.json()) as MineruJsonResponse<TData>
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'MinerU 返回了空结果。')
  }
  return result.data
}

function unzipEntries(zipBuffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error('打开 MinerU 结果 zip 失败。'))
        return
      }

      const entries = new Map<string, Buffer>()
      zipFile.readEntry()
      zipFile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry()
          return
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            zipFile.close()
            reject(streamError ?? new Error(`读取 zip 条目失败：${entry.fileName}`))
            return
          }

          const chunks: Buffer[] = []
          stream.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          stream.on('error', (readError) => {
            zipFile.close()
            reject(readError)
          })
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks))
            zipFile.readEntry()
          })
        })
      })
      zipFile.on('end', () => resolve(entries))
      zipFile.on('error', reject)
    })
  })
}

function readZipTextEntry(entries: Map<string, Buffer>, exactName: string): string {
  const buffer = entries.get(exactName)
  if (!buffer) {
    throw new Error(`MinerU 结果中缺少 ${exactName}`)
  }

  return buffer.toString('utf8')
}

function parseContentList(entries: Map<string, Buffer>): MineruContentListItem[] {
  const entryName = [...entries.keys()].find((name) => /(^|_)content_list\.json$/i.test(name))
  if (!entryName) {
    throw new Error('MinerU 结果中缺少 content_list.json')
  }

  const parsed = JSON.parse(entries.get(entryName)?.toString('utf8') ?? '[]')
  if (!Array.isArray(parsed)) {
    throw new Error('MinerU content_list.json 结构无效')
  }

  return parsed as MineruContentListItem[]
}

function parseLayout(entries: Map<string, Buffer>): MineruLayout {
  const raw = entries.get('layout.json')
  if (!raw) {
    throw new Error('MinerU 结果中缺少 layout.json')
  }

  const parsed = JSON.parse(raw.toString('utf8'))
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('MinerU layout.json 结构无效')
  }

  return parsed as MineruLayout
}

function parseModel(entries: Map<string, Buffer>): MineruModel {
  const entryName = [...entries.keys()].find((name) => /(^|_)model\.json$/i.test(name))
  if (!entryName) {
    return []
  }

  const parsed = JSON.parse(entries.get(entryName)?.toString('utf8') ?? '[]')
  return Array.isArray(parsed) ? (parsed as MineruModel) : []
}

function normalizeMineruBlocks(
  contentList: MineruContentListItem[],
  layout: MineruLayout,
  model: MineruModel,
  entries: Map<string, Buffer>,
  autoClean: boolean
): MineruParseBlock[] {
  const pageSizes = new Map<number, { width: number; height: number }>()
  for (const page of layout.pdf_info ?? []) {
    if (typeof page.page_idx !== 'number' || !Array.isArray(page.page_size) || page.page_size.length < 2) {
      continue
    }
    pageSizes.set(page.page_idx, {
      width: Number(page.page_size[0]) || 1,
      height: Number(page.page_size[1]) || 1
    })
  }

  const blocks: MineruParseBlock[] = []
  const modelTextItems = getModelTextItems(model, pageSizes)

  contentList.forEach((item, index) => {
    const rawType = typeof item.type === 'string' ? item.type : ''
    if (!rawType || !item.bbox || typeof item.page_idx !== 'number') {
      return
    }

    const pageSize = pageSizes.get(item.page_idx)
    if (!pageSize) {
      return
    }

    if (rawType === 'header' || rawType === 'footer' || rawType === 'page_number') {
      return
    }

    const pageNo = item.page_idx + 1
    const rect = normalizeRect(item.bbox, pageSize.width, pageSize.height)
    const segments = findMineruBlockSegments(item, rect, modelTextItems)
    const blockId = `mineru_${pageNo}_${index}_${rawType}`
    const text = readMineruText(item)

    if (rawType === 'text') {
      const headingLevel = normalizeHeadingLevel(item.text_level)
      blocks.push({
        id: blockId,
        type: headingLevel ? 'heading' : 'paragraph',
        rawType,
        pageNo,
        rect,
        segments,
        text,
        ...(headingLevel ? { headingLevel } : {})
      })
      return
    }

    if (rawType === 'page_footnote') {
      blocks.push({
        id: blockId,
        type: 'footnote',
        rawType,
        pageNo,
        rect,
        segments,
        text
      })
      return
    }

    if (rawType === 'list') {
      const listItems = readStringArray(item.list_items)
      if (listItems.length === 0) {
        return
      }

      blocks.push({
        id: blockId,
        type: 'list',
        rawType,
        pageNo,
        rect,
        segments,
        text: listItems.join('\n'),
        listItems
      })
      return
    }

    if (rawType === 'equation') {
      blocks.push({
        id: blockId,
        type: 'equation',
        rawType,
        pageNo,
        rect,
        segments,
        text
      })
      return
    }

    if (rawType === 'table') {
      blocks.push({
        id: blockId,
        type: 'table',
        rawType,
        pageNo,
        rect,
        segments,
        text: joinTextParts(readStringArray(item.table_caption), readStringArray(item.table_footnote)),
        tableRows: parseHtmlTableToRows(typeof item.table_body === 'string' ? item.table_body : ''),
        caption: readStringArray(item.table_caption).join(' ').trim() || undefined,
        footnotes: readStringArray(item.table_footnote),
        imageDataUrl: readMineruImageDataUrl(entries, typeof item.img_path === 'string' ? item.img_path : '')
      })
      return
    }

    if (rawType === 'chart') {
      const listItems = parseMarkdownTableToRows(typeof item.content === 'string' ? item.content : '')
      blocks.push({
        id: blockId,
        type: 'chart',
        rawType,
        pageNo,
        rect,
        segments,
        text: joinTextParts(readStringArray(item.chart_caption), readStringArray(item.chart_footnote)),
        tableRows: listItems,
        caption: readStringArray(item.chart_caption).join(' ').trim() || undefined,
        footnotes: readStringArray(item.chart_footnote),
        imageDataUrl: readMineruImageDataUrl(entries, typeof item.img_path === 'string' ? item.img_path : '')
      })
      return
    }

    if (rawType === 'image') {
      blocks.push({
        id: blockId,
        type: 'image',
        rawType,
        pageNo,
        rect,
        segments,
        text: joinTextParts(readStringArray(item.image_caption), readStringArray(item.image_footnote)),
        caption: readStringArray(item.image_caption).join(' ').trim() || undefined,
        footnotes: readStringArray(item.image_footnote),
        imageDataUrl: readMineruImageDataUrl(entries, typeof item.img_path === 'string' ? item.img_path : '')
      })
      return
    }

    if (text) {
      blocks.push({
        id: blockId,
        type: 'paragraph',
        rawType,
        pageNo,
        rect,
        segments,
        text
      })
    }
  })

  const normalizedBlocks = blocks.filter((block) => {
    if (block.type === 'table' || block.type === 'chart') {
      return (block.tableRows?.length ?? 0) > 0 || Boolean(block.caption) || Boolean(block.imageDataUrl)
    }

    if (block.type === 'image') {
      return Boolean(block.imageDataUrl) || Boolean(block.caption)
    }

    return Boolean(block.text?.trim())
  })

  return autoClean ? cleanMineruBlocks(normalizedBlocks) : normalizedBlocks
}

function deriveMineruTitle(blocks: MineruParseBlock[], markdown: string, filePath: string): string {
  const heading = blocks.find((block) => block.type === 'heading' && block.text?.trim())
  if (heading?.text?.trim()) {
    return heading.text.trim()
  }

  const markdownTitle = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))
  if (markdownTitle) {
    return markdownTitle.slice(2).trim()
  }

  return basename(filePath).replace(/\.pdf$/i, '')
}

function normalizeRect(_bbox: [number, number, number, number], _pageWidth: number, _pageHeight: number): NormalizedRect {
  const bbox = _bbox
  const [left, top, right, bottom] = bbox
  const pageWidth = Math.max(1, _pageWidth)
  const pageHeight = Math.max(1, _pageHeight)
  const looksLikeNormalizedThousandScale =
    Math.max(Math.abs(left), Math.abs(right), Math.abs(top), Math.abs(bottom)) <= mineruContentBboxScale * 1.2

  if (!looksLikeNormalizedThousandScale) {
    return {
      x: clampNumber(left / pageWidth, 0, 1),
      y: clampNumber(top / pageHeight, 0, 1),
      width: clampNumber((right - left) / pageWidth, 0, 1),
      height: clampNumber((bottom - top) / pageHeight, 0, 1)
    }
  }

  return {
    x: clampNumber(left / mineruContentBboxScale, 0, 1),
    y: clampNumber(top / mineruContentBboxScale, 0, 1),
    width: clampNumber((right - left) / mineruContentBboxScale, 0, 1),
    height: clampNumber((bottom - top) / mineruContentBboxScale, 0, 1)
  }
}

function getModelTextItems(
  model: MineruModel,
  pageSizes: Map<number, { width: number; height: number }>
): Array<MineruBlockSegment & { index: number; rawType: string; mergePrev: boolean }> {
  const items: Array<MineruBlockSegment & { index: number; rawType: string; mergePrev: boolean }> = []

  model.forEach((pageItems, pageIndex) => {
    const pageSize = pageSizes.get(pageIndex)
    if (!pageSize || !Array.isArray(pageItems)) {
      return
    }

    pageItems.forEach((item) => {
      if (!Array.isArray(item.bbox) || item.bbox.length < 4) {
        return
      }

      const rawType = typeof item.type === 'string' ? item.type : ''
      if (!isTextLikeMineruModelType(rawType)) {
        return
      }

      items.push({
        index: items.length,
        rawType,
        mergePrev: item.merge_prev === true,
        pageNo: pageIndex + 1,
        rect: normalizeModelRect(item.bbox, pageSize.width, pageSize.height)
      })
    })
  })

  return items
}

function normalizeModelRect(bbox: [number, number, number, number], pageWidth: number, pageHeight: number): NormalizedRect {
  const [left, top, right, bottom] = bbox
  const looksAlreadyNormalized = Math.max(Math.abs(left), Math.abs(right), Math.abs(top), Math.abs(bottom)) <= 1.2

  if (!looksAlreadyNormalized) {
    return normalizeRect(bbox, pageWidth, pageHeight)
  }

  return {
    x: clampNumber(left, 0, 1),
    y: clampNumber(top, 0, 1),
    width: clampNumber(right - left, 0, 1),
    height: clampNumber(bottom - top, 0, 1)
  }
}

function findMineruBlockSegments(
  item: MineruContentListItem,
  rect: NormalizedRect,
  modelItems: Array<MineruBlockSegment & { index: number; rawType: string; mergePrev: boolean }>
): MineruBlockSegment[] | undefined {
  if (typeof item.page_idx !== 'number' || !isTextLikeMineruContentType(typeof item.type === 'string' ? item.type : '')) {
    return undefined
  }

  const pageNo = item.page_idx + 1
  const baseIndex = modelItems.findIndex(
    (candidate) =>
      candidate.pageNo === pageNo &&
      candidate.rawType === normalizeMineruModelType(item.type ?? '') &&
      areNormalizedRectsClose(candidate.rect, rect)
  )

  if (baseIndex < 0) {
    return undefined
  }

  const segments: MineruBlockSegment[] = [{ pageNo, rect }]

  for (let index = baseIndex + 1; index < modelItems.length; index += 1) {
    const candidate = modelItems[index]
    if (!candidate.mergePrev) {
      break
    }

    segments.push({
      pageNo: candidate.pageNo,
      rect: candidate.rect
    })
  }

  return segments.length > 1 ? segments : undefined
}

function isTextLikeMineruContentType(type: string): boolean {
  return type === 'text' || type === 'list' || type === 'equation' || type === 'page_footnote'
}

function isTextLikeMineruModelType(type: string): boolean {
  return type === 'text' || type === 'title' || type === 'list' || type === 'interline_equation' || type === 'page_footnote'
}

function normalizeMineruModelType(contentType: string): string {
  if (contentType === 'text') {
    return 'text'
  }

  if (contentType === 'equation') {
    return 'interline_equation'
  }

  return contentType
}

function areNormalizedRectsClose(left: NormalizedRect, right: NormalizedRect): boolean {
  const tolerance = 0.008

  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance
  )
}

function cleanMineruBlocks(blocks: MineruParseBlock[]): MineruParseBlock[] {
  return blocks.filter((block, index) => {
    const text = (block.text ?? block.caption ?? '').trim()
    if (!text) {
      return true
    }

    if (block.type === 'footnote') {
      return false
    }

    if (block.type === 'paragraph' || block.type === 'heading') {
      if (isLikelyAuthorLine(text) || isLikelyAffiliationLine(text) || isLikelyJournalMetaLine(text) || isLikelyReceivedLine(text)) {
        return false
      }

      if (index < 8 && /^keywords?\s*[:：]/i.test(text)) {
        return false
      }
    }

    return true
  })
}

function isLikelyAuthorLine(text: string): boolean {
  if (text.length > 240 || !/[A-Za-z]/.test(text)) {
    return false
  }

  const separators = (text.match(/,/g) ?? []).length
  const hasEmail = /@/.test(text)
  const hasOnlyNames = /^[A-Za-zÀ-ÿ0-9 ,.'*()-]+$/.test(text)
  return hasOnlyNames && (separators >= 1 || hasEmail) && !/[。！？；;:]/.test(text)
}

function isLikelyAffiliationLine(text: string): boolean {
  return /university|institute|school|department|laboratory|college|hospital|research center|centre|inc\.?|corp\.?|ltd\.?/i.test(text)
}

function isLikelyJournalMetaLine(text: string): boolean {
  return /journal|elsevier|available online|www\.|doi[:/]|issn|volume|vol\.|issue|proceedings/i.test(text)
}

function isLikelyReceivedLine(text: string): boolean {
  return /received|revised|accepted|published online|corresponding author/i.test(text)
}

function readMineruText(item: MineruContentListItem): string {
  if (typeof item.text === 'string') {
    return item.text.trim()
  }

  if (typeof item.content === 'string') {
    return item.content.trim()
  }

  return ''
}

function normalizeHeadingLevel(input: unknown): 1 | 2 | 3 | undefined {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return undefined
  }

  const normalized = Math.max(1, Math.min(3, Math.round(input)))
  return normalized as 1 | 2 | 3
}

function readStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function joinTextParts(left: string[], right: string[]): string {
  return [...left, ...right].filter(Boolean).join('\n').trim()
}

function readMineruImageDataUrl(entries: Map<string, Buffer>, imagePath: string): string | undefined {
  if (!imagePath) {
    return undefined
  }

  const imageBuffer = entries.get(imagePath)
  if (!imageBuffer) {
    return undefined
  }

  const mimeType = imagePath.toLowerCase().endsWith('.png')
    ? 'image/png'
    : imagePath.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg'

  return `data:${mimeType};base64,${imageBuffer.toString('base64')}`
}

function parseHtmlTableToRows(html: string): string[][] {
  if (!html.trim()) {
    return []
  }

  const rows: string[][] = []
  const rowMatches = html.match(/<tr[\s\S]*?>[\s\S]*?<\/tr>/gi) ?? []

  for (const rowHtml of rowMatches) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => stripHtml(match[1] ?? ''))
      .map((cell) => cell.trim())
    if (cells.length > 0) {
      rows.push(cells)
    }
  }

  return rows
}

function parseMarkdownTableToRows(markdown: string): string[][] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))

  return lines
    .filter((line) => !/^\|\s*[-:| ]+\|$/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((row) => row.length > 0)
}

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
