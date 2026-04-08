import { useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { ArrowRight, BookOpen, ChevronRight, Layers } from 'lucide-react-native'

export default function DecksScreen() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const decks = useDecksStore(s => s.decks)
  const loadDeckByCode = useDecksStore(s => s.loadDeckByCode)
  const c = useThemeColors()

  const handleCodeSubmit = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const deck = await loadDeckByCode(code.trim())
      if (deck) { router.push(`/(app)/(decks)/${deck.id}`) }
      else { Toast.show({ type: 'error', text1: 'Deck not found', text2: `No deck with code "${code}"` }) }
    } catch { Toast.show({ type: 'error', text1: 'Error loading deck' }) }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{
          fontFamily: 'Geist-SemiBold', fontSize: 28, color: c.text,
          letterSpacing: -0.5, marginBottom: 4,
        }}>
          Library
        </Text>
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
          marginBottom: 28,
        }}>
          Join a deck or browse your collection
        </Text>

        {/* Code Entry */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
        }}>
          Join with code
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Enter deck code"
            placeholderTextColor={c.placeholder}
            autoCapitalize="characters"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={handleCodeSubmit}
            style={{
              flex: 1, fontFamily: 'Geist-Medium', fontSize: 15,
              color: c.text, letterSpacing: 1,
              borderWidth: 1, borderColor: focused ? c.borderFocus : c.border,
              borderRadius: 10, paddingHorizontal: 14, height: 46,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
          />
          <Pressable
            onPress={handleCodeSubmit}
            disabled={loading || !code.trim()}
            style={({ pressed }) => ({
              width: 46, height: 46, borderRadius: 10,
              backgroundColor: c.accent,
              alignItems: 'center', justifyContent: 'center',
              opacity: loading || !code.trim() ? 0.3 : pressed ? 0.8 : 1,
            })}
          >
            {loading
              ? <ActivityIndicator color={c.accentText} size="small" />
              : <ArrowRight size={18} color={c.accentText} />
            }
          </Pressable>
        </View>
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted,
          marginBottom: 32,
        }}>
          Get a code from your teacher to join their deck
        </Text>

        {/* Collection */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12,
        }}>
          Your Collection
        </Text>

        {decks.length === 0 ? (
          <View style={{
            flex: 1, alignItems: 'center', justifyContent: 'center',
            paddingVertical: 56,
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Layers size={28} color={c.textMuted} />
            </View>
            <Text style={{
              fontFamily: 'Geist-SemiBold', fontSize: 16, color: c.text,
              marginBottom: 4,
            }}>
              No decks yet
            </Text>
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
              textAlign: 'center', lineHeight: 20, maxWidth: 260,
            }}>
              Enter a deck code above to get started
            </Text>
          </View>
        ) : (
          <View style={{
            borderRadius: 14, overflow: 'hidden',
            borderWidth: 1, borderColor: c.border,
          }}>
            {decks.map((deck, i) => (
              <Pressable
                key={deck.id}
                onPress={() => router.push(`/(app)/(decks)/${deck.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 14,
                  backgroundColor: pressed ? c.surface : 'transparent',
                  borderBottomWidth: i < decks.length - 1 ? 1 : 0,
                  borderBottomColor: c.border,
                })}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
                  marginRight: 14,
                }}>
                  <BookOpen size={18} color={c.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>
                    {deck.title}
                  </Text>
                  <Text style={{
                    fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted,
                    marginTop: 2,
                  }}>
                    {deck.card_count} cards · {deck.source_language.toUpperCase()} → {deck.target_language.toUpperCase()}
                  </Text>
                </View>
                <ChevronRight size={16} color={c.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
