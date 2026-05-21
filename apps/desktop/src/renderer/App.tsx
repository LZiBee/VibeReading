import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
  WheelEvent as ReactWheelEvent
} from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import {
  countNoteTextCharacters,
  createNoteBlock,
  createNoteDocument,
  createFreeformNote,
  createPaperTextTemplateNote,
  createPdfSegmentScreenshotNote,
  getNoteBlockText,
  noteFontFamilyOptions,
  noteFontSizeOptions,
  noteHighlightOptions,
  noteBlockTypes,
  listNoteTemplateDefinitions,
  removeNoteDocumentBlock,
  noteToMarkdown,
  updateNoteBlockText,
  updateNoteBlockStyle,
  updateNoteBlockType,
  updateNoteDocumentBlocks
} from '@thesis-agent/notes'
import type { MediaNoteBlockContent, NoteBlock, NoteBlockStyle, NoteBlockType, NoteDocument } from '@thesis-agent/notes'
import { normalizeMineruParseResultSegments, type MineruParseBlock, type MineruParseResult, type SourceRef } from '@thesis-agent/shared'
import { createWorkbenchContext } from '@thesis-agent/workbench'
import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type {
  ClipboardImagePayload,
  PdfLayoutSegment,
  PersistedAiSettingsState,
  PersistedAppState,
  NoteExportFormat,
  PersistedMineruSettingsState,
  PersistedPdfViewState
} from '../preload/thesis-agent'
import type { MineruBlockDragPayload } from './app/mineruDrag'
import {
  activityItems,
  aiComposerDefaultHeight,
  aiComposerMinHeight,
  aiContextCurrentPageRadius,
  aiContextCurrentPageTextMaxChars,
  aiContextMaxExtractedPages,
  aiContextMaxNotes,
  aiContextNotesMaxChars,
  aiContextPaperTextMaxChars,
  defaultAiSettings,
  defaultLibrarySortState,
  defaultMineruSettings,
  modelOptions,
  noteBlockTypeOptions,
  pdfjsResourceBaseUrl,
  profileDisplayName
} from './app/constants'
import {
  closableDockPanelIds,
  completeDockLayout,
  dockPanelDragMimeType,
  dockPanelItems,
  filterClosableDockPanelIds,
  getDockDropPosition,
  getDockNodeDefaultSizes,
  getDockNodeKey,
  getDockNodeMinSize,
  getDockPanelGroupId,
  getDockPanelResizeHandleId,
  getDockPanelTitle,
  getDockResizableNodeId,
  insertPanelIntoDockLayout,
  initialDockLayout,
  isClosableDockPanelId,
  isDockPanelId,
  removePanelFromDockLayout,
  removePanelsFromDockLayout,
  shouldClearDropPreview
} from './app/dockLayout'
import {
  createEmptyLibraryStructure,
  createLibraryFolder,
  getRootLibraryPdfPaths,
  movePdfToLibraryFolder,
  movePdfToLibraryRoot,
  pruneLibraryStructure,
  toggleLibraryFolderExpanded
} from './app/libraryStructure'
import {
  appendTextAsNewParagraph,
  getMineruBlockPlainText,
  hasMineruBlockDragPayload,
  readMineruBlockDragPayload
} from './app/mineruDrag'
import { getAiConversationQuestionLabel, getAiConversationScopedMessages } from './app/sidebarUtils'
import type {
  ActiveAiConversationIdsByPaperPath,
  AiContextBudget,
  AiContextSelection,
  AiConversation,
  AiConversationsByPaperPath,
  AiGraphSelectTarget,
  AiPaperContext,
  AiPdfPageText,
  AiNoteContext,
  AiQuickAction,
  AttachmentItem,
  ChatMessage,
  ChatTurn,
  ClosableDockPanelId,
  DockDropPosition,
  DockDropPreview,
  DockLayoutNode,
  DockPanelId,
  DockSplitNode,
  EditorTab,
  FavoriteItem,
  FavoriteItemsByKey,
  FavoriteTarget,
  ImageAttachmentItem,
  LibrarySortMode,
  LibraryStructure,
  PdfFileInfoByPath,
  MineruSettings,
  NoteHistorySnapshot,
  NotesByPaperPath,
  OpenNoteIdsByPaperPath,
  PendingNoteCloseRequest,
  PendingNoteTemplateByPaperPath,
  PdfDisplayNamesByPath,
  PdfLinkedNoteRegion,
  PdfScreenshotLayoutSegment,
  PdfScreenshotRect,
  PdfScreenshotRenderedSegment,
  PdfViewStates,
  PrimaryView,
  ProfileActivityCell,
  ProfileNoteSummary,
  ProfileReadingItem,
  ReasoningEffort,
  RenameDialogRequest,
  ResolvedFavoriteItem,
  ScreenshotDragState,
  ScreenshotResizeHandle,
  ScreenshotSelectionRect,
  SelectedNoteIdsByPaperPath,
  WorkbenchLayoutDirection
} from './app/types'
import {
  EntryRowActionButton,
  FavoriteButton,
  PrimarySidebarCollapseButton,
  SectionHeader
} from './components/AppSharedControls'
import { EditorContent } from './components/editor/EditorContent'
import { NotePanelContent } from './components/note/NotePanelContent'
import { ProfileHomePage } from './components/profile/ProfileHomePage'
import { PrimaryViewContent } from './components/sidebar/SidebarViews'
import pdfWorkerSrc from './pdf.worker?worker&url'
import { PdfViewer, pdfRendererCacheKey } from './components/PdfViewer'
import type { PdfViewerToolbarBridge } from './components/PdfViewer'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export function App(): ReactElement {
  const [isStateLoaded, setIsStateLoaded] = useState(false)
  const [activeView, setActiveView] = useState<PrimaryView>('library')
  const [activeEditor, setActiveEditor] = useState<EditorTab>('pdf')
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [libraryPdfPaths, setLibraryPdfPaths] = useState<string[]>([])
  const [libraryStructure, setLibraryStructure] = useState<LibraryStructure>({
    folderOrder: [],
    foldersById: {}
  })
  const [openPdfPaths, setOpenPdfPaths] = useState<string[]>([])
  const [selectedPdfPath, setSelectedPdfPath] = useState<string>('')
  const [status, setStatus] = useState('Ready')
  const [activePdfToolbar, setActivePdfToolbar] = useState<PdfViewerToolbarBridge | null>(null)
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false)
  const [isAiHistoryOpen, setIsAiHistoryOpen] = useState(false)
  const [isPrimarySidebarCollapsed, setIsPrimarySidebarCollapsed] = useState(false)
  const [dockLayout, setDockLayout] = useState<DockLayoutNode>(initialDockLayout)
  const [hiddenDockPanels, setHiddenDockPanels] = useState<ClosableDockPanelId[]>([])
  const [pdfViewStates, setPdfViewStates] = useState<PdfViewStates>({})
  const [pdfDisplayNamesByPath, setPdfDisplayNamesByPath] = useState<PdfDisplayNamesByPath>({})
  const [notesByPaperPath, setNotesByPaperPath] = useState<NotesByPaperPath>({})
  const [savedNotesByPaperPath, setSavedNotesByPaperPath] = useState<NotesByPaperPath>({})
  const [selectedNoteIdsByPaperPath, setSelectedNoteIdsByPaperPath] = useState<SelectedNoteIdsByPaperPath>({})
  const [openNoteIdsByPaperPath, setOpenNoteIdsByPaperPath] = useState<OpenNoteIdsByPaperPath>({})
  const [pendingNoteTemplateByPaperPath, setPendingNoteTemplateByPaperPath] = useState<PendingNoteTemplateByPaperPath>({})
  const [pendingNoteCloseRequest, setPendingNoteCloseRequest] = useState<PendingNoteCloseRequest | null>(null)
  const [focusedNoteBlockRequest, setFocusedNoteBlockRequest] = useState<{
    filePath: string
    noteId: string
    blockId: string
    nonce: number
  } | null>(null)
  const [focusedPdfSourceRegion, setFocusedPdfSourceRegion] = useState<PdfLinkedNoteRegion | null>(null)
  const [focusedPdfSourceRegionNonce, setFocusedPdfSourceRegionNonce] = useState(0)
  const [renameDialogRequest, setRenameDialogRequest] = useState<RenameDialogRequest | null>(null)
  const [renameDialogValue, setRenameDialogValue] = useState('')
  const [renameDialogError, setRenameDialogError] = useState('')
  const [creatingScreenshotNotePath, setCreatingScreenshotNotePath] = useState('')
  const [aiConversationsByPaperPath, setAiConversationsByPaperPath] = useState<AiConversationsByPaperPath>({})
  const [activeAiConversationIdsByPaperPath, setActiveAiConversationIdsByPaperPath] =
    useState<ActiveAiConversationIdsByPaperPath>({})
  const [focusedAiMessageId, setFocusedAiMessageId] = useState('')
  const [favoriteItemsByKey, setFavoriteItemsByKey] = useState<FavoriteItemsByKey>({})
  const [aiSettings, setAiSettings] = useState<PersistedAiSettingsState>(defaultAiSettings)
  const [mineruSettings, setMineruSettings] = useState<PersistedMineruSettingsState>(defaultMineruSettings)
  const [mineruParseResultByPdfPath, setMineruParseResultByPdfPath] = useState<Record<string, MineruParseResult>>({})
  const [mineruCacheExistsByPdfPath, setMineruCacheExistsByPdfPath] = useState<Record<string, boolean>>({})
  const [hiddenMineruOverlayByPdfPath, setHiddenMineruOverlayByPdfPath] = useState<Record<string, boolean>>({})
  const [invalidatedSourceLinkKeysByPaperPath, setInvalidatedSourceLinkKeysByPaperPath] = useState<Record<string, string[]>>({})
  const [mineruNotice, setMineruNotice] = useState<{
    title: string
    message: string
    kind: 'info' | 'success' | 'error'
  } | null>(null)
  const [librarySortMode, setLibrarySortMode] = useState<LibrarySortMode>(defaultLibrarySortState)
  const [pdfFileInfoByPath, setPdfFileInfoByPath] = useState<PdfFileInfoByPath>({})
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)
  const [isScreenshotCaptureActive, setIsScreenshotCaptureActive] = useState(false)
  const mineruCacheLoadRef = useRef<Set<string>>(new Set())

  const mergeMineruNoteStyle = useCallback((patch: Partial<PersistedMineruSettingsState['noteStyle']>): void => {
    setMineruSettings((current) => ({
      ...current,
      noteStyle: {
        ...current.noteStyle,
        ...patch
      }
    }))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restoreAppState(): Promise<void> {
      try {
        const cachedState = await window.thesisAgent.readAppState()
        if (cancelled) {
          return
        }

        if (cachedState.workbench) {
          const restoredLibraryPdfPaths = normalizePdfPathList([
            ...(cachedState.workbench.libraryPdfPaths ?? []),
            ...cachedState.workbench.openPdfPaths,
            ...Object.keys(cachedState.notes?.notesByPaperPath ?? {}),
            ...Object.keys(cachedState.aiConversations?.conversationsByPaperPath ?? {}),
            ...Object.values(cachedState.favorites?.items ?? {}).map((item) => item.paperPath)
          ])

          setActiveView(cachedState.workbench.activeView)
          setActiveEditor(cachedState.workbench.activeEditor === 'profile' ? 'pdf' : cachedState.workbench.activeEditor)
          setIsProfileOpen(cachedState.workbench.activeEditor === 'profile')
          setLibraryPdfPaths(restoredLibraryPdfPaths)
          setLibraryStructure(cachedState.workbench.libraryStructure ?? createEmptyLibraryStructure())
          setOpenPdfPaths(cachedState.workbench.openPdfPaths)
          setSelectedPdfPath(cachedState.workbench.selectedPdfPath)
          setIsAiConfigOpen(cachedState.workbench.isAiConfigOpen)
          setIsAiHistoryOpen(cachedState.workbench.isAiHistoryOpen)
          setIsPrimarySidebarCollapsed(cachedState.workbench.isPrimarySidebarCollapsed)
          setDockLayout(completeDockLayout(cachedState.workbench.dockLayout))
          setHiddenDockPanels(filterClosableDockPanelIds(cachedState.workbench.hiddenDockPanels ?? []))
          setPdfViewStates(cachedState.workbench.pdfViewStates)
          setLibrarySortMode(cachedState.workbench.librarySort ?? defaultLibrarySortState)
          setPdfFileInfoByPath(cachedState.workbench.pdfFileInfoByPath ?? {})
          setPdfDisplayNamesByPath(cachedState.workbench.pdfDisplayNamesByPath ?? {})
        }

        if (cachedState.aiSettings) {
          setAiSettings({
            ...defaultAiSettings,
            ...cachedState.aiSettings
          })
        }

        if (cachedState.mineruSettings) {
          setMineruSettings({
            ...defaultMineruSettings,
            ...cachedState.mineruSettings
          })
        }

        if (cachedState.mineruResultsByPaperPath) {
          setMineruParseResultByPdfPath(normalizeMineruResultsByPaperPath(cachedState.mineruResultsByPaperPath))
        }

        if (cachedState.hiddenMineruOverlayByPaperPath) {
          setHiddenMineruOverlayByPdfPath(cachedState.hiddenMineruOverlayByPaperPath)
        }

        const restoredInvalidatedSourceLinkKeysByPaperPath = normalizeInvalidatedSourceLinkKeysByPaperPath(
          cachedState.invalidatedSourceLinkKeysByPaperPath
        )
        setInvalidatedSourceLinkKeysByPaperPath(restoredInvalidatedSourceLinkKeysByPaperPath)

        if (cachedState.notes) {
          const restoredNotesByPaperPath = applyInvalidatedSourceLinksToNotesByPaperPath(
            normalizeNotesByPaperPath(cachedState.notes.notesByPaperPath),
            restoredInvalidatedSourceLinkKeysByPaperPath
          )
          const restoredSavedNotesByPaperPath = applyInvalidatedSourceLinksToNotesByPaperPath(
            normalizeNotesByPaperPath(cachedState.notes.notesByPaperPath),
            restoredInvalidatedSourceLinkKeysByPaperPath
          )
          const restoredOpenNoteIdsByPaperPath = pruneOpenNoteIdsByPaperPath(
            cachedState.notes.openNoteIdsByPaperPath ??
              buildDefaultOpenNoteIdsByPaperPath(restoredNotesByPaperPath, cachedState.notes.selectedNoteIdsByPaperPath ?? {}),
            restoredNotesByPaperPath,
            normalizePdfPathList([
              ...(cachedState.workbench?.libraryPdfPaths ?? []),
              ...(cachedState.workbench?.openPdfPaths ?? []),
              ...Object.keys(restoredNotesByPaperPath)
            ])
          )
          setSavedNotesByPaperPath(restoredSavedNotesByPaperPath)
          setNotesByPaperPath(restoredNotesByPaperPath)
          setOpenNoteIdsByPaperPath(restoredOpenNoteIdsByPaperPath)
          setSelectedNoteIdsByPaperPath(
            pruneSelectedNoteIdsByPaperPath(
              cachedState.notes.selectedNoteIdsByPaperPath ?? {},
              restoredNotesByPaperPath,
              normalizePdfPathList([
                ...(cachedState.workbench?.libraryPdfPaths ?? []),
                ...(cachedState.workbench?.openPdfPaths ?? []),
                ...Object.keys(restoredNotesByPaperPath)
              ])
            )
          )
        }

        if (cachedState.aiConversations) {
          setAiConversationsByPaperPath(cachedState.aiConversations.conversationsByPaperPath)
          setActiveAiConversationIdsByPaperPath(cachedState.aiConversations.activeConversationIdsByPaperPath ?? {})
        }

        if (cachedState.favorites) {
          setFavoriteItemsByKey(normalizeFavoriteItemsByKey(cachedState.favorites.items))
        }

        if ((cachedState.workbench?.libraryPdfPaths?.length ?? 0) > 0 || (cachedState.workbench?.openPdfPaths.length ?? 0) > 0) {
          setStatus('已恢复上次工作台会话')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        console.warn('Failed to restore app state:', message)
        setStatus('恢复上次工作台会话失败，已使用默认布局')
      } finally {
        if (!cancelled) {
          setIsStateLoaded(true)
        }
      }
    }

    void restoreAppState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isStateLoaded) {
      return
    }

    const writeTimer = window.setTimeout(() => {
      const normalizedSavedNotesByPaperPath = normalizeNotesByPaperPath(savedNotesByPaperPath)
      const knownPdfPaths = normalizePdfPathList([
        ...libraryPdfPaths,
        ...openPdfPaths,
        ...Object.keys(normalizedSavedNotesByPaperPath),
        ...Object.keys(aiConversationsByPaperPath),
        ...Object.values(favoriteItemsByKey).map((item) => item.paperPath)
      ])
      const persistedOpenPdfPaths = openPdfPaths.filter((filePath) => knownPdfPaths.includes(filePath))
      const persistedSelectedPdfPath =
        selectedPdfPath && knownPdfPaths.includes(selectedPdfPath)
          ? selectedPdfPath
          : persistedOpenPdfPaths[0] ?? knownPdfPaths[0] ?? ''
      const nextState: PersistedAppState = {
        version: 1,
        updatedAt: new Date().toISOString(),
        workbench: {
          activeView,
          activeEditor,
          libraryPdfPaths: knownPdfPaths,
          libraryStructure: pruneLibraryStructure(libraryStructure, knownPdfPaths),
          openPdfPaths: persistedOpenPdfPaths,
          selectedPdfPath: persistedSelectedPdfPath,
          librarySort: librarySortMode,
          pdfFileInfoByPath: prunePdfFileInfoByPath(pdfFileInfoByPath, knownPdfPaths),
          isAiConfigOpen,
          isAiHistoryOpen,
          isPrimarySidebarCollapsed,
          dockLayout,
          hiddenDockPanels,
          pdfDisplayNamesByPath: prunePdfDisplayNamesByPath(pdfDisplayNamesByPath, knownPdfPaths),
          pdfViewStates: prunePdfViewStates(pdfViewStates, knownPdfPaths)
        },
        aiSettings,
        mineruSettings,
        mineruResultsByPaperPath: mineruParseResultByPdfPath,
        hiddenMineruOverlayByPaperPath: Object.fromEntries(
          Object.entries(hiddenMineruOverlayByPdfPath).filter(([filePath]) => Boolean(mineruParseResultByPdfPath[filePath]))
        ),
        invalidatedSourceLinkKeysByPaperPath: pruneInvalidatedSourceLinkKeysByPaperPath(
          invalidatedSourceLinkKeysByPaperPath,
          knownPdfPaths
        ),
        notes: {
          notesByPaperPath: pruneNotesByPaperPath(normalizedSavedNotesByPaperPath, knownPdfPaths),
          selectedNoteIdsByPaperPath: pruneSelectedNoteIdsByPaperPath(
            selectedNoteIdsByPaperPath,
            normalizedSavedNotesByPaperPath,
            knownPdfPaths
          ),
          openNoteIdsByPaperPath: pruneOpenNoteIdsByPaperPath(
            openNoteIdsByPaperPath,
            normalizedSavedNotesByPaperPath,
            knownPdfPaths
          )
        },
        aiConversations: {
          conversationsByPaperPath: pruneAiConversationsByPaperPath(aiConversationsByPaperPath, knownPdfPaths),
          activeConversationIdsByPaperPath: pruneActiveAiConversationIdsByPaperPath(
            activeAiConversationIdsByPaperPath,
            aiConversationsByPaperPath,
            knownPdfPaths
          )
        },
        favorites: {
          items: pruneFavoriteItemsByKey(favoriteItemsByKey, normalizedSavedNotesByPaperPath, aiConversationsByPaperPath)
        }
      }

      void window.thesisAgent.writeAppState(nextState).catch((error) => {
        console.warn('Failed to write app state:', error instanceof Error ? error.message : error)
      })
    }, 400)

    return () => window.clearTimeout(writeTimer)
  }, [
    activeEditor,
    activeView,
    activeAiConversationIdsByPaperPath,
    aiConversationsByPaperPath,
    aiSettings,
    dockLayout,
    favoriteItemsByKey,
    hiddenDockPanels,
    hiddenMineruOverlayByPdfPath,
    invalidatedSourceLinkKeysByPaperPath,
    isAiConfigOpen,
    isAiHistoryOpen,
    isPrimarySidebarCollapsed,
    isStateLoaded,
    libraryStructure,
    librarySortMode,
    libraryPdfPaths,
    openNoteIdsByPaperPath,
    openPdfPaths,
    pdfFileInfoByPath,
    pdfDisplayNamesByPath,
    pdfViewStates,
    mineruParseResultByPdfPath,
    mineruSettings,
    savedNotesByPaperPath,
    selectedNoteIdsByPaperPath,
    selectedPdfPath
  ])

  useEffect(() => {
    if (activeEditor !== 'pdf' || isProfileOpen) {
      setActivePdfToolbar(null)
    }
  }, [activeEditor, isProfileOpen])

  useEffect(() => {
    const handleScreenshotShortcut = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== 'a' ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isScreenshotCaptureActive
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setIsScreenshotCaptureActive(true)
      setStatus('进入截图模式：拖拽选择区域，松开后可调整边界，点击对勾完成截图')
    }

    window.addEventListener('keydown', handleScreenshotShortcut, true)
    return () => window.removeEventListener('keydown', handleScreenshotShortcut, true)
  }, [isScreenshotCaptureActive])

  const startScreenshotCapture = (): void => {
    setIsScreenshotCaptureActive(true)
    setStatus('进入截图模式：拖拽选择区域，松开后可调整边界，点击对勾完成截图')
  }

  const cancelScreenshotCapture = (): void => {
    setIsScreenshotCaptureActive(false)
    setStatus('已取消截图')
  }

  const captureScreenshotSelection = (rect: ScreenshotSelectionRect): void => {
    setIsScreenshotCaptureActive(false)
    window.setTimeout(() => {
      void window.thesisAgent.captureAppRegionToClipboard(rect).then(
        (image) => {
          setStatus(`截图已复制到剪切板：${image.width}×${image.height}，可粘贴到 AI 或笔记`)
        },
        (error) => {
          const message = error instanceof Error ? error.message : '截图失败'
          setStatus(message)
        }
      )
    }, 80)
  }

  const workbench = useMemo(() => {
    const context = createWorkbenchContext()

    context.commands.registerCommand({
      id: 'paper.open',
      title: 'Open PDF',
      category: 'Paper',
      run: async () => {
        const result = await window.thesisAgent.openPdf()
        const filePaths = result.filePaths.filter(Boolean)

        if (!result.canceled && filePaths.length > 0) {
          setLibraryPdfPaths((currentPaths) => [
            ...currentPaths,
            ...filePaths.filter((filePath) => !currentPaths.includes(filePath))
          ])
          setOpenPdfPaths((currentPaths) => [
            ...currentPaths,
            ...filePaths.filter((filePath) => !currentPaths.includes(filePath))
          ])
          setSelectedPdfPath(filePaths.at(-1) ?? '')
          setActiveEditor('pdf')
          setIsProfileOpen(false)
          setHiddenDockPanels((current) => current.filter((panelId) => panelId !== 'editor'))
          setStatus('Loading PDF')
        }
      }
    })

    context.commands.registerCommand({
      id: 'ai.askSelection',
      title: 'Ask AI',
      category: 'AI',
      run: () => {
        setStatus('AI Provider is not configured yet')
      }
    })

    return context
  }, [])

  const openRenameDialog = (request: RenameDialogRequest): void => {
    setRenameDialogRequest(request)
    setRenameDialogValue(request.initialValue)
    setRenameDialogError('')
  }

  const closeRenameDialog = (): void => {
    setRenameDialogRequest(null)
    setRenameDialogValue('')
    setRenameDialogError('')
  }

  const createLibraryFolderEntry = (): void => {
    openRenameDialog({
      kind: 'library-folder-create',
      title: '新建文件夹',
      description: '为左侧 Library 新建一个文件夹，用来整理 PDF。',
      label: '文件夹名称',
      initialValue: '新建文件夹',
      allowEmpty: false,
      emptyError: '文件夹名称不能为空'
    })
  }

  const openPdf = useCallback((): void => {
    void workbench.commands.executeCommand('paper.open')
  }, [workbench])

  const ensurePdfFileInfoLoaded = useCallback(async (filePath: string): Promise<void> => {
    if (!filePath) {
      return
    }

    if (pdfFileInfoByPath[filePath]) {
      return
    }

    try {
      const fileInfo = await window.thesisAgent.getPdfFileInfo(filePath)
      setPdfFileInfoByPath((current) => {
        if (current[filePath]) {
          return current
        }

        return {
          ...current,
          [filePath]: fileInfo
        }
      })
    } catch (error) {
      console.warn('Failed to read PDF file info:', error instanceof Error ? error.message : error)
    }
  }, [pdfFileInfoByPath])

  const ensurePaperOpen = (filePath: string): void => {
    if (!filePath) {
      return
    }

    setLibraryPdfPaths((currentPaths) => (currentPaths.includes(filePath) ? currentPaths : [...currentPaths, filePath]))
    setOpenPdfPaths((currentPaths) => (currentPaths.includes(filePath) ? currentPaths : [...currentPaths, filePath]))
    void ensurePdfFileInfoLoaded(filePath)
  }

  const currentWorkspacePdfPath = selectedPdfPath || openPdfPaths[0] || libraryPdfPaths[0] || ''
  const toggleFavorite = (target: FavoriteTarget, label: string): void => {
    const key = getFavoriteKey(target)
    const wasFavorite = Boolean(favoriteItemsByKey[key])

    setFavoriteItemsByKey((current) => {
      if (current[key]) {
        const next = { ...current }
        delete next[key]
        return next
      }

      return {
        ...current,
        [key]: {
          ...target,
          createdAt: new Date().toISOString()
        }
      }
    })
    setStatus(wasFavorite ? `已取消收藏：${label}` : `已收藏：${label}`)
  }

  const activatePrimaryView = (view: PrimaryView): void => {
    setActiveEditor('pdf')
    setIsProfileOpen(false)

    if (view === activeView && !isPrimarySidebarCollapsed) {
      setIsPrimarySidebarCollapsed(true)
      return
    }

    setActiveView(view)
    setIsPrimarySidebarCollapsed(false)
  }

  const openProfileHome = (): void => {
    setIsProfileOpen(true)
    setActivePdfToolbar(null)
    setIsPrimarySidebarCollapsed(true)
    setStatus('已打开个人主页')
  }

  const activatePdfTab = (filePath: string): void => {
    ensurePaperOpen(filePath)
    setSelectedPdfPath(filePath)
    setActiveEditor('pdf')
    setIsProfileOpen(false)
    showDockPanel('editor')
  }

  const beginNoteTemplateForPdf = (filePath: string): void => {
    if (!filePath) {
      setStatus('请先打开一个 PDF，再新增笔记')
      return
    }

    ensurePaperOpen(filePath)
    setSelectedPdfPath(filePath)
    setPendingNoteTemplateByPaperPath((current) => ({
      ...current,
      [filePath]: true
    }))
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: ''
    }))
    showDockPanel('note')
    setStatus('正在为当前 PDF 新增笔记')
  }

  const openNoteForPdf = (filePath: string, noteId?: string): void => {
    if (!filePath) {
      return
    }

    if (noteId === '') {
      beginNoteTemplateForPdf(filePath)
      return
    }

    ensurePaperOpen(filePath)
    setSelectedPdfPath(filePath)
    const nextNoteId =
      noteId ??
      getOpenNoteIdsForPaper(openNoteIdsByPaperPath, notesByPaperPath, filePath)[0] ??
      getPaperNotes(notesByPaperPath, filePath)[0]?.id ??
      ''

    setPendingNoteTemplateByPaperPath((current) => {
      if (!current[filePath]) {
        return current
      }

      const next = { ...current }
      delete next[filePath]
      return next
    })
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: nextNoteId
    }))

    if (nextNoteId) {
      setOpenNoteIdsByPaperPath((current) => {
        const currentIds = normalizeNoteIdList((current as Record<string, unknown>)[filePath])
        if (currentIds.includes(nextNoteId)) {
          return current
        }

        return {
          ...current,
          [filePath]: [...currentIds, nextNoteId]
        }
      })
    }

    showDockPanel('note')
  }

  const startNewNoteForCurrentPdf = (): void => {
    const filePath = currentWorkspacePdfPath
    beginNoteTemplateForPdf(filePath)
  }

  const createWholePdfNote = (filePath: string): void => {
    const currentFilePath = filePath || currentWorkspacePdfPath
    if (!currentFilePath) {
      setStatus('请先打开一个 PDF，再新建笔记')
      return
    }

    ensurePaperOpen(currentFilePath)
    setSelectedPdfPath(currentFilePath)
    showDockPanel('note')
    createTextTemplateNote(currentFilePath)
  }

  const showDockPanel = (panelId: ClosableDockPanelId): void => {
    setIsProfileOpen(false)
    setDockLayout((currentLayout) => completeDockLayout(currentLayout))
    setHiddenDockPanels((current) => current.filter((currentPanelId) => currentPanelId !== panelId))
    if (panelId === 'editor') {
      setActiveEditor('pdf')
    }
    setStatus(`已打开 ${getDockPanelTitle(panelId)} 栏`)
  }

  const closeDockPanel = (panelId: ClosableDockPanelId): void => {
    setHiddenDockPanels((current) => (current.includes(panelId) ? current : [...current, panelId]))
    setStatus(`${getDockPanelTitle(panelId)} 栏已关闭，可从 View 菜单重新打开`)
  }

  const focusNoteBlockInPanel = (filePath: string, noteId: string, blockId: string): void => {
    if (!filePath || !noteId || !blockId) {
      return
    }

    openNoteForPdf(filePath, noteId)
    setFocusedNoteBlockRequest({
      filePath,
      noteId,
      blockId,
      nonce: Date.now()
    })
    showDockPanel('note')
  }

  const updateAiSettings = useCallback((patch: Partial<PersistedAiSettingsState>): void => {
    setAiSettings((current) => ({
      ...current,
      ...patch
    }))
  }, [])

  const updateMineruSettings = useCallback((patch: Partial<PersistedMineruSettingsState>): void => {
    setMineruSettings((current) => ({
      ...current,
      ...patch
    }))
  }, [])

  const showMineruNotice = useCallback(
    (notice: { title: string; message: string; kind: 'info' | 'success' | 'error' }): void => {
      setMineruNotice(notice)
    },
    []
  )

  const ensureMineruResultLoaded = useCallback(
    async (filePath: string): Promise<MineruParseResult | null> => {
      if (!filePath) {
        return null
      }

      const existingResult = mineruParseResultByPdfPath[filePath]
      if (existingResult) {
        return existingResult
      }

      const cachedResult = await window.thesisAgent.readCachedMineruResult(filePath)
      if (!cachedResult) {
        return null
      }

      const normalizedResult = normalizeMineruParseResultSegments(cachedResult)
      setMineruParseResultByPdfPath((current) => ({
        ...current,
        [filePath]: normalizedResult
      }))
      setHiddenMineruOverlayByPdfPath((current) => ({
        ...current,
        [filePath]: current[filePath] ?? false
      }))
      return normalizedResult
    },
    [mineruParseResultByPdfPath]
  )

  const ensureMineruCacheStatusLoaded = useCallback(async (filePath: string): Promise<void> => {
    if (!filePath || mineruCacheExistsByPdfPath[filePath] !== undefined) {
      return
    }

    try {
      const exists = await window.thesisAgent.hasCachedMineruResult(filePath)
      setMineruCacheExistsByPdfPath((current) => {
        if (current[filePath] !== undefined) {
          return current
        }

        return {
          ...current,
          [filePath]: exists
        }
      })
    } catch (error) {
      console.warn('Failed to read MinerU cache status:', error instanceof Error ? error.message : error)
    }
  }, [mineruCacheExistsByPdfPath])

  const clearMineruStateForPdf = useCallback((filePath: string): void => {
    setMineruParseResultByPdfPath((current) => omitRecordKey(current, filePath))
    setMineruCacheExistsByPdfPath((current) => ({
      ...omitRecordKey(current, filePath),
      [filePath]: false
    }))
    setHiddenMineruOverlayByPdfPath((current) => omitRecordKey(current, filePath))
    setFocusedPdfSourceRegion((current) => (current?.paperPath === filePath ? null : current))
  }, [])

  useEffect(() => {
    if (!isStateLoaded) {
      return
    }

    libraryPdfPaths.forEach((filePath) => {
      if (!filePath || pdfFileInfoByPath[filePath]) {
        return
      }

      void ensurePdfFileInfoLoaded(filePath)
    })
  }, [ensurePdfFileInfoLoaded, isStateLoaded, libraryPdfPaths, pdfFileInfoByPath])

  useEffect(() => {
    if (!isStateLoaded) {
      return
    }

    libraryPdfPaths.forEach((filePath) => {
      void ensureMineruCacheStatusLoaded(filePath)
    })
  }, [ensureMineruCacheStatusLoaded, isStateLoaded, libraryPdfPaths])

  useEffect(() => {
    if (!isStateLoaded) {
      return
    }

    const candidatePdfPaths = normalizePdfPathList([
      selectedPdfPath,
      ...openPdfPaths
    ])

    candidatePdfPaths.forEach((filePath) => {
      if (!filePath || mineruParseResultByPdfPath[filePath] || mineruCacheLoadRef.current.has(filePath)) {
        return
      }

      mineruCacheLoadRef.current.add(filePath)
      void ensureMineruResultLoaded(filePath).finally(() => {
        mineruCacheLoadRef.current.delete(filePath)
      })
    })
  }, [ensureMineruResultLoaded, isStateLoaded, mineruParseResultByPdfPath, openPdfPaths, selectedPdfPath])

  useEffect(() => {
    if (!mineruNotice) {
      return
    }

    const timer = window.setTimeout(() => {
      setMineruNotice((current) => (current === mineruNotice ? null : current))
    }, mineruNotice.kind === 'error' ? 4200 : 2600)

    return () => window.clearTimeout(timer)
  }, [mineruNotice])

  const normalizeMineruLinkedRegions = useCallback((paperPath: string, note: NoteDocument, mineruBlockById: Map<string, MineruParseBlock>): PdfLinkedNoteRegion[] => {
    const regions: PdfLinkedNoteRegion[] = []

    for (const block of note.blocks) {
      const label = block.markdown.trim() || getNoteBlockText(block).trim() || note.title

      for (const sourceRef of block.sourceRefs) {
        if (sourceRef.type !== 'note_block' || sourceRef.mineruBlockId === undefined || isSourceLinkInvalidated(sourceRef)) {
          continue
        }

        const mineruBlockId = sourceRef.mineruBlockId
        const mineruBlock = mineruBlockById.get(mineruBlockId)
        const sourceSegments = mineruBlock
          ? getMineruBlockSourceSegments(mineruBlock)
          : sourceRef.rect && isValidPdfSourceRect(sourceRef.rect)
            ? [{ pageNo: sourceRef.pageNo ?? 1, rect: sourceRef.rect }]
            : []

        sourceSegments.forEach((segment, index) => {
          regions.push({
            id: `${paperPath}:${note.id}:${block.id}:${mineruBlockId}:${segment.pageNo}:${index}:${getSourceRefRectKey(segment.rect)}`,
            paperPath,
            noteId: note.id,
            noteBlockId: block.id,
            mineruBlockId,
            mineruBlock,
            pageNo: segment.pageNo,
            rect: segment.rect,
            rawType: mineruBlockId,
            label
          })
        })
      }
    }

    return regions
  }, [])

  const updatePdfViewState = useCallback((filePath: string, viewState: PersistedPdfViewState): void => {
    setPdfViewStates((current) => ({
      ...current,
      [filePath]: {
        ...current[filePath],
        ...viewState
      }
    }))
  }, [])

  const updateActivePdfToolbar = useCallback((toolbar: PdfViewerToolbarBridge | null): void => {
    setActivePdfToolbar((current) => (arePdfToolbarBridgesEqual(current, toolbar) ? current : toolbar))
  }, [])

  const closePdfTab = (filePath: string): void => {
    const closingIndex = openPdfPaths.indexOf(filePath)
    const nextPaths = openPdfPaths.filter((currentPath) => currentPath !== filePath)
    const wasSelected = selectedPdfPath === filePath

    setOpenPdfPaths(nextPaths)

    if (wasSelected) {
      const fallbackPath = nextPaths[Math.min(closingIndex, nextPaths.length - 1)] ?? ''
      if (fallbackPath) {
        setSelectedPdfPath(fallbackPath)
      }

      if (fallbackPath) {
        setActiveEditor('pdf')
      }
    }
    setStatus('已关闭 PDF 标签，左侧条目仍保留')
  }

  const renamePdfEntry = (filePath: string): void => {
    if (!filePath) {
      return
    }

    const currentDisplayName = getPdfDisplayName(filePath, pdfDisplayNamesByPath)
    openRenameDialog({
      kind: 'pdf',
      filePath,
      title: '重命名 PDF 条目',
      description: '这里仅修改工作台里的显示名称，不会改动本地 PDF 文件名。留空会恢复原始文件名。',
      label: '显示名称',
      initialValue: currentDisplayName,
      allowEmpty: true
    })
  }

  const toggleLibraryFolder = (folderId: string): void => {
    setLibraryStructure((current) => toggleLibraryFolderExpanded(current, folderId))
  }

  const moveLibraryPdfIntoFolder = (filePath: string, folderId: string): void => {
    setLibraryStructure((current) => movePdfToLibraryFolder(current, filePath, folderId))
  }

  const moveLibraryPdfToRoot = (filePath: string): void => {
    setLibraryStructure((current) => movePdfToLibraryRoot(current, filePath))
  }

  const deletePdfEntry = (filePath: string): void => {
    if (!filePath) {
      return
    }

    const displayName = getPdfDisplayName(filePath, pdfDisplayNamesByPath)
    const confirmed = window.confirm(
      `从工作台删除 PDF 条目「${displayName}」？\n\n不会删除本地 PDF 文件，但会移除这个条目的笔记、AI 对话和收藏引用。`
    )

    if (!confirmed) {
      return
    }

    const libraryIndex = libraryPdfPaths.indexOf(filePath)
    const closingIndex = openPdfPaths.indexOf(filePath)
    const nextLibraryPaths = libraryPdfPaths.filter((currentPath) => currentPath !== filePath)
    const nextPaths = openPdfPaths.filter((currentPath) => currentPath !== filePath)
    const fallbackPath =
      nextPaths[Math.min(Math.max(closingIndex, 0), nextPaths.length - 1)] ??
      nextLibraryPaths[Math.min(Math.max(libraryIndex, 0), nextLibraryPaths.length - 1)] ??
      ''

    setLibraryPdfPaths(nextLibraryPaths)
    setOpenPdfPaths(nextPaths)
    setSelectedPdfPath((current) => (current === filePath ? fallbackPath : current))
    setPdfViewStates((current) => omitRecordKey(current, filePath))
    setPdfFileInfoByPath((current) => omitRecordKey(current, filePath))
    setPdfDisplayNamesByPath((current) => omitRecordKey(current, filePath))
    setNotesByPaperPath((current) => omitRecordKey(current, filePath))
    setSavedNotesByPaperPath((current) => omitRecordKey(current, filePath))
    setSelectedNoteIdsByPaperPath((current) => omitRecordKey(current, filePath))
    setOpenNoteIdsByPaperPath((current) => omitRecordKey(current, filePath))
    setPendingNoteTemplateByPaperPath((current) => omitRecordKey(current, filePath))
    setAiConversationsByPaperPath((current) => omitRecordKey(current, filePath))
    setActiveAiConversationIdsByPaperPath((current) => omitRecordKey(current, filePath))
    setFavoriteItemsByKey((current) =>
      Object.fromEntries(Object.entries(current).filter(([, item]) => item.paperPath !== filePath))
    )
    setFocusedAiMessageId('')
    setStatus(`已从工作台删除 PDF 条目：${displayName}`)
  }

  const createAiConversationForPaper = (
    paperPath: string,
    options: {
      title?: string
      parentAnswerId?: string
      messages?: ChatMessage[]
      contextSelections?: AiContextSelection[]
    } = {}
  ): string => {
    if (!paperPath) {
      setStatus('请先打开一个 PDF，再新建 AI 对话')
      return ''
    }

    ensurePaperOpen(paperPath)
    const now = new Date().toISOString()
    const conversation: AiConversation = {
      id: createConversationId(),
      paperPath,
      title: options.title ?? deriveAiConversationTitle(options.messages ?? [], '新对话'),
      parentAnswerId: options.parentAnswerId,
      contextSelections: options.contextSelections ?? [],
      messages: options.messages ?? [],
      createdAt: now,
      updatedAt: now
    }

    setAiConversationsByPaperPath((current) => ({
      ...current,
      [paperPath]: [...(current[paperPath] ?? []), conversation]
    }))
    setActiveAiConversationIdsByPaperPath((current) => ({
      ...current,
      [paperPath]: conversation.id
    }))
    setSelectedPdfPath(paperPath)

    return conversation.id
  }

  const startNewAiConversationForCurrentPdf = (): void => {
    const paperPath = currentWorkspacePdfPath
    const conversationId = createAiConversationForPaper(paperPath, {
      contextSelections: createDefaultAiContextSelections(paperPath, pdfViewStates[paperPath], getPaperNotes(notesByPaperPath, paperPath))
    })

    if (!conversationId) {
      return
    }

    showDockPanel('ai')
    closeAiPopovers()
    setStatus('已新建 AI 对话')
  }

  const selectAiConversation = (paperPath: string, conversationId: string): void => {
    if (!paperPath || !conversationId) {
      return
    }

    ensurePaperOpen(paperPath)
    setSelectedPdfPath(paperPath)
    setActiveAiConversationIdsByPaperPath((current) => ({
      ...current,
      [paperPath]: conversationId
    }))
    setFocusedAiMessageId('')
  }

  const closeAiPopovers = (): void => {
    setIsAiConfigOpen(false)
    setIsAiHistoryOpen(false)
  }

  const selectAiConversationAndClosePopovers = (paperPath: string, conversationId: string): void => {
    selectAiConversation(paperPath, conversationId)
    closeAiPopovers()
  }

  const updateAiConversation = (conversationId: string, updater: (conversation: AiConversation) => AiConversation): void => {
    if (!conversationId) {
      return
    }

    setAiConversationsByPaperPath((current) => updateAiConversationById(current, conversationId, updater))
  }

  const addMineruContextSelectionToConversation = (payload: MineruBlockDragPayload): void => {
    const selection = createMineruContextSelection(payload)
    const activeConversationId = activeAiConversationIdsByPaperPath[payload.paperPath] ?? ''

    if (!activeConversationId) {
      createAiConversationForPaper(payload.paperPath, {
        contextSelections: [selection]
      })
      setStatus('已把 MinerU 解析内容加入上下文标签')
      return
    }

    updateAiConversation(activeConversationId, (conversation) => {
      const currentSelections = conversation.contextSelections ?? []
      const key = getAiContextSelectionKey(selection)
      const nextSelections = currentSelections.some((item) => getAiContextSelectionKey(item) === key)
        ? currentSelections
        : [...currentSelections, selection]

      return {
        ...conversation,
        contextSelections: nextSelections,
        updatedAt: new Date().toISOString()
      }
    })
    setStatus('已把 MinerU 解析内容加入上下文标签')
  }

  const branchAiConversationFromAnswer = (conversationId: string, answerId: string): void => {
    const sourceConversation = findAiConversationById(aiConversationsByPaperPath, conversationId)
    const answerIndex = sourceConversation?.messages.findIndex((message) => message.id === answerId && message.role === 'assistant') ?? -1

    if (!sourceConversation || answerIndex < 0) {
      setStatus('未找到可分支的 AI 回答')
      return
    }

    const seedMessages = sourceConversation.messages.slice(0, answerIndex + 1).map((message) => ({ ...message }))
    const trailingMessages = sourceConversation.messages.slice(answerIndex + 1).map((message) => ({ ...message }))
    const branchCount = (aiConversationsByPaperPath[sourceConversation.paperPath] ?? []).filter(
      (conversation) => conversation.parentAnswerId === answerId
    ).length
    const conversationTitle = `分支 ${branchCount + 1} · ${getMessagePreview(sourceConversation.messages[answerIndex].content, 18)}`

    if (!sourceConversation.parentAnswerId && trailingMessages.length > 0) {
      const archiveConversationId = createAiConversationForPaper(sourceConversation.paperPath, {
        title: deriveAiConversationTitle(trailingMessages, '原始后续'),
        parentAnswerId: answerId,
        messages: [...seedMessages, ...trailingMessages],
        contextSelections: sourceConversation.contextSelections ?? []
      })

      if (!archiveConversationId) {
        return
      }

      setAiConversationsByPaperPath((current) => updateAiConversationById(current, conversationId, (conversation) => ({
        ...conversation,
        messages: seedMessages,
        updatedAt: new Date().toISOString()
      })))
    }

    const branchConversationId = createAiConversationForPaper(sourceConversation.paperPath, {
      title: conversationTitle,
      parentAnswerId: answerId,
      messages: seedMessages,
      contextSelections: sourceConversation.contextSelections ?? []
    })

    if (!branchConversationId) {
      return
    }

    showDockPanel('ai')
    setIsAiHistoryOpen(false)
    setFocusedAiMessageId(answerId)
    setStatus('已从该回答创建分支对话')
  }

  const renameAiConversation = (conversationId: string): void => {
    const conversation = findAiConversationById(aiConversationsByPaperPath, conversationId)
    if (!conversation) {
      setStatus('未找到要重命名的 AI 对话')
      return
    }

    const fallbackTitle = deriveAiConversationTitle(conversation.messages, conversation.parentAnswerId ? '分支对话' : '新对话')
    openRenameDialog({
      kind: 'ai-conversation',
      conversationId,
      title: '重命名对话',
      description: '为当前 AI 对话设置一个更容易识别的标题。',
      label: '对话标题',
      initialValue: conversation.title || fallbackTitle,
      allowEmpty: false,
      emptyError: '对话标题不能为空'
    })
  }

  const collectAiConversationDeleteIds = (conversations: AiConversation[], conversationId: string): Set<string> => {
    const idsToDelete = new Set<string>([conversationId])
    const deletedAnswerIds = new Set<string>()
    let changed = true

    while (changed) {
      changed = false

      for (const conversation of conversations) {
        if (idsToDelete.has(conversation.id)) {
          for (const message of conversation.messages) {
            if (message.role === 'assistant') {
              deletedAnswerIds.add(message.id)
            }
          }
          continue
        }

        if (conversation.parentAnswerId && deletedAnswerIds.has(conversation.parentAnswerId)) {
          idsToDelete.add(conversation.id)
          changed = true
        }
      }
    }

    return idsToDelete
  }

  const deleteAiConversation = (conversationId: string): void => {
    const conversation = findAiConversationById(aiConversationsByPaperPath, conversationId)
    if (!conversation) {
      setStatus('未找到要删除的 AI 对话')
      return
    }

    const conversations = aiConversationsByPaperPath[conversation.paperPath] ?? []
    const conversationIdsToDelete = collectAiConversationDeleteIds(conversations, conversationId)
    const childBranchCount = Math.max(0, conversationIdsToDelete.size - 1)
    const title = conversation.title || deriveAiConversationTitle(conversation.messages, conversation.parentAnswerId ? '分支对话' : '新对话')
    const confirmed = window.confirm(
      `删除${conversation.parentAnswerId ? '分支' : '对话'}「${title}」？${
        childBranchCount > 0 ? `\n\n同时会删除 ${childBranchCount} 个子分支。` : ''
      }`
    )

    if (!confirmed) {
      return
    }

    const remainingConversations = conversations.filter((currentConversation) => !conversationIdsToDelete.has(currentConversation.id))
    const fallbackConversationId = remainingConversations[0]?.id ?? ''

    setAiConversationsByPaperPath((current) => {
      const currentConversations = current[conversation.paperPath] ?? []
      const currentIdsToDelete = collectAiConversationDeleteIds(currentConversations, conversationId)
      const nextConversations = currentConversations.filter((currentConversation) => !currentIdsToDelete.has(currentConversation.id))
      const next = { ...current }

      if (nextConversations.length > 0) {
        next[conversation.paperPath] = nextConversations
      } else {
        delete next[conversation.paperPath]
      }

      return next
    })
    setActiveAiConversationIdsByPaperPath((current) => {
      const next = { ...current }
      if (conversationIdsToDelete.has(current[conversation.paperPath] ?? '')) {
        if (fallbackConversationId) {
          next[conversation.paperPath] = fallbackConversationId
        } else {
          delete next[conversation.paperPath]
        }
      }
      return next
    })
    setFavoriteItemsByKey((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, item]) => item.type !== 'ai_answer' || !conversationIdsToDelete.has(item.conversationId))
      )
    )
    setFocusedAiMessageId('')
    setStatus(`已删除 AI ${conversation.parentAnswerId ? '分支' : '对话'}：${title}`)
  }

  const openAiConversationFromGraph = (target: AiGraphSelectTarget): void => {
    if (!target.paperPath) {
      return
    }

    ensurePaperOpen(target.paperPath)
    const conversation = findAiConversationById(aiConversationsByPaperPath, target.conversationId)
    const conversationId = conversation
      ? conversation.id
      : createAiConversationForPaper(target.paperPath, {
          title: 'Graph 对话'
        })

    if (!conversationId) {
      return
    }

    setSelectedPdfPath(target.paperPath)
    setActiveAiConversationIdsByPaperPath((current) => ({
      ...current,
      [target.paperPath]: conversationId
    }))
    setFocusedAiMessageId(target.messageId ?? '')
    closeAiPopovers()
    showDockPanel('ai')
    setStatus('已打开 Graph 对应的 AI 对话')
  }

  const createTextTemplateNote = (filePath: string): void => {
    if (!filePath) {
      return
    }

    const note = createNoteForPdf(filePath, getPaperNotes(notesByPaperPath, filePath).length + 1)

    setNotesByPaperPath((current) => ({
      ...current,
      [filePath]: [...getPaperNotes(current, filePath), note]
    }))
    setOpenNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: [...normalizeNoteIdList((current as Record<string, unknown>)[filePath]), note.id]
    }))
    setPendingNoteTemplateByPaperPath((current) => {
      if (!current[filePath]) {
        return current
      }

      const next = { ...current }
      delete next[filePath]
      return next
    })
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: note.id
    }))
    setStatus('已创建笔记草稿，请保存或继续编辑')
    setStatus('已创建论文笔记文字模板')
  }

  const createFreeformTemplateNote = (filePath: string): void => {
    if (!filePath) {
      return
    }

    const note = createFreeformNote({
      title: `${getFileStem(filePath)} 自由笔记`,
      paperId: `paper_${hashString(filePath)}`
    })

    setNotesByPaperPath((current) => ({
      ...current,
      [filePath]: [...getPaperNotes(current, filePath), note]
    }))
    setOpenNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: [...normalizeNoteIdList((current as Record<string, unknown>)[filePath]), note.id]
    }))
    setPendingNoteTemplateByPaperPath((current) => {
      if (!current[filePath]) {
        return current
      }

      const next = { ...current }
      delete next[filePath]
      return next
    })
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: note.id
    }))
    setStatus('已创建自由笔记')
  }

  const createScreenshotTemplateNote = (filePath: string): void => {
    if (!filePath || creatingScreenshotNotePath) {
      return
    }

    setCreatingScreenshotNotePath(filePath)
    setStatus('正在根据 PDF 生成分段截图笔记')
    const noteIndex = getPaperNotes(notesByPaperPath, filePath).length + 1

    void createScreenshotNoteForPdf(filePath, noteIndex).then(
      (note) => {
        setNotesByPaperPath((current) => ({
          ...current,
          [filePath]: [...getPaperNotes(current, filePath), note]
        }))
        setOpenNoteIdsByPaperPath((current) => ({
          ...current,
          [filePath]: [...normalizeNoteIdList((current as Record<string, unknown>)[filePath]), note.id]
        }))
        setPendingNoteTemplateByPaperPath((current) => {
          if (!current[filePath]) {
            return current
          }

          const next = { ...current }
          delete next[filePath]
          return next
        })
        setSelectedNoteIdsByPaperPath((current) => ({
          ...current,
          [filePath]: note.id
        }))
        setStatus(`已创建截图笔记草稿：${Math.max(0, (note.blocks.length - 1) / 2)} 个截图段`)
        setStatus(`已生成分段截图笔记：${Math.max(0, (note.blocks.length - 1) / 2)} 个截图段`)
      },
      (error) => {
        const message = error instanceof Error ? error.message : '生成分段截图笔记失败'
        setStatus(message)
        console.warn('Failed to create PDF screenshot note:', message)
      }
    ).finally(() => {
      setCreatingScreenshotNotePath('')
    })
  }

  const parseWithMineru = (filePath: string): void => {
    const currentFilePath = filePath || currentWorkspacePdfPath
    if (!currentFilePath) {
      setStatus('请先打开一个 PDF，再使用 MinerU 解析')
      return
    }

    const apiKey = mineruSettings.apiKey.trim()
    if (!apiKey) {
      setStatus('请先在 MinerU 配置中填写 API Key')
      showMineruNotice({
        title: 'MinerU 未配置',
        message: '请先打开 PDF 工具栏里的 MinerU 设置，填写 API Key 后再解析。',
        kind: 'error'
      })
      return
    }

    setStatus('正在使用 MinerU 精准解析当前 PDF')
    showMineruNotice({
      title: '正在解析',
      message: 'MinerU 已开始解析当前 PDF，请稍等。',
      kind: 'info'
    })
    void window.thesisAgent
      .parsePdfWithMineru({
        filePath: currentFilePath,
        apiKey,
        modelVersion: mineruSettings.modelVersion,
        language: mineruSettings.language,
        enableTable: mineruSettings.enableTable,
        enableFormula: mineruSettings.enableFormula,
        isOcr: mineruSettings.isOcr,
        autoClean: mineruSettings.autoClean,
        pageRange: mineruSettings.pageRange,
        sourceUrl: mineruSettings.sourceUrl || undefined
      })
      .then((result) => {
        const normalizedResult = normalizeMineruParseResultSegments(result)
        setMineruParseResultByPdfPath((current) => ({
          ...current,
          [currentFilePath]: normalizedResult
        }))
        setInvalidatedSourceLinkKeysByPaperPath((current) => omitRecordKey(current, currentFilePath))
        setMineruCacheExistsByPdfPath((current) => ({
          ...current,
          [currentFilePath]: true
        }))
        setHiddenMineruOverlayByPdfPath((current) => ({
          ...current,
          [currentFilePath]: false
        }))
        setStatus(`MinerU 解析完成：${normalizedResult.blocks.length} 个解析区域`)
        showMineruNotice({
          title: '解析完成',
          message: `已获得 ${normalizedResult.blocks.length} 个解析区域。你现在可以在菜单中生成笔记或关闭显示框。`,
          kind: 'success'
        })
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'MinerU 解析失败'
        setStatus(message)
        showMineruNotice({
          title: '解析失败',
          message,
          kind: 'error'
        })
      })
  }

  const upsertMineruNote = (filePath: string, note: NoteDocument): void => {
    setNotesByPaperPath((current) => ({
      ...current,
      [filePath]: upsertNoteForPaper(getPaperNotes(current, filePath), note)
    }))
    setSavedNotesByPaperPath((current) => ({
      ...current,
      [filePath]: upsertNoteForPaper(getPaperNotes(current, filePath), note)
    }))
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: note.id
    }))
    setOpenNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: [...normalizeNoteIdList((current as Record<string, unknown>)[filePath]), note.id].filter(
        (noteId, index, allNoteIds) => allNoteIds.indexOf(noteId) === index
      )
    }))
    setPendingNoteTemplateByPaperPath((current) => {
      if (!current[filePath]) {
        return current
      }

      const next = { ...current }
      delete next[filePath]
      return next
    })
    focusNoteBlockInPanel(filePath, note.id, note.blocks[0]?.id ?? '')
  }

  const generateMineruNote = (filePath: string): void => {
    const currentFilePath = filePath || currentWorkspacePdfPath
    if (!currentFilePath) {
      setStatus('当前 PDF 还没有可用的 MinerU 解析结果')
      return
    }

    void ensureMineruResultLoaded(currentFilePath).then((result) => {
      if (!result) {
        setStatus('当前 PDF 还没有可用的 MinerU 解析结果')
        return
      }

      setStatus('正在根据 MinerU 结果生成笔记，并截取图像区域')
      void enhanceMineruResultWithPdfScreenshots(currentFilePath, result).then(
        (enhancedResult) => {
          const note = createMineruNoteFromResult(currentFilePath, enhancedResult)
          upsertMineruNote(currentFilePath, note)
          setStatus(`已根据 MinerU 结果生成笔记：${note.blocks.length} 段内容`)
        },
        () => {
          const note = createMineruNoteFromResult(currentFilePath, result)
          upsertMineruNote(currentFilePath, note)
          setStatus(`已根据 MinerU 结果生成笔记：${note.blocks.length} 段内容，图像区域截图失败，已使用解析结果兜底`)
        }
      )
    })
  }

  const hideMineruLinkedRegions = (filePath: string): void => {
    const currentFilePath = filePath || currentWorkspacePdfPath
    if (!currentFilePath || !mineruParseResultByPdfPath[currentFilePath]) {
      return
    }

    setHiddenMineruOverlayByPdfPath((current) => ({
      ...current,
      [currentFilePath]: true
    }))
    setStatus('已关闭当前 PDF 的 MinerU 显示框')
  }

  const showMineruLinkedRegions = (filePath: string): void => {
    const currentFilePath = filePath || currentWorkspacePdfPath
    if (!currentFilePath) {
      return
    }

    void ensureMineruResultLoaded(currentFilePath).then((result) => {
      if (!result) {
        setStatus('当前 PDF 还没有可用的 MinerU 解析结果')
        return
      }

      setHiddenMineruOverlayByPdfPath((current) => ({
        ...current,
        [currentFilePath]: false
      }))
      setStatus('已重新显示当前 PDF 的 MinerU 显示框')
    })
  }

  const clearMineruCacheForPdf = useCallback((filePath: string): void => {
    const currentFilePath = filePath || currentWorkspacePdfPath
    if (!currentFilePath) {
      setStatus('请先打开一个 PDF，再清除解析缓存')
      return
    }

    void window.thesisAgent.clearCachedMineruResult(currentFilePath).then((cleared) => {
      clearMineruStateForPdf(currentFilePath)
      setStatus(cleared ? '已清除当前文档的 MinerU 解析缓存' : '当前文档没有可清除的 MinerU 解析缓存')
    }).catch((error) => {
      const message = error instanceof Error ? error.message : '清除当前文档解析缓存失败'
      setStatus(message)
    })
  }, [clearMineruStateForPdf, currentWorkspacePdfPath])

  const clearAllMineruCaches = useCallback((): void => {
    void window.thesisAgent.clearAllCachedMineruResults().then((count) => {
      setMineruParseResultByPdfPath({})
      setMineruCacheExistsByPdfPath({})
      setHiddenMineruOverlayByPdfPath({})
      setStatus(count > 0 ? `已清除 ${count} 份 MinerU 解析缓存` : '当前没有可清除的 MinerU 解析缓存')
    }).catch((error) => {
      const message = error instanceof Error ? error.message : '清除所有解析缓存失败'
      setStatus(message)
    })
  }, [])

  const createMineruNoteBlock = useCallback((noteId: string, block: MineruParseBlock, orderIndex: number, filePath: string): NoteBlock => {
    const text = block.text?.trim() ?? ''
    const type: NoteBlockType =
      block.type === 'chart'
        ? 'screenshot'
        : block.type === 'footnote'
          ? 'quote'
          : block.type === 'list'
            ? 'paragraph'
            : block.type === 'image'
              ? 'screenshot'
              : block.type === 'table'
                ? 'table'
                : block.type === 'equation'
                  ? 'formula'
                  : block.type === 'heading'
                    ? 'heading'
                    : 'paragraph'
    const content =
      block.type === 'heading'
        ? { text, level: block.headingLevel ?? 2 }
        : block.type === 'list'
          ? { text: block.listItems?.join('\n') ?? text }
          : block.type === 'equation'
            ? { latex: text }
            : block.type === 'table'
              ? { rows: block.tableRows ?? [[text]] }
              : block.type === 'image' || block.type === 'chart'
                ? {
                    src: block.imageDataUrl,
                    alt: (block.caption ?? text) || `${getMineruBlockPlainText(block)} p.${block.pageNo}`,
                    caption: block.caption ?? text,
                    pageNo: block.pageNo
                  }
                : block.type === 'footnote'
                  ? { text }
                  : { text }

    const createdBlock = createNoteBlock({
      noteId,
      orderIndex,
      type,
      content,
      style: buildMineruNoteBlockStyle(mineruSettings.noteStyle, {
        useBulletList: block.type === 'list'
      }),
      sourceRefs: []
    })
    const noteBlockId = getMineruNoteBlockId(noteId, block.id)

    return {
      ...createdBlock,
      id: noteBlockId,
      sourceRefs: createMineruBlockSourceRefs(noteBlockId, block, filePath, text || block.caption)
    }
  }, [mineruSettings.noteStyle])

  const createMineruNoteFromResult = useCallback((filePath: string, result: MineruParseResult): NoteDocument => {
    const noteId = `note_mineru_${hashString(filePath)}`
    const now = new Date().toISOString()
    const normalizedResult = normalizeMineruParseResultSegments(result)
    const blocks = normalizedResult.blocks.map((block, index) =>
      createMineruNoteBlock(noteId, block, index, filePath)
    )

    return createNoteDocument({
      title: normalizedResult.title ? `${normalizedResult.title} · MinerU 解析` : `${getFileStem(filePath)} MinerU 解析`,
      template: 'freeform',
      paperId: `paper_${hashString(filePath)}`,
      blocks,
      now
    })
  }, [createMineruNoteBlock])

  const createMineruResultLinkedRegions = useCallback((filePath: string, result: MineruParseResult): PdfLinkedNoteRegion[] => {
    const noteId = `note_mineru_${hashString(filePath)}`
    const noteTitle = result.title ? `${result.title} · MinerU 解析` : `${getFileStem(filePath)} MinerU 解析`
    const regions: PdfLinkedNoteRegion[] = []

    for (const block of result.blocks) {
      const noteBlockId = getMineruNoteBlockId(noteId, block.id)
      const label = getMineruBlockPlainText(block).trim() || noteTitle

      for (const segment of getMineruBlockSourceSegments(block)) {
        regions.push({
          id: `${filePath}:${noteId}:${noteBlockId}:${block.id}:${segment.pageNo}:${getSourceRefRectKey(segment.rect)}`,
          paperPath: filePath,
          noteId,
          noteBlockId,
          mineruBlockId: block.id,
          mineruBlock: block,
          pageNo: segment.pageNo,
          rect: segment.rect,
          rawType: block.id,
          label
        })
      }
    }

    return regions
  }, [])

  const currentPdfPath = selectedPdfPath && openPdfPaths.includes(selectedPdfPath) ? selectedPdfPath : openPdfPaths[0] ?? ''
  const currentPdfMineruResult = currentPdfPath ? mineruParseResultByPdfPath[currentPdfPath] : undefined
  const isCurrentPdfMineruOverlayHidden = currentPdfPath ? Boolean(hiddenMineruOverlayByPdfPath[currentPdfPath]) : false
  const currentPdfRawNotes = currentPdfPath ? (notesByPaperPath as Record<string, unknown>)[currentPdfPath] : undefined
  const currentPdfInvalidatedSourceLinkKeys = useMemo(
    () => normalizeSourceLinkKeyList(currentPdfPath ? invalidatedSourceLinkKeysByPaperPath[currentPdfPath] : undefined),
    [currentPdfPath, invalidatedSourceLinkKeysByPaperPath]
  )
  const currentPdfRawOpenNoteIds = currentPdfPath ? (openNoteIdsByPaperPath as Record<string, unknown>)[currentPdfPath] : undefined
  const currentPdfSelectedNoteCandidate = currentPdfPath ? selectedNoteIdsByPaperPath[currentPdfPath] ?? '' : ''
  const currentPdfNotes = useMemo(
    () => applyInvalidatedSourceLinksToNotes(normalizeNoteList(currentPdfRawNotes), currentPdfInvalidatedSourceLinkKeys),
    [currentPdfInvalidatedSourceLinkKeys, currentPdfPath, currentPdfRawNotes]
  )
  const currentPdfOpenNoteIds = useMemo(() => {
    const noteIdSet = new Set(currentPdfNotes.map((note) => note.id))
    return normalizeNoteIdList(currentPdfRawOpenNoteIds).filter((noteId) => noteIdSet.has(noteId))
  }, [currentPdfNotes, currentPdfRawOpenNoteIds])
  const currentPdfSelectedNoteId = useMemo(
    () => currentPdfSelectedNoteCandidate && currentPdfOpenNoteIds.includes(currentPdfSelectedNoteCandidate)
      ? currentPdfSelectedNoteCandidate
      : currentPdfOpenNoteIds[0] ?? '',
    [currentPdfOpenNoteIds, currentPdfSelectedNoteCandidate]
  )
  const currentPdfMineruBlockById = useMemo(
    () => new Map((currentPdfMineruResult?.blocks ?? []).map((block) => [block.id, block] as const)),
    [currentPdfMineruResult]
  )
  const currentPdfMineruResultLinkedRegions = useMemo(() => {
    if (!currentPdfPath || isCurrentPdfMineruOverlayHidden || !currentPdfMineruResult) {
      return []
    }

    // 解析结果区域单独缓存，避免每次编辑笔记时重新创建整份虚拟 MinerU 笔记。
    return createMineruResultLinkedRegions(currentPdfPath, currentPdfMineruResult)
  }, [createMineruResultLinkedRegions, currentPdfMineruResult, currentPdfPath, isCurrentPdfMineruOverlayHidden])
  const currentPdfNoteLinkedRegions = useMemo(() => {
    if (!currentPdfPath || isCurrentPdfMineruOverlayHidden || currentPdfNotes.length === 0) {
      return []
    }

    const dedupedRegions = new Map<string, PdfLinkedNoteRegion>()
    const upsertRegion = (region: PdfLinkedNoteRegion): void => {
      const key = getPdfLinkedRegionDedupeKey(region)
      const currentRegion = dedupedRegions.get(key)
      dedupedRegions.set(key, currentRegion ? mergePdfLinkedNoteRegion(currentRegion, region) : region)
    }

    const selectedNote = currentPdfSelectedNoteId ? currentPdfNotes.find((note) => note.id === currentPdfSelectedNoteId) : undefined

    currentPdfNotes
      .filter((note) => note.id !== currentPdfSelectedNoteId)
      .forEach((note) => {
        normalizeMineruLinkedRegions(currentPdfPath, note, currentPdfMineruBlockById).forEach(upsertRegion)
      })

    if (selectedNote) {
      normalizeMineruLinkedRegions(currentPdfPath, selectedNote, currentPdfMineruBlockById).forEach(upsertRegion)
    }

    return [...dedupedRegions.values()]
  }, [currentPdfMineruBlockById, currentPdfNotes, currentPdfPath, currentPdfSelectedNoteId, isCurrentPdfMineruOverlayHidden, normalizeMineruLinkedRegions])
  const currentPdfLinkedRegions = useMemo(() => {
    if (!currentPdfPath) {
      return []
    }

    const dedupedRegions = new Map<string, PdfLinkedNoteRegion>()
    const upsertRegion = (region: PdfLinkedNoteRegion): void => {
      const key = getPdfLinkedRegionDedupeKey(region)
      const currentRegion = dedupedRegions.get(key)
      dedupedRegions.set(key, currentRegion ? mergePdfLinkedNoteRegion(currentRegion, region) : region)
    }

    if (!isCurrentPdfMineruOverlayHidden) {
      // 先放入解析缓存里的完整区域，再用真实笔记区域覆盖标签，但保留可拖拽的 MinerU block。
      currentPdfMineruResultLinkedRegions.forEach(upsertRegion)
      currentPdfNoteLinkedRegions.forEach(upsertRegion)
    }

    const regions = [...dedupedRegions.values()]
    if (
      isCurrentPdfMineruOverlayHidden ||
      !focusedPdfSourceRegion ||
      focusedPdfSourceRegion.paperPath !== currentPdfPath
    ) {
      return regions
    }

    return regions.some((region) => region.id === focusedPdfSourceRegion.id) ? regions : [...regions, focusedPdfSourceRegion]
  }, [
    currentPdfMineruResultLinkedRegions,
    currentPdfNoteLinkedRegions,
    currentPdfPath,
    focusedPdfSourceRegion,
    isCurrentPdfMineruOverlayHidden
  ])

  const upsertNoteForPaper = (notes: NoteDocument[], note: NoteDocument): NoteDocument[] => {
    const existingIndex = notes.findIndex((currentNote) => currentNote.id === note.id)
    if (existingIndex >= 0) {
      const nextNotes = [...notes]
      nextNotes[existingIndex] = note
      return nextNotes
    }

    return [...notes, note]
  }

  const handleLinkedNoteRegionSelect = (region: PdfLinkedNoteRegion): void => {
    if (!region) {
      return
    }

    const notes = region.paperPath === currentPdfPath ? currentPdfNotes : getPaperNotes(notesByPaperPath, region.paperPath)
    const selectedNoteId = getSelectedOpenNoteIdForPaper(
      selectedNoteIdsByPaperPath,
      openNoteIdsByPaperPath,
      notesByPaperPath,
      region.paperPath
    )
    const currentNote = selectedNoteId ? notes.find((note) => note.id === selectedNoteId) : undefined
    const matchedBlock = currentNote ? findNoteBlockForPdfLinkedRegion(currentNote, region) : undefined

    if (!currentNote || !matchedBlock) {
      setStatus('当前笔记里没有对应片段')
      showMineruNotice({
        title: '没有对应片段',
        message: '当前笔记里没有对应片段。',
        kind: 'info'
      })
      return
    }

    focusNoteBlockInPanel(region.paperPath, currentNote.id, matchedBlock.id)
  }

  const handleNoteSourceJump = (filePath: string, noteId: string, blockId: string): void => {
    const note =
      filePath === currentPdfPath
        ? currentPdfNotes.find((currentNote) => currentNote.id === noteId)
        : getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)
    const block = note?.blocks.find((currentBlock) => currentBlock.id === blockId)
    const sourceRef = block?.sourceRefs.find(
      (currentSourceRef): currentSourceRef is SourceRef & { rect: NonNullable<SourceRef['rect']> } =>
        currentSourceRef.type === 'note_block' &&
        Boolean(currentSourceRef.rect) &&
        !isSourceLinkInvalidated(currentSourceRef)
    )
    const mineruBlock = sourceRef?.mineruBlockId ? mineruParseResultByPdfPath[filePath]?.blocks.find(
      (currentBlock) => currentBlock.id === sourceRef.mineruBlockId
    ) : undefined
    const sourceSegment = mineruBlock
      ? getMineruBlockSourceSegments(mineruBlock)[0]
      : sourceRef && isValidPdfSourceRect(sourceRef.rect)
        ? { pageNo: sourceRef.pageNo ?? 1, rect: sourceRef.rect }
        : undefined

    if (!note || !block || !sourceRef || !sourceSegment) {
      setStatus('这段笔记没有可跳转的 PDF 来源')
      return
    }

    const region: PdfLinkedNoteRegion = {
      id: `${filePath}:${note.id}:${block.id}:${sourceRef.mineruBlockId ?? block.id}:${sourceSegment.pageNo}:${getSourceRefRectKey(sourceSegment.rect)}`,
      paperPath: filePath,
      noteId: note.id,
      noteBlockId: block.id,
      mineruBlockId: sourceRef.mineruBlockId,
      mineruBlock,
      pageNo: sourceSegment.pageNo,
      rect: sourceSegment.rect,
      rawType: sourceRef.mineruBlockId ?? sourceRef.type,
      label: getNoteBlockText(block).trim() || note.title
    }

    ensurePaperOpen(filePath)
    setSelectedPdfPath(filePath)
    setPdfViewStates((current) => ({
      ...current,
      [filePath]: {
        ...current[filePath],
        pageNumber: region.pageNo,
        updatedAt: new Date().toISOString()
      }
    }))
    setFocusedPdfSourceRegion(region)
    setFocusedPdfSourceRegionNonce((current) => current + 1)
    showDockPanel('editor')
    setStatus(`已跳回 PDF 第 ${region.pageNo} 页来源位置`)
  }

  const handleMineruBlockDropToNote = (payload: MineruBlockDragPayload, insertAfterBlockId?: string | null): void => {
    const filePath = payload.paperPath || currentWorkspacePdfPath
    if (!filePath) {
      setStatus('请先打开一个 PDF，再拖入 MinerU 内容')
      return
    }

    ensurePaperOpen(filePath)
    setSelectedPdfPath(filePath)

    const notes = getPaperNotes(notesByPaperPath, filePath)
    const selectedNoteId = getSelectedOpenNoteIdForPaper(selectedNoteIdsByPaperPath, openNoteIdsByPaperPath, notesByPaperPath, filePath)
    const targetNote = selectedNoteId ? notes.find((currentNote) => currentNote.id === selectedNoteId) : notes[0]
    const nextNote =
      targetNote ??
      createFreeformNote({
        title: `${getFileStem(filePath)} MinerU 摘录`,
        paperId: `paper_${hashString(filePath)}`
      })
    const insertAfterIndex = insertAfterBlockId
      ? nextNote.blocks.findIndex((block) => block.id === insertAfterBlockId)
      : -1
    const insertIndex =
      insertAfterBlockId === null
        ? 0
        : insertAfterBlockId && insertAfterIndex >= 0
          ? insertAfterIndex + 1
          : nextNote.blocks.length
    const insertedBlock = createMineruDroppedNoteBlock(
      nextNote.id,
      payload.block,
      insertIndex,
      filePath,
      mineruSettings.noteStyle
    )
    const updatedNote = updateNoteDocumentBlocks(nextNote, [
      ...nextNote.blocks.slice(0, insertIndex),
      insertedBlock,
      ...nextNote.blocks.slice(insertIndex)
    ])

    setNotesByPaperPath((current) => ({
      ...current,
      [filePath]: upsertNoteForPaper(getPaperNotes(current, filePath), updatedNote)
    }))
    setOpenNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: [...normalizeNoteIdList((current as Record<string, unknown>)[filePath]), updatedNote.id].filter(
        (noteId, index, allNoteIds) => allNoteIds.indexOf(noteId) === index
      )
    }))
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: updatedNote.id
    }))
    setPendingNoteTemplateByPaperPath((current) => {
      if (!current[filePath]) {
        return current
      }

      const next = { ...current }
      delete next[filePath]
      return next
    })
    showDockPanel('note')
    focusNoteBlockInPanel(filePath, updatedNote.id, insertedBlock.id)
    setStatus('已从 MinerU 解析框拖入一段笔记')
  }

  const handleMineruBlockDropToAi = (payload: MineruBlockDragPayload): {
    text?: string
    imageAttachment?: ImageAttachmentItem
    clearAttachments?: boolean
  } => {
    ensurePaperOpen(payload.paperPath)
    setSelectedPdfPath(payload.paperPath)
    showDockPanel('ai')
    addMineruContextSelectionToConversation(payload)
    return { clearAttachments: true }
  }

  const saveNoteForPdf = (filePath: string, noteId: string): void => {
    const note = getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)

    if (!note) {
      setStatus('当前笔记不存在，无法保存')
      return
    }

    setSavedNotesByPaperPath((current) => {
      const savedNotes = getPaperNotes(current, filePath)
      const savedIdSet = new Set(savedNotes.map((currentNote) => currentNote.id))
      const nextSavedNotes = getPaperNotes(notesByPaperPath, filePath).filter(
        (currentNote) => currentNote.id === noteId || savedIdSet.has(currentNote.id)
      )

      return {
        ...current,
        [filePath]: nextSavedNotes
      }
    })
    setStatus(`已保存笔记：${note.title || `${getFileStem(filePath)} Notes`}`)
  }

  const discardNoteDraft = (filePath: string, noteId: string): void => {
    const savedNote = getPaperNotes(savedNotesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)

    setNotesByPaperPath((current) => {
      const currentNotes = getPaperNotes(current, filePath)
      if (!currentNotes.some((note) => note.id === noteId)) {
        return current
      }

      const nextNotes = savedNote
        ? currentNotes.map((note) => (note.id === noteId ? savedNote : note))
        : currentNotes

      if (nextNotes.length === 0) {
        const next = { ...current }
        delete next[filePath]
        return next
      }

      return {
        ...current,
        [filePath]: nextNotes
      }
    })
  }

  const finalizeCloseNoteTab = (filePath: string, noteId: string): void => {
    const currentOpenNoteIds = getOpenNoteIdsForPaper(openNoteIdsByPaperPath, notesByPaperPath, filePath)
    const closingIndex = currentOpenNoteIds.indexOf(noteId)
    const nextOpenNoteIds = currentOpenNoteIds.filter((currentNoteId) => currentNoteId !== noteId)
    const fallbackNoteId = nextOpenNoteIds[Math.min(closingIndex, nextOpenNoteIds.length - 1)] ?? ''

    setOpenNoteIdsByPaperPath((current) => {
      const next = { ...current }
      if (nextOpenNoteIds.length > 0) {
        next[filePath] = nextOpenNoteIds
      } else {
        delete next[filePath]
      }
      return next
    })
    setSelectedNoteIdsByPaperPath((current) => {
      if ((current[filePath] ?? '') !== noteId) {
        return current
      }

      return {
        ...current,
        [filePath]: fallbackNoteId
      }
    })
    setStatus('已关闭笔记标签')
  }

  const closeNoteTab = (filePath: string, noteId: string): void => {
    const note = getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)
    if (!note) {
      finalizeCloseNoteTab(filePath, noteId)
      return
    }

    if (isNoteDirty(savedNotesByPaperPath, notesByPaperPath, filePath, noteId)) {
      setPendingNoteCloseRequest({
        filePath,
        noteId
      })
      return
    }

    finalizeCloseNoteTab(filePath, noteId)
  }

  const confirmSaveAndCloseNoteTab = (): void => {
    if (!pendingNoteCloseRequest) {
      return
    }

    saveNoteForPdf(pendingNoteCloseRequest.filePath, pendingNoteCloseRequest.noteId)
    finalizeCloseNoteTab(pendingNoteCloseRequest.filePath, pendingNoteCloseRequest.noteId)
    setPendingNoteCloseRequest(null)
  }

  const confirmDiscardAndCloseNoteTab = (): void => {
    if (!pendingNoteCloseRequest) {
      return
    }

    discardNoteDraft(pendingNoteCloseRequest.filePath, pendingNoteCloseRequest.noteId)
    finalizeCloseNoteTab(pendingNoteCloseRequest.filePath, pendingNoteCloseRequest.noteId)
    setPendingNoteCloseRequest(null)
    setStatus('已关闭笔记标签，左侧笔记条目仍保留')
  }

  const updateNoteForPdf = (filePath: string, noteId: string, updater: (note: NoteDocument) => NoteDocument): void => {
    if (!filePath || !noteId) {
      return
    }

    setNotesByPaperPath((current) => {
      const notes = getPaperNotes(current, filePath)
      const noteIndex = notes.findIndex((note) => note.id === noteId)

      if (noteIndex < 0) {
        return current
      }

      const nextNotes = [...notes]
      const nextNote = updater(nextNotes[noteIndex])
      nextNotes[noteIndex] = {
        ...nextNote,
        updatedAt: new Date().toISOString()
      }

      return {
        ...current,
        [filePath]: nextNotes
      }
    })
  }

  const restoreNoteForPdf = (filePath: string, noteId: string, noteSnapshot: NoteDocument): void => {
    const invalidatedSourceLinkKeys = normalizeSourceLinkKeyList(invalidatedSourceLinkKeysByPaperPath[filePath])

    updateNoteForPdf(filePath, noteId, () =>
      applyInvalidatedSourceLinksToNotes([noteSnapshot], invalidatedSourceLinkKeys)[0] ?? noteSnapshot
    )
  }

  const updateNoteTitle = (filePath: string, noteId: string, title: string): void => {
    updateNoteForPdf(filePath, noteId, (note) => ({
      ...note,
      title
    }))
  }

  const renameNoteEntry = (filePath: string, noteId: string): void => {
    const note = getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)
    if (!note) {
      setStatus('未找到要重命名的笔记')
      return
    }

    openRenameDialog({
      kind: 'note',
      filePath,
      noteId,
      title: '重命名笔记',
      description: '为当前 PDF 下的笔记设置一个标题。',
      label: '笔记标题',
      initialValue: note.title || `${getFileStem(filePath)} Notes`,
      allowEmpty: false,
      emptyError: '笔记标题不能为空'
    })
  }

  const submitRenameDialog = (event: ReactFormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!renameDialogRequest) {
      return
    }

    const trimmedValue = renameDialogValue.trim().slice(0, 120)
    if (!trimmedValue && !renameDialogRequest.allowEmpty) {
      setRenameDialogError(renameDialogRequest.emptyError)
      return
    }

    if (renameDialogRequest.kind === 'library-folder-create') {
      setLibraryStructure((current) => createLibraryFolder(current, trimmedValue))
      closeRenameDialog()
      setStatus(`已新建文件夹：${trimmedValue}`)
      return
    }

    if (renameDialogRequest.kind === 'pdf') {
      const filePath = renameDialogRequest.filePath
      setPdfDisplayNamesByPath((current) => {
        const next = { ...current }

        if (!trimmedValue || trimmedValue === getFileName(filePath)) {
          delete next[filePath]
          return next
        }

        next[filePath] = trimmedValue
        return next
      })
      closeRenameDialog()
      setStatus(trimmedValue ? `已重命名 PDF 条目：${trimmedValue}` : `已恢复 PDF 文件名：${getFileName(filePath)}`)
      return
    }

    if (renameDialogRequest.kind === 'ai-conversation') {
      const conversation = findAiConversationById(aiConversationsByPaperPath, renameDialogRequest.conversationId)
      if (!conversation) {
        closeRenameDialog()
        setStatus('未找到要重命名的 AI 对话')
        return
      }

      updateAiConversation(renameDialogRequest.conversationId, (currentConversation) => ({
        ...currentConversation,
        title: trimmedValue,
        updatedAt: new Date().toISOString()
      }))
      closeRenameDialog()
      setStatus(`已重命名 AI 对话：${trimmedValue}`)
      return
    }

    const { filePath, noteId } = renameDialogRequest
    const applyTitle = (current: NotesByPaperPath): NotesByPaperPath => {
      const notes = getPaperNotes(current, filePath)
      if (!notes.some((currentNote) => currentNote.id === noteId)) {
        return current
      }

      return {
        ...current,
        [filePath]: notes.map((currentNote) =>
          currentNote.id === noteId
            ? {
                ...currentNote,
                title: trimmedValue,
                updatedAt: new Date().toISOString()
              }
            : currentNote
        )
      }
    }

    setNotesByPaperPath(applyTitle)
    setSavedNotesByPaperPath(applyTitle)
    closeRenameDialog()
    setStatus(`已重命名笔记：${trimmedValue}`)
  }

  const deleteNoteEntry = (filePath: string, noteId: string): void => {
    const notes = getPaperNotes(notesByPaperPath, filePath)
    const noteIndex = notes.findIndex((currentNote) => currentNote.id === noteId)
    const note = notes[noteIndex]

    if (!note) {
      setStatus('未找到要删除的笔记')
      return
    }

    const title = note.title || `${getFileStem(filePath)} Notes`
    if (!window.confirm(`删除笔记「${title}」？\n\n这会移除该笔记内容和相关收藏引用。`)) {
      return
    }

    const remainingNotes = notes.filter((currentNote) => currentNote.id !== noteId)
    const fallbackNoteId = remainingNotes[Math.min(Math.max(noteIndex, 0), remainingNotes.length - 1)]?.id ?? ''
    const removeNote = (current: NotesByPaperPath): NotesByPaperPath => {
      const currentNotes = getPaperNotes(current, filePath)
      if (!currentNotes.some((currentNote) => currentNote.id === noteId)) {
        return current
      }

      const nextNotes = currentNotes.filter((currentNote) => currentNote.id !== noteId)
      const next = { ...current }

      if (nextNotes.length > 0) {
        next[filePath] = nextNotes
      } else {
        delete next[filePath]
      }

      return next
    }

    setNotesByPaperPath(removeNote)
    setSavedNotesByPaperPath(removeNote)
    setOpenNoteIdsByPaperPath((current) => {
      const currentOpenNoteIds = normalizeNoteIdList((current as Record<string, unknown>)[filePath])
      const nextOpenNoteIds = currentOpenNoteIds.filter((currentNoteId) => currentNoteId !== noteId)
      const nextVisibleNoteIds =
        currentOpenNoteIds.includes(noteId) && fallbackNoteId && !nextOpenNoteIds.includes(fallbackNoteId)
          ? [...nextOpenNoteIds, fallbackNoteId]
          : nextOpenNoteIds
      const next = { ...current }

      if (nextVisibleNoteIds.length > 0) {
        next[filePath] = nextVisibleNoteIds
      } else {
        delete next[filePath]
      }

      return next
    })
    setSelectedNoteIdsByPaperPath((current) => {
      if ((current[filePath] ?? '') !== noteId) {
        return current
      }

      return {
        ...current,
        [filePath]: fallbackNoteId
      }
    })
    setFavoriteItemsByKey((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([, item]) => item.type !== 'note' || item.paperPath !== filePath || item.noteId !== noteId
        )
      )
    )
    setStatus(`已删除笔记：${title}`)
  }

  const addNoteBlock = (
    filePath: string,
    noteId: string,
    type: NoteBlockType,
    insertAfterBlockId?: string | null
  ): string => {
    const insertedBlock = createNoteBlock({
      noteId,
      type,
      orderIndex: 0
    })

    updateNoteForPdf(filePath, noteId, (note) => {
      const insertAfterIndex = insertAfterBlockId
        ? note.blocks.findIndex((block) => block.id === insertAfterBlockId)
        : -1
      const insertIndex =
        insertAfterBlockId === null
          ? 0
          : insertAfterBlockId && insertAfterIndex >= 0
            ? insertAfterIndex + 1
            : note.blocks.length

      return updateNoteDocumentBlocks(note, [
        ...note.blocks.slice(0, insertIndex),
        insertedBlock,
        ...note.blocks.slice(insertIndex)
      ])
    })

    focusNoteBlockInPanel(filePath, noteId, insertedBlock.id)

    return insertedBlock.id
  }

  const pasteImagesIntoNote = (
    filePath: string,
    noteId: string,
    images: ClipboardImagePayload[],
    insertAfterBlockId?: string | null,
    layout?: Partial<MediaNoteBlockContent>
  ): void => {
    if (!filePath || images.length === 0) {
      return
    }

    const currentNotes = getPaperNotes(notesByPaperPath, filePath)
    const currentNote = currentNotes.find((note) => note.id === noteId)
    const targetNote = currentNote ?? createClipboardImageNote(filePath, currentNotes.length + 1)
    const insertAfterIndex = insertAfterBlockId
      ? targetNote.blocks.findIndex((block) => block.id === insertAfterBlockId)
      : -1
    const insertIndex =
      insertAfterBlockId === null
        ? 0
        : insertAfterBlockId && insertAfterIndex >= 0
          ? insertAfterIndex + 1
          : targetNote.blocks.length
    const screenshotBlocks = images.map((image, index) => createClipboardScreenshotBlock(targetNote.id, image, insertIndex + index, layout))
    const nextBlocks = [
      ...targetNote.blocks.slice(0, insertIndex),
      ...screenshotBlocks,
      ...targetNote.blocks.slice(insertIndex)
    ]
    const nextNote = updateNoteDocumentBlocks(targetNote, nextBlocks)

    setNotesByPaperPath((current) => {
      const notes = getPaperNotes(current, filePath)
      const existingIndex = notes.findIndex((note) => note.id === nextNote.id)
      const nextNotes =
        existingIndex >= 0
          ? notes.map((note) => (note.id === nextNote.id ? nextNote : note))
          : [...notes, nextNote]

      return {
        ...current,
        [filePath]: nextNotes
      }
    })
    setOpenNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: [...normalizeNoteIdList((current as Record<string, unknown>)[filePath]), nextNote.id].filter(
        (currentNoteId, index, allNoteIds) => allNoteIds.indexOf(currentNoteId) === index
      )
    }))
    setSelectedNoteIdsByPaperPath((current) => ({
      ...current,
      [filePath]: nextNote.id
    }))
    setPendingNoteTemplateByPaperPath((current) => {
      if (!current[filePath]) {
        return current
      }

      const next = { ...current }
      delete next[filePath]
      return next
    })
    showDockPanel('note')
    setStatus(`已粘贴 ${images.length} 张截图到笔记`)
  }

  const updateNoteBlockTypeForPdf = (filePath: string, noteId: string, blockId: string, type: NoteBlockType): void => {
    updateNoteForPdf(filePath, noteId, (note) =>
      updateNoteDocumentBlocks(
        note,
        note.blocks.map((block) => (block.id === blockId ? updateNoteBlockType(block, type) : block))
      )
    )
  }

  const updateNoteBlockTextForPdf = (filePath: string, noteId: string, blockId: string, text: string): void => {
    let invalidatedSourceLinkKey = ''

    updateNoteForPdf(filePath, noteId, (note) => {
      const nextNote = updateNoteDocumentBlocks(
        note,
        note.blocks.map((block) => {
          if (block.id !== blockId) {
            return block
          }

          const nextBlock = updateNoteBlockText(block, text)
          const invalidation = invalidateSourceLinksForEditedBlock(filePath, note, block, nextBlock)
          invalidatedSourceLinkKey = invalidation.invalidatedKey
          return invalidation.block
        })
      )

      return nextNote
    })

    if (invalidatedSourceLinkKey) {
      setInvalidatedSourceLinkKeysByPaperPath((current) => ({
        ...current,
        [filePath]: normalizeSourceLinkKeyList([
          ...normalizeSourceLinkKeyList(current[filePath]),
          invalidatedSourceLinkKey
        ])
      }))
    }
  }

  const updateNoteBlockStyleForPdf = (
    filePath: string,
    noteId: string,
    blockId: string,
    stylePatch: Partial<NoteBlockStyle>
  ): void => {
    updateNoteForPdf(filePath, noteId, (note) =>
      updateNoteDocumentBlocks(
        note,
        note.blocks.map((block) => (block.id === blockId ? updateNoteBlockStyle(block, stylePatch) : block))
      )
    )
  }

  const updateNoteBlockMediaForPdf = (
    filePath: string,
    noteId: string,
    blockId: string,
    contentPatch: Partial<MediaNoteBlockContent>
  ): void => {
    updateNoteForPdf(filePath, noteId, (note) =>
      updateNoteDocumentBlocks(
        note,
        note.blocks.map((block) => {
          if (block.id !== blockId || (block.type !== 'image' && block.type !== 'screenshot')) {
            return block
          }

          const nextContent = normalizeMediaBlockContent({
            ...(block.content as MediaNoteBlockContent),
            ...contentPatch
          })

          return updateNoteBlockText(
            {
              ...block,
              content: nextContent
            },
            nextContent.caption ?? ''
          )
        })
      )
    )
  }

  const deleteNoteBlockForPdf = (filePath: string, noteId: string, blockId: string): void => {
    updateNoteForPdf(filePath, noteId, (note) => removeNoteDocumentBlock(note, blockId))
  }

  const moveNoteBlockForPdf = (
    filePath: string,
    noteId: string,
    blockId: string,
    insertAfterBlockId?: string | null
  ): void => {
    updateNoteForPdf(filePath, noteId, (note) => {
      const movingBlock = note.blocks.find((block) => block.id === blockId)
      if (!movingBlock) {
        return note
      }

      const remainingBlocks = note.blocks.filter((block) => block.id !== blockId)
      const insertAfterIndex = insertAfterBlockId
        ? remainingBlocks.findIndex((block) => block.id === insertAfterBlockId)
        : -1
      const insertIndex =
        insertAfterBlockId === null
          ? 0
          : insertAfterBlockId && insertAfterIndex >= 0
            ? insertAfterIndex + 1
            : remainingBlocks.length

      return updateNoteDocumentBlocks(note, [
        ...remainingBlocks.slice(0, insertIndex),
        movingBlock,
        ...remainingBlocks.slice(insertIndex)
      ])
    })
  }

  const toggleNoteTodoBlock = (filePath: string, noteId: string, blockId: string, checked: boolean): void => {
    updateNoteForPdf(filePath, noteId, (note) =>
      updateNoteDocumentBlocks(
        note,
        note.blocks.map((block) => {
          if (block.id !== blockId || block.type !== 'todo') {
            return block
          }

          const nextBlock: NoteBlock = {
            ...block,
            content: {
              ...block.content,
              checked
            }
          }

          return updateNoteBlockText(nextBlock, getNoteBlockText(block))
        })
      )
    )
  }

  const copyNoteMarkdown = (filePath: string, noteId: string): void => {
    const note = getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)

    if (!note) {
      setStatus('当前 PDF 还没有笔记')
      return
    }

    void navigator.clipboard.writeText(noteToMarkdown(note)).then(
      () => setStatus('已复制笔记 Markdown'),
      () => setStatus('复制 Markdown 失败')
    )
  }

  const exportNote = (filePath: string, noteId: string, format: NoteExportFormat): void => {
    const note = getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)

    if (!note) {
      setStatus('当前 PDF 还没有可导出的笔记')
      return
    }

    void window.thesisAgent
      .exportNote({
        format,
        note
      })
      .then((result) => {
        if (result.canceled) {
          setStatus('已取消导出笔记')
          return
        }

        setStatus(`已导出笔记为 ${result.format === 'pdf' ? 'PDF' : 'Word'}`)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '未知错误'
        setStatus(`导出笔记失败：${message}`)
      })
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-left">
          <div className="brand">
            <span className="codicon codicon-mortar-board" aria-hidden="true" />
            <span>Inspiration</span>
          </div>
          <nav className="menubar" aria-label="Application menu">
            {['File', 'Edit'].map((item) => (
              <button key={item} className="menu-item" type="button">
                {item}
              </button>
            ))}
            <button className="menu-item" type="button" title="截图到剪切板 (Alt+A)" onClick={startScreenshotCapture}>
              Selection
            </button>
            <div className="menu-popover-root">
              <button
                className={isViewMenuOpen ? 'menu-item active' : 'menu-item'}
                type="button"
                aria-haspopup="menu"
                aria-expanded={isViewMenuOpen}
                onClick={() => setIsViewMenuOpen((value) => !value)}
              >
                View
              </button>
              {isViewMenuOpen ? (
                <div className="menu-popover" role="menu" aria-label="View">
                  {closableDockPanelIds.map((panelId) => (
                    <button
                      key={panelId}
                      className="menu-popover-item"
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={!hiddenDockPanels.includes(panelId)}
                      onClick={() => {
                        showDockPanel(panelId)
                        setIsViewMenuOpen(false)
                      }}
                    >
                      <span
                        className={`codicon ${hiddenDockPanels.includes(panelId) ? 'codicon-blank' : 'codicon-check'}`}
                        aria-hidden="true"
                      />
                      <span>{getDockPanelTitle(panelId)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {['Go', 'Run'].map((item) => (
              <button key={item} className="menu-item" type="button">
                {item}
              </button>
            ))}
            <button className="menu-item icon-only" type="button" title="More actions" aria-label="More actions">
              <span className="codicon codicon-ellipsis" aria-hidden="true" />
            </button>
          </nav>
        </div>

        <div className="titlebar-center">
          <button className="nav-button" type="button" title="Back" aria-label="Back">
            <span className="codicon codicon-arrow-left" aria-hidden="true" />
          </button>
          <button className="nav-button" type="button" title="Forward" aria-label="Forward">
            <span className="codicon codicon-arrow-right" aria-hidden="true" />
          </button>
          <button className="command-center" type="button" onClick={openPdf} title="Open paper PDF">
            <span className="codicon codicon-search" aria-hidden="true" />
            <span>Open PDF / Run Command</span>
          </button>
        </div>

        <div className="titlebar-actions">
          <div className="titlebar-status" title="Current AI and index status">
            <span className="status-dot" aria-hidden="true" />
            <span>Ready</span>
          </div>
          <button
            className={isProfileOpen ? 'profile-avatar-button active' : 'profile-avatar-button'}
            type="button"
            title="个人主页"
            aria-label="打开个人主页"
            aria-pressed={isProfileOpen}
            onClick={openProfileHome}
          >
            <span className="profile-avatar-small" aria-hidden="true">
              <span />
            </span>
          </button>
          <div className="runtime">Electron {window.thesisAgent.versions.electron}</div>
        </div>
      </header>

      <main className="workspace">
        <aside className="activitybar" aria-label="Main navigation">
          {activityItems.map((item) => (
            <button
              key={item.id}
              className={item.id === activeView && !isPrimarySidebarCollapsed ? 'activity active' : 'activity'}
              type="button"
              title={item.title}
              aria-pressed={item.id === activeView && !isPrimarySidebarCollapsed}
              onClick={() => activatePrimaryView(item.id)}
            >
              <span className={`codicon ${item.icon}`} aria-hidden="true" />
            </button>
          ))}
          <button
            className={isProfileOpen ? 'activity profile-activity active' : 'activity profile-activity'}
            type="button"
            title="个人主页"
            aria-label="打开个人主页"
            aria-pressed={isProfileOpen}
            onClick={openProfileHome}
          >
            <span className="profile-avatar-small" aria-hidden="true">
              <span />
            </span>
          </button>
        </aside>

        <WorkbenchPanelLayout
          layout={dockLayout}
          activeView={activeView}
          activeEditor={activeEditor}
          isPrimarySidebarCollapsed={isPrimarySidebarCollapsed}
          hiddenDockPanels={hiddenDockPanels}
          libraryPdfPaths={libraryPdfPaths}
          libraryStructure={libraryStructure}
          openPdfPaths={openPdfPaths}
          selectedPdfPath={selectedPdfPath}
          pdfFileInfoByPath={pdfFileInfoByPath}
          pdfDisplayNamesByPath={pdfDisplayNamesByPath}
          pdfViewStates={pdfViewStates}
          notesByPaperPath={notesByPaperPath}
          savedNotesByPaperPath={savedNotesByPaperPath}
          focusedPdfSourceRegion={focusedPdfSourceRegion}
          focusedPdfSourceRegionNonce={focusedPdfSourceRegionNonce}
          selectedNoteIdsByPaperPath={selectedNoteIdsByPaperPath}
          openNoteIdsByPaperPath={openNoteIdsByPaperPath}
          pendingNoteTemplateByPaperPath={pendingNoteTemplateByPaperPath}
          creatingScreenshotNotePath={creatingScreenshotNotePath}
          aiConversationsByPaperPath={aiConversationsByPaperPath}
          activeAiConversationIdsByPaperPath={activeAiConversationIdsByPaperPath}
          focusedAiMessageId={focusedAiMessageId}
          favoriteItemsByKey={favoriteItemsByKey}
          aiSettings={aiSettings}
          mineruSettings={mineruSettings}
          mineruParseResultByPdfPath={mineruParseResultByPdfPath}
          mineruCacheExistsByPdfPath={mineruCacheExistsByPdfPath}
          librarySortMode={librarySortMode}
          isAiConfigOpen={isAiConfigOpen}
          isAiHistoryOpen={isAiHistoryOpen}
          onLayoutChange={setDockLayout}
          onAiSettingsChange={updateAiSettings}
          onMineruSettingsChange={updateMineruSettings}
          onAiConversationCreate={startNewAiConversationForCurrentPdf}
          onAiConversationCreateForPaper={createAiConversationForPaper}
          onAiConversationSelect={selectAiConversationAndClosePopovers}
          onAiConversationUpdate={updateAiConversation}
          onAiConversationBranch={branchAiConversationFromAnswer}
          onAiConversationRename={renameAiConversation}
          onAiConversationDelete={deleteAiConversation}
          onAiGraphNodeSelect={openAiConversationFromGraph}
          onFavoriteToggle={toggleFavorite}
          onDockPanelClose={closeDockPanel}
          onLibrarySortModeChange={setLibrarySortMode}
          onPrimarySidebarCollapse={() => setIsPrimarySidebarCollapsed(true)}
          onPdfViewStateChange={updatePdfViewState}
          onPdfToolbarChange={updateActivePdfToolbar}
          onCreatePdfNote={createWholePdfNote}
          onParseWithMineru={parseWithMineru}
          onGenerateMineruNote={generateMineruNote}
          onHideMineruLinkedRegions={hideMineruLinkedRegions}
          onShowMineruLinkedRegions={showMineruLinkedRegions}
          onMineruClearCurrentCache={clearMineruCacheForPdf}
          onMineruClearAllCaches={clearAllMineruCaches}
          hiddenMineruOverlayByPdfPath={hiddenMineruOverlayByPdfPath}
          linkedNoteRegions={currentPdfLinkedRegions}
          onLinkedNoteRegionSelect={handleLinkedNoteRegionSelect}
          onProfileOpen={openProfileHome}
          onOpenNote={openNoteForPdf}
          onPdfTabSelect={activatePdfTab}
          onPdfTabClose={closePdfTab}
          onPdfEntryRename={renamePdfEntry}
          onPdfEntryDelete={deletePdfEntry}
          onLibraryFolderCreate={createLibraryFolderEntry}
          onLibraryFolderToggle={toggleLibraryFolder}
          onLibraryPdfMoveToFolder={moveLibraryPdfIntoFolder}
          onLibraryPdfMoveToRoot={moveLibraryPdfToRoot}
          onOpenPdf={openPdf}
          onStatus={setStatus}
          onToggleAiConfig={() => {
            setIsAiConfigOpen((value) => !value)
            setIsAiHistoryOpen(false)
          }}
          onToggleAiHistory={() => {
            setIsAiHistoryOpen((value) => !value)
            setIsAiConfigOpen(false)
          }}
          onAiPopoversDismiss={closeAiPopovers}
          onAskSelection={() => void workbench.commands.executeCommand('ai.askSelection')}
          onMineruBlockDropToAi={handleMineruBlockDropToAi}
          onNoteCreateStart={startNewNoteForCurrentPdf}
          onNoteSelect={openNoteForPdf}
          onNoteTabClose={closeNoteTab}
          onNoteEntryRename={renameNoteEntry}
          onNoteEntryDelete={deleteNoteEntry}
          onNoteSave={saveNoteForPdf}
          onNoteTitleChange={updateNoteTitle}
          onNoteBlockAdd={addNoteBlock}
          onNoteBlockTypeChange={updateNoteBlockTypeForPdf}
          onNoteBlockTextChange={updateNoteBlockTextForPdf}
          onNoteBlockStyleChange={updateNoteBlockStyleForPdf}
          onNoteBlockMediaChange={updateNoteBlockMediaForPdf}
          onNoteBlockDelete={deleteNoteBlockForPdf}
          onNoteBlockMove={moveNoteBlockForPdf}
          onNoteTodoChange={toggleNoteTodoBlock}
          onNoteSourceJump={handleNoteSourceJump}
          onNoteMarkdownCopy={copyNoteMarkdown}
          onNoteExport={exportNote}
          onNoteImagePaste={pasteImagesIntoNote}
          onNoteRestore={restoreNoteForPdf}
          onMineruBlockDropToNote={handleMineruBlockDropToNote}
          focusedNoteBlockRequest={focusedNoteBlockRequest}
          onTextTemplateCreate={createTextTemplateNote}
          onFreeformTemplateCreate={createFreeformTemplateNote}
          onScreenshotTemplateCreate={createScreenshotTemplateNote}
        />

      </main>

      {isProfileOpen ? (
        <div className="profile-overlay" role="dialog" aria-label="个人主页" aria-modal="false">
          <ProfileHomePage
            libraryPdfPaths={libraryPdfPaths}
            selectedPdfPath={selectedPdfPath}
            pdfViewStates={pdfViewStates}
            notesByPaperPath={notesByPaperPath}
            favoriteItemsByKey={favoriteItemsByKey}
          />
        </div>
      ) : null}

      {pendingNoteCloseRequest ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-close-dialog-title"
            aria-describedby="note-close-dialog-description"
          >
            <h2 id="note-close-dialog-title">关闭前保存笔记吗？</h2>
            <p id="note-close-dialog-description">
              {(() => {
                const note = getPaperNotes(notesByPaperPath, pendingNoteCloseRequest.filePath).find(
                  (currentNote) => currentNote.id === pendingNoteCloseRequest.noteId
                )
                const title = note?.title || `${getFileStem(pendingNoteCloseRequest.filePath)} Notes`
                return `“${title}” 还有未保存修改。`
              })()}
            </p>
            <div className="confirm-modal-actions">
              <button className="note-toolbar-button" type="button" onClick={confirmSaveAndCloseNoteTab}>
                保存
              </button>
              <button className="note-toolbar-button" type="button" onClick={confirmDiscardAndCloseNoteTab}>
                不保存
              </button>
              <button className="note-toolbar-button" type="button" onClick={() => setPendingNoteCloseRequest(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameDialogRequest ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="confirm-modal prompt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-dialog-title"
            aria-describedby={renameDialogError ? 'rename-dialog-description rename-dialog-error' : 'rename-dialog-description'}
            onSubmit={submitRenameDialog}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                closeRenameDialog()
              }
            }}
          >
            <h2 id="rename-dialog-title">{renameDialogRequest.title}</h2>
            <p id="rename-dialog-description">{renameDialogRequest.description}</p>
            <label className="prompt-modal-field">
              <span>{renameDialogRequest.label}</span>
              <input
                className="prompt-modal-input"
                type="text"
                value={renameDialogValue}
                maxLength={120}
                autoFocus
                spellCheck={false}
                onChange={(event) => {
                  setRenameDialogValue(event.target.value)
                  if (renameDialogError) {
                    setRenameDialogError('')
                  }
                }}
              />
            </label>
            {renameDialogError ? (
              <p className="prompt-modal-error" id="rename-dialog-error">
                {renameDialogError}
              </p>
            ) : null}
            <div className="confirm-modal-actions">
              <button className="note-toolbar-button" type="submit">
                确定
              </button>
              <button className="note-toolbar-button" type="button" onClick={closeRenameDialog}>
                取消
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isScreenshotCaptureActive ? (
        <ScreenshotCaptureOverlay onCancel={cancelScreenshotCapture} onCapture={captureScreenshotSelection} />
      ) : null}

      {mineruNotice ? (
        <div className={`mineru-notice ${mineruNotice.kind}`} role="status" aria-live="polite">
          <div className="mineru-notice-title">{mineruNotice.title}</div>
          <div className="mineru-notice-message">{mineruNotice.message}</div>
        </div>
      ) : null}

      <footer className={activePdfToolbar ? 'statusbar pdf-statusbar' : 'statusbar'}>
        {activePdfToolbar ? (
          <>
            <div className="pdf-statusbar-group pdf-statusbar-left">
              <button
                className={activePdfToolbar.state.renderMode === 'compatibility' ? 'pdf-render-mode-button active' : 'pdf-render-mode-button'}
                type="button"
                title="切换 PDF 渲染引擎"
                aria-label="切换 PDF 渲染引擎"
                aria-pressed={activePdfToolbar.state.renderMode === 'compatibility'}
                disabled={!activePdfToolbar.state.hasDocument || activePdfToolbar.state.isLoading}
                onClick={activePdfToolbar.actions.toggleRenderMode}
              >
                <span className="codicon codicon-file-media" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="重新渲染 PDF"
                aria-label="重新渲染 PDF"
                disabled={!activePdfToolbar.state.hasDocument || activePdfToolbar.state.isLoading}
                onClick={activePdfToolbar.actions.reloadDocument}
              >
                <span className="codicon codicon-refresh" aria-hidden="true" />
              </button>
              <button
                className={activePdfToolbar.state.isOverviewOpen ? 'pdf-overview-toggle active' : 'pdf-overview-toggle'}
                type="button"
                title="页面总览"
                aria-label="页面总览"
                aria-pressed={activePdfToolbar.state.isOverviewOpen}
                disabled={!activePdfToolbar.state.hasDocument}
                onClick={activePdfToolbar.actions.toggleOverview}
              >
                <span className="codicon codicon-layout" aria-hidden="true" />
              </button>
              <button type="button" title="打开 PDF" aria-label="打开 PDF" onClick={activePdfToolbar.actions.openPdf}>
                <span className="codicon codicon-folder-opened" aria-hidden="true" />
              </button>
            </div>
            <div className="pdf-statusbar-group pdf-statusbar-center">
              <button
                type="button"
                title="上一页"
                aria-label="上一页"
                disabled={!activePdfToolbar.state.canGoPrevious}
                onClick={activePdfToolbar.actions.goPrevious}
              >
                <span className="codicon codicon-chevron-left" aria-hidden="true" />
              </button>
              <span className="page-indicator">
                {activePdfToolbar.state.pageCount > 0 ? `${activePdfToolbar.state.pageNumber} / ${activePdfToolbar.state.pageCount}` : '- / -'}
              </span>
              <button
                type="button"
                title="下一页"
                aria-label="下一页"
                disabled={!activePdfToolbar.state.canGoNext}
                onClick={activePdfToolbar.actions.goNext}
              >
                <span className="codicon codicon-chevron-right" aria-hidden="true" />
              </button>
              <span className="toolbar-separator" />
              <button type="button" title="缩小" aria-label="缩小" disabled={!activePdfToolbar.state.canZoomOut} onClick={activePdfToolbar.actions.zoomOut}>
                <span className="codicon codicon-zoom-out" aria-hidden="true" />
              </button>
              <button className="zoom-reset-button" type="button" title="重置缩放" aria-label="重置缩放" onClick={activePdfToolbar.actions.zoomReset}>
                <span className="page-indicator zoom-indicator">{Math.round(activePdfToolbar.state.scale * 100)}%</span>
              </button>
              <button type="button" title="放大" aria-label="放大" disabled={!activePdfToolbar.state.canZoomIn} onClick={activePdfToolbar.actions.zoomIn}>
                <span className="codicon codicon-zoom-in" aria-hidden="true" />
              </button>
              <span className="toolbar-separator" />
              <div className="pdf-browse-mode-control" role="group" aria-label="PDF 浏览方式">
                <button
                  className={activePdfToolbar.state.browseMode === 'scroll' ? 'active' : ''}
                  type="button"
                  title="连续阅读"
                  aria-label="连续阅读"
                  aria-pressed={activePdfToolbar.state.browseMode === 'scroll'}
                  disabled={!activePdfToolbar.state.hasDocument}
                  onClick={activePdfToolbar.actions.setBrowseModeScroll}
                >
                  <span className="codicon codicon-list-unordered" aria-hidden="true" />
                </button>
                <button
                  className={activePdfToolbar.state.browseMode === 'page' ? 'active' : ''}
                  type="button"
                  title="单页阅读"
                  aria-label="单页阅读"
                  aria-pressed={activePdfToolbar.state.browseMode === 'page'}
                  disabled={!activePdfToolbar.state.hasDocument}
                  onClick={activePdfToolbar.actions.setBrowseModePage}
                >
                  <span className="codicon codicon-arrow-both" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="pdf-statusbar-group pdf-statusbar-right">
              <span>{status}</span>
            </div>
          </>
        ) : (
          <>
            <span>{status}</span>
          </>
        )}
      </footer>
    </div>
  )
}

const reasoningOptions: Array<{
  value: ReasoningEffort
  label: string
}> = [
  { value: 'none', label: '不思考' },
  { value: 'minimal', label: '最小' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' }
]

const aiQuickActions: AiQuickAction[] = [
  {
    id: 'paper-summary',
    label: '文章总结',
    icon: 'codicon-list-tree',
    prompt:
      '请基于当前论文上下文总结这篇文章。按“研究问题、核心方法、主要贡献、关键实验、局限与可追问问题”组织，并尽量标注页码。'
  },
  {
    id: 'paper-translation',
    label: '文章翻译',
    icon: 'codicon-globe',
    prompt: '请把当前论文的核心内容翻译成中文综述。保留关键术语英文原文，并按章节或主题分段说明。'
  },
  {
    id: 'related-work',
    label: '相关工作',
    icon: 'codicon-references',
    prompt:
      '请梳理当前论文的相关工作：列出它对比了哪些方向或代表性方法，说明本文与这些工作的差异、继承关系和潜在引用价值。'
  },
  {
    id: 'method',
    label: '方法拆解',
    icon: 'codicon-symbol-method',
    prompt: '请拆解当前论文的方法部分：输入输出、整体流程、关键模块、核心公式或算法步骤，以及每一步解决的问题。'
  },
  {
    id: 'experiments',
    label: '实验结论',
    icon: 'codicon-beaker',
    prompt: '请解读当前论文的实验部分：数据集、指标、baseline、主要结果、消融实验、异常现象和结论可信度。'
  }
]

const aiMarkdownComponents: Components = {
  a({ children, href, node: _node, ...props }) {
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }
}

function preprocessAiMarkdown(content: string): string {
  let nextContent = content

  nextContent = nextContent.replace(/```(?:latex|tex)\s*([\s\S]*?)```/gi, (_match, latexSource: string) => {
    return normalizePotentialLatexBlock(latexSource)
  })

  nextContent = nextContent.replace(/^\s*\\\[\s*(.+?)\s*\\\]\s*$/gm, (_match, latexSource: string) => {
    const normalized = latexSource.trim()
    return normalized ? `$$\n${normalized}\n$$` : ''
  })

  nextContent = nextContent.replace(/^\s*\\\(\s*(.+?)\s*\\\)\s*$/gm, (_match, latexSource: string) => {
    const normalized = latexSource.trim()
    return normalized ? `$${normalized}$` : ''
  })

  nextContent = nextContent
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.includes('$$') || trimmedLine.includes('$')) {
        return line
      }

      if (!looksLikeBareLatexLine(trimmedLine)) {
        return line
      }

      return `$$\n${trimmedLine}\n$$`
    })
    .join('\n')

  return nextContent
}

function normalizePotentialLatexBlock(
  latexSource: string,
  options: {
    wrapWholeBlockInline?: boolean
  } = {}
): string {
  const normalized = latexSource.trim()
  if (!normalized) {
    return ''
  }

  if (looksLikeDisplayMathBlock(normalized)) {
    return options.wrapWholeBlockInline ? `$$\n${normalized}\n$$` : `\n\n$$\n${normalized}\n$$\n\n`
  }

  const normalizedLines = normalized
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine) {
        return ''
      }

      return looksLikeBareLatexLine(trimmedLine) ? `$$\n${trimmedLine}\n$$` : line
    })
    .join('\n\n')

  return options.wrapWholeBlockInline ? normalizedLines : `\n\n${normalizedLines}\n\n`
}

