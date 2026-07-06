"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWs } from "@/lib/ws";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import type { Message, PublicUser } from "@/lib/types";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPanel({ friendshipId, friend }: { friendshipId: number; friend: PublicUser }) {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const { push } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
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
    const unsubs = [
      subscribe("message_created", (msg: Message) => {
        if (msg.friendship_id !== friendshipId) return;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        scrollToBottom();
        if (msg.sender_id !== user?.id) {
          api(`/api/friendships/${friendshipId}/messages/read`, { method: "POST" }).catch(() => {});
        }
      }),
      subscribe("messages_read", (data: { friendship_id: number; reader_id: number }) => {
        if (data.friendship_id !== friendshipId || data.reader_id === user?.id) return;
        setMessages((prev) => prev.map((m) => (m.sender_id === user?.id ? { ...m, is_read: true } : m)));
      }),
      subscribe("message_edited", (msg: Message) => {
        if (msg.friendship_id !== friendshipId) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }),
      subscribe("message_deleted", (data: { friendship_id: number; id: number }) => {
        if (data.friendship_id !== friendshipId) return;
        setMessages((prev) => prev.filter((m) => m.id !== data.id));
      }),
      subscribe("chat_cleared", (data: { friendship_id: number }) => {
        if (data.friendship_id !== friendshipId) return;
        setMessages([]);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, friendshipId, user?.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    try {
      await api(`/api/friendships/${friendshipId}/messages`, { method: "POST", body: { body } });
    } finally {
      setSending(false);
    }
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditText(m.body);
  }

  async function saveEdit(id: number) {
    const body = editText.trim();
    if (!body) return;
    setEditingId(null);
    try {
      await api(`/api/friendships/${friendshipId}/messages/${id}`, { method: "PATCH", body: { body } });
    } catch (err: any) {
      push({ kind: "error", title: "Couldn't edit", body: err?.message ?? "" });
    }
  }

  async function deleteMessage(id: number) {
    if (!confirm("Delete this message?")) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    api(`/api/friendships/${friendshipId}/messages/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function clearChat() {
    if (!confirm("Delete the entire chat history for both of you? This can't be undone.")) return;
    setMessages([]);
    api(`/api/friendships/${friendshipId}/messages`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header with clear-chat */}
      {messages.length > 0 && (
        <div className="flex shrink-0 items-center justify-end border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <button
            onClick={clearChat}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} /> Clear chat
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm text-center text-slate-400">
            <MessageCircle size={40} className="mx-auto" strokeWidth={1.5} />
            <p className="mt-2 text-sm">No messages yet. Say hi to {friend.display_name}!</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const editing = editingId === m.id;
          return (
            <div key={m.id} className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && <Avatar name={friend.display_name} color={friend.avatar_color} imageUrl={friend.avatar_url} size={28} />}

              {/* Hover actions for own messages (left of the bubble) */}
              {mine && !editing && (
                <div className="flex items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100">
                  {!m.is_read && (
                    <button
                      onClick={() => startEdit(m)}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      aria-label="Edit message"
                      title="Edit (only before it's read)"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMessage(m.id)}
                    className="rounded-md p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                    aria-label="Delete message"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                {editing ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      className="input py-1.5"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(m.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button onClick={() => saveEdit(m.id)} className="rounded-md bg-brand-600 p-1.5 text-white" aria-label="Save">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-md bg-slate-200 p-1.5 text-slate-600" aria-label="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      mine
                        ? "rounded-br-md bg-brand-600 text-white"
                        : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-100"
                    }`}
                  >
                    {m.body}
                  </div>
                )}
                <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400">
                  {timeLabel(m.created_at)}
                  {m.edited_at && <span>· edited</span>}
                  {mine &&
                    (m.is_read ? (
                      <CheckCheck size={14} className="text-brand-500" aria-label="Read" />
                    ) : (
                      <Check size={14} aria-label="Sent" />
                    ))}
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
