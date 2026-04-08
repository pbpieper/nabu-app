/**
 * Lightweight image caching for card images.
 *
 * On web: relies on browser cache (Cache-Control headers from Supabase Storage).
 * On native: uses Expo Image's built-in disk cache.
 *
 * This module provides a prefetch helper that warms the cache when a deck is
 * downloaded, so images are available offline after first load.
 *
 * Future: when n8n generates images, they'll be uploaded to Supabase Storage
 * with proper cache headers, and this module handles the rest.
 */
import { Platform } from 'react-native'
import type { Card } from '@src/types'

/**
 * Prefetch all image URLs from a set of cards into the browser/native cache.
 * Non-blocking — failures are silently ignored.
 */
export function prefetchCardImages(cards: Card[]): void {
  const urls = cards
    .flatMap(c => [c.image_url, c.clue_image_url])
    .filter((url): url is string => !!url)

  if (urls.length === 0) return

  if (Platform.OS === 'web') {
    // Browser: create hidden Image objects to trigger cache
    for (const url of urls) {
      const img = new Image()
      img.src = url
    }
  } else {
    // Native: use fetch to warm the HTTP cache
    for (const url of urls) {
      fetch(url, { method: 'GET' }).catch(() => {})
    }
  }
}
