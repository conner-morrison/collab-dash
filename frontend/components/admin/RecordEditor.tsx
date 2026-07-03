"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { AdminColumn, AdminTable } from "@/lib/types";

interface Props {
  table: AdminTable;
  row: Record<string, any> | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}

function initialForm(table: AdminTable, row: Record<string, any> | null): Record<string, string> {
  const form: Record<string, string> = {};
  for (const col of table.columns) {
    const v = row ? row[col.name] : null;
    form[col.name] = v === null || v === undefined ? "" : String(v);
  }
  return form;
}

export default function RecordEditor({ table, row, onClose, onSaved }: Props) {
  const isCreate = row === null;
  const { push } = useToast();
  const [form, setForm] = useState<Record<string, string>>(() => initialForm(table, row));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // On create, hide server-managed columns; on edit, show them read-only.
  const editable = table.columns.filter((c) => !c.readonly);
  const readonly = table.columns.filter((c) => c.readonly);

  function field(col: AdminColumn) {
    const val = form[col.name] ?? "";
    const set = (v: string) => setForm((f) => ({ ...f, [col.name]: v }));

    if (col.type === "bool") {
      return (
        <select className="input" value={val} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    return (
      <input
        className="input"
        type={col.type === "int" ? "number" : "text"}
        value={val}
        onChange={(e) => set(e.target.value)}
        placeholder={col.nullable ? "(nullable)" : ""}
      />
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    // Only send editable fields; drop empty strings so nullable columns stay null.
    const payload: Record<string, any> = {};
    for (const col of editable) {
      const v = form[col.name];
      if (v !== "" && v !== undefined) payload[col.name] = v;
    }
    if (table.supports_password && password) payload.password = password;

    try {
      if (isCreate) {
        await api(`/api/admin/tables/${table.name}`, { method: "POST", body: payload });
        push({ kind: "success", title: "Row created" });
      } else {
        await api(`/api/admin/tables/${table.name}/${row!.id}`, { method: "PATCH", body: payload });
        push({ kind: "success", title: "Row updated" });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <form
        onSubmit={save}
        className="relative z-10 max-h-[85vh] w-full max-w-lg animate-fade-in overflow-y-auto rounded-2xl bg-white p-6 shadow-note"
      >
        <h3 className="text-lg font-semibold text-slate-900">
          {isCreate ? "Add row" : "Edit row"} <span className="text-slate-400">· {table.name}</span>
        </h3>

        <div className="mt-4 space-y-3">
          {editable.map((col) => (
            <div key={col.name}>
              <label className="label">
                {col.name}
                <span className="ml-1 text-xs font-normal text-slate-400">{col.type}</span>
              </label>
              {field(col)}
            </div>
          ))}

          {table.supports_password && (
            <div>
              <label className="label">
                password
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {isCreate ? "(sets login password)" : "(leave blank to keep current)"}
                </span>
              </label>
              <input
                className="input"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
          )}

          {!isCreate && readonly.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Read-only</p>
              <div className="space-y-1">
                {readonly.map((col) => (
                  <div key={col.name} className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-500">{col.name}</span>
                    <span className="truncate font-mono text-slate-700">{String(row![col.name] ?? "—")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : isCreate ? "Create" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
