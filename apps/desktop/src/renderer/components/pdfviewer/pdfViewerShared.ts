import type { MouseEvent as ReactMouseEvent } from 'react'
import type { AnnotationKind, PdfAnnotation, PdfAnnotationColor, PdfAnnotationRect, PdfSelection } from '@thesis-agent/pdf'
import type { PdfLinkedNoteRegion } from '../../app/types'

export type PdfSelectionSnapshot = PdfSelection & {
  anchor: {
    x: number
    y: number
  }
}

export type PageSize = {
  width: number
  height: number
}

export type ZoomAnchor = {
  clientX: number
  clientY: number
}

export type PanState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

export type AnnotationColorOption = {
  color: PdfAnnotationColor
  label: string
}

export type PdfToolMode = 'select' | 'highlight'
export type PdfRenderMode = 'compatibility' | 'pdfjs'
export type PdfBrowseMode = 'scroll' | 'page'
export type PdfBitmapPageVariant = 'scroll' | 'overview'

export const minScale = 0.5
export const maxScale = 3
export const zoomStep = 0.25
export const defaultHighlightOpacity = 0.58
export const minHighlightThickness = 0.42
export const maxHighlightThickness = 0.78
export const defaultHighlightThickness = 0.62
export const defaultPresetColors: PdfAnnotationColor[] = ['#ffd84d', '#5fc878', '#61a8ff', '#f39aa2']
export const defaultOutputScale = 1
export const overviewScale = 0.24
export const overviewOutputScale = 1.5
export const readingReportIntervalSeconds = 5

