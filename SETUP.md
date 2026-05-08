# Spanish Mastery — Setup & Deployment Guide

This guide takes you from a fresh clone to a production-deployed app on Vercel + Supabase. Allow ~30 minutes the first time through.

> Prerequisites: Node 20+, a Supabase account, an Anthropic API key, and (for production) a Vercel account. Local dev needs the Supabase CLI installed (`brew install supabase/tap/supabase` or see the Supabase docs).

---

## 1. Clone and install

```bash
git clone <your-fork-or-source>.git spanish-app
cd spanish-app
npm install
```

Expect ~700MB in `node_modules`. The lockfile pins Next 15, React 19 RC, and the Supabase + Anthropic SDKs — don't substitute majors blindly.

## 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
2. Pick a region close to you. The free tier is fine for personal use.
3. Set a strong database password and store it in your password manager.
4. Once provisioned (~2 min), grab three things from **Project Settings → API**:
   - Project URL (`https://xxxx.supabase.co`)
   - `anon` public key
   - `service_role` secret key — never commit this anywhere

## 3. Apply the database schema

The full schema lives in `supabase/migrations/`. Two ways to apply it:

### Option A — Supabase CLI (recommended)

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies `0001_init.sql` (tables, types, RLS) and `0002_seed_grammar_categories.sql` (a starter list of grammar topics) in order.

### Option B — copy/paste

Open the Supabase SQL editor and paste the contents of each migration file in numeric order. Run them one at a time and watch for errors.

After migrations apply, verify in the Supabase dashboard:
- 14 tables under `public` (profiles, topics, vocab_entries, cards, srs_state, …)
- RLS is **enabled** on every table (lock icon next to the table name)

## 4. Configure auth

1. **Authentication → Providers**: enable **Email**. Disable everything else for personal use.
2. **Authentication → URL Configuration**: set **Site URL** to your production URL (or `http://localhost:3000` while developing). Add both URLs to **Redirect URLs** so magic-link emails work in dev and prod.
3. **Authentication → Email Templates**: optionally tweak the magic-link copy.

## 5. Generate TypeScript types from your schema

```bash
export SUPABASE_PROJECT_ID=<your-project-ref>
npm run db:types
```

This writes `types/database.ts`, which the Supabase client imports for end-to-end type safety. Re-run this any time you change the schema.

## 6. Set environment variables

Copy the template and fill in real values:

```bash
cp .env.example .env.local
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_PROJECT_ID=xxxx
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notes:
- `NEXT_PUBLIC_*` vars are inlined into the client bundle. Don't put secrets here.
- `SUPABASE_SERVICE_ROLE_KEY` is only used by server-side admin paths (e.g. seeding) — most server actions use the SSR client which respects RLS.
- Set `NEXT_PUBLIC_APP_URL` to your real origin in production (Vercel: `https://yourapp.vercel.app`). Magic-link redirects use this.

## 7. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Enter your email, click the magic link in the message Supabase sends, and you'll land on `/dashboard`.

First-run checklist:
- Visit `/admin/topics` and create at least one topic (e.g. "Travel").
- Drop a `.docx` file with vocab/grammar onto `/admin/import` to populate the library, or hand-add entries via `/admin/vocab` and `/admin/grammar`.
- Hit `/study` — if you have any cards due, the engine spins up.

## 8. (Optional) Anthropic API setup

The reading, story, and exam features call Claude. Without `ANTHROPIC_API_KEY`, those routes return `not_configured` and the UI shows a graceful error.

