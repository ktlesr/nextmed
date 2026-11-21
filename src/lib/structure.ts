import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, assignments, outputs, people, project, subactivities, workPackages } from "@/db/schema";

export type ProjectRow = typeof project.$inferSelect;
export type WorkPackage = typeof workPackages.$inferSelect;
export type Output = typeof outputs.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Subactivity = typeof subactivities.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;

export const getProject = cache(async (): Promise<ProjectRow> => {
  const [p] = await db.select().from(project).limit(1);
  if (!p) throw new Error("Project is not initialised. Run `npm run db:setup`.");
  return p;
});

/** The fixed reference frame: 6 WP → 14 outputs → 27 activities. */
export const getFrame = cache(async () => {
  const [wps, outs, acts] = await Promise.all([
    db.select().from(workPackages).orderBy(asc(workPackages.sort)),
    db.select().from(outputs).orderBy(asc(outputs.sort)),
    db.select().from(activities).orderBy(asc(activities.sort)),
  ]);
  return { wps, outs, acts };
});

export const getSubactivities = cache(async (includeArchived = false) => {
  const q = db.select().from(subactivities);
  return includeArchived ? q.orderBy(asc(subactivities.sort)) : q.where(eq(subactivities.active, true)).orderBy(asc(subactivities.sort));
});

export const getPeople = cache(async (includeInactive = false) => {
  const q = db.select().from(people);
  return includeInactive ? q.orderBy(asc(people.sort)) : q.where(eq(people.active, true)).orderBy(asc(people.sort));
});

/** Compact option lists for the dependent WP → output → activity → sub-activity selects. */
export const getChainOptions = cache(async () => {
  const [{ wps, outs, acts }, subs] = await Promise.all([getFrame(), getSubactivities()]);
  return {
    wps: wps.map((w) => ({ id: w.id, code: w.code, nameTr: w.nameTr, nameEn: w.nameEn })),
    outs: outs.map((o) => ({ id: o.id, parent: o.workPackageId, code: o.code, nameTr: o.nameTr, nameEn: o.nameEn })),
    acts: acts.map((a) => ({ id: a.id, parent: a.outputId, code: a.code, nameTr: a.nameTr, nameEn: a.nameEn, months: a.months })),
    subs: subs.map((s) => ({ id: s.id, parent: s.activityId, code: s.code, nameTr: s.nameTr ?? "", nameEn: s.nameEn ?? "" })),
  };
});
export type ChainOptions = Awaited<ReturnType<typeof getChainOptions>>;

/* ── Schedule resolution ──────────────────────────────────────────────── */
/** A sub-activity inherits its parent activity's months unless it has a custom list. */
export const subMonths = (s: Pick<Subactivity, "scheduleMode" | "months">, parentMonths: number[]): number[] =>
  s.scheduleMode === "custom" && s.months ? s.months : parentMonths;
/** An assignment inherits the sub-activity's current months unless it has a custom list. */
export const assignmentMonths = (a: Pick<Assignment, "scheduleMode" | "months">, subM: number[]): number[] =>
  a.scheduleMode === "custom" && a.months ? a.months : subM;
/** Months of a sub-activity that fall outside its parent's fixed reference window. */
export const outsideParent = (subM: number[], parentMonths: number[]) => {
  if (!parentMonths.length) return subM;
  const lo = Math.min(...parentMonths), hi = Math.max(...parentMonths);
  return subM.filter((m) => m < lo || m > hi);
};

/** Validates a WP → output → activity (→ sub-activity) chain against the fixed tree. */
export async function validateChain(wpId: string, outputId: string, activityId: string, subactivityId?: string | null): Promise<boolean> {
  const { outs, acts } = await getFrame();
  const out = outs.find((o) => o.id === outputId);
  const act = acts.find((a) => a.id === activityId);
  if (!out || !act || out.workPackageId !== wpId || act.outputId !== outputId) return false;
  if (subactivityId) {
    const [s] = await db.select({ a: subactivities.activityId, active: subactivities.active }).from(subactivities).where(eq(subactivities.id, subactivityId));
    if (!s || s.a !== activityId || !s.active) return false;
  }
  return true;
}
