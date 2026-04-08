import { useRef, useCallback } from 'react'
import { Audio } from 'expo-av'

export function useAudio() {
  const soundRef = useRef<Audio.Sound | null>(null)

  const play = useCallback(async (uri: string, onEnd?: () => void) => {
    await stop()
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      (status) => {
        if (status.isLoaded && status.didJustFinish) {
          onEnd?.()
        }
      }
    )
    soundRef.current = sound
  }, [])

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync()
      await soundRef.current.unloadAsync()
      soundRef.current = null
    }
  }, [])

  return { play, stop }
}
