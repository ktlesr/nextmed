"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House, ChartGantt, ListChecks, Clock, Target, FileChartColumn, FolderOpen, Users, Handshake, Plane, Landmark, ClipboardCheck,
  Gauge, UserCog, CalendarCog, Settings, Activity, Wallet, Languages, DatabaseBackup, History, Menu, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Brand } from "./brand";

const icons: Record<string, LucideIcon> = { House, ChartGantt, ListChecks, Clock, Target, FileChartColumn, FolderOpen, Users, Handshake, Plane, Landmark, ClipboardCheck, Gauge, UserCog, CalendarCog, Settings, Activity, Wallet, Languages, DatabaseBackup, History };

export type NavItem = { href: string; label: string; icon: string; badge?: number };
export type NavGroup = { label: string; items: NavItem[] };

function Items({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  // the longest matching href wins so /app/admin does not light up for /app/admin/team
  const active = all.filter((h) => path === h || (h !== "/app" && path.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 pb-6">
      {groups.map((g) => (
        <div key={g.label} className="mt-5 first:mt-2">
          <p className="label px-2.5 pb-1.5 text-[0.62rem]">{g.label}</p>
          <ul>
            {g.items.map((it) => {
              const Icon = icons[it.icon] ?? House;
              const on = it.href === active;
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                    className={cn("group relative flex items-center gap-2.5 rounded-sm px-2.5 py-[0.42rem] text-[0.89rem] transition-colors", on ? "bg-ink font-medium text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                    <Icon className={cn("size-[1.02rem] shrink-0", on ? "text-turq" : "text-ink-3 group-hover:text-ink")} strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {!!it.badge && <span className={cn("num rounded-xs px-1.5 text-[0.7rem] font-medium", on ? "bg-bg/20" : "bg-red-soft text-red")}>{it.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ groups, sub, footer }: { groups: NavGroup[]; sub: string; footer?: React.ReactNode }) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <Link href="/app" className="flex h-14 items-center border-b border-line px-5"><Brand sub={sub} /></Link>
      <Items groups={groups} />
      {footer}
    </aside>
  );
}

export function MobileNav({ groups, sub, menuLabel }: { groups: NavGroup[]; sub: string; menuLabel: string }) {
  const [open, setOpen] = useState(false);
  // Lock page scroll while the drawer is open; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={menuLabel} className="grid size-9 place-items-center rounded-sm border border-line-2 text-ink-2 lg:hidden"><Menu className="size-5" /></button>
      {/* The header's backdrop-filter would trap a fixed child inside it, so the drawer is portalled to <body>. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={menuLabel}>
          <div className="absolute inset-0 bg-[#060a1a]/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-surface">
            <div className="flex h-14 items-center justify-between border-b border-line px-5">
              <Brand sub={sub} />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 text-ink-2"><X className="size-5" /></button>
            </div>
            <Items groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
