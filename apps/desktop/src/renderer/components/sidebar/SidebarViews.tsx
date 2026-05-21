import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { countNoteTextCharacters } from '@thesis-agent/notes'
import type { NoteDocument } from '@thesis-agent/notes'
import {
  EntryRowActionButton,
  FavoriteButton,
  PrimarySidebarCollapseButton,
  SectionHeader
} from '../AppSharedControls'
import { librarySortDirectionOptions, librarySortFieldOptions } from '../../app/constants'
import { getRootLibraryPdfPaths } from '../../app/libraryStructure'
import {
  findAiConversationById,
  getAiConversationScopedMessages,
  getChatTurns,
  formatReadingDuration,
  getFileStem,
  getMessagePreview,
  getPaperNotes,
  getPdfDisplayName,
  getPdfProgressHoverLabel,
  getPdfProgressPercent,
  getPdfProgressTooltip,
  isFavorite,
  resolveFavoriteItem,
  sortPdfPaths
} from '../../app/sidebarUtils'
import type {
  AiConversation,
  AiConversationsByPaperPath,
  AiGraphSelectTarget,
  FavoriteItemsByKey,
  FavoriteTarget,
  LibraryStructure,
  LibrarySortMode,
  NotesByPaperPath,
  OpenNoteIdsByPaperPath,
  PdfDisplayNamesByPath,
  PdfFileInfoByPath,
  PdfViewStates,
  PrimaryView,
  ResolvedFavoriteItem,
  SelectedNoteIdsByPaperPath
} from '../../app/types'

