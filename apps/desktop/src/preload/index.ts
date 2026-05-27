import { contextBridge, ipcRenderer } from 'electron'
import type {
  BatchTranslationRequest,
  BatchTranslationResult,
  CodeRepositoryPreparationInput,
  CodeRepositoryPreparationResult,
  DeckSpec,
  MineruParseResult,
  PptExportResult,
  SelectionExplainRequest,
  SelectionExplainResult
} from '@thesis-agent/shared'
import type { PersistedAppState } from './thesis-agent'

const api = {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  readAppState: () => ipcRenderer.invoke('app-state:read') as Promise<PersistedAppState>,
  writeAppState: (state: PersistedAppState) => ipcRenderer.invoke('app-state:write', state) as Promise<PersistedAppState>,
  openPdf: () =>
    ipcRenderer.invoke('dialog:open-pdf') as Promise<{
      canceled: boolean
      filePaths: string[]
    }>,
  getPdfFileInfo: (filePath: string) =>
    ipcRenderer.invoke('pdf:get-file-info', filePath) as Promise<{
      size: number
      modifiedAt?: string
    }>,
  readPdfFile: (filePath: string) => ipcRenderer.invoke('pdf:read-file', filePath) as Promise<ArrayBuffer>,
  renderPdfPageBitmap: (input: { filePath: string; pageNumber: number; scale: number; outputScale: number }) =>
    ipcRenderer.invoke('pdf:render-page-bitmap', input) as Promise<{
      imageDataUrl: string
      dpi: number
    }>,
  captureAppRegionToClipboard: (input: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('screenshot:capture-app-region', input) as Promise<{
      name: string
      mimeType: 'image/png'
      dataUrl: string
      width: number
      height: number
      size: number
    }>,
  readClipboardImage: () =>
    ipcRenderer.invoke('clipboard:read-image') as Promise<{
      name: string
      mimeType: 'image/png'
      dataUrl: string
      width: number
      height: number
      size: number
    } | null>,
  exportNote: (input: { format: 'word' | 'pdf' | 'markdown'; note: unknown; markdown?: string }) =>
    ipcRenderer.invoke('note:export', input) as Promise<{
      canceled: boolean
      format: 'word' | 'pdf' | 'markdown'
      filePath?: string
    }>,
  exportPptDeck: (input: { deck: DeckSpec; suggestedFileName?: string; preferredFilePath?: string }) =>
    ipcRenderer.invoke('ppt:export-deck', input) as Promise<
      PptExportResult & {
        canceled: boolean
        filePath?: string
      }
    >,
  parsePdfWithMineru: (input: {
    filePath: string
    apiKey: string
    modelVersion: 'pipeline' | 'vlm' | 'MinerU-HTML'
    language: string
    enableTable: boolean
    enableFormula: boolean
    isOcr: boolean
    autoClean: boolean
    pageRange: string
    sourceUrl?: string
  }) =>
    ipcRenderer.invoke('mineru:parse-pdf', input) as Promise<MineruParseResult>,
  hasCachedMineruResult: (filePath: string) =>
    ipcRenderer.invoke('mineru:has-cached-result', filePath) as Promise<boolean>,
  readCachedMineruResult: (filePath: string) =>
    ipcRenderer.invoke('mineru:read-cached-result', filePath) as Promise<MineruParseResult | null>,
  clearCachedMineruResult: (filePath: string) =>
    ipcRenderer.invoke('mineru:clear-cached-result', filePath) as Promise<boolean>,
  clearAllCachedMineruResults: () =>
    ipcRenderer.invoke('mineru:clear-all-cached-results') as Promise<number>,
  prepareCodeRepository: (input: CodeRepositoryPreparationInput) =>
    ipcRenderer.invoke('code-analysis:prepare-repository', input) as Promise<CodeRepositoryPreparationResult>,
  explainSelection: (input: SelectionExplainRequest) =>
    ipcRenderer.invoke('selection:explain', input) as Promise<SelectionExplainResult>,
  translateBatch: (input: BatchTranslationRequest) =>
    ipcRenderer.invoke('translation:batch', input) as Promise<BatchTranslationResult>,
  extractPdfLayoutSegments: (input: { filePath: string; maxPages: number; maxSegments: number }) =>
    ipcRenderer.invoke('pdf:extract-layout-segments', input) as Promise<{
      parser: 'poppler-bbox-layout'
      segments: Array<{
        pageNo: number
        segmentIndex: number
        rect: {
          x: number
          y: number
          width: number
          height: number
        }
        textLength: number
        parser: 'poppler-bbox-layout'
      }>
    }>,
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
  }) =>
    ipcRenderer.invoke('ai:test-provider', input) as Promise<{
      ok: boolean
      status: number
      message: string
      outputText?: string
      responseId?: string
    }>,
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
    attachments?: Array<{
      id: string
      kind: 'image'
      name: string
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
      dataUrl: string
      width: number
      height: number
      size: number
    }>
    maxOutputTokens?: number
  }) =>
    ipcRenderer.invoke('ai:send-message', input) as Promise<{
      ok: boolean
      status: number
      message: string
      outputText?: string
      responseId?: string
    }>
}

contextBridge.exposeInMainWorld('thesisAgent', api)
