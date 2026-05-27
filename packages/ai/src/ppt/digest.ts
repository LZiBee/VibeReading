import type { EntityId, SourceRef } from '@thesis-agent/shared'
import type {
  DigestPoint,
  DigestTerm,
  PaperDigest,
  PptDeckMaterials,
  PptEvidenceItem
} from './types'
import { normalizeEvidenceText } from './cleaning'

const problemKeywords = /问题|挑战|瓶颈|内存|显存|吞吐|延迟|problem|challenge|bottleneck|memory|latency|throughput|large language/i
const motivationKeywords = /因此|为了|需要|动机|背景|motivation|because|need|enable|efficient/i
const methodKeywords = /方法|模型|算法|框架|调度|缓存|分配|manager|scheduler|allocator|cache|block|method|model|approach|algorithm/i
const experimentKeywords = /实验|结果|评估|对比|基线|表|图|orca|vllm|baseline|experiment|evaluation|result|performance/i
const findingKeywords = /提升|降低|优于|证明|显示|发现|提高|reduce|improve|outperform|show|result|finding/i
const limitationKeywords = /局限|限制|未来|代价|开销|limitation|future|overhead|cost|trade-off/i

export function generatePaperDigestFromMaterials(input: {
  materials: PptDeckMaterials
  evidenceItems: PptEvidenceItem[]
}): PaperDigest {
  const paperId = input.materials.paper?.id ?? input.evidenceItems[0]?.id ?? 'paper'
  const title = input.materials.paper?.title?.trim() || '未命名论文汇报'
  const evidenceItems = input.evidenceItems
  const problemItems = selectEvidence(evidenceItems, problemKeywords, 3)
  const motivationItems = selectEvidence(evidenceItems, motivationKeywords, 3, problemItems)
  const methodItems = selectEvidence(evidenceItems, methodKeywords, 4)
  const experimentItems = selectEvidence(evidenceItems, experimentKeywords, 4)
  const findingItems = selectEvidence(evidenceItems, findingKeywords, 4, experimentItems)
  const limitationItems = selectEvidence(evidenceItems, limitationKeywords, 2)
  const keyTerms = extractDigestTerms(title, evidenceItems)

  return {
    paperId,
    title,
    oneSentenceSummary: buildOneSentenceSummary(title, evidenceItems, keyTerms),
    researchProblem: buildDigestPoints(problemItems, 'problem', [
      '论文关注大语言模型推理中的资源管理与性能瓶颈。',
      '研究问题需要结合原文继续确认具体应用场景。'
    ]),
    motivation: buildDigestPoints(motivationItems, 'motivation', [
      '该工作试图提升长文本或高并发场景下的推理效率。',
      '背景部分需要补充已有系统的不足与改进动机。'
    ]),
    method: buildDigestPoints(methodItems, 'method', [
      '方法部分围绕缓存管理、调度策略或资源分配展开。',
      '需要进一步补充核心模块之间的输入输出关系。'
    ]),
    experiments: buildDigestPoints(experimentItems, 'experiment', [
      '实验部分应重点说明对比对象、评价指标和测试设置。',
      '需要补充关键表格或图形来支撑实验结论。'
    ]),
    findings: buildDigestPoints(findingItems, 'finding', [
      '关键发现应围绕性能收益、适用场景和证据页展开。',
      '目前材料不足时，结论需要标记为待人工确认。'
    ]),
    limitations: buildDigestPoints(limitationItems, 'limitation', [
      '局限部分可从适用边界、额外开销和复现成本展开。',
      '若原文未明确说明，需要在汇报中标记为待确认。'
    ]),
    terms: keyTerms,
    figures: (input.materials.assets ?? []).slice(0, 4).map((asset) => ({
      assetId: asset.id,
      caption: asset.alt || '论文图表截图',
      evidenceRefs: asset.sourceRefs
    })),
    tables: buildTableDigests(evidenceItems)
  }
}

