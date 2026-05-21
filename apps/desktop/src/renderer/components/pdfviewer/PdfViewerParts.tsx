import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { PdfAnnotation, PdfAnnotationColor, PdfSelection } from '@thesis-agent/pdf'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type { PdfLinkedNoteRegion } from '../../app/types'
import type { PageSize, PdfBitmapPageVariant, PdfRenderMode } from './pdfViewerShared'
import {
  annotationColors,
  annotationPreviewStyle,
  annotationMarkStyle,
  createCanvasMetrics,
  defaultOutputScale,
  defaultHighlightOpacity,
  defaultHighlightThickness,
  getCanvasOutputScale,
  highlightPreviewStyle,
  isSameColor,
  linkedNoteRegionStyle,
  minHighlightThickness,
  maxHighlightThickness,
  normalizeAnnotationRects,
  normalizeSelectedText,
  overviewOutputScale,
  overviewScale
} from './pdfViewerShared'

export function PdfScrollStrip({
  filePath,
  documentProxy,
  pageNumbers,
  scale,
  renderMode,
  currentPageNumber,
  annotations,
  linkedNoteRegions,
  focusedPdfSourceRegionId,
  onActivatePage,
  onSelectionMouseUp,
  onSelectionKeyUp,
  onLinkedNoteRegionSelect,
  onLinkedNoteRegionDragStart
}: {
  filePath: string
  documentProxy: PDFDocumentProxy | null
  pageNumbers: number[]
  scale: number
  renderMode: PdfRenderMode
  currentPageNumber: number
  annotations: PdfAnnotation[]
  linkedNoteRegions: PdfLinkedNoteRegion[]
  focusedPdfSourceRegionId?: string
  onActivatePage: (pageNumber: number) => void
  onSelectionMouseUp: () => void
  onSelectionKeyUp: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onLinkedNoteRegionSelect?: (region: PdfLinkedNoteRegion) => void
  onLinkedNoteRegionDragStart?: (event: React.DragEvent<HTMLButtonElement>, region: PdfLinkedNoteRegion) => void
}): ReactElement {
  return (
    <div className="pdf-scroll-strip" role="list">
      {pageNumbers.map((pageNumber) => (
        <PdfBitmapPage
          key={pageNumber}
          filePath={filePath}
          documentProxy={documentProxy}
          pageNumber={pageNumber}
          scale={scale}
          renderMode={renderMode}
          variant="scroll"
          isCurrent={pageNumber === currentPageNumber}
          annotations={annotations.filter((annotation) => annotation.pageNo === pageNumber)}
          linkedNoteRegions={linkedNoteRegions.filter((region) => region.pageNo === pageNumber)}
          focusedPdfSourceRegionId={focusedPdfSourceRegionId}
          onActivatePage={onActivatePage}
          onSelectionMouseUp={onSelectionMouseUp}
          onSelectionKeyUp={onSelectionKeyUp}
          onLinkedNoteRegionSelect={onLinkedNoteRegionSelect}
          onLinkedNoteRegionDragStart={onLinkedNoteRegionDragStart}
        />
      ))}
    </div>
  )
}

export function PdfOverviewPanel({
  filePath,
  documentProxy,
  pageNumbers,
  currentPageNumber,
  renderMode,
  onClose,
  onJumpToPage
}: {
  filePath: string
  documentProxy: PDFDocumentProxy | null
  pageNumbers: number[]
  currentPageNumber: number
  renderMode: PdfRenderMode
  onClose: () => void
  onJumpToPage: (pageNumber: number) => void
}): ReactElement {
  return (
    <div className="pdf-overview-panel" role="dialog" aria-label="页面总览">
      <div className="pdf-overview-titlebar">
        <strong>页面总览</strong>
        <span>{pageNumbers.length} 页</span>
        <button type="button" title="关闭页面总览" onClick={onClose}>
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>
      <div className="pdf-overview-grid">
        {pageNumbers.map((pageNumber) => (
          <PdfBitmapPage
            key={pageNumber}
            filePath={filePath}
            documentProxy={documentProxy}
            pageNumber={pageNumber}
            scale={overviewScale}
            outputScale={overviewOutputScale}
            renderMode={renderMode}
            variant="overview"
            isCurrent={pageNumber === currentPageNumber}
            onActivatePage={onJumpToPage}
          />
        ))}
      </div>
    </div>
  )
}

