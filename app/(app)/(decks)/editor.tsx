import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import Toast from 'react-native-toast-message'
import { useDecksStore, type NewCard } from '@src/stores/useDecksStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { ArrowLeft, Plus, Trash2, Copy, Upload, X } from 'lucide-react-native'

/** Parse bulk text: tab-separated (word\ttranslation) or single column (word per line). */
function parseBulkText(raw: string): { word: string; translation: string }[] {
  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  return lines.map(line => {
    // Tab-separated
    const tabParts = line.split('\t')
    if (tabParts.length >= 2) {
      return { word: tabParts[0].trim(), translation: tabParts.slice(1).join(' ').trim() }
    }
    // Semicolon-separated
    const semiParts = line.split(';')
    if (semiParts.length >= 2) {
      return { word: semiParts[0].trim(), translation: semiParts.slice(1).join(' ').trim() }
    }
    // Single word
    return { word: line, translation: '' }
  }).filter(item => item.word.length > 0)
}

export default function CardEditorScreen() {
  const router = useRouter()
  const { deckId } = useLocalSearchParams<{ deckId: string }>()
  const session = useAuthStore(s => s.session)
  const currentDeck = useDecksStore(s => s.currentDeck)
  const currentCards = useDecksStore(s => s.currentCards)
  const loadDeckWithCards = useDecksStore(s => s.loadDeckWithCards)
  const addCards = useDecksStore(s => s.addCards)
  const deleteCard = useDecksStore(s => s.deleteCard)
  const c = useThemeColors()

  // Single card form
  const [word, setWord] = useState('')
  const [translation, setTranslation] = useState('')
  const [sentence, setSentence] = useState('')
  const [explanation, setExplanation] = useState('')
  const [addingCard, setAddingCard] = useState(false)

  // Bulk import
  const [bulkVisible, setBulkVisible] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkPreview, setBulkPreview] = useState<{ word: string; translation: string }[]>([])
  const [importing, setImporting] = useState(false)

  // Focus states
  const [wordFocused, setWordFocused] = useState(false)
  const [transFocused, setTransFocused] = useState(false)
  const [sentFocused, setSentFocused] = useState(false)
  const [explFocused, setExplFocused] = useState(false)
  const [bulkFocused, setBulkFocused] = useState(false)

  const userId = session?.user?.id

  useEffect(() => {
    if (deckId && userId) loadDeckWithCards(deckId, userId)
  }, [deckId, userId])

  const deck = currentDeck?.id === deckId ? currentDeck : null

  const handleCopyCode = async () => {
    if (!deck) return
    await Clipboard.setStringAsync(deck.share_code)
    Toast.show({ type: 'success', text1: 'Code copied', text2: deck.share_code })
  }

  const handleAddCard = async () => {
    if (!word.trim() || !deckId) return
    setAddingCard(true)
    try {
      const newCard: NewCard = {
        word: word.trim(),
        translation: translation.trim(),
        sort_order: currentCards.length,
        example_sentence: sentence.trim() || undefined,
        explanation: explanation.trim() || undefined,
      }
      await addCards(deckId, [newCard])
      setWord('')
      setTranslation('')
      setSentence('')
      setExplanation('')
      Toast.show({ type: 'success', text1: 'Card added' })
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Failed to add card',
        text2: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setAddingCard(false)
    }
  }

  const handleDeleteCard = useCallback(async (cardId: string) => {
    if (!deckId) return
    const doDelete = async () => {
      try {
        await deleteCard(cardId, deckId)
        Toast.show({ type: 'success', text1: 'Card deleted' })
      } catch (err) {
        Toast.show({
          type: 'error',
          text1: 'Failed to delete card',
          text2: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    if (Platform.OS === 'web') {
      doDelete()
    } else {
      Alert.alert('Delete Card', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ])
    }
  }, [deckId, deleteCard])

  // Bulk import
  const handleBulkPreview = () => {
    const parsed = parseBulkText(bulkText)
    setBulkPreview(parsed)
  }

  const handleBulkImport = async () => {
    if (bulkPreview.length === 0 || !deckId) return
    setImporting(true)
    try {
      const baseOrder = currentCards.length
      const newCards: NewCard[] = bulkPreview.map((item, i) => ({
        word: item.word,
        translation: item.translation,
        sort_order: baseOrder + i,
      }))
      await addCards(deckId, newCards)
      Toast.show({ type: 'success', text1: `Imported ${newCards.length} cards` })
      setBulkVisible(false)
      setBulkText('')
      setBulkPreview([])
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Import failed',
        text2: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setImporting(false)
    }
  }

  const inputStyle = (focused: boolean) => ({
    fontFamily: 'Geist-Regular' as const,
    fontSize: 15,
    color: c.text,
    borderWidth: 1,
    borderColor: focused ? c.borderFocus : c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as Record<string, string> : {}),
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: c.border,
      }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(decks)')}
          style={{ padding: 8 }}
        >
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text }} numberOfLines={1}>
            {deck?.title ?? 'Card Editor'}
          </Text>
          {deck && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Pressable onPress={handleCopyCode} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted, letterSpacing: 0.8 }}>
                  {deck.share_code}
                </Text>
                <Copy size={10} color={c.textMuted} />
              </Pressable>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted }}>
                · {currentCards.length} card{currentCards.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => setBulkVisible(true)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 12, paddingVertical: 8,
            backgroundColor: c.surface, borderRadius: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Upload size={14} color={c.textSecondary} />
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.textSecondary }}>
            Import
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Add Card Form */}
          <Text style={{
            fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
            letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
          }}>
            Add Card
          </Text>
          <View style={{
            borderWidth: 1, borderColor: c.border, borderRadius: 14,
            padding: 16, marginBottom: 24,
          }}>
            <TextInput
              value={word}
              onChangeText={setWord}
              placeholder="Word or phrase *"
              placeholderTextColor={c.placeholder}
              onFocus={() => setWordFocused(true)}
              onBlur={() => setWordFocused(false)}
              style={inputStyle(wordFocused)}
            />
            <TextInput
              value={translation}
              onChangeText={setTranslation}
              placeholder="Translation"
              placeholderTextColor={c.placeholder}
              onFocus={() => setTransFocused(true)}
              onBlur={() => setTransFocused(false)}
              style={{ ...inputStyle(transFocused), marginTop: 10 }}
            />
            <TextInput
              value={sentence}
              onChangeText={setSentence}
              placeholder="Example sentence"
              placeholderTextColor={c.placeholder}
              onFocus={() => setSentFocused(true)}
              onBlur={() => setSentFocused(false)}
              style={{ ...inputStyle(sentFocused), marginTop: 10 }}
            />
            <TextInput
              value={explanation}
              onChangeText={setExplanation}
              placeholder="Explanation or notes"
              placeholderTextColor={c.placeholder}
              onFocus={() => setExplFocused(true)}
              onBlur={() => setExplFocused(false)}
              style={{ ...inputStyle(explFocused), marginTop: 10 }}
            />

            <Pressable
              onPress={handleAddCard}
              disabled={!word.trim() || addingCard}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: c.accent, borderRadius: 10,
                paddingVertical: 12, marginTop: 14,
                opacity: !word.trim() || addingCard ? 0.4 : pressed ? 0.85 : 1,
              })}
            >
              {addingCard ? (
                <ActivityIndicator color={c.accentText} size="small" />
              ) : (
                <>
                  <Plus size={16} color={c.accentText} />
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.accentText }}>
                    Add Card
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Existing Cards */}
          {currentCards.length > 0 && (
            <>
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12,
              }}>
                {currentCards.length} Card{currentCards.length !== 1 ? 's' : ''}
              </Text>
              <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
                {currentCards.map((card, i) => (
                  <View
                    key={card.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingLeft: 16, paddingVertical: 13,
                      borderBottomWidth: i < currentCards.length - 1 ? 1 : 0,
                      borderBottomColor: c.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>
                        {card.word}
                      </Text>
                      {card.translation ? (
                        <Text style={{
                          fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 2,
                        }}>
                          {card.translation}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => handleDeleteCard(card.id)}
                      style={({ pressed }) => ({
                        padding: 12, opacity: pressed ? 0.5 : 1,
                      })}
                    >
                      <Trash2 size={16} color={c.error} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}

          {currentCards.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted, textAlign: 'center' }}>
                No cards yet. Add cards above or use Import to add many at once.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bulk Import Modal */}
      <Modal
        visible={bulkVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBulkVisible(false)}
      >
        <Pressable
          style={{ flex: 0.15, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setBulkVisible(false)}
        />
        <View style={{
          flex: 0.85, backgroundColor: c.bg,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
        }}>
          {/* Modal Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: c.border,
          }}>
            <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text }}>
              Bulk Import
            </Text>
            <Pressable onPress={() => setBulkVisible(false)} style={{ padding: 4 }}>
              <X size={20} color={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted,
              lineHeight: 18, marginBottom: 12,
            }}>
              Paste words below. Supports:{'\n'}
              - One word per line{'\n'}
              - Tab-separated: word{'\t'}translation{'\n'}
              - Semicolon-separated: word; translation
            </Text>

            <TextInput
              value={bulkText}
              onChangeText={t => { setBulkText(t); setBulkPreview([]) }}
              placeholder={'hola\thello\nadiós\tgoodbye\ngracias'}
              placeholderTextColor={c.placeholder}
              multiline
              onFocus={() => setBulkFocused(true)}
              onBlur={() => setBulkFocused(false)}
              style={{
                fontFamily: 'Geist-Regular', fontSize: 14, color: c.text,
                borderWidth: 1, borderColor: bulkFocused ? c.borderFocus : c.border,
                borderRadius: 10, padding: 14, minHeight: 140,
                textAlignVertical: 'top',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as Record<string, string> : {}),
              }}
            />

            {/* Preview button */}
            <Pressable
              onPress={handleBulkPreview}
              disabled={!bulkText.trim()}
              style={({ pressed }) => ({
                alignItems: 'center', paddingVertical: 12, marginTop: 12,
                borderWidth: 1, borderColor: c.border, borderRadius: 10,
                opacity: !bulkText.trim() ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.text }}>
                Preview ({parseBulkText(bulkText).length} items)
              </Text>
            </Pressable>

            {/* Preview list */}
            {bulkPreview.length > 0 && (
              <View style={{
                marginTop: 16, borderWidth: 1, borderColor: c.border,
                borderRadius: 10, overflow: 'hidden',
              }}>
                {bulkPreview.slice(0, 50).map((item, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10,
                      borderBottomWidth: i < Math.min(bulkPreview.length, 50) - 1 ? 1 : 0,
                      borderBottomColor: c.border,
                    }}
                  >
                    <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.text, flex: 1 }}>
                      {item.word}
                    </Text>
                    <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted, flex: 1, textAlign: 'right' }}>
                      {item.translation || '—'}
                    </Text>
                  </View>
                ))}
                {bulkPreview.length > 50 && (
                  <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted }}>
                      +{bulkPreview.length - 50} more...
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Import button */}
            {bulkPreview.length > 0 && (
              <Pressable
                onPress={handleBulkImport}
                disabled={importing}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: c.accent, borderRadius: 10,
                  paddingVertical: 14, marginTop: 16,
                  opacity: importing ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                {importing ? (
                  <ActivityIndicator color={c.accentText} size="small" />
                ) : (
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>
                    Import {bulkPreview.length} Cards
                  </Text>
                )}
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
