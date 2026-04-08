import { useLocalSearchParams } from 'expo-router'
import DeckDetailScreen from '@src/components/DeckDetail'

export default function HomeDeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <DeckDetailScreen deckId={id!} />
}
