import Link from "next/link";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { assignments, workLogs, type WorkLogStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, todayInIstanbul } from "@/lib/dates";
import { listFiles } from "@/lib/files";
import { fmtDate, fmtDuration } from "@/lib/format";
import { getChainOptions, getProject } from "@/lib/structure";
import { fetchLogs, isISODate, mondayOf, monthState, weekDays, type LogRow, type MonthState } from "@/lib/work";
import { WORK_LOG_STATUSES } from "@/lib/constants";
import { getT } from "@/i18n/server";
import { EmptyState, Meter, Notice, PageHeader, Stat, TabLinks } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { LogLine } from "@/components/work/log-bits";
import { DeleteDraftButton, SubmitLogButton } from "@/components/work/row-actions";
import { WorkLogButton } from "@/components/work/work-form";
import { cn } from "@/lib/cn";

export const metadata = { title: "Çalışmalarım" };

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ view?: string; w?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ t, locale }, project] = await Promise.all([getT(), getProject()]);
  const today = todayInIstanbul();

  if (!user.personId) {
    return (
      <>
        <PageHeader eyebrow={t("nav.groupDaily")} title={t("nav.work")} />
        <EmptyState title={t("work.noPersonTitle")}>{t("work.noPerson")}</EmptyState>
      </>
    );
  }
  const personId = user.personId;
  const view = sp.view === "list" ? "list" : "week";
  const monday = mondayOf(sp.w && isISODate(sp.w) ? sp.w : today);
  const days = weekDays(monday);
  const statusFilter = WORK_LOG_STATUSES.includes(sp.status as WorkLogStatus) ? (sp.status as WorkLogStatus) : null;

  const [options, asg, logs, counts, todayUsedRow] = await Promise.all([
    getChainOptions(),
    db.select({ sub: assignments.subactivityId }).from(assignments).where(and(eq(assignments.personId, personId), eq(assignments.active, true))),
    view === "week" ? fetchLogs({ personId, from: days[0], to: days[6] }) : fetchLogs({ personId, status: statusFilter, newestFirst: true, limit: 200 }),
    db.select({ status: workLogs.status, n: sql<number>`count(*)::int` }).from(workLogs).where(eq(workLogs.personId, personId)).groupBy(workLogs.status),
    db.select({ n: sql<number>`coalesce(sum(${workLogs.minutes}),0)::int` }).from(workLogs).where(and(eq(workLogs.personId, personId), eq(workLogs.workDate, today), ne(workLogs.status, "cancelled"))),
  ]);
  const assignedSubIds = asg.map((a) => a.sub);
  const files = await listFiles("work_log", logs.map((l) => l.id));
  const limit = project.dailyLimitMinutes, step = project.stepMinutes;

  // day totals (non-cancelled) for every date on screen → remaining time when editing a row
  const dates = [...new Set(logs.map((l) => l.workDate))];
  const totalsRows = dates.length
    ? await db.select({ d: workLogs.workDate, n: sql<number>`sum(${workLogs.minutes})::int` }).from(workLogs).where(and(eq(workLogs.personId, personId), inArray(workLogs.workDate, dates), ne(workLogs.status, "cancelled"))).groupBy(workLogs.workDate)
    : [];
  const dayTotal = new Map(totalsRows.map((r) => [r.d, r.n]));
  const monthKeys = [...new Set([...dates, today].map((d) => d.slice(0, 7)))];
  const mStates = new Map<string, MonthState>(await Promise.all(monthKeys.map(async (k) => [k, await monthState(+k.slice(0, 4), +k.slice(5, 7))] as const)));

  const todayUsed = todayUsedRow[0].n;
  const formBase = { options, assignedSubIds, today, minDate: project.startDate, limit, step };
  const startMissing = !project.startDate;
  const newButton = (date: string, size: "sm" | "md" = "md") => (
    <WorkLogButton {...formBase} size={size} quiet={size === "sm"} initial={{ workDate: date }} initialRemaining={Math.max(0, limit - (date === today ? todayUsed : dayTotal.get(date) ?? 0))} disabledReason={startMissing ? t("work.needStartShort") : null} />
  );

  const rowActions = (l: LogRow) => {
    const ms = mStates.get(l.workDate.slice(0, 7)) ?? "open";
    if (ms === "closed") return null;
    const editable = l.status === "draft" || l.status === "changes_requested" || (ms === "reopened" && l.status !== "cancelled");
    if (!editable) return null;
    return (
      <>
        <WorkLogButton {...formBase} reopened={ms === "reopened" && l.status !== "draft"} initial={{ id: l.id, workDate: l.workDate, minutes: l.minutes, wp: l.workPackageId, out: l.outputId, act: l.activityId, sub: l.subactivityId, description: (l.sourceLang === "tr" ? l.descriptionTr : l.descriptionEn) ?? "", status: l.status }}
          initialRemaining={Math.max(0, limit - ((dayTotal.get(l.workDate) ?? 0) - (l.status === "cancelled" ? 0 : l.minutes)))} />
        {(l.status === "draft" || l.status === "changes_requested") && <SubmitLogButton id={l.id} />}
        {l.status === "draft" && !l.submittedAt && <DeleteDraftButton id={l.id} />}
      </>
    );
  };

  const weekTotal = logs.filter((l) => l.status !== "cancelled").reduce((a, l) => a + l.minutes, 0);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const href = (o: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const all = { view, w: view === "week" ? monday : null, status: statusFilter, ...o };
    for (const [k, v] of Object.entries(all)) if (v && !(k === "view" && v === "week")) q.set(k, v);
    const s = q.toString();
    return s ? `/app/work?${s}` : "/app/work";
  };

  return (
    <>
      <PageHeader eyebrow={`${t("nav.groupDaily")} · ${user.fullName}`} title={t("nav.work")} description={t("work.lede")} actions={newButton(today)} />
      {startMissing && <Notice tone="warn" className="mb-6" title={t("common.awaitingStart")}>{t("work.needStart")}</Notice>}
      {count("changes_requested") > 0 && <Notice tone="warn" className="mb-6" title={t("work.changesRequestedTitle", { n: count("changes_requested") })}><Link href="/app/work?view=list&status=changes_requested" className="underline underline-offset-2">{t("work.showThem")} →</Link></Notice>}

      <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-ink py-5 lg:grid-cols-4">
        <div>
          <Stat label={t("work.today")} value={fmtDuration(locale, todayUsed)} sub={todayUsed >= limit ? t("work.dayFull") : t("work.remainingToday", { d: fmtDuration(locale, limit - todayUsed) })} />
          <Meter value={todayUsed} max={limit} tone={todayUsed >= limit ? "ok" : "cobalt"} className="mt-3 max-w-44" label={t("work.today")} />
        </div>
        <Stat label={t("work.statDraft")} value={count("draft")} sub={t("work.statDraftSub")} />
        <Stat label={t("common.st.in_review")} value={count("in_review")} tone={count("in_review") ? "cobalt" : undefined} sub={t("work.statReviewSub")} />
        <Stat label={t("common.st.changes_requested")} value={count("changes_requested")} tone={count("changes_requested") ? "warn" : undefined} sub={t("work.statChangesSub")} />
      </div>

      <TabLinks current={view} items={[{ key: "week", href: href({ view: "week", status: null, w: monday }), label: t("work.weekView") }, { key: "list", href: href({ view: "list", w: null }), label: t("work.listView") }]} />

      {view === "week" ? (
        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Link href={href({ w: addDays(monday, -7) })} aria-label={t("work.prevWeek")} className={buttonClass("secondary", "sm", "px-1.5")}><ChevronLeft className="size-4" /></Link>
              <Link href={href({ w: addDays(monday, 7) })} aria-label={t("work.nextWeek")} className={buttonClass("secondary", "sm", "px-1.5")}><ChevronRight className="size-4" /></Link>
              {monday !== mondayOf(today) && <Link href="/app/work" className={buttonClass("ghost", "sm")}>{t("work.thisWeek")}</Link>}
              <p className="num ml-2 text-[0.9rem]">{fmtDate(locale, days[0])} – {fmtDate(locale, days[6])}</p>
            </div>
            <p className="text-[0.88rem] text-ink-2">{t("work.weekTotal")}: <span className="num font-medium text-ink">{fmtDuration(locale, weekTotal)}</span></p>
          </div>
          <div className="panel">
            {days.map((d) => {
              const dayLogs = logs.filter((l) => l.workDate === d);
              const total = dayTotal.get(d) ?? 0;
              const future = d > today, isToday = d === today;
              const closed = (mStates.get(d.slice(0, 7)) ?? "open") === "closed";
              return (
                <div key={d} className={cn("grid border-b border-line last:border-b-0 md:grid-cols-[11.5rem_1fr]", future && "opacity-55")}>
                  <div className={cn("border-line px-4 py-3 md:border-r", isToday && "bg-cobalt-soft/50")}>
                    <p className="flex items-baseline gap-2">
                      <span className="font-display text-[1.05rem] font-semibold capitalize">{fmtDate(locale, d, { weekday: "long" })}</span>
                      {isToday && <span className="label text-cobalt">{t("work.todayTag")}</span>}
                    </p>
                    <p className="num text-[0.8rem] text-ink-2">{fmtDate(locale, d)}</p>
                    <p className="num mt-2 text-[0.8rem]"><span className={cn("font-medium", total >= limit && "text-ok")}>{fmtDuration(locale, total)}</span><span className="text-ink-3"> / {fmtDuration(locale, limit)}</span></p>
                    <Meter value={total} max={limit} tone={total >= limit ? "ok" : "cobalt"} className="mt-1.5 h-1.5 max-w-36" label={fmtDate(locale, d)} />
                    {!future && !closed && !startMissing && total < limit && (!project.startDate || d >= project.startDate) && <div className="no-print mt-2.5">{newButton(d, "sm")}</div>}
                    {closed && <p className="label mt-2">{t("work.monthClosedTag")}</p>}
                  </div>
                  <div className="min-w-0 px-4">
                    {dayLogs.length ? dayLogs.map((l) => <LogLine key={l.id} log={l} locale={locale} t={t} files={files.get(l.id)} duration={fmtDuration(locale, l.minutes)} actions={rowActions(l)} href={`/app/work/${l.id}`} />) : <p className="py-3.5 text-[0.86rem] text-ink-3">{future ? "" : t("work.noRecordsDay")}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-5">
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Link href={href({ status: null })} className={buttonClass(statusFilter ? "secondary" : "primary", "sm")}>{t("common.all")}</Link>
            {WORK_LOG_STATUSES.map((s) => <Link key={s} href={href({ status: s })} className={buttonClass(statusFilter === s ? "primary" : "secondary", "sm")}>{t(`common.st.${s}`)}<span className="num opacity-70">{count(s)}</span></Link>)}
          </div>
          {logs.length === 0 ? <EmptyState title={statusFilter ? t("common.emptyFiltered") : t("common.empty")}>{t("work.emptyHint")}</EmptyState> : (
            <div className="panel px-4">
              {logs.map((l) => (
                <div key={l.id} className="grid border-b border-line last:border-b-0 sm:grid-cols-[6.5rem_1fr]">
                  <p className="num pt-3.5 text-[0.84rem] text-ink-2">{fmtDate(locale, l.workDate)}</p>
                  <LogLine log={l} locale={locale} t={t} files={files.get(l.id)} duration={fmtDuration(locale, l.minutes)} actions={rowActions(l)} href={`/app/work/${l.id}`} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
