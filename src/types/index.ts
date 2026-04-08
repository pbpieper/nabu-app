export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  role: 'student' | 'admin'
  created_at: string
}

export interface Deck {
  id: string
  creator_id: string | null
  title: string
  description: string | null
  source_language: string
  target_language: string
  share_code: string
  is_public: boolean
  card_count: number
  created_at: string
  updated_at: string
}

export interface Card {
  id: string
  deck_id: string
  sort_order: number
  word: string
  translation: string
  image_url: string | null
  clue_image_url: string | null
  audio_url: string | null
  example_sentence: string | null
  explanation: string | null
  part_of_speech: string | null
  grammar_tag: string | null
  tags: string[] | null
  notes: string | null
  created_at: string
}

export interface CardProgress {
  id: string
  user_id: string
  card_id: string
  deck_id: string
  interval_days: number
  next_review_at: string
  consecutive_correct: number
  total_reviews: number
  total_correct: number
  status: 'new' | 'learning' | 'review' | 'mastered'
  last_reviewed_at: string | null
  avg_hints_needed: number
  last_hints_used: number
  created_at: string
}

export interface ReviewEvent {
  id: string
  user_id: string
  card_id: string
  deck_id: string
  hints_revealed: number
  grade: 'again' | 'got_it'
  time_to_grade_ms: number
  created_at: string
}

export interface ReviewSession {
  id: string
  user_id: string | null
  deck_id: string | null
  started_at: string
  ended_at: string | null
  cards_reviewed: number
  cards_correct: number
  new_cards_seen: number
}

export type RevealLayer = 'translation' | 'audio' | 'image' | 'clue_image' | 'sentence' | 'explanation'

export interface StudyCard {
  card: Card
  progress: CardProgress | null
}

export interface SessionStats {
  cardsReviewed: number
  cardsCorrect: number
  newCardsSeen: number
  durationMs: number
}

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
  { code: 'he', name: 'Hebrew' },
] as const

export const RTL_LANGUAGES = ['ar', 'he']

export function isRTL(langCode: string): boolean {
  return RTL_LANGUAGES.includes(langCode)
}
