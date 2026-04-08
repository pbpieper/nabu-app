-- Nabu Flashcard System — Database Schema
-- Run this in your Supabase SQL Editor

-- Users (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decks
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  source_language TEXT NOT NULL DEFAULT 'en',
  target_language TEXT NOT NULL DEFAULT 'ar',
  share_code TEXT UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  card_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cards
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  image_url TEXT,
  clue_image_url TEXT,                 -- Hint image for progressive reveal (shown before full answer)
  audio_url TEXT,
  example_sentence TEXT,
  explanation TEXT,
  part_of_speech TEXT,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student progress per card
CREATE TABLE public.card_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE,
  deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE,
  interval_days REAL NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ DEFAULT NOW(),
  consecutive_correct INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'learning', 'review', 'mastered')),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- Session log
CREATE TABLE public.review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  deck_id UUID REFERENCES public.decks(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  cards_reviewed INTEGER DEFAULT 0,
  cards_correct INTEGER DEFAULT 0,
  new_cards_seen INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_card_progress_user_deck ON public.card_progress(user_id, deck_id);
CREATE INDEX idx_card_progress_next_review ON public.card_progress(user_id, next_review_at);
CREATE INDEX idx_cards_deck ON public.cards(deck_id, sort_order);
CREATE INDEX idx_decks_share_code ON public.decks(share_code);

-- Row-Level Security

-- Profiles: users can read/update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public decks readable by all" ON public.decks FOR SELECT USING (is_public = true);
CREATE POLICY "Creators can CRUD own decks" ON public.decks FOR ALL USING (creator_id = auth.uid());

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cards readable if deck public" ON public.cards FOR SELECT
  USING (deck_id IN (SELECT id FROM public.decks WHERE is_public = true));
CREATE POLICY "Deck creator can CRUD cards" ON public.cards FOR ALL
  USING (deck_id IN (SELECT id FROM public.decks WHERE creator_id = auth.uid()));

ALTER TABLE public.card_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own progress" ON public.card_progress FOR ALL USING (user_id = auth.uid());

ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON public.review_sessions FOR ALL USING (user_id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