1. Create a key at [console.anthropic.com](https://console.anthropic.com).
2. Drop it into `.env.local` as `ANTHROPIC_API_KEY`.
3. The app uses two models:
   - `claude-haiku-4-5-20251001` for reading + story generation (fast, cheap)
   - `claude-sonnet-4-6` for exam grading (better at structured rubric output)

Roughly 1¢ per generated reading and ~5¢ per graded exam at current prices.

## 9. Deploy to Vercel

1. Push your repo to GitHub/GitLab.
2. In the Vercel dashboard: **Add New → Project**, import the repo.
3. **Environment Variables**: paste every key from your `.env.local`. Set scopes to "Production, Preview, Development" for each.
4. **Build & Output Settings**: leave defaults — Vercel auto-detects Next 15.
5. Hit **Deploy**.

After the first deploy:
- Update `NEXT_PUBLIC_APP_URL` to your Vercel URL and redeploy (Vercel → Deployments → ⋯ → Redeploy).
- Update Supabase **Site URL** and **Redirect URLs** to include the new Vercel URL.

## 10. Post-deploy smoke test

In production, run through:

1. Magic-link sign in works.
2. `/dashboard` loads with no console errors.
3. `/study` shows your queue.
4. Grade one card and verify the SRS state updates (check `srs_state` in Supabase).
5. End the session — confirm the streak banner appears on the done screen.
6. `/api/export` returns a JSON download.
7. Open Chrome DevTools → Application → Service Workers; verify `sw.js` is **activated**.
8. Toggle DevTools "Offline" and reload — the offline banner should appear and `/offline` should render.

## 11. Operations

### Backups
- **Code**: GitHub.
- **Database**: Supabase auto-backups daily on the free tier (7-day retention).
- **Personal export**: hit `/settings → Backup & export` periodically and stash the JSON somewhere safe.

### Updating the schema
1. Author a new file: `supabase/migrations/000N_description.sql`.
2. Apply locally: `supabase db push`.
3. Re-run `npm run db:types` to refresh `types/database.ts`.
4. Commit both files. Push, deploy.

### Cost watch
- Supabase free tier: 500MB DB, 1GB storage, 2GB egress. Personal use stays well under.
- Vercel hobby tier: 100GB-hours of serverless. Trivial for one user.
- Anthropic: pay-as-you-go. Set a usage cap in the console if you're nervous.

## 12. Troubleshooting

**"Invalid Refresh Token" loop on auth.**
Your Supabase Site URL doesn't match where the app is running. Update it in Supabase → Authentication → URL Configuration to match `NEXT_PUBLIC_APP_URL`.

**Magic-link emails never arrive.**
Check Supabase → Authentication → Logs. Default SMTP is rate-limited; for production, configure a real SMTP provider (Resend, Postmark, SendGrid) under Project Settings → Auth → SMTP.

**`db:types` fails with "permission denied".**
You haven't `supabase login`-ed, or `SUPABASE_PROJECT_ID` doesn't match a project you own.

**Server actions return `unauthorized`.**
The cookie isn't being forwarded. In dev, check that you're loading the app via `localhost:3000` and not `127.0.0.1:3000` — cookies are domain-scoped.

**"Module not found: '@/lib/streaks/update'"** or similar import paths.
The `@/` alias requires the `paths` config in `tsconfig.json` and `baseUrl: "."`. Don't change those.

**Service worker won't update in production.**
The SW caches itself. Either wait for the 24h heuristic or hit Settings → Application → Service Workers → **Update** in DevTools. The version constant at the top of `public/sw.js` (`CACHE = "spanish-mastery-vN"`) must be bumped on every change.

**Anthropic returns 429.**
Rate limited. The app retries once with backoff for non-streaming calls; if you keep hitting it, reduce concurrency in `lib/ai/content.ts` or upgrade your plan.

## 13. Where things live

```
app/
  (app)/         authenticated routes — dashboard, study, exam, settings, …
  (auth)/        login + callback routes
  api/           route handlers (import, export, ai endpoints)
components/
  ui/            shadcn-style primitives (Button, Card, …)
  layout/        Sidebar, TopBar, OfflineBanner, ServiceWorkerRegister
lib/
  supabase/      SSR + browser clients, middleware
  srs/           scheduler.ts (pure SRS math) + queue builder
  streaks/       update.ts (timezone-aware streak ticker)
  ai/            Claude wrappers for reading/story/exam
  parser/        .docx ingestion (mammoth + custom rules)
public/
  manifest.webmanifest, sw.js, icon-*.png, offline page assets
supabase/
  migrations/    SQL — apply with `supabase db push`
types/
  database.ts    auto-generated from your schema
ARCHITECTURE.md  long-form design notes
SETUP.md         this file
```

## 14. Going further

- **Custom domain**: Vercel project → Settings → Domains. Update Supabase Site URL afterward.
- **Two-factor on Supabase + Vercel**: do this. The data is yours; an attacker getting write access can wipe months of progress.
- **Cron**: if you want a daily reminder push, add a Vercel Cron function that hits a custom route to send a notification via your push provider of choice.
- **Mobile install**: visit the deployed site on mobile, then **Add to Home Screen**. The manifest's `shortcuts` array gives you long-press jump points to Study / Dashboard / Exam.

---

That's it. Personal-scale Spanish learning, AI-graded, with a streak that respects your timezone and a backup button you can actually trust.
