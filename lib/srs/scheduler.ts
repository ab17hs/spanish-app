/**
 * Lightweight SRS scheduler.
 * Pure functions — easy to test, no I/O.
 *
 * Intervals (days): 0d (new) -> 1 -> 3 -> 7 -> 21 -> 60 -> 60 (capped).
 * On a hit, advance one step. On a miss, reset to 0 and due immediately.
 * A small "ease bonus" is applied: if you've gotten the card right N times in a row,
 * the next interval is bumped one extra step.
 */

export const INTERVALS_DAYS = [0, 1, 3, 7, 21, 60] as const;
export const MAX_IDX = INTERVALS_DAYS.length - 1;

export interface SrsState {
  interval_idx: number;
  due_at: string;            // ISO timestamp
  last_seen_at: string | null;
  hits: number;
  misses: number;
  consecutive_hits: number;
  total_reviews: number;
}

export interface SrsUpdate {
  interval_idx: number;
  due_at: string;
  last_seen_at: string;
  hits: number;
  misses: number;
  consecutive_hits: number;
  total_reviews: number;
}

const dayMs = 24 * 60 * 60 * 1000;

export function gradeCard(state: SrsState, isCorrect: boolean, now = new Date()): SrsUpdate {
  const total_reviews = state.total_reviews + 1;
  const last_seen_at = now.toISOString();

  if (!isCorrect) {
    return {
      interval_idx: 0,
      due_at: now.toISOString(), // due immediately on miss
      last_seen_at,
      hits: state.hits,
      misses: state.misses + 1,
      consecutive_hits: 0,
      total_reviews,
    };
  }

  const consecutive_hits = state.consecutive_hits + 1;
  // ease bonus: +1 step if you've nailed it 4 times in a row
  const stepBonus = consecutive_hits >= 4 ? 2 : 1;
  const next_idx = Math.min(MAX_IDX, state.interval_idx + stepBonus);
  const intervalDays = INTERVALS_DAYS[next_idx];
  const due = new Date(now.getTime() + intervalDays * dayMs);

  return {
    interval_idx: next_idx,
    due_at: due.toISOString(),
    last_seen_at,
    hits: state.hits + 1,
    misses: state.misses,
    consecutive_hits,
    total_reviews,
  };
}

/** Sort cards for a session: most-overdue first, then weak cards, then new. */
export function sortSessionCards<T extends { due_at: string; total_reviews: number; is_weak?: boolean }>(
  cards: T[],
  now = new Date(),
): T[] {
  const t = now.getTime();
  return [...cards].sort((a, b) => {
    const aOver = t - new Date(a.due_at).getTime();
    const bOver = t - new Date(b.due_at).getTime();
    // weak cards bumped first within similar overdue tier
    if (a.is_weak !== b.is_weak) return a.is_weak ? -1 : 1;
    if (a.total_reviews === 0 && b.total_reviews > 0) return 1; // new cards last
    if (b.total_reviews === 0 && a.total_reviews > 0) return -1;
    return bOver - aOver;
  });
}
