import { app } from 'electron'
import { access, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { noteTemplateKinds, normalizeNoteBlockStyle } from '@thesis-agent/notes'
import type { NoteBlock, NoteBlockContent, NoteBlockType, NoteDocument, NoteTemplateKind } from '@thesis-agent/notes'
import { normalizeMineruParseResultSegments, type MineruModelVersion, type MineruParseResult, type SourceRef, type SourceRefType } from '@thesis-agent/shared'

export type PrimaryView = 'library' | 'favorites' | 'note' | 'graph'
export type EditorTab = 'pdf' | 'graph' | 'mindmap' | 'profile'
export type NoteEditorEngine = 'legacy' | 'milkdown'
export type DockPanelId = 'library' | 'editor' | 'note' | 'ai'
export type ClosableDockPanelId = Exclude<DockPanelId, 'library'>
export type WorkbenchLayoutDirection = 'horizontal' | 'vertical'
export type DockLayoutNode = DockPanelId | DockSplitNode

export type DockSplitNode = {
  id: string
  direction: WorkbenchLayoutDirection
  children: DockLayoutNode[]
}

export type PdfViewState = {
  pageNumber: number
  pageCount?: number
  scale: number
  scrollLeft: number
  scrollTop: number
  readingSeconds?: number
  updatedAt?: string
}

export type AiSettingsState = {
  providerId: string
  baseUrl: string
  model: string
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  systemPrompt: string
  apiKey: string
}

export type MineruSettingsState = {
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

export type TranslationSettingsState = {
  targetLanguage: string
  dictionaryEnabled: boolean
  fullTextBatchSize: number
  ai: AiSettingsState
}

export type PptGenerationSettingsState = {
  targetSlideCount: number
  includeAgenda: boolean
  includeReferences: boolean
  includeAppendix: boolean
  includeNotes: boolean
  includeAiAnswers: boolean
}

export type PdfEditorSettingsState = {
  defaultTool: 'select' | 'highlight'
  defaultBrowseMode: 'scroll' | 'page'
  defaultRenderMode: 'compatibility' | 'pdfjs'
  defaultScale: number
  showSelectionPopover: boolean
}

export type AppSettingsState = {
  translation: TranslationSettingsState
  pptAi: AiSettingsState
  pptGeneration: PptGenerationSettingsState
  pdfEditor: PdfEditorSettingsState
}

export type ChatMessageState = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'sending' | 'error'
  responseId?: string
  durationMs?: number
  attachmentNames?: string[]
  attachments?: AiImageAttachmentState[]
}

export type AiImageAttachmentState = {
  id: string
  kind: 'image'
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUrl: string
  width: number
  height: number
  size: number
}

export type AiConversationState = {
  id: string
  paperPath: string
  title: string
  parentAnswerId?: string
  contextSelections?: AiContextSelectionState[]
  messages: ChatMessageState[]
  createdAt: string
  updatedAt: string
}

export type AiContextSelectionState =
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

export type LibrarySortField = 'recent' | 'readingTime' | 'progress' | 'date' | 'name' | 'size'
export type LibrarySortDirection = 'asc' | 'desc'
export type LibrarySortState = {
  field: LibrarySortField
  direction: LibrarySortDirection
}

export type PdfFileInfoState = {
  size: number
  modifiedAt?: string
}

export type LibraryFolderState = {
  id: string
  name: string
  expanded: boolean
  pdfPaths: string[]
}

export type LibraryStructureState = {
  folderOrder: string[]
  foldersById: Record<string, LibraryFolderState>
}

export type WorkbenchState = {
  activeView: PrimaryView
  activeEditor: EditorTab
  noteEditorEngine?: NoteEditorEngine
  libraryPdfPaths: string[]
  openPdfPaths: string[]
  selectedPdfPath: string
  librarySort: LibrarySortState
  libraryStructure: LibraryStructureState
  pdfFileInfoByPath: Record<string, PdfFileInfoState>
  pdfDisplayNamesByPath: Record<string, string>
  isAiConfigOpen: boolean
  isAiHistoryOpen: boolean
  isPrimarySidebarCollapsed: boolean
  dockLayout: DockLayoutNode
  hiddenDockPanels: ClosableDockPanelId[]
  pdfViewStates: Record<string, PdfViewState>
}

export type NotesState = {
  notesByPaperPath: Record<string, NoteDocument[]>
  selectedNoteIdsByPaperPath: Record<string, string>
  openNoteIdsByPaperPath: Record<string, string[]>
}

export type AiConversationsState = {
  conversationsByPaperPath: Record<string, AiConversationState[]>
  activeConversationIdsByPaperPath: Record<string, string>
}

export type FavoriteTargetState =
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

export type FavoriteItemState = FavoriteTargetState & {
  createdAt: string
}

export type FavoritesState = {
  items: Record<string, FavoriteItemState>
}

export type PersistedAppState = {
  version: 1
  updatedAt: string
  workbench?: WorkbenchState
  aiSettings?: AiSettingsState
  appSettings?: AppSettingsState
  mineruSettings?: MineruSettingsState
  mineruResultsByPaperPath?: Record<string, MineruParseResult>
  hiddenMineruOverlayByPaperPath?: Record<string, boolean>
  invalidatedSourceLinkKeysByPaperPath?: Record<string, string[]>
  notes?: NotesState
  aiConversations?: AiConversationsState
  favorites?: FavoritesState
}

const defaultSystemPrompt =
  'You are Inspiration, a careful research paper reading assistant. Answer clearly and cite paper evidence when context is provided.'

export const defaultAiSettings: AiSettingsState = {
  providerId: 'my_codex',
  baseUrl: 'https://geekspace.cloud/v1',
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh',
  disableResponseStorage: true,
  requiresOpenAiAuth: true,
  systemPrompt: defaultSystemPrompt,
  apiKey: ''
}

export const defaultMineruSettings: MineruSettingsState = {
  apiKey: '',
  modelVersion: 'vlm',
  language: 'en',
  enableTable: true,
  enableFormula: true,
  isOcr: false,
  autoClean: true,
  pageRange: '',
  sourceUrl: '',
  noteStyle: {
    fontFamily: '',
    fontSize: 14,
    bold: false,
    italic: false,
    highlight: '#dff1ff'
  }
}

export const defaultTranslationSettings: TranslationSettingsState = {
  targetLanguage: 'zh-CN',
  dictionaryEnabled: true,
  fullTextBatchSize: 5,
  ai: {
    ...defaultAiSettings,
    model: 'gpt-5.4',
    reasoningEffort: 'low'
  }
}

export const defaultPptAiSettings: AiSettingsState = {
  ...defaultAiSettings,
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh'
}

export const defaultPptGenerationSettings: PptGenerationSettingsState = {
  targetSlideCount: 10,
  includeAgenda: true,
  includeReferences: true,
  includeAppendix: false,
  includeNotes: true,
  includeAiAnswers: true
}

export const defaultPdfEditorSettings: PdfEditorSettingsState = {
  defaultTool: 'select',
  defaultBrowseMode: 'page',
  defaultRenderMode: 'compatibility',
  defaultScale: 1,
  showSelectionPopover: true
}

export const defaultLibrarySortState: LibrarySortState = {
  field: 'recent',
  direction: 'desc'
}

export const defaultLibraryStructureState: LibraryStructureState = {
  folderOrder: [],
  foldersById: {}
}

export const defaultDockLayout: DockSplitNode = {
  id: 'root',
  direction: 'horizontal',
  children: ['library', 'editor', 'note', 'ai']
}

export const defaultNoteEditorEngine: NoteEditorEngine = 'milkdown'

const allDockPanelIds: DockPanelId[] = ['library', 'editor', 'note', 'ai']
const noteBlockTypeValues: NoteBlockType[] = [
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
const sourceRefTypeValues: SourceRefType[] = [
  'paper',
  'page',
  'annotation',
  'pdf_selection',
  'screenshot',
  'formula',
  'ai_message',
  'reference',
  'zotero_item',
  'note',
  'note_block'
]
const noteTemplateKindValues: NoteTemplateKind[] = [...noteTemplateKinds]
let stateWriteQueue: Promise<void> = Promise.resolve()

export async function readPersistedAppState(
  parseJsonObject: (text: string) => Record<string, unknown> | null,
  isNodeError: (error: unknown) => error is NodeJS.ErrnoException
): Promise<PersistedAppState> {
  try {
    const rawText = await readFile(getAppStatePath(), 'utf8')
    return sanitizePersistedAppState(parseJsonObject(rawText))
  } catch (error) {
    if (isNodeError(error) && error.code !== 'ENOENT') {
      console.warn('Failed to read app state cache:', error.message)
    }

    return createDefaultPersistedAppState()
  }
}

export async function writePersistedAppState(input: unknown): Promise<PersistedAppState> {
  const nextState = {
    ...sanitizePersistedAppState(input),
    updatedAt: new Date().toISOString()
  }

  stateWriteQueue = stateWriteQueue.catch(() => undefined).then(async () => {
    const statePath = getAppStatePath()
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf8')
  })

  await stateWriteQueue
  return nextState
}

export async function readPersistedMineruResult(
  filePath: string,
  parseJsonObject: (text: string) => Record<string, unknown> | null,
  isNodeError: (error: unknown) => error is NodeJS.ErrnoException
): Promise<MineruParseResult | null> {
  if (!isPdfPath(filePath)) {
    return null
  }

  try {
    const rawText = await readFile(getMineruResultCachePath(filePath), 'utf8')
    const json = parseJsonObject(rawText)
    if (!json || json.filePath !== filePath) {
      return null
    }

    return sanitizeMineruParseResult(json.result) ?? null
  } catch (error) {
    if (isNodeError(error) && error.code !== 'ENOENT') {
      console.warn('Failed to read MinerU cache:', error.message)
    }

    return null
  }
}

export async function writePersistedMineruResult(filePath: string, result: unknown): Promise<MineruParseResult | null> {
  if (!isPdfPath(filePath)) {
    return null
  }

  const sanitizedResult = sanitizeMineruParseResult(result)
  if (!sanitizedResult) {
    return null
  }

  const cachePath = getMineruResultCachePath(filePath)
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(
    cachePath,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        filePath,
        result: sanitizedResult
      },
      null,
      2
    ),
    'utf8'
  )

  return sanitizedResult
}

