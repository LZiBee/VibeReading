import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react'
import { buildAiQuestionMap, type AiQuestionMapNode } from '@thesis-agent/graph'
import type { AiConversation, AiGraphSelectTarget } from '../../app/types'

type QuestionNodeData = Record<string, unknown> & {
  questionNode: AiQuestionMapNode
  isFocused: boolean
  isAnswerExpanded: boolean
  onQuestionSelect: (questionNode: AiQuestionMapNode) => void
  onAnswerSelect: (questionNode: AiQuestionMapNode) => void
  onAnswerToggle: (nodeId: string) => void
}

type QuestionFlowNode = Node<QuestionNodeData, 'question'>
type QuestionFlowEdge = Edge

const questionNodeTypes = {
  question: memo(QuestionNode)
}
const collapsedQuestionNodeWidth = 268
const expandedQuestionNodeWidth = 320
const collapsedQuestionNodeHeight = 116
const expandedQuestionNodeHeight = 300
const focusedQuestionNodeZoom = 0.95

export function AiQuestionMapCanvas({
  paperPath,
  paperTitle,
  conversations,
  isActive,
  activeConversationId,
  focusedMessageId,
  onQuestionSelect,
  onOpenPdf
}: {
  paperPath: string
  paperTitle: string
  conversations: AiConversation[]
  isActive: boolean
  activeConversationId: string
  focusedMessageId: string
  onQuestionSelect: (target: AiGraphSelectTarget) => void
  onOpenPdf: () => void
}): ReactElement {
  const [expandedAnswerNodeIds, setExpandedAnswerNodeIds] = useState<Set<string>>(() => new Set())
  const questionMap = useMemo(
    () =>
      paperPath
        ? buildAiQuestionMap({
            paperPath,
            conversations
          })
        : { nodes: [], edges: [] },
    [conversations, paperPath]
  )
  const selectQuestionNode = useCallback(
    (questionNode: AiQuestionMapNode) => {
      onQuestionSelect({
        paperPath: questionNode.paperPath,
        conversationId: questionNode.conversationId,
        messageId: questionNode.messageId
      })
    },
    [onQuestionSelect]
  )
  const selectAnswerNode = useCallback(
    (questionNode: AiQuestionMapNode) => {
      onQuestionSelect({
        paperPath: questionNode.paperPath,
        conversationId: questionNode.conversationId,
        messageId: questionNode.answerMessageId ?? questionNode.messageId
      })
    },
    [onQuestionSelect]
  )
  const toggleAnswerNode = useCallback((nodeId: string) => {
    setExpandedAnswerNodeIds((current) => {
      const next = new Set(current)

      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }

      return next
    })
  }, [])
  const flowNodes = useMemo<QuestionFlowNode[]>(
    () =>
      questionMap.nodes.map((questionNode) => {
        const isAnswerExpanded = expandedAnswerNodeIds.has(questionNode.id)
        const width = isAnswerExpanded ? expandedQuestionNodeWidth : collapsedQuestionNodeWidth
        const height = isAnswerExpanded ? expandedQuestionNodeHeight : collapsedQuestionNodeHeight

        return {
          id: questionNode.id,
          type: 'question',
          position: questionNode.position,
          width,
          height,
          initialWidth: width,
          initialHeight: height,
          data: {
            questionNode,
            isAnswerExpanded,
            isFocused:
              questionNode.messageId === focusedMessageId ||
              questionNode.answerMessageId === focusedMessageId ||
              (!focusedMessageId && questionNode.conversationId === activeConversationId),
            onQuestionSelect: selectQuestionNode,
            onAnswerSelect: selectAnswerNode,
            onAnswerToggle: toggleAnswerNode
          }
        }
      }),
    [
      activeConversationId,
      expandedAnswerNodeIds,
      focusedMessageId,
      questionMap.nodes,
      selectAnswerNode,
      selectQuestionNode,
      toggleAnswerNode
    ]
  )
  const flowEdges = useMemo<QuestionFlowEdge[]>(
    () =>
      questionMap.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16
        },
        style: {
          stroke: '#9eacb7',
          strokeWidth: 1.6
        }
      })),
    [questionMap.edges]
  )

  if (!paperPath) {
    return (
      <div className="editor-surface ai-question-map-surface empty">
        <span className="codicon codicon-type-hierarchy-sub" aria-hidden="true" />
        <strong>AI 问答图</strong>
        <button className="secondary-button compact" type="button" onClick={onOpenPdf}>
          <span className="codicon codicon-file-pdf" aria-hidden="true" />
          <span>打开 PDF</span>
        </button>
      </div>
    )
  }

  if (flowNodes.length === 0) {
    return (
      <div className="editor-surface ai-question-map-surface empty">
        <span className="codicon codicon-comment-discussion" aria-hidden="true" />
        <strong>{paperTitle}</strong>
        <small>AI 提问后会在这里生成横向问答节点</small>
      </div>
    )
  }

  return (
    <div className="editor-surface ai-question-map-surface">
      <div className="ai-question-map-toolbar">
        <div>
          <span className="codicon codicon-type-hierarchy-sub" aria-hidden="true" />
          <strong>AI 问答图</strong>
          <small title={paperPath}>{paperTitle}</small>
        </div>
        <span>{flowNodes.length} 个提问</span>
      </div>
      <ReactFlowProvider>
        <QuestionMapFlow nodes={flowNodes} edges={flowEdges} isActive={isActive} focusedMessageId={focusedMessageId} />
      </ReactFlowProvider>
    </div>
  )
}

