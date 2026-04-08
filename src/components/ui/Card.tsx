import { View, type ViewProps } from 'react-native'

interface CardProps extends ViewProps {
  variant?: 'default' | 'active' | 'elevated'
}

const config = {
  default:  { bg: '#FFFFFF', border: '#E2E8F0' },
  active:   { bg: '#F0FDF4', border: '#86EFAC' },
  elevated: { bg: '#FFFFFF', border: '#F1F5F9' },
} as const

export function Card({ variant = 'default', style, ...props }: CardProps) {
  const s = config[variant]
  return (
    <View
      style={[
        {
          backgroundColor: s.bg,
          borderWidth: 1,
          borderColor: s.border,
          borderRadius: 10,
          padding: 16,
          ...(variant === 'elevated' ? {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          } : {}),
        },
        style,
      ]}
      {...props}
    />
  )
}
