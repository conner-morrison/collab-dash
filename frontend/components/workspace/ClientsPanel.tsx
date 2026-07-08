"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Building2, Search, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { useWs } from "@/lib/ws";
import type { ClientItem, ClientSource, ClientStatus, ClientType } from "@/lib/types";

const STATUS_OPTIONS: ClientStatus[] = ["screening", "intro", "tech", "background", "contract", "working"];
const STATUS_LABEL: Record<ClientStatus, string> = {
  screening: "Screening",
  intro: "Intro",
  tech: "Tech",
  background: "Background",
  contract: "Contract",
  working: "Working",
};
const STATUS_STYLES: Record<ClientStatus, string> = {
  screening: "bg-slate-100 text-slate-600",
  intro: "bg-sky-100 text-sky-700",
  tech: "bg-violet-100 text-violet-700",
  background: "bg-amber-100 text-amber-700",
  contract: "bg-orange-100 text-orange-700",
  working: "bg-emerald-100 text-emerald-700",
};
// Click the status badge to advance a client along the pipeline.
const NEXT_STATUS: Record<ClientStatus, ClientStatus> = {
  screening: "intro",
  intro: "tech",
  tech: "background",
  background: "contract",
  contract: "working",
  working: "screening",
};

const TYPE_OPTIONS: ClientType[] = ["job", "project"];
const TYPE_LABEL: Record<ClientType, string> = { job: "Job", project: "Project" };

const SOURCE_OPTIONS: ClientSource[] = ["upwork", "outreach", "invite", "introducer"];
const SOURCE_LABEL: Record<ClientSource, string> = {
  upwork: "Upwork",
  outreach: "Outreach",
  invite: "Invite",
  introducer: "Introducer",
};

export default function ClientsPanel({ dashboardId }: { dashboardId: number }) {
  const { subscribe } = useWs();
  const [items, setItems] = useState<ClientItem[]>([]);
  const [query, setQuery] = useState("");
  // undefined = closed, null = creating, item = editing
  const [formItem, setFormItem] = useState<ClientItem | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<ClientItem | null>(null);

  const reload = useCallback(async () => {
    const data = await api<{ items: ClientItem[] }>(`/api/dashboards/${dashboardId}/clients`);
    setItems(data.items);
  }, [dashboardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const unsub = [
      subscribe("client_created", (c: ClientItem) => {
        if (c.dashboard_id !== dashboardId) return;
        setItems((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
      }),
      subscribe("client_updated", (c: ClientItem) => {
        if (c.dashboard_id !== dashboardId) return;
        setItems((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      }),
      subscribe("client_deleted", (d: { id: number; dashboard_id: number }) => {
        if (d.dashboard_id !== dashboardId) return;
        setItems((prev) => prev.filter((x) => x.id !== d.id));
      }),
    ];
    return () => unsub.forEach((u) => u());
  }, [subscribe, dashboardId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.name, c.company, c.title, STATUS_LABEL[c.status], TYPE_LABEL[c.type], SOURCE_LABEL[c.source], c.introducer]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

  function cycleStatus(client: ClientItem) {
    const status = NEXT_STATUS[client.status];
    setItems((prev) => prev.map((x) => (x.id === client.id ? { ...x, status } : x)));
    api(`/api/dashboards/${dashboardId}/clients/${client.id}`, { method: "PATCH", body: { status } }).catch(() => {});
  }

  function confirmDelete() {
    const client = pendingDelete;
    if (!client) return;
    setPendingDelete(null);
    setItems((prev) => prev.filter((x) => x.id !== client.id));
    api(`/api/dashboards/${dashboardId}/clients/${client.id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Clients</h2>
          <button className="btn-primary" onClick={() => setFormItem(null)}>
            + Add client
          </button>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            placeholder="Search clients — name, company, title, status…"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {filtered.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center text-slate-400">
            {query.trim() ? (
              <>
                <Search size={40} className="mx-auto" strokeWidth={1.5} />
                <p className="mt-2 text-sm">No clients match “{query.trim()}”.</p>
              </>
            ) : (
              <>
                <UserRound size={40} className="mx-auto" strokeWidth={1.5} />
                <p className="mt-2 text-sm">No clients yet. Add your first one!</p>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Name is the headline */}
                    <p className="truncate text-base font-semibold text-slate-900">{c.name}</p>
                    {c.company && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-slate-500">
                        <Building2 size={13} className="shrink-0" /> {c.company}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => cycleStatus(c)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[c.status]}`}
                    title="Click to advance status"
                  >
                    {STATUS_LABEL[c.status]}
                  </button>
                  <button
                    onClick={() => setFormItem(c)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setPendingDelete(c)}
                    className="shrink-0 text-slate-300 hover:text-red-500"
                    aria-label="Delete client"
                  >
                    <X size={16} />
                  </button>
                </div>

                {c.title && (
                  <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
                    <Briefcase size={13} className="shrink-0 text-slate-400" /> {c.title}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {TYPE_LABEL[c.type]}
                  </span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {SOURCE_LABEL[c.source]}
                    {c.source === "introducer" && c.introducer ? ` · ${c.introducer}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formItem !== undefined && (
        <ClientForm
          dashboardId={dashboardId}
          existing={formItem}
          onClose={() => setFormItem(undefined)}
          onSaved={reload}
        />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPendingDelete(null)} />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-sm animate-fade-in rounded-2xl bg-white p-6 shadow-note"
          >
            <h3 className="text-lg font-semibold text-slate-900">Delete client?</h3>
            <p className="mt-2 text-sm text-slate-500">
              “<span className="font-medium text-slate-700">{pendingDelete.name}</span>” will be permanently removed.
              This can&apos;t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPendingDelete(null)} autoFocus>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientForm({
  dashboardId,
  existing,
  onClose,
  onSaved,
}: {
  dashboardId: number;
  existing: ClientItem | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
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
    // Only keep the introducer name when the source is "introducer".
    const body = { ...form, introducer: form.source === "introducer" ? form.introducer.trim() : "" };
    try {
      if (existing) {
        await api(`/api/dashboards/${dashboardId}/clients/${existing.id}`, { method: "PATCH", body });
      } else {
        await api(`/api/dashboards/${dashboardId}/clients`, { method: "POST", body });
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
        <h3 className="text-lg font-semibold text-slate-900">{existing ? "Edit client" : "New client"}</h3>

        <div className="mt-4">
          <label className="label">Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Jane Doe"
            required
            autoFocus
          />
        </div>
        <div className="mt-3">
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
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
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
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
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
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
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
          <button className="btn-primary" disabled={busy || !form.name.trim()}>
            {busy ? "Saving…" : existing ? "Save changes" : "Add client"}
          </button>
        </div>
      </form>
    </div>
  );
}
