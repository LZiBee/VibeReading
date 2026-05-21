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

export type HeadingLevel = 1 | 2 | 3

export type NoteBlockListStyle = 'bullet'

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

  if (input.listStyle === 'bullet') {
    style.listStyle = 'bullet'
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

function noteBlockContentToMarkdown(type: NoteBlockType, content: NoteBlockContent, style?: NoteBlockStyle): string {
  const text = getContentText(content)

  if (canUseBulletListStyle(type) && style?.listStyle === 'bullet' && text.trim()) {
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => `- ${formatInlineMarkdown(line, style)}`)
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
    return content.rows.map((row) => `| ${row.join(' | ')} |`).join('\n')
  }

  if ((type === 'image' || type === 'screenshot') && 'caption' in content) {
    return content.caption ? `![${content.alt ?? content.caption}]()` : '![]()'
  }

  if (type === 'reference' && 'label' in content) {
    return [content.label, content.title].filter(Boolean).join(' - ')
  }

  return formatInlineMarkdown(text, style)
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

  if (canUseBulletListStyle(block.type) && block.style?.listStyle === 'bullet' && text.trim()) {
    const items = text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => `<li style="${escapeAttribute(style)}">${escapeHtml(line)}</li>`)
      .join('')

    return `<ul>${items}</ul>`
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
    const rows = block.content.rows
      .map((row) => `<tr>${row.map((cell) => `<td style="${escapeAttribute(style)}">${textToHtml(cell)}</td>`).join('')}</tr>`)
      .join('')
    return `<table>${rows}</table>`
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
