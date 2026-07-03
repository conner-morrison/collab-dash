"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "./Avatar";
import { useAppData } from "@/lib/appdata";
import { useWs } from "@/lib/ws";

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { friends, incomingRequests } = useAppData();
  const { onlineUsers, connected } = useWs();
  const pathname = usePathname();

  const navItem = (href: string, label: string, icon: string, badge?: number) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <span className="flex items-center gap-3">
          <span className="text-base">{icon}</span>
          {label}
        </span>
        {badge ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <nav className="space-y-1 px-3 py-4">
        {navItem("/app", "Home", "🏠")}
        {navItem("/app/friends", "Friends", "👥", incomingRequests.length)}
      </nav>

      <div className="px-4 pb-2 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Workspaces</p>
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
            title={connected ? "Live" : "Reconnecting…"}
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {friends.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-400">
            No friends yet. Add someone from the Friends tab to start a shared workspace.
          </p>
        ) : (
          friends.map((f) => {
            const href = `/app/workspace/${f.friendship_id}`;
            const active = pathname === href;
            return (
              <Link
                key={f.friendship_id}
                href={href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  active ? "bg-brand-50" : "hover:bg-slate-100"
                }`}
              >
                <Avatar name={f.friend.display_name} color={f.friend.avatar_color} size={34} online={onlineUsers.has(f.friend.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{f.friend.display_name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {onlineUsers.has(f.friend.id) ? "Online" : "Offline"}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
