"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { api, ApiError } from "@/lib/api";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("No verification token provided.");
      return;
    }
    api("/api/auth/verify", { method: "POST", auth: false, body: { token } })
      .then(() => {
        setState("ok");
        setMessage("Your email is verified. You can now sign in.");
      })
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Verification failed.");
      });
  }, [token]);

  return (
    <AuthShell title="Email verification" subtitle="Confirming your account.">
      {state === "loading" && <p className="text-sm text-slate-500">Verifying…</p>}
      {state === "ok" && (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ {message}</p>
          <Link href="/login" className="btn-primary w-full">
            Continue to sign in
          </Link>
        </div>
      )}
      {state === "error" && (
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">⚠️ {message}</p>
          <Link href="/login" className="btn-ghost w-full">
            Back to sign in
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