export async function hasPersistedMineruResult(filePath: string): Promise<boolean> {
  if (!isPdfPath(filePath)) {
    return false
  }

  try {
    await access(getMineruResultCachePath(filePath))
    return true
  } catch {
    return false
  }
}

export async function clearPersistedMineruResult(filePath: string): Promise<boolean> {
  if (!isPdfPath(filePath)) {
    return false
  }

  try {
    await unlink(getMineruResultCachePath(filePath))
    return true
  } catch {
    return false
  }
}

export async function clearAllPersistedMineruResults(): Promise<number> {
  const cacheDir = getMineruCacheDirPath()

  try {
    const fileNames = await readdir(cacheDir)
    await Promise.all(
      fileNames.map((fileName) => rm(join(cacheDir, fileName), { force: true }))
    )
    return fileNames.length
  } catch {
    return 0
  }
}

function getAppStatePath(): string {
  return join(app.getPath('userData'), 'state', 'workbench-state.json')
}

function getMineruResultCachePath(filePath: string): string {
  return join(getMineruCacheDirPath(), `${hashString(filePath)}.json`)
}

function getMineruCacheDirPath(): string {
  return join(app.getPath('userData'), 'state', 'mineru-cache')
}

function createDefaultPersistedAppState(): PersistedAppState {
  return {
    version: 1,
    updatedAt: new Date().toISOString()
  }
}

function sanitizePersistedAppState(input: unknown): PersistedAppState {
  const data = isRecord(input) ? input : {}
  const workbench = sanitizeWorkbenchState(data.workbench)
  const aiSettings = sanitizeAiSettingsState(data.aiSettings)
  const appSettings = sanitizeAppSettingsState(data.appSettings, aiSettings ?? defaultAiSettings)
  const mineruSettings = sanitizeMineruSettingsState(data.mineruSettings)
  const mineruResultsByPaperPath = sanitizeMineruResultsByPaperPath(data.mineruResultsByPaperPath)
  const hiddenMineruOverlayByPaperPath = sanitizeHiddenMineruOverlayByPaperPath(
    data.hiddenMineruOverlayByPaperPath,
    mineruResultsByPaperPath
  )
  const invalidatedSourceLinkKeysByPaperPath = sanitizeInvalidatedSourceLinkKeysByPaperPath(
    data.invalidatedSourceLinkKeysByPaperPath
  )
  const notes = sanitizeNotesState(data.notes, mineruResultsByPaperPath)
  const aiConversations = sanitizeAiConversationsState(data.aiConversations)
  const favorites = sanitizeFavoritesState(data.favorites, notes, aiConversations)

  return {
    version: 1,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    ...(workbench ? { workbench } : {}),
    ...(aiSettings ? { aiSettings } : {}),
    ...(appSettings ? { appSettings } : {}),
    ...(mineruSettings ? { mineruSettings } : {}),
    ...(Object.keys(mineruResultsByPaperPath).length > 0 ? { mineruResultsByPaperPath } : {}),
    ...(Object.keys(hiddenMineruOverlayByPaperPath).length > 0 ? { hiddenMineruOverlayByPaperPath } : {}),
    ...(Object.keys(invalidatedSourceLinkKeysByPaperPath).length > 0 ? { invalidatedSourceLinkKeysByPaperPath } : {}),
    ...(notes ? { notes } : {}),
    ...(aiConversations ? { aiConversations } : {}),
    ...(favorites ? { favorites } : {})
  }
}

