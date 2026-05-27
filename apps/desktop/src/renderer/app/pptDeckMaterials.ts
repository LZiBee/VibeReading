import { noteToMarkdown } from '@thesis-agent/notes'
import type { NoteDocument } from '@thesis-agent/notes'
import type { PptDeckMaterials } from '@thesis-agent/ai'
import type { MineruParseBlock, MineruParseResult, SlideAssetRef, SourceRef } from '@thesis-agent/shared'
import type { PersistedPdfViewState } from '../../preload/thesis-agent'
import type { AiConversation, AiPdfPageText } from './types'

export type PptPdfTextReader = (
  paperPath: string,
  currentPageNumber?: number
) => Promise<{ pageTexts: AiPdfPageText[] }>

export async function buildPptDeckMaterialsForPaper(input: {
  paperPath: string
  paperTitle: string
  notes: NoteDocument[]
  conversations: AiConversation[]
  pdfViewState?: PersistedPdfViewState
  mineruResult?: MineruParseResult
  readPdfPageTexts: PptPdfTextReader
}): Promise<PptDeckMaterials> {
  const currentPageNumber = getPptCurrentPageNumber(input.pdfViewState)
  const pdfTextContext = await input.readPdfPageTexts(input.paperPath, currentPageNumber)
  const pageTexts = pdfTextContext.pageTexts.slice(0, 14)
  const noteMaterials = buildPptNoteMaterials(input.paperPath, input.notes)
  const aiAnswerMaterials = buildPptAiAnswerMaterials(input.paperPath, input.conversations)

  return {
    paper: {
      id: input.paperPath,
      title: input.paperTitle || getFileStem(input.paperPath),
      abstract: buildPptPaperAbstract(pageTexts),
      sourceRefs: [{ type: 'paper', paperId: input.paperPath }]
    },
    excerpts: pageTexts.map((pageText) => ({
      id: `${input.paperPath}:page:${pageText.pageNumber}`,
      title: `PDF 第 ${pageText.pageNumber} 页`,
      text: truncatePptText(pageText.text, 1800),
      sourceRefs: [
        {
          type: 'page',
          paperId: input.paperPath,
          pageNo: pageText.pageNumber
        }
      ]
    })),
    notes: noteMaterials,
    aiAnswers: aiAnswerMaterials,
    references: buildPptReferenceMaterials(input.paperPath, input.notes),
    assets: buildPptAssetRefs(input.paperPath, input.notes, input.mineruResult)
  }
}

export function buildPptDeckMaterialsForNote(input: {
  paperPath: string
  paperTitle: string
  note: NoteDocument
}): PptDeckMaterials {
  return {
    paper: input.paperPath
      ? {
          id: input.paperPath,
          title: input.paperTitle || getFileStem(input.paperPath),
          sourceRefs: [{ type: 'paper', paperId: input.paperPath }]
        }
      : undefined,
    notes: buildPptNoteMaterials(input.paperPath, [input.note]),
    references: buildPptReferenceMaterials(input.paperPath, [input.note]),
    assets: buildPptAssetRefs(input.paperPath, [input.note])
  }
}

export function buildPptDeckMaterialsForSelection(input: {
  text: string
  paperPath?: string
  paperTitle?: string
  pageNo?: number
  sourceRef?: SourceRef
  selectionId?: string
}): PptDeckMaterials {
  const text = input.text.trim()
  const paperPath = input.paperPath?.trim() ?? ''

  return {
    paper: paperPath
      ? {
          id: paperPath,
          title: input.paperTitle?.trim() || getFileStem(paperPath),
          sourceRefs: [{ type: 'paper', paperId: paperPath }]
        }
      : undefined,
    excerpts: [
      {
        id: input.selectionId ?? `selection:${Date.now()}`,
        title: input.pageNo ? `选区 · 第 ${input.pageNo} 页` : '选区文本',
        text,
        sourceRefs: input.sourceRef
          ? [input.sourceRef]
          : paperPath
            ? [{ type: 'pdf_selection', paperId: paperPath, pageNo: input.pageNo }]
            : []
      }
    ]
  }
}

