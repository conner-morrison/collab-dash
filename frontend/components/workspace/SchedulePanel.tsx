"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Link2, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useWs } from "@/lib/ws";
import type { ScheduleItem, ScheduleReference } from "@/lib/types";

function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

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

// "Depth" effect for the By Date view: entries further in the future recede
// (shrink + fade); the focus line is where the nearest-upcoming entry sits.
const FOCUS_RATIO = 0.62; // focus line as a fraction of the viewport height
const MIN_SCALE = 0.72;
const MIN_OPACITY = 0.5;

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function SchedulePanel({ dashboardId }: { dashboardId: number }) {
  const { subscribe } = useWs();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [view, setView] = useState<View>("date");
  const [query, setQuery] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  // undefined = closed, null = creating, item = editing
  const [formItem, setFormItem] = useState<ScheduleItem | null | undefined>(undefined);
  // Entry pending deletion — drives the confirmation dialog.
  const [pendingDelete, setPendingDelete] = useState<ScheduleItem | null>(null);

  function toggleClient(key: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const reload = useCallback(async () => {
    const data = await api<{ items: ScheduleItem[] }>(`/api/dashboards/${dashboardId}/schedules`);
    setItems(data.items);
  }, [dashboardId]);

  useEffect(() => {
    didInitialScroll.current = false;
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = [
        it.task,
        it.client,
        it.note,
        it.result,
        it.date,
        it.time,
        it.status,
        ...(it.reference_urls?.flatMap((r) => [r.label, r.url]) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const groups = useMemo(() => {
    const key: keyof ScheduleItem = view === "date" ? "date" : "client";
    const map = new Map<string, ScheduleItem[]>();
    for (const it of filtered) {
      const k = it[key] as string;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return [...map.entries()]
      // By Date: newest date group first. By Client: keep clients alphabetical.
      .sort((a, b) => (view === "date" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
      .map(([k, list]) => ({
        key: k,
        // Most recent entry on top within each group.
        items: [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
      }));
  }, [filtered, view]);

  // --- By Date "depth" effect ------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const didInitialScroll = useRef(false);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // The nearest-upcoming date group (smallest date >= today). groups are
  // date-descending, so it's the last group that isn't in the past.
  const upcomingKey = useMemo(() => {
    if (view !== "date") return null;
    const upcoming = groups.filter((g) => g.key >= todayIso);
    return upcoming.length ? upcoming[upcoming.length - 1].key : null;
  }, [groups, view, todayIso]);

  // Scale/fade each future date-group by how far it sits above the focus line.
  // Uses layout offsets (offsetTop/offsetHeight) so our own transform doesn't
  // feed back into the measurement.
  const applyDepth = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const active = view === "date";
    const focusY = container.clientHeight * FOCUS_RATIO;
    container.querySelectorAll<HTMLElement>("[data-schedule-group]").forEach((el) => {
      const date = el.dataset.scheduleGroup ?? "";
      // Only strictly-future groups recede; today and the past stay natural.
      if (!active || date <= todayIso) {
        el.style.transform = "";
        el.style.opacity = "";
        el.style.transformOrigin = "";
        el.style.willChange = "";
        return;
      }
      const centerY = el.offsetTop - container.scrollTop + el.offsetHeight / 2;
      const above = focusY - centerY;
      if (above <= 0) {
        el.style.transform = "scale(1)";
        el.style.opacity = "1";
        return;
      }
      const t = Math.min(1, above / focusY);
      el.style.transform = `scale(${(1 - t * (1 - MIN_SCALE)).toFixed(3)})`;
      el.style.opacity = (1 - t * (1 - MIN_OPACITY)).toFixed(3);
      el.style.transformOrigin = "center bottom";
      el.style.willChange = "transform";
    });
  }, [view, todayIso]);

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyDepth();
    });
  }, [applyDepth]);

  // Re-apply when the rendered groups or view change, and on resize.
  useEffect(() => {
    applyDepth();
  }, [applyDepth, groups]);

  useEffect(() => {
    const onResize = () => applyDepth();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyDepth]);

  // Once data is ready, center the nearest-upcoming entry so the past sits
  // below (scroll down) and further-future entries recede above (scroll up).
  useEffect(() => {
    if (didInitialScroll.current || view !== "date") return;
    const container = scrollRef.current;
    if (!container) return;
    // groups are date-descending, so the last group with date >= today is the
    // nearest upcoming one.
    const upcoming = groups.filter((g) => g.key >= todayIso);
    const target = upcoming.length ? upcoming[upcoming.length - 1].key : null;
    if (!target) return;
    const el = container.querySelector<HTMLElement>(`[data-schedule-group="${CSS.escape(target)}"]`);
    if (!el) return;
    container.scrollTop = el.offsetTop + el.offsetHeight / 2 - container.clientHeight * FOCUS_RATIO;
    didInitialScroll.current = true;
    applyDepth();
  }, [groups, view, todayIso, applyDepth]);
  // ---------------------------------------------------------------------------

  async function cycleStatus(item: ScheduleItem) {
    const status = NEXT_STATUS[item.status] as ScheduleItem["status"];
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status } : x)));
    api(`/api/dashboards/${dashboardId}/schedules/${item.id}`, { method: "PATCH", body: { status } }).catch(() => {});
  }

  function confirmDelete() {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    api(`/api/dashboards/${dashboardId}/schedules/${item.id}`, { method: "DELETE" }).catch(() => {});
  }

  // Inline field editing on the card (note / result), saved on blur.
  function setField(id: number, patch: Partial<ScheduleItem>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function saveField(id: number, patch: Partial<ScheduleItem>) {
    api(`/api/dashboards/${dashboardId}/schedules/${id}`, { method: "PATCH", body: patch }).catch(() => {});
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <button className="btn-primary" onClick={() => setFormItem(null)}>
            + Add entry
          </button>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            placeholder="Search schedules — task, client, note, result, link…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {groups.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center text-slate-400">
            {query.trim() ? (
              <>
                <Search size={40} className="mx-auto" strokeWidth={1.5} />
                <p className="mt-2 text-sm">No entries match “{query.trim()}”.</p>
              </>
            ) : (
              <>
                <CalendarDays size={40} className="mx-auto" strokeWidth={1.5} />
                <p className="mt-2 text-sm">No schedule entries yet. Add your first one!</p>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            {groups.map((g) => {
              const isClient = view === "client";
              const isUpcoming = g.key === upcomingKey;
              // By Date: always expanded. By Client: expanded when clicked, or while searching.
              const open = !isClient || expandedClients.has(g.key) || !!query.trim();
              return (
              <div key={g.key} data-schedule-group={g.key}>
                {isClient ? (
                  <button
                    onClick={() => toggleClient(g.key)}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-slate-800">{g.key}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {g.items.length}
                      </span>
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : (
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className={`text-sm font-semibold ${isUpcoming ? "text-brand-700" : "text-slate-700"}`}>
                      {formatDateHeading(g.key)}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isUpcoming ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {g.items.length}
                    </span>
                    {isUpcoming && (
                      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                        Up next
                      </span>
                    )}
                  </div>
                )}
                {open && (
                <div
                  className={`overflow-hidden rounded-xl border bg-white ${
                    isUpcoming ? "border-brand-300 ring-1 ring-brand-100" : "border-slate-200"
                  }`}
                >
                  {g.items.map((it, i) => (
                    <div key={it.id} className={`px-4 py-3 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                      <div className="flex items-start gap-3">
                        <span className="w-14 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-slate-500">{it.time}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{it.task || "(no task)"}</p>
                          <p className="truncate text-sm text-slate-400">
                            {view === "date" ? it.client : formatDateHeading(it.date)}
                          </p>
                          {it.reference_urls?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {it.reference_urls.map((ref, idx) => (
                                <a
                                  key={idx}
                                  href={normalizeUrl(ref.url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={ref.url}
                                  className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                                >
                                  <Link2 size={12} className="shrink-0" />
                                  <span className="truncate">{ref.label || hostOf(ref.url)}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => cycleStatus(it)}
                          className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[it.status]}`}
                          title="Click to change status"
                        >
                          {STATUS_LABEL[it.status]}
                        </button>
                        <button
                          onClick={() => setFormItem(it)}
                          className="mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setPendingDelete(it)}
                          className="mt-1 shrink-0 text-slate-300 hover:text-red-500"
                          aria-label="Delete entry"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {/* Editable note + result */}
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 sm:pl-14">
                        {(["note", "result"] as const).map((field) => (
                          <div key={field}>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                              {field === "note" ? "Note" : "Result"}
                            </label>
                            <textarea
                              rows={2}
                              value={it[field]}
                              placeholder={field === "note" ? "Describe this schedule…" : "Write the result…"}
                              onChange={(e) => setField(it.id, { [field]: e.target.value })}
                              onBlur={(e) => saveField(it.id, { [field]: e.target.value })}
                              className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {formItem !== undefined && (
        <ScheduleForm
          dashboardId={dashboardId}
          existing={formItem}
          onClose={() => setFormItem(undefined)}
          onSaved={reload}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          entry={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  entry,
  onCancel,
  onConfirm,
}: {
  entry: ScheduleItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = entry.task?.trim() || entry.client?.trim() || "this entry";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm animate-fade-in rounded-2xl bg-white p-6 shadow-note"
      >
        <h3 className="text-lg font-semibold text-slate-900">Delete schedule entry?</h3>
        <p className="mt-2 text-sm text-slate-500">
          “<span className="font-medium text-slate-700">{label}</span>” will be permanently removed. This can't be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleForm({
  dashboardId,
  existing,
  onClose,
  onSaved,
}: {
  dashboardId: number;
  existing: ScheduleItem | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<{
    date: string;
    time: string;
    client: string;
    task: string;
    status: string;
  }>({
    date: existing?.date ?? today,
    time: existing?.time ?? "09:00",
    client: existing?.client ?? "",
    task: existing?.task ?? "",
    status: existing?.status ?? "planned",
  });
  const [refs, setRefs] = useState<ScheduleReference[]>(existing?.reference_urls ?? []);
  const [busy, setBusy] = useState(false);

  const setRef = (i: number, patch: Partial<ScheduleReference>) =>
    setRefs((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRef = () => setRefs((prev) => [...prev, { label: "", url: "" }]);
  const removeRef = (i: number) => setRefs((prev) => prev.filter((_, idx) => idx !== i));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Keep only rows with a URL; normalize the scheme.
    const reference_urls = refs
      .filter((r) => r.url.trim())
      .map((r) => ({ label: r.label.trim(), url: normalizeUrl(r.url) }));
    const body = { ...form, reference_urls };
    try {
      if (existing) {
        await api(`/api/dashboards/${dashboardId}/schedules/${existing.id}`, { method: "PATCH", body });
      } else {
        await api(`/api/dashboards/${dashboardId}/schedules`, { method: "POST", body });
      }
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 max-h-[88vh] w-full max-w-md animate-fade-in overflow-y-auto rounded-2xl bg-white p-6 shadow-note"
      >
        <h3 className="text-lg font-semibold text-slate-900">
          {existing ? "Edit schedule entry" : "New schedule entry"}
        </h3>
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

        {/* Reference documents */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Reference docs</label>
            <button type="button" onClick={addRef} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              + Add link
            </button>
          </div>
          {refs.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">Attach links to specs, designs, or docs for this entry.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {refs.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input w-1/3"
                    placeholder="Label"
                    value={r.label}
                    onChange={(e) => setRef(i, { label: e.target.value })}
                  />
                  <input
                    className="input flex-1"
                    placeholder="https://…"
                    value={r.url}
                    onChange={(e) => setRef(i, { url: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeRef(i)}
                    className="shrink-0 rounded-md px-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    aria-label="Remove link"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : existing ? "Save changes" : "Add entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
