import type { MineruParseBlock, MineruParseResult, SourceRef } from '@thesis-agent/shared'

export type MindmapSkillId =
  | 'mindmap.source.prepare'
  | 'mindmap.paper.digest'
  | 'mindmap.markmap.compose'
  | 'mindmap.audit'

export type MindmapSkillDefinition = {
  id: MindmapSkillId
  title: string
  goal: string
  input: string
  output: string
  constraints: string[]
}

export type MindmapSourceBlock = {
  id: string
  type: MineruParseBlock['type']
  rawType: string
  pageNo: number
  headingLevel?: MineruParseBlock['headingLevel']
  text: string
  sourceRefs: SourceRef[]
}

export type MindmapPreparedSource = {
  paperId: string
  title: string
  markdown: string
  blocks: MindmapSourceBlock[]
  warnings: string[]
}

export type MindmapPromptInput = {
  source: MindmapPreparedSource
  language?: 'zh-CN' | 'en-US'
  maxDepth?: number
  maxNodeChars?: number
}

export type MindmapAuditIssue = {
  severity: 'warning' | 'error'
  code: string
  message: string
  line?: number
}

export type MindmapAuditResult = {
  ok: boolean
  markdown: string
  nodeCount: number
  maxDepth: number
  issues: MindmapAuditIssue[]
  warnings: string[]
}

export const mindmapSkillVersion = 'mindmap-skills-0.1.0'

export const mindmapSkillDefinitions: MindmapSkillDefinition[] = [
  {
    id: 'mindmap.source.prepare',
    title: '整理解析来源',
    goal: '把 MinerU 结构化解析块转换成稳定、可追溯、适合 AI 提炼的 Markdown 上下文。',
    input: 'MinerU 解析结果、论文路径、论文标题。',
    output: '带页码和 SourceRef 的 MindmapPreparedSource。',
    constraints: [
      '只使用已经解析的 MinerU 结果，不走 PDF.js 快速文本兜底。',
      '保留标题、段落、列表、公式、图表、表格和脚注的基本类型。',
      '每个块都必须能回溯到 paperId、pageNo 和 mineruBlockId。'
    ]
  },
  {
    id: 'mindmap.paper.digest',
    title: '提炼论文要点',
    goal: '从结构化论文内容中提炼研究问题、背景、贡献、方法、实验、结论、局限和后续阅读。',
    input: 'MindmapPreparedSource Markdown。',
    output: '可继续组合为脑图的论文要点层级。',
    constraints: [
      '优先依据原文，不编造论文中没有的信息。',
      '关键节点带页码，例如 [p. 3]。',
      '保留关键术语英文原文，中文解释保持简洁。'
    ]
  },
  {
    id: 'mindmap.markmap.compose',
    title: '组合 Markmap Markdown',
    goal: '把论文要点转换为 markmap 可渲染的 Markdown 层级。',
    input: '论文要点层级。',
    output: '只包含标题层级和短节点文本的 Markdown。',
    constraints: [
      '只输出 Markdown，不包代码块，不输出解释。',
      '根节点为论文标题，最多 4 层。',
      '单个节点建议不超过 30 个中文字符，必须避免 HTML 和 script。'
    ]
  },
  {
    id: 'mindmap.audit',
    title: '审计脑图 Markdown',
    goal: '清洗并校验 AI 输出，确保可以安全交给 markmap 渲染。',
    input: 'AI 输出 Markdown。',
    output: '清洗后的 Markdown、节点数量、最大深度和审计问题。',
    constraints: [
      '移除代码围栏、HTML 标签和危险协议。',
      '限制最大层级和空节点。',
      '发现缺少页码、节点过长或层级过深时给出 warning。'
    ]
  }
]

export const mindmapGenerationSystemPrompt = [
  '你是一个严谨的论文阅读脑图生成器。',
  '你只能根据提供的解析文本生成 markmap Markdown。',
  '不要编造论文中没有的信息；信息不足时用“待补充证据”标明。',
  '最终回答只能输出 Markdown，不要输出解释、代码围栏、HTML 或 JSON。'
].join('\n')

export function prepareMindmapSourceFromMineru(input: {
  paperId: string
  title?: string
  result: MineruParseResult
  maxBlocks?: number
  maxChars?: number
}): MindmapPreparedSource {
  const warnings: string[] = []
  const maxBlocks = Math.max(1, input.maxBlocks ?? 180)
  const maxChars = Math.max(2000, input.maxChars ?? 42000)
  const blocks = input.result.blocks
    .map((block) => normalizeMindmapSourceBlock(input.paperId, block))
    .filter((block) => block.text.trim().length > 0)

  if (blocks.length === 0) {
    warnings.push('解析结果中没有可用于生成脑图的文本块。')
  }

  if (blocks.length > maxBlocks) {
    warnings.push(`解析块较多，已从 ${blocks.length} 个块截断为前 ${maxBlocks} 个块。`)
  }

  const clippedBlocks = blocks.slice(0, maxBlocks)
  const markdownSections: string[] = []
  let usedChars = 0

  for (const block of clippedBlocks) {
    const section = formatMindmapSourceBlock(block)
    if (usedChars + section.length > maxChars) {
      warnings.push(`解析文本较长，已截断到约 ${maxChars} 字符。`)
      break
    }

    markdownSections.push(section)
    usedChars += section.length
  }

  return {
    paperId: input.paperId,
    title: input.title?.trim() || input.result.title?.trim() || getFileStem(input.paperId),
    markdown: markdownSections.join('\n\n'),
    blocks: clippedBlocks,
    warnings
  }
}

