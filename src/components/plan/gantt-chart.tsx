"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Lock, TriangleAlert } from "lucide-react";
import { monthRuns } from "@/lib/dates";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

export type GRow = {
  id: string; parent: string | null; level: 0 | 1 | 2 | 3; code: string; name: string; wp: number;
  ref?: number[];              // fixed reference window (WP / output / activity)
  current?: number[];          // current plan (sub-activity / assignment) or forecast roll-up (parents)
  baseline?: number[] | null;  // from the saved baseline
  actual?: number[];           // project months with logged work
  outside?: number[];          // current months outside the parent's reference window
  status?: string; meta?: string; fixed?: boolean; childCount?: number;
};
export type MonthHead = { m: number; date?: string; year?: string; title?: string };

const STATUS_DOT: Record<string, string> = { not_started: "bg-line-2", in_progress: "bg-cobalt", in_review: "bg-warn", completed: "bg-ok" };
const COL = 22; // px per month (minimum)

export function GanttChart({ rows, heads, todayPos, hasBaseline, openLevel = 2, itemLabel }: {
  rows: GRow[]; heads: MonthHead[]; todayPos: number | null; hasBaseline: boolean; openLevel?: number; itemLabel: string;
}) {
  const { t } = useT();
  const duration = heads.length;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(rows.filter((r) => r.level >= openLevel).map((r) => r.id)));
  const [layers, setLayers] = useState({ baseline: hasBaseline, current: true, actual: true });
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const hasKids = useMemo(() => new Set(rows.map((r) => r.parent).filter(Boolean) as string[]), [rows]);
  const visible = rows.filter((r) => { for (let p = r.parent; p; p = byId.get(p)?.parent ?? null) if (collapsed.has(p)) return false; return true; });
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setLevel = (lvl: number) => setCollapsed(new Set(rows.filter((r) => r.level >= lvl).map((r) => r.id)));
  const left = (m: number) => `${((m - 1) / duration) * 100}%`;
  const width = (a: number, b: number) => `${((b - a + 1) / duration) * 100}%`;
  const segs = (months: number[] | null | undefined, cls: string, style?: React.CSSProperties, key = "") =>
    monthRuns(months ?? []).map(([a, b]) => <span key={key + a} className={cn("absolute", cls)} style={{ left: left(a), width: `calc(${width(a, b)} - 2px)`, ...style }} />);
  const grid = { backgroundImage: `repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px calc(100% / ${duration}))` };
  const layerBtn = (k: keyof typeof layers, label: string, swatch: React.ReactNode, disabled?: boolean) => (
    <button key={k} type="button" disabled={disabled} aria-pressed={layers[k]} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
      className={cn("flex h-8 items-center gap-2 border-r border-line-2 px-2.5 text-[0.8rem] last:border-r-0 disabled:opacity-40", layers[k] ? "bg-surface text-ink" : "bg-surface-2 text-ink-3 line-through")}>
      {swatch}{label}
    </button>
  );

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-sm border border-line-2" role="group" aria-label={t("gantt.layers")}>
          {layerBtn("baseline", t("gantt.layerBaseline"), <span className="h-[3px] w-4 border-t border-dashed border-ink-2" />, !hasBaseline)}
          {layerBtn("current", t("gantt.layerCurrent"), <span className="h-1.5 w-4 rounded-[1px] bg-cobalt" />)}
          {layerBtn("actual", t("gantt.layerActual"), <span className="h-[3px] w-4 bg-ink" />)}
        </div>
        <div className="flex items-center gap-1 text-[0.8rem]">
          <span className="mr-2 hidden items-center gap-1.5 text-ink-3 md:flex"><span className="h-3 w-4 rounded-[1px] bg-cobalt opacity-20" />{t("gantt.legendRef")}</span>
          <button type="button" onClick={() => setLevel(1)} className="rounded-sm px-2 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">{t("gantt.collapseAll")}</button>
          <button type="button" onClick={() => setLevel(openLevel)} className="rounded-sm px-2 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">{t("gantt.toActivities")}</button>
          <button type="button" onClick={() => setCollapsed(new Set())} className="rounded-sm px-2 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">{t("gantt.expandAll")}</button>
        </div>
      </div>

      <div className="tbl-wrap scroll-thin max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto print:max-h-none">
        <div style={{ minWidth: `calc(var(--first) + ${duration * COL}px)` }} className="relative [--first:11.5rem] sm:[--first:21rem]">
          {/* header: the month ruler */}
          <div className="sticky top-0 z-20 flex border-b border-ink bg-surface">
            <div className="label sticky left-0 z-10 flex w-[var(--first)] shrink-0 items-end border-r border-line bg-surface px-3 pb-1.5">{itemLabel}</div>
            <div className="relative flex flex-1">
              {heads.map((h) => (
                <div key={h.m} title={h.title} className="num min-w-0 flex-1 border-r border-line/70 pb-1 pt-1.5 text-center last:border-r-0">
                  <div className="h-3 text-[0.58rem] font-medium text-cobalt">{h.year ?? ""}</div>
                  <div className="text-[0.7rem] font-medium text-ink">{String(h.m).padStart(2, "0")}</div>
                  {h.date && <div className="font-sans text-[0.6rem] text-ink-3">{h.date}</div>}
                </div>
              ))}
            </div>
          </div>
          {visible.map((r) => {
            const kids = hasKids.has(r.id);
            const isParent = r.level < 3 && r.ref !== undefined;
            const wpc = `var(--wp-${r.wp})`;
            return (
              <div key={r.id} className={cn("group flex border-b border-line last:border-b-0", r.level === 0 && "bg-surface-2/60")}>
                <div className={cn("sticky left-0 z-10 flex w-[var(--first)] shrink-0 items-center gap-1.5 border-r border-line py-1 pr-2", r.level === 0 ? "bg-surface-2" : "bg-surface")} style={{ paddingLeft: `${0.5 + r.level * 0.7}rem` }}>
                  {kids ? (
                    <button type="button" onClick={() => toggle(r.id)} aria-expanded={!collapsed.has(r.id)} aria-label={r.code} className="grid size-5 shrink-0 place-items-center rounded-xs text-ink-3 hover:bg-surface-3 hover:text-ink">
                      <ChevronRight className={cn("size-3.5 transition-transform", !collapsed.has(r.id) && "rotate-90")} />
                    </button>
                  ) : <span className="w-5 shrink-0" />}
                  {r.level === 0 && <span className="size-2 shrink-0 rounded-[1px]" style={{ background: wpc }} />}
                  <span className={cn("code shrink-0", r.level === 0 && "text-ink")}>{r.code}</span>
                  <span className={cn("min-w-0 flex-1 truncate text-[0.84rem]", r.level === 0 ? "font-semibold" : r.level === 3 ? "text-ink-2" : "font-medium")} title={r.name}>{r.name}</span>
                  {r.meta && <span className="num hidden shrink-0 text-[0.68rem] text-ink-3 sm:inline">{r.meta}</span>}
                  {!!r.outside?.length && <span title={t("gantt.outside")} className="shrink-0 text-red"><TriangleAlert className="size-3.5" /></span>}
                  {r.status && <span title={t(`common.plan.${r.status}`)} className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[r.status])} />}
                  {r.fixed && r.level === 2 && <Lock className="hidden size-3 shrink-0 text-ink-3 sm:block" aria-label={t("gantt.fixed")} />}
                </div>
                <div className="relative h-[30px] flex-1" style={grid}>
                  {isParent && segs(r.ref, "inset-y-[5px] rounded-[1px] opacity-[0.17]", { background: wpc }, "r")}
                  {layers.baseline && segs(r.baseline, "top-[5px] h-0 border-t border-dashed border-ink-2", undefined, "b")}
                  {layers.current && segs(r.current, cn("rounded-[1px]", isParent ? "top-[13px] h-[4px]" : "top-[10px] h-[10px]"), { background: wpc }, "c")}
                  {layers.current && segs(r.outside, cn("hatch rounded-[1px] bg-red text-surface", isParent ? "top-[13px] h-[4px]" : "top-[10px] h-[10px]"), undefined, "o")}
                  {layers.actual && segs(r.actual, "bottom-[4px] h-[3px] bg-ink", undefined, "a")}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <p className="px-4 py-10 text-center text-ink-3">{t("gantt.noRows")}</p>}
          {todayPos != null && (
            <div className="pointer-events-none absolute inset-y-0 z-[15]" aria-hidden style={{ left: `calc(var(--first) + (100% - var(--first)) * ${todayPos / duration})` }}>
              <div className="h-full w-px bg-red" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