function sanitizeWorkbenchState(input: unknown): WorkbenchState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const openPdfPaths = uniqueStrings(readStringArray(input.openPdfPaths))
    .filter(isPdfPath)
    .slice(0, 30)
  const libraryPdfPaths = uniqueStrings([...readStringArray(input.libraryPdfPaths), ...openPdfPaths])
    .filter(isPdfPath)
    .slice(0, 80)
  const selectedPdfPath =
    typeof input.selectedPdfPath === 'string' && libraryPdfPaths.includes(input.selectedPdfPath)
      ? input.selectedPdfPath
      : openPdfPaths.at(-1) ?? libraryPdfPaths.at(-1) ?? ''
  const dockLayout = sanitizeDockLayout(input.dockLayout) ?? defaultDockLayout

  return {
    activeView: isPrimaryView(input.activeView) ? input.activeView : 'library',
    activeEditor: isEditorTab(input.activeEditor) ? input.activeEditor : 'pdf',
    noteEditorEngine: isNoteEditorEngine(input.noteEditorEngine) ? input.noteEditorEngine : defaultNoteEditorEngine,
    libraryPdfPaths,
    openPdfPaths,
    selectedPdfPath,
    librarySort: sanitizeLibrarySortState(input.librarySort),
    libraryStructure: sanitizeLibraryStructureState(input.libraryStructure, libraryPdfPaths),
    pdfFileInfoByPath: sanitizePdfFileInfoByPath(input.pdfFileInfoByPath, libraryPdfPaths),
    pdfDisplayNamesByPath: sanitizePdfDisplayNamesByPath(input.pdfDisplayNamesByPath, libraryPdfPaths),
    isAiConfigOpen: typeof input.isAiConfigOpen === 'boolean' ? input.isAiConfigOpen : false,
    isAiHistoryOpen: typeof input.isAiHistoryOpen === 'boolean' ? input.isAiHistoryOpen : false,
    isPrimarySidebarCollapsed:
      typeof input.isPrimarySidebarCollapsed === 'boolean' ? input.isPrimarySidebarCollapsed : false,
    dockLayout,
    hiddenDockPanels: filterClosableDockPanelIds(readStringArray(input.hiddenDockPanels)),
    pdfViewStates: sanitizePdfViewStates(input.pdfViewStates)
  }
}

function sanitizeLibraryStructureState(input: unknown, libraryPdfPaths: string[]): LibraryStructureState {
  if (!isRecord(input)) {
    return defaultLibraryStructureState
  }

  const knownPdfPathSet = new Set(libraryPdfPaths)
  const foldersByIdInput = isRecord(input.foldersById) ? input.foldersById : {}
  const sanitizedFolders = Object.fromEntries(
    Object.entries(foldersByIdInput)
      .flatMap(([folderId, folderValue]) => {
        if (!isRecord(folderValue)) {
          return []
        }

        const id = typeof folderValue.id === 'string' && folderValue.id.trim() ? folderValue.id.trim() : folderId.trim()
        if (!id) {
          return []
        }

        const pdfPaths = uniqueStrings(readStringArray(folderValue.pdfPaths)).filter((filePath) => knownPdfPathSet.has(filePath))

        return [
          [
            id,
            {
              id,
              name: readLimitedString(folderValue.name, 120, '新建文件夹'),
              expanded: typeof folderValue.expanded === 'boolean' ? folderValue.expanded : true,
              pdfPaths
            } satisfies LibraryFolderState
          ] as const
        ]
      })
      .slice(0, 100)
  )

  const existingFolderIds = new Set(Object.keys(sanitizedFolders))
  const folderOrder = uniqueStrings(readStringArray(input.folderOrder))
    .filter((folderId) => existingFolderIds.has(folderId))
    .slice(0, 100)

  return {
    folderOrder: [...folderOrder, ...Object.keys(sanitizedFolders).filter((folderId) => !folderOrder.includes(folderId))],
    foldersById: sanitizedFolders
  }
}

function sanitizeLibrarySortState(input: unknown): LibrarySortState {
  if (!isRecord(input)) {
    return defaultLibrarySortState
  }

  return {
    field: isLibrarySortField(input.field) ? input.field : defaultLibrarySortState.field,
    direction: isLibrarySortDirection(input.direction) ? input.direction : defaultLibrarySortState.direction
  }
}

function sanitizePdfFileInfoByPath(input: unknown, openPdfPaths: string[]): Record<string, PdfFileInfoState> {
  if (!isRecord(input)) {
    return {}
  }

  const openPathSet = new Set(openPdfPaths)

  return Object.fromEntries(
    Object.entries(input)
      .flatMap(([filePath, value]) => {
        if (!openPathSet.has(filePath) || !isRecord(value)) {
          return []
        }

        const size = clampInteger(value.size, 0, Number.MAX_SAFE_INTEGER, -1)
        if (size < 0) {
          return []
        }

        return [
          [
            filePath,
            {
              size,
              modifiedAt: typeof value.modifiedAt === 'string' ? value.modifiedAt : undefined
            } satisfies PdfFileInfoState
          ] as const
        ]
      })
      .slice(0, 80)
  )
}

function sanitizePdfDisplayNamesByPath(input: unknown, openPdfPaths: string[]): Record<string, string> {
  if (!isRecord(input)) {
    return {}
  }

  const openPathSet = new Set(openPdfPaths)

  return Object.fromEntries(
    Object.entries(input)
      .flatMap(([filePath, displayName]) =>
        openPathSet.has(filePath) && typeof displayName === 'string'
          ? ([[filePath, displayName.trim().slice(0, 120)] as const])
          : []
      )
      .filter(([, displayName]) => displayName.length > 0)
  )
}

function sanitizeAiSettingsState(input: unknown): AiSettingsState | undefined {
  return sanitizeAiSettingsStateWithFallback(input, defaultAiSettings)
}

function sanitizeAiSettingsStateWithFallback(input: unknown, fallback: AiSettingsState): AiSettingsState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  return {
    providerId: readNonEmptyString(input.providerId, fallback.providerId),
    baseUrl: readNonEmptyString(input.baseUrl, fallback.baseUrl),
    model: readNonEmptyString(input.model, fallback.model),
    reasoningEffort: isReasoningEffort(input.reasoningEffort) ? input.reasoningEffort : fallback.reasoningEffort,
    disableResponseStorage:
      typeof input.disableResponseStorage === 'boolean'
        ? input.disableResponseStorage
        : fallback.disableResponseStorage,
    requiresOpenAiAuth:
      typeof input.requiresOpenAiAuth === 'boolean' ? input.requiresOpenAiAuth : fallback.requiresOpenAiAuth,
    systemPrompt: readNonEmptyString(input.systemPrompt, fallback.systemPrompt),
    apiKey: typeof input.apiKey === 'string' ? input.apiKey.trim() : fallback.apiKey
  }
}

function sanitizeAppSettingsState(input: unknown, fallbackAiSettings: AiSettingsState): AppSettingsState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const translationFallback: TranslationSettingsState = {
    ...defaultTranslationSettings,
    ai: {
      ...fallbackAiSettings,
      model: defaultTranslationSettings.ai.model,
      reasoningEffort: defaultTranslationSettings.ai.reasoningEffort,
      apiKey: defaultTranslationSettings.ai.apiKey
    }
  }
  const pptAiFallback: AiSettingsState = {
    ...fallbackAiSettings,
    model: defaultPptAiSettings.model,
    reasoningEffort: defaultPptAiSettings.reasoningEffort,
    apiKey: defaultPptAiSettings.apiKey
  }

  return {
    translation: sanitizeTranslationSettingsState(input.translation, translationFallback),
    pptAi: sanitizeAiSettingsStateWithFallback(input.pptAi, pptAiFallback) ?? pptAiFallback,
    pptGeneration: sanitizePptGenerationSettingsState(input.pptGeneration),
    pdfEditor: sanitizePdfEditorSettingsState(input.pdfEditor)
  }
}

