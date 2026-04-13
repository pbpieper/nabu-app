# Nabu — Canonical Source of Truth

**This repo (`pbpieper/nabu-app`) is the canonical source for Nabu.**

Any work on Nabu — features, migrations, content, UI — happens here. All other
repos or folders labeled "nabu*" are deprecated and retained only as historical
reference.

---

## Deployment topology

| Environment | Branch | Vercel project | Supabase project | URL |
|---|---|---|---|---|
| **Production** | `master` | `nabu-app` | `pdcrvpggskryptsdvnpe` | https://nabu-app-six.vercel.app |
| **Staging / Preview** | any feature branch | `nabu-app` (preview) | `ayjpicshcsaryamtlajl` | Auto-generated Vercel URL |
| **Local dev** | any | — | `ayjpicshcsaryamtlajl` (staging) | `expo start --web` |

Vercel environment variable scoping:
- **Production scope:** points at `pdcrvpggskryptsdvnpe`
- **Preview scope:** points at `ayjpicshcsaryamtlajl`
- **Local `.env`:** points at `ayjpicshcsaryamtlajl` (never commit production credentials to disk)

---

## Branching & deploy rules

1. **Never commit directly to `master`.** Open a PR from a feature branch, verify
   the Vercel preview deploy works end-to-end, then merge.
2. **Never run migrations directly on production.** Apply to staging first, test,
   then promote to prod via the Supabase SQL editor or CLI.
3. **Migrations are files in `supabase/migrations/` with sequential numeric
   prefixes (001, 002, 003, ...).** One migration per logical change. Never edit
   an already-applied migration — write a new one.
4. **Feature flags for schema changes that touch app reads.** New tables and
   columns are additive first. The app continues reading the old shape until a
   feature flag is flipped.

---

## Deprecated / archived

| Repo | Status | Data to preserve? |
|---|---|---|
| `pbpieper/nabu-flashcards` | Archive on GitHub, Vercel project deleted | `supabase/migration_v2.sql` anon policies harvested into nabu-app migration 004 |
| `pbpieper/nabu-cards` | Archive on GitHub, Vercel project deleted | `supabase/schema.sql` deck_subscriptions pattern harvested into migration 006 |
| Vercel `dist` (orphan, no git) | Delete | None |

Do not push to, clone, or modify the archived repos. If you need something from
them, open the GitHub archive, copy the specific file, and commit it to this
repo as a new file with a clear provenance comment.

---

## Working-folder separation

- `~/Code/nabu-app` — this canonical code repo
- `~/Nabu/Nabu/` — Patrick's planning/docs folder (prompts, strategy, competitive
  analysis, spreadsheets). **No code lives here.** Not a git repo.
- `/sessions/.../mnt/Nabu/` — Cowork workspace mirror of `~/Nabu/Nabu/`, used by
  Claude for reading/writing docs and artifacts. Same contents.

When Claude Code runs against the app, it operates in `~/Code/nabu-app`. When
strategy/planning docs are updated, they go in the Nabu planning folder.

---

## For future agents working on this repo

Read this file first. Then:
1. Check `supabase/migrations/` — current applied schema state
2. Check `N8N_STRATEGY.md` — how content pipelines relate to the app
3. Check `MIGRATIONS_LOG.md` (if present) — which migrations have been applied
   to which environments
4. Never assume — verify by querying the target Supabase project before editing
   schema
