import { useEffect, useRef, useState } from 'react'
import { memo, startTransition, useLayoutEffect } from 'react'
import type {
  CSSProperties,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement
} from 'react'
import {
  getNoteBlockText,
  noteFontFamilyOptions,
  noteFontSizeOptions,
  noteHighlightOptions,
  noteBlockTypes
} from '@thesis-agent/notes'
import type {
  MediaNoteBlockContent,
  NoteBlock,
  NoteBlockStyle,
  NoteBlockType,
  NoteDocument,
  NoteMediaCrop,
  NoteMediaWrapStyle
} from '@thesis-agent/notes'
import katex from 'katex'
import type { ClipboardImagePayload, NoteExportFormat } from '../../../preload/thesis-agent'
import { noteBlockTypeOptions } from '../../app/constants'
import type { MineruBlockDragPayload } from '../../app/mineruDrag'
import {
  hasMineruBlockDragPayload,
  readMineruBlockDragPayload
} from '../../app/mineruDrag'
import {
  canUseNoteBlockBulletList,
  countNoteTextCharacters,
  getMediaBlockAlt,
  getMediaBlockSrc,
  getNoteListMarker,
  getNoteBlockEditorStyle,
  getNoteBlockLabel,
  getNoteHistoryKey,
  isNoteBlockType,
  isTodoBlockChecked,
  noteTemplateDefinitions,
  pushNoteHistorySnapshot
} from '../../app/notePanelUtils'
import { formatUpdatedAt, getFileName, getFileStem, isFavorite } from '../../app/sidebarUtils'
import type { FavoriteItemsByKey, FavoriteTarget } from '../../app/types'
import { FavoriteButton } from '../AppSharedControls'

const noteInsertBlockTypeOptions = noteBlockTypeOptions.filter(
  (option) => option.id !== 'image' && option.id !== 'screenshot'
)

const notePageScaleStep = 0.1
const noteMediaResizeHandles: NoteMediaResizeHandle[] = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left'
]
const noteBlockDragMimeType = 'application/x-inspiration-note-block'

type NoteImageInsertLayout = Pick<MediaNoteBlockContent, 'displayWidth' | 'displayHeight' | 'wrapStyle'>

type NoteMediaResizeState = {
  pointerId: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  aspectRatio: number
  handle: NoteMediaResizeHandle
}

type NoteMediaResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

type TextSelectionRange = {
  start: number
  end: number
}

type NoteCrossBlockSelection = {
  noteId: string
  anchorBlockId: string
  anchorOffset: number
  focusBlockId: string
  focusOffset: number
}

type NoteCrossBlockSelectionAnchor = {
  pointerId: number
  noteId: string
  anchorBlockId: string
  anchorOffset: number
}

type NoteImageDropIndicator = {
  insertAfterBlockId: string | null
  top: number
  wrapStyle: NoteMediaWrapStyle
}

type NoteImageDropPreview = NoteImageDropIndicator & {
  left: number
  top: number
  sourceKey: string
  sourceUrl: string
  sourceName: string
}

type NoteImageDropTarget = {
  insertAfterBlockId: string | null
  layout: NoteImageInsertLayout
}

type NoteBlockDragPayload = {
  filePath: string
  noteId: string
  blockId: string
}

