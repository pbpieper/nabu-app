#!/usr/bin/env npx tsx
/**
 * generate-deck.ts — Local deck generation script for Nabu.
 *
 * Reads a vocabulary list (xlsx/csv) and uses Creative Hub to generate
 * translations, example sentences, grammar tags, TTS audio, and images
 * for each word. Outputs a deck.json matching the Supabase schema plus
 * local media files under ./generated/<deck-id>/.
 *
 * Phase 1 of the teacher-side content pipeline (see N8N_STRATEGY.md).
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";

// ─── CLI arg parsing ────────────────────────────────────────────────

interface CliArgs {
  inputFile: string;
  title: string;
  target: string;
  source: string;
  dryRun: boolean;
  outDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let inputFile = "";
  let title = "";
  let target = "";
  let source = "en";
  let dryRun = false;
  let outDir = "./generated/";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--title":
        title = args[++i];
        break;
      case "--target":
        target = args[++i];
        break;
      case "--source":
        source = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--out":
        outDir = args[++i];
        break;
      default:
        if (!args[i].startsWith("--") && !inputFile) {
          inputFile = args[i];
        }
        break;
    }
  }

  if (!inputFile || !title || !target) {
    console.error(
      "Usage: npx tsx scripts/generate-deck.ts <input.xlsx|input.csv> --title \"...\" --target <iso639> [--source en] [--dry-run] [--out ./generated/]"
    );
    process.exit(1);
  }

  return { inputFile, title, target, source, dryRun, outDir };
}

// ─── Share code generation ──────────────────────────────────────────

const SHARE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateShareCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHARE_CHARS[Math.floor(Math.random() * SHARE_CHARS.length)];
  }
  return code;
}

// ─── Creative Hub client ────────────────────────────────────────────

const HUB_BASE = "http://localhost:8420";
const POLL_INTERVAL_MS = 2000;
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

async function hubHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${HUB_BASE}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

async function hubGenerateText(
  prompt: string
): Promise<{ job_id: string; response: string }> {
  const res = await fetch(`${HUB_BASE}/generate/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok)
    throw new Error(`/generate/text failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function hubSubmitAsync(
  endpoint: string,
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${HUB_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`${endpoint} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.job_id;
}

async function hubPollJob(jobId: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < JOB_TIMEOUT_MS) {
    const res = await fetch(`${HUB_BASE}/jobs/${jobId}`);
    if (!res.ok)
      throw new Error(`/jobs/${jobId} poll failed: ${res.status}`);
    const data = await res.json();
    if (data.status === "completed") return;
    if (data.status === "failed")
      throw new Error(`Job ${jobId} failed: ${data.error || "unknown"}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Job ${jobId} timed out after 5 minutes`);
}

async function hubDownloadOutput(
  jobId: string,
  destPath: string
): Promise<void> {
  const res = await fetch(`${HUB_BASE}/jobs/${jobId}/output`);
  if (!res.ok)
    throw new Error(
      `/jobs/${jobId}/output failed: ${res.status}`
    );
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Input parsing ──────────────────────────────────────────────────

function parseInputFile(filePath: string): string[] {
  const ext = path.extname(filePath).toLowerCase();
  let words: string[];

  if (ext === ".csv") {
    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    // Check if first line is a header
    const firstLine = lines[0].toLowerCase();
    const startIdx =
      firstLine === "word" || firstLine === "words" ? 1 : 0;
    words = lines.slice(startIdx);
  } else if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length === 0) {
      console.error("Error: spreadsheet is empty.");
      process.exit(1);
    }
    // Check if first row is a header
    const firstCell = String(rows[0][0] || "")
      .trim()
      .toLowerCase();
    const startIdx =
      firstCell === "word" || firstCell === "words" ? 1 : 0;
    words = rows
      .slice(startIdx)
      .map((r) => String(r[0] || "").trim())
      .filter(Boolean);
  } else {
    console.error(
      `Error: unsupported file type "${ext}". Use .xlsx, .xls, or .csv.`
    );
    process.exit(1);
  }

  if (words.length === 0) {
    console.error(
      "Error: no words found. Input should be a single column of target-language words."
    );
    process.exit(1);
  }

  return words;
}

// ─── LLM prompt ─────────────────────────────────────────────────────

function buildLLMPrompt(
  word: string,
  targetLang: string,
  sourceLang: string
): string {
  return `You are a language-learning content generator. Given a word in ${targetLang}, produce a JSON object with these exact keys:

- "translation": the ${sourceLang} translation of the word
- "example_sentence": a natural example sentence in ${targetLang} using the word. Bold the target word using markdown: **${word}**
- "explanation": a brief ${sourceLang} explanation of the word's meaning and usage (1-2 sentences)
- "grammar_tag": a rich grammar note IN ${targetLang}, e.g. "verbo intransitivo regular -ar; infinitivo: zarpar; registro: náutico/formal"

Word: ${word}

Respond with ONLY the JSON object. No markdown fences, no extra text.`;
}

function buildImagePrompt(word: string, sentence: string): string {
  return `Simple, clean illustration for a flashcard: the concept "${word}". Scene inspired by: "${sentence}". No text or letters in the image. Colorful, friendly style suitable for language learning.`;
}

// ─── Per-card pipeline ──────────────────────────────────────────────

interface CardResult {
  id: string;
  sort_order: number;
  word: string;
  translation: string;
  example_sentence: string;
  explanation: string;
  grammar_tag: string;
  image_url: string | null;
  clue_image_url: string | null;
  audio_url: string | null;
  tags: string[];
  notes: string | null;
  part_of_speech: string | null;
  created_at: string;
  _local_files: {
    word_audio: string | null;
    sentence_audio: string | null;
    image: string | null;
  };
}

interface LLMResult {
  translation: string;
  example_sentence: string;
  explanation: string;
  grammar_tag: string;
}

function parseLLMResponse(raw: string): LLMResult {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(cleaned);
  return {
    translation: parsed.translation || "",
    example_sentence: parsed.example_sentence || "",
    explanation: parsed.explanation || "",
    grammar_tag: parsed.grammar_tag || "",
  };
}

async function processCard(
  word: string,
  index: number,
  total: number,
  deckDir: string,
  targetLang: string,
  sourceLang: string,
  dryRun: boolean
): Promise<CardResult> {
  const cardId = uuidv4();
  const cardStart = Date.now();
  const prefix = `[${String(index + 1).padStart(String(total).length, " ")}/${total}]`;
  const padWord = word.padEnd(14);

  const localFiles: CardResult["_local_files"] = {
    word_audio: null,
    sentence_audio: null,
    image: null,
  };

  let llmResult: LLMResult;

  if (dryRun) {
    const prompt = buildLLMPrompt(word, targetLang, sourceLang);
    console.log(`${prefix} ${padWord} LLM prompt:`);
    console.log(`     ${prompt.substring(0, 120)}...`);
    llmResult = {
      translation: `[translation of ${word}]`,
      example_sentence: `[example sentence with **${word}**]`,
      explanation: `[explanation of ${word}]`,
      grammar_tag: `[grammar tag for ${word}]`,
    };

    const imgPrompt = buildImagePrompt(word, llmResult.example_sentence);
    console.log(`${prefix} ${padWord} Image prompt: ${imgPrompt.substring(0, 80)}...`);
    console.log(
      `${prefix} ${padWord} TTS: word="${word}", sentence="${llmResult.example_sentence.substring(0, 40)}..."`
    );

    const elapsed = ((Date.now() - cardStart) / 1000).toFixed(1);
    console.log(
      `${prefix} ${padWord} LLM ✓  audio(2) ✓  image ✓   (${elapsed}s) [dry-run]`
    );
  } else {
    // Step A: LLM call
    process.stdout.write(`${prefix} ${padWord} LLM...`);
    const llmRaw = await hubGenerateText(
      buildLLMPrompt(word, targetLang, sourceLang)
    );
    llmResult = parseLLMResponse(llmRaw.response);
    process.stdout.write(" ✓  ");

    // Step B: parallel TTS + image
    process.stdout.write("audio(2)...");
    const wordAudioPath = path.join(deckDir, `${cardId}-word.wav`);
    const sentenceAudioPath = path.join(deckDir, `${cardId}-sentence.wav`);
    const imagePath = path.join(deckDir, `${cardId}.png`);

    const [wordJobId, sentenceJobId, imageJobId] = await Promise.all([
      hubSubmitAsync("/generate/speech", {
        text: word,
        language: targetLang,
      }),
      hubSubmitAsync("/generate/speech", {
        text: llmResult.example_sentence.replace(/\*\*/g, ""),
        language: targetLang,
      }),
      hubSubmitAsync("/generate/image", {
        prompt: buildImagePrompt(word, llmResult.example_sentence),
        width: 1024,
        height: 1024,
        steps: 30,
        cfg: 7,
      }),
    ]);

    // Poll all three
    await Promise.all([
      hubPollJob(wordJobId),
      hubPollJob(sentenceJobId),
      hubPollJob(imageJobId),
    ]);
    process.stdout.write(" ✓  ");

    // Download outputs
    process.stdout.write("image...");
    await Promise.all([
      hubDownloadOutput(wordJobId, wordAudioPath),
      hubDownloadOutput(sentenceJobId, sentenceAudioPath),
      hubDownloadOutput(imageJobId, imagePath),
    ]);

    localFiles.word_audio = path.relative(deckDir, wordAudioPath);
    localFiles.sentence_audio = path.relative(deckDir, sentenceAudioPath);
    localFiles.image = path.relative(deckDir, imagePath);

    const elapsed = ((Date.now() - cardStart) / 1000).toFixed(1);
    process.stdout.write(` ✓   (${elapsed}s)\n`);
  }

  return {
    id: cardId,
    sort_order: index,
    word,
    translation: llmResult.translation,
    example_sentence: llmResult.example_sentence,
    explanation: llmResult.explanation,
    grammar_tag: llmResult.grammar_tag,
    image_url: null,
    clue_image_url: null,
    audio_url: null,
    tags: [],
    notes: null,
    part_of_speech: null,
    created_at: new Date().toISOString(),
    _local_files: localFiles,
  };
}