function looksLikeDisplayMathBlock(content: string): boolean {
  if (content.length < 3 || content.length > 800) {
    return false
  }

  if (/[\u4e00-\u9fff]/.test(content)) {
    return false
  }

  if (/(^|\n)\s*[-*#>]/.test(content) || /```/.test(content)) {
    return false
  }

  const nonEmptyLines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (nonEmptyLines.length === 0) {
    return false
  }

  if (nonEmptyLines.length === 1) {
    return looksLikeBareLatexLine(nonEmptyLines[0])
  }

  return nonEmptyLines.every(
    (line) =>
      looksLikeBareLatexLine(line) ||
      /^(&|\\\\|\\begin\{|\\end\{|\\label\{|\\tag\{|\\nonumber\b)/.test(line)
  )
}

function looksLikeBareLatexLine(content: string): boolean {
  if (content.length < 3 || content.length > 180) {
    return false
  }

  if (/[\u4e00-\u9fff]/.test(content)) {
    return false
  }

  if (/\s{2,}|[。！？；：，、]|^[#>\-*]|`/.test(content)) {
    return false
  }

  if (looksLikePageReferenceTag(content)) {
    return false
  }

  if (/^[\[(][A-Za-z0-9_,.\s]+[\])]$/.test(content)) {
    return true
  }

  const latexSignalMatches = content.match(
    /(\\[a-zA-Z]+|[_^{}]|=|<|>|\\frac|\\sum|\\prod|\\int|\\sqrt|\\alpha|\\beta|\\gamma|\\theta|\\lambda|\\mu|\\sigma|\\pi|\\Delta|\\partial|\\Rightarrow|\\approx|\\le|\\ge)/g
  )
  const signalCount = latexSignalMatches?.length ?? 0

  if (signalCount < 1) {
    return false
  }

  const englishWordCount = content.match(/[A-Za-z]+/g)?.length ?? 0
  const operatorCount = content.match(/(\\[a-zA-Z]+|[_^{}=<>+\-*/])/g)?.length ?? 0

  if (englishWordCount > 8 && operatorCount < 3) {
    return false
  }

  return true
}

function looksLikePageReferenceTag(content: string): boolean {
  return /^[\[(]\s*p{1,2}\.?\s*\d+(\s*[-–]\s*\d+)?\s*[\])]$/i.test(content)
}

function WorkbenchPanelLayout({
  layout,
  activeView,
  activeEditor,
  isPrimarySidebarCollapsed,
  hiddenDockPanels,
  libraryPdfPaths,
  libraryStructure,
  openPdfPaths,
  selectedPdfPath,
  pdfFileInfoByPath,
  pdfDisplayNamesByPath,
  pdfViewStates,
  notesByPaperPath,
  savedNotesByPaperPath,
  focusedPdfSourceRegion,
  focusedPdfSourceRegionNonce,
  selectedNoteIdsByPaperPath,
  openNoteIdsByPaperPath,
  pendingNoteTemplateByPaperPath,
  creatingScreenshotNotePath,
  aiConversationsByPaperPath,
  activeAiConversationIdsByPaperPath,
  focusedAiMessageId,
  favoriteItemsByKey,
  aiSettings,
  mineruSettings,
  mineruParseResultByPdfPath,
  mineruCacheExistsByPdfPath,
  librarySortMode,
  isAiConfigOpen,
  isAiHistoryOpen,
  onLayoutChange,
  onAiSettingsChange,
  onMineruSettingsChange,
  onAiConversationCreate,
  onAiConversationCreateForPaper,
  onAiConversationSelect,
  onAiConversationUpdate,
  onAiConversationBranch,
  onAiConversationRename,
  onAiConversationDelete,
  onAiGraphNodeSelect,
  onFavoriteToggle,
  onDockPanelClose,
  onLibrarySortModeChange,
  onPrimarySidebarCollapse,
  onPdfViewStateChange,
  onPdfToolbarChange,
  onCreatePdfNote,
  onParseWithMineru,
  onGenerateMineruNote,
  onHideMineruLinkedRegions,
  onShowMineruLinkedRegions,
  onMineruClearCurrentCache,
  onMineruClearAllCaches,
  hiddenMineruOverlayByPdfPath,
  linkedNoteRegions,
  onLinkedNoteRegionSelect,
  onProfileOpen,
  onOpenNote,
  onPdfTabSelect,
  onPdfTabClose,
  onPdfEntryRename,
  onPdfEntryDelete,
  onLibraryFolderCreate,
  onLibraryFolderToggle,
  onLibraryPdfMoveToFolder,
  onLibraryPdfMoveToRoot,
  onOpenPdf,
  onToggleAiConfig,
  onToggleAiHistory,
  onAiPopoversDismiss,
  onAskSelection,
  onMineruBlockDropToAi,
  onNoteCreateStart,
  onNoteSelect,
  onNoteTabClose,
  onNoteEntryRename,
  onNoteEntryDelete,
  onNoteSave,
  onNoteTitleChange,
  onNoteBlockAdd,
  onNoteBlockTypeChange,
  onNoteBlockTextChange,
  onNoteBlockStyleChange,
  onNoteBlockMediaChange,
  onNoteBlockDelete,
  onNoteBlockMove,
  onNoteTodoChange,
  onNoteSourceJump,
  onNoteMarkdownCopy,
  onNoteExport,
  onNoteImagePaste,
  onNoteRestore,
  onMineruBlockDropToNote,
  focusedNoteBlockRequest,
  onTextTemplateCreate,
  onFreeformTemplateCreate,
  onScreenshotTemplateCreate,
  onStatus
}: {
  layout: DockLayoutNode
  activeView: PrimaryView
  activeEditor: EditorTab
  isPrimarySidebarCollapsed: boolean
  hiddenDockPanels: ClosableDockPanelId[]
  libraryPdfPaths: string[]
  libraryStructure: LibraryStructure
  openPdfPaths: string[]
  selectedPdfPath: string
  pdfFileInfoByPath: PdfFileInfoByPath
  pdfDisplayNamesByPath: PdfDisplayNamesByPath
  pdfViewStates: PdfViewStates
  notesByPaperPath: NotesByPaperPath
  savedNotesByPaperPath: NotesByPaperPath
  focusedPdfSourceRegion: PdfLinkedNoteRegion | null
  focusedPdfSourceRegionNonce: number
  selectedNoteIdsByPaperPath: SelectedNoteIdsByPaperPath
  openNoteIdsByPaperPath: OpenNoteIdsByPaperPath
  pendingNoteTemplateByPaperPath: PendingNoteTemplateByPaperPath
  creatingScreenshotNotePath: string
  aiConversationsByPaperPath: AiConversationsByPaperPath
  activeAiConversationIdsByPaperPath: ActiveAiConversationIdsByPaperPath
  focusedAiMessageId: string
  favoriteItemsByKey: FavoriteItemsByKey
  aiSettings: PersistedAiSettingsState
  mineruSettings: PersistedMineruSettingsState
  mineruParseResultByPdfPath: Record<string, MineruParseResult>
  mineruCacheExistsByPdfPath: Record<string, boolean>
  librarySortMode: LibrarySortMode
  isAiConfigOpen: boolean
  isAiHistoryOpen: boolean
  onLayoutChange: (layout: DockLayoutNode) => void
  onAiSettingsChange: (patch: Partial<PersistedAiSettingsState>) => void
  onMineruSettingsChange: (patch: Partial<PersistedMineruSettingsState>) => void
  onAiConversationCreate: () => void
  onAiConversationCreateForPaper: (
    paperPath: string,
    options?: {
      title?: string
      parentAnswerId?: string
      messages?: ChatMessage[]
    }
  ) => string
  onAiConversationSelect: (paperPath: string, conversationId: string) => void
  onAiConversationUpdate: (conversationId: string, updater: (conversation: AiConversation) => AiConversation) => void
  onAiConversationBranch: (conversationId: string, answerId: string) => void
  onAiConversationRename: (conversationId: string) => void
  onAiConversationDelete: (conversationId: string) => void
  onAiGraphNodeSelect: (target: AiGraphSelectTarget) => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onDockPanelClose: (panelId: ClosableDockPanelId) => void
  onLibrarySortModeChange: (sortMode: LibrarySortMode) => void
  onPrimarySidebarCollapse: () => void
  onPdfViewStateChange: (filePath: string, viewState: PersistedPdfViewState) => void
  onPdfToolbarChange: (toolbar: PdfViewerToolbarBridge | null) => void
  onCreatePdfNote: (filePath: string) => void
  onParseWithMineru: (filePath: string) => void
  onGenerateMineruNote: (filePath: string) => void
  onHideMineruLinkedRegions: (filePath: string) => void
  onShowMineruLinkedRegions: (filePath: string) => void
  onMineruClearCurrentCache: (filePath: string) => void
  onMineruClearAllCaches: () => void
  hiddenMineruOverlayByPdfPath: Record<string, boolean>
  linkedNoteRegions: PdfLinkedNoteRegion[]
  onLinkedNoteRegionSelect: (region: PdfLinkedNoteRegion) => void
  onProfileOpen: () => void
  onOpenNote: (filePath: string, noteId?: string) => void
  onPdfTabSelect: (filePath: string) => void
  onPdfTabClose: (filePath: string) => void
  onPdfEntryRename: (filePath: string) => void
  onPdfEntryDelete: (filePath: string) => void
  onLibraryFolderCreate: () => void
  onLibraryFolderToggle: (folderId: string) => void
  onLibraryPdfMoveToFolder: (filePath: string, folderId: string) => void
  onLibraryPdfMoveToRoot: (filePath: string) => void
  onOpenPdf: () => void
  onToggleAiConfig: () => void
  onToggleAiHistory: () => void
  onAiPopoversDismiss: () => void
  onAskSelection: () => void
  onMineruBlockDropToAi: (payload: MineruBlockDragPayload) => {
    text?: string
    imageAttachment?: ImageAttachmentItem
    clearAttachments?: boolean
  }
  onNoteCreateStart: () => void
  onNoteSelect: (filePath: string, noteId?: string) => void
  onNoteTabClose: (filePath: string, noteId: string) => void
  onNoteEntryRename: (filePath: string, noteId: string) => void
  onNoteEntryDelete: (filePath: string, noteId: string) => void
  onNoteSave: (filePath: string, noteId: string) => void
  onNoteTitleChange: (filePath: string, noteId: string, title: string) => void
  onNoteBlockAdd: (filePath: string, noteId: string, type: NoteBlockType, insertAfterBlockId?: string | null) => string
  onNoteBlockTypeChange: (filePath: string, noteId: string, blockId: string, type: NoteBlockType) => void
  onNoteBlockTextChange: (filePath: string, noteId: string, blockId: string, text: string) => void
  onNoteBlockStyleChange: (filePath: string, noteId: string, blockId: string, stylePatch: Partial<NoteBlockStyle>) => void
  onNoteBlockMediaChange: (filePath: string, noteId: string, blockId: string, contentPatch: Partial<MediaNoteBlockContent>) => void
  onNoteBlockDelete: (filePath: string, noteId: string, blockId: string) => void
  onNoteBlockMove: (filePath: string, noteId: string, blockId: string, insertAfterBlockId?: string | null) => void
  onNoteTodoChange: (filePath: string, noteId: string, blockId: string, checked: boolean) => void
  onNoteSourceJump: (filePath: string, noteId: string, blockId: string) => void
  onNoteMarkdownCopy: (filePath: string, noteId: string) => void
  onNoteExport: (filePath: string, noteId: string, format: NoteExportFormat) => void
  onNoteImagePaste: (filePath: string, noteId: string, images: ClipboardImagePayload[], insertAfterBlockId?: string | null) => void
  onNoteRestore: (filePath: string, noteId: string, noteSnapshot: NoteDocument) => void
  onMineruBlockDropToNote: (payload: MineruBlockDragPayload, insertAfterBlockId?: string | null) => void
  focusedNoteBlockRequest?: {
    filePath: string
    noteId: string
    blockId: string
    nonce: number
  } | null
  onTextTemplateCreate: (filePath: string) => void
  onFreeformTemplateCreate: (filePath: string) => void
  onScreenshotTemplateCreate: (filePath: string) => void
  onStatus: (status: string) => void
}): ReactElement {
  const [draggingPanelId, setDraggingPanelId] = useState<DockPanelId | null>(null)
  const [dropPreview, setDropPreview] = useState<DockDropPreview | null>(null)
  const hiddenPanelIds = useMemo(() => {
    const panelIds = new Set<DockPanelId>(hiddenDockPanels)
    if (isPrimarySidebarCollapsed) {
      panelIds.add('library')
    }
    return panelIds
  }, [hiddenDockPanels, isPrimarySidebarCollapsed])
  const visibleLayout = removePanelsFromDockLayout(layout, hiddenPanelIds)
  const currentAiPaperPath = selectedPdfPath || openPdfPaths[0] || libraryPdfPaths[0] || ''
  const currentAiConversations = currentAiPaperPath ? aiConversationsByPaperPath[currentAiPaperPath] ?? [] : []
  const activeAiConversationId =
    currentAiPaperPath && currentAiConversations.some((conversation) => conversation.id === activeAiConversationIdsByPaperPath[currentAiPaperPath])
      ? activeAiConversationIdsByPaperPath[currentAiPaperPath]
      : currentAiConversations[0]?.id ?? ''

  const updateDropPreview = (nextPreview: DockDropPreview): void => {
    setDropPreview((current) =>
      current?.targetId === nextPreview.targetId && current.position === nextPreview.position ? current : nextPreview
    )
  }

  const dockPanel = (sourceId: DockPanelId, targetId: DockPanelId, position: DockDropPosition): void => {
    if (sourceId === targetId) {
      return
    }

    const layoutWithoutSource = removePanelFromDockLayout(layout, sourceId)

    if (!layoutWithoutSource) {
      return
    }

    onLayoutChange(insertPanelIntoDockLayout(layoutWithoutSource, sourceId, targetId, position))
  }

  const renderPanelContent = (panelId: DockPanelId): ReactNode => {
    if (panelId === 'library') {
      return (
        <section className="sidebar library-panel">
          <PrimaryViewContent
            view={activeView}
            openPdfPaths={libraryPdfPaths}
            selectedPdfPath={selectedPdfPath}
            libraryStructure={libraryStructure}
            pdfFileInfoByPath={pdfFileInfoByPath}
            pdfDisplayNamesByPath={pdfDisplayNamesByPath}
            pdfViewStates={pdfViewStates}
            favoriteItemsByKey={favoriteItemsByKey}
            notesByPaperPath={notesByPaperPath}
            selectedNoteIdsByPaperPath={selectedNoteIdsByPaperPath}
            aiConversationsByPaperPath={aiConversationsByPaperPath}
            activeAiConversationIdsByPaperPath={activeAiConversationIdsByPaperPath}
            focusedAiMessageId={focusedAiMessageId}
            mineruParseResultByPdfPath={mineruParseResultByPdfPath}
            mineruCacheExistsByPdfPath={mineruCacheExistsByPdfPath}
            librarySortMode={librarySortMode}
            onLibrarySortModeChange={onLibrarySortModeChange}
            onOpenPdf={onOpenPdf}
            onOpenNote={onOpenNote}
            onPdfTabSelect={onPdfTabSelect}
            onPdfEntryRename={onPdfEntryRename}
            onPdfEntryDelete={onPdfEntryDelete}
            onLibraryFolderCreate={onLibraryFolderCreate}
            onLibraryFolderToggle={onLibraryFolderToggle}
            onLibraryPdfMoveToFolder={onLibraryPdfMoveToFolder}
            onLibraryPdfMoveToRoot={onLibraryPdfMoveToRoot}
            onAiGraphNodeSelect={onAiGraphNodeSelect}
            onFavoriteToggle={onFavoriteToggle}
            onNoteEntryRename={onNoteEntryRename}
            onNoteEntryDelete={onNoteEntryDelete}
            onPrimarySidebarCollapse={onPrimarySidebarCollapse}
          />
        </section>
      )
    }

    if (panelId === 'editor') {
      return (
        <section className="editor-area">
          <EditorContent
            activeEditor={activeEditor}
            openPdfPaths={openPdfPaths}
            selectedPdfPath={selectedPdfPath}
            pdfViewStates={pdfViewStates}
            focusedPdfSourceRegion={focusedPdfSourceRegion}
            focusedPdfSourceRegionNonce={focusedPdfSourceRegionNonce}
            onOpenPdf={onOpenPdf}
            onStatus={onStatus}
            onAskSelection={onAskSelection}
            onCreatePdfNote={onCreatePdfNote}
            onParseWithMineru={onParseWithMineru}
            onGenerateMineruNote={onGenerateMineruNote}
            onHideMineruLinkedRegions={onHideMineruLinkedRegions}
            onShowMineruLinkedRegions={onShowMineruLinkedRegions}
            onMineruClearCurrentCache={onMineruClearCurrentCache}
            onMineruClearAllCaches={onMineruClearAllCaches}
            onPdfViewStateChange={onPdfViewStateChange}
            onPdfToolbarChange={onPdfToolbarChange}
            mineruSettings={mineruSettings}
            onMineruSettingsChange={onMineruSettingsChange}
            mineruParseResultByPdfPath={mineruParseResultByPdfPath}
            hiddenMineruOverlayByPdfPath={hiddenMineruOverlayByPdfPath}
            linkedNoteRegions={linkedNoteRegions}
            onLinkedNoteRegionSelect={onLinkedNoteRegionSelect}
          />
        </section>
      )
    }

    if (panelId === 'note') {
      const visiblePdfPath = selectedPdfPath || openPdfPaths[0] || libraryPdfPaths[0] || ''
      const notes = visiblePdfPath ? getPaperNotes(notesByPaperPath, visiblePdfPath) : []
      const isTemplatePending = visiblePdfPath ? Boolean(pendingNoteTemplateByPaperPath[visiblePdfPath]) : false
      const selectedNoteId = visiblePdfPath && !isTemplatePending
        ? getSelectedOpenNoteIdForPaper(selectedNoteIdsByPaperPath, openNoteIdsByPaperPath, notesByPaperPath, visiblePdfPath)
        : ''
      const note = selectedNoteId ? notes.find((currentNote) => currentNote.id === selectedNoteId) : undefined
      const isDirty = note ? isNoteDirty(savedNotesByPaperPath, notesByPaperPath, visiblePdfPath, note.id) : false

      return (
        <section className="editor-area note-panel-area">
          <NotePanelContent
            visiblePdfPath={visiblePdfPath}
            notes={notes}
            note={note}
            isTemplatePending={isTemplatePending}
            isDirty={isDirty}
            favoriteItemsByKey={favoriteItemsByKey}
            isCreatingScreenshotNote={creatingScreenshotNotePath === visiblePdfPath}
            onOpenPdf={onOpenPdf}
            onFavoriteToggle={onFavoriteToggle}
            onSave={onNoteSave}
            onTitleChange={onNoteTitleChange}
            onBlockAdd={onNoteBlockAdd}
            onBlockTypeChange={onNoteBlockTypeChange}
            onBlockTextChange={onNoteBlockTextChange}
            onBlockStyleChange={onNoteBlockStyleChange}
            onBlockMediaChange={onNoteBlockMediaChange}
            onBlockDelete={onNoteBlockDelete}
            onBlockMove={onNoteBlockMove}
            onTodoChange={onNoteTodoChange}
            onSourceJump={onNoteSourceJump}
            onMarkdownCopy={onNoteMarkdownCopy}
            onExportNote={onNoteExport}
            onImagePaste={onNoteImagePaste}
            onNoteRestore={onNoteRestore}
            onMineruBlockDrop={onMineruBlockDropToNote}
            onReadPastedImages={readPastedClipboardImages}
            focusedNoteBlockRequest={focusedNoteBlockRequest}
            onTextTemplateCreate={onTextTemplateCreate}
            onFreeformTemplateCreate={onFreeformTemplateCreate}
            onScreenshotTemplateCreate={onScreenshotTemplateCreate}
          />
        </section>
      )
    }

    return (
      <aside className="auxbar ai-panel">
        <AiChatPanel
          isConfigOpen={isAiConfigOpen}
          isHistoryOpen={isAiHistoryOpen}
          paperPath={currentAiPaperPath}
          pdfViewState={currentAiPaperPath ? pdfViewStates[currentAiPaperPath] : undefined}
          notes={currentAiPaperPath ? getPaperNotes(notesByPaperPath, currentAiPaperPath) : []}
          conversations={currentAiConversations}
          activeConversationId={activeAiConversationId}
          focusedMessageId={focusedAiMessageId}
          favoriteItemsByKey={favoriteItemsByKey}
          settings={aiSettings}
          onSettingsChange={onAiSettingsChange}
          onConversationCreate={onAiConversationCreateForPaper}
          onConversationSelect={onAiConversationSelect}
          onConversationUpdate={onAiConversationUpdate}
          onConversationBranch={onAiConversationBranch}
          onConversationRename={onAiConversationRename}
          onConversationDelete={onAiConversationDelete}
          onFavoriteToggle={onFavoriteToggle}
          onPopoversDismiss={onAiPopoversDismiss}
          onMineruBlockDropToAi={onMineruBlockDropToAi}
          onStatus={onStatus}
        />
      </aside>
    )
  }

  const renderDockPanel = (panelId: DockPanelId): ReactElement => {
    const activePrimaryViewItem = panelId === 'library' ? activityItems.find((item) => item.id === activeView) : undefined
    const panelItem = activePrimaryViewItem ?? dockPanelItems.find((item) => item.id === panelId)
    const dropPreviewPosition = dropPreview?.targetId === panelId ? dropPreview.position : null

    return (
      <WorkbenchPanelFrame
        panelId={panelId}
        title={panelItem?.title ?? panelId}
        icon={panelItem?.icon ?? 'codicon-window'}
        isDragging={draggingPanelId === panelId}
        dropPreviewPosition={dropPreviewPosition}
        hideTitlebar={panelId === 'library'}
        titlebarContent={
          panelId === 'editor' ? (
            <EditorTitlebarTabs
              activeEditor={activeEditor}
              openPdfPaths={openPdfPaths}
              selectedPdfPath={selectedPdfPath}
              pdfDisplayNamesByPath={pdfDisplayNamesByPath}
              onOpenPdf={onOpenPdf}
              onPdfTabClose={onPdfTabClose}
              onPdfTabSelect={onPdfTabSelect}
              onProfileOpen={onProfileOpen}
            />
          ) : panelId === 'note' ? (
            (() => {
              const currentPdfPath = selectedPdfPath || openPdfPaths[0] || libraryPdfPaths[0] || ''
              const isTemplatePending = Boolean(pendingNoteTemplateByPaperPath[currentPdfPath])

              return (
                <NoteTitlebarTabs
                  currentPdfPath={currentPdfPath}
                  notes={getPaperNotes(notesByPaperPath, currentPdfPath)}
                  savedNotes={getPaperNotes(savedNotesByPaperPath, currentPdfPath)}
                  openNoteIds={getOpenNoteIdsForPaper(openNoteIdsByPaperPath, notesByPaperPath, currentPdfPath)}
                  selectedNoteId={
                    isTemplatePending
                      ? ''
                      : getSelectedOpenNoteIdForPaper(
                          selectedNoteIdsByPaperPath,
                          openNoteIdsByPaperPath,
                          notesByPaperPath,
                          currentPdfPath
                        )
                  }
                  isTemplatePending={isTemplatePending}
                  onOpenPdf={onOpenPdf}
                  onNoteCreate={onNoteCreateStart}
                  onNoteSelect={onNoteSelect}
                  onNoteClose={onNoteTabClose}
                />
              )
            })()
          ) : panelId === 'ai' ? (
            <AiTitlebarTabs
              paperPath={currentAiPaperPath}
              conversations={currentAiConversations}
              activeConversationId={activeAiConversationId}
              onOpenPdf={onOpenPdf}
              onConversationSelect={onAiConversationSelect}
            />
          ) : undefined
        }
        titlebarActions={
          panelId === 'library' ? (
            <button
              className="workbench-titlebar-button"
              type="button"
              title="收起侧边栏"
              aria-label="收起侧边栏"
              draggable={false}
              onClick={onPrimarySidebarCollapse}
            >
              <span className="codicon codicon-chevron-left" aria-hidden="true" />
            </button>
          ) : panelId === 'ai' ? (
            <>
              <button
                className="workbench-titlebar-button"
                type="button"
                title="新建对话"
                aria-label="新建 AI 对话"
                draggable={false}
                onClick={onAiConversationCreate}
              >
                <span className="codicon codicon-add" aria-hidden="true" />
              </button>
              <button
                className={isAiConfigOpen ? 'workbench-titlebar-button active' : 'workbench-titlebar-button'}
                type="button"
                title="AI 设置"
                aria-label="AI 设置"
                aria-expanded={isAiConfigOpen}
                draggable={false}
                onClick={onToggleAiConfig}
              >
                <span className="codicon codicon-settings-gear" aria-hidden="true" />
              </button>
              <button
                className={isAiHistoryOpen ? 'workbench-titlebar-button active' : 'workbench-titlebar-button'}
                type="button"
                title="历史记录"
                aria-label="历史记录"
                aria-expanded={isAiHistoryOpen}
                draggable={false}
                onClick={onToggleAiHistory}
              >
                <span className="codicon codicon-history" aria-hidden="true" />
              </button>
            </>
          ) : undefined
        }
        onClose={isClosableDockPanelId(panelId) ? () => onDockPanelClose(panelId) : undefined}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData(dockPanelDragMimeType, panelId)
          event.dataTransfer.setData('text/plain', panelId)
          setDraggingPanelId(panelId)
        }}
        onDragEnd={() => {
          setDraggingPanelId(null)
          setDropPreview(null)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'

          if (draggingPanelId && draggingPanelId !== panelId) {
            updateDropPreview({
              targetId: panelId,
              position: getDockDropPosition(event)
            })
          }
        }}
        onDragLeave={(event) => {
          if (shouldClearDropPreview(event)) {
            setDropPreview(null)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          const sourceIdText =
            event.dataTransfer.getData(dockPanelDragMimeType) || event.dataTransfer.getData('text/plain')

          if (isDockPanelId(sourceIdText)) {
            dockPanel(
              sourceIdText,
              panelId,
              dropPreview?.targetId === panelId ? dropPreview.position : getDockDropPosition(event)
            )
          }

          setDraggingPanelId(null)
          setDropPreview(null)
        }}
      >
        {renderPanelContent(panelId)}
      </WorkbenchPanelFrame>
    )
  }

  const renderDockNode = (node: DockLayoutNode): ReactElement => {
    if (isDockPanelId(node)) {
      return renderDockPanel(node)
    }

    const groupId = getDockPanelGroupId(node)
    const childDefaultSizes = getDockNodeDefaultSizes(node.children, node.direction)

    return (
      <PanelGroup id={groupId} direction={node.direction} dir="ltr" className={`dock-panel-group ${node.direction}`}>
        {node.children.map((child, index) => (
          <Fragment key={getDockNodeKey(child)}>
            {index > 0 && (
              <PanelResizeHandle
                id={getDockPanelResizeHandleId(groupId, index)}
                className={`workbench-panel-resize-handle ${node.direction}`}
              />
            )}
            <Panel
              id={getDockResizableNodeId(child)}
              order={index + 1}
              defaultSize={childDefaultSizes[index]}
              minSize={getDockNodeMinSize(child)}
            >
              {renderDockNode(child)}
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    )
  }

  return (
    <div className={isPrimarySidebarCollapsed ? 'workbench-layout-shell primary-sidebar-collapsed' : 'workbench-layout-shell'}>
      {visibleLayout ? renderDockNode(visibleLayout) : null}
      {!visibleLayout ? (
        <div className="empty-workbench">
          <span className="codicon codicon-layout" aria-hidden="true" />
          <p>从 View 菜单重新打开 PDF、Note 或 AI 栏。</p>
        </div>
      ) : null}
    </div>
  )
}

function WorkbenchPanelFrame({
  panelId,
  title,
  icon,
  isDragging,
  dropPreviewPosition,
  hideTitlebar = false,
  titlebarContent,
  titlebarActions,
  onClose,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  children
}: {
  panelId: DockPanelId
  title: string
  icon: string
  isDragging: boolean
  dropPreviewPosition: DockDropPosition | null
  hideTitlebar?: boolean
  titlebarContent?: ReactNode
  titlebarActions?: ReactNode
  onClose?: () => void
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  children: ReactNode
}): ReactElement {
  const frameClassName = [
    'workbench-panel-frame',
    `panel-${panelId}`,
    hideTitlebar ? 'no-titlebar' : '',
    isDragging ? 'dragging' : '',
    dropPreviewPosition ? 'drop-target' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={frameClassName}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {!hideTitlebar ? (
      <div
        className="workbench-panel-titlebar"
        draggable
        title="拖动以停靠工作区面板"
        aria-label={`拖动 ${title} 面板`}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
            <span className={`codicon ${icon}`} aria-hidden="true" />
            <div className="workbench-panel-titlebar-main">
              <span className="workbench-panel-titlebar-title">{title}</span>
              {titlebarContent}
            </div>
            {titlebarActions || onClose ? (
              <div
                className="workbench-panel-titlebar-actions"
                onMouseDown={(event) => event.stopPropagation()}
                onDragStart={(event) => event.preventDefault()}
              >
                {titlebarActions}
                {onClose ? (
                  <button
                    className="workbench-titlebar-button"
                    type="button"
                    title={`关闭 ${title} 栏`}
                    aria-label={`关闭 ${title} 栏`}
                    draggable={false}
                    onClick={onClose}
                  >
                    <span className="codicon codicon-close" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : (
              <span className="codicon codicon-gripper" aria-hidden="true" />
            )}
      </div>
      ) : null}
      <div className={`workbench-panel-content ${panelId}`}>{children}</div>
      {dropPreviewPosition && <div className={`dock-preview ${dropPreviewPosition}`} aria-hidden="true" />}
    </section>
  )
}

function EditorTitlebarTabs({
  activeEditor,
  openPdfPaths,
  selectedPdfPath,
  pdfDisplayNamesByPath,
  onOpenPdf,
  onPdfTabClose,
  onPdfTabSelect,
  onProfileOpen
}: {
  activeEditor: EditorTab
  openPdfPaths: string[]
  selectedPdfPath: string
  pdfDisplayNamesByPath: PdfDisplayNamesByPath
  onOpenPdf: () => void
  onPdfTabClose: (filePath: string) => void
  onPdfTabSelect: (filePath: string) => void
  onProfileOpen: () => void
}): ReactElement {
  return (
    <div
      className="editor-titlebar-tabs"
      onMouseDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="pdf-title-tab-strip" role="tablist" aria-label="已打开 PDF" onWheel={handleTabStripWheel}>
        {activeEditor === 'profile' ? (
          <button
            className="browser-profile-tab active"
            type="button"
            role="tab"
            aria-selected="true"
            title="个人主页"
            onClick={onProfileOpen}
          >
            <span className="profile-avatar-small" aria-hidden="true">
              <span />
            </span>
            <span>个人主页</span>
          </button>
        ) : null}
        {openPdfPaths.length > 0 ? (
          openPdfPaths.map((filePath) => {
            const displayName = getPdfDisplayName(filePath, pdfDisplayNamesByPath)

            return (
              <div
                key={filePath}
                className={
                  activeEditor === 'pdf' && selectedPdfPath === filePath ? 'browser-pdf-tab active' : 'browser-pdf-tab'
                }
                role="tab"
                aria-selected={activeEditor === 'pdf' && selectedPdfPath === filePath}
                title={filePath}
              >
                <button className="pdf-tab-select" type="button" onClick={() => onPdfTabSelect(filePath)}>
                  <span className="codicon codicon-file-pdf" aria-hidden="true" />
                  <span>{displayName}</span>
                </button>
                <button
                  className="pdf-tab-close"
                  type="button"
                  title="关闭 PDF 标签"
                  aria-label={`关闭 ${displayName}`}
                  onClick={() => onPdfTabClose(filePath)}
                >
                  <span className="codicon codicon-close" aria-hidden="true" />
                </button>
              </div>
            )
          })
        ) : (
          <button className="browser-pdf-tab placeholder" type="button" onClick={onOpenPdf}>
            <span className="codicon codicon-file-pdf" aria-hidden="true" />
            <span>打开 PDF</span>
          </button>
        )}
      </div>
      <button className="editor-tab-add" type="button" title="打开 PDF" aria-label="打开 PDF" onClick={onOpenPdf}>
        <span className="codicon codicon-add" aria-hidden="true" />
      </button>
    </div>
  )
}

function NoteTitlebarTabs({
  currentPdfPath,
  notes,
  savedNotes,
  openNoteIds,
  selectedNoteId,
  isTemplatePending,
  onOpenPdf,
  onNoteCreate,
  onNoteSelect,
  onNoteClose
}: {
  currentPdfPath: string
  notes: NoteDocument[]
  savedNotes: NoteDocument[]
  openNoteIds: string[]
  selectedNoteId: string
  isTemplatePending: boolean
  onOpenPdf: () => void
  onNoteCreate: () => void
  onNoteSelect: (filePath: string, noteId?: string) => void
  onNoteClose: (filePath: string, noteId: string) => void
}): ReactElement {
  const openNotes = openNoteIds
    .map((noteId) => notes.find((note) => note.id === noteId))
    .filter((note): note is NoteDocument => Boolean(note))

  return (
    <div
      className="editor-titlebar-tabs"
      onMouseDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="pdf-title-tab-strip" role="tablist" aria-label="已打开 Note" onWheel={handleTabStripWheel}>
        {currentPdfPath ? (
          <>
            {openNotes.map((note, index) => (
              <div
                key={note.id}
                className={selectedNoteId === note.id ? 'browser-note-tab active' : 'browser-note-tab'}
                role="tab"
                aria-selected={selectedNoteId === note.id}
                title={note.title}
              >
                <button className="pdf-tab-select" type="button" onClick={() => onNoteSelect(currentPdfPath, note.id)}>
                  <span className="codicon codicon-notebook" aria-hidden="true" />
                  {isNoteDirtyForDocument(savedNotes, note) ? <span className="note-tab-dirty-dot" aria-hidden="true" /> : null}
                  <span>{note.title || `笔记 ${index + 1}`}</span>
                </button>
                <button
                  className="pdf-tab-close"
                  type="button"
                  title="关闭笔记标签"
                  aria-label={`关闭 ${note.title || `笔记 ${index + 1}`}`}
                  onClick={() => onNoteClose(currentPdfPath, note.id)}
                >
                  <span className="codicon codicon-close" aria-hidden="true" />
                </button>
              </div>
            ))}
            {isTemplatePending && (
              <button className="browser-note-tab placeholder active" type="button" onClick={onNoteCreate}>
                <span className="codicon codicon-notebook" aria-hidden="true" />
                <span>新建当前 PDF 笔记</span>
              </button>
            )}
            {!isTemplatePending && openNotes.length === 0 ? (
              notes.length > 0 ? (
                <span className="browser-note-tab placeholder" role="tab" aria-selected="false">
                  <span className="codicon codicon-notebook" aria-hidden="true" />
                  <span>从左侧打开笔记</span>
                </span>
              ) : (
                <button className="browser-note-tab placeholder active" type="button" onClick={onNoteCreate}>
                  <span className="codicon codicon-notebook" aria-hidden="true" />
                  <span>新建当前 PDF 笔记</span>
                </button>
              )
            ) : null}
          </>
        ) : (
          <button className="browser-note-tab placeholder" type="button" onClick={onOpenPdf}>
            <span className="codicon codicon-notebook" aria-hidden="true" />
            <span>先打开 PDF</span>
          </button>
        )}
      </div>
      <button
        className="editor-tab-add"
        type="button"
        title={currentPdfPath ? '为当前 PDF 新增笔记' : '先打开 PDF'}
        aria-label={currentPdfPath ? '为当前 PDF 新增笔记' : '先打开 PDF'}
        onClick={currentPdfPath ? onNoteCreate : onOpenPdf}
      >
        <span className="codicon codicon-add" aria-hidden="true" />
      </button>
    </div>
  )
}

function AiTitlebarTabs({
  paperPath,
  conversations,
  activeConversationId,
  onOpenPdf,
  onConversationSelect
}: {
  paperPath: string
  conversations: AiConversation[]
  activeConversationId: string
  onOpenPdf: () => void
  onConversationSelect: (paperPath: string, conversationId: string) => void
}): ReactElement {
  return (
    <div
      className="editor-titlebar-tabs ai-titlebar-tabs"
      onMouseDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="pdf-title-tab-strip" role="tablist" aria-label="已打开 AI 对话" onWheel={handleTabStripWheel}>
        {paperPath ? (
          conversations.length > 0 ? (
            conversations.map((conversation) => {
              const conversationQuestionLabel = getAiConversationQuestionLabel(conversation, '新问题')

              return (
                <button
                  key={conversation.id}
                  className={activeConversationId === conversation.id ? 'browser-ai-tab active' : 'browser-ai-tab'}
                  type="button"
                  role="tab"
                  aria-selected={activeConversationId === conversation.id}
                  title={`${getFileName(paperPath)} · ${conversationQuestionLabel}`}
                  onClick={() => onConversationSelect(paperPath, conversation.id)}
                >
                  <span className="codicon codicon-comment-discussion" aria-hidden="true" />
                  <span>{conversationQuestionLabel}</span>
                </button>
              )
            })
          ) : (
            <span className="browser-ai-tab placeholder" role="tab" aria-selected="false">
              <span className="codicon codicon-comment-discussion" aria-hidden="true" />
              <span>新对话</span>
            </span>
          )
        ) : (
          <button className="browser-ai-tab placeholder" type="button" onClick={onOpenPdf}>
            <span className="codicon codicon-file-pdf" aria-hidden="true" />
            <span>先打开 PDF</span>
          </button>
        )}
      </div>
    </div>
  )
}

function AiChatPanel({
  isConfigOpen,
  isHistoryOpen,
  paperPath,
  pdfViewState,
  notes,
  conversations,
  activeConversationId,
  focusedMessageId,
  favoriteItemsByKey,
  settings,
  onSettingsChange,
  onConversationCreate,
  onConversationSelect,
  onConversationUpdate,
  onConversationBranch,
  onConversationRename,
  onConversationDelete,
  onFavoriteToggle,
  onPopoversDismiss,
  onMineruBlockDropToAi,
  onStatus
}: {
  isConfigOpen: boolean
  isHistoryOpen: boolean
  paperPath: string
  pdfViewState?: PersistedPdfViewState
  notes: NoteDocument[]
  conversations: AiConversation[]
  activeConversationId: string
  focusedMessageId: string
  favoriteItemsByKey: FavoriteItemsByKey
  settings: PersistedAiSettingsState
  onSettingsChange: (patch: Partial<PersistedAiSettingsState>) => void
  onConversationCreate: (
    paperPath: string,
    options?: {
      title?: string
      parentAnswerId?: string
      messages?: ChatMessage[]
      contextSelections?: AiContextSelection[]
    }
  ) => string
  onConversationSelect: (paperPath: string, conversationId: string) => void
  onConversationUpdate: (conversationId: string, updater: (conversation: AiConversation) => AiConversation) => void
  onConversationBranch: (conversationId: string, answerId: string) => void
  onConversationRename: (conversationId: string) => void
  onConversationDelete: (conversationId: string) => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onPopoversDismiss: () => void
  onMineruBlockDropToAi: (payload: MineruBlockDragPayload) => {
    text?: string
    imageAttachment?: ImageAttachmentItem
    clearAttachments?: boolean
  }
  onStatus: (status: string) => void
}): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const turnListRef = useRef<HTMLDivElement | null>(null)
  const turnRefs = useRef<Record<string, HTMLElement | null>>({})
  const composerResizeRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
  } | null>(null)
  const requestGenerationRef = useRef(0)
  const {
    providerId,
    baseUrl,
    model,
    reasoningEffort,
    disableResponseStorage,
    requiresOpenAiAuth,
    systemPrompt
  } = settings
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [isContextLoading, setIsContextLoading] = useState(false)
  const [contextNotice, setContextNotice] = useState('')
  const [aiContextCacheKeys, setAiContextCacheKeys] = useState<Set<string>>(() => new Set())
  const [measuredContextBudgetByCacheKey, setMeasuredContextBudgetByCacheKey] = useState<Record<string, number>>({})
  const [isContextExpanded, setIsContextExpanded] = useState(false)
  const [expandedAttachmentMessageIds, setExpandedAttachmentMessageIds] = useState<Record<string, boolean>>({})
  const [activeTurnId, setActiveTurnId] = useState('')
  const [hoveredTurnId, setHoveredTurnId] = useState('')
  const [expandedAnswerIds, setExpandedAnswerIds] = useState<Record<string, boolean>>({})
  const [composerHeight, setComposerHeight] = useState(aiComposerDefaultHeight)
  const [result, setResult] = useState<{
    ok: boolean
    status: number
    message: string
    outputText?: string
    responseId?: string
  } | null>(null)
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId)
  const messages = activeConversation?.messages ?? []
  const scopedMessages = activeConversation ? getAiConversationScopedMessages(activeConversation) : []
  const currentPaperNotes = notes
  const aiContextChoices = useMemo(
    () => buildAiContextChoiceCatalog({
      paperPath,
      pdfViewState,
      notes: currentPaperNotes,
      conversation: activeConversation
    }),
    [activeConversation, currentPaperNotes, paperPath, pdfViewState]
  )
  const activeContextSelections = activeConversation?.contextSelections ?? []
  const activeContextSelectionKeys = new Set(activeContextSelections.map((selection) => getAiContextSelectionKey(selection)))
  const selectedContextBudget = useMemo(
    () =>
      buildAiContextBudget({
        paperPath,
        model,
        promptDraft: draft,
        messageHistory: messages,
        selectedSelections: activeContextSelections,
        contextChoices: aiContextChoices,
        knownCacheKeys: aiContextCacheKeys,
        measuredBudgetByCacheKey: measuredContextBudgetByCacheKey
      }),
    [activeContextSelections, aiContextCacheKeys, aiContextChoices, draft, measuredContextBudgetByCacheKey, messages, model, paperPath]
  )

  useEffect(() => {
    const handleWindowResize = (): void => {
      setComposerHeight((current) => clampNumber(current, aiComposerMinHeight, getAiComposerMaxHeight()))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    setContextNotice('')
  }, [paperPath])

  useEffect(() => {
    setIsContextExpanded(false)
    setExpandedAttachmentMessageIds({})
  }, [activeConversationId])

  useEffect(() => {
    setActiveTurnId('')
    setHoveredTurnId('')
    turnRefs.current = {}
  }, [activeConversationId])

  useEffect(() => {
    setExpandedAnswerIds({})
  }, [activeConversationId])

  const turns = getChatTurns(messages)
  const scopedTurns = getChatTurns(scopedMessages)
  const parentAnswerMessageId = activeConversation?.parentAnswerId ?? ''
  const branchAnchorAnswer = parentAnswerMessageId ? messages.find((message) => message.id === parentAnswerMessageId) : undefined
  const branchPrefixTurns =
    parentAnswerMessageId && branchAnchorAnswer
      ? getChatTurns(messages.slice(0, messages.findIndex((message) => message.id === parentAnswerMessageId) + 1))
      : []
  const branchAnchorTurn = branchPrefixTurns.at(-1)
  const branchVisibleTurns = parentAnswerMessageId ? scopedTurns : turns
  const collapsedTurnCount = Math.max(0, branchPrefixTurns.length - 1)
  const visibleTurns = isHistoryOpen ? branchVisibleTurns : branchVisibleTurns.slice(-3)
  const visibleTurnIdsKey = visibleTurns.map((turn) => turn.id).join('|')
  const historyConversations = useMemo(
    () => [...conversations].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [conversations]
  )
  const branchOriginConversationId = useMemo(() => {
    if (!activeConversation?.parentAnswerId) {
      return ''
    }

    return (
      conversations.find((conversation) => {
        if (conversation.id === activeConversation.id) {
          return false
        }

        return getAiConversationScopedMessages(conversation).some((message) => message.id === activeConversation.parentAnswerId)
      })?.id ?? ''
    )
  }, [activeConversation, conversations])
  const modelChoices = modelOptions.includes(model) ? modelOptions : [model, ...modelOptions]
  const contextLabel = getAiContextLabel({
    paperPath,
    notesCount: notes.length,
    isLoading: isContextLoading,
    notice: contextNotice
  })

  const toggleAiContextSelection = (selection: AiContextSelection): void => {
    if (!paperPath) {
      return
    }

    if (!activeConversationId) {
      const conversationId = onConversationCreate(paperPath, {
        contextSelections: [selection]
      })

      if (!conversationId) {
        return
      }

      onStatus('已为当前论文创建 AI 对话并选中上下文')
      return
    }

    const key = getAiContextSelectionKey(selection)
    onConversationUpdate(activeConversationId, (conversation) => {
      const currentSelections = conversation.contextSelections ?? []
      const nextSelections = currentSelections.some((item) => getAiContextSelectionKey(item) === key)
        ? currentSelections.filter((item) => getAiContextSelectionKey(item) !== key)
        : [...currentSelections, selection]

      return {
        ...conversation,
        contextSelections: nextSelections,
        updatedAt: new Date().toISOString()
      }
    })
  }

  const resetConversation = (): void => {
    requestGenerationRef.current += 1
    setDraft('')
    setAttachments([])
    setResult(null)
    setIsBusy(false)

    if (activeConversationId) {
      onConversationUpdate(activeConversationId, (conversation) => ({
        ...conversation,
        title: conversation.parentAnswerId ? conversation.title : '新对话',
        messages: [],
        updatedAt: new Date().toISOString()
      }))
    }
  }

  const startComposerResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }

    composerResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: composerRef.current?.getBoundingClientRect().height ?? composerHeight
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const updateComposerResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const resizeState = composerResizeRef.current
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return
    }

    setComposerHeight(
      clampNumber(resizeState.startHeight + resizeState.startY - event.clientY, aiComposerMinHeight, getAiComposerMaxHeight())
    )
    event.preventDefault()
  }

  const finishComposerResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (composerResizeRef.current?.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    composerResizeRef.current = null
  }

  const addAttachments = (files: FileList | null): void => {
    if (!files?.length) {
      return
    }

    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter((file) => file.type.startsWith('image/'))
    const nextAttachments: AttachmentItem[] = fileArray
      .filter((file) => !file.type.startsWith('image/'))
      .map((file) => ({
        id: createMessageId(),
        kind: 'file',
        name: file.name,
        size: file.size,
        mimeType: file.type || undefined
      }))

    if (nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments])
    }

    if (imageFiles.length > 0) {
      void Promise.all(imageFiles.map(readImageFileAttachment)).then(
        (imageAttachments) => {
          setAttachments((current) => [...current, ...imageAttachments])
          onStatus(`已添加 ${nextAttachments.length + imageAttachments.length} 个附件`)
        },
        () => onStatus('读取图片附件失败')
      )
      return
    }

    onStatus(`已添加 ${nextAttachments.length} 个附件`)
  }

  const pasteImagesIntoComposer = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    if (hasClipboardPlainText(event.clipboardData)) {
      return
    }

    event.preventDefault()
    void readPastedClipboardImages(event.clipboardData).then((images) => {
      if (images.length === 0) {
        return
      }

      setAttachments((current) => [...current, ...images.map(createImageAttachmentFromPayload)])
      onStatus(`已从剪切板粘贴 ${images.length} 张截图`)
    })
  }

  const dragMineruBlockOverComposer = (event: DragEvent<HTMLDivElement | HTMLTextAreaElement>): void => {
    if (!hasMineruBlockDragPayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const dropMineruBlockIntoComposer = (event: DragEvent<HTMLDivElement | HTMLTextAreaElement>): void => {
    const payload = readMineruBlockDragPayload(event.dataTransfer)
    if (!payload) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const droppedContent = onMineruBlockDropToAi(payload)
    if (droppedContent.clearAttachments) {
      setAttachments([])
    }
    if (droppedContent.imageAttachment) {
      setAttachments((current) => [...current, droppedContent.imageAttachment!])
    }
    if (droppedContent.text) {
      setDraft((current) => appendTextAsNewParagraph(current, droppedContent.text!))
    }
  }

  const copyAnswer = (message: ChatMessage): void => {
    if (!message.content.trim()) {
      onStatus('当前回答还没有可复制内容')
      return
    }

    void navigator.clipboard.writeText(message.content).then(
      () => onStatus('已复制 AI 回答'),
      () => onStatus('复制 AI 回答失败')
    )
  }

  const toggleAnswerExpanded = (messageId: string): void => {
    if (!messageId) {
      return
    }

    setExpandedAnswerIds((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }))
  }

  const toggleAttachmentGroupExpanded = (messageId: string): void => {
    if (!messageId) {
      return
    }

    setExpandedAttachmentMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }))
  }

  const testProvider = async (): Promise<void> => {
    const requestGeneration = requestGenerationRef.current
    setIsBusy(true)
    setResult(null)
    onStatus(`正在测试 ${providerId} / ${model}`)

    try {
      const response = await window.thesisAgent.testAiProvider({
        providerId,
        baseUrl,
        wireApi: 'responses',
        model,
        reasoningEffort,
        disableResponseStorage,
        requiresOpenAiAuth,
        apiKey: settings.apiKey,
        prompt: 'Reply with one short sentence: Inspiration AI provider test succeeded.'
      })

      if (requestGenerationRef.current !== requestGeneration) {
        return
      }

      setResult(response)
      onStatus(response.ok ? `AI 连接测试通过 (${response.status})` : `AI 连接测试失败 (${response.status})`)
    } catch (error) {
      if (requestGenerationRef.current !== requestGeneration) {
        return
      }

      const message = error instanceof Error ? error.message : 'AI 连接测试失败。'
      setResult({
        ok: false,
        status: 0,
        message
      })
      onStatus(message)
    } finally {
      if (requestGenerationRef.current === requestGeneration) {
        setIsBusy(false)
        setIsContextLoading(false)
      }
    }
  }

  const scrollToTurn = (turn: ChatTurn): void => {
    const element = turnRefs.current[turn.id]
    if (!element) {
      return
    }

    setActiveTurnId(turn.id)
    scrollElementIntoContainer(element, turnListRef.current)
  }

  useEffect(() => {
    const container = turnListRef.current

    if (!container || visibleTurns.length === 0) {
      return
    }

    const syncActiveTurnFromScroll = (): void => {
      const containerRect = container.getBoundingClientRect()
      const anchorY = containerRect.top + Math.min(containerRect.height * 0.35, 120)
      let closestTurnId = visibleTurns[0]?.id ?? ''
      let closestDistance = Number.POSITIVE_INFINITY

      for (const turn of visibleTurns) {
        const element = turnRefs.current[turn.id]
        if (!element) {
          continue
        }

        const rect = element.getBoundingClientRect()
        const elementAnchorY = rect.top + Math.min(rect.height * 0.35, 72)
        const distance = Math.abs(elementAnchorY - anchorY)

        if (distance < closestDistance) {
          closestDistance = distance
          closestTurnId = turn.id
        }
      }

      if (closestTurnId) {
        setActiveTurnId((current) => (current === closestTurnId ? current : closestTurnId))
      }
    }

    syncActiveTurnFromScroll()
    container.addEventListener('scroll', syncActiveTurnFromScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', syncActiveTurnFromScroll)
    }
  }, [visibleTurnIdsKey])

  useEffect(() => {
    if (!focusedMessageId) {
      return
    }

    const focusedTurn = visibleTurns.find((turn) => turn.question.id === focusedMessageId || turn.answer?.id === focusedMessageId)
    const element = focusedTurn ? turnRefs.current[focusedTurn.id] : null
    if (!focusedTurn || !element) {
      return
    }

    setActiveTurnId(focusedTurn.id)
    scrollElementIntoContainer(element, turnListRef.current)
  }, [activeConversationId, focusedMessageId, isHistoryOpen, visibleTurns.length])

  const runQuickAction = (action: AiQuickAction): void => {
    if (isBusy) {
      return
    }

    if (!paperPath) {
      onStatus('请先打开一个 PDF，再使用快捷任务')
      return
    }

    setDraft(action.prompt)
    void sendMessage(action.prompt)
  }

  const sendMessage = async (promptOverride?: string): Promise<void> => {
    const prompt = (promptOverride ?? draft).trim()
    if (!prompt || isBusy) {
      return
    }

    if (!paperPath) {
      onStatus('请先打开一个 PDF，再开始 AI 对话')
      return
    }

    const conversationId = activeConversation?.id || onConversationCreate(paperPath)
    if (!conversationId) {
      return
    }

    const requestGeneration = requestGenerationRef.current
    const existingMessages = activeConversation?.messages ?? []
    const attachmentNames = attachments.map((attachment) => attachment.name)
    const imageAttachments = attachments.filter(isImageAttachment)
    const attachmentSummary = attachmentNames.length > 0 ? `\n\n附件：${attachmentNames.join('、')}` : ''
    const promptWithAttachments = `${prompt}${attachmentSummary}`
    const startedAt = performance.now()
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: prompt,
      attachmentNames,
      attachments: imageAttachments
    }
    const pendingMessage: ChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      content: '',
      status: 'sending'
    }
    const history = existingMessages.filter((message) => message.status !== 'error' && message.status !== 'sending')
    const nextMessages = [...existingMessages, userMessage, pendingMessage]

    onConversationUpdate(conversationId, (conversation) => ({
      ...conversation,
      title: deriveAiConversationTitle(nextMessages, conversation.title),
      messages: nextMessages,
      updatedAt: new Date().toISOString()
    }))
    setDraft('')
    setAttachments([])
    setResult(null)
    setContextNotice('')
    setActiveTurnId(userMessage.id)
    setIsBusy(true)
    onStatus('正在读取当前论文上下文')

    try {
      setIsContextLoading(true)
      const paperContext = await buildAiPaperContext({
        paperPath,
        pdfViewState,
        notes,
        selections: activeConversation?.contextSelections ?? []
      })
      const promptWithContext = buildPromptWithPaperContext(promptWithAttachments, paperContext)
      const measuredInputTokens =
        estimateTokenCount(history.map((message) => message.content).join('\n')) + estimateTokenCount(promptWithContext)

      if (requestGenerationRef.current !== requestGeneration) {
        return
      }

      setIsContextLoading(false)
      setMeasuredContextBudgetByCacheKey((current) => ({
        ...current,
        [selectedContextBudget.cacheKey]: measuredInputTokens
      }))
      setAiContextCacheKeys((current) => {
        const next = new Set(current)
        next.add(selectedContextBudget.cacheKey)
        return next
      })
      setContextNotice(
        paperContext.pdfTextError
          ? 'PDF 正文读取失败，已使用已选上下文'
          : `已接入 ${paperContext.selectedContextLabels.length} 个上下文块`
      )
      onStatus(
        paperContext.pdfTextError
          ? `读取当前 PDF 上下文失败，已使用已选上下文发送到 ${providerId} / ${model}`
          : `当前已选上下文已接入，正在发送到 ${providerId} / ${model}`
      )

      const response = await window.thesisAgent.sendAiMessage({
        providerId,
        baseUrl,
        wireApi: 'responses',
        model,
        reasoningEffort,
        disableResponseStorage,
        requiresOpenAiAuth,
        apiKey: settings.apiKey,
        systemPrompt,
        messages: history.map((message) => ({
          role: message.role,
          content: message.content
        })),
        prompt: promptWithContext,
        attachments: imageAttachments
      })

      if (requestGenerationRef.current !== requestGeneration) {
        return
      }

      onConversationUpdate(conversationId, (conversation) => {
        const nextStatus: ChatMessage['status'] = response.ok ? undefined : 'error'
        const updatedMessages: ChatMessage[] = conversation.messages.map((message) =>
          message.id === pendingMessage.id
            ? {
                ...message,
                content: response.ok ? response.outputText || response.message || 'AI 没有返回可显示内容。' : response.message,
                status: nextStatus,
                responseId: response.responseId,
                durationMs: Math.round(performance.now() - startedAt)
              }
            : message
        )

        return {
          ...conversation,
          title: deriveAiConversationTitle(updatedMessages, conversation.title),
          messages: updatedMessages,
          updatedAt: new Date().toISOString()
        }
      })
      setResult(response)
      onStatus(response.ok ? `AI 已回复 (${response.status})` : `AI 回复失败 (${response.status})`)
    } catch (error) {
      if (requestGenerationRef.current !== requestGeneration) {
        return
      }

      const message = error instanceof Error ? error.message : 'AI 请求失败。'
      onConversationUpdate(conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((item) =>
          item.id === pendingMessage.id
            ? {
                ...item,
                content: message,
                status: 'error',
                durationMs: Math.round(performance.now() - startedAt)
              }
            : item
        ),
        updatedAt: new Date().toISOString()
      }))
      setResult({
        ok: false,
        status: 0,
        message
      })
      onStatus(message)
    } finally {
      if (requestGenerationRef.current === requestGeneration) {
        setIsBusy(false)
      }
    }
  }

  const closeOpenPopoversFromPanelPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!isConfigOpen && !isHistoryOpen) {
      return
    }

    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (target.closest('.ai-config-popover, .ai-history-popover')) {
      return
    }

    onPopoversDismiss()
  }

  return (
    <div
      className={isHistoryOpen ? 'ai-chat history-open' : 'ai-chat history-closed'}
      onPointerDownCapture={closeOpenPopoversFromPanelPointerDown}
    >
      {isConfigOpen && (
        <section className="ai-config-popover" aria-label="AI 设置">
          <div className="ai-config-title">
            <strong>AI 配置</strong>
            <span>{providerId}</span>
          </div>
          <div className="ai-provider-form">
            <label>
              <span>Provider</span>
              <input value={providerId} spellCheck={false} onChange={(event) => onSettingsChange({ providerId: event.target.value })} />
            </label>
            <label>
              <span>Base URL</span>
              <input value={baseUrl} spellCheck={false} onChange={(event) => onSettingsChange({ baseUrl: event.target.value })} />
            </label>
            <label>
              <span>模型名称</span>
              <input value={model} spellCheck={false} onChange={(event) => onSettingsChange({ model: event.target.value })} />
            </label>
            <label>
              <span>API Key</span>
              <input
                type="password"
                value={settings.apiKey}
                placeholder="保存在本地 userData"
                spellCheck={false}
                onChange={(event) => onSettingsChange({ apiKey: event.target.value })}
              />
            </label>
            <label>
              <span>系统提示词</span>
              <textarea
                value={systemPrompt}
                rows={4}
                spellCheck={false}
                onChange={(event) => onSettingsChange({ systemPrompt: event.target.value })}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={disableResponseStorage}
                onChange={(event) => onSettingsChange({ disableResponseStorage: event.target.checked })}
              />
              <span>不保存 Responses 结果</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={requiresOpenAiAuth}
                onChange={(event) => onSettingsChange({ requiresOpenAiAuth: event.target.checked })}
              />
              <span>使用 Bearer Auth</span>
            </label>

            <div className="ai-config-actions">
              <button className="secondary-button" type="button" disabled={isBusy} onClick={() => void testProvider()}>
                <span className={isBusy ? 'codicon codicon-loading codicon-modifier-spin' : 'codicon codicon-debug-start'} />
                <span>测试连接</span>
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={isBusy}
                onClick={() => {
                  resetConversation()
                  onStatus('已清空当前对话')
                }}
              >
                <span className="codicon codicon-clear-all" />
                <span>清空问答</span>
              </button>
            </div>

            {result && (
              <div className={result.ok ? 'ai-test-result success' : 'ai-test-result error'}>
                <strong>{result.ok ? '最近请求成功' : '最近请求失败'}</strong>
                <span>HTTP {result.status || '-'}</span>
                <p>{result.message}</p>
                {result.responseId && <small>Response ID: {result.responseId}</small>}
              </div>
            )}
          </div>
        </section>
      )}

      {isHistoryOpen && (
        <section className="ai-history-popover" aria-label="AI 历史记录">
          <div className="ai-history-heading">
            <strong>历史记录</strong>
            <span>{paperPath ? getFileName(paperPath) : '未选择论文'}</span>
          </div>
          <div className="ai-history-list">
            {historyConversations.length > 0 ? (
              historyConversations.map((conversation) => {
                const conversationTurns = getChatTurns(conversation.messages)
                const lastTurn = conversationTurns.at(-1)
                const preview =
                  lastTurn?.answer?.content ||
                  lastTurn?.question.content ||
                  conversation.messages.at(-1)?.content ||
                  '空对话'

                const title = conversation.title || deriveAiConversationTitle(conversation.messages, '新对话')

                return (
                  <div
                    key={conversation.id}
                    className={conversation.id === activeConversationId ? 'ai-history-item-shell active' : 'ai-history-item-shell'}
                  >
                    <button
                      className="ai-history-item"
                      type="button"
                      title={title}
                      aria-current={conversation.id === activeConversationId ? 'true' : undefined}
                      onClick={() => {
                        onConversationSelect(paperPath, conversation.id)
                        onStatus(`已打开历史对话：${title}`)
                      }}
                    >
                      <span
                        className={`codicon ${conversation.parentAnswerId ? 'codicon-git-branch' : 'codicon-comment-discussion'}`}
                        aria-hidden="true"
                      />
                      <span className="ai-history-item-main">
                        <strong>{title}</strong>
                        <small>{getMessagePreview(preview, 52)}</small>
                      </span>
                      <span className="ai-history-item-meta">
                        <span>{conversationTurns.length} 问</span>
                        <span>{formatUpdatedAt(conversation.updatedAt)}</span>
                      </span>
                    </button>
                    <div className="entry-row-actions ai-history-row-actions">
                      <EntryRowActionButton
                        icon="codicon-edit"
                        title={`重命名 ${title}`}
                        ariaLabel={`重命名 ${title}`}
                        onClick={() => onConversationRename(conversation.id)}
                      />
                      <EntryRowActionButton
                        icon="codicon-trash"
                        title={`删除 ${title}`}
                        ariaLabel={`删除 ${title}`}
                        variant="danger"
                        onClick={() => onConversationDelete(conversation.id)}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="ai-history-empty">
                <span className="codicon codicon-history" aria-hidden="true" />
                <span>{paperPath ? '当前论文还没有历史对话' : '先打开 PDF 后查看历史记录'}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="ai-recent" aria-label={isHistoryOpen ? '当前对话历史' : '最近三条问答'}>
        {visibleTurns.length > 0 && (
          <nav className="ai-turn-navigator" aria-label="问题快速跳转">
            <div className="ai-turn-navigator-rail" aria-hidden="true" />
            {visibleTurns.map((turn, index) => {
              const isCurrent =
                turn.id === activeTurnId ||
                Boolean(focusedMessageId && (turn.question.id === focusedMessageId || turn.answer?.id === focusedMessageId))
              const preview = getMessagePreview(turn.question.content, 52)
              const position = visibleTurns.length === 1 ? 50 : (index / Math.max(visibleTurns.length - 1, 1)) * 100

              return (
                <button
                  key={turn.id}
                  className={isCurrent ? 'active' : ''}
                  type="button"
                  style={{ top: `calc(8px + ${position}% * (100% - 16px) / 100)` }}
                  aria-label={`跳转到第 ${index + 1} 个问题：${getMessagePreview(turn.question.content, 36)}`}
                  onMouseEnter={() => setHoveredTurnId(turn.id)}
                  onMouseLeave={() => setHoveredTurnId((current) => (current === turn.id ? '' : current))}
                  onFocus={() => setHoveredTurnId(turn.id)}
                  onBlur={() => setHoveredTurnId((current) => (current === turn.id ? '' : current))}
                  onClick={() => scrollToTurn(turn)}
                >
                  {hoveredTurnId === turn.id && (
                    <span className="ai-turn-navigator-tooltip" role="tooltip">
                      {preview}
                    </span>
                  )}
                  <span className="ai-turn-navigator-dot" />
                </button>
              )
            })}
          </nav>
        )}
        <div ref={turnListRef} className="ai-turn-list" aria-live="polite">
          {branchOriginConversationId && branchAnchorTurn && (
            <button
              className="ai-branch-collapse-banner"
              type="button"
              onClick={() => {
                onConversationSelect(paperPath, branchOriginConversationId)
                onStatus('已回到原对话')
              }}
            >
              以往对话已折叠
            </button>
          )}
          {visibleTurns.length === 0 ? (
            <div className="ai-empty-state">
              <span className="codicon codicon-comment-discussion" aria-hidden="true" />
              <p>{paperPath ? '还没有开始对话' : '先打开 PDF，再开始对话'}</p>
            </div>
          ) : (
            visibleTurns.map((turn) => {
              const isFocused = Boolean(
                turn.id === activeTurnId || (focusedMessageId && (turn.question.id === focusedMessageId || turn.answer?.id === focusedMessageId))
              )
              const turnClassName = ['ai-turn', turn.answer?.status ?? '', isFocused ? 'focused' : ''].filter(Boolean).join(' ')
              const answer = turn.answer
              const isThinkingExpanded = Boolean(answer && expandedAnswerIds[answer.id])
              const answerFavoriteTarget: FavoriteTarget | undefined =
                answer && activeConversationId
                  ? {
                      type: 'ai_answer',
                      paperPath,
                      conversationId: activeConversationId,
                      messageId: answer.id
                    }
                  : undefined

              return (
                <article
                  key={turn.id}
                  ref={(element) => {
                    turnRefs.current[turn.id] = element
                  }}
                  className={turnClassName}
                >
                  <div className="ai-message user">
                    <div className="ai-user-bubble">
                      {turn.question.attachments && turn.question.attachments.length > 0 && (
                        <div className="ai-message-image-grid" aria-label="本轮截图附件">
                          {turn.question.attachments.map((attachment) => (
                            <figure key={attachment.id}>
                              <button
                                type="button"
                                className="ai-message-image-preview"
                                title={`点击放大 ${attachment.name}`}
                                aria-label={`点击放大 ${attachment.name}`}
                                onClick={() => window.open(attachment.dataUrl, '_blank', 'noopener,noreferrer')}
                              >
                                <img src={attachment.dataUrl} alt={attachment.name} />
                              </button>
                              <figcaption>{attachment.name}</figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                      {turn.question.attachmentNames && turn.question.attachmentNames.length > 0 && (
                        <div className="ai-message-attachments" aria-label="本轮附件">
                          {(expandedAttachmentMessageIds[turn.id]
                            ? turn.question.attachmentNames
                            : turn.question.attachmentNames.slice(0, 1)
                          )
                            .filter((attachmentName) => !turn.question.attachments?.some((attachment) => attachment.name === attachmentName))
                            .map((attachmentName) => (
                              <button
                                key={attachmentName}
                                type="button"
                                className="ai-message-attachment-chip"
                                title={`附件：${attachmentName}`}
                                onClick={() => onStatus(`附件：${attachmentName}`)}
                              >
                                <span className="codicon codicon-file" aria-hidden="true" />
                                <span>{attachmentName}</span>
                              </button>
                            ))}
                          {turn.question.attachmentNames.length > 1 ? (
                            <button
                              type="button"
                              className="ai-message-attachment-more"
                              aria-expanded={Boolean(expandedAttachmentMessageIds[turn.id])}
                              onClick={() => toggleAttachmentGroupExpanded(turn.id)}
                              title={expandedAttachmentMessageIds[turn.id] ? '收起附件' : `还有 ${turn.question.attachmentNames.length - 1} 个附件，点击展开`}
                            >
                              <span className={expandedAttachmentMessageIds[turn.id] ? 'codicon codicon-chevron-up' : 'codicon codicon-chevron-down'} aria-hidden="true" />
                              <span>{expandedAttachmentMessageIds[turn.id] ? '收起' : `还有 ${turn.question.attachmentNames.length - 1} 个`}</span>
                            </button>
                          ) : null}
                        </div>
                      )}
                      <p>{turn.question.content}</p>
                    </div>
                  </div>
                  <div className="ai-message assistant">
                    {answer ? (
                      <div className="ai-answer-shell">
                        <div className="ai-answer-body">
                          {(answer.status || answer.durationMs) && (
                            <button
                              className="ai-thinking-shell"
                              type="button"
                              aria-expanded={isThinkingExpanded}
                              onClick={() => toggleAnswerExpanded(answer.id)}
                            >
                              <div className={`ai-processing-line ${answer.status ?? 'done'}`}>
                                <span
                                  className={
                                    answer.status === 'sending'
                                      ? 'codicon codicon-loading codicon-modifier-spin'
                                      : 'codicon codicon-chevron-right'
                                  }
                                  aria-hidden="true"
                                />
                                <span>{getAssistantProcessLabel(answer)}</span>
                              </div>
                              {isThinkingExpanded && answer.content ? (
                                <div className="ai-thinking-content">
                                  <p>{answer.content}</p>
                                </div>
                              ) : null}
                            </button>
                          )}
                          <div className="ai-answer-content">
                            {answer.content ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[[rehypeKatex, { strict: 'ignore' }]]}
                                components={aiMarkdownComponents}
                              >
                                {preprocessAiMarkdown(answer.content)}
                              </ReactMarkdown>
                            ) : (
                              <p className="ai-answer-placeholder">正在生成回答...</p>
                            )}
                          </div>
                          <div className="ai-answer-actions" aria-label="回答操作">
                            <FavoriteButton
                              active={Boolean(answerFavoriteTarget && isFavorite(favoriteItemsByKey, answerFavoriteTarget))}
                              label="AI 回答"
                              disabled={!answerFavoriteTarget || !answer.content || answer.status === 'sending'}
                              onClick={() => {
                                if (answerFavoriteTarget) {
                                  onFavoriteToggle(answerFavoriteTarget, 'AI 回答')
                                }
                              }}
                            />
                            <button
                              className="icon-button"
                              type="button"
                              title="从此回答创建分支"
                              aria-label="从此回答创建分支"
                              disabled={!activeConversationId || answer.status === 'sending'}
                              onClick={() => onConversationBranch(activeConversationId, answer.id)}
                            >
                              <span className="codicon codicon-git-branch" aria-hidden="true" />
                            </button>
                            <button
                              className="icon-button"
                              type="button"
                              title="复制回答"
                              aria-label="复制回答"
                              disabled={!answer.content}
                              onClick={() => copyAnswer(answer as ChatMessage)}
                            >
                              <span className="codicon codicon-copy" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="ai-processing-line sending">
                        <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                        <span>等待回复...</span>
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>

      <div
        ref={composerRef}
        className="ai-composer"
        style={{ height: composerHeight }}
        onPaste={pasteImagesIntoComposer}
        onDragOver={dragMineruBlockOverComposer}
        onDrop={dropMineruBlockIntoComposer}
      >
        <div
          className="ai-composer-resize-handle"
          role="separator"
          aria-label="调整输入框高度"
          aria-orientation="horizontal"
          aria-valuemin={aiComposerMinHeight}
          aria-valuemax={getAiComposerMaxHeight()}
          aria-valuenow={Math.round(composerHeight)}
          tabIndex={0}
          onPointerDown={startComposerResize}
          onPointerMove={updateComposerResize}
          onPointerUp={finishComposerResize}
          onPointerCancel={finishComposerResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              setComposerHeight((current) => clampNumber(current + 12, aiComposerMinHeight, getAiComposerMaxHeight()))
              event.preventDefault()
            }

            if (event.key === 'ArrowDown') {
              setComposerHeight((current) => clampNumber(current - 12, aiComposerMinHeight, getAiComposerMaxHeight()))
              event.preventDefault()
            }

            if (event.key === 'Home') {
              setComposerHeight(aiComposerMinHeight)
              event.preventDefault()
            }

            if (event.key === 'End') {
              setComposerHeight(getAiComposerMaxHeight())
              event.preventDefault()
            }
          }}
        />
        <input
          ref={fileInputRef}
          className="ai-file-input"
          type="file"
          multiple
          tabIndex={-1}
          onChange={(event) => {
            addAttachments(event.target.files)
            event.target.value = ''
          }}
        />
        <div className="ai-quick-actions" aria-label="常用论文任务">
          {aiQuickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              title={action.prompt}
              disabled={isBusy || !paperPath}
              onClick={() => runQuickAction(action)}
            >
              <span className={`codicon ${action.icon}`} aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
        <AiContextChipPanel
          paperPath={paperPath}
          currentPageLabel={pdfViewState ? `第 ${Math.round(pdfViewState.pageNumber)} 页` : '当前页'}
          currentPaperName={paperPath ? getFileName(paperPath) : '未打开 PDF'}
          selectedSelectionKeys={activeContextSelectionKeys}
          selectedSelections={activeContextSelections}
          choices={aiContextChoices}
          isLoading={isContextLoading}
          notice={contextNotice || contextLabel}
          isExpanded={isContextExpanded}
          onToggleSelection={toggleAiContextSelection}
          onToggleExpanded={() => setIsContextExpanded((current) => !current)}
        />
        {attachments.length > 0 && (
          <div className="ai-attachment-list" aria-label="已添加附件">
            {attachments.map((attachment) => (
              <span key={attachment.id} className="ai-attachment-pill" title={`${attachment.name} · ${formatFileSize(attachment.size)}`}>
                {isImageAttachment(attachment) ? (
                  <img src={attachment.dataUrl} alt="" aria-hidden="true" />
                ) : (
                  <span className="codicon codicon-file" aria-hidden="true" />
                )}
                <span>{attachment.name}</span>
                <button
                  type="button"
                  title="移除附件"
                  aria-label={`移除 ${attachment.name}`}
                  onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                >
                  <span className="codicon codicon-close" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          rows={5}
          placeholder="问论文、方法、公式、实验或笔记..."
          disabled={isBusy || !paperPath}
          spellCheck={false}
          onDragOver={dragMineruBlockOverComposer}
          onDrop={dropMineruBlockIntoComposer}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void sendMessage()
            }
          }}
        />
        <div className="ai-input-toolbar">
          <div className="ai-inline-selects">
            <select
              value={model}
              aria-label="选择模型"
              title="选择模型"
              onChange={(event) => onSettingsChange({ model: event.target.value })}
            >
              {modelChoices.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={reasoningEffort}
              aria-label="选择思考强度"
              title="选择思考强度"
              onChange={(event) => onSettingsChange({ reasoningEffort: event.target.value as ReasoningEffort })}
            >
              {reasoningOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ai-composer-actions">
            <AiContextBudgetIndicator budget={selectedContextBudget} />
            <button
              className="icon-button"
              type="button"
              title="添加附件"
              aria-label="添加附件"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="codicon codicon-attach" aria-hidden="true" />
            </button>
            <button
              className="icon-button send-button"
              type="button"
              title="发送"
              aria-label="发送"
              disabled={isBusy || !paperPath || !draft.trim()}
              onClick={() => void sendMessage()}
            >
              <span className={isBusy ? 'codicon codicon-loading codicon-modifier-spin' : 'codicon codicon-arrow-up'} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type AiContextChoice = {
  selection: AiContextSelection
  key: string
  label: string
  detail: string
  kindLabel: string
  isDefault: boolean
}

const estimatedModelInputLimits: Record<string, number> = {
  'gpt-5.5': 128000,
  'gpt-5.4': 128000,
  'gpt-5.4-mini': 128000,
  'gpt-5.3-codex': 128000,
  'gpt-5.2': 128000
}

function AiContextChipPanel({
  paperPath,
  currentPageLabel,
  currentPaperName,
  selectedSelectionKeys,
  selectedSelections,
  choices,
  isLoading,
  notice,
  isExpanded,
  onToggleSelection,
  onToggleExpanded
}: {
  paperPath: string
  currentPageLabel: string
  currentPaperName: string
  selectedSelectionKeys: Set<string>
  selectedSelections: AiContextSelection[]
  choices: AiContextChoice[]
  isLoading: boolean
  notice: string
  isExpanded: boolean
  onToggleSelection: (selection: AiContextSelection) => void
  onToggleExpanded: () => void
}): ReactElement {
  const selectedLabels = selectedSelections
    .map((selection) => choices.find((choice) => choice.key === getAiContextSelectionKey(selection))?.label ?? '')
    .filter(Boolean)

  const orderedChoices = [...choices].sort((left, right) => {
    const leftSelected = selectedSelectionKeys.has(left.key)
    const rightSelected = selectedSelectionKeys.has(right.key)

    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1
    }

    if (leftSelected && rightSelected) {
      const labelLengthDiff = left.label.length - right.label.length
      if (labelLengthDiff !== 0) {
        return labelLengthDiff
      }

      return left.label.localeCompare(right.label, 'zh-CN')
    }

    return 0
  })
  const remainingSelectableCount = orderedChoices.filter((choice) => !selectedSelectionKeys.has(choice.key)).length

  return (
    <div className={isLoading ? 'ai-context-hub loading' : 'ai-context-hub'}>
      <div className="ai-context-hub-header">
        <span className="ai-context-hub-title">上下文</span>
        <span className="ai-context-hub-note">{notice || currentPaperName}</span>
      </div>
      <div className={isExpanded ? 'ai-context-hub-row expanded' : 'ai-context-hub-row collapsed'}>
        {orderedChoices.map((choice) => (
          <AiContextChip
            key={choice.key}
            choice={choice}
            isSelected={selectedSelectionKeys.has(choice.key)}
            onToggleSelection={onToggleSelection}
          />
        ))}
        <span className="ai-context-hub-row-spacer" aria-hidden="true" />
        <button
          type="button"
          className="ai-context-hub-toggle"
          aria-expanded={isExpanded}
          onClick={onToggleExpanded}
        >
          <span className={isExpanded ? 'codicon codicon-chevron-up' : 'codicon codicon-chevron-down'} aria-hidden="true" />
          <span>{isExpanded ? '收起' : remainingSelectableCount > 0 ? `还有 ${remainingSelectableCount} 项待选择` : '显示全部'}</span>
        </button>
      </div>
      <div className="ai-context-hub-footer">
        <span>{selectedLabels.length > 0 ? `已选 ${selectedLabels.length} 项` : '点击上下文块添加到当前对话'}</span>
        <span>{paperPath ? currentPageLabel : '先打开 PDF'}</span>
      </div>
    </div>
  )
}

function AiContextChip({
  choice,
  isSelected,
  onToggleSelection
}: {
  choice: AiContextChoice
  isSelected: boolean
  onToggleSelection: (selection: AiContextSelection) => void
}): ReactElement {
  const icon =
    choice.selection.kind === 'note'
      ? 'codicon-file-text'
      : choice.selection.kind === 'mineru_block'
        ? choice.selection.imageDataUrl
          ? 'codicon-device-camera'
          : 'codicon-quote'
        : 'codicon-file'

  return (
    <button
      type="button"
      className={isSelected ? 'ai-context-chip active' : `ai-context-chip ${choice.isDefault ? 'suggested' : 'ghost'}`}
      onClick={() => onToggleSelection(choice.selection)}
      title={isSelected ? `点击取消 ${choice.label}` : choice.label}
    >
      <span className="ai-context-chip-icon">
        <span className={`codicon ${icon}`} aria-hidden="true" />
      </span>
      <span className="ai-context-chip-text">
        <strong>{choice.label}</strong>
      </span>
      {isSelected ? (
        <span className="ai-context-chip-close" aria-hidden="true">
          <span className="codicon codicon-close" />
        </span>
      ) : null}
    </button>
  )
}

function AiContextBudgetIndicator({ budget }: { budget: AiContextBudget }): ReactElement {
  const percent = Math.min(99, Math.round(budget.usageRatio * 100))
  const ringValue = Math.min(100, Math.round(budget.usageRatio * 100))
  const warningMessage =
    budget.warningLevel === 'danger'
      ? '上下文接近或超过上限，建议取消部分 PDF/笔记后再提问。'
      : budget.warningLevel === 'warning'
        ? '上下文已接近上限，建议适当减少本轮上下文。'
        : ''

  return (
    <div
      className={`ai-context-budget-indicator ${budget.warningLevel}`}
      role="note"
      aria-label={`上下文约占 ${percent}%`}
      title={`上下文约占 ${percent}%`}
    >
      <div className="ai-context-budget-ring compact" aria-hidden="true">
        <svg viewBox="0 0 42 42">
          <circle className="track" cx="21" cy="21" r="15.915" />
          <circle className="progress" cx="21" cy="21" r="15.915" strokeDasharray={`${ringValue} 100`} />
        </svg>
        <span>{percent}%</span>
      </div>
      <div className={`ai-context-budget-popover ${budget.warningLevel}`} role="tooltip">
        <strong>{budget.estimatedInputTokens.toLocaleString()} / {budget.maxInputTokens.toLocaleString()} tokens</strong>
        <small>{budget.cacheHit ? '缓存命中：本地复用' : '缓存状态：实时生成'}</small>
        <small>剩余约 {budget.remainingTokens.toLocaleString()} tokens</small>
        {warningMessage ? <p>{warningMessage}</p> : null}
      </div>
    </div>
  )
}

function createMessageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `message_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function createConversationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `conversation_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function getMessagePreview(content: string, maxLength = 24): string {
  const compact = content.replace(/\s+/g, ' ').trim()

  if (!compact) {
    return '未命名'
  }

  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}

function handleTabStripWheel(event: ReactWheelEvent<HTMLDivElement>): void {
  const container = event.currentTarget
  const absDeltaX = Math.abs(event.deltaX)
  const absDeltaY = Math.abs(event.deltaY)

  if (absDeltaX === 0 && absDeltaY === 0) {
    return
  }

  if (container.scrollWidth <= container.clientWidth) {
    return
  }

  const delta = absDeltaX > absDeltaY ? event.deltaX : event.deltaY

  if (delta === 0) {
    return
  }

  event.preventDefault()
  container.scrollLeft += delta
}

function scrollElementIntoContainer(element: HTMLElement, container: HTMLElement | null): void {
  if (!container) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const offsetTop = elementRect.top - containerRect.top
  const nextScrollTop = container.scrollTop + offsetTop - 6

  container.scrollTo({
    top: Math.max(0, nextScrollTop),
    behavior: 'smooth'
  })
}

function deriveAiConversationTitle(messages: ChatMessage[], fallback = '新对话'): string {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content.trim())

  if (firstUserMessage) {
    return getMessagePreview(firstUserMessage.content, 28)
  }

  return fallback || '新对话'
}

function findAiConversationById(conversationsByPaperPath: AiConversationsByPaperPath, conversationId: string): AiConversation | undefined {
  for (const conversations of Object.values(conversationsByPaperPath)) {
    const conversation = conversations.find((item) => item.id === conversationId)

    if (conversation) {
      return conversation
    }
  }

  return undefined
}

function getAiConversationDeleteIds(conversations: AiConversation[], conversationId: string): Set<string> {
  const idsToDelete = new Set<string>([conversationId])
  const deletedAnswerIds = new Set<string>()
  let changed = true

  while (changed) {
    changed = false

    for (const conversation of conversations) {
      if (idsToDelete.has(conversation.id)) {
        for (const message of conversation.messages) {
          if (message.role === 'assistant') {
            deletedAnswerIds.add(message.id)
          }
        }
        continue
      }

      if (conversation.parentAnswerId && deletedAnswerIds.has(conversation.parentAnswerId)) {
        idsToDelete.add(conversation.id)
        changed = true
      }
    }
  }

  return idsToDelete
}

function updateAiConversationById(
  conversationsByPaperPath: AiConversationsByPaperPath,
  conversationId: string,
  updater: (conversation: AiConversation) => AiConversation
): AiConversationsByPaperPath {
  let hasUpdated = false
  const nextEntries = Object.entries(conversationsByPaperPath).map(([paperPath, conversations]) => {
    const nextConversations = conversations.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation
      }

      hasUpdated = true
      const nextConversation = updater(conversation)
      return {
        ...nextConversation,
        paperPath: conversation.paperPath,
        id: conversation.id
      }
    })

    return [paperPath, nextConversations] as const
  })

  return hasUpdated ? Object.fromEntries(nextEntries) : conversationsByPaperPath
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getAiComposerMaxHeight(): number {
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight
  return Math.max(220, Math.min(420, Math.round(viewportHeight * 0.56)))
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function ScreenshotCaptureOverlay({
  onCancel,
  onCapture
}: {
  onCancel: () => void
  onCapture: (rect: ScreenshotSelectionRect) => void
}): ReactElement {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [selectionRect, setSelectionRect] = useState<ScreenshotSelectionRect | null>(null)
  const [dragState, setDragState] = useState<ScreenshotDragState | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

  const capturePointer = (pointerId: number): void => {
    if (!overlayRef.current?.hasPointerCapture(pointerId)) {
      overlayRef.current?.setPointerCapture(pointerId)
    }
  }

  const releasePointer = (pointerId: number): void => {
    if (overlayRef.current?.hasPointerCapture(pointerId)) {
      overlayRef.current.releasePointerCapture(pointerId)
    }
  }

  const startSelection = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }

    const point = {
      x: event.clientX,
      y: event.clientY
    }
    setSelectionRect(null)
    setDragState({
      kind: 'draw',
      pointerId: event.pointerId,
      origin: point
    })
    capturePointer(event.pointerId)
    event.preventDefault()
  }

  const startMoveSelection = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !selectionRect) {
      return
    }

    setDragState({
      kind: 'move',
      pointerId: event.pointerId,
      startPoint: {
        x: event.clientX,
        y: event.clientY
      },
      startRect: selectionRect
    })
    capturePointer(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  const startResizeSelection = (handle: ScreenshotResizeHandle, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || !selectionRect) {
      return
    }

    setDragState({
      kind: 'resize',
      pointerId: event.pointerId,
      handle,
      startPoint: {
        x: event.clientX,
        y: event.clientY
      },
      startRect: selectionRect
    })
    capturePointer(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  const updateSelection = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (dragState.kind === 'draw') {
      setSelectionRect(
        normalizeSelectionRect(dragState.origin, {
          x: event.clientX,
          y: event.clientY
        })
      )
    } else if (dragState.kind === 'move') {
      setSelectionRect(
        moveSelectionRect(dragState.startRect, event.clientX - dragState.startPoint.x, event.clientY - dragState.startPoint.y)
      )
    } else {
      setSelectionRect(
        resizeSelectionRect(
          dragState.startRect,
          dragState.handle,
          event.clientX - dragState.startPoint.x,
          event.clientY - dragState.startPoint.y
        )
      )
    }

    event.preventDefault()
  }

  const finishSelection = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    releasePointer(event.pointerId)
    setDragState(null)

    if (selectionRect && (selectionRect.width < 8 || selectionRect.height < 8)) {
      setSelectionRect(null)
    }

    event.preventDefault()
  }

  const confirmSelection = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()

    if (selectionRect && selectionRect.width >= 8 && selectionRect.height >= 8) {
      onCapture(selectionRect)
    }
  }

  const cancelFromButton = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <div
      ref={overlayRef}
      className={selectionRect ? 'screenshot-capture-overlay adjusting' : 'screenshot-capture-overlay'}
      role="dialog"
      aria-modal="true"
      aria-label="截图选区"
      onPointerDown={startSelection}
      onPointerMove={updateSelection}
      onPointerUp={finishSelection}
      onPointerCancel={finishSelection}
    >
      <div className="screenshot-capture-hint">
        <span className="codicon codicon-device-camera" aria-hidden="true" />
        <span>拖拽选择截图区域，松开后可调整边界，点击 √ 完成 · Esc 取消</span>
      </div>
      {selectionRect ? (
        <>
          <div
            className="screenshot-selection-rect"
            style={{
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height
            }}
            onPointerDown={startMoveSelection}
          >
            <span className="screenshot-selection-size">
              {Math.round(selectionRect.width)} × {Math.round(selectionRect.height)}
            </span>
            {screenshotResizeHandles.map((handle) => (
              <button
                key={handle}
                className={`screenshot-resize-handle handle-${handle}`}
                type="button"
                aria-label={`调整截图 ${handle} 边界`}
                onPointerDown={(event) => startResizeSelection(handle, event)}
              />
            ))}
          </div>
          <div className="screenshot-selection-actions" style={getScreenshotActionsStyle(selectionRect)}>
            <button
              type="button"
              className="screenshot-action-button confirm"
              aria-label="完成截图"
              onClick={confirmSelection}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span className="codicon codicon-check" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="screenshot-action-button cancel"
              aria-label="取消截图"
              onClick={cancelFromButton}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span className="codicon codicon-close" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function normalizeSelectionRect(
  start: {
    x: number
    y: number
  },
  end: {
    x: number
    y: number
  }
): ScreenshotSelectionRect {
  const left = clampNumber(Math.min(start.x, end.x), 0, window.innerWidth)
  const top = clampNumber(Math.min(start.y, end.y), 0, window.innerHeight)
  const right = clampNumber(Math.max(start.x, end.x), 0, window.innerWidth)
  const bottom = clampNumber(Math.max(start.y, end.y), 0, window.innerHeight)

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(Math.max(1, right - left)),
    height: Math.round(Math.max(1, bottom - top))
  }
}

const screenshotResizeHandles: ScreenshotResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function getScreenshotActionsStyle(rect: ScreenshotSelectionRect): CSSProperties {
  const actionWidth = 72
  const actionHeight = 34
  const left = clampNumber(rect.x + rect.width + 10, 10, Math.max(10, window.innerWidth - actionWidth - 10))
  const top = clampNumber(rect.y + rect.height - actionHeight, 10, Math.max(10, window.innerHeight - actionHeight - 10))

  return {
    left,
    top
  }
}

function moveSelectionRect(rect: ScreenshotSelectionRect, deltaX: number, deltaY: number): ScreenshotSelectionRect {
  return {
    ...rect,
    x: Math.round(clampNumber(rect.x + deltaX, 0, Math.max(0, window.innerWidth - rect.width))),
    y: Math.round(clampNumber(rect.y + deltaY, 0, Math.max(0, window.innerHeight - rect.height)))
  }
}

function resizeSelectionRect(
  rect: ScreenshotSelectionRect,
  handle: ScreenshotResizeHandle,
  deltaX: number,
  deltaY: number
): ScreenshotSelectionRect {
  const minSize = 8
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height

  if (handle.includes('w')) {
    left += deltaX
  }

  if (handle.includes('e')) {
    right += deltaX
  }

  if (handle.includes('n')) {
    top += deltaY
  }

  if (handle.includes('s')) {
    bottom += deltaY
  }

  left = clampNumber(left, 0, window.innerWidth - minSize)
  top = clampNumber(top, 0, window.innerHeight - minSize)
  right = clampNumber(right, minSize, window.innerWidth)
  bottom = clampNumber(bottom, minSize, window.innerHeight)

  if (right - left < minSize) {
    if (handle.includes('w')) {
      left = right - minSize
    } else {
      right = left + minSize
    }
  }

  if (bottom - top < minSize) {
    if (handle.includes('n')) {
      top = bottom - minSize
    } else {
      bottom = top + minSize
    }
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  }
}

function hasClipboardPlainText(clipboardData: DataTransfer): boolean {
  return clipboardData.getData('text/plain').trim().length > 0
}

async function readPastedClipboardImages(clipboardData: DataTransfer): Promise<ClipboardImagePayload[]> {
  const imageFiles = getClipboardImageFiles(clipboardData)
  if (imageFiles.length > 0) {
    return Promise.all(imageFiles.map(readClipboardImageFile))
  }

  const image = await window.thesisAgent.readClipboardImage()
  return image ? [image] : []
}

function getClipboardImageFiles(clipboardData: DataTransfer): File[] {
  const filesFromItems = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (filesFromItems.length > 0) {
    return filesFromItems
  }

  return Array.from(clipboardData.files).filter((file) => file.type.startsWith('image/'))
}

async function readClipboardImageFile(file: File): Promise<ClipboardImagePayload> {
  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImageDataUrl(dataUrl)
  const mimeType = normalizeImageMimeType(file.type)
  const normalizedDataUrl = dataUrl.startsWith(`data:${mimeType};base64,`) ? dataUrl : renderImageElementToPngDataUrl(image)

  return {
    name: file.name || `clipboard-image-${Date.now()}.png`,
    mimeType,
    dataUrl: normalizedDataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
    size: normalizedDataUrl === dataUrl ? file.size : getDataUrlByteLength(normalizedDataUrl)
  }
}

async function readImageFileAttachment(file: File): Promise<ImageAttachmentItem> {
  return createImageAttachmentFromPayload(await readClipboardImageFile(file))
}

function createImageAttachmentFromPayload(image: ClipboardImagePayload): ImageAttachmentItem {
  return {
    id: createMessageId(),
    kind: 'image',
    name: image.name,
    mimeType: image.mimeType,
    dataUrl: image.dataUrl,
    width: image.width,
    height: image.height,
    size: image.size
  }
}

function isImageAttachment(attachment: AttachmentItem): attachment is ImageAttachmentItem {
  return attachment.kind === 'image'
}

function normalizeImageMimeType(mimeType: string): ClipboardImagePayload['mimeType'] {
  if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
    return mimeType
  }

  return 'image/png'
}

function renderImageElementToPngDataUrl(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  if (!context) {
    return image.src
  }

  context.drawImage(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function getDataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('读取图片失败'))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取图片失败')))
    reader.readAsDataURL(file)
  })
}

function createClipboardImageNote(filePath: string, noteIndex: number): NoteDocument {
  return createNoteDocument({
    title: noteIndex > 1 ? `${getFileStem(filePath)} 剪切板截图 ${noteIndex}` : `${getFileStem(filePath)} 剪切板截图`,
    template: 'freeform',
    paperId: `paper_${hashString(filePath)}`
  })
}

function createClipboardScreenshotBlock(
  noteId: string,
  image: ClipboardImagePayload,
  orderIndex: number,
  layout?: Partial<MediaNoteBlockContent>
): NoteBlock {
  const displayWidth = layout?.displayWidth ?? Math.min(image.width, 420)
  const displayHeight = layout?.displayHeight ?? Math.round(displayWidth * (image.height / Math.max(image.width, 1)))

  return createNoteBlock({
    noteId,
    type: 'screenshot',
    orderIndex,
    content: {
      src: image.dataUrl,
      alt: image.name,
      caption: image.name,
      width: image.width,
      height: image.height,
      displayWidth,
      displayHeight,
      wrapStyle: layout?.wrapStyle ?? 'break',
      crop: layout?.crop
    },
    sourceRefs: [
      {
        type: 'screenshot'
      }
    ]
  })
}

function normalizeMediaBlockContent(content: MediaNoteBlockContent): MediaNoteBlockContent {
  const displayWidth = typeof content.displayWidth === 'number' && Number.isFinite(content.displayWidth)
    ? Math.min(1200, Math.max(40, Math.round(content.displayWidth)))
    : undefined
  const displayHeight = typeof content.displayHeight === 'number' && Number.isFinite(content.displayHeight)
    ? Math.min(1200, Math.max(40, Math.round(content.displayHeight)))
    : undefined

  return {
    ...content,
    displayWidth,
    displayHeight,
    wrapStyle: isMediaWrapStyle(content.wrapStyle) ? content.wrapStyle : undefined,
    crop: normalizeMediaCropState(content.crop)
  }
}

function isMediaWrapStyle(input: unknown): input is MediaNoteBlockContent['wrapStyle'] {
  return input === 'break' || input === 'center' || input === 'float-left' || input === 'float-right'
}

function normalizeMediaCropState(crop: MediaNoteBlockContent['crop']): MediaNoteBlockContent['crop'] {
  if (!crop) {
    return undefined
  }

  const width = Math.min(1, Math.max(0.05, crop.width))
  const height = Math.min(1, Math.max(0.05, crop.height))
  const x = Math.min(1 - width, Math.max(0, crop.x))
  const y = Math.min(1 - height, Math.max(0, crop.y))

  if (x === 0 && y === 0 && width === 1 && height === 1) {
    return undefined
  }

  return { x, y, width, height }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function getAssistantProcessLabel(message: ChatMessage): string {
  if (message.status === 'sending') {
    return '正在生成...'
  }

  if (message.status === 'error') {
    return message.durationMs ? `已处理 · ${formatDuration(message.durationMs)}（失败）` : '已处理（失败）'
  }

  return message.durationMs ? `已处理 · ${formatDuration(message.durationMs)}` : '已处理'
}

function getMineruNoteBlockId(noteId: string, mineruBlockId: string): string {
  return `note_block_mineru_${hashString(`${noteId}:${mineruBlockId}`)}`
}

function buildMineruNoteBlockStyle(
  template: PersistedMineruSettingsState['noteStyle'],
  input: { useBulletList?: boolean } = {}
): NoteBlockStyle | undefined {
  const style: NoteBlockStyle = {}

  if (template.fontFamily) {
    style.fontFamily = template.fontFamily
  }

  if (template.fontSize) {
    style.fontSize = template.fontSize
  }

  if (template.bold) {
    style.bold = true
  }

  if (template.italic) {
    style.italic = true
  }

  if (template.highlight) {
    style.highlight = template.highlight
  }

  if (input.useBulletList) {
    style.listStyle = 'bullet'
  }

  return Object.keys(style).length > 0 ? style : undefined
}

function createMineruDroppedNoteBlock(
  noteId: string,
  block: MineruParseBlock,
  orderIndex: number,
  filePath: string,
  noteStyleTemplate: PersistedMineruSettingsState['noteStyle']
): NoteBlock {
  const text = getMineruBlockPlainText(block)
  const usesVisualScreenshot =
    (block.type === 'image' || block.type === 'chart') && Boolean(block.imageDataUrl) ||
    (block.type === 'table' && Boolean(block.imageDataUrl))
  const type: NoteBlockType = usesVisualScreenshot
    ? 'screenshot'
    : block.type === 'heading'
      ? 'heading'
      : block.type === 'equation'
        ? 'formula'
        : block.type === 'table'
          ? 'table'
          : block.type === 'footnote'
            ? 'quote'
            : 'paragraph'
  const content =
    usesVisualScreenshot
      ? {
          src: block.imageDataUrl,
          alt: (block.caption ?? text) || `${block.rawType} p.${block.pageNo}`,
          caption: block.caption ?? text,
          pageNo: block.pageNo
        }
      : block.type === 'heading'
        ? {
            text,
            level: block.headingLevel ?? 2
          }
        : block.type === 'equation'
          ? {
              latex: block.text?.trim() ?? text
            }
          : block.type === 'table'
            ? {
                rows: block.tableRows?.length ? block.tableRows : [[text]]
              }
            : {
                text: block.type === 'list' ? block.listItems?.join('\n') ?? text : text
              }
  const createdBlock = createNoteBlock({
    noteId,
    type,
    orderIndex,
    content,
    style: buildMineruNoteBlockStyle(noteStyleTemplate, {
      useBulletList: block.type === 'list'
    }),
    sourceRefs: []
  })
  const sourceQuote = usesVisualScreenshot ? block.caption?.trim() || undefined : text || block.caption?.trim() || undefined
  return {
    ...createdBlock,
    sourceRefs: createMineruBlockSourceRefs(createdBlock.id, block, filePath, sourceQuote)
  }
}

function createMineruBlockSourceRefs(
  noteBlockId: string,
  block: MineruParseBlock,
  filePath: string,
  quote?: string
): SourceRef[] {
  return getMineruBlockSourceSegments(block).map((segment, index) => ({
    type: 'note_block',
    paperId: `paper_${hashString(filePath)}`,
    noteBlockId,
    pageNo: segment.pageNo,
    mineruBlockId: block.id,
    rect: segment.rect,
    quote,
    textHash: hashString(`${block.id}:${index}:${quote ?? ''}`)
  }))
}

function getMineruBlockSourceSegments(block: MineruParseBlock): Array<{ pageNo: number; rect: NonNullable<SourceRef['rect']> }> {
  const segments = (block.segments ?? [])
    .filter((segment) => isValidPdfSourceRect(segment.rect))
    .map((segment) => ({
      pageNo: segment.pageNo,
      rect: segment.rect
    }))

  if (segments.length > 0) {
    return segments
  }

  return isValidPdfSourceRect(block.rect) ? [
    {
      pageNo: block.pageNo,
      rect: block.rect
    }
  ] : []
}

function getAiContextLabel(input: { paperPath: string; notesCount: number; isLoading: boolean; notice: string }): string {
  if (input.isLoading) {
    return '正在读取当前论文与笔记上下文...'
  }

  if (input.notice) {
    return input.notice
  }

  if (!input.paperPath) {
    return '未打开 PDF'
  }

  return input.notesCount > 0 ? `当前论文上下文：PDF + ${input.notesCount} 篇笔记` : '当前论文上下文：PDF'
}

function buildMineruContextLabel(block: MineruBlockDragPayload['block']): string {
  const baseLabel = getMineruBlockPlainText(block).replace(/\s+/g, ' ').trim()
  const shortLabel = baseLabel ? baseLabel.slice(0, 42) : 'MinerU 解析块'
  return `${shortLabel} · p.${block.pageNo}`
}

function createMineruContextSelection(payload: MineruBlockDragPayload): AiContextSelection {
  return {
    kind: 'mineru_block',
    blockId: payload.block.id,
    pageNumber: payload.block.pageNo,
    blockType: payload.block.type,
    label: buildMineruContextLabel(payload.block),
    text: getMineruBlockPlainText(payload.block).slice(0, 12000),
    imageDataUrl: payload.block.imageDataUrl
  }
}

function getAiContextSelectionKey(selection: AiContextSelection): string {
  if (selection.kind === 'paper') {
    return 'paper'
  }

  if (selection.kind === 'page') {
    return `page:${selection.pageNumber}`
  }

  if (selection.kind === 'mineru_block') {
    return `mineru:${selection.blockId}`
  }

  return `note:${selection.noteId}`
}

function estimateTokenCount(text: string): number {
  const normalized = text.trim()
  if (!normalized) {
    return 0
  }

  const cjkCount = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length
  const latinCount = normalized.length - cjkCount
  return Math.max(1, Math.ceil(cjkCount * 1.15 + latinCount / 4))
}

function estimateAiContextSelectionTokens(selection: AiContextSelection): number {
  if (selection.kind === 'paper') {
    return estimateTokenCount('x'.repeat(aiContextPaperTextMaxChars + aiContextCurrentPageTextMaxChars + 1200))
  }

  if (selection.kind === 'page') {
    return estimateTokenCount('x'.repeat(aiContextCurrentPageTextMaxChars + 300))
  }

  if (selection.kind === 'note') {
    return estimateTokenCount('x'.repeat(aiContextNotesMaxChars))
  }

  return estimateTokenCount(selection.text || selection.label || '')
}

function buildAiContextBudget(input: {
  paperPath: string
  model: string
  promptDraft: string
  messageHistory: ChatMessage[]
  selectedSelections: AiContextSelection[]
  contextChoices: AiContextChoice[]
  knownCacheKeys: Set<string>
  measuredBudgetByCacheKey: Record<string, number>
}): AiContextBudget {
  const selectedChoiceLabels = input.selectedSelections
    .map((selection) => input.contextChoices.find((choice) => choice.key === getAiContextSelectionKey(selection))?.label ?? '')
    .filter(Boolean)
  const historyText = input.messageHistory.map((message) => message.content).join('\n')
  const selectionSignature = selectedChoiceLabels.join('|')
  const promptSignature = input.promptDraft.trim()
  const cacheKey = `${input.paperPath}|${selectionSignature}|${promptSignature}`
  const estimatedSelectionTokens = input.selectedSelections.reduce((total, selection) => total + estimateAiContextSelectionTokens(selection), 0)
  const estimatedInputTokens =
    estimateTokenCount(historyText) +
    estimatedSelectionTokens +
    estimateTokenCount(promptSignature) +
    estimateTokenCount(selectedChoiceLabels.join('\n'))
  const maxInputTokens = estimatedModelInputLimits[input.model] ?? 128000
  const measuredInputTokens = input.measuredBudgetByCacheKey[cacheKey]
  const displayedInputTokens = Number.isFinite(measuredInputTokens) ? Math.max(0, measuredInputTokens) : estimatedInputTokens
  const usageRatio = Math.min(1, estimatedInputTokens / Math.max(maxInputTokens, 1))
  const measuredUsageRatio = Math.min(1, displayedInputTokens / Math.max(maxInputTokens, 1))
  const remainingTokens = Math.max(0, maxInputTokens - displayedInputTokens)
  const warningLevel: AiContextBudget['warningLevel'] =
    measuredUsageRatio >= 0.92 ? 'danger' : measuredUsageRatio >= 0.75 ? 'warning' : 'safe'
  const cacheHit = promptSignature.length > 0 && selectedChoiceLabels.length > 0 && input.knownCacheKeys.has(cacheKey)

  return {
    estimatedInputTokens: displayedInputTokens,
    maxInputTokens,
    usageRatio: measuredUsageRatio,
    remainingTokens,
    warningLevel,
    cacheKey,
    cacheHit,
    isMeasured: Number.isFinite(measuredInputTokens)
  }
}

function createDefaultAiContextSelections(
  paperPath: string,
  pdfViewState?: PersistedPdfViewState,
  notes: NoteDocument[] = []
): AiContextSelection[] {
  const selections: AiContextSelection[] = [{ kind: 'paper' }]
  const currentPageNumber = Math.round(pdfViewState?.pageNumber ?? 0)
  if (Number.isFinite(currentPageNumber) && currentPageNumber > 0) {
    selections.push({ kind: 'page', pageNumber: currentPageNumber })
  }

  const latestNote = [...notes].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
  if (latestNote) {
    selections.push({ kind: 'note', noteId: latestNote.id })
  }

  return selections.filter((selection, index, all) => all.findIndex((item) => getAiContextSelectionKey(item) === getAiContextSelectionKey(selection)) === index)
}

function buildAiContextChoiceCatalog(input: {
  paperPath: string
  pdfViewState?: PersistedPdfViewState
  notes: NoteDocument[]
  conversation?: AiConversation
}): AiContextChoice[] {
  const fileName = getFileName(input.paperPath)
  const currentPageNumber = Math.round(input.pdfViewState?.pageNumber ?? 0)
  const choices: AiContextChoice[] = [
    {
      selection: { kind: 'paper' },
      key: 'paper',
      label: `完整 PDF · ${fileName}`,
      detail: '整篇论文全文',
      kindLabel: 'PDF',
      isDefault: true
    }
  ]

  if (Number.isFinite(currentPageNumber) && currentPageNumber > 0) {
    choices.push({
      selection: { kind: 'page', pageNumber: currentPageNumber },
      key: `page:${currentPageNumber}`,
      label: `当前页 · p.${currentPageNumber}`,
      detail: '正在浏览的单页片段',
      kindLabel: '页面',
      isDefault: true
    })
  }

  const sortedNotes = [...input.notes].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  for (const note of sortedNotes.slice(0, 4)) {
    choices.push({
      selection: { kind: 'note', noteId: note.id },
      key: `note:${note.id}`,
      label: note.title || `${getFileStem(input.paperPath)} Notes`,
      detail: `${note.blocks.length} 段笔记`,
      kindLabel: '笔记',
      isDefault: sortedNotes[0]?.id === note.id
    })
  }

  const mineruSelections = (input.conversation?.contextSelections ?? []).filter(
    (selection): selection is Extract<AiContextSelection, { kind: 'mineru_block' }> => selection.kind === 'mineru_block'
  )

  mineruSelections.forEach((selection) => {
    choices.push({
      selection,
      key: `mineru:${selection.blockId}`,
      label: selection.label,
      detail: selection.imageDataUrl ? `图片块 · p.${selection.pageNumber}` : `文本块 · p.${selection.pageNumber}`,
      kindLabel: selection.imageDataUrl ? '图片' : '片段',
      isDefault: false
    })
  })

  return choices
}

async function buildAiPaperContext(input: {
  paperPath: string
  pdfViewState?: PersistedPdfViewState
  notes: NoteDocument[]
  selections: AiContextSelection[]
}): Promise<AiPaperContext> {
  const context: AiPaperContext = {
    fileName: getFileName(input.paperPath),
    currentPageNumber: getAiContextCurrentPageNumber(input.pdfViewState),
    extractedPageNumbers: [],
    paperTextExcerpt: '',
    pageTexts: [],
    noteContexts: [],
    selectedContextLabels: [],
    selectedContextEntries: [],
    generatedAt: new Date().toISOString(),
    isTextTruncated: false,
    isNotesTruncated: false,
    estimatedInputTokens: 0
  }

  try {
    const pdfTextContext = await extractPdfTextForAiContext(input.paperPath, context.currentPageNumber)
    const currentPageNumber = clampAiPageNumber(context.currentPageNumber ?? 1, pdfTextContext.totalPages)
    const currentPageRange = getAiCurrentPageRange(currentPageNumber, pdfTextContext.totalPages)
    const pageTextByNumber = new Map(pdfTextContext.pageTexts.map((pageText) => [pageText.pageNumber, pageText.text] as const))
    const selectedPages = input.selections.some((selection) => selection.kind === 'paper')
      ? pdfTextContext.pageTexts
      : input.selections
          .filter((selection): selection is Extract<AiContextSelection, { kind: 'page' }> => selection.kind === 'page')
          .map((selection) => ({
            pageNumber: selection.pageNumber,
            text: pageTextByNumber.get(selection.pageNumber) ?? ''
          }))
          .filter((pageText) => pageText.text.trim().length > 0)
    const selectedNotes = input.selections
      .filter((selection): selection is Extract<AiContextSelection, { kind: 'note' }> => selection.kind === 'note')
      .map((selection) => input.notes.find((note) => note.id === selection.noteId))
      .filter((note): note is NoteDocument => Boolean(note))
    const noteContexts = selectedNotes.map((note) => {
      const markdown = noteToMarkdown(note)
      const truncated = truncateForAiContext(markdown, aiContextNotesMaxChars)
      return {
        noteId: note.id,
        title: note.title || `${getFileStem(input.paperPath)} Notes`,
        markdown: truncated.text,
        truncated: truncated.truncated
      }
    })
    const selectedContextEntries: Array<{ label: string; body: string }> = []

    if (input.selections.some((selection) => selection.kind === 'paper')) {
      const currentPageExcerpt = formatAiPageTextExcerpt(
        pdfTextContext.pageTexts.filter((pageText) => currentPageRange.has(pageText.pageNumber)),
        aiContextCurrentPageTextMaxChars
      )
      const paperExcerpt = formatAiPageTextExcerpt(
        pdfTextContext.pageTexts.filter((pageText) => !currentPageRange.has(pageText.pageNumber)),
        aiContextPaperTextMaxChars
      )
      selectedContextEntries.push(
        {
          label: `完整 PDF · ${context.fileName}`,
          body: [
            `PDF: ${context.fileName}`,
            pdfTextContext.totalPages ? `页数: ${pdfTextContext.totalPages}` : undefined,
            context.currentPageNumber ? `当前页: ${context.currentPageNumber}` : undefined,
            pdfTextContext.pageTexts.length > 0 ? `已读取页: ${formatPageNumberList(pdfTextContext.pageTexts.map((pageText) => pageText.pageNumber))}` : undefined,
            currentPageExcerpt.text ? `## 当前页附近内容\n${currentPageExcerpt.text}` : '',
            paperExcerpt.text ? `## 论文文本片段\n${paperExcerpt.text}` : ''
          ]
            .filter(Boolean)
            .join('\n\n')
        }
      )
      context.isTextTruncated =
        currentPageExcerpt.truncated ||
        paperExcerpt.truncated ||
        pdfTextContext.pageTexts.length < pdfTextContext.extractedPageNumbers.length ||
        pdfTextContext.extractedPageNumbers.length < pdfTextContext.totalPages
    } else if (selectedPages.length > 0) {
      selectedPages.forEach((pageText) => {
        selectedContextEntries.push({
          label: `第 ${pageText.pageNumber} 页`,
          body: `## 第 ${pageText.pageNumber} 页\n${pageText.text.trim()}`
        })
      })
    }

    noteContexts.forEach((noteContext) => {
      selectedContextEntries.push({
        label: noteContext.title,
        body: `## 当前论文笔记 · ${noteContext.title}\n${noteContext.markdown}`
      })
    })

    input.selections
      .filter((selection): selection is Extract<AiContextSelection, { kind: 'mineru_block' }> => selection.kind === 'mineru_block')
      .forEach((selection) => {
        selectedContextEntries.push({
          label: selection.label,
          body: [
            `## MinerU 解析块 · ${selection.label}`,
            `页码: ${selection.pageNumber}`,
            `类型: ${selection.blockType}`,
            selection.text
          ]
            .filter(Boolean)
            .join('\n')
        })
      })

    const contextSummaryText = [
      `PDF: ${context.fileName}`,
      pdfTextContext.totalPages ? `页数: ${pdfTextContext.totalPages}` : undefined,
      currentPageNumber ? `当前页: ${currentPageNumber}` : undefined,
      selectedContextEntries.map((entry) => entry.body).join('\n\n')
    ]
      .filter(Boolean)
      .join('\n\n')
    const estimatedInputTokens = estimateTokenCount(
      [
        '你现在可以看到用户当前正在浏览的论文和该论文的笔记。用户说“当前论文”“这篇论文”“当前页”“我的笔记”时，优先使用下面的上下文。回答时尽量引用页码，例如 [p. 3]；如果上下文不足或被截断，请直接说明缺少什么。',
        contextSummaryText
      ].join('\n\n')
    )

    return {
      ...context,
      currentPageNumber,
      totalPages: pdfTextContext.totalPages,
      extractedPageNumbers: pdfTextContext.pageTexts.map((pageText) => pageText.pageNumber),
      paperTextExcerpt: selectedContextEntries.map((entry) => entry.body).join('\n\n'),
      pageTexts: pdfTextContext.pageTexts,
      noteContexts,
      selectedContextLabels: selectedContextEntries.map((entry) => entry.label),
      selectedContextEntries,
      isTextTruncated: context.isTextTruncated,
      estimatedInputTokens
    }
  } catch (error) {
    return {
      ...context,
      pdfTextError: error instanceof Error ? error.message : 'Unknown PDF text extraction error'
    }
  }
}

function buildPromptWithPaperContext(userPrompt: string, context: AiPaperContext): string {
  const metadata = [
    `PDF: ${context.fileName}`,
    context.totalPages ? `页数: ${context.totalPages}` : undefined,
    context.currentPageNumber ? `当前页: ${context.currentPageNumber}` : undefined,
    context.extractedPageNumbers.length > 0 ? `已读取页: ${formatPageNumberList(context.extractedPageNumbers)}` : undefined,
    context.selectedContextLabels.length > 0 ? `已选上下文: ${context.selectedContextLabels.join('、')}` : undefined,
    context.isTextTruncated ? 'PDF 文本已按上下文窗口截断' : undefined,
    context.isNotesTruncated ? '笔记内容已按上下文窗口截断' : undefined,
    context.pdfTextError ? `PDF 正文读取失败: ${context.pdfTextError}` : undefined
  ]
    .filter(Boolean)
    .join('\n')

  const sections = [
    '你现在可以看到用户当前正在浏览的论文和该论文的笔记。用户说“当前论文”“这篇论文”“当前页”“我的笔记”时，优先使用下面的上下文。回答时尽量引用页码，例如 [p. 3]；如果上下文不足或被截断，请直接说明缺少什么。',
    '',
    '<current_paper_context>',
    metadata,
    '',
    context.selectedContextEntries.map((entry) => entry.body).join('\n\n'),
    '</current_paper_context>',
    '',
    '用户问题：',
    userPrompt
  ].filter((section) => section.length > 0)

  return sections.join('\n\n')
}

async function extractPdfTextForAiContext(
  paperPath: string,
  currentPageNumber?: number
): Promise<{ totalPages: number; extractedPageNumbers: number[]; pageTexts: AiPdfPageText[] }> {
  const data = await window.thesisAgent.readPdfFile(paperPath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapPacked: true,
    cMapUrl: `${pdfjsResourceBaseUrl}cmaps/`,
    disableFontFace: false,
    standardFontDataUrl: `${pdfjsResourceBaseUrl}standard_fonts/`,
    useSystemFonts: true,
    wasmUrl: `${pdfjsResourceBaseUrl}wasm/`,
    useWorkerFetch: false
  })
  const documentProxy = await loadingTask.promise

  try {
    const totalPages = documentProxy.numPages
    const extractedPageNumbers = getAiContextPageNumbers(totalPages, currentPageNumber)
    const pageTexts: AiPdfPageText[] = []

    for (const pageNumber of extractedPageNumbers) {
      const page = await documentProxy.getPage(pageNumber)
      const textContent = await page.getTextContent()
      pageTexts.push({
        pageNumber,
        text: normalizePdfExtractedText(extractPdfTextItems(textContent.items as unknown[]))
      })
      page.cleanup()
    }

    return {
      totalPages,
      extractedPageNumbers,
      pageTexts: pageTexts.filter((pageText) => pageText.text.length > 0)
    }
  } finally {
    await documentProxy.destroy()
  }
}

function buildAiNotesContext(notes: NoteDocument[]): { markdown: string; titles: string[]; truncated: boolean } {
  const sortedNotes = [...notes]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, aiContextMaxNotes)
  const markdown = sortedNotes.map((note) => noteToMarkdown(note)).join('\n\n---\n\n')
  const truncated = truncateForAiContext(markdown, aiContextNotesMaxChars)

  return {
    markdown: truncated.text,
    titles: sortedNotes.map((note) => note.title).filter(Boolean),
    truncated: truncated.truncated || sortedNotes.length < notes.length
  }
}

function getAiContextCurrentPageNumber(pdfViewState?: PersistedPdfViewState): number | undefined {
  const pageNumber = Math.round(pdfViewState?.pageNumber ?? 0)
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : undefined
}

function clampAiPageNumber(pageNumber: number, totalPages: number): number {
  return Math.min(Math.max(Math.round(pageNumber), 1), Math.max(totalPages, 1))
}

function getAiCurrentPageRange(currentPageNumber: number, totalPages: number): Set<number> {
  const range = new Set<number>()
  for (
    let pageNumber = Math.max(1, currentPageNumber - aiContextCurrentPageRadius);
    pageNumber <= Math.min(totalPages, currentPageNumber + aiContextCurrentPageRadius);
    pageNumber += 1
  ) {
    range.add(pageNumber)
  }
  return range
}

function getAiContextPageNumbers(totalPages: number, currentPageNumber?: number): number[] {
  const pageNumbers = new Set<number>()
  const currentPageRange = currentPageNumber ? getAiCurrentPageRange(clampAiPageNumber(currentPageNumber, totalPages), totalPages) : new Set<number>()
  const frontMatterBudget = Math.max(aiContextMaxExtractedPages - currentPageRange.size, 1)

  for (let pageNumber = 1; pageNumber <= Math.min(totalPages, frontMatterBudget); pageNumber += 1) {
    pageNumbers.add(pageNumber)
  }

  currentPageRange.forEach((pageNumber) => pageNumbers.add(pageNumber))

  return [...pageNumbers].sort((left, right) => left - right)
}

function formatAiPageTextExcerpt(pageTexts: AiPdfPageText[], maxChars: number): { text: string; truncated: boolean } {
  const sections: string[] = []
  let currentLength = 0
  let truncated = false

  for (const pageText of pageTexts) {
    const section = `[p. ${pageText.pageNumber}]\n${pageText.text.trim()}`
    const nextLength = currentLength + section.length + (sections.length > 0 ? 2 : 0)

    if (nextLength > maxChars) {
      const remaining = maxChars - currentLength - (sections.length > 0 ? 2 : 0)
      if (remaining > 80) {
        sections.push(truncateForAiContext(section, remaining).text)
      }
      truncated = true
      break
    }

    sections.push(section)
    currentLength = nextLength
  }

  return {
    text: sections.join('\n\n').trim(),
    truncated: truncated || sections.length < pageTexts.length
  }
}

function extractPdfTextItems(items: unknown[]): string {
  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || !('str' in item)) {
        return ''
      }

      const text = typeof item.str === 'string' ? item.str : ''
      return 'hasEOL' in item && item.hasEOL ? `${text}\n` : `${text} `
    })
    .join('')
}

function normalizePdfExtractedText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncateForAiContext(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false }
  }

  const suffix = '\n\n[内容已截断]'
  return {
    text: `${text.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`,
    truncated: true
  }
}

function formatPageNumberList(pageNumbers: number[]): string {
  if (pageNumbers.length === 0) {
    return '-'
  }

  const ranges: string[] = []
  let rangeStart = pageNumbers[0]
  let previous = pageNumbers[0]

  for (const pageNumber of pageNumbers.slice(1)) {
    if (pageNumber === previous + 1) {
      previous = pageNumber
      continue
    }

    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`)
    rangeStart = pageNumber
    previous = pageNumber
  }

  ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`)
  return ranges.join(', ')
}

function formatUpdatedAt(updatedAt: string): string {
  const time = Date.parse(updatedAt)

  if (!Number.isFinite(time)) {
    return '刚刚更新'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(time)
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath
}

function getFileStem(filePath: string): string {
  const fileName = getFileName(filePath)
  return fileName.replace(/\.pdf$/i, '') || fileName
}

function getPdfDisplayName(filePath: string, pdfDisplayNamesByPath: PdfDisplayNamesByPath): string {
  return pdfDisplayNamesByPath[filePath]?.trim() || getFileName(filePath)
}

function arePdfToolbarBridgesEqual(
  current: PdfViewerToolbarBridge | null,
  next: PdfViewerToolbarBridge | null
): boolean {
  if (current === next) {
    return true
  }

  if (!current || !next) {
    return current === next
  }

  const currentState = current.state
  const nextState = next.state

  return (
    currentState.pageNumber === nextState.pageNumber &&
    currentState.pageCount === nextState.pageCount &&
    Math.abs(currentState.scale - nextState.scale) < 0.001 &&
    currentState.browseMode === nextState.browseMode &&
    currentState.renderMode === nextState.renderMode &&
    currentState.isOverviewOpen === nextState.isOverviewOpen &&
    currentState.isLoading === nextState.isLoading &&
    currentState.canGoPrevious === nextState.canGoPrevious &&
    currentState.canGoNext === nextState.canGoNext &&
    currentState.canZoomOut === nextState.canZoomOut &&
    currentState.canZoomIn === nextState.canZoomIn &&
    currentState.hasDocument === nextState.hasDocument
  )
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) {
    return record
  }

  const next = { ...record }
  delete next[key]
  return next
}

function createNoteForPdf(filePath: string, noteIndex = 1): NoteDocument {
  return createPaperTextTemplateNote({
    title: noteIndex > 1 ? `${getFileStem(filePath)} Notes ${noteIndex}` : `${getFileStem(filePath)} Notes`,
    paperId: `paper_${hashString(filePath)}`
  })
}

async function createScreenshotNoteForPdf(filePath: string, noteIndex = 1): Promise<NoteDocument> {
  const paperId = `paper_${hashString(filePath)}`
  const segments = await renderPdfScreenshotSegments(filePath)

  return createPdfSegmentScreenshotNote({
    title: noteIndex > 1 ? `${getFileStem(filePath)} 截图笔记 ${noteIndex}` : `${getFileStem(filePath)} 截图笔记`,
    paperId,
    segments
  })
}

async function enhanceMineruResultWithPdfScreenshots(filePath: string, result: MineruParseResult): Promise<MineruParseResult> {
  const screenshotBlocks = result.blocks.filter(canCropMineruBlockAsScreenshot)

  if (screenshotBlocks.length === 0) {
    return result
  }

  const screenshotsByBlockId = await renderMineruBlockScreenshots(filePath, screenshotBlocks)

  if (screenshotsByBlockId.size === 0) {
    return result
  }

  return {
    ...result,
    blocks: result.blocks.map((block) => {
      const screenshot = screenshotsByBlockId.get(block.id)

      if (!screenshot) {
        return block
      }

      return {
        ...block,
        imageDataUrl: screenshot.src,
        caption: block.caption ?? block.text,
        text: block.text ?? block.caption
      }
    })
  }
}

async function renderMineruBlockScreenshots(
  filePath: string,
  blocks: MineruParseBlock[]
): Promise<Map<string, PdfScreenshotRenderedSegment>> {
  const data = await window.thesisAgent.readPdfFile(filePath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapPacked: true,
    cMapUrl: `${pdfjsResourceBaseUrl}cmaps/`,
    disableFontFace: false,
    standardFontDataUrl: `${pdfjsResourceBaseUrl}standard_fonts/`,
    useSystemFonts: true,
    wasmUrl: `${pdfjsResourceBaseUrl}wasm/`,
    useWorkerFetch: false
  })
  const documentProxy = await loadingTask.promise
  const blocksByPage = new Map<number, MineruParseBlock[]>()
  const screenshotsByBlockId = new Map<string, PdfScreenshotRenderedSegment>()

  for (const block of blocks) {
    const pageBlocks = blocksByPage.get(block.pageNo) ?? []
    pageBlocks.push(block)
    blocksByPage.set(block.pageNo, pageBlocks)
  }

  try {
    for (const [pageNo, pageBlocks] of blocksByPage) {
      if (pageNo < 1 || pageNo > documentProxy.numPages) {
        continue
      }

      const page = await documentProxy.getPage(pageNo)
      const viewport = page.getViewport({ scale: 1 })
      const pageCanvas = await renderPdfScreenshotPageCanvas(filePath, pageNo, page, viewport)
      const renderedSegments = cropPdfScreenshotSegments(
        pageCanvas,
        pageBlocks.map((block, index) => ({
          pageNo,
          segmentIndex: index,
          rect: block.rect
        }))
      )

      for (const renderedSegment of renderedSegments) {
        const block = pageBlocks[renderedSegment.segmentIndex]
        if (block) {
          screenshotsByBlockId.set(block.id, renderedSegment)
        }
      }
    }
  } finally {
    await documentProxy.destroy()
  }

  return screenshotsByBlockId
}

function canCropMineruBlockAsScreenshot(block: MineruParseBlock): boolean {
  return block.type === 'image' || block.type === 'chart'
}

async function renderPdfScreenshotSegments(filePath: string): Promise<PdfScreenshotRenderedSegment[]> {
  const layoutSegmentsPromise = window.thesisAgent
    .extractPdfLayoutSegments({
      filePath,
      maxPages: 6,
      maxSegments: 36
    })
    .then((result) => result.segments)
    .catch(() => [] as PdfLayoutSegment[])
  const data = await window.thesisAgent.readPdfFile(filePath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapPacked: true,
    cMapUrl: `${pdfjsResourceBaseUrl}cmaps/`,
    disableFontFace: false,
    standardFontDataUrl: `${pdfjsResourceBaseUrl}standard_fonts/`,
    useSystemFonts: true,
    wasmUrl: `${pdfjsResourceBaseUrl}wasm/`,
    useWorkerFetch: false
  })
  const documentProxy = await loadingTask.promise
  const renderedSegments: PdfScreenshotRenderedSegment[] = []
  const maxPages = Math.min(documentProxy.numPages, 6)

  try {
    const layoutSegments = (await layoutSegmentsPromise).filter((segment) => segment.pageNo >= 1 && segment.pageNo <= maxPages)
    const layoutSegmentsByPage = groupLayoutSegmentsByPage(layoutSegments)

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const page = await documentProxy.getPage(pageNo)
      const viewport = page.getViewport({ scale: 1 })
      const pageCanvas = await renderPdfScreenshotPageCanvas(filePath, pageNo, page, viewport)
      const pageLayoutSegments = layoutSegmentsByPage.get(pageNo)
      const pageSegments =
        pageLayoutSegments && pageLayoutSegments.length > 0 ? pageLayoutSegments : createUniformPdfPageSegments(pageNo)

      renderedSegments.push(...cropPdfScreenshotSegments(pageCanvas, pageSegments))
    }
  } finally {
    await documentProxy.destroy()
  }

  return renderedSegments
}

async function renderPdfScreenshotPageCanvas(
  filePath: string,
  pageNo: number,
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy['getViewport']>
): Promise<HTMLCanvasElement> {
  try {
    const bitmap = await window.thesisAgent.renderPdfPageBitmap({
      filePath,
      pageNumber: pageNo,
      scale: 1,
      outputScale: 2.75
    })
    const image = await loadImageDataUrl(bitmap.imageDataUrl)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas context is not available.')
    }

    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    context.drawImage(image, 0, 0)

    return canvas
  } catch {
    return renderPdfScreenshotPageWithPdfJs(page, viewport)
  }
}

async function renderPdfScreenshotPageWithPdfJs(
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy['getViewport']>
): Promise<HTMLCanvasElement> {
  const renderScale = Math.min(2.75, Math.max(1.85, 1700 / Math.max(viewport.width, 1)))
  const renderViewport = page.getViewport({ scale: renderScale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context is not available.')
  }

  canvas.width = Math.ceil(renderViewport.width)
  canvas.height = Math.ceil(renderViewport.height)

  await page.render({
    canvas,
    canvasContext: context,
    viewport: renderViewport
  }).promise

  return canvas
}

function loadImageDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load rendered PDF page bitmap.'))
    image.src = src
  })
}

function groupLayoutSegmentsByPage(segments: PdfLayoutSegment[]): Map<number, PdfScreenshotLayoutSegment[]> {
  const groups = new Map<number, PdfScreenshotLayoutSegment[]>()

  for (const segment of segments) {
    const rect = normalizeScreenshotRect(segment.rect)

    if (rect.width <= 0 || rect.height <= 0) {
      continue
    }

    const pageSegments = groups.get(segment.pageNo) ?? []
    pageSegments.push({
      pageNo: segment.pageNo,
      segmentIndex: pageSegments.length,
      rect
    })
    groups.set(segment.pageNo, pageSegments)
  }

  return groups
}

function createUniformPdfPageSegments(pageNo: number): PdfScreenshotLayoutSegment[] {
  return Array.from({ length: 3 }, (_item, segmentIndex) => ({
    pageNo,
    segmentIndex,
    rect: {
      x: 0,
      y: segmentIndex / 3,
      width: 1,
      height: 1 / 3
    }
  }))
}

function cropPdfScreenshotSegments(
  pageCanvas: HTMLCanvasElement,
  pageSegments: PdfScreenshotLayoutSegment[]
): PdfScreenshotRenderedSegment[] {
  return pageSegments.flatMap((segment) => {
    const sourceRect = createPaddedCropRect(pageCanvas, segment.rect)

    if (sourceRect.width <= 0 || sourceRect.height <= 0) {
      return []
    }

    const segmentCanvas = document.createElement('canvas')
    const segmentContext = segmentCanvas.getContext('2d')

    if (!segmentContext) {
      return []
    }

    segmentCanvas.width = sourceRect.width
    segmentCanvas.height = sourceRect.height
    segmentContext.drawImage(
      pageCanvas,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      sourceRect.width,
      sourceRect.height
    )

    return [
      {
        src: segmentCanvas.toDataURL('image/png'),
        pageNo: segment.pageNo,
        segmentIndex: segment.segmentIndex,
        width: segmentCanvas.width,
        height: segmentCanvas.height,
        rect: {
          x: sourceRect.x / Math.max(pageCanvas.width, 1),
          y: sourceRect.y / Math.max(pageCanvas.height, 1),
          width: sourceRect.width / Math.max(pageCanvas.width, 1),
          height: sourceRect.height / Math.max(pageCanvas.height, 1)
        }
      }
    ]
  })
}

function createPaddedCropRect(
  canvas: HTMLCanvasElement,
  rect: PdfScreenshotRect
): { x: number; y: number; width: number; height: number } {
  const normalizedRect = normalizeScreenshotRect(rect)
  const paddingX = Math.round(canvas.width * 0.018)
  const paddingY = Math.round(canvas.height * 0.012)
  const minHeight = Math.round(canvas.height * 0.055)
  const rawX = Math.floor(normalizedRect.x * canvas.width)
  const rawY = Math.floor(normalizedRect.y * canvas.height)
  const rawWidth = Math.ceil(normalizedRect.width * canvas.width)
  const rawHeight = Math.ceil(normalizedRect.height * canvas.height)
  const heightPadding = rawHeight < minHeight ? Math.ceil((minHeight - rawHeight) / 2) : 0
  const x = Math.max(0, rawX - paddingX)
  const y = Math.max(0, rawY - paddingY - heightPadding)
  const right = Math.min(canvas.width, rawX + rawWidth + paddingX)
  const bottom = Math.min(canvas.height, rawY + rawHeight + paddingY + heightPadding)

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  }
}

