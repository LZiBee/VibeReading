import { createId } from '@thesis-agent/shared'
import type { DeckIntent, SlideKind, SourceRef } from '@thesis-agent/shared'
import { isLikelyRawPdfNoise, normalizeEvidenceText } from './cleaning'
import type {
  DeckContentQualityIssue,
  DigestPoint,
  PaperDigest,
  PlannedSlide,
  PlannedSlideKind,
  PptDeckMaterials,
  SlideDraft,
  SlidePlan
} from './types'

export function generateSlidePlanFromDigest(input: {
  digest: PaperDigest
  intent: DeckIntent
  materials: PptDeckMaterials
}): SlidePlan {
  const slides: PlannedSlide[] = [
    createPlannedSlide('cover', input.digest.title, '建立汇报主题', input.digest.oneSentenceSummary, []),
  ]

  if (input.intent.includeAgenda) {
    slides.push(
      createPlannedSlide(
        'agenda',
        '汇报结构',
        '让听众先知道本次汇报路径',
        '从研究背景、方法、实验发现到局限与总结逐步展开。',
        []
      )
    )
  }

  slides.push(
    createPlannedSlide(
      'background',
      '研究背景与问题',
      '说明为什么这篇论文值得读',
      firstPointText(input.digest.researchProblem) || input.digest.oneSentenceSummary,
      refsFromPoints(input.digest.researchProblem)
    ),
    createPlannedSlide(
      'method',
      '核心方法或系统设计',
      '解释论文如何解决问题',
      firstPointText(input.digest.method) || '围绕核心模块、调度策略和资源分配解释方法。',
      refsFromPoints(input.digest.method),
      input.digest.figures[0] ? '使用论文图表或截图辅助说明方法结构。' : undefined
    ),
    createPlannedSlide(
      'experiment',
      '实验设置与对比对象',
      '说明实验如何验证方法有效性',
      firstPointText(input.digest.experiments) || '梳理实验对比对象、指标和设置。',
      refsFromPoints(input.digest.experiments),
      input.digest.tables[0] ? '将关键表格转成对比说明或截图页。' : undefined
    ),
    createPlannedSlide(
      'finding',
      '关键发现',
      '提炼可复述的结果结论',
      firstPointText(input.digest.findings) || '提炼论文中最重要的发现和证据。',
      refsFromPoints(input.digest.findings)
    ),
    createPlannedSlide(
      'discussion',
      '讨论与局限',
      '说明结论的适用边界',
      firstPointText(input.digest.limitations) || '补充方法适用边界、潜在开销和待确认问题。',
      refsFromPoints(input.digest.limitations)
    ),
    createPlannedSlide(
      'conclusion',
      '总结',
      '用三条结论收束汇报',
      input.digest.oneSentenceSummary,
      collectDigestSourceRefs(input.digest)
    )
  )

  if (input.intent.includeReferences) {
    slides.push(createPlannedSlide('references', '参考文献', '列出实际引用来源', '保留本次汇报实际引用的来源。', []))
  }

  if (input.intent.includeAppendix) {
    slides.push(createPlannedSlide('appendix', '附录：待补充材料', '承接更多截图、公式和问答', '附录用于保存未进入正文的证据。', collectDigestSourceRefs(input.digest)))
  }

  return {
    title: input.digest.title,
    audience: input.intent.audience,
    language: input.intent.language,
    slides: trimPlannedSlides(slides, input.intent)
  }
}

export function generateSlideDraftsFromPlan(input: {
  plan: SlidePlan
  digest: PaperDigest
  materials: PptDeckMaterials
}): { drafts: SlideDraft[]; issues: DeckContentQualityIssue[] } {
  const rawDrafts = input.plan.slides.map((slide) => createDraftForPlannedSlide(slide, input.digest, input.materials))
  const { drafts, issues } = reviseSlideDrafts(rawDrafts)

  return {
    drafts,
    issues
  }
}

