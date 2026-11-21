import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { baselines, files, payrollCosts, people as peopleTable, translationJobs, workLogs } from "@/db/schema";
import { calendarMonthBounds, diffDays, projectMonthOf, projectMonthWindow, projectEnd } from "./dates";
import { getFrame, getPeople, getSubactivities, outsideParent, subMonths, type ProjectRow } from "./structure";
import { monthlyTargets, monthlyWorkTotals } from "./targets";
import { accumulate, loadObservations, loadOutputs } from "./adminOutputs";
import { previewImport } from "./importer";

export type PlanItem = {
  level: "activity" | "sub"; id: string; code: string; nameTr: string | null; nameEn: string | null; wpId: string; wpCode: string; activityCode: string;
  baseMonth: number | null; curMonth: number | null; baseEnd: string | null; curEnd: string | null;
  status: string; done: boolean; doneOn: string | null; baseDue: boolean; curDue: boolean; daysLate: number;
};

const last = (m: number[]) => (m.length ? Math.max(...m) : null);

/** Plan compliance for one period: baseline, current plan and actuals are kept as three separate readings. */
export async function planCompliance(project: ProjectRow, periodEnd: string, wpId: string | null) {
  const [{ wps, outs, acts }, subs, [baseline]] = await Promise.all([getFrame(), getSubactivities(), db.select().from(baselines).orderBy(desc(baselines.version)).limit(1)]);
  const wpOfAct = new Map(acts.map((a) => { const w = wps.find((x) => x.id === outs.find((o) => o.id === a.outputId)!.workPackageId)!; return [a.id, w]; }));
  const baseAct = new Map((baseline?.snapshot.activities ?? []).map((a) => [a.id, a.months]));
  const baseSub = new Map((baseline?.snapshot.subactivities ?? []).filter((s) => s.active !== false).map((s) => [s.id, s.months]));
  const baseStart = baseline?.startDate ?? project.startDate; // without a baseline the current plan stands in
  const curStart = project.startDate;
  const endOf = (start: string | null, m: number | null) => (start && m ? projectMonthWindow(start, m).end : null);

  const items: PlanItem[] = [];
  const push = (level: PlanItem["level"], r: { id: string; code: string; nameTr: string | null; nameEn: string | null; status: string; completedOn: string | null }, actId: string, baseM: number | null, curM: number | null) => {
    const wp = wpOfAct.get(actId)!;
    if (wpId && wp.id !== wpId) return;
    const baseEnd = endOf(baseStart, baseM), curEnd = endOf(curStart, curM);
    const done = r.status === "completed" && (!r.completedOn || r.completedOn <= periodEnd);
    const baseDue = !!baseEnd && baseEnd <= periodEnd;
    items.push({
      level, id: r.id, code: r.code, nameTr: r.nameTr, nameEn: r.nameEn, wpId: wp.id, wpCode: wp.code, activityCode: acts.find((a) => a.id === actId)!.code,
      baseMonth: baseM, curMonth: curM, baseEnd, curEnd, status: r.status, done, doneOn: r.status === "completed" ? r.completedOn : null,
      baseDue, curDue: !!curEnd && curEnd <= periodEnd, daysLate: baseDue && !done ? diffDays(baseEnd!, periodEnd) : 0,
    });
  };
  const actById = new Map(acts.map((a) => [a.id, a]));
  for (const a of acts) push("activity", a, a.id, last(baseline ? baseAct.get(a.id) ?? a.months : a.months), last(a.months));
  const forecast = new Map<string, number>();
  const outside: { id: string; code: string; nameTr: string | null; nameEn: string | null; wpCode: string; months: number[]; outside: number[]; parentCode: string; parentMonths: number[]; reason: string | null }[] = [];
  for (const s of subs) {
    const parent = actById.get(s.activityId);
    if (!parent) continue;
    const cur = subMonths(s, parent.months);
    const curLast = last(cur);
    if (curLast) forecast.set(parent.id, Math.max(forecast.get(parent.id) ?? 0, curLast));
    const out = outsideParent(cur, parent.months);
    const wp = wpOfAct.get(parent.id)!;
    if (out.length && (!wpId || wp.id === wpId)) outside.push({ id: s.id, code: s.code, nameTr: s.nameTr, nameEn: s.nameEn, wpCode: wp.code, months: cur, outside: out, parentCode: parent.code, parentMonths: parent.months, reason: s.outsideParentReason });
    // a sub-activity added after the baseline has no baseline reading
    push("sub", s, parent.id, baseline ? last(baseSub.get(s.id) ?? []) : curLast, curLast);
  }
  // Current finish forecast of each fixed parent, rolled up from its sub-activities — shown beside, never written over, the reference plan.
  const forecasts = acts.filter((a) => !wpId || wpOfAct.get(a.id)!.id === wpId).map((a) => ({ id: a.id, code: a.code, nameTr: a.nameTr, nameEn: a.nameEn, wpCode: wpOfAct.get(a.id)!.code, refMonth: last(a.months)!, forecastMonth: forecast.get(a.id) ?? last(a.months)!, status: a.status }))
    .filter((f) => f.forecastMonth !== f.refMonth);

  const dur = project.durationMonths;
  const lanes = { baseline: Array<number>(dur + 1).fill(0), current: Array<number>(dur + 1).fill(0), actual: Array<number>(dur + 1).fill(0) };
  for (const it of items) {
    if (it.level !== "sub") continue;
    if (it.baseMonth && it.baseMonth <= dur) lanes.baseline[it.baseMonth]++;
    if (it.curMonth && it.curMonth <= dur) lanes.current[it.curMonth]++;
    if (it.doneOn && curStart) { const m = projectMonthOf(curStart, dur, it.doneOn); if (m) lanes.actual[m]++; }
  }
  let periodMonth: number | null = null;
  if (curStart) periodMonth = periodEnd < curStart ? 0 : periodEnd > projectEnd(curStart, dur) ? dur : projectMonthOf(curStart, dur, periodEnd);

  const tally = (level: PlanItem["level"]) => {
    const l = items.filter((i) => i.level === level);
    return { total: l.length, baseDue: l.filter((i) => i.baseDue).length, baseDueDone: l.filter((i) => i.baseDue && i.done).length, curDue: l.filter((i) => i.curDue).length, curDueDone: l.filter((i) => i.curDue && i.done).length, done: l.filter((i) => i.done).length };
  };
  const delays = items.filter((i) => i.baseDue && !i.done).sort((a, b) => b.daysLate - a.daysLate || a.code.localeCompare(b.code, undefined, { numeric: true }));
  return { hasBaseline: !!baseline, baselineVersion: baseline?.version ?? null, baselineStart: baseline?.startDate ?? null, hasStart: !!curStart, activities: tally("activity"), subs: tally("sub"), delays, forecasts, outside, lanes, periodMonth };
}

