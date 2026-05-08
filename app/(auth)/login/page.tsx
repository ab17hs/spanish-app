"use client";

import { useState } from "react";
import { Sparkles, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  };

  return (
    <div className="min-h-svh flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Spanish Mastery</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your personal path to fluency.</p>
        </div>

        <Card className="border-0 shadow-xl shadow-foreground/5">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              We&apos;ll email you a magic link. No password needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === "sent" ? (
              <div className="rounded-xl bg-success/10 p-4 text-center">
                <Mail className="mx-auto mb-2 h-8 w-8 text-success" />
                <p className="text-sm font-medium">Check your inbox</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We sent a sign-in link to <span className="font-medium">{email}</span>.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === "sending"}
                  />
                </div>
                {errorMsg && (
                  <p className="text-xs text-destructive">{errorMsg}</p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={status === "sending"}>
                  {status === "sending" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending link...
                    </>
                  ) : (
                    "Send magic link"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Personal learning platform · Single user mode
        </p>
      </div>
    </div>
  );
}
