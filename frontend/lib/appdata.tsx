"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useWs } from "./ws";
import { useToast } from "@/components/Toast";
import type { Friendship, FriendRequest, Notification } from "./types";

interface AppData {
  friends: Friendship[];
  requests: FriendRequest[];
  notifications: Notification[];
  unreadNotifications: number;
  incomingRequests: FriendRequest[];
  reloadFriends: () => Promise<void>;
  reloadRequests: () => Promise<void>;
  reloadNotifications: () => Promise<void>;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ userId, children }: { userId: number; children: React.ReactNode }) {
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { subscribe } = useWs();
  const { push } = useToast();

  const reloadFriends = useCallback(async () => {
    setFriends(await api<Friendship[]>("/api/friends"));
  }, []);
  const reloadRequests = useCallback(async () => {
    setRequests(await api<FriendRequest[]>("/api/friend-requests"));
  }, []);
  const reloadNotifications = useCallback(async () => {
    setNotifications(await api<Notification[]>("/api/notifications"));
  }, []);

  useEffect(() => {
    reloadFriends();
    reloadRequests();
    reloadNotifications();
  }, [reloadFriends, reloadRequests, reloadNotifications]);

  // React to realtime events across the whole app.
  useEffect(() => {
    const unsub = [
      subscribe("friend_request_received", () => {
        reloadRequests();
      }),
      subscribe("friendship_created", () => {
        reloadFriends();
        reloadRequests();
      }),
      subscribe("notification", (data: Notification) => {
        setNotifications((prev) => [data, ...prev]);
        push({ kind: "info", title: data.title, body: data.body });
      }),
    ];
    return () => unsub.forEach((u) => u());
  }, [subscribe, reloadFriends, reloadRequests, push]);

  const incomingRequests = requests.filter((r) => r.receiver.id === userId);
  const unreadNotifications = notifications.filter((n) => !n.is_read).length;

  return (
    <AppDataContext.Provider
      value={{
        friends,
        requests,
        notifications,
        unreadNotifications,
        incomingRequests,
        reloadFriends,
        reloadRequests,
        reloadNotifications,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
