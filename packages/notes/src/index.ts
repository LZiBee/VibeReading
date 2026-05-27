import { createId } from '@thesis-agent/shared'
import type { EntityId, SourceRef } from '@thesis-agent/shared'
import type { WorkbenchExtension } from '@thesis-agent/workbench'

export type NoteDocument = {
  id: EntityId
  title: string
  template: NoteTemplateKind
  paperId?: EntityId
  blocks: NoteBlock[]
  createdAt: string
  updatedAt: string
}

export type NoteTemplateKind = 'paper_text' | 'pdf_segment_screenshots' | 'freeform'

export const noteTemplateKinds: NoteTemplateKind[] = ['paper_text', 'pdf_segment_screenshots', 'freeform']

export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'pdf_excerpt'
  | 'ai_answer'
  | 'formula'
  | 'image'
  | 'screenshot'
  | 'table'
  | 'todo'
  | 'reference'
  | 'question_node'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type NoteBlockListStyle = 'bullet' | 'ordered'

export type NoteBlockStyle = {
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  highlight?: string
  listStyle?: NoteBlockListStyle
}

export type NoteFontFamilyOption = {
  label: string
  value: string
}

export type NoteHighlightOption = {
  label: string
  value: string
}

export type TextNoteBlockContent = {
  text: string
}

export type HeadingNoteBlockContent = TextNoteBlockContent & {
  level: HeadingLevel
}

export type TodoNoteBlockContent = TextNoteBlockContent & {
  checked: boolean
}

export type FormulaNoteBlockContent = {
  latex: string
}

export type TableNoteBlockContent = {
  rows: string[][]
}

export type NoteMediaWrapStyle = 'break' | 'center' | 'float-left' | 'float-right'

export type NoteMediaCrop = {
  x: number
  y: number
  width: number
  height: number
}

export type MediaNoteBlockContent = {
  assetId?: EntityId
  src?: string
  alt?: string
  caption?: string
  width?: number
  height?: number
  displayWidth?: number
  displayHeight?: number
  wrapStyle?: NoteMediaWrapStyle
  crop?: NoteMediaCrop
  pageNo?: number
  segmentIndex?: number
}

export type ReferenceNoteBlockContent = {
  label: string
  title?: string
  authors?: string[]
  year?: number
}

export type NoteBlockContent =
  | TextNoteBlockContent
  | HeadingNoteBlockContent
  | TodoNoteBlockContent
  | FormulaNoteBlockContent
  | TableNoteBlockContent
  | MediaNoteBlockContent
  | ReferenceNoteBlockContent

export type NoteBlock = {
  id: EntityId
  noteId: EntityId
  parentId?: EntityId
  type: NoteBlockType
  orderIndex: number
  content: NoteBlockContent
  style?: NoteBlockStyle
  markdown: string
  sourceRefs: SourceRef[]
  createdAt: string
  updatedAt: string
}

export const noteBlockTypes: NoteBlockType[] = [
  'paragraph',
  'heading',
  'quote',
  'pdf_excerpt',
  'ai_answer',
  'formula',
  'image',
  'screenshot',
  'table',
  'todo',
  'reference',
  'question_node'
]

export const noteCommands = [
  'note.createForPaper',
  'note.insertBlock',
  'note.insertPdfExcerpt',
  'note.insertAiAnswer',
  'note.exportMarkdown'
] as const

