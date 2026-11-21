import Link from "next/link";
import { cn } from "@/lib/cn";

/** Page title block. `eyebrow` is the mono locator line (module, code, period). */
export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="label mb-2">{eyebrow}</p>}
        <h1 className="text-[1.75rem] sm:text-[2.1rem]">{title}</h1>
        {description && <p className="mt-2 max-w-[62ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, aside, className, bodyClassName, children, id }: { title?: React.ReactNode; aside?: React.ReactNode; className?: string; bodyClassName?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("panel min-w-0", className)}>
      {(title || aside) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2">
          {title && <h2 className="font-sans text-[0.95rem] font-semibold tracking-normal">{title}</h2>}
          {aside && <div className="flex items-center gap-2 text-[0.83rem] text-ink-2">{aside}</div>}
        </div>
      )}
      {/* wide tables scroll inside the panel instead of stretching the page */}
      <div className={cn("scroll-thin overflow-x-auto p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Headline figure. Value is set in the display face; the label is the mono micro-label above it. */
export function Stat({ label, value, sub, tone, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "cobalt" | "turq" | "red" | "ok" | "warn"; className?: string }) {
  const color = tone ? { cobalt: "text-cobalt", turq: "text-turq", red: "text-red", ok: "text-ok", warn: "text-warn" }[tone] : "text-ink";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="label">{label}</p>
      <p className={cn("mt-1 font-display text-[1.9rem] font-semibold leading-none tracking-tight tabular-nums", color)}>{value}</p>
      {sub && <p className="mt-1.5 text-[0.82rem] text-ink-2">{sub}</p>}
    </div>
  );
}

/** Progress against a target. Fills to 100%; anything above the target is written separately by the caller. */
export function Meter({ value, max, tone = "cobalt", pending = 0, className, label }: { value: number; max: number; pending?: number; tone?: "cobalt" | "turq" | "ok" | "red" | "warn"; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const pend = max > 0 ? Math.min(100 - pct, (pending / max) * 100) : 0;
  const bg = { cobalt: "bg-cobalt", turq: "bg-turq", ok: "bg-ok", red: "bg-red", warn: "bg-warn" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn("flex h-2 w-full overflow-hidden rounded-[1px] bg-surface-3", className)}>
      <div className={cn("h-full", bg)} style={{ width: `${pct}%` }} />
      {pend > 0 && <div className={cn("hatch h-full", { cobalt: "text-cobalt", turq: "text-turq", ok: "text-ok", red: "text-red", warn: "text-warn" }[tone])} style={{ width: `${pend}%` }} />}
    </div>
  );
}

export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-md border border-dashed border-line-2 px-5 py-8", className)}>
      <div className="ticks h-2 w-24 opacity-70" aria-hidden />
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="max-w-[56ch] text-[0.9rem] text-ink-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** URL-driven tabs / segmented filter. */
export function TabLinks({ items, current, className }: { items: { href: string; key: string; label: React.ReactNode; count?: number }[]; current: string; className?: string }) {
  return (
    <nav className={cn("no-print flex gap-0 overflow-x-auto border-b border-line scroll-thin", className)}>
      {items.map((it) => (
        <Link key={it.key} href={it.href} scroll={false} aria-current={it.key === current ? "page" : undefined}
          className={cn("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[0.9rem] transition-colors", it.key === current ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
          {it.label}
          {it.count != null && <span className="num rounded-xs bg-surface-2 px-1.5 text-[0.72rem] text-ink-2">{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = "cobalt", title, children, className }: { tone?: "cobalt" | "warn" | "red" | "ok"; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const c = { cobalt: "border-l-cobalt bg-cobalt-soft/60", warn: "border-l-warn bg-warn-soft/70", red: "border-l-red bg-red-soft/70", ok: "border-l-ok bg-ok-soft/70" }[tone];
  return (
    <div className={cn("rounded-r-sm border-l-2 px-3.5 py-2.5 text-[0.88rem]", c, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="text-ink-2">{children}</div>}
    </div>
  );
}

export function DefList({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-5 gap-y-2 text-[0.9rem]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="label pt-0.5">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
