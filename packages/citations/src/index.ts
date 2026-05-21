import type { SourceRef } from '@thesis-agent/shared'
import type { WorkbenchExtension } from '@thesis-agent/workbench'

export type ReferenceEntry = {
  id: string
  paperId: string
  rawText: string
  title?: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  arxivId?: string
  url?: string
  abstract?: string
  metadataSource?: string
}

export type CitationMention = {
  id: string
  paperId: string
  referenceId?: string
  pageNo: number
  mentionText: string
  context: string
  confidence: number
  sourceRef: SourceRef
}

export const citationCommands = [
  'citation.preview',
  'citation.addToReadingList',
  'citation.openDoi',
  'citation.findPdf'
] as const

export const citationsExtension: WorkbenchExtension = {
  id: '@thesis-agent/plugin-citations',
  activate: (context) => {
    context.views.registerView({
      id: 'citations',
      title: '引用',
      icon: 'references',
      location: 'auxiliary-sidebar'
    })
  }
}
