import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, type NativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { promisify } from 'node:util'
import { lookupDictionary, normalizeSelectionText, resolveSelectionIntent } from '@thesis-agent/dictionary'
import { noteTemplateKinds, normalizeNoteBlockStyle, noteToExportHtml, noteToMarkdown } from '@thesis-agent/notes'
import type { NoteBlock, NoteBlockContent, NoteBlockType, NoteDocument, NoteTemplateKind } from '@thesis-agent/notes'
import { exportDeckToPptx } from '@thesis-agent/ppt'
import type {
  BatchTranslationItem,
  BatchTranslationRequest,
  BatchTranslationResult,
  DeckLanguage,
  DeckSpec,
  CodeRepositoryPreparationResult,
  MineruModelVersion,
  MineruParseResult,
  PptExportResult,
  SelectionExplainAiSettings,
  SelectionExplainRequest,
  SelectionExplainResult,
  SlideAssetKind,
  SlideElementSpec,
  SlideKind,
  SourceRef,
  SourceRefType
} from '@thesis-agent/shared'
import {
  clearAllPersistedMineruResults,
  clearPersistedMineruResult,
  hasPersistedMineruResult,
  readPersistedMineruResult,
  readPersistedAppState as readPersistedAppStateFromModule,
  writePersistedMineruResult,
  writePersistedAppState as writePersistedAppStateFromModule
} from './appState'
import { prepareCodeRepository } from './codeAnalysis'
import { parsePdfWithMineru, type ParseMineruInput } from './mineru'
import advancedRulesMarkdownSource from './prompts/advanced-rules.md?raw'
import selectionTranslationPromptSource from './prompts/selection-translation.md?raw'

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)
if (isDevelopment) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
const execFileAsync = promisify(execFile)
const selectionExplainCacheMaxSize = 80
const selectionTranslationPromptVersion = 'selection-translation-v1'
const selectionExplainCache = new Map<string, SelectionExplainResult>()

type AiProviderTestInput = {
  providerId: string
  baseUrl: string
  wireApi: 'responses'
  model: string
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  apiKey?: string
  prompt: string
}

type AiChatInput = Omit<AiProviderTestInput, 'prompt'> & {
  systemPrompt: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  prompt: string
  attachments: AiImageAttachmentState[]
  maxOutputTokens?: number
}

type AiProviderTestResult = {
  ok: boolean
  status: number
  message: string
  outputText?: string
  responseId?: string
}
type AiResponsesRequest = {
  endpoint: string
  headers: Record<string, string>
  body: Record<string, unknown>
  successMessage: string
  maxAttempts?: number
}

type AiChatCompletionsRequest = {
  endpoint: string
  headers: Record<string, string>
  body: Record<string, unknown>
  successMessage: string
  maxAttempts?: number
}

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<
        | {
            type: 'text'
            text: string
          }
        | {
            type: 'image_url'
            image_url: {
              url: string
              detail: 'auto'
            }
          }
      >
}

type PrimaryView = 'library' | 'favorites' | 'note' | 'graph'
type EditorTab = 'pdf' | 'graph' | 'mindmap' | 'profile'
type DockPanelId = 'library' | 'editor' | 'note' | 'ai'
type ClosableDockPanelId = Exclude<DockPanelId, 'library'>
type WorkbenchLayoutDirection = 'horizontal' | 'vertical'
type DockLayoutNode = DockPanelId | DockSplitNode
type DockSplitNode = {
  id: string
  direction: WorkbenchLayoutDirection
  children: DockLayoutNode[]
}
type PdfViewState = {
  pageNumber: number
  pageCount?: number
  scale: number
  scrollLeft: number
  scrollTop: number
  readingSeconds?: number
  updatedAt?: string
}
type PdfPageBitmapInput = {
  filePath: string
  pageNumber: number
  scale: number
  outputScale: number
}
type PdfPageBitmapResult = {
  imageDataUrl: string
  dpi: number
}
type PdfLayoutRect = {
  x: number
  y: number
  width: number
  height: number
}
type PdfLayoutSegmentInput = {
  filePath: string
  maxPages: number
  maxSegments: number
}
type PdfLayoutSegment = {
  pageNo: number
  segmentIndex: number
  rect: PdfLayoutRect
  textLength: number
  parser: 'poppler-bbox-layout'
}
type PdfLayoutSegmentsResult = {
  parser: 'poppler-bbox-layout'
  segments: PdfLayoutSegment[]
}
type NoteExportFormat = 'word' | 'pdf' | 'markdown'
type NoteExportInput = {
  format: NoteExportFormat
  note: NoteDocument
  markdown?: string
}
type NoteExportResult = {
  canceled: boolean
  format: NoteExportFormat
  filePath?: string
}
type PptDeckExportInput = {
  deck: DeckSpec
  suggestedFileName?: string
  preferredFilePath?: string
}
type PptDeckExportResult = PptExportResult & {
  canceled: boolean
  filePath?: string
}
type AppCaptureRect = {
  x: number
  y: number
  width: number
  height: number
}
type ClipboardImageResult = {
  name: string
  mimeType: 'image/png'
  dataUrl: string
  width: number
  height: number
  size: number
}
type PopplerLayoutBlock = {
  id: number
  pageNo: number
  pageWidth: number
  pageHeight: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  textLength: number
  wordCount: number
}
type PopplerLayoutGroup = Omit<PopplerLayoutBlock, 'id' | 'wordCount'> & {
  blockIds: number[]
}
type AiSettingsState = {
  providerId: string
  baseUrl: string
  model: string
  reasoningEffort: AiProviderTestInput['reasoningEffort']
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  systemPrompt: string
  apiKey: string
}
type MineruSettingsState = {
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
type ChatMessageState = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'sending' | 'error'
  responseId?: string
  durationMs?: number
  attachmentNames?: string[]
  attachments?: AiImageAttachmentState[]
}
type AiImageAttachmentState = {
  id: string
  kind: 'image'
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUrl: string
  width: number
  height: number
  size: number
}
type AiConversationState = {
  id: string
  paperPath: string
  title: string
  parentAnswerId?: string
  contextSelections?: AiContextSelectionState[]
  messages: ChatMessageState[]
  createdAt: string
  updatedAt: string
}