export const noteFontFamilyOptions: NoteFontFamilyOption[] = [
  { label: '默认', value: '' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: 'Times', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Consolas', value: 'Consolas, monospace' }
]

export const noteFontSizeOptions = [12, 14, 16, 18, 20, 24, 28, 32] as const

export const noteHighlightOptions: NoteHighlightOption[] = [
  { label: '无', value: '' },
  { label: '柔黄', value: '#fff3a3' },
  { label: '浅绿', value: '#dff6dd' },
  { label: '浅蓝', value: '#dff1ff' },
  { label: '浅粉', value: '#ffe0e9' }
]

export type CreateNoteDocumentInput = {
  title: string
  template?: NoteTemplateKind
  paperId?: EntityId
  blocks?: NoteBlock[]
  now?: string
}

export type CreateNoteBlockInput = {
  noteId: EntityId
  parentId?: EntityId
  type?: NoteBlockType
  orderIndex?: number
  content?: NoteBlockContent
  style?: NoteBlockStyle
  sourceRefs?: SourceRef[]
  now?: string
}

export type PdfScreenshotSegment = {
  src: string
  pageNo: number
  segmentIndex: number
  width: number
  height: number
  rect?: SourceRef['rect']
}

export type NoteTemplateCreateInput = {
  title: string
  paperId?: EntityId
  segments?: PdfScreenshotSegment[]
  now?: string
}

export type NoteTemplateDefinition = {
  kind: NoteTemplateKind
  title: string
  description: string
  icon: string
  create: (input: NoteTemplateCreateInput) => NoteDocument
}

export type BasicMarkdownImportOptions = {
  noteId?: EntityId
  title?: string
  template?: NoteTemplateKind
  paperId?: EntityId
  now?: string
}

export type NoteComplexBlockPlaceholder = {
  blockId: EntityId
  type: NoteBlockType
  label: string
  href: string
  pageNo?: number
  quote?: string
  sourceRefsJson?: string
  imageSrc?: string
  imageCaption?: string
  imageRatio?: number
}

type MilkdownComplexBlockLink = {
  blockId: EntityId
  type: NoteBlockType
  label: string
  title?: string
  sourceRefsJson?: string
}

type MarkdownImageSection = {
  src: string
  alt: string
  title?: string
}

export const noteTemplateDefinitions: NoteTemplateDefinition[] = [
  {
    kind: 'paper_text',
    title: '论文笔记文本模板',
    description: '生成带论文信息、问题、方法、实验、结论和后续阅读的结构化笔记。',
    icon: 'codicon-file-text',
    create: (input) =>
      createPaperTextTemplateNote({
        title: input.title,
        paperId: input.paperId,
        now: input.now
      })
  },
  {
    kind: 'pdf_segment_screenshots',
    title: 'PDF 分段截图模板',
    description: '把 PDF 页面切成截图段，适合边看原文边整理笔记。',
    icon: 'codicon-device-camera',
    create: (input) => {
      if (!input.segments || input.segments.length === 0) {
        throw new Error('PDF 分段截图模板需要 segments。')
      }

      return createPdfSegmentScreenshotNote({
        title: input.title,
        paperId: input.paperId,
        segments: input.segments,
        now: input.now
      })
    }
  },
  {
    kind: 'freeform',
    title: '自由笔记模板',
    description: '用于摘录、想法、任务和项目记录的空白笔记。',
    icon: 'codicon-edit',
    create: (input) =>
      createFreeformNote({
        title: input.title,
        paperId: input.paperId,
        now: input.now
      })
  }
]

export function listNoteTemplateDefinitions(): NoteTemplateDefinition[] {
  return [...noteTemplateDefinitions]
}

export function getNoteTemplateDefinition(kind: NoteTemplateKind): NoteTemplateDefinition | undefined {
  return noteTemplateDefinitions.find((definition) => definition.kind === kind)
}

export function createNoteFromTemplate(kind: NoteTemplateKind, input: NoteTemplateCreateInput): NoteDocument {
  const definition = getNoteTemplateDefinition(kind)

  if (!definition) {
    throw new Error(`Unknown note template: ${kind}`)
  }

  return definition.create(input)
}

export function createNoteDocument(input: CreateNoteDocumentInput): NoteDocument {
  const now = input.now ?? new Date().toISOString()
  const noteId = createId('note')

  return {
    id: noteId,
    title: input.title.trim() || '未命名笔记',
    template: input.template ?? 'freeform',
    paperId: input.paperId,
    blocks:
      input.blocks?.map((block, index) => ({
        ...block,
        noteId,
        orderIndex: index
      })) ?? [],
    createdAt: now,
    updatedAt: now
  }
}

export function createDefaultPaperNote(input: { title: string; paperId?: EntityId; now?: string }): NoteDocument {
  return createPaperTextTemplateNote(input)
}

export function createFreeformNote(input: { title: string; paperId?: EntityId; now?: string }): NoteDocument {
  const now = input.now ?? new Date().toISOString()

  return createNoteDocument({
    title: input.title,
    template: 'freeform',
    paperId: input.paperId,
    now
  })
}

export function createPaperTextTemplateNote(input: { title: string; paperId?: EntityId; now?: string }): NoteDocument {
  const now = input.now ?? new Date().toISOString()
  const note = createNoteDocument({
    title: input.title,
    template: 'paper_text',
    paperId: input.paperId,
    now
  })
  const sections = [
    ['论文信息', '标题、作者、年份、会议/期刊、DOI/arXiv。'],
    ['研究问题与背景', '这篇论文要解决什么问题？为什么这个问题重要？'],
    ['核心贡献', '用 2-4 条写清楚本文相对已有工作的关键贡献。'],
    ['方法概述', '方法主线、核心模块、关键公式和输入输出。'],
    ['实验与结果', '数据集、指标、baseline、主要结果和异常现象。'],
    ['关键图表 / 公式', '哪些图表或公式最能解释论文？记录页码和理解。'],
    ['局限与疑问', '方法假设、失败场景、不确定结论和需要追问的问题。'],
    ['可复用内容与后续阅读', '可以放进自己论文/项目的想法，以及必须继续读的参考文献。']
  ] as const

  return {
    ...note,
    blocks: sections.flatMap(([heading, prompt], index) => [
      createNoteBlock({
        noteId: note.id,
        type: 'heading',
        orderIndex: index * 2,
        content: {
          text: heading,
          level: index === 0 ? 1 : 2
        },
        now
      }),
      createNoteBlock({
        noteId: note.id,
        type: 'paragraph',
        orderIndex: index * 2 + 1,
        content: {
          text: prompt
        },
        now
      })
    ])
  }
}

export function createPdfSegmentScreenshotNote(input: {
  title: string
  paperId?: EntityId
  segments: PdfScreenshotSegment[]
  now?: string
}): NoteDocument {
  const now = input.now ?? new Date().toISOString()
  const note = createNoteDocument({
    title: input.title,
    template: 'pdf_segment_screenshots',
    paperId: input.paperId,
    now
  })

  return {
    ...note,
    blocks: [
      createNoteBlock({
        noteId: note.id,
        type: 'heading',
        orderIndex: 0,
        content: {
          text: 'PDF 分段截图笔记',
          level: 1
        },
        now
      }),
      ...input.segments.flatMap((segment, index) => [
        createNoteBlock({
          noteId: note.id,
          type: 'screenshot',
          orderIndex: index * 2 + 1,
          content: {
            src: segment.src,
            alt: `第 ${segment.pageNo} 页第 ${segment.segmentIndex + 1} 段截图`,
            caption: `第 ${segment.pageNo} 页 · 第 ${segment.segmentIndex + 1} 段`,
            width: segment.width,
            height: segment.height,
            pageNo: segment.pageNo,
            segmentIndex: segment.segmentIndex
          },
          sourceRefs: [
            {
              type: 'screenshot',
              paperId: input.paperId,
              pageNo: segment.pageNo,
              rect: segment.rect
            }
          ],
          now
        }),
        createNoteBlock({
          noteId: note.id,
          type: 'paragraph',
          orderIndex: index * 2 + 2,
          content: {
            text: ''
          },
          sourceRefs: [
            {
              type: 'screenshot',
              paperId: input.paperId,
              pageNo: segment.pageNo,
              rect: segment.rect
            }
          ],
          now
        })
      ])
    ]
  }
}

export function createNoteBlock(input: CreateNoteBlockInput): NoteBlock {
  const now = input.now ?? new Date().toISOString()
  const type = input.type ?? 'paragraph'
  const content = input.content ?? createDefaultBlockContent(type)
  const style = normalizeNoteBlockStyle(input.style)

  return {
    id: createId('note_block'),
    noteId: input.noteId,
    parentId: input.parentId,
    type,
    orderIndex: input.orderIndex ?? 0,
    content,
    style,
    markdown: noteBlockContentToMarkdown(type, content, style),
    sourceRefs: input.sourceRefs ?? [],
    createdAt: now,
    updatedAt: now
  }
}

export function createDefaultBlockContent(type: NoteBlockType, seedText = ''): NoteBlockContent {
  if (type === 'heading') {
    return {
      text: seedText,
      level: 2
    }
  }

  if (type === 'todo') {
    return {
      text: seedText,
      checked: false
    }
  }

  if (type === 'formula') {
    return {
      latex: seedText
    }
  }

  if (type === 'table') {
    return {
      rows: seedText ? [[seedText]] : [['', '']]
    }
  }

  if (type === 'image' || type === 'screenshot') {
    return {
      caption: seedText
    }
  }

  if (type === 'reference') {
    return {
      label: seedText
    }
  }

  return {
    text: seedText
  }
}

export function getNoteBlockText(block: NoteBlock): string {
  const content = block.content

  if ('text' in content) {
    return content.text
  }

  if ('latex' in content) {
    return content.latex
  }

  if ('rows' in content) {
    return content.rows.map((row) => row.join('\t')).join('\n')
  }

  if ('caption' in content) {
    return content.caption ?? ''
  }

  if ('label' in content) {
    return [content.label, content.title].filter(Boolean).join(' ')
  }

  return ''
}

export function updateNoteBlockText(block: NoteBlock, text: string, now = new Date().toISOString()): NoteBlock {
  const content = updateBlockContentText(block.type, block.content, text)

  return {
    ...block,
    content,
    markdown: noteBlockContentToMarkdown(block.type, content, block.style),
    updatedAt: now
  }
}

export function updateNoteBlockType(block: NoteBlock, type: NoteBlockType, now = new Date().toISOString()): NoteBlock {
  const content = createDefaultBlockContent(type, getNoteBlockText(block))

  return {
    ...block,
    type,
    content,
    markdown: noteBlockContentToMarkdown(type, content, block.style),
    updatedAt: now
  }
}

export function updateNoteBlockStyle(
  block: NoteBlock,
  stylePatch: Partial<NoteBlockStyle>,
  now = new Date().toISOString()
): NoteBlock {
  const style = normalizeNoteBlockStyle({
    ...block.style,
    ...stylePatch
  })

  return {
    ...block,
    style,
    markdown: noteBlockContentToMarkdown(block.type, block.content, style),
    updatedAt: now
  }
}

export function updateNoteDocumentBlocks(
  note: NoteDocument,
  blocks: NoteBlock[],
  now = new Date().toISOString()
): NoteDocument {
  return {
    ...note,
    blocks: blocks.map((block, index) =>
      block.noteId === note.id && block.orderIndex === index
        ? block
        : {
            ...block,
            noteId: note.id,
            orderIndex: index
          }
    ),
    updatedAt: now
  }
}

export function removeNoteDocumentBlock(
  note: NoteDocument,
  blockId: EntityId,
  now = new Date().toISOString()
): NoteDocument {
  if (!note.blocks.some((block) => block.id === blockId)) {
    return note
  }

  return updateNoteDocumentBlocks(
    note,
    note.blocks.filter((block) => block.id !== blockId),
    now
  )
}

export function noteToMarkdown(note: NoteDocument): string {
  const blocks = note.blocks
    .map((block) => noteBlockContentToMarkdown(block.type, block.content, block.style))
    .filter((line) => line.trim().length > 0)

  return [`# ${note.title}`, ...blocks].join('\n\n')
}

export function noteToMilkdownMarkdown(note: NoteDocument): {
  markdown: string
  placeholders: NoteComplexBlockPlaceholder[]
  hasComplexBlocks: boolean
} {
  const placeholders: NoteComplexBlockPlaceholder[] = []
  const blocks = note.blocks
    .map((block) => {
      if (isBasicRoundtripBlockType(block.type) && !hasPdfSourceRef(block)) {
        return noteBlockContentToMilkdownMarkdown(block.type, block.content, block.style)
      }

      const placeholder = createComplexBlockPlaceholder(block)
      placeholders.push(placeholder)
      if (placeholder.type === 'formula') {
        return `[${escapeMarkdownLinkText(placeholder.label)}](${placeholder.href})`
      }
      if (placeholder.type === 'pdf_excerpt') {
        return `[${escapeMarkdownLinkText(placeholder.quote || placeholder.label)}](${placeholder.href})`
      }
      if (placeholder.type === 'ai_answer') {
        return `[${escapeMarkdownLinkText(placeholder.quote || placeholder.label)}](${placeholder.href})`
      }
      return `[${placeholder.label}](${placeholder.href})`
    })
    .filter((line) => line.trim().length > 0)

  return {
    markdown: [`# ${note.title}`, ...blocks].join('\n\n'),
    placeholders,
    hasComplexBlocks: placeholders.length > 0
  }
}

export function createBasicNoteFromMarkdown(markdown: string, options: BasicMarkdownImportOptions = {}): NoteDocument {
  const now = options.now ?? new Date().toISOString()
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim()
  const paragraphs = normalizedMarkdown ? normalizedMarkdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean) : []

  let title = options.title?.trim() || '未命名笔记'
  const bodyBlocks = [...paragraphs]

  if (bodyBlocks[0]?.startsWith('# ')) {
    title = bodyBlocks[0].slice(2).trim() || title
    bodyBlocks.shift()
  }

  const noteId = options.noteId ?? createId('note')
  const blocks = bodyBlocks.flatMap((block, index) => createBasicBlocksFromMarkdownSection(noteId, block, index, now))

  return {
    id: noteId,
    title,
    template: options.template ?? 'freeform',
    paperId: options.paperId,
    blocks,
    createdAt: now,
    updatedAt: now
  }
}

