import type { NoteDocument } from '@thesis-agent/notes'
import type {
  BatchTranslationRequest,
  BatchTranslationResult,
  CodeRepositoryPreparationInput,
  CodeRepositoryPreparationResult,
  DeckSpec,
  MineruModelVersion,
  MineruParseResult,
  PptExportResult,
  SelectionExplainRequest,
  SelectionExplainResult
} from '@thesis-agent/shared'

export type PersistedPrimaryView = 'library' | 'favorites' | 'note' | 'graph'
export type PersistedEditorTab = 'pdf' | 'graph' | 'mindmap' | 'profile'
export type PersistedNoteEditorEngine = 'legacy' | 'milkdown'
export type PersistedDockPanelId = 'library' | 'editor' | 'note' | 'ai'
export type PersistedDockLayoutDirection = 'horizontal' | 'vertical'
export type PersistedDockLayoutNode = PersistedDockPanelId | PersistedDockSplitNode
export type PersistedDockSplitNode = {
  id: string
  direction: PersistedDockLayoutDirection
  children: PersistedDockLayoutNode[]
}
export type PersistedReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type PersistedPdfViewState = {
  pageNumber: number
  pageCount?: number
  scale: number
  scrollLeft: number
  scrollTop: number
  readingSeconds?: number
  updatedAt?: string
}
export type PersistedLibrarySortField = 'recent' | 'readingTime' | 'progress' | 'date' | 'name' | 'size'
export type PersistedLibrarySortDirection = 'asc' | 'desc'
export type PersistedLibrarySortState = {
  field: PersistedLibrarySortField
  direction: PersistedLibrarySortDirection
}
export type PersistedPdfFileInfo = {
  size: number
  modifiedAt?: string
}
export type PersistedLibraryFolder = {
  id: string
  name: string
  expanded: boolean
  pdfPaths: string[]
}
export type PersistedLibraryStructure = {
  folderOrder: string[]
  foldersById: Record<string, PersistedLibraryFolder>
}
export type PdfLayoutRect = {
  x: number
  y: number
  width: number
  height: number
}
export type PdfLayoutSegment = {
  pageNo: number
  segmentIndex: number
  rect: PdfLayoutRect
  textLength: number
  parser: 'poppler-bbox-layout'
}
export type PdfLayoutSegmentsResult = {
  parser: 'poppler-bbox-layout'
  segments: PdfLayoutSegment[]
}
export type ClipboardImagePayload = {
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUrl: string
  width: number
  height: number
  size: number
}
export type NoteExportFormat = 'word' | 'pdf' | 'markdown'
export type NoteExportResult = {
  canceled: boolean
  format: NoteExportFormat
  filePath?: string
}
export type PptDeckExportResult = PptExportResult & {
  canceled: boolean
  filePath?: string
}
export type PersistedImageAttachment = ClipboardImagePayload & {
  id: string
  kind: 'image'
}
export type PersistedAiSettingsState = {
  providerId: string
  baseUrl: string
  model: string
  reasoningEffort: PersistedReasoningEffort
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  systemPrompt: string
  apiKey: string
}
export type PersistedTranslationSettingsState = {
  targetLanguage: string
  dictionaryEnabled: boolean
  fullTextBatchSize: number
  ai: PersistedAiSettingsState
}
export type PersistedPptGenerationSettingsState = {
  targetSlideCount: number
  includeAgenda: boolean
  includeReferences: boolean
  includeAppendix: boolean
  includeNotes: boolean
  includeAiAnswers: boolean
}
export type PersistedPdfEditorSettingsState = {
  defaultTool: 'select' | 'highlight'
  defaultBrowseMode: 'scroll' | 'page'
  defaultRenderMode: 'compatibility' | 'pdfjs'
  defaultScale: number
  showSelectionPopover: boolean
}
export type PersistedAppSettingsState = {
  translation: PersistedTranslationSettingsState
  pptAi: PersistedAiSettingsState
  pptGeneration: PersistedPptGenerationSettingsState
  pdfEditor: PersistedPdfEditorSettingsState
}
export type PersistedMineruSettingsState = {
  apiKey: string
  modelVersion: MineruModelVersion
  language: string
  enableTable: boolean
  enableFormula: boolean
  isOcr: boolean
  autoClean: boolean
  pageRange: string
  sourceUrl: string
  noteStyle: {
    fontFamily: string
    fontSize: number
    bold: boolean
    italic: boolean
    highlight: string
  }
}
export type PersistedWorkbenchState = {
  activeView: PersistedPrimaryView
  activeEditor: PersistedEditorTab
  noteEditorEngine?: PersistedNoteEditorEngine
  libraryPdfPaths?: string[]
  openPdfPaths: string[]
  selectedPdfPath: string
  librarySort?: PersistedLibrarySortState
  libraryStructure?: PersistedLibraryStructure
  pdfFileInfoByPath?: Record<string, PersistedPdfFileInfo>
  pdfDisplayNamesByPath: Record<string, string>
  isAiConfigOpen: boolean
  isAiHistoryOpen: boolean
  isPrimarySidebarCollapsed: boolean
  dockLayout: PersistedDockLayoutNode
  hiddenDockPanels?: PersistedDockPanelId[]
  pdfViewStates: Record<string, PersistedPdfViewState>
}
export type PersistedNotesState = {
  notesByPaperPath: Record<string, NoteDocument[]>
  selectedNoteIdsByPaperPath?: Record<string, string>
  openNoteIdsByPaperPath?: Record<string, string[]>
}
export type PersistedChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'sending' | 'error'
  responseId?: string
  durationMs?: number
  attachmentNames?: string[]
  attachments?: PersistedImageAttachment[]
}
export type PersistedAiConversation = {
  id: string
  paperPath: string
  title: string
  parentAnswerId?: string
  contextSelections?: Array<
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
  >
  messages: PersistedChatMessage[]
  createdAt: string
  updatedAt: string
}
export type PersistedAiConversationsState = {
  conversationsByPaperPath: Record<string, PersistedAiConversation[]>
  activeConversationIdsByPaperPath?: Record<string, string>
}
export type PersistedFavoriteItem =
  | {
      type: 'paper'
      paperPath: string
      createdAt: string
    }
  | {
      type: 'note'
      paperPath: string
      noteId: string
      createdAt: string
    }
  | {
      type: 'ai_answer'
      paperPath: string
      conversationId: string
      messageId: string
      createdAt: string
    }
