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
      <h1 className="font-display text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-soft">
        You need an invite code from a friend already on SplitWisest.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Display name" hint="How friends will see you">
          <Input value={form.displayName} onChange={set("displayName")} autoFocus required maxLength={50} />
        </Field>
        <Field label="Username">
          <Input
            value={form.username}
            onChange={set("username")}
            autoComplete="username"
            required
            pattern="[A-Za-z0-9_]{3,30}"
            title="3-30 letters, numbers, or underscores"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label="Invite code">
          <Input value={form.inviteCode} onChange={set("inviteCode")} required />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthFrame>
  );
}