export function createNoteFromMilkdownMarkdown(
  markdown: string,
  previousNote: NoteDocument,
  options: BasicMarkdownImportOptions = {}
): NoteDocument {
  const now = options.now ?? new Date().toISOString()
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim()
  const paragraphs = normalizedMarkdown ? normalizedMarkdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean) : []

  let title = options.title?.trim() || previousNote.title || '未命名笔记'
  const bodyBlocks = [...paragraphs]

  if (/^#\s+/.test(bodyBlocks[0] ?? '')) {
    title = bodyBlocks[0].replace(/^#\s+/, '').trim() || title
    bodyBlocks.shift()
  }

  const noteId = options.noteId ?? previousNote.id
  const previousBlocksById = new Map(previousNote.blocks.map((block) => [block.id, block]))
  const previousMediaBlocks = previousNote.blocks.filter(
    (block) =>
      (block.type === 'image' || block.type === 'screenshot') &&
      'src' in block.content &&
      typeof block.content.src === 'string' &&
      block.content.src.trim().length > 0
  )
  const blocks: NoteBlock[] = []

  for (const section of bodyBlocks) {
    const restoredBlock =
      restoreMilkdownComplexBlock(section, previousBlocksById, noteId, blocks.length, now) ??
      restoreMilkdownImageBlock(section, previousMediaBlocks, noteId, blocks.length, now)
    const sectionBlocks = restoredBlock
      ? [restoredBlock]
      : createBasicBlocksFromMarkdownSection(noteId, section, blocks.length, now)

    for (const block of sectionBlocks) {
      blocks.push(normalizeImportedNoteBlock(block, noteId, blocks.length, now))
    }
  }

  return {
    ...previousNote,
    id: noteId,
    title,
    template: options.template ?? previousNote.template,
    paperId: options.paperId ?? previousNote.paperId,
    blocks,
    updatedAt: now
  }
}

export function supportsBasicMarkdownRoundtrip(note: NoteDocument): boolean {
  return note.blocks.every((block) => isBasicRoundtripBlockType(block.type) && block.sourceRefs.length === 0)
}

export function countNoteTextCharacters(note: NoteDocument): number {
  return note.blocks.reduce((total, block) => total + getNoteBlockText(block).trim().length, 0)
}

