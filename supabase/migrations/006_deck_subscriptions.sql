-- Migration 006: Deck subscriptions
--
-- Why: Students who join a deck via share code should have a "My Decks" list.
-- Currently the app only knows a student joined via local AsyncStorage. When
-- they sign in from a different device, they have nothing. This table records
-- which public decks an authenticated user has joined.
--
-- Harvested from pbpieper/nabu-cards supabase/schema.sql

CREATE TABLE IF NOT EXISTS public.deck_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  joined_via_code TEXT,            -- the share_code they used (audit/debug)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, deck_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_subscriptions_user
  ON public.deck_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_subscriptions_deck
  ON public.deck_subscriptions(deck_id);

ALTER TABLE public.deck_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own subscriptions"
    ON public.deck_subscriptions
    FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Optional: extend decks select policy so subscribers can see decks that are
-- no longer public (e.g. teacher unpublished; existing subscribers keep access).
-- Not applied now — wait until we have a real unpublish flow.