function sanitizeTranslationSettingsState(input: unknown, fallback: TranslationSettingsState): TranslationSettingsState {
  const data = isRecord(input) ? input : {}

  return {
    targetLanguage: readLimitedString(data.targetLanguage, 40, fallback.targetLanguage),
    dictionaryEnabled: typeof data.dictionaryEnabled === 'boolean' ? data.dictionaryEnabled : fallback.dictionaryEnabled,
    fullTextBatchSize: clampInteger(data.fullTextBatchSize, 1, 10, fallback.fullTextBatchSize),
    ai: sanitizeAiSettingsStateWithFallback(data.ai, fallback.ai) ?? fallback.ai
  }
}

function sanitizePptGenerationSettingsState(input: unknown): PptGenerationSettingsState {
  const data = isRecord(input) ? input : {}

  return {
    targetSlideCount: clampInteger(data.targetSlideCount, 8, 12, defaultPptGenerationSettings.targetSlideCount),
    includeAgenda: typeof data.includeAgenda === 'boolean' ? data.includeAgenda : defaultPptGenerationSettings.includeAgenda,
    includeReferences:
      typeof data.includeReferences === 'boolean' ? data.includeReferences : defaultPptGenerationSettings.includeReferences,
    includeAppendix: typeof data.includeAppendix === 'boolean' ? data.includeAppendix : defaultPptGenerationSettings.includeAppendix,
    includeNotes: typeof data.includeNotes === 'boolean' ? data.includeNotes : defaultPptGenerationSettings.includeNotes,
    includeAiAnswers: typeof data.includeAiAnswers === 'boolean' ? data.includeAiAnswers : defaultPptGenerationSettings.includeAiAnswers
  }
}

function sanitizePdfEditorSettingsState(input: unknown): PdfEditorSettingsState {
  const data = isRecord(input) ? input : {}

  return {
    defaultTool: data.defaultTool === 'highlight' ? 'highlight' : defaultPdfEditorSettings.defaultTool,
    defaultBrowseMode: data.defaultBrowseMode === 'scroll' ? 'scroll' : defaultPdfEditorSettings.defaultBrowseMode,
    defaultRenderMode: data.defaultRenderMode === 'pdfjs' ? 'pdfjs' : defaultPdfEditorSettings.defaultRenderMode,
    defaultScale: clampNumber(data.defaultScale, 0.5, 3, defaultPdfEditorSettings.defaultScale),
    showSelectionPopover:
      typeof data.showSelectionPopover === 'boolean' ? data.showSelectionPopover : defaultPdfEditorSettings.showSelectionPopover
  }
}

function sanitizeMineruSettingsState(input: unknown): MineruSettingsState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  return {
    apiKey: readNonEmptyString(input.apiKey, defaultMineruSettings.apiKey),
    modelVersion: isMineruModelVersion(input.modelVersion) ? input.modelVersion : defaultMineruSettings.modelVersion,
    language: readNonEmptyString(input.language, defaultMineruSettings.language),
    enableTable: typeof input.enableTable === 'boolean' ? input.enableTable : defaultMineruSettings.enableTable,
    enableFormula: typeof input.enableFormula === 'boolean' ? input.enableFormula : defaultMineruSettings.enableFormula,
    isOcr: typeof input.isOcr === 'boolean' ? input.isOcr : defaultMineruSettings.isOcr,
    autoClean: typeof input.autoClean === 'boolean' ? input.autoClean : defaultMineruSettings.autoClean,
    pageRange: typeof input.pageRange === 'string' ? input.pageRange : defaultMineruSettings.pageRange,
    sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : defaultMineruSettings.sourceUrl,
    noteStyle: sanitizeMineruNoteStyle(input.noteStyle)
  }
}

function sanitizeMineruNoteStyle(input: unknown): MineruSettingsState['noteStyle'] {
  const value = isRecord(input) ? input : {}
  return {
    fontFamily: typeof value.fontFamily === 'string' ? value.fontFamily : defaultMineruSettings.noteStyle.fontFamily,
    fontSize: clampInteger(value.fontSize, 10, 48, defaultMineruSettings.noteStyle.fontSize),
    bold: typeof value.bold === 'boolean' ? value.bold : defaultMineruSettings.noteStyle.bold,
    italic: typeof value.italic === 'boolean' ? value.italic : defaultMineruSettings.noteStyle.italic,
    highlight: typeof value.highlight === 'string' ? value.highlight : defaultMineruSettings.noteStyle.highlight
  }
}

function sanitizeMineruResultsByPaperPath(input: unknown): Record<string, MineruParseResult> {
  if (!isRecord(input)) {
    return {}
  }

  const entries = Object.entries(input)
    .filter(([filePath]) => isPdfPath(filePath))
    .map(([filePath, value]) => [filePath, sanitizeMineruParseResult(value)] as const)
    .filter((entry): entry is readonly [string, MineruParseResult] => Boolean(entry[1]))
    .slice(0, 80)

  return Object.fromEntries(entries)
}

function sanitizeMineruParseResult(input: unknown): MineruParseResult | undefined {
  if (!isRecord(input) || !Array.isArray(input.blocks)) {
    return undefined
  }

  const sanitizedBlocks = input.blocks
    .map(sanitizeMineruParseBlock)
    .filter((block): block is MineruParseResult['blocks'][number] => Boolean(block))
    .slice(0, 4000)
  const blocks = normalizeMineruParseResultSegments({
    title: '',
    markdown: '',
    blocks: sanitizedBlocks
  }).blocks

  if (blocks.length === 0) {
    return undefined
  }

  return {
    title: readLimitedString(input.title, 500, 'MinerU 解析'),
    markdown: readLimitedString(input.markdown, 200000, ''),
    blocks
  }
}

function sanitizeMineruParseBlock(input: unknown): MineruParseResult['blocks'][number] | undefined {
  if (!isRecord(input) || typeof input.id !== 'string' || typeof input.rawType !== 'string' || typeof input.pageNo !== 'number') {
    return undefined
  }

  return {
    id: readLimitedString(input.id, 160, ''),
    type: isMineruBlockType(input.type) ? input.type : 'paragraph',
    rawType: readLimitedString(input.rawType, 120, ''),
    pageNo: clampInteger(input.pageNo, 1, 100000, 1),
    rect: sanitizeMineruRect(input.rect),
    segments: sanitizeMineruSegments(input.segments),
    text: readOptionalLimitedString(input.text, 60000),
    headingLevel: typeof input.headingLevel === 'number' ? (clampInteger(input.headingLevel, 1, 3, 2) as 1 | 2 | 3) : undefined,
    listItems: readStringArray(input.listItems).slice(0, 200),
    tableRows: Array.isArray(input.tableRows)
      ? input.tableRows
          .filter(Array.isArray)
          .map((row) => row.map((cell) => readLimitedString(cell, 8000, '')).slice(0, 20))
          .slice(0, 200)
      : undefined,
    caption: readOptionalLimitedString(input.caption, 8000),
    footnotes: readStringArray(input.footnotes).slice(0, 50),
    imageDataUrl: readOptionalLimitedString(input.imageDataUrl, 8_000_000)
  }
}

function sanitizeMineruSegments(input: unknown): MineruParseResult['blocks'][number]['segments'] | undefined {
  if (!Array.isArray(input)) {
    return undefined
  }

  const segments = input
    .filter(isRecord)
    .map((segment) => ({
      pageNo: clampInteger(segment.pageNo, 1, 100000, 1),
      rect: sanitizeMineruRect(segment.rect)
    }))
    .filter((segment) => segment.rect.width > 0 && segment.rect.height > 0)
    .slice(0, 20)

  return segments.length > 1 ? segments : undefined
}