// ─── Concurrency limiter ────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const totalStart = Date.now();

  // Resolve input file
  const inputPath = path.resolve(args.inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Parse words
  const words = parseInputFile(inputPath);
  console.log(
    `Loaded ${words.length} words from ${path.basename(args.inputFile)}`
  );

  // Health check (skip in dry-run)
  if (!args.dryRun) {
    const healthy = await hubHealth();
    if (!healthy) {
      console.error(
        "Creative Hub is not responding at http://localhost:8420. Start it with ~/Projects/creative-hub/scripts/start_services.sh all"
      );
      process.exit(1);
    }
    console.log("Creative Hub: healthy ✓");
  } else {
    console.log("Mode: dry-run (no Creative Hub calls)");
  }

  // Setup output directory
  const deckId = uuidv4();
  const deckDir = path.resolve(args.outDir, deckId);
  fs.mkdirSync(deckDir, { recursive: true });

  console.log(
    `\nGenerating deck: "${args.title}" (${args.target} → ${args.source})`
  );
  console.log(`Deck ID: ${deckId}`);
  console.log(`Output:  ${deckDir}\n`);

  // Process cards with concurrency of 3
  const results = await mapWithConcurrency(words, 3, (word, index) =>
    processCard(
      word,
      index,
      words.length,
      deckDir,
      args.target,
      args.source,
      args.dryRun
    )
  );

  // Separate successes and failures
  const cards: CardResult[] = [];
  const failures: { word: string; reason: string }[] = [];

  results.forEach((result, i) => {
    if (result instanceof Error) {
      const word = words[i];
      console.error(
        `[${i + 1}/${words.length}] ${word} FAILED: ${result.message}`
      );
      failures.push({ word, reason: result.message });
    } else {
      cards.push(result);
    }
  });

  // Build deck.json (only write at the end)
  const shareCode = generateShareCode();
  const deck = {
    id: deckId,
    creator_id: null,
    title: args.title,
    description: `Generated deck: ${words.length} ${args.target} words`,
    source_language: args.source,
    target_language: args.target,
    share_code: shareCode,
    is_public: true,
    card_count: cards.length,
    classroom_mode: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cards: cards.sort((a, b) => a.sort_order - b.sort_order),
  };

  const deckJsonPath = path.join(deckDir, "deck.json");
  fs.writeFileSync(deckJsonPath, JSON.stringify(deck, null, 2));

  // Summary
  const elapsed = Date.now() - totalStart;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.round((elapsed % 60000) / 1000);
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  console.log(
    `\nDone. ${cards.length} cards in ${timeStr}. Output: ${deckDir}/`
  );
  console.log(`Share code: ${shareCode}`);

  if (failures.length > 0) {
    console.log(`\n⚠ ${failures.length} card(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f.word}: ${f.reason}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
