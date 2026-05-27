import type { Editor } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $node, $view } from '@milkdown/utils'
import type { Ctx } from '@milkdown/kit/ctx'
import type { MarkdownNode, NodeSchema } from '@milkdown/kit/transformer'
import { decodeComplexBlockHref, encodeComplexBlockHref } from './complexBlockProtocol'

type AiAnswerAttrs = {
  blockId: string
  label: string
  sourceRefsJson?: string
  answerText?: string
}

type DefineFeature<Config = unknown> = (editor: Editor, config?: Config) => void

export const aiAnswerNode = $node('ai_answer', (_ctx: Ctx): NodeSchema => ({
  group: 'block',
  content: 'inline*',
  atom: false,
  selectable: true,
  draggable: false,
  attrs: {
    blockId: { default: '' },
    label: { default: '' },
    sourceRefsJson: { default: '' },
    answerText: { default: '' }
  },
  parseMarkdown: {
    match: (node: MarkdownNode) =>
      node.type === 'paragraph' &&
      Array.isArray(node.children) &&
      node.children.length === 1 &&
      node.children[0]?.type === 'link' &&
      typeof node.children[0]?.url === 'string' &&
      node.children[0].url.startsWith('inspiration-note-block://') &&
      decodeComplexBlockHref(node.children[0].url)?.kind === 'ai_answer',
    runner: (state, node, proseType) => {
      const link = node.children?.[0]
      const url = typeof link?.url === 'string' ? link.url : ''
      const payload = decodeComplexBlockHref(url)
      const label = readAiAnswerLabel(link)
      const answerText = typeof link?.title === 'string' ? link.title : label
      const blockId = payload?.blockId ?? ''
      const sourceRefsJson = payload?.sourceRefsJson ?? ''

      state.openNode(proseType, {
        blockId,
        label,
        sourceRefsJson,
        answerText
      })
      state.addText(answerText || label)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node: ProseNode) => node.type.name === 'ai_answer',
    runner: (state, node) => {
      const attrs = node.attrs as AiAnswerAttrs
      const answerText = node.textContent?.trim() || attrs.answerText || attrs.label || 'AI 回答'
      const href = encodeComplexBlockHref({
        blockId: attrs.blockId,
        kind: 'ai_answer',
        sourceRefsJson: attrs.sourceRefsJson
      })

      state.addNode('paragraph', [
        {
          type: 'link',
          url: href,
          title: answerText,
          children: [
            {
              type: 'text',
              value: attrs.label || 'AI 回答'
            }
          ]
        }
      ])
    }
  }
}))

const aiAnswerView = $view(aiAnswerNode, (_ctx): NodeViewConstructor => {
  return (node) => {
    const dom = document.createElement('div')
    dom.className = 'milkdown-ai-answer'
    dom.dataset.noteBlockId = String(node.attrs.blockId ?? '')
    dom.dataset.noteBlockType = 'ai_answer'

    const header = document.createElement('div')
    header.className = 'milkdown-ai-answer-header'
    header.textContent = node.attrs.label || 'AI 回答'

    const body = document.createElement('div')
    body.className = 'milkdown-ai-answer-body'
    const contentDOM = document.createElement('div')
    contentDOM.className = 'milkdown-ai-answer-content'
    body.append(contentDOM)

    const footer = document.createElement('div')
    footer.className = 'milkdown-ai-answer-footer'
    footer.textContent = '结构化 AI 回答节点'

    dom.append(header, body, footer)

    return {
      dom,
      contentDOM,
      ignoreMutation: () => true
    }
  }
})

export const aiAnswerFeature: DefineFeature = (editor) => {
  editor.use(aiAnswerNode)
  editor.use(aiAnswerView)
}

function readAiAnswerLabel(link: unknown): string {
  if (!link || typeof link !== 'object') {
    return 'AI 回答'
  }

  const maybeChildren = (link as { children?: Array<{ value?: unknown }> }).children
  const text = maybeChildren?.map((child) => (typeof child.value === 'string' ? child.value : '')).join('').trim()
  return text || 'AI 回答'
}
