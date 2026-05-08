/**
 * Accent-insensitive, typo-tolerant string matching for flashcard answers.
 *
 * Strategy:
 *   1. Normalize: lowercase, trim, fold accents, collapse whitespace,
 *      strip leading articles (el/la/los/las), strip "to " prefix.
 *   2. Compare normalized strings.
 *   3. If not exact, allow Levenshtein distance ≤ ceil(len/8) for typos.
 *
 * Returns: { ok: boolean, kind: "exact"|"accent"|"typo"|"none", expected: string }
 */

export type MatchKind = "exact" | "accent" | "typo" | "alt" | "none";

export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeAnswer(s: string): string {
  return foldAccents(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(el|la|los|las|un|una|unos|unas|to)\s+/i, "")
    .replace(/[.,;:!?¿¡"]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[b.length];
}

export interface MatchResult {
  ok: boolean;
  kind: MatchKind;
  expected: string;
  matchedAlt?: string;
}

/** Check user's answer against one or more accepted answers (synonyms). */
export function matchAnswer(userInput: string, expected: string, alternates: string[] = []): MatchResult {
  const u = userInput.trim();
  if (!u) return { ok: false, kind: "none", expected };

  const candidates = [expected, ...alternates];
  const userNorm = normalizeAnswer(u);

  // Exact match (case/whitespace tolerant)
  for (const c of candidates) {
    if (u.toLowerCase().trim() === c.toLowerCase().trim()) {
      return { ok: true, kind: "exact", expected, matchedAlt: c !== expected ? c : undefined };
    }
  }

  // Accent-insensitive match
  for (const c of candidates) {
    if (userNorm === normalizeAnswer(c)) {
      return { ok: true, kind: "accent", expected, matchedAlt: c !== expected ? c : undefined };
    }
  }

  // Typo tolerance: distance ≤ ceil(len/8), capped at 2
  for (const c of candidates) {
    const cNorm = normalizeAnswer(c);
    const tolerance = Math.min(2, Math.ceil(cNorm.length / 8));
    if (levenshtein(userNorm, cNorm) <= tolerance) {
      return { ok: true, kind: "typo", expected, matchedAlt: c !== expected ? c : undefined };
    }
  }

  return { ok: false, kind: "none", expected };
}
