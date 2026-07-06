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
  const [sent, setSent] = useState(false);
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
      // Remember the credentials so the sign-in page can pre-fill them.
      try {
        sessionStorage.setItem("cpd.pendingLogin", JSON.stringify({ email: form.email, password: form.password }));
      } catch {
        /* ignore */
      }
      if (res.dev_verification_token) {
        // No email server in dev: verify automatically, then go straight to sign in.
        await api("/api/auth/verify", { method: "POST", auth: false, body: { token: res.dev_verification_token } }).catch(() => {});
        router.replace("/login");
        return;
      }
      // Production: the user must click the emailed verification link first.
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Verify your email" subtitle="We've sent a verification link to your inbox.">
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
            <p className="font-medium">📬 Check your email</p>
            <p className="mt-1 text-brand-700">
              Click the link in the email to verify your account, then sign in.
            </p>
          </div>
          <button className="btn-primary w-full" onClick={() => router.push("/login")}>
            Go to sign in
          </button>
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