type AiContextSelectionState =
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
type WorkbenchState = {
  activeView: PrimaryView
  activeEditor: EditorTab
  openPdfPaths: string[]
  selectedPdfPath: string
  pdfDisplayNamesByPath: Record<string, string>
  isAiConfigOpen: boolean
  isAiHistoryOpen: boolean
  isPrimarySidebarCollapsed: boolean
  dockLayout: DockLayoutNode
  hiddenDockPanels: ClosableDockPanelId[]
  pdfViewStates: Record<string, PdfViewState>
}
type NotesState = {
  notesByPaperPath: Record<string, NoteDocument[]>
  selectedNoteIdsByPaperPath: Record<string, string>
  openNoteIdsByPaperPath: Record<string, string[]>
}
type AiConversationsState = {
  conversationsByPaperPath: Record<string, AiConversationState[]>
  activeConversationIdsByPaperPath: Record<string, string>
}
type FavoriteTargetState =
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
type FavoriteItemState = FavoriteTargetState & {
  createdAt: string
}
type FavoritesState = {
  items: Record<string, FavoriteItemState>
}
type PersistedAppState = {
  version: 1
  updatedAt: string
  workbench?: WorkbenchState
  aiSettings?: AiSettingsState
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
const advancedRulesMarkdown = advancedRulesMarkdownSource.trim()
const defaultAiSettings: AiSettingsState = {
  providerId: 'my_codex',
  baseUrl: 'https://geekspace.cloud/v1',
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh',
  disableResponseStorage: true,
  requiresOpenAiAuth: true,
  systemPrompt: defaultSystemPrompt,
  apiKey: ''
}
const defaultMineruSettings: MineruSettingsState = {
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
const defaultDockLayout: DockSplitNode = {
  id: 'root',
  direction: 'horizontal',
  children: ['library', 'editor', 'note', 'ai']
}
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
const deckLanguageValues: DeckLanguage[] = ['zh-CN', 'en-US']
const slideKindValues: SlideKind[] = [
  'cover',
  'agenda',
  'section',
  'bullet',
  'two-column',
  'figure',
  'table',
  'quote',
  'comparison',
  'timeline',
  'references',
  'appendix'
]
const slideAssetKindValues: SlideAssetKind[] = ['image', 'screenshot', 'formula-render', 'diagram-render']
const noteTemplateKindValues: NoteTemplateKind[] = [...noteTemplateKinds]
let stateWriteQueue: Promise<void> = Promise.resolve()

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'Inspiration',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#fbfcfd',
      symbolColor: '#1f252b',
      height: 32
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#181a1f' : '#f6f7f8',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app-state:read', async (): Promise<PersistedAppState> =>
    readPersistedAppStateFromModule(parseJsonObject, isNodeError)
  )

  ipcMain.handle('app-state:write', async (_event, input: unknown): Promise<PersistedAppState> => {
    return writePersistedAppStateFromModule(input)
  })

  ipcMain.handle('dialog:open-pdf', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open paper PDF',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'PDF',
          extensions: ['pdf']
        }
      ]
    })

    return {
      canceled: result.canceled,
      filePaths: result.filePaths
    }
  })

  ipcMain.handle('pdf:read-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || extname(filePath).toLowerCase() !== '.pdf') {
      throw new Error('Only PDF files can be opened.')
    }

    const buffer = await readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })

  ipcMain.handle('pdf:get-file-info', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || extname(filePath).toLowerCase() !== '.pdf') {
      throw new Error('Only PDF files are supported.')
    }

    const fileStat = await stat(filePath)

    return {
      size: fileStat.size,
      modifiedAt: Number.isFinite(fileStat.mtimeMs) ? fileStat.mtime.toISOString() : undefined
    }
  })

  ipcMain.handle('pdf:render-page-bitmap', async (_event, input: unknown): Promise<PdfPageBitmapResult> => {
    return renderPdfPageBitmap(parsePdfPageBitmapInput(input))
  })

  ipcMain.handle('pdf:extract-layout-segments', async (_event, input: unknown): Promise<PdfLayoutSegmentsResult> => {
    return extractPdfLayoutSegments(parsePdfLayoutSegmentInput(input))
  })

  ipcMain.handle('screenshot:capture-app-region', async (event, input: unknown): Promise<ClipboardImageResult> => {
    const image = await event.sender.capturePage(parseAppCaptureRect(input))
    if (image.isEmpty()) {
      throw new Error('截图区域为空，请重新选择截图范围。')
    }

    clipboard.writeImage(image)
    return serializeClipboardImage(image, 'inspiration-screenshot')
  })

  ipcMain.handle('clipboard:read-image', async (): Promise<ClipboardImageResult | null> => {
    const image = clipboard.readImage()
    return image.isEmpty() ? null : serializeClipboardImage(image, 'clipboard-image')
  })

  ipcMain.handle('note:export', async (_event, input: unknown): Promise<NoteExportResult> => {
    return exportNoteDocument(parseNoteExportInput(input))
  })

  ipcMain.handle('ppt:export-deck', async (_event, input: unknown): Promise<PptDeckExportResult> => {
    return exportPptDeck(parsePptDeckExportInput(input))
  })

  ipcMain.handle('mineru:parse-pdf', async (_event, input: unknown): Promise<MineruParseResult> => {
    const parsedInput = parseMineruParseInput(input)
    const result = await parsePdfWithMineru(parsedInput)
    const persistedResult = await writePersistedMineruResult(parsedInput.filePath, result)
    return persistedResult ?? result
  })

  ipcMain.handle('mineru:read-cached-result', async (_event, filePath: unknown): Promise<MineruParseResult | null> => {
    if (typeof filePath !== 'string') {
      return null
    }

    return readPersistedMineruResult(filePath, parseJsonObject, isNodeError)
  })

  ipcMain.handle('mineru:has-cached-result', async (_event, filePath: unknown): Promise<boolean> => {
    if (typeof filePath !== 'string') {
      return false
    }

    return hasPersistedMineruResult(filePath)
  })

  ipcMain.handle('mineru:clear-cached-result', async (_event, filePath: unknown): Promise<boolean> => {
    if (typeof filePath !== 'string') {
      return false
    }

    return clearPersistedMineruResult(filePath)
  })

  ipcMain.handle('mineru:clear-all-cached-results', async (): Promise<number> => {
    return clearAllPersistedMineruResults()
  })

  ipcMain.handle('code-analysis:prepare-repository', async (_event, input: unknown): Promise<CodeRepositoryPreparationResult> => {
    return prepareCodeRepository(input)
  })

  ipcMain.handle('selection:explain', async (_event, input: unknown): Promise<SelectionExplainResult> => {
    return explainSelection(input)
  })

  ipcMain.handle('translation:batch', async (_event, input: unknown): Promise<BatchTranslationResult> => {
    return translateBatch(input)
  })

  ipcMain.handle('ai:test-provider', async (_event, input: unknown): Promise<AiProviderTestResult> => {
    const provider = parseAiProviderTestInput(input)
    const apiKey = provider.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim()

    if (provider.requiresOpenAiAuth && !apiKey) {
      return {
        ok: false,
        status: 0,
        message: 'API key is required. Paste a key in the AI panel or set OPENAI_API_KEY.'
      }
    }

    const endpoint = joinApiUrl(provider.baseUrl, 'responses')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (provider.requiresOpenAiAuth && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    return postAiResponsesWithChatFallback(
      {
        endpoint,
        headers,
        successMessage: 'Provider test succeeded.',
        body: {
          model: provider.model,
          input: provider.prompt,
          reasoning: {
            effort: provider.reasoningEffort
          },
          store: !provider.disableResponseStorage,
          max_output_tokens: 256
        }
      },
      {
        endpoint: joinApiUrl(provider.baseUrl, 'chat/completions'),
        headers,
        successMessage: 'Provider test succeeded.',
        body: {
          model: provider.model,
          messages: buildChatCompletionMessages('', [], provider.prompt),
          max_tokens: 256,
          stream: false
        }
      }
    )
  })

  ipcMain.handle('ai:send-message', async (_event, input: unknown): Promise<AiProviderTestResult> => {
    const chat = parseAiChatInput(input)
    const apiKey = chat.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim()
    const maxOutputTokens = chat.maxOutputTokens ?? 2048

    if (chat.requiresOpenAiAuth && !apiKey) {
      return {
        ok: false,
        status: 0,
        message: 'API key is required. Paste a key in the AI panel or set OPENAI_API_KEY.'
      }
    }

    const endpoint = joinApiUrl(chat.baseUrl, 'responses')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (chat.requiresOpenAiAuth && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    return postAiResponsesWithChatFallback(
      {
        endpoint,
        headers,
        successMessage: 'AI response received.',
        body: {
          model: chat.model,
          instructions: buildEffectiveSystemPrompt(chat.systemPrompt),
          input: buildConversationInput(chat.messages, chat.prompt, chat.attachments),
          reasoning: {
            effort: chat.reasoningEffort
          },
          store: !chat.disableResponseStorage,
          max_output_tokens: maxOutputTokens
        }
      },
      {
        endpoint: joinApiUrl(chat.baseUrl, 'chat/completions'),
        headers,
        successMessage: 'AI response received.',
        body: {
          model: chat.model,
          messages: buildChatCompletionMessages(
            buildEffectiveSystemPrompt(chat.systemPrompt),
            chat.messages,
            chat.prompt,
            chat.attachments
          ),
          max_tokens: maxOutputTokens,
          stream: false
        }
      }
    )
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function parseAiProviderTestInput(input: unknown): AiProviderTestInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid AI provider test input.')
  }

  const data = input as Partial<AiProviderTestInput>
  const baseUrl = requireString(data.baseUrl, 'baseUrl')
  const model = requireString(data.model, 'model')
  const providerId = requireString(data.providerId, 'providerId')
  const prompt = requireString(data.prompt, 'prompt')

  if (data.wireApi !== 'responses') {
    throw new Error('Only Responses API wire mode is supported in this test connector.')
  }

  const reasoningEffort = data.reasoningEffort ?? 'medium'
  if (!['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) {
    throw new Error('Invalid reasoning effort.')
  }

  return {
    providerId,
    baseUrl,
    wireApi: 'responses',
    model,
    reasoningEffort,
    disableResponseStorage: data.disableResponseStorage ?? true,
    requiresOpenAiAuth: data.requiresOpenAiAuth ?? true,
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : undefined,
    prompt
  }
}

async function explainSelection(input: unknown): Promise<SelectionExplainResult> {
  const request = parseSelectionExplainInput(input)
  const normalizedText = normalizeSelectionText(request.text)
  const intent = resolveSelectionIntent(normalizedText)
  const cacheKey = createSelectionExplainCacheKey(request, normalizedText)
  const cachedResult = selectionExplainCache.get(cacheKey)
  const shouldUseDictionary = request.dictionaryEnabled !== false

  if (cachedResult) {
    return {
      ...cachedResult,
      cached: true
    }
  }

  if (intent.route === 'dictionary' && shouldUseDictionary) {
    const dictionary = lookupDictionary(normalizedText)
    if (dictionary) {
      return rememberSelectionExplainResult(cacheKey, {
        route: 'dictionary',
        intent,
        normalizedText,
        dictionary,
        cached: false
      })
    }

    const translatedFallback = await translateSelectionWithAi(request, normalizedText)
    if (translatedFallback) {
      return rememberSelectionExplainResult(cacheKey, {
        route: 'fallback',
        intent,
        normalizedText,
        translation: translatedFallback,
        fallbackReason: '本地词典未命中，已自动回退到翻译。',
        cached: false
      })
    }

    return {
      route: 'fallback',
      intent,
      normalizedText,
      fallbackReason: '本地词典暂未收录该词条或短语，且当前 AI 翻译不可用。',
      cached: false
    }
  }

  const translation = await translateSelectionWithAi(request, normalizedText)
  if (translation) {
    return rememberSelectionExplainResult(cacheKey, {
      route: 'translation',
      intent,
      normalizedText,
      translation,
      cached: false
    })
  }

  return {
    route: 'fallback',
    intent,
    normalizedText,
    fallbackReason: '翻译需要先在 AI 面板配置可用模型和 API Key。',
    cached: false
  }
}

async function translateBatch(input: unknown): Promise<BatchTranslationResult> {
  const request = parseBatchTranslationInput(input)
  const ai = request.ai
  if (!ai?.baseUrl || !ai.model) {
    throw new Error('全文翻译需要先配置翻译 AI 的 Base URL 和模型。')
  }

  const apiKey = ai.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (ai.requiresOpenAiAuth && !apiKey) {
    throw new Error('全文翻译需要填写翻译 AI API Key，或在 AI 栏配置默认共享 API Key。')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (ai.requiresOpenAiAuth && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const prompt = buildBatchTranslationPrompt(request.items, request.targetLanguage || 'zh-CN')
  const maxOutputTokens = getBatchTranslationMaxOutputTokens(request.items)
  const response = await postAiResponsesWithChatFallback(
    {
      endpoint: joinApiUrl(ai.baseUrl, 'responses'),
      headers,
      successMessage: 'Batch translation received.',
      maxAttempts: 2,
      body: {
        model: ai.model,
        input: prompt,
        reasoning: {
          effort: ai.reasoningEffort
        },
        store: !ai.disableResponseStorage,
        max_output_tokens: maxOutputTokens
      }
    },
    {
      endpoint: joinApiUrl(ai.baseUrl, 'chat/completions'),
      headers,
      successMessage: 'Batch translation received.',
      maxAttempts: 2,
      body: {
        model: ai.model,
        messages: buildChatCompletionMessages('', [], prompt),
        max_tokens: maxOutputTokens,
        stream: false
      }
    }
  )

  if (!response.ok || !response.outputText?.trim()) {
    throw new Error(response.message || 'AI 未返回可用译文。')
  }

  return {
    items: parseBatchTranslationOutput(response.outputText, request.items),
    targetLanguage: request.targetLanguage || 'zh-CN',
    model: ai.model,
    rawText: response.outputText
  }
}

function parseSelectionExplainInput(input: unknown): SelectionExplainRequest {
  if (!isRecord(input)) {
    throw new Error('Invalid selection explain input.')
  }

  const text = readLimitedString(input.text, 6000, '')
  if (!text) {
    throw new Error('Missing selection text.')
  }

  return {
    text,
    paperPath: readOptionalLimitedString(input.paperPath, 2000),
    pageNo: typeof input.pageNo === 'number' && Number.isFinite(input.pageNo) ? input.pageNo : undefined,
    sourceRef: sanitizeSourceRefs([input.sourceRef])[0],
    targetLanguage: readLimitedString(input.targetLanguage, 40, 'zh-CN'),
    dictionaryEnabled: typeof input.dictionaryEnabled === 'boolean' ? input.dictionaryEnabled : true,
    ai: sanitizeSelectionExplainAiSettings(input.ai)
  }
}

function parseBatchTranslationInput(input: unknown): BatchTranslationRequest {
  if (!isRecord(input)) {
    throw new Error('Invalid batch translation input.')
  }

  const items = Array.isArray(input.items)
    ? input.items
        .slice(0, 10)
        .map((item, index): BatchTranslationItem | null => {
          if (!isRecord(item)) {
            return null
          }

          const id = readLimitedString(item.id, 140, `block-${index + 1}`)
          const text = readLimitedString(item.text, 12000, '')
          if (!id || !text) {
            return null
          }

          return {
            id,
            label: readOptionalLimitedString(item.label, 240),
            text
          }
        })
        .filter((item): item is BatchTranslationItem => Boolean(item))
    : []

  if (items.length === 0) {
    throw new Error('Missing translation blocks.')
  }

  return {
    items,
    targetLanguage: readLimitedString(input.targetLanguage, 40, 'zh-CN'),
    ai: sanitizeSelectionExplainAiSettings(input.ai)
  }
}

function sanitizeSelectionExplainAiSettings(input: unknown): SelectionExplainAiSettings | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const reasoningEffort = readLimitedString(input.reasoningEffort, 20, 'medium')
  if (!['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) {
    return undefined
  }

  return {
    providerId: readLimitedString(input.providerId, 140, ''),
    baseUrl: readLimitedString(input.baseUrl, 2000, ''),
    model: readLimitedString(input.model, 200, ''),
    reasoningEffort: reasoningEffort as SelectionExplainAiSettings['reasoningEffort'],
    disableResponseStorage: typeof input.disableResponseStorage === 'boolean' ? input.disableResponseStorage : true,
    requiresOpenAiAuth: typeof input.requiresOpenAiAuth === 'boolean' ? input.requiresOpenAiAuth : true,
    apiKey: readOptionalLimitedString(input.apiKey, 4000)
  }
}

function buildBatchTranslationPrompt(items: BatchTranslationItem[], targetLanguage: string): string {
  return [
    '你是论文阅读软件里的全文对照翻译器。',
    `目标语言：${targetLanguage}`,
    '',
    '请翻译下面 JSON 数组中的每个 MinerU block。',
    '要求：',
    '- 只翻译每个 item.text，不扩写、不解释、不总结。',
    '- 保留公式、变量名、引用标记、括号中的缩写和关键英文术语。',
    '- 保留原文里的段内换行、编号、列表语气和学术表达。',
    '- 如果文本已经是目标语言，只做必要的术语顺滑和格式整理。',
    '- 必须返回所有输入 id，id 不能改写，不能漏项。',
    '- 只输出一个 JSON 对象，不要输出 Markdown、代码围栏、标题或寒暄。',
    '',
    '输出 JSON 结构必须是：',
    '{"translations":[{"id":"原 id","targetText":"译文"}]}',
    '',
    'MinerU blocks：',
    JSON.stringify(
      items.map((item) => ({
        id: item.id,
        label: item.label,
        text: item.text
      })),
      null,
      2
    )
  ].join('\n')
}

function getBatchTranslationMaxOutputTokens(items: BatchTranslationItem[]): number {
  const totalLength = items.reduce((sum, item) => sum + item.text.length, 0)
  return Math.min(8192, Math.max(1600, Math.ceil(totalLength / 2)))
}

function parseBatchTranslationOutput(outputText: string, expectedItems: BatchTranslationItem[]): BatchTranslationResult['items'] {
  const jsonText = extractJsonTextFromAiOutput(outputText)
  if (!jsonText) {
    throw new Error('AI 没有返回可解析的批量翻译 JSON。')
  }

  const parsed: unknown = JSON.parse(jsonText)
  const rawItems = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? parsed.translations ?? parsed.items ?? parsed.blocks
      : undefined

  if (!Array.isArray(rawItems)) {
    throw new Error('AI 批量翻译 JSON 中缺少 translations 数组。')
  }

  const expectedIds = new Set(expectedItems.map((item) => item.id))
  return rawItems
    .map((item): BatchTranslationResult['items'][number] | null => {
      if (!isRecord(item)) {
        return null
      }

      const id = readLimitedString(item.id, 140, '')
      const targetText =
        readOptionalLimitedString(item.targetText, 60000) ??
        readOptionalLimitedString(item.translation, 60000) ??
        readOptionalLimitedString(item.text, 60000) ??
        ''

      if (!id || !expectedIds.has(id) || !targetText) {
        return null
      }

      return { id, targetText }
    })
    .filter((item): item is BatchTranslationResult['items'][number] => Boolean(item))
}

function extractJsonTextFromAiOutput(input: string): string | undefined {
  const trimmed = input.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(trimmed)
  const candidate = fenceMatch?.[1]?.trim() || trimmed
  const objectStart = candidate.indexOf('{')
  const arrayStart = candidate.indexOf('[')

  if (objectStart === -1 && arrayStart === -1) {
    return undefined
  }

  if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
    const arrayEnd = candidate.lastIndexOf(']')
    return arrayEnd > arrayStart ? candidate.slice(arrayStart, arrayEnd + 1) : undefined
  }

  const objectEnd = candidate.lastIndexOf('}')
  return objectEnd > objectStart ? candidate.slice(objectStart, objectEnd + 1) : undefined
}

async function translateSelectionWithAi(
  request: SelectionExplainRequest,
  normalizedText: string
): Promise<SelectionExplainResult['translation'] | undefined> {
  const ai = request.ai
  if (!ai?.baseUrl || !ai.model) {
    return undefined
  }

  const apiKey = ai.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (ai.requiresOpenAiAuth && !apiKey) {
    return undefined
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (ai.requiresOpenAiAuth && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const targetLanguage = request.targetLanguage || 'zh-CN'
  const prompt = buildSelectionTranslationPrompt(normalizedText, targetLanguage)
  const response = await postAiResponsesWithChatFallback(
    {
      endpoint: joinApiUrl(ai.baseUrl, 'responses'),
      headers,
      successMessage: 'Selection translation received.',
      maxAttempts: 2,
      body: {
        model: ai.model,
        input: prompt,
        reasoning: {
          effort: ai.reasoningEffort
        },
        store: !ai.disableResponseStorage,
        max_output_tokens: 1200
      }
    },
    {
      endpoint: joinApiUrl(ai.baseUrl, 'chat/completions'),
      headers,
      successMessage: 'Selection translation received.',
      maxAttempts: 2,
      body: {
        model: ai.model,
        messages: buildChatCompletionMessages('', [], prompt),
        max_tokens: 1200,
        stream: false
      }
    }
  )

  if (!response.ok) {
    return undefined
  }

  const targetText = (response.outputText || response.message).trim()
  if (!targetText) {
    return undefined
  }

  return {
    sourceText: normalizedText,
    targetText,
    targetLanguage,
    model: ai.model
  }
}

function buildSelectionTranslationPrompt(text: string, targetLanguage: string): string {
  return selectionTranslationPromptSource
    .replaceAll('{{targetLanguage}}', targetLanguage)
    .replaceAll('{{text}}', text)
}

function createSelectionExplainCacheKey(request: SelectionExplainRequest, normalizedText: string): string {
  const ai = request.ai
  const modelKey = ai ? `${ai.providerId}:${hashString(ai.baseUrl)}:${ai.model}` : 'no-ai'

  return [
    hashString(normalizedText),
    request.targetLanguage || 'zh-CN',
    request.dictionaryEnabled === false ? 'no-dictionary' : 'dictionary',
    modelKey,
    selectionTranslationPromptVersion
  ].join('|')
}

function rememberSelectionExplainResult(cacheKey: string, result: SelectionExplainResult): SelectionExplainResult {
  if (selectionExplainCache.size >= selectionExplainCacheMaxSize) {
    const oldestKey = selectionExplainCache.keys().next().value
    if (oldestKey) {
      selectionExplainCache.delete(oldestKey)
    }
  }

  selectionExplainCache.set(cacheKey, result)
  return result
}

function parseMineruParseInput(input: unknown): ParseMineruInput {
  if (!isRecord(input)) {
    throw new Error('MinerU 解析参数无效。')
  }

  const filePath = requireString(input.filePath, 'filePath')

  return {
    filePath,
    apiKey: requireString(input.apiKey, 'apiKey'),
    modelVersion: isMineruModelVersion(input.modelVersion) ? input.modelVersion : defaultMineruSettings.modelVersion,
    language: readNonEmptyString(input.language, defaultMineruSettings.language),
    enableTable: typeof input.enableTable === 'boolean' ? input.enableTable : defaultMineruSettings.enableTable,
    enableFormula: typeof input.enableFormula === 'boolean' ? input.enableFormula : defaultMineruSettings.enableFormula,
    isOcr: typeof input.isOcr === 'boolean' ? input.isOcr : defaultMineruSettings.isOcr,
    autoClean: typeof input.autoClean === 'boolean' ? input.autoClean : defaultMineruSettings.autoClean,
    pageRange: typeof input.pageRange === 'string' ? input.pageRange : defaultMineruSettings.pageRange,
    sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : defaultMineruSettings.sourceUrl
  }
}

async function readPersistedAppState(): Promise<PersistedAppState> {
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

async function writePersistedAppState(input: unknown): Promise<PersistedAppState> {
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

function getAppStatePath(): string {
  return join(app.getPath('userData'), 'state', 'workbench-state.json')
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
  const mineruSettings = sanitizeMineruSettingsState(data.mineruSettings)
  const notes = sanitizeNotesState(data.notes)
  const aiConversations = sanitizeAiConversationsState(data.aiConversations)
  const favorites = sanitizeFavoritesState(data.favorites, notes, aiConversations)

  return {
    version: 1,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    ...(workbench ? { workbench } : {}),
    ...(aiSettings ? { aiSettings } : {}),
    ...(mineruSettings ? { mineruSettings } : {}),
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
  const selectedPdfPath =
    typeof input.selectedPdfPath === 'string' && openPdfPaths.includes(input.selectedPdfPath)
      ? input.selectedPdfPath
      : openPdfPaths.at(-1) ?? ''
  const dockLayout = sanitizeDockLayout(input.dockLayout) ?? defaultDockLayout

  return {
    activeView: isPrimaryView(input.activeView) ? input.activeView : 'library',
    activeEditor: isEditorTab(input.activeEditor) ? input.activeEditor : 'pdf',
    openPdfPaths,
    selectedPdfPath,
    pdfDisplayNamesByPath: sanitizePdfDisplayNamesByPath(input.pdfDisplayNamesByPath, openPdfPaths),
    isAiConfigOpen: typeof input.isAiConfigOpen === 'boolean' ? input.isAiConfigOpen : false,
    isAiHistoryOpen: typeof input.isAiHistoryOpen === 'boolean' ? input.isAiHistoryOpen : false,
    isPrimarySidebarCollapsed:
      typeof input.isPrimarySidebarCollapsed === 'boolean' ? input.isPrimarySidebarCollapsed : false,
    dockLayout,
    hiddenDockPanels: filterClosableDockPanelIds(readStringArray(input.hiddenDockPanels)),
    pdfViewStates: sanitizePdfViewStates(input.pdfViewStates)
  }
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
  if (!isRecord(input)) {
    return undefined
  }

  return {
    providerId: readNonEmptyString(input.providerId, defaultAiSettings.providerId),
    baseUrl: readNonEmptyString(input.baseUrl, defaultAiSettings.baseUrl),
    model: readNonEmptyString(input.model, defaultAiSettings.model),
    reasoningEffort: isReasoningEffort(input.reasoningEffort) ? input.reasoningEffort : defaultAiSettings.reasoningEffort,
    disableResponseStorage:
      typeof input.disableResponseStorage === 'boolean'
        ? input.disableResponseStorage
        : defaultAiSettings.disableResponseStorage,
    requiresOpenAiAuth:
      typeof input.requiresOpenAiAuth === 'boolean' ? input.requiresOpenAiAuth : defaultAiSettings.requiresOpenAiAuth,
    systemPrompt: readNonEmptyString(input.systemPrompt, defaultAiSettings.systemPrompt),
    apiKey: readNonEmptyString(input.apiKey, defaultAiSettings.apiKey)
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

function sanitizeNotesState(input: unknown): NotesState | undefined {
  if (!isRecord(input) || !isRecord(input.notesByPaperPath)) {
    return undefined
  }

  const notesByPaperPath = Object.fromEntries(
    Object.entries(input.notesByPaperPath)
      .filter(([filePath]) => isPdfPath(filePath))
      .map(([filePath, value]) => [filePath, sanitizeNoteDocuments(filePath, value)] as const)
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

function sanitizeDeckSpec(input: unknown): DeckSpec | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const slides = sanitizeSlideSpecs(input.slides)
  if (slides.length === 0) {
    return undefined
  }

  const title = readLimitedString(input.title, 160, '未命名 PPT')
  const audience = typeof input.audience === 'string' && input.audience.trim() ? input.audience.trim().slice(0, 80) : 'group-meeting'

  return {
    title,
    subtitle: readOptionalLimitedString(input.subtitle, 240),
    themeId: readLimitedString(input.themeId, 80, 'academic-clean'),
    language: isDeckLanguage(input.language) ? input.language : 'zh-CN',
    audience,
    slides,
    assets: sanitizeSlideAssets(input.assets),
    citations: sanitizeDeckCitations(input.citations),
    meta: sanitizeDeckMeta(input.meta)
  }
}

function sanitizeSlideSpecs(input: unknown): DeckSpec['slides'] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(sanitizeSlideSpec)
    .filter((slide): slide is DeckSpec['slides'][number] => Boolean(slide))
    .slice(0, 40)
}

function sanitizeSlideSpec(input: unknown): DeckSpec['slides'][number] | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const elements = sanitizeSlideElements(input.elements)

  return {
    id: readLimitedString(input.id, 140, `slide_${randomUUID()}`),
    kind: isSlideKind(input.kind) ? input.kind : 'bullet',
    title: readLimitedString(input.title, 140, '未命名页面'),
    notes: readOptionalLimitedString(input.notes, 2000),
    elements,
    sourceRefs: sanitizeSourceRefs(input.sourceRefs)
  }
}

function sanitizeSlideElements(input: unknown): SlideElementSpec[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(sanitizeSlideElement)
    .filter((element): element is SlideElementSpec => Boolean(element))
    .slice(0, 12)
}

function sanitizeSlideElement(input: unknown): SlideElementSpec | undefined {
  if (!isRecord(input) || typeof input.type !== 'string') {
    return undefined
  }

  const sourceRefs = sanitizeSourceRefs(input.sourceRefs)

  switch (input.type) {
    case 'text':
      return {
        type: 'text',
        text: readLimitedString(input.text, 3000, ''),
        style: isTextElementStyle(input.style) ? input.style : undefined,
        sourceRefs
      }
    case 'bullet-list': {
      const items = sanitizeStringArray(input.items, 8, 180)
      return items.length > 0
        ? {
            type: 'bullet-list',
            items,
            style: isBulletElementStyle(input.style) ? input.style : undefined,
            sourceRefs
          }
        : undefined
    }
    case 'image': {
      const assetId = readOptionalLimitedString(input.assetId, 140)
      return assetId
        ? {
            type: 'image',
            assetId,
            caption: readOptionalLimitedString(input.caption, 240),
            sourceRefs
          }
        : undefined
    }
    case 'table': {
      const columns = sanitizeStringArray(input.columns, 8, 120)
      const rows = sanitizeTableRows(input.rows)
      return columns.length > 0
        ? {
            type: 'table',
            columns,
            rows,
            sourceRefs
          }
        : undefined
    }
    case 'quote':
      return {
        type: 'quote',
        text: readLimitedString(input.text, 1800, ''),
        citationId: readOptionalLimitedString(input.citationId, 140),
        sourceRefs
      }
    case 'formula':
      return {
        type: 'formula',
        latex: readLimitedString(input.latex, 1600, ''),
        displayMode: input.displayMode === true,
        sourceRefs
      }
    case 'diagram':
      return {
        type: 'diagram',
        diagramKind: input.diagramKind === 'graphviz' ? 'graphviz' : 'mermaid',
        source: readLimitedString(input.source, 4000, ''),
        sourceRefs
      }
    default:
      return undefined
  }
}

function sanitizeSlideAssets(input: unknown): DeckSpec['assets'] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item): DeckSpec['assets'][number] | undefined => {
      if (!isRecord(item)) {
        return undefined
      }

      const id = readOptionalLimitedString(item.id, 140)
      if (!id) {
        return undefined
      }

      return {
        id,
        kind: isSlideAssetKind(item.kind) ? item.kind : 'image',
        mimeType: isSafePptAssetDataUrl(item.uri) ? readPptDataUrlMimeType(item.uri) : readOptionalLimitedString(item.mimeType, 80),
        uri: isSafePptAssetDataUrl(item.uri) ? item.uri : undefined,
        width: typeof item.width === 'number' && Number.isFinite(item.width) ? clampNumber(item.width, 1, 20000, item.width) : undefined,
        height: typeof item.height === 'number' && Number.isFinite(item.height) ? clampNumber(item.height, 1, 20000, item.height) : undefined,
        alt: readOptionalLimitedString(item.alt, 240),
        sourceRefs: sanitizeSourceRefs(item.sourceRefs)
      }
    })
    .filter((asset): asset is DeckSpec['assets'][number] => Boolean(asset))
    .slice(0, 80)
}

function sanitizeDeckCitations(input: unknown): DeckSpec['citations'] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item): DeckSpec['citations'][number] | undefined => {
      if (!isRecord(item)) {
        return undefined
      }

      const id = readOptionalLimitedString(item.id, 140)
      const title = readOptionalLimitedString(item.title, 500)
      if (!id || !title) {
        return undefined
      }

      return {
        id,
        title,
        authors: sanitizeStringArray(item.authors, 16, 120),
        year: typeof item.year === 'number' && Number.isInteger(item.year) ? clampInteger(item.year, 1500, 3000, item.year) : undefined,
        venue: readOptionalLimitedString(item.venue, 240),
        doi: readOptionalLimitedString(item.doi, 160),
        url: readOptionalLimitedString(item.url, 600),
        sourceRefs: sanitizeSourceRefs(item.sourceRefs)
      }
    })
    .filter((citation): citation is DeckSpec['citations'][number] => Boolean(citation))
    .slice(0, 120)
}

function sanitizeDeckMeta(input: unknown): DeckSpec['meta'] {
  const data = isRecord(input) ? input : {}

  return {
    generatedAt: readIsoLikeString(data.generatedAt),
    sourceIds: sanitizeStringArray(data.sourceIds, 80, 160),
    generatorVersion: readLimitedString(data.generatorVersion, 120, 'unknown')
  }
}

function sanitizeStringArray(input: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => (typeof item === 'string' ? item.trim().slice(0, maxLength) : ''))
    .filter(Boolean)
    .slice(0, maxItems)
}

function sanitizeTableRows(input: unknown): string[][] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((row) => sanitizeStringArray(row, 8, 160))
    .filter((row) => row.length > 0)
    .slice(0, 16)
}

function isSafePptAssetDataUrl(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    input.length <= 24_000_000 &&
    /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(input)
  )
}

function readPptDataUrlMimeType(dataUrl: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl)
  return match?.[1]
}

