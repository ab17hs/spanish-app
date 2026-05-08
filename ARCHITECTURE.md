# Architecture — Personal Spanish Mastery Platform

## 1. System Overview

A single-page Next.js (App Router) application backed by Supabase (Postgres + Auth + Storage), deployed on Vercel. Multi-user-ready schema with row-level security but built for one user initially. Server Components for data-heavy reads, Server Actions for mutations, edge-friendly route handlers for AI calls.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (PWA)                                                  │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐              │
│  │ Flashcards   │  │ Reading/   │  │ Exam        │              │
│  │ + SRS        │  │ Story/     │  │ (Listen,    │              │
│  │              │  │ Grammar    │  │ Translate)  │              │
│  └──────┬───────┘  └─────┬──────┘  └──────┬──────┘              │
│         │                │                │                     │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │           Service Worker (offline cards)       │              │
│  └────────────────────┬─────────────────────────────┘            │
└────────────────────────┼────────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────────┐
│ Next.js (Vercel)       │                                        │
│  ┌─────────────────────┴───────────────────────┐                │
│  │ Server Components / Server Actions / Routes │                │
│  └──┬──────────────┬──────────────┬────────────┘                │
│     │              │              │                             │
│  ┌──▼──────┐  ┌────▼─────┐  ┌─────▼───────┐                     │
│  │ Supabase│  │ Anthropic│  │ Web Speech  │                     │
│  │ JS SDK  │  │ Claude   │  │ (browser)   │                     │
│  └──┬──────┘  └──────────┘  └─────────────┘                     │
└─────┼───────────────────────────────────────────────────────────┘
      │
┌─────▼──────────────────────────────────────────────────────────┐
│ Supabase (managed)                                             │
│  - Postgres (data + RLS)                                       │
│  - Auth (magic link)                                           │
│  - Storage (uploaded .docx archives, exported JSON)            │
│  - Daily backups (managed)                                     │
└────────────────────────────────────────────────────────────────┘
```

## 2. Module Boundaries

- **`lib/supabase/`** — server + browser clients, typed query helpers.
- **`lib/srs/`** — pure functions for the spaced-repetition scheduler.
- **`lib/parser/`** — `.docx` parsing (mammoth + heuristics).
- **`lib/ai/`** — Anthropic SDK wrapper, prompt templates, structured output schemas.
- **`lib/utils/`** — fuzzy match, accent folding, date helpers, level mapping.
- **`app/(auth)/`** — login, magic-link callback (unauthenticated routes).
- **`app/(app)/`** — protected app surface, gated by middleware.
- **`app/api/`** — long-running or external-API routes (import, exam grading, AI generation, export).
- **`components/`** — UI primitives (`ui/`), feature-specific composites grouped by domain.

## 3. Data Flow

**Read path:** Server Component → Supabase (RLS-scoped) → typed object → React. No client-side fetching for initial render. Mutations via Server Actions revalidate affected paths.

**SRS session:** `GET /study` builds a session server-side: fetch cards where `srs_state.due_at <= now()` AND filter predicates match, ordered by overdue weight. Card-level interactions are client-side; session results submit in one batch on completion (resilient to refresh).

**Import:** User uploads `.docx` → server route parses with `mammoth` → returns structured candidates as JSON → client review screen → on confirm, upsert into `vocab_entries` / `grammar_rules` keyed on `(user_id, lemma, pos)`.

**AI generation:** Reading/story routes hash `(topics, grammar_focus, seed)` to a cache key in `ai_cache` table. On hit, return cached. On miss, call Claude with structured-output schema, store, return.

**Exam grading:** Client submits answers → server route calls Claude with rubric + answers → Claude returns structured JSON `{section_scores, cefr_estimate, feedback[]}` → store in `exam_attempts`, update `users.estimated_level`.

## 4. AI Usage Patterns

All Claude calls go through `lib/ai/claude.ts` which:
- enforces structured output via `tool_use` schemas (no free-form parsing)
- caches by content hash where deterministic
- bounds token usage with hard limits per route
- logs token consumption per user for personal cost monitoring

Models:
- `claude-sonnet-4-6` for exam grading (reasoning quality matters)
- `claude-haiku-4-5` for reading passages and stories (cheaper, fast)

## 5. PWA Strategy

- Service worker caches the app shell + last-fetched flashcard session for offline review.
- IndexedDB queue holds offline grade events; flushes to Supabase on reconnect.
- Manifest configured for standalone display, theme-color matched to design tokens.
- Push notifications **not** wired in v1 (per requirements: in-app reminders only).

## 6. Design System

**Color tokens** (defined in `app/globals.css` as HSL CSS variables; Tailwind theme reads them):

```
--background: 38 44% 97%        (warm off-white)
--foreground: 222 32% 12%       (deep slate)
--card: 0 0% 100%               (white)
--muted: 220 14% 96%            (cool gray surface)
--muted-foreground: 220 9% 46%
--border: 220 13% 91%
--primary: 14 95% 58%           (terracotta orange — Spanish heritage warmth)
--primary-foreground: 38 44% 97%
--accent: 198 71% 48%           (azure — complementary)
--success: 142 65% 42%          (verdant green)
--warning: 38 92% 50%
--destructive: 0 72% 51%
--ring: 14 95% 58%

Streak gradient: from #F97316 (orange-500) to #DC2626 (red-600)
Level badge gradient: from #06B6D4 (cyan-500) to #6366F1 (indigo-500)
```

**Typography:** Inter Variable (UI) + Lora (passages, stories — adds warmth without going dark-academia).

**Spacing scale:** Tailwind default (4-pt grid).

**Radius:** `--radius: 0.75rem` baseline, cards `1rem`, pills `999px`.

**Motion:** Framer Motion with these defaults:
- card flip: `{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }` (custom easeOutQuint)
- page transitions: 200ms fade + 8px translate-y
- streak flame: gentle 2s flicker on hover

**Gamification surfaces:**
- streak flame (top bar) — flat icon, color shifts cyan → orange as count grows
- level badge with CEFR letter + sub-progress ring
- topic completion rings (Apple-Watch-style, 3 nested rings: vocab / grammar / reading)
- subtle confetti burst on session completion (once/day cap)

## 7. Database Conventions

- Every user-owned table has `user_id uuid not null references auth.users(id) on delete cascade`.
- RLS enabled everywhere; policy template: `user_id = auth.uid()`.
- Timestamps in UTC (`timestamptz`); user-local rollovers computed from `users.timezone`.
- Soft deletes via `deleted_at timestamptz` where reversibility matters (vocab/grammar). Hard deletes for ephemeral logs.
- Indexes optimized for: due-card lookup, weakness queries, topic filters, exam history.

## 8. Security

- Magic-link auth only; sessions stored in HTTP-only cookies (Supabase Auth's default).
- Service-role key **only** on the server, never shipped to the client.
- Anthropic API key stored as `ANTHROPIC_API_KEY` env var; never reaches the client.
- RLS as primary access control; routes additionally check `user.id` for defense in depth.
- CSP header restricting script sources; no inline scripts.

## 9. Performance Targets

- Time-to-interactive on /dashboard: < 1.2s on broadband.
- Flashcard flip: < 16ms paint (60fps).
- Session start: < 400ms for 50-card session build.
- Exam grading round-trip: < 12s (acceptable for high-stakes assessment).

## 10. Build Milestones

See task list. Order: scaffold → schema → auth → import → admin → flashcards → progress/dashboard → grammar → reading/story → exam → streaks → backup/PWA → docs.