/** Per-person workload for the calendar month. */
export async function teamWorkload(project: ProjectRow, year: number, month: number, wpId: string | null) {
  const persons = await getPeople();
  const [targets, totals] = await Promise.all([monthlyTargets(persons, project, year, month), monthlyWorkTotals(persons.map((p) => p.id), year, month, wpId)]);
  return persons.map((p) => ({ person: p, target: targets.get(p.id)!, totals: totals.get(p.id)! }));
}

/**
 * Cumulative eligible personnel cost up to the end of the selected month.
 *  fixed ratio → documented eligible monthly employer cost × ratio (TRY converted with the reporting rate, else the plan rate)
 *  hourly      → approved hours × valid hourly cost
 *  unbudgeted  → 0 €
 * With a work-package filter, a fixed-ratio month is shared out by that person's approved minutes per WP in the month.
 */
export async function personnelCost(project: ProjectRow, year: number, month: number, wpId: string | null) {
  const persons = await getPeople(true);
  const { end } = calendarMonthBounds(year, month);
  const ym = year * 12 + month;
  const [pay, mins] = await Promise.all([
    db.select().from(payrollCosts).where(sql`${payrollCosts.year} * 12 + ${payrollCosts.month} <= ${ym}`),
    db.select({ personId: workLogs.personId, ym: sql<string>`to_char(${workLogs.workDate}::date, 'YYYY-MM')`, wp: workLogs.workPackageId, minutes: sql<number>`sum(${workLogs.minutes})::int` })
      .from(workLogs).where(and(eq(workLogs.status, "approved"), lte(workLogs.workDate, end))).groupBy(workLogs.personId, sql`2`, workLogs.workPackageId),
  ]);
  const rate = project.budget.reporting_currency_rate_try_per_eur || project.budget.plan_currency_rate_try_per_eur;
  const minutesOf = (personId: string, key?: string, wp?: string | null) => mins.filter((m) => m.personId === personId && (!key || m.ym === key) && (!wp || m.wp === wp)).reduce((a, b) => a + b.minutes, 0);
  let total = 0, missingRate = 0, unallocated = 0;
  const rows = persons.map((p) => {
    let eur = 0;
    if (p.planMethod === "fixed_ratio") {
      for (const r of pay.filter((x) => x.personId === p.id && x.amount != null)) {
        const base = r.currency === "TRY" ? Number(r.amount) / Number(r.rateTryPerEur ?? rate) : Number(r.amount);
        const cost = base * Number(p.fixedRatio ?? 0);
        if (!wpId) { eur += cost; continue; }
        const key = `${r.year}-${String(r.month).padStart(2, "0")}`, all = minutesOf(p.id, key);
        if (all > 0) eur += (cost * minutesOf(p.id, key, wpId)) / all; else unallocated += cost;
      }
    } else if (p.planMethod === "hourly") {
      const m = minutesOf(p.id, undefined, wpId);
      if (m > 0 && !p.hourlyRateEur) missingRate++;
      eur = (m / 60) * Number(p.hourlyRateEur ?? 0);
    }
    total += eur;
    return { id: p.id, fullName: p.fullName, method: p.planMethod, eur, planned: Number(p.plannedCostEur) };
  }).filter((r) => r.eur > 0 || r.planned > 0);

  // payroll months without an amount between the project start and the selected month
  let missingPayroll = 0;
  if (project.startDate) {
    const [sy, sm] = project.startDate.split("-").map(Number);
    const have = new Set(pay.filter((x) => x.amount != null).map((x) => `${x.personId}|${x.year * 12 + x.month}`));
    for (const p of persons.filter((x) => x.active && x.planMethod === "fixed_ratio")) for (let k = sy * 12 + sm; k <= ym; k++) if (!have.has(`${p.id}|${k}`)) missingPayroll++;
  }
  const { wps } = await getFrame();
  const wp = wps.find((w) => w.id === wpId);
  const ceiling = wp ? Number(wp.personnelCeilingEur) : project.budget.personnel_ceiling_eur;
  const plan = wp ? Number(wp.personnelPlanEur) : project.budget.personnel_plan_eur;
  return { total, ceiling, plan, remaining: ceiling - total, rows, missingRate, missingPayroll, unallocated, rate, usesReportingRate: !!project.budget.reporting_currency_rate_try_per_eur };
}

