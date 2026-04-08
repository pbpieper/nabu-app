/**
 * Supabase Storage helpers for deck media (images + audio).
 *
 * Bucket: deck-media (public, 10MB limit)
 * Path convention: {userId}/{deckId}/{cardId}-{type}.{ext}
 *   e.g. abc123/deck456/card789-image.jpg
 *        abc123/deck456/card789-audio.mp3
 *
 * Public URL pattern:
 *   https://{project}.supabase.co/storage/v1/object/public/deck-media/{path}
 */
import { supabase } from './client'

const BUCKET = 'deck-media'

interface UploadResult {
  url: string
  path: string
}

/**
 * Upload a file to Supabase Storage and return the public URL.
 */
export async function uploadMedia(
  file: { uri: string; type: string; name: string } | File,
  userId: string,
  deckId: string,
  cardId: string,
  mediaType: 'image' | 'audio' | 'clue-image',
): Promise<UploadResult> {
  // Determine file extension
  const name = 'name' in file ? file.name : 'file'
  const ext = name.split('.').pop()?.toLowerCase() || getExtFromMime(('type' in file ? file.type : '') as string)
  const storagePath = `${userId}/${deckId}/${cardId}-${mediaType}.${ext}`

  let uploadData: File | Blob

  if (file instanceof File) {
    uploadData = file
  } else {
    // React Native: fetch the URI and convert to blob
    const response = await fetch(file.uri)
    uploadData = await response.blob()
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, uploadData, {
      upsert: true,
      contentType: ('type' in file ? file.type : undefined) as string | undefined,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  return {
    url: urlData.publicUrl,
    path: storagePath,
  }
}

/**
 * Delete a media file from storage.
 */
export async function deleteMedia(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path])

  if (error) throw new Error(`Delete failed: ${error.message}`)
}

/**
 * Get the public URL for a storage path.
 */
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  }
  return map[mime] || 'bin'
}
