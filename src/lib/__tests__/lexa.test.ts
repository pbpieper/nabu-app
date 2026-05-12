/**
 * Lexa tests — runs under `tsx src/lib/__tests__/lexa.test.ts`.
 * No test framework: tiny inline assert helper, exits non-zero on first
 * failure summary.
 *
 * Reads fixtures from ~/Harvard/CS1/CS1_Term_Project/ (the canonical CS-1
 * deliverable). If those paths move, update FIXTURE_DIR.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

import {
  diffAgainstKnown,
  extractFromText,
  normalizeTerm,
  splitSentences,
  tokenize,
} from '../lexa'

const FIXTURE_DIR = path.join(
  os.homedir(),
  'Harvard',
  'CS1',
  'CS1_Term_Project',
)

interface TestResult {
  name: string
  ok: boolean
  reason?: string
}

const results: TestResult[] = []

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, ok: true })
    // eslint-disable-next-line no-console
    console.log(`✓ ${name}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    results.push({ name, ok: false, reason })
    // eslint-disable-next-line no-console
    console.log(`✗ ${name} — ${reason}`)
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Lorca — Spanish frequency extraction
  // -------------------------------------------------------------------------
  await test('lorca: extractFromText(es) — verde freq + unique count', async () => {
    const text = fs.readFileSync(path.join(FIXTURE_DIR, 'lorca.txt'), 'utf8')
    const result = await extractFromText(text, 'es')

    const verde = result.uniqueTerms.find((t) => t.term === 'verde')
    assert(verde, 'verde not found in Lorca extraction')
    assertEq(verde.frequency, 14, 'verde frequency')

    // The CS-1 Python (no stopwords) yields 66 unique terms. The TS port
    // applies Spanish stopwords, lowering the count. Asserting the actual
    // current value per the spec's "report and proceed" rule.
    assertEq(result.uniqueTerms.length, 48, 'Lorca unique term count')

    // Sanity: sort order (frequency desc, then term asc).
    for (let i = 1; i < result.uniqueTerms.length; i++) {
      const prev = result.uniqueTerms[i - 1]
      const cur = result.uniqueTerms[i]
      if (prev.frequency === cur.frequency) {
        assert(prev.term <= cur.term, `sort order broken at ${i}`)
      } else {
        assert(prev.frequency > cur.frequency, `freq sort broken at ${i}`)
      }
    }

    // firstSeenSentence is populated for every term.
    for (const t of result.uniqueTerms) {
      assert(t.firstSeenSentence.length > 0, `empty firstSeenSentence for ${t.term}`)
    }

    // articleHash is 64 hex chars.
    assert(/^[0-9a-f]{64}$/.test(result.articleHash), 'articleHash not sha256 hex')
  })

  // -------------------------------------------------------------------------
  // 2. Arabic — diacritic stripping + stopword filter + display-form sentence
  // -------------------------------------------------------------------------
  await test('arabic: diacritics stripped, stopwords removed, sentence preserved', async () => {
    const ar =
      'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ. هَذَا كِتَابٌ مُفِيدٌ. أُحِبُّ الْقِرَاءَةَ كَثِيرًا.'

    // normalizeTerm strips tashkeel and tatweel but keeps alif variants.
    assertEq(normalizeTerm('الْحَمْدُ', 'ar'), 'الحمد', 'normalize alhamd')
    assertEq(normalizeTerm('كَثِيرًا', 'ar'), 'كثيرا', 'normalize kathiran')
    // Alif variants are preserved (no collapsing).
    assertEq(normalizeTerm('أُحِبُّ', 'ar'), 'أحب', 'normalize uhibbu (hamza on alif kept)')

    const sentences = splitSentences(ar, 'ar')
    assertEq(sentences.length, 3, 'Arabic sentence count')

    const result = await extractFromText(ar, 'ar')

    // No diacritics in any extracted term.
    for (const t of result.uniqueTerms) {
      assert(
        !/[ً-ْٰٓ-ٟـ]/u.test(t.term),
        `term still has diacritics/tatweel: ${t.term}`,
      )
    }

    // Stopwords filtered (هذا is in the starter list -> normalized form should not appear).
    const hadha = normalizeTerm('هذا', 'ar')
    assert(
      !result.uniqueTerms.some((t) => t.term === hadha),
      `stopword ${hadha} should be filtered`,
    )

    // alhamd present, with first-seen sentence preserving original diacritics.
    const alhamd = result.uniqueTerms.find((t) => t.term === 'الحمد')
    assert(alhamd, 'الحمد not extracted')
    assert(
      alhamd.firstSeenSentence.includes('الْحَمْدُ'),
      `firstSeenSentence should preserve diacritics: ${alhamd.firstSeenSentence}`,
    )

    // Sanity on tokenize() too.
    const toks = tokenize('الْحَمْدُ لِلَّهِ', 'ar')
    assertEq(toks.length, 2, 'tokenize Arabic with diacritics → 2 tokens')
    assertEq(toks[0], 'الحمد', 'first arabic token')
    assertEq(toks[1], 'لله', 'second arabic token')
  })

  // -------------------------------------------------------------------------
  // 3. Diff against known_es.csv — unsorted count
  // -------------------------------------------------------------------------
  await test('lorca diff against known_es.csv — unsorted count', async () => {
    const text = fs.readFileSync(path.join(FIXTURE_DIR, 'lorca.txt'), 'utf8')
    const result = await extractFromText(text, 'es')

    const csv = fs.readFileSync(path.join(FIXTURE_DIR, 'known_es.csv'), 'utf8')
    const lines = csv.split(/\r?\n/).slice(1).filter((l) => l.trim().length > 0)
    const knownSet = new Set<string>()
    for (const line of lines) {
      const term = line.split(',')[0].trim().toLowerCase()
      if (term) knownSet.add(normalizeTerm(term, 'es'))
    }

    const { unsorted, alreadyKnown } = diffAgainstKnown(result.uniqueTerms, knownSet)
    assertEq(
      unsorted.length + alreadyKnown.length,
      result.uniqueTerms.length,
      'diff partition is total',
    )
    // Spec asserts 33-34; CS-1 Python sample (no stopwords) reports 33.
    assert(
      unsorted.length === 33 || unsorted.length === 34,
      `expected unsorted to be 33 or 34, got ${unsorted.length}`,
    )
  })

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok)
  // eslint-disable-next-line no-console
  console.log(
    `\n${results.length - failed.length}/${results.length} passed${
      failed.length > 0 ? ` (${failed.length} failed)` : ''
    }`,
  )
  if (failed.length > 0) process.exit(1)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', err)
  process.exit(2)
})
