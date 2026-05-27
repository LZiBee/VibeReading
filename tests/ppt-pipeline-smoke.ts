import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateDeckSpecFromAiDraftJson } from '@thesis-agent/ai'
import type { PptDeckMaterials } from '@thesis-agent/ai'
import { exportDeckToPptx } from '@thesis-agent/ppt'
import JSZip from 'jszip'

const materials: PptDeckMaterials = {
  paper: {
    id: 'fixture-paper',
    title: '基于论文阅读工作台的 PPT 生成闭环验证',
    authors: ['VibeReading Team'],
    year: 2026,
    abstract:
      '该夹具用于验证从论文材料到 DeckSpec，再到可编辑 PPTX 文件的最小闭环。内容刻意保持简短，以便稳定覆盖封面、目录、正文、结论和参考文献页。',
    sourceRefs: [{ type: 'paper', paperId: 'fixture-paper' }]
  },
  excerpts: [
    {
      id: 'fixture-page-1',
      title: 'PDF 第 1 页',
      text:
        '基于论文阅读工作台的 PPT 生成闭环验证\n基于论文阅读工作台的 PPT 生成闭环验证\n研究问题集中在如何把论文、笔记、AI 问答和截图统一组织为学术汇报材料。系统应先产出结构化 DeckSpec，再由独立导出器渲染 PPTX。\nTable 1\n0',
      sourceRefs: [{ type: 'page', paperId: 'fixture-paper', pageNo: 1 }]
    },
    {
      id: 'fixture-page-2',
      title: 'PDF 第 2 页',
      text:
        '核心方法是保持 AI 编排层和 PPT 导出层解耦。AI 负责语义结构和来源引用，PPT 包负责模板、版式、审计和文件输出。',
      sourceRefs: [{ type: 'page', paperId: 'fixture-paper', pageNo: 2 }]
    },
    {
      id: 'fixture-page-3',
      title: 'PDF 第 3 页',
      text:
        'Efficient Memory Management for Large Language\nEfficient Memory Management for Large Language\nOrca (Max) Orca (Pow2) Orca (Oracle) vLLM 0 20\nKV Cache Manager Scheduler CPU Block Allocator',
      sourceRefs: [{ type: 'page', paperId: 'fixture-paper', pageNo: 3 }]
    }
  ],
  notes: [
    {
      id: 'fixture-note-1',
      title: '实现备注',
      text: '第一版优先覆盖中文学术汇报、固定页型、基础审计和可编辑 PPTX 导出，暂不引入重型 Agent 运行时。',
      sourceRefs: [{ type: 'note', paperId: 'fixture-paper', noteId: 'fixture-note-1' }]
    }
  ],
  aiAnswers: [
    {
      id: 'fixture-answer-1',
      title: 'AI 汇总',
      text: '建议把导出链路拆成材料收集、DeckSpec 生成、资产补齐、审计和 PPTX 渲染五步，以降低幻觉和版式失控风险。',
      sourceRefs: [{ type: 'ai_message', paperId: 'fixture-paper', messageId: 'fixture-answer-1' }]
    }
  ],
  references: [
    {
      id: 'fixture-ref-1',
      title: 'PptxGenJS Documentation',
      authors: ['gitbrent'],
      year: 2026,
      sourceRefs: [{ type: 'reference', paperId: 'fixture-paper', referenceId: 'fixture-ref-1' }]
    }
  ]
}

const outputDir = await mkdtemp(join(tmpdir(), 'thesis-agent-ppt-smoke-'))

