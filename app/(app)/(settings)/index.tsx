import { useEffect } from 'react'
import { View, Text, ScrollView, Pressable, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeStore } from '@src/stores/useThemeStore'
import { useProgressStore } from '@src/stores/useProgressStore'
import { useThemeColors, type ThemeColors } from '@src/hooks/useThemeColors'
import { LANGUAGES } from '@src/types'
import {
  Flame, Sun, Moon, Smartphone, ChevronRight,
  BookOpen, HelpCircle, MessageCircle, LogOut,
} from 'lucide-react-native'

type ThemeMode = 'light' | 'dark' | 'system'
const THEMES: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Smartphone },
]

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function langName(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.name ?? code.toUpperCase()
}

function memberSince(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `Joined ${m[d.getMonth()]} ${d.getFullYear()}`
}

export default function ProfileScreen() {
  const router = useRouter()
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const signOut = useAuthStore(s => s.signOut)
  const themeMode = useThemeStore(s => s.mode)
  const setMode = useThemeStore(s => s.setMode)
  const progress = useProgressStore()
  const c = useThemeColors()

  const userId = profile?.id ?? session?.user?.id

  useEffect(() => {
    if (userId) progress.loadUserProgress(userId)
  }, [userId])

  const todayIdx = (() => {
    const d = new Date().getDay()
    return d === 0 ? 6 : d - 1
  })()

  const hasStreak = progress.currentStreak > 0

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: c.surface,
              alignItems: 'center', justifyContent: 'center',
              marginRight: 14,
            }}>
              <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 22, color: c.textSecondary }}>
                {(profile?.display_name ?? profile?.email ?? 'N').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontFamily: 'Geist-SemiBold', fontSize: 20, color: c.text,
                letterSpacing: -0.3,
              }}>
                {profile?.display_name ?? 'Student'}
              </Text>
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 1,
              }}>
                {memberSince(profile?.created_at)}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/(settings)/personal-info')}
              style={({ pressed }) => ({
                paddingHorizontal: 8, paddingVertical: 6,
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.textMuted }}>
                Edit
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Streak ── */}
        <View style={{
          marginHorizontal: 20, marginTop: 20,
          borderWidth: 1, borderColor: c.border, borderRadius: 14,
          padding: 18,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <Flame
              size={20}
              color={hasStreak ? c.streak : c.textMuted}
              style={{ marginRight: 10 }}
            />
            <Text style={{
              fontFamily: 'Geist-Bold', fontSize: 28, color: hasStreak ? c.text : c.textMuted,
              letterSpacing: -0.8, lineHeight: 32,
            }}>
              {progress.currentStreak}
            </Text>
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 14,
              color: c.textMuted, marginLeft: 6, marginTop: 2,
            }}>
              day streak
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {WEEK.map((label, i) => {
              const active = progress.weekActivity[i]
              const isToday = i === todayIdx
              const isFuture = i > todayIdx
              return (
                <View key={i} style={{ alignItems: 'center', gap: 5 }}>
                  <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: active ? (c.dark ? '#27272A' : '#E4E4E7') : 'transparent',
                    borderWidth: active ? 0 : 1,
                    borderColor: isToday ? c.textSecondary : c.border,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: isFuture ? 0.3 : 1,
                  }}>
                    {active && (
                      <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: c.text,
                      }} />
                    )}
                  </View>
                  <Text style={{
                    fontFamily: isToday ? 'Geist-SemiBold' : 'Geist-Regular',
                    fontSize: 11, color: isToday ? c.text : c.textMuted,
                  }}>
                    {label}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={{
          flexDirection: 'row', gap: 1, marginHorizontal: 20, marginTop: 16,
          backgroundColor: c.border, borderRadius: 14, overflow: 'hidden',
        }}>
          <StatCell value={progress.totalMastered} label="Mastered" c={c} />
          <StatCell value={progress.totalReviews} label="Reviews" c={c} />
          <StatCell value={`${progress.accuracy}%`} label="Accuracy" c={c} />
          <StatCell value={progress.languagesCount} label="Languages" c={c} />
        </View>

        {/* ── Deck Progress ── */}
        {progress.deckProgress.length > 0 && (
          <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
            <Text style={{
              fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
              letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12,
            }}>
              Your Decks
            </Text>
            <View style={{ gap: 8 }}>
              {progress.deckProgress.map(deck => (
                <DeckRow key={deck.deckId} deck={deck} c={c} router={router} />
              ))}
            </View>
          </View>
        )}

        {/* ── Settings ── */}
        <View style={{
          marginTop: 32, paddingHorizontal: 20,
          borderTopWidth: 1, borderTopColor: c.border, paddingTop: 20,
        }}>
          <SettingsRow
            label="Study Preferences"
            onPress={() => router.push('/(app)/(settings)/study-preferences')}
            c={c}
          />
          <SettingsRow
            label="Help & FAQ"
            onPress={() => router.push('/(app)/(settings)/help')}
            c={c}
          />
          <SettingsRow
            label="Contact Support"
            onPress={() => Linking.openURL('mailto:support@nabuapp.com?subject=Nabu%20Support')}
            c={c}
          />

          {/* Appearance */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 20, maxWidth: 400 }}>
            {THEMES.map(({ value, label, Icon }) => {
              const active = themeMode === value
              return (
                <Pressable
                  key={value}
                  onPress={() => setMode(value)}
                  style={({ pressed }) => ({
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: active ? c.activeBtn : 'transparent',
                    borderWidth: active ? 0 : 1, borderColor: c.border,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Icon size={14} color={active ? c.activeBtnText : c.textSecondary} />
                  <Text style={{
                    fontFamily: 'Geist-Medium', fontSize: 13,
                    color: active ? c.activeBtnText : c.textSecondary,
                  }}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Pressable
            onPress={signOut}
            style={({ pressed }) => ({
              alignItems: 'center', paddingVertical: 14,
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted }}>
              Log out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/* ─── Stat Cell (unified row) ─── */

function StatCell({ value, label, c }: {
  value: number | string
  label: string
  c: ThemeColors
}) {
  return (
    <View style={{
      flex: 1, backgroundColor: c.surface,
      paddingVertical: 14, alignItems: 'center',
    }}>
      <Text style={{
        fontFamily: 'Geist-SemiBold', fontSize: 18, color: c.text,
        letterSpacing: -0.3,
      }}>
        {value}
      </Text>
      <Text style={{
        fontFamily: 'Geist-Regular', fontSize: 11, color: c.textMuted,
        marginTop: 2,
      }}>
        {label}
      </Text>
    </View>
  )
}

/* ─── Deck Progress Row ─── */

function DeckRow({ deck, c, router }: {
  deck: { deckId: string; title: string; targetLanguage: string; new: number; learning: number; review: number; mastered: number; total: number }
  c: ThemeColors
  router: ReturnType<typeof useRouter>
}) {
  const pct = deck.total > 0 ? Math.round((deck.mastered / deck.total) * 100) : 0

  return (
    <Pressable
      onPress={() => router.push(`/(app)/(home)/deck/${deck.deckId}`)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: c.border, borderRadius: 12,
        padding: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>
          {deck.title}
        </Text>
        <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted, marginTop: 2 }}>
          {langName(deck.targetLanguage)} · {deck.total} cards
        </Text>
        <View style={{
          height: 4, borderRadius: 2, backgroundColor: c.progressBg,
          flexDirection: 'row', overflow: 'hidden', marginTop: 10,
        }}>
          {deck.mastered > 0 && (
            <View style={{ width: `${(deck.mastered / deck.total) * 100}%`, backgroundColor: c.text }} />
          )}
          {deck.review > 0 && (
            <View style={{ width: `${(deck.review / deck.total) * 100}%`, backgroundColor: c.textSecondary }} />
          )}
          {deck.learning > 0 && (
            <View style={{ width: `${(deck.learning / deck.total) * 100}%`, backgroundColor: c.textMuted }} />
          )}
        </View>
      </View>
      <Text style={{
        fontFamily: 'Geist-SemiBold', fontSize: 15, color: c.textSecondary,
        minWidth: 36, textAlign: 'right',
      }}>
        {pct}%
      </Text>
      <ChevronRight size={16} color={c.textMuted} style={{ marginLeft: 6 }} />
    </Pressable>
  )
}

/* ─── Settings Row (minimal) ─── */

function SettingsRow({ label, onPress, c }: {
  label: string
  onPress: () => void
  c: ThemeColors
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 13,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Text style={{ fontFamily: 'Geist-Regular', fontSize: 15, color: c.text }}>
        {label}
      </Text>
      <ChevronRight size={16} color={c.textMuted} />
    </Pressable>
  )
}
