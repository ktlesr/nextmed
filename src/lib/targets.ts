import { and, between, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { hourlyPlan, referenceHours, workLogs } from "@/db/schema";
import { calendarMonthBounds, calendarTargets, projectMonthWindow } from "./dates";
import type { Person, ProjectRow } from "./structure";

export type MonthlyTarget =
  | { kind: "target"; minutes: number; method: "fixed_ratio" | "hourly" | "internal"; referenceHours?: number; ratio?: number }
  | { kind: "no_plan" }            // hourly plan is zero this month
  | { kind: "awaiting_start" }     // project start date not entered yet
  | { kind: "awaiting_reference" } // reference hours missing
  | { kind: "none" };              // unbudgeted support without an internal target / outside assignment period

export type WorkTotals = { logged: number; inReview: number; approved: number; draft: number; changesRequested: number };

/** Does the person's assignment period (project months) overlap this calendar month? */
function assignmentOverlap(p: Person, project: ProjectRow, year: number, month: number): number {
  if (!project.startDate) return 0;
  const cal = calendarMonthBounds(year, month);
  const first = projectMonthWindow(project.startDate, p.startProjectMonth).start;
  const last = projectMonthWindow(project.startDate, Math.min(p.endProjectMonth, project.durationMonths)).end;
  const s = first > cal.start ? first : cal.start, e = last < cal.end ? last : cal.end;
  if (s > e) return 0;
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
  return days(s, e) / days(cal.start, cal.end);
}

/**
 * Monthly targets for a set of people in one calendar month.
 *  - fixed ratio: reference working hours × ratio (e.g. 160 h × 15% = 24 h), pro-rated to the assignment period
 *  - hourly: the Gantt plan hours falling into the calendar month (0.01 h precision, totals preserved)
 *  - unbudgeted support: optional internal monitoring target
 */
export async function monthlyTargets(persons: Person[], project: ProjectRow, year: number, month: number): Promise<Map<string, MonthlyTarget>> {
  const out = new Map<string, MonthlyTarget>();
  const ids = persons.map((p) => p.id);
  if (!ids.length) return out;
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const [refs, plans] = await Promise.all([
    db.select().from(referenceHours).where(and(eq(referenceHours.year, year), eq(referenceHours.month, month), or(isNull(referenceHours.personId), inArray(referenceHours.personId, ids)))),
    db.select().from(hourlyPlan).where(inArray(hourlyPlan.personId, ids)),
  ]);
  const defaultRef = refs.find((r) => r.personId === null);
  for (const p of persons) {
    if (p.planMethod === "non_budget_support") {
      out.set(p.id, p.internalTargetMinutes ? { kind: "target", minutes: p.internalTargetMinutes, method: "internal" } : { kind: "none" });
      continue;
    }
    if (!project.startDate) { out.set(p.id, { kind: "awaiting_start" }); continue; }
    if (p.planMethod === "fixed_ratio") {
      const share = assignmentOverlap(p, project, year, month);
      if (share === 0) { out.set(p.id, { kind: "none" }); continue; }
      const ref = refs.find((r) => r.personId === p.id) ?? defaultRef;
      const hours = ref ? Number(ref.hours) : Number(project.defaultReferenceHours);
      if (!hours) { out.set(p.id, { kind: "awaiting_reference" }); continue; }
      const ratio = Number(p.fixedRatio ?? 0);
      out.set(p.id, { kind: "target", minutes: Math.round(hours * 60 * ratio * share), method: "fixed_ratio", referenceHours: hours, ratio });
      continue;
    }
    const mine = plans.filter((r) => r.personId === p.id);
    const centi = calendarTargets(project.startDate, mine).get(key) ?? 0;
    out.set(p.id, centi > 0 ? { kind: "target", minutes: Math.round((centi * 60) / 100), method: "hourly" } : { kind: "no_plan" });
  }
  return out;
}

/** Minutes per person for a calendar month, split by review state. Cancelled records never count. */
export async function monthlyWorkTotals(personIds: string[], year: number, month: number, workPackageId?: string | null): Promise<Map<string, WorkTotals>> {
  const out = new Map<string, WorkTotals>();
  if (!personIds.length) return out;
  const { start, end } = calendarMonthBounds(year, month);
  const rows = await db
    .select({ personId: workLogs.personId, status: workLogs.status, minutes: sql<number>`sum(${workLogs.minutes})::int` })
    .from(workLogs)
    .where(and(inArray(workLogs.personId, personIds), between(workLogs.workDate, start, end), workPackageId ? eq(workLogs.workPackageId, workPackageId) : undefined))
    .groupBy(workLogs.personId, workLogs.status);
  for (const id of personIds) out.set(id, { logged: 0, inReview: 0, approved: 0, draft: 0, changesRequested: 0 });
  for (const r of rows) {
    const t = out.get(r.personId)!;
    if (r.status === "cancelled") continue;
    t.logged += r.minutes;
    if (r.status === "approved") t.approved += r.minutes;
    else if (r.status === "in_review") t.inReview += r.minutes;
    else if (r.status === "draft") t.draft += r.minutes;
    else if (r.status === "changes_requested") t.changesRequested += r.minutes;
  }
  return out;
}
