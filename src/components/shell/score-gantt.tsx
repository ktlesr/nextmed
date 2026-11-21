import { monthRuns } from "@/lib/dates";
import type { Locale } from "@/i18n";

type Lane = { code: string; name: string; months: number[]; lines: { code: string; name: string; months: number[] }[] };

/**
 * "Score" view of the plan: one lane per work package, one thin line per main activity.
 * Gapped months render as separate segments — never one long bar.
 */
export function ScoreGantt({ lanes, duration = 36, locale, monthsLabel }: { lanes: Lane[]; duration?: number; locale: Locale; monthsLabel: string }) {
  const col = (m: number) => `${((m - 1) / duration) * 100}%`;
  const w = (a: number, b: number) => `${((b - a + 1) / duration) * 100}%`;
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-[3.2rem_1fr] sm:grid-cols-[15rem_1fr]">
        <div className="label flex items-end border-b border-ink px-3 pb-1.5 sm:px-4">WP</div>
        <div className="border-b border-ink px-0 pt-3">
          <div className="num flex justify-between px-px text-[0.62rem] text-ink-3" aria-label={monthsLabel}>
            {[1, 6, 12, 18, 24, 30, 36].map((m) => <span key={m} className="w-0 whitespace-nowrap" style={{ transform: m === 36 ? "translateX(-1.2rem)" : m === 1 ? undefined : "translateX(-0.4rem)" }}>{String(m).padStart(2, "0")}</span>)}
          </div>
          <div className="ticks mt-1 h-2.5 border-r border-line-2" />
        </div>
        {lanes.map((lane, li) => {
          const n = lane.code.replace(/\D/g, "");
          return (
            <div key={lane.code} className="contents">
              <div className="flex min-w-0 flex-col justify-center border-b border-line px-3 py-2.5 last:border-b-0 sm:px-4">
                <span className="num text-[0.78rem] font-medium" style={{ color: `var(--wp-${n})` }}>{lane.code}</span>
                <span className="hidden truncate text-[0.8rem] text-ink-2 sm:block" title={lane.name}>{lane.name}</span>
              </div>
              <div className="relative border-b border-line py-2.5" style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px calc(100% / 6))" }}>
                {monthRuns(lane.months).map(([a, b]) => <span key={a} className="absolute inset-y-0 opacity-[0.09]" style={{ left: col(a), width: w(a, b), background: `var(--wp-${n})` }} />)}
                <div className="relative flex flex-col gap-[5px]">
                  {lane.lines.map((line, i) => (
                    <div key={line.code} className="relative h-[5px]" title={`${line.code} ${line.name}`}>
                      {monthRuns(line.months).map(([a, b]) => (
                        <span key={a} className="grow-x absolute inset-y-0 rounded-[1px]" style={{ left: col(a), width: `calc(${w(a, b)} - 2px)`, background: `var(--wp-${n})`, animationDelay: `${li * 90 + i * 35}ms` }} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <span className="sr-only">{locale}</span>
    </div>
  );
}