function createDraftForPlannedSlide(slide: PlannedSlide, digest: PaperDigest, materials: PptDeckMaterials): SlideDraft {
  switch (slide.kind) {
    case 'cover':
      return {
        slideId: slide.id,
        planKind: slide.kind,
        slideKind: 'cover',
        title: digest.title,
        subtitle: digest.oneSentenceSummary,
        bullets: [],
        speakerNotes: `开场先说明论文主题：${digest.oneSentenceSummary}`,
        sourceRefs: slide.evidenceRefs
      }
    case 'agenda':
      return {
        slideId: slide.id,
        planKind: slide.kind,
        slideKind: 'timeline',
        title: slide.title,
        bullets: ['研究背景与问题', '核心方法或系统设计', '实验设置与对比对象', '关键发现', '讨论与总结'],
        speakerNotes: '这一页用于给听众建立汇报路线，后续每页围绕一个中心信息展开。',
        sourceRefs: [],
        visual: createDiagramVisual('agenda', digest)
      }
    case 'background':
    case 'problem':
      return buildPointDraft(slide, 'two-column', [
        ...digest.researchProblem,
        ...digest.motivation
      ], '背景页重点解释研究问题和动机，不直接堆原文。', createDiagramVisual('background', digest))
    case 'method':
      return buildPointDraft(
        slide,
        digest.figures[0] ? 'figure' : 'two-column',
        digest.method,
        '方法页建议配合模块脑图或论文原图，说明输入、机制、模块和输出之间的关系。',
        createFigureOrDiagramVisual('method', digest, 0)
      )
    case 'experiment':
      return buildPointDraft(
        slide,
        digest.figures[1] ? 'figure' : 'two-column',
        digest.experiments,
        '实验页要明确对比对象、指标和实验设置，避免只列系统名称。',
        createExperimentVisual(digest)
      )
    case 'finding':
      return buildPointDraft(
        slide,
        digest.figures[2] ? 'figure' : 'two-column',
        digest.findings,
        '发现页只保留最可复述的结果，并说明来自哪些证据。',
        createFigureOrDiagramVisual('finding', digest, 2)
      )
    case 'discussion':
      return buildPointDraft(
        slide,
        'comparison',
        digest.limitations,
        '讨论页用于提醒适用边界，避免把模型推断当成原文结论。',
        createFigureOrDiagramVisual('discussion', digest, 3)
      )
    case 'conclusion':
      return {
        slideId: slide.id,
        planKind: slide.kind,
        slideKind: 'two-column',
        title: slide.title,
        bullets: [
          digest.oneSentenceSummary,
          ...digest.findings.slice(0, 2).map((point) => point.text),
          ...digest.limitations.slice(0, 1).map((point) => point.text)
        ],
        speakerNotes: '总结页控制在三到四条，用于收束贡献、证据和后续阅读方向。',
        sourceRefs: slide.evidenceRefs,
        visual: createDiagramVisual('conclusion', digest)
      }
    case 'references':
      return {
        slideId: slide.id,
        planKind: slide.kind,
        slideKind: 'references',
        title: slide.title,
        bullets: [],
        speakerNotes: '参考文献页由导出器根据 DeckSpec citations 渲染。',
        sourceRefs: slide.evidenceRefs
      }
    case 'appendix':
      return {
        slideId: slide.id,
        planKind: slide.kind,
        slideKind: 'appendix',
        title: slide.title,
        bullets: ['原文证据列表', '更多截图或公式', '扩展问答记录'],
        speakerNotes: '附录用于存放正文无法展开的补充材料。',
        sourceRefs: slide.evidenceRefs
      }
  }
}

function createFigureOrDiagramVisual(
  kind: PlannedSlideKind,
  digest: PaperDigest,
  figureIndex: number
): SlideDraft['visual'] {
  const figure = digest.figures[figureIndex]
  if (figure) {
    return {
      kind: 'figure',
      assetId: figure.assetId,
      caption: figure.caption
    }
  }

  return createDiagramVisual(kind, digest)
}

function createExperimentVisual(digest: PaperDigest): SlideDraft['visual'] {
  const figure = digest.figures[1]
  if (figure) {
    return {
      kind: 'figure',
      assetId: figure.assetId,
      caption: figure.caption
    }
  }

  if (digest.tables[0]) {
    return {
      kind: 'table',
      caption: digest.tables[0].summary
    }
  }

  return createDiagramVisual('experiment', digest)
}

function createDiagramVisual(kind: PlannedSlideKind, digest: PaperDigest): SlideDraft['visual'] {
  return {
    kind: 'diagram',
    diagramKind: 'mermaid',
    source: createMermaidDiagram(kind, digest),
    caption: getDiagramCaption(kind)
  }
}

