"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useWs } from "@/lib/ws";
import type { ScheduleItem } from "@/lib/types";

type View = "date" | "client";

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};
const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};
const NEXT_STATUS: Record<string, string> = { planned: "in_progress", in_progress: "done", done: "planned" };

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function SchedulePanel({ dashboardId }: { dashboardId: number }) {
  const { subscribe } = useWs();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [view, setView] = useState<View>("date");
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    const data = await api<{ items: ScheduleItem[] }>(`/api/dashboards/${dashboardId}/schedules`);
    setItems(data.items);
  }, [dashboardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const unsub = [
      subscribe("schedule_created", (s: ScheduleItem) => {
        if (s.dashboard_id !== dashboardId) return;
        setItems((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
      }),
      subscribe("schedule_updated", (s: ScheduleItem) => {
        if (s.dashboard_id !== dashboardId) return;
        setItems((prev) => prev.map((x) => (x.id === s.id ? s : x)));
      }),
      subscribe("schedule_deleted", (d: { id: number; dashboard_id: number }) => {
        if (d.dashboard_id !== dashboardId) return;
        setItems((prev) => prev.filter((x) => x.id !== d.id));
      }),
    ];
    return () => unsub.forEach((u) => u());
  }, [subscribe, dashboardId]);

  const groups = useMemo(() => {
    const key: keyof ScheduleItem = view === "date" ? "date" : "client";
    const map = new Map<string, ScheduleItem[]>();
    for (const it of items) {
      const k = it[key] as string;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, list]) => ({
        key: k,
        items: [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      }));
  }, [items, view]);

  async function cycleStatus(item: ScheduleItem) {
    const status = NEXT_STATUS[item.status] as ScheduleItem["status"];
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status } : x)));
    api(`/api/dashboards/${dashboardId}/schedules/${item.id}`, { method: "PATCH", body: { status } }).catch(() => {});
  }

  async function remove(id: number) {
    setItems((prev) => prev.filter((x) => x.id !== id));
    api(`/api/dashboards/${dashboardId}/schedules/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {(["date", "client"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "date" ? "By Date" : "By Client"}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Add entry
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {groups.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center text-slate-400">
            <div className="text-4xl">📅</div>
            <p className="mt-2 text-sm">No schedule entries yet. Add your first one!</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {view === "date" ? formatDateHeading(g.key) : g.key}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {g.items.length}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {g.items.map((it, i) => (
                    <div
                      key={it.id}
                      className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-slate-100" : ""}`}
                    >
                      <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-slate-500">{it.time}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">{it.task || "(no task)"}</p>
                        <p className="truncate text-sm text-slate-400">
                          {view === "date" ? it.client : formatDateHeading(it.date)}
                        </p>
                      </div>
                      <button
                        onClick={() => cycleStatus(it)}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[it.status]}`}
                        title="Click to change status"
                      >
                        {STATUS_LABEL[it.status]}
                      </button>
                      <button
                        onClick={() => remove(it.id)}
                        className="shrink-0 text-slate-300 hover:text-red-500"
                        aria-label="Delete entry"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ScheduleForm dashboardId={dashboardId} onClose={() => setShowForm(false)} onCreated={reload} />
      )}
    </div>
  );
}

function ScheduleForm({
  dashboardId,
  onClose,
  onCreated,
}: {
  dashboardId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, time: "09:00", client: "", task: "", status: "planned" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/dashboards/${dashboardId}/schedules`, { method: "POST", body: form });
      await onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-md animate-fade-in rounded-2xl bg-white p-6 shadow-note">
        <h3 className="text-lg font-semibold text-slate-900">New schedule entry</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <label className="label">Time</label>
            <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">Client</label>
          <input className="input" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="e.g. Acme Corp" required />
        </div>
        <div className="mt-3">
          <label className="label">Task</label>
          <input className="input" value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} placeholder="e.g. Kickoff call" />
        </div>
        <div className="mt-3">
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
