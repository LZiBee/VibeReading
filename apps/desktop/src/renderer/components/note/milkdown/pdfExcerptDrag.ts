import type { SourceRef } from '@thesis-agent/shared'
import type { MineruParseBlock } from '@thesis-agent/shared'
import { getMineruBlockPlainText } from '../../../app/mineruDrag'

export const pdfExcerptDragMimeType = 'application/x-inspiration-pdf-excerpt'

export type PdfExcerptDropPayload = {
  kind: 'pdf_excerpt'
  filePath: string
  noteId?: string
  pageNo: number
  text: string
  label: string
  blockId?: string
  sourceRef: SourceRef
}

export type PdfExcerptDropBundle = {
  items: PdfExcerptDropPayload[]
}

export type MineruCompatibleDropPayload = {
  kind: 'pdf_excerpt'
  filePath: string
  blockId: string
  pageNo: number
  text: string
  label: string
  sourceRef: SourceRef
}

export function createPdfExcerptDropPayload(input: {
  filePath: string
  pageNo: number
  text: string
  sourceRef: SourceRef
}): PdfExcerptDropPayload {
  return {
    kind: 'pdf_excerpt',
    filePath: input.filePath,
    pageNo: input.pageNo,
    text: input.text,
    label: buildPdfExcerptLabel(input.pageNo, input.text),
    sourceRef: input.sourceRef
  }
}

export function readPdfExcerptDropPayload(dataTransfer: DataTransfer): PdfExcerptDropPayload | null {
  const raw = dataTransfer.getData(pdfExcerptDragMimeType)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PdfExcerptDropPayload>
    if (
      parsed.kind !== 'pdf_excerpt' ||
      typeof parsed.filePath !== 'string' ||
      typeof parsed.pageNo !== 'number' ||
      typeof parsed.text !== 'string' ||
      typeof parsed.label !== 'string' ||
      !parsed.sourceRef ||
      typeof parsed.sourceRef !== 'object'
    ) {
      return null
    }

    return {
      kind: 'pdf_excerpt',
      filePath: parsed.filePath,
      noteId: typeof parsed.noteId === 'string' ? parsed.noteId : undefined,
      pageNo: parsed.pageNo,
      text: parsed.text,
      label: parsed.label,
      blockId: typeof parsed.blockId === 'string' ? parsed.blockId : undefined,
      sourceRef: parsed.sourceRef as SourceRef
    }
  } catch {
    return null
  }
}

export function readPdfExcerptDropBundle(dataTransfer: DataTransfer): PdfExcerptDropPayload[] {
  const raw = dataTransfer.getData(pdfExcerptDragMimeType)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PdfExcerptDropBundle> | Partial<PdfExcerptDropPayload>
    if (Array.isArray((parsed as Partial<PdfExcerptDropBundle>).items)) {
      return (parsed as Partial<PdfExcerptDropBundle>).items!
        .map((item) => normalizePdfExcerptDropPayload(item))
        .filter((item): item is PdfExcerptDropPayload => Boolean(item))
    }

    const single = normalizePdfExcerptDropPayload(parsed as Partial<PdfExcerptDropPayload>)
    return single ? [single] : []
  } catch {
    return []
  }
}

export function createPdfExcerptDropPayloadFromMineruBlock(input: {
  filePath: string
  noteId?: string
  block: MineruParseBlock
}): MineruCompatibleDropPayload {
  const quote = getMineruBlockPlainText(input.block)
  const sourceRef: SourceRef = {
    type: 'note_block',
    paperId: '',
    noteId: input.noteId,
    noteBlockId: input.block.id,
    pageNo: input.block.pageNo,
    mineruBlockId: input.block.id,
    rect: input.block.rect,
    quote
  }

  return {
    kind: 'pdf_excerpt',
    filePath: input.filePath,
    blockId: input.block.id,
    pageNo: input.block.pageNo,
    text: quote,
    label: buildPdfExcerptLabel(input.block.pageNo, quote || input.block.rawType),
    sourceRef
  }
}

function normalizePdfExcerptDropPayload(input: Partial<PdfExcerptDropPayload>): PdfExcerptDropPayload | null {
  if (
    input.kind !== 'pdf_excerpt' ||
    typeof input.filePath !== 'string' ||
    typeof input.pageNo !== 'number' ||
    typeof input.text !== 'string' ||
    typeof input.label !== 'string' ||
    !input.sourceRef ||
    typeof input.sourceRef !== 'object'
  ) {
    return null
  }

  return {
    kind: 'pdf_excerpt',
    filePath: input.filePath,
    noteId: typeof input.noteId === 'string' ? input.noteId : undefined,
    pageNo: input.pageNo,
    text: input.text,
    label: input.label,
    blockId: typeof input.blockId === 'string' ? input.blockId : undefined,
    sourceRef: input.sourceRef as SourceRef
  }
}

function buildPdfExcerptLabel(pageNo: number, text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized ? `PDF 摘录 · 第 ${pageNo} 页 · ${normalized.slice(0, 80)}` : `PDF 摘录 · 第 ${pageNo} 页`
}