function normalizeScreenshotRect(rect: PdfScreenshotRect): PdfScreenshotRect {
  const x = clampUnit(rect.x)
  const y = clampUnit(rect.y)
  const right = clampUnit(rect.x + rect.width)
  const bottom = clampUnit(rect.y + rect.height)

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  }
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function hashString(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }

  return Math.abs(hash).toString(36)
}

function getNoteBlockLabel(type: NoteBlockType): string {
  return noteBlockTypeOptions.find((option) => option.id === type)?.title ?? type
}

function isNoteBlockType(value: string): value is NoteBlockType {
  return noteBlockTypes.includes(value as NoteBlockType)
}

function canUseNoteBlockBulletList(type: NoteBlockType): boolean {
  return type === 'paragraph' || type === 'heading' || type === 'quote' || type === 'pdf_excerpt' || type === 'ai_answer' || type === 'question_node'
}

function getBlockTextAreaRows(block: NoteBlock): number {
  if (block.type === 'formula') {
    return 3
  }

  const lineCount = getNoteBlockText(block).split('\n').length
  return Math.min(10, Math.max(2, lineCount))
}

function getNoteBlockEditorStyle(block: NoteBlock): CSSProperties {
  return {
    fontFamily: block.style?.fontFamily,
    fontSize: block.style?.fontSize ? `${block.style.fontSize}px` : undefined,
    fontWeight: block.style?.bold ? 700 : undefined,
    fontStyle: block.style?.italic ? 'italic' : undefined,
    textDecoration: block.style?.underline ? 'underline' : undefined,
    backgroundColor: block.style?.highlight
  }
}

