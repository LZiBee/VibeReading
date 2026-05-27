import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { imageBlockSchema } from '@milkdown/kit/component/image-block'
import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as ProseNode, Schema } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  hrSchema,
  inlineCodeSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
  wrapInHeadingCommand
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { getNoteBlockText, noteToMilkdownMarkdown } from '@thesis-agent/notes'
import type { NoteComplexBlockPlaceholder, NoteDocument } from '@thesis-agent/notes'
import type { SourceRef } from '@thesis-agent/shared'
import { $prose, insert, replaceRange } from '@milkdown/kit/utils'
import { aiAnswerFeature } from './aiAnswerFeature'
import { formulaFeature, normalizeFormulaLatex, readFormulaLatex, type FormulaAttrs } from './formulaFeature'
import { decodeComplexBlockHref } from './complexBlockProtocol'
import { pdfExcerptFeature } from './pdfExcerptFeature'
import {
  createPdfExcerptDropPayloadFromMineruBlock,
  pdfExcerptDragMimeType,
  type PdfExcerptDropPayload,
  readPdfExcerptDropBundle
} from './pdfExcerptDrag'
import {
  getMineruBlockPlainText,
  hasMineruBlockDragPayload,
  type MineruBlockDragPayload,
  readMineruBlockDragPayload
} from '../../../app/mineruDrag'
import type { NoteExportFormat } from '../../../../preload/thesis-agent'

const translationCompareSentencePluginKey = new PluginKey<DecorationSet>('translation-compare-sentence')

const translationCompareSentencePlugin = $prose(() => {
  return new Plugin<DecorationSet>({
    key: translationCompareSentencePluginKey,
    state: {
      init: (_, state) => buildTranslationCompareSentenceDecorations(state.doc),
      apply: (transaction, previous) => {
        if (!transaction.docChanged) {
          return previous.map(transaction.mapping, transaction.doc)
        }

        return buildTranslationCompareSentenceDecorations(transaction.doc)
      }
    },
    props: {
      decorations: (state) => translationCompareSentencePluginKey.getState(state) ?? DecorationSet.empty
    }
  })
})

