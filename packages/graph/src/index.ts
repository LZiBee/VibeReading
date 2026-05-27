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

export type AiQuestionMapMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'sending' | 'error'
}

export type AiQuestionMapConversation = {
  id: string
  paperPath: string
  parentAnswerId?: string
  messages: AiQuestionMapMessage[]
}

export type AiQuestionMapNodeStatus = 'pending' | 'streaming' | 'answered' | 'failed'

export type AiQuestionMapNode = {
  id: string
  paperPath: string
  conversationId: string
  messageId: string
  answerMessageId?: string
  parentId?: string
  question: string
  answer?: string
  answerPreview?: string
  status: AiQuestionMapNodeStatus
  depth: number
  childCount: number
  position: {
    x: number
    y: number
  }
}

export type AiQuestionMapEdge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
}

export type AiQuestionMap = {
  nodes: AiQuestionMapNode[]
  edges: AiQuestionMapEdge[]
}

type AiQuestionTurn = {
  question: AiQuestionMapMessage
  answer?: AiQuestionMapMessage
}

type InternalAiQuestionNode = Omit<AiQuestionMapNode, 'childCount' | 'depth' | 'position'> & {
  children: InternalAiQuestionNode[]
}

const aiQuestionMapHorizontalGap = 400
const aiQuestionMapVerticalGap = 150

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

export function buildAiQuestionMap(input: {
  paperPath: string
  conversations: AiQuestionMapConversation[]
}): AiQuestionMap {
  const conversations = input.conversations.filter((conversation) => conversation.paperPath === input.paperPath)
  const answerIds = new Set(
    conversations.flatMap((conversation) =>
      conversation.messages
        .filter((message) => message.role === 'assistant')
        .map((message) => message.id)
    )
  )
  const rootConversations = conversations.filter(
    (conversation) => !conversation.parentAnswerId || !answerIds.has(conversation.parentAnswerId)
  )
  const fallbackRootConversations = rootConversations.length > 0 ? rootConversations : conversations.slice(0, 1)
  const roots = fallbackRootConversations.flatMap((conversation) =>
    buildAiQuestionTreeForConversation(conversation, conversations, new Set())
  )

  return layoutAiQuestionTree(roots)
}

function buildAiQuestionTreeForConversation(
  conversation: AiQuestionMapConversation,
  conversations: AiQuestionMapConversation[],
  visitedConversationIds: Set<string>
): InternalAiQuestionNode[] {
  if (visitedConversationIds.has(conversation.id)) {
    return []
  }

  const nextVisitedConversationIds = new Set(visitedConversationIds)
  nextVisitedConversationIds.add(conversation.id)
  const turns = getAiQuestionTurns(getAiConversationScopedMessages(conversation))
  const nodes = turns.map<InternalAiQuestionNode>((turn) => ({
    id: `${conversation.id}:${turn.question.id}`,
    paperPath: conversation.paperPath,
    conversationId: conversation.id,
    messageId: turn.question.id,
    answerMessageId: turn.answer?.id,
    question: normalizeAiQuestionText(turn.question.content),
    answer: turn.answer ? normalizeAiAnswerText(turn.answer.content) : undefined,
    answerPreview: turn.answer ? getAiTextPreview(turn.answer.content, 120) : undefined,
    status: getAiQuestionMapNodeStatus(turn.answer),
    children: []
  }))

  for (let index = 0; index < nodes.length; index += 1) {
    const turn = turns[index]
    const sequentialChild = nodes[index + 1]

    if (sequentialChild) {
      nodes[index].children.push(sequentialChild)
    }

    if (turn.answer) {
      const branchRoots = conversations
        .filter((item) => item.parentAnswerId === turn.answer?.id)
        .flatMap((branchConversation) =>
          buildAiQuestionTreeForConversation(branchConversation, conversations, nextVisitedConversationIds)
        )

      nodes[index].children.push(...branchRoots)
    }
  }

  return nodes[0] ? [nodes[0]] : []
}

function layoutAiQuestionTree(roots: InternalAiQuestionNode[]): AiQuestionMap {
  const nodes: AiQuestionMapNode[] = []
  const edges: AiQuestionMapEdge[] = []
  let nextLeafIndex = 0

  const visitNode = (node: InternalAiQuestionNode, depth: number, parentId?: string): number => {
    const childYPositions = node.children.map((child) => visitNode(child, depth + 1, node.id))
    const y = childYPositions.length > 0
      ? childYPositions.reduce((sum, childY) => sum + childY, 0) / childYPositions.length
      : nextLeafIndex++ * aiQuestionMapVerticalGap

    if (parentId) {
      edges.push({
        id: `${parentId}->${node.id}`,
        sourceNodeId: parentId,
        targetNodeId: node.id
      })
    }

    nodes.push({
      id: node.id,
      paperPath: node.paperPath,
      conversationId: node.conversationId,
      messageId: node.messageId,
      answerMessageId: node.answerMessageId,
      parentId,
      question: node.question,
      answer: node.answer,
      answerPreview: node.answerPreview,
      status: node.status,
      depth,
      childCount: node.children.length,
      position: {
        x: depth * aiQuestionMapHorizontalGap,
        y
      }
    })

    return y
  }

  roots.forEach((root) => visitNode(root, 0))

  return {
    nodes,
    edges
  }
}

function getAiConversationScopedMessages(conversation: AiQuestionMapConversation): AiQuestionMapMessage[] {
  if (!conversation.parentAnswerId) {
    return conversation.messages
  }

  const parentAnswerIndex = conversation.messages.findIndex((message) => message.id === conversation.parentAnswerId)
  return parentAnswerIndex >= 0 ? conversation.messages.slice(parentAnswerIndex + 1) : conversation.messages
}

function getAiQuestionTurns(messages: AiQuestionMapMessage[]): AiQuestionTurn[] {
  const turns: AiQuestionTurn[] = []
  let currentTurn: AiQuestionTurn | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      currentTurn = {
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

function getAiQuestionMapNodeStatus(answer?: AiQuestionMapMessage): AiQuestionMapNodeStatus {
  if (!answer) {
    return 'pending'
  }

  if (answer.status === 'sending') {
    return 'streaming'
  }

  if (answer.status === 'error') {
    return 'failed'
  }

  return 'answered'
}

function normalizeAiQuestionText(content: string): string {
  return getAiTextPreview(content, 160)
}

function normalizeAiAnswerText(content: string): string {
  const normalized = content.trim()
  return normalized || '空回答'
}

function getAiTextPreview(content: string, maxLength: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '空消息'
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized
}

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
