"use server";

/**
 * Profile settings server action.
 *
 * Updates the writable subset of profiles:
 *   - daily_goal (5..100 cards/day, schema-enforced)
 *   - timezone (any IANA name; we don't validate the list — Postgres stores
 *     it as plain text and the streak math falls back to UTC if Intl rejects)
 *   - display_name
 *   - preferred_voice (e.g. "es-ES", "es-MX")
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const Schema = z.object({
  daily_goal: z.number().int().min(5).max(100),
  timezone: z.string().min(1).max(64),
  display_name: z.string().max(120).nullable().optional(),
  preferred_voice: z.enum(["es-ES", "es-MX", "es-AR", "es-CO", "es-419"]).optional(),
});

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({
      daily_goal: parsed.data.daily_goal,
      timezone: parsed.data.timezone,
      display_name: parsed.data.display_name ?? null,
      preferred_voice: parsed.data.preferred_voice ?? "es-ES",
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