export function MilkdownNoteEditor({
  note,
  isDirty = false,
  isTranslationCompareMode = false,
  onBackToLegacy,
  onSave,
  onExport,
  onSourceJump,
  onMineruBlockDrop
}: {
  note?: NoteDocument
  isDirty?: boolean
  isTranslationCompareMode?: boolean
  onBackToLegacy?: () => void
  onSave?: (markdown: string) => void
  onExport?: (format: NoteExportFormat, markdown: string) => void
  onSourceJump?: (blockId: string) => void
  onMineruBlockDrop?: (payload: MineruBlockDragPayload, insertAfterBlockId?: string | null) => string | undefined | void
}): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Crepe | null>(null)
  const readingPointerRef = useRef<HTMLDivElement | null>(null)
  const hoveredSentenceIdRef = useRef<string | null>(null)
  const latestMarkdownRef = useRef('')
  const [hoveredSentenceId, setHoveredSentenceId] = useState<string | null>(null)
  const milkdownDocument = useMemo(
    () =>
      note
        ? noteToMilkdownMarkdown(note)
        : {
            markdown: '# 未选择笔记\n\n请先从左侧打开一篇笔记。',
            placeholders: [],
            hasComplexBlocks: false
          },
    [note]
  )
  const markdown = milkdownDocument.markdown

  useEffect(() => {
    latestMarkdownRef.current = markdown
  }, [markdown])

  useEffect(() => {
    editorRef.current?.setReadonly(isTranslationCompareMode)
  }, [isTranslationCompareMode])

  useEffect(() => {
    hoveredSentenceIdRef.current = null
    setHoveredSentenceId(null)
    hideTranslationReadingPointer(readingPointerRef.current)
  }, [note?.id, isTranslationCompareMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const editor = new Crepe({
      root: container,
      defaultValue: markdown,
      featureConfigs: {
        [CrepeFeature.ImageBlock]: {
          onUpload: readImageFileAsDataUrl,
          inlineOnUpload: readImageFileAsDataUrl,
          blockOnUpload: readImageFileAsDataUrl,
          blockUploadButton: '上传图片',
          inlineUploadButton: '上传',
          blockUploadPlaceholderText: '或粘贴图片链接',
          inlineUploadPlaceholderText: '或粘贴图片链接',
          blockCaptionPlaceholderText: '图片说明',
          blockConfirmButton: '确认',
          maxWidth: 680,
          maxHeight: 720
        }
      }
    })
    editor.setReadonly(isTranslationCompareMode)
    if (isTranslationCompareMode) {
      editor.editor.use(translationCompareSentencePlugin)
    }
    pdfExcerptFeature(editor.editor, {
      onSourceJump
    })
    formulaFeature(editor.editor)
    aiAnswerFeature(editor.editor)
    editor.on((listener) => {
      listener.markdownUpdated((_, nextMarkdown) => {
        latestMarkdownRef.current = nextMarkdown
      })
    })
    editorRef.current = editor
    let isDisposed = false
    void editor.create().then(() => {
      if (isDisposed || editorRef.current !== editor) {
        return
      }

      restorePdfExcerptPlaceholdersFromLinks(editor, milkdownDocument.placeholders)
      restoreFormulaPlaceholdersFromLinks(editor, milkdownDocument.placeholders)
      restoreImagePlaceholdersFromLinks(editor, milkdownDocument.placeholders)
      normalizeInlineMathNodes(editor)
      latestMarkdownRef.current = editor.getMarkdown()
    })

    return () => {
      isDisposed = true
      void editor.destroy()
      editorRef.current = null
      container.replaceChildren()
    }
  }, [isTranslationCompareMode, markdown, note?.id])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    if (!isTranslationCompareMode) {
      clearTranslationCompareHoveredSentence(container)
      return
    }

    syncTranslationCompareHoveredSentence(container, hoveredSentenceId)
  }, [hoveredSentenceId, isTranslationCompareMode, markdown, note?.id])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !note || !onSourceJump) {
      return
    }

    const handleClick = (event: MouseEvent): void => {
      if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
        return
      }

      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const host = target.closest('.milkdown')
      if (!host) {
        return
      }

      const pdfExcerptNode = target.closest<HTMLElement>('.milkdown-pdf-excerpt[data-note-block-id]')
      if (pdfExcerptNode?.dataset.noteBlockId) {
        event.preventDefault()
        event.stopPropagation()
        onSourceJump(pdfExcerptNode.dataset.noteBlockId)
        return
      }

      const formulaNode = target.closest<HTMLElement>('.milkdown-formula[data-note-block-id]')
      if (formulaNode?.dataset.noteBlockId) {
        event.preventDefault()
        event.stopPropagation()
        onSourceJump(formulaNode.dataset.noteBlockId)
        return
      }

      const link = target.closest('a[href^="inspiration-note-block://"]')
      if (!(link instanceof HTMLAnchorElement)) {
        return
      }

      const href = link.getAttribute('href') ?? ''
      const matchedPlaceholder = milkdownDocument.placeholders.find((placeholder) => placeholder.href === href)
      if (!matchedPlaceholder?.blockId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      onSourceJump(matchedPlaceholder.blockId)
    }

    container.addEventListener('click', handleClick, true)
    return () => {
      container.removeEventListener('click', handleClick, true)
    }
  }, [milkdownDocument.placeholders, note, onSourceJump])

  useEffect(() => {
    const container = containerRef.current
    const editor = editorRef.current
    if (!container || !editor || !note || isTranslationCompareMode) {
      return
    }

    const allowSupportedDrop = (event: DragEvent): void => {
      const dataTransfer = event.dataTransfer as DataTransfer | null
      if (!dataTransfer || !hasSupportedDropPayload(dataTransfer)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (event: DragEvent): void => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) {
        return
      }

      const hasSupportedPayload = hasSupportedDropPayload(dataTransfer)
      const pdfExcerptItems = readPdfExcerptDropBundle(dataTransfer)
      const mineruPayload = readMineruBlockDragPayload(dataTransfer)
      const items =
        pdfExcerptItems.length > 0
          ? pdfExcerptItems
          : mineruPayload
            ? [createPdfExcerptDropPayloadFromMineruBlock({ filePath: mineruPayload.paperPath, noteId: note.id, block: mineruPayload.block })]
            : []

      const filteredItems = dedupePdfExcerptItems(items)
      const isMineruFormulaDrop = mineruPayload?.block.type === 'equation'
      const isMineruImageDrop = Boolean(
        mineruPayload &&
          (mineruPayload.block.type === 'image' || mineruPayload.block.type === 'chart' || mineruPayload.block.type === 'table') &&
          mineruPayload.block.imageDataUrl
      )

      if (!isMineruFormulaDrop && !isMineruImageDrop && filteredItems.length === 0) {
        if (hasSupportedPayload) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }

      event.preventDefault()
      event.stopPropagation()

      editor.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const schema = view.state.schema
        const selection = view.state.selection
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const insertAt = getSafeBlockInsertPos(view.state.doc, pos?.pos ?? selection.to)
        const insertAfterBlockId = getDropInsertAfterBlockId(note, view.state.doc, insertAt)
        const insertedBlockId = mineruPayload && onMineruBlockDrop
          ? onMineruBlockDrop(mineruPayload, insertAfterBlockId)
          : undefined
        const nodes = isMineruFormulaDrop && mineruPayload
          ? createMineruFormulaNodes(schema, mineruPayload, note.id, insertedBlockId)
          : isMineruImageDrop && mineruPayload
            ? createMineruImageNodes(schema, mineruPayload)
          : createPdfExcerptNodes(schema, filteredItems)

        view.dispatch(view.state.tr.insert(insertAt, nodes).scrollIntoView())
      })
      latestMarkdownRef.current = editor.getMarkdown()
    }

    container.addEventListener('dragenter', allowSupportedDrop, true)
    container.addEventListener('dragover', allowSupportedDrop, true)
    container.addEventListener('drop', handleDrop, true)
    return () => {
      container.removeEventListener('dragenter', allowSupportedDrop, true)
      container.removeEventListener('dragover', allowSupportedDrop, true)
      container.removeEventListener('drop', handleDrop, true)
    }
  }, [isTranslationCompareMode, note, onMineruBlockDrop])

  useEffect(() => {
    if (!isTranslationCompareMode) {
      return
    }

    const container = containerRef.current
    const pointer = readingPointerRef.current
    const scrollArea = container?.closest<HTMLElement>('.milkdown-note-scroll')
    const surface = container?.closest<HTMLElement>('.milkdown-note-surface')
    if (!container || !pointer || !scrollArea || !surface) {
      return
    }

    const movePointer = (event: PointerEvent): void => {
      const target = getEventTargetElement(event)
      const sentenceSpan = target?.closest<HTMLElement>('.translation-sentence[data-sentence-id]')
      const nextSentenceId = sentenceSpan?.dataset.sentenceId ?? null
      if (hoveredSentenceIdRef.current !== nextSentenceId) {
        hoveredSentenceIdRef.current = nextSentenceId
        setHoveredSentenceId(nextSentenceId)
      }

      const rect = surface.getBoundingClientRect()
      pointer.style.left = `${event.clientX - rect.left}px`
      pointer.style.top = `${event.clientY - rect.top}px`
      pointer.style.opacity = '1'
    }

    const leavePointer = (): void => {
      hoveredSentenceIdRef.current = null
      setHoveredSentenceId(null)
      hideTranslationReadingPointer(pointer)
    }

    scrollArea.addEventListener('pointermove', movePointer)
    scrollArea.addEventListener('pointerleave', leavePointer)
    return () => {
      scrollArea.removeEventListener('pointermove', movePointer)
      scrollArea.removeEventListener('pointerleave', leavePointer)
      leavePointer()
    }
  }, [isTranslationCompareMode])

  const focusEditorView = (): void => {
    const proseMirror = containerRef.current?.querySelector<HTMLElement>('.ProseMirror')
    proseMirror?.focus()
  }

  const refreshLatestMarkdown = (): void => {
    if (!editorRef.current) {
      return
    }

    latestMarkdownRef.current = editorRef.current.getMarkdown()
  }

  const handleSave = (): void => {
    refreshLatestMarkdown()
    onSave?.(latestMarkdownRef.current)
  }

  const handleExport = (format: NoteExportFormat): void => {
    refreshLatestMarkdown()
    onExport?.(format, latestMarkdownRef.current)
  }

  const runPresetCommand = <TPayload,>(
    command: {
      run: (payload?: TPayload) => boolean
    },
    payload?: TPayload
  ): void => {
    if (!editorRef.current) {
      return
    }

    focusEditorView()
    command.run(payload)
    refreshLatestMarkdown()
  }

  const runEditorAction = (action: (ctx: Ctx) => void): void => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    focusEditorView()
    editor.editor.action(action)
    refreshLatestMarkdown()
  }

  const keepEditorSelection = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }

  const setTextBlock = (level: number | null): void => {
    runEditorAction((ctx) => {
      const commands = ctx.get(commandsCtx)
      if (level === null) {
        commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) })
        return
      }

      commands.call(setBlockTypeCommand.key, {
        nodeType: headingSchema.type(ctx),
        attrs: { level }
      })
    })
  }

  const wrapBlock = (kind: 'blockquote' | 'bulletList' | 'orderedList' | 'taskList'): void => {
    runEditorAction((ctx) => {
      const commands = ctx.get(commandsCtx)

      if (kind === 'blockquote') {
        commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) })
        return
      }

      if (kind === 'orderedList') {
        commands.call(wrapInBlockTypeCommand.key, { nodeType: orderedListSchema.type(ctx) })
        return
      }

      if (kind === 'taskList') {
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: listItemSchema.type(ctx),
          attrs: { checked: false }
        })
        return
      }

      commands.call(wrapInBlockTypeCommand.key, { nodeType: bulletListSchema.type(ctx) })
    })
  }

  const toggleInlineCode = (): void => {
    runEditorAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      if (!state.selection.empty) {
        ctx.get(commandsCtx).call(toggleInlineCodeCommand.key)
        return
      }

      const markType = inlineCodeSchema.type(ctx)
      const hasStoredMark = state.storedMarks?.some((mark) => mark.type === markType) ?? false
      const hasCursorMark =
        state.selection instanceof TextSelection
          ? (state.selection.$cursor?.marks().some((mark) => mark.type === markType) ?? false)
          : false

      view.dispatch(hasStoredMark || hasCursorMark ? state.tr.removeStoredMark(markType) : state.tr.addStoredMark(markType.create()))
    })
  }

  const insertInlineFormula = (): void => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    focusEditorView()
    editor.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const selection = view.state.selection
      const selectedText = selection.empty ? '' : view.state.doc.textBetween(selection.from, selection.to, '\n')
      const formulaMarkdown = selectedText.trim() ? `$${trimInlineFormulaDelimiters(selectedText)}$` : '$x$'

      if (!selection.empty) {
        replaceRange(formulaMarkdown, { from: selection.from, to: selection.to })(ctx)
        return
      }

      insert(formulaMarkdown)(ctx)
    })
    refreshLatestMarkdown()
  }

  const insertBlock = (kind: 'codeBlock' | 'divider' | 'image'): void => {
    runEditorAction((ctx) => {
      const commands = ctx.get(commandsCtx)

      if (kind === 'codeBlock') {
        commands.call(setBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx) })
        return
      }

      if (kind === 'divider') {
        commands.call(addBlockTypeCommand.key, { nodeType: hrSchema.type(ctx) })
        return
      }

      commands.call(addBlockTypeCommand.key, { nodeType: imageBlockSchema.type(ctx) })
    })
  }

  const insertFormulaBlock = (): void => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    focusEditorView()
    editor.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const selection = view.state.selection
      const selectedText = selection.empty ? '' : view.state.doc.textBetween(selection.from, selection.to, '\n')
      const formulaMarkdown = selectedText.trim() ? `$$\n${selectedText}\n$$` : '$$\n\n$$'

      if (!selection.empty) {
        replaceRange(formulaMarkdown, { from: selection.from, to: selection.to })(ctx)
        return
      }

      insert(`\n\n${formulaMarkdown}\n\n`)(ctx)
    })
    refreshLatestMarkdown()
  }

  return (
    <div
      className={isTranslationCompareMode ? 'note-surface milkdown-note-surface translation-compare' : 'note-surface milkdown-note-surface'}
      data-hovered-sentence-id={isTranslationCompareMode ? hoveredSentenceId ?? undefined : undefined}
    >
      <div className="note-panel-toolbar milkdown-note-toolbar">
        <div className="note-panel-toolbar-group">
          <span className="codicon codicon-markdown" aria-hidden="true" />
          <span>Markdown 笔记编辑器</span>
        </div>
        {isTranslationCompareMode ? (
          <div className="note-panel-toolbar-group milkdown-compare-mode-badge" aria-label="全文对照模式">
            <span className="codicon codicon-globe" aria-hidden="true" />
            <span>全文对照</span>
          </div>
        ) : null}
        <div className="note-panel-toolbar-group note-format-toolbar milkdown-text-toolbar" aria-label="Milkdown 文本结构工具">
          <button
            className="note-toolbar-button"
            type="button"
            title="正文"
            aria-label="正文"
            onMouseDown={keepEditorSelection}
            onClick={() => setTextBlock(null)}
          >
            正文
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="标题 1"
            aria-label="标题 1"
            onMouseDown={keepEditorSelection}
            onClick={() => runPresetCommand(wrapInHeadingCommand, 1)}
          >
            H1
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="标题 2"
            aria-label="标题 2"
            onMouseDown={keepEditorSelection}
            onClick={() => runPresetCommand(wrapInHeadingCommand, 2)}
          >
            H2
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="标题 3"
            aria-label="标题 3"
            onMouseDown={keepEditorSelection}
            onClick={() => runPresetCommand(wrapInHeadingCommand, 3)}
          >
            H3
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="标题 4"
            aria-label="标题 4"
            onMouseDown={keepEditorSelection}
            onClick={() => setTextBlock(4)}
          >
            H4
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="标题 5"
            aria-label="标题 5"
            onMouseDown={keepEditorSelection}
            onClick={() => setTextBlock(5)}
          >
            H5
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="标题 6"
            aria-label="标题 6"
            onMouseDown={keepEditorSelection}
            onClick={() => setTextBlock(6)}
          >
            H6
          </button>
        </div>
        <div className="note-panel-toolbar-group note-format-toolbar milkdown-list-toolbar" aria-label="Milkdown 列表和引用工具">
          <button
            className="note-toolbar-button"
            type="button"
            title="引用"
            aria-label="引用"
            onMouseDown={keepEditorSelection}
            onClick={() => wrapBlock('blockquote')}
          >
            引用
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="无序列表"
            aria-label="无序列表"
            onMouseDown={keepEditorSelection}
            onClick={() => wrapBlock('bulletList')}
          >
            <span className="codicon codicon-list-unordered" aria-hidden="true" />
            <span>无序</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="有序列表"
            aria-label="有序列表"
            onMouseDown={keepEditorSelection}
            onClick={() => wrapBlock('orderedList')}
          >
            <span className="codicon codicon-list-ordered" aria-hidden="true" />
            <span>有序</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="任务列表"
            aria-label="任务列表"
            onMouseDown={keepEditorSelection}
            onClick={() => wrapBlock('taskList')}
          >
            <span className="codicon codicon-tasklist" aria-hidden="true" />
            <span>Todo</span>
          </button>
        </div>
        <div className="note-panel-toolbar-group note-format-toolbar milkdown-inline-toolbar" aria-label="Milkdown 行内格式工具">
          <button
            className="note-format-button"
            type="button"
            title="粗体"
            aria-label="粗体"
            onMouseDown={keepEditorSelection}
            onClick={() => runPresetCommand(toggleStrongCommand)}
          >
            B
          </button>
          <button
            className="note-format-button italic"
            type="button"
            title="斜体"
            aria-label="斜体"
            onMouseDown={keepEditorSelection}
            onClick={() => runPresetCommand(toggleEmphasisCommand)}
          >
            I
          </button>
          <button
            className="note-format-button strike"
            type="button"
            title="删除线"
            aria-label="删除线"
            onMouseDown={keepEditorSelection}
            onClick={() => runEditorAction((ctx) => ctx.get(commandsCtx).call(toggleStrikethroughCommand.key))}
          >
            S
          </button>
          <button
            className="note-format-button code"
            type="button"
            title="行内代码"
            aria-label="行内代码"
            onMouseDown={keepEditorSelection}
            onClick={toggleInlineCode}
          >
            {'<>'}
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="链接"
            aria-label="链接"
            onMouseDown={keepEditorSelection}
            onClick={() => runEditorAction((ctx) => ctx.get(commandsCtx).call(toggleLinkCommand.key))}
          >
            <span className="codicon codicon-link" aria-hidden="true" />
            <span>链接</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="行内公式"
            aria-label="行内公式"
            onMouseDown={keepEditorSelection}
            onClick={insertInlineFormula}
          >
            <span className="codicon codicon-symbol-operator" aria-hidden="true" />
            <span>行内公式</span>
          </button>
        </div>
        <div className="note-panel-toolbar-group note-insert-toolbar milkdown-block-toolbar" aria-label="Milkdown 插入和块工具">
          <button
            className="note-toolbar-button"
            type="button"
            title="代码块"
            aria-label="代码块"
            onMouseDown={keepEditorSelection}
            onClick={() => insertBlock('codeBlock')}
          >
            <span className="codicon codicon-code" aria-hidden="true" />
            <span>代码块</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="分割线"
            aria-label="分割线"
            onMouseDown={keepEditorSelection}
            onClick={() => insertBlock('divider')}
          >
            <span className="codicon codicon-horizontal-rule" aria-hidden="true" />
            <span>分割线</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="插入图片"
            aria-label="插入图片"
            onMouseDown={keepEditorSelection}
            onClick={() => insertBlock('image')}
          >
            <span className="codicon codicon-file-media" aria-hidden="true" />
            <span>图片</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="插入表格"
            aria-label="插入表格"
            onMouseDown={keepEditorSelection}
            onClick={() => runPresetCommand(insertTableCommand, { row: 3, col: 3 })}
          >
            <span className="codicon codicon-table" aria-hidden="true" />
            <span>表格</span>
          </button>
          <button
            className="note-toolbar-button"
            type="button"
            title="插入公式"
            aria-label="插入公式"
            onMouseDown={keepEditorSelection}
            onClick={insertFormulaBlock}
          >
            <span className="codicon codicon-symbol-operator" aria-hidden="true" />
            <span>公式块</span>
          </button>
        </div>
        {onBackToLegacy ? (
          <div className="note-panel-toolbar-group milkdown-legacy-action">
            <button className="note-toolbar-button" type="button" onClick={onBackToLegacy}>
              旧版块编辑器
            </button>
          </div>
        ) : null}
        {onSave ? (
          <div className="note-panel-toolbar-group milkdown-save-action">
            <button
              className="note-toolbar-button"
              type="button"
              onClick={handleSave}
            >
              保存 Markdown
            </button>
          </div>
        ) : null}
        {onExport ? (
          <div className="note-panel-toolbar-group note-document-actions" aria-label="Markdown 导出">
            <button
              className="note-toolbar-button"
              type="button"
              title="导出 Markdown 文档"
              aria-label="导出 Markdown 文档"
              onClick={() => handleExport('markdown')}
            >
              <span className="codicon codicon-markdown" aria-hidden="true" />
              <span>导出 MD</span>
            </button>
            <button
              className="note-toolbar-button"
              type="button"
              title="导出 Word"
              aria-label="导出 Word"
              onClick={() => handleExport('word')}
            >
              <span className="codicon codicon-file" aria-hidden="true" />
              <span>Word</span>
            </button>
            <button
              className="note-toolbar-button"
              type="button"
              title="导出 PDF"
              aria-label="导出 PDF"
              onClick={() => handleExport('pdf')}
            >
              <span className="codicon codicon-file-pdf" aria-hidden="true" />
              <span>PDF</span>
            </button>
          </div>
        ) : null}
        <div className="note-panel-toolbar-group milkdown-note-status">
          <span>
            {isTranslationCompareMode
              ? '只读对照阅读，悬停句子会同步高亮原文和译文。'
              : isDirty
                ? '有未保存的 Markdown 修改。'
                : '默认 Markdown 编辑，PDF 摘录、公式和图片会随保存保留。'}
          </span>
        </div>
      </div>
      <div className="note-page-scroll milkdown-note-scroll">
        <div className="note-page milkdown-note-page">
          <div className="milkdown-note-host" ref={containerRef} />
        </div>
      </div>
      {isTranslationCompareMode ? <div className="translation-reading-pointer" ref={readingPointerRef} aria-hidden="true" /> : null}
    </div>
  )
}

