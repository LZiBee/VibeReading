import type { SourceRef } from '@thesis-agent/shared'
import type { WorkbenchExtension } from '@thesis-agent/workbench'

export type PdfPageViewport = {
  pageNo: number
  width: number
  height: number
  scale: number
  rotation: number
}

export type PdfSelection = {
  paperId: string
  pageNo: number
  text: string
  rects: PdfAnnotationRect[]
  sourceRef: SourceRef
}

export type AnnotationKind = 'highlight' | 'underline' | 'note' | 'favorite'

export type PdfAnnotationColor = string

export type PdfAnnotationRect = {
  /**
   * Normalized page coordinates in the range 0..1, independent from zoom.
   */
  x: number
  y: number
  width: number
  height: number
}

export type PdfAnnotation = {
  id: string
  paperId: string
  pageNo: number
  kind: AnnotationKind
  /**
   * CSS color string. First version uses hex colors from the reader palette.
   */
  color?: PdfAnnotationColor
  opacity?: number
  thickness?: number
  rects: PdfAnnotationRect[]
  selectedText: string
  note?: string
  sourceRef: SourceRef
  createdAt: string
  updatedAt?: string
}

export const pdfCommands = [
  'paper.open',
  'paper.import',
  'pdf.copySelection',
  'pdf.highlight',
  'pdf.addNote',
  'pdf.undoAnnotation',
  'pdf.zoomIn',
  'pdf.zoomOut',
  'pdf.resetZoom',
  'pdf.favoriteSelection',
  'pdf.screenshot',
  'ai.askSelection'
] as const

export const pdfExtension: WorkbenchExtension = {
  id: '@thesis-agent/plugin-pdf',
  activate: (context) => {
    context.views.registerView({
      id: 'library',
      title: '文献库',
      icon: 'library',
      location: 'primary-sidebar'
    })

    context.editors.registerEditor({
      id: 'pdf-reader',
      title: 'PDF Reader',
      canOpen: (resource) => resource.type === 'paper-pdf'
    })
  }
}
