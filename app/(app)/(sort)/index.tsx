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
import { useSortStore } from '@src/stores/useSortStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { LANGUAGES } from '@src/types'
import { ArrowLeft, ChevronDown, Check } from 'lucide-react-native'
import type { Lang } from '@src/lib/lexa'

// Languages with stopword sets in lexa.
const SUPPORTED_LANGS: readonly string[] = ['es', 'ar', 'en', 'fr', 'de', 'it', 'pt']

export default function SortPasteScreen() {
  const router = useRouter()
  const session = useAuthStore(s => s.session)
  const startSort = useSortStore(s => s.startSort)
  const loading = useSortStore(s => s.loading)
  const c = useThemeColors()

  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [lang, setLang] = useState<Lang>('es')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [textFocused, setTextFocused] = useState(false)
  const [titleFocused, setTitleFocused] = useState(false)

  const langName = LANGUAGES.find(l => l.code === lang)?.name ?? 'Select'
  const canSubmit = text.trim().length > 0 && !!lang && !!session && !loading

  const handleSubmit = async () => {
    if (!canSubmit || !session) return
    try {
      await startSort(text.trim(), lang, title.trim() || null, session.user.id)
      router.push('/(app)/(sort)/swipe')
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Failed to start sort',
        text2: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const availableLangs = LANGUAGES.filter(l => SUPPORTED_LANGS.includes(l.code))

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
        <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text, marginLeft: 4 }}>
          Sort terms
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
          marginBottom: 24,
        }}>
          Paste a text. Get a study list before you read.
        </Text>

        {/* Text paste */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
        }}>
          Text *
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Paste an article, chapter, or any passage…"
          placeholderTextColor={c.placeholder}
          multiline
          onFocus={() => setTextFocused(true)}
          onBlur={() => setTextFocused(false)}
          style={{
            fontFamily: 'Geist-Regular',
            fontSize: 15,
            color: c.text,
            borderWidth: 1,
            borderColor: textFocused ? c.borderFocus : c.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 12,
            minHeight: 200,
            textAlignVertical: 'top',
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as Record<string, string> : {}),
          }}
        />

        {/* Optional title */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 24,
        }}>
          Title
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Optional title"
          placeholderTextColor={c.placeholder}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          style={{
            fontFamily: 'Geist-Regular',
            fontSize: 15,
            color: c.text,
            borderWidth: 1,
            borderColor: titleFocused ? c.borderFocus : c.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            height: 46,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as Record<string, string> : {}),
          }}
        />

        {/* Language picker */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 24,
        }}>
          Language
        </Text>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderWidth: 1, borderColor: c.border, borderRadius: 10,
            paddingHorizontal: 14, height: 46,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Geist-Regular', fontSize: 15, color: c.text }}>
            {langName}
          </Text>
          <ChevronDown size={16} color={c.textMuted} />
        </Pressable>

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: c.accent, borderRadius: 12,
            paddingVertical: 16, marginTop: 36,
            opacity: !canSubmit ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color={c.accentText} />
          ) : (
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 16, color: c.accentText }}>
              Start sorting
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setPickerOpen(false)}
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
              Language
            </Text>
          </View>
          <FlatList
            data={availableLangs}
            keyExtractor={item => item.code}
            renderItem={({ item }) => {
              const selected = item.code === lang
              return (
                <Pressable
                  onPress={() => { setLang(item.code as Lang); setPickerOpen(false) }}
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
