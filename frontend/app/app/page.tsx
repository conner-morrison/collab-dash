"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useAppData } from "@/lib/appdata";
import { useWs } from "@/lib/ws";
import Avatar from "@/components/Avatar";

export default function HomePage() {
  const { user } = useAuth();
  const { friends, incomingRequests, unreadNotifications } = useAppData();
  const { onlineUsers } = useWs();

  const onlineFriends = friends.filter((f) => onlineUsers.has(f.friend.id)).length;

  const stats = [
    { label: "Workspaces", value: friends.length, icon: "🗂️", href: "/app/friends" },
    { label: "Friends online", value: onlineFriends, icon: "🟢", href: "/app/friends" },
    { label: "Pending requests", value: incomingRequests.length, icon: "👋", href: "/app/friends" },
    { label: "Unread alerts", value: unreadNotifications, icon: "🔔", href: "/app" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user?.display_name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-slate-500">Here&apos;s what&apos;s happening across your shared workspaces.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 transition-shadow hover:shadow-note">
            <div className="text-2xl">{s.icon}</div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Your workspaces</h2>
            <Link href="/app/friends" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Manage
            </Link>
          </div>
          {friends.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center">
              <p className="text-slate-500">No shared workspaces yet.</p>
              <Link href="/app/friends" className="btn-primary mt-4">
                Find friends
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {friends.map((f) => (
                <li key={f.friendship_id}>
                  <Link
                    href={`/app/workspace/${f.friendship_id}`}
                    className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50"
                  >
                    <Avatar name={f.friend.display_name} color={f.friend.avatar_color} size={40} online={onlineUsers.has(f.friend.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{f.friend.display_name}</p>
                      <p className="truncate text-sm text-slate-400">Shared dashboard</p>
                    </div>
                    <span className="text-slate-300">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Getting started</h2>
          <ol className="space-y-4">
            {[
              { t: "Find a friend", d: "Search by name or email and send a request.", done: friends.length > 0 },
              { t: "Open a workspace", d: "Each friendship gets a shared dashboard.", done: friends.length > 0 },
              { t: "Chat & collaborate", d: "Message live, add sticky notes, plan schedules.", done: false },
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    step.done ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-700"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div>
                  <p className="font-medium text-slate-800">{step.t}</p>
                  <p className="text-sm text-slate-500">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