function isTodoBlockChecked(block: NoteBlock): boolean {
  return block.type === 'todo' && 'checked' in block.content ? block.content.checked : false
}

function getMediaBlockSrc(block: NoteBlock): string {
  return 'src' in block.content ? block.content.src ?? '' : ''
}

function getMediaBlockAlt(block: NoteBlock): string {
  return 'alt' in block.content ? block.content.alt ?? 'PDF 分段截图' : 'PDF 分段截图'
}

function getChatTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let currentTurn: ChatTurn | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      currentTurn = {
        id: message.id,
        question: message
      }
      turns.push(currentTurn)
      continue
    }

    if (currentTurn && !currentTurn.answer) {
      currentTurn.answer = message
      currentTurn = null
    }
  }

  return turns
}

function prunePdfViewStates(states: PdfViewStates, openPdfPaths: string[]): PdfViewStates {
  const openPathSet = new Set(openPdfPaths)
  const entries = Object.entries(states)
    .sort((left, right) => {
      const openScore = Number(openPathSet.has(right[0])) - Number(openPathSet.has(left[0]))
      if (openScore !== 0) {
        return openScore
      }

      return Date.parse(right[1].updatedAt ?? '') - Date.parse(left[1].updatedAt ?? '')
    })
    .slice(0, 80)

  return Object.fromEntries(entries)
}

