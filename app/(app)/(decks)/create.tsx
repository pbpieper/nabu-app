import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { LANGUAGES } from '@src/types'
import { ArrowLeft, ChevronDown, Check } from 'lucide-react-native'

export default function CreateDeckScreen() {
  const router = useRouter()
  const session = useAuthStore(s => s.session)
  const createDeck = useDecksStore(s => s.createDeck)
  const c = useThemeColors()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('')
  const [saving, setSaving] = useState(false)
  const [pickerField, setPickerField] = useState<'source' | 'target' | null>(null)

  const [titleFocused, setTitleFocused] = useState(false)
  const [descFocused, setDescFocused] = useState(false)

  const sourceName = LANGUAGES.find(l => l.code === sourceLang)?.name ?? 'Select'
  const targetName = LANGUAGES.find(l => l.code === targetLang)?.name ?? 'Select'

  const canSubmit = title.trim().length > 0 && targetLang.length > 0 && !!session

  const handleSubmit = async () => {
    if (!canSubmit || !session) return
    setSaving(true)
    try {
      const deck = await createDeck(
        title.trim(),
        description.trim(),
        sourceLang,
        targetLang,
        session.user.id,
      )
      Toast.show({ type: 'success', text1: 'Deck created', text2: deck.share_code })
      router.replace(`/(app)/(decks)/editor?deckId=${deck.id}`)
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Failed to create deck',
        text2: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePickLanguage = (code: string) => {
    if (pickerField === 'source') setSourceLang(code)
    else if (pickerField === 'target') setTargetLang(code)
    setPickerField(null)
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
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(decks)')}
          style={{ padding: 8 }}
        >
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <Text style={{
          fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text,
          marginLeft: 4,
        }}>
          Create Deck
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 8,
        }}>
          Title *
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Spanish Vocabulary"
          placeholderTextColor={c.placeholder}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          style={inputStyle(titleFocused)}
        />

        {/* Description */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 24,
        }}>
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          placeholderTextColor={c.placeholder}
          multiline
          onFocus={() => setDescFocused(true)}
          onBlur={() => setDescFocused(false)}
          style={{
            ...inputStyle(descFocused),
            height: 80,
            paddingTop: 12,
            textAlignVertical: 'top',
          }}
        />

        {/* Source Language */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 24,
        }}>
          Source Language
        </Text>
        <Pressable
          onPress={() => setPickerField('source')}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderWidth: 1, borderColor: c.border, borderRadius: 10,
            paddingHorizontal: 14, height: 46,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Geist-Regular', fontSize: 15, color: c.text }}>
            {sourceName}
          </Text>
          <ChevronDown size={16} color={c.textMuted} />
        </Pressable>

        {/* Target Language */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 24,
        }}>
          Target Language *
        </Text>
        <Pressable
          onPress={() => setPickerField('target')}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderWidth: 1, borderColor: targetLang ? c.border : c.error + '44',
            borderRadius: 10, paddingHorizontal: 14, height: 46,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 15,
            color: targetLang ? c.text : c.placeholder,
          }}>
            {targetLang ? targetName : 'Select target language'}
          </Text>
          <ChevronDown size={16} color={c.textMuted} />
        </Pressable>

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || saving}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: c.accent, borderRadius: 12,
            paddingVertical: 16, marginTop: 36,
            opacity: !canSubmit || saving ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          {saving ? (
            <ActivityIndicator color={c.accentText} />
          ) : (
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 16, color: c.accentText }}>
              Create & Add Cards
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal
        visible={pickerField !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerField(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setPickerField(null)}
        />
        <View style={{
          backgroundColor: c.bg,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: 40, maxHeight: '60%',
        }}>
          <View style={{
            alignItems: 'center', paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: c.border,
          }}>
            <View style={{
              width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 10,
            }} />
            <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 16, color: c.text }}>
              {pickerField === 'source' ? 'Source Language' : 'Target Language'}
            </Text>
          </View>
          <FlatList
            data={LANGUAGES}
            keyExtractor={item => item.code}
            renderItem={({ item }) => {
              const selected = pickerField === 'source'
                ? item.code === sourceLang
                : item.code === targetLang
              return (
                <Pressable
                  onPress={() => handlePickLanguage(item.code)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 20, paddingVertical: 14,
                    backgroundColor: pressed ? c.surface : 'transparent',
                  })}
                >
                  <Text style={{
                    fontFamily: selected ? 'Geist-SemiBold' : 'Geist-Regular',
                    fontSize: 15, color: c.text,
                  }}>
                    {item.name}
                  </Text>
                  {selected && <Check size={18} color={c.accent} />}
                </Pressable>
              )
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  )
}
