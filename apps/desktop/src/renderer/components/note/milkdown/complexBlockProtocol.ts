export type ComplexBlockKind =
  | 'pdf_excerpt'
  | 'ai_answer'
  | 'formula'
  | 'image'
  | 'screenshot'
  | 'reference'
  | 'question_node'

export type ComplexBlockProtocolPayload = {
  blockId: string
  kind: ComplexBlockKind
  pageNo?: number
  text?: string
  sourceRefsJson?: string
}

export function encodeComplexBlockHref(payload: ComplexBlockProtocolPayload): string {
  const params = new URLSearchParams()
  params.set('type', payload.kind)
  if (typeof payload.pageNo === 'number' && Number.isFinite(payload.pageNo)) {
    params.set('page', String(payload.pageNo))
  }
  if (payload.text) {
    params.set('text', payload.text)
  }
  if (payload.sourceRefsJson) {
    params.set('refs', payload.sourceRefsJson)
  }

  return `inspiration-note-block://${encodeURIComponent(payload.blockId)}?${params.toString()}`
}

export function decodeComplexBlockHref(href: string): ComplexBlockProtocolPayload | null {
  try {
    const url = new URL(href)
    const blockId = decodeURIComponent(url.hostname || '')
    const rawType = url.searchParams.get('type') ?? ''
    const pageNo = Number(url.searchParams.get('page') ?? '1')
    const text = url.searchParams.get('text') ?? ''
    const sourceRefsJson = url.searchParams.get('refs') ?? ''

    if (!blockId || !isComplexBlockKind(rawType)) {
      return null
    }

    return {
      blockId,
      kind: rawType,
      pageNo: Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1,
      text,
      sourceRefsJson
    }
  } catch {
    return null
  }
}

export function isComplexBlockKind(value: string): value is ComplexBlockKind {
  return (
    value === 'pdf_excerpt' ||
    value === 'ai_answer' ||
    value === 'formula' ||
    value === 'image' ||
    value === 'screenshot' ||
    value === 'reference' ||
    value === 'question_node'
  )
}
