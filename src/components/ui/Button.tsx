import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native'
import { Feather } from '@expo/vector-icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant
  size?: Size
  label: string
  icon?: keyof typeof Feather.glyphMap
  loading?: boolean
}

const config = {
  primary:   { bg: '#1B4332', text: '#FFFFFF', border: '#1B4332' },
  secondary: { bg: '#F1F5F9', text: '#334155', border: '#E2E8F0' },
  ghost:     { bg: 'transparent', text: '#64748B', border: 'transparent' },
  outline:   { bg: 'transparent', text: '#334155', border: '#CBD5E1' },
  danger:    { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
} as const

const sizes = {
  sm: { px: 12, py: 6, text: 12, icon: 14, radius: 6, gap: 4 },
  md: { px: 16, py: 10, text: 13, icon: 16, radius: 8, gap: 6 },
  lg: { px: 20, py: 14, text: 15, icon: 18, radius: 10, gap: 8 },
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  icon,
  loading,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const c = config[variant]
  const s = sizes[size]

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s.gap,
          paddingHorizontal: s.px,
          paddingVertical: s.py,
          borderRadius: s.radius,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style as any,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.text} />
      ) : (
        <>
          {icon && <Feather name={icon} size={s.icon} color={c.text} />}
          <Text style={{ fontSize: s.text, fontWeight: '600', color: c.text, letterSpacing: 0.2 }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  )
}
