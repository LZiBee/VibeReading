import type { DictionaryEntry } from '@thesis-agent/shared'
import academicCore from './assets/academic-core.en-zh.json'
import { foldDictionaryKey, lemmatizeEnglishToken, normalizeSelectionText } from './normalize'

type DictionaryAsset = {
  entries: DictionaryEntry[]
}

const dictionary = academicCore as DictionaryAsset

const entriesByLemma = new Map<string, DictionaryEntry>()
const entriesByPhrase = new Map<string, DictionaryEntry>()

for (const entry of dictionary.entries) {
  entriesByLemma.set(foldDictionaryKey(entry.lemma), entry)

  for (const phrase of entry.phrases) {
    entriesByPhrase.set(foldDictionaryKey(phrase.phrase), entry)
  }
}

export function lookupDictionary(query: string): DictionaryEntry | undefined {
  const normalizedText = normalizeSelectionText(query)
  const key = foldDictionaryKey(normalizedText)

  const phraseHit = entriesByPhrase.get(key)
  if (phraseHit) {
    return withQuery(phraseHit, normalizedText, 0.98)
  }

  const exactHit = entriesByLemma.get(key)
  if (exactHit) {
    return withQuery(exactHit, normalizedText, exactHit.confidence)
  }

  for (const candidate of lemmatizeEnglishToken(key)) {
    const lemmaHit = entriesByLemma.get(candidate)
    if (lemmaHit) {
      return withQuery(lemmaHit, normalizedText, Math.min(lemmaHit.confidence, 0.82))
    }
  }

  return undefined
}

function withQuery(entry: DictionaryEntry, query: string, confidence: number): DictionaryEntry {
  return {
    ...entry,
    query,
    confidence
  }
}