function isDeckLanguage(input: unknown): input is DeckLanguage {
  return typeof input === 'string' && deckLanguageValues.includes(input as DeckLanguage)
}

function isSlideKind(input: unknown): input is SlideKind {
  return typeof input === 'string' && slideKindValues.includes(input as SlideKind)
}

function isSlideAssetKind(input: unknown): input is SlideAssetKind {
  return typeof input === 'string' && slideAssetKindValues.includes(input as SlideAssetKind)
}

function isTextElementStyle(input: unknown): input is Extract<SlideElementSpec, { type: 'text' }>['style'] {
  return input === 'body' || input === 'caption' || input === 'muted' || input === 'code'
}

function isBulletElementStyle(input: unknown): input is Extract<SlideElementSpec, { type: 'bullet-list' }>['style'] {
  return input === 'body' || input === 'caption' || input === 'muted'
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

function parsePdfPageBitmapInput(input: unknown): PdfPageBitmapInput {
  if (!isRecord(input)) {
    throw new Error('Invalid PDF bitmap render input.')
  }

  const filePath = requireString(input.filePath, 'filePath')
  if (!isPdfPath(filePath)) {
    throw new Error('Only PDF files can be rendered.')
  }

  return {
    filePath,
    pageNumber: clampInteger(input.pageNumber, 1, 100000, 1),
    scale: clampNumber(input.scale, 0.5, 3, 1),
    outputScale: clampNumber(input.outputScale, 1, 3, 1)
  }
}

function parsePdfLayoutSegmentInput(input: unknown): PdfLayoutSegmentInput {
  if (!isRecord(input)) {
    throw new Error('Invalid PDF layout segment input.')
  }

  const filePath = requireString(input.filePath, 'filePath')
  if (!isPdfPath(filePath)) {
    throw new Error('Only PDF files can be analyzed.')
  }

  return {
    filePath,
    maxPages: clampInteger(input.maxPages, 1, 20, 6),
    maxSegments: clampInteger(input.maxSegments, 1, 80, 36)
  }
}

function parseAppCaptureRect(input: unknown): AppCaptureRect {
  if (!isRecord(input)) {
    throw new Error('Invalid screenshot capture input.')
  }

  const rect = {
    x: clampInteger(Math.round(Number(input.x)), 0, 100000, 0),
    y: clampInteger(Math.round(Number(input.y)), 0, 100000, 0),
    width: clampInteger(Math.round(Number(input.width)), 1, 100000, 1),
    height: clampInteger(Math.round(Number(input.height)), 1, 100000, 1)
  }

  if (rect.width < 4 || rect.height < 4) {
    throw new Error('截图区域太小，请重新选择截图范围。')
  }

  return rect
}

function parseNoteExportInput(input: unknown): NoteExportInput {
  if (!isRecord(input)) {
    throw new Error('Invalid note export input.')
  }

  const format =
    input.format === 'pdf'
      ? 'pdf'
      : input.format === 'word'
        ? 'word'
        : input.format === 'markdown'
          ? 'markdown'
          : undefined
  const note = sanitizeNoteDocument('export.pdf', input.note)

  if (!format) {
    throw new Error('Unsupported note export format.')
  }

  if (!note) {
    throw new Error('Invalid note document.')
  }

  return {
    format,
    note,
    markdown: readOptionalLimitedString(input.markdown, 1000000)
  }
}

function parsePptDeckExportInput(input: unknown): PptDeckExportInput {
  if (!isRecord(input)) {
    throw new Error('Invalid PPT export input.')
  }

  const deck = sanitizeDeckSpec(input.deck)
  if (!deck) {
    throw new Error('Invalid DeckSpec.')
  }

  return {
    deck,
    suggestedFileName: readOptionalLimitedString(input.suggestedFileName, 120),
    preferredFilePath: readOptionalLimitedString(input.preferredFilePath, 400)
  }
}

async function exportNoteDocument(input: NoteExportInput): Promise<NoteExportResult> {
  const extension = input.format === 'pdf' ? 'pdf' : input.format === 'word' ? 'doc' : 'md'
  const label = input.format === 'pdf' ? 'PDF' : input.format === 'word' ? 'Word' : 'Markdown'
  const result = await dialog.showSaveDialog({
    title: `导出笔记为 ${label}`,
    defaultPath: `${sanitizeExportFileName(input.note.title)}.${extension}`,
    filters: [
      input.format === 'pdf'
        ? {
            name: 'PDF',
            extensions: ['pdf']
          }
        : input.format === 'word'
          ? {
            name: 'Word 文档',
            extensions: ['doc']
          }
          : {
              name: 'Markdown 文档',
              extensions: ['md', 'markdown']
            }
    ]
  })

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      format: input.format
    }
  }

  if (input.format === 'markdown') {
    await writeFile(result.filePath, input.markdown?.trim() || noteToMarkdown(input.note), 'utf8')
    return {
      canceled: false,
      format: input.format,
      filePath: result.filePath
    }
  }

  const html = noteToExportHtml(input.note)

  if (input.format === 'word') {
    await writeFile(result.filePath, html, 'utf8')
    return {
      canceled: false,
      format: input.format,
      filePath: result.filePath
    }
  }

  const pdf = await renderHtmlToPdf(html)
  await writeFile(result.filePath, pdf)

  return {
    canceled: false,
    format: input.format,
    filePath: result.filePath
  }
}

