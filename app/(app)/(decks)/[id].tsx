import { useLocalSearchParams } from 'expo-router'
import DeckDetailScreen from '@src/components/DeckDetail'

export default function DecksDeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <DeckDetailScreen deckId={id!} />
}
