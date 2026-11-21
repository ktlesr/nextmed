import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { monthClosures, people, users } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { calendarMonthBounds, todayInIstanbul } from "@/lib/dates";
import { fmtDateTime, fmtDuration, fmtHours, fmtPercent, pick } from "@/lib/format";
import { getFrame, getPeople, getProject } from "@/lib/structure";
import { monthlyTargets, monthlyWorkTotals, type WorkTotals } from "@/lib/targets";
import { parseYM } from "@/lib/work";
import { getT } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Meter, Notice, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { ClosureControls } from "@/components/work/closure-controls";
import { MonthNav } from "@/components/work/month-nav";
import { TargetChip, targetState } from "@/components/work/target-block";

export const metadata = { title: "İş Yükü" };
const zero: WorkTotals = { logged: 0, inReview: 0, approved: 0, draft: 0, changesRequested: 0 };

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<{ m?: string; wp?: string }> }) {
  await requireRole(can.coordinate);
  const sp = await searchParams;
  const [{ t, locale }, project, persons, { wps }] = await Promise.all([getT(), getProject(), getPeople(), getFrame()]);
  const today = todayInIstanbul();
  const ym = parseYM(sp.m, today);
  const wp = wps.find((w) => w.id === sp.wp) ?? null;
  const ids = persons.map((p) => p.id);
  const [targets, totals, wpTotals, [closure]] = await Promise.all([
    monthlyTargets(persons, project, ym.year, ym.month),
    monthlyWorkTotals(ids, ym.year, ym.month),
    wp ? monthlyWorkTotals(ids, ym.year, ym.month, wp.id) : Promise.resolve(null),
    db.select({ c: monthClosures, by: people.fullName, email: users.email }).from(monthClosures).leftJoin(users, eq(users.id, monthClosures.closedBy)).leftJoin(people, eq(people.id, users.personId)).where(and(eq(monthClosures.year, ym.year), eq(monthClosures.month, ym.month))),
  ]);
  const state = !closure ? "open" : closure.c.reopenedAt ? "reopened" : "closed";
  const monthEnded = calendarMonthBounds(ym.year, ym.month).end < today;
  const href = (o: { m?: string; wp?: string | null }) => {
    const q = new URLSearchParams();
    const m = o.m ?? ym.key, w = o.wp === undefined ? wp?.id : o.wp;
    if (m !== today.slice(0, 7)) q.set("m", m);
    if (w) q.set("wp", w);
    const s = q.toString();
    return `/app/admin/workload${s ? `?${s}` : ""}`;
  };
  const rows = persons.map((p) => ({ p, target: targets.get(p.id), tt: totals.get(p.id) ?? zero, wt: wpTotals?.get(p.id) ?? null }));
  const under = rows.filter((r) => r.target?.kind === "target" && r.tt.approved < r.target.minutes);
  const sum = (k: keyof WorkTotals) => rows.reduce((a, r) => a + r.tt[k], 0);
  const targetSum = rows.reduce((a, r) => a + (r.target?.kind === "target" ? r.target.minutes : 0), 0);
  const pendingAll = sum("inReview") + sum("draft") + sum("changesRequested");

  return (
    <>
      <PageHeader eyebrow={t("nav.groupAdmin")} title={t("nav.workload")} description={t("work.workloadLede")}
        actions={<><MonthNav ym={ym.key} locale={locale} currentKey={today.slice(0, 7)} todayLabel={t("work.thisMonth")} href={(k) => href({ m: k })} /><ClosureControls ym={ym.key} state={state} warn={pendingAll > 0 ? t("work.closeWarnPending", { d: fmtDuration(locale, pendingAll) }) : null} /></>} />

      {state === "closed" && <Notice className="mb-6" title={t("work.monthClosedTitle")}>{t("work.monthClosedBy", { who: closure!.by ?? closure!.email ?? "—", at: fmtDateTime(locale, closure!.c.closedAt) })}</Notice>}
      {state === "reopened" && <Notice tone="warn" className="mb-6" title={t("work.monthReopenedTitle")}>{closure!.c.reopenReason} <span className="num text-[0.8rem]">· {fmtDateTime(locale, closure!.c.reopenedAt)}</span></Notice>}
      {!project.startDate && <Notice tone="warn" className="mb-6" title={t("common.awaitingStart")}>{t("work.awaitingStartDetail")}</Notice>}

      <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-ink py-5 lg:grid-cols-4">
        <Stat label={t("work.teamTarget")} value={targetSum ? fmtHours(locale, targetSum, 1) : "—"} />
        <Stat label={t("work.mApproved")} value={fmtHours(locale, sum("approved"), 1)} tone="ok" sub={targetSum ? fmtPercent(locale, sum("approved") / targetSum, 1) : undefined} />
        <Stat label={t("work.mInReview")} value={fmtHours(locale, sum("inReview"), 1)} tone={sum("inReview") ? "cobalt" : undefined} sub={sum("inReview") ? <Link href="/app/review" className="underline underline-offset-2">{t("nav.review")} →</Link> : undefined} />
        <Stat label={t("work.underTarget")} value={under.length} tone={under.length && (monthEnded || state === "closed") ? "warn" : undefined} sub={t("work.underTargetSub")} />
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">{t("common.workPackage")}</span>
        <Link href={href({ wp: null })} scroll={false} className={buttonClass(wp ? "secondary" : "primary", "sm")}>{t("common.all")}</Link>
        {wps.map((w) => <Link key={w.id} href={href({ wp: w.id })} scroll={false} className={buttonClass(wp?.id === w.id ? "primary" : "secondary", "sm", "num")}>{w.code}</Link>)}
      </div>
      {wp && <p className="mb-3 text-[0.86rem] text-ink-2">{t("work.wpFilterNote", { wp: `${wp.code} · ${pick(locale, wp.nameTr, wp.nameEn)}` })}</p>}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("common.person")}</th><th>{t("work.method")}</th>
              <th className="r">{t("work.mTarget")}</th><th className="r">{t("work.mApproved")}</th>{wp && <th className="r">{wp.code}</th>}
              <th className="r">{t("work.mInReview")}</th><th className="r">{t("work.mRemaining")}</th>
              <th className="min-w-40">{t("work.progress")}</th><th>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, target, tt, wt }) => {
              const has = target?.kind === "target";
              return (
                <tr key={p.id}>
                  <td><Link href={`/app/reports?view=person&person=${p.id}&m=${ym.key}`} className="font-medium hover:text-cobalt">{p.fullName}</Link><span className="block text-[0.8rem] text-ink-3">{pick(locale, p.projectRoleTr, p.projectRoleEn)}</span></td>
                  <td className="whitespace-nowrap text-[0.84rem] text-ink-2">{t(`common.method.${p.planMethod}`)}{p.planMethod === "fixed_ratio" && p.fixedRatio ? <span className="num ml-1.5">{fmtPercent(locale, Number(p.fixedRatio), (Number(p.fixedRatio) * 100) % 1 ? 1 : 0)}</span> : null}</td>
                  <td className="r num">{has ? fmtHours(locale, target.minutes, 2) : "—"}</td>
                  <td className="r num font-medium">{fmtDuration(locale, tt.approved)}</td>
                  {wp && <td className="r num text-ink-2">{fmtDuration(locale, wt?.approved ?? 0)}</td>}
                  <td className="r num">{tt.inReview ? <span className="text-cobalt">{fmtDuration(locale, tt.inReview)}</span> : "—"}</td>
                  <td className="r num">{has ? (tt.approved >= target.minutes ? (tt.approved > target.minutes ? <span className="text-ok">+{fmtDuration(locale, tt.approved - target.minutes)}</span> : "0") : fmtDuration(locale, target.minutes - tt.approved)) : "—"}</td>
                  <td>{has ? <div className="flex items-center gap-2"><Meter value={tt.approved} max={target.minutes} pending={tt.inReview} tone={tt.approved >= target.minutes ? "ok" : "cobalt"} label={p.fullName} /><span className="num w-11 shrink-0 text-right text-[0.76rem] text-ink-2">{fmtPercent(locale, target.minutes ? tt.approved / target.minutes : 0)}</span></div> : null}</td>
                  <td><TargetChip target={target} totals={tt} t={t} />{tt.draft + tt.changesRequested > 0 && <span className="num mt-1 block text-[0.72rem] text-ink-3">{t("work.unsent", { d: fmtDuration(locale, tt.draft + tt.changesRequested) })}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(monthEnded || state === "closed") && under.length > 0 && (
        <Panel className="mt-6" title={t("work.underTargetTitle")} aside={<Badge tone="warn">{under.length}</Badge>}>
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {under.map(({ p, target, tt }) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-[0.9rem]">
                <span>{p.fullName}</span>
                <span className="num text-warn">−{fmtDuration(locale, (target as { minutes: number }).minutes - tt.approved)}{targetState(target, tt).key === "awaitingReview" ? <span className="ml-2 text-cobalt">({fmtDuration(locale, tt.inReview)} {t("work.state.awaitingReview").toLowerCase()})</span> : null}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
