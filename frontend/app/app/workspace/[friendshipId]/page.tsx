"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppData } from "@/lib/appdata";
import { useWs } from "@/lib/ws";
import Avatar from "@/components/Avatar";
import StickyBoard from "@/components/workspace/StickyBoard";
import ChatPanel from "@/components/workspace/ChatPanel";
import SchedulePanel from "@/components/workspace/SchedulePanel";

type Tab = "board" | "chat" | "schedule";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "board", label: "Sticky Board", icon: "📝" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "schedule", label: "Schedule", icon: "📅" },
];

export default function WorkspacePage() {
  const params = useParams();
  const friendshipId = Number(params.friendshipId);
  const { friends } = useAppData();
  const { onlineUsers } = useWs();
  const [tab, setTab] = useState<Tab>("board");

  const friendship = useMemo(
    () => friends.find((f) => f.friendship_id === friendshipId),
    [friends, friendshipId]
  );

  if (friends.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!friendship) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">Workspace not found</p>
        <p className="mt-1 text-slate-500">This workspace doesn&apos;t exist or you don&apos;t have access.</p>
        <Link href="/app" className="btn-primary mt-6">
          Back home
        </Link>
      </div>
    );
  }

  const online = onlineUsers.has(friendship.friend.id);

  return (
    <div className="flex h-full flex-col">
      {/* Workspace header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Avatar name={friendship.friend.display_name} color={friendship.friend.avatar_color} size={44} online={online} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-slate-900">
              {friendship.friend.display_name}
            </h1>
            <p className="text-sm text-slate-400">{online ? "Online now" : "Offline"} · Shared workspace</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {tab === "board" && (
          <StickyBoard dashboardId={friendship.dashboard_id} friend={friendship.friend} />
        )}
        {tab === "chat" && (
          <ChatPanel friendshipId={friendship.friendship_id} friend={friendship.friend} />
        )}
        {tab === "schedule" && <SchedulePanel dashboardId={friendship.dashboard_id} />}
      </div>
    </div>
  );
}