function getEventTargetElement(event: Event): HTMLElement | null {
  const target = event.target
  if (target instanceof HTMLElement) {
    return target
  }

  if (target instanceof Element) {
    return target as HTMLElement
  }

  return null
}

function hideTranslationReadingPointer(pointer: HTMLDivElement | null): void {
  if (!pointer) {
    return
  }

  pointer.style.opacity = '0'
  pointer.style.left = '-9999px'
  pointer.style.top = '-9999px'
}

function getTranslationCompareSentenceId(rowIndex: number, sentenceIndex: number): string {
  return `compare-r${rowIndex}-s${sentenceIndex}`
}

function buildTranslationCompareSentenceDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') {
      return true
    }

    let dataRowIndex = 0
    node.forEach((rowNode, rowOffset) => {
      if (rowNode.type.name !== 'table_row') {
        return
      }

      const rowPos = pos + 1 + rowOffset
      const cells = getTranslationCompareRowCells(rowNode, rowPos)
      const sourceCell = cells[1]
      const targetCell = cells[2]
      if (!sourceCell || !targetCell) {
        return
      }

      addTranslationCompareSentenceDecorations(decorations, sourceCell.node, sourceCell.pos, dataRowIndex, 'source')
      addTranslationCompareSentenceDecorations(decorations, targetCell.node, targetCell.pos, dataRowIndex, 'target')
      dataRowIndex += 1
    })

    return false
  })

  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty
}