export type PersistedFavoritesState = {
  items: Record<string, PersistedFavoriteItem>
}
export type PersistedAppState = {
  version: 1
  updatedAt: string
  workbench?: PersistedWorkbenchState
  aiSettings?: PersistedAiSettingsState
  appSettings?: PersistedAppSettingsState
  mineruSettings?: PersistedMineruSettingsState
  mineruResultsByPaperPath?: Record<string, MineruParseResult>
  hiddenMineruOverlayByPaperPath?: Record<string, boolean>
  invalidatedSourceLinkKeysByPaperPath?: Record<string, string[]>
  notes?: PersistedNotesState
  aiConversations?: PersistedAiConversationsState
  favorites?: PersistedFavoritesState
}

export type ThesisAgentApi = {
  versions: {
    chrome: string
    electron: string
    node: string
  }
  readAppState: () => Promise<PersistedAppState>
  writeAppState: (state: PersistedAppState) => Promise<PersistedAppState>
  openPdf: () => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  getPdfFileInfo: (filePath: string) => Promise<PersistedPdfFileInfo>
  readPdfFile: (filePath: string) => Promise<ArrayBuffer>
  renderPdfPageBitmap: (input: {
    filePath: string
    pageNumber: number
    scale: number
    outputScale: number
  }) => Promise<{
    imageDataUrl: string
    dpi: number
  }>
  captureAppRegionToClipboard: (input: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<ClipboardImagePayload>
  readClipboardImage: () => Promise<ClipboardImagePayload | null>
  exportNote: (input: { format: NoteExportFormat; note: NoteDocument; markdown?: string }) => Promise<NoteExportResult>
  exportPptDeck: (input: { deck: DeckSpec; suggestedFileName?: string; preferredFilePath?: string }) => Promise<PptDeckExportResult>
  parsePdfWithMineru: (input: {
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
  }) => Promise<MineruParseResult>
  hasCachedMineruResult: (filePath: string) => Promise<boolean>
  readCachedMineruResult: (filePath: string) => Promise<MineruParseResult | null>
  clearCachedMineruResult: (filePath: string) => Promise<boolean>
  clearAllCachedMineruResults: () => Promise<number>
  prepareCodeRepository: (input: CodeRepositoryPreparationInput) => Promise<CodeRepositoryPreparationResult>
  explainSelection: (input: SelectionExplainRequest) => Promise<SelectionExplainResult>
  translateBatch: (input: BatchTranslationRequest) => Promise<BatchTranslationResult>
  extractPdfLayoutSegments: (input: {
    filePath: string
    maxPages: number
    maxSegments: number
  }) => Promise<PdfLayoutSegmentsResult>
  testAiProvider: (input: {
    providerId: string
    baseUrl: string
    wireApi: 'responses'
    model: string
    reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    disableResponseStorage: boolean
    requiresOpenAiAuth: boolean
    apiKey?: string
    prompt: string
  }) => Promise<{
    ok: boolean
    status: number
    message: string
    outputText?: string
    responseId?: string
  }>
  sendAiMessage: (input: {
    providerId: string
    baseUrl: string
    wireApi: 'responses'
    model: string
    reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    disableResponseStorage: boolean
    requiresOpenAiAuth: boolean
    apiKey?: string
    systemPrompt: string
    messages: Array<{
      role: 'user' | 'assistant'
      content: string
    }>
    prompt: string
    attachments?: PersistedImageAttachment[]
    maxOutputTokens?: number
  }) => Promise<{
    ok: boolean
    status: number
    message: string
    outputText?: string
    responseId?: string
  }>
}