async function exportPptDeck(input: PptDeckExportInput): Promise<PptDeckExportResult> {
  const result = await dialog.showSaveDialog({
    title: '导出 PPT',
    defaultPath: input.preferredFilePath?.trim() || `${sanitizeExportFileName(input.suggestedFileName ?? input.deck.title)}.pptx`,
    filters: [
      {
        name: 'PowerPoint 演示文稿',
        extensions: ['pptx']
      }
    ]
  })

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      ok: false,
      slideCount: input.deck.slides.length,
      auditIssues: [],
      message: '已取消 PPT 导出。'
    }
  }

  let exportResult: PptExportResult
  try {
    exportResult = await exportDeckToPptx({
      deck: input.deck,
      outputPath: result.filePath,
      resolveAsset: (asset) => (isSafePptAssetDataUrl(asset.uri) ? asset.uri : undefined)
    })
  } catch (error) {
    const normalizedError = normalizePptExportError(error)
    return {
      canceled: false,
      ok: false,
      outputPath: result.filePath,
      filePath: result.filePath,
      slideCount: input.deck.slides.length,
      auditIssues: [],
      errorCode: normalizedError.code,
      message: normalizedError.message
    }
  }

  return {
    ...exportResult,
    canceled: false,
    filePath: exportResult.outputPath
  }
}