function getTranslationCompareRowCells(rowNode: ProseNode, rowPos: number): Array<{ node: ProseNode; pos: number }> {
  const cells: Array<{ node: ProseNode; pos: number }> = []

  rowNode.forEach((cellNode, cellOffset) => {
    if (cellNode.type.name !== 'table_cell') {
      return
    }

    cells.push({ node: cellNode, pos: rowPos + 1 + cellOffset })
  })

  return cells
}

function addTranslationCompareSentenceDecorations(
  decorations: Decoration[],
  cellNode: ProseNode,
  cellPos: number,
  rowIndex: number,
  side: 'source' | 'target'
): void {
  const fragments = getTranslationCompareTextFragments(cellNode, cellPos)
  if (fragments.length === 0) {
    return
  }

  const text = fragments.map((fragment) => fragment.text).join('')
  const sentenceRanges = splitTranslationCompareSentenceRanges(text)
  sentenceRanges.forEach((range, sentenceIndex) => {
    const sentenceId = getTranslationCompareSentenceId(rowIndex, sentenceIndex)
    addTranslationCompareDecorationRange(decorations, fragments, range, sentenceId, side)
  })
}

function getTranslationCompareTextFragments(
  node: ProseNode,
  nodePos: number
): Array<{ text: string; from: number; offsetFrom: number; offsetTo: number }> {
  const fragments: Array<{ text: string; from: number; offsetFrom: number; offsetTo: number }> = []
  let textOffset = 0

  node.descendants((childNode, childPos) => {
    if (!childNode.isText || !childNode.text) {
      return true
    }

    const text = childNode.text
    fragments.push({
      text,
      from: nodePos + 1 + childPos,
      offsetFrom: textOffset,
      offsetTo: textOffset + text.length
    })
    textOffset += text.length

    return false
  })

  return fragments
}

function addTranslationCompareDecorationRange(
  decorations: Decoration[],
  fragments: Array<{ from: number; offsetFrom: number; offsetTo: number }>,
  range: { from: number; to: number },
  sentenceId: string,
  side: 'source' | 'target'
): void {
  fragments.forEach((fragment) => {
    const overlapFrom = Math.max(range.from, fragment.offsetFrom)
    const overlapTo = Math.min(range.to, fragment.offsetTo)
    if (overlapTo <= overlapFrom) {
      return
    }

    decorations.push(
      Decoration.inline(fragment.from + overlapFrom - fragment.offsetFrom, fragment.from + overlapTo - fragment.offsetFrom, {
        class: 'translation-sentence',
        'data-sentence-id': sentenceId,
        'data-sentence-side': side
      })
    )
  })
}

