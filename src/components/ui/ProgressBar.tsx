import { View } from 'react-native'

interface ProgressBarProps {
  progress: number
  color?: string
  trackColor?: string
  height?: number
}

export function ProgressBar({
  progress,
  color = '#1B4332',
  trackColor = '#F1F5F9',
  height = 4,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress))

  return (
    <View style={{
      width: '100%',
      height,
      borderRadius: height,
      backgroundColor: trackColor,
      overflow: 'hidden',
    }}>
      <View style={{
        width: `${clamped * 100}%`,
        height: '100%',
        borderRadius: height,
        backgroundColor: color,
      }} />
    </View>
  )
}
