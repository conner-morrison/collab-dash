"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAppData } from "@/lib/appdata";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import type { PublicUser } from "@/lib/types";

export default function FriendsPage() {
  const { user } = useAuth();
  const { friends, requests, incomingRequests, reloadFriends, reloadRequests } = useAppData();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());

  const outgoing = requests.filter((r) => r.sender.id === user?.id);
  const friendIds = new Set(friends.map((f) => f.friend.id));
  const pendingIds = new Set(requests.map((r) => (r.sender.id === user?.id ? r.receiver.id : r.sender.id)));

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await api<PublicUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function sendRequest(u: PublicUser) {
    try {
      await api("/api/friend-requests", { method: "POST", body: { receiver_id: u.id } });
      setSentIds((prev) => new Set(prev).add(u.id));
      push({ kind: "success", title: "Request sent", body: `to ${u.display_name}` });
      reloadRequests();
      reloadFriends();
    } catch (err) {
      push({ kind: "error", title: "Couldn't send request", body: err instanceof ApiError ? err.message : "" });
    }
  }

  async function respond(id: number, action: "accept" | "decline") {
    try {
      await api(`/api/friend-requests/${id}/${action}`, { method: "POST" });
      push({ kind: action === "accept" ? "success" : "info", title: action === "accept" ? "Friend added" : "Request declined" });
      reloadRequests();
      reloadFriends();
    } catch (err) {
      push({ kind: "error", title: "Action failed", body: err instanceof ApiError ? err.message : "" });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Friends</h1>
      <p className="mt-1 text-slate-500">Search for people, manage requests, and open shared workspaces.</p>

      {/* Search */}
      <section className="card mt-6 p-6">
        <label className="label">Find people</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            className="input pl-9"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {query.trim() && (
          <div className="mt-4 divide-y divide-slate-100">
            {searching && <p className="py-3 text-sm text-slate-400">Searching…</p>}
            {!searching && results.length === 0 && <p className="py-3 text-sm text-slate-400">No users found.</p>}
            {results.map((u) => {
              const isFriend = friendIds.has(u.id);
              const isPending = pendingIds.has(u.id) || sentIds.has(u.id);
              return (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <Avatar name={u.display_name} color={u.avatar_color} imageUrl={u.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{u.display_name}</p>
                    <p className="truncate text-sm text-slate-400">{u.email ?? "Email hidden"}</p>
                  </div>
                  {isFriend ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">Friends</span>
                  ) : isPending ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Pending</span>
                  ) : (
                    <button className="btn-primary py-1.5" onClick={() => sendRequest(u)}>
                      Add friend
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Incoming requests */}
      {incomingRequests.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Requests for you</h2>
          <div className="mt-4 space-y-3">
            {incomingRequests.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar name={r.sender.display_name} color={r.sender.avatar_color} imageUrl={r.sender.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{r.sender.display_name}</p>
                  <p className="truncate text-sm text-slate-400">wants to connect</p>
                </div>
                <button className="btn-primary py-1.5" onClick={() => respond(r.id, "accept")}>
                  Accept
                </button>
                <button className="btn-ghost py-1.5" onClick={() => respond(r.id, "decline")}>
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Sent requests</h2>
          <div className="mt-4 space-y-3">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar name={r.receiver.display_name} color={r.receiver.avatar_color} imageUrl={r.receiver.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{r.receiver.display_name}</p>
                  <p className="truncate text-sm text-slate-400">{r.receiver.email ?? "Email hidden"}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Pending</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Friends list */}
      <section className="card mt-6 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Your friends</h2>
        {friends.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No friends yet — search above to connect with someone.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {friends.map((f) => (
              <Link
                key={f.friendship_id}
                href={`/app/workspace/${f.friendship_id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:border-brand-200 hover:bg-brand-50/40"
              >
                <Avatar name={f.friend.display_name} color={f.friend.avatar_color} imageUrl={f.friend.avatar_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{f.friend.display_name}</p>
                  <p className="truncate text-sm text-slate-400">Open shared workspace →</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
