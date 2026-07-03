"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWs } from "@/lib/ws";
import Avatar from "@/components/Avatar";
import type { Message, PublicUser } from "@/lib/types";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPanel({ friendshipId, friend }: { friendshipId: number; friend: PublicUser }) {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  useEffect(() => {
    let active = true;
    api<Message[]>(`/api/friendships/${friendshipId}/messages`).then((m) => {
      if (!active) return;
      setMessages(m);
      scrollToBottom();
    });
    api(`/api/friendships/${friendshipId}/messages/read`, { method: "POST" }).catch(() => {});
    return () => {
      active = false;
    };
  }, [friendshipId]);

  useEffect(() => {
    const unsubCreate = subscribe("message_created", (msg: Message) => {
      if (msg.friendship_id !== friendshipId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      scrollToBottom();
      if (msg.sender_id !== user?.id) {
        api(`/api/friendships/${friendshipId}/messages/read`, { method: "POST" }).catch(() => {});
      }
    });
    const unsubRead = subscribe("messages_read", (data: { friendship_id: number; reader_id: number }) => {
      if (data.friendship_id !== friendshipId || data.reader_id === user?.id) return;
      setMessages((prev) => prev.map((m) => (m.sender_id === user?.id ? { ...m, is_read: true } : m)));
    });
    return () => {
      unsubCreate();
      unsubRead();
    };
  }, [subscribe, friendshipId, user?.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    try {
      await api(`/api/friendships/${friendshipId}/messages`, { method: "POST", body: { body } });
      // The message will arrive via WebSocket; no optimistic dup needed.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm text-center text-slate-400">
            <div className="text-4xl">💬</div>
            <p className="mt-2 text-sm">No messages yet. Say hi to {friend.display_name}!</p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const isLast = i === messages.length - 1;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && <Avatar name={friend.display_name} color={friend.avatar_color} size={28} />}
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                <div
                  className={`rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    mine
                      ? "rounded-br-md bg-brand-600 text-white"
                      : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-100"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-1 px-1 text-[11px] text-slate-400">
                  {timeLabel(m.created_at)}
                  {mine && isLast && <span className="ml-1">{m.is_read ? "· Read" : "· Sent"}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder={`Message ${friend.display_name}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn-primary shrink-0" disabled={sending || !draft.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
