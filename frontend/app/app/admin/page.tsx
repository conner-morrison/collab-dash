"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import RecordEditor from "@/components/admin/RecordEditor";
import type { AdminColumn, AdminTable } from "@/lib/types";

interface RowsResponse {
  table: string;
  total: number;
  columns: AdminColumn[];
  rows: Record<string, any>[];
}

function Cell({ value }: { value: any }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-slate-300">—</span>;
  if (value === true) return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">true</span>;
  if (value === false) return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">false</span>;
  const s = String(value);
  return <span title={s}>{s.length > 48 ? s.slice(0, 48) + "…" : s}</span>;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { push } = useToast();

  const [tables, setTables] = useState<AdminTable[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [editing, setEditing] = useState<{ row: Record<string, any> | null } | null>(null);

  // Guard: only admins.
  useEffect(() => {
    if (!loading && user && !user.is_admin) router.replace("/app");
  }, [loading, user, router]);

  const loadTables = useCallback(async () => {
    const t = await api<AdminTable[]>("/api/admin/tables");
    setTables(t);
    setActive((cur) => cur ?? t[0]?.name ?? null);
  }, []);

  const loadRows = useCallback(async (table: string) => {
    setLoadingRows(true);
    try {
      setData(await api<RowsResponse>(`/api/admin/tables/${table}`));
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_admin) loadTables();
  }, [user, loadTables]);

  useEffect(() => {
    if (active) loadRows(active);
  }, [active, loadRows]);

  const activeTable = tables.find((t) => t.name === active) || null;

  async function refresh() {
    await loadTables();
    if (active) await loadRows(active);
  }

  async function del(rowId: number) {
    if (!active) return;
    if (!confirm(`Delete row #${rowId} from ${active}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/tables/${active}/${rowId}`, { method: "DELETE" });
      push({ kind: "success", title: "Row deleted" });
      await refresh();
    } catch (err) {
      push({ kind: "error", title: "Delete failed", body: err instanceof ApiError ? err.message : "" });
    }
  }

  if (loading || !user) return null;
  if (!user.is_admin) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">🛠️ Admin console</h1>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            full database access
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">View, add, edit, and delete rows across every table.</p>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Table list */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
          {tables.map((t) => (
            <button
              key={t.name}
              onClick={() => setActive(t.name)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                active === t.name ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="truncate font-mono text-[13px]">{t.name}</span>
              <span className="ml-2 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{t.count}</span>
            </button>
          ))}
        </aside>

        {/* Rows */}
        <div className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-mono text-lg font-semibold text-slate-800">{active}</h2>
              {data && <p className="text-sm text-slate-400">{data.total} rows</p>}
            </div>
            {activeTable && (
              <button className="btn-primary" onClick={() => setEditing({ row: null })}>
                + Add row
              </button>
            )}
          </div>

          {loadingRows ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : data && activeTable ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {activeTable.columns.map((c) => (
                      <th key={c.name} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">
                        {c.name}
                      </th>
                    ))}
                    <th className="sticky right-0 bg-slate-50 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={activeTable.columns.length + 1} className="px-3 py-8 text-center text-slate-400">
                        No rows yet.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      {activeTable.columns.map((c) => (
                        <td key={c.name} className="max-w-[16rem] truncate whitespace-nowrap px-3 py-2 text-slate-700">
                          <Cell value={r[c.name]} />
                        </td>
                      ))}
                      <td className="sticky right-0 bg-white px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditing({ row: r })}
                            className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => del(r.id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {editing && activeTable && (
        <RecordEditor
          table={activeTable}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
