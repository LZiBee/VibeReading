import { normalizeGitHubRepositoryUrl, type MineruParseBlock, type MineruParseResult } from '@thesis-agent/shared'

export { normalizeGitHubRepositoryUrl }

export type RepositoryCandidateConfidence = 'high' | 'medium' | 'low'

export type RepositoryCandidateSource = 'mineru-markdown' | 'mineru-block' | 'manual'

export type RepositoryCandidate = {
  id: string
  url: string
  normalizedUrl: string
  owner: string
  repo: string
  confidence: RepositoryCandidateConfidence
  score: number
  source: RepositoryCandidateSource
  pageNo?: number
  context: string
  reason: string
  warnings: string[]
  occurrenceCount: number
}

export type RepositoryDiscoveryResult = {
  candidates: RepositoryCandidate[]
  warnings: string[]
}

type RepositoryOccurrence = {
  normalizedUrl: string
  owner: string
  repo: string
  source: RepositoryCandidateSource
  pageNo?: number
  context: string
}

type RepositoryCandidateAccumulator = {
  normalizedUrl: string
  owner: string
  repo: string
  source: RepositoryCandidateSource
  pageNo?: number
  contexts: string[]
  score: number
  warnings: string[]
  occurrenceCount: number
}

const githubUrlPattern =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/?#][^\s<>)\]}，。；；、'"`]+)?/gi

const positiveContextRules: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /\b(code|source code|implementation|repository|repo)\b/i, score: 24, reason: '上下文提到代码或实现' },
  { pattern: /\b(project page|homepage|available at|released at|open[- ]source)\b/i, score: 22, reason: '上下文像官方项目入口' },
  { pattern: /\bgithub\b/i, score: 8, reason: '上下文明确出现 GitHub' },
  { pattern: /代码|源码|开源|实现|项目主页|仓库/i, score: 20, reason: '中文上下文提到代码仓库' }
]

const negativeContextRules: Array<{ pattern: RegExp; score: number; warning: string }> = [
  { pattern: /\b(reference|references|bibliography|cited by|citation)\b/i, score: -34, warning: '上下文可能位于参考文献区域' },
  { pattern: /参考文献|引用|文献列表/i, score: -34, warning: '上下文可能位于参考文献区域' },
  { pattern: /\b(pytorch|tensorflow|detectron|mmdetection|mmcv|opencv|huggingface|transformers)\b/i, score: -14, warning: '可能是第三方依赖或生态工具链接' },
  { pattern: /\b(issue|pull request|discussion|docs?)\b/i, score: -8, warning: '上下文不像论文主仓库入口' }
]

export function discoverRepositoriesFromMineru(input: {
  paperTitle?: string
  result: MineruParseResult
  maxCandidates?: number
}): RepositoryDiscoveryResult {
  const occurrences = [
    ...extractRepositoryOccurrencesFromText(input.result.markdown, 'mineru-markdown'),
    ...extractRepositoryOccurrencesFromBlocks(input.result.blocks)
  ]
  const warnings: string[] = []

  if (occurrences.length === 0) {
    warnings.push('MinerU 解析文本中没有识别到 GitHub 仓库链接，可以手动输入仓库 URL。')
    return {
      candidates: [],
      warnings
    }
  }

  const candidateMap = new Map<string, RepositoryCandidateAccumulator>()

  occurrences.forEach((occurrence) => {
    const current =
      candidateMap.get(occurrence.normalizedUrl) ??
      createRepositoryCandidateAccumulator(occurrence, input.paperTitle)
    const contextScore = scoreRepositoryContext(occurrence.context, occurrence.owner, occurrence.repo, input.paperTitle)

    current.occurrenceCount += 1
    current.score += contextScore.score
    if (occurrence.source === 'mineru-block') {
      current.score += 4
    }

    if (!current.pageNo && occurrence.pageNo) {
      current.pageNo = occurrence.pageNo
    }

    current.contexts.push(occurrence.context)
    current.warnings.push(...contextScore.warnings)
    candidateMap.set(occurrence.normalizedUrl, current)
  })

  const candidates = [...candidateMap.values()]
    .map((candidate) => finalizeRepositoryCandidate(candidate))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.normalizedUrl.localeCompare(right.normalizedUrl)
    })
    .slice(0, Math.max(1, input.maxCandidates ?? 8))

  const highConfidenceCount = candidates.filter((candidate) => candidate.confidence === 'high').length
  if (highConfidenceCount === 0) {
    warnings.push('未找到高置信度仓库候选，请确认候选上下文或手动输入论文主仓库。')
  }

  return {
    candidates,
    warnings
  }
}

export function createManualRepositoryCandidate(input: string): RepositoryCandidate | null {
  const normalized = normalizeGitHubRepositoryUrl(input)
  if (!normalized) {
    return null
  }

  return {
    id: createRepositoryCandidateId(normalized.normalizedUrl),
    url: normalized.normalizedUrl,
    normalizedUrl: normalized.normalizedUrl,
    owner: normalized.owner,
    repo: normalized.repo,
    confidence: 'high',
    score: 100,
    source: 'manual',
    context: '用户手动输入',
    reason: '用户手动确认的 GitHub 仓库 URL',
    warnings: [],
    occurrenceCount: 1
  }
}

function extractRepositoryOccurrencesFromBlocks(blocks: MineruParseBlock[]): RepositoryOccurrence[] {
  return blocks.flatMap((block) => {
    const text = getRepositoryBlockText(block)
    if (!text) {
      return []
    }

    return extractRepositoryOccurrencesFromText(text, 'mineru-block', block.pageNo)
  })
}

