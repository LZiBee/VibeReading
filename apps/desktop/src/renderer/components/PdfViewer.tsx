import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement
} from 'react'
import {
  noteFontFamilyOptions,
  noteFontSizeOptions,
  noteHighlightOptions
} from '@thesis-agent/notes'
import type { AnnotationKind, PdfAnnotation, PdfAnnotationColor, PdfAnnotationRect, PdfSelection } from '@thesis-agent/pdf'
import { createId } from '@thesis-agent/shared'
import type { MineruParseResult, SelectionExplainResult } from '@thesis-agent/shared'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { PdfLinkedNoteRegion, ReasoningEffort } from '../app/types'
import type { PersistedMineruSettingsState, PersistedPdfEditorSettingsState } from '../../preload/thesis-agent'
import {
  getMineruBlockPlainText,
  mineruBlockDragMimeType,
  serializeMineruBlockDragPayload
} from '../app/mineruDrag'
import {
  createPdfExcerptDropPayload,
  pdfExcerptDragMimeType
} from './note/milkdown/pdfExcerptDrag'
import pdfWorkerSrc from '../pdf.worker?worker&url'
import {
  AnnotationPreview,
  AnnotationColorPicker,
  PdfOverviewPanel,
  PdfScrollStrip
} from './pdfviewer/PdfViewerParts'
import {
  PageSize,
  PanState,
  PdfBrowseMode,
  PdfRenderMode,
  PdfSelectionSnapshot,
  PdfToolMode,
  ZoomAnchor,
  annotationMarkStyle,
  clampHighlightThickness,
  clampScale,
  createCanvasMetrics,
  createStableHash,
  defaultHighlightOpacity,
  defaultHighlightThickness,
  defaultPresetColors,
  findSelectionTextLayer,
  getCanvasOutputScale,
  getNormalizedRects,
  getSelectionAnchor,
  isEditableTarget,
  isSameColor,
  linkedNoteRegionStyle,
  maxScale,
  minScale,
  normalizeAnnotationRects,
  normalizeSelectedText,
  parsePageNumber,
  pinToStyle,
  preventFocusSteal,
  readingReportIntervalSeconds,
  selectionPopoverStyle,
  zoomStep
} from './pdfviewer/pdfViewerShared'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export const pdfRendererCacheKey = 'pdfjs-sumprecise-poppler-v6'

type PdfViewerProps = {
  filePath: string
  session?: PdfViewerSession
  isActive?: boolean
  onOpenPdf: () => void
  onStatus: (status: string) => void
  onAskSelection: (selection: PdfSelectionSnapshot) => void
  onExplainSelection: (selection: PdfSelectionSnapshot) => Promise<SelectionExplainResult>
  onCreatePdfNote?: () => void
  onParseWithMineru?: () => void
  onGenerateMineruNote?: () => void
  onOpenFullTranslation?: () => void
  onHideMineruLinkedRegions?: () => void
  onShowMineruLinkedRegions?: () => void
  onSessionChange?: (session: PdfViewerSession) => void
  onToolbarChange?: (toolbar: PdfViewerToolbarBridge | null) => void
  mineruSettings?: PersistedMineruSettingsState
  onMineruSettingsChange?: (patch: Partial<PersistedMineruSettingsState>) => void
  mineruParseResult?: MineruParseResult
  isMineruOverlayHidden?: boolean
  linkedNoteRegions?: PdfLinkedNoteRegion[]
  focusedPdfSourceRegion?: PdfLinkedNoteRegion | null
  focusedPdfSourceRegionNonce?: number
  onLinkedNoteRegionSelect?: (region: PdfLinkedNoteRegion) => void
  onMineruClearCurrentCache?: () => void
  onMineruClearAllCaches?: () => void
  pptSettings?: PdfPptToolbarSettings
  pptModelOptions?: string[]
  pptReasoningOptions?: PdfPptReasoningOption[]
  pdfEditorSettings?: PersistedPdfEditorSettingsState
  isPptGenerating?: boolean
  isMindmapGenerating?: boolean
  onPptSettingsChange?: (patch: Partial<PdfPptToolbarSettings>) => void
  onGeneratePpt?: () => void
  onGenerateMindmap?: () => void
}

export type PdfPptToolbarSettings = {
  model: string
  reasoningEffort: ReasoningEffort
  targetSlideCount: number
  includeAgenda: boolean
  includeReferences: boolean
  includeAppendix: boolean
  includeNotes: boolean
  includeAiAnswers: boolean
}

export type PdfPptReasoningOption = {
  value: ReasoningEffort
  label: string
}

type PdfPageBitmapCacheEntry = {
  imageDataUrl: string
  dpi: number
}

export type PdfViewerSession = {
  pageNumber: number
  pageCount?: number
  scale: number
  scrollLeft: number
  scrollTop: number
  readingSeconds?: number
  updatedAt?: string
}

export type PdfViewerToolbarState = {
  pageNumber: number
  pageCount: number
  scale: number
  browseMode: PdfBrowseMode
  renderMode: PdfRenderMode
  isOverviewOpen: boolean
  isLoading: boolean
  canGoPrevious: boolean
  canGoNext: boolean
  canZoomOut: boolean
  canZoomIn: boolean
  hasDocument: boolean
}

export type PdfViewerToolbarActions = {
  openPdf: () => void
  reloadDocument: () => void
  toggleOverview: () => void
  goPrevious: () => void
  goNext: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomIn: () => void
  setBrowseModeScroll: () => void
  setBrowseModePage: () => void
  toggleRenderMode: () => void
}

export type PdfViewerToolbarBridge = {
  state: PdfViewerToolbarState
  actions: PdfViewerToolbarActions
}

const pdfjsResourceBaseUrl = new URL('pdfjs/', window.location.href).toString()