export function NotePanelContent({
  visiblePdfPath,
  notes,
  note,
  isTemplatePending,
  isDirty,
  favoriteItemsByKey,
  isCreatingScreenshotNote,
  focusedNoteBlockRequest,
  onOpenPdf,
  onFavoriteToggle,
  onSave,
  onTitleChange,
  onBlockAdd,
  onBlockTypeChange,
  onBlockTextChange,
  onBlockStyleChange,
  onBlockMediaChange,
  onBlockDelete,
  onBlockMove,
  onTodoChange,
  onSourceJump,
  onMarkdownCopy,
  onExportNote,
  onSwitchToMilkdown,
  onImagePaste,
  onNoteRestore,
  onMineruBlockDrop,
  onReadPastedImages,
  onTextTemplateCreate,
  onFreeformTemplateCreate,
  onScreenshotTemplateCreate
}: {
  visiblePdfPath: string
  notes: NoteDocument[]
  note?: NoteDocument
  isTemplatePending: boolean
  isDirty: boolean
  favoriteItemsByKey: FavoriteItemsByKey
  isCreatingScreenshotNote: boolean
  focusedNoteBlockRequest?: {
    filePath: string
    noteId: string
    blockId: string
    nonce: number
  } | null
  onOpenPdf: () => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onSave: (filePath: string, noteId: string) => void
  onTitleChange: (filePath: string, noteId: string, title: string) => void
  onBlockAdd: (filePath: string, noteId: string, type: NoteBlockType, insertAfterBlockId?: string | null) => string
  onBlockTypeChange: (filePath: string, noteId: string, blockId: string, type: NoteBlockType) => void
  onBlockTextChange: (filePath: string, noteId: string, blockId: string, text: string) => void
  onBlockStyleChange: (filePath: string, noteId: string, blockId: string, stylePatch: Partial<NoteBlockStyle>) => void
  onBlockMediaChange: (filePath: string, noteId: string, blockId: string, contentPatch: Partial<MediaNoteBlockContent>) => void
  onBlockDelete: (filePath: string, noteId: string, blockId: string) => void
  onTodoChange: (filePath: string, noteId: string, blockId: string, checked: boolean) => void
  onSourceJump: (filePath: string, noteId: string, blockId: string) => void
  onBlockMove?: (filePath: string, noteId: string, blockId: string, insertAfterBlockId?: string | null) => void
  onMarkdownCopy: (filePath: string, noteId: string) => void
  onExportNote: (filePath: string, noteId: string, format: NoteExportFormat) => void
  onSwitchToMilkdown?: () => void
  onImagePaste: (
    filePath: string,
    noteId: string,
    images: ClipboardImagePayload[],
    insertAfterBlockId?: string | null,
    layout?: NoteImageInsertLayout
  ) => void
  onNoteRestore: (filePath: string, noteId: string, noteSnapshot: NoteDocument) => void
  onMineruBlockDrop: (payload: MineruBlockDragPayload, insertAfterBlockId?: string | null) => void
  onReadPastedImages: (clipboardData: DataTransfer) => Promise<ClipboardImagePayload[]>
  onTextTemplateCreate: (filePath: string) => void
  onFreeformTemplateCreate: (filePath: string) => void
  onScreenshotTemplateCreate: (filePath: string) => void
}): ReactElement {
  const [activeNoteBlockId, setActiveNoteBlockId] = useState('')
  const [isSourceJumpModifierHeld, setIsSourceJumpModifierHeld] = useState(false)
  const [notePageScale, setNotePageScale] = useState(1)
  const [noteTitleDraft, setNoteTitleDraft] = useState(note?.title ?? '')
  const focusedNoteBlock = note?.blocks.find((block) => block.id === activeNoteBlockId)
  const activeNoteBlock = focusedNoteBlock ?? note?.blocks[0]
  const activeNoteBlockStyle = activeNoteBlock?.style ?? {}
  const activeNoteBlockCanUseBulletList = activeNoteBlock ? canUseNoteBlockBulletList(activeNoteBlock.type) : false
  const noteUndoHistoryRef = useRef<Record<string, NoteDocument[]>>({})
  const noteRedoHistoryRef = useRef<Record<string, NoteDocument[]>>({})
  const lastHandledFocusRequestNonceRef = useRef<number | null>(null)
  const notePageRef = useRef<HTMLDivElement | null>(null)
  const noteRef = useRef<NoteDocument | undefined>(note)
  const crossBlockSelectionAnchorRef = useRef<NoteCrossBlockSelectionAnchor | null>(null)
  const lastNoteSnapshotRef = useRef<{
    key: string
    note: NoteDocument
  } | null>(null)
  const isRestoringNoteRef = useRef(false)
  const [crossBlockSelection, setCrossBlockSelection] = useState<NoteCrossBlockSelection | null>(null)
  const [imageDropIndicator, setImageDropIndicator] = useState<NoteImageDropIndicator | null>(null)
  const [imageDropPreview, setImageDropPreview] = useState<NoteImageDropPreview | null>(null)
  const imageDropPreviewUrlRef = useRef<string | null>(null)
  const imageDropPreviewKeyRef = useRef<string | null>(null)
  const imageDropTargetRef = useRef<NoteImageDropTarget | null>(null)

  useEffect(() => {
    noteRef.current = note
  }, [note])

  useEffect(() => {
    crossBlockSelectionAnchorRef.current = null
    setCrossBlockSelection(null)
  }, [note?.id, visiblePdfPath])

  useEffect(() => {
    setImageDropIndicator(null)
    setImageDropPreview(null)
    imageDropTargetRef.current = null
  }, [note?.id, visiblePdfPath])

  useEffect(() => {
    return () => {
      if (imageDropPreviewUrlRef.current) {
        URL.revokeObjectURL(imageDropPreviewUrlRef.current)
        imageDropPreviewUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setNoteTitleDraft(note?.title ?? '')
  }, [note?.id, note?.title])

  useEffect(() => {
    const updateModifierState = (event: KeyboardEvent): void => {
      setIsSourceJumpModifierHeld(event.ctrlKey || event.metaKey)
    }

    const handleKeyDown = (event: KeyboardEvent): void => updateModifierState(event)
    const handleKeyUp = (event: KeyboardEvent): void => updateModifierState(event)
    const handleBlur = (): void => setIsSourceJumpModifierHeld(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useEffect(() => {
    if (!visiblePdfPath || !note) {
      lastNoteSnapshotRef.current = null
      return
    }

    const key = getNoteHistoryKey(visiblePdfPath, note.id)
    const previous = lastNoteSnapshotRef.current

    if (previous?.key === key && previous.note !== note) {
      if (isRestoringNoteRef.current) {
        isRestoringNoteRef.current = false
      } else {
        pushNoteHistorySnapshot(noteUndoHistoryRef.current, key, previous.note)
        noteRedoHistoryRef.current[key] = []
      }
    }

    lastNoteSnapshotRef.current = {
      key,
      note
    }
  }, [visiblePdfPath, note])

  useEffect(() => {
    if (!focusedNoteBlockRequest || !visiblePdfPath || !note) {
      return
    }

    if (
      focusedNoteBlockRequest.filePath !== visiblePdfPath ||
      focusedNoteBlockRequest.noteId !== note.id ||
      lastHandledFocusRequestNonceRef.current === focusedNoteBlockRequest.nonce ||
      !note.blocks.some((block) => block.id === focusedNoteBlockRequest.blockId)
    ) {
      return
    }

    lastHandledFocusRequestNonceRef.current = focusedNoteBlockRequest.nonce
    setActiveNoteBlockId(focusedNoteBlockRequest.blockId)
    window.setTimeout(() => {
      const element = document.getElementById(focusedNoteBlockRequest.blockId)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const editor = element?.querySelector<HTMLTextAreaElement>('textarea[data-note-block-editor="true"]')
      if (editor) {
        editor.focus({ preventScroll: true })
        const caretPosition = editor.value.length
        editor.setSelectionRange(caretPosition, caretPosition)
      }
    }, 0)
  }, [focusedNoteBlockRequest, note, visiblePdfPath])

  const restoreNoteFromHistory = (direction: 'undo' | 'redo'): boolean => {
    if (!visiblePdfPath || !note) {
      return false
    }

    const key = getNoteHistoryKey(visiblePdfPath, note.id)
    const sourceHistory = direction === 'undo' ? noteUndoHistoryRef.current : noteRedoHistoryRef.current
    const targetHistory = direction === 'undo' ? noteRedoHistoryRef.current : noteUndoHistoryRef.current
    const sourceStack = sourceHistory[key] ?? []
    const nextSnapshot = sourceStack.at(-1)

    if (!nextSnapshot) {
      return false
    }

    sourceHistory[key] = sourceStack.slice(0, -1)
    pushNoteHistorySnapshot(targetHistory, key, note)
    isRestoringNoteRef.current = true
    onNoteRestore(visiblePdfPath, note.id, nextSnapshot)
    setActiveNoteBlockId((currentBlockId) =>
      nextSnapshot.blocks.some((block) => block.id === currentBlockId) ? currentBlockId : nextSnapshot.blocks.at(-1)?.id ?? ''
    )
    return true
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
      return
    }

    const key = event.key.toLowerCase()
    const handled =
      key === 'z'
        ? restoreNoteFromHistory(event.shiftKey ? 'redo' : 'undo')
        : key === 'y'
          ? restoreNoteFromHistory('redo')
          : false

    if (!handled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  const updateActiveBlockStyle = (stylePatch: Partial<NoteBlockStyle>): void => {
    if (!visiblePdfPath || !note || !activeNoteBlock) {
      return
    }

    onBlockStyleChange(visiblePdfPath, note.id, activeNoteBlock.id, stylePatch)
  }

  const updateActiveBlockType = (value: string): void => {
    if (!visiblePdfPath || !note || !activeNoteBlock || !isNoteBlockType(value)) {
      return
    }

    onBlockTypeChange(visiblePdfPath, note.id, activeNoteBlock.id, value)
  }

  const getNoteBlockEditor = (blockId: string): HTMLTextAreaElement | null => {
    const element = document.getElementById(blockId)
    return element?.querySelector<HTMLTextAreaElement>('textarea[data-note-block-editor="true"]') ?? null
  }

  const focusNoteBlockEditor = (blockId: string, offset: number): void => {
    const editor = getNoteBlockEditor(blockId)
    if (!editor) {
      return
    }

    const caretPosition = Math.min(Math.max(0, offset), editor.value.length)
    editor.focus({ preventScroll: true })
    editor.setSelectionRange(caretPosition, caretPosition)
    onFocusBlock(blockId)
  }

  const onFocusBlock = (blockId: string): void => {
    setActiveNoteBlockId(blockId)
  }

  const getNoteCrossBlockText = (selection: NoteCrossBlockSelection): string => {
    const currentNote = noteRef.current
    if (!currentNote || currentNote.id !== selection.noteId) {
      return ''
    }

    const selectedRanges = getCrossBlockSelectionRanges(currentNote.blocks, selection)
    return currentNote.blocks
      .map((block) => {
        const range = selectedRanges[block.id]
        if (!range) {
          return null
        }

        return getNoteBlockText(block).slice(range.start, range.end)
      })
      .filter((text): text is string => text !== null)
      .join('\n')
  }

  const clearCrossBlockSelection = (): void => {
    crossBlockSelectionAnchorRef.current = null
    setCrossBlockSelection(null)
  }

  const updateCrossBlockSelection = (blockId: string, offset: number): void => {
    const anchor = crossBlockSelectionAnchorRef.current
    const currentNote = noteRef.current
    if (!anchor || !currentNote || currentNote.id !== anchor.noteId) {
      return
    }

    const anchorBlockIndex = currentNote.blocks.findIndex((block) => block.id === anchor.anchorBlockId)
    const focusBlockIndex = currentNote.blocks.findIndex((block) => block.id === blockId)
    if (anchorBlockIndex < 0 || focusBlockIndex < 0) {
      return
    }

    if (focusBlockIndex === anchorBlockIndex) {
      setCrossBlockSelection(null)
      return
    }

    setCrossBlockSelection({
      noteId: anchor.noteId,
      anchorBlockId: anchor.anchorBlockId,
      anchorOffset: anchor.anchorOffset,
      focusBlockId: blockId,
      focusOffset: offset
    })
  }

  const handleBlockSelectionStart = (blockId: string, offset: number): void => {
    if (!note) {
      return
    }

    crossBlockSelectionAnchorRef.current = {
      pointerId: 0,
      noteId: note.id,
      anchorBlockId: blockId,
      anchorOffset: offset
    }
    setCrossBlockSelection(null)
  }

  const handleBlockSelectionChange = (blockId: string, offset: number): void => {
    updateCrossBlockSelection(blockId, offset)
  }

  const handleBlockSelectionEnd = (): void => {
    crossBlockSelectionAnchorRef.current = null
    setCrossBlockSelection((currentSelection) => {
      if (
        !currentSelection ||
        (currentSelection.anchorBlockId === currentSelection.focusBlockId &&
          currentSelection.anchorOffset === currentSelection.focusOffset)
      ) {
        return null
      }

      return currentSelection
    })
  }

  useEffect(() => {
    const handlePointerUp = (): void => {
      if (!crossBlockSelectionAnchorRef.current) {
        return
      }

      handleBlockSelectionEnd()
    }

    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const handleBlockNavigate = (blockId: string, direction: 'previous' | 'next'): void => {
    if (!note) {
      return
    }

    const blockIndex = note.blocks.findIndex((block) => block.id === blockId)
    const targetBlock = direction === 'previous' ? note.blocks[blockIndex - 1] : note.blocks[blockIndex + 1]
    if (!targetBlock) {
      return
    }

    const targetTextLength = getNoteBlockText(targetBlock).length
    window.setTimeout(() => {
      focusNoteBlockEditor(targetBlock.id, direction === 'previous' ? targetTextLength : 0)
    }, 0)
  }

  const handleNoteCopy = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    if (!crossBlockSelection) {
      return
    }

    const selectedText = getNoteCrossBlockText(crossBlockSelection)
    if (!selectedText) {
      return
    }

    event.preventDefault()
    event.clipboardData.setData('text/plain', selectedText)
  }

  const handleNotePagePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!crossBlockSelectionAnchorRef.current || (event.buttons & 1) !== 1) {
      return
    }

    const editor = findNoteBlockEditorFromPoint(event.currentTarget, event.clientX, event.clientY)
    const blockId = editor?.dataset.noteBlockId
    if (!editor || !blockId) {
      return
    }

    updateCrossBlockSelection(blockId, getTextareaOffsetFromPoint(editor, event.clientX, event.clientY))
  }

  const getInsertAfterBlockTarget = (pageElement: HTMLDivElement, pointerY: number): {
    insertAfterBlockId: string | null
    indicatorTop: number
  } => {
    const sections = Array.from(pageElement.querySelectorAll<HTMLElement>('.note-markdown-section'))
    const pageRect = pageElement.getBoundingClientRect()

    if (sections.length === 0) {
      return {
        insertAfterBlockId: null,
        indicatorTop: 120
      }
    }

    let previousBlockId: string | null = null
    for (const section of sections) {
      const rect = section.getBoundingClientRect()
      const sectionMiddleY = rect.top + rect.height / 2
      const upperGap = rect.top - Math.min(24, rect.height * 0.28)
      const lowerGap = rect.bottom + Math.min(24, rect.height * 0.28)
      if (pointerY < upperGap) {
        return {
          insertAfterBlockId: previousBlockId,
          indicatorTop: rect.top - pageRect.top
        }
      }
      if (pointerY <= lowerGap) {
        return {
          insertAfterBlockId: section.id,
          indicatorTop: rect.bottom - pageRect.top
        }
      }
      previousBlockId = section.id
    }

    const lastRect = sections.at(-1)?.getBoundingClientRect()
    return {
      insertAfterBlockId: previousBlockId,
      indicatorTop: lastRect ? lastRect.bottom - pageRect.top : pageRect.height - 40
    }
  }

  const getImageDropLayout = (pageElement: HTMLDivElement, event: ReactDragEvent<HTMLDivElement>): {
    insertAfterBlockId: string | null
    indicatorTop: number
    layout: NoteImageInsertLayout
  } => {
    const pageRect = pageElement.getBoundingClientRect()
    const insertTarget = getInsertAfterBlockTarget(pageElement, event.clientY)
    const normalizedX = pageRect.width > 0 ? (event.clientX - pageRect.left) / pageRect.width : 0.5
    const wrapStyle: NoteMediaWrapStyle =
      normalizedX < 0.34
        ? 'float-left'
        : normalizedX > 0.66
          ? 'float-right'
          : 'center'
    const displayWidth =
      wrapStyle === 'center'
        ? Math.min(520, Math.max(280, Math.round(pageRect.width * 0.68)))
        : Math.min(320, Math.max(180, Math.round(pageRect.width * 0.38)))

    return {
      insertAfterBlockId: insertTarget.insertAfterBlockId,
      indicatorTop: insertTarget.indicatorTop,
      layout: {
        displayWidth,
        wrapStyle
      }
    }
  }

  const handleNotePageDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!visiblePdfPath || !note) {
      return
    }

    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (
      target.closest('textarea, input, button, select, option, label, a, [contenteditable="true"]') ||
      target.closest('.note-page-kicker, .note-header, .note-meta')
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onBlockAdd(visiblePdfPath, note.id, 'paragraph', getInsertAfterBlockTarget(event.currentTarget, event.clientY).insertAfterBlockId)
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    if (!visiblePdfPath) {
      return
    }

    const hasClipboardImage = Array.from(event.clipboardData.items).some(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    )

    if (!hasClipboardImage) {
      return
    }

    event.preventDefault()
    void onReadPastedImages(event.clipboardData).then((images) => {
      if (images.length === 0) {
        return
      }

      onImagePaste(visiblePdfPath, note?.id ?? '', images, focusedNoteBlock?.id)
    })
  }

  const getDroppedImageFiles = (dataTransfer: DataTransfer): File[] => {
    const filesFromItems = Array.from(dataTransfer.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (filesFromItems.length > 0) {
      return filesFromItems
    }

    return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
  }

  const handleImageDragOver = (event: ReactDragEvent<HTMLDivElement>): boolean => {
    const files = getDroppedImageFiles(event.dataTransfer)
    if (files.length === 0) {
      return false
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    if (notePageRef.current) {
      const { insertAfterBlockId, indicatorTop, layout } = getImageDropLayout(notePageRef.current, event)
      const wrapStyle: NoteMediaWrapStyle = layout.wrapStyle ?? 'break'
      const firstFile = files[0]
      const sourceKey = `${firstFile.name}:${firstFile.size}:${firstFile.lastModified}`
      if (imageDropPreviewKeyRef.current !== sourceKey) {
        if (imageDropPreviewUrlRef.current) {
          URL.revokeObjectURL(imageDropPreviewUrlRef.current)
        }
        imageDropPreviewUrlRef.current = URL.createObjectURL(firstFile)
        imageDropPreviewKeyRef.current = sourceKey
      }
      setImageDropIndicator({
        insertAfterBlockId,
        top: indicatorTop,
        wrapStyle
      })
      imageDropTargetRef.current = {
        insertAfterBlockId,
        layout
      }
      setImageDropPreview({
        insertAfterBlockId,
        wrapStyle,
        sourceKey,
        sourceUrl: imageDropPreviewUrlRef.current ?? '',
        sourceName: firstFile.name,
        left: event.clientX + 18,
        top: event.clientY + 18
      })
    }
    return true
  }

  const handleImageDrop = (event: ReactDragEvent<HTMLDivElement>): boolean => {
    if (!visiblePdfPath || !note || !notePageRef.current) {
      return false
    }

    const blockDragRaw = event.dataTransfer.getData(noteBlockDragMimeType)
    if (blockDragRaw) {
      try {
        const payload = JSON.parse(blockDragRaw) as Partial<NoteBlockDragPayload>
        if (payload.filePath && payload.noteId && payload.blockId && payload.filePath === visiblePdfPath && payload.noteId === note.id) {
          event.preventDefault()
          event.stopPropagation()
          const { insertAfterBlockId } = getImageDropLayout(notePageRef.current, event)
          if (payload.blockId !== insertAfterBlockId && onBlockMove) {
            onBlockMove(payload.filePath, payload.noteId, payload.blockId, insertAfterBlockId)
          }
          setImageDropIndicator(null)
          setImageDropPreview(null)
          imageDropTargetRef.current = null
          return true
        }
      } catch {
        // fall through to normal image paste handling
      }
    }

    const files = getDroppedImageFiles(event.dataTransfer)
    if (files.length === 0) {
      return false
    }

    event.preventDefault()
    event.stopPropagation()
    const dropTarget =
      imageDropTargetRef.current ?? getImageDropLayout(notePageRef.current, event)
    const { insertAfterBlockId, layout } = dropTarget
    setImageDropIndicator(null)
    setImageDropPreview(null)
    imageDropTargetRef.current = null
    if (imageDropPreviewUrlRef.current) {
      URL.revokeObjectURL(imageDropPreviewUrlRef.current)
      imageDropPreviewUrlRef.current = null
      imageDropPreviewKeyRef.current = null
    }
    void Promise.all(files.map(readDroppedImageFile)).then((images) => {
      if (images.length === 0) {
        return
      }

      onImagePaste(visiblePdfPath, note.id, images, insertAfterBlockId, layout)
    })
    return true
  }

  const handleImageDragMove = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!imageDropPreview || !notePageRef.current) {
      return
    }

    const { insertAfterBlockId, indicatorTop, layout } = getImageDropLayout(notePageRef.current, event)
    const wrapStyle: NoteMediaWrapStyle = layout.wrapStyle ?? 'break'
    setImageDropIndicator({
      insertAfterBlockId,
      top: indicatorTop,
      wrapStyle
    })
    setImageDropPreview((current) =>
      current
        ? {
            ...current,
            insertAfterBlockId,
            wrapStyle,
            left: event.clientX + 18,
            top: event.clientY + 18
          }
        : current
    )
  }

  const handleMineruDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (handleImageDragOver(event)) {
      handleImageDragMove(event)
      return
    }

    setImageDropIndicator(null)
    setImageDropPreview(null)
    imageDropTargetRef.current = null

    if (!hasMineruBlockDragPayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleMineruDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (handleImageDrop(event)) {
      return
    }

    setImageDropIndicator(null)
    setImageDropPreview(null)
    imageDropTargetRef.current = null

    const payload = readMineruBlockDragPayload(event.dataTransfer)

    if (!payload) {
      return
    }

    const pageElement = notePageRef.current
    if (!pageElement) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const dropTarget = imageDropTargetRef.current ?? getImageDropLayout(pageElement, event)
    onMineruBlockDrop(payload, dropTarget.insertAfterBlockId)
  }

  const notePageScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = notePageScrollRef.current
    if (!element) {
      return
    }

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      const delta = event.deltaY || event.deltaX
      if (delta === 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setNotePageScale((current) => clampNotePageScale(current + (delta < 0 ? notePageScaleStep : -notePageScaleStep)))
    }

    const wheelOptions: AddEventListenerOptions = { passive: false }
    element.addEventListener('wheel', handleWheel, wheelOptions)
    return () => {
      element.removeEventListener('wheel', handleWheel, wheelOptions)
    }
  }, [])

  const notePageStyle: CSSProperties = {
    zoom: notePageScale
  }

  return (
    <div className="editor-content-cache">
      <div className="editor-mode-cache active">
        <div
          className="editor-surface note-surface"
          onPaste={handlePaste}
          onCopy={handleNoteCopy}
          onKeyDown={handleKeyDown}
          onDragLeave={() => {
            setImageDropIndicator(null)
            setImageDropPreview(null)
            imageDropTargetRef.current = null
          }}
          onDragOver={handleMineruDragOver}
          onDrop={handleMineruDrop}
        >
          {visiblePdfPath && note ? (
            <>
              <div className="note-panel-toolbar" aria-label="笔记编辑工具栏">
                <div className="note-panel-toolbar-group note-document-actions">
                  <FavoriteButton
                    active={isFavorite(favoriteItemsByKey, { type: 'note', paperPath: visiblePdfPath, noteId: note.id })}
                    label="笔记"
                    onClick={() =>
                      onFavoriteToggle(
                        { type: 'note', paperPath: visiblePdfPath, noteId: note.id },
                        note.title || `${getFileStem(visiblePdfPath)} Notes`
                      )
                    }
                  />
                  <button
                    className="note-toolbar-button"
                    type="button"
                    title="保存笔记"
                    aria-label="保存笔记"
                    disabled={!isDirty}
                    onClick={() => onSave(visiblePdfPath, note.id)}
                  >
                    <span className="codicon codicon-save" aria-hidden="true" />
                    <span>保存</span>
                  </button>
                  <button
                    className="note-toolbar-button"
                    type="button"
                    title="复制 Markdown"
                    aria-label="复制 Markdown"
                    onClick={() => onMarkdownCopy(visiblePdfPath, note.id)}
                  >
                    <span className="codicon codicon-copy" aria-hidden="true" />
                    <span>Markdown</span>
                  </button>
                  <button
                    className="note-toolbar-button"
                    type="button"
                    title="导出 Word"
                    aria-label="导出 Word"
                    onClick={() => onExportNote(visiblePdfPath, note.id, 'word')}
                  >
                    <span className="codicon codicon-file" aria-hidden="true" />
                    <span>Word</span>
                  </button>
                  <button
                    className="note-toolbar-button"
                    type="button"
                    title="导出 PDF"
                    aria-label="导出 PDF"
                    onClick={() => onExportNote(visiblePdfPath, note.id, 'pdf')}
                  >
                    <span className="codicon codicon-file-pdf" aria-hidden="true" />
                    <span>PDF</span>
                  </button>
                  {onSwitchToMilkdown ? (
                    <button
                      className="note-toolbar-button"
                      type="button"
                      title="切到 Markdown 笔记编辑器"
                      aria-label="切到 Markdown 笔记编辑器"
                      onClick={onSwitchToMilkdown}
                    >
                      <span className="codicon codicon-markdown" aria-hidden="true" />
                      <span>Markdown</span>
                    </button>
                  ) : null}
                </div>

                <div className="note-panel-toolbar-group note-format-toolbar" aria-label="笔记格式">
                  <select
                    className="note-format-select block-type"
                    aria-label="段落类型"
                    value={activeNoteBlock?.type ?? ''}
                    disabled={!activeNoteBlock}
                    onChange={(event) => updateActiveBlockType(event.target.value)}
                  >
                    <option value="" disabled>
                      段落
                    </option>
                    {noteBlockTypes.map((type) => (
                      <option key={type} value={type}>
                        {getNoteBlockLabel(type, noteBlockTypeOptions)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="note-format-select font-family"
                    aria-label="字体选择"
                    value={activeNoteBlockStyle.fontFamily ?? ''}
                    disabled={!activeNoteBlock}
                    onChange={(event) => updateActiveBlockStyle({ fontFamily: event.target.value || undefined })}
                  >
                    {noteFontFamilyOptions.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="note-format-select font-size"
                    aria-label="字体大小"
                    value={activeNoteBlockStyle.fontSize ? String(activeNoteBlockStyle.fontSize) : ''}
                    disabled={!activeNoteBlock}
                    onChange={(event) =>
                      updateActiveBlockStyle({
                        fontSize: event.target.value ? Number(event.target.value) : undefined
                      })
                    }
                  >
                    <option value="">字号</option>
                    {noteFontSizeOptions.map((fontSize) => (
                      <option key={fontSize} value={fontSize}>
                        {fontSize}
                      </option>
                    ))}
                  </select>
                  <button
                    className={activeNoteBlockStyle.bold ? 'note-format-button active' : 'note-format-button'}
                    type="button"
                    aria-label="加粗"
                    title="加粗"
                    disabled={!activeNoteBlock}
                    onClick={() => updateActiveBlockStyle({ bold: !activeNoteBlockStyle.bold })}
                  >
                    B
                  </button>
                  <button
                    className={activeNoteBlockStyle.italic ? 'note-format-button italic active' : 'note-format-button italic'}
                    type="button"
                    aria-label="倾斜"
                    title="倾斜"
                    disabled={!activeNoteBlock}
                    onClick={() => updateActiveBlockStyle({ italic: !activeNoteBlockStyle.italic })}
                  >
                    I
                  </button>
                  <button
                    className={activeNoteBlockStyle.underline ? 'note-format-button underline active' : 'note-format-button underline'}
                    type="button"
                    aria-label="下划线"
                    title="下划线"
                    disabled={!activeNoteBlock}
                    onClick={() => updateActiveBlockStyle({ underline: !activeNoteBlockStyle.underline })}
                  >
                    U
                  </button>
                  <select
                    className="note-format-select highlight"
                    aria-label="高亮颜色"
                    value={activeNoteBlockStyle.highlight ?? ''}
                    disabled={!activeNoteBlock}
                    onChange={(event) => updateActiveBlockStyle({ highlight: event.target.value || undefined })}
                  >
                    {noteHighlightOptions.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className={activeNoteBlockStyle.listStyle === 'bullet' ? 'note-format-button active' : 'note-format-button'}
                    type="button"
                    aria-label="分点"
                    title="分点"
                    disabled={!activeNoteBlock || !activeNoteBlockCanUseBulletList}
                    onClick={() =>
                      updateActiveBlockStyle({
                        listStyle: activeNoteBlockStyle.listStyle === 'bullet' ? undefined : 'bullet'
                      })
                    }
                  >
                    <span className="codicon codicon-list-unordered" aria-hidden="true" />
                  </button>
                </div>

                <div className="note-panel-toolbar-group note-insert-toolbar" aria-label="插入笔记内容">
                  {noteInsertBlockTypeOptions.map((option) => (
                    <button
                      key={option.id}
                      className="note-toolbar-button"
                      type="button"
                      title={`插入${option.title}`}
                      aria-label={`插入${option.title}`}
                      onClick={() => {
                        onBlockAdd(visiblePdfPath, note.id, option.id)
                      }}
                    >
                      <span className={`codicon ${option.icon}`} aria-hidden="true" />
                      <span>{option.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="note-editor-layout">
                <div ref={notePageScrollRef} className="note-page-scroll">
                <div
                  ref={notePageRef}
                  className="note-page"
                  style={notePageStyle}
                  onDoubleClick={handleNotePageDoubleClick}
                  onPointerMove={handleNotePagePointerMove}
                >
                  <div className="note-page-kicker">
                    <span className="codicon codicon-file-pdf" aria-hidden="true" />
                    <span>{getFileName(visiblePdfPath)}</span>
                  </div>
                  <div className="note-header">
                    <input
                      className="note-title-input"
                      aria-label="笔记标题"
                      value={noteTitleDraft}
                      spellCheck={false}
                      onChange={(event) => {
                        const nextTitle = event.target.value
                        setNoteTitleDraft(nextTitle)
                        startTransition(() => onTitleChange(visiblePdfPath, note.id, nextTitle))
                      }}
                    />
                  </div>
                  <div className="note-meta">
                    <span>{note.blocks.length} 段</span>
                    <span>{countNoteTextCharacters(note)} 字</span>
                    <span>{formatUpdatedAt(note.updatedAt)}</span>
                    <span>{isDirty ? '未保存修改' : '已保存'}</span>
                  </div>
                  <div className="note-markdown-body">
                    {imageDropPreview ? (
                      <div
                        className={`note-image-drop-preview wrap-${imageDropPreview.wrapStyle}`}
                        style={{ left: `${imageDropPreview.left}px`, top: `${imageDropPreview.top}px` }}
                        aria-hidden="true"
                      >
                        <img src={imageDropPreview.sourceUrl} alt={imageDropPreview.sourceName} />
                        <span className="note-image-drop-preview-badge">
                          {imageDropPreview.wrapStyle === 'float-left'
                            ? '左绕'
                            : imageDropPreview.wrapStyle === 'float-right'
                              ? '右绕'
                              : imageDropPreview.wrapStyle === 'center'
                                ? '居中'
                                : '独占'}
                        </span>
                      </div>
                    ) : null}
                    {imageDropIndicator ? (
                      <div
                        className={`note-image-drop-indicator wrap-${imageDropIndicator.wrapStyle}`}
                        style={{ top: `${imageDropIndicator.top}px` }}
                        aria-hidden="true"
                      >
                        <span className="note-image-drop-indicator-line" />
                        <span className="note-image-drop-indicator-label">
                          {imageDropIndicator.insertAfterBlockId ? '插入到此处' : '插入到开头'}
                        </span>
                      </div>
                    ) : null}
                    {note.blocks.length > 0 ? (
                      note.blocks.map((block, index) => {
                        const previousBlock = note.blocks[index - 1]
                        const nextBlock = note.blocks[index + 1]

                        return (
                          <NoteMarkdownSection
                            key={block.id}
                            filePath={visiblePdfPath}
                            noteId={note.id}
                            block={block}
                            previousBlockId={previousBlock?.id}
                            previousBlockText={previousBlock ? getNoteBlockText(previousBlock) : ''}
                            nextBlockId={nextBlock?.id}
                            isActive={block.id === activeNoteBlock?.id}
                            isSourceJumpModifierHeld={isSourceJumpModifierHeld}
                            onTextChange={onBlockTextChange}
                            onMediaChange={onBlockMediaChange}
                            onBlockDelete={onBlockDelete}
                            onBlockAdd={onBlockAdd}
                            onBlockMove={onBlockMove}
                            onTodoChange={onTodoChange}
                            onSourceJump={onSourceJump}
                            onFocus={onFocusBlock}
                            onSelectionStart={handleBlockSelectionStart}
                            onSelectionChange={handleBlockSelectionChange}
                            onSelectionEnd={handleBlockSelectionEnd}
                            onNavigateBlock={handleBlockNavigate}
                            selectionRange={
                              crossBlockSelection && crossBlockSelection.noteId === note.id
                                ? getCrossBlockSelectionRanges(note.blocks, crossBlockSelection)[block.id]
                                : undefined
                            }
                          />
                        )
                      })
                    ) : (
                      <div className="note-empty-markdown">
                        <span className="codicon codicon-edit" aria-hidden="true" />
                        <span>空白笔记</span>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            </>
          ) : visiblePdfPath && isTemplatePending ? (
            <div ref={notePageScrollRef} className="note-page-scroll">
              <NoteTemplateChooser
                filePath={visiblePdfPath}
                isCreatingScreenshotNote={isCreatingScreenshotNote}
                onTextTemplateCreate={onTextTemplateCreate}
                onFreeformTemplateCreate={onFreeformTemplateCreate}
                onScreenshotTemplateCreate={onScreenshotTemplateCreate}
              />
            </div>
          ) : visiblePdfPath ? (
            <div ref={notePageScrollRef} className="note-page-scroll">
              <div className="pdf-placeholder">
                <span className="codicon codicon-notebook" aria-hidden="true" />
                <h1>{notes.length > 0 ? '当前没有打开的笔记标签' : '当前 PDF 还没有笔记'}</h1>
                <p>{notes.length > 0 ? '可以从左侧 Notes 列表重新打开已有笔记，或直接新建一篇。' : '先为当前 PDF 新建一篇笔记，再开始整理内容。'}</p>
                <button className="primary-button compact" type="button" onClick={onTextTemplateCreate.bind(null, visiblePdfPath)}>
                  新建笔记
                </button>
              </div>
            </div>
          ) : (
            <div ref={notePageScrollRef} className="note-page-scroll">
              <div className="pdf-placeholder">
                <span className="codicon codicon-notebook" aria-hidden="true" />
                <h1>未选择笔记</h1>
                <p>先导入或打开一篇 PDF，再从侧边栏或 View 菜单打开对应笔记。</p>
                <button className="primary-button compact" type="button" onClick={onOpenPdf}>
                  导入 PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function NoteTemplateChooser({
  filePath,
  isCreatingScreenshotNote,
  onTextTemplateCreate,
  onFreeformTemplateCreate,
  onScreenshotTemplateCreate
}: {
  filePath: string
  isCreatingScreenshotNote: boolean
  onTextTemplateCreate: (filePath: string) => void
  onFreeformTemplateCreate: (filePath: string) => void
  onScreenshotTemplateCreate: (filePath: string) => void
}): ReactElement {
  return (
    <div className="note-template-page">
      <div className="note-template-heading">
        <span className="codicon codicon-notebook" aria-hidden="true" />
        <div>
          <h1>选择笔记创建方式</h1>
          <p>{getFileName(filePath)}</p>
        </div>
      </div>
      <div className="note-template-grid">
        {noteTemplateDefinitions.map((template) => {
          const isScreenshotTemplate = template.kind === 'pdf_segment_screenshots'
          const isFreeformTemplate = template.kind === 'freeform'
          const isDisabled = isScreenshotTemplate && isCreatingScreenshotNote
          const handleClick = isScreenshotTemplate
            ? () => onScreenshotTemplateCreate(filePath)
            : isFreeformTemplate
              ? () => onFreeformTemplateCreate(filePath)
              : () => onTextTemplateCreate(filePath)

          return (
            <button
              key={template.kind}
              className="note-template-card"
              type="button"
              disabled={isDisabled}
              onClick={handleClick}
            >
              <span
                className={isDisabled ? 'codicon codicon-loading codicon-modifier-spin' : `codicon ${template.icon}`}
                aria-hidden="true"
              />
              <strong>{template.title}</strong>
              <small>{template.description}</small>
            </button>
          )
        })}
      </div>
      <p className="note-template-hint">截图模板当前按页面纵向分段生成，先处理前 6 页以避免卡顿，后续可以继续升级为按论文段落自动识别和全文后台生成。</p>
    </div>
  )
}

function NoteImageInspector({
  block,
  onDelete,
  onChange
}: {
  block: NoteBlock
  onDelete: () => void
  onChange: (contentPatch: Partial<MediaNoteBlockContent>) => void
}): ReactElement | null {
  if (!isMediaContent(block.content)) {
    return null
  }

  const content = block.content
  const wrapStyle = content.wrapStyle ?? 'break'
  const displayWidth = getMediaDisplayWidth(content)
  const crop = normalizeMediaCrop(content.crop)

  const updateCrop = (nextCrop: NoteMediaCrop | undefined): void => {
    onChange({
      crop: nextCrop
    })
  }

  return (
    <div className="note-image-inline-tools" aria-label="图片编辑">
      <div className="note-image-mini-toolbar">
        {[
          ['break', '独占'],
          ['center', '居中'],
          ['float-left', '左绕'],
          ['float-right', '右绕']
        ].map(([value, label]) => (
          <button
            key={value}
            className={wrapStyle === value ? 'note-image-mini-button active' : 'note-image-mini-button'}
            type="button"
            onClick={() => onChange({ wrapStyle: value as NoteMediaWrapStyle })}
            title={label}
            aria-label={label}
          >
            {label}
          </button>
        ))}
        <button className="note-image-mini-button" type="button" onClick={() => updateCrop(undefined)} title="重置裁剪" aria-label="重置裁剪">
          重置
        </button>
        <button className="note-image-mini-button danger" type="button" onClick={onDelete} title="删除图片" aria-label="删除图片">
          删除
        </button>
      </div>
      <div className="note-image-mini-meta">{Math.round(displayWidth)} px</div>
    </div>
  )
}

type NoteMarkdownSectionProps = {
  filePath: string
  noteId: string
  block: NoteBlock
  previousBlockId?: string
  previousBlockText?: string
  nextBlockId?: string
  isActive?: boolean
  isSourceJumpModifierHeld?: boolean
  onTextChange: (filePath: string, noteId: string, blockId: string, text: string) => void
  onBlockAdd: (filePath: string, noteId: string, type: NoteBlockType, insertAfterBlockId?: string | null) => string
  onMediaChange: (filePath: string, noteId: string, blockId: string, contentPatch: Partial<MediaNoteBlockContent>) => void
  onBlockDelete: (filePath: string, noteId: string, blockId: string) => void
  onBlockMove?: (filePath: string, noteId: string, blockId: string, insertAfterBlockId?: string | null) => void
  onTodoChange: (filePath: string, noteId: string, blockId: string, checked: boolean) => void
  onSourceJump: (filePath: string, noteId: string, blockId: string) => void
  onFocus: (blockId: string) => void
  onSelectionStart: (blockId: string, offset: number) => void
  onSelectionChange: (blockId: string, offset: number) => void
  onSelectionEnd: () => void
  onNavigateBlock: (blockId: string, direction: 'previous' | 'next') => void
  selectionRange?: TextSelectionRange
}

const NoteMarkdownSection = memo(NoteMarkdownSectionImpl, areNoteMarkdownSectionPropsEqual)

function NoteMarkdownSectionImpl({
  filePath,
  noteId,
  block,
  previousBlockId,
  previousBlockText,
  nextBlockId,
  isActive = false,
  isSourceJumpModifierHeld = false,
  onTextChange,
  onMediaChange,
  onBlockDelete,
  onBlockMove,
  onBlockAdd,
  onTodoChange,
  onSourceJump,
  onFocus,
  onSelectionStart,
  onSelectionChange,
  onSelectionEnd,
  onNavigateBlock,
  selectionRange
}: NoteMarkdownSectionProps): ReactElement {
  const text = getNoteBlockText(block)
  const [draftText, setDraftText] = useState(text)
  const resizeStateRef = useRef<NoteMediaResizeState | null>(null)
  const listMarker = getNoteListMarker(block)
  const isListBlock = Boolean(listMarker)
  const hasImage = isMediaNoteBlock(block) && getMediaBlockSrc(block)
  const mediaContent = hasImage && isMediaContent(block.content) ? block.content : undefined
  const sourceRefs = block.sourceRefs.filter(
    (currentSourceRef): currentSourceRef is NonNullable<typeof block.sourceRefs[number]> & { rect: NonNullable<NonNullable<typeof block.sourceRefs[number]>['rect']> } =>
      currentSourceRef.type === 'note_block' && Boolean(currentSourceRef.rect)
  )
  const sourceRef = sourceRefs.find((currentSourceRef) => currentSourceRef.sourceLinkStatus !== 'invalidated')
  const hasPdfSource = sourceRefs.length > 0
  const canJumpToSource = Boolean(sourceRef)
  const isSourceLinked = hasPdfSource && canJumpToSource
  const editorStyle = getSourceLinkedEditorStyle(block, getNoteBlockEditorStyle(block), isSourceLinked)
  const sectionClassName = [
    'note-markdown-section',
    `note-markdown-${block.type}`,
    isListBlock ? 'note-markdown-bullet' : '',
    isSourceLinked ? 'note-markdown-source-linked' : '',
    selectionRange ? 'cross-block-selected' : '',
    isActive ? 'active' : ''
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    setDraftText(text)
  }, [block.id, text])

  const handleBlockKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    const selectionStart = event.currentTarget.selectionStart ?? 0
    const selectionEnd = event.currentTarget.selectionEnd ?? 0

    if (event.key === 'Backspace' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (selectionStart !== 0 || selectionEnd !== 0) {
        return
      }

      const isCurrentTextEmpty = draftText.trim().length === 0
      const isCurrentBlockRemovable = true
      const isPreviousBlockEmpty = previousBlockText?.trim().length === 0
      const blockIdToRemove = isCurrentTextEmpty && isCurrentBlockRemovable
        ? block.id
        : previousBlockId && isPreviousBlockEmpty
          ? previousBlockId
          : ''

      if (!blockIdToRemove) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      onBlockDelete(filePath, noteId, blockIdToRemove)

      if (blockIdToRemove !== block.id) {
        return
      }

      const fallbackBlockId = previousBlockId ?? nextBlockId ?? ''
      if (!fallbackBlockId) {
        return
      }

      onFocus(fallbackBlockId)
      window.setTimeout(() => {
        const element = document.getElementById(fallbackBlockId)
        const editor = element?.querySelector<HTMLTextAreaElement>('textarea[data-note-block-editor="true"]')
        if (editor) {
          editor.focus({ preventScroll: true })
          const caretPosition = editor.value.length
          editor.setSelectionRange(caretPosition, caretPosition)
          return
        }

        const titleInput = document.querySelector<HTMLInputElement>('.note-title-input')
        titleInput?.focus({ preventScroll: true })
      }, 0)
      return
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const textLength = draftText.length
      if (isSourceLinked && selectionStart === textLength && selectionEnd === textLength) {
        event.preventDefault()
        event.stopPropagation()
        onBlockAdd(filePath, noteId, 'paragraph', block.id)
        return
      }
    }

    if (event.key === 'ArrowUp' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const lineStart = getLineStartOffset(draftText, selectionStart)
      if (selectionStart === lineStart && selectionEnd === lineStart) {
        event.preventDefault()
        event.stopPropagation()
        onNavigateBlock(block.id, 'previous')
        return
      }
    }

    if (event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const lineEnd = getLineEndOffset(draftText, selectionEnd)
      if (selectionStart === lineEnd && selectionEnd === lineEnd) {
        event.preventDefault()
        event.stopPropagation()
        onNavigateBlock(block.id, 'next')
      }
    }
  }

  const updateText = (nextText: string): void => {
    setDraftText(nextText)
    startTransition(() => onTextChange(filePath, noteId, block.id, nextText))
  }
  const jumpToSource = (): void => {
    if (isSourceLinked) {
      onSourceJump(filePath, noteId, block.id)
    }
  }

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLElement>): void => {
    onFocus(block.id)
  }

  const startImageBlockDrag = (event: ReactDragEvent<HTMLElement>): void => {
    if (!filePath || !hasImage) {
      return
    }

    const payload: NoteBlockDragPayload = {
      filePath,
      noteId,
      blockId: block.id
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(noteBlockDragMimeType, JSON.stringify(payload))
    event.dataTransfer.setData('text/plain', block.id)
  }

  const startImageResize = (event: ReactPointerEvent<HTMLButtonElement>, handle: NoteMediaResizeHandle): void => {
    if (!mediaContent) {
      return
    }

    const currentWidth = getMediaDisplayWidth(mediaContent)
    const currentHeight = getMediaDisplayHeight(mediaContent)
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      aspectRatio: currentWidth / Math.max(currentHeight, 1),
      handle
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  const updateImageResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const resizeState = resizeStateRef.current
    if (!resizeState || resizeState.pointerId !== event.pointerId || !mediaContent) {
      return
    }

    const deltaX = event.clientX - resizeState.startX
    const deltaY = event.clientY - resizeState.startY
    const direction = getResizeHandleDirection(resizeState.handle)
    const directionMultiplier = mediaContent.wrapStyle === 'float-left' ? -1 : 1
    const horizontalDelta = direction.x === 0 ? 0 : deltaX * direction.x * directionMultiplier
    const verticalDelta = direction.y === 0 ? 0 : deltaY * direction.y
    const projectedDelta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta
    const nextWidth = clampNumber(resizeState.startWidth + projectedDelta, 120, 640)
    onMediaChange(filePath, noteId, block.id, {
      displayWidth: Math.round(nextWidth),
      displayHeight: Math.round(nextWidth / Math.max(resizeState.aspectRatio, 0.1))
    })
    event.preventDefault()
  }

  const finishImageResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStateRef.current = null
  }
  const renderEditor = (input: {
    className: string
    ariaLabel: string
    style?: CSSProperties
  }): ReactElement => {
    if (!isSourceLinked) {
      return (
        <AutoResizeTextarea
          noteId={noteId}
          blockId={block.id}
          className={input.className}
          ariaLabel={input.ariaLabel}
          value={draftText}
          style={input.style ?? editorStyle}
          isBlockEditor
          selectionRange={selectionRange}
          onFocus={() => onFocus(block.id)}
          onKeyDown={handleBlockKeyDown}
          onChange={updateText}
          onSelectionStart={onSelectionStart}
          onSelectionChange={onSelectionChange}
          onSelectionEnd={onSelectionEnd}
        />
      )
    }

    return (
      <SourceLinkedTextarea
        noteId={noteId}
        blockId={block.id}
        className={input.className}
        ariaLabel={input.ariaLabel}
        value={draftText}
        style={input.style ?? editorStyle}
        canJumpToSource={canJumpToSource}
        isSourceJumpModifierHeld={isSourceJumpModifierHeld}
        selectionRange={selectionRange}
        onFocus={() => onFocus(block.id)}
        onKeyDown={handleBlockKeyDown}
        onChange={updateText}
        onSourceJump={jumpToSource}
        onSelectionStart={onSelectionStart}
        onSelectionChange={onSelectionChange}
        onSelectionEnd={onSelectionEnd}
      />
    )
  }

  return (
    <section
      id={block.id}
      className={sectionClassName}
      onPointerDownCapture={handlePointerDownCapture}
    >
      {hasImage ? (
        <figure
          className={getMediaFigureClassName(block, isActive)}
          style={mediaContent ? getMediaFigureStyle(mediaContent) : undefined}
        >
          <div className="note-image-frame" style={mediaContent ? getMediaCropFrameStyle(mediaContent) : undefined}>
            <img
              src={getMediaBlockSrc(block)}
              alt={getMediaBlockAlt(block)}
              style={mediaContent ? getMediaImageStyle(mediaContent) : undefined}
              draggable={false}
            />
            {noteMediaResizeHandles.map((handle) => (
              <button
                key={handle}
                className={`note-image-resize-handle handle-${handle}`}
                type="button"
                aria-label={`拖拽缩放图片：${getResizeHandleLabel(handle)}`}
                title={`拖拽缩放图片：${getResizeHandleLabel(handle)}`}
                onPointerDown={(event) => startImageResize(event, handle)}
                onPointerMove={updateImageResize}
                onPointerUp={finishImageResize}
                onPointerCancel={finishImageResize}
              />
            ))}
            {isActive ? (
              <NoteImageInspector
                block={block}
                onDelete={() => onBlockDelete(filePath, noteId, block.id)}
                onChange={(contentPatch) => onMediaChange(filePath, noteId, block.id, contentPatch)}
              />
            ) : null}
            {hasImage ? (
              <button
                className="note-image-drag-handle"
                type="button"
                draggable
                onDragStart={startImageBlockDrag}
                aria-label="拖动图片改变位置"
                title="拖动图片改变位置"
              >
                <span className="codicon codicon-grabber" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {renderEditor({
            className: 'note-markdown-caption',
            ariaLabel: '图片说明'
          })}
        </figure>
      ) : block.type === 'todo' ? (
        <label className="note-markdown-todo">
          <input
            type="checkbox"
            checked={isTodoBlockChecked(block)}
            onChange={(event) => onTodoChange(filePath, noteId, block.id, event.target.checked)}
          />
          {renderEditor({
            className: 'note-markdown-text',
            ariaLabel: '待办内容'
          })}
        </label>
      ) : block.type === 'heading' ? (
        renderEditor({
          className: 'note-markdown-heading',
          ariaLabel: '鏍囬鍐呭'
        })
      ) : block.type === 'formula' ? (
        <div className="note-markdown-formula">
          <FormulaPreview latex={draftText} />
          {renderEditor({
            className: 'note-markdown-code',
            ariaLabel: '鍏紡鍐呭'
          })}
        </div>
      ) : block.type === 'table' ? (
        renderEditor({
          className: 'note-markdown-table',
          ariaLabel: '琛ㄦ牸鍐呭'
        })
      ) : (
        <div className={isListBlock ? 'note-markdown-bullet-row' : undefined}>
          {isListBlock ? <span className="note-markdown-bullet-marker" aria-hidden="true">{listMarker}</span> : null}
          {renderEditor({
            className: 'note-markdown-text',
            ariaLabel: `${getNoteBlockLabel(block.type, noteBlockTypeOptions)}鍐呭`
          })}
        </div>
      )}
    </section>
  )
}

function areNoteMarkdownSectionPropsEqual(previousProps: NoteMarkdownSectionProps, nextProps: NoteMarkdownSectionProps): boolean {
  return (
    previousProps.filePath === nextProps.filePath &&
    previousProps.noteId === nextProps.noteId &&
    previousProps.block === nextProps.block &&
    previousProps.previousBlockId === nextProps.previousBlockId &&
    previousProps.previousBlockText === nextProps.previousBlockText &&
    previousProps.nextBlockId === nextProps.nextBlockId &&
    previousProps.isActive === nextProps.isActive &&
    previousProps.isSourceJumpModifierHeld === nextProps.isSourceJumpModifierHeld &&
    previousProps.selectionRange?.start === nextProps.selectionRange?.start &&
    previousProps.selectionRange?.end === nextProps.selectionRange?.end &&
    previousProps.onMediaChange === nextProps.onMediaChange
  )
}

function getSourceLinkedEditorStyle(block: NoteBlock, editorStyle: CSSProperties, isSourceLinked: boolean): CSSProperties {
  if (!isSourceLinked) {
    return editorStyle
  }

  const highlight = block.style?.highlight ?? '#dff1ff'
  return {
    ...editorStyle,
    backgroundColor: highlight,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${highlight}, transparent 62%)`
  }
}

function isMediaNoteBlock(block: NoteBlock): boolean {
  return block.type === 'image' || block.type === 'screenshot'
}

function isMediaContent(content: NoteBlock['content']): content is MediaNoteBlockContent {
  return 'caption' in content || 'src' in content || 'assetId' in content
}

function getMediaDisplayWidth(content: MediaNoteBlockContent): number {
  return clampNumber(content.displayWidth ?? content.width ?? 360, 120, 640)
}

function getMediaDisplayHeight(content: MediaNoteBlockContent): number {
  const aspectRatio = getMediaAspectRatio(content)
  return clampNumber(content.displayHeight ?? Math.round(getMediaDisplayWidth(content) / Math.max(aspectRatio, 0.1)), 80, 900)
}

function getMediaAspectRatio(content: MediaNoteBlockContent): number {
  if (content.width && content.height) {
    return content.width / Math.max(content.height, 1)
  }

  if (content.displayWidth && content.displayHeight) {
    return content.displayWidth / Math.max(content.displayHeight, 1)
  }

  return 4 / 3
}

function normalizeMediaCrop(crop?: NoteMediaCrop): NoteMediaCrop {
  if (!crop) {
    return {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    }
  }

  const width = clampNumber(crop.width, 0.05, 1)
  const height = clampNumber(crop.height, 0.05, 1)

  return {
    x: clampNumber(crop.x, 0, 1 - width),
    y: clampNumber(crop.y, 0, 1 - height),
    width,
    height
  }
}

function getMediaFigureClassName(block: NoteBlock, isActive: boolean): string {
  const content = isMediaContent(block.content) ? block.content : undefined
  const wrapStyle = content?.wrapStyle ?? 'break'

  return [
    'note-markdown-figure',
    `wrap-${wrapStyle}`,
    isActive ? 'selected' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

function getMediaFigureStyle(content: MediaNoteBlockContent): CSSProperties {
  const width = getMediaDisplayWidth(content)
  const wrapStyle = content.wrapStyle ?? 'break'
  const style: CSSProperties = {
    width: `${width}px`
  }

  if (wrapStyle === 'float-left') {
    style.float = 'left'
    style.marginRight = '18px'
    style.marginBottom = '10px'
  } else if (wrapStyle === 'float-right') {
    style.float = 'right'
    style.marginLeft = '18px'
    style.marginBottom = '10px'
  }

  return style
}

function getMediaCropFrameStyle(content: MediaNoteBlockContent): CSSProperties {
  const width = getMediaDisplayWidth(content)
  const height = getMediaDisplayHeight(content)

  return {
    width: `${width}px`,
    height: `${height}px`
  }
}

function getMediaImageStyle(content: MediaNoteBlockContent): CSSProperties {
  const width = getMediaDisplayWidth(content)
  const height = getMediaDisplayHeight(content)
  const crop = normalizeMediaCrop(content.crop)

  return {
    width: `${Math.round(width / crop.width)}px`,
    height: `${Math.round(height / crop.height)}px`,
    transform: `translate(${-crop.x * 100}%, ${-crop.y * 100}%)`
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getResizeHandleDirection(handle: NoteMediaResizeHandle): { x: number; y: number } {
  switch (handle) {
    case 'top-left':
      return { x: -1, y: -1 }
    case 'top':
      return { x: 0, y: -1 }
    case 'top-right':
      return { x: 1, y: -1 }
    case 'right':
      return { x: 1, y: 0 }
    case 'bottom-right':
      return { x: 1, y: 1 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'bottom-left':
      return { x: -1, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
  }
}

function getResizeHandleLabel(handle: NoteMediaResizeHandle): string {
  switch (handle) {
    case 'top-left':
      return '左上'
    case 'top':
      return '上'
    case 'top-right':
      return '右上'
    case 'right':
      return '右'
    case 'bottom-right':
      return '右下'
    case 'bottom':
      return '下'
    case 'bottom-left':
      return '左下'
    case 'left':
      return '左'
  }
}

function SourceLinkedTextarea({
  noteId,
  blockId,
  className,
  ariaLabel,
  value,
  style,
  canJumpToSource,
  isSourceJumpModifierHeld,
  selectionRange,
  onFocus,
  onKeyDown,
  onChange,
  onSourceJump,
  onSelectionStart,
  onSelectionChange,
  onSelectionEnd
}: {
  noteId: string
  blockId: string
  className: string
  ariaLabel: string
  value: string
  style?: CSSProperties
  canJumpToSource: boolean
  isSourceJumpModifierHeld: boolean
  selectionRange?: TextSelectionRange
  onFocus: () => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onChange: (value: string) => void
  onSourceJump: () => void
  onSelectionStart: (blockId: string, offset: number) => void
  onSelectionChange: (blockId: string, offset: number) => void
  onSelectionEnd: () => void
}): ReactElement {
  const containerClassName = [
    'note-inline-source-editor',
    isSourceJumpModifierHeld ? 'source-jump-modifier' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={containerClassName}>
      <AutoResizeTextarea
        noteId={noteId}
        blockId={blockId}
        className={`${className} note-inline-source-input`}
        ariaLabel={ariaLabel}
        value={value}
        style={style}
        isBlockEditor
        selectionRange={selectionRange}
        onFocus={onFocus}
        onPointerDown={(event) => {
          if (!canJumpToSource || event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          onSourceJump()
        }}
        onKeyDown={onKeyDown}
        onChange={onChange}
        onSelectionStart={onSelectionStart}
        onSelectionChange={onSelectionChange}
        onSelectionEnd={onSelectionEnd}
      />
    </div>
  )
}

function getCrossBlockSelectionRanges(
  blocks: NoteBlock[],
  selection: NoteCrossBlockSelection
): Record<string, TextSelectionRange> {
  const anchorIndex = blocks.findIndex((block) => block.id === selection.anchorBlockId)
  const focusIndex = blocks.findIndex((block) => block.id === selection.focusBlockId)

  if (anchorIndex < 0 || focusIndex < 0 || anchorIndex === focusIndex) {
    return {}
  }

  const startIndex = Math.min(anchorIndex, focusIndex)
  const endIndex = Math.max(anchorIndex, focusIndex)
  const ranges: Record<string, TextSelectionRange> = {}

  for (let index = startIndex; index <= endIndex; index += 1) {
    const block = blocks[index]
    const textLength = getNoteBlockText(block).length
    const isAnchor = index === anchorIndex
    const isFocus = index === focusIndex
    const start =
      isAnchor && anchorIndex < focusIndex
        ? selection.anchorOffset
        : isFocus && focusIndex < anchorIndex
          ? selection.focusOffset
          : 0
    const end =
      isFocus && focusIndex > anchorIndex
        ? selection.focusOffset
        : isAnchor && anchorIndex > focusIndex
          ? selection.anchorOffset
          : textLength
    const normalizedStart = Math.min(Math.max(0, start), textLength)
    const normalizedEnd = Math.min(Math.max(0, end), textLength)

    if (normalizedStart === normalizedEnd) {
      continue
    }

    ranges[block.id] = {
      start: Math.min(normalizedStart, normalizedEnd),
      end: Math.max(normalizedStart, normalizedEnd)
    }
  }

  return ranges
}

function getLineStartOffset(value: string, offset: number): number {
  const newlineIndex = value.lastIndexOf('\n', Math.max(0, offset - 1))
  return newlineIndex < 0 ? 0 : newlineIndex + 1
}

function getLineEndOffset(value: string, offset: number): number {
  const newlineIndex = value.indexOf('\n', offset)
  return newlineIndex < 0 ? value.length : newlineIndex
}

function getTextareaSelectionFocusOffset(textarea: HTMLTextAreaElement): number {
  const direction = textarea.selectionDirection
  return direction === 'backward' ? textarea.selectionStart : textarea.selectionEnd
}

function findNoteBlockEditorFromPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number
): HTMLTextAreaElement | null {
  const editors = Array.from(container.querySelectorAll<HTMLTextAreaElement>('textarea[data-note-block-editor="true"][data-note-block-id]'))
  if (editors.length === 0) {
    return null
  }

  const hoveredEditor = editors.find((editor) => {
    const rect = editor.getBoundingClientRect()
    return clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right
  })
  if (hoveredEditor) {
    return hoveredEditor
  }

  return editors.reduce<{ editor: HTMLTextAreaElement | null; distance: number }>(
    (closest, editor) => {
      const rect = editor.getBoundingClientRect()
      const distance =
        clientY < rect.top
          ? rect.top - clientY
          : clientY > rect.bottom
            ? clientY - rect.bottom
            : 0

      return distance < closest.distance ? { editor, distance } : closest
    },
    { editor: null, distance: Number.POSITIVE_INFINITY }
  ).editor
}

function getTextareaOffsetFromPoint(textarea: HTMLTextAreaElement, clientX: number, clientY: number): number {
  const value = textarea.value
  if (!value) {
    return 0
  }

  const rect = textarea.getBoundingClientRect()
  if (clientY <= rect.top) {
    return 0
  }

  if (clientY >= rect.bottom) {
    return value.length
  }

  const mirror = createTextareaMirror(textarea, rect)
  document.body.appendChild(mirror)

  try {
    let low = 0
    let high = value.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      const point = getMirrorCaretPoint(mirror, value, middle)
      if (isMirrorCaretBeforePoint(point, clientX, clientY)) {
        low = middle
      } else {
        high = middle - 1
      }
    }

    let closestOffset = low
    let closestDistance = Number.POSITIVE_INFINITY
    for (let offset = Math.max(0, low - 3); offset <= Math.min(value.length, low + 3); offset += 1) {
      const point = getMirrorCaretPoint(mirror, value, offset)
      const distance = getMirrorCaretDistance(point, clientX, clientY)
      if (distance < closestDistance) {
        closestOffset = offset
        closestDistance = distance
      }
    }

    return closestOffset
  } finally {
    mirror.remove()
  }
}

function createTextareaMirror(textarea: HTMLTextAreaElement, rect: DOMRect): HTMLDivElement {
  const computed = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')

  mirror.style.position = 'fixed'
  mirror.style.left = `${rect.left}px`
  mirror.style.top = `${rect.top}px`
  mirror.style.width = `${rect.width}px`
  mirror.style.minHeight = `${rect.height}px`
  mirror.style.boxSizing = computed.boxSizing
  mirror.style.padding = computed.padding
  mirror.style.border = computed.border
  mirror.style.font = computed.font
  mirror.style.lineHeight = computed.lineHeight
  mirror.style.letterSpacing = computed.letterSpacing
  mirror.style.textAlign = computed.textAlign
  mirror.style.textTransform = computed.textTransform
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = computed.overflowWrap || 'anywhere'
  mirror.style.wordBreak = computed.wordBreak
  mirror.style.tabSize = computed.tabSize
  mirror.style.opacity = '0'
  mirror.style.pointerEvents = 'none'
  mirror.style.zIndex = '-1'

  return mirror
}

function getMirrorCaretPoint(
  mirror: HTMLDivElement,
  value: string,
  offset: number
): { x: number; y: number; lineHeight: number } {
  const computedLineHeight = parseFloat(window.getComputedStyle(mirror).lineHeight)
  const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 18
  const marker = document.createElement('span')

  marker.textContent = '\u200b'
  marker.style.display = 'inline-block'
  marker.style.width = '0'
  marker.style.height = `${lineHeight}px`
  marker.style.padding = '0'
  marker.style.margin = '0'
  marker.style.overflow = 'hidden'
  mirror.replaceChildren(
    document.createTextNode(value.slice(0, offset)),
    marker,
    document.createTextNode(value.slice(offset) || '\u200b')
  )

  const rect = marker.getBoundingClientRect()
  return {
    x: rect.left,
    y: rect.top + rect.height / 2,
    lineHeight
  }
}

function isMirrorCaretBeforePoint(
  point: { x: number; y: number; lineHeight: number },
  clientX: number,
  clientY: number
): boolean {
  const lineTolerance = Math.max(4, point.lineHeight / 2)
  if (point.y < clientY - lineTolerance) {
    return true
  }

  if (point.y > clientY + lineTolerance) {
    return false
  }

  return point.x <= clientX
}

function getMirrorCaretDistance(
  point: { x: number; y: number; lineHeight: number },
  clientX: number,
  clientY: number
): number {
  const verticalDistance = Math.abs(point.y - clientY)
  const horizontalDistance = verticalDistance <= point.lineHeight / 2 ? Math.abs(point.x - clientX) : 0
  return verticalDistance * 20 + horizontalDistance
}

function getTextareaSelectionOverlayStyle(
  textarea: HTMLTextAreaElement | null,
  value: string,
  selectionRange?: TextSelectionRange
): CSSProperties | undefined {
  if (!textarea || !selectionRange) {
    return undefined
  }

  const selectedText = value.slice(selectionRange.start, selectionRange.end)
  if (!selectedText) {
    return undefined
  }

  const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 18
  const startLine = value.slice(0, selectionRange.start).split('\n').length - 1
  const selectedLineCount = Math.max(1, selectedText.split('\n').length)

  return {
    top: `${textarea.offsetTop + startLine * lineHeight}px`,
    left: `${textarea.offsetLeft}px`,
    right: '0',
    height: `${selectedLineCount * lineHeight}px`
  }
}

function FormulaPreview({ latex }: { latex: string }): ReactElement {
  const html = latex.trim()
    ? katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        strict: 'ignore'
      })
    : ''

  return html ? (
    <div className="note-formula-preview" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className="note-formula-preview empty">空公式</div>
  )
}

function AutoResizeTextarea({
  noteId,
  blockId,
  className,
  ariaLabel,
  value,
  style,
  isBlockEditor = false,
  selectionRange,
  onFocus,
  onPointerDown,
  onMouseDown,
  onKeyDown,
  onChange,
  onSelectionStart,
  onSelectionChange,
  onSelectionEnd
}: {
  noteId: string
  blockId: string
  className: string
  ariaLabel: string
  value: string
  style?: CSSProperties
  isBlockEditor?: boolean
  selectionRange?: TextSelectionRange
  onFocus: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLTextAreaElement>) => void
  onMouseDown?: (event: ReactMouseEvent<HTMLTextAreaElement>) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onChange: (value: string) => void
  onSelectionStart: (blockId: string, offset: number) => void
  onSelectionChange: (blockId: string, offset: number) => void
  onSelectionEnd: () => void
}): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectionStyle = getTextareaSelectionOverlayStyle(textareaRef.current, value, selectionRange)
  const styleSignature = [
    style?.fontFamily,
    style?.fontSize,
    style?.fontWeight,
    style?.fontStyle,
    style?.textDecoration,
    className
  ].join('|')

  useLayoutEffect(() => {
    const textarea = textareaRef.current

    if (!textarea) {
      return
    }

    resizeTextareaToContent(textarea)

    const resizeTarget = textarea.parentElement ?? textarea
    const observer = new ResizeObserver(() => {
      resizeTextareaToContent(textarea)
    })

    observer.observe(resizeTarget)
    return () => {
      observer.disconnect()
    }
  }, [styleSignature, value])

  return (
    <div className="note-textarea-frame">
      {selectionStyle ? <span className="note-cross-block-selection-fill" style={selectionStyle} aria-hidden="true" /> : null}
      <textarea
        ref={textareaRef}
        className={className}
        aria-label={ariaLabel}
        data-note-block-editor={isBlockEditor ? 'true' : undefined}
        data-note-id={noteId}
        data-note-block-id={blockId}
        rows={1}
        value={value}
        style={style}
        spellCheck={false}
        onFocus={onFocus}
        onMouseDown={onMouseDown}
        onPointerDown={(event) => {
          onPointerDown?.(event)
          if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) {
            return
          }

          onSelectionStart(blockId, getTextareaOffsetFromPoint(event.currentTarget, event.clientX, event.clientY))
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) !== 1) {
            return
          }

          onSelectionChange(blockId, getTextareaOffsetFromPoint(event.currentTarget, event.clientX, event.clientY))
        }}
        onPointerUp={onSelectionEnd}
        onBlur={onSelectionEnd}
        onKeyDown={onKeyDown}
        onSelect={(event) => {
          onSelectionChange(blockId, getTextareaSelectionFocusOffset(event.currentTarget))
        }}
        onChange={(event) => {
          resizeTextareaToContent(event.currentTarget)
          onChange(event.target.value)
        }}
      />
    </div>
  )
}

function resizeTextareaToContent(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

function readDroppedImageFile(file: File): Promise<ClipboardImagePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('读取图片失败'))
        return
      }

      const image = new Image()
      image.addEventListener('load', () => {
        resolve({
          name: file.name || `drop-image-${Date.now()}.png`,
          mimeType: normalizeDroppedImageMimeType(file.type),
          dataUrl: reader.result as string,
          width: image.naturalWidth,
          height: image.naturalHeight,
          size: file.size
        })
      })
      image.addEventListener('error', () => reject(new Error('读取图片尺寸失败')))
      image.src = reader.result
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取图片失败')))
    reader.readAsDataURL(file)
  })
}

function normalizeDroppedImageMimeType(mimeType: string): ClipboardImagePayload['mimeType'] {
  if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
    return mimeType
  }

  return 'image/png'
}

function clampNotePageScale(value: number): number {
  return Math.min(2, Math.max(0.7, Math.round(value * 100) / 100))
}