export function PdfBitmapPage({
  filePath,
  documentProxy,
  pageNumber,
  scale,
  outputScale,
  renderMode,
  variant,
  isCurrent = false,
  annotations = [],
  linkedNoteRegions = [],
  focusedPdfSourceRegionId,
  eager = false,
  onActivatePage,
  onSelectionMouseUp,
  onSelectionKeyUp,
  onLinkedNoteRegionSelect,
  onLinkedNoteRegionDragStart
}: {
  filePath: string
  documentProxy: PDFDocumentProxy | null
  pageNumber: number
  scale: number
  outputScale?: number
  renderMode: PdfRenderMode
  variant: PdfBitmapPageVariant
  isCurrent?: boolean
  annotations?: PdfAnnotation[]
  linkedNoteRegions?: PdfLinkedNoteRegion[]
  focusedPdfSourceRegionId?: string
  eager?: boolean
  onActivatePage?: (pageNumber: number) => void
  onSelectionMouseUp?: () => void
  onSelectionKeyUp?: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onLinkedNoteRegionSelect?: (region: PdfLinkedNoteRegion) => void
  onLinkedNoteRegionDragStart?: (event: React.DragEvent<HTMLButtonElement>, region: PdfLinkedNoteRegion) => void
}): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const resolvedOutputScale = outputScale ?? getCanvasOutputScale()
  const [shouldRender, setShouldRender] = useState(eager)
  const [pageSize, setPageSize] = useState<PageSize | null>(null)
  const [bitmapDataUrl, setBitmapDataUrl] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const [pageError, setPageError] = useState('')
  const pageStyle = pageSize ? { width: `${pageSize.width}px`, height: `${pageSize.height}px` } : undefined
  const canActivate = typeof onActivatePage === 'function'
  const canSelectText = variant === 'scroll'
  const className = [
    'pdf-bitmap-page',
    `variant-${variant}`,
    isCurrent ? 'current' : '',
    isRendering ? 'loading' : '',
    pageError ? 'error' : ''
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (eager) {
      setShouldRender(true)
    }
  }, [eager])

  useEffect(() => {
    if (shouldRender) {
      return
    }

    const element = containerRef.current
    if (!element || !('IntersectionObserver' in window)) {
      setShouldRender(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { root: null, rootMargin: variant === 'overview' ? '420px 0px' : '960px 0px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [shouldRender, variant])

  useEffect(() => {
    if (!documentProxy) {
      setPageSize(null)
      return
    }

    const pdfDocument: PDFDocumentProxy = documentProxy
    let cancelled = false

    async function readPageSize(): Promise<void> {
      try {
        const page = await pdfDocument.getPage(pageNumber)
        if (cancelled) {
          return
        }

        const viewport = page.getViewport({ scale })
        const metrics = createCanvasMetrics(viewport.width, viewport.height, resolvedOutputScale)
        setPageSize({ width: metrics.pageWidth, height: metrics.pageHeight })
      } catch {
        if (!cancelled) {
          setPageSize(null)
        }
      }
    }

    void readPageSize()
    return () => {
      cancelled = true
    }
  }, [documentProxy, pageNumber, resolvedOutputScale, scale])

  useEffect(() => {
    if (!shouldRender || !documentProxy || !filePath) {
      return
    }

    const pdfDocument: PDFDocumentProxy = documentProxy
    let cancelled = false
    let renderTask: RenderTask | undefined
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | undefined

    async function renderBitmapPage(): Promise<void> {
      const canvas = canvasRef.current
      const textLayerElement = textLayerRef.current
      setIsRendering(true)
      setPageError('')
      setBitmapDataUrl('')

      try {
        const page = await pdfDocument.getPage(pageNumber)
        if (cancelled) {
          return
        }

        const viewport = page.getViewport({ scale })
        const metrics = createCanvasMetrics(viewport.width, viewport.height, resolvedOutputScale)
        const canvasContext = canvas?.getContext('2d')
        let shouldUsePdfjsCanvas = renderMode === 'pdfjs'
        const textContentPromise = canSelectText ? page.getTextContent() : undefined

        setPageSize({ width: metrics.pageWidth, height: metrics.pageHeight })

        if (textLayerElement) {
          textLayerElement.innerHTML = ''
          textLayerElement.style.width = `${metrics.pageWidth}px`
          textLayerElement.style.height = `${metrics.pageHeight}px`
          textLayerElement.style.setProperty('--total-scale-factor', `${viewport.scale}`)
          textLayerElement.style.setProperty('--scale-round-x', `${metrics.scaleRoundX}px`)
          textLayerElement.style.setProperty('--scale-round-y', `${metrics.scaleRoundY}px`)
        }

        if (canvas) {
          canvas.width = metrics.canvasWidth
          canvas.height = metrics.canvasHeight
          canvas.style.width = `${metrics.pageWidth}px`
          canvas.style.height = `${metrics.pageHeight}px`
          canvasContext?.setTransform(1, 0, 0, 1, 0, 0)
          canvasContext?.clearRect(0, 0, metrics.canvasWidth, metrics.canvasHeight)
        }

        if (renderMode === 'compatibility') {
          try {
            const bitmap = await window.thesisAgent.renderPdfPageBitmap({
              filePath,
              pageNumber,
              scale,
              outputScale: resolvedOutputScale
            })

            if (cancelled) {
              return
            }

            setBitmapDataUrl(bitmap.imageDataUrl)
            shouldUsePdfjsCanvas = false
          } catch {
            shouldUsePdfjsCanvas = true
          }
        }

        if (shouldUsePdfjsCanvas) {
          if (!canvas || !canvasContext) {
            throw new Error('Canvas context is not available.')
          }

          renderTask = page.render({
            canvas,
            canvasContext,
            ...(metrics.transform ? { transform: metrics.transform } : {}),
            viewport
          })

          await renderTask.promise
        }

        if (textContentPromise && textLayerElement) {
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
        }
      } catch (renderError) {
        if (!cancelled && !(renderError instanceof Error && renderError.name === 'RenderingCancelledException')) {
          setPageError(renderError instanceof Error ? renderError.message : '页面缩略图渲染失败')
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false)
        }
      }
    }

    void renderBitmapPage()

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [canSelectText, documentProxy, filePath, pageNumber, renderMode, resolvedOutputScale, scale, shouldRender])

  const activatePage = useCallback((): void => {
    onActivatePage?.(pageNumber)
  }, [onActivatePage, pageNumber])

  const handlePageClick = useCallback((): void => {
    if (normalizeSelectedText(window.getSelection()?.toString() ?? '')) {
      return
    }

    activatePage()
  }, [activatePage])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (!canActivate || (event.key !== 'Enter' && event.key !== ' ')) {
        return
      }

      event.preventDefault()
      activatePage()
    },
    [activatePage, canActivate]
  )

  return (
    <div
      ref={containerRef}
      className={className}
      data-pdf-scroll-page={variant === 'scroll' ? pageNumber : undefined}
      role={canActivate ? 'button' : undefined}
      tabIndex={canActivate ? 0 : undefined}
      aria-label={`第 ${pageNumber} 页`}
      onClick={canActivate ? handlePageClick : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="pdf-bitmap-sheet" data-pdf-page-container="true" data-pdf-page-number={pageNumber} style={pageStyle}>
        {bitmapDataUrl ? <img className="pdf-bitmap-image" src={bitmapDataUrl} alt="" draggable={false} /> : null}
        <canvas className={bitmapDataUrl ? 'pdf-bitmap-canvas hidden' : 'pdf-bitmap-canvas'} ref={canvasRef} />
        {annotations.length > 0 ? (
          <div className="pdf-annotation-layer" aria-hidden="true">
            {annotations.map((annotation) =>
              normalizeAnnotationRects(annotation.rects).map((rect, index) => (
                <span
                  key={`${annotation.id}-${index}`}
                  className={`pdf-annotation-mark ${annotation.kind}`}
                  style={annotationMarkStyle(annotation, rect)}
                />
              ))
            )}
          </div>
        ) : null}
        {linkedNoteRegions.length > 0 ? (
          <div className="pdf-linked-note-layer">
            {linkedNoteRegions.map((region) => (
              <button
                key={region.id}
                className="pdf-linked-note-region"
                data-focused={region.id === focusedPdfSourceRegionId ? 'true' : undefined}
                type="button"
                draggable
                title={region.label}
                style={linkedNoteRegionStyle(region.rect)}
                onDragStart={(event) => onLinkedNoteRegionDragStart?.(event, region)}
                onClick={(event) => {
                  event.stopPropagation()
                  onLinkedNoteRegionSelect?.(region)
                }}
              />
            ))}
          </div>
        ) : null}
        {canSelectText ? (
          <div
            ref={textLayerRef}
            className="textLayer pdf-text-layer pdf-scroll-text-layer"
            data-pdf-page-number={pageNumber}
            onMouseUp={onSelectionMouseUp}
            onKeyUp={onSelectionKeyUp}
          />
        ) : null}
        {isRendering ? <div className="pdf-bitmap-loading">正在渲染...</div> : null}
        {pageError ? <div className="pdf-bitmap-error">{pageError}</div> : null}
      </div>
      <span className="pdf-bitmap-caption">第 {pageNumber} 页</span>
    </div>
  )
}

export function AnnotationColorPicker({
  activeColor,
  activeOpacity,
  activeThickness,
  presetColors,
  isOpen,
  compact = false,
  disabled = false,
  onToggleOpen,
  onColorChange,
  onOpacityChange,
  onThicknessChange,
  onAddPreset
}: {
  activeColor: PdfAnnotationColor
  activeOpacity: number
  activeThickness: number
  presetColors: PdfAnnotationColor[]
  isOpen: boolean
  compact?: boolean
  disabled?: boolean
  onToggleOpen: () => void
  onColorChange: (color: PdfAnnotationColor) => void
  onOpacityChange: (opacity: number) => void
  onThicknessChange: (thickness: number) => void
  onAddPreset: () => void
}): ReactElement {
  const pickerClassName = [
    'annotation-color-picker',
    compact ? 'compact' : '',
    disabled ? 'disabled' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={pickerClassName} aria-disabled={disabled}>
      <div className="preset-color-row" aria-label="常用高亮颜色">
        {presetColors.slice(0, 4).map((color, index) => (
          <ColorSwatchButton
            key={`${color}-${index}`}
            color={color}
            title={`常用颜色 ${index + 1}`}
            isActive={isSameColor(color, activeColor)}
            disabled={disabled}
            onClick={() => onColorChange(color)}
          />
        ))}
        <button
          className={isOpen ? 'color-menu-trigger active' : 'color-menu-trigger'}
          type="button"
          title="打开颜色面板"
          aria-label="打开颜色面板"
          aria-expanded={isOpen}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!disabled) {
              onToggleOpen()
            }
          }}
        >
          <span className="current-color-dot" style={{ backgroundColor: activeColor }} aria-hidden="true" />
          <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </button>
      </div>

      {isOpen && (
        <div className="annotation-color-panel">
          <div className="color-panel-label">颜色</div>

          <div className="annotation-color-grid" aria-label="颜色">
            {annotationColors.map((option, index) => (
              <ColorSwatchButton
                key={`${option.color}-${option.label}-${index}`}
                color={option.color}
                title={option.label}
                isActive={isSameColor(option.color, activeColor)}
                disabled={disabled}
                onClick={() => onColorChange(option.color)}
              />
            ))}
          </div>

          <div className="annotation-preview-row">
            <div className="highlight-preview" aria-hidden="true">
              <span style={highlightPreviewStyle(activeColor, activeOpacity, activeThickness)} />
              <strong>Aa</strong>
            </div>
            <button
              className="preset-add-button"
              type="button"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAddPreset}
            >
              加入常用
            </button>
          </div>

          <label className="opacity-control">
            <span>透明度</span>
            <input
              type="range"
              min="20"
              max="90"
              step="5"
              value={Math.round(activeOpacity * 100)}
              disabled={disabled}
              onChange={(event) => onOpacityChange(Number(event.target.value) / 100)}
            />
            <span>{Math.round(activeOpacity * 100)}%</span>
          </label>

          <label className="thickness-control">
            <span>粗细</span>
            <input
              type="range"
              min={Math.round(minHighlightThickness * 100)}
              max={Math.round(maxHighlightThickness * 100)}
              step="4"
              value={Math.round(activeThickness * 100)}
              disabled={disabled}
              onChange={(event) => onThicknessChange(Number(event.target.value) / 100)}
            />
            <span>{Math.round(activeThickness * 100)}%</span>
          </label>
        </div>
      )}
    </div>
  )
}

function ColorSwatchButton({
  color,
  title,
  isActive,
  disabled = false,
  onClick
}: {
  color: PdfAnnotationColor
  title: string
  isActive: boolean
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      className={isActive ? 'color-swatch active' : 'color-swatch'}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="annotation-color" style={{ backgroundColor: color }} aria-hidden="true" />
    </button>
  )
}

export function AnnotationPreview({
  annotation,
  onClose
}: {
  annotation?: PdfAnnotation
  onClose: () => void
}): ReactElement | null {
  if (!annotation) {
    return null
  }

  return (
    <div className="annotation-preview" style={annotationPreviewStyle(annotation.rects[0])}>
      <div className="annotation-preview-title">
        <span>批注</span>
        <button type="button" title="关闭批注" onClick={onClose}>
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>
      {annotation.note && <p>{annotation.note}</p>}
      <blockquote>{annotation.selectedText}</blockquote>
    </div>
  )
}
