"use client";

import { useEffect, useRef, useState } from "react";
import { StickyNote as StickyNoteIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWs } from "@/lib/ws";
import type { PublicUser, StickyNote } from "@/lib/types";

const COLORS = ["#fde68a", "#bbf7d0", "#fecaca", "#bfdbfe", "#ddd6fe", "#fbcfe8"];
const BOARD_W = 1200;
const BOARD_H = 800;

export default function StickyBoard({ dashboardId, friend }: { dashboardId: number; friend: PublicUser }) {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    api<{ sticky_notes: StickyNote[] }>(`/api/dashboards/${dashboardId}`).then((d) => {
      setNotes(d.sticky_notes);
      setLoading(false);
    });
  }, [dashboardId]);

  useEffect(() => {
    const unsub = [
      subscribe("note_created", (n: StickyNote) => {
        if (n.dashboard_id !== dashboardId) return;
        setNotes((prev) => (prev.some((x) => x.id === n.id) ? prev : [...prev, n]));
      }),
      subscribe("note_updated", (n: StickyNote) => {
        if (n.dashboard_id !== dashboardId) return;
        setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...n } : x)));
      }),
      subscribe("note_deleted", (d: { id: number; dashboard_id: number }) => {
        if (d.dashboard_id !== dashboardId) return;
        setNotes((prev) => prev.filter((x) => x.id !== d.id));
      }),
    ];
    return () => unsub.forEach((u) => u());
  }, [subscribe, dashboardId]);

  async function addNote() {
    const color = COLORS[Math.floor(notes.length % COLORS.length)];
    const pos_x = 40 + Math.floor((notes.length * 30) % 400);
    const pos_y = 40 + Math.floor((notes.length * 24) % 300);
    const note = await api<StickyNote>(`/api/dashboards/${dashboardId}/notes`, {
      method: "POST",
      body: { content: "", color, pos_x, pos_y },
    });
    setNotes((prev) => (prev.some((x) => x.id === note.id) ? prev : [...prev, note]));
  }

  function patch(id: number, body: Partial<StickyNote>) {
    setNotes((prev) => prev.map((x) => (x.id === id ? { ...x, ...body } : x)));
    api(`/api/dashboards/${dashboardId}/notes/${id}`, { method: "PATCH", body }).catch(() => {});
  }

  async function remove(id: number) {
    setNotes((prev) => prev.filter((x) => x.id !== id));
    api(`/api/dashboards/${dashboardId}/notes/${id}`, { method: "DELETE" }).catch(() => {});
  }

  // --- Dragging ---
  function onPointerDown(e: React.PointerEvent, note: StickyNote) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const rect = boardRef.current!.getBoundingClientRect();
    drag.current = { id: note.id, dx: e.clientX - rect.left - note.pos_x, dy: e.clientY - rect.top - note.pos_y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = boardRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(BOARD_W - 180, e.clientX - rect.left - drag.current.dx));
    const y = Math.max(0, Math.min(BOARD_H - 60, e.clientY - rect.top - drag.current.dy));
    const id = drag.current.id;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pos_x: Math.round(x), pos_y: Math.round(y) } : n)));
  }

  function onPointerUp() {
    if (!drag.current) return;
    const note = notes.find((n) => n.id === drag.current!.id);
    if (note) patch(note.id, { pos_x: note.pos_x, pos_y: note.pos_y });
    drag.current = null;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <p className="text-sm font-medium text-slate-700">Shared sticky board</p>
          <p className="text-xs text-slate-400">Drag to move · click text to edit · changes sync live</p>
        </div>
        <button className="btn-primary" onClick={addNote}>
          + Add note
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:22px_22px]">
        <div
          ref={boardRef}
          className="relative"
          style={{ width: BOARD_W, height: BOARD_H }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {loading && <p className="p-6 text-sm text-slate-400">Loading board…</p>}
          {!loading && notes.length === 0 && (
            <div className="absolute left-1/2 top-24 -translate-x-1/2 text-center text-slate-400">
              <StickyNoteIcon size={40} className="mx-auto" strokeWidth={1.5} />
              <p className="mt-2 text-sm">Empty board. Add your first note!</p>
            </div>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              onPointerDown={(e) => onPointerDown(e, n)}
              className="group absolute w-44 cursor-grab touch-none rounded-lg p-3 shadow-note transition-shadow active:cursor-grabbing"
              style={{ left: n.pos_x, top: n.pos_y, backgroundColor: n.color }}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="flex gap-1" data-no-drag>
                  {COLORS.slice(0, 4).map((c) => (
                    <button
                      key={c}
                      onClick={() => patch(n.id, { color: c })}
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: c }}
                      aria-label="Change color"
                    />
                  ))}
                </div>
                <button
                  data-no-drag
                  onClick={() => remove(n.id)}
                  className="text-slate-500/60 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                  aria-label="Delete note"
                >
                  <X size={14} />
                </button>
              </div>
              <textarea
                data-no-drag
                value={n.content}
                onChange={(e) => setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, content: e.target.value } : x)))}
                onBlur={(e) => patch(n.id, { content: e.target.value })}
                placeholder="Write something…"
                className="h-24 w-full resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-500/60 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-600/60">
                {n.author_id === user?.id ? "You" : friend.display_name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
