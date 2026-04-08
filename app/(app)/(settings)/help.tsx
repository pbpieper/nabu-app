import { useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react-native'

interface FAQ {
  q: string
  a: string
}

const FAQS: FAQ[] = [
  {
    q: 'How does spaced repetition work?',
    a: 'Nabu uses a spaced repetition algorithm that schedules cards based on how well you know them. Cards you get right are shown less frequently, while cards you struggle with appear more often. This optimizes your study time by focusing on what you need to practice most.',
  },
  {
    q: 'How do I import a deck?',
    a: 'Go to the Decks tab and enter a share code in the input field at the top. Share codes are provided by deck creators and look like "ARABIC1". Once entered, the deck and all its cards will be added to your collection.',
  },
  {
    q: 'What do the card statuses mean?',
    a: 'New: Cards you haven\'t seen yet. Learning: Cards you\'ve seen but haven\'t consistently answered correctly. Review: Cards you know well that are scheduled for periodic review. Mastered: Cards you\'ve reviewed correctly many times and have long intervals between reviews.',
  },
  {
    q: 'Can I study offline?',
    a: 'Yes. Nabu works offline after your initial sync. Your progress will be saved locally and synced to the cloud when you reconnect.',
  },
  {
    q: 'How do I share a deck?',
    a: 'Open any deck from your collection and tap the share code. It will be copied to your clipboard. Share this code with anyone who has Nabu installed.',
  },
  {
    q: 'What is "Practice All"?',
    a: 'When you\'ve reviewed all due cards, Nabu shows an "All caught up" screen. Tapping "Practice All Cards" lets you review every card in the deck regardless of their schedule — great for exam prep.',
  },
]

function FAQItem({ faq, c }: { faq: FAQ; c: ReturnType<typeof useThemeColors> }) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronUp : ChevronDown

  return (
    <Pressable
      onPress={() => setOpen(!open)}
      style={{
        borderBottomWidth: 1, borderBottomColor: c.border,
        paddingVertical: 16, paddingHorizontal: 20,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 15, color: c.text,
          flex: 1, lineHeight: 21,
        }}>
          {faq.q}
        </Text>
        <Chevron size={16} color={c.textMuted} style={{ marginLeft: 12 }} />
      </View>
      {open && (
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary,
          lineHeight: 21, marginTop: 10,
        }}>
          {faq.a}
        </Text>
      )}
    </Pressable>
  )
}

export default function HelpScreen() {
  const router = useRouter()
  const c = useThemeColors()

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(settings)')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <Pressable onPress={goBack} style={{ padding: 8 }}>
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <Text style={{
          fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text,
          flex: 1, textAlign: 'center', marginRight: 30,
        }}>
          Help
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
          paddingHorizontal: 20, marginBottom: 8, marginTop: 8,
        }}>
          Frequently asked questions
        </Text>

        <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
          {FAQS.map((faq, i) => (
            <FAQItem key={i} faq={faq} c={c} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
