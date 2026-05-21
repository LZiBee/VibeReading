import type { NoteBlock, NoteBlockStyle, NoteBlockType, NoteDocument } from '@thesis-agent/notes'
import type { MineruModelVersion, MineruParseBlock, SourceRef } from '@thesis-agent/shared'
import type {
  ClipboardImagePayload,
  PdfLayoutSegment,
  PersistedImageAttachment,
  PersistedPdfViewState
} from '../../preload/thesis-agent'

export type PrimaryView = 'library' | 'favorites' | 'note' | 'graph'
export type EditorTab = 'pdf' | 'profile'
export type DockPanelId = 'library' | 'editor' | 'note' | 'ai'
export type ClosableDockPanelId = Exclude<DockPanelId, 'library'>
export type WorkbenchLayoutDirection = 'horizontal' | 'vertical'
export type DockDropPosition = 'left' | 'right' | 'top' | 'bottom'
export type LibrarySortField = 'recent' | 'readingTime' | 'progress' | 'date' | 'name' | 'size'
export type LibrarySortDirection = 'asc' | 'desc'
export type LibrarySortState = {
  field: LibrarySortField
  direction: LibrarySortDirection
}
export type LibrarySortMode = LibrarySortState
export type PdfFileInfo = {
  size: number
  modifiedAt?: string
}
export type PdfFileInfoByPath = Record<string, PdfFileInfo>
export type LibraryFolder = {
  id: string
  name: string
  expanded: boolean
  pdfPaths: string[]
}
export type LibraryStructure = {
  folderOrder: string[]
  foldersById: Record<string, LibraryFolder>
}

export type DockDropPreview = {
  targetId: DockPanelId
  position: DockDropPosition
}

export type DockLayoutNode = DockPanelId | DockSplitNode

