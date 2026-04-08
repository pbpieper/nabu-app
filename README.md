# Nabu

Flashcard-based language learning app. Built with React Native (Expo) for web, iOS, and Android.

Nabu uses spaced repetition (SRS) to help you learn vocabulary in any language. Create decks, share them with a code, and study with progressive card reveals.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Expo CLI (bundled with the project)
- A Supabase project (credentials go in `.env`)

### Install

```bash
cd nabu-app
pnpm install
```

### Environment

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Run

```bash
pnpm start          # Start Expo dev server
pnpm run web        # Open in browser
pnpm run ios        # Open in iOS Simulator
pnpm run android    # Open on Android
```

To clear the Metro cache (useful after config changes):

```bash
npx expo start --clear
```

## How It Works

### Decks and Cards

A **deck** is a collection of flashcards for a specific language pair (e.g. English to Arabic). Each deck has a unique share code like `ARABIC1` that anyone can use to load it.

Each **card** contains:
- The word in the target language
- Its translation
- Part of speech
- An example sentence
- An explanation of usage or grammar

### Studying

When you start a study session, Nabu builds a queue from your cards:
1. Cards that are due for review (oldest first)
2. Cards you are currently learning
3. New cards you have not seen yet

You see the word, tap to reveal the translation, then mark it as correct or incorrect.

### Spaced Repetition (SRS)

Nabu tracks your progress on every card using a spaced repetition algorithm:

- **New cards** start in the learning phase
- **Correct in learning**: after 2 correct answers in a row, the card graduates to review with a 1-day interval
- **Correct in review**: the interval doubles each time (1 day, 2 days, 4 days, etc., up to 180 days)
- **Mastered**: cards with an interval of 32+ days
- **Incorrect at any point**: the card resets to learning and you start again

This means you spend more time on cards you struggle with and less time on cards you already know.

### Sharing

Every deck has a share code. To study someone else's deck, go to the Decks tab, enter their code, and start studying. Your progress is saved separately from theirs.

## Project Structure

```
nabu-app/
  app/                  Expo Router screens (file-based routing)
    (auth)/             Sign in, sign up
    (app)/              Authenticated app
      (home)/           Deck list, quick start
      (study)/          Flashcard study session
      (decks)/          Browse and add decks
      (settings)/       Theme, account, sign out
  src/
    types/              TypeScript type definitions
    lib/                SRS algorithm, utilities
    data/               Demo deck data
    stores/             Zustand state management
    services/           Supabase client and API
    components/         Reusable UI components
    hooks/              Custom React hooks
    theme/              Colors, icon mappings
  supabase/
    migrations/         Database schema
  assets/
    fonts/              Geist font files
    images/             App icon, splash, brand logo
```

## Tech Stack

- **React Native** via Expo SDK 54
- **Expo Router** for file-based navigation
- **Supabase** for auth, database, and row-level security
- **Zustand** for state management
- **NativeWind** (Tailwind CSS for React Native)
- **Geist** font family
- **Feather** icons via @expo/vector-icons
- **pnpm** package manager

## Database

Nabu shares a Supabase project with Skit Trainer. The Nabu-specific tables are:

| Table | Purpose |
|-------|---------|
| `decks` | Flashcard decks with share codes |
| `cards` | Individual flashcards per deck |
| `card_progress` | Per-user SRS progress on each card |
| `review_sessions` | Session logs (cards reviewed, accuracy) |
| `profiles` | User profiles (shared with Skit Trainer) |

Row-level security is enabled on all tables. Users can only read/write their own progress. Public decks are readable by everyone.

### Pushing Schema Changes

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or apply a migration file directly:

```bash
supabase db query --linked -f supabase/migrations/002_reconcile_schema.sql
```

## Supported Languages

Arabic, German, Spanish, French, Italian, Japanese, Korean, Mandarin, Portuguese, Russian, Hindi, Turkish, Dutch, Swedish, Polish, Hebrew.

RTL layout is supported for Arabic and Hebrew.
