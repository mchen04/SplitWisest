"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/client";
import { Button, Field, Input, ErrorNote } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { username, password } });
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not log in");
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-soft">Log in to see who owes who.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" busy={busy} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-3 text-center text-sm">
        <Link href="/recover" className="text-ink-soft hover:text-accent hover:underline">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-5 text-center text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}
