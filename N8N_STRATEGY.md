# Nabu — n8n Expansion Strategy

## Current Architecture (v2 — local-first)

```
Student enters code → ONE Supabase fetch → stored in AsyncStorage forever
                    → SRS, streaks, progress all run locally
                    → background sync to Supabase (best-effort)
```

**No n8n dependency.** The app works entirely offline after first download.
n8n enters the picture for **teacher-side tooling** and **AI enrichment** — never
in the student's study loop.

---

## Phase 1: Teacher Deck Builder (n8n)

**Trigger**: Teacher pastes vocabulary list (CSV/text) into a form or sends to a webhook.

```
Webhook /nabu/create-deck
  → n8n receives: { title, language, vocabulary[] }
  → Step 1: Parse & validate vocabulary
  → Step 2: For each word:
      - Generate example_sentence (Ollama/qwen2.5 local, or Claude API fallback)
      - Generate explanation (same)
      - Assign grammar_tag from POS tagger
      - Generate TTS audio → upload to Supabase Storage → get audio_url
      - (Optional) Generate image via SDXL on Creative Hub → upload → get image_url
  → Step 3: Insert deck + cards into Supabase
  → Step 4: Return share_code to teacher
```

**Compatibility**: Students download the finished deck normally. The n8n pipeline
only writes to Supabase — the app reads from Supabase during download. No app
changes needed.

**Fallback chain** (per n8n_ai_bridge_architecture.md):
1. Creative Hub (localhost:8420) — free, local
2. Cloud API (Anthropic/OpenAI) — paid, reliable
3. User's own API key — configurable

---

## Phase 2: Deck Update Pipeline

**Trigger**: Teacher edits vocabulary in a spreadsheet or form, hits "Publish Update."

```
Webhook /nabu/update-deck
  → n8n receives: { deck_id, vocabulary[] }
  → Step 1: Diff against existing cards (match by sort_order)
  → Step 2: For new/changed words:
      - Regenerate sentence, explanation, audio, image
  → Step 3: Update cards in Supabase + bump deck.updated_at
  → Step 4: Students see "Update available" badge → one-tap merge
```

**Compatibility**: The smart merge in useLocalDeckStore already matches by
sort_order and preserves progress. Teacher just needs to keep card positions
stable when editing.

---

## Phase 3: AI-Enriched Study Analytics

**Trigger**: Cron (weekly) or on-demand from teacher dashboard.

```
Cron /nabu/analytics
  → n8n reads: review_events + card_progress from Supabase
  → Step 1: Aggregate per-card difficulty (avg_hints_needed, fail rate)
  → Step 2: Identify trouble cards (high hint usage, repeated failures)
  → Step 3: (Optional) Use LLM to suggest better explanations for hard cards
  → Step 4: Write report to Supabase or send email to teacher
```

**Compatibility**: review_events and hint tracking are already being logged.
This pipeline is read-only from the app's perspective.

---

## Phase 4: Personalized Content Generation

**Trigger**: Student requests "explain this differently" or "give me more practice."

```
App sends POST /webhook/nabu/explain
  → n8n receives: { card_id, user_context }
  → LLM generates alternative explanation tailored to student's history
  → Returns to app via response
```

**Compatibility**: This requires a new feature in the app (a "Help me understand"
button on a card). The n8n webhook is a simple request/response. App stores the
generated content locally.

---

## Integration Points

| Component | Reads | Writes | n8n Role |
|-----------|-------|--------|----------|
| Student app | Supabase (download) + local | Local + Supabase (background sync) | None |
| Teacher deck builder | — | Supabase (decks, cards, storage) | Orchestrator |
| Analytics | Supabase (review_events) | Reports / emails | Aggregator |
| AI enrichment | Supabase (cards) | Supabase (cards) + Storage | AI pipeline |

## Key Design Principles

1. **n8n never touches the study loop.** Students read/write locally. n8n is
   for content creation and analytics — teacher-side only.

2. **Supabase is the handoff point.** n8n writes to Supabase, app reads from
   Supabase. They never communicate directly.

3. **Fallback chain for AI.** Local (Creative Hub) → Cloud API → Manual. No
   single point of failure.

4. **Deck versioning is the bridge.** Teacher publishes via n8n → Supabase
   `updated_at` bumps → app detects → student updates when ready.

5. **Media is additive.** Audio/images are URLs in card rows. If n8n generates
   them, they appear. If not, the app uses TTS and shows no image. Zero
   breaking changes.

## Webhook Endpoints (future)

```
POST /webhook/nabu/create-deck    → Create deck from vocabulary list
POST /webhook/nabu/update-deck    → Update existing deck
POST /webhook/nabu/enrich-card    → Generate audio/image/explanation for one card
GET  /webhook/nabu/analytics      → Run analytics report
POST /webhook/nabu/explain        → Personalized explanation for student
GET  /webhook/nabu/health         → Health check
```

All webhooks return JSON. Auth via bearer token (configured in n8n credentials).
