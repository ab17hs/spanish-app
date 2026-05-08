-- ============================================================================
-- Spanish Mastery — Initial schema
-- ============================================================================
-- Multi-user-ready (every row has user_id). RLS enforced everywhere.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ----------------------------------------------------------------------------
-- profiles: extends auth.users with app-level data
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'UTC',
  daily_goal int not null default 20 check (daily_goal between 5 and 100),
  estimated_level text check (estimated_level in ('A1','A2','B1','B2','C1','C2')),
  estimated_level_sub numeric(3,1), -- e.g. 1.5 within B1 -> "B1.5"
  last_exam_at timestamptz,
  preferred_voice text default 'es-ES',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- topics: thematic groupings (Travel, Food, Work, etc.)
-- ----------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  color text, -- optional hex for topic chip
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- ----------------------------------------------------------------------------
-- vocab_entries: nouns / verbs / adjectives / adverbs / pronouns / phrases
-- ----------------------------------------------------------------------------
create type public.pos_t as enum (
  'verb','noun','adjective','adverb','pronoun','preposition',
  'conjunction','interjection','phrase','number','article'
);

create type public.gender_t as enum ('m','f','mf','n');
create type public.difficulty_t as enum ('easy','medium','hard');

create table public.vocab_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lemma text not null,                    -- "hablar", "casa"
  translation text not null,              -- "to speak", "house"
  pos pos_t not null,
  gender gender_t,                        -- nouns
  example_es text,
  example_en text,
  notes text,
  difficulty difficulty_t not null default 'medium',
  -- verb-specific (nullable for non-verbs)
  is_irregular boolean,
  conjugations jsonb,                     -- { present: { yo: "hablo", ... }, preterite: {...} }
  -- tagging
  tags text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lemma, pos)
);

-- linking table for vocab <-> topics (many-to-many)
create table public.vocab_topics (
  vocab_id uuid not null references public.vocab_entries(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (vocab_id, topic_id)
);

-- ----------------------------------------------------------------------------
-- grammar_rules: rule + explanation + examples + exercises seed
-- ----------------------------------------------------------------------------
create table public.grammar_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,                    -- "Ser vs Estar"
  slug text not null,
  category text not null,                 -- "verbs", "syntax", "agreement", etc.
  level text check (level in ('A1','A2','B1','B2','C1','C2')),
  explanation_md text not null,
  examples jsonb not null default '[]',   -- [{ es, en, gloss? }, ...]
  exercises jsonb not null default '[]',  -- [{ kind, prompt, answer, options? }, ...]
  difficulty difficulty_t not null default 'medium',
  tags text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- linking table grammar_rules <-> topics
create table public.grammar_topics (
  grammar_id uuid not null references public.grammar_rules(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (grammar_id, topic_id)
);

-- ----------------------------------------------------------------------------
-- flashcards: a unified learnable card. One row per (vocab_entry x direction)
-- and (grammar_rule for tap-to-reveal review). SRS state tracked per card.
-- ----------------------------------------------------------------------------
create type public.card_kind_t as enum ('vocab_es_en', 'vocab_en_es', 'grammar');

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind card_kind_t not null,
  vocab_id uuid references public.vocab_entries(id) on delete cascade,
  grammar_id uuid references public.grammar_rules(id) on delete cascade,
  -- exactly one of vocab_id / grammar_id must be set
  constraint flashcards_one_target check (
    (vocab_id is not null and grammar_id is null) or
    (vocab_id is null and grammar_id is not null)
  ),
  created_at timestamptz not null default now(),
  unique (user_id, kind, vocab_id, grammar_id)
);

-- ----------------------------------------------------------------------------
-- srs_state: per-card SRS scheduling
-- intervals (days): 0 (new) -> 1 -> 3 -> 7 -> 21 -> 60 -> 60 (capped)
-- on miss: reset interval_idx to 0, due_at = now()
-- ----------------------------------------------------------------------------
create table public.srs_state (
  card_id uuid primary key references public.flashcards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  interval_idx int not null default 0,
  due_at timestamptz not null default now(),
  last_seen_at timestamptz,
  hits int not null default 0,
  misses int not null default 0,
  consecutive_hits int not null default 0,
  total_reviews int not null default 0,
  -- weakness derived: any card with miss_rate > 0.4 OR consecutive_hits<2 after >=4 reviews
  is_weak boolean generated always as (
    total_reviews >= 4 and (misses::float / nullif(total_reviews,0)) > 0.4
  ) stored
);

-- ----------------------------------------------------------------------------
-- weakness_flags: manual user "flag for review"
-- ----------------------------------------------------------------------------
create table public.weakness_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, card_id)
);

