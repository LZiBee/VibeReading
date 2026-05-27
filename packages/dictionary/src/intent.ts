import type { SelectionIntent } from '@thesis-agent/shared'
import { hasMeaningfulSentencePunctuation, normalizeSelectionText, tokenizeEnglishText } from './normalize'

export function resolveSelectionIntent(text: string): SelectionIntent {
  const normalizedText = normalizeSelectionText(text)
  const tokens = tokenizeEnglishText(normalizedText)
  const tokenCount = tokens.length
  const hasSentencePunctuation = hasMeaningfulSentencePunctuation(normalizedText)

  if (tokenCount <= 1 && normalizedText) {
    return {
      kind: 'word',
      route: 'dictionary',
      tokenCount,
      confidence: 0.95,
      reason: '单个英文词优先走本地词典'
    }
  }

  if (tokenCount >= 2 && tokenCount <= 4 && !hasSentencePunctuation) {
    return {
      kind: 'phrase',
      route: 'dictionary',
      tokenCount,
      confidence: 0.86,
      reason: '2-4 个词且没有明显句末标点，优先按短语查词典'
    }
  }

  if (tokenCount <= 40) {
    return {
      kind: 'sentence',
      route: 'translation',
      tokenCount,
      confidence: hasSentencePunctuation ? 0.9 : 0.72,
      reason: '选区更像完整句子，走翻译链路'
    }
  }

  return {
    kind: 'paragraph',
    route: 'translation',
    tokenCount,
    confidence: 0.9,
    reason: '选区较长，按段落翻译处理'
  }
}
