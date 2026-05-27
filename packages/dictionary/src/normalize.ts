export function normalizeSelectionText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function foldDictionaryKey(text: string): string {
  return normalizeSelectionText(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*-\s*/g, '-')
    .toLowerCase()
}

export function tokenizeEnglishText(text: string): string[] {
  return normalizeSelectionText(text).match(/[A-Za-z]+(?:[-'][A-Za-z]+)?|\d+(?:\.\d+)?/g) ?? []
}

export function hasMeaningfulSentencePunctuation(text: string): boolean {
  const normalized = normalizeSelectionText(text)
    .replace(/\bet\s+al\./gi, 'et al')
    .replace(/\be\.g\./gi, 'eg')
    .replace(/\bi\.e\./gi, 'ie')
    .replace(/\bvs\./gi, 'vs')
    .replace(/\bfig\./gi, 'fig')
    .replace(/\bsec\./gi, 'sec')

  return /[!?;:。！？；：]|[.](?:\s|$)/.test(normalized)
}

export function lemmatizeEnglishToken(token: string): string[] {
  const folded = foldDictionaryKey(token)
  const candidates = new Set<string>([folded])

  if (folded.length > 4 && folded.endsWith('ies')) {
    candidates.add(`${folded.slice(0, -3)}y`)
  }

  if (folded.length > 4 && folded.endsWith('ing')) {
    candidates.add(folded.slice(0, -3))
    candidates.add(`${folded.slice(0, -3)}e`)
  }

  if (folded.length > 3 && folded.endsWith('ed')) {
    candidates.add(folded.slice(0, -2))
    candidates.add(`${folded.slice(0, -1)}`)
  }

  if (folded.length > 3 && folded.endsWith('es')) {
    candidates.add(folded.slice(0, -2))
  }

  if (folded.length > 3 && folded.endsWith('s')) {
    candidates.add(folded.slice(0, -1))
  }

  return [...candidates]
}