function extractRepositoryOccurrencesFromText(
  text: string,
  source: RepositoryCandidateSource,
  pageNo?: number
): RepositoryOccurrence[] {
  const occurrences: RepositoryOccurrence[] = []
  let match: RegExpExecArray | null

  githubUrlPattern.lastIndex = 0
  while ((match = githubUrlPattern.exec(text)) !== null) {
    const normalized = normalizeGitHubRepositoryUrl(match[0])
    if (!normalized) {
      continue
    }

    occurrences.push({
      ...normalized,
      source,
      pageNo,
      context: extractRepositoryContext(text, match.index, match[0].length)
    })
  }

  return occurrences
}

function getRepositoryBlockText(block: MineruParseBlock): string {
  const parts = [
    block.text,
    block.caption,
    block.listItems?.join('\n'),
    block.footnotes?.join('\n'),
    block.tableRows?.map((row) => row.join(' ')).join('\n')
  ].filter((part): part is string => Boolean(part?.trim()))

  return parts.join('\n')
}

function createRepositoryCandidateAccumulator(
  occurrence: RepositoryOccurrence,
  paperTitle?: string
): RepositoryCandidateAccumulator {
  const titleScore = scoreRepositoryTitleMatch(occurrence.owner, occurrence.repo, paperTitle)

  return {
    normalizedUrl: occurrence.normalizedUrl,
    owner: occurrence.owner,
    repo: occurrence.repo,
    source: occurrence.source,
    pageNo: occurrence.pageNo,
    contexts: [],
    score: 38 + titleScore,
    warnings: [],
    occurrenceCount: 0
  }
}

function scoreRepositoryContext(
  context: string,
  owner: string,
  repo: string,
  paperTitle?: string
): {
  score: number
  warnings: string[]
} {
  let score = 0
  const reasons: string[] = []
  const warnings: string[] = []

  positiveContextRules.forEach((rule) => {
    if (rule.pattern.test(context)) {
      score += rule.score
      reasons.push(rule.reason)
    }
  })

  negativeContextRules.forEach((rule) => {
    if (rule.pattern.test(context)) {
      score += rule.score
      warnings.push(rule.warning)
    }
  })

  if (scoreRepositoryTitleMatch(owner, repo, paperTitle) > 0) {
    score += 14
    reasons.push('仓库名和论文标题有重叠')
  }

  if (reasons.length === 0 && warnings.length === 0) {
    score += 4
  }

  return {
    score,
    warnings
  }
}

function finalizeRepositoryCandidate(accumulator: RepositoryCandidateAccumulator): RepositoryCandidate {
  const score = Math.round(accumulator.score + Math.min(3, accumulator.occurrenceCount - 1) * 8)
  const confidence: RepositoryCandidateConfidence = score >= 70 ? 'high' : score >= 46 ? 'medium' : 'low'
  const context = getBestRepositoryContext(accumulator.contexts)
  const warnings = uniqueStrings(accumulator.warnings)

  return {
    id: createRepositoryCandidateId(accumulator.normalizedUrl),
    url: accumulator.normalizedUrl,
    normalizedUrl: accumulator.normalizedUrl,
    owner: accumulator.owner,
    repo: accumulator.repo,
    confidence,
    score,
    source: accumulator.source,
    pageNo: accumulator.pageNo,
    context,
    reason: describeRepositoryCandidateReason(confidence, accumulator.occurrenceCount, warnings),
    warnings,
    occurrenceCount: accumulator.occurrenceCount
  }
}

function describeRepositoryCandidateReason(
  confidence: RepositoryCandidateConfidence,
  occurrenceCount: number,
  warnings: string[]
): string {
  const base = confidence === 'high' ? '高置信度候选' : confidence === 'medium' ? '中置信度候选' : '低置信度候选'
  const occurrencePart = occurrenceCount > 1 ? `，出现 ${occurrenceCount} 次` : ''
  const warningPart = warnings.length > 0 ? `，需注意：${warnings[0]}` : ''

  return `${base}${occurrencePart}${warningPart}`
}

function extractRepositoryContext(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - 180)
  const end = Math.min(text.length, index + matchLength + 180)

  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()
}

function getBestRepositoryContext(contexts: string[]): string {
  const sorted = [...contexts].sort((left, right) => {
    const leftScore = getContextDisplayScore(left)
    const rightScore = getContextDisplayScore(right)

    return rightScore - leftScore
  })

  return sorted[0] ?? ''
}

function getContextDisplayScore(context: string): number {
  let score = 0
  positiveContextRules.forEach((rule) => {
    if (rule.pattern.test(context)) {
      score += rule.score
    }
  })

  return score
}

function scoreRepositoryTitleMatch(owner: string, repo: string, paperTitle?: string): number {
  const titleTokens = tokenizeRepositoryText(paperTitle ?? '')
  if (titleTokens.length === 0) {
    return 0
  }

  const repoTokens = new Set([...tokenizeRepositoryText(owner), ...tokenizeRepositoryText(repo)])
  const overlapCount = titleTokens.filter((token) => repoTokens.has(token)).length

  if (overlapCount >= 2) {
    return 18
  }

  return overlapCount === 1 ? 8 : 0
}

function tokenizeRepositoryText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function cleanGitHubPathSegment(segment: string): string {
  return segment
    .replace(/^[^A-Za-z0-9]+/g, '')
    .replace(/[.,;:!?，。；、]+$/g, '')
    .replace(/[^A-Za-z0-9_.-]+$/g, '')
}

function isValidGitHubPathSegment(segment: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(segment) && !segment.startsWith('.') && !segment.endsWith('.')
}

function createRepositoryCandidateId(normalizedUrl: string): string {
  return normalizedUrl.toLowerCase().replace(/^https:\/\/github\.com\//, '').replace(/[^a-z0-9]+/g, '_')
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}
