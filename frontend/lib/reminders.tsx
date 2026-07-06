"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, BellRing } from "lucide-react";
import { api } from "./api";
import { useAuth } from "./auth";
import { useWs } from "./ws";
import type { ScheduleItem } from "./types";

/** Play a simple repeating alarm tone via Web Audio. Returns a stop() function. */
function playAlarm(): () => void {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  ctx.resume?.();
  let stopped = false;

  const beep = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur);
  };

  const cycle = () => {
    if (stopped) return;
    const t = ctx.currentTime;
    beep(880, t, 0.18);
    beep(1175, t + 0.24, 0.18);
    beep(880, t + 0.48, 0.22);
    setTimeout(cycle, 1500);
  };
  cycle();

  return () => {
    stopped = true;
    setTimeout(() => ctx.close().catch(() => {}), 150);
  };
}

function scheduleTime(s: ScheduleItem): number {
  return new Date(`${s.date}T${s.time}`).getTime();
}

const FIRED_KEY = "cpd.firedReminders";

export function ReminderProvider() {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [alarm, setAlarm] = useState<ScheduleItem | null>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const fired = useRef<Set<string>>(new Set());

  const lead = user?.reminder_lead_minutes ?? 0;

  // Load which reminders already fired (so a reload doesn't re-alarm).
  useEffect(() => {
    try {
      fired.current = new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || "[]"));
    } catch {
      fired.current = new Set();
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await api<{ items: ScheduleItem[] }>("/api/schedules/upcoming");
      setItems(data.items);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch upcoming schedules; refresh on schedule changes and every 5 min.
  useEffect(() => {
    reload();
    const unsubs = [
      subscribe("schedule_created", reload),
      subscribe("schedule_updated", reload),
      subscribe("schedule_deleted", reload),
    ];
    const poll = setInterval(reload, 5 * 60 * 1000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(poll);
    };
  }, [reload, subscribe]);

  const trigger = useCallback((s: ScheduleItem) => {
    setAlarm(s);
    stopSound.current?.();
    stopSound.current = playAlarm();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Meeting reminder", {
          body: `${s.task || "Meeting"}${s.client ? ` · ${s.client}` : ""} at ${s.time}`,
        });
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Check every 30s whether any meeting has entered its reminder window.
  useEffect(() => {
    if (!lead) return; // "Never"
    const check = () => {
      if (alarm) return; // one alarm at a time
      const now = Date.now();
      for (const s of items) {
        const start = scheduleTime(s);
        if (Number.isNaN(start)) continue;
        const fireAt = start - lead * 60 * 1000;
        const key = `${s.id}@${s.date}T${s.time}`;
        if (now >= fireAt && now < start && !fired.current.has(key)) {
          fired.current.add(key);
          localStorage.setItem(FIRED_KEY, JSON.stringify([...fired.current]));
          trigger(s);
          break;
        }
      }
    };
    check();
    const id = setInterval(check, 30 * 1000);
    return () => clearInterval(id);
  }, [items, lead, alarm, trigger]);

  function dismiss() {
    stopSound.current?.();
    stopSound.current = null;
    setAlarm(null);
  }

  function snooze() {
    const s = alarm;
    dismiss();
    if (s) setTimeout(() => trigger(s), 5 * 60 * 1000);
  }

  if (!alarm) return null;

  const minsUntil = Math.max(0, Math.round((scheduleTime(alarm) - Date.now()) / 60000));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={dismiss} />
      <div className="relative z-10 w-full max-w-sm animate-fade-in rounded-2xl bg-white p-6 text-center shadow-note">
        <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <BellRing size={28} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Meeting reminder</h3>
        <p className="mt-1 text-slate-600">
          {minsUntil === 0 ? "Starting now" : `Starts in ${minsUntil} min`}
        </p>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left">
          <p className="font-medium text-slate-800">{alarm.task || "Meeting"}</p>
          <p className="text-sm text-slate-500">
            {alarm.client} · {alarm.time}
          </p>
        </div>
        <div className="mt-6 flex gap-2">
          <button onClick={snooze} className="btn-ghost flex-1">
            <AlarmClock size={16} /> Snooze 5 min
          </button>
          <button onClick={dismiss} className="btn-primary flex-1">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
