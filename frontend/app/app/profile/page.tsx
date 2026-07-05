"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import AvatarCropModal from "@/components/AvatarCropModal";

const AVATAR_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6", "#0ea5e9",
];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { push } = useToast();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [color, setColor] = useState(user?.avatar_color ?? "#6366f1");
  const [showEmail, setShowEmail] = useState(user?.show_email ?? true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!user) return null;

  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      push({ kind: "error", title: "Please choose an image file" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      push({ kind: "error", title: "Image too large", body: "Max 5 MB" });
      return;
    }
    // Open the crop editor instead of uploading immediately.
    setCropSrc(URL.createObjectURL(f));
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function uploadCropped(blob: Blob) {
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      await api("/api/users/me/avatar", { method: "POST", body: form });
      await refreshUser();
      push({ kind: "success", title: "Avatar updated" });
      closeCropper();
    } catch (err) {
      push({ kind: "error", title: "Upload failed", body: err instanceof ApiError ? err.message : "" });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    setUploadingAvatar(true);
    try {
      await api("/api/users/me/avatar", { method: "DELETE" });
      await refreshUser();
      push({ kind: "success", title: "Avatar removed" });
    } catch (err) {
      push({ kind: "error", title: "Couldn't remove avatar", body: err instanceof ApiError ? err.message : "" });
    } finally {
      setUploadingAvatar(false);
    }
  }

  const dirty =
    displayName !== user.display_name ||
    email !== user.email ||
    color !== user.avatar_color ||
    showEmail !== user.show_email;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api("/api/users/me", {
        method: "PATCH",
        body: { display_name: displayName, email, avatar_color: color, show_email: showEmail },
      });
      await refreshUser();
      push({ kind: "success", title: "Profile updated" });
    } catch (err) {
      push({ kind: "error", title: "Update failed", body: err instanceof ApiError ? err.message : "" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await api("/api/users/me/password", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      push({ kind: "success", title: "Password updated" });
    } catch (err) {
      push({ kind: "error", title: "Couldn't change password", body: err instanceof ApiError ? err.message : "" });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Profile & settings</h1>
      <p className="mt-1 text-slate-500">Manage how you appear to others and your account security.</p>

      {/* Profile card */}
      <form onSubmit={saveProfile} className="card mt-6 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Profile</h2>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={displayName || user.display_name} color={color} imageUrl={user.avatar_url} size={72} />
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickAvatar}
              />
              <button
                type="button"
                className="btn-ghost py-1.5"
                onClick={() => fileInput.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Uploading…" : user.avatar_url ? "Change photo" : "Upload photo"}
              </button>
              {user.avatar_url && (
                <button type="button" className="btn-danger py-1.5" onClick={removeAvatar} disabled={uploadingAvatar}>
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">JPG or PNG, up to 5 MB. Square images look best.</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-slate-600">
            Avatar color {user.avatar_url && <span className="text-slate-400">(used when no photo is set)</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ring-2 transition ${
                  color === c ? "ring-slate-800 ring-offset-2" : "ring-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Use ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label">Display name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={showEmail}
              onChange={(e) => setShowEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
            />
            <span className="text-sm">
              <span className="font-medium text-slate-800">Show my email to others</span>
              <span className="block text-slate-500">
                When off, your email is hidden from search results and friends.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button className="btn-primary" disabled={savingProfile || !dirty}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* Password card */}
      <form onSubmit={savePassword} className="card mt-6 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label">Current password</label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button className="btn-primary" disabled={savingPassword || !currentPassword || newPassword.length < 6}>
            {savingPassword ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>

      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          busy={uploadingAvatar}
          onCancel={closeCropper}
          onCropped={uploadCropped}
        />
      )}
    </div>
  );
}