function QuestionMapFlow({
  nodes,
  edges,
  isActive,
  focusedMessageId
}: {
  nodes: QuestionFlowNode[]
  edges: QuestionFlowEdge[]
  isActive: boolean
  focusedMessageId: string
}): ReactElement {
  const reactFlow = useReactFlow<QuestionFlowNode, QuestionFlowEdge>()
  const lastCenteredTargetRef = useRef('')
  const focusedNode = useMemo(() => {
    if (focusedMessageId) {
      return nodes.find((node) => {
        const questionNode = node.data.questionNode
        return questionNode.messageId === focusedMessageId || questionNode.answerMessageId === focusedMessageId
      })
    }

    return nodes
      .filter((node) => node.data.isFocused)
      .sort((left, right) => {
        const depthDiff = left.data.questionNode.depth - right.data.questionNode.depth

        if (depthDiff !== 0) {
          return depthDiff
        }

        return left.position.y - right.position.y
      })[0]
  }, [focusedMessageId, nodes])
  const focusedNodeSignature = focusedNode
    ? [
        focusedNode.id,
        focusedNode.position.x,
        focusedNode.position.y,
        focusedNode.measured?.width ?? 0,
        focusedNode.measured?.height ?? 0,
        focusedNode.data.isAnswerExpanded ? 'expanded' : 'collapsed',
        focusedMessageId
      ].join(':')
    : ''

  useEffect(() => {
    if (!isActive || !focusedNode || !reactFlow.viewportInitialized) {
      return
    }

    if (lastCenteredTargetRef.current === focusedNodeSignature) {
      return
    }

    lastCenteredTargetRef.current = focusedNodeSignature
    const liveFocusedNode = reactFlow.getNode(focusedNode.id) ?? focusedNode
    const width =
      liveFocusedNode.measured?.width ??
      liveFocusedNode.width ??
      (focusedNode.data.isAnswerExpanded ? expandedQuestionNodeWidth : collapsedQuestionNodeWidth)
    const height =
      liveFocusedNode.measured?.height ??
      liveFocusedNode.height ??
      (focusedNode.data.isAnswerExpanded ? expandedQuestionNodeHeight : collapsedQuestionNodeHeight)

    void reactFlow.setCenter(focusedNode.position.x + width / 2, focusedNode.position.y + height / 2, {
      zoom: focusedQuestionNodeZoom,
      duration: 360
    })
  }, [focusedNode, focusedNodeSignature, isActive, reactFlow])

  return (
    <ReactFlow<QuestionFlowNode, QuestionFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={questionNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.24 }}
      minZoom={0.24}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background color="#d8e0e6" gap={28} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => (node.data.isFocused ? '#256f8f' : '#d7e1e8')}
        nodeStrokeColor={(node) => (node.data.isFocused ? '#174f68' : '#8fa0ac')}
        nodeBorderRadius={8}
        nodeStrokeWidth={2}
        maskColor="rgba(246, 248, 250, 0.64)"
        maskStrokeColor="rgba(37, 111, 143, 0.42)"
        maskStrokeWidth={1.5}
        offsetScale={18}
        ariaLabel="AI 问答图缩略图"
        style={{ backgroundColor: '#ffffff' }}
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