function prunePdfDisplayNamesByPath(
  pdfDisplayNamesByPath: PdfDisplayNamesByPath,
  openPdfPaths: string[]
): PdfDisplayNamesByPath {
  const openPathSet = new Set(openPdfPaths)

  return Object.fromEntries(
    Object.entries(pdfDisplayNamesByPath)
      .filter(([filePath, displayName]) => openPathSet.has(filePath) && displayName.trim().length > 0)
      .map(([filePath, displayName]) => [filePath, displayName.trim().slice(0, 120)] as const)
  )
}

function prunePdfFileInfoByPath(pdfFileInfoByPath: PdfFileInfoByPath, openPdfPaths: string[]): PdfFileInfoByPath {
  const openPathSet = new Set(openPdfPaths)

  return Object.fromEntries(
    Object.entries(pdfFileInfoByPath)
      .filter(([filePath, fileInfo]) => openPathSet.has(filePath) && Number.isFinite(fileInfo.size) && fileInfo.size >= 0)
      .map(([filePath, fileInfo]) => [
        filePath,
        {
          size: Math.max(0, Math.floor(fileInfo.size)),
          modifiedAt: typeof fileInfo.modifiedAt === 'string' && fileInfo.modifiedAt ? fileInfo.modifiedAt : undefined
        }
      ] as const)
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRestoredNoteDocument(value: unknown): value is NoteDocument {
  if (!isObjectRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.blocks) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function normalizeNoteList(input: unknown): NoteDocument[] {
  const rawNotes = Array.isArray(input) ? input : isRestoredNoteDocument(input) ? [input] : []
  return rawNotes.filter(isRestoredNoteDocument)
}

function normalizeNoteIdList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return [...new Set(input.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 20)
}

function normalizeNotesByPaperPath(input: unknown): NotesByPaperPath {
  if (!isObjectRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([filePath, notes]) => [filePath, normalizeNoteList(notes)] as const)
      .filter(([, notes]) => notes.length > 0)
  )
}

function normalizeMineruResultsByPaperPath(input: Record<string, MineruParseResult>): Record<string, MineruParseResult> {
  return Object.fromEntries(
    Object.entries(input).map(([filePath, result]) => [filePath, normalizeMineruParseResultSegments(result)] as const)
  )
}

function normalizeSourceLinkKeyList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((key): key is string => typeof key === 'string')
    .map((key) => key.trim())
    .filter((key, index, allKeys) => key.length > 0 && allKeys.indexOf(key) === index)
}

function normalizeInvalidatedSourceLinkKeysByPaperPath(input: unknown): Record<string, string[]> {
  if (!isObjectRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([filePath, keys]) => [filePath, normalizeSourceLinkKeyList(keys)] as const)
      .filter(([filePath, keys]) => filePath.length > 0 && keys.length > 0)
  )
}