function splitTranslationCompareSentenceRanges(text: string): Array<{ from: number; to: number }> {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.trim()) {
    return []
  }

  const sentenceEnds = new Set(['.', '!', '?', '。', '！', '？', ';', '；'])
  const ranges: Array<{ from: number; to: number }> = []
  let start = 0

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index]
    if (!sentenceEnds.has(current)) {
      continue
    }

    const next = normalized[index + 1] ?? ''
    if (current === '.' && next && !/\s/.test(next)) {
      continue
    }

    pushTrimmedTranslationSentenceRange(ranges, normalized, start, index + 1)
    start = index + 1
  }

  pushTrimmedTranslationSentenceRange(ranges, normalized, start, normalized.length)
  return ranges.length > 0 ? ranges : [{ from: 0, to: normalized.length }]
}

function pushTrimmedTranslationSentenceRange(
  ranges: Array<{ from: number; to: number }>,
  text: string,
  from: number,
  to: number
): void {
  let nextFrom = from
  let nextTo = to
  while (nextFrom < nextTo && /\s/.test(text[nextFrom])) {
    nextFrom += 1
  }
  while (nextTo > nextFrom && /\s/.test(text[nextTo - 1])) {
    nextTo -= 1
  }

  if (nextTo > nextFrom) {
    ranges.push({ from: nextFrom, to: nextTo })
  }
}

function clearTranslationCompareHoveredSentence(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>('.translation-sentence.translation-sentence--hovered')
    .forEach((span) => span.classList.remove('translation-sentence--hovered'))
}

function syncTranslationCompareHoveredSentence(container: HTMLElement, hoveredSentenceId: string | null): void {
  container.querySelectorAll<HTMLElement>('.translation-sentence[data-sentence-id]').forEach((span) => {
    span.classList.toggle('translation-sentence--hovered', Boolean(hoveredSentenceId && span.dataset.sentenceId === hoveredSentenceId))
  })
}

function trimInlineFormulaDelimiters(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    return trimmed.replace(/^\$+/, '').replace(/\$+$/, '').trim()
  }

  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return trimmed.slice(2, -2).trim()
  }

  return trimmed
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.resolve('')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取图片失败')))
    reader.readAsDataURL(file)
  })
}

