import type { EntityId, SourceRef } from '@thesis-agent/shared'
import type { PptDeckMaterials, PptEvidenceItem, PptEvidenceKind } from './types'

type RawEvidence = {
  id: EntityId
  title: string
  text: string
  sourceRefs: SourceRef[]
  kind: PptEvidenceKind
}

const maxEvidenceItems = 36
const maxChunksPerMaterial = 5
const genericEnglishStopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
])

export function collectEvidenceItems(materials: PptDeckMaterials): PptEvidenceItem[] {
  const rawItems = collectRawEvidence(materials)
  const paperTitle = materials.paper?.title ?? ''
  const seen = new Set<string>()
  const evidenceItems: PptEvidenceItem[] = []

  for (const rawItem of rawItems) {
    const chunks = cleanEvidenceText(rawItem.text, paperTitle).slice(0, maxChunksPerMaterial)

    for (const [index, chunk] of chunks.entries()) {
      const normalizedText = normalizeEvidenceKey(chunk)
      if (!normalizedText || seen.has(normalizedText)) {
        continue
      }

      seen.add(normalizedText)
      evidenceItems.push({
        id: index === 0 ? rawItem.id : `${rawItem.id}:chunk:${index}`,
        title: rawItem.title,
        text: chunk,
        normalizedText,
        sourceRefs: rawItem.sourceRefs,
        kind: rawItem.kind,
        pageNo: getFirstPageNo(rawItem.sourceRefs),
        score: scoreEvidenceText(chunk, rawItem.kind)
      })
    }
  }

  return evidenceItems
    .sort((left, right) => right.score - left.score)
    .slice(0, maxEvidenceItems)
}

export function cleanEvidenceText(text: string, paperTitle = ''): string[] {
  const withoutRepeatedTitle = removePaperTitle(text, paperTitle)
  const normalized = withoutRepeatedTitle
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    return []
  }

  const candidates = splitEvidenceCandidates(normalized)
  const candidateCounts = countCandidateKeys(candidates, paperTitle)
  const chunks: string[] = []

  for (const candidate of candidates) {
    const cleaned = cleanCandidate(candidate, paperTitle)
    const candidateKey = normalizeEvidenceKey(cleaned)
    if (candidateKey && candidateCounts.get(candidateKey)! > 1) {
      continue
    }

    if (!cleaned || isNoiseCandidate(cleaned, paperTitle)) {
      continue
    }

    chunks.push(cleaned)
  }

  return dedupeSimilarTexts(chunks).slice(0, 12)
}

export function isLikelyRawPdfNoise(text: string): boolean {
  return isNoiseCandidate(text)
}

export function normalizeEvidenceText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function collectRawEvidence(materials: PptDeckMaterials): RawEvidence[] {
  const items: RawEvidence[] = []
  const paperSourceRefs = materials.paper?.sourceRefs?.length
    ? materials.paper.sourceRefs
    : materials.paper
      ? [{ type: 'paper' as const, paperId: materials.paper.id }]
      : []

  if (materials.paper?.abstract) {
    items.push({
      id: `${materials.paper.id}:abstract`,
      title: '论文摘要',
      text: materials.paper.abstract,
      sourceRefs: paperSourceRefs,
      kind: 'paper'
    })
  }

  for (const excerpt of materials.excerpts ?? []) {
    items.push({
      id: excerpt.id,
      title: excerpt.title || '原文摘录',
      text: excerpt.text,
      sourceRefs: excerpt.sourceRefs,
      kind: 'excerpt'
    })
  }

  for (const note of materials.notes ?? []) {
    items.push({
      id: note.id,
      title: note.title || '结构化笔记',
      text: note.text,
      sourceRefs: note.sourceRefs,
      kind: 'note'
    })
  }

  for (const answer of materials.aiAnswers ?? []) {
    items.push({
      id: answer.id,
      title: answer.title || 'AI 回答',
      text: answer.text,
      sourceRefs: answer.sourceRefs,
      kind: 'ai'
    })
  }

  return items
}

function splitEvidenceCandidates(text: string): string[] {
  const lineCandidates = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const sentenceCandidates = lineCandidates.flatMap((line) => splitLongCandidate(line))
  return sentenceCandidates.flatMap((candidate) => splitTableNoise(candidate))
}

