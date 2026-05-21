import type { MineruParseBlock } from '@thesis-agent/shared'

export const mineruBlockDragMimeType = 'application/x-inspiration-mineru-block'

export type MineruBlockDragPayload = {
  paperPath: string
  block: MineruParseBlock
}

export function serializeMineruBlockDragPayload(payload: MineruBlockDragPayload): string {
  return JSON.stringify(payload)
}

export function hasMineruBlockDragPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(mineruBlockDragMimeType)
}

export function readMineruBlockDragPayload(dataTransfer: DataTransfer): MineruBlockDragPayload | null {
  const raw = dataTransfer.getData(mineruBlockDragMimeType)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MineruBlockDragPayload>

    if (!parsed.paperPath || !parsed.block || typeof parsed.block.id !== 'string') {
      return null
    }

    return {
      paperPath: parsed.paperPath,
      block: parsed.block
    }
  } catch {
    return null
  }
}

export function getMineruBlockPlainText(block: MineruParseBlock): string {
  const text = block.text?.trim()

  if (text) {
    return text
  }

  if (block.type === 'list' && block.listItems && block.listItems.length > 0) {
    return block.listItems.join('\n').trim()
  }

  if (block.type === 'table' && block.tableRows && block.tableRows.length > 0) {
    return block.tableRows.map((row) => row.join('\t')).join('\n').trim()
  }

  if (block.caption?.trim()) {
    return block.caption.trim()
  }

  return `${getMineruBlockTypeLabel(block.type)} · p.${block.pageNo}`
}

export function getMineruBlockAiText(payload: MineruBlockDragPayload): string {
  return `[p.${payload.block.pageNo}] ${getMineruBlockPlainText(payload.block)}`
}

export function appendTextAsNewParagraph(currentText: string, nextText: string): string {
  const normalizedNextText = nextText.trim()

  if (!normalizedNextText) {
    return currentText
  }

  const normalizedCurrentText = currentText.trimEnd()
  return normalizedCurrentText ? `${normalizedCurrentText}\n\n${normalizedNextText}` : normalizedNextText
}

function getMineruBlockTypeLabel(type: MineruParseBlock['type']): string {
  if (type === 'heading') {
    return '标题'
  }

  if (type === 'list') {
    return '列表'
  }

  if (type === 'equation') {
    return '公式'
  }

  if (type === 'image') {
    return '图片'
  }

  if (type === 'chart') {
    return '图表'
  }

  if (type === 'table') {
    return '表格'
  }

  if (type === 'footnote') {
    return '脚注'
  }

  return '段落'
}
