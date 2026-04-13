-- Migration 005: Flexible card content (card_content table)
--
-- Why: The flat `cards` table locks every card into the same structure. This
-- adds a `card_content` table of typed, ordered, tiered content items per card
-- — enabling multiple sentences, images, explanations per card without schema
-- changes, and CEFR-tiered difficulty progression.
--
-- This is PURELY ADDITIVE. Existing flat columns on `cards` stay. The app
-- keeps reading them for backward compatibility. New content writes to BOTH
-- (primary item mirrored to flat columns, full set to card_content).
--
-- Derived from Nabu/nabu-flexible-card-architecture.md

-- ═══════════════════════════════════════════════════════
-- 1. card_content — typed content items per card
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.card_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,

  content_type TEXT NOT NULL CHECK (content_type IN (
    'word',
    'romanization',
    'translation',
    'sentence',
    'sentence_translation',
    'explanation',
    'image',
    'clue_image',
    'audio',
    'grammar_tag',
    'mnemonic',
    'context_note',
    'etymology',
    'conjugation',
    'related_word',
    'video',
    'custom'
  )),

  text_value TEXT,
  media_url TEXT,

  language TEXT,                       -- ISO 639-1
  sort_order INTEGER DEFAULT 0,
  difficulty_tier INTEGER DEFAULT 1
    CHECK (difficulty_tier BETWEEN 1 AND 3),

  metadata JSONB DEFAULT '{}',         -- e.g. { "source": "One Piece Ch. 1112", "bold_word": "zarpar" }

  is_primary BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_content_card
  ON public.card_content(card_id, content_type, sort_order);
CREATE INDEX IF NOT EXISTS idx_card_content_type
  ON public.card_content(content_type);

-- Only one primary per (card_id, content_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_content_primary
  ON public.card_content(card_id, content_type)
  WHERE is_primary = true;

-- updated_at trigger (reuses existing set_updated_at function from 002)
DROP TRIGGER IF EXISTS set_card_content_updated_at ON public.card_content;
CREATE TRIGGER set_card_content_updated_at
  BEFORE UPDATE ON public.card_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════
-- 2. RLS
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.card_content ENABLE ROW LEVEL SECURITY;

-- Anon: can read content for cards in public decks (mirrors 004)
DO $$ BEGIN
  CREATE POLICY "Anon can read public deck card_content"
    ON public.card_content
    FOR SELECT
    TO anon
    USING (card_id IN (
      SELECT c.id FROM public.cards c
      JOIN public.decks d ON c.deck_id = d.id
      WHERE d.is_public = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authed: can read content for cards in decks they can see
DO $$ BEGIN
  CREATE POLICY "Authed can read accessible card_content"
    ON public.card_content
    FOR SELECT
    USING (card_id IN (
      SELECT c.id FROM public.cards c
      JOIN public.decks d ON c.deck_id = d.id
      WHERE d.is_public = true OR d.creator_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deck creator: can manage content on their own decks' cards
DO $$ BEGIN
  CREATE POLICY "Deck creator can manage card_content"
    ON public.card_content
    FOR ALL
    USING (card_id IN (
      SELECT c.id FROM public.cards c
      JOIN public.decks d ON c.deck_id = d.id
      WHERE d.creator_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════
-- 3. Backfill from existing flat columns on `cards`
-- ═══════════════════════════════════════════════════════
-- Each flat column becomes one primary card_content row.
-- Idempotent via NOT EXISTS — safe to re-run.

INSERT INTO public.card_content (card_id, content_type, text_value, is_primary, sort_order)
SELECT id, 'word', word, true, 0 FROM public.cards
WHERE word IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'word');

INSERT INTO public.card_content (card_id, content_type, text_value, is_primary, sort_order)
SELECT id, 'translation', translation, true, 0 FROM public.cards
WHERE translation IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'translation');

INSERT INTO public.card_content (card_id, content_type, text_value, is_primary, sort_order)
SELECT id, 'sentence', example_sentence, true, 0 FROM public.cards
WHERE example_sentence IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'sentence');

INSERT INTO public.card_content (card_id, content_type, text_value, is_primary, sort_order)
SELECT id, 'explanation', explanation, true, 0 FROM public.cards
WHERE explanation IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'explanation');

INSERT INTO public.card_content (card_id, content_type, text_value, is_primary, sort_order)
SELECT id, 'grammar_tag', grammar_tag, true, 0 FROM public.cards
WHERE grammar_tag IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'grammar_tag');

INSERT INTO public.card_content (card_id, content_type, media_url, is_primary, sort_order)
SELECT id, 'image', image_url, true, 0 FROM public.cards
WHERE image_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'image');

INSERT INTO public.card_content (card_id, content_type, media_url, is_primary, sort_order)
SELECT id, 'clue_image', clue_image_url, true, 0 FROM public.cards
WHERE clue_image_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'clue_image');

INSERT INTO public.card_content (card_id, content_type, media_url, is_primary, sort_order)
SELECT id, 'audio', audio_url, true, 0 FROM public.cards
WHERE audio_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.card_content cc WHERE cc.card_id = public.cards.id AND cc.content_type = 'audio');

-- ═══════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════
-- Expect: count roughly = (non-null word + non-null translation + non-null sentence + ...)
-- SELECT content_type, COUNT(*) FROM public.card_content GROUP BY content_type ORDER BY content_type;
