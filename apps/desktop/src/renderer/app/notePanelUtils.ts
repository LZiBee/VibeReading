import type { CSSProperties } from 'react'
import { countNoteTextCharacters, getNoteBlockText, listNoteTemplateDefinitions, noteBlockTypes } from '@thesis-agent/notes'
import type { NoteBlock, NoteBlockStyle, NoteBlockType, NoteDocument } from '@thesis-agent/notes'
import type { ClipboardImagePayload } from '../../preload/thesis-agent'

export function getNoteHistoryKey(filePath: string, noteId: string): string {
  return `${filePath}::${noteId}`
}

export function getNoteHistorySignature(note: NoteDocument): string {
  return JSON.stringify({
    title: note.title,
    template: note.template,
    paperId: note.paperId,
    blocks: note.blocks.map((block) => ({
      id: block.id,
      parentId: block.parentId,
      type: block.type,
      orderIndex: block.orderIndex,
      content: block.content,
      style: block.style,
      markdown: block.markdown,
      sourceRefs: block.sourceRefs
    }))
  })
}

export function cloneNoteDocument(note: NoteDocument): NoteDocument {
  return JSON.parse(JSON.stringify(note)) as NoteDocument
}

export function pushNoteHistorySnapshot(history: Record<string, NoteDocument[]>, key: string, note: NoteDocument): void {
  const currentStack = history[key] ?? []
  const lastSnapshot = currentStack.at(-1)

  if (lastSnapshot === note) {
    return
  }

  history[key] = [...currentStack, note].slice(-80)
}

export async function readPastedClipboardImages(
  clipboardData: DataTransfer,
  options: {
    hasClipboardPlainText: (clipboardData: DataTransfer) => boolean
    getClipboardImageFiles: (clipboardData: DataTransfer) => File[]
    readClipboardImageFile: (file: File) => Promise<ClipboardImagePayload>
    readClipboardImage: () => Promise<ClipboardImagePayload | null>
  }
): Promise<ClipboardImagePayload[]> {
  const imageFiles = options.getClipboardImageFiles(clipboardData)
  if (imageFiles.length > 0) {
    return Promise.all(imageFiles.map(options.readClipboardImageFile))
  }

  const image = await options.readClipboardImage()
  return image ? [image] : []
}

export function getNoteBlockLabel(type: NoteBlockType, options: Array<{ id: NoteBlockType; title: string }>): string {
  return options.find((option) => option.id === type)?.title ?? type
}

export function isNoteBlockType(value: string): value is NoteBlockType {
  return noteBlockTypes.includes(value as NoteBlockType)
}

export function canUseNoteBlockBulletList(type: NoteBlockType): boolean {
  return type === 'paragraph' || type === 'heading' || type === 'quote' || type === 'pdf_excerpt' || type === 'ai_answer' || type === 'question_node'
}

export function getNoteListMarker(block: NoteBlock, lineIndex = 0): string {
  if (!canUseNoteBlockBulletList(block.type)) {
    return ''
  }

  if (block.style?.listStyle === 'ordered') {
    return `${lineIndex + 1}.`
  }

  return block.style?.listStyle === 'bullet' ? '-' : ''
}

export function getBlockTextAreaRows(block: NoteBlock): number {
  if (block.type === 'formula') {
    return 3
  }

  const lineCount = getNoteBlockText(block).split('\n').length
  return Math.min(10, Math.max(2, lineCount))
}

export function getNoteBlockEditorStyle(block: NoteBlock): CSSProperties {
  return {
    fontFamily: block.style?.fontFamily,
    fontSize: block.style?.fontSize ? `${block.style.fontSize}px` : undefined,
    fontWeight: block.style?.bold ? 700 : undefined,
    fontStyle: block.style?.italic ? 'italic' : undefined,
    textDecoration: block.style?.underline ? 'underline' : undefined,
    backgroundColor: block.style?.highlight
  }
}

export function isTodoBlockChecked(block: NoteBlock): boolean {
  return block.type === 'todo' && 'checked' in block.content ? block.content.checked : false
}

export function getMediaBlockSrc(block: NoteBlock): string {
  return 'src' in block.content ? block.content.src ?? '' : ''
}

export function getMediaBlockAlt(block: NoteBlock): string {
  return 'alt' in block.content ? block.content.alt ?? 'PDF 分段截图' : 'PDF 分段截图'
}

export const noteTemplateDefinitions = listNoteTemplateDefinitions()
export { countNoteTextCharacters, getNoteBlockText }