function pruneInvalidatedSourceLinkKeysByPaperPath(
  invalidatedSourceLinkKeysByPaperPath: Record<string, string[]>,
  knownPdfPaths: string[]
): Record<string, string[]> {
  const knownPathSet = new Set(knownPdfPaths)

  return Object.fromEntries(
    Object.entries(invalidatedSourceLinkKeysByPaperPath)
      .map(([filePath, keys]) => [filePath, normalizeSourceLinkKeyList(keys)] as const)
      .filter(([filePath, keys]) => knownPathSet.has(filePath) && keys.length > 0)
  )
}

function applyInvalidatedSourceLinksToNotesByPaperPath(
  notesByPaperPath: NotesByPaperPath,
  invalidatedSourceLinkKeysByPaperPath: Record<string, string[]>
): NotesByPaperPath {
  return Object.fromEntries(
    Object.entries(normalizeNotesByPaperPath(notesByPaperPath)).map(([filePath, notes]) => [
      filePath,
      applyInvalidatedSourceLinksToNotes(notes, normalizeSourceLinkKeyList(invalidatedSourceLinkKeysByPaperPath[filePath]))
    ] as const)
  )
}

function applyInvalidatedSourceLinksToNotes(notes: NoteDocument[], invalidatedSourceLinkKeys: string[]): NoteDocument[] {
  if (invalidatedSourceLinkKeys.length === 0) {
    return notes
  }

  const invalidatedKeySet = new Set(invalidatedSourceLinkKeys)
  let changed = false
  const nextNotes = notes.map((note) => {
    let noteChanged = false
    const blocks = note.blocks.map((block) => {
      if (!invalidatedKeySet.has(getSourceLinkKey(note, block))) {
        return block
      }

      noteChanged = true
      return {
        ...block,
        sourceRefs: block.sourceRefs.map((sourceRef) =>
          sourceRef.type !== 'note_block' || sourceRef.sourceLinkStatus === 'invalidated'
            ? sourceRef
            : {
                ...sourceRef,
                sourceLinkStatus: 'invalidated' as const
              }
        )
      }
    })

    if (!noteChanged) {
      return note
    }

    changed = true
    return {
      ...note,
      blocks
    }
  })

  return changed ? nextNotes : notes
}

