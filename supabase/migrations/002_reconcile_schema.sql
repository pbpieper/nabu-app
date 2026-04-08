-- Reconcile existing DB with both Skit Trainer and Nabu schemas
-- Existing tables: profiles(id, display_name, created_at), skits, progress

-- ═══════════════════════════════════════════════════════
-- 1. PROFILES — add missing columns for both apps
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Performer',
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"theme": "system"}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill name from display_name where possible
UPDATE public.profiles SET name = display_name WHERE display_name IS NOT NULL AND name = 'Performer';

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Performer'),
    COALESCE(NEW.raw_user_meta_data->>'name', 'Performer'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════
-- 2. SKITS — add missing columns
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.skits
  ADD COLUMN IF NOT EXISTS palace_images TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════
-- 3. SKIT PROGRESS — add missing columns (keep existing ones)
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.progress
  ADD COLUMN IF NOT EXISTS chunk_mastered TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recall_scores JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chain_completed INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flashcard_correct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flashcard_wrong INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════
-- 4. SESSIONS — new table for skit-trainer
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skit_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  score_data JSONB
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own sessions" ON public.sessions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id, started_at DESC);

-- ═══════════════════════════════════════════════════════
-- 5. NABU: DECKS
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  source_language TEXT NOT NULL DEFAULT 'en',
  target_language TEXT NOT NULL DEFAULT 'ar',
  share_code TEXT UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  card_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Public decks readable by all" ON public.decks FOR SELECT USING (is_public = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Creators can manage own decks" ON public.decks FOR ALL USING (creator_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_decks_share_code ON public.decks(share_code);

-- ═══════════════════════════════════════════════════════
-- 6. NABU: CARDS
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  image_url TEXT,
  clue_image_url TEXT,
  audio_url TEXT,
  example_sentence TEXT,
  explanation TEXT,
  part_of_speech TEXT,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Cards readable if deck public" ON public.cards FOR SELECT
    USING (deck_id IN (SELECT id FROM public.decks WHERE is_public = true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Deck creator can manage cards" ON public.cards FOR ALL
    USING (deck_id IN (SELECT id FROM public.decks WHERE creator_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cards_deck ON public.cards(deck_id, sort_order);

-- ═══════════════════════════════════════════════════════
-- 7. NABU: CARD PROGRESS
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.card_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE,
  deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE,
  interval_days REAL NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ DEFAULT now(),
  consecutive_correct INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'learning', 'review', 'mastered')),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, card_id)
);

ALTER TABLE public.card_progress ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own card progress" ON public.card_progress FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_card_progress_user_deck ON public.card_progress(user_id, deck_id);
CREATE INDEX IF NOT EXISTS idx_card_progress_next_review ON public.card_progress(user_id, next_review_at);

-- ═══════════════════════════════════════════════════════
-- 8. NABU: REVIEW SESSIONS
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  deck_id UUID REFERENCES public.decks(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  cards_reviewed INTEGER DEFAULT 0,
  cards_correct INTEGER DEFAULT 0,
  new_cards_seen INTEGER DEFAULT 0
);

ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own review sessions" ON public.review_sessions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════
-- 9. UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_decks_updated_at ON public.decks;
CREATE TRIGGER set_decks_updated_at
  BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