export const annotationColors: AnnotationColorOption[] = [
  { color: '#111827', label: 'Black' },
  { color: '#4b5563', label: 'Dark Gray' },
  { color: '#9ca3af', label: 'Gray' },
  { color: '#ef4444', label: 'Red' },
  { color: '#f97316', label: 'Orange' },
  { color: '#f59e0b', label: 'Amber' },
  { color: '#ffd84d', label: 'Yellow' },
  { color: '#fde68a', label: 'Light Yellow' },
  { color: '#84cc16', label: 'Lime' },
  { color: '#22c55e', label: 'Green' },
  { color: '#14b8a6', label: 'Teal' },
  { color: '#06b6d4', label: 'Cyan' },
  { color: '#0ea5e9', label: 'Sky' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#6366f1', label: 'Indigo' },
  { color: '#8b5cf6', label: 'Violet' },
  { color: '#a855f7', label: 'Purple' },
  { color: '#d946ef', label: 'Fuchsia' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#f43f5e', label: 'Rose' },
  { color: '#7f1d1d', label: 'Wine Red' },
  { color: '#92400e', label: 'Brown' },
  { color: '#365314', label: 'Olive' },
  { color: '#064e3b', label: 'Forest' },
  { color: '#164e63', label: 'Deep Cyan' },
  { color: '#1e3a8a', label: 'Navy' },
  { color: '#4c1d95', label: 'Deep Purple' },
  { color: '#831843', label: 'Magenta' },
  { color: '#ffffff', label: 'White' },
  { color: '#f8fafc', label: 'Off White' }
]

export function clampScale(value: number): number {
  return Math.min(maxScale, Math.max(minScale, Number(value.toFixed(2))))
}

export function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function clampHighlightThickness(value: number): number {
  return Math.min(maxHighlightThickness, Math.max(minHighlightThickness, value))
}

export function getCanvasOutputScale(): number {
  if (typeof window === 'undefined') {
    return defaultOutputScale
  }

  return Math.max(defaultOutputScale, window.devicePixelRatio || defaultOutputScale)
}

export function createCanvasMetrics(width: number, height: number, outputScale: number): {
  pageWidth: number
  pageHeight: number
  canvasWidth: number
  canvasHeight: number
  scaleRoundX: number
  scaleRoundY: number
  transform?: [number, number, number, number, number, number]
} {
  const [scaleNumeratorX, scaleDenominatorX] = approximateFraction(outputScale)
  const [scaleNumeratorY, scaleDenominatorY] = approximateFraction(outputScale)
  const pageWidth = Math.max(1, floorToDivide(roundForCanvas(width), scaleDenominatorX))
  const pageHeight = Math.max(1, floorToDivide(roundForCanvas(height), scaleDenominatorY))
  const canvasWidth = Math.max(1, floorToDivide(roundForCanvas(width * outputScale), scaleNumeratorX))
  const canvasHeight = Math.max(1, floorToDivide(roundForCanvas(height * outputScale), scaleNumeratorY))
  const renderScaleX = canvasWidth / width
  const renderScaleY = canvasHeight / height
  const isScaled = Math.abs(renderScaleX - 1) > 0.001 || Math.abs(renderScaleY - 1) > 0.001

  return {
    pageWidth,
    pageHeight,
    canvasWidth,
    canvasHeight,
    scaleRoundX: scaleDenominatorX,
    scaleRoundY: scaleDenominatorY,
    transform: isScaled ? [renderScaleX, 0, 0, renderScaleY, 0, 0] : undefined
  }
}

function approximateFraction(value: number): [number, number] {
  if (Math.floor(value) === value) {
    return [value, 1]
  }

  const inverse = 1 / value
  const limit = 8

  if (inverse > limit) {
    return [1, limit]
  }

  if (Math.floor(inverse) === inverse) {
    return [1, inverse]
  }

  const normalizedValue = value > 1 ? inverse : value
  let lowerNumerator = 0
  let lowerDenominator = 1
  let upperNumerator = 1
  let upperDenominator = 1

  while (true) {
    const middleNumerator = lowerNumerator + upperNumerator
    const middleDenominator = lowerDenominator + upperDenominator

    if (middleDenominator > limit) {
      break
    }

    if (normalizedValue <= middleNumerator / middleDenominator) {
      upperNumerator = middleNumerator
      upperDenominator = middleDenominator
    } else {
      lowerNumerator = middleNumerator
      lowerDenominator = middleDenominator
    }
  }

  if (normalizedValue - lowerNumerator / lowerDenominator < upperNumerator / upperDenominator - normalizedValue) {
    return normalizedValue === value ? [lowerNumerator, lowerDenominator] : [lowerDenominator, lowerNumerator]
  }

  return normalizedValue === value ? [upperNumerator, upperDenominator] : [upperDenominator, upperNumerator]
}

function floorToDivide(value: number, divisor: number): number {
  return value - (value % divisor)
}

function roundForCanvas(value: number): number {
  return Math.fround(value)
}

export function normalizeSelectedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isNodeInside(node: Node | null, container: HTMLElement): boolean {
  return !!node && (node === container || container.contains(node))
}

export function findSelectionTextLayer(selection: Selection, range: Range, root: HTMLElement | null): HTMLElement | null {
  const candidates = [selection.anchorNode, selection.focusNode, range.commonAncestorContainer]

  for (const candidate of candidates) {
    const textLayer = closestElement(candidate, '.pdf-text-layer')
    if (textLayer instanceof HTMLElement && (!root || root.contains(textLayer))) {
      return textLayer
    }
  }

  if (!root) {
    return null
  }

  return (
    Array.from(root.querySelectorAll<HTMLElement>('.pdf-text-layer')).find(
      (textLayer) =>
        isNodeInside(selection.anchorNode, textLayer) ||
        isNodeInside(selection.focusNode, textLayer) ||
        isNodeInside(range.commonAncestorContainer, textLayer)
    ) ?? null
  )
}

function closestElement(node: Node | null, selector: string): Element | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  return element?.closest(selector) ?? null
}

export function parsePageNumber(value: string | undefined, fallback: number): number {
  const pageNumber = Number.parseInt(value ?? '', 10)
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : fallback
}

export function getNormalizedRects(range: Range, pageBox: DOMRect): PdfAnnotationRect[] {
  return normalizeAnnotationRects(
    Array.from(range.getClientRects()).map((rect) => {
      const left = Math.max(rect.left, pageBox.left)
      const top = Math.max(rect.top, pageBox.top)
      const right = Math.min(rect.right, pageBox.right)
      const bottom = Math.min(rect.bottom, pageBox.bottom)
      const width = right - left
      const height = bottom - top

      return {
        x: clampRatio((left - pageBox.left) / pageBox.width),
        y: clampRatio((top - pageBox.top) / pageBox.height),
        width: clampRatio(width / pageBox.width),
        height: clampRatio(height / pageBox.height)
      }
    })
  )
}

export function normalizeAnnotationRects(rects: PdfAnnotationRect[]): PdfAnnotationRect[] {
  const visibleRects = rects
    .filter((rect) => rect.width > 0.002 && rect.height > 0.002)
    .map((rect) => ({
      x: clampRatio(rect.x),
      y: clampRatio(rect.y),
      width: Math.min(clampRatio(rect.width), 1 - clampRatio(rect.x)),
      height: Math.min(clampRatio(rect.height), 1 - clampRatio(rect.y))
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const lineGroups: PdfAnnotationRect[][] = []

  for (const rect of visibleRects) {
    const group = lineGroups.find((items) => isSameTextLine(items[0], rect))
    if (group) {
      group.push(rect)
    } else {
      lineGroups.push([rect])
    }
  }

  return lineGroups.flatMap(mergeLineRects)
}

function isSameTextLine(base: PdfAnnotationRect | undefined, rect: PdfAnnotationRect): boolean {
  if (!base) {
    return false
  }

  const baseCenter = base.y + base.height / 2
  const rectCenter = rect.y + rect.height / 2
  const overlap = Math.min(base.y + base.height, rect.y + rect.height) - Math.max(base.y, rect.y)
  const overlapRatio = overlap > 0 ? overlap / Math.min(base.height, rect.height) : 0

  return overlapRatio > 0.45 || Math.abs(baseCenter - rectCenter) <= Math.max(base.height, rect.height) * 0.45
}

function mergeLineRects(rects: PdfAnnotationRect[]): PdfAnnotationRect[] {
  const sortedRects = [...rects].sort((a, b) => a.x - b.x)
  const y = Math.min(...sortedRects.map((rect) => rect.y))
  const bottom = Math.max(...sortedRects.map((rect) => rect.y + rect.height))
  const height = Math.max(bottom - y, 0)
  const merged: PdfAnnotationRect[] = []
  const mergeGap = 0.006

  for (const rect of sortedRects) {
    const x = clampRatio(rect.x)
    const right = clampRatio(rect.x + rect.width)
    const last = merged.at(-1)

    if (last && x <= last.x + last.width + mergeGap) {
      const lastRight = Math.max(last.x + last.width, right)
      last.width = Math.min(lastRight - last.x, 1 - last.x)
      continue
    }

    merged.push({
      x,
      y: clampRatio(y),
      width: Math.min(Math.max(right - x, 0), 1 - x),
      height: Math.min(height, 1 - clampRatio(y))
    })
  }

  return merged.filter((rect) => rect.width > 0.002 && rect.height > 0.002)
}

export function getSelectionAnchor(rects: PdfAnnotationRect[]): { x: number; y: number } {
  const minX = Math.min(...rects.map((rect) => rect.x))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const minY = Math.min(...rects.map((rect) => rect.y))

  return {
    x: clampRatio(minX + (maxX - minX) / 2),
    y: clampRatio(minY)
  }
}

export function annotationMarkStyle(annotation: PdfAnnotation, rect: PdfAnnotationRect): Record<string, string> {
  const isTextMarker = annotation.kind === 'highlight' || annotation.kind === 'note'
  const thickness = clampHighlightThickness(annotation.thickness ?? defaultHighlightThickness)
  const markerInset = (1 - thickness) / 2
  const markerTop = isTextMarker ? rect.y + rect.height * markerInset : rect.y
  const markerHeight = isTextMarker ? Math.max(rect.height * thickness, 0.006) : rect.height

  return {
    left: `${rect.x * 100}%`,
    top: `${clampRatio(markerTop) * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${Math.min(markerHeight, 1 - clampRatio(markerTop)) * 100}%`,
    backgroundColor: toRgba(annotation.color ?? defaultPresetColors[0] ?? '#ffd84d', annotation.opacity ?? defaultHighlightOpacity)
  }
}

export function highlightPreviewStyle(color: PdfAnnotationColor, opacity: number, thickness: number): Record<string, string> {
  const markerInset = `${((1 - clampHighlightThickness(thickness)) / 2) * 100}%`

  return {
    backgroundColor: toRgba(color, opacity),
    top: markerInset,
    bottom: markerInset
  }
}

export function pinToStyle(rect: PdfAnnotationRect | undefined): Record<string, string> | undefined {
  if (!rect) {
    return undefined
  }

  return {
    left: `${(rect.x + rect.width) * 100}%`,
    top: `${rect.y * 100}%`
  }
}

export function selectionPopoverStyle(anchor: { x: number; y: number }): Record<string, string> {
  return {
    left: `${anchor.x * 100}%`,
    top: `${anchor.y * 100}%`
  }
}

export function annotationPreviewStyle(rect: PdfAnnotationRect | undefined): Record<string, string> | undefined {
  if (!rect) {
    return undefined
  }

  return {
    left: `${Math.min(0.86, rect.x + rect.width + 0.02) * 100}%`,
    top: `${rect.y * 100}%`
  }
}

export function linkedNoteRegionStyle(rect: NonNullable<PdfLinkedNoteRegion['rect']>): Record<string, string> {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
    boxSizing: 'border-box'
  }
}

export function preventFocusSteal(event: ReactMouseEvent<HTMLDivElement>): void {
  event.preventDefault()
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function isSameColor(left: PdfAnnotationColor, right: PdfAnnotationColor): boolean {
  return normalizeColor(left) === normalizeColor(right)
}

function normalizeColor(color: PdfAnnotationColor): string {
  return color.trim().toLowerCase()
}

export function toRgba(color: PdfAnnotationColor, opacity: number): string {
  const normalizedColor = normalizeColor(color)
  const hex = normalizedColor.startsWith('#') ? normalizedColor.slice(1) : ''
  const alpha = Math.min(1, Math.max(0, opacity))

  if (hex.length === 3) {
    const [r, g, b] = hex.split('').map((part) => Number.parseInt(`${part}${part}`, 16))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return color
}

export function createStableHash(text: string): string {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(16)
}
