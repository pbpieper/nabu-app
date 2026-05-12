-- Migration 007: Lexa unique-terms database + article scan log
--
-- Why: Lexa (CS-1) produces a list of new vocabulary from a text via set
-- difference against what the user already knows. To run that loop inside
-- Nabu without a CSV in the user's hands, we need three things persisted
-- per user: (1) the articles they've scanned, (2) their flat unique-terms
-- database with status, frequency, and first-seen context, (3) a log of
-- each scan/swipe session.
--
-- Designed off Lexa write-up §11.3 (flat one-column term DB is the spine)
-- and §12 (store first-seen sentence per term).
--
-- Purely additive. Existing tables untouched. RLS scoped to auth.uid().

-- ═══════════════════════════════════════════════════════
-- 1. articles — texts the user has scanned
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.articles (
  id              TEXT PRIMARY KEY,                  -- sha256 hex of normalized text
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lang            TEXT NOT NULL,                     -- ISO 639-1
  title           TEXT,                              -- nullable, derived if absent
  text            TEXT NOT NULL,                     -- full normalized text
  token_count     INTEGER NOT NULL DEFAULT 0,        -- total tokens (post-stopword)
  unique_count    INTEGER NOT NULL DEFAULT 0,        -- unique term count
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_articles_user_lang
  ON public.articles(user_id, lang, created_at DESC);
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own articles"
    ON public.articles FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════
-- 2. unique_terms — the per-user vocabulary spine
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.unique_terms (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  term                     TEXT NOT NULL,            -- normalized, lowercase
  lang                     TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('known', 'unknown')),
  first_seen_article_id    TEXT REFERENCES public.articles(id) ON DELETE SET NULL,
  first_seen_sentence      TEXT,                     -- from Lexa write-up §12
  frequency_total          INTEGER NOT NULL DEFAULT 0,   -- summed across all scans
  times_seen_known         INTEGER NOT NULL DEFAULT 0,   -- how many times swiped known
  times_seen_unknown       INTEGER NOT NULL DEFAULT 0,   -- how many times swiped unknown
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lang, term)
);
CREATE INDEX IF NOT EXISTS idx_unique_terms_user_lang_status
  ON public.unique_terms(user_id, lang, status);
CREATE INDEX IF NOT EXISTS idx_unique_terms_user_lang_term
  ON public.unique_terms(user_id, lang, term);
ALTER TABLE public.unique_terms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own unique_terms"
    ON public.unique_terms FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reuse set_updated_at trigger function from migration 002
DROP TRIGGER IF EXISTS set_unique_terms_updated_at ON public.unique_terms;
CREATE TRIGGER set_unique_terms_updated_at
  BEFORE UPDATE ON public.unique_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════
-- 3. article_sorts — log of swipe sessions
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.article_sorts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  article_id      TEXT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  known_count     INTEGER NOT NULL DEFAULT 0,
  unknown_count   INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ,                       -- NULL until swipe finished
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_article_sorts_user
  ON public.article_sorts(user_id, created_at DESC);
ALTER TABLE public.article_sorts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own article_sorts"
    ON public.article_sorts FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════
-- 4. lexa_upsert_terms — bulk upsert with G-I.6 semantics
-- ═══════════════════════════════════════════════════════
-- Why: supabase-js .upsert() can't express per-column COALESCE (write-once
-- first-seen fields) + addition (incremental counters) in one call. We need
-- a server-side function. SECURITY INVOKER means RLS is enforced as the
-- caller, so the function is safe to expose to `authenticated`.
--
-- Payload shape (JSONB array): each element is
--   { term: text, lang: text, status: 'known'|'unknown',
--     first_seen_article_id: text|null, first_seen_sentence: text|null,
--     frequency_delta: int, known_delta: int, unknown_delta: int }
--
-- The function inserts as auth.uid(), respecting RLS.
CREATE OR REPLACE FUNCTION public.lexa_upsert_terms(p_payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
BEGIN
  INSERT INTO public.unique_terms (
    user_id, lang, term, status,
    first_seen_article_id, first_seen_sentence,
    frequency_total, times_seen_known, times_seen_unknown
  )
  SELECT
    auth.uid(),
    (item->>'lang')::text,
    (item->>'term')::text,
    (item->>'status')::text,
    NULLIF(item->>'first_seen_article_id', ''),
    NULLIF(item->>'first_seen_sentence', ''),
    COALESCE((item->>'frequency_delta')::int, 0),
    COALESCE((item->>'known_delta')::int, 0),
    COALESCE((item->>'unknown_delta')::int, 0)
  FROM jsonb_array_elements(p_payload) AS item
  ON CONFLICT (user_id, lang, term) DO UPDATE SET
    status                = EXCLUDED.status,
    first_seen_article_id = COALESCE(public.unique_terms.first_seen_article_id, EXCLUDED.first_seen_article_id),
    first_seen_sentence   = COALESCE(public.unique_terms.first_seen_sentence,   EXCLUDED.first_seen_sentence),
    frequency_total       = public.unique_terms.frequency_total       + EXCLUDED.frequency_total,
    times_seen_known      = public.unique_terms.times_seen_known      + EXCLUDED.times_seen_known,
    times_seen_unknown    = public.unique_terms.times_seen_unknown    + EXCLUDED.times_seen_unknown,
    updated_at            = NOW();
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.lexa_upsert_terms(JSONB) TO authenticated;
