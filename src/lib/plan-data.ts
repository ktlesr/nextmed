import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { activities, assignments, baselines, files, hourlyPlan, people, subactivities, workLogs, type BaselineSnapshot, type MonthAllocation } from "@/db/schema";
import { projectMonthOf } from "./dates";
import { assignmentMonths, subMonths, type ProjectRow } from "./structure";

export const uniqSorted = (m: number[]) => [...new Set(m)].sort((a, b) => a - b);

export async function latestBaseline() {
  const [b] = await db.select().from(baselines).orderBy(desc(baselines.version)).limit(1);
  return b ?? null;
}

/** Project months that have (non-cancelled) work logged, keyed by activity id and sub-activity id. */
export async function actualMonths(project: ProjectRow): Promise<{ byActivity: Map<string, number[]>; bySub: Map<string, number[]> }> {
  const byActivity = new Map<string, Set<number>>(), bySub = new Map<string, Set<number>>();
  if (project.startDate) {
    const rows = await db
      .selectDistinct({ a: workLogs.activityId, s: workLogs.subactivityId, d: workLogs.workDate })
      .from(workLogs)
      .where(ne(workLogs.status, "cancelled"));
    for (const r of rows) {
      const m = projectMonthOf(project.startDate, project.durationMonths, r.d);
      if (!m) continue;
      (byActivity.get(r.a) ?? byActivity.set(r.a, new Set()).get(r.a)!).add(m);
      if (r.s) (bySub.get(r.s) ?? bySub.set(r.s, new Set()).get(r.s)!).add(m);
    }
  }
  const conv = (x: Map<string, Set<number>>) => new Map([...x].map(([k, v]) => [k, uniqSorted([...v])]));
  return { byActivity: conv(byActivity), bySub: conv(bySub) };
}

/** Immutable snapshot of the current plan with resolved months. */
export async function buildBaselineSnapshot(tx: Tx | typeof db = db): Promise<BaselineSnapshot> {
  const [acts, subs, asgs, hp, ppl] = await Promise.all([
    tx.select().from(activities),
    tx.select().from(subactivities),
    tx.select().from(assignments).where(eq(assignments.active, true)),
    tx.select().from(hourlyPlan),
    tx.select().from(people),
  ]);
  const actM = new Map(acts.map((a) => [a.id, a.months]));
  const subM = new Map(subs.map((s) => [s.id, subMonths(s, actM.get(s.activityId) ?? [])]));
  return {
    activities: acts.map((a) => ({ id: a.id, months: a.months })),
    subactivities: subs.map((s) => ({ id: s.id, activityId: s.activityId, code: s.code, nameTr: s.nameTr, months: subM.get(s.id)!, active: s.active })),
    assignments: asgs.map((a) => ({ id: a.id, personId: a.personId, subactivityId: a.subactivityId, responsibility: a.responsibility, months: assignmentMonths(a, subM.get(a.subactivityId) ?? []), plannedMinutes: a.plannedMinutes, allocations: a.allocations })),
    hourlyPlan: hp.map((h) => ({ personId: h.personId, projectMonth: h.projectMonth, centiHours: h.centiHours })),
    people: ppl.map((p) => ({ id: p.id, planMethod: p.planMethod, fixedRatio: p.fixedRatio, totalPlannedMinutes: p.totalPlannedMinutes })),
  };
}

/** The person × project-month hourly plan is the sum of that person's active assignment allocations. */
export async function recomputeHourlyPlan(tx: Tx, personIds: string[]) {
  const ids = [...new Set(personIds)];
  if (!ids.length) return;
  const rows = await tx.select({ personId: assignments.personId, allocations: assignments.allocations }).from(assignments).where(and(inArray(assignments.personId, ids), eq(assignments.active, true)));
  const sum = new Map<string, number>();
  for (const r of rows) for (const a of r.allocations ?? []) sum.set(`${r.personId}|${a.project_month}`, (sum.get(`${r.personId}|${a.project_month}`) ?? 0) + a.planned_centi_hours);
  await tx.delete(hourlyPlan).where(inArray(hourlyPlan.personId, ids));
  const values = [...sum].filter(([, c]) => c > 0).map(([k, c]) => ({ personId: k.split("|")[0], projectMonth: Number(k.split("|")[1]), centiHours: c }));
  if (values.length) await tx.insert(hourlyPlan).values(values);
}

/** Does a sub-activity have history (work logs or evidence) that forbids deletion / plain re-parenting? */
export async function subHasHistory(subId: string): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(workLogs).where(eq(workLogs.subactivityId, subId));
  if (n > 0) return true;
  const [{ f }] = await db.select({ f: sql<number>`count(*)::int` }).from(files).where(sql`${files.entityType} = 'work_log' and ${files.entityId} in (select id::text from work_logs where subactivity_id = ${subId})`);
  return f > 0;
}

/**
 * Move an allocation onto a new month list keeping the total.
 * Same length → each allocation keeps its position in the window; otherwise equal or weighted split.
 */
export function shiftAllocations(old: MonthAllocation[] | null, oldMonths: number[], newMonths: number[], weights?: number[]): MonthAllocation[] | null {
  if (!old || !old.length) return old;
  const om = uniqSorted(oldMonths), nm = uniqSorted(newMonths);
  if (!nm.length) return old;
  if (om.length === nm.length && old.every((a) => om.includes(a.project_month)))
    return old.map((a) => ({ project_month: nm[om.indexOf(a.project_month)], planned_centi_hours: a.planned_centi_hours })).sort((a, b) => a.project_month - b.project_month);
  const total = old.reduce((s, a) => s + a.planned_centi_hours, 0);
  const w = weights && weights.length === nm.length && weights.some((x) => x > 0) ? weights : nm.map(() => 1);
  const wsum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (total * x) / wsum), out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++;
  return nm.map((m, i) => ({ project_month: m, planned_centi_hours: out[i] }));
}

export const parseMonths = (raw: string, duration: number): { months: number[]; beyond: boolean } => {
  const all = raw.split(",").map((v) => parseInt(v.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 1);
  return { months: uniqSorted(all.filter((n) => n <= duration)), beyond: all.some((n) => n > duration) };
};