export async function priorityOutputs(periodEnd: string, wpId: string | null) {
  const outs = (await loadOutputs()).filter((o) => o.priority && (!wpId || o.workPackageIds.includes(wpId)));
  const actuals = accumulate(await loadObservations(outs.map((o) => o.id)), { until: periodEnd });
  return outs.map((o) => ({ output: o, zafer: actuals.get(o.id)?.zafer ?? null }));
}

let bundledSeed: Promise<Record<string, unknown>> | null = null;
export const loadBundledSeed = () => (bundledSeed ??= readFile(path.join(process.cwd(), "data", "seed.v3.json"), "utf8").then((s) => JSON.parse(s)));

/** Counters for the "needs attention" list. */
export async function attention(wpId: string | null) {
  const [[review], tr, evidence, conflicts] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(workLogs).where(and(eq(workLogs.status, "in_review"), wpId ? eq(workLogs.workPackageId, wpId) : undefined)),
    db.select({ status: translationJobs.status, n: sql<number>`count(*)::int` }).from(translationJobs).where(inArray(translationJobs.status, ["pending", "failed"])).groupBy(translationJobs.status),
    // work-log evidence that has a Turkish original but no English version yet
    db.select({ entityId: files.entityId }).from(files).where(eq(files.entityType, "work_log")).groupBy(files.entityId).having(sql`bool_or(${files.lang} = 'tr') and not bool_or(${files.lang} = 'en')`),
    loadBundledSeed().then((seed) => previewImport(db, seed)).then((p) => p.summary.conflict).catch(() => null),
  ]);
  const ids = evidence.map((e) => e.entityId).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const logs = ids.length
    ? await db.select({ id: workLogs.id, workDate: workLogs.workDate, personName: peopleTable.fullName, descriptionTr: workLogs.descriptionTr, descriptionEn: workLogs.descriptionEn, status: workLogs.status, wp: workLogs.workPackageId })
        .from(workLogs).innerJoin(peopleTable, eq(peopleTable.id, workLogs.personId)).where(and(inArray(workLogs.id, ids), sql`${workLogs.status} <> 'cancelled'`, wpId ? eq(workLogs.workPackageId, wpId) : undefined)).orderBy(desc(workLogs.workDate))
    : [];
  return { inReview: review.n, pendingTranslations: tr.find((x) => x.status === "pending")?.n ?? 0, failedTranslations: tr.find((x) => x.status === "failed")?.n ?? 0, evidenceAwaitingEn: logs, importConflicts: conflicts };
}