export function PdfViewer({
  filePath,
  session,
  isActive = true,
  onOpenPdf,
  onStatus,
  onAskSelection,
  onExplainSelection,
  onCreatePdfNote,
  onParseWithMineru,
  onGenerateMineruNote,
  onOpenFullTranslation,
  onHideMineruLinkedRegions,
  onShowMineruLinkedRegions,
  onSessionChange,
  onToolbarChange,
  mineruSettings,
  onMineruSettingsChange,
  mineruParseResult,
  isMineruOverlayHidden = false,
  linkedNoteRegions = [],
  focusedPdfSourceRegion = null,
  focusedPdfSourceRegionNonce = 0,
  onLinkedNoteRegionSelect,
  onMineruClearCurrentCache,
  onMineruClearAllCaches,
  pptSettings,
  pptModelOptions = [],
  pptReasoningOptions = [],
  pdfEditorSettings,
  isPptGenerating = false,
  isMindmapGenerating = false,
  onPptSettingsChange,
  onGeneratePpt,
  onGenerateMindmap
}: PdfViewerProps): ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const panStateRef = useRef<PanState | null>(null)
  const selectionExplainRequestRef = useRef(0)
  const initialSessionRef = useRef<PdfViewerSession | undefined>(session)
  const onSessionChangeRef = useRef<PdfViewerProps['onSessionChange']>(onSessionChange)
  const hasRestoredScrollRef = useRef(false)
  const sessionReportFrameRef = useRef<number | null>(null)
  const toolbarSignatureRef = useRef('')
  const readingSecondsRef = useRef(Math.max(0, Math.floor(session?.readingSeconds ?? 0)))
  const pageProxyCacheRef = useRef<Map<string, Promise<PDFPageProxy>>>(new Map())
  const textContentCacheRef = useRef<Map<string, Promise<Awaited<ReturnType<PDFPageProxy['getTextContent']>>>>>(new Map())
  const bitmapCacheRef = useRef<Map<string, PdfPageBitmapCacheEntry>>(new Map())
  const bitmapInflightRef = useRef<Map<string, Promise<PdfPageBitmapCacheEntry>>>(new Map())
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(() => Math.max(1, Math.floor(session?.pageNumber ?? 1)))
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(() => clampScale(session?.scale ?? pdfEditorSettings?.defaultScale ?? 1))
  const [pageSize, setPageSize] = useState<PageSize | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [error, setError] = useState<string>('')
  const [activeTool, setActiveTool] = useState<PdfToolMode>(pdfEditorSettings?.defaultTool ?? 'select')
  const [activeSelection, setActiveSelection] = useState<PdfSelectionSnapshot | null>(null)
  const [selectionExplainLoading, setSelectionExplainLoading] = useState(false)
  const [selectionExplainResult, setSelectionExplainResult] = useState<SelectionExplainResult | null>(null)
  const [selectionExplainError, setSelectionExplainError] = useState('')
  const [activeColor, setActiveColor] = useState<PdfAnnotationColor>(defaultPresetColors[0] ?? '#ffd84d')
  const [activeOpacity, setActiveOpacity] = useState(defaultHighlightOpacity)
  const [activeThickness, setActiveThickness] = useState(defaultHighlightThickness)
  const [presetColors, setPresetColors] = useState<PdfAnnotationColor[]>(defaultPresetColors)
  const [colorPickerAnchor, setColorPickerAnchor] = useState<'toolbar' | null>(null)
  const [isNoteComposerOpen, setIsNoteComposerOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [isMineruMenuOpen, setIsMineruMenuOpen] = useState(false)
  const [isMineruConfigOpen, setIsMineruConfigOpen] = useState(false)
  const [isPptConfigOpen, setIsPptConfigOpen] = useState(false)
  const [annotationHistory, setAnnotationHistory] = useState<string[]>([])
  const [documentReloadKey, setDocumentReloadKey] = useState(0)
  const [renderMode, setRenderMode] = useState<PdfRenderMode>(pdfEditorSettings?.defaultRenderMode ?? 'compatibility')
  const [browseMode, setBrowseMode] = useState<PdfBrowseMode>(pdfEditorSettings?.defaultBrowseMode ?? 'page')
  const [isOverviewOpen, setIsOverviewOpen] = useState(false)
  const [bitmapPageDataUrl, setBitmapPageDataUrl] = useState('')
  const [readingSeconds, setReadingSeconds] = useState(() => Math.max(0, Math.floor(session?.readingSeconds ?? 0)))
  useEffect(() => {
    selectionExplainRequestRef.current += 1
    setSelectionExplainLoading(false)
    setSelectionExplainResult(null)
    setSelectionExplainError('')
  }, [activeSelection])
  const [isReaderEngaged, setIsReaderEngaged] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(() => (typeof document === 'undefined' ? true : document.hasFocus()))
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null)
  const [focusingSourceRegionId, setFocusingSourceRegionId] = useState('')
  const focusSourceRegionTimerRef = useRef<number | null>(null)
  const pptToolbarModelOptions = useMemo(
    () => buildPdfPptModelOptions(pptSettings?.model ?? '', pptModelOptions),
    [pptModelOptions, pptSettings?.model]
  )

  const stopSelectionPopoverPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
  }, [])

  const stopSelectionPopoverMouseUp = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    event.stopPropagation()
  }, [])

  const preventSelectionActionFocusSteal = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    preventFocusSteal(event)
  }, [])

  const fileName = useMemo(() => (filePath ? filePath.split(/[\\/]/).at(-1) ?? filePath : ''), [filePath])
  const paperId = useMemo(() => (filePath ? `paper_${createStableHash(filePath)}` : 'paper_empty'), [filePath])
  const pageNumbers = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount])
  const pageStyle = pageSize ? { width: `${pageSize.width}px`, height: `${pageSize.height}px` } : undefined
  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageNo === pageNumber),
    [annotations, pageNumber]
  )
  const pageLinkedNoteRegions = useMemo(
    () => linkedNoteRegions.filter((region) => region.pageNo === pageNumber),
    [linkedNoteRegions, pageNumber]
  )
  const sessionPageNumber = session?.pageNumber ?? 1
  const getPageCacheKey = useCallback((targetPage: number): string => `${filePath}::${targetPage}`, [filePath])
  const getBitmapCacheKey = useCallback(
    (targetPage: number, targetScale: number, targetOutputScale: number): string =>
      `${filePath}::${targetPage}::${targetScale.toFixed(3)}::${targetOutputScale.toFixed(3)}`,
    [filePath]
  )
  const canGoPrevious = pageNumber > 1
  const canGoNext = pageCount > 0 && pageNumber < pageCount
  const canZoomOut = scale > minScale
  const canZoomIn = scale < maxScale
  const hasDocument = Boolean(filePath && pageCount > 0)
  const hasMineruResult = Boolean(mineruParseResult)
  const startMineruRegionDrag = (event: ReactDragEvent<HTMLButtonElement>, region: PdfLinkedNoteRegion): void => {
    const dragBlock = region.mineruBlock ?? {
      id: region.mineruBlockId ?? region.id,
      type: region.rawType === 'heading' || region.rawType === 'paragraph' || region.rawType === 'list' || region.rawType === 'equation' || region.rawType === 'image' || region.rawType === 'chart' || region.rawType === 'table' || region.rawType === 'footnote'
        ? region.rawType
        : 'paragraph',
      rawType: region.rawType,
      pageNo: region.pageNo,
      rect: region.rect,
      text: region.label
    }

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(
      mineruBlockDragMimeType,
      serializeMineruBlockDragPayload({
        paperPath: region.paperPath,
        block: dragBlock
      })
    )
    event.dataTransfer.setData('text/plain', getMineruBlockPlainText(dragBlock))
  }
  const isReadingTimerActive = Boolean(filePath && isActive && pageCount > 0 && isReaderEngaged && isWindowFocused)

  const getCachedPdfPage = useCallback(
    (targetPage: number): Promise<PDFPageProxy> => {
      if (!documentProxy) {
        return Promise.reject(new Error('PDF document is not ready.'))
      }

      const cacheKey = getPageCacheKey(targetPage)
      const cachedPagePromise = pageProxyCacheRef.current.get(cacheKey)
      if (cachedPagePromise) {
        return cachedPagePromise
      }

      const pagePromise = documentProxy.getPage(targetPage)
      pageProxyCacheRef.current.set(cacheKey, pagePromise)
      return pagePromise
    },
    [documentProxy, getPageCacheKey]
  )

  const getCachedTextContent = useCallback(
    (targetPage: number): Promise<Awaited<ReturnType<PDFPageProxy['getTextContent']>>> => {
      const cacheKey = getPageCacheKey(targetPage)
      const cachedTextPromise = textContentCacheRef.current.get(cacheKey)
      if (cachedTextPromise) {
        return cachedTextPromise
      }

      const textPromise = getCachedPdfPage(targetPage).then((page) => page.getTextContent())
      textContentCacheRef.current.set(cacheKey, textPromise)
      return textPromise
    },
    [getCachedPdfPage, getPageCacheKey]
  )

  const getCachedBitmap = useCallback(
    (targetPage: number, targetScale: number, targetOutputScale: number): Promise<PdfPageBitmapCacheEntry> => {
      const cacheKey = getBitmapCacheKey(targetPage, targetScale, targetOutputScale)
      const cachedBitmap = bitmapCacheRef.current.get(cacheKey)
      if (cachedBitmap) {
        return Promise.resolve(cachedBitmap)
      }

      const inflightBitmap = bitmapInflightRef.current.get(cacheKey)
      if (inflightBitmap) {
        return inflightBitmap
      }

      const bitmapPromise = window.thesisAgent
        .renderPdfPageBitmap({
          filePath,
          pageNumber: targetPage,
          scale: targetScale,
          outputScale: targetOutputScale
        })
        .then((bitmap) => {
          bitmapCacheRef.current.set(cacheKey, bitmap)
          bitmapInflightRef.current.delete(cacheKey)
          return bitmap
        })
        .catch((error) => {
          bitmapInflightRef.current.delete(cacheKey)
          throw error
        })

      bitmapInflightRef.current.set(cacheKey, bitmapPromise)
      return bitmapPromise
    },
    [filePath, getBitmapCacheKey]
  )

  const reportSession = useCallback((): void => {
    if (!filePath || !onSessionChangeRef.current || pageCount === 0) {
      return
    }

    if (initialSessionRef.current && !hasRestoredScrollRef.current) {
      return
    }

    if (sessionReportFrameRef.current !== null) {
      window.cancelAnimationFrame(sessionReportFrameRef.current)
    }

    sessionReportFrameRef.current = window.requestAnimationFrame(() => {
      sessionReportFrameRef.current = null
      const stage = stageRef.current

      onSessionChangeRef.current?.({
        pageNumber,
        pageCount,
        scale,
        scrollLeft: stage?.scrollLeft ?? 0,
        scrollTop: stage?.scrollTop ?? 0,
        readingSeconds: readingSecondsRef.current,
        updatedAt: new Date().toISOString()
      })
    })
  }, [filePath, pageCount, pageNumber, scale])

  useEffect(() => {
    onSessionChangeRef.current = onSessionChange
  }, [onSessionChange])

  useEffect(() => {
    readingSecondsRef.current = Math.max(0, Math.floor(readingSeconds))
  }, [readingSeconds])

  useEffect(() => {
    reportSession()
  }, [reportSession])

  useEffect(() => {
    const updateWindowFocus = (): void => {
      setIsWindowFocused(document.hasFocus() && document.visibilityState === 'visible')
    }

    updateWindowFocus()
    window.addEventListener('focus', updateWindowFocus)
    window.addEventListener('blur', updateWindowFocus)
    document.addEventListener('visibilitychange', updateWindowFocus)

    return () => {
      window.removeEventListener('focus', updateWindowFocus)
      window.removeEventListener('blur', updateWindowFocus)
      document.removeEventListener('visibilitychange', updateWindowFocus)
      if (sessionReportFrameRef.current !== null) {
        window.cancelAnimationFrame(sessionReportFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isReadingTimerActive) {
      reportSession()
      return
    }

    const timer = window.setInterval(() => {
      setReadingSeconds((current) => {
        const next = current + 1
        readingSecondsRef.current = next

        if (next % readingReportIntervalSeconds === 0) {
          reportSession()
        }

        return next
      })
    }, 1000)

    return () => {
      window.clearInterval(timer)
      reportSession()
    }
  }, [isReadingTimerActive, reportSession])

  useEffect(() => {
    if (!contextMenuPosition) {
      return
    }

    const handlePointerDown = (): void => {
      setContextMenuPosition(null)
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setContextMenuPosition(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenuPosition])

  useEffect(() => {
    if (!focusedPdfSourceRegion) {
      setFocusingSourceRegionId('')
      return
    }

    setFocusingSourceRegionId(focusedPdfSourceRegion.id)
    if (focusSourceRegionTimerRef.current !== null) {
      window.clearTimeout(focusSourceRegionTimerRef.current)
    }
    focusSourceRegionTimerRef.current = window.setTimeout(() => {
      setFocusingSourceRegionId((current) => (current === focusedPdfSourceRegion.id ? '' : current))
      focusSourceRegionTimerRef.current = null
    }, 900)
  }, [focusedPdfSourceRegion, focusedPdfSourceRegionNonce])

  useEffect(() => {
    return () => {
      if (focusSourceRegionTimerRef.current !== null) {
        window.clearTimeout(focusSourceRegionTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    initialSessionRef.current = session
    hasRestoredScrollRef.current = false
    pageProxyCacheRef.current.clear()
    textContentCacheRef.current.clear()
    bitmapCacheRef.current.clear()
    bitmapInflightRef.current.clear()

    if (!filePath) {
      setDocumentProxy(null)
      setPageNumber(1)
      setScale(clampScale(pdfEditorSettings?.defaultScale ?? 1))
      setPageCount(0)
      setPageSize(null)
      setAnnotations([])
      setAnnotationHistory([])
      setActiveTool(pdfEditorSettings?.defaultTool ?? 'select')
      setRenderMode(pdfEditorSettings?.defaultRenderMode ?? 'compatibility')
      setBrowseMode(pdfEditorSettings?.defaultBrowseMode ?? 'page')
      setActiveSelection(null)
      setSelectedAnnotationId(null)
      setBitmapPageDataUrl('')
      setIsOverviewOpen(false)
      setReadingSeconds(0)
      readingSecondsRef.current = 0
      setIsReaderEngaged(false)
      setError('')
      return
    }

    let cancelled = false
    let loadedDocument: PDFDocumentProxy | undefined
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined
    const initialSession = initialSessionRef.current
    const initialReadingSeconds = Math.max(0, Math.floor(initialSession?.readingSeconds ?? 0))

    async function loadPdf(): Promise<void> {
      setIsLoading(true)
      setError('')
      setDocumentProxy(null)
      setPageSize(null)
      setPageCount(0)
      setScale(clampScale(initialSession?.scale ?? pdfEditorSettings?.defaultScale ?? 1))
      setAnnotations([])
      setAnnotationHistory([])
      setActiveTool(pdfEditorSettings?.defaultTool ?? 'select')
      setRenderMode(pdfEditorSettings?.defaultRenderMode ?? 'compatibility')
      setBrowseMode(pdfEditorSettings?.defaultBrowseMode ?? 'page')
      setActiveSelection(null)
      setSelectedAnnotationId(null)
      setIsOverviewOpen(false)
      setReadingSeconds(initialReadingSeconds)
      readingSecondsRef.current = initialReadingSeconds
      setIsReaderEngaged(false)
      onStatus(`Loading PDF: ${fileName}`)

      try {
        const data = await window.thesisAgent.readPdfFile(filePath)
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(data),
          cMapPacked: true,
          cMapUrl: `${pdfjsResourceBaseUrl}cmaps/`,
          disableFontFace: false,
          standardFontDataUrl: `${pdfjsResourceBaseUrl}standard_fonts/`,
          useSystemFonts: true,
          wasmUrl: `${pdfjsResourceBaseUrl}wasm/`,
          useWorkerFetch: false
        })

        loadedDocument = await loadingTask.promise

        if (cancelled) {
          await loadedDocument.destroy()
          return
        }

        setDocumentProxy(loadedDocument)
        setPageNumber(Math.min(loadedDocument.numPages, Math.max(1, Math.floor(initialSession?.pageNumber ?? 1))))
        setPageCount(loadedDocument.numPages)
        onStatus(`Opened ${fileName} (${loadedDocument.numPages} pages)`)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load PDF'
        if (!cancelled) {
          setError(message)
          setDocumentProxy(null)
          setPageCount(0)
          onStatus(message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      if (loadingTask) {
        void loadingTask.destroy()
      } else if (loadedDocument) {
        void loadedDocument.destroy()
      }
    }
  }, [documentReloadKey, filePath, fileName, onStatus])

  useEffect(() => {
    setContextMenuPosition(null)
  }, [filePath, pageNumber, browseMode])

  useEffect(() => {
    if (browseMode !== 'page' || !documentProxy || !canvasRef.current || !textLayerRef.current || !pageRef.current) {
      return
    }

    let cancelled = false
    let renderTask: RenderTask | undefined
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | undefined

    async function renderPage(): Promise<void> {
      const canvas = canvasRef.current
      const pageElement = pageRef.current
      const textLayerElement = textLayerRef.current
      if (!canvas || !pageElement || !textLayerElement || !documentProxy) {
        return
      }

      setIsRendering(true)
      setError('')
      setActiveSelection(null)
      setIsNoteComposerOpen(false)

      try {
        const outputScale = getCanvasOutputScale()
        setBitmapPageDataUrl('')

        const page = await getCachedPdfPage(pageNumber)
        if (cancelled) {
          return
        }

        const viewport = page.getViewport({ scale })
        const canvasMetrics = createCanvasMetrics(viewport.width, viewport.height, outputScale)
        const totalScaleFactor = viewport.scale
        const context = canvas.getContext('2d')
        let usedPdfjsCanvas = renderMode === 'pdfjs'

        if (!context) {
          throw new Error('Canvas context is not available.')
        }

        setPageSize({
          width: canvasMetrics.pageWidth,
          height: canvasMetrics.pageHeight
        })

        pageElement.style.width = `${canvasMetrics.pageWidth}px`
        pageElement.style.height = `${canvasMetrics.pageHeight}px`
        pageElement.style.setProperty('--total-scale-factor', `${totalScaleFactor}`)
        pageElement.style.setProperty('--scale-round-x', `${canvasMetrics.scaleRoundX}px`)
        pageElement.style.setProperty('--scale-round-y', `${canvasMetrics.scaleRoundY}px`)
        canvas.width = canvasMetrics.canvasWidth
        canvas.height = canvasMetrics.canvasHeight
        canvas.style.width = `${canvasMetrics.pageWidth}px`
        canvas.style.height = `${canvasMetrics.pageHeight}px`
        textLayerElement.innerHTML = ''
        textLayerElement.style.width = `${canvasMetrics.pageWidth}px`
        textLayerElement.style.height = `${canvasMetrics.pageHeight}px`
        textLayerElement.style.setProperty('--total-scale-factor', `${totalScaleFactor}`)
        textLayerElement.style.setProperty('--scale-round-x', `${canvasMetrics.scaleRoundX}px`)
        textLayerElement.style.setProperty('--scale-round-y', `${canvasMetrics.scaleRoundY}px`)

        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, canvasMetrics.canvasWidth, canvasMetrics.canvasHeight)

        const textContentPromise = getCachedTextContent(pageNumber)

        if (renderMode === 'compatibility') {
          try {
            const bitmap = await getCachedBitmap(pageNumber, scale, outputScale)

            if (cancelled) {
              return
            }

            setBitmapPageDataUrl(bitmap.imageDataUrl)
          } catch (bitmapError) {
            if (cancelled) {
              return
            }

            const fallbackMessage = bitmapError instanceof Error ? bitmapError.message : 'Compatibility rendering unavailable'
            usedPdfjsCanvas = true
            setBitmapPageDataUrl('')
            onStatus(`Compatibility rendering unavailable, fell back to PDF.js. ${fallbackMessage}`)
          }
        }

        if (usedPdfjsCanvas) {
          const pageRenderTask = page.render({
            canvas,
            canvasContext: context,
            ...(canvasMetrics.transform ? { transform: canvasMetrics.transform } : {}),
            viewport
          })
          renderTask = pageRenderTask

          await pageRenderTask.promise
        }

        if (cancelled) {
          return
        }

        const textContent = await textContentPromise
        if (cancelled) {
          return
        }

        textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerElement,
          viewport
        })

        await textLayer.render()

        if (!cancelled) {
          const initialSession = initialSessionRef.current
          if (!hasRestoredScrollRef.current && initialSession && stageRef.current) {
            hasRestoredScrollRef.current = true
            window.requestAnimationFrame(() => {
              if (!cancelled && stageRef.current) {
                stageRef.current.scrollLeft = initialSession.scrollLeft
                stageRef.current.scrollTop = initialSession.scrollTop
                reportSession()
              }
            })
          }

          const rendererLabel = renderMode === 'compatibility' && !usedPdfjsCanvas ? '图像渲染' : 'PDF.js'
          onStatus(`Page ${pageNumber} / ${documentProxy.numPages}, zoom ${Math.round(scale * 100)}%, ${rendererLabel}`)
        }
      } catch (renderError) {
        if (!cancelled && !(renderError instanceof Error && renderError.name === 'RenderingCancelledException')) {
          const message = renderError instanceof Error ? renderError.message : '渲染 PDF 页面失败'
          setError(message)
          onStatus(message)
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false)
        }
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      if (renderTask) {
        renderTask.cancel()
      }
      textLayer?.cancel()
    }
  }, [
    browseMode,
    documentProxy,
    filePath,
    getBitmapCacheKey,
    getCachedBitmap,
    getCachedPdfPage,
    getCachedTextContent,
    onStatus,
    pageNumber,
    renderMode,
    reportSession,
    scale
  ])

  useEffect(() => {
    if (!documentProxy || pageCount === 0) {
      return
    }

    const outputScale = getCanvasOutputScale()
    const neighborPages = [pageNumber - 1, pageNumber + 1].filter((targetPage) => targetPage >= 1 && targetPage <= pageCount)

    neighborPages.forEach((targetPage) => {
      void getCachedPdfPage(targetPage)
      void getCachedTextContent(targetPage)

      if (renderMode === 'compatibility') {
        void getCachedBitmap(targetPage, scale, outputScale).catch(() => undefined)
      }
    })
  }, [documentProxy, getCachedBitmap, getCachedPdfPage, getCachedTextContent, pageCount, pageNumber, renderMode, scale])

  useEffect(() => {
    if (isNoteComposerOpen) {
      noteInputRef.current?.focus()
    }
  }, [isNoteComposerOpen])

  const zoomTo = useCallback((nextScale: number, anchor?: ZoomAnchor): void => {
    const stage = stageRef.current
    const stageRect = stage?.getBoundingClientRect()
    const resolvedAnchor =
      anchor ?? (stageRect ? { clientX: stageRect.left + stageRect.width / 2, clientY: stageRect.top + stageRect.height / 2 } : undefined)

    setScale((currentScale) => {
      const clampedScale = clampScale(nextScale)
      if (Math.abs(clampedScale - currentScale) < 0.001) {
        return currentScale
      }

      if (stage && stageRect && resolvedAnchor) {
        const anchorOffsetX = resolvedAnchor.clientX - stageRect.left
        const anchorOffsetY = resolvedAnchor.clientY - stageRect.top
        const contentX = stage.scrollLeft + anchorOffsetX
        const contentY = stage.scrollTop + anchorOffsetY
        const ratio = clampedScale / currentScale

        window.requestAnimationFrame(() => {
          stage.scrollLeft = contentX * ratio - anchorOffsetX
          stage.scrollTop = contentY * ratio - anchorOffsetY
        })
      }

      return clampedScale
    })
  }, [])

  const zoomBy = useCallback(
    (delta: number, anchor?: ZoomAnchor): void => {
      zoomTo(scale + delta, anchor)
    },
    [scale, zoomTo]
  )

  const reloadDocument = useCallback((): void => {
    const stage = stageRef.current
    initialSessionRef.current = {
      pageNumber,
      pageCount,
      scale,
      scrollLeft: stage?.scrollLeft ?? 0,
      scrollTop: stage?.scrollTop ?? 0,
      readingSeconds: readingSecondsRef.current
    }
    hasRestoredScrollRef.current = false
    setDocumentReloadKey((current) => current + 1)
    onStatus('Reloading PDF and clearing render cache')
  }, [onStatus, pageCount, pageNumber, scale])

  const toggleRenderMode = useCallback((): void => {
    const nextMode: PdfRenderMode = renderMode === 'compatibility' ? 'pdfjs' : 'compatibility'
    setRenderMode(nextMode)
    onStatus(nextMode === 'compatibility' ? 'Switched to compatibility rendering' : 'Switched to PDF.js rendering')
  }, [onStatus, renderMode])

  const resetZoom = useCallback((): void => {
    zoomTo(1)
  }, [zoomTo])

  const scrollToPageInStage = useCallback((targetPage: number, behavior: ScrollBehavior = 'smooth'): void => {
    const stage = stageRef.current
    const pageElement = stage?.querySelector<HTMLElement>(`[data-pdf-scroll-page="${targetPage}"]`)
    if (!stage || !pageElement) {
      return
    }

    const stageRect = stage.getBoundingClientRect()
    const pageRect = pageElement.getBoundingClientRect()
    const top = stage.scrollTop + pageRect.top - stageRect.top - 18

    stage.scrollTo({
      top: Math.max(0, top),
      behavior
    })
  }, [])

  const goToPage = useCallback(
    (nextPage: number): void => {
      if (pageCount === 0) {
        return
      }

      const targetPage = Math.min(pageCount, Math.max(1, nextPage))
      setPageNumber(targetPage)

      if (browseMode === 'scroll') {
        window.requestAnimationFrame(() => scrollToPageInStage(targetPage))
      }
    },
    [browseMode, pageCount, scrollToPageInStage]
  )

  useEffect(() => {
    if (!session || pageCount === 0) {
      return
    }

    // Keep the dependency list shape fixed so HMR does not inherit a variable-length array.
    const targetPage = Math.min(pageCount, Math.max(1, Math.floor(sessionPageNumber)))
    setPageNumber((currentPageNumber) => {
      if (targetPage === currentPageNumber) {
        return currentPageNumber
      }

      return targetPage
    })

    if (browseMode === 'scroll') {
      window.requestAnimationFrame(() => scrollToPageInStage(targetPage, 'smooth'))
    }
  }, [browseMode, pageCount, scrollToPageInStage, session, sessionPageNumber])

  const clearTextSelection = useCallback((): void => {
    window.getSelection()?.removeAllRanges()
    setActiveSelection(null)
    setIsNoteComposerOpen(false)
    setNoteDraft('')
  }, [])

  const toggleOverview = useCallback((): void => {
    if (!filePath || pageCount === 0) {
      return
    }

    const next = !isOverviewOpen
    setIsOverviewOpen(next)
    onStatus(next ? 'Opened PDF overview' : 'Closed PDF overview')
  }, [filePath, isOverviewOpen, onStatus, pageCount])

  const selectBrowseMode = useCallback(
    (nextMode: PdfBrowseMode): void => {
      if (nextMode === browseMode) {
        return
      }

      clearTextSelection()
      setIsOverviewOpen(false)
      setBrowseMode(nextMode)
      onStatus(nextMode === 'scroll' ? 'Switched to continuous scroll' : 'Switched to page flip')

      if (nextMode === 'scroll') {
        window.requestAnimationFrame(() => scrollToPageInStage(pageNumber, 'auto'))
      }
    },
    [browseMode, clearTextSelection, onStatus, pageNumber, scrollToPageInStage]
  )

  const syncScrollPageFromPosition = useCallback((): void => {
    if (browseMode !== 'scroll') {
      return
    }

    const stage = stageRef.current
    if (!stage) {
      return
    }

    const stageRect = stage.getBoundingClientRect()
    const anchorY = stageRect.top + stageRect.height * 0.42
    const pages = Array.from(stage.querySelectorAll<HTMLElement>('[data-pdf-scroll-page]'))
    let nearestPage = pageNumber
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const pageElement of pages) {
      const page = Number(pageElement.dataset.pdfScrollPage)
      if (!Number.isFinite(page)) {
        continue
      }

      const rect = pageElement.getBoundingClientRect()
      const pageCenter = rect.top + rect.height / 2
      const distance = Math.abs(pageCenter - anchorY)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPage = page
      }
    }

    if (nearestPage !== pageNumber) {
      setPageNumber(nearestPage)
    }
  }, [browseMode, pageNumber])

  const commitAnnotation = useCallback(
    (
      selection: PdfSelectionSnapshot,
      kind: AnnotationKind,
      color: PdfAnnotationColor,
      opacity = activeOpacity,
      thickness = activeThickness,
      note?: string
    ): void => {
      const id = createId('annotation')
      const now = new Date().toISOString()
      const annotation: PdfAnnotation = {
        id,
        paperId,
        pageNo: selection.pageNo,
        kind,
        color,
        opacity,
        thickness,
        rects: normalizeAnnotationRects(selection.rects),
        selectedText: selection.text,
        note: note?.trim() || undefined,
        sourceRef: {
          ...selection.sourceRef,
          annotationId: id
        },
        createdAt: now
      }

      setAnnotations((current) => [...current, annotation])
      setAnnotationHistory((current) => [...current, id])
      setSelectedAnnotationId(kind === 'note' ? id : null)
      onStatus(kind === 'note' ? 'Added PDF note' : 'Added PDF highlight')
    },
    [activeOpacity, activeThickness, onStatus, paperId]
  )

  const captureCurrentSelection = useCallback((): void => {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)
    const textLayerElement = findSelectionTextLayer(selection, range, stageRef.current)
    const pageElement = textLayerElement?.closest<HTMLElement>('[data-pdf-page-container="true"]') ?? null

    if (!textLayerElement || !pageElement) {
      return
    }

    const text = normalizeSelectedText(selection.toString())
    if (!text || range.collapsed) {
      setActiveSelection(null)
      setIsNoteComposerOpen(false)
      return
    }

    const pageBox = pageElement.getBoundingClientRect()
    const rects = getNormalizedRects(range, pageBox)
    if (rects.length === 0) {
      return
    }

    const anchor = getSelectionAnchor(rects)
    const firstRect = rects[0]
    const selectedPageNumber = parsePageNumber(textLayerElement.dataset.pdfPageNumber ?? pageElement.dataset.pdfPageNumber, pageNumber)
    const selectionSnapshot: PdfSelectionSnapshot = {
      paperId,
      pageNo: selectedPageNumber,
      text,
      rects,
      anchor,
      sourceRef: {
        type: 'pdf_selection',
        paperId,
        pageNo: selectedPageNumber,
        rect: firstRect,
        textHash: createStableHash(text),
        quote: text
      }
    }

    if (activeTool === 'highlight') {
      commitAnnotation(selectionSnapshot, 'highlight', activeColor, activeOpacity, activeThickness)
      selection.removeAllRanges()
      setActiveSelection(null)
      setIsNoteComposerOpen(false)
      setSelectedAnnotationId(null)
      return
    }

    setActiveSelection(selectionSnapshot)
    setIsNoteComposerOpen(false)
    setSelectedAnnotationId(null)
    onStatus(`Selected ${text.length} characters, ready to copy or annotate`)
  }, [activeColor, activeOpacity, activeThickness, activeTool, commitAnnotation, onStatus, pageNumber, paperId])

  const copySelection = useCallback(async (): Promise<void> => {
    const text = activeSelection?.text ?? normalizeSelectedText(window.getSelection()?.toString() ?? '')
    if (!text) {
      onStatus('No PDF selection available to copy')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      onStatus('Copied selected PDF text')
    } catch {
      const copied = document.execCommand('copy')
      onStatus(copied ? 'Copied selected PDF text' : 'Copy failed, use Ctrl+C')
    }
  }, [activeSelection, onStatus])

  const explainSelection = useCallback(async (): Promise<void> => {
    if (!activeSelection || selectionExplainLoading) {
      return
    }

    const requestId = selectionExplainRequestRef.current + 1
    selectionExplainRequestRef.current = requestId
    setSelectionExplainLoading(true)
    setSelectionExplainResult(null)
    setSelectionExplainError('')
    onStatus('正在获取选区释义/翻译')

    try {
      const result = await onExplainSelection(activeSelection)
      if (selectionExplainRequestRef.current !== requestId) {
        return
      }

      setSelectionExplainResult(result)
      onStatus(result.route === 'dictionary' ? '已返回本地词典释义' : result.route === 'translation' ? '已返回选区翻译' : '已返回选区处理结果')
    } catch (error) {
      if (selectionExplainRequestRef.current !== requestId) {
        return
      }

      const message = error instanceof Error ? error.message : '选区释义/翻译失败'
      setSelectionExplainError(message)
      onStatus(message)
    } finally {
      if (selectionExplainRequestRef.current === requestId) {
        setSelectionExplainLoading(false)
      }
    }
  }, [activeSelection, onExplainSelection, onStatus, selectionExplainLoading])

  const copySelectionExplainResult = useCallback(async (): Promise<void> => {
    if (!selectionExplainResult) {
      return
    }

    const text = formatSelectionExplainResult(selectionExplainResult)
    if (!text) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      onStatus('已复制释义/翻译结果')
    } catch {
      onStatus('复制释义/翻译结果失败')
    }
  }, [onStatus, selectionExplainResult])

  const startPdfSelectionDrag = useCallback((event: ReactDragEvent<HTMLDivElement>): void => {
    if (!activeSelection || !filePath) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest('button, textarea')) {
      event.preventDefault()
      return
    }

    const payload = createPdfExcerptDropPayload({
      filePath,
      pageNo: activeSelection.pageNo,
      text: activeSelection.text,
      sourceRef: activeSelection.sourceRef
    })

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(pdfExcerptDragMimeType, JSON.stringify(payload))
    event.dataTransfer.setData('text/plain', activeSelection.text)
    onStatus('拖动当前 PDF 选区到笔记可生成摘录节点')
  }, [activeSelection, filePath, onStatus])

  const addAnnotation = useCallback(
    (
      kind: AnnotationKind,
      color: PdfAnnotationColor,
      opacity = activeOpacity,
      note?: string,
      thickness = activeThickness
    ): void => {
      if (!activeSelection) {
        onStatus('Please select PDF text first')
        return
      }

      commitAnnotation(activeSelection, kind, color, opacity, thickness, note)
    },
    [activeOpacity, activeSelection, activeThickness, commitAnnotation, onStatus]
  )

  const addHighlight = useCallback(
    (color = activeColor, opacity = activeOpacity): void => {
      addAnnotation('highlight', color, opacity)
      clearTextSelection()
    },
    [activeColor, activeOpacity, addAnnotation, clearTextSelection]
  )

  const openNoteComposer = useCallback((): void => {
    if (!activeSelection) {
      onStatus('Please select PDF text first')
      return
    }

    setNoteDraft('')
    setIsNoteComposerOpen(true)
  }, [activeSelection, onStatus])

  const saveNote = useCallback((): void => {
    addAnnotation('note', activeColor, activeOpacity, noteDraft)
    clearTextSelection()
  }, [activeColor, activeOpacity, addAnnotation, clearTextSelection, noteDraft])

  const undoLastAnnotation = useCallback((): void => {
    const lastAnnotationId = annotationHistory.at(-1)

    if (!lastAnnotationId) {
      onStatus('No annotations to undo')
      return
    }

    setAnnotationHistory((current) =>
      current.at(-1) === lastAnnotationId
        ? current.slice(0, -1)
        : current.filter((annotationId) => annotationId !== lastAnnotationId)
    )
    setAnnotations((items) => items.filter((annotation) => annotation.id !== lastAnnotationId))
    setSelectedAnnotationId((currentId) => (currentId === lastAnnotationId ? null : currentId))
    onStatus('Undid last annotation')
  }, [annotationHistory, onStatus])

  const selectHighlightColor = useCallback(
    (color: PdfAnnotationColor): void => {
      setActiveColor(color)
      onStatus('Switched highlight color')
    },
    [onStatus]
  )

  const updateHighlightOpacity = useCallback(
    (opacity: number): void => {
      setActiveOpacity(opacity)
      onStatus(`Highlight opacity ${Math.round(opacity * 100)}%`)
    },
    [onStatus]
  )

  const updateHighlightThickness = useCallback(
    (thickness: number): void => {
      setActiveThickness(clampHighlightThickness(thickness))
      onStatus(`Highlight thickness ${Math.round(thickness * 100)}%`)
    },
    [onStatus]
  )

  const addCurrentColorToPresets = useCallback((): void => {
    setPresetColors((current) => [activeColor, ...current.filter((color) => !isSameColor(color, activeColor))].slice(0, 4))
    onStatus('Added preset highlight color')
  }, [activeColor, onStatus])

  const selectMouseTool = useCallback((): void => {
    setActiveTool('select')
    onStatus('Switched to mouse selection tool')
    clearTextSelection()
    onStatus('Switched to mouse selection tool')
  }, [clearTextSelection, onStatus])

  const selectHighlightTool = useCallback((): void => {
    setActiveTool('highlight')
    onStatus('Switched to highlight tool; dragging text will auto-highlight')
    setColorPickerAnchor(null)
    clearTextSelection()
    onStatus('Switched to highlight tool')
  }, [clearTextSelection, onStatus])

  const handleSelectionMouseUp = useCallback((): void => {
    window.setTimeout(captureCurrentSelection, 0)
  }, [captureCurrentSelection])

  const handleSelectionKeyUp = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.shiftKey || event.key === 'Enter') {
        window.setTimeout(captureCurrentSelection, 0)
      }
    },
    [captureCurrentSelection]
  )

  const engageReader = useCallback((): void => {
    setIsReaderEngaged(true)
  }, [])

  const disengageReader = useCallback((): void => {
    setIsReaderEngaged(false)
  }, [])

  const handleReaderBlur = useCallback((event: ReactFocusEvent<HTMLDivElement>): void => {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsReaderEngaged(false)
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current

    if (!stage || !isActive) {
      return
    }

    const handleStageWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      event.preventDefault()
      zoomBy(event.deltaY < 0 ? 0.1 : -0.1, {
        clientX: event.clientX,
        clientY: event.clientY
      })
    }

    const wheelOptions: AddEventListenerOptions = { passive: false }
    stage.addEventListener('wheel', handleStageWheel, wheelOptions)

    return () => {
      stage.removeEventListener('wheel', handleStageWheel, wheelOptions)
    }
  }, [filePath, isActive, zoomBy])

  const handleStageScroll = useCallback((): void => {
    syncScrollPageFromPosition()
    reportSession()
  }, [reportSession, syncScrollPageFromPosition])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 1 || !stageRef.current) {
      return
    }

    event.preventDefault()
    stageRef.current.setPointerCapture(event.pointerId)
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: stageRef.current.scrollLeft,
      scrollTop: stageRef.current.scrollTop
    }
    setIsPanning(true)
  }, [])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const panState = panStateRef.current
      const stage = stageRef.current
      if (!panState || !stage) {
        return
      }

      event.preventDefault()
      stage.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX)
      stage.scrollTop = panState.scrollTop - (event.clientY - panState.startY)
      reportSession()
    },
    [reportSession]
  )

  const endPanning = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (panStateRef.current?.pointerId === event.pointerId && stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId)
    }

    if (panStateRef.current) {
      panStateRef.current = null
      setIsPanning(false)
    }
  }, [])

  const preventMiddleClickAutoScroll = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }, [])

  const openPdfContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    engageReader()
    setContextMenuPosition({
      left: event.clientX,
      top: event.clientY
    })
    setIsMineruMenuOpen(false)
    setIsMineruConfigOpen(false)
  }, [engageReader])

  const closePdfContextMenu = useCallback((): void => {
    setContextMenuPosition(null)
  }, [])

  const handleParseCurrentPageUnavailable = useCallback((): void => {
    closePdfContextMenu()
    onStatus('MinerU 当前页解析暂不可用：本地 PDF 实测 pageRange 仍会返回整篇结果')
  }, [closePdfContextMenu, onStatus])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const hasCommandModifier = event.ctrlKey || event.metaKey

      if (hasCommandModifier) {
        if (key === '=' || key === '+') {
          event.preventDefault()
          zoomBy(zoomStep)
          return
        }

        if (key === '-') {
          event.preventDefault()
          zoomBy(-zoomStep)
          return
        }

        if (key === '0') {
          event.preventDefault()
          resetZoom()
          return
        }

        if (key === 'z') {
          event.preventDefault()
          undoLastAnnotation()
          return
        }
      }

      if (key === 'escape') {
        if (isOverviewOpen) {
          setIsOverviewOpen(false)
          return
        }

        if (activeTool === 'highlight') {
          selectMouseTool()
        } else {
          clearTextSelection()
        }
        setSelectedAnnotationId(null)
        setColorPickerAnchor(null)
        return
      }

      if (key === 'pagedown') {
        event.preventDefault()
        goToPage(pageNumber + 1)
        return
      }

      if (key === 'pageup') {
        event.preventDefault()
        goToPage(pageNumber - 1)
        return
      }

      if (browseMode === 'page' && key === 'arrowright') {
        event.preventDefault()
        goToPage(pageNumber + 1)
        return
      }

      if (browseMode === 'page' && key === 'arrowleft') {
        event.preventDefault()
        goToPage(pageNumber - 1)
        return
      }

      if (key === 'home' && hasCommandModifier) {
        event.preventDefault()
        goToPage(1)
        return
      }

      if (key === 'end' && hasCommandModifier) {
        event.preventDefault()
        goToPage(pageCount)
        return
      }

      if (key === 'h') {
        event.preventDefault()
        if (activeSelection) {
          addHighlight()
        } else {
          selectHighlightTool()
        }
        return
      }

      if (key === 'v') {
        event.preventDefault()
        selectMouseTool()
        return
      }

      if (key === 'n' && activeSelection) {
        event.preventDefault()
        openNoteComposer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeSelection,
    activeTool,
    addHighlight,
    browseMode,
    clearTextSelection,
    goToPage,
    isOverviewOpen,
    isActive,
    openNoteComposer,
    pageCount,
    pageNumber,
    resetZoom,
    selectHighlightTool,
    selectMouseTool,
    undoLastAnnotation,
    zoomBy
  ])

  useEffect(() => {
    toolbarSignatureRef.current = ''

    return () => {
      toolbarSignatureRef.current = ''
      onToolbarChange?.(null)
    }
  }, [onToolbarChange])

  useEffect(() => {
    if (!onToolbarChange) {
      toolbarSignatureRef.current = ''
      return
    }

    if (!isActive) {
      if (toolbarSignatureRef.current !== 'inactive') {
        toolbarSignatureRef.current = 'inactive'
        onToolbarChange(null)
      }
      return
    }

    const toolbarSignature = [
      'active',
      pageNumber,
      pageCount,
      Math.round(scale * 1000),
      browseMode,
      renderMode,
      isOverviewOpen ? 1 : 0,
      isLoading ? 1 : 0,
      canGoPrevious ? 1 : 0,
      canGoNext ? 1 : 0,
      canZoomOut ? 1 : 0,
      canZoomIn ? 1 : 0,
      hasDocument ? 1 : 0
    ].join('|')

    if (toolbarSignatureRef.current === toolbarSignature) {
      return
    }

    toolbarSignatureRef.current = toolbarSignature

    onToolbarChange({
      state: {
        pageNumber,
        pageCount,
        scale,
        browseMode,
        renderMode,
        isOverviewOpen,
        isLoading,
        canGoPrevious,
        canGoNext,
        canZoomOut,
        canZoomIn,
        hasDocument
      },
      actions: {
        openPdf: onOpenPdf,
        reloadDocument,
        toggleOverview,
        goPrevious: () => goToPage(pageNumber - 1),
        goNext: () => goToPage(pageNumber + 1),
        zoomOut: () => zoomBy(-zoomStep),
        zoomReset: resetZoom,
        zoomIn: () => zoomBy(zoomStep),
        setBrowseModeScroll: () => selectBrowseMode('scroll'),
        setBrowseModePage: () => selectBrowseMode('page'),
        toggleRenderMode
      }
    })
  }, [
    browseMode,
    canGoNext,
    canGoPrevious,
    canZoomIn,
    canZoomOut,
    goToPage,
    hasDocument,
    isActive,
    isLoading,
    isOverviewOpen,
    onOpenPdf,
    onToolbarChange,
    pageCount,
    pageNumber,
    reloadDocument,
    renderMode,
    resetZoom,
    scale,
    selectBrowseMode,
    toggleOverview,
    toggleRenderMode,
    zoomBy
  ])

  return (
    <div className="editor-surface pdf-surface">
      <div className="toolbar pdf-toolbar">
        <button
          className={activeTool === 'select' ? 'pdf-tool-button active' : 'pdf-tool-button'}
          type="button"
          title="选择工具"
          aria-label="选择工具"
          aria-pressed={activeTool === 'select'}
          onClick={selectMouseTool}
        >
          <span className="pdf-pointer-icon" aria-hidden="true" />
        </button>
        <button
          className={activeTool === 'highlight' ? 'pdf-tool-button active' : 'pdf-tool-button'}
          type="button"
          title="标注工具"
          aria-label="标注工具"
          aria-pressed={activeTool === 'highlight'}
          onClick={selectHighlightTool}
        >
          <span className="pdf-marker-icon" aria-hidden="true">
            <span style={{ backgroundColor: activeColor }} />
          </span>
        </button>
        <button
          className="pdf-tool-button"
          type="button"
          title="MinerU 设置"
          aria-label="MinerU 设置"
          disabled={!filePath || isLoading || isRendering}
          onClick={() => {
            setIsMineruConfigOpen((current) => !current)
            setIsMineruMenuOpen(false)
            setIsPptConfigOpen(false)
          }}
        >
          <span className="codicon codicon-settings-gear" aria-hidden="true" />
        </button>
        <button
          className="pdf-tool-button"
          type="button"
          title="MinerU 解析菜单"
          aria-label="MinerU 解析菜单"
          disabled={!filePath || isLoading || isRendering}
          onClick={() => {
            setIsMineruMenuOpen((current) => !current)
            setIsMineruConfigOpen(false)
            setIsPptConfigOpen(false)
          }}
        >
          <span className="codicon codicon-sparkle" aria-hidden="true" />
        </button>
        <button
          className="pdf-tool-button"
          type="button"
          title="生成论文脑图"
          aria-label="生成论文脑图"
          disabled={!filePath || isLoading || isRendering || isMindmapGenerating || !onGenerateMindmap}
          onClick={() => {
            setIsMineruConfigOpen(false)
            setIsMineruMenuOpen(false)
            setIsPptConfigOpen(false)
            onGenerateMindmap?.()
          }}
        >
          <span className="codicon codicon-type-hierarchy-sub" aria-hidden="true" />
        </button>
        <button
          className="pdf-tool-button pdf-full-translation-tool-button"
          type="button"
          title={hasMineruResult ? '全文翻译' : '请先用 MinerU 解析当前 PDF'}
          aria-label="全文翻译"
          disabled={!filePath || isLoading || isRendering || !hasMineruResult || !onOpenFullTranslation}
          onClick={() => {
            setIsMineruConfigOpen(false)
            setIsMineruMenuOpen(false)
            setIsPptConfigOpen(false)
            onOpenFullTranslation?.()
          }}
        >
          <span className="codicon codicon-globe" aria-hidden="true" />
        </button>
        <button
          className={isPptConfigOpen ? 'pdf-tool-button pdf-ppt-tool-button active' : 'pdf-tool-button pdf-ppt-tool-button'}
          type="button"
          title="生成 PPT"
          aria-label="生成 PPT"
          aria-pressed={isPptConfigOpen}
          disabled={!filePath || isLoading || isRendering || isPptGenerating || !pptSettings || !onGeneratePpt}
          onClick={() => {
            setIsPptConfigOpen((current) => !current)
            setIsMineruConfigOpen(false)
            setIsMineruMenuOpen(false)
          }}
        >
          <span className="pdf-ppt-label" aria-hidden="true">PPT</span>
        </button>
        <AnnotationColorPicker
          activeColor={activeColor}
          activeOpacity={activeOpacity}
          activeThickness={activeThickness}
          presetColors={presetColors}
          isOpen={colorPickerAnchor === 'toolbar'}
          disabled={activeTool !== 'highlight'}
          onToggleOpen={() => setColorPickerAnchor((current) => (current === 'toolbar' ? null : 'toolbar'))}
          onColorChange={selectHighlightColor}
          onOpacityChange={updateHighlightOpacity}
          onThicknessChange={updateHighlightThickness}
          onAddPreset={addCurrentColorToPresets}
        />
      </div>
      {isMineruConfigOpen && mineruSettings && onMineruSettingsChange ? (
        <div className="pdf-floating-panel mineru-config-panel">
          <div className="mineru-panel-title">
            <strong>MinerU 配置</strong>
            <button
              className="icon-button"
              type="button"
              title="关闭 MinerU 配置"
              onClick={() => setIsMineruConfigOpen(false)}
            >
              <span className="codicon codicon-close" aria-hidden="true" />
            </button>
          </div>
          <label>
            <span>API Key</span>
            <input
              type="password"
              value={mineruSettings.apiKey}
              placeholder="填写 MinerU API Key"
              spellCheck={false}
              onChange={(event) => onMineruSettingsChange({ apiKey: event.target.value })}
            />
          </label>
          <label>
            <span>解析方式</span>
            <select
              value={mineruSettings.modelVersion}
              onChange={(event) =>
                onMineruSettingsChange({
                  modelVersion: event.target.value as PersistedMineruSettingsState['modelVersion']
                })
              }
            >
              <option value="vlm">vlm</option>
              <option value="pipeline">pipeline</option>
              <option value="MinerU-HTML">MinerU-HTML</option>
            </select>
          </label>
          <div className="mineru-mode-hint">
            {mineruSettings.modelVersion === 'vlm'
              ? 'vlm：当前默认推荐，结构更完整，适合生成可点击框与笔记。'
              : mineruSettings.modelVersion === 'pipeline'
                ? 'pipeline：传统流程解析，适合较规则文档，但复杂版面可能不如 vlm。'
                : 'MinerU-HTML：偏 HTML 输出链路，适合保留结构，但当前工作流仍主要用结构化段落映射。'}
          </div>
          <label>
            <span>文档语言</span>
            <input
              value={mineruSettings.language}
              spellCheck={false}
              onChange={(event) => onMineruSettingsChange({ language: event.target.value })}
            />
          </label>
          <label>
            <span>页码范围</span>
            <input
              value={mineruSettings.pageRange}
              placeholder="例如 1-10"
              spellCheck={false}
              onChange={(event) => onMineruSettingsChange({ pageRange: event.target.value })}
            />
          </label>
          <label>
            <span>公开 URL（可选）</span>
            <input
              value={mineruSettings.sourceUrl}
              placeholder="仅在需要绕过本地上传时使用"
              spellCheck={false}
              onChange={(event) => onMineruSettingsChange({ sourceUrl: event.target.value })}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={mineruSettings.enableTable}
              onChange={(event) => onMineruSettingsChange({ enableTable: event.target.checked })}
            />
            <span>启用表格解析</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={mineruSettings.enableFormula}
              onChange={(event) => onMineruSettingsChange({ enableFormula: event.target.checked })}
            />
            <span>启用公式解析</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={mineruSettings.isOcr}
              onChange={(event) => onMineruSettingsChange({ isOcr: event.target.checked })}
            />
            <span>OCR 模式</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={mineruSettings.autoClean}
              onChange={(event) => onMineruSettingsChange({ autoClean: event.target.checked })}
            />
            <span>自动清洗非正文内容</span>
          </label>
          <div className="mineru-mode-hint">
            开启后会尽量移除与正文无关的区域，例如作者行、机构信息、期刊头、页码、收稿日期、脚注等。
          </div>
          <div className="mineru-style-grid">
            <label>
              <span>笔记字体</span>
              <select
                value={mineruSettings.noteStyle.fontFamily}
                onChange={(event) =>
                  onMineruSettingsChange({
                    noteStyle: {
                      ...mineruSettings.noteStyle,
                      fontFamily: event.target.value
                    }
                  })
                }
              >
                {noteFontFamilyOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>笔记字号</span>
              <select
                value={String(mineruSettings.noteStyle.fontSize)}
                onChange={(event) =>
                  onMineruSettingsChange({
                    noteStyle: {
                      ...mineruSettings.noteStyle,
                      fontSize: Number(event.target.value)
                    }
                  })
                }
              >
                {noteFontSizeOptions.map((fontSize) => (
                  <option key={fontSize} value={fontSize}>
                    {fontSize}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>背景颜色</span>
              <select
                value={mineruSettings.noteStyle.highlight}
                onChange={(event) =>
                  onMineruSettingsChange({
                    noteStyle: {
                      ...mineruSettings.noteStyle,
                      highlight: event.target.value
                    }
                  })
                }
              >
                {noteHighlightOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={mineruSettings.noteStyle.bold}
                onChange={(event) =>
                  onMineruSettingsChange({
                    noteStyle: {
                      ...mineruSettings.noteStyle,
                      bold: event.target.checked
                    }
                  })
                }
              />
              <span>加粗</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={mineruSettings.noteStyle.italic}
                onChange={(event) =>
                  onMineruSettingsChange({
                    noteStyle: {
                      ...mineruSettings.noteStyle,
                      italic: event.target.checked
                    }
                  })
                }
              />
              <span>倾斜</span>
            </label>
          </div>
        </div>
      ) : null}
      {isPptConfigOpen && pptSettings && onPptSettingsChange && onGeneratePpt ? (
        <div className="pdf-floating-panel ppt-config-panel">
          <div className="mineru-panel-title">
            <strong>PPT 生成</strong>
            <button
              className="icon-button"
              type="button"
              title="关闭 PPT 配置"
              onClick={() => setIsPptConfigOpen(false)}
            >
              <span className="codicon codicon-close" aria-hidden="true" />
            </button>
          </div>
          <div className="mineru-menu-hint">
            PPT 使用独立 AI 配置；这里快速调整本次生成的模型、思考强度和内容结构。
          </div>
          <label>
            <span>模型</span>
            <select
              value={pptSettings.model}
              onChange={(event) => onPptSettingsChange({ model: event.target.value })}
            >
              {pptToolbarModelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>思考强度</span>
            <select
              value={pptSettings.reasoningEffort}
              onChange={(event) => onPptSettingsChange({ reasoningEffort: event.target.value as ReasoningEffort })}
            >
              {pptReasoningOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>目标页数：{pptSettings.targetSlideCount} 页</span>
            <input
              type="range"
              min={8}
              max={12}
              step={1}
              value={pptSettings.targetSlideCount}
              onChange={(event) => onPptSettingsChange({ targetSlideCount: Number(event.target.value) })}
            />
          </label>
          <div className="ppt-config-grid">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={pptSettings.includeAgenda}
                onChange={(event) => onPptSettingsChange({ includeAgenda: event.target.checked })}
              />
              <span>包含目录页</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={pptSettings.includeReferences}
                onChange={(event) => onPptSettingsChange({ includeReferences: event.target.checked })}
              />
              <span>包含参考文献页</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={pptSettings.includeAppendix}
                onChange={(event) => onPptSettingsChange({ includeAppendix: event.target.checked })}
              />
              <span>包含附录页</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={pptSettings.includeNotes}
                onChange={(event) => onPptSettingsChange({ includeNotes: event.target.checked })}
              />
              <span>纳入关联笔记</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={pptSettings.includeAiAnswers}
                onChange={(event) => onPptSettingsChange({ includeAiAnswers: event.target.checked })}
              />
              <span>纳入 AI 回答</span>
            </label>
          </div>
          <button
            className="note-toolbar-button"
            type="button"
            disabled={!filePath || isPptGenerating}
            onClick={() => {
              setIsPptConfigOpen(false)
              onGeneratePpt()
            }}
          >
            {isPptGenerating ? '正在生成...' : '生成当前 PDF PPT'}
          </button>
        </div>
      ) : null}
      {isMineruMenuOpen ? (
        <div className="pdf-floating-panel mineru-menu-panel">
          <div className="mineru-panel-title">
            <strong>MinerU</strong>
            <span>
              {hasMineruResult ? (isMineruOverlayHidden ? '当前文档已解析 · 显示框已隐藏' : '当前文档已解析') : '当前文档未解析'}
            </span>
          </div>
          <button className="note-toolbar-button" type="button" onClick={onParseWithMineru}>
            {hasMineruResult ? '重新解析当前 PDF' : '解析当前 PDF'}
          </button>
          <button className="note-toolbar-button" type="button" disabled={!hasMineruResult} onClick={onGenerateMineruNote}>
            一键生成笔记
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            disabled={!hasMineruResult}
            onClick={isMineruOverlayHidden ? onShowMineruLinkedRegions : onHideMineruLinkedRegions}
          >
            {isMineruOverlayHidden ? '显示解析框' : '关闭显示框'}
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            disabled={!filePath}
            onClick={onMineruClearCurrentCache}
          >
            清除当前文档解析缓存
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            onClick={onMineruClearAllCaches}
          >
            清除所有文档解析缓存
          </button>
          <small className="mineru-menu-hint">
            {hasMineruResult
              ? `已缓存 ${mineruParseResult?.blocks.length ?? 0} 个解析区域，关闭显示框不会丢失解析结果。`
              : '先解析，再生成笔记或显示/关闭框。'}
          </small>
        </div>
      ) : null}

      {!filePath ? (
        <div className="pdf-placeholder">
          <span className="codicon codicon-file-pdf" aria-hidden="true" />
          <h1>打开一篇论文开始阅读</h1>
          <p>PDF.js 会在本地渲染页面，并保留选择、高亮、批注和 AI 提问入口。</p>
          <button className="primary-button compact" type="button" onClick={onOpenPdf}>
            <span className="codicon codicon-folder-opened" aria-hidden="true" />
            <span>打开 PDF</span>
          </button>
        </div>
      ) : (
        <>
        <div
          ref={stageRef}
          className={[
            'pdf-stage',
            `mode-${browseMode}`,
            isPanning ? 'panning' : '',
            activeTool === 'highlight' ? 'highlight-tool' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          tabIndex={0}
          onScroll={handleStageScroll}
          onFocusCapture={engageReader}
          onBlurCapture={handleReaderBlur}
          onPointerEnter={engageReader}
          onPointerLeave={disengageReader}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPanning}
          onPointerCancel={endPanning}
          onAuxClick={preventMiddleClickAutoScroll}
          onContextMenu={openPdfContextMenu}
        >
          {browseMode === 'scroll' ? (
              <PdfScrollStrip
              filePath={filePath}
              documentProxy={documentProxy}
              pageNumbers={pageNumbers}
              scale={scale}
              renderMode={renderMode}
              currentPageNumber={pageNumber}
              annotations={annotations}
              linkedNoteRegions={linkedNoteRegions}
              focusedPdfSourceRegionId={focusingSourceRegionId}
              onActivatePage={(targetPage) => {
                setPageNumber(targetPage)
                onStatus(`Jumped to page ${targetPage}`)
              }}
              onSelectionMouseUp={handleSelectionMouseUp}
              onSelectionKeyUp={handleSelectionKeyUp}
              onLinkedNoteRegionSelect={onLinkedNoteRegionSelect}
              onLinkedNoteRegionDragStart={startMineruRegionDrag}
            />
          ) : (
            <>
              <div className="pdf-page-nav-buttons" aria-hidden={pageCount === 0}>
                <button type="button" title="上一页" disabled={!canGoPrevious} onClick={() => goToPage(pageNumber - 1)}>
                  <span className="codicon codicon-chevron-left" aria-hidden="true" />
                </button>
                <button type="button" title="下一页" disabled={!canGoNext} onClick={() => goToPage(pageNumber + 1)}>
                  <span className="codicon codicon-chevron-right" aria-hidden="true" />
                </button>
              </div>
              <div className="pdf-page-shell">
                <div
                  ref={pageRef}
                  className="pdf-page"
                  data-pdf-page-container="true"
                  data-pdf-page-number={pageNumber}
                  style={pageStyle}
                  onMouseUp={handleSelectionMouseUp}
                  onKeyUp={handleSelectionKeyUp}
                >
                  {bitmapPageDataUrl && renderMode === 'compatibility' ? (
                    <img className="pdf-page-bitmap" src={bitmapPageDataUrl} alt="" aria-hidden="true" draggable={false} />
                  ) : null}
                  <canvas
                    ref={canvasRef}
                    className={[
                      'pdf-canvas',
                      isRendering ? 'rendering' : '',
                      bitmapPageDataUrl && renderMode === 'compatibility' ? 'hidden' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <div className="pdf-annotation-layer" aria-hidden="true">
                    {pageAnnotations.map((annotation) =>
                      normalizeAnnotationRects(annotation.rects).map((rect, index) => (
                        <span
                          key={`${annotation.id}-${index}`}
                          className={`pdf-annotation-mark ${annotation.kind}`}
                          style={annotationMarkStyle(annotation, rect)}
                        />
                      ))
                    )}
                  </div>
                  {pageLinkedNoteRegions.length > 0 ? (
                    <div className="pdf-linked-note-layer">
                      {pageLinkedNoteRegions.map((region) => (
                        <button
                          key={region.id}
                          className="pdf-linked-note-region"
                          data-focused={region.id === focusingSourceRegionId ? 'true' : undefined}
                          type="button"
                          draggable
                          title={region.label}
                          style={linkedNoteRegionStyle(region.rect)}
                          onDragStart={(event) => startMineruRegionDrag(event, region)}
                          onClick={() => onLinkedNoteRegionSelect?.(region)}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div
                    ref={textLayerRef}
                    className="textLayer pdf-text-layer"
                    data-pdf-page-number={pageNumber}
                    onMouseUp={handleSelectionMouseUp}
                    onKeyUp={handleSelectionKeyUp}
                  />
                  <div className="pdf-note-layer">
                    {pageAnnotations
                      .filter((annotation) => annotation.kind === 'note')
                      .map((annotation) => (
                        <button
                          key={annotation.id}
                          className={annotation.id === selectedAnnotationId ? 'annotation-pin active' : 'annotation-pin'}
                          type="button"
                          title={annotation.note || annotation.selectedText}
                          style={pinToStyle(annotation.rects[0])}
                          onClick={() => setSelectedAnnotationId((current) => (current === annotation.id ? null : annotation.id))}
                        >
                          <span className="codicon codicon-comment" aria-hidden="true" />
                        </button>
                      ))}
                  </div>

                  {activeSelection && pdfEditorSettings?.showSelectionPopover !== false && (
                    <div
                      className="selection-popover"
                      style={selectionPopoverStyle(activeSelection.anchor)}
                      draggable
                      onPointerDown={stopSelectionPopoverPointer}
                      onMouseUp={stopSelectionPopoverMouseUp}
                      onDragStart={startPdfSelectionDrag}
                    >
                      <div className="selection-popover-actions" onMouseDown={preventSelectionActionFocusSteal}>
                        <button
                          type="button"
                          title="复制"
                          onClick={(event) => {
                            event.stopPropagation()
                            void copySelection()
                          }}
                        >
                          <span className="codicon codicon-copy" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          title="批注"
                          onClick={(event) => {
                            event.stopPropagation()
                            openNoteComposer()
                          }}
                        >
                          <span className="codicon codicon-comment" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          title="询问 AI"
                          onClick={(event) => {
                            event.stopPropagation()
                            onAskSelection(activeSelection)
                          }}
                        >
                          <span className="codicon codicon-sparkle" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          title="释义/翻译"
                          onClick={(event) => {
                            event.stopPropagation()
                            void explainSelection()
                          }}
                        >
                          <span className="codicon codicon-book" aria-hidden="true" />
                        </button>
                      </div>
                      {isNoteComposerOpen && (
                        <div className="annotation-note-editor">
                          <textarea
                            ref={noteInputRef}
                            value={noteDraft}
                            rows={4}
                            placeholder="写下这条批注..."
                            spellCheck={false}
                            onChange={(event) => setNoteDraft(event.target.value)}
                          />
                          <div className="annotation-note-actions">
                            <button type="button" onClick={() => setIsNoteComposerOpen(false)}>
                              取消
                            </button>
                            <button type="button" onClick={saveNote}>
                              保存批注
                            </button>
                          </div>
                        </div>
                      )}
                      {renderSelectionExplainCard(
                        selectionExplainLoading,
                        selectionExplainResult,
                        selectionExplainError,
                        copySelectionExplainResult
                      )}
                    </div>
                  )}

                  {selectedAnnotationId && (
                    <AnnotationPreview
                      annotation={annotations.find((annotation) => annotation.id === selectedAnnotationId)}
                      onClose={() => setSelectedAnnotationId(null)}
                    />
                  )}

                  {(isLoading || isRendering) && <div className="pdf-loading">{isLoading ? '正在加载 PDF...' : '正在渲染...'}</div>}
                  {error && <div className="pdf-error">{error}</div>}
                </div>
              </div>
            </>
          )}
        </div>
        {isOverviewOpen ? (
          <PdfOverviewPanel
            filePath={filePath}
            documentProxy={documentProxy}
            pageNumbers={pageNumbers}
            currentPageNumber={pageNumber}
            renderMode={renderMode}
            onClose={() => setIsOverviewOpen(false)}
            onJumpToPage={(targetPage) => {
              setIsOverviewOpen(false)
              goToPage(targetPage)
            }}
          />
        ) : null}
        {contextMenuPosition ? (
          <div
            className="pdf-context-menu"
            role="menu"
            aria-label="PDF 页面菜单"
            style={{ left: `${contextMenuPosition.left}px`, top: `${contextMenuPosition.top}px` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              className="pdf-context-menu-item"
              type="button"
              role="menuitem"
              disabled
              title="暂未接入：当前 MinerU pageRange 实测仍返回整篇 PDF"
              onClick={handleParseCurrentPageUnavailable}
            >
              <span className="codicon codicon-sparkle" aria-hidden="true" />
              <span>解析当前页</span>
            </button>
            <button
              className="pdf-context-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                closePdfContextMenu()
                onCreatePdfNote?.()
              }}
            >
              <span className="codicon codicon-notebook" aria-hidden="true" />
              <span>新建笔记</span>
            </button>
            <button
              className="pdf-context-menu-item"
              type="button"
              role="menuitem"
              disabled={!hasMineruResult}
              onClick={() => {
                closePdfContextMenu()
                if (isMineruOverlayHidden) {
                  onShowMineruLinkedRegions?.()
                } else {
                  onHideMineruLinkedRegions?.()
                }
              }}
            >
              <span className="codicon codicon-eye-closed" aria-hidden="true" />
              <span>{isMineruOverlayHidden ? '显示解析框' : '关闭显示框'}</span>
            </button>
          </div>
        ) : null}
        </>
      )}
    </div>
  )
}

function renderSelectionExplainCard(
  isLoading: boolean,
  result: SelectionExplainResult | null,
  error: string,
  onCopy: () => Promise<void>
): ReactElement | null {
  if (isLoading) {
    return (
      <div className="selection-explain-card loading" onMouseDown={preventFocusSteal}>
        <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
        <span>正在生成释义/翻译...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="selection-explain-card error" onMouseDown={preventFocusSteal}>
        <div className="selection-explain-card-title">
          <span>处理失败</span>
        </div>
        <p>{error}</p>
      </div>
    )
  }

  if (!result) {
    return null
  }

  const modeLabel = result.route === 'dictionary' ? '词典释义' : result.route === 'translation' ? '翻译' : '回退结果'
  const dictionary = result.dictionary
  const translation = result.translation

  return (
    <div className={`selection-explain-card ${result.route}`} onMouseDown={preventFocusSteal}>
      <div className="selection-explain-card-title">
        <span>{modeLabel}</span>
        <div className="selection-explain-card-actions">
          {result.cached ? <span className="selection-explain-cache">缓存</span> : null}
          <button type="button" title="复制结果" onClick={() => void onCopy()}>
            <span className="codicon codicon-copy" aria-hidden="true" />
          </button>
        </div>
      </div>

      {dictionary ? (
        <div className="selection-explain-dictionary">
          <div className="selection-explain-headword">
            <strong>{dictionary.lemma}</strong>
            {dictionary.pos ? <span>{dictionary.pos}</span> : null}
          </div>
          {dictionary.senses.map((sense, index) => (
            <p key={sense.id ?? `${sense.zh}:${index}`}>
              {sense.pos ? <span className="selection-explain-pos">{sense.pos}</span> : null}
              {sense.zh}
            </p>
          ))}
          {dictionary.phrases.length > 0 ? (
            <div className="selection-explain-phrases">
              {dictionary.phrases.slice(0, 4).map((phrase) => (
                <div key={phrase.phrase}>
                  <span>{phrase.phrase}</span>
                  <strong>{phrase.translation}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {translation ? (
        <div className="selection-explain-translation">
          <p>{translation.targetText}</p>
        </div>
      ) : null}

      {result.fallbackReason ? <p className="selection-explain-fallback">{result.fallbackReason}</p> : null}
    </div>
  )
}

function formatSelectionExplainResult(result: SelectionExplainResult): string {
  if (result.dictionary) {
    const senses = result.dictionary.senses.map((sense) => `${sense.pos ? `${sense.pos} ` : ''}${sense.zh}`)
    const phrases = result.dictionary.phrases.map((phrase) => `${phrase.phrase}: ${phrase.translation}`)
    return [result.dictionary.lemma, ...senses, ...phrases].join('\n')
  }

  if (result.translation) {
    return result.translation.targetText
  }

  return result.fallbackReason ?? ''
}

function buildPdfPptModelOptions(currentModel: string, modelOptions: string[]): string[] {
  const normalizedCurrentModel = currentModel.trim()
  const normalizedOptions = modelOptions.map((model) => model.trim()).filter(Boolean)
  const options = normalizedCurrentModel ? [normalizedCurrentModel, ...normalizedOptions] : normalizedOptions

  return options.filter((model, index, allModels) => allModels.indexOf(model) === index)
}
