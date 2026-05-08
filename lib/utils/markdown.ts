/**
 * Minimal markdown → HTML renderer.
 *
 * Handles only what our grammar explanations need:
 *   - h2 (## ), h3 (### )
 *   - **bold**, _italic_, *italic*, `code`
 *   - bullet lists (- item, * item)
 *   - numbered lists (1. item)
 *   - blockquotes (> text)
 *   - paragraphs (separated by blank lines)
 *   - inline links: [text](url)
 *
 * Why hand-rolled? The dep list is tight — no marked/markdown-it. Output is
 * a sanitized HTML string suitable for `dangerouslySetInnerHTML` because the
 * input content is owned by the user (they wrote the grammar rules) and is
 * passed through `escape()` first to neutralize any stray HTML.
 *
 * If we ever need full CommonMark, swap this for `marked` and delete this file.
 */

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function inline(text: string): string {
  let s = escape(text);
  // Inline code (must run before emphasis to protect *_ inside backticks)
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">$1</code>');
  // Bold
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  // Italic — _x_ or *x* (avoid mid-word collisions: must have space/punct before)
  s = s.replace(/(^|[\s(])\_([^_]+?)\_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(])\*([^*]+?)\*(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  // Links
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline-offset-4 hover:underline" target="_blank" rel="noopener">$1</a>',
  );
  return s;
}

export function renderMarkdown(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return;
    out.push(`<p class="leading-relaxed">${inline(buf.join(" "))}</p>`);
    buf.length = 0;
  };

  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // Blank line → paragraph boundary
    if (!line.trim()) {
      flushParagraph(para);
      i++;
      continue;
    }

    // Headers
    if (/^### /.test(line)) {
      flushParagraph(para);
      out.push(`<h3 class="mt-4 text-base font-semibold tracking-tight">${inline(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (/^## /.test(line)) {
      flushParagraph(para);
      out.push(`<h2 class="mt-5 text-lg font-semibold tracking-tight">${inline(line.slice(3))}</h2>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^> /.test(line)) {
      flushParagraph(para);
      const buf: string[] = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        `<blockquote class="my-3 border-l-2 border-primary/40 bg-primary/5 px-3 py-2 text-sm">${inline(buf.join(" "))}</blockquote>`,
      );
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul class="ml-5 list-disc space-y-1">${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="ml-5 list-decimal space-y-1">${items.join("")}</ol>`);
      continue;
    }

    // Default: accumulate paragraph
    para.push(line);
    i++;
  }
  flushParagraph(para);

  return out.join("\n");
}