function sanitizeMineruRect(input: unknown): MineruParseResult['blocks'][number]['rect'] {
  if (!isRecord(input)) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    }
  }

  return {
    x: clampNumber(input.x, 0, 1, 0),
    y: clampNumber(input.y, 0, 1, 0),
    width: clampNumber(input.width, 0, 1, 0),
    height: clampNumber(input.height, 0, 1, 0)
  }
}

function sanitizeHiddenMineruOverlayByPaperPath(
  input: unknown,
  mineruResultsByPaperPath: Record<string, MineruParseResult>
): Record<string, boolean> {
  if (!isRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([filePath, hidden]) => isPdfPath(filePath) && typeof hidden === 'boolean' && Boolean(mineruResultsByPaperPath[filePath]))
      .map(([filePath, hidden]) => [filePath, hidden as boolean])
  )
}

function sanitizeInvalidatedSourceLinkKeysByPaperPath(input: unknown): Record<string, string[]> {
  if (!isRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([filePath, keys]) => isPdfPath(filePath) && Array.isArray(keys))
      .map(([filePath, keys]) => [
        filePath,
        Array.from(
          new Set(
            (keys as unknown[])
              .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
              .map((key) => key.slice(0, 500))
          )
        ).slice(0, 1000)
      ] as const)
      .filter(([, keys]) => keys.length > 0)
  )
}

function sanitizeNotesState(input: unknown, mineruResultsByPaperPath: Record<string, MineruParseResult> = {}): NotesState | undefined {
  if (!isRecord(input) || !isRecord(input.notesByPaperPath)) {
    return undefined
  }

  const notesByPaperPath = Object.fromEntries(
    Object.entries(input.notesByPaperPath)
      .filter(([filePath]) => isPdfPath(filePath))
      .map(([filePath, value]) => [
        filePath,
        migrateMineruSegmentSourceRefs(filePath, sanitizeNoteDocuments(filePath, value), mineruResultsByPaperPath[filePath])
      ] as const)
      .filter((entry): entry is readonly [string, NoteDocument[]] => entry[1].length > 0)
      .sort((left, right) => Date.parse(right[1][0]?.updatedAt ?? '') - Date.parse(left[1][0]?.updatedAt ?? ''))
      .slice(0, 80)
  )
  const selectedNoteIdsByPaperPath = sanitizeSelectedNoteIds(input.selectedNoteIdsByPaperPath, notesByPaperPath)
  const openNoteIdsByPaperPath = sanitizeOpenNoteIds(input.openNoteIdsByPaperPath, notesByPaperPath, selectedNoteIdsByPaperPath)

  return {
    notesByPaperPath,
    selectedNoteIdsByPaperPath,
    openNoteIdsByPaperPath
  }
}

function sanitizeNoteDocuments(filePath: string, input: unknown): NoteDocument[] {
  const rawNotes = Array.isArray(input) ? input : [input]

  return rawNotes
    .map((value, index) => sanitizeNoteDocument(filePath, value, index))
    .filter((note): note is NoteDocument => Boolean(note))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 20)
}

function sanitizeNoteDocument(filePath: string, input: unknown, noteIndex = 0): NoteDocument | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const id = readLimitedString(input.id, 120, `note_${hashString(filePath)}_${noteIndex}`)
  const blocks = Array.isArray(input.blocks)
    ? input.blocks
        .map((block, index) => sanitizeNoteBlock(id, block, index))
        .filter((block): block is NoteBlock => Boolean(block))
        .slice(0, 500)
    : []

  return {
    id,
    title: readLimitedString(input.title, 240, '未命名笔记'),
    template: isNoteTemplateKind(input.template) ? input.template : 'freeform',
    paperId: readOptionalLimitedString(input.paperId, 120),
    blocks: blocks.map((block, index) => ({
      ...block,
      noteId: id,
      orderIndex: index
    })),
    createdAt: readIsoLikeString(input.createdAt),
    updatedAt: readIsoLikeString(input.updatedAt)
  }
}

function migrateMineruSegmentSourceRefs(
  filePath: string,
  notes: NoteDocument[],
  mineruResult?: MineruParseResult
): NoteDocument[] {
  const segmentRefsByMineruBlockId = new Map<string, SourceRef[]>()

  for (const block of mineruResult?.blocks ?? []) {
    if (!block.segments || block.segments.length <= 1) {
      continue
    }

    segmentRefsByMineruBlockId.set(
      block.id,
      block.segments.map((segment, index) => ({
        type: 'note_block',
        paperId: `paper_${hashString(filePath)}`,
        mineruBlockId: block.id,
        sourceLinkStatus: 'valid',
        pageNo: segment.pageNo,
        rect: segment.rect,
        quote: block.text ?? block.caption,
        textHash: hashString(`${block.id}:${index}:${block.text ?? block.caption ?? ''}`)
      }))
    )
  }

  if (segmentRefsByMineruBlockId.size === 0) {
    return notes
  }

  return notes.map((note) => ({
    ...note,
    blocks: note.blocks.map((block) => {
      const mineruSourceRef = block.sourceRefs.find((sourceRef) => sourceRef.type === 'note_block' && sourceRef.mineruBlockId)
      const mineruBlockId = mineruSourceRef?.mineruBlockId
      const fallbackQuote = mineruSourceRef?.quote
      const fallbackSourceLinkStatus = mineruSourceRef?.sourceLinkStatus
      const segmentRefs = mineruBlockId ? segmentRefsByMineruBlockId.get(mineruBlockId) : undefined

      if (!segmentRefs || segmentRefs.length <= 1) {
        return block
      }

      const otherSourceRefs = block.sourceRefs.filter(
        (sourceRef) => sourceRef.type !== 'note_block' || sourceRef.mineruBlockId !== mineruBlockId
      )

      return {
        ...block,
        sourceRefs: [
          ...otherSourceRefs,
          ...segmentRefs.map((sourceRef) => ({
            ...sourceRef,
            noteBlockId: block.id,
            sourceLinkStatus: fallbackSourceLinkStatus ?? sourceRef.sourceLinkStatus,
            quote: sourceRef.quote ?? fallbackQuote
          }))
        ]
      }
    })
  }))
}

function sanitizeSelectedNoteIds(input: unknown, notesByPaperPath: Record<string, NoteDocument[]>): Record<string, string> {
  if (!isRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([filePath, noteId]) => {
        if (!isPdfPath(filePath) || typeof noteId !== 'string') {
          return false
        }

        return noteId === '' || Boolean(notesByPaperPath[filePath]?.some((note) => note.id === noteId))
      })
      .map(([filePath, noteId]) => [filePath, noteId as string])
  )
}