function normalizePptExportError(error: unknown): { code: string; message: string } {
  const rawMessage = error instanceof Error ? error.message.trim() : ''
  const rawCode = isNodeError(error) && typeof error.code === 'string' ? error.code.trim().toUpperCase() : ''
  const busyByMessage =
    /busy or locked|being used by another process|resource busy|file is in use|permission denied/i.test(rawMessage)
  const isBusyError = rawCode === 'EBUSY' || rawCode === 'EPERM' || rawCode === 'EACCES' || busyByMessage

  if (isBusyError) {
    return {
      code: 'FILE_BUSY',
      message: '文件正在被占用，暂时无法保存 PPT。请先关闭已打开的 PPT、图片预览或同步程序后重试，或另存为其他文件。'
    }
  }

  return {
    code: rawCode || 'EXPORT_FAILED',
    message: rawMessage ? `保存 PPT 失败：${rawMessage}` : '保存 PPT 失败，请重试。'
  }
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const printWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4'
    })
  } finally {
    printWindow.close()
  }
}

function sanitizeExportFileName(input: string): string {
  const name = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return name || '未命名笔记'
}

function serializeClipboardImage(image: NativeImage, namePrefix: string): ClipboardImageResult {
  const size = image.getSize()
  const dataUrl = image.toDataURL()

  return {
    name: `${namePrefix}-${formatFileTimestamp(new Date())}.png`,
    mimeType: 'image/png',
    dataUrl,
    width: size.width,
    height: size.height,
    size: getDataUrlByteLength(dataUrl)
  }
}

function formatFileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

function getDataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

async function renderPdfPageBitmap(input: PdfPageBitmapInput): Promise<PdfPageBitmapResult> {
  const outputDir = join(app.getPath('temp'), 'inspiration', 'pdf-render-cache')
  const outputPrefix = join(outputDir, `page-${Date.now()}-${randomUUID()}`)
  const outputPath = `${outputPrefix}.png`
  const dpi = Math.round(72 * input.scale * input.outputScale)
  const pdftoppmPath = process.env.PDFTOPPM_PATH?.trim() || 'pdftoppm'

  await mkdir(outputDir, { recursive: true })

  try {
    await execFileAsync(
      pdftoppmPath,
      [
        '-f',
        String(input.pageNumber),
        '-l',
        String(input.pageNumber),
        '-r',
        String(dpi),
        '-png',
        '-singlefile',
        input.filePath,
        outputPrefix
      ],
      {
        timeout: 45000,
        windowsHide: true
      }
    )

    const imageBuffer = await readFile(outputPath)
    return {
      imageDataUrl: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      dpi
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Poppler render error.'
    throw new Error(`兼容渲染失败：未能使用 Poppler 渲染 PDF 页面。请确认已安装 pdftoppm 或设置 PDFTOPPM_PATH。原始信息：${message}`)
  } finally {
    await unlink(outputPath).catch(() => undefined)
  }
}

async function extractPdfLayoutSegments(input: PdfLayoutSegmentInput): Promise<PdfLayoutSegmentsResult> {
  const pdftotextPath = process.env.PDFTOTEXT_PATH?.trim() || 'pdftotext'

  try {
    const { stdout } = await execFileAsync(
      pdftotextPath,
      ['-bbox-layout', '-f', '1', '-l', String(input.maxPages), '-enc', 'UTF-8', input.filePath, '-'],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 45000,
        windowsHide: true
      }
    )

    return {
      parser: 'poppler-bbox-layout',
      segments: assignLayoutSegmentIndexes(createLayoutSegmentsFromBlocks(parsePopplerBBoxLayout(String(stdout)), input.maxSegments))
    }
  } catch (error) {
    const code = isNodeError(error) && error.code ? ` (${error.code})` : ''
    throw new Error(`版面解析失败：未能使用 Poppler pdftotext 分析 PDF。请确认已安装 pdftotext 或设置 PDFTOTEXT_PATH。${code}`)
  }
}

function parsePopplerBBoxLayout(xmlText: string): PopplerLayoutBlock[] {
  const blocks: PopplerLayoutBlock[] = []
  const pageRegex = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi
  let pageMatch: RegExpExecArray | null
  let pageNo = 0
  let blockId = 0

  while ((pageMatch = pageRegex.exec(xmlText))) {
    pageNo += 1
    const pageAttrs = readXmlAttributes(pageMatch[1])
    const pageWidth = readXmlNumber(pageAttrs, 'width')
    const pageHeight = readXmlNumber(pageAttrs, 'height')

    if (!pageWidth || !pageHeight) {
      continue
    }

    const blockRegex = /<block\b([^>]*)>([\s\S]*?)<\/block>/gi
    let blockMatch: RegExpExecArray | null

    while ((blockMatch = blockRegex.exec(pageMatch[2]))) {
      const blockAttrs = readXmlAttributes(blockMatch[1])
      const xMin = readXmlNumber(blockAttrs, 'xmin')
      const yMin = readXmlNumber(blockAttrs, 'ymin')
      const xMax = readXmlNumber(blockAttrs, 'xmax')
      const yMax = readXmlNumber(blockAttrs, 'ymax')

      if (xMin === undefined || yMin === undefined || xMax === undefined || yMax === undefined) {
        continue
      }

      const blockXml = blockMatch[2]
      const textLength = getXmlTextLength(blockXml)
      const wordCount = blockXml.match(/<word\b/gi)?.length ?? 0

      blocks.push({
        id: blockId,
        pageNo,
        pageWidth,
        pageHeight,
        xMin,
        yMin,
        xMax,
        yMax,
        textLength,
        wordCount
      })
      blockId += 1
    }
  }

  return blocks
}

function createLayoutSegmentsFromBlocks(blocks: PopplerLayoutBlock[], maxSegments: number): PdfLayoutSegment[] {
  const segments: PdfLayoutSegment[] = []
  const pageNumbers = [...new Set(blocks.map((block) => block.pageNo))].sort((left, right) => left - right)
  const maxSegmentsPerPage = Math.max(3, Math.ceil(maxSegments / Math.max(pageNumbers.length, 1)) + 4)

  for (const pageNo of pageNumbers) {
    const pageBlocks = blocks.filter((block) => block.pageNo === pageNo)
    const candidates = pageBlocks.filter(isUsefulLayoutBlock)
    const orderedBlocks = orderLayoutBlocks(candidates)
    const groups = mergeLayoutBlocks(orderedBlocks)

    segments.push(
      ...groups.slice(0, maxSegmentsPerPage).map((group) => ({
        pageNo: group.pageNo,
        segmentIndex: 0,
        rect: normalizeLayoutRect(group),
        textLength: group.textLength,
        parser: 'poppler-bbox-layout' as const
      }))
    )
  }

  return segments.slice(0, maxSegments)
}

function assignLayoutSegmentIndexes(segments: PdfLayoutSegment[]): PdfLayoutSegment[] {
  const segmentIndexesByPage = new Map<number, number>()

  return segments.map((segment) => {
    const segmentIndex = segmentIndexesByPage.get(segment.pageNo) ?? 0
    segmentIndexesByPage.set(segment.pageNo, segmentIndex + 1)

    return {
      ...segment,
      segmentIndex
    }
  })
}

function isUsefulLayoutBlock(block: PopplerLayoutBlock): boolean {
  const width = block.xMax - block.xMin
  const height = block.yMax - block.yMin
  const widthRatio = width / Math.max(block.pageWidth, 1)
  const heightRatio = height / Math.max(block.pageHeight, 1)
  const isNearHeader = block.yMax < block.pageHeight * 0.035
  const isNearFooter = block.yMin > block.pageHeight * 0.965

  if (width <= 0 || height <= 0 || block.textLength < 2 || block.wordCount < 1) {
    return false
  }

  if (widthRatio < 0.03 || heightRatio < 0.006) {
    return false
  }

  if ((isNearHeader || isNearFooter) && block.textLength <= 80 && heightRatio < 0.05) {
    return false
  }

  return !(block.textLength <= 5 && widthRatio < 0.12 && heightRatio < 0.04)
}

