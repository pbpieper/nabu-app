/**
 * Lexa — pure-functions TypeScript port of the Spanish frequency tool
 * (CS-1 Term Project, ~/Harvard/CS1/CS1_Term_Project/lexa.py), extended to
 * multi-language tokenization with first-seen-sentence tracking.
 *
 * Pure functions only. No React, no Supabase, no zustand. No module-level
 * state beyond the constant stopword sets below.
 */

export type Lang = 'es' | 'ar' | 'en' | 'fr' | 'de' | 'it' | 'pt'

export interface ExtractedTerm {
  /** lowercase, normalized form */
  term: string
  /** count in this text */
  frequency: number
  /** sentence the term first appears in (display form, not normalized) */
  firstSeenSentence: string
}

export interface ExtractResult {
  /** sha256 of normalized text, hex */
  articleHash: string
  lang: Lang
  /** word-like tokens (post-tokenize, post-stopword) */
  totalTokens: number
  /** sorted: frequency desc, term asc */
  uniqueTerms: ExtractedTerm[]
}

// ---------------------------------------------------------------------------
// Stopwords (NORMALIZED forms)
// ---------------------------------------------------------------------------

// NOTE: The CS-1 Python lexa.py does not maintain a stopword list — it relies
// entirely on the known-words diff. The TS port introduces per-language
// stopword sets so downstream consumers (e.g. Nabu swipe-sort) don't have to
// triage articles/prepositions. This is a deliberate addition; the Python
// remains the CS-1 deliverable.

const SPANISH_STOPWORDS_RAW = [
  'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con',
  'contra', 'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'durante', 'e',
  'el', 'ella', 'ellas', 'ellos', 'en', 'entre', 'era', 'erais', 'eran',
  'eras', 'eres', 'es', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estaba',
  'estabais', 'estaban', 'estabas', 'estad', 'estada', 'estadas', 'estado',
  'estados', 'estamos', 'estando', 'estar', 'estaremos', 'estará', 'estarán',
  'estarás', 'estaré', 'estaréis', 'estaría', 'estaríais', 'estaríamos',
  'estarían', 'estarías', 'estas', 'este', 'estemos', 'esto', 'estos',
  'estoy', 'estuve', 'estuviera', 'estuvierais', 'estuvieran', 'estuvieras',
  'estuvieron', 'estuviese', 'estuvieseis', 'estuviesen', 'estuvieses',
  'estuvimos', 'estuviste', 'estuvisteis', 'estuviéramos', 'estuviésemos',
  'estuvo', 'está', 'estábamos', 'estáis', 'están', 'estás', 'esté', 'estéis',
  'estén', 'estés', 'fue', 'fuera', 'fuerais', 'fueran', 'fueras', 'fueron',
  'fuese', 'fueseis', 'fuesen', 'fueses', 'fui', 'fuimos', 'fuiste',
  'fuisteis', 'fuéramos', 'fuésemos', 'ha', 'habida', 'habidas', 'habido',
  'habidos', 'habiendo', 'habremos', 'habrá', 'habrán', 'habrás', 'habré',
  'habréis', 'habría', 'habríais', 'habríamos', 'habrían', 'habrías', 'habéis',
  'había', 'habíais', 'habíamos', 'habían', 'habías', 'han', 'has', 'hasta',
  'hay', 'haya', 'hayamos', 'hayan', 'hayas', 'hayáis', 'he', 'hemos',
  'hube', 'hubiera', 'hubierais', 'hubieran', 'hubieras', 'hubieron',
  'hubiese', 'hubieseis', 'hubiesen', 'hubieses', 'hubimos', 'hubiste',
  'hubisteis', 'hubiéramos', 'hubiésemos', 'hubo', 'la', 'las', 'le', 'les',
  'lo', 'los', 'me', 'mi', 'mis', 'mucho', 'muchos', 'muy', 'más', 'mí',
  'mía', 'mías', 'mío', 'míos', 'nada', 'ni', 'no', 'nos', 'nosotras',
  'nosotros', 'nuestra', 'nuestras', 'nuestro', 'nuestros', 'o', 'os', 'otra',
  'otras', 'otro', 'otros', 'para', 'pero', 'poco', 'por', 'porque', 'que',
  'quien', 'quienes', 'qué', 'se', 'sea', 'seamos', 'sean', 'seas', 'seremos',
  'será', 'serán', 'serás', 'seré', 'seréis', 'sería', 'seríais', 'seríamos',
  'serían', 'serías', 'seáis', 'sido', 'siendo', 'sin', 'sobre', 'sois',
  'somos', 'son', 'soy', 'su', 'sus', 'suya', 'suyas', 'suyo', 'suyos', 'sí',
  'también', 'tanto', 'te', 'tendremos', 'tendrá', 'tendrán', 'tendrás',
  'tendré', 'tendréis', 'tendría', 'tendríais', 'tendríamos', 'tendrían',
  'tendrías', 'tened', 'tenemos', 'tenga', 'tengamos', 'tengan', 'tengas',
  'tengo', 'tengáis', 'tenida', 'tenidas', 'tenido', 'tenidos', 'teniendo',
  'tenéis', 'tenía', 'teníais', 'teníamos', 'tenían', 'tenías', 'ti', 'tiene',
  'tienen', 'tienes', 'todo', 'todos', 'tu', 'tus', 'tuve', 'tuviera',
  'tuvierais', 'tuvieran', 'tuvieras', 'tuvieron', 'tuviese', 'tuvieseis',
  'tuviesen', 'tuvieses', 'tuvimos', 'tuviste', 'tuvisteis', 'tuviéramos',
  'tuviésemos', 'tuvo', 'tuya', 'tuyas', 'tuyo', 'tuyos', 'tú', 'un', 'una',
  'uno', 'unos', 'vosotras', 'vosotros', 'vuestra', 'vuestras', 'vuestro',
  'vuestros', 'y', 'ya', 'yo', 'él', 'éramos',
]