export function buildPaperMindmapPrompt(input: MindmapPromptInput): string {
  const maxDepth = input.maxDepth ?? 4
  const maxNodeChars = input.maxNodeChars ?? 30
  const language = input.language ?? 'zh-CN'

  return [
    '<mindmap_skill_pipeline>',
    mindmapSkillDefinitions.map((skill, index) => `${index + 1}. ${skill.id}：${skill.goal}`).join('\n'),
    '</mindmap_skill_pipeline>',
    '',
    '<output_rules>',
    `语言：${language === 'zh-CN' ? '中文为主，关键术语保留英文原文' : 'English'}`,
    `最大层级：${maxDepth}`,
    `单个节点建议不超过 ${maxNodeChars} 个中文字符或 80 个英文字符`,
    '根节点必须是论文标题。',
    '一级分支必须覆盖：研究问题、背景与动机、核心贡献、方法框架、实验与结果、局限与启发、后续阅读。',
    '二级及以下节点尽量带页码引用，例如 [p. 3]。',
    '只输出 Markdown，不要输出解释、不要使用代码围栏、不要输出 HTML。',
    '</output_rules>',
    '',
    '<parsed_paper>',
    `# ${input.source.title}`,
    '',
    input.source.markdown,
    '</parsed_paper>'
  ].join('\n')
}

export function auditMindmapMarkdown(input: {
  markdown: string
  maxDepth?: number
  maxNodeChars?: number
}): MindmapAuditResult {
  const maxDepthLimit = input.maxDepth ?? 4
  const maxNodeChars = input.maxNodeChars ?? 42
  const markdown = normalizeMindmapMarkdown(input.markdown)
  const lines = markdown.split('\n')
  const issues: MindmapAuditIssue[] = []
  let nodeCount = 0
  let maxDepth = 0

  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!heading) {
      return
    }

    nodeCount += 1
    const depth = heading[1].length
    const label = heading[2].trim()
    maxDepth = Math.max(maxDepth, depth)

    if (depth > maxDepthLimit) {
      issues.push({
        severity: 'error',
        code: 'mindmap.depth.too_deep',
        message: `第 ${index + 1} 行层级超过 ${maxDepthLimit} 层。`,
        line: index + 1
      })
    }

    if (label.length > maxNodeChars) {
      issues.push({
        severity: 'warning',
        code: 'mindmap.node.too_long',
        message: `第 ${index + 1} 行节点偏长，建议压缩。`,
        line: index + 1
      })
    }

    if (depth > 1 && !/\[p\.\s*\d+\]|\[第\s*\d+\s*页\]/i.test(label)) {
      issues.push({
        severity: 'warning',
        code: 'mindmap.node.missing_page_ref',
        message: `第 ${index + 1} 行缺少页码引用。`,
        line: index + 1
      })
    }
  })

  if (nodeCount === 0) {
    issues.push({
      severity: 'error',
      code: 'mindmap.empty',
      message: 'AI 输出中没有可渲染的 Markdown 标题节点。'
    })
  }

  if (/<\/?[a-z][\s\S]*>/i.test(markdown)) {
    issues.push({
      severity: 'error',
      code: 'mindmap.html.detected',
      message: 'AI 输出中包含 HTML 标签，已拒绝直接渲染。'
    })
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    markdown,
    nodeCount,
    maxDepth,
    issues,
    warnings: issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message)
  }
}

export function normalizeMindmapMarkdown(markdown: string): string {
  return markdown
    .replace(/^\s*```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
}

function normalizeMindmapSourceBlock(paperId: string, block: MineruParseBlock): MindmapSourceBlock {
  const text = getMindmapBlockText(block)
  const segments = block.segments?.length ? block.segments : [{ pageNo: block.pageNo, rect: block.rect }]

  return {
    id: block.id,
    type: block.type,
    rawType: block.rawType,
    pageNo: block.pageNo,
    headingLevel: block.headingLevel,
    text,
    sourceRefs: segments.map((segment, index) => ({
      type: block.type === 'equation' ? 'formula' : 'note_block',
      paperId,
      pageNo: segment.pageNo,
      rect: segment.rect,
      mineruBlockId: block.id,
      quote: text,
      textHash: `${block.id}:${index}:${text.slice(0, 80)}`
    }))
  }
}

function getMindmapBlockText(block: MineruParseBlock): string {
  if (block.text?.trim()) {
    return block.text.replace(/\s+/g, ' ').trim()
  }

  if (block.listItems?.length) {
    return block.listItems.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean).join('；')
  }

  if (block.tableRows?.length) {
    return block.tableRows
      .slice(0, 8)
      .map((row) => row.map((cell) => cell.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
      .filter(Boolean)
      .join('\n')
  }

  return (block.caption ?? block.rawType).replace(/\s+/g, ' ').trim()
}

function formatMindmapSourceBlock(block: MindmapSourceBlock): string {
  const typeLabel = getMindmapSourceBlockTypeLabel(block)
  const headingPrefix = block.type === 'heading' ? '#'.repeat(Math.min(4, Math.max(2, (block.headingLevel ?? 2) + 1))) : '###'

  if (block.type === 'heading') {
    return `${headingPrefix} ${block.text} [p. ${block.pageNo}]`
  }

  return [`${headingPrefix} ${typeLabel} [p. ${block.pageNo}]`, block.text].join('\n')
}

function getMindmapSourceBlockTypeLabel(block: MindmapSourceBlock): string {
  if (block.type === 'paragraph') return '正文'
  if (block.type === 'list') return '列表'
  if (block.type === 'equation') return '公式'
  if (block.type === 'image') return '图片'
  if (block.type === 'chart') return '图表'
  if (block.type === 'table') return '表格'
  if (block.type === 'footnote') return '脚注'
  return block.rawType || block.type
}

function getFileStem(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath
  return fileName.replace(/\.pdf$/i, '') || fileName
}