function sanitizeOpenNoteIds(
  input: unknown,
  notesByPaperPath: Record<string, NoteDocument[]>,
  selectedNoteIdsByPaperPath: Record<string, string>
): Record<string, string[]> {
  const restoredEntries = isRecord(input)
    ? Object.entries(input)
        .filter(([filePath, noteIds]) => isPdfPath(filePath) && Array.isArray(noteIds))
        .map(([filePath, noteIds]) => {
          const validNoteIdSet = new Set((notesByPaperPath[filePath] ?? []).map((note) => note.id))
          const restoredNoteIds = (noteIds as unknown[])
            .filter((noteId): noteId is string => typeof noteId === 'string' && validNoteIdSet.has(noteId))
            .filter((noteId, index, allNoteIds) => allNoteIds.indexOf(noteId) === index)
            .slice(0, 12)

          return [filePath, restoredNoteIds] as const
        })
    : []

  const entriesByPath = new Map(restoredEntries.filter(([, noteIds]) => noteIds.length > 0))

  Object.entries(selectedNoteIdsByPaperPath).forEach(([filePath, selectedNoteId]) => {
    if (!selectedNoteId || entriesByPath.has(filePath)) {
      return
    }

    if (notesByPaperPath[filePath]?.some((note) => note.id === selectedNoteId)) {
      entriesByPath.set(filePath, [selectedNoteId])
    }
  })

  return Object.fromEntries(entriesByPath)
}

function sanitizeAiConversationsState(input: unknown): AiConversationsState | undefined {
  if (!isRecord(input) || !isRecord(input.conversationsByPaperPath)) {
    return undefined
  }

  const conversationsByPaperPath = Object.fromEntries(
    Object.entries(input.conversationsByPaperPath)
      .filter(([filePath]) => isPdfPath(filePath))
      .map(([filePath, value]) => [filePath, sanitizeAiConversations(filePath, value)] as const)
      .filter((entry): entry is readonly [string, AiConversationState[]] => entry[1].length > 0)
      .sort((left, right) => Date.parse(right[1][0]?.updatedAt ?? '') - Date.parse(left[1][0]?.updatedAt ?? ''))
      .slice(0, 80)
  )

  return {
    conversationsByPaperPath,
    activeConversationIdsByPaperPath: sanitizeActiveAiConversationIds(
      input.activeConversationIdsByPaperPath,
      conversationsByPaperPath
    )
  }
}

function sanitizeAiConversations(filePath: string, input: unknown): AiConversationState[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((value, index) => sanitizeAiConversation(filePath, value, index))
    .filter((conversation): conversation is AiConversationState => Boolean(conversation))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 40)
}

function sanitizeAiConversation(filePath: string, input: unknown, index: number): AiConversationState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  return {
    id: readLimitedString(input.id, 140, `ai_conversation_${hashString(filePath)}_${index}`),
    paperPath: isPdfPath(readLimitedString(input.paperPath, 1200, filePath))
      ? readLimitedString(input.paperPath, 1200, filePath)
      : filePath,
    title: readLimitedString(input.title, 240, '新对话'),
    parentAnswerId: readOptionalLimitedString(input.parentAnswerId, 140),
    contextSelections: sanitizeAiContextSelections(input.contextSelections),
    messages: sanitizeChatMessages(input.messages),
    createdAt: readIsoLikeString(input.createdAt),
    updatedAt: readIsoLikeString(input.updatedAt)
  }
}

function sanitizeAiContextSelections(input: unknown): AiContextSelectionState[] | undefined {
  if (!Array.isArray(input)) {
    return undefined
  }

  const selections = input
    .map((value): AiContextSelectionState | undefined => {
      if (!isRecord(value)) {
        return undefined
      }

      if (value.kind === 'paper') {
        return { kind: 'paper' }
      }

      if (value.kind === 'page') {
        const pageNumber = clampInteger(value.pageNumber, 1, 100000, -1)
        return pageNumber > 0 ? { kind: 'page', pageNumber } : undefined
      }

      if (value.kind === 'note') {
        const noteId = readLimitedString(value.noteId, 140, '')
        return noteId ? { kind: 'note', noteId } : undefined
      }

      if (value.kind === 'mineru_block') {
        const blockId = readLimitedString(value.blockId, 140, '')
        const pageNumber = clampInteger(value.pageNumber, 1, 100000, -1)
        const blockType = readLimitedString(value.blockType, 40, '')
        const label = readLimitedString(value.label, 240, '')
        const text = readLimitedString(value.text, 12000, '')
        const imageDataUrl = readOptionalLimitedString(value.imageDataUrl, 8_000_000)
        return blockId && pageNumber > 0 && label && text
          ? {
              kind: 'mineru_block',
              blockId,
              pageNumber,
              blockType,
              label,
              text,
              imageDataUrl
            }
          : undefined
      }

      return undefined
    })
    .filter((selection): selection is AiContextSelectionState => Boolean(selection))
    .slice(0, 20)

  return selections.length > 0 ? selections : undefined
}

function sanitizeChatMessages(input: unknown): ChatMessageState[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((message): ChatMessageState | undefined => {
      if (!isRecord(message)) {
        return undefined
      }

      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : undefined
      if (!role) {
        return undefined
      }

      return {
        id: readLimitedString(message.id, 140, `message_${Date.now()}`),
        role,
        content: readLimitedString(message.content, 60000, ''),
        status: message.status === 'sending' || message.status === 'error' ? message.status : undefined,
        responseId: readOptionalLimitedString(message.responseId, 140),
        durationMs: typeof message.durationMs === 'number' && Number.isFinite(message.durationMs) ? message.durationMs : undefined,
        attachmentNames: readStringArray(message.attachmentNames).slice(0, 20),
        attachments: sanitizeAiImageAttachments(message.attachments)
      }
    })
    .filter((message): message is ChatMessageState => Boolean(message))
    .slice(-80)
}

function sanitizeAiImageAttachments(input: unknown): AiImageAttachmentState[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(sanitizeAiImageAttachment)
    .filter((attachment): attachment is AiImageAttachmentState => Boolean(attachment))
    .slice(0, 8)
}

function sanitizeAiImageAttachment(input: unknown): AiImageAttachmentState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const mimeType = isImageMimeType(input.mimeType) ? input.mimeType : undefined
  const dataUrl = readLimitedString(input.dataUrl, 8_000_000, '')
  if (!mimeType || !dataUrl.startsWith(`data:${mimeType};base64,`)) {
    return undefined
  }

  return {
    id: readLimitedString(input.id, 140, `image_${Date.now()}`),
    kind: 'image',
    name: readLimitedString(input.name, 240, '截图.png'),
    mimeType,
    dataUrl,
    width: clampInteger(input.width, 1, 20000, 1),
    height: clampInteger(input.height, 1, 20000, 1),
    size: clampInteger(input.size, 0, 20_000_000, getDataUrlByteLength(dataUrl))
  }
}

function isImageMimeType(input: unknown): input is AiImageAttachmentState['mimeType'] {
  return input === 'image/png' || input === 'image/jpeg' || input === 'image/webp'
}

function sanitizeActiveAiConversationIds(
  input: unknown,
  conversationsByPaperPath: Record<string, AiConversationState[]>
): Record<string, string> {
  if (!isRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input).filter(([filePath, conversationId]) => {
      return (
        isPdfPath(filePath) &&
        typeof conversationId === 'string' &&
        Boolean(conversationsByPaperPath[filePath]?.some((conversation) => conversation.id === conversationId))
      )
    }) as Array<[string, string]>
  )
}

