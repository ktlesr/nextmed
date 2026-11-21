import { cn } from "@/lib/cn";

type Lane = { key: string; label: string; counts: number[]; color: string; total: number };

/**
 * The plan read on the 36-month ruler: one lane per reading (baseline · current plan · actual),
 * one bar per project month = sub-activities finishing in that month. The red hairline is the selected period.
 */
export function PlanInstrument({ lanes, duration, periodMonth, monthWord, caption }: { lanes: Lane[]; duration: number; periodMonth: number | null; monthWord: string; caption: string }) {
  const max = Math.max(1, ...lanes.flatMap((l) => l.counts));
  const marks = [1, ...Array.from({ length: Math.floor(duration / 6) }, (_, i) => (i + 1) * 6)];
  const left = periodMonth != null ? `${(Math.min(duration, Math.max(0, periodMonth)) / duration) * 100}%` : null;
  return (
    <figure className="min-w-0">
      <div className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[9.5rem_1fr]">
        <div />
        <div className="relative">
          <div className="num relative h-4 text-[0.62rem] text-ink-3">
            {marks.map((m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - 0.5) / duration) * 100}%` }}>{String(m).padStart(2, "0")}</span>)}
            {left && <span className="absolute -top-0.5 z-10 -translate-x-1/2 rounded-xs bg-red px-1 font-medium text-surface" style={{ left }}>{periodMonth}</span>}
          </div>
        </div>
        {lanes.map((lane, li) => (
          <div key={lane.key} className="contents">
            <div className={cn("flex flex-col justify-end border-ink pb-1.5 pr-3", li === 0 ? "border-t" : "border-t border-t-line")}>
              <span className="label leading-tight">{lane.label}</span>
              <span className="num text-[0.78rem] text-ink-2">{lane.total}</span>
            </div>
            <div className={cn("relative flex h-[3.4rem] items-end border-ink", li === 0 ? "border-t" : "border-t border-t-line")} style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px calc(100% / 6))" }}>
              {left && <span className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red" style={{ left }} aria-hidden />}
              {Array.from({ length: duration }, (_, i) => {
                const n = lane.counts[i + 1] ?? 0;
                return (
                  <div key={i} className="flex h-full flex-1 items-end px-[1.5px]" title={`${monthWord} ${i + 1}: ${n}`}>
                    {n > 0 && <span className="w-full rounded-[1px]" style={{ height: `${Math.max(8, (n / max) * 100)}%`, background: lane.color, opacity: periodMonth != null && i + 1 > periodMonth ? 0.38 : 1 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="border-t border-ink" />
        <div className="ticks relative h-2 border-t border-ink" style={{ backgroundImage: `repeating-linear-gradient(90deg, var(--line-2) 0 1px, transparent 1px calc(100% / ${duration}))` }} />
      </div>
      <figcaption className="mt-2 text-[0.78rem] text-ink-3">{caption}</figcaption>
    </figure>
  );
}