-- ----------------------------------------------------------------------------
-- sessions + session_events: study log
-- ----------------------------------------------------------------------------
create type public.session_kind_t as enum ('study','review','grammar','reading','story');

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind session_kind_t not null default 'study',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cards_correct int not null default 0,
  cards_incorrect int not null default 0,
  duration_seconds int
);

create table public.session_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  is_correct boolean not null,
  user_answer text,
  expected_answer text,
  ms_to_answer int,
  occurred_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- streak_state: one row per user; updated daily
-- ----------------------------------------------------------------------------
create table public.streak_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_completed_date date,                 -- in user's local TZ
  freezes_used_iso_week int not null default 0,
  iso_week int,                             -- year*100 + week to track freeze allowance
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- exam_attempts: full exam history
-- ----------------------------------------------------------------------------
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- per-section
  translation_score numeric(5,2),
  conversation_score numeric(5,2),
  grammar_score numeric(5,2),
  listening_score numeric(5,2),
  total_score numeric(5,2),
  cefr_level text check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  cefr_sub numeric(3,1),
  feedback jsonb,                            -- structured per-section feedback
  questions jsonb,                           -- the actual questions asked (for re-render)
  answers jsonb                              -- the user's answers
);

-- ----------------------------------------------------------------------------
-- ai_cache: cache deterministic AI generations (reading passages, stories)
-- ----------------------------------------------------------------------------
create table public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,                   -- sha256 of (kind, topics_sorted, grammar_focus, seed)
  kind text not null,                        -- "reading" | "story"
  payload jsonb not null,
  tokens_used int,
  created_at timestamptz not null default now(),
  unique (user_id, cache_key)
);

-- ----------------------------------------------------------------------------
-- import_logs: history of .docx imports
-- ----------------------------------------------------------------------------
create table public.import_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  vocab_added int not null default 0,
  vocab_updated int not null default 0,
  grammar_added int not null default 0,
  grammar_updated int not null default 0,
  topics_added int not null default 0,
  raw_path text,                              -- supabase storage path (optional archive)
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INDEXES (hot paths)
-- ----------------------------------------------------------------------------
create index idx_vocab_user            on public.vocab_entries(user_id) where deleted_at is null;
create index idx_vocab_pos             on public.vocab_entries(user_id, pos) where deleted_at is null;
create index idx_vocab_lemma_trgm      on public.vocab_entries using gin (lemma gin_trgm_ops);
create extension if not exists "pg_trgm";

create index idx_grammar_user          on public.grammar_rules(user_id) where deleted_at is null;
create index idx_grammar_category      on public.grammar_rules(user_id, category) where deleted_at is null;

create index idx_topics_user           on public.topics(user_id) where deleted_at is null;

create index idx_vocab_topics_topic    on public.vocab_topics(topic_id);
create index idx_grammar_topics_topic  on public.grammar_topics(topic_id);

create index idx_flashcards_user       on public.flashcards(user_id);
create index idx_flashcards_vocab      on public.flashcards(vocab_id);
create index idx_flashcards_grammar    on public.flashcards(grammar_id);

create index idx_srs_due               on public.srs_state(user_id, due_at);
create index idx_srs_weak              on public.srs_state(user_id) where is_weak = true;