function buildDigestPoints(items: PptEvidenceItem[], focus: DigestFocus, fallbackTexts: string[]): DigestPoint[] {
  const points: DigestPoint[] = items.slice(0, 4).map((item) => ({
    text: rewriteEvidenceAsDigestPoint(item.text, focus),
    evidenceRefs: item.sourceRefs,
    confidence: item.kind === 'note' || item.kind === 'ai' ? 'high' as const : 'medium' as const
  }))

  for (const fallbackText of fallbackTexts) {
    if (points.length >= 3) {
      break
    }

    points.push({
      text: fallbackText,
      evidenceRefs: [],
      confidence: 'low'
    })
  }

  return dedupeDigestPoints(points).slice(0, 4)
}

type DigestFocus = 'problem' | 'motivation' | 'method' | 'experiment' | 'finding' | 'limitation'

function rewriteEvidenceAsDigestPoint(text: string, focus: DigestFocus): string {
  const evidence = compactEvidenceForPoint(text)
  const termSummary = summarizeTermList(evidence)

  if (termSummary) {
    switch (focus) {
      case 'experiment':
      case 'finding':
        return `实验材料涉及 ${termSummary}，需要结合指标解释其对比关系。`
      case 'method':
        return `方法部分涉及 ${termSummary}，可作为核心模块或系统组件说明。`
      default:
        return `原文反复出现 ${termSummary}，应作为汇报中的关键背景线索。`
    }
  }

  switch (focus) {
    case 'problem':
      return `论文关注：${evidence}`
    case 'motivation':
      return `研究动机：${evidence}`
    case 'method':
      return `核心方法：${evidence}`
    case 'experiment':
      return `实验设置：${evidence}`
    case 'finding':
      return `关键发现：${evidence}`
    case 'limitation':
      return `局限讨论：${evidence}`
  }
}