function splitLongCandidate(text: string): string[] {
  const sentenceParts = text
    .split(/(?<=[。！？.!?；;])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)

  if (sentenceParts.length > 1) {
    return sentenceParts
  }

  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 32) {
    return [text]
  }

  const chunks: string[] = []
  for (let index = 0; index < words.length; index += 28) {
    chunks.push(words.slice(index, index + 28).join(' '))
  }
  return chunks
}

function splitTableNoise(text: string): string[] {
  return text
    .replace(/\b(?:Table|Fig(?:ure)?\.?)\s*\d+[.:]?\s*/gi, '\n')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cleanCandidate(text: string, paperTitle = ''): string {
  return removePaperTitle(text, paperTitle)
    .replace(/^\s*[-*•·]+\s*/u, '')
    .replace(/^\s*\(?\d+[\).、]\s*/u, '')
    .replace(/\b(?:Table|Fig(?:ure)?\.?)\s*\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:，。；：\s]+|[,.;:，。；：\s]+$/g, '')
    .trim()
}

function countCandidateKeys(candidates: string[], paperTitle = ''): Map<string, number> {
  const counts = new Map<string, number>()

  for (const candidate of candidates) {
    const key = normalizeEvidenceKey(cleanCandidate(candidate, paperTitle))
    if (!key) {
      continue
    }

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

function removePaperTitle(text: string, paperTitle = ''): string {
  const title = paperTitle.trim()
  if (title.length < 8) {
    return text
  }

  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return text.replace(new RegExp(escapedTitle, 'gi'), ' ')
}

function isNoiseCandidate(text: string, paperTitle = ''): boolean {
  const normalized = normalizeEvidenceText(text)
  if (!normalized) {
    return true
  }

  if (paperTitle && normalizeEvidenceKey(normalized) === normalizeEvidenceKey(paperTitle)) {
    return true
  }

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return true
  }

  if (/^(?:table|figure|fig\.?)\s*\d+$/i.test(normalized)) {
    return true
  }

  if (normalized.length < 10 && !/[\u4e00-\u9fa5]/u.test(normalized)) {
    return true
  }

  const letterCount = (normalized.match(/[A-Za-z\u4e00-\u9fa5]/gu) ?? []).length
  const digitCount = (normalized.match(/\d/g) ?? []).length
  if (letterCount < 5 || digitCount > letterCount * 1.5) {
    return true
  }

  const words = normalized.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length <= 4 && words.every((word) => genericEnglishStopWords.has(word) || /^\d+$/.test(word))) {
    return true
  }

  return false
}

function scoreEvidenceText(text: string, kind: PptEvidenceKind): number {
  const normalized = normalizeEvidenceText(text)
  let score = kind === 'note' || kind === 'ai' ? 8 : 4

  if (/方法|模型|算法|框架|调度|缓存|method|model|approach|algorithm|scheduler|cache/i.test(normalized)) {
    score += 5
  }
  if (/实验|结果|发现|提升|对比|优于|result|finding|experiment|evaluation|performance|baseline|vllm|orca/i.test(normalized)) {
    score += 5
  }
  if (/问题|背景|挑战|瓶颈|motivation|challenge|problem|memory|large language/i.test(normalized)) {
    score += 4
  }
  if (/局限|限制|未来|limitation|future|overhead|cost/i.test(normalized)) {
    score += 3
  }
  if (normalized.length > 40) {
    score += 2
  }
  if (!/[。！？.!?]/u.test(normalized) && normalized.split(/\s+/).length > 14) {
    score -= 2
  }

  return score
}

function normalizeEvidenceKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeSimilarTexts(texts: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const text of texts) {
    const key = normalizeEvidenceKey(text)
    const compactKey = key.replace(/\s+/g, '')
    const isDuplicate = [...seen].some((existingKey) => {
      if (existingKey === key) {
        return true
      }

      const existingCompactKey = existingKey.replace(/\s+/g, '')
      return compactKey.length > 18 && existingCompactKey.includes(compactKey.slice(0, 18))
    })

    if (isDuplicate) {
      continue
    }

    seen.add(key)
    result.push(text)
  }

  return result
}

function getFirstPageNo(sourceRefs: SourceRef[]): number | undefined {
  return sourceRefs.find((sourceRef) => typeof sourceRef.pageNo === 'number')?.pageNo
}
