"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { api, ApiError } from "@/lib/api";
import { useNameCheck } from "@/lib/useNameCheck";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ display_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const { taken: nameTaken, suggestion: nameSuggestion } = useNameCheck(form.display_name);

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ dev_verification_token: string | null }>("/api/auth/register", {
        method: "POST",
        auth: false,
        body: form,
      });
      setDevToken(res.dev_verification_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyNow() {
    if (!devToken) return;
    setBusy(true);
    try {
      await api("/api/auth/verify", { method: "POST", auth: false, body: { token: devToken } });
      setVerified(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (devToken) {
    return (
      <AuthShell title="Verify your email" subtitle="We've sent a verification link to your inbox.">
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
            <p className="font-medium">📬 Check your email</p>
            <p className="mt-1 text-brand-700">
              In a production deployment a verification link would arrive by email. For this demo you
              can verify instantly below.
            </p>
          </div>
          {verified ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              ✅ Email verified! Redirecting to sign in…
            </p>
          ) : (
            <button className="btn-primary w-full" onClick={verifyNow} disabled={busy}>
              {busy ? "Verifying…" : "Verify now & continue"}
            </button>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start collaborating in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Display name</label>
          <input className="input" value={form.display_name} onChange={(e) => update("display_name", e.target.value)} placeholder="Jane Doe" required />
          {nameTaken && (
            <p className="mt-1 text-xs text-amber-600">
              That name is taken.
              {nameSuggestion && (
                <>
                  {" "}Try{" "}
                  <button
                    type="button"
                    onClick={() => update("display_name", nameSuggestion)}
                    className="font-semibold text-brand-600 underline hover:text-brand-700"
                  >
                    {nameSuggestion}
                  </button>
                </>
              )}
            </p>
          )}
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@example.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="At least 6 characters" minLength={6} required />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || nameTaken}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
