"use client";

interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  online?: boolean;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, color = "#6366f1", size = 40, online }: AvatarProps) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
        style={{ backgroundColor: color, fontSize: size * 0.4 }}
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full ring-2 ring-white ${
            online ? "bg-emerald-500" : "bg-slate-300"
          }`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}