function sanitizeFavoritesState(
  input: unknown,
  notes: NotesState | undefined,
  aiConversations: AiConversationsState | undefined
): FavoritesState | undefined {
  if (!isRecord(input) || !isRecord(input.items)) {
    return undefined
  }

  const items = Object.values(input.items)
    .map(sanitizeFavoriteItem)
    .filter((item): item is FavoriteItemState => Boolean(item))
    .filter((item) => isFavoriteItemAvailable(item, notes, aiConversations))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 200)

  return {
    items: Object.fromEntries(items.map((item) => [getFavoriteKey(item), item]))
  }
}

function sanitizeFavoriteItem(input: unknown): FavoriteItemState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const paperPath = readLimitedString(input.paperPath, 1200, '')
  if (!isPdfPath(paperPath)) {
    return undefined
  }

  const createdAt = readIsoLikeString(input.createdAt)

  if (input.type === 'paper') {
    return {
      type: 'paper',
      paperPath,
      createdAt
    }
  }

  if (input.type === 'note') {
    return {
      type: 'note',
      paperPath,
      noteId: readLimitedString(input.noteId, 140, ''),
      createdAt
    }
  }

  if (input.type === 'ai_answer') {
    return {
      type: 'ai_answer',
      paperPath,
      conversationId: readLimitedString(input.conversationId, 140, ''),
      messageId: readLimitedString(input.messageId, 140, ''),
      createdAt
    }
  }

  return undefined
}

function isFavoriteItemAvailable(
  item: FavoriteItemState,
  notes: NotesState | undefined,
  aiConversations: AiConversationsState | undefined
): boolean {
  if (item.type === 'paper') {
    return true
  }

  if (item.type === 'note') {
    return Boolean(notes?.notesByPaperPath[item.paperPath]?.some((note) => note.id === item.noteId))
  }

  const conversation = aiConversations?.conversationsByPaperPath[item.paperPath]?.find(
    (currentConversation) => currentConversation.id === item.conversationId
  )
  return Boolean(conversation?.messages.some((message) => message.id === item.messageId && message.role === 'assistant'))
}

function getFavoriteKey(target: FavoriteTargetState): string {
  if (target.type === 'paper') {
    return `paper:${target.paperPath}`
  }

  if (target.type === 'note') {
    return `note:${target.paperPath}:${target.noteId}`
  }

  return `ai_answer:${target.paperPath}:${target.conversationId}:${target.messageId}`
}

function sanitizeNoteBlock(noteId: string, input: unknown, index: number): NoteBlock | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const type = isNoteBlockType(input.type) ? input.type : 'paragraph'

  return {
    id: readLimitedString(input.id, 140, `note_block_${Date.now()}_${index}`),
    noteId,
    parentId: readOptionalLimitedString(input.parentId, 140),
    type,
    orderIndex: clampInteger(input.orderIndex, 0, 100000, index),
    content: sanitizeNoteBlockContent(type, input.content),
    style: normalizeNoteBlockStyle(input.style),
    markdown: readLimitedString(input.markdown, 30000, ''),
    sourceRefs: sanitizeSourceRefs(input.sourceRefs),
    createdAt: readIsoLikeString(input.createdAt),
    updatedAt: readIsoLikeString(input.updatedAt)
  }
}

function sanitizeNoteBlockContent(type: NoteBlockType, input: unknown): NoteBlockContent {
  const data = isRecord(input) ? input : {}

  if (type === 'heading') {
    return {
      text: readLimitedString(data.text, 5000, ''),
      level: clampInteger(data.level, 1, 3, 2) as 1 | 2 | 3
    }
  }

  if (type === 'todo') {
    return {
      text: readLimitedString(data.text, 5000, ''),
      checked: typeof data.checked === 'boolean' ? data.checked : false
    }
  }

  if (type === 'formula') {
    return {
      latex: readLimitedString(data.latex, 10000, '')
    }
  }

  if (type === 'table') {
    const rows = Array.isArray(data.rows)
      ? data.rows
          .filter(Array.isArray)
          .map((row) => row.map((cell) => readLimitedString(cell, 8000, '')).slice(0, 20))
          .slice(0, 80)
      : [['', '']]

    return {
      rows
    }
  }

  if (type === 'image' || type === 'screenshot') {
    return {
      assetId: readOptionalLimitedString(data.assetId, 140),
      src: readOptionalLimitedString(data.src, 8_000_000),
      alt: readOptionalLimitedString(data.alt, 500),
      caption: readOptionalLimitedString(data.caption, 5000),
      width: typeof data.width === 'number' && Number.isFinite(data.width) ? data.width : undefined,
      height: typeof data.height === 'number' && Number.isFinite(data.height) ? data.height : undefined,
      displayWidth: typeof data.displayWidth === 'number' && Number.isFinite(data.displayWidth)
        ? clampNumber(data.displayWidth, 40, 1200, data.displayWidth)
        : undefined,
      displayHeight: typeof data.displayHeight === 'number' && Number.isFinite(data.displayHeight)
        ? clampNumber(data.displayHeight, 40, 1200, data.displayHeight)
        : undefined,
      wrapStyle: isNoteMediaWrapStyle(data.wrapStyle) ? data.wrapStyle : undefined,
      crop: sanitizeNoteMediaCrop(data.crop),
      pageNo: typeof data.pageNo === 'number' && Number.isFinite(data.pageNo) ? data.pageNo : undefined,
      segmentIndex: typeof data.segmentIndex === 'number' && Number.isFinite(data.segmentIndex) ? data.segmentIndex : undefined
    }
  }

  if (type === 'reference') {
    return {
      label: readLimitedString(data.label, 5000, ''),
      title: readOptionalLimitedString(data.title, 5000),
      authors: readStringArray(data.authors).slice(0, 20),
      year: typeof data.year === 'number' && Number.isInteger(data.year) ? data.year : undefined
    }
  }

  return {
    text: readLimitedString(data.text, 30000, '')
  }
}

function sanitizeSourceRefs(input: unknown): SourceRef[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item): SourceRef | undefined => {
      if (!isRecord(item) || !isSourceRefType(item.type)) {
        return undefined
      }

      return {
        type: item.type,
        paperId: readOptionalLimitedString(item.paperId, 140),
        noteId: readOptionalLimitedString(item.noteId, 140),
        noteBlockId: readOptionalLimitedString(item.noteBlockId, 140),
        mineruBlockId: readOptionalLimitedString(item.mineruBlockId, 140),
        sourceLinkStatus: item.sourceLinkStatus === 'invalidated' ? 'invalidated' : item.sourceLinkStatus === 'valid' ? 'valid' : undefined,
        pageNo: typeof item.pageNo === 'number' && Number.isFinite(item.pageNo) ? item.pageNo : undefined,
        annotationId: readOptionalLimitedString(item.annotationId, 140),
        messageId: readOptionalLimitedString(item.messageId, 140),
        referenceId: readOptionalLimitedString(item.referenceId, 140),
        zoteroItemKey: readOptionalLimitedString(item.zoteroItemKey, 140),
        rect: sanitizeSourceRect(item.rect),
        textHash: readOptionalLimitedString(item.textHash, 140),
        quote: readOptionalLimitedString(item.quote, 4000)
      }
    })
    .filter((ref): ref is SourceRef => Boolean(ref))
    .slice(0, 40)
}

function isNoteMediaWrapStyle(input: unknown): input is 'break' | 'center' | 'float-left' | 'float-right' {
  return input === 'break' || input === 'center' || input === 'float-left' || input === 'float-right'
}