create index idx_session_events_session on public.session_events(session_id);
create index idx_session_events_card    on public.session_events(card_id, occurred_at desc);

create index idx_exam_attempts_user    on public.exam_attempts(user_id, started_at desc);

create index idx_ai_cache_lookup       on public.ai_cache(user_id, cache_key);

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create trigger t_profiles_updated      before update on public.profiles      for each row execute function public.touch_updated_at();
create trigger t_topics_updated        before update on public.topics        for each row execute function public.touch_updated_at();
create trigger t_vocab_updated         before update on public.vocab_entries for each row execute function public.touch_updated_at();
create trigger t_grammar_updated       before update on public.grammar_rules for each row execute function public.touch_updated_at();

-- create profile + flashcards on signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  insert into public.streak_state (user_id) values (new.id) on conflict do nothing;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- auto-create flashcards when a vocab entry is added/edited
-- (one ES->EN card and one EN->ES card per vocab entry)
create or replace function public.sync_vocab_flashcards() returns trigger as $$
begin
  if new.deleted_at is not null then
    delete from public.flashcards where vocab_id = new.id;
    return new;
  end if;

  insert into public.flashcards (user_id, kind, vocab_id)
  values (new.user_id, 'vocab_es_en', new.id)
  on conflict (user_id, kind, vocab_id, grammar_id) do nothing;

  insert into public.flashcards (user_id, kind, vocab_id)
  values (new.user_id, 'vocab_en_es', new.id)
  on conflict (user_id, kind, vocab_id, grammar_id) do nothing;

  return new;
end $$ language plpgsql;

create trigger t_vocab_sync_cards
  after insert or update of deleted_at on public.vocab_entries
  for each row execute function public.sync_vocab_flashcards();

-- auto-create grammar flashcards
create or replace function public.sync_grammar_flashcards() returns trigger as $$
begin
  if new.deleted_at is not null then
    delete from public.flashcards where grammar_id = new.id;
    return new;
  end if;

  insert into public.flashcards (user_id, kind, grammar_id)
  values (new.user_id, 'grammar', new.id)
  on conflict (user_id, kind, vocab_id, grammar_id) do nothing;
  return new;
end $$ language plpgsql;

create trigger t_grammar_sync_cards
  after insert or update of deleted_at on public.grammar_rules
  for each row execute function public.sync_grammar_flashcards();

-- auto-create initial srs_state on flashcard insert
create or replace function public.init_srs_state() returns trigger as $$
begin
  insert into public.srs_state (card_id, user_id) values (new.id, new.user_id)
  on conflict (card_id) do nothing;
  return new;
end $$ language plpgsql;

create trigger t_flashcard_init_srs
  after insert on public.flashcards
  for each row execute function public.init_srs_state();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.topics           enable row level security;
alter table public.vocab_entries    enable row level security;
alter table public.vocab_topics     enable row level security;
alter table public.grammar_rules    enable row level security;
alter table public.grammar_topics   enable row level security;
alter table public.flashcards       enable row level security;
alter table public.srs_state        enable row level security;
alter table public.weakness_flags   enable row level security;
alter table public.sessions         enable row level security;
alter table public.session_events   enable row level security;
alter table public.streak_state     enable row level security;
alter table public.exam_attempts    enable row level security;
alter table public.ai_cache         enable row level security;
alter table public.import_logs      enable row level security;

-- helper: standard owner policy
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles','topics','vocab_entries','vocab_topics','grammar_rules',
      'grammar_topics','flashcards','srs_state','weakness_flags','sessions',
      'session_events','streak_state','exam_attempts','ai_cache','import_logs'
    ])
  loop
    execute format(
      'create policy %I on public.%I for all using (%s) with check (%s)',
      t || '_owner',
      t,
      case when t = 'profiles' then 'id = auth.uid()' else 'user_id = auth.uid()' end,
      case when t = 'profiles' then 'id = auth.uid()' else 'user_id = auth.uid()' end
    );
  end loop;
end $$;
