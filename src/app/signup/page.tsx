"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/client";
import { Button, Field, Input, ErrorNote } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", displayName: "", password: "", inviteCode: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/signup", { body: form });
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not sign up");
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <h1 className="font-display text-[22px] font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-soft">Private expense tracking for your friend group.</p>
      <form onSubmit={submit} className="mt-6 space-y-[13px]">
        <Field label="Display name">
          <Input value={form.displayName} onChange={set("displayName")} placeholder="Alex Rivera" autoFocus required maxLength={50} />
        </Field>
        <div className="grid grid-cols-2 gap-[13px]">
          <Field label="Username">
            <Input
              value={form.username}
              onChange={set("username")}
              placeholder="alex"
              autoComplete="username"
              required
              pattern="[A-Za-z0-9_]{3,30}"
              title="3-30 letters, numbers, or underscores"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.password}
              onChange={set("password")}
              placeholder="••••••"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
        </div>
        <Field label="Invite code — optional">
          <Input value={form.inviteCode} onChange={set("inviteCode")} placeholder="MAYA-3X9P" className="font-mono" />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-[13px] text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent hover:text-accent-dark">
          Log in
        </Link>
      </p>
    </AuthFrame>
  );
}
