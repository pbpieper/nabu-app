-- v2 enhancements: review events, hint tracking, grammar tags, analytics, storage

-- ═══════════════════════════════════════════════════════
-- 1. CARDS — add grammar_tag column
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS grammar_tag TEXT;

-- ═══════════════════════════════════════════════════════
-- 2. CARD PROGRESS — add hint tracking columns
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.card_progress
  ADD COLUMN IF NOT EXISTS avg_hints_needed REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_hints_used INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════
-- 3. PROFILES — allow 'teacher' role
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('student', 'teacher', 'admin'));

-- ═══════════════════════════════════════════════════════
-- 4. DECKS — add classroom_mode toggle
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS classroom_mode BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════════════════
-- 5. REVIEW EVENTS — per-answer logging
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE,
  deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE,
  hints_revealed INTEGER DEFAULT 0,
  grade TEXT NOT NULL CHECK (grade IN ('again', 'got_it')),
  time_to_grade_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.review_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own review events" ON public.review_events FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_review_events_user_deck ON public.review_events(user_id, deck_id);
CREATE INDEX IF NOT EXISTS idx_review_events_card ON public.review_events(card_id);

-- ═══════════════════════════════════════════════════════
-- 6. DECK ANALYTICS VIEW — teacher dashboard
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.deck_analytics AS
SELECT
  d.id AS deck_id,
  COUNT(DISTINCT cp.user_id) AS active_students,
  COALESCE(SUM(cp.total_reviews), 0) AS total_reviews,
  CASE
    WHEN SUM(cp.total_reviews) > 0
    THEN ROUND((SUM(cp.total_correct)::numeric / SUM(cp.total_reviews)::numeric) * 100, 1)
    ELSE 0
  END AS avg_accuracy,
  COUNT(CASE WHEN cp.status = 'mastered' THEN 1 END) AS cards_mastered
FROM public.decks d
LEFT JOIN public.card_progress cp ON cp.deck_id = d.id
GROUP BY d.id;

-- ═══════════════════════════════════════════════════════
-- 7. STORAGE BUCKET — deck media (images + audio)
-- ═══════════════════════════════════════════════════════
-- Run via Supabase dashboard or API:
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('deck-media', 'deck-media', true, 10485760,
--   ARRAY['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm']);

-- Storage RLS (public read, auth upload):
-- CREATE POLICY "Public read" ON storage.objects FOR SELECT USING (bucket_id = 'deck-media');
-- CREATE POLICY "Auth upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'deck-media' AND auth.uid() IS NOT NULL);
-- CREATE POLICY "Owner update" ON storage.objects FOR UPDATE USING (bucket_id = 'deck-media' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Owner delete" ON storage.objects FOR DELETE USING (bucket_id = 'deck-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Note: Storage policies must be applied via dashboard or supabase CLI, not standard SQL migrations.