function createMermaidDiagram(kind: PlannedSlideKind, digest: PaperDigest): string {
  switch (kind) {
    case 'agenda':
      return createMermaidMindmap('汇报路线', ['背景问题', '核心方法', '实验结果', '局限讨论', '总结启发'])
    case 'background':
    case 'problem':
      return createMermaidMindmap('研究问题', [
        firstDigestLabel(digest.researchProblem, '问题背景'),
        firstDigestLabel(digest.motivation, '研究动机'),
        '为什么值得读'
      ])
    case 'method':
      return createMermaidMindmap('方法结构', [
        '论文输入',
        firstDigestLabel(digest.method, '核心方法'),
        '关键机制',
        '输出结果'
      ])
    case 'experiment':
      return createMermaidMindmap('实验验证', [
        '实验设置',
        '对比基线',
        '评价指标',
        firstDigestLabel(digest.findings, '结果结论')
      ])
    case 'finding':
      return createMermaidMindmap('关键发现', [
        ...digest.findings.slice(0, 3).map((point) => createShortDiagramLabel(point.text, '发现')),
        '证据页回看'
      ])
    case 'discussion':
      return createMermaidMindmap('讨论边界', [
        firstDigestLabel(digest.limitations, '适用边界'),
        '潜在开销',
        '复现成本',
        '后续启发'
      ])
    case 'conclusion':
      return createMermaidMindmap('组会结论', [
        '解决什么问题',
        '方法为什么有效',
        '证据是否充分',
        '对课题的启发'
      ])
    default:
      return createMermaidMindmap('论文理解', ['问题', '方法', '证据', '结论'])
  }
}

function createMermaidFlow(labels: string[]): string {
  const nodes = labels.slice(0, 5).map((label, index) => {
    const id = String.fromCharCode(65 + index)
    return `${id}["${escapeMermaidLabel(createShortDiagramLabel(label, `步骤${index + 1}`))}"]`
  })
  const edges = nodes.slice(0, -1).map((node, index) => `${node} --> ${nodes[index + 1]}`)

  return ['flowchart LR', ...edges].join('\n')
}

function createMermaidMindmap(root: string, children: string[]): string {
  return [
    'mindmap',
    `  root((${escapeMermaidLabel(createShortDiagramLabel(root, '主题'))}))`,
    ...children.slice(0, 5).map((child) => `    ${escapeMermaidLabel(createShortDiagramLabel(child, '要点'))}`)
  ].join('\n')
}

function getDiagramCaption(kind: PlannedSlideKind): string {
  const captions: Partial<Record<PlannedSlideKind, string>> = {
    agenda: '自制汇报路线图',
    background: '自制问题背景图',
    problem: '自制研究问题图',
    method: '自制方法结构脑图',
    experiment: '自制实验验证脑图',
    finding: '自制关键发现图',
    discussion: '自制局限讨论图',
    conclusion: '自制总结思维导图'
  }

  return captions[kind] ?? '自制论文理解图示'
}

function firstDigestLabel(points: DigestPoint[], fallback: string): string {
  return createShortDiagramLabel(points[0]?.text, fallback)
}

function createShortDiagramLabel(text: string | undefined, fallback: string): string {
  const normalized = normalizeEvidenceText(text ?? '')
    .replace(/^(论文关注|研究动机|核心方法|实验设置|关键发现|局限部分|原文反复出现)[：:]/u, '')
    .replace(/[。；;].*$/u, '')
    .trim()

  return (normalized || fallback).slice(0, 18)
}

