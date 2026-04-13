-- Migration 004: Anonymous read access for guest deck-code flow
--
-- Why: The student "tap a share link → study" flow must work without a login.
-- Currently anon users get RLS-denied on decks and cards. This migration adds
-- SELECT policies scoped to the `anon` role for public decks and their cards.
--
-- Harvested from pbpieper/nabu-flashcards supabase/migration_v2.sql
-- Safe to re-run (idempotent via pg_policies check).

-- ═══════════════════════════════════════════════════════
-- DECKS — anon can read public decks
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Anon can read public decks'
      AND tablename = 'decks'
  ) THEN
    CREATE POLICY "Anon can read public decks"
      ON public.decks
      FOR SELECT
      TO anon
      USING (is_public = true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- CARDS — anon can read cards in public decks
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Anon can read public deck cards'
      AND tablename = 'cards'
  ) THEN
    CREATE POLICY "Anon can read public deck cards"
      ON public.cards
      FOR SELECT
      TO anon
      USING (deck_id IN (SELECT id FROM public.decks WHERE is_public = true));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- VERIFICATION (run manually after migration to confirm)
-- ═══════════════════════════════════════════════════════
-- SELECT policyname, tablename, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('decks', 'cards') AND 'anon' = ANY(roles);
--
-- Expected: 2 rows — "Anon can read public decks" and "Anon can read public deck cards"
