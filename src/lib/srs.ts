import type { CardProgress } from '@src/types'

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

export function processReview(progress: CardProgress, correct: boolean): CardProgress {
  const now = new Date()
  const updated = { ...progress }

  updated.total_reviews += 1
  updated.last_reviewed_at = now.toISOString()

  if (correct) {
    updated.total_correct += 1
    updated.consecutive_correct += 1

    if (updated.status === 'new' || updated.status === 'learning') {
      if (updated.consecutive_correct >= 2) {
        updated.status = 'review'
        updated.interval_days = 1
        updated.next_review_at = addDays(now, 1).toISOString()
      } else {
        updated.status = 'learning'
        updated.interval_days = 0
        updated.next_review_at = addMinutes(now, 10).toISOString()
      }
    } else {
      updated.interval_days = Math.min(updated.interval_days * 2, 180)
      updated.next_review_at = addDays(now, updated.interval_days).toISOString()
      if (updated.interval_days >= 32) {
        updated.status = 'mastered'
      }
    }
  } else {
    updated.consecutive_correct = 0
    updated.status = 'learning'
    updated.interval_days = 0
    updated.next_review_at = now.toISOString()
  }

  return updated
}

export function createNewProgress(userId: string, cardId: string, deckId: string): CardProgress {
  return {
    id: '',
    user_id: userId,
    card_id: cardId,
    deck_id: deckId,
    interval_days: 0,
    next_review_at: new Date().toISOString(),
    consecutive_correct: 0,
    total_reviews: 0,
    total_correct: 0,
    status: 'new',
    last_reviewed_at: null,
    created_at: new Date().toISOString(),
  }
}

export function buildStudyQueue(
  cards: { card_id: string; progress: CardProgress | null }[],
  newLimit: number = 20,
  includeAll: boolean = false,
): string[] {
  const now = new Date()
  const due: { id: string; nextReview: Date }[] = []
  const learning: { id: string; nextReview: Date }[] = []
  const newCards: string[] = []

  for (const { card_id, progress } of cards) {
    if (!progress || progress.status === 'new') {
      newCards.push(card_id)
    } else if (progress.status === 'learning') {
      learning.push({ id: card_id, nextReview: new Date(progress.next_review_at) })
    } else {
      const nextReview = new Date(progress.next_review_at)
      if (includeAll || nextReview <= now) {
        due.push({ id: card_id, nextReview })
      }
    }
  }

  due.sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime())
  learning.sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime())

  const limit = includeAll ? cards.length : newLimit
  return [...due.map(d => d.id), ...learning.map(l => l.id), ...newCards.slice(0, limit)]
}