function getPaperNotes(notesByPaperPath: NotesByPaperPath, filePath: string): NoteDocument[] {
  return normalizeNoteList((notesByPaperPath as Record<string, unknown>)[filePath])
}

function getOpenNoteIdsForPaper(
  openNoteIdsByPaperPath: OpenNoteIdsByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  filePath: string
): string[] {
  const noteIdSet = new Set(getPaperNotes(notesByPaperPath, filePath).map((note) => note.id))
  return normalizeNoteIdList((openNoteIdsByPaperPath as Record<string, unknown>)[filePath]).filter((noteId) => noteIdSet.has(noteId))
}

function buildDefaultOpenNoteIdsByPaperPath(
  notesByPaperPath: NotesByPaperPath,
  selectedNoteIdsByPaperPath: SelectedNoteIdsByPaperPath
): OpenNoteIdsByPaperPath {
  return Object.fromEntries(
    Object.entries(normalizeNotesByPaperPath(notesByPaperPath))
      .map(([filePath, notes]) => {
        const selectedNoteId = selectedNoteIdsByPaperPath[filePath]
        const defaultNoteId = selectedNoteId && notes.some((note) => note.id === selectedNoteId) ? selectedNoteId : notes[0]?.id

        return [filePath, defaultNoteId ? [defaultNoteId] : []] as const
      })
      .filter(([, noteIds]) => noteIds.length > 0)
  )
}

