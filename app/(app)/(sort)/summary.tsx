import { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useSortStore } from '@src/stores/useSortStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { isRTL } from '@src/types'
import { ChevronDown, ChevronRight } from 'lucide-react-native'

export default function SummaryScreen() {
  const router = useRouter()
  const draft = useSortStore(s => s.draft)
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const c = useThemeColors()

  const [knownOpen, setKnownOpen] = useState(false)
  const [unknownOpen, setUnknownOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [deckTitle, setDeckTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!draft) router.replace('/(app)/(sort)')
  }, [draft, router])

  if (!draft) return null

  const knownCount = draft.knownTerms.length
  const unknownCount = draft.unknownTerms.length
  const rtl = isRTL(draft.lang)

  const defaultTitle = `Unknown from ${draft.title || draft.textPreview.slice(0, 40)}…`

  const openPrompt = () => {
    setDeckTitle(defaultTitle)
    setPromptOpen(true)
  }

  const handleCreateDeck = async () => {
    if (!session) return
    const title = deckTitle.trim() || defaultTitle
    setSaving(true)
    try {
      await useSortStore.getState().finishAndPersist(session.user.id)
      const sourceLang = (profile as { source_language?: string } | null)?.source_language ?? 'en'
      const { deckId } = await useSortStore
        .getState()
        .createDeckFromUnknown(session.user.id, title, sourceLang)
      Toast.show({
        type: 'success',
        text1: 'Deck created',
        text2: `${unknownCount} cards`,
      })
      useSortStore.getState().clear()
      setPromptOpen(false)
      router.replace(`/(app)/(decks)/${deckId}`)
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSortAnother = () => {
    useSortStore.getState().clear()
    router.replace('/(app)/(sort)')
  }

  const renderTermList = (terms: typeof draft.knownTerms) => (
    <View style={{
      borderTopWidth: 1, borderTopColor: c.border,
      paddingHorizontal: 16, paddingVertical: 8,
    }}>
      {terms.map((t, i) => (
        <Text
          key={`${t.term}-${i}`}
          style={{
            fontFamily: 'Geist-Regular',
            fontSize: 14,
            color: c.text,
            paddingVertical: 4,
            textAlign: rtl ? 'right' : 'left',
            writingDirection: rtl ? 'rtl' : 'ltr',
          }}
        >
          {t.term}
        </Text>
      ))}
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
      >
        <Text style={{
          fontFamily: 'Geist-SemiBold', fontSize: 26, color: c.text,
          letterSpacing: -0.4, marginBottom: 6,
        }}>
          Done.
        </Text>
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 15, color: c.textSecondary,
          marginBottom: 4,
        }}>
          {knownCount} known · {unknownCount} unknown
        </Text>
        {draft.alreadySeenCount > 0 ? (
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted,
            marginBottom: 28,
          }}>
            {draft.alreadySeenCount} already in your DB
          </Text>
        ) : <View style={{ height: 24 }} />}

        {/* Accordions */}
        <View style={{
          borderWidth: 1, borderColor: c.border, borderRadius: 12,
          marginBottom: 12, overflow: 'hidden',
        }}>
          <Pressable
            onPress={() => setKnownOpen(o => !o)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14,
              backgroundColor: pressed ? c.surface : 'transparent',
            })}
          >
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>
              Known terms ({knownCount})
            </Text>
            {knownOpen
              ? <ChevronDown size={16} color={c.textMuted} />
              : <ChevronRight size={16} color={c.textMuted} />
            }
          </Pressable>
          {knownOpen && knownCount > 0 ? renderTermList(draft.knownTerms) : null}
        </View>

        <View style={{
          borderWidth: 1, borderColor: c.border, borderRadius: 12,
          marginBottom: 32, overflow: 'hidden',
        }}>
          <Pressable
            onPress={() => setUnknownOpen(o => !o)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14,
              backgroundColor: pressed ? c.surface : 'transparent',
            })}
          >
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>
              Unknown terms ({unknownCount})
            </Text>
            {unknownOpen
              ? <ChevronDown size={16} color={c.textMuted} />
              : <ChevronRight size={16} color={c.textMuted} />
            }
          </Pressable>
          {unknownOpen && unknownCount > 0 ? renderTermList(draft.unknownTerms) : null}
        </View>

        {/* Primary CTA */}
        <Pressable
          onPress={openPrompt}
          disabled={unknownCount === 0 || saving}
          style={({ pressed }) => ({
            backgroundColor: c.accent, borderRadius: 12,
            paddingVertical: 16, alignItems: 'center',
            opacity: unknownCount === 0 || saving ? 0.4 : pressed ? 0.85 : 1,
            marginBottom: 12,
          })}
        >
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 16, color: c.accentText }}>
            Create deck from unknown
          </Text>
        </Pressable>

        {/* Secondary CTA */}
        <Pressable
          onPress={handleSortAnother}
          style={({ pressed }) => ({
            borderWidth: 1, borderColor: c.border, borderRadius: 12,
            paddingVertical: 14, alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.textSecondary }}>
            Sort another text
          </Text>
        </Pressable>
      </ScrollView>

      {/* Deck title prompt modal */}
      <Modal
        visible={promptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setPromptOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => !saving && setPromptOpen(false)}
        >
          <Pressable
            onPress={() => { /* swallow */ }}
            style={{
              width: '88%', maxWidth: 420,
              backgroundColor: c.bg, borderRadius: 16,
              padding: 20,
              borderWidth: 1, borderColor: c.border,
            }}
          >
            <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text, marginBottom: 6 }}>
              Name your deck
            </Text>
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginBottom: 16 }}>
              {unknownCount} unknown terms will become cards.
            </Text>
            <TextInput
              value={deckTitle}
              onChangeText={setDeckTitle}
              placeholder="Deck title"
              placeholderTextColor={c.placeholder}
              autoFocus
              style={{
                fontFamily: 'Geist-Regular', fontSize: 15, color: c.text,
                borderWidth: 1, borderColor: c.border, borderRadius: 10,
                paddingHorizontal: 14, height: 46,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as Record<string, string> : {}),
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable
                onPress={() => !saving && setPromptOpen(false)}
                disabled={saving}
                style={({ pressed }) => ({
                  flex: 1,
                  borderWidth: 1, borderColor: c.border, borderRadius: 10,
                  paddingVertical: 12, alignItems: 'center',
                  opacity: saving ? 0.4 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCreateDeck}
                disabled={saving}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: c.accent, borderRadius: 10,
                  paddingVertical: 12, alignItems: 'center',
                  opacity: saving ? 0.6 : pressed ? 0.85 : 1,
                })}
              >
                {saving ? (
                  <ActivityIndicator color={c.accentText} size="small" />
                ) : (
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.accentText }}>
                    Create
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