function orderLayoutBlocks(blocks: PopplerLayoutBlock[]): PopplerLayoutBlock[] {
  if (blocks.length <= 1) {
    return blocks
  }

  const pageWidth = blocks[0].pageWidth
  const pageHeight = blocks[0].pageHeight
  const hasTwoColumns = detectTwoColumnLayout(blocks)
  const fullWidthBlocks = blocks.filter((block) => isFullWidthLayoutBlock(block, hasTwoColumns)).sort(compareLayoutBlocksTopFirst)
  const columnBlocks = blocks.filter((block) => !isFullWidthLayoutBlock(block, hasTwoColumns))
  const orderedBlocks: PopplerLayoutBlock[] = []
  const usedBlockIds = new Set<number>()
  let bandTop = 0

  const appendColumnBand = (top: number, bottom: number): void => {
    const bandBlocks = columnBlocks
      .filter((block) => !usedBlockIds.has(block.id))
      .filter((block) => {
        const centerY = (block.yMin + block.yMax) / 2
        return centerY >= top && centerY <= bottom
      })
      .sort((left, right) =>
        hasTwoColumns
          ? getLayoutColumnIndex(left, pageWidth) - getLayoutColumnIndex(right, pageWidth) || compareLayoutBlocksTopFirst(left, right)
          : compareLayoutBlocksTopFirst(left, right)
      )

    for (const block of bandBlocks) {
      orderedBlocks.push(block)
      usedBlockIds.add(block.id)
    }
  }

  for (const block of fullWidthBlocks) {
    appendColumnBand(bandTop, block.yMin)
    orderedBlocks.push(block)
    usedBlockIds.add(block.id)
    bandTop = Math.max(bandTop, block.yMax)
  }

  appendColumnBand(bandTop, pageHeight)

  const unusedBlocks = blocks.filter((block) => !usedBlockIds.has(block.id)).sort(compareLayoutBlocksTopFirst)
  orderedBlocks.push(...unusedBlocks)

  return orderedBlocks
}

function mergeLayoutBlocks(blocks: PopplerLayoutBlock[]): PopplerLayoutGroup[] {
  const groups: PopplerLayoutGroup[] = []
  let currentGroup: PopplerLayoutGroup | undefined

  for (const block of blocks) {
    if (currentGroup && shouldMergeIntoLayoutGroup(currentGroup, block)) {
      currentGroup = mergeLayoutGroup(currentGroup, block)
      groups[groups.length - 1] = currentGroup
      continue
    }

    currentGroup = {
      pageNo: block.pageNo,
      pageWidth: block.pageWidth,
      pageHeight: block.pageHeight,
      xMin: block.xMin,
      yMin: block.yMin,
      xMax: block.xMax,
      yMax: block.yMax,
      textLength: block.textLength,
      blockIds: [block.id]
    }
    groups.push(currentGroup)
  }

  return groups
}

function shouldMergeIntoLayoutGroup(group: PopplerLayoutGroup, block: PopplerLayoutBlock): boolean {
  const groupColumn = getLayoutColumnIndex(group, group.pageWidth)
  const blockColumn = getLayoutColumnIndex(block, block.pageWidth)
  const verticalGap = block.yMin - group.yMax
  const combinedHeight = Math.max(group.yMax, block.yMax) - Math.min(group.yMin, block.yMin)
  const heightLimit = group.pageHeight * 0.25
  const isClose = verticalGap >= -group.pageHeight * 0.01 && verticalGap <= group.pageHeight * 0.008
  const hasSmallNeighbor = group.textLength < 90 || block.textLength < 90
  const hasHorizontalOverlap = getHorizontalOverlapRatio(group, block) > 0.4
  const isSameColumn = groupColumn === blockColumn || getHorizontalOverlapRatio(group, block) > 0.72

  return (
    isSameColumn &&
    hasHorizontalOverlap &&
    combinedHeight <= heightLimit &&
    (isClose || (hasSmallNeighbor && verticalGap >= -group.pageHeight * 0.01 && verticalGap <= group.pageHeight * 0.02))
  )
}

function mergeLayoutGroup(group: PopplerLayoutGroup, block: PopplerLayoutBlock): PopplerLayoutGroup {
  return {
    ...group,
    xMin: Math.min(group.xMin, block.xMin),
    yMin: Math.min(group.yMin, block.yMin),
    xMax: Math.max(group.xMax, block.xMax),
    yMax: Math.max(group.yMax, block.yMax),
    textLength: group.textLength + block.textLength,
    blockIds: [...group.blockIds, block.id]
  }
}

function normalizeLayoutRect(group: PopplerLayoutGroup): PdfLayoutRect {
  const x = clampNumber(group.xMin / Math.max(group.pageWidth, 1), 0, 1, 0)
  const y = clampNumber(group.yMin / Math.max(group.pageHeight, 1), 0, 1, 0)
  const right = clampNumber(group.xMax / Math.max(group.pageWidth, 1), 0, 1, 1)
  const bottom = clampNumber(group.yMax / Math.max(group.pageHeight, 1), 0, 1, 1)

  return {
    x,
    y,
    width: Math.max(0.01, right - x),
    height: Math.max(0.01, bottom - y)
  }
}

function detectTwoColumnLayout(blocks: Array<Pick<PopplerLayoutBlock, 'pageWidth' | 'xMin' | 'xMax'>>): boolean {
  if (blocks.length < 4) {
    return false
  }

  const pageWidth = blocks[0].pageWidth
  const narrowBlocks = blocks.filter((block) => (block.xMax - block.xMin) / Math.max(pageWidth, 1) < 0.58)
  const leftCount = narrowBlocks.filter((block) => (block.xMin + block.xMax) / 2 < pageWidth * 0.46).length
  const rightCount = narrowBlocks.filter((block) => (block.xMin + block.xMax) / 2 > pageWidth * 0.54).length

  return leftCount >= 2 && rightCount >= 2
}

function isFullWidthLayoutBlock(block: PopplerLayoutBlock, hasTwoColumns: boolean): boolean {
  if (!hasTwoColumns) {
    return false
  }

  const widthRatio = (block.xMax - block.xMin) / Math.max(block.pageWidth, 1)
  const crossesMidline = block.xMin < block.pageWidth * 0.44 && block.xMax > block.pageWidth * 0.56

  return widthRatio >= 0.62 || (crossesMidline && widthRatio >= 0.42)
}

function getLayoutColumnIndex(block: Pick<PopplerLayoutBlock, 'pageWidth' | 'xMin' | 'xMax'>, pageWidth: number): number {
  return (block.xMin + block.xMax) / 2 < pageWidth / 2 ? 0 : 1
}

function compareLayoutBlocksTopFirst(
  left: Pick<PopplerLayoutBlock, 'xMin' | 'yMin'>,
  right: Pick<PopplerLayoutBlock, 'xMin' | 'yMin'>
): number {
  return left.yMin - right.yMin || left.xMin - right.xMin
}

function getHorizontalOverlapRatio(
  left: Pick<PopplerLayoutBlock, 'xMin' | 'xMax'>,
  right: Pick<PopplerLayoutBlock, 'xMin' | 'xMax'>
): number {
  const overlap = Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin)
  const minWidth = Math.min(left.xMax - left.xMin, right.xMax - right.xMin)

  return minWidth > 0 ? Math.max(0, overlap) / minWidth : 0
}

function readXmlAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attributeRegex = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = attributeRegex.exec(input))) {
    attributes[match[1].toLowerCase()] = match[2]
  }

  return attributes
}

function readXmlNumber(attributes: Record<string, string>, name: string): number | undefined {
  const value = Number(attributes[name.toLowerCase()])
  return Number.isFinite(value) ? value : undefined
}

function getXmlTextLength(input: string): number {
  return decodeXmlText(input.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim().length
}

function decodeXmlText(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    const normalizedEntity = entity.toLowerCase()

    if (normalizedEntity === 'amp') {
      return '&'
    }
    if (normalizedEntity === 'lt') {
      return '<'
    }
    if (normalizedEntity === 'gt') {
      return '>'
    }
    if (normalizedEntity === 'quot') {
      return '"'
    }
    if (normalizedEntity === 'apos') {
      return "'"
    }
    if (normalizedEntity.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
    }
    if (normalizedEntity.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
    }

    return ''
  })
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
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

function isReasoningEffort(input: unknown): input is AiProviderTestInput['reasoningEffort'] {
  return input === 'none' || input === 'minimal' || input === 'low' || input === 'medium' || input === 'high' || input === 'xhigh'
}