try {
  const baseInput = {
    now: '2026-05-23T00:00:00.000Z',
    intent: {
      sourceType: 'paper',
      sourceIds: ['fixture-paper'],
      audience: 'group-meeting',
      language: 'zh-CN',
      tone: 'academic',
      targetSlideCount: 8,
      includeAgenda: true,
      includeReferences: true,
      includeAppendix: false
    },
    materials
  } as const
  const aiGenerated = generateDeckSpecFromAiDraftJson({
    ...baseInput,
    aiOutput: JSON.stringify({
      drafts: [
        {
          title: 'AI 生成：PPT 闭环验证',
          subtitle: '把论文材料转为可编辑、可审计、可追溯的学术汇报',
          speakerNotes: '先说明这条链路验证的是真实导出闭环，而不是单纯生成文本。'
        },
        {
          title: 'AI 生成：汇报路线',
          bullets: [
            '先由 AI 阅读论文、笔记和问答材料并产出页面草稿。',
            '再把结构化草稿交给 DeckSpec 与 PPTX 导出器处理。'
          ],
          speakerNotes: '目录页强调链路边界和可维护性。',
          visual: {
            kind: 'diagram',
            diagramKind: 'mermaid',
            source: '```mermaid\nmindmap\n  root((汇报路线))\n    材料收集\n    DeckSpec\n    PPTX 导出\n```'
          }
        },
        {
          title: 'AI 生成：核心问题',
          bullets: [
            '系统需要把论文、笔记、AI 问答和截图统一整理为汇报材料。',
            '内容层应避免把 PDF 噪声、重复标题和表格残片直接放入幻灯片。'
          ],
          speakerNotes: '这一页用于说明为什么需要 AI 先理解材料。'
        },
        {
          title: 'AI 生成：实现路线',
          bullets: [
            'AI 负责编排语义结构和页面草稿。',
            'PPT 包只负责模板、版式、审计和 PPTX 文件输出。'
          ],
          speakerNotes: '这一页强调 AI 层和导出层解耦。'
        },
        {
          title: 'AI 生成：实验验证',
          bullets: [
            '验证重点是确认 DeckSpec 能稳定渲染为可编辑的 PPTX 文件。',
            '噪声文本、重复标题和表格残片不能穿透到最终页面。'
          ],
          speakerNotes: '实验页说明 smoke 测试覆盖的风险点。'
        },
        {
          title: 'AI 生成：关键发现',
          bullets: [
            '真实 AI 草稿应覆盖每一页，缺页时不再导出规则兜底版。',
            '导出审计继续负责发现版式风险，而不替代内容生成。'
          ],
          speakerNotes: '这一页强调新策略：没有 AI 成功介入就停止导出。'
        },
        {
          title: 'AI 生成：边界与风险',
          bullets: [
            '模型必须返回严格 JSON，否则桌面端会提示失败并停止导出。',
            '来源引用、图片资产和保存对话框仍由程序侧保证。'
          ],
          speakerNotes: '讨论页说明失败条件和程序侧保底职责。'
        },
        {
          title: 'AI 生成：参考文献',
          speakerNotes: '参考文献页由导出器根据实际 citations 渲染，AI 只提供页面草稿。'
        }
      ]
    })
  })
  for (const [label, aiOutput] of [
    ['AI 空草稿不应继续导出', JSON.stringify({ drafts: [] })],
    ['AI 缺页不应继续导出', JSON.stringify({ drafts: [{ title: '只返回封面' }] })]
  ] as const) {
    let didThrow = false
    try {
      generateDeckSpecFromAiDraftJson({
        ...baseInput,
        aiOutput
      })
    } catch {
      didThrow = true
    }

    if (!didThrow) {
      throw new Error(label)
    }
  }

  if (aiGenerated.deck.slides.length < 5) {
    throw new Error(`DeckSpec 页数异常：${aiGenerated.deck.slides.length}`)
  }

  const deckText = aiGenerated.deck.slides
    .flatMap((slide) => [
      slide.title,
      slide.notes ?? '',
      ...slide.elements.flatMap((element) => {
        if (element.type === 'bullet-list') {
          return element.items
        }
        if ('text' in element && typeof element.text === 'string') {
          return [element.text]
        }
        return []
      })
    ])
    .join('\n')

  if (/^0$/m.test(deckText) || /^Table 1$/im.test(deckText)) {
    throw new Error('DeckSpec 中仍包含孤立数字或表格残片。')
  }

  if ((deckText.match(/Efficient Memory Management for Large Language/g) ?? []).length > 1) {
    throw new Error('DeckSpec 中仍包含重复论文标题。')
  }

  if (!deckText.includes('AI 负责编排语义结构和页面草稿')) {
    throw new Error('AI SlideDraft JSON 没有正确合并进 DeckSpec。')
  }

  const contentSlides = aiGenerated.deck.slides.filter((slide) => slide.kind !== 'cover' && slide.kind !== 'references')
  const diagramSources = contentSlides.flatMap((slide) =>
    slide.elements.flatMap((element) => (element.type === 'diagram' ? [element.source] : []))
  )

  if (diagramSources.length === 0) {
    throw new Error('DeckSpec 正文页没有保留 Mermaid 自制图。')
  }

  if (diagramSources.some((source) => source.includes('```'))) {
    throw new Error('DeckSpec 中的 Mermaid 自制图仍包含 Markdown 代码围栏。')
  }

  if (!diagramSources.some((source) => /^(flowchart|graph|mindmap)\b/i.test(source.trim()))) {
    throw new Error('DeckSpec 中没有可被 PPT 导出器识别的 Mermaid 自制图。')
  }

  if (!diagramSources.some((source) => /^mindmap\b/i.test(source.trim()))) {
    throw new Error('DeckSpec 中没有优先生成 Mermaid mindmap 脑图。')
  }

  const outputPath = join(outputDir, 'ppt-pipeline-smoke.pptx')
  const exportResult = await exportDeckToPptx({
    deck: aiGenerated.deck,
    outputPath
  })

  if (!exportResult.ok) {
    throw new Error(exportResult.message ?? 'PPT 导出失败')
  }

  const outputStat = await stat(outputPath)
  if (outputStat.size < 1024) {
    throw new Error(`PPTX 文件过小，可能导出异常：${outputStat.size} bytes`)
  }

  const outputXmlText = await readPptxSlideXmlText(outputPath)
  if (/MERMAID|图示待渲染|flowchart LR/.test(outputXmlText)) {
    throw new Error('PPTX 中仍包含 Mermaid fallback 源码文本。')
  }

  if (!outputXmlText.includes('材料收集') || !outputXmlText.includes('DeckSpec')) {
    throw new Error('PPTX 中没有渲染 Mermaid mindmap 脑图节点文本。')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        slides: aiGenerated.deck.slides.length,
        diagrams: diagramSources.length,
        warnings: aiGenerated.warnings.length,
        auditIssues: exportResult.auditIssues.length,
        outputBytes: outputStat.size
      },
      null,
      2
    )
  )
} finally {
  await rm(outputDir, { force: true, recursive: true })
}

async function readPptxSlideXmlText(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(filePath))
  const slideFiles = Object.values(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file.name))
  const slideXml = await Promise.all(slideFiles.map((file) => file.async('string')))

  return slideXml.join('\n')
}