function compactEvidenceForPoint(text: string): string {
  const normalized = normalizeEvidenceText(text)
    .replace(/\b(?:Table|Fig(?:ure)?\.?)\s*\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = normalized.split(/(?<=[。！？.!?；;])\s*/u).find((item) => item.trim().length > 0) ?? normalized
  return sentence.replace(/[。！？.!?；;]+$/u, '').slice(0, 72)
}

function summarizeTermList(text: string): string | undefined {
  const terms = extractTermsFromText(text)
    .filter((term) => term.length > 1)
    .slice(0, 5)

  if (terms.length < 3) {
    return undefined
  }

  return terms.join('、')
}

function selectEvidence(
  evidenceItems: PptEvidenceItem[],
  keyword: RegExp,
  count: number,
  fallbackItems: PptEvidenceItem[] = []
): PptEvidenceItem[] {
  const selected = evidenceItems
    .filter((item) => keyword.test(item.text))
    .sort((left, right) => right.score - left.score)
  const merged = [...selected, ...fallbackItems, ...evidenceItems]
  const seen = new Set<EntityId>()
  const result: PptEvidenceItem[] = []

  for (const item of merged) {
    if (seen.has(item.id)) {
      continue
    }

    seen.add(item.id)
    result.push(item)

    if (result.length >= count) {
      break
    }
  }

  return result
}

function buildOneSentenceSummary(title: string, evidenceItems: PptEvidenceItem[], terms: DigestTerm[]): string {
  const topic = title.replace(/\.pdf$/i, '').trim()
  const termText = terms.slice(0, 3).map((term) => term.term).join('、')
  const hasExperiment = evidenceItems.some((item) => experimentKeywords.test(item.text))
  const hasMethod = evidenceItems.some((item) => methodKeywords.test(item.text))
  const suffix = [
    hasMethod ? '方法设计' : '核心思路',
    hasExperiment ? '实验对比' : '证据整理',
    '适用边界'
  ].join('、')

  return termText
    ? `本文围绕《${topic}》展开，重点讨论 ${termText} 相关的${suffix}。`
    : `本文围绕《${topic}》展开，重点梳理研究问题、核心方法、关键证据和后续讨论。`
}

function extractDigestTerms(title: string, evidenceItems: PptEvidenceItem[]): DigestTerm[] {
  const refsByTerm = new Map<string, SourceRef[]>()
  const addTerm = (term: string, refs: SourceRef[]) => {
    const normalizedTerm = normalizeTerm(term)
    if (!normalizedTerm || normalizedTerm.length < 2) {
      return
    }

    refsByTerm.set(normalizedTerm, [...(refsByTerm.get(normalizedTerm) ?? []), ...refs])
  }

  extractTermsFromText(title).forEach((term) => addTerm(term, []))
  evidenceItems.slice(0, 12).forEach((item) => {
    extractTermsFromText(item.text).forEach((term) => addTerm(term, item.sourceRefs))
  })

  return [...refsByTerm.entries()]
    .map(([term, refs]) => ({
      term,
      explanation: buildTermExplanation(term),
      evidenceRefs: uniqueSourceRefs(refs).slice(0, 4)
    }))
    .slice(0, 10)
}

function extractTermsFromText(text: string): string[] {
  const terms = new Set<string>()
  const knownTerms = text.match(/\b(?:KV Cache|vLLM|Orca|Scheduler|CPU|GPU|Block Allocator|Cache Manager)\b/gi) ?? []
  knownTerms.forEach((term) => terms.add(normalizeTerm(term)))

  const capitalizedPhrases = text.match(/\b[A-Z][A-Za-z0-9+-]*(?:\s+[A-Z][A-Za-z0-9+-]*){0,3}\b/g) ?? []
  capitalizedPhrases
    .filter((term) => !/^(The|This|These|We|In|For|Table|Figure)$/i.test(term))
    .forEach((term) => terms.add(normalizeTerm(term)))

  const cjkTerms = text.match(/[\u4e00-\u9fa5]{2,8}(?:管理|调度|缓存|分配|方法|模型|实验|性能|瓶颈)/gu) ?? []
  cjkTerms.forEach((term) => terms.add(normalizeTerm(term)))

  return [...terms].filter(Boolean)
}

function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, ' ').replace(/^[^\w\u4e00-\u9fa5]+|[^\w\u4e00-\u9fa5]+$/g, '').trim()
}

function buildTermExplanation(term: string): string {
  if (/kv cache/i.test(term)) {
    return '大语言模型推理中用于复用注意力键值状态的缓存。'
  }
  if (/scheduler/i.test(term)) {
    return '用于决定请求执行顺序和资源分配的调度组件。'
  }
  if (/allocator/i.test(term)) {
    return '负责将显存或内存块分配给不同请求的系统组件。'
  }
  if (/orca|vllm/i.test(term)) {
    return '实验中出现的对比系统或基线方法。'
  }
  return '论文中的关键术语，建议在汇报中保留英文原文并结合上下文解释。'
}

function buildTableDigests(evidenceItems: PptEvidenceItem[]) {
  return evidenceItems
    .filter((item) => /table|表格|对比|baseline|orca|vllm|performance/i.test(item.text))
    .slice(0, 3)
    .map((item, index) => ({
      title: item.title || `表格线索 ${index + 1}`,
      summary: rewriteEvidenceAsDigestPoint(item.text, 'experiment'),
      evidenceRefs: item.sourceRefs
    }))
}

function dedupeDigestPoints(points: DigestPoint[]): DigestPoint[] {
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = point.text.toLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function uniqueSourceRefs(sourceRefs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()
  return sourceRefs.filter((sourceRef) => {
    const key = JSON.stringify({
      type: sourceRef.type,
      paperId: sourceRef.paperId,
      noteId: sourceRef.noteId,
      noteBlockId: sourceRef.noteBlockId,
      pageNo: sourceRef.pageNo,
      messageId: sourceRef.messageId,
      referenceId: sourceRef.referenceId,
      rect: sourceRef.rect
    })

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
