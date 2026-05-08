/**
 * POST /api/import
 *
 * Accepts a multipart form with a single `file` field containing a .docx blob.
 * Streams the buffer through `parseDocxBuffer`, returns the structured
 * { vocab, grammar, topics, warnings } JSON for the client to review.
 *
 * Authentication: requires a logged-in user (auth.uid). The parser itself
 * does not touch the database; it just turns bytes into structured candidates.
 * Commit happens later via a server action once the user reviews the import.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDocxBuffer } from "@/lib/parser/docx-parser";

export const runtime = "nodejs"; // mammoth needs Node, not Edge

const MAX_BYTES = 8 * 1024 * 1024; // 8MB hard cap

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }
  if (!/\.docx$/i.test(file.name)) {
    return NextResponse.json({ error: "wrong_file_type", expected: ".docx" }, { status: 415 });
  }

  const buffer = await file.arrayBuffer();

  let result;
  try {
    result = await parseDocxBuffer(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse_failed";
    return NextResponse.json({ error: "parse_failed", detail: message }, { status: 422 });
  }

  // Don't return rawText on the wire — it can be huge and the client doesn't
  // need it for review. Keep counts and the structured candidates only.
  const { rawText: _rawText, ...payload } = result;

  return NextResponse.json({
    filename: file.name,
    sizeBytes: file.size,
    counts: {
      vocab: payload.vocab.length,
      grammar: payload.grammar.length,
      topics: payload.topics.length,
      warnings: payload.warnings.length,
    },
    ...payload,
  });
}
