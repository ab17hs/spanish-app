"use client";

/**
 * Settings form — pure client component. Daily goal is rendered as a slider
 * with discrete tick marks (5, 10, 20, 30, 50, 100) so users get a sense of
 * "small / medium / large" without typing numbers. Timezone is a select with
 * the user's current zone preselected; we show only common IANA names plus
 * the current value (so a custom one round-trips).
 *
 * The "save" action returns immediately; we use useTransition to disable the
 * button while pending and show a tick + last-saved timestamp on success.
 */

import { useState, useTransition } from "react";
import { Check, Save, Flame, Snowflake, Globe, Target, Mic, AlertCircle, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateSettingsAction } from "./actions";
import { InstallPromptCard } from "@/components/layout/install-prompt";

type Voice = "es-ES" | "es-MX" | "es-AR" | "es-CO" | "es-419";

interface FormInitial {
  display_name: string;
  email: string;
  timezone: string;
  daily_goal: number;
  preferred_voice: Voice;
}

interface StreakState {
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  freezes_used_iso_week: number;
}

const COMMON_TZS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Mexico_City",
  "America/Bogota",
  "America/Buenos_Aires",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Athens",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const GOAL_PRESETS = [5, 10, 20, 30, 50, 100];
const VOICE_OPTIONS: { value: Voice; label: string }[] = [
  { value: "es-ES", label: "Spain (es-ES)" },
  { value: "es-MX", label: "Mexico (es-MX)" },
  { value: "es-AR", label: "Argentina (es-AR)" },
  { value: "es-CO", label: "Colombia (es-CO)" },
  { value: "es-419", label: "Latin American (es-419)" },
];

export function SettingsForm({
  initial,
  streak,
  levelLabel,
}: {
  initial: FormInitial;
  streak: StreakState | null;
  levelLabel: string | null;
}) {
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [dailyGoal, setDailyGoal] = useState<number>(initial.daily_goal);
  const [voice, setVoice] = useState<Voice>(initial.preferred_voice);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Add the user's current TZ to the dropdown if it isn't in COMMON_TZS, so
  // saved-but-unusual values like "America/Indiana/Knox" still round-trip.
  const tzOptions = COMMON_TZS.includes(timezone) ? COMMON_TZS : [...COMMON_TZS, timezone];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateSettingsAction({
        display_name: displayName.trim() || null,
        timezone,
        daily_goal: dailyGoal,
        preferred_voice: voice,
      });
      if (res.ok) {
        setSavedAt(new Date());
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <InstallPromptCard />
      {/* Streak summary — read-only context */}
      {streak && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Streak</CardTitle>
            <CardDescription>Calculated from your daily activity in the timezone below.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={<Flame className="h-4 w-4 text-warning-foreground" />}
              label="Current"
              value={`${streak.current_streak} day${streak.current_streak === 1 ? "" : "s"}`}
            />
            <Stat
              icon={<Flame className="h-4 w-4 text-muted-foreground" />}
              label="Longest"
              value={`${streak.longest_streak} day${streak.longest_streak === 1 ? "" : "s"}`}
            />
            <Stat
              icon={<Snowflake className="h-4 w-4 text-primary" />}
              label="Freezes (week)"
              value={`${1 - Math.min(1, streak.freezes_used_iso_week)} of 1 left`}
            />
            <Stat
              icon={<Check className="h-4 w-4 text-success" />}
              label="Last day"
              value={streak.last_completed_date ?? "—"}
            />
          </CardContent>
        </Card>
      )}

      {/* Profile basics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={initial.email} disabled readOnly />
            <p className="text-xs text-muted-foreground">Sign-in email. Contact support to change.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              placeholder="What should we call you?"
            />
          </div>
          {levelLabel && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Estimated CEFR:</span>
              <Badge variant="secondary">{levelLabel}</Badge>
              <span className="text-xs text-muted-foreground">(updated by exam grading)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily goal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-muted-foreground" /> Daily goal
          </CardTitle>
          <CardDescription>
            Number of card reviews needed to count today as "done" toward your streak. {dailyGoal}{" "}
            {dailyGoal === 1 ? "card" : "cards"} per day.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Daily goal"
          />
          <div className="flex flex-wrap gap-1.5">
            {GOAL_PRESETS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setDailyGoal(g)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  dailyGoal === g
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-muted-foreground" /> Timezone
          </CardTitle>
          <CardDescription>
            Used to decide when "today" rolls over for streak purposes. A 23:55 review counts as
            today in this zone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            aria-label="Timezone"
          >
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              try {
                const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (detected) setTimezone(detected);
              } catch {
                // best effort
              }
            }}
            className="text-xs text-primary hover:underline"
          >
            Use my browser's timezone
          </button>
        </CardContent>
      </Card>

      {/* Voice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="h-4 w-4 text-muted-foreground" /> Pronunciation voice
          </CardTitle>
          <CardDescription>
            Variant used when the app speaks Spanish words and passages. Some browsers ship only one
            es- voice — in that case this is a hint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value as Voice)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            aria-label="Preferred voice"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Backup & data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-muted-foreground" /> Backup & export
          </CardTitle>
          <CardDescription>
            Download a JSON snapshot of your full library: vocab, grammar rules, SRS state, exam
            history, generated readings, and streak data. Keep one offsite — restoring needs the
            same Supabase project, but the JSON is human-readable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/export"
            download
            className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Download JSON backup
          </a>
        </CardContent>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="text-xs text-muted-foreground">
          {error ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </span>
          ) : savedAt ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5" />
              Saved {savedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          ) : (
            <span>Changes save when you click save.</span>
          )}
        </div>
        <Button type="submit" disabled={pending}>
          <Save className="mr-2 h-4 w-4" /> {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