export function normalizeNoteBlockStyle(input: unknown): NoteBlockStyle | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const style: NoteBlockStyle = {}
  const allowedFontFamilies = new Set(noteFontFamilyOptions.map((option) => option.value).filter(Boolean))
  const allowedHighlights = new Set(noteHighlightOptions.map((option) => option.value).filter(Boolean))

  if (typeof input.fontFamily === 'string' && allowedFontFamilies.has(input.fontFamily)) {
    style.fontFamily = input.fontFamily
  }

  if (typeof input.fontSize === 'number' && Number.isFinite(input.fontSize)) {
    style.fontSize = Math.min(48, Math.max(10, Math.round(input.fontSize)))
  }

  if (input.bold === true) {
    style.bold = true
  }

  if (input.italic === true) {
    style.italic = true
  }

  if (input.underline === true) {
    style.underline = true
  }

  if (typeof input.highlight === 'string' && allowedHighlights.has(input.highlight)) {
    style.highlight = input.highlight
  }

  if (input.listStyle === 'bullet' || input.listStyle === 'ordered') {
    style.listStyle = input.listStyle
  }

  return Object.keys(style).length > 0 ? style : undefined
}

export function noteToExportHtml(note: NoteDocument): string {
  const blocks = note.blocks.map((block) => noteBlockToHtml(block)).join('\n')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(note.title)}</title>
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    body {
      margin: 0;
      color: #20242a;
      background: #ffffff;
      font-family: "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.65;
    }
    .note-export {
      max-width: 760px;
      margin: 0 auto;
    }
    .note-export-title {
      margin: 0 0 22px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d9e1e6;
      font-size: 28px;
      line-height: 1.25;
    }
    p, blockquote, pre, ul, table, figure {
      margin: 0 0 12px;
    }
    h1, h2, h3 {
      margin: 18px 0 10px;
      line-height: 1.35;
    }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; }
    h3 { font-size: 17px; }
    blockquote {
      padding: 8px 12px;
      border-left: 4px solid #f1cf5a;
      background: #fffaf0;
    }
    pre {
      padding: 10px 12px;
      white-space: pre-wrap;
      border: 1px solid #dce4ea;
      border-radius: 6px;
      background: #f6f8fa;
      font-family: Consolas, "SFMono-Regular", monospace;
    }
    ul {
      padding-left: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      padding: 6px 8px;
      border: 1px solid #d9e1e6;
      vertical-align: top;
    }
    figure {
      page-break-inside: avoid;
    }
    figure img {
      display: block;
      max-width: 100%;
      height: auto;
      border: 1px solid #d9e1e6;
    }
    figcaption {
      margin-top: 6px;
      color: #66717c;
      font-size: 12px;
    }
    .todo-line {
      display: block;
    }
    .reference-line {
      color: #2d3b45;
    }
  </style>
</head>
<body>
  <main class="note-export">
    <h1 class="note-export-title">${escapeHtml(note.title)}</h1>
    ${blocks}
  </main>