function buildPptPaperAbstract(pageTexts: AiPdfPageText[]): string | undefined {
  const combined = pageTexts
    .slice(0, 4)
    .map((pageText) => pageText.text)
    .join('\n\n')
    .trim()

  return combined ? truncatePptText(combined, 2600) : undefined
}

function buildPptNoteMaterials(paperPath: string, notes: NoteDocument[]): NonNullable<PptDeckMaterials['notes']> {
  return [...notes]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 6)
    .map((note) => ({
      id: note.id,
      title: note.title || `${paperPath ? getFileStem(paperPath) : '当前'}笔记`,
      text: truncatePptText(noteToMarkdown(note), 2600),
      sourceRefs: getPptNoteSourceRefs(paperPath, note)
    }))
    .filter((material) => material.text.trim().length > 0)
}

function buildPptAiAnswerMaterials(
  paperPath: string,
  conversations: AiConversation[]
): NonNullable<PptDeckMaterials['aiAnswers']> {
  return conversations
    .flatMap((conversation) =>
      conversation.messages
        .filter((message) => message.role === 'assistant' && message.content.trim().length > 0)
        .map((message) => ({
          conversation,
          message
        }))
    )
    .slice(-8)
    .map(({ conversation, message }) => ({
      id: message.id,
      title: conversation.title || 'AI 回答',
      text: truncatePptText(message.content, 2200),
      sourceRefs: [
        {
          type: 'ai_message' as const,
          paperId: paperPath || conversation.paperPath,
          messageId: message.id
        }
      ]
    }))
}

function buildPptReferenceMaterials(
  paperPath: string,
  notes: NoteDocument[]
): NonNullable<PptDeckMaterials['references']> {
  return notes
    .flatMap((note) =>
      note.blocks.flatMap((block) => {
        const content = block.content
        if (block.type !== 'reference' || !('label' in content)) {
          return []
        }

        const title = 'title' in content && typeof content.title === 'string' ? content.title : content.label

        return [
          {
            id: block.id,
            title: title || content.label,
            authors: 'authors' in content && Array.isArray(content.authors) ? content.authors : [],
            year: 'year' in content && typeof content.year === 'number' ? content.year : undefined,
            sourceRefs: block.sourceRefs.length
              ? block.sourceRefs
              : [
                  {
                    type: 'note_block' as const,
                    paperId: paperPath || note.paperId,
                    noteId: note.id,
                    noteBlockId: block.id
                  }
                ]
          }
        ]
      })
    )
    .slice(0, 16)
}

function buildPptAssetRefs(
  paperPath: string,
  notes: NoteDocument[],
  mineruResult?: MineruParseResult
): NonNullable<PptDeckMaterials['assets']> {
  return mergePptAssets([
    ...buildPptMineruAssetRefs(paperPath, mineruResult),
    ...buildPptNoteAssetRefs(paperPath, notes)
  ]).slice(0, 12)
}

function buildPptNoteAssetRefs(paperPath: string, notes: NoteDocument[]): SlideAssetRef[] {
  const seenAssetIds = new Set<string>()
  const assets: SlideAssetRef[] = []

  for (const note of notes) {
    for (const block of note.blocks) {
      if (block.type !== 'image' && block.type !== 'screenshot') {
        continue
      }

      const content = block.content
      const src = 'src' in content && typeof content.src === 'string' ? content.src : ''
      if (!isPptDataImage(src)) {
        continue
      }

      const assetId = ('assetId' in content && content.assetId) || block.id
      if (seenAssetIds.has(assetId)) {
        continue
      }

      seenAssetIds.add(assetId)
      assets.push({
        id: assetId,
        kind: block.type === 'screenshot' ? 'screenshot' : 'image',
        mimeType: readPptDataImageMimeType(src),
        uri: src,
        width: 'width' in content && typeof content.width === 'number' ? content.width : undefined,
        height: 'height' in content && typeof content.height === 'number' ? content.height : undefined,
        alt: 'alt' in content ? content.alt : 'caption' in content ? content.caption : undefined,
        sourceRefs: block.sourceRefs.length
          ? block.sourceRefs
          : [
              {
                type: block.type === 'screenshot' ? 'screenshot' : 'note_block',
                paperId: paperPath || note.paperId,
                noteId: note.id,
                noteBlockId: block.id
              }
            ]
      })

      if (assets.length >= 10) {
        return assets
      }
    }
  }

  return assets
}

