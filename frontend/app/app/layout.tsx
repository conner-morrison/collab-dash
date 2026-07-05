"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { WsProvider } from "@/lib/ws";
import { ToastProvider } from "@/components/Toast";
import { AppDataProvider } from "@/lib/appdata";
import Sidebar from "@/components/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import Avatar from "@/components/Avatar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <WsProvider enabled={!!user}>
      <ToastProvider>
        <AppDataProvider userId={user.id}>
          <div className="flex h-screen overflow-hidden bg-slate-50">
            {/* Sidebar (desktop) */}
            <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
              <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">◆</span>
                <span className="font-semibold tracking-tight text-slate-800">Collab Dashboard</span>
              </div>
              <Sidebar />
            </aside>

            {/* Sidebar (mobile drawer) */}
            {mobileOpen && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
                <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl">
                  <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">◆</span>
                    <span className="font-semibold tracking-tight text-slate-800">Collab Dashboard</span>
                  </div>
                  <Sidebar onNavigate={() => setMobileOpen(false)} />
                </aside>
              </div>
            )}

            {/* Main column */}
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                >
                  ☰
                </button>
                <div className="hidden lg:block" />
                <div className="flex items-center gap-2">
                  <NotificationBell />
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen((o) => !o)}
                      className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100"
                    >
                      <Avatar name={user.display_name} color={user.avatar_color} imageUrl={user.avatar_url} size={34} />
                      <span className="hidden text-sm font-medium text-slate-700 sm:block">{user.display_name}</span>
                    </button>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                        <div className="absolute right-0 z-40 mt-2 w-56 animate-fade-in overflow-hidden rounded-xl bg-white shadow-note ring-1 ring-slate-200">
                          <div className="border-b border-slate-100 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-800">{user.display_name}</p>
                            <p className="truncate text-xs text-slate-400">{user.email}</p>
                          </div>
                          <Link
                            href="/app/profile"
                            onClick={() => setMenuOpen(false)}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <span>⚙️</span> Profile &amp; settings
                          </Link>
                          <button
                            onClick={logout}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            <span>↩</span> Sign out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </header>

              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
        </AppDataProvider>
      </ToastProvider>
    </WsProvider>
  );
}