function sanitizeNoteMediaCrop(input: unknown): { x: number; y: number; width: number; height: number } | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const width = clampNumber(input.width, 0.05, 1, 1)
  const height = clampNumber(input.height, 0.05, 1, 1)
  const x = clampNumber(input.x, 0, 1 - width, 0)
  const y = clampNumber(input.y, 0, 1 - height, 0)

  if (x === 0 && y === 0 && width === 1 && height === 1) {
    return undefined
  }

  return { x, y, width, height }
}

function sanitizeSourceRect(input: unknown): SourceRef['rect'] | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  return {
    x: clampNumber(input.x, 0, Number.MAX_SAFE_INTEGER, 0),
    y: clampNumber(input.y, 0, Number.MAX_SAFE_INTEGER, 0),
    width: clampNumber(input.width, 0, Number.MAX_SAFE_INTEGER, 0),
    height: clampNumber(input.height, 0, Number.MAX_SAFE_INTEGER, 0)
  }
}

function sanitizeDockLayout(input: unknown): DockLayoutNode | undefined {
  const node = sanitizeDockLayoutNode(input)
  if (!node) {
    return undefined
  }

  const panelIds = flattenDockLayout(node)
  const uniquePanelIds = new Set(panelIds)
  if (
    panelIds.length !== allDockPanelIds.length ||
    uniquePanelIds.size !== allDockPanelIds.length ||
    !allDockPanelIds.every((id) => uniquePanelIds.has(id))
  ) {
    return undefined
  }

  return node
}

function sanitizeDockLayoutNode(input: unknown): DockLayoutNode | undefined {
  if (isDockPanelId(input)) {
    return input
  }

  if (!isRecord(input)) {
    return undefined
  }

  const direction = isWorkbenchLayoutDirection(input.direction) ? input.direction : undefined
  const children = Array.isArray(input.children)
    ? input.children.map((child) => sanitizeDockLayoutNode(child)).filter((child): child is DockLayoutNode => Boolean(child))
    : []

  if (!direction || children.length < 2) {
    return undefined
  }

  const node: DockSplitNode = {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : `split_${Date.now()}`,
    direction,
    children
  }

  return node
}

function sanitizePdfViewStates(input: unknown): Record<string, PdfViewState> {
  if (!isRecord(input)) {
    return {}
  }

  const entries = Object.entries(input)
    .filter(([filePath]) => isPdfPath(filePath))
    .map(([filePath, value]) => [filePath, sanitizePdfViewState(value)] as const)
    .filter((entry): entry is readonly [string, PdfViewState] => Boolean(entry[1]))
    .sort((left, right) => Date.parse(right[1].updatedAt ?? '') - Date.parse(left[1].updatedAt ?? ''))
    .slice(0, 80)

  return Object.fromEntries(entries)
}

function sanitizePdfViewState(input: unknown): PdfViewState | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  return {
    pageNumber: clampInteger(input.pageNumber, 1, 100000, 1),
    pageCount: clampInteger(input.pageCount, 0, 100000, 0),
    scale: clampNumber(input.scale, 0.5, 3, 1),
    scrollLeft: clampNumber(input.scrollLeft, 0, Number.MAX_SAFE_INTEGER, 0),
    scrollTop: clampNumber(input.scrollTop, 0, Number.MAX_SAFE_INTEGER, 0),
    readingSeconds: clampInteger(input.readingSeconds, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : undefined
  }
}

function getDataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readStringArray(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)]
}

function readNonEmptyString(input: unknown, fallback: string): string {
  return typeof input === 'string' && input.trim() ? input.trim() : fallback
}

function readLimitedString(input: unknown, maxLength: number, fallback: string): string {
  if (typeof input !== 'string') {
    return fallback
  }

  const trimmed = input.trim()
  return (trimmed || fallback).slice(0, maxLength)
}

function readOptionalLimitedString(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string') {
    return undefined
  }

  const trimmed = input.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function readIsoLikeString(input: unknown): string {
  return typeof input === 'string' && Number.isFinite(Date.parse(input)) ? input : new Date().toISOString()
}

function clampInteger(input: unknown, min: number, max: number, fallback: number): number {
  return typeof input === 'number' && Number.isInteger(input) ? Math.min(max, Math.max(min, input)) : fallback
}

function clampNumber(input: unknown, min: number, max: number, fallback: number): number {
  return typeof input === 'number' && Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallback
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object'
}

function isPdfPath(input: string): boolean {
  return extname(input).toLowerCase() === '.pdf'
}

function isPrimaryView(input: unknown): input is PrimaryView {
  return input === 'library' || input === 'favorites' || input === 'note' || input === 'graph'
}

function isEditorTab(input: unknown): input is EditorTab {
  return input === 'pdf' || input === 'graph' || input === 'mindmap' || input === 'profile'
}

function isNoteEditorEngine(input: unknown): input is NoteEditorEngine {
  return input === 'legacy' || input === 'milkdown'
}

function isLibrarySortField(input: unknown): input is LibrarySortField {
  return input === 'recent' || input === 'readingTime' || input === 'progress' || input === 'date' || input === 'name' || input === 'size'
}

function isLibrarySortDirection(input: unknown): input is LibrarySortDirection {
  return input === 'asc' || input === 'desc'
}

function isDockPanelId(input: unknown): input is DockPanelId {
  return input === 'library' || input === 'editor' || input === 'note' || input === 'ai'
}

function isClosableDockPanelId(input: unknown): input is ClosableDockPanelId {
  return input === 'editor' || input === 'note' || input === 'ai'
}

function filterClosableDockPanelIds(values: string[]): ClosableDockPanelId[] {
  return values
    .filter(isClosableDockPanelId)
    .filter((panelId, index, panelIds) => panelIds.indexOf(panelId) === index)
}

function isWorkbenchLayoutDirection(input: unknown): input is WorkbenchLayoutDirection {
  return input === 'horizontal' || input === 'vertical'
}

function isReasoningEffort(input: unknown): input is AiSettingsState['reasoningEffort'] {
  return input === 'none' || input === 'minimal' || input === 'low' || input === 'medium' || input === 'high' || input === 'xhigh'
}

function isMineruModelVersion(input: unknown): input is MineruModelVersion {
  return input === 'pipeline' || input === 'vlm' || input === 'MinerU-HTML'
}

function isMineruBlockType(input: unknown): input is MineruParseResult['blocks'][number]['type'] {
  return input === 'heading' || input === 'paragraph' || input === 'list' || input === 'equation' || input === 'image' || input === 'chart' || input === 'table' || input === 'footnote'
}

function isNoteBlockType(input: unknown): input is NoteBlockType {
  return typeof input === 'string' && noteBlockTypeValues.includes(input as NoteBlockType)
}

function isNoteTemplateKind(input: unknown): input is NoteTemplateKind {
  return typeof input === 'string' && noteTemplateKindValues.includes(input as NoteTemplateKind)
}

function isSourceRefType(input: unknown): input is SourceRefType {
  return typeof input === 'string' && sourceRefTypeValues.includes(input as SourceRefType)
}

function flattenDockLayout(node: DockLayoutNode): DockPanelId[] {
  if (isDockPanelId(node)) {
    return [node]
  }

  return node.children.flatMap((child) => flattenDockLayout(child))
}

function hashString(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(16)
}