</body>
</html>`
}

function updateBlockContentText(type: NoteBlockType, content: NoteBlockContent, text: string): NoteBlockContent {
  if (type === 'heading') {
    return {
      text,
      level: 'level' in content ? content.level : 2
    }
  }

  if (type === 'todo') {
    return {
      text,
      checked: 'checked' in content ? content.checked : false
    }
  }

  if (type === 'formula') {
    return {
      latex: text
    }
  }

  if (type === 'table') {
    return {
      rows: text.split('\n').map((row) => row.split('\t'))
    }
  }

  if (type === 'image' || type === 'screenshot') {
    return {
      ...('assetId' in content ? { assetId: content.assetId } : {}),
      ...('src' in content ? { src: content.src } : {}),
      ...('alt' in content ? { alt: content.alt } : {}),
      ...('width' in content ? { width: content.width } : {}),
      ...('height' in content ? { height: content.height } : {}),
      ...('displayWidth' in content ? { displayWidth: content.displayWidth } : {}),
      ...('displayHeight' in content ? { displayHeight: content.displayHeight } : {}),
      ...('wrapStyle' in content ? { wrapStyle: content.wrapStyle } : {}),
      ...('crop' in content ? { crop: content.crop } : {}),
      ...('pageNo' in content ? { pageNo: content.pageNo } : {}),
      ...('segmentIndex' in content ? { segmentIndex: content.segmentIndex } : {}),
      caption: text
    }
  }

  if (type === 'reference') {
    return {
      ...('authors' in content ? { authors: content.authors } : {}),
      ...('year' in content ? { year: content.year } : {}),
      label: text,
      title: 'title' in content ? content.title : undefined
    }
  }

  return {
    text
  }
}

function restoreMilkdownComplexBlock(
  section: string,
  previousBlocksById: Map<EntityId, NoteBlock>,
  noteId: EntityId,
  orderIndex: number,
  now: string
): NoteBlock | null {
  const link = parseMilkdownComplexBlockLink(section)
  if (!link) {
    return null
  }

  const previousBlock = previousBlocksById.get(link.blockId)
  if (!previousBlock) {
    return null
  }

  const nextText = cleanMilkdownPlainText(restoreMarkdownLinkTitle(link.title) || link.label, previousBlock.type).trim()
  const previousText = getNoteBlockText(previousBlock).trim()
  const sourceText = readFirstSourceRefQuote(previousBlock.sourceRefs).trim()
  const isEditedSourceText = Boolean(
    nextText &&
      (previousBlock.type === 'pdf_excerpt' || previousBlock.type === 'ai_answer') &&
      nextText !== previousText &&
      (!sourceText || nextText !== sourceText)
  )
  const nextBlock = nextText && nextText !== previousText
    ? updateNoteBlockText(previousBlock, nextText, now)
    : {
        ...previousBlock,
        updatedAt: now
      }

  return {
    ...nextBlock,
    noteId,
    orderIndex,
    sourceRefs: isEditedSourceText ? [] : nextBlock.sourceRefs,
    markdown: noteBlockContentToMarkdown(nextBlock.type, nextBlock.content, nextBlock.style)
  }
}

function restoreMilkdownImageBlock(
  section: string,
  previousMediaBlocks: NoteBlock[],
  noteId: EntityId,
  orderIndex: number,
  now: string
): NoteBlock | null {
  const image = parseMarkdownImageSection(section)
  if (!image) {
    return null
  }

  const previousBlock = previousMediaBlocks.find(
    (block) => 'src' in block.content && block.content.src === image.src
  )
  const caption = restoreMarkdownLinkTitle(image.title) || unescapeMarkdownLinkText(image.alt)

  if (previousBlock && (previousBlock.type === 'image' || previousBlock.type === 'screenshot')) {
    const content = previousBlock.content
    const nextContent: MediaNoteBlockContent = {
      ...('assetId' in content ? { assetId: content.assetId } : {}),
      ...('width' in content ? { width: content.width } : {}),
      ...('height' in content ? { height: content.height } : {}),
      ...('displayWidth' in content ? { displayWidth: content.displayWidth } : {}),
      ...('displayHeight' in content ? { displayHeight: content.displayHeight } : {}),
      ...('wrapStyle' in content ? { wrapStyle: content.wrapStyle } : {}),
      ...('crop' in content ? { crop: content.crop } : {}),
      ...('pageNo' in content ? { pageNo: content.pageNo } : {}),
      ...('segmentIndex' in content ? { segmentIndex: content.segmentIndex } : {}),
      src: image.src,
      alt: image.alt || ('alt' in content ? content.alt : undefined),
      caption: caption || ('caption' in content ? content.caption : undefined)
    }

    return {
      ...previousBlock,
      noteId,
      orderIndex,
      content: nextContent,
      markdown: noteBlockContentToMarkdown(previousBlock.type, nextContent, previousBlock.style),
      updatedAt: now
    }
  }

  return createNoteBlock({
    noteId,
    type: 'image',
    orderIndex,
    content: {
      src: image.src,
      alt: image.alt,
      caption
    },
    now
  })
}

function normalizeImportedNoteBlock(block: NoteBlock, noteId: EntityId, orderIndex: number, now: string): NoteBlock {
  return {
    ...block,
    noteId,
    orderIndex,
    markdown: noteBlockContentToMarkdown(block.type, block.content, block.style),
    updatedAt: now
  }
}

function createBasicBlocksFromMarkdownSection(
  noteId: EntityId,
  section: string,
  orderIndex: number,
  now: string
): NoteBlock[] {
  if (/^#{1,6}\s+/.test(section)) {
    const headingMatch = /^(#{1,6})\s+([\s\S]*)$/.exec(section)
    if (headingMatch) {
      return [
        createNoteBlock({
          noteId,
          type: 'heading',
          orderIndex,
          content: {
            text: headingMatch[2].trim(),
            level: headingMatch[1].length as HeadingLevel
          },
          now
        })
      ]
    }
  }

  const image = parseMarkdownImageSection(section)
  if (image) {
    return [
      createNoteBlock({
        noteId,
        type: 'image',
        orderIndex,
        content: {
          src: image.src,
          alt: unescapeMarkdownLinkText(image.alt),
          caption: restoreMarkdownLinkTitle(image.title) || unescapeMarkdownLinkText(image.alt)
        },
        now
      })
    ]
  }

  if (/^- \[[ xX]\]\s+/.test(section)) {
    const todoLines = section.split('\n').map((line) => line.trim()).filter(Boolean)
    return todoLines.map((line, lineIndex) => {
      const todoMatch = /^- \[([ xX])\]\s+([\s\S]*)$/.exec(line)
      return createNoteBlock({
        noteId,
        type: 'todo',
        orderIndex: orderIndex + lineIndex,
        content: {
          text: todoMatch?.[2]?.trim() ?? line,
          checked: (todoMatch?.[1] ?? '').toLowerCase() === 'x'
        },
        now
      })
    })
  }

  const bulletLines = section.split('\n').map((line) => line.trim()).filter(Boolean)
  if (bulletLines.length > 0 && bulletLines.every((line) => /^[-*+]\s+/.test(line))) {
    return [
      createNoteBlock({
        noteId,
        type: 'paragraph',
        orderIndex,
        content: {
          text: bulletLines.map((line) => line.replace(/^[-*+]\s+/, '').trim()).join('\n')
        },
        style: {
          listStyle: 'bullet'
        },
        now
      })
    ]
  }

  if (bulletLines.length > 0 && bulletLines.every((line) => /^\d+[.)]\s+/.test(line))) {
    return [
      createNoteBlock({
        noteId,
        type: 'paragraph',
        orderIndex,
        content: {
          text: bulletLines.map((line) => line.replace(/^\d+[.)]\s+/, '').trim()).join('\n')
        },
        style: {
          listStyle: 'ordered'
        },
        now
      })
    ]
  }

  if (/^>\s?/.test(section)) {
    return [
      createNoteBlock({
        noteId,
        type: 'quote',
        orderIndex,
        content: {
          text: section
            .split('\n')
            .map((line) => line.replace(/^>\s?/, ''))
            .join('\n')
            .trim()
        },
        now
      })
    ]
  }

  if (/^\$\$[\s\S]*\$\$$/.test(section)) {
    const latex = section.replace(/^\$\$\n?/, '').replace(/\n?\$\$$/, '').trim()
    return [
      createNoteBlock({
        noteId,
        type: 'formula',
        orderIndex,
        content: {
          latex
        },
        now
      })
    ]
  }

  const tableLines = section.split('\n').map((line) => line.trim())
  if (tableLines.length >= 2 && tableLines.every((line) => line.startsWith('|') && line.endsWith('|'))) {
    const rows = tableLines
      .filter((line, lineIndex) => !(lineIndex === 1 && /^(\|\s*:?-+:?\s*)+\|$/.test(line)))
      .map((line) => splitMarkdownTableRow(line.slice(1, -1)))

    return [
      createNoteBlock({
        noteId,
        type: 'table',
        orderIndex,
        content: {
          rows
        },
        now
      })
    ]
  }

  return [
    createNoteBlock({
      noteId,
      type: 'paragraph',
      orderIndex,
      content: {
        text: section
      },
      now
    })
  ]
}

function createComplexBlockPlaceholder(block: NoteBlock): NoteComplexBlockPlaceholder {
  const sourceRef = block.sourceRefs.find((currentSourceRef) => currentSourceRef.type === 'note_block')
  const blockText = getNoteBlockText(block).trim()
  const isMediaBlock = block.type === 'image' || block.type === 'screenshot'
  const placeholderType: NoteBlockType =
    sourceRef && block.type !== 'formula' && !isMediaBlock
      ? looksLikeStandaloneLatexText(sourceRef.quote ?? blockText)
        ? 'formula'
        : 'pdf_excerpt'
      : block.type
  const mediaContent = isMediaBlock ? block.content : undefined
  const imageSrc =
    mediaContent && 'src' in mediaContent && typeof mediaContent.src === 'string' && mediaContent.src.trim()
      ? mediaContent.src
      : undefined
  const imageCaption =
    mediaContent && 'caption' in mediaContent && typeof mediaContent.caption === 'string'
      ? mediaContent.caption
      : undefined
  const imageRatio =
    mediaContent &&
    'displayHeight' in mediaContent &&
    'displayWidth' in mediaContent &&
    typeof mediaContent.displayHeight === 'number' &&
    typeof mediaContent.displayWidth === 'number' &&
    mediaContent.displayWidth > 0
      ? mediaContent.displayHeight / mediaContent.displayWidth
      : undefined
  return {
    blockId: block.id,
    type: placeholderType,
    label: getComplexBlockPlaceholderLabel(block, placeholderType),
    href: createNoteBlockSourceLinkHref(block.id, placeholderType, sourceRef?.pageNo, block.sourceRefs),
    pageNo: sourceRef?.pageNo,
    quote: sourceRef?.quote ?? blockText,
    sourceRefsJson: JSON.stringify(block.sourceRefs),
    imageSrc,
    imageCaption,
    imageRatio
  }
}

function looksLikeStandaloneLatexText(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized || !/(\\{1,2}[A-Za-z]+|[_^{}=])/u.test(normalized)) {
    return false
  }

  const proseRemainder = normalized
    .replace(/\\{1,2}[A-Za-z]+/g, ' ')
    .replace(/[{}_^=+\-*/(),.;:[\]\d]/g, ' ')
  const proseWords = proseRemainder.match(/[A-Za-z]{3,}/g) ?? []

  if (proseWords.length > 2) {
    return false
  }

  const latexSignalCount = (normalized.match(/\\{1,2}[A-Za-z]+|[_^{}=+\-*/]/g) ?? []).length
  return latexSignalCount >= 3
}

function createNoteBlockSourceLinkHref(
  blockId: EntityId,
  type: NoteBlockType,
  pageNo?: number,
  sourceRefs?: SourceRef[]
): string {
  const params = new URLSearchParams()
  params.set('type', type)
  if (typeof pageNo === 'number' && Number.isFinite(pageNo)) {
    params.set('page', String(pageNo))
  }
  const sourceRefsJson = sourceRefs && sourceRefs.length > 0 ? JSON.stringify(sourceRefs) : ''
  if (sourceRefsJson) {
    params.set('refs', sourceRefsJson)
  }

  return `inspiration-note-block://${encodeURIComponent(blockId)}?${params.toString()}`
}