const ARABIC_STOPWORDS_RAW =
  'في، من، إلى، على، عن، مع، هذا، هذه، ذلك، تلك، الذي، التي، الذين، اللاتي، هو، هي، هم، هن، أن، إن، قد، كان، كانت، لا، ما، لم، لن، كل، بعض، أو، و، ف، ل، ب، ك، أي، إذا، حيث، حين، عند، قبل، بعد'

const ENGLISH_STOPWORDS_RAW = (
  'the a an and or but if then else of in on at by to from for with as is ' +
  'are was were be been being have has had do does did this that these those ' +
  'i you he she it we they me him her us them my your his its our their'
).split(/\s+/)

// Build normalized stopword sets per language. Done eagerly at module load
// (constants only — no side effects).
function buildStopwords(raw: string[], lang: Lang): Set<string> {
  const out = new Set<string>()
  for (const w of raw) {
    const n = normalizeTerm(w, lang)
    if (n) out.add(n)
  }
  return out
}

// Arabic diacritics + tatweel regexes are referenced by normalizeTerm, which
// runs inside buildStopwords below. They must be declared before STOPWORDS.
const ARABIC_DIACRITICS_RE = /[ً-ْٰٓ-ٟ]/g
const ARABIC_TATWEEL = /ـ/g

const STOPWORDS: Record<Lang, Set<string>> = {
  es: buildStopwords(SPANISH_STOPWORDS_RAW, 'es'),
  ar: buildStopwords(ARABIC_STOPWORDS_RAW.split('، '), 'ar'),
  en: buildStopwords(ENGLISH_STOPWORDS_RAW, 'en'),
  fr: new Set(),
  de: new Set(),
  it: new Set(),
  pt: new Set(),
}

// ---------------------------------------------------------------------------
// Tokenizer / normalizer / sentence splitter
// ---------------------------------------------------------------------------

export function normalizeTerm(term: string, lang: Lang): string {
  let t = term.normalize('NFC').toLowerCase()
  if (lang === 'ar') {
    t = t.replace(ARABIC_DIACRITICS_RE, '').replace(ARABIC_TATWEEL, '')
  }
  return t
}

export function tokenize(text: string, lang: Lang): string[] {
  // Include combining marks (\p{M}) so Arabic diacritics don't split words;
  // normalizeTerm() strips them out afterward for 'ar'.
  const matches = text.match(/[\p{L}\p{M}]+/gu)
  if (!matches) return []
  const out: string[] = []
  for (const raw of matches) {
    const n = normalizeTerm(raw, lang)
    if (n) out.push(n)
  }
  return out
}