function isMineruModelVersion(input: unknown): input is MineruModelVersion {
  return input === 'pipeline' || input === 'vlm' || input === 'MinerU-HTML'
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

function parseAiChatInput(input: unknown): AiChatInput {
  const parsed = parseAiProviderTestInput(input)
  const data = input as Partial<AiChatInput>

  if (!Array.isArray(data.messages)) {
    throw new Error('Missing chat messages.')
  }

  const messages: AiChatInput['messages'] = data.messages.map((message) => {
    const role: 'user' | 'assistant' = message.role === 'assistant' ? 'assistant' : 'user'

    return {
      role,
      content: requireString(message.content, 'message.content')
    }
  })

  return {
    ...parsed,
    systemPrompt:
      typeof data.systemPrompt === 'string' && data.systemPrompt.trim()
        ? data.systemPrompt.trim()
        : 'You are Inspiration, a careful research paper reading assistant. Answer clearly and cite paper evidence when context is provided.',
    messages,
    attachments: sanitizeAiImageAttachments(data.attachments),
    maxOutputTokens: clampInteger(data.maxOutputTokens, 256, 8192, 2048)
  }
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing ${fieldName}.`)
  }

  return value.trim()
}

function buildConversationInput(
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>,
  prompt: string,
  attachments: AiImageAttachmentState[] = []
): string | Array<{ role: 'user'; content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' }> }> {
  const history = messages
    .slice(-20)
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`)
    .join('\n\n')

  const textInput = history ? `${history}\n\nUser:\n${prompt}` : prompt
  if (attachments.length === 0) {
    return textInput
  }

  return [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: textInput
        },
        ...attachments.map((attachment) => ({
          type: 'input_image' as const,
          image_url: attachment.dataUrl,
          detail: 'auto' as const
        }))
      ]
    }
  ]
}

function buildEffectiveSystemPrompt(systemPrompt: string): string {
  const trimmedSystemPrompt = systemPrompt.trim()

  return trimmedSystemPrompt
    ? `${trimmedSystemPrompt}\n\n以下是必须优先遵守的输出规则：\n${advancedRulesMarkdown}`
    : `以下是必须优先遵守的输出规则：\n${advancedRulesMarkdown}`
}

function buildChatCompletionMessages(
  systemPrompt: string,
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>,
  prompt: string,
  attachments: AiImageAttachmentState[] = []
): ChatCompletionMessage[] {
  const chatMessages: ChatCompletionMessage[] = []
  const trimmedSystemPrompt = systemPrompt.trim()

  if (trimmedSystemPrompt) {
    chatMessages.push({
      role: 'system',
      content: trimmedSystemPrompt
    })
  }

  for (const message of messages.slice(-20)) {
    chatMessages.push({
      role: message.role,
      content: message.content
    })
  }

  if (attachments.length === 0) {
    chatMessages.push({
      role: 'user',
      content: prompt
    })
    return chatMessages
  }

  chatMessages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: prompt
      },
      ...attachments.map((attachment) => ({
        type: 'image_url' as const,
        image_url: {
          url: attachment.dataUrl,
          detail: 'auto' as const
        }
      }))
    ]
  })

  return chatMessages
}

function joinApiUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(path, normalizedBase).toString()
}

function hashString(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }

  return Math.abs(hash).toString(36)
}

async function postAiResponsesWithChatFallback(
  responsesRequest: AiResponsesRequest,
  chatCompletionsRequest: AiChatCompletionsRequest
): Promise<AiProviderTestResult> {
  const responsesResult = await postAiResponses(responsesRequest)

  if (!shouldFallbackToChatCompletions(responsesResult)) {
    return responsesResult
  }

  const fallbackResult = await postAiChatCompletions(chatCompletionsRequest)
  if (fallbackResult.ok) {
    return {
      ...fallbackResult,
      message: `${fallbackResult.message} (Chat Completions fallback)`
    }
  }

  return fallbackResult
}

async function postAiResponses(request: AiResponsesRequest): Promise<AiProviderTestResult> {
  const maxAttempts = request.maxAttempts ?? 3
  let lastNetworkError = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body)
      })
      const rawText = await response.text()
      const json = parseJsonObject(rawText)

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          message: request.successMessage,
          outputText: extractResponseText(json) || rawText,
          responseId: typeof json?.id === 'string' ? json.id : undefined
        }
      }

      const rawMessage = extractErrorMessage(json) || rawText || `Request failed with HTTP ${response.status}`
      if (isTransientAiStatus(response.status) && attempt < maxAttempts) {
        await wait(getRetryDelayMs(response.headers.get('retry-after'), attempt))
        continue
      }

      return {
        ok: false,
        status: response.status,
        message: formatAiProviderError(response.status, rawMessage, attempt)
      }
    } catch (error) {
      lastNetworkError = error instanceof Error ? error.message : 'Network request failed.'
      if (attempt < maxAttempts) {
        await wait(getRetryDelayMs(null, attempt))
        continue
      }
    }
  }

  return {
    ok: false,
    status: 0,
    message: `无法连接到 AI 服务，已自动重试 ${maxAttempts} 次。请检查网络、Base URL 或稍后再试。原始信息：${lastNetworkError}`
  }
}

async function postAiChatCompletions(request: AiChatCompletionsRequest): Promise<AiProviderTestResult> {
  const maxAttempts = request.maxAttempts ?? 2
  let lastNetworkError = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body)
      })
      const rawText = await response.text()
      const json = parseJsonObject(rawText)

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          message: request.successMessage,
          outputText: extractResponseText(json) || rawText,
          responseId: typeof json?.id === 'string' ? json.id : undefined
        }
      }

      const rawMessage = extractErrorMessage(json) || rawText || `Request failed with HTTP ${response.status}`
      if (isTransientAiStatus(response.status) && attempt < maxAttempts) {
        await wait(getRetryDelayMs(response.headers.get('retry-after'), attempt))
        continue
      }

      return {
        ok: false,
        status: response.status,
        message: formatAiProviderError(response.status, rawMessage, attempt)
      }
    } catch (error) {
      lastNetworkError = error instanceof Error ? error.message : 'Network request failed.'
      if (attempt < maxAttempts) {
        await wait(getRetryDelayMs(null, attempt))
        continue
      }
    }
  }

  return {
    ok: false,
    status: 0,
    message: `无法连接到 AI 服务，已自动重试 ${maxAttempts} 次。请检查网络、Base URL 或稍后再试。原始信息：${lastNetworkError}`
  }
}

function shouldFallbackToChatCompletions(result: AiProviderTestResult): boolean {
  if (result.ok || result.status === 0) {
    return false
  }

  if (result.status === 400 || result.status === 404 || result.status === 405) {
    return true
  }

  if (result.status === 502 || result.status === 503 || result.status === 504) {
    return true
  }

  const message = result.message.toLowerCase()
  return (
    message.includes('responses api') ||
    message.includes('/responses') ||
    message.includes('not found') ||
    message.includes('unsupported') ||
    message.includes('unknown url')
  )
}

function isTransientAiStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function getRetryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter)
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(5000, retryAfterSeconds * 1000)
    }

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return Math.min(5000, Math.max(0, retryAt - Date.now()))
    }
  }

  return 700 * attempt
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function formatAiProviderError(status: number, rawMessage: string, attempts: number): string {
  const retryText = attempts > 1 ? `，已自动重试 ${attempts} 次` : ''
  const detail = rawMessage ? ` 原始信息：${rawMessage}` : ''

  if (status === 429) {
    return `AI 服务当前限流${retryText}。请稍后重试，或切换模型 / 服务地址。${detail}`
  }

  if (status === 502 || status === 503 || status === 504) {
    return `AI 服务暂时不可用${retryText}。请稍后重试，或切换模型 / 服务地址。${detail}`
  }

  if (status >= 500) {
    return `AI 服务端返回错误 ${status}${retryText}。请稍后重试。${detail}`
  }

  if (status === 401 || status === 403) {
    return `AI 鉴权失败，请检查 API Key、Bearer Auth 和服务地址配置。${detail}`
  }

  if (status === 404) {
    return `AI 接口不存在，请确认 Base URL 是否正确，或服务是否支持 Responses API / Chat Completions。${detail}`
  }

  return `AI 请求失败，HTTP ${status}。${detail}`
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function extractErrorMessage(json: Record<string, unknown> | null): string | undefined {
  const error = json?.error

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  if (typeof json?.message === 'string') {
    return json.message
  }

  return undefined
}

function extractResponseText(json: Record<string, unknown> | null): string | undefined {
  if (!json) {
    return undefined
  }

  if (typeof json.output_text === 'string') {
    return json.output_text
  }

  const choices = json.choices
  if (Array.isArray(choices)) {
    const choiceParts: string[] = []

    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') {
        continue
      }

      if ('text' in choice && typeof choice.text === 'string') {
        choiceParts.push(choice.text)
      }

      const message = 'message' in choice ? choice.message : undefined
      if (!message || typeof message !== 'object') {
        continue
      }

      const content = 'content' in message ? message.content : undefined
      if (typeof content === 'string') {
        choiceParts.push(content)
      } else if (Array.isArray(content)) {
        for (const contentItem of content) {
          if (contentItem && typeof contentItem === 'object' && 'text' in contentItem && typeof contentItem.text === 'string') {
            choiceParts.push(contentItem.text)
          }
        }
      }
    }

    const chatText = choiceParts.join('\n').trim()
    if (chatText) {
      return chatText
    }
  }

  const output = json.output
  if (!Array.isArray(output)) {
    return undefined
  }

  const parts: string[] = []

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const content = 'content' in item ? item.content : undefined
    if (!Array.isArray(content)) {
      continue
    }

    for (const contentItem of content) {
      if (
        contentItem &&
        typeof contentItem === 'object' &&
        'text' in contentItem &&
        typeof contentItem.text === 'string'
      ) {
        parts.push(contentItem.text)
      }
    }
  }

  return parts.join('\n').trim() || undefined
}