function buildPptMineruAssetRefs(paperPath: string, mineruResult?: MineruParseResult): SlideAssetRef[] {
  if (!mineruResult) {
    return []
  }

  return mineruResult.blocks
    .filter(isPptMineruVisualBlock)
    .slice(0, 10)
    .map((block) => ({
      id: `${paperPath}:mineru:${block.id}`,
      kind: block.type === 'table' ? 'screenshot' : 'image',
      mimeType: readPptDataImageMimeType(block.imageDataUrl ?? ''),
      uri: block.imageDataUrl,
      alt: block.caption || getPptMineruBlockAlt(block),
      sourceRefs: getPptMineruBlockSourceRefs(paperPath, block)
    }))
}

function isPptMineruVisualBlock(block: MineruParseBlock): boolean {
  return (
    (block.type === 'image' || block.type === 'chart' || block.type === 'table') &&
    typeof block.imageDataUrl === 'string' &&
    isPptDataImage(block.imageDataUrl)
  )
}

function getPptMineruBlockAlt(block: MineruParseBlock): string {
  if (block.type === 'table') {
    return block.caption || `第 ${block.pageNo} 页表格`
  }

  if (block.type === 'chart') {
    return block.caption || `第 ${block.pageNo} 页图表`
  }

  return block.caption || `第 ${block.pageNo} 页原图`
}

function getPptMineruBlockSourceRefs(paperPath: string, block: MineruParseBlock): SourceRef[] {
  const segments = block.segments?.length ? block.segments : [{ pageNo: block.pageNo, rect: block.rect }]

  return segments.map((segment, index) => ({
    type: 'screenshot',
    paperId: paperPath,
    pageNo: segment.pageNo,
    rect: segment.rect,
    mineruBlockId: block.id,
    quote: block.caption || block.text,
    textHash: `${block.id}:${index}:${block.caption ?? block.text ?? ''}`
  }))
}

function mergePptAssets(assets: SlideAssetRef[]): SlideAssetRef[] {
  const seen = new Set<string>()
  const merged: SlideAssetRef[] = []

  for (const asset of assets) {
    if (seen.has(asset.id)) {
      continue
    }

    seen.add(asset.id)
    merged.push(asset)
  }

  return merged
}

function getPptNoteSourceRefs(paperPath: string, note: NoteDocument): SourceRef[] {
  const sourceRefs = uniquePptSourceRefs(note.blocks.flatMap((block) => block.sourceRefs)).slice(0, 16)
  return sourceRefs.length > 0
    ? sourceRefs
    : [
        {
          type: 'note',
          paperId: paperPath || note.paperId,
          noteId: note.id
        }
      ]
}

function uniquePptSourceRefs(sourceRefs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()

  return sourceRefs.filter((sourceRef) => {
    const key = JSON.stringify({
      type: sourceRef.type,
      paperId: sourceRef.paperId,
      noteId: sourceRef.noteId,
      noteBlockId: sourceRef.noteBlockId,
      pageNo: sourceRef.pageNo,
      messageId: sourceRef.messageId,
      referenceId: sourceRef.referenceId,
      rect: sourceRef.rect
    })

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function getPptCurrentPageNumber(pdfViewState?: PersistedPdfViewState): number | undefined {
  const pageNumber = Math.round(pdfViewState?.pageNumber ?? 0)
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : undefined
}

function truncatePptText(text: string, maxLength: number): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function isPptDataImage(value: string): boolean {
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(value)
}

function readPptDataImageMimeType(value: string): string | undefined {
  return /^data:([^;,]+)[;,]/i.exec(value)?.[1]
}

function getFileStem(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath
  return fileName.replace(/\.pdf$/i, '') || fileName
}
