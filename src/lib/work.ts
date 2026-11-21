import "server-only";
import { and, asc, between, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { activities, monthClosures, outputs, people, subactivities, users, workLogs, workPackages, type Role, type WorkLogStatus } from "@/db/schema";
import type { SessionUser } from "./auth";
import { addDays, parseISO, toISO, type ISODate } from "./dates";

export type MonthState = "open" | "closed" | "reopened";

/** Minutes already logged by a person on a date. Cancelled records never count. */
export async function dayUsedMinutes(q: Db | Tx, personId: string, date: ISODate, excludeId?: string | null): Promise<number> {
  const [r] = await q
    .select({ n: sql<number>`coalesce(sum(${workLogs.minutes}), 0)::int` })
    .from(workLogs)
    .where(and(eq(workLogs.personId, personId), eq(workLogs.workDate, date), ne(workLogs.status, "cancelled"), excludeId ? ne(workLogs.id, excludeId) : undefined));
  return r?.n ?? 0;
}

export async function monthState(year: number, month: number): Promise<MonthState> {
  const [c] = await db.select().from(monthClosures).where(and(eq(monthClosures.year, year), eq(monthClosures.month, month)));
  if (!c) return "open";
  return c.reopenedAt ? "reopened" : "closed";
}
export const monthStateOfDate = (date: ISODate) => monthState(Number(date.slice(0, 4)), Number(date.slice(5, 7)));

/**
 * Final review is never given by the record's owner. Admins review anything but their own; a coordinator
 * reviews team members' records, and another reviewer's records only when designated as that person's reviewer.
 */
export function canReviewLog(user: SessionUser, owner: { personId: string; role: Role | null; reviewerPersonId: string | null }): boolean {
  if (user.role !== "admin" && user.role !== "coordinator") return false;
  if (user.personId && user.personId === owner.personId) return false;
  if (user.role === "admin") return true;
  if (owner.role === "admin" || owner.role === "coordinator") return !!owner.reviewerPersonId && owner.reviewerPersonId === user.personId;
  return true;
}

export type LogRow = Awaited<ReturnType<typeof fetchLogs>>[number];

export async function fetchLogs(f: { personId?: string | null; personIds?: string[]; from?: ISODate; to?: ISODate; status?: WorkLogStatus | WorkLogStatus[] | null; workPackageId?: string | null; id?: string; excludeCancelled?: boolean; newestFirst?: boolean; limit?: number }) {
  const where: (SQL | undefined)[] = [
    f.id ? eq(workLogs.id, f.id) : undefined,
    f.personId ? eq(workLogs.personId, f.personId) : undefined,
    f.personIds ? inArray(workLogs.personId, f.personIds.length ? f.personIds : ["-"]) : undefined,
    f.from && f.to ? between(workLogs.workDate, f.from, f.to) : undefined,
    Array.isArray(f.status) ? inArray(workLogs.status, f.status) : f.status ? eq(workLogs.status, f.status) : undefined,
    f.workPackageId ? eq(workLogs.workPackageId, f.workPackageId) : undefined,
    f.excludeCancelled ? ne(workLogs.status, "cancelled") : undefined,
  ];
  const q = db
    .select({
      id: workLogs.id, personId: workLogs.personId, personName: people.fullName, workDate: workLogs.workDate, minutes: workLogs.minutes,
      workPackageId: workLogs.workPackageId, outputId: workLogs.outputId, activityId: workLogs.activityId, subactivityId: workLogs.subactivityId,
      wpCode: workPackages.code, wpTr: workPackages.nameTr, wpEn: workPackages.nameEn,
      outCode: outputs.code, outTr: outputs.nameTr, outEn: outputs.nameEn,
      actCode: activities.code, actTr: activities.nameTr, actEn: activities.nameEn,
      subCode: subactivities.code, subTr: subactivities.nameTr, subEn: subactivities.nameEn,
      descriptionTr: workLogs.descriptionTr, descriptionEn: workLogs.descriptionEn, sourceLang: workLogs.sourceLang,
      status: workLogs.status, outsidePlanWindow: workLogs.outsidePlanWindow, reviewNote: workLogs.reviewNote, reviewedAt: workLogs.reviewedAt,
      reviewerUserId: workLogs.reviewerUserId, submittedAt: workLogs.submittedAt, createdAt: workLogs.createdAt, updatedAt: workLogs.updatedAt,
    })
    .from(workLogs)
    .innerJoin(people, eq(people.id, workLogs.personId))
    .innerJoin(workPackages, eq(workPackages.id, workLogs.workPackageId))
    .innerJoin(outputs, eq(outputs.id, workLogs.outputId))
    .innerJoin(activities, eq(activities.id, workLogs.activityId))
    .leftJoin(subactivities, eq(subactivities.id, workLogs.subactivityId))
    .where(and(...where))
    .orderBy(f.newestFirst ? desc(workLogs.workDate) : asc(workLogs.workDate), asc(workLogs.createdAt));
  return f.limit ? q.limit(f.limit) : q;
}

/** Owner account info needed for the review rule, keyed by personId. */
export async function ownerAccounts(personIds: string[]): Promise<Map<string, { personId: string; role: Role | null; reviewerPersonId: string | null }>> {
  const map = new Map<string, { personId: string; role: Role | null; reviewerPersonId: string | null }>();
  if (!personIds.length) return map;
  const rows = await db.select({ personId: users.personId, role: users.role, reviewerPersonId: users.reviewerPersonId }).from(users).where(inArray(users.personId, personIds));
  for (const id of personIds) map.set(id, { personId: id, role: null, reviewerPersonId: null });
  for (const r of rows) if (r.personId) map.set(r.personId, { personId: r.personId, role: r.role, reviewerPersonId: r.reviewerPersonId });
  return map;
}

/* ── small calendar helpers for the screens ───────────────────────────── */
export const mondayOf = (date: ISODate): ISODate => {
  const d = parseISO(date);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return toISO(d);
};
export const weekDays = (monday: ISODate): ISODate[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime()) && toISO(parseISO(s)) === s;
/** Parses "YYYY-MM"; falls back to the month of `fallback` (an ISO date). */
export function parseYM(s: string | undefined, fallback: ISODate): { year: number; month: number; key: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  const key = m && +m[2] >= 1 && +m[2] <= 12 ? m[0] : fallback.slice(0, 7);
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), key };
}
export const shiftYM = (key: string, delta: number) => {
  const t = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
