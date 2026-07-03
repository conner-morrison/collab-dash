"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, string> = { info: "🔔", success: "✅", error: "⚠️" };
const RING: Record<ToastKind, string> = {
  info: "ring-brand-100",
  success: "ring-emerald-100",
  error: "ring-red-100",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-fade-in rounded-xl bg-white p-3 shadow-note ring-1 ${RING[t.kind]}`}
          >
            <div className="flex gap-3">
              <span className="text-lg leading-none">{ICONS[t.kind]}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                {t.body && <p className="mt-0.5 truncate text-sm text-slate-500">{t.body}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