function QuestionNode({ data, selected }: NodeProps): ReactElement {
  const nodeData = data as QuestionNodeData
  const questionNode = nodeData.questionNode
  const statusLabel = getQuestionStatusLabel(questionNode.status)
  const hasAnswer = Boolean(questionNode.answer)
  const isAnswerExpanded = hasAnswer && nodeData.isAnswerExpanded
  const nodeClassName = [
    'ai-question-map-node',
    nodeData.isFocused ? 'focused' : '',
    selected ? 'selected' : '',
    isAnswerExpanded ? 'expanded' : '',
    questionNode.status
  ]
    .filter(Boolean)
    .join(' ')
  const handleQuestionSelect = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    nodeData.onQuestionSelect(questionNode)
  }
  const handleAnswerSelect = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    nodeData.onAnswerSelect(questionNode)
  }
  const handleAnswerToggle = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    nodeData.onAnswerToggle(questionNode.id)
  }

  return (
    <div className={nodeClassName}>
      <Handle className="ai-question-map-handle" type="target" position={Position.Left} />
      <div className="ai-question-map-node-main">
        <div className="ai-question-map-node-kicker">
          <span className="ai-question-map-node-status">
            <span className="codicon codicon-comment-discussion" aria-hidden="true" />
            <span>{statusLabel}</span>
          </span>
          <span className="ai-question-map-node-actions">
            <button
              className="ai-question-map-node-icon-button nodrag nopan"
              type="button"
              title="定位提问"
              aria-label="定位提问"
              onClick={handleQuestionSelect}
            >
              <span className="codicon codicon-arrow-right" aria-hidden="true" />
            </button>
            {hasAnswer ? (
              <button
                className="ai-question-map-node-icon-button nodrag nopan"
                type="button"
                title={isAnswerExpanded ? '收起回答' : '展开回答'}
                aria-label={isAnswerExpanded ? '收起回答' : '展开回答'}
                aria-expanded={isAnswerExpanded}
                onClick={handleAnswerToggle}
              >
                <span
                  className={isAnswerExpanded ? 'codicon codicon-chevron-up' : 'codicon codicon-chevron-down'}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </span>
        </div>
        <button
          className="ai-question-map-node-question nodrag nopan"
          type="button"
          title="定位到 AI 提问"
          onClick={handleQuestionSelect}
        >
          <strong>{questionNode.question}</strong>
        </button>
        <small className="ai-question-map-node-meta">
          {questionNode.childCount > 0 ? `${questionNode.childCount} 个子问题` : '末端问题'}
          {!isAnswerExpanded && questionNode.answerPreview ? ` · ${questionNode.answerPreview}` : ''}
        </small>
        {isAnswerExpanded ? (
          <div className="ai-question-map-node-answer">
            <div className="ai-question-map-node-answer-header">
              <span>
                <span className="codicon codicon-sparkle" aria-hidden="true" />
                <span>AI 回答</span>
              </span>
              <button
                className="ai-question-map-node-answer-jump nodrag nopan"
                type="button"
                title="定位回答"
                aria-label="定位回答"
                onClick={handleAnswerSelect}
              >
                <span className="codicon codicon-arrow-right" aria-hidden="true" />
              </button>
            </div>
            <p>{questionNode.answer}</p>
          </div>
        ) : null}
      </div>
      <Handle className="ai-question-map-handle" type="source" position={Position.Right} />
    </div>
  )
}

function getQuestionStatusLabel(status: AiQuestionMapNode['status']): string {
  if (status === 'streaming') {
    return '生成中'
  }

  if (status === 'failed') {
    return '回答失败'
  }

  if (status === 'pending') {
    return '等待回答'
  }

  return '已回答'
}
