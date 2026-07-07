"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { tokenStore, refreshAccessToken } from "./api";
import type { WsEvent } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8010";

type Handler = (data: any) => void;

interface WsContextValue {
  connected: boolean;
  onlineUsers: Set<number>;
  subscribe: (event: string, handler: Handler) => () => void;
}

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const handlers = useRef<Map<string, Set<Handler>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const token = tokenStore.access;
      if (!token) return;
      const ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        setConnected(true);
      };
      ws.onclose = async () => {
        setConnected(false);
        if (closedByUs) return;
        // A close before we ever opened means the handshake was rejected — most
        // likely an expired access token. Refresh it once before reconnecting so
        // we don't spin forever on a dead token.
        if (!opened) await refreshAccessToken();
        retry = setTimeout(connect, 1500);
      };
      ws.onmessage = (ev) => {
        let msg: WsEvent;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.event === "presence_snapshot") {
          setOnlineUsers(new Set(msg.data.online));
          return;
        }
        if (msg.event === "presence") {
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            if (msg.data.online) next.add(msg.data.user_id);
            else next.delete(msg.data.user_id);
            return next;
          });
          return;
        }
        handlers.current.get(msg.event)?.forEach((h) => h(msg.data));
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [enabled]);

  const subscribe = (event: string, handler: Handler) => {
    if (!handlers.current.has(event)) handlers.current.set(event, new Set());
    handlers.current.get(event)!.add(handler);
    return () => handlers.current.get(event)?.delete(handler);
  };

  return (
    <WsContext.Provider value={{ connected, onlineUsers, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used within WsProvider");
  return ctx;
}

/** Convenience hook to subscribe to a single event for a component's lifetime. */
export function useWsEvent(event: string, handler: Handler, deps: any[] = []) {
  const { subscribe } = useWs();
  useEffect(() => {
    return subscribe(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
