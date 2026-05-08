/**
 * Lowercase, accent-folded, hyphen-separated slug suitable for URLs and
 * topic/grammar primary keys. Mirrors the parser's local helper so the same
 * "Family" → "family" resolution applies on both ends of the import flow.
 */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
