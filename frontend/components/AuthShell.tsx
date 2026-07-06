import Link from "next/link";
import { Check, LayoutGrid } from "lucide-react";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — business/scheduling photo with a legibility overlay */}
      <div
        className="relative hidden overflow-hidden bg-slate-900 bg-cover bg-center p-12 lg:flex lg:flex-col lg:justify-between"
        style={{ backgroundImage: "url(/auth-bg.jpg)" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/70 to-slate-900/75" />
        <Link href="/" className="relative z-10 flex items-center gap-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><LayoutGrid size={20} /></span>
          <span className="text-lg font-semibold tracking-tight">Collab Dashboard</span>
        </Link>
        <div className="relative z-10">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
            Plan together, in real time.
          </h2>
          <p className="mt-4 max-w-md text-brand-100">
            Connect with friends, chat live, drop sticky notes on a shared board, and keep a
            synchronized schedule — everything updates instantly for everyone.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {["Live chat with read receipts", "Draggable shared sticky notes", "Schedules by date or client", "Instant WebSocket sync"].map(
              (f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20"><Check size={12} /></span>
                  {f}
                </li>
              )
            )}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-brand-200">
          © {new Date().getFullYear()} Collaborative Project Dashboard
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-50 p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <span className="flex items-center gap-2 text-brand-700">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><LayoutGrid size={20} /></span>
              <span className="text-lg font-semibold">Collab Dashboard</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
