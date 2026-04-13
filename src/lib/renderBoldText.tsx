/**
 * Parse **bold** markers in text and return an array of React Native Text elements.
 *
 * Only handles **double asterisk** bold markers — not full markdown.
 * Used to render example_sentence fields where the target word is wrapped in **.
 */
import React from 'react'
import { Text, type TextStyle } from 'react-native'

interface BoldTextProps {
  text: string
  style?: TextStyle
  boldStyle?: TextStyle
}

/**
 * Renders text with **bold** markers converted to bold <Text> spans.
 *
 * Example:
 *   renderBoldText({ text: "She **ran** to the store", style: { color: '#aaa' } })
 *   => <Text>She <Text style={{ fontWeight: 'bold' }}>ran</Text> to the store</Text>
 */
export function BoldText({ text, style, boldStyle }: BoldTextProps) {
  const parts = parseBoldSegments(text)

  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.bold ? (
          <Text
            key={i}
            style={[{ fontFamily: 'Geist-SemiBold' }, boldStyle]}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        ),
      )}
    </Text>
  )
}

interface Segment {
  text: string
  bold: boolean
}

/**
 * Split a string on **bold** markers into segments.
 * Handles edge cases: unmatched **, empty bold, nested (treated as literal).
 */
export function parseBoldSegments(input: string): Segment[] {
  const segments: Segment[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(input)) !== null) {
    // Text before this bold match
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), bold: false })
    }
    // The bold text
    segments.push({ text: match[1], bold: true })
    lastIndex = regex.lastIndex
  }

  // Trailing text after last match
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), bold: false })
  }

  // If no matches at all, return the whole string as-is
  if (segments.length === 0) {
    segments.push({ text: input, bold: false })
  }

  return segments
}
