import type { SourceRef } from '@thesis-agent/shared'
import type { WorkbenchExtension } from '@thesis-agent/workbench'

export type GraphNodeType =
  | 'paper'
  | 'section'
  | 'excerpt'
  | 'question'
  | 'answer'
  | 'user_note'
  | 'formula'
  | 'figure'
  | 'screenshot'
  | 'reference'
  | 'reading_item'
  | 'concept'
  | 'claim'
  | 'evidence'

export type GraphEdgeRelation =
  | 'contains'
  | 'asks'
  | 'answers'
  | 'expands'
  | 'supports'
  | 'contradicts'
  | 'mentions'
  | 'cites'
  | 'derived_from'
  | 'similar_to'
  | 'should_read'
  | 'belongs_to'

export type GraphNode = {
  id: string
  paperId?: string
  type: GraphNodeType
  title: string
  content?: string
  refId?: string
  sourceRefs: SourceRef[]
  position?: {
    x: number
    y: number
  }
}

export type GraphEdge = {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: GraphEdgeRelation
  weight?: number
}

export const graphNodeTypes: GraphNodeType[] = [
  'paper',
  'section',
  'excerpt',
  'question',
  'answer',
  'user_note',
  'formula',
  'figure',
  'screenshot',
  'reference',
  'reading_item',
  'concept',
  'claim',
  'evidence'
]

export const graphExtension: WorkbenchExtension = {
  id: '@thesis-agent/plugin-graph',
  activate: (context) => {
    context.editors.registerEditor({
      id: 'graph-editor',
      title: 'Paper Graph',
      canOpen: (resource) => resource.type === 'paper-graph'
    })
  }
}
