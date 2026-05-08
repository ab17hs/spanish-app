# Spanish Mastery

A personal Spanish learning platform. Spaced-repetition flashcards, AI-generated readings and stories, CEFR exams graded by Claude, timezone-aware streaks, and offline study via service worker.

Built on Next.js 15 (App Router) + React 19 + Supabase (Postgres + Auth) + the Anthropic API. Designed for one user but multi-tenant-clean — every table is RLS-scoped to the calling user.

## What's in here

| Path | Purpose |
| --- | --- |
| **[SETUP.md](./SETUP.md)** | End-to-end install + deploy guide. Start here. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Design rationale: schema, SRS math, AI prompts, RLS model. |
| `app/` | Next.js routes, server actions, route handlers. |
| `lib/srs/` | Pure SRS scheduler (testable, no I/O). |
| `lib/streaks/` | Daily-goal + streak ticker, IANA-aware. |
| `lib/ai/` | Claude wrappers — reading, story, exam grading. |
| `lib/parser/` | `.docx` ingestion via mammoth + heuristics. |
| `supabase/migrations/` | SQL schema + seeds. |
| `public/` | PWA manifest, service worker, icons. |

## Highlights

**Spaced repetition** — six-stage interval ladder (`0, 1, 3, 7, 21, 60` days), demote on miss, accent + typo tolerance via Levenshtein. Pure function in `lib/srs/scheduler.ts`.

**AI content** — Claude generates topic-targeted readings and stories that bias toward your in-flight weak vocab. Output is JSON-schema-locked via `tool_use` so the parser never has to deal with markdown drift.

**Exam grading** — four sections (translation, conversation, grammar, listening) graded by Sonnet against a stable rubric, returns per-section scores + strengths/improvements + a CEFR estimate that updates `profile.estimated_level`.

**Streaks** — IANA-timezone-aware "today" boundary so a 23:55 review in Tokyo counts as today for the user and not "tomorrow UTC." One streak freeze per ISO week patches a single missed day.

**PWA** — manifest with shortcuts, service worker with stale-while-revalidate for the shell + network-first for HTML, an `/offline` fallback, and a cross-app offline banner.

**Backup** — `/api/export` returns a single JSON document containing every row owned by the user. Trigger from `/settings`.

## Quick start

```bash
git clone <repo> spanish-app
cd spanish-app
npm install
cp .env.example .env.local   # fill in Supabase + Anthropic keys
supabase link --project-ref <ref>
supabase db push
npm run dev
```

Then open http://localhost:3000 and sign in with a magic link. See [SETUP.md](./SETUP.md) for the full path including production deploy.

## Stack

- **Frontend**: Next.js 15 App Router, React 19 RC, TypeScript strict, Tailwind, shadcn-style primitives, lucide-react.
- **Backend**: Supabase (Postgres 15 + Auth + Storage), `@supabase/ssr` for the SSR-aware client.
- **AI**: `@anthropic-ai/sdk` with `tool_use`-forced JSON output.
- **Validation**: Zod everywhere user input crosses a trust boundary.
- **Tests**: SRS scheduler + streak ticker are pure functions and have unit tests; the rest is integration-tested by exercising the app.