function escapeMermaidLabel(text: string): string {
  return text.replace(/["[\]{}()]/g, '').trim() || '要点'
}

function buildPointDraft(
  slide: PlannedSlide,
  slideKind: SlideKind,
  points: DigestPoint[],
  speakerNotes: string,
  visual?: SlideDraft['visual']
): SlideDraft {
  const bullets = points.map((point) => point.text)

  return {
    slideId: slide.id,
    planKind: slide.kind,
    slideKind,
    title: slide.title,
    bullets: bullets.length ? bullets : [slide.keyMessage],
    speakerNotes,
    sourceRefs: refsFromPoints(points).length ? refsFromPoints(points) : slide.evidenceRefs,
    visual
  }
}

function reviseSlideDrafts(rawDrafts: SlideDraft[]): { drafts: SlideDraft[]; issues: DeckContentQualityIssue[] } {
  const issues: DeckContentQualityIssue[] = []
  const drafts = rawDrafts.map((draft) => {
    const seen = new Set<string>()
    const bullets: string[] = []

    for (const bullet of draft.bullets) {
      const normalized = normalizeBullet(bullet)
      if (!normalized) {
        continue
      }

      if (seen.has(normalized.toLowerCase())) {
        issues.push({
          severity: 'warning',
          slideId: draft.slideId,
          code: 'duplicate_text',
          message: `已移除重复要点：${normalized.slice(0, 30)}`
        })
        continue
      }

      if (isWeakBullet(normalized)) {
        issues.push({
          severity: 'warning',
          slideId: draft.slideId,
          code: 'weak_bullet',
          message: `已过滤低信息密度要点：${normalized.slice(0, 30)}`
        })
        continue
      }

      if (isLikelyRawPdfNoise(normalized)) {
        issues.push({
          severity: 'warning',
          slideId: draft.slideId,
          code: 'raw_pdf_noise',
          message: `已过滤疑似 PDF 噪声：${normalized.slice(0, 30)}`
        })
        continue
      }

      seen.add(normalized.toLowerCase())
      bullets.push(normalized)
    }

    if (bullets.length > 5) {
      issues.push({
        severity: 'info',
        slideId: draft.slideId,
        code: 'too_many_bullets',
        message: `已将 ${draft.title} 的要点压缩到 5 条以内。`
      })
    }

    if (draft.sourceRefs.length === 0 && draft.planKind !== 'cover' && draft.planKind !== 'agenda' && draft.planKind !== 'references') {
      issues.push({
        severity: 'info',
        slideId: draft.slideId,
        code: 'missing_source',
        message: `${draft.title} 暂无明确来源引用，建议后续人工确认。`
      })
    }

    return {
      ...draft,
      title: normalizeTitle(draft.title),
      bullets: fillDraftBullets(draft, bullets.slice(0, 5))
    }
  })

  return {
    drafts,
    issues
  }
}

function createPlannedSlide(
  kind: PlannedSlideKind,
  title: string,
  goal: string,
  keyMessage: string,
  evidenceRefs: SourceRef[],
  visualSuggestion?: string
): PlannedSlide {
  return {
    id: createId('slide'),
    kind,
    title,
    goal,
    keyMessage,
    evidenceRefs,
    visualSuggestion
  }
}

function trimPlannedSlides(slides: PlannedSlide[], intent: DeckIntent): PlannedSlide[] {
  if (slides.length <= intent.targetSlideCount) {
    return slides
  }

  const cover = slides.find((slide) => slide.kind === 'cover')
  const agenda = intent.includeAgenda ? slides.find((slide) => slide.kind === 'agenda') : undefined
  const references = intent.includeReferences ? slides.find((slide) => slide.kind === 'references') : undefined
  const requiredKinds = new Set(['background', 'method', 'experiment', 'finding', 'discussion', 'conclusion'])
  const middleCapacity = intent.targetSlideCount - [cover, agenda, references].filter(Boolean).length
  const middle = slides
    .filter((slide) => requiredKinds.has(slide.kind))
    .slice(0, Math.max(0, middleCapacity))

  return [cover, agenda, ...middle, references].filter((slide): slide is PlannedSlide => Boolean(slide))
}

function fillDraftBullets(draft: SlideDraft, bullets: string[]): string[] {
  if (draft.planKind === 'cover' || draft.planKind === 'references') {
    return bullets
  }

  const fallbackByKind: Partial<Record<PlannedSlideKind, string[]>> = {
    background: ['研究问题需要结合论文背景进一步说明。', '该工作与现有方法的差异仍需人工确认。'],
    method: ['核心方法需要补充模块关系和执行流程。', '建议加入论文图表或截图辅助说明。'],
    experiment: ['实验页需要说明基线、指标和测试设置。', '关键数值应从原文表格或图中确认。'],
    finding: ['关键发现需要和具体证据页保持对应。', '避免加入没有来源的绝对化结论。'],
    discussion: ['局限部分需要标记适用边界和潜在开销。', '后续可补充复现实验或延伸阅读。'],
    conclusion: ['总结应压缩为可复述的三条结论。']
  }
  const nextBullets = [...bullets]

  for (const fallback of fallbackByKind[draft.planKind] ?? []) {
    if (nextBullets.length >= 3) {
      break
    }

    nextBullets.push(fallback)
  }

  return nextBullets
}

function normalizeBullet(text: string): string {
  return normalizeEvidenceText(text)
    .replace(/^[,.;:，。；：\s]+|[,.;:，。；：\s]+$/g, '')
    .slice(0, 96)
}

function normalizeTitle(title: string): string {
  return normalizeEvidenceText(title).slice(0, 34)
}

function isWeakBullet(text: string): boolean {
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return true
  }

  const cjkCount = (text.match(/[\u4e00-\u9fa5]/gu) ?? []).length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  if (cjkCount === 0 && wordCount <= 3) {
    return true
  }

  return false
}

function firstPointText(points: DigestPoint[]): string | undefined {
  return points.find((point) => point.text.trim().length > 0)?.text
}

function refsFromPoints(points: DigestPoint[]): SourceRef[] {
  return uniqueSourceRefs(points.flatMap((point) => point.evidenceRefs)).slice(0, 12)
}

function collectDigestSourceRefs(digest: PaperDigest): SourceRef[] {
  return uniqueSourceRefs(
    [
      ...digest.researchProblem,
      ...digest.motivation,
      ...digest.method,
      ...digest.experiments,
      ...digest.findings,
      ...digest.limitations
    ].flatMap((point) => point.evidenceRefs)
  ).slice(0, 16)
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
