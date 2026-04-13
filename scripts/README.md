# generate-deck — Local Deck Authoring

Standalone script that turns a vocabulary spreadsheet into a full Nabu deck
with AI-generated translations, sentences, grammar notes, TTS audio, and images.

## Prerequisites

- **Creative Hub** running at `http://localhost:8420`
  ```bash
  ~/Projects/creative-hub/scripts/start_services.sh all
  ```
- Node 18+ and npm installed

## Usage

```bash
# Full generation (requires Creative Hub running)
npm run generate-deck -- samples/vocab-sample.xlsx \
  --title "Nautical Spanish" --target es --source en

# Dry run (no GPU, no network — prints prompts, emits stub deck.json)
npm run generate-deck -- samples/vocab-sample.xlsx \
  --title "Nautical Spanish" --target es --dry-run
```

### Options

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `<file>` | yes | — | `.xlsx` or `.csv` with a `word` column |
| `--title` | yes | — | Deck title |
| `--target` | yes | — | Target language (ISO 639-1, e.g. `es`) |
| `--source` | no | `en` | Source/native language |
| `--dry-run` | no | off | Skip Creative Hub, emit stub content |
| `--out` | no | `./generated/` | Output directory |

## Input Format

Single column named `word` (or headerless — first column is used).
One target-language word per row. Any other shape exits with an error.

## Output

```
./generated/<deck-uuid>/
  deck.json          # Full deck + cards matching Supabase schema
  <card-uuid>-word.wav
  <card-uuid>-sentence.wav
  <card-uuid>.png
```

`audio_url` and `image_url` in deck.json are null — they get populated
when wired to Supabase Storage in a later pipeline step. `_local_files`
on each card holds relative paths to the generated media.

## Cleanup

```bash
rm -rf ./generated/
```

The entire `./generated/` directory is gitignored.