type LibraryPdfDragSession = {
  filePath: string
  displayName: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

type LibraryPdfDragOverlay = {
  filePath: string
  displayName: string
  x: number
  y: number
}

type LibraryPdfDropTarget =
  | {
      target: 'folder'
      folderId: string
    }
  | {
      target: 'root'
    }
  | null

export function LibraryPrimaryView({
  pdfPaths,
  selectedPdfPath,
  libraryStructure,
  pdfFileInfoByPath,
  pdfDisplayNamesByPath,
  pdfViewStates,
  notesByPaperPath,
  mineruParseResultByPdfPath,
  mineruCacheExistsByPdfPath,
  favoriteItemsByKey,
  librarySortMode,
  onLibrarySortModeChange,
  onPdfTabSelect,
  onPdfEntryRename,
  onPdfEntryDelete,
  onLibraryFolderCreate,
  onLibraryFolderToggle,
  onLibraryPdfMoveToFolder,
  onLibraryPdfMoveToRoot,
  onOpenPdf,
  onFavoriteToggle,
  onPrimarySidebarCollapse
}: {
  pdfPaths: string[]
  selectedPdfPath: string
  libraryStructure: LibraryStructure
  pdfFileInfoByPath: PdfFileInfoByPath
  pdfDisplayNamesByPath: PdfDisplayNamesByPath
  pdfViewStates: PdfViewStates
  notesByPaperPath: NotesByPaperPath
  mineruParseResultByPdfPath: Record<string, unknown>
  mineruCacheExistsByPdfPath: Record<string, boolean>
  favoriteItemsByKey: FavoriteItemsByKey
  librarySortMode: LibrarySortMode
  onLibrarySortModeChange: (sortMode: LibrarySortMode) => void
  onPdfTabSelect: (filePath: string) => void
  onPdfEntryRename: (filePath: string) => void
  onPdfEntryDelete: (filePath: string) => void
  onLibraryFolderCreate: () => void
  onLibraryFolderToggle: (folderId: string) => void
  onLibraryPdfMoveToFolder: (filePath: string, folderId: string) => void
  onLibraryPdfMoveToRoot: (filePath: string) => void
  onOpenPdf: () => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onPrimarySidebarCollapse: () => void
}): ReactElement {
  const [openMenu, setOpenMenu] = useState<'import' | 'sort' | null>(null)
  const [draggingPdfPath, setDraggingPdfPath] = useState('')
  const [draggingPdfOverlay, setDraggingPdfOverlay] = useState<LibraryPdfDragOverlay | null>(null)
  const [pressedPdfPath, setPressedPdfPath] = useState('')
  const [dragPreview, setDragPreview] = useState<{
    target: 'root' | 'folder'
    folderId?: string
  } | null>(null)
  const dragSessionRef = useRef<LibraryPdfDragSession | null>(null)
  const dragDropTargetRef = useRef<LibraryPdfDropTarget>(null)
  const suppressNextPdfClickRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null)
  const sortedPdfPaths = useMemo(
    () => sortPdfPaths(pdfPaths, selectedPdfPath, pdfViewStates, pdfFileInfoByPath, librarySortMode),
    [librarySortMode, pdfFileInfoByPath, pdfPaths, pdfViewStates, selectedPdfPath]
  )
  const rootPdfPaths = useMemo(
    () => getRootLibraryPdfPaths(libraryStructure, sortedPdfPaths),
    [libraryStructure, sortedPdfPaths]
  )
  const updatePdfDropTarget = useCallback((target: LibraryPdfDropTarget): void => {
    dragDropTargetRef.current = target
    setDragPreview(target)
  }, [])

  const findLibraryPdfDropTarget = useCallback(
    (clientX: number, clientY: number): LibraryPdfDropTarget => {
      const elements = Array.from(document.elementsFromPoint(clientX, clientY))
      const contentRect = contentRef.current?.getBoundingClientRect()

      for (const element of elements) {
        const folderItem = (element as HTMLElement).closest('.library-folder-tree-item')
        if (folderItem) {
          const folderId = (folderItem as HTMLElement).dataset.folderId ?? ''
          if (folderId) {
            return { target: 'folder', folderId }
          }
        }

        if ((element as HTMLElement).closest('.library-tree')) {
          return { target: 'root' }
        }
      }

      if (
        contentRect &&
        clientX >= contentRect.left &&
        clientX <= contentRect.right &&
        clientY >= contentRect.top &&
        clientY <= contentRect.bottom
      ) {
        return { target: 'root' }
      }

      return null
    },
    []
  )
  const getNoteCountLabel = useCallback(
    (filePath: string): string => {
      const noteCount = getPaperNotes(notesByPaperPath, filePath).length

      if (noteCount <= 0) {
        return '暂无笔记'
      }

      return `${noteCount} 篇笔记`
    },
    [notesByPaperPath]
  )
  const dragTargetLabel = useMemo(() => {
    if (dragPreview?.target === 'folder' && dragPreview.folderId) {
      const folderName = libraryStructure.foldersById[dragPreview.folderId]?.name ?? '文件夹'
      return `移动到：${folderName}`
    }

    if (dragPreview?.target === 'root') {
      return '移动到：根目录'
    }

    return ''
  }, [dragPreview, libraryStructure.foldersById])
  const dragOverlayHintLabel = dragTargetLabel || '拖动到文件夹或根目录'

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
        setContextMenuPosition(null)
      }
    }

    const handleFocusIn = (event: FocusEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
        setContextMenuPosition(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [])

  const openSpecificMenu = useCallback((menuId: 'import' | 'sort'): void => {
    setOpenMenu((current) => (current === menuId ? null : menuId))
    setContextMenuPosition(null)
  }, [])

  const closeMenu = useCallback((): void => {
    setOpenMenu(null)
    setContextMenuPosition(null)
  }, [])

  const openSpecificMenuByFocus = useCallback((menuId: 'import' | 'sort'): void => {
    setOpenMenu(menuId)
    setContextMenuPosition(null)
  }, [])

  const openContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (
      target.closest('.resource-row-shell') ||
      target.closest('.library-folder-row') ||
      target.closest('.entry-row-actions') ||
      target.closest('.section-header-actions')
    ) {
      return
    }

    event.preventDefault()
    const contentRect = contentRef.current?.getBoundingClientRect()
    if (!contentRect) {
      return
    }

    const left = Math.max(8, Math.min(event.clientX - contentRect.left, contentRect.width - 180))
    const top = Math.max(8, Math.min(event.clientY - contentRect.top, contentRect.height - 88))
    setOpenMenu(null)
    setContextMenuPosition({ left, top })
  }, [])

  const clearPdfDragState = useCallback((): void => {
    dragSessionRef.current = null
    dragDropTargetRef.current = null
    setPressedPdfPath('')
    setDraggingPdfPath('')
    setDraggingPdfOverlay(null)
    setDragPreview(null)
  }, [])

  const completePdfDrag = useCallback(
    (dropTarget: LibraryPdfDropTarget): void => {
      const session = dragSessionRef.current
      if (!session?.active) {
        clearPdfDragState()
        return
      }

      if (dropTarget?.target === 'folder' && dropTarget.folderId) {
        onLibraryPdfMoveToFolder(session.filePath, dropTarget.folderId)
      } else if (dropTarget?.target === 'root') {
        onLibraryPdfMoveToRoot(session.filePath)
      }

      suppressNextPdfClickRef.current = true
      window.setTimeout(() => {
        suppressNextPdfClickRef.current = false
      }, 0)
      clearPdfDragState()
    },
    [clearPdfDragState, onLibraryPdfMoveToFolder, onLibraryPdfMoveToRoot]
  )

  const startPdfDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, filePath: string, displayName: string): void => {
      if (event.button !== 0) {
        return
      }

      dragSessionRef.current = {
        filePath,
        displayName,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false
      }
      setPressedPdfPath(filePath)

      if (event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    },
    []
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session) {
        return
      }

      const deltaX = event.clientX - session.startX
      const deltaY = event.clientY - session.startY
      const distance = Math.hypot(deltaX, deltaY)

      if (!session.active && distance < 6) {
        return
      }

      if (!session.active) {
        dragSessionRef.current = {
          ...session,
          active: true
        }
        setDraggingPdfPath(session.filePath)
      }

      const activeSession = dragSessionRef.current
      if (!activeSession) {
        return
      }

      setDraggingPdfOverlay({
        filePath: activeSession.filePath,
        displayName: activeSession.displayName,
        x: event.clientX,
        y: event.clientY
      })

      const hoveredTarget = findLibraryPdfDropTarget(event.clientX, event.clientY)
      updatePdfDropTarget(hoveredTarget)
    }

    const handlePointerUp = (): void => {
      const session = dragSessionRef.current
      if (!session) {
        return
      }

      completePdfDrag(session.active ? dragDropTargetRef.current : null)
    }

    const handlePointerCancel = (): void => {
      if (!dragSessionRef.current) {
        return
      }

      clearPdfDragState()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [clearPdfDragState, completePdfDrag, updatePdfDropTarget])

  useEffect(() => {
    if (!draggingPdfPath) {
      document.body.classList.remove('library-dragging')
      return
    }

    document.body.classList.add('library-dragging')

    return () => {
      document.body.classList.remove('library-dragging')
    }
  }, [draggingPdfPath])

  const renderLibraryPdfRow = useCallback(
    (filePath: string, depth: number, showGuide: boolean): ReactElement => {
      const displayName = getPdfDisplayName(filePath, pdfDisplayNamesByPath)
      const pdfViewState = pdfViewStates[filePath]
      const progressPercent = getPdfProgressPercent(pdfViewState)
      const progressLabel = getPdfProgressHoverLabel(pdfViewState)
      const isParsed = Boolean(mineruParseResultByPdfPath[filePath])
      const isCached = Boolean(mineruCacheExistsByPdfPath[filePath]) && !isParsed

      return (
        <div
          key={filePath}
          className={
            filePath === selectedPdfPath
              ? 'resource-row-shell pdf-resource-row-shell library-tree-pdf-row active'
              : 'resource-row-shell pdf-resource-row-shell library-tree-pdf-row'
          }
          style={
            {
              '--pdf-progress': `${progressPercent}%`,
              '--library-depth': depth
            } as CSSProperties
          }
        >
          {showGuide ? <span className="library-tree-guide" aria-hidden="true" /> : null}
          <button
            className={
              draggingPdfPath === filePath || pressedPdfPath === filePath
                ? 'resource-row pdf-resource-row clickable drag-active'
                : 'resource-row pdf-resource-row clickable'
            }
            type="button"
            aria-label={`${displayName}：${getPdfProgressTooltip(pdfViewState)}`}
            onPointerDown={(event) => startPdfDrag(event, filePath, displayName)}
            onClick={() => {
              if (suppressNextPdfClickRef.current) {
                return
              }

              onPdfTabSelect(filePath)
            }}
          >
            <span className="codicon codicon-file-pdf" aria-hidden="true" />
            <div className="resource-row-main">
              <div className="library-pdf-title-row">
                <strong>{displayName}</strong>
                {filePath === selectedPdfPath ? <span className="library-pdf-note-count">{getNoteCountLabel(filePath)}</span> : null}
                <span className="library-pdf-status-icons" aria-hidden="true">
                  {isParsed ? <span className="library-pdf-status parsed codicon codicon-check" title="已解析" /> : null}
                  {isCached ? <span className="library-pdf-status cached codicon codicon-cloud-download" title="已缓存" /> : null}
                </span>
              </div>
              <small className="resource-reading-meta">
                <span>{formatReadingDuration(pdfViewState?.readingSeconds ?? 0)}</span>
                <span>{progressPercent}%</span>
              </small>
              <span className="resource-reading-progress" aria-label={progressLabel}>
                <span className="resource-reading-fill" style={{ width: `${progressPercent}%` }} />
                <span className="resource-reading-popover" aria-hidden="true">
                  {progressLabel}
                </span>
              </span>
            </div>
          </button>
          <div className="entry-row-actions">
            <FavoriteButton
              active={isFavorite(favoriteItemsByKey, { type: 'paper', paperPath: filePath })}
              label="论文"
              onClick={() => onFavoriteToggle({ type: 'paper', paperPath: filePath }, displayName)}
            />
            <EntryRowActionButton
              icon="codicon-edit"
              title={`重命名 ${displayName}`}
              ariaLabel={`重命名 ${displayName}`}
              onClick={() => onPdfEntryRename(filePath)}
            />
            <EntryRowActionButton
              icon="codicon-trash"
              title={`删除 ${displayName}`}
              ariaLabel={`删除 ${displayName}`}
              variant="danger"
              onClick={() => onPdfEntryDelete(filePath)}
            />
          </div>
        </div>
      )
    },
    [
      favoriteItemsByKey,
      onFavoriteToggle,
      onPdfEntryDelete,
      onPdfEntryRename,
      onPdfTabSelect,
      pdfDisplayNamesByPath,
      pdfViewStates,
      notesByPaperPath,
      mineruCacheExistsByPdfPath,
      mineruParseResultByPdfPath,
      selectedPdfPath
    ]
  )

  return (
    <div ref={rootRef} className="library-primary-view">
      <div
        className="section-header library-section-header"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            closeMenu()
          }
        }}
      >
        <h2>Library</h2>
        <div className="section-header-actions library-section-actions">
          <PrimarySidebarCollapseButton onCollapse={onPrimarySidebarCollapse} />

          <div className={openMenu === 'sort' ? 'library-header-menu-anchor open' : 'library-header-menu-anchor'}>
            <button
              className={openMenu === 'sort' ? 'section-header-icon-button active' : 'section-header-icon-button'}
              type="button"
              title="鎺掑簭"
              aria-label="鎺掑簭"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'sort'}
              onFocus={() => openSpecificMenuByFocus('sort')}
              onClick={() => openSpecificMenu('sort')}
            >
              <span className="codicon codicon-list-ordered" aria-hidden="true" />
            </button>
            {openMenu === 'sort' ? (
              <div className="library-header-menu" role="menu" aria-label="Library 排序">
                <div className="library-header-menu-group" role="group" aria-label="排序字段">
                  {librarySortFieldOptions.map((option) => (
                    <button
                      key={option.id}
                      className={librarySortMode.field === option.id ? 'library-header-menu-item active' : 'library-header-menu-item'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={librarySortMode.field === option.id}
                      onClick={() => {
                        onLibrarySortModeChange({
                          ...librarySortMode,
                          field: option.id
                        })
                      }}
                    >
                      <span
                        className={`codicon ${librarySortMode.field === option.id ? 'codicon-check' : 'codicon-blank'}`}
                        aria-hidden="true"
                      />
                      <span>{option.title}</span>
                    </button>
                  ))}
                </div>
                <div className="library-header-menu-separator" aria-hidden="true" />
                <div className="library-header-menu-group" role="group" aria-label="排序方向">
                  {librarySortDirectionOptions.map((option) => (
                    <button
                      key={option.id}
                      className={librarySortMode.direction === option.id ? 'library-header-menu-item active' : 'library-header-menu-item'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={librarySortMode.direction === option.id}
                      onClick={() => {
                        onLibrarySortModeChange({
                          ...librarySortMode,
                          direction: option.id
                        })
                        closeMenu()
                      }}
                    >
                      <span
                        className={`codicon ${librarySortMode.direction === option.id ? 'codicon-check' : 'codicon-blank'}`}
                        aria-hidden="true"
                      />
                      <span>{option.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className={openMenu === 'import' ? 'library-header-menu-anchor open' : 'library-header-menu-anchor'}>
            <button
              className={openMenu === 'import' ? 'section-header-icon-button active' : 'section-header-icon-button'}
              type="button"
              title="Import Paper"
              aria-label="Import Paper"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'import'}
              onFocus={() => openSpecificMenuByFocus('import')}
              onClick={() => openSpecificMenu('import')}
            >
              <span className="codicon codicon-add" aria-hidden="true" />
            </button>
            {openMenu === 'import' ? (
              <div className="library-header-menu" role="menu" aria-label="Import Paper">
                <button
                  className="library-header-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu()
                    onOpenPdf()
                  }}
                >
                  <span className="codicon codicon-file-pdf" aria-hidden="true" />
                  <span>Import Paper</span>
                </button>
                <button
                  className="library-header-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu()
                    onLibraryFolderCreate()
                  }}
                >
                  <span className="codicon codicon-new-folder" aria-hidden="true" />
                  <span>New Folder</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        ref={contentRef}
        className="sidebar-content library-sidebar-content"
        onContextMenu={openContextMenu}
      >
        {contextMenuPosition ? (
          <div
            className="library-header-menu library-context-menu"
            role="menu"
            aria-label="Library 空白区域菜单"
            style={{ left: `${contextMenuPosition.left}px`, top: `${contextMenuPosition.top}px`, right: 'auto' }}
          >
            <button
              className="library-header-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu()
                onOpenPdf()
              }}
            >
              <span className="codicon codicon-file-pdf" aria-hidden="true" />
              <span>Import Paper</span>
            </button>
            <button
              className="library-header-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu()
                onLibraryFolderCreate()
              }}
            >
              <span className="codicon codicon-new-folder" aria-hidden="true" />
              <span>New Folder</span>
            </button>
          </div>
        ) : null}
        {sortedPdfPaths.length > 0 ? (
          <div className={dragPreview?.target === 'root' ? 'library-tree root-drop-target' : 'library-tree'}>
            {libraryStructure.folderOrder.map((folderId) => {
              const folder = libraryStructure.foldersById[folderId]
              if (!folder) {
                return null
              }

              const folderPdfPaths = sortPdfPaths(
                folder.pdfPaths,
                selectedPdfPath,
                pdfViewStates,
                pdfFileInfoByPath,
                librarySortMode
              )

              return (
                <div key={folder.id} className="library-folder-tree-item" data-folder-id={folder.id}>
                  <button
                    className={
                      dragPreview?.target === 'folder' && dragPreview.folderId === folder.id
                        ? 'library-folder-row drop-target'
                        : 'library-folder-row'
                    }
                    type="button"
                    onClick={() => onLibraryFolderToggle(folder.id)}
                  >
                    <span
                      className={`codicon ${folder.expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}
                      aria-hidden="true"
                    />
                    <strong>{folder.name}</strong>
                  </button>
                  <div
                    className={
                      dragPreview?.target === 'folder' && dragPreview.folderId === folder.id
                        ? 'library-folder-drop-shell drop-target'
                        : 'library-folder-drop-shell'
                    }
                  >
                  {folder.expanded ? (
                    <div
                      className={
                        dragPreview?.target === 'folder' && dragPreview.folderId === folder.id
                          ? 'library-folder-children drop-target'
                          : 'library-folder-children'
                      }
                    >
                      {folderPdfPaths.map((filePath) => renderLibraryPdfRow(filePath, 1, true))}
                    </div>
                  ) : null}
                  </div>
                </div>
              )
            })}
            <div className={dragPreview?.target === 'root' ? 'library-tree-root drop-target' : 'library-tree-root'}>
              {rootPdfPaths.map((filePath) => renderLibraryPdfRow(filePath, 0, false))}
            </div>
          </div>
        ) : (
          <div className="resource-row empty-state">
            <span className="codicon codicon-file-pdf" aria-hidden="true" />
            <div>
              <strong>No PDF selected</strong>
              <small>Open a local paper to start reading</small>
            </div>
          </div>
        )}
      </div>
      {draggingPdfOverlay ? (
        <div
          className="library-drag-preview active"
          style={{
            left: `${draggingPdfOverlay.x + 14}px`,
            top: `${draggingPdfOverlay.y + 14}px`
          }}
        >
          <span className="codicon codicon-file-pdf" aria-hidden="true" />
          <div className="library-drag-preview-copy">
            <strong>{draggingPdfOverlay.displayName}</strong>
            <small>{dragOverlayHintLabel}</small>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function FavoritesView({
  favoriteItemsByKey,
  pdfDisplayNamesByPath,
  notesByPaperPath,
  aiConversationsByPaperPath,
  onPdfTabSelect,
  onOpenNote,
  onAiGraphNodeSelect,
  onFavoriteToggle,
  onPrimarySidebarCollapse
}: {
  favoriteItemsByKey: FavoriteItemsByKey
  pdfDisplayNamesByPath: PdfDisplayNamesByPath
  notesByPaperPath: NotesByPaperPath
  aiConversationsByPaperPath: AiConversationsByPaperPath
  onPdfTabSelect: (filePath: string) => void
  onOpenNote: (filePath: string, noteId?: string) => void
  onAiGraphNodeSelect: (target: AiGraphSelectTarget) => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onPrimarySidebarCollapse: () => void
}): ReactElement {
  const resolvedItems = useMemo(
    () =>
      Object.entries(favoriteItemsByKey)
        .map(([key, item]) => resolveFavoriteItem(key, item, pdfDisplayNamesByPath, notesByPaperPath, aiConversationsByPaperPath))
        .filter((item): item is ResolvedFavoriteItem => Boolean(item))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [aiConversationsByPaperPath, favoriteItemsByKey, notesByPaperPath, pdfDisplayNamesByPath]
  )

  return (
    <>
      <SectionHeader title="Favorites" action={<PrimarySidebarCollapseButton onCollapse={onPrimarySidebarCollapse} />} />
      <div className="sidebar-content">
        {resolvedItems.length > 0 ? (
          resolvedItems.map((item) => (
            <div key={item.key} className="favorite-row-shell">
              <button
                className="favorite-row clickable"
                type="button"
                title={item.subtitle}
                onClick={() => {
                  if (item.target.type === 'paper') {
                    onPdfTabSelect(item.target.paperPath)
                    return
                  }

                  if (item.target.type === 'note') {
                    onOpenNote(item.target.paperPath, item.target.noteId)
                    return
                  }

                  onAiGraphNodeSelect({
                    paperPath: item.target.paperPath,
                    conversationId: item.target.conversationId,
                    messageId: item.target.messageId
                  })
                }}
              >
                <span className={`codicon ${item.icon}`} aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>
                <span className="favorite-type-chip">{item.typeLabel}</span>
              </button>
              <FavoriteButton
                active
                label={item.typeLabel}
                title={`取消收藏 ${item.typeLabel}`}
                onClick={() => onFavoriteToggle(item.target, item.typeLabel)}
              />
            </div>
          ))
        ) : (
          <div className="graph-tree-empty">
            <span className="codicon codicon-star-empty" aria-hidden="true" />
            <span>收藏的论文、笔记和 AI 回答会显示在这里</span>
          </div>
        )}
      </div>
    </>
  )
}

export function CurrentPdfNotes({
  filePath,
  currentPdfName,
  notes,
  selectedNoteId,
  favoriteItemsByKey,
  onOpenNote,
  onFavoriteToggle,
  onNoteEntryRename,
  onNoteEntryDelete
}: {
  filePath: string
  currentPdfName: string
  notes: NoteDocument[]
  selectedNoteId: string
  favoriteItemsByKey: FavoriteItemsByKey
  onOpenNote: (filePath: string, noteId?: string) => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onNoteEntryRename: (filePath: string, noteId: string) => void
  onNoteEntryDelete: (filePath: string, noteId: string) => void
}): ReactElement {
  return (
    <>
      <div className="current-pdf-name" title={filePath}>
        {currentPdfName}
      </div>
      {notes.length > 0 ? (
        notes.map((note) => {
          const noteTitle = note.title || `${getFileStem(filePath)} Notes`

          return (
            <div key={note.id} className={selectedNoteId === note.id ? 'sidebar-note-card-shell active' : 'sidebar-note-card-shell'}>
              <button className="sidebar-note-card clickable" type="button" onClick={() => onOpenNote(filePath, note.id)}>
                <span className="codicon codicon-notebook" aria-hidden="true" />
                <div>
                  <strong>{noteTitle}</strong>
                  <small>{note.blocks.length} 段 · {countNoteTextCharacters(note)} 字</small>
                </div>
              </button>
              <div className="entry-row-actions">
                <FavoriteButton
                  active={isFavorite(favoriteItemsByKey, { type: 'note', paperPath: filePath, noteId: note.id })}
                  label="笔记"
                  onClick={() => onFavoriteToggle({ type: 'note', paperPath: filePath, noteId: note.id }, noteTitle)}
                />
                <EntryRowActionButton
                  icon="codicon-edit"
                  title={`重命名 ${noteTitle}`}
                  ariaLabel={`重命名 ${noteTitle}`}
                  onClick={() => onNoteEntryRename(filePath, note.id)}
                />
                <EntryRowActionButton
                  icon="codicon-trash"
                  title={`删除 ${noteTitle}`}
                  ariaLabel={`删除 ${noteTitle}`}
                  variant="danger"
                  onClick={() => onNoteEntryDelete(filePath, note.id)}
                />
              </div>
            </div>
          )
        })
      ) : (
        <button className="sidebar-note-card clickable" type="button" onClick={() => onOpenNote(filePath, '')}>
          <span className="codicon codicon-notebook" aria-hidden="true" />
          <div>
            <strong>新增当前 PDF 笔记</strong>
            <small>点击选择文本模板或截图模板</small>
          </div>
        </button>
      )}
    </>
  )
}

export function CurrentPdfGraph({
  openPdfPaths,
  selectedPdfPath,
  pdfDisplayNamesByPath,
  aiConversationsByPaperPath,
  activeAiConversationIdsByPaperPath,
  focusedAiMessageId,
  onAiGraphNodeSelect,
  onPdfEntryRename,
  onPdfEntryDelete
}: {
  openPdfPaths: string[]
  selectedPdfPath: string
  pdfDisplayNamesByPath: PdfDisplayNamesByPath
  aiConversationsByPaperPath: AiConversationsByPaperPath
  activeAiConversationIdsByPaperPath: Record<string, string>
  focusedAiMessageId: string
  onAiGraphNodeSelect: (target: AiGraphSelectTarget) => void
  onPdfEntryRename: (filePath: string) => void
  onPdfEntryDelete: (filePath: string) => void
}): ReactElement {
  const visiblePdfPaths = openPdfPaths.length > 0 ? openPdfPaths : selectedPdfPath ? [selectedPdfPath] : []
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(() => new Set())

  const toggleQuestionExpanded = useCallback((questionId: string): void => {
    setExpandedQuestionIds((current) => {
      const next = new Set(current)

      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }

      return next
    })
  }, [])

  return (
    <>
      {visiblePdfPaths.map((filePath) => {
        const displayName = getPdfDisplayName(filePath, pdfDisplayNamesByPath)
        const conversations = aiConversationsByPaperPath[filePath] ?? []
        const activeConversationId = activeAiConversationIdsByPaperPath[filePath] ?? ''
        const rootQuestionNodes = conversations
          .filter((conversation) => !conversation.parentAnswerId)
          .flatMap((conversation) => buildAiQuestionTree(conversation, conversations))
        const questionCount = countAiQuestionTreeNodes(rootQuestionNodes)

        return (
          <div key={filePath} className="graph-tree-paper">
            <div className={filePath === selectedPdfPath ? 'resource-row-shell active' : 'resource-row-shell'}>
              <button
                className="resource-row clickable"
                type="button"
                title={filePath}
                onClick={() => {
                  const conversationId = activeConversationId || conversations[0]?.id || ''
                  if (conversationId) {
                    onAiGraphNodeSelect({ paperPath: filePath, conversationId })
                  }
                }}
              >
                <span className="codicon codicon-file-pdf" aria-hidden="true" />
                <div>
                  <strong>{displayName}</strong>
                  <small>{questionCount} 个问题</small>
                </div>
              </button>
              <div className="entry-row-actions">
                <EntryRowActionButton
                  icon="codicon-edit"
                  title={`重命名 ${displayName}`}
                  ariaLabel={`重命名 ${displayName}`}
                  onClick={() => onPdfEntryRename(filePath)}
                />
                <EntryRowActionButton
                  icon="codicon-trash"
                  title={`删除 ${displayName}`}
                  ariaLabel={`删除 ${displayName}`}
                  variant="danger"
                  onClick={() => onPdfEntryDelete(filePath)}
                />
              </div>
            </div>
            {rootQuestionNodes.length > 0 ? (
              <div className="graph-tree" role="tree" aria-label={`${displayName} 问题树`}>
                {rootQuestionNodes.map((node) => (
                    <AiGraphQuestionNode
                      key={node.id}
                      node={node}
                      activeConversationId={activeConversationId}
                      focusedAiMessageId={focusedAiMessageId}
                      expandedQuestionIds={expandedQuestionIds}
                      onQuestionToggle={toggleQuestionExpanded}
                      onAiGraphNodeSelect={onAiGraphNodeSelect}
                    />
                  ))}
              </div>
            ) : (
              <div className="graph-tree-empty">
                <span className="codicon codicon-type-hierarchy-sub" aria-hidden="true" />
                <span>AI 提问后会在这里生成问题树</span>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

type AiQuestionTreeNode = {
  id: string
  messageId: string
  conversationId: string
  paperPath: string
  label: string
  children: AiQuestionTreeNode[]
}

function buildAiQuestionTree(conversation: AiConversation, conversations: AiConversation[]): AiQuestionTreeNode[] {
  const turns = getChatTurns(getAiConversationScopedMessages(conversation))
  if (turns.length === 0) {
    return []
  }

  const nodes: AiQuestionTreeNode[] = turns.map((turn) => ({
    id: `${conversation.id}:${turn.question.id}`,
    messageId: turn.question.id,
    conversationId: conversation.id,
    paperPath: conversation.paperPath,
    label: getMessagePreview(turn.question.content, 36),
    children: []
  }))

  for (let index = 0; index < nodes.length; index += 1) {
    const turn = turns[index]
    const sequentialChildren = index + 1 < nodes.length ? [nodes[index + 1]] : []
    const branchChildren =
      turn.answer
        ? conversations
            .filter((item) => item.parentAnswerId === turn.answer?.id)
            .flatMap((branchConversation) => buildAiQuestionTree(branchConversation, conversations))
        : []

    nodes[index].children = [...sequentialChildren, ...branchChildren]
  }

  return nodes[0] ? [nodes[0]] : []
}

function countAiQuestionTreeNodes(nodes: AiQuestionTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countAiQuestionTreeNodes(node.children), 0)
}

function AiGraphQuestionNode({
  node,
  activeConversationId,
  focusedAiMessageId,
  expandedQuestionIds,
  onQuestionToggle,
  onAiGraphNodeSelect
}: {
  node: AiQuestionTreeNode
  activeConversationId: string
  focusedAiMessageId: string
  expandedQuestionIds: Set<string>
  onQuestionToggle: (questionId: string) => void
  onAiGraphNodeSelect: (target: AiGraphSelectTarget) => void
}): ReactElement {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedQuestionIds.has(node.messageId)
  const isFocused = node.messageId === focusedAiMessageId || (!focusedAiMessageId && node.conversationId === activeConversationId)

  return (
    <div className="graph-tree-branch" role="group">
      <div className={isFocused ? 'graph-tree-row-shell active' : 'graph-tree-row-shell'}>
        <button
          className={isFocused || isExpanded ? 'graph-tree-row question active' : 'graph-tree-row question'}
          type="button"
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          onClick={() => {
            onAiGraphNodeSelect({
              paperPath: node.paperPath,
              conversationId: node.conversationId,
              messageId: node.messageId
            })

            if (hasChildren) {
              onQuestionToggle(node.messageId)
            }
          }}
        >
          <span
            className={`codicon ${
              hasChildren ? (isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right') : 'codicon-blank'
            }`}
            aria-hidden="true"
          />
          <span className="codicon codicon-comment" aria-hidden="true" />
          <span>{node.label}</span>
        </button>
      </div>
      {isExpanded && hasChildren ? (
        <div className="graph-tree-children">
          {node.children.map((childNode) => (
            <AiGraphQuestionNode
              key={childNode.id}
              node={childNode}
              activeConversationId={activeConversationId}
              focusedAiMessageId={focusedAiMessageId}
              expandedQuestionIds={expandedQuestionIds}
              onQuestionToggle={onQuestionToggle}
              onAiGraphNodeSelect={onAiGraphNodeSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PrimaryViewContent({
  view,
  openPdfPaths,
  selectedPdfPath,
  libraryStructure,
  pdfFileInfoByPath,
  pdfDisplayNamesByPath,
  pdfViewStates,
  mineruParseResultByPdfPath,
  mineruCacheExistsByPdfPath,
  favoriteItemsByKey,
  notesByPaperPath,
  selectedNoteIdsByPaperPath,
  aiConversationsByPaperPath,
  activeAiConversationIdsByPaperPath,
  focusedAiMessageId,
  librarySortMode,
  onLibrarySortModeChange,
  onPdfTabSelect,
  onPdfEntryRename,
  onPdfEntryDelete,
  onLibraryFolderCreate,
  onLibraryFolderToggle,
  onLibraryPdfMoveToFolder,
  onLibraryPdfMoveToRoot,
  onOpenNote,
  onOpenPdf,
  onAiGraphNodeSelect,
  onFavoriteToggle,
  onNoteEntryRename,
  onNoteEntryDelete,
  onPrimarySidebarCollapse
}: {
  view: PrimaryView
  openPdfPaths: string[]
  selectedPdfPath: string
  libraryStructure: LibraryStructure
  pdfFileInfoByPath: PdfFileInfoByPath
  pdfDisplayNamesByPath: PdfDisplayNamesByPath
  pdfViewStates: PdfViewStates
  mineruParseResultByPdfPath: Record<string, unknown>
  mineruCacheExistsByPdfPath: Record<string, boolean>
  favoriteItemsByKey: FavoriteItemsByKey
  notesByPaperPath: NotesByPaperPath
  selectedNoteIdsByPaperPath: SelectedNoteIdsByPaperPath
  aiConversationsByPaperPath: AiConversationsByPaperPath
  activeAiConversationIdsByPaperPath: Record<string, string>
  focusedAiMessageId: string
  librarySortMode: LibrarySortMode
  onLibrarySortModeChange: (sortMode: LibrarySortMode) => void
  onPdfTabSelect: (filePath: string) => void
  onPdfEntryRename: (filePath: string) => void
  onPdfEntryDelete: (filePath: string) => void
  onLibraryFolderCreate: () => void
  onLibraryFolderToggle: (folderId: string) => void
  onLibraryPdfMoveToFolder: (filePath: string, folderId: string) => void
  onLibraryPdfMoveToRoot: (filePath: string) => void
  onOpenNote: (filePath: string, noteId?: string) => void
  onOpenPdf: () => void
  onAiGraphNodeSelect: (target: AiGraphSelectTarget) => void
  onFavoriteToggle: (target: FavoriteTarget, label: string) => void
  onNoteEntryRename: (filePath: string, noteId: string) => void
  onNoteEntryDelete: (filePath: string, noteId: string) => void
  onPrimarySidebarCollapse: () => void
}): ReactElement {
  if (view === 'favorites') {
    return (
      <FavoritesView
        favoriteItemsByKey={favoriteItemsByKey}
        pdfDisplayNamesByPath={pdfDisplayNamesByPath}
        notesByPaperPath={notesByPaperPath}
        aiConversationsByPaperPath={aiConversationsByPaperPath}
        onPdfTabSelect={onPdfTabSelect}
        onOpenNote={onOpenNote}
        onAiGraphNodeSelect={onAiGraphNodeSelect}
        onFavoriteToggle={onFavoriteToggle}
        onPrimarySidebarCollapse={onPrimarySidebarCollapse}
      />
    )
  }

  if (view === 'library') {
    return (
      <LibraryPrimaryView
        pdfPaths={openPdfPaths}
        selectedPdfPath={selectedPdfPath}
        libraryStructure={libraryStructure}
        pdfFileInfoByPath={pdfFileInfoByPath}
        pdfDisplayNamesByPath={pdfDisplayNamesByPath}
        pdfViewStates={pdfViewStates}
        notesByPaperPath={notesByPaperPath}
        mineruParseResultByPdfPath={mineruParseResultByPdfPath}
        mineruCacheExistsByPdfPath={mineruCacheExistsByPdfPath}
        favoriteItemsByKey={favoriteItemsByKey}
        librarySortMode={librarySortMode}
        onLibrarySortModeChange={onLibrarySortModeChange}
        onPdfTabSelect={onPdfTabSelect}
        onPdfEntryRename={onPdfEntryRename}
        onPdfEntryDelete={onPdfEntryDelete}
        onLibraryFolderCreate={onLibraryFolderCreate}
        onLibraryFolderToggle={onLibraryFolderToggle}
        onLibraryPdfMoveToFolder={onLibraryPdfMoveToFolder}
        onLibraryPdfMoveToRoot={onLibraryPdfMoveToRoot}
        onOpenPdf={onOpenPdf}
        onFavoriteToggle={onFavoriteToggle}
        onPrimarySidebarCollapse={onPrimarySidebarCollapse}
      />
    )
  }

  return (
    <>
      <SectionHeader
        title={view === 'note' ? 'Notes' : 'Graph'}
        action={<PrimarySidebarCollapseButton onCollapse={onPrimarySidebarCollapse} />}
      />
      <div className="sidebar-content">
        {selectedPdfPath ? (
          view === 'note' ? (
            <CurrentPdfNotes
              filePath={selectedPdfPath}
              notes={getPaperNotes(notesByPaperPath, selectedPdfPath)}
              selectedNoteId={selectedNoteIdsByPaperPath[selectedPdfPath] ?? ''}
              currentPdfName={getPdfDisplayName(selectedPdfPath, pdfDisplayNamesByPath)}
              favoriteItemsByKey={favoriteItemsByKey}
              onOpenNote={onOpenNote}
              onFavoriteToggle={onFavoriteToggle}
              onNoteEntryRename={onNoteEntryRename}
              onNoteEntryDelete={onNoteEntryDelete}
            />
          ) : (
            <CurrentPdfGraph
              openPdfPaths={openPdfPaths}
              selectedPdfPath={selectedPdfPath}
              pdfDisplayNamesByPath={pdfDisplayNamesByPath}
              aiConversationsByPaperPath={aiConversationsByPaperPath}
              activeAiConversationIdsByPaperPath={activeAiConversationIdsByPaperPath}
              focusedAiMessageId={focusedAiMessageId}
              onAiGraphNodeSelect={onAiGraphNodeSelect}
              onPdfEntryRename={onPdfEntryRename}
              onPdfEntryDelete={onPdfEntryDelete}
            />
          )
        ) : (
          <div className="resource-row empty-state">
            <span className="codicon codicon-file-pdf" aria-hidden="true" />
            <div>
              <strong>No PDF selected</strong>
              <small>Open a local paper to start reading</small>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