function getSelectedOpenNoteIdForPaper(
  selectedNoteIdsByPaperPath: SelectedNoteIdsByPaperPath,
  openNoteIdsByPaperPath: OpenNoteIdsByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  filePath: string
): string {
  const selectedNoteId = selectedNoteIdsByPaperPath[filePath] ?? ''
  const openNoteIds = getOpenNoteIdsForPaper(openNoteIdsByPaperPath, notesByPaperPath, filePath)

  if (selectedNoteId && openNoteIds.includes(selectedNoteId)) {
    return selectedNoteId
  }

  return openNoteIds[0] ?? ''
}

function getPdfLinkedRegionDedupeKey(region: PdfLinkedNoteRegion): string {
  const rect = region.rect
  const rectKey = [
    region.pageNo,
    rect.x.toFixed(4),
    rect.y.toFixed(4),
    rect.width.toFixed(4),
    rect.height.toFixed(4)
  ].join(':')

  return region.mineruBlockId
    ? `${region.paperPath}:mineru:${region.mineruBlockId}:p${region.pageNo}:${rectKey}`
    : `${region.paperPath}:p${region.pageNo}:rect:${rectKey}`
}

function isValidPdfSourceRect(rect: NonNullable<SourceRef['rect']>): boolean {
  const tolerance = 0.0001
  const values = [rect.x, rect.y, rect.width, rect.height]

  return (
    values.every((value) => Number.isFinite(value)) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x + rect.width <= 1 + tolerance &&
    rect.y + rect.height <= 1 + tolerance
  )
}

function invalidateSourceLinksForEditedBlock(
  filePath: string,
  note: NoteDocument,
  oldBlock: NoteBlock,
  nextBlock: NoteBlock
): { block: NoteBlock; invalidatedKey: string } {
  const hasValidSourceLinks = oldBlock.sourceRefs.some(
    (sourceRef) => sourceRef.type === 'note_block' && sourceRef.sourceLinkStatus !== 'invalidated'
  )

  if (!hasValidSourceLinks) {
    return {
      block: nextBlock,
      invalidatedKey: ''
    }
  }

  const invalidatedKey = getSourceLinkKey(note, oldBlock)

  return {
    block: {
      ...nextBlock,
      sourceRefs: nextBlock.sourceRefs.map((sourceRef) =>
        sourceRef.type !== 'note_block' || sourceRef.sourceLinkStatus === 'invalidated'
          ? sourceRef
          : {
              ...sourceRef,
              sourceLinkStatus: 'invalidated' as const
            }
      )
    },
    invalidatedKey
  }
}

function getSourceRefRectKey(rect: NonNullable<SourceRef['rect']>): string {
  return [
    rect.x.toFixed(4),
    rect.y.toFixed(4),
    rect.width.toFixed(4),
    rect.height.toFixed(4)
  ].join(':')
}

function mergePdfLinkedNoteRegion(currentRegion: PdfLinkedNoteRegion, nextRegion: PdfLinkedNoteRegion): PdfLinkedNoteRegion {
  return {
    ...currentRegion,
    ...nextRegion,
    mineruBlockId: nextRegion.mineruBlockId ?? currentRegion.mineruBlockId,
    mineruBlock: nextRegion.mineruBlock ?? currentRegion.mineruBlock,
    rawType: nextRegion.rawType || currentRegion.rawType,
    label: nextRegion.label || currentRegion.label
  }
}

function findNoteBlockForPdfLinkedRegion(note: NoteDocument, region: PdfLinkedNoteRegion): NoteBlock | undefined {
  const directBlock = note.blocks.find((block) => block.id === region.noteBlockId)
  if (directBlock && isNoteBlockLinkedToRegion(directBlock, region)) {
    return directBlock
  }

  return note.blocks.find((block) => isNoteBlockLinkedToRegion(block, region))
}

function getSourceLinkKey(note: NoteDocument, block: NoteBlock): string {
  return [note.id, block.id, 'block'].join(':')
}

function isSourceLinkInvalidated(sourceRef: SourceRef): boolean {
  return sourceRef.sourceLinkStatus === 'invalidated'
}

function isNoteBlockLinkedToRegion(block: NoteBlock, region: PdfLinkedNoteRegion): boolean {
  return block.sourceRefs.some((sourceRef) => {
    if (sourceRef.type !== 'note_block' || !sourceRef.rect) {
      return false
    }

    if (region.mineruBlockId && sourceRef.mineruBlockId === region.mineruBlockId) {
      return true
    }

    return (sourceRef.pageNo ?? 1) === region.pageNo && areSourceRectsClose(sourceRef.rect, region.rect)
  })
}

function areSourceRectsClose(left: NonNullable<SourceRef['rect']>, right: NonNullable<SourceRef['rect']>): boolean {
  const tolerance = 0.006

  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance
  )
}

function serializeNoteDocument(note: NoteDocument): string {
  return JSON.stringify(note)
}

function isNoteDirtyForDocument(savedNotes: NoteDocument[], note: NoteDocument): boolean {
  const savedNote = savedNotes.find((currentNote) => currentNote.id === note.id)
  if (!savedNote) {
    return true
  }

  return serializeNoteDocument(savedNote) !== serializeNoteDocument(note)
}

function isNoteDirty(
  savedNotesByPaperPath: NotesByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  filePath: string,
  noteId: string
): boolean {
  const note = getPaperNotes(notesByPaperPath, filePath).find((currentNote) => currentNote.id === noteId)
  if (!note) {
    return false
  }

  return isNoteDirtyForDocument(getPaperNotes(savedNotesByPaperPath, filePath), note)
}

function pruneNotesByPaperPath(notesByPaperPath: NotesByPaperPath, openPdfPaths: string[]): NotesByPaperPath {
  const openPathSet = new Set(openPdfPaths)
  const entries = Object.entries(normalizeNotesByPaperPath(notesByPaperPath))
    .map(([filePath, notes]) => [
      filePath,
      notes
        .filter((note) => note.blocks.length > 0 || countNoteTextCharacters(note) > 0)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, 20)
    ] as const)
    .filter(([, notes]) => notes.length > 0)
    .sort((left, right) => {
      const openScore = Number(openPathSet.has(right[0])) - Number(openPathSet.has(left[0]))
      if (openScore !== 0) {
        return openScore
      }

      return Date.parse(right[1][0]?.updatedAt ?? '') - Date.parse(left[1][0]?.updatedAt ?? '')
    })
    .slice(0, 80)

  return Object.fromEntries(entries)
}

function pruneOpenNoteIdsByPaperPath(
  openNoteIdsByPaperPath: OpenNoteIdsByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  openPdfPaths: string[]
): OpenNoteIdsByPaperPath {
  const openPathSet = new Set(openPdfPaths)

  return Object.fromEntries(
    Object.entries(normalizeNotesByPaperPath(notesByPaperPath))
      .map(([filePath]) => [filePath, getOpenNoteIdsForPaper(openNoteIdsByPaperPath, notesByPaperPath, filePath)] as const)
      .filter(([filePath, noteIds]) => noteIds.length > 0 && (openPathSet.has(filePath) || getPaperNotes(notesByPaperPath, filePath).length > 0))
  )
}

function pruneSelectedNoteIdsByPaperPath(
  selectedNoteIdsByPaperPath: SelectedNoteIdsByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  openPdfPaths: string[]
): SelectedNoteIdsByPaperPath {
  const openPathSet = new Set(openPdfPaths)
  const normalizedNotesByPaperPath = normalizeNotesByPaperPath(notesByPaperPath)

  return Object.fromEntries(
    Object.entries(selectedNoteIdsByPaperPath).filter(([filePath, noteId]) => {
      if (!openPathSet.has(filePath) && !normalizedNotesByPaperPath[filePath]?.length) {
        return false
      }

      return noteId === '' || Boolean(normalizedNotesByPaperPath[filePath]?.some((note) => note.id === noteId))
    })
  )
}

function pruneAiConversationsByPaperPath(
  conversationsByPaperPath: AiConversationsByPaperPath,
  openPdfPaths: string[]
): AiConversationsByPaperPath {
  const openPathSet = new Set(openPdfPaths)
  const entries = Object.entries(conversationsByPaperPath)
    .map(([paperPath, conversations]) => [
      paperPath,
      conversations
        .filter((conversation) => conversation.messages.length > 0 || !conversation.parentAnswerId)
        .map((conversation) => ({
          ...conversation,
          title: conversation.title || deriveAiConversationTitle(conversation.messages, '新对话')
        }))
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, 40)
    ] as const)
    .filter(([, conversations]) => conversations.length > 0)
    .sort((left, right) => {
      const openScore = Number(openPathSet.has(right[0])) - Number(openPathSet.has(left[0]))
      if (openScore !== 0) {
        return openScore
      }

      return getLatestConversationUpdatedAt(right[1]) - getLatestConversationUpdatedAt(left[1])
    })
    .slice(0, 80)

  return Object.fromEntries(entries)
}

function pruneActiveAiConversationIdsByPaperPath(
  activeConversationIdsByPaperPath: ActiveAiConversationIdsByPaperPath,
  conversationsByPaperPath: AiConversationsByPaperPath,
  openPdfPaths: string[]
): ActiveAiConversationIdsByPaperPath {
  const openPathSet = new Set(openPdfPaths)

  return Object.fromEntries(
    Object.entries(activeConversationIdsByPaperPath).filter(([paperPath, conversationId]) => {
      if (!openPathSet.has(paperPath) && !conversationsByPaperPath[paperPath]?.length) {
        return false
      }

      return Boolean(conversationsByPaperPath[paperPath]?.some((conversation) => conversation.id === conversationId))
    })
  )
}

function getLatestConversationUpdatedAt(conversations: AiConversation[]): number {
  return conversations.reduce((latest, conversation) => Math.max(latest, Date.parse(conversation.updatedAt)), 0)
}

function getFavoriteKey(target: FavoriteTarget): string {
  if (target.type === 'paper') {
    return `paper:${target.paperPath}`
  }

  if (target.type === 'note') {
    return `note:${target.paperPath}:${target.noteId}`
  }

  return `ai_answer:${target.paperPath}:${target.conversationId}:${target.messageId}`
}

function isFavorite(favoriteItemsByKey: FavoriteItemsByKey, target: FavoriteTarget): boolean {
  return Boolean(favoriteItemsByKey[getFavoriteKey(target)])
}

function normalizeFavoriteItemsByKey(input: unknown): FavoriteItemsByKey {
  const rawItems = Array.isArray(input) ? input : isObjectRecord(input) ? Object.values(input) : []
  const items = rawItems
    .map(normalizeFavoriteItem)
    .filter((item): item is FavoriteItem => Boolean(item))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 200)

  return Object.fromEntries(items.map((item) => [getFavoriteKey(item), item]))
}

function normalizeFavoriteItem(input: unknown): FavoriteItem | undefined {
  if (!isObjectRecord(input) || !isPdfFilePath(input.paperPath)) {
    return undefined
  }

  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()

  if (input.type === 'paper') {
    return {
      type: 'paper',
      paperPath: input.paperPath,
      createdAt
    }
  }

  if (input.type === 'note' && typeof input.noteId === 'string') {
    return {
      type: 'note',
      paperPath: input.paperPath,
      noteId: input.noteId,
      createdAt
    }
  }

  if (input.type === 'ai_answer' && typeof input.conversationId === 'string' && typeof input.messageId === 'string') {
    return {
      type: 'ai_answer',
      paperPath: input.paperPath,
      conversationId: input.conversationId,
      messageId: input.messageId,
      createdAt
    }
  }

  return undefined
}

function pruneFavoriteItemsByKey(
  favoriteItemsByKey: FavoriteItemsByKey,
  notesByPaperPath: NotesByPaperPath,
  conversationsByPaperPath: AiConversationsByPaperPath
): FavoriteItemsByKey {
  const items = Object.values(normalizeFavoriteItemsByKey(favoriteItemsByKey))
    .filter((item) => isFavoriteItemAvailable(item, notesByPaperPath, conversationsByPaperPath))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 200)

  return Object.fromEntries(items.map((item) => [getFavoriteKey(item), item]))
}

function isFavoriteItemAvailable(
  item: FavoriteItem,
  notesByPaperPath: NotesByPaperPath,
  conversationsByPaperPath: AiConversationsByPaperPath
): boolean {
  if (item.type === 'paper') {
    return isPdfFilePath(item.paperPath)
  }

  if (item.type === 'note') {
    return getPaperNotes(notesByPaperPath, item.paperPath).some((note) => note.id === item.noteId)
  }

  const conversation = conversationsByPaperPath[item.paperPath]?.find((currentConversation) => currentConversation.id === item.conversationId)
  return Boolean(conversation?.messages.some((message) => message.id === item.messageId && message.role === 'assistant'))
}

function isPdfFilePath(input: unknown): input is string {
  return typeof input === 'string' && input.toLowerCase().endsWith('.pdf')
}

function normalizePdfPathList(paths: string[]): string[] {
  return paths.filter(isPdfFilePath).filter((filePath, index, allPaths) => allPaths.indexOf(filePath) === index).slice(0, 80)
}
