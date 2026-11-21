import type { Locale, TFn } from "@/i18n";
import { fmtDuration, fmtHours, fmtNumber, fmtPercent } from "@/lib/format";
import type { MonthlyTarget, WorkTotals } from "@/lib/targets";
import { Badge, type Tone } from "@/components/ui/badge";
import { Meter } from "@/components/ui/layout";

export type TargetState = { key: string; tone: Tone };

/** One state per person-month: met / awaiting review / remaining / no plan / awaiting reference … */
export function targetState(target: MonthlyTarget | undefined, totals: WorkTotals): TargetState {
  if (!target || target.kind === "none") return { key: "noTarget", tone: "neutral" };
  if (target.kind === "awaiting_start") return { key: "awaitingStart", tone: "outline" };
  if (target.kind === "awaiting_reference") return { key: "awaitingReference", tone: "warn" };
  if (target.kind === "no_plan") return { key: "noPlan", tone: "outline" };
  if (totals.approved >= target.minutes) return { key: "met", tone: "ok" };
  if (totals.inReview > 0) return { key: "awaitingReview", tone: "cobalt" };
  return { key: "remaining", tone: "warn" };
}
export function TargetChip({ target, totals, t }: { target: MonthlyTarget | undefined; totals: WorkTotals; t: TFn }) {
  const s = targetState(target, totals);
  return <Badge tone={s.tone} dot={s.key === "met" || s.key === "remaining" || s.key === "awaitingReview"}>{t(`work.state.${s.key}`)}</Badge>;
}

/** The monthly workload indicator: progress is approved time ÷ target; the bar fills at the target. */
export function TargetBlock({ target, totals, t, locale }: { target: MonthlyTarget | undefined; totals: WorkTotals; t: TFn; locale: Locale }) {
  const has = target?.kind === "target";
  const goal = has ? target.minutes : 0;
  const pct = has && goal > 0 ? totals.approved / goal : 0;
  const over = has ? Math.max(0, totals.approved - goal) : 0;
  const remaining = has ? Math.max(0, goal - totals.approved) : 0;
  const cells: [string, string, string?][] = [
    [t("work.mTarget"), has ? fmtHours(locale, goal, 2) : "—"],
    [t("work.mLogged"), fmtDuration(locale, totals.logged)],
    [t("work.mInReview"), fmtDuration(locale, totals.inReview), totals.inReview ? "text-cobalt" : undefined],
    [t("work.mApproved"), fmtDuration(locale, totals.approved), "text-ok"],
    [t("work.mRemaining"), has ? fmtDuration(locale, remaining) : "—"],
  ];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="label">{t("work.progress")}</p>
          <p className="mt-1 font-display text-[3.4rem] font-semibold leading-none tracking-tight tabular-nums">
            {has ? fmtPercent(locale, pct, pct > 0 && pct < 1 && (pct * 100) % 1 !== 0 ? 1 : 0) : fmtDuration(locale, totals.approved)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <TargetChip target={target} totals={totals} t={t} />
          {over > 0 && <p className="num text-[0.82rem] text-ok">+{fmtDuration(locale, over)} {t("work.overTarget")}</p>}
          {totals.inReview > 0 && targetState(target, totals).key !== "awaitingReview" && <p className="text-[0.8rem] text-cobalt">{t("work.state.awaitingReview")}: <span className="num">{fmtDuration(locale, totals.inReview)}</span></p>}
        </div>
      </div>
      {has && <Meter value={totals.approved} max={goal} pending={totals.inReview} tone={pct >= 1 ? "ok" : "cobalt"} className="mt-4 h-3" label={t("work.progress")} />}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-5">
        {cells.map(([k, v, c]) => (
          <div key={k}>
            <dt className="label">{k}</dt>
            <dd className={`num mt-1 text-[1.05rem] font-medium ${c ?? ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[0.85rem] text-ink-2">
        {target?.kind === "target" && target.method === "fixed_ratio" && t("work.fixedDetail", { ref: fmtNumber(locale, target.referenceHours ?? 0, (target.referenceHours ?? 0) % 1 ? 2 : 0), ratio: fmtPercent(locale, target.ratio ?? 0, ((target.ratio ?? 0) * 100) % 1 ? 1 : 0), target: fmtHours(locale, goal, goal % 60 ? 2 : 0), share: fmtPercent(locale, (target.referenceHours ?? 0) > 0 ? totals.approved / ((target.referenceHours ?? 1) * 60) : 0, 2) })}
        {target?.kind === "target" && target.method === "hourly" && t("work.hourlyDetail")}
        {target?.kind === "target" && target.method === "internal" && t("work.internalDetail")}
        {target?.kind === "no_plan" && t("work.noPlanDetail")}
        {target?.kind === "awaiting_start" && t("work.awaitingStartDetail")}
        {target?.kind === "awaiting_reference" && t("work.awaitingReferenceDetail")}
        {target?.kind === "none" && t("work.noTargetDetail")}
      </p>
    </div>
  );
}
