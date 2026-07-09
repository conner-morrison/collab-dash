"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Link2,
  Pencil,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useWs } from "@/lib/ws";
import type {
  ClientItem,
  ClientSource,
  ClientStatus,
  ClientType,
  ScheduleItem,
  ScheduleReference,
} from "@/lib/types";

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

// ---- Client info (shown per client in the By Client view) ----
const CLIENT_STATUS_OPTIONS: ClientStatus[] = ["screening", "intro", "tech", "background", "contract", "working"];
const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  screening: "Screening",
  intro: "Intro",
  tech: "Tech",
  background: "Background",
  contract: "Contract",
  working: "Working",
};
const CLIENT_STATUS_STYLES: Record<ClientStatus, string> = {
  screening: "bg-slate-100 text-slate-600",
  intro: "bg-sky-100 text-sky-700",
  tech: "bg-violet-100 text-violet-700",
  background: "bg-amber-100 text-amber-700",
  contract: "bg-orange-100 text-orange-700",
  working: "bg-emerald-100 text-emerald-700",
};
const CLIENT_STATUS_DOT: Record<ClientStatus, string> = {
  screening: "bg-slate-400",
  intro: "bg-sky-500",
  tech: "bg-violet-500",
  background: "bg-amber-500",
  contract: "bg-orange-500",
  working: "bg-emerald-500",
};
const CLIENT_TYPE_OPTIONS: ClientType[] = ["job", "project"];
const CLIENT_TYPE_LABEL: Record<ClientType, string> = { job: "Job", project: "Project" };
const CLIENT_SOURCE_OPTIONS: ClientSource[] = ["upwork", "outreach", "invite", "introducer"];
const CLIENT_SOURCE_LABEL: Record<ClientSource, string> = {
  upwork: "Upwork",
  outreach: "Outreach",
  invite: "Invite",
  introducer: "Introducer",
};

// "Depth" effect for the By Date view: entries further in the future recede
// (shrink + fade); the focus line is where the nearest-upcoming entry sits.
const FOCUS_RATIO = 0.62; // focus line as a fraction of the viewport height
const MIN_SCALE = 0.72;
const MIN_OPACITY = 0.5;

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// Cal.com booking page used by the "Add to Calendar" action. Change this to
// point at a different booking link.
const CALCOM_BOOKING_URL = "https://cal.com/mario-iturrino-ake0fh/discovery-call";

/** Open the Cal.com booking page landed on the entry's date, with the entry's
 * time and content prefilled into the notes. Cal.com supports preselecting the
 * date (and prefilling notes) via URL, but not forcing an exact time slot — the
 * visitor still picks from the host's available times, so we surface the desired
 * time in the notes. */
function calcomBookingUrl(it: ScheduleItem): string {
  const [year, month] = it.date.split("-");
  const noteLines = [
    it.time ? `Requested time: ${it.time}` : "",
    it.client ? `Client: ${it.client}` : "",
    it.task ? `Task: ${it.task}` : "",
    it.note || "",
    ...(it.reference_urls ?? []).map((r) => (r.label ? `${r.label}: ${r.url}` : r.url)),
  ].filter(Boolean);
  const params = new URLSearchParams({ month: `${year}-${month}`, date: it.date });
  if (noteLines.length) params.set("notes", noteLines.join("\n"));
  return `${CALCOM_BOOKING_URL}?${params.toString()}`;
}