export type DockSplitNode = {
  id: string
  direction: WorkbenchLayoutDirection
  children: DockLayoutNode[]
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type MineruSettings = {
  apiKey: string
  modelVersion: MineruModelVersion
  language: string
  enableTable: boolean
  enableFormula: boolean
  isOcr: boolean
  pageRange: string
  sourceUrl: string
}

export type MineruParseState = {
  paperPath: string
  title: string
  markdown: string
  blocks: MineruParseBlock[]
  createdAt: string
}

export type PdfLinkedNoteRegion = {
  id: string
  paperPath: string
  noteId: string
  noteBlockId: string
  mineruBlockId?: string
  mineruBlock?: MineruParseBlock
  pageNo: number
  rect: NonNullable<SourceRef['rect']>
  rawType: string
  label: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'sending' | 'error'
  responseId?: string
  durationMs?: number
  attachmentNames?: string[]
  attachments?: ImageAttachmentItem[]
}

export type AiConversation = {
  id: string
  paperPath: string
  title: string
  parentAnswerId?: string
  contextSelections?: AiContextSelection[]
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export type AiGraphSelectTarget = {
  paperPath: string
  conversationId: string
  messageId?: string
}

export type AiContextSelection =
  | {
      kind: 'paper'
    }
  | {
      kind: 'page'
      pageNumber: number
    }
  | {
      kind: 'note'
      noteId: string
    }
  | {
      kind: 'mineru_block'
      blockId: string
      pageNumber: number
      blockType: string
      label: string
      text: string
      imageDataUrl?: string
    }

export type AiPdfPageText = {
  pageNumber: number
  text: string
}

export type AiNoteContext = {
  noteId: string
  title: string
  markdown: string
  truncated: boolean
}

export type AiContextBudget = {
  estimatedInputTokens: number
  maxInputTokens: number
  usageRatio: number
  remainingTokens: number
  warningLevel: 'safe' | 'warning' | 'danger'
  cacheKey: string
  cacheHit: boolean
  isMeasured?: boolean
}

export type AiPaperContext = {
  fileName: string
  currentPageNumber?: number
  totalPages?: number
  extractedPageNumbers: number[]
  paperTextExcerpt: string
  pageTexts: AiPdfPageText[]
  noteContexts: AiNoteContext[]
  selectedContextLabels: string[]
  selectedContextEntries: Array<{
    label: string
    body: string
  }>
  generatedAt: string
  isTextTruncated: boolean
  isNotesTruncated: boolean
  pdfTextError?: string
  estimatedInputTokens?: number
}

export type ChatTurn = {
  id: string
  question: ChatMessage
  answer?: ChatMessage
}

export type FileAttachmentItem = {
  id: string
  kind: 'file'
  name: string
  size: number
  mimeType?: string
}

export type ImageAttachmentItem = PersistedImageAttachment
export type AttachmentItem = FileAttachmentItem | ImageAttachmentItem

export type ScreenshotSelectionRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ScreenshotResizeHandle = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

export type ScreenshotDragState =
  | {
      kind: 'draw'
      pointerId: number
      origin: {
        x: number
        y: number
      }
    }
  | {
      kind: 'move'
      pointerId: number
      startPoint: {
        x: number
        y: number
      }
      startRect: ScreenshotSelectionRect
    }
  | {
      kind: 'resize'
      pointerId: number
      handle: ScreenshotResizeHandle
      startPoint: {
        x: number
        y: number
      }
      startRect: ScreenshotSelectionRect
    }

export type NoteHistorySnapshot = {
  key: string
  note: NoteDocument
  signature: string
}

export type AiQuickAction = {
  id: string
  label: string
  icon: string
  prompt: string
}

export type FavoriteTarget =
  | {
      type: 'paper'
      paperPath: string
    }
  | {
      type: 'note'
      paperPath: string
      noteId: string
    }
  | {
      type: 'ai_answer'
      paperPath: string
      conversationId: string
      messageId: string
    }

export type FavoriteItem = FavoriteTarget & {
  createdAt: string
}

export type FavoriteItemsByKey = Record<string, FavoriteItem>

export type ResolvedFavoriteItem = {
  key: string
  target: FavoriteTarget
  createdAt: string
  icon: string
  typeLabel: string
  title: string
  subtitle: string
}

export type PdfViewStates = Record<string, PersistedPdfViewState>
export type PdfDisplayNamesByPath = Record<string, string>
export type PdfScreenshotRect = PdfLayoutSegment['rect']
export type PdfScreenshotLayoutSegment = Pick<PdfLayoutSegment, 'pageNo' | 'segmentIndex' | 'rect'>

export type PdfScreenshotRenderedSegment = {
  src: string
  pageNo: number
  segmentIndex: number
  width: number
  height: number
  rect: PdfScreenshotRect
}

export type NotesByPaperPath = Record<string, NoteDocument[]>
export type SelectedNoteIdsByPaperPath = Record<string, string>
export type OpenNoteIdsByPaperPath = Record<string, string[]>
export type PendingNoteTemplateByPaperPath = Record<string, boolean>
export type AiConversationsByPaperPath = Record<string, AiConversation[]>
export type ActiveAiConversationIdsByPaperPath = Record<string, string>

export type PendingNoteCloseRequest = {
  filePath: string
  noteId: string
}

export type RenameDialogBase = {
  title: string
  description: string
  label: string
  initialValue: string
}

export type RenameDialogRequest =
  | (RenameDialogBase & {
      kind: 'pdf'
      filePath: string
      allowEmpty: true
    })
  | (RenameDialogBase & {
      kind: 'ai-conversation'
      conversationId: string
      allowEmpty: false
      emptyError: string
    })
  | (RenameDialogBase & {
      kind: 'note'
      filePath: string
      noteId: string
      allowEmpty: false
      emptyError: string
    })
  | (RenameDialogBase & {
      kind: 'library-folder-create'
      allowEmpty: false
      emptyError: string
    })

export type ProfileNoteSummary = {
  id: string
  paperPath: string
  title: string
  blockCount: number
  characterCount: number
  updatedAt: string
}

export type ProfileReadingItem = {
  filePath: string
  title: string
  progressPercent: number
  progressLabel: string
  readingTime: string
  updatedAt: string
}

export type ProfileActivityCell = {
  date: string
  count: number
  level: number
}

export type NoteBlockEditorStyle = NoteBlockStyle
export type NoteBlockEditorType = NoteBlockType
export type NoteBlockDocument = NoteBlock
export type ClipboardImageItem = ClipboardImagePayload
