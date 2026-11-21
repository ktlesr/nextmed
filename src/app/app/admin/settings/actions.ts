"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, assignments, baselines, people, project, referenceHours, subactivities } from "@/db/schema";
import { assertRole, can, ForbiddenError, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { parseISO, toISO } from "@/lib/dates";
import { getProject } from "@/lib/structure";
import { buildBaselineSnapshot } from "@/lib/plan-data";
import { getT } from "@/i18n/server";

async function guard(): Promise<{ user: SessionUser } | { error: ActionState }> {
  const { t } = await getT();
  try { return { user: await assertRole(can.admin) }; } catch (e) { if (e instanceof ForbiddenError) return { error: fail(t("common.forbidden")) }; throw e; }
}
const done = () => revalidatePath("/app", "layout");

/** The single project start date. Changing it later re-derives current dates only — baselines, work logs and closed reports stay put. */
export async function saveStartDate(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const p = await getProject();
  const date = str(fd, "startDate"), reason = optStr(fd, "reason");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || toISO(parseISO(date)) !== date) return fail(t("gantt.errDate"));
  if (p.startDate && p.startDate !== date && !reason) return fail(t("common.reasonRequired"));
  await db.update(project).set({ startDate: date }).where(eq(project.id, p.id));
  await audit({ userId: g.user.id, entity: "project", entityId: p.id, action: "start_date", reason, before: { startDate: p.startDate }, after: { startDate: date } });
  done();
  return ok(t("gantt.startSaved"));
}

/** First capture needs no reason; every later version is an explicit action with a reason. Old versions are retained. */
export async function captureBaseline(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const p = await getProject();
  if (!p.startDate) return fail(t("gantt.baseNeedStart"));
  const reason = optStr(fd, "reason");
  const version = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7304)`);
    const [last] = await tx.select({ v: baselines.version }).from(baselines).orderBy(desc(baselines.version)).limit(1);
    if (last && !reason) return null;
    const v = (last?.v ?? 0) + 1;
    await tx.insert(baselines).values({ version: v, startDate: p.startDate!, durationMonths: p.durationMonths, reason, snapshot: await buildBaselineSnapshot(tx), createdBy: g.user.id });
    await audit({ userId: g.user.id, entity: "baseline", entityId: String(v), action: "capture", reason, after: { version: v, startDate: p.startDate } }, tx);
    return v;
  });
  if (version == null) return fail(t("common.reasonRequired"));
  done();
  return ok(t("gantt.baseSaved", { v: version }));
}

export async function saveDuration(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const p = await getProject();
  const n = optNum(fd, "durationMonths"), reason = optStr(fd, "reason");
  if (!n || !Number.isInteger(n) || n < 1 || n > 120) return fail(t("common.invalid"));
  if (n === p.durationMonths) return ok(t("gantt.durSaved"));
  if (!reason) return fail(t("common.reasonRequired"));
  const [{ m }] = await db.select({ m: sql<number>`greatest(
    coalesce((select max(x) from ${activities}, unnest(${activities.months}) x), 0),
    coalesce((select max(x) from ${subactivities}, unnest(${subactivities.months}) x where ${subactivities.active}), 0),
    coalesce((select max(x) from ${assignments}, unnest(${assignments.months}) x where ${assignments.active}), 0))::int` }).from(project);
  if (n < m) return fail(t("gantt.errDur", { m }));
  await db.transaction(async (tx) => {
    await tx.update(project).set({ durationMonths: n }).where(eq(project.id, p.id));
    // assignment periods that ran to the old project end keep running to the new end
    await tx.update(people).set({ endProjectMonth: n }).where(eq(people.endProjectMonth, p.durationMonths));
    await audit({ userId: g.user.id, entity: "project", entityId: p.id, action: "duration", reason, before: { durationMonths: p.durationMonths }, after: { durationMonths: n } }, tx);
  });
  done();
  return ok(t("gantt.durSaved"));
}

export async function saveDefaultReference(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const p = await getProject();
  const h = optNum(fd, "hours");
  if (h == null || h < 0 || h > 400) return fail(t("common.invalid"));
  await db.update(project).set({ defaultReferenceHours: String(h) }).where(eq(project.id, p.id));
  await audit({ userId: g.user.id, entity: "project", entityId: p.id, action: "default_reference_hours", before: { hours: p.defaultReferenceHours }, after: { hours: h } });
  done();
  return ok(t("gantt.refSaved"));
}

export async function saveReferenceHours(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const personId = optStr(fd, "personId"), ym = str(fd, "ym"), h = optNum(fd, "hours");
  const mt = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!mt || h == null || h < 0 || h > 400 || +mt[2] < 1 || +mt[2] > 12) return fail(t("gantt.errRef"));
  const year = +mt[1], month = +mt[2];
  if (personId) { const [p] = await db.select({ id: people.id }).from(people).where(eq(people.id, personId)); if (!p) return fail(t("common.invalid")); }
  const where = and(personId ? eq(referenceHours.personId, personId) : isNull(referenceHours.personId), eq(referenceHours.year, year), eq(referenceHours.month, month));
  const [existing] = await db.select().from(referenceHours).where(where);
  if (existing) await db.update(referenceHours).set({ hours: String(h) }).where(eq(referenceHours.id, existing.id));
  else await db.insert(referenceHours).values({ personId, year, month, hours: String(h) });
  await audit({ userId: g.user.id, entity: "reference_hours", entityId: `${personId ?? "all"}:${ym}`, action: existing ? "update" : "create", before: existing ? { hours: existing.hours } : null, after: { hours: h } });
  done();
  return ok(t("gantt.refSaved"));
}

export async function deleteReferenceHours(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id)) return fail(t("common.invalid"));
  const [row] = await db.delete(referenceHours).where(eq(referenceHours.id, id)).returning();
  if (row) await audit({ userId: g.user.id, entity: "reference_hours", entityId: `${row.personId ?? "all"}:${row.year}-${row.month}`, action: "delete", before: { hours: row.hours } });
  done();
  return ok(t("gantt.refDeleted"));
}

export async function saveReportingRate(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const p = await getProject();
  const rate = optNum(fd, "rate");
  if (rate != null && (rate <= 0 || rate > 10000)) return fail(t("common.invalid"));
  await db.update(project).set({ budget: { ...p.budget, reporting_currency_rate_try_per_eur: rate } }).where(eq(project.id, p.id));
  await audit({ userId: g.user.id, entity: "project", entityId: p.id, action: "reporting_rate", before: { rate: p.budget.reporting_currency_rate_try_per_eur ?? null }, after: { rate } });
  done();
  return ok(t("gantt.rateSaved"));
}