export default function SchedulePanel({ dashboardId }: { dashboardId: number }) {
  const { subscribe } = useWs();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [view, setView] = useState<View>("date");
  const [query, setQuery] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  // undefined = closed, null = creating, item = editing
  const [formItem, setFormItem] = useState<ScheduleItem | null | undefined>(undefined);
  // When adding an entry from a client header, lock the client field to this name.
  const [lockedClient, setLockedClient] = useState<string | null>(null);
  // Entry pending deletion — drives the confirmation dialog.
  const [pendingDelete, setPendingDelete] = useState<ScheduleItem | null>(null);
  // Client editor. lockName=true when editing a client tied to schedule entries
  // (name is the join key); false when adding a brand-new client.
  const [clientForm, setClientForm] = useState<
    { name: string; existing: ClientItem | null; lockName: boolean } | undefined
  >(undefined);

  // Client info keyed by client name, for the By Client view.
  const clientsByName = useMemo(() => {
    const m = new Map<string, ClientItem>();
    for (const c of clients) m.set(c.name, c);
    return m;
  }, [clients]);

  // "About the client" navigation: switch to By Client, reveal + briefly highlight.
  const [focusClient, setFocusClient] = useState<string | null>(null);
  const [highlightClient, setHighlightClient] = useState<string | null>(null);

  const goToClient = useCallback((name: string) => {
    setView("client");
    setExpandedClients((prev) => new Set(prev).add(name));
    setFocusClient(name);
    setHighlightClient(name);
  }, []);

  useEffect(() => {
    if (!highlightClient) return;
    const t = setTimeout(() => setHighlightClient(null), 2200);
    return () => clearTimeout(t);
  }, [highlightClient]);

  function toggleClient(key: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const reload = useCallback(async () => {
    const [sched, cl] = await Promise.all([
      api<{ items: ScheduleItem[] }>(`/api/dashboards/${dashboardId}/schedules`),
      api<{ items: ClientItem[] }>(`/api/dashboards/${dashboardId}/clients`),
    ]);
    setItems(sched.items);
    setClients(cl.items);
  }, [dashboardId]);

  const reloadClients = useCallback(async () => {
    const cl = await api<{ items: ClientItem[] }>(`/api/dashboards/${dashboardId}/clients`);
    setClients(cl.items);
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
      subscribe("client_created", (c: ClientItem) => {
        if (c.dashboard_id !== dashboardId) return;
        setClients((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      }),
      subscribe("client_updated", (c: ClientItem) => {
        if (c.dashboard_id !== dashboardId) return;
        setClients((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      }),
      subscribe("client_deleted", (d: { id: number; dashboard_id: number }) => {
        if (d.dashboard_id !== dashboardId) return;
        setClients((prev) => prev.filter((x) => x.id !== d.id));
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
    // By Client: also surface clients that have an info record but no (matching)
    // schedule entries yet, so freshly-added clients still appear.
    if (view === "client") {
      const q = query.trim().toLowerCase();
      for (const c of clients) {
        if (map.has(c.name)) continue;
        const hay = [c.name, c.company, c.title, CLIENT_SOURCE_LABEL[c.source], c.introducer].join(" ").toLowerCase();
        if (q && !hay.includes(q)) continue;
        map.set(c.name, []);
      }
    }
    return [...map.entries()]
      // By Date: newest date group first. By Client: keep clients alphabetical.
      .sort((a, b) => (view === "date" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
      .map(([k, list]) => ({
        key: k,
        // Most recent entry on top within each group.
        items: [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
      }));
  }, [filtered, view, clients, query]);

  // --- By Date "depth" effect ------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const didInitialScroll = useRef(false);
  // Local (wall-clock) today, so date/time comparisons match how entries are entered.
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  // The single very-next schedule entry by date+time (the soonest one that
  // hasn't started yet). This is the one we focus.
  const upcomingItemId = useMemo(() => {
    if (view !== "date") return null;
    const d = new Date();
    const nowKey = `${todayIso}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    let bestId: number | null = null;
    let bestKey = "";
    for (const it of items) {
      const key = `${it.date}T${it.time}`;
      if (key < nowKey) continue;
      if (bestId === null || key < bestKey) {
        bestId = it.id;
        bestKey = key;
      }
    }
    return bestId;
  }, [items, view, todayIso]);

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
    if (!container || items.length === 0) return;
    didInitialScroll.current = true;
    if (upcomingItemId === null) return;
    const el = container.querySelector<HTMLElement>(`[data-schedule-item="${upcomingItemId}"]`);
    if (!el) return;
    container.scrollTop = el.offsetTop + el.offsetHeight / 2 - container.clientHeight * FOCUS_RATIO;
    applyDepth();
  }, [items, upcomingItemId, view, applyDepth]);

  // After "About the client" switches to By Client, scroll the client into view.
  useEffect(() => {
    if (!focusClient || view !== "client") return;
    const container = scrollRef.current;
    if (container) {
      const el = container.querySelector<HTMLElement>(`[data-schedule-group="${CSS.escape(focusClient)}"]`);
      if (el) container.scrollTop = Math.max(0, el.offsetTop - 12);
    }
    setFocusClient(null);
  }, [focusClient, view, groups]);
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
          {view === "client" ? (
            <button className="btn-primary" onClick={() => setClientForm({ name: "", existing: null, lockName: false })}>
              + Add client
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setFormItem(null)}>
              + Add entry
            </button>
          )}
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
              // By Date: always expanded. By Client: expanded when clicked, or while searching.
              const open = !isClient || expandedClients.has(g.key) || !!query.trim();
              return (
              <div key={g.key} data-schedule-group={g.key}>
                {isClient ? (
                  <ClientHeader
                    name={g.key}
                    count={g.items.length}
                    info={clientsByName.get(g.key) ?? null}
                    open={open}
                    highlight={highlightClient === g.key}
                    onToggle={() => toggleClient(g.key)}
                    onEdit={() => setClientForm({ name: g.key, existing: clientsByName.get(g.key) ?? null, lockName: true })}
                    onAddSchedule={() => {
                      setLockedClient(g.key);
                      setFormItem(null);
                    }}
                  />
                ) : (
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">{formatDateHeading(g.key)}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {g.items.length}
                    </span>
                  </div>
                )}
                {open && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {g.items.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">
                      No schedule entries for this client yet.
                    </p>
                  )}
                  {g.items.map((it, i) => (
                    <div
                      key={it.id}
                      data-schedule-item={it.id}
                      className={`px-4 py-3 ${i > 0 ? "border-t border-slate-100" : ""} ${
                        it.id === upcomingItemId ? "bg-red-50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-14 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-slate-500">{it.time}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-slate-800">{it.task || "(no task)"}</p>
                            {it.id === upcomingItemId && (
                              <span className="shrink-0 rounded-full bg-red-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Up next
                              </span>
                            )}
                          </div>
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
                        <div className="mt-0.5 flex shrink-0 flex-col items-stretch gap-1">
                          <button
                            onClick={() => setFormItem(it)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                          >
                            Edit
                          </button>
                          {view === "date" && (
                            <button
                              onClick={() => goToClient(it.client)}
                              className="flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              title="View this client's info"
                            >
                              <UserRound size={12} className="shrink-0" />
                              About the client
                            </button>
                          )}
                          <a
                            href={calcomBookingUrl(it)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            title="Book on Cal.com — opens on this date with the entry's time and details in the notes"
                          >
                            <CalendarCheck size={12} className="shrink-0" />
                            Add to Calendar
                          </a>
                        </div>
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
          lockedClient={lockedClient}
          onClose={() => {
            setFormItem(undefined);
            setLockedClient(null);
          }}
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

      {clientForm && (
        <ClientInfoForm
          dashboardId={dashboardId}
          name={clientForm.name}
          existing={clientForm.existing}
          lockName={clientForm.lockName}
          onClose={() => setClientForm(undefined)}
          onSaved={reloadClients}
        />
      )}
    </div>
  );
}

/** Header for a client group in the By Client view: shows the client's info and
 * toggles the related schedule entries when clicked. */
function ClientHeader({
  name,
  count,
  info,
  open,
  highlight,
  onToggle,
  onEdit,
  onAddSchedule,
}: {
  name: string;
  count: number;
  info: ClientItem | null;
  open: boolean;
  highlight: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddSchedule: () => void;
}) {
  return (
    <div
      className={`mb-2 flex items-start gap-2 rounded-xl border bg-white px-4 py-3 transition-shadow ${
        highlight ? "border-brand-300 ring-2 ring-brand-200" : "border-slate-200"
      }`}
    >
      <button onClick={onToggle} className="flex min-w-0 flex-1 flex-col items-start text-left">
        <div className="flex w-full items-center gap-2">
          <span className="truncate font-semibold text-slate-800">{name}</span>
          {info?.company && (
            <span className="flex min-w-0 items-center gap-1 truncate text-sm text-slate-400">
              <Building2 size={13} className="shrink-0" />
              {info.company}
            </span>
          )}
          {info && (
            <span
              className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-wide ring-1 ring-inset ring-black/5 ${CLIENT_STATUS_STYLES[info.status]}`}
            >
              <span className={`h-2 w-2 rounded-full ${CLIENT_STATUS_DOT[info.status]}`} />
              {CLIENT_STATUS_LABEL[info.status]}
            </span>
          )}
          <span
            className={`${info ? "" : "ml-auto"} shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500`}
          >
            {count}
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
        {info ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {CLIENT_TYPE_LABEL[info.type]}
            </span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              {CLIENT_SOURCE_LABEL[info.source]}
              {info.source === "introducer" && info.introducer ? ` · ${info.introducer}` : ""}
            </span>
            {info.title && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Briefcase size={12} className="shrink-0 text-slate-400" />
                {info.title}
              </span>
            )}
          </div>
        ) : (
          <span className="mt-1 text-xs text-slate-400">No client info yet — add company, status, type…</span>
        )}
      </button>
      <div className="flex shrink-0 flex-col items-stretch gap-1">
        <button
          onClick={onEdit}
          className="flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
          aria-label="Edit client info"
        >
          <Pencil size={13} />
          <span className="hidden sm:inline">{info ? "Edit info" : "Add info"}</span>
        </button>
        <button
          onClick={onAddSchedule}
          className="flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Add schedule for this client"
        >
          <CalendarPlus size={13} />
          <span className="hidden sm:inline">Add schedule</span>
        </button>
      </div>
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
  lockedClient,
  onClose,
  onSaved,
}: {
  dashboardId: number;
  existing: ScheduleItem | null; // null = create
  lockedClient?: string | null; // when creating from a client, fixes the client field
  onClose: () => void;
  onSaved: () => void;
}) {
  const clientLocked = !existing && !!lockedClient;
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
    client: existing?.client ?? lockedClient ?? "",
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
          <input
            className={`input ${clientLocked ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""}`}
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
            placeholder="e.g. Acme Corp"
            required
            readOnly={clientLocked}
          />
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

/** Edit the info attached to a client (matched to schedule entries by name). */
function ClientInfoForm({
  dashboardId,
  name,
  existing,
  lockName,
  onClose,
  onSaved,
}: {
  dashboardId: number;
  name: string; // initial client name (join key with schedule entries)
  existing: ClientItem | null; // null = no info record yet
  lockName: boolean; // true when the name is fixed (tied to schedule entries)
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientName, setClientName] = useState(name);
  const [form, setForm] = useState({
    company: existing?.company ?? "",
    status: (existing?.status ?? "screening") as ClientStatus,
    type: (existing?.type ?? "job") as ClientType,
    title: existing?.title ?? "",
    source: (existing?.source ?? "upwork") as ClientSource,
    introducer: existing?.introducer ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...form, introducer: form.source === "introducer" ? form.introducer.trim() : "" };
    try {
      if (existing) {
        await api(`/api/dashboards/${dashboardId}/clients/${existing.id}`, { method: "PATCH", body });
      } else {
        await api(`/api/dashboards/${dashboardId}/clients`, { method: "POST", body: { name: clientName.trim(), ...body } });
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
        <h3 className="text-lg font-semibold text-slate-900">{lockName ? "Client info" : "New client"}</h3>
        {lockName ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <UserRound size={14} className="shrink-0" />
            {name}
          </p>
        ) : (
          <div className="mt-4">
            <label className="label">Name</label>
            <input
              className="input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Jane Doe"
              required
              autoFocus
            />
          </div>
        )}

        <div className="mt-4">
          <label className="label">Company</label>
          <input
            className="input"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="e.g. Acme Corp"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
            >
              {CLIENT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ClientType })}
            >
              {CLIENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="label">Title</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Senior Frontend Engineer"
          />
        </div>

        <div className="mt-3">
          <label className="label">From</label>
          <select
            className="input"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as ClientSource })}
          >
            {CLIENT_SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CLIENT_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {form.source === "introducer" && (
          <div className="mt-3">
            <label className="label">Introducer</label>
            <input
              className="input"
              value={form.introducer}
              onChange={(e) => setForm({ ...form, introducer: e.target.value })}
              placeholder="Who introduced this client?"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || (!lockName && !clientName.trim())}>
            {busy ? "Saving…" : lockName ? "Save info" : "Add client"}
          </button>
        </div>
      </form>
    </div>
  );
}