function parseMilkdownComplexBlockLink(section: string): MilkdownComplexBlockLink | null {
  const parsedLink = parseMarkdownLinkSection(section)
  if (!parsedLink || !parsedLink.href.startsWith('inspiration-note-block://')) {
    return null
  }

  try {
    const url = new URL(parsedLink.href)
    const blockId = decodeURIComponent(url.hostname || '')
    const rawType = url.searchParams.get('type') ?? ''

    if (!blockId || !isNoteBlockType(rawType)) {
      return null
    }

    return {
      blockId,
      type: rawType,
      label: unescapeMarkdownLinkText(parsedLink.label),
      title: parsedLink.title,
      sourceRefsJson: url.searchParams.get('refs') ?? undefined
    }
  } catch {
    return null
  }
}

function parseMarkdownLinkSection(section: string): { label: string; href: string; title?: string } | null {
  const trimmed = section.trim()
  const labelEnd = findClosingMarkdownBracket(trimmed, 0)

  if (!trimmed.startsWith('[') || labelEnd <= 0 || trimmed[labelEnd + 1] !== '(' || !trimmed.endsWith(')')) {
    return null
  }

  const destination = parseMarkdownDestinationAndTitle(trimmed.slice(labelEnd + 2, -1))
  if (!destination) {
    return null
  }

  return {
    label: trimmed.slice(1, labelEnd),
    href: destination.href,
    title: destination.title
  }
}

function parseMarkdownImageSection(section: string): MarkdownImageSection | null {
  const trimmed = section.trim()

  if (!trimmed.startsWith('![') || !trimmed.endsWith(')')) {
    return null
  }

  const labelEnd = findClosingMarkdownBracket(trimmed, 1)
  if (labelEnd <= 1 || trimmed[labelEnd + 1] !== '(') {
    return null
  }

  const destination = parseMarkdownDestinationAndTitle(trimmed.slice(labelEnd + 2, -1))
  if (!destination?.href) {
    return null
  }

  return {
    src: destination.href,
    alt: unescapeMarkdownLinkText(trimmed.slice(2, labelEnd)),
    title: destination.title
  }
}

function parseMarkdownDestinationAndTitle(value: string): { href: string; title?: string } | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const titleMatch = /^(<[^>]+>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?$/.exec(trimmed)
  if (!titleMatch) {
    return {
      href: trimmed
    }
  }

  const rawHref = titleMatch[1]
  const href = rawHref.startsWith('<') && rawHref.endsWith('>') ? rawHref.slice(1, -1) : rawHref
  const title = titleMatch[2] ?? titleMatch[3] ?? titleMatch[4]

  return {
    href,
    title
  }
}

function findClosingMarkdownBracket(value: string, openIndex: number): number {
  for (let index = openIndex + 1; index < value.length; index += 1) {
    if (value[index] === ']' && value[index - 1] !== '\\') {
      return index
    }
  }

  return -1
}

function isNoteBlockType(value: string): value is NoteBlockType {
  return noteBlockTypes.includes(value as NoteBlockType)
}

function escapeMarkdownLinkText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\s+/g, ' ')
    .trim()
}

function unescapeMarkdownLinkText(value: string): string {
  return value
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\\/g, '\\')
    .trim()
}

function restoreMarkdownLinkTitle(value: string | undefined): string {
  return value ? value.replace(/\\n/g, '\n').replace(/&quot;/g, '"') : ''
}

function readFirstSourceRefQuote(sourceRefs: SourceRef[]): string {
  return sourceRefs
    .map((sourceRef) => (typeof sourceRef.quote === 'string' ? sourceRef.quote.trim() : ''))
    .find((quote) => quote.length > 0) ?? ''
}

function hasPdfSourceRef(block: NoteBlock): boolean {
  return block.sourceRefs.some((sourceRef) => sourceRef.type === 'note_block')
}

function getComplexBlockPlaceholderLabel(block: NoteBlock, displayType: NoteBlockType = block.type): string {
  const text = getNoteBlockText(block).trim()
  if (displayType === 'pdf_excerpt') {
    return text ? `PDF 摘录：${text.slice(0, 80)}` : 'PDF 摘录'
  }

  if (displayType === 'ai_answer') {
    return text ? `AI 回答：${text.slice(0, 80)}` : 'AI 回答'
  }

  if (displayType === 'formula') {
    const pageNo = block.sourceRefs.find((sourceRef) => typeof sourceRef.pageNo === 'number')?.pageNo
    return typeof pageNo === 'number' ? `公式 · 第 ${pageNo} 页` : '公式'
  }

  if (displayType === 'image') {
    return text ? `图片：${text.slice(0, 80)}` : '图片'
  }

  if (displayType === 'screenshot') {
    return text ? `截图：${text.slice(0, 80)}` : '截图'
  }

  if (displayType === 'reference') {
    return text ? `参考文献：${text.slice(0, 80)}` : '参考文献'
  }

  if (displayType === 'question_node') {
    return text ? `问题节点：${text.slice(0, 80)}` : '问题节点'
  }

  return text ? `${displayType}：${text.slice(0, 80)}` : displayType
}

