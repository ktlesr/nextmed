import Link from "next/link";
import { and, arrayContains, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { activities, assignments, followUps, meetings, subactivities, workLogs } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { addDays, projectMonthOf, projectMonthWindow, todayInIstanbul } from "@/lib/dates";
import { fmtDate, fmtDateTime, fmtDuration, monthLabel, monthsLabel, pick } from "@/lib/format";
import { assignmentMonths, getChainOptions, getPeople, getProject, subMonths } from "@/lib/structure";
import { monthlyTargets, monthlyWorkTotals, type WorkTotals } from "@/lib/targets";
import { fetchLogs, parseYM } from "@/lib/work";
import { getT } from "@/i18n/server";
import { Badge, WpChip, planTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Meter, Notice, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { ChainLine, StatusBadge } from "@/components/work/log-bits";
import { MonthNav } from "@/components/work/month-nav";
import { TargetBlock, TargetChip } from "@/components/work/target-block";
import { WorkLogButton } from "@/components/work/work-form";

const zero: WorkTotals = { logged: 0, inReview: 0, approved: 0, draft: 0, changesRequested: 0 };

export default async function Home({ searchParams }: { searchParams: Promise<{ m?: string; denied?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ t, locale }, project, allPeople] = await Promise.all([getT(), getProject(), getPeople()]);
  const today = todayInIstanbul();
  const ym = parseYM(sp.m, today);
  const currentPm = project.startDate ? projectMonthOf(project.startDate, project.durationMonths, today) : null;
  const denied = sp.denied ? <Notice tone="red" className="mb-6" title={t("common.forbidden")}>{t("work.deniedHint")}</Notice> : null;
  const hello = t("work.hello", { name: user.fullName.split(" ")[0] });
  const monthNav = <MonthNav ym={ym.key} locale={locale} currentKey={today.slice(0, 7)} todayLabel={t("work.thisMonth")} href={(k) => (k === today.slice(0, 7) ? "/app" : `/app?m=${k}`)} />;
  const person = allPeople.find((p) => p.id === user.personId);

  /* ── Accounts without a person card (system admin): team summary ── */
  if (!person) {
    const ids = allPeople.map((p) => p.id);
    const [targets, totals, pending] = await Promise.all([
      monthlyTargets(allPeople, project, ym.year, ym.month), monthlyWorkTotals(ids, ym.year, ym.month),
      db.select({ n: sql<number>`count(*)::int` }).from(workLogs).where(eq(workLogs.status, "in_review")),
    ]);
    const sum = (k: keyof WorkTotals) => ids.reduce((a, id) => a + (totals.get(id)?.[k] ?? 0), 0);
    const targetSum = ids.reduce((a, id) => { const x = targets.get(id); return a + (x?.kind === "target" ? x.minutes : 0); }, 0);
    return (
      <>
        {denied}
        <PageHeader eyebrow={t("work.homeEyebrow")} title={hello} description={t("work.teamLede")} actions={monthNav} />
        {!project.startDate && <Notice tone="warn" className="mb-6" title={t("common.awaitingStart")}>{t("work.needStartAdmin")} <Link href="/app/admin/settings" className="font-medium text-ink underline underline-offset-2">{t("nav.settings")} →</Link></Notice>}
        <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-ink py-5 lg:grid-cols-4">
          <Stat label={t("work.mTarget")} value={targetSum ? fmtDuration(locale, targetSum) : "—"} sub={t("work.teamTargetSub", { n: ids.length })} />
          <Stat label={t("work.mApproved")} value={fmtDuration(locale, sum("approved"))} tone="ok" />
          <Stat label={t("work.mInReview")} value={fmtDuration(locale, sum("inReview"))} tone={sum("inReview") ? "cobalt" : undefined} />
          <Stat label={t("work.qWaiting")} value={pending[0].n} sub={<Link href="/app/review" className="underline underline-offset-2">{t("nav.review")} →</Link>} />
        </div>
        <Panel title={t("work.teamMonth")} bodyClassName="p-0" aside={<Link href={`/app/admin/workload?m=${ym.key}`} className="text-cobalt hover:underline">{t("nav.workload")} →</Link>}>
          <table className="tbl">
            <thead><tr><th>{t("common.person")}</th><th className="r">{t("work.mTarget")}</th><th className="r">{t("work.mApproved")}</th><th className="w-40">{t("work.progress")}</th><th>{t("common.status")}</th></tr></thead>
            <tbody>
              {allPeople.map((p) => {
                const tg = targets.get(p.id), tt = totals.get(p.id) ?? zero;
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.fullName}<span className="block text-[0.8rem] font-normal text-ink-3">{pick(locale, p.projectRoleTr, p.projectRoleEn)}</span></td>
                    <td className="r num">{tg?.kind === "target" ? fmtDuration(locale, tg.minutes) : "—"}</td>
                    <td className="r num">{fmtDuration(locale, tt.approved)}</td>
                    <td>{tg?.kind === "target" ? <Meter value={tt.approved} max={tg.minutes} pending={tt.inReview} className="mt-2" label={p.fullName} /> : null}</td>
                    <td><TargetChip target={tg} totals={tt} t={t} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </>
    );
  }

  /* ── Personal home ── */
  const horizon = addDays(today, 14);
  const [targets, totals, asg, attention, myMeetings, myFollowUps, options, todayUsed, reviewWaiting] = await Promise.all([
    monthlyTargets([person], project, ym.year, ym.month),
    monthlyWorkTotals([person.id], ym.year, ym.month),
    db.select({ a: assignments, s: subactivities, actMonths: activities.months, actCode: activities.code })
      .from(assignments).innerJoin(subactivities, eq(subactivities.id, assignments.subactivityId)).innerJoin(activities, eq(activities.id, subactivities.activityId))
      .where(and(eq(assignments.personId, person.id), eq(assignments.active, true), eq(subactivities.active, true))).orderBy(asc(subactivities.sort)),
    fetchLogs({ personId: person.id, status: ["changes_requested", "draft"], newestFirst: true, limit: 6 }),
    db.select().from(meetings).where(and(gte(meetings.startsAt, new Date(today + "T00:00:00+03:00")), lte(meetings.startsAt, new Date(horizon + "T23:59:59+03:00")), eq(meetings.status, "planned"), or(arrayContains(meetings.participantIds, [person.id]), eq(meetings.responsibleId, person.id)))).orderBy(asc(meetings.startsAt)).limit(6),
    db.select().from(followUps).where(and(eq(followUps.assigneeId, person.id), eq(followUps.done, false))).orderBy(asc(followUps.dueDate)).limit(8),
    getChainOptions(),
    db.select({ n: sql<number>`coalesce(sum(${workLogs.minutes}),0)::int` }).from(workLogs).where(and(eq(workLogs.personId, person.id), eq(workLogs.workDate, today), sql`${workLogs.status} <> 'cancelled'`)),
    can.coordinate(user) ? db.select({ n: sql<number>`count(*)::int` }).from(workLogs).where(and(eq(workLogs.status, "in_review"), sql`${workLogs.personId} <> ${person.id}`)) : Promise.resolve([{ n: 0 }]),
  ]);
  const target = targets.get(person.id), tt = totals.get(person.id) ?? zero;

  // Tasks active in the current and the next project month (Months 1–2 while the start date is pending).
  const focus = currentPm ? [currentPm, currentPm + 1] : [1, 2];
  const tasks = asg
    .map((r) => ({ ...r, months: assignmentMonths(r.a, subMonths(r.s, r.actMonths)) }))
    .filter((r) => r.a.status !== "completed" && r.months.some((m) => focus.includes(m)))
    .sort((x, y) => Number(y.months.includes(focus[0])) - Number(x.months.includes(focus[0])));
  const wpOf = (activityId: string) => { const a = options.acts.find((x) => x.id === activityId); const o = options.outs.find((x) => x.id === a?.parent); return options.wps.find((w) => w.id === o?.parent)?.code ?? "WP1"; };
  const overdue = (d: string | null) => !!d && d < today;
  const limit = project.dailyLimitMinutes;
  const win = currentPm && project.startDate ? projectMonthWindow(project.startDate, currentPm) : null;

  return (
    <>
      {denied}
      <PageHeader
        eyebrow={<>{t("work.homeEyebrow")} · {pick(locale, person.projectRoleTr, person.projectRoleEn)}</>}
        title={hello}
        description={win ? t("work.homeLedeMonth", { n: currentPm!, from: fmtDate(locale, win.start), to: fmtDate(locale, win.end) }) : project.startDate ? t("work.homeLedeOutside") : t("work.homeLedeNoStart")}
        actions={<WorkLogButton options={options} assignedSubIds={asg.map((r) => r.s.id)} today={today} minDate={project.startDate} limit={limit} step={project.stepMinutes} initial={{ workDate: today }} initialRemaining={Math.max(0, limit - todayUsed[0].n)} disabledReason={project.startDate ? null : t("work.needStartShort")} />}
      />
      {!project.startDate && <Notice tone="warn" className="mb-6" title={t("common.awaitingStart")}>{t("work.needStart")}</Notice>}
      {reviewWaiting[0].n > 0 && <Notice className="mb-6" title={t("work.reviewWaiting", { n: reviewWaiting[0].n })}><Link href="/app/review" className="underline underline-offset-2">{t("nav.review")} →</Link></Notice>}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Panel title={t("work.monthTarget")} aside={monthNav}>
          <TargetBlock target={target} totals={tt} t={t} locale={locale} />
          <div className="no-print mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <ButtonLink href="/app/work" variant="secondary" size="sm">{t("nav.work")}<ArrowRight className="size-3.5" /></ButtonLink>
            <ButtonLink href={`/app/reports?m=${ym.key}`} variant="ghost" size="sm">{t("work.myReport")}<ArrowRight className="size-3.5" /></ButtonLink>
          </div>
        </Panel>

        <Panel title={t("work.attention")} aside={attention.length ? <Link href="/app/work?view=list" className="text-cobalt hover:underline">{t("common.all")} →</Link> : undefined} bodyClassName="p-0">
          {attention.length === 0 ? <p className="px-4 py-6 text-[0.9rem] text-ink-3">{t("work.attentionEmpty")}</p> : (
            <ul className="divide-y divide-line">
              {attention.map((l) => (
                <li key={l.id}>
                  <Link href={`/app/work/${l.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2/60">
                    <ChainLine log={l} locale={locale} />
                    <StatusBadge status={l.status} t={t} />
                    <p className="col-span-2 line-clamp-1 text-[0.88rem]">{pick(locale, l.descriptionTr, l.descriptionEn)}</p>
                    <p className="num col-span-2 text-[0.76rem] text-ink-3">{fmtDate(locale, l.workDate)} · {fmtDuration(locale, l.minutes)}{l.reviewNote && l.status === "changes_requested" ? <span className="ml-2 font-sans text-warn">— {l.reviewNote}</span> : null}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Panel title={t("work.upcomingTasks")} aside={<><span className="num">{focus.map((m) => monthLabel(locale, m)).join(" · ")}</span><Link href="/app/tasks" className="ml-2 text-cobalt hover:underline">{t("nav.tasks")} →</Link></>} bodyClassName="p-0">
          {tasks.length === 0 ? <div className="p-4"><EmptyState title={t("work.tasksEmpty")}>{t("work.tasksEmptyHint")}</EmptyState></div> : (
            <ul className="divide-y divide-line">
              {tasks.slice(0, 9).map((r) => (
                <li key={r.a.id} className="grid grid-cols-[4.4rem_1fr_auto] items-start gap-x-3 px-4 py-3">
                  <span className="pt-0.5"><WpChip code={wpOf(r.s.activityId)} /><span className="code mt-0.5 block">{r.s.code}</span></span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[0.92rem]">{pick(locale, r.a.taskDescriptionTr, r.a.taskDescriptionEn) || pick(locale, r.s.nameTr, r.s.nameEn)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.78rem] text-ink-3"><span>{t(`common.resp.${r.a.responsibility}`)}</span><span className="num">{monthsLabel(locale, r.months)}</span>{r.a.plannedMinutes ? <span className="num">{fmtDuration(locale, r.a.plannedMinutes)}</span> : null}</span>
                  </span>
                  <Badge tone={r.months.includes(focus[0]) ? planTone[r.a.status] === "neutral" ? "cobalt" : planTone[r.a.status] : "outline"}>{r.months.includes(focus[0]) ? (r.a.status === "not_started" ? t("work.thisMonthTag") : t(`common.plan.${r.a.status}`)) : t("work.nextMonthTag")}</Badge>
                </li>
              ))}
              {tasks.length > 9 && <li className="px-4 py-2.5 text-[0.85rem] text-ink-2"><Link href="/app/tasks" className="hover:text-cobalt">{t("work.moreTasks", { n: tasks.length - 9 })} →</Link></li>}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title={t("work.upcomingMeetings")} aside={<Link href="/app/meetings" className="text-cobalt hover:underline">{t("nav.meetings")} →</Link>} bodyClassName="p-0">
            {myMeetings.length === 0 ? <p className="px-4 py-5 text-[0.9rem] text-ink-3">{t("work.meetingsEmpty")}</p> : (
              <ul className="divide-y divide-line">
                {myMeetings.map((m) => (
                  <li key={m.id} className="grid grid-cols-[8.4rem_1fr] gap-3 px-4 py-3">
                    <span className="num text-[0.8rem] text-ink-2">{fmtDateTime(locale, m.startsAt, m.timeZone)}</span>
                    <span className="min-w-0"><span className="block truncate text-[0.92rem] font-medium">{pick(locale, m.titleTr, m.titleEn)}</span><span className="text-[0.8rem] text-ink-3">{m.location || (m.onlineUrl ? t("work.online") : "")}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t("work.followUps")} bodyClassName="p-0">
            {myFollowUps.length === 0 ? <p className="px-4 py-5 text-[0.9rem] text-ink-3">{t("work.followUpsEmpty")}</p> : (
              <ul className="divide-y divide-line">
                {myFollowUps.map((f) => (
                  <li key={f.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                    <span className="text-[0.9rem]">{pick(locale, f.textTr, f.textEn)}</span>
                    <span className={`num text-[0.8rem] ${overdue(f.dueDate) ? "font-medium text-red" : "text-ink-2"}`}>{f.dueDate ? fmtDate(locale, f.dueDate) : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
