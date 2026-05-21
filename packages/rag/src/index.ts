import type { SourceRef } from '@thesis-agent/shared'

export type RetrievalScope =
  | 'selection'
  | 'current-page'
  | 'current-section'
  | 'current-paper'
  | 'library'
  | 'notes'

export type Chunk = {
  id: string
  paperId?: string
  sourceType: 'paper_text' | 'note' | 'annotation' | 'ai_message' | 'reference'
  sourceId?: string
  section?: string
  pageStart?: number
  pageEnd?: number
  text: string
  sourceRefs: SourceRef[]
}

export type RetrievalResult = {
  chunk: Chunk
  score: number
  strategy: 'fts' | 'vector' | 'hybrid'
}

export const ragScopes: RetrievalScope[] = [
  'selection',
  'current-page',
  'current-section',
  'current-paper',
  'library',
  'notes'
]