function isBasicRoundtripBlockType(type: NoteBlockType): boolean {
  return (
    type === 'paragraph' ||
    type === 'heading' ||
    type === 'quote' ||
    type === 'todo' ||
    type === 'formula' ||
    type === 'table'
  )
}

function noteBlockContentToMarkdown(type: NoteBlockType, content: NoteBlockContent, style?: NoteBlockStyle): string {
  const text = getContentText(content)

  if (canUseBulletListStyle(type) && style?.listStyle && text.trim()) {
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line, index) =>
        style.listStyle === 'ordered'
          ? `${index + 1}. ${formatInlineMarkdown(line, style)}`
          : `- ${formatInlineMarkdown(line, style)}`
      )
      .join('\n')
  }

  if (type === 'heading') {
    const level = 'level' in content ? content.level : 2
    return `${'#'.repeat(level)} ${formatInlineMarkdown(text, style)}`.trim()
  }

  if (type === 'quote' || type === 'pdf_excerpt' || type === 'ai_answer') {
    return text
      .split('\n')
      .map((line) => `> ${formatInlineMarkdown(line, style)}`)
      .join('\n')
  }

  if (type === 'todo') {
    const checked = 'checked' in content && content.checked ? 'x' : ' '
    return `- [${checked}] ${formatInlineMarkdown(text, style)}`.trimEnd()
  }

  if (type === 'formula') {
    return text ? `$$\n${text}\n$$` : '$$\n\n$$'
  }

  if (type === 'table' && 'rows' in content) {
    return renderMarkdownTable(content.rows)
  }

  if ((type === 'image' || type === 'screenshot') && 'caption' in content) {
    return content.caption ? `![${content.alt ?? content.caption}]()` : '![]()'
  }

  if (type === 'reference' && 'label' in content) {
    return [content.label, content.title].filter(Boolean).join(' - ')
  }

  return formatInlineMarkdown(text, style)
}

function noteBlockContentToMilkdownMarkdown(type: NoteBlockType, content: NoteBlockContent, style?: NoteBlockStyle): string {
  const text = cleanMilkdownPlainText(getContentText(content), type)

  return noteBlockContentToMarkdown(type, { ...content, text } as NoteBlockContent, stripHtmlOnlyStyle(style))
}

function renderMarkdownTable(rows: string[][]): string {
  const normalizedRows = rows.map((row) => row.map((cell) => normalizeMarkdownTableCell(cell)))
  const columnCount = Math.max(1, ...normalizedRows.map((row) => row.length))
  const headerRow = padMarkdownTableRow(normalizedRows[0] ?? [], columnCount)
  const separatorRow = Array.from({ length: columnCount }, () => '---').join(' | ')
  const bodyRows = normalizedRows.slice(1).map((row) => `| ${padMarkdownTableRow(row, columnCount).join(' | ')} |`)

  return [`| ${headerRow.join(' | ')} |`, `| ${separatorRow} |`, ...bodyRows].join('\n')
}

function padMarkdownTableRow(row: string[], columnCount: number): string[] {
  const nextRow = row.slice(0, columnCount)

  while (nextRow.length < columnCount) {
    nextRow.push('')
  }

  return nextRow
}

function normalizeMarkdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
}

function splitMarkdownTableRow(value: string): string[] {
  const cells: string[] = []
  let current = ''

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const nextChar = value[index + 1]

    if (char === '\\' && (nextChar === '\\' || nextChar === '|')) {
      current += nextChar
      index += 1
      continue
    }

    if (char === '|') {
      cells.push(decodeMarkdownTableCell(current.trim()))
      current = ''
      continue
    }

    current += char
  }

  cells.push(decodeMarkdownTableCell(current.trim()))
  return cells
}

