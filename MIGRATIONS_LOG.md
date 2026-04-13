# Nabu Migrations Log

## Staging Environment

- **Project ID:** `ayjpicshcsaryamtlajl`
- **URL:** `https://ayjpicshcsaryamtlajl.supabase.co`
- **Applied via:** Supabase CLI v2.84.2 (`supabase db push`)

---

## Migrations Applied to Staging

### 001_initial_schema.sql
- **Status:** applied
- **Applied at:** 2026-04-13T20:00:00Z (approx)
- **applied_to_prod_at:** TBD
- **Notes:** Creates profiles, decks, cards, card_progress, review_sessions tables with RLS and auth trigger.

### 002_reconcile_schema.sql
- **Status:** applied
- **Applied at:** 2026-04-13T20:01:00Z (approx)
- **applied_to_prod_at:** TBD
- **Notes:** Reconciles Skit Trainer + Nabu schemas. Adds columns to profiles, creates sessions table, creates decks/cards/card_progress/review_sessions with IF NOT EXISTS, adds set_updated_at triggers. Stub skits/progress tables were pre-created on staging since the old Skit Trainer tables did not exist.

### 003_v2_enhancements.sql
- **Status:** applied
- **Applied at:** 2026-04-13T20:01:00Z (approx)
- **applied_to_prod_at:** TBD
- **Notes:** V2 enhancements (grammar_tag, clue_image_url, additional columns on cards).

### 004_anon_read_policies.sql
- **Status:** applied
- **Applied at:** 2026-04-13T20:01:00Z (approx)
- **applied_to_prod_at:** TBD
- **Notes:** Adds anon SELECT policies on decks (public) and cards (in public decks) for guest deck-code flow.

### 005_card_content.sql
- **Status:** applied
- **Applied at:** 2026-04-13T20:01:00Z (approx)
- **applied_to_prod_at:** TBD
- **Notes:** Creates card_content table with typed, ordered, tiered content items. Backfills from existing flat card columns. Adds RLS policies for anon, authed, and deck creators.

### 006_deck_subscriptions.sql
- **Status:** applied
- **Applied at:** 2026-04-13T20:01:00Z (approx)
- **applied_to_prod_at:** TBD
- **Notes:** Creates deck_subscriptions table for cross-device "My Decks" persistence. Users manage own subscriptions via RLS.

---

## Verification Query Results

### 004 Verification: Anon Policies

```sql
SELECT policyname, tablename, roles, cmd
FROM pg_policies
WHERE tablename IN ('decks', 'cards') AND 'anon' = ANY(roles);
```

**Result (2 rows -- PASS):**
| policyname | tablename | roles | cmd |
|---|---|---|---|
| Anon can read public decks | decks | {anon} | SELECT |
| Anon can read public deck cards | cards | {anon} | SELECT |

### 005 Verification: card_content

```sql
SELECT content_type, COUNT(*) FROM public.card_content GROUP BY content_type ORDER BY content_type;
```

**Result:** 0 rows (expected -- no cards exist on staging yet). Table exists and backfill ran without errors.

### 006 Verification: deck_subscriptions

```sql
SELECT tablename FROM pg_tables WHERE tablename = 'deck_subscriptions' AND schemaname = 'public';
```

**Result:** 1 row -- `deck_subscriptions` exists. PASS.

### Migration History

```
version | name
--------|---------------------
001     | initial_schema
002     | reconcile_schema
003     | v2_enhancements
004     | anon_read_policies
005     | card_content
006     | deck_subscriptions
```

---

## Storage Bucket: deck-media

- **Status:** created
- **Bucket ID:** `deck-media`
- **Public:** true (public read access)
- **File size limit:** 10,485,760 bytes (10 MB)
- **Allowed MIME types:** `image/*`, `audio/*`

### Storage Policies

| Policy | Command | Roles |
|---|---|---|
| Public read access | SELECT | {public} |
| Deck creators can upload media | INSERT | {authenticated} |
| Deck creators can update own media | UPDATE | {authenticated} |
| Deck creators can delete own media | DELETE | {authenticated} |

Upload/update/delete policies enforce folder-based ownership: the first folder in the path must match a deck_id owned by the authenticated user (`creator_id = auth.uid()`).

---

## Anon SELECT Smoke Tests

Ran at 2026-04-13T20:02:00Z against staging using the anon key.

### GET /rest/v1/decks?is_public=eq.true&limit=5
**Response:** `200 OK` -- `[]` (empty array, no decks exist yet)

### GET /rest/v1/cards?limit=5
**Response:** `200 OK` -- `[]` (empty array, no cards exist yet)

### GET /rest/v1/card_content?limit=5
**Response:** `200 OK` -- `[]` (empty array, no card_content exists yet)

### GET /rest/v1/deck_subscriptions?limit=1
**Response:** `200 OK` -- `[]` (empty array, RLS returns empty for anon -- expected since policy requires `user_id = auth.uid()`)

### POST /storage/v1/object/list/deck-media
**Response:** `200 OK` -- `[]` (empty array, bucket is accessible, no objects uploaded yet)

---

## Notes

- **Staging had stale schema from a different app** (Skit Trainer tables: app_registry, deploy_log, goals, skits, etc.). These were dropped before applying the Nabu migration suite. Stub `skits` and `progress` tables were created so migration 002 (reconcile) could apply its ALTER TABLE statements.
- Production (`pdcrvpggskryptsdvnpe`) was NOT touched.
- The `deck-media` bucket and its storage policies were applied directly via SQL, not through a migration file. For production, the same SQL should be run in the SQL Editor or added as a migration.