const SENTENCE_SPLIT_RE = /[.!?؟…।]+\s+/u

export function splitSentences(text: string, _lang: Lang): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// hashText — sha256 hex of normalized text
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function normalizeForHash(text: string): string {
  return text.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()
}

export async function hashText(text: string): Promise<string> {
  const normalized = normalizeForHash(text)

  // Prefer expo-crypto when available (React Native runtime). Use a dynamic
  // import wrapped in try/catch so this module also runs cleanly under tsx /
  // Node where expo-crypto isn't installed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(
      /* @vite-ignore */ /* webpackIgnore: true */ 'expo-crypto'
    ).catch(() => null)
    if (mod && mod.digestStringAsync && mod.CryptoDigestAlgorithm) {
      const encoding = mod.CryptoEncoding?.HEX ?? 'hex'
      return await mod.digestStringAsync(
        mod.CryptoDigestAlgorithm.SHA256,
        normalized,
        { encoding },
      )
    }
  } catch {
    // fall through
  }

  // Web Crypto fallback (Node 20+ exposes globalThis.crypto.subtle).
  const subtle: SubtleCrypto | undefined =
    (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
  if (subtle) {
    const buf = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(normalized),
    )
    return bytesToHex(new Uint8Array(buf))
  }

  // Node fallback (older Node, or environments where globalThis.crypto is
  // absent). Imported dynamically to keep the React Native bundle clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeCrypto: any = await import('crypto')
  const h = nodeCrypto.createHash('sha256').update(normalized).digest('hex')
  return h as string
}

// ---------------------------------------------------------------------------
// Extraction + diff
// ---------------------------------------------------------------------------

export async function extractFromText(
  text: string,
  lang: Lang,
): Promise<ExtractResult> {
  const stopwords = STOPWORDS[lang]
  const sentences = splitSentences(text, lang)

  // Pre-normalize sentences once for first-seen lookup.
  const sentencesNormalized = sentences.map((s) => {
    const toks = new Set<string>()
    const matches = s.match(/[\p{L}\p{M}]+/gu)
    if (matches) {
      for (const raw of matches) {
        const n = normalizeTerm(raw, lang)
        if (n) toks.add(n)
      }
    }
    return toks
  })

  const counts = new Map<string, number>()
  const firstSeen = new Map<string, string>()

  // Single pass over sentences in order so firstSeen is correct without an
  // extra lookup loop.
  for (let i = 0; i < sentences.length; i++) {
    const display = sentences[i]
    const tokSet = sentencesNormalized[i]
    // We still need full token list (with duplicates) for counting; reuse
    // tokenize but applied to this sentence.
    const sentTokens = tokenize(display, lang)
    for (const tok of sentTokens) {
      if (stopwords.has(tok)) continue
      counts.set(tok, (counts.get(tok) ?? 0) + 1)
      if (!firstSeen.has(tok) && tokSet.has(tok)) {
        firstSeen.set(tok, display)
      }
    }
  }

  let totalTokens = 0
  const uniqueTerms: ExtractedTerm[] = []
  for (const [term, frequency] of counts) {
    totalTokens += frequency
    uniqueTerms.push({
      term,
      frequency,
      firstSeenSentence: firstSeen.get(term) ?? '',
    })
  }

  uniqueTerms.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency
    return a.term < b.term ? -1 : a.term > b.term ? 1 : 0
  })

  const articleHash = await hashText(text)

  return { articleHash, lang, totalTokens, uniqueTerms }
}

export function diffAgainstKnown(
  extracted: ExtractedTerm[],
  knownSet: Set<string>,
): { unsorted: ExtractedTerm[]; alreadyKnown: ExtractedTerm[] } {
  const unsorted: ExtractedTerm[] = []
  const alreadyKnown: ExtractedTerm[] = []
  for (const t of extracted) {
    if (knownSet.has(t.term)) alreadyKnown.push(t)
    else unsorted.push(t)
  }
  return { unsorted, alreadyKnown }
}