function decodeMarkdownTableCell(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function cleanMilkdownPlainText(value: string, type: NoteBlockType): string {
  const withoutHtml = stripSimpleInlineHtml(stripMarkdownEmphasisFences(value))

  return type === 'formula' ? withoutHtml : unescapeMarkdownProseArtifacts(withoutHtml)
}

function stripMarkdownEmphasisFences(value: string): string {
  let next = value

  for (let index = 0; index < 4; index += 1) {
    const stripped = next.replace(
      /(^|[\s([{"'“‘>])(\*{2,})(?=\S)([\s\S]*?\S)\2(?=$|[\s)\].,;:!?"'”’])/g,
      '$1$3'
    )

    if (stripped === next) {
      break
    }

    next = stripped
  }

  return next
    .replace(/(^|[\s([{"'“‘>])\*{2,}(?=\S)/g, '$1')
    .replace(/(?<=\S)\*{2,}(?=$|[\s)\].,;:!?"'”’])/g, '')
}

function stripHtmlOnlyStyle(style: NoteBlockStyle | undefined): NoteBlockStyle | undefined {
  if (!style?.fontFamily && !style?.fontSize) {
    return style
  }

  const { fontFamily: _fontFamily, fontSize: _fontSize, ...rest } = style

  return Object.keys(rest).length > 0 ? rest : undefined
}

function stripSimpleInlineHtml(value: string): string {
  return value
    .replace(/\\?<br\s*\/?\\?>/gi, '\n')
    .replace(/\\?<\/?(?:span|u|mark)\b[^>]*\\?>/gi, '')
}

function unescapeMarkdownProseArtifacts(value: string): string {
  return value.replace(/\\(?=[<>\[\]])/g, '')
}

function getContentText(content: NoteBlockContent): string {
  if ('text' in content) {
    return content.text
  }

  if ('latex' in content) {
    return content.latex
  }

  if ('rows' in content) {
    return content.rows.map((row) => row.join('\t')).join('\n')
  }

  if ('caption' in content) {
    return content.caption ?? ''
  }

  return 'label' in content ? content.label : ''
}

function canUseBulletListStyle(type: NoteBlockType): boolean {
  return type === 'paragraph' || type === 'heading' || type === 'quote' || type === 'pdf_excerpt' || type === 'ai_answer' || type === 'question_node'
}

function noteBlockToHtml(block: NoteBlock): string {
  const text = getNoteBlockText(block)
  const style = blockStyleToCss(block.style)

  if (canUseBulletListStyle(block.type) && block.style?.listStyle && text.trim()) {
    const items = text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => `<li style="${escapeAttribute(style)}">${escapeHtml(line)}</li>`)
      .join('')
    const tag = block.style.listStyle === 'ordered' ? 'ol' : 'ul'

    return `<${tag}>${items}</${tag}>`
  }

  if (block.type === 'heading') {
    const level = 'level' in block.content ? block.content.level : 2
    const tag = `h${level}`
    return `<${tag} style="${escapeAttribute(style)}">${textToHtml(text)}</${tag}>`
  }

  if (block.type === 'quote' || block.type === 'pdf_excerpt' || block.type === 'ai_answer') {
    return `<blockquote style="${escapeAttribute(style)}">${textToHtml(text)}</blockquote>`
  }

  if (block.type === 'todo') {
    const checked = 'checked' in block.content && block.content.checked ? '[x]' : '[ ]'
    return `<p class="todo-line" style="${escapeAttribute(style)}">${checked} ${textToHtml(text)}</p>`
  }

  if (block.type === 'formula') {
    return `<pre style="${escapeAttribute(style)}">${escapeHtml(text)}</pre>`
  }

  if (block.type === 'table' && 'rows' in block.content) {
    const [headerRow = [], ...bodyRows] = block.content.rows
    const header = `<tr>${headerRow.map((cell) => `<th scope="col" style="${escapeAttribute(style)}">${textToHtml(cell)}</th>`).join('')}</tr>`
    const body = bodyRows
      .map((row) => `<tr>${row.map((cell) => `<td style="${escapeAttribute(style)}">${textToHtml(cell)}</td>`).join('')}</tr>`)
      .join('')
    return `<table>${header}${body}</table>`
  }

  if ((block.type === 'image' || block.type === 'screenshot') && 'caption' in block.content) {
    const src = 'src' in block.content ? block.content.src ?? '' : ''
    const alt = 'alt' in block.content ? block.content.alt ?? block.content.caption ?? '' : block.content.caption ?? ''
    const caption = block.content.caption ? `<figcaption>${escapeHtml(block.content.caption)}</figcaption>` : ''
    const imageStyle = mediaContentToImageCss(block.content)
    const image = src
      ? `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" style="${escapeAttribute(imageStyle)}">`
      : `<div style="${escapeAttribute(style)}">${textToHtml(alt)}</div>`

    return `<figure style="${escapeAttribute(mediaContentToFigureCss(block.content))}">${image}${caption}</figure>`
  }

  if (block.type === 'reference' && 'label' in block.content) {
    const content = [block.content.label, block.content.title].filter(Boolean).join(' - ')
    return `<p class="reference-line" style="${escapeAttribute(style)}">${textToHtml(content)}</p>`
  }

  return `<p style="${escapeAttribute(style)}">${textToHtml(text)}</p>`
}

function blockStyleToCss(style?: NoteBlockStyle): string {
  const declarations: string[] = []

  if (style?.fontFamily) {
    declarations.push(`font-family: ${style.fontFamily}`)
  }

  if (style?.fontSize) {
    declarations.push(`font-size: ${style.fontSize}px`)
  }

  if (style?.bold) {
    declarations.push('font-weight: 700')
  }

  if (style?.italic) {
    declarations.push('font-style: italic')
  }

  if (style?.underline) {
    declarations.push('text-decoration: underline')
  }

  if (style?.highlight) {
    declarations.push(`background-color: ${style.highlight}`)
  }

  return declarations.join('; ')
}

function mediaContentToFigureCss(content: NoteBlockContent): string {
  if (!('caption' in content)) {
    return ''
  }

  const declarations: string[] = []
  const width = typeof content.displayWidth === 'number' && Number.isFinite(content.displayWidth) ? content.displayWidth : content.width
  const wrapStyle = content.wrapStyle

  if (width) {
    declarations.push(`width: ${Math.max(1, Math.round(width))}px`)
  }

  if (wrapStyle === 'float-left') {
    declarations.push('float: left', 'margin: 4px 18px 12px 0')
  } else if (wrapStyle === 'float-right') {
    declarations.push('float: right', 'margin: 4px 0 12px 18px')
  } else {
    declarations.push('clear: both')

    if (wrapStyle === 'center') {
      declarations.push('margin-left: auto', 'margin-right: auto')
    }
  }

  return declarations.join('; ')
}

function mediaContentToImageCss(content: NoteBlockContent): string {
  if (!('caption' in content)) {
    return ''
  }

  const declarations = ['max-width: 100%', 'height: auto']
  const width = typeof content.displayWidth === 'number' && Number.isFinite(content.displayWidth) ? content.displayWidth : content.width

  if (width) {
    declarations.push(`width: ${Math.max(1, Math.round(width))}px`)
  }

  return declarations.join('; ')
}

function formatInlineMarkdown(text: string, style?: NoteBlockStyle): string {
  let next = text

  if (!style || !next) {
    return next
  }

  if (style.bold) {
    next = `**${next}**`
  }

  if (style.italic) {
    next = `*${next}*`
  }

  if (style.underline) {
    next = `<u>${next}</u>`
  }

  if (style.highlight) {
    next = `<mark>${next}</mark>`
  }

  if (style.fontFamily || style.fontSize) {
    const css = blockStyleToCss({
      fontFamily: style.fontFamily,
      fontSize: style.fontSize
    })
    next = `<span style="${css}">${next}</span>`
  }

  return next
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object'
}

export const notesExtension: WorkbenchExtension = {
  id: '@thesis-agent/plugin-notes',
  activate: (context) => {
    context.commands.registerCommand({
      id: 'note.createForPaper',
      title: 'Create Paper Note',
      category: 'Note',
      run: () => undefined
    })

    context.commands.registerCommand({
      id: 'note.insertBlock',
      title: 'Insert Note Block',
      category: 'Note',
      run: () => undefined
    })

    context.commands.registerCommand({
      id: 'note.insertPdfExcerpt',
      title: 'Insert PDF Excerpt',
      category: 'Note',
      run: () => undefined
    })

    context.commands.registerCommand({
      id: 'note.insertAiAnswer',
      title: 'Insert AI Answer',
      category: 'Note',
      run: () => undefined
    })

    context.commands.registerCommand({
      id: 'note.exportMarkdown',
      title: 'Export Note Markdown',
      category: 'Note',
      run: () => undefined
    })

    context.editors.registerEditor({
      id: 'note-editor',
      title: 'Note Editor',
      canOpen: (resource) => resource.type === 'note'
    })

    context.menus.registerMenuItem({
      location: 'toolbars.note',
      command: 'note.insertBlock',
      group: 'insert',
      order: 10
    })

    context.menus.registerMenuItem({
      location: 'menus.noteBlock',
      command: 'note.insertPdfExcerpt',
      group: 'source',
      order: 20
    })
  }
}