function dedupePdfExcerptItems<T extends { text: string; sourceRef: { pageNo?: number; rect?: unknown; quote?: string }; blockId?: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>()

  return items.filter((item) => {
    const normalizedText = item.text.replace(/\s+/g, ' ').trim()
    if (!normalizedText) {
      return false
    }

    const sourceRefKey = JSON.stringify({
      pageNo: item.sourceRef.pageNo,
      rect: item.sourceRef.rect,
      quote: item.sourceRef.quote ?? normalizedText
    })
    const key = item.blockId ? `block:${item.blockId}` : `source:${sourceRefKey}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function hasSupportedDropPayload(dataTransfer: DataTransfer): boolean {
  return hasDataTransferType(dataTransfer, pdfExcerptDragMimeType) || hasMineruBlockDragPayload(dataTransfer)
}

function hasDataTransferType(dataTransfer: DataTransfer, mimeType: string): boolean {
  const expectedType = mimeType.toLowerCase()
  return Array.from(dataTransfer.types).some((type) => type.toLowerCase() === expectedType)
}

function getPdfExcerptPayloadBlockId(
  payload: unknown,
  index: number
): string {
  const blockId =
    payload && typeof payload === 'object' && 'blockId' in payload && typeof (payload as { blockId?: unknown }).blockId === 'string'
      ? (payload as { blockId: string }).blockId
      : ''

  return blockId.trim()
    ? blockId
    : `drop_${Date.now()}_${index}`
}

function createPdfExcerptNodes(
  schema: Schema,
  items: PdfExcerptDropPayload[]
): ProseNode[] {
  const nodeType = schema.nodes.pdf_excerpt
  const paragraphType = schema.nodes.paragraph
  return items.map((payload, index) => {
    const text = payload.text.trim() || payload.label
    const label = payload.label.trim() || `PDF 摘录 · 第 ${payload.pageNo} 页`
    const blockId = getPdfExcerptPayloadBlockId(payload, index)
    const attrs = {
      blockId,
      label,
      pageNo: payload.pageNo,
      quote: text,
      sourceRefsJson: JSON.stringify([normalizePdfExcerptSourceRef(payload.sourceRef, payload, blockId)])
    }

    if (!nodeType) {
      return paragraphType.create(null, schema.text(text))
    }

    return nodeType.create(attrs, text ? schema.text(text) : undefined)
  })
}

function createMineruFormulaNodes(
  schema: Schema,
  payload: MineruBlockDragPayload,
  noteId: string,
  insertedBlockId?: string | void
): ProseNode[] {
  const nodeType = schema.nodes.formula
  const paragraphType = schema.nodes.paragraph
  const sourceLatex = payload.block.text?.trim() || ''
  const latex = normalizeFormulaLatex(sourceLatex)
  const blockId = typeof insertedBlockId === 'string' && insertedBlockId.trim()
    ? insertedBlockId
    : getMineruFormulaFallbackBlockId(noteId, payload.block.id)
  const sourceRef = normalizePdfExcerptSourceRef(
    {
      type: 'note_block',
      paperId: '',
      noteId,
      noteBlockId: blockId,
      pageNo: payload.block.pageNo,
      mineruBlockId: payload.block.id,
      rect: payload.block.rect,
      quote: sourceLatex
    },
    {
      kind: 'pdf_excerpt',
      filePath: payload.paperPath,
      noteId,
      blockId,
      pageNo: payload.block.pageNo,
      text: sourceLatex,
      label: `公式 · 第 ${payload.block.pageNo} 页`,
      sourceRef: {
        type: 'note_block',
        noteId,
        noteBlockId: blockId,
        pageNo: payload.block.pageNo,
        mineruBlockId: payload.block.id,
        rect: payload.block.rect,
        quote: sourceLatex
      }
    },
    blockId
  )
  const attrs: FormulaAttrs = {
    blockId,
    label: `公式 · 第 ${payload.block.pageNo} 页`,
    pageNo: payload.block.pageNo,
    latex,
    sourceRefsJson: JSON.stringify([sourceRef])
  }

  if (!nodeType) {
    return [paragraphType.create(null, schema.text(latex || attrs.label))]
  }

  return [nodeType.create(attrs)]
}

function createMineruImageNodes(schema: Schema, payload: MineruBlockDragPayload): ProseNode[] {
  const imageBlockType = schema.nodes['image-block']
  const imageType = schema.nodes.image
  const paragraphType = schema.nodes.paragraph
  const src = payload.block.imageDataUrl ?? ''
  const caption = getMineruImageCaption(payload)

  if (imageBlockType && src) {
    return [
      imageBlockType.create({
        src,
        caption,
        ratio: 1
      })
    ]
  }

  if (imageType && src) {
    return [paragraphType.create(null, imageType.create({ src, alt: caption, title: caption }))]
  }

  return [paragraphType.create(null, schema.text(caption || 'MinerU 图片'))]
}

function getMineruImageCaption(payload: MineruBlockDragPayload): string {
  const caption = payload.block.caption?.replace(/\s+/g, ' ').trim()
  if (caption) {
    return caption
  }

  const text = getMineruBlockPlainText(payload.block).replace(/\s+/g, ' ').trim()
  if (text && text !== `${payload.block.rawType} p.${payload.block.pageNo}`) {
    return text.slice(0, 160)
  }

  return `${getMineruImageTypeLabel(payload.block.type)} · p.${payload.block.pageNo}`
}

function getMineruImageTypeLabel(type: MineruBlockDragPayload['block']['type']): string {
  if (type === 'chart') {
    return '图表'
  }

  if (type === 'table') {
    return '表格截图'
  }

  return '图片'
}

function restoreImagePlaceholdersFromLinks(editor: Crepe, placeholders: NoteComplexBlockPlaceholder[]): void {
  editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const imageBlockType = view.state.schema.nodes['image-block']
    const imageType = view.state.schema.nodes.image
    const paragraphType = view.state.schema.nodes.paragraph

    if (!imageBlockType && (!imageType || !paragraphType)) {
      return
    }

    const imagePlaceholdersById = new Map(
      placeholders
        .filter((placeholder) => (placeholder.type === 'image' || placeholder.type === 'screenshot') && placeholder.imageSrc)
        .map((placeholder) => [placeholder.blockId, placeholder])
    )
    const operations: Array<{ pos: number; from: number; to: number; placeholder: NoteComplexBlockPlaceholder }> = []
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') {
        return true
      }

      const link = readComplexBlockLink(node)
      if (!link) {
        return false
      }

      const payload = decodeComplexBlockHref(link.href)
      if (!payload || (payload.kind !== 'image' && payload.kind !== 'screenshot')) {
        return false
      }

      const placeholder = imagePlaceholdersById.get(payload.blockId)
      if (!placeholder?.imageSrc) {
        return false
      }

      operations.push({
        pos,
        from: pos,
        to: pos + node.nodeSize,
        placeholder
      })

      return false
    })

    if (operations.length === 0) {
      return
    }

    const transaction = operations
      .sort((left, right) => right.pos - left.pos)
      .reduce((currentTransaction, operation) => {
        const attrs = {
          src: operation.placeholder.imageSrc ?? '',
          caption: operation.placeholder.imageCaption ?? operation.placeholder.label,
          ratio: operation.placeholder.imageRatio ?? 1
        }

        if (imageBlockType) {
          return currentTransaction.replaceWith(operation.from, operation.to, imageBlockType.create(attrs))
        }

        return currentTransaction.replaceWith(
          operation.from,
          operation.to,
          paragraphType.create(null, imageType.create({ src: attrs.src, alt: attrs.caption, title: attrs.caption }))
        )
      }, view.state.tr)

    if (transaction.docChanged) {
      view.dispatch(transaction)
    }
  })
}

function restoreFormulaPlaceholdersFromLinks(editor: Crepe, placeholders: NoteComplexBlockPlaceholder[]): void {
  editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const formulaType = view.state.schema.nodes.formula

    if (!formulaType) {
      return
    }

    const formulaPlaceholdersById = new Map(
      placeholders
        .filter((placeholder) => placeholder.type === 'formula')
        .map((placeholder) => [placeholder.blockId, placeholder])
    )
    const operations: Array<
      | { kind: 'replace'; pos: number; from: number; to: number; attrs: FormulaAttrs }
      | { kind: 'update'; pos: number; attrs: FormulaAttrs }
    > = []
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'formula') {
        const attrs = normalizeExistingFormulaAttrs(node.attrs as FormulaAttrs, formulaPlaceholdersById)
        if (attrs) {
          operations.push({
            kind: 'update',
            pos,
            attrs
          })
        }
        return false
      }

      if (node.type.name !== 'paragraph') {
        return true
      }

      const link = readComplexBlockLink(node)
      if (!link) {
        return false
      }

      const payload = decodeComplexBlockHref(link.href)

      if (payload?.kind === 'formula') {
        const placeholder = formulaPlaceholdersById.get(payload.blockId)
        const sourceRefsJson = payload.sourceRefsJson || placeholder?.sourceRefsJson || ''
        operations.push({
          kind: 'replace',
          pos,
          from: pos,
          to: pos + node.nodeSize,
          attrs: {
            blockId: payload.blockId,
            label: placeholder?.label || link.label || '公式',
            pageNo: payload.pageNo || placeholder?.pageNo,
            latex: readFormulaLatex({
              linkTitle: link.title,
              payloadText: payload.text,
              sourceRefsJson,
              fallback: placeholder?.quote || link.label
            }),
            sourceRefsJson
          }
        })
      }

      return false
    })

    if (operations.length === 0) {
      return
    }

    const transaction = operations
      .sort((left, right) => right.pos - left.pos)
      .reduce(
        (currentTransaction, operation) =>
          operation.kind === 'replace'
            ? currentTransaction.replaceWith(operation.from, operation.to, formulaType.create(operation.attrs))
            : currentTransaction.setNodeMarkup(operation.pos, undefined, operation.attrs),
        view.state.tr
      )

    if (transaction.docChanged) {
      view.dispatch(transaction)
    }
  })
}

type PdfExcerptAttrs = {
  blockId: string
  label: string
  pageNo?: number
  quote?: string
  sourceRefsJson?: string
}

function restorePdfExcerptPlaceholdersFromLinks(editor: Crepe, placeholders: NoteComplexBlockPlaceholder[]): void {
  editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const pdfExcerptType = view.state.schema.nodes.pdf_excerpt

    if (!pdfExcerptType) {
      return
    }

    const pdfExcerptPlaceholdersById = new Map(
      placeholders
        .filter((placeholder) => placeholder.type === 'pdf_excerpt')
        .map((placeholder) => [placeholder.blockId, placeholder])
    )
    const operations: Array<{ pos: number; from: number; to: number; attrs: PdfExcerptAttrs; text: string }> = []
    const inlineMathOperations: Array<{ pos: number; attrs: Record<string, unknown> }> = []
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'pdf_excerpt') {
        const attrs = node.attrs as PdfExcerptAttrs
        const currentText = node.textContent
        const text = cleanMilkdownSourceText(readSourceRefQuote(attrs.sourceRefsJson) || attrs.quote || node.textContent)
        const inlineContent = text ? createInlineContentWithMath(view.state.schema, text) : null
        const shouldReplaceContent = Boolean(
          text &&
            (currentText !== text ||
              cleanMilkdownSourceText(currentText) !== text ||
              (!hasInlineMathNode(node) && inlineContent))
        )
        if (shouldReplaceContent) {
          operations.push({
            pos,
            from: pos,
            to: pos + node.nodeSize,
            attrs: {
              ...attrs,
              quote: text
            },
            text
          })
        }
        node.descendants((child, offset) => {
          if (child.type.name !== 'math_inline') {
            return true
          }

          const value = typeof child.attrs.value === 'string' ? child.attrs.value : ''
          const normalizedValue = normalizeFormulaLatex(value)
          if (normalizedValue && normalizedValue !== value) {
            inlineMathOperations.push({
              pos: pos + offset + 1,
              attrs: {
                ...child.attrs,
                value: normalizedValue
              }
            })
          }

          return false
        })
        return false
      }

      if (node.type.name !== 'paragraph') {
        return true
      }

      const link = readComplexBlockLink(node)
      if (!link) {
        return false
      }

      const payload = decodeComplexBlockHref(link.href)

      if (payload?.kind !== 'pdf_excerpt') {
        return false
      }

      const placeholder = pdfExcerptPlaceholdersById.get(payload.blockId)
      const sourceRefsJson = payload.sourceRefsJson || placeholder?.sourceRefsJson || ''
      const text = cleanMilkdownSourceText(
        readSourceRefQuote(sourceRefsJson) || placeholder?.quote || restoreMarkdownLinkTitle(link.title) || link.label
      )
      operations.push({
        pos,
        from: pos,
        to: pos + node.nodeSize,
        attrs: {
          blockId: payload.blockId,
          label: placeholder?.label || link.label || 'PDF excerpt',
          pageNo: payload.pageNo || placeholder?.pageNo,
          quote: text,
          sourceRefsJson
        },
        text
      })

      return false
    })

    if (operations.length === 0 && inlineMathOperations.length === 0) {
      return
    }

    const transaction = operations
      .sort((left, right) => right.pos - left.pos)
      .reduce(
        (currentTransaction, operation) =>
          currentTransaction.replaceWith(
            operation.from,
            operation.to,
            pdfExcerptType.create(
              operation.attrs,
              operation.text
                ? createInlineContentWithMath(view.state.schema, operation.text) ?? view.state.schema.text(operation.text)
                : undefined
            )
          ),
        view.state.tr
      )
    inlineMathOperations
      .sort((left, right) => right.pos - left.pos)
      .forEach((operation) => {
        transaction.setNodeMarkup(operation.pos, undefined, operation.attrs)
      })

    if (transaction.docChanged) {
      view.dispatch(transaction)
    }
  })
}

function normalizeInlineMathNodes(editor: Crepe): void {
  editor.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const operations: Array<{ pos: number; attrs: Record<string, unknown> }> = []

    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'math_inline') {
        return true
      }

      const value = typeof node.attrs.value === 'string' ? node.attrs.value : ''
      const normalizedValue = normalizeFormulaLatex(value)
      if (normalizedValue && normalizedValue !== value) {
        operations.push({
          pos,
          attrs: {
            ...node.attrs,
            value: normalizedValue
          }
        })
      }

      return false
    })

    if (operations.length === 0) {
      return
    }

    const transaction = operations
      .sort((left, right) => right.pos - left.pos)
      .reduce(
        (currentTransaction, operation) => currentTransaction.setNodeMarkup(operation.pos, undefined, operation.attrs),
        view.state.tr
      )

    if (transaction.docChanged) {
      view.dispatch(transaction)
    }
  })
}

function normalizeExistingFormulaAttrs(
  attrs: FormulaAttrs,
  formulaPlaceholdersById: Map<string, NoteComplexBlockPlaceholder>
): FormulaAttrs | null {
  const placeholder = attrs.blockId ? formulaPlaceholdersById.get(attrs.blockId) : undefined
  const sourceRefsJson = attrs.sourceRefsJson || placeholder?.sourceRefsJson || ''
  const latex = readFormulaLatex({
    payloadText: attrs.latex && looksLikeResolvedFormulaLatex(attrs.latex) ? attrs.latex : undefined,
    sourceRefsJson,
    fallback: placeholder?.quote || attrs.label
  })
  const nextAttrs: FormulaAttrs = {
    ...attrs,
    label: attrs.label || placeholder?.label || '公式',
    pageNo: attrs.pageNo ?? placeholder?.pageNo,
    latex,
    sourceRefsJson
  }

  return areFormulaAttrsEqual(attrs, nextAttrs) ? null : nextAttrs
}

function looksLikeResolvedFormulaLatex(value: string | undefined): boolean {
  return Boolean(value && value.trim() && value.trim() !== '公式')
}

function areFormulaAttrsEqual(left: FormulaAttrs, right: FormulaAttrs): boolean {
  return (
    left.blockId === right.blockId &&
    left.label === right.label &&
    left.pageNo === right.pageNo &&
    left.latex === right.latex &&
    left.sourceRefsJson === right.sourceRefsJson
  )
}

function readComplexBlockLink(node: ProseNode): { href: string; title?: string; label: string } | null {
  let matchedLink: { href: string; title?: string; label: string } | null = null

  node.descendants((child) => {
    const linkMark = child.marks.find(
      (mark) =>
        mark.type.name === 'link' &&
        typeof mark.attrs.href === 'string' &&
        mark.attrs.href.startsWith('inspiration-note-block://')
    )

    if (!linkMark) {
      return !matchedLink
    }

    matchedLink = {
      href: linkMark.attrs.href as string,
      title: typeof linkMark.attrs.title === 'string' ? linkMark.attrs.title : undefined,
      label: child.textContent.trim() || node.textContent.trim()
    }

    return false
  })

  return matchedLink
}

function readSourceRefQuote(sourceRefsJson: string | undefined): string {
  if (!sourceRefsJson) {
    return ''
  }

  try {
    const parsed = JSON.parse(sourceRefsJson) as SourceRef[]
    if (!Array.isArray(parsed)) {
      return ''
    }

    return parsed
      .map((sourceRef) => (typeof sourceRef.quote === 'string' ? sourceRef.quote.trim() : ''))
      .find((quote) => quote.length > 0) ?? ''
  } catch {
    return ''
  }
}

function restoreMarkdownLinkTitle(value: string | undefined): string {
  return value ? value.replace(/\\n/g, '\n').replace(/&quot;/g, '"') : ''
}

function cleanMilkdownSourceText(value: string): string {
  return stripMarkdownEmphasisFences(value)
    .replace(/\\?<br\s*\/?\\?>/gi, '\n')
    .replace(/\\?<\/?(?:span|u|mark)\b[^>]*\\?>/gi, '')
    .replace(/\\?&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/\\?&lt;\/?(?:span|u|mark)\b[\s\S]*?&gt;/gi, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\\(?=[<>\[\]])/g, '')
}

function stripMarkdownEmphasisFences(value: string): string {
  let next = value

  for (let index = 0; index < 4; index += 1) {
    const stripped = next.replace(
      /(^|[\s([{"'“‘>])(\*{2,})(?=\S)([\s\S]*?\S)\2(?=$|[\s)\].,;:!?"'”’])/g,
      '$1$3'
    )

    if (stripped === next) {
      break
    }

    next = stripped
  }

  return next
    .replace(/(^|[\s([{"'“‘>])\*{2,}(?=\S)/g, '$1')
    .replace(/(?<=\S)\*{2,}(?=$|[\s)\].,;:!?"'”’])/g, '')
}

function hasInlineMathNode(node: ProseNode): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name === 'math_inline') {
      return true
    }
  }

  return false
}

function createInlineContentWithMath(schema: Schema, text: string): ProseNode[] | null {
  const mathInlineType = schema.nodes.math_inline
  if (!mathInlineType) {
    return null
  }

  const ranges = findInlineLatexRanges(text)
  if (ranges.length === 0) {
    return null
  }

  const nodes: ProseNode[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.from > cursor) {
      const plainText = text.slice(cursor, range.from)
      if (plainText) {
        nodes.push(schema.text(plainText))
      }
    }

    const latex = normalizeFormulaLatex(text.slice(range.from, range.to))
    if (latex) {
      nodes.push(mathInlineType.create({ value: latex }))
    }
    cursor = range.to
  }

  if (cursor < text.length) {
    const plainText = text.slice(cursor)
    if (plainText) {
      nodes.push(schema.text(plainText))
    }
  }

  return nodes.length > 0 ? nodes : null
}

function findInlineLatexRanges(text: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = findDelimitedInlineLatexRanges(text)
  let index = 0

  while (index < text.length) {
    const start = findNextInlineLatexStart(text, index)
    if (start < 0) {
      break
    }

    const containingRange = findRangeContaining(ranges, start)
    if (containingRange) {
      index = containingRange.to
      continue
    }

    const end = findInlineLatexEnd(text, start)
    if (end > start) {
      const candidate = text.slice(start, end)
      if (looksLikeInlineLatexCandidate(candidate)) {
        ranges.push(trimInlineLatexRange(text, start, end))
        index = end
        continue
      }
    }

    index = start + 1
  }

  return mergeInlineLatexRanges(ranges)
}

function findDelimitedInlineLatexRanges(text: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]
    if (current === '$' && text[index - 1] !== '\\' && text[index + 1] !== '$') {
      const end = findClosingDollar(text, index + 1)
      if (end > index) {
        const candidate = text.slice(index, end + 1)
        if (looksLikeInlineLatexCandidate(candidate)) {
          ranges.push({ from: index, to: end + 1 })
          index = end
        }
      }
      continue
    }

    if (current === '\\' && text[index + 1] === '(') {
      const end = text.indexOf('\\)', index + 2)
      if (end > index) {
        const candidate = text.slice(index, end + 2)
        if (looksLikeInlineLatexCandidate(candidate)) {
          ranges.push({ from: index, to: end + 2 })
          index = end + 1
        }
      }
    }
  }

  return ranges
}

function findClosingDollar(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '$' && text[index - 1] !== '\\' && text[index + 1] !== '$') {
      return index
    }
  }

  return -1
}

function findRangeContaining(ranges: Array<{ from: number; to: number }>, index: number): { from: number; to: number } | null {
  return ranges.find((range) => index >= range.from && index < range.to) ?? null
}

function findNextInlineLatexStart(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const current = text[index]
    if (current === '\\') {
      return index
    }

    if (current === '(') {
      const preview = text.slice(index, Math.min(text.length, index + 180))
      if (/\\{1,2}[A-Za-z]+|[_^]/.test(preview)) {
        return index
      }
    }
  }

  return -1
}

function findInlineLatexEnd(text: string, start: number): number {
  let braceDepth = 0
  let parenDepth = 0
  const maxEnd = Math.min(text.length, start + 240)

  for (let index = start; index < maxEnd; index += 1) {
    const current = text[index]
    if (current === '{') {
      braceDepth += 1
    } else if (current === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
    } else if (current === '(') {
      parenDepth += 1
    } else if (current === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
    }

    if (braceDepth === 0 && parenDepth === 0 && index > start + 4) {
      const nextTwo = text.slice(index, index + 2)
      const afterCurrent = text.slice(index + 1)
      const candidate = text.slice(start, index + 1)
      if (/^\s*[,，]\s+[A-Za-z]/.test(afterCurrent)) {
        return index + 1
      }
      if (/^[.;；。]\s+/.test(nextTwo)) {
        return index + 1
      }
      if (
        (current === '}' || current === ')') &&
        looksLikeInlineLatexCandidate(candidate) &&
        looksLikeProseAfterInlineLatex(afterCurrent)
      ) {
        return index + 1
      }
    }
  }

  return maxEnd
}

function trimInlineLatexRange(text: string, from: number, to: number): { from: number; to: number } {
  let nextFrom = from
  let nextTo = to

  while (nextFrom < nextTo && /\s/.test(text[nextFrom])) {
    nextFrom += 1
  }
  while (nextTo > nextFrom && /[\s,，.;；。]/.test(text[nextTo - 1])) {
    nextTo -= 1
  }

  return { from: nextFrom, to: nextTo }
}

function looksLikeInlineLatexCandidate(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return false
  }

  const latexSignals = normalized.match(/\\{1,2}[A-Za-z]+|[_^{}=+\-*/]/g) ?? []
  if (latexSignals.length < 3) {
    return false
  }

  const proseRemainder = normalized
    .replace(/\\{1,2}[A-Za-z]+/g, ' ')
    .replace(/[{}_^=+\-*/(),.;:[\]\d]/g, ' ')
  const proseWords = proseRemainder.match(/[A-Za-z]{3,}/g) ?? []

  return proseWords.length <= 2
}

function looksLikeProseAfterInlineLatex(value: string): boolean {
  const trimmed = value.trimStart()

  return /^[A-Za-z]{2,}\b/.test(trimmed)
}

function mergeInlineLatexRanges(ranges: Array<{ from: number; to: number }>): Array<{ from: number; to: number }> {
  const merged: Array<{ from: number; to: number }> = []
  for (const range of ranges) {
    if (range.to <= range.from) {
      continue
    }

    const previous = merged.at(-1)
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

function getMineruFormulaFallbackBlockId(noteId: string, mineruBlockId: string): string {
  return `note_block_mineru_${hashString(`${noteId}:${mineruBlockId}`)}`
}

function hashString(input: string): string {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}

function normalizePdfExcerptSourceRef(sourceRef: SourceRef, payload: PdfExcerptDropPayload, blockId: string): SourceRef {
  if (sourceRef.type === 'note_block') {
    return {
      ...sourceRef,
      noteId: sourceRef.noteId ?? payload.noteId,
      noteBlockId: sourceRef.noteBlockId ?? blockId,
      pageNo: sourceRef.pageNo ?? payload.pageNo,
      quote: sourceRef.quote ?? payload.text
    }
  }

  return {
    ...sourceRef,
    pageNo: sourceRef.pageNo ?? payload.pageNo,
    quote: sourceRef.quote ?? payload.text
  }
}

function getSafeBlockInsertPos(doc: ProseNode, pos: number): number {
  const maxPos = doc.content.size
  const resolved = doc.resolve(Math.min(Math.max(pos, 0), maxPos))

  if (resolved.depth <= 0) {
    return maxPos
  }

  return Math.min(resolved.after(1), maxPos)
}

function getDropInsertAfterBlockId(note: NoteDocument, doc: ProseNode, pos: number): string | null | undefined {
  const renderedBlockIds = note.blocks
    .filter((block) => block.type !== 'paragraph' || getNoteBlockText(block).trim().length > 0)
    .map((block) => block.id)

  if (renderedBlockIds.length === 0) {
    return null
  }

  let offset = 0
  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index)
    const start = offset + 1
    const middle = start + child.nodeSize / 2

    if (pos < middle) {
      const previousBlockIndex = index - 2
      return previousBlockIndex >= 0 ? renderedBlockIds[previousBlockIndex] : null
    }

    offset += child.nodeSize
  }

  return renderedBlockIds.at(-1)
}
