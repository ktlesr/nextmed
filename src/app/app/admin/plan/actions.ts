"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, assignments, people, subactivities, type MonthAllocation, type PlanStatus, type Responsibility, type ScheduleMode } from "@/db/schema";
import { assertRole, can, ForbiddenError, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optStr, str, type ActionState } from "@/lib/action";
import { PLAN_STATUSES, RESPONSIBILITIES } from "@/lib/constants";
import { assignmentMonths, getProject, outsideParent, subMonths, validateChain } from "@/lib/structure";
import { parseMonths, recomputeHourlyPlan, shiftAllocations, subHasHistory, uniqSorted } from "@/lib/plan-data";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isStatus = (s: string): s is PlanStatus => (PLAN_STATUSES as string[]).includes(s);
const isResp = (s: string): s is Responsibility => (RESPONSIBILITIES as string[]).includes(s);
const isDate = (s: string | null) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
const hoursToCenti = (raw: string) => { const n = Number(raw.replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const spread = (centi: number, months: number[]): MonthAllocation[] | null =>
  centi > 0 && months.length ? shiftAllocations([{ project_month: -1, planned_centi_hours: centi }], [], months) : null;
const done = () => { revalidatePath("/app/admin/plan"); revalidatePath("/app/gantt"); revalidatePath("/app/tasks"); };

async function guard(): Promise<{ user: SessionUser } | { error: ActionState }> {
  const { t } = await getT();
  try { return { user: await assertRole(can.editPlan) }; } catch (e) { if (e instanceof ForbiddenError) return { error: fail(t("common.forbidden")) }; throw e; }
}

/** Status / completion / result note of a FIXED main activity. Code, name, parent and months are never accepted. */
export async function saveActivityStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  for (const k of ["code", "name", "nameTr", "nameEn", "outputId", "months"]) if (fd.has(k)) return fail(t("gantt.errFrame"));
  const id = str(fd, "id"), status = str(fd, "status"), completedOn = optStr(fd, "completedOn");
  const [a] = await db.select().from(activities).where(eq(activities.id, id));
  if (!a || !isStatus(status) || !isDate(completedOn)) return fail(t("common.invalid"));
  const note = splitBilingual(str(fd, "resultNote"), null, { tr: a.resultNoteTr, en: a.resultNoteEn });
  const after = { status, completedOn: status === "completed" ? completedOn : null, resultNoteTr: note.tr, resultNoteEn: note.en };
  await db.update(activities).set(after).where(eq(activities.id, id));
  await audit({ userId: g.user.id, entity: "activity", entityId: id, action: "status", reason: optStr(fd, "reason"), before: { status: a.status, completedOn: a.completedOn, resultNoteTr: a.resultNoteTr }, after });
  await queueFields("activities", id, { result_note: note });
  done();
  return ok(t("gantt.statusSaved"));
}

export async function createSub(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const project = await getProject();
  const activityId = str(fd, "activityId");
  if (!(await validateChain(str(fd, "workPackageId"), str(fd, "outputId"), activityId))) return fail(t("gantt.errActivity"));
  const [act] = await db.select().from(activities).where(eq(activities.id, activityId));
  const nameRaw = str(fd, "name"); if (!nameRaw) return fail(t("gantt.errName"));
  const mode: ScheduleMode = str(fd, "mode") === "custom" ? "custom" : "inherit";
  const { months, beyond } = parseMonths(str(fd, "months"), project.durationMonths);
  if (mode === "custom" && beyond) return fail(t("gantt.errBeyond", { n: project.durationMonths }));
  if (mode === "custom" && !months.length) return fail(t("gantt.errMonths"));
  const resolved = mode === "custom" ? months : act.months;
  const outside = outsideParent(resolved, act.months);
  const reason = optStr(fd, "reason");
  if (outside.length && !reason) return fail(t("gantt.errOutsideReason"));
  const status = str(fd, "status") || "not_started"; if (!isStatus(status)) return fail(t("common.invalid"));

  const siblings = await db.select({ code: subactivities.code }).from(subactivities).where(eq(subactivities.activityId, activityId));
  const next = Math.max(0, ...siblings.map((s) => Number(s.code.split(".").pop()) || 0)) + 1;
  const code = str(fd, "code") || `${act.code}.${next}`;
  const name = splitBilingual(nameRaw), desc = splitBilingual(str(fd, "description")), note = splitBilingual(str(fd, "resultNote"));

  const pIds = fd.getAll("personId").map(String), resps = fd.getAll("responsibility").map(String), tasks = fd.getAll("task").map(String), hours = fd.getAll("hours").map(String);
  const ppl = await db.select().from(people);
  const rows = pIds.map((pid, i) => ({ person: ppl.find((p) => p.id === pid && p.active), resp: resps[i] ?? "", task: (tasks[i] ?? "").trim(), hours: hours[i] ?? "" })).filter((r) => r.person || r.task);
  if (rows.some((r) => !r.person)) return fail(t("gantt.errPerson"));
  if (rows.some((r) => !isResp(r.resp))) return fail(t("common.invalid"));

  const id = randomUUID();
  const now = new Date();
  const asg = rows.map((r) => {
    const centi = r.person!.planMethod === "hourly" ? hoursToCenti(r.hours) : 0; // a new task never raises a fixed ratio
    return { id: randomUUID(), personId: r.person!.id, subactivityId: id, responsibility: r.resp as Responsibility, task: splitBilingual(r.task), plannedMinutes: centi ? Math.round(centi * 0.6) : null, allocations: spread(centi, resolved) };
  });
  await db.transaction(async (tx) => {
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${subactivities.sort}), 0)::int` }).from(subactivities);
    await tx.insert(subactivities).values({ id, activityId, code, nameTr: name.tr, nameEn: name.en, descriptionTr: desc.tr, descriptionEn: desc.en, scheduleMode: mode, months: mode === "custom" ? months : null, status, resultNoteTr: note.tr, resultNoteEn: note.en, outsideParentReason: outside.length ? reason : null, sort: m + 1, portalEditedAt: now });
    if (asg.length) await tx.insert(assignments).values(asg.map((a) => ({ id: a.id, personId: a.personId, subactivityId: id, responsibility: a.responsibility, taskDescriptionTr: a.task.tr, taskDescriptionEn: a.task.en, plannedMinutes: a.plannedMinutes, allocations: a.allocations, scheduleMode: "inherit" as const, portalEditedAt: now })));
    await recomputeHourlyPlan(tx, asg.filter((a) => a.allocations).map((a) => a.personId));
    await audit({ userId: g.user.id, entity: "subactivity", entityId: id, action: "create", reason, after: { activityId, code, name: nameRaw, mode, months: resolved, outside, assignments: asg.map((a) => ({ id: a.id, personId: a.personId, responsibility: a.responsibility, plannedMinutes: a.plannedMinutes })) } }, tx);
  });
  await queueFields("subactivities", id, { name, description: desc, result_note: note });
  for (const a of asg) await queueFields("assignments", a.id, { task_description: a.task });
  done();
  return ok(t("gantt.subCreated"), { id });
}

export async function updateSub(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const project = await getProject();
  const id = str(fd, "id");
  const [sub] = await db.select().from(subactivities).where(eq(subactivities.id, id));
  if (!sub) return fail(t("common.notFound"));
  const [act] = await db.select().from(activities).where(eq(activities.id, sub.activityId));
  const nameRaw = str(fd, "name"); if (!nameRaw) return fail(t("gantt.errName"));
  const mode: ScheduleMode = str(fd, "mode") === "custom" ? "custom" : "inherit";
  const { months, beyond } = parseMonths(str(fd, "months"), project.durationMonths);
  if (mode === "custom" && beyond) return fail(t("gantt.errBeyond", { n: project.durationMonths }));
  if (mode === "custom" && !months.length) return fail(t("gantt.errMonths"));
  const status = str(fd, "status"), completedOn = optStr(fd, "completedOn");
  if (!isStatus(status) || !isDate(completedOn)) return fail(t("common.invalid"));
  const oldM = uniqSorted(subMonths(sub, act.months)), newM = mode === "custom" ? months : uniqSorted(act.months);
  const changed = !same(oldM, newM);
  const outside = outsideParent(newM, act.months);
  const reason = optStr(fd, "reason");
  if (changed && outside.length && !reason) return fail(t("gantt.errOutsideReason"));
  if (changed && !reason) return fail(t("common.reasonRequired"));
  const align = new Set(fd.getAll("align").map(String));
  const weights = str(fd, "weights").split(",").map((w) => Number(w.trim().replace(",", "."))).filter((n) => Number.isFinite(n) && n >= 0);

  const name = splitBilingual(nameRaw, null, { tr: sub.nameTr, en: sub.nameEn }), desc = splitBilingual(str(fd, "description"), null, { tr: sub.descriptionTr, en: sub.descriptionEn }), note = splitBilingual(str(fd, "resultNote"), null, { tr: sub.resultNoteTr, en: sub.resultNoteEn });
  const now = new Date();
  const affected: { id: string; from: number[]; to: number[] }[] = [];
  await db.transaction(async (tx) => {
    await tx.update(subactivities).set({ code: str(fd, "code") || sub.code, nameTr: name.tr, nameEn: name.en, descriptionTr: desc.tr, descriptionEn: desc.en, scheduleMode: mode, months: mode === "custom" ? months : null, status, completedOn: status === "completed" ? completedOn : null, resultNoteTr: note.tr, resultNoteEn: note.en, outsideParentReason: outside.length ? (changed ? reason : sub.outsideParentReason) : null, portalEditedAt: now, updatedAt: now }).where(eq(subactivities.id, id));
    if (changed) {
      const asgs = await tx.select().from(assignments).where(and(eq(assignments.subactivityId, id), eq(assignments.active, true)));
      const touched: string[] = [];
      for (const a of asgs) {
        const from = uniqSorted(assignmentMonths(a, oldM));
        if (a.scheduleMode === "custom" && !align.has(a.id)) continue; // custom periods move only when explicitly aligned
        // inherited assignments follow the new window; aligned custom ones keep their relative position when the length is unchanged
        const to = a.scheduleMode === "custom" ? (oldM.length === newM.length && from.every((m) => oldM.includes(m)) ? from.map((m) => newM[oldM.indexOf(m)]) : newM) : newM;
        const allocations = shiftAllocations(a.allocations, from, to, weights.length === to.length ? weights : undefined);
        await tx.update(assignments).set({ months: a.scheduleMode === "custom" ? to : null, allocations, portalEditedAt: now, updatedAt: now }).where(eq(assignments.id, a.id));
        affected.push({ id: a.id, from, to });
        if (a.allocations?.length) touched.push(a.personId);
      }
      await recomputeHourlyPlan(tx, touched);
    }
    await audit({ userId: g.user.id, entity: "subactivity", entityId: id, action: changed ? "reschedule" : "update", reason, before: { code: sub.code, nameTr: sub.nameTr, nameEn: sub.nameEn, mode: sub.scheduleMode, months: oldM, status: sub.status }, after: { code: str(fd, "code") || sub.code, name: nameRaw, mode, months: newM, status, outside, assignments: affected } }, tx);
  });
  await queueFields("subactivities", id, { name, description: desc, result_note: note });
  done();
  return ok(t("gantt.subUpdated"));
}

/** archive | restore | delete. Anything with past work or evidence is archived, never deleted. */
export async function subLifecycle(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const id = str(fd, "id"), intent = str(fd, "intent"), reason = optStr(fd, "reason");
  const [sub] = await db.select().from(subactivities).where(eq(subactivities.id, id));
  if (!sub) return fail(t("common.notFound"));
  const now = new Date();
  if (intent === "restore") {
    await db.update(subactivities).set({ active: true, portalEditedAt: now, updatedAt: now }).where(eq(subactivities.id, id));
    await audit({ userId: g.user.id, entity: "subactivity", entityId: id, action: "restore", reason });
    done(); return ok(t("gantt.subRestored"));
  }
  if (!reason) return fail(t("common.reasonRequired"));
  const history = await subHasHistory(id);
  if (intent === "delete" && !history) {
    await db.transaction(async (tx) => {
      const asgs = await tx.delete(assignments).where(eq(assignments.subactivityId, id)).returning({ personId: assignments.personId, allocations: assignments.allocations });
      await tx.delete(subactivities).where(eq(subactivities.id, id));
      await recomputeHourlyPlan(tx, asgs.filter((a) => a.allocations?.length).map((a) => a.personId));
      await audit({ userId: g.user.id, entity: "subactivity", entityId: id, action: "delete", reason, before: { code: sub.code, nameTr: sub.nameTr, activityId: sub.activityId } }, tx);
    });
    done(); return ok(t("gantt.subDeleted"));
  }
  await db.update(subactivities).set({ active: false, portalEditedAt: now, updatedAt: now }).where(eq(subactivities.id, id));
  await audit({ userId: g.user.id, entity: "subactivity", entityId: id, action: "archive", reason, before: { active: true } });
  done();
  return ok(t("gantt.subArchived"));
}

/** Re-parent: plain move when there is no history; otherwise archive and open a new sub-activity with a new id. */
export async function moveSub(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const id = str(fd, "id"), activityId = str(fd, "activityId"), reason = optStr(fd, "reason");
  const [sub] = await db.select().from(subactivities).where(eq(subactivities.id, id));
  const [target] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!sub) return fail(t("common.notFound"));
  if (!target || target.id === sub.activityId) return fail(t("gantt.errActivity"));
  if (!reason) return fail(t("common.reasonRequired"));
  const siblings = await db.select({ code: subactivities.code }).from(subactivities).where(eq(subactivities.activityId, activityId));
  const code = `${target.code}.${Math.max(0, ...siblings.map((s) => Number(s.code.split(".").pop()) || 0)) + 1}`;
  const history = await subHasHistory(id);
  const now = new Date();
  const newId = history ? randomUUID() : id;
  await db.transaction(async (tx) => {
    if (!history) {
      await tx.update(subactivities).set({ activityId, code, portalEditedAt: now, updatedAt: now }).where(eq(subactivities.id, id));
    } else {
      const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${subactivities.sort}), 0)::int` }).from(subactivities);
      await tx.update(subactivities).set({ active: false, portalEditedAt: now, updatedAt: now }).where(eq(subactivities.id, id));
      await tx.insert(subactivities).values({ id: newId, activityId, code, nameTr: sub.nameTr, nameEn: sub.nameEn, descriptionTr: sub.descriptionTr, descriptionEn: sub.descriptionEn, scheduleMode: sub.scheduleMode, months: sub.months, status: sub.status, sort: m + 1, portalEditedAt: now });
      const asgs = await tx.select().from(assignments).where(and(eq(assignments.subactivityId, id), eq(assignments.active, true)));
      for (const a of asgs) {
        await tx.insert(assignments).values({ id: randomUUID(), personId: a.personId, subactivityId: newId, responsibility: a.responsibility, taskDescriptionTr: a.taskDescriptionTr, taskDescriptionEn: a.taskDescriptionEn, plannedMinutes: a.plannedMinutes, plannedCostEur: a.plannedCostEur, scheduleMode: a.scheduleMode, months: a.months, allocations: a.allocations, status: a.status, portalEditedAt: now });
        await tx.update(assignments).set({ active: false, portalEditedAt: now, updatedAt: now }).where(eq(assignments.id, a.id));
      }
    }
    await audit({ userId: g.user.id, entity: "subactivity", entityId: id, action: history ? "reparent_archive_new" : "reparent", reason, before: { activityId: sub.activityId, code: sub.code }, after: { activityId, code, newId } }, tx);
  });
  done();
  return ok(history ? t("gantt.subMovedNew") : t("gantt.subMoved"));
}

export async function saveAssignment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const project = await getProject();
  const id = optStr(fd, "id"), subId = str(fd, "subactivityId"), resp = str(fd, "responsibility"), status = str(fd, "status") || "not_started";
  const [sub] = await db.select().from(subactivities).where(eq(subactivities.id, subId));
  if (!sub) return fail(t("common.notFound"));
  const [act] = await db.select().from(activities).where(eq(activities.id, sub.activityId));
  if (!isResp(resp) || !isStatus(status)) return fail(t("common.invalid"));
  const mode: ScheduleMode = str(fd, "mode") === "custom" ? "custom" : "inherit";
  const { months, beyond } = parseMonths(str(fd, "months"), project.durationMonths);
  if (mode === "custom" && beyond) return fail(t("gantt.errBeyond", { n: project.durationMonths }));
  if (mode === "custom" && !months.length) return fail(t("gantt.errMonths"));
  const subM = uniqSorted(subMonths(sub, act.months)), resolved = mode === "custom" ? months : subM;
  const [existing] = id ? await db.select().from(assignments).where(and(eq(assignments.id, id), eq(assignments.subactivityId, subId))) : [];
  if (id && !existing) return fail(t("common.notFound"));
  const personId = existing?.personId ?? str(fd, "personId");
  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person || (!existing && !person.active)) return fail(t("gantt.errPerson"));
  const task = splitBilingual(str(fd, "task"), null, existing ? { tr: existing.taskDescriptionTr, en: existing.taskDescriptionEn } : undefined);
  const centi = person.planMethod === "hourly" ? hoursToCenti(str(fd, "hours")) : 0;
  const oldCenti = (existing?.allocations ?? []).reduce((s, a) => s + a.planned_centi_hours, 0);
  const oldM = existing ? uniqSorted(assignmentMonths(existing, subM)) : [];
  // same total → keep the month distribution (shifted if the period moved); new total → equal split
  const allocations = person.planMethod !== "hourly" ? existing?.allocations ?? null : centi === oldCenti && existing ? shiftAllocations(existing.allocations, oldM, resolved) : spread(centi, resolved);
  const now = new Date(), newId = existing?.id ?? randomUUID();
  const values = { responsibility: resp, taskDescriptionTr: task.tr, taskDescriptionEn: task.en, scheduleMode: mode, months: mode === "custom" ? months : null, plannedMinutes: person.planMethod === "hourly" ? (centi ? Math.round(centi * 0.6) : null) : existing?.plannedMinutes ?? null, allocations, status, portalEditedAt: now, updatedAt: now };
  await db.transaction(async (tx) => {
    if (existing) await tx.update(assignments).set(values).where(eq(assignments.id, existing.id));
    else await tx.insert(assignments).values({ id: newId, personId, subactivityId: subId, ...values });
    if (person.planMethod === "hourly") await recomputeHourlyPlan(tx, [personId]);
    await audit({ userId: g.user.id, entity: "assignment", entityId: newId, action: existing ? "update" : "create", reason: optStr(fd, "reason"), before: existing ? { responsibility: existing.responsibility, mode: existing.scheduleMode, months: oldM, plannedMinutes: existing.plannedMinutes, status: existing.status } : null, after: { personId, subactivityId: subId, responsibility: resp, mode, months: resolved, plannedMinutes: values.plannedMinutes, status } }, tx);
  });
  await queueFields("assignments", newId, { task_description: task });
  done();
  return ok(t("gantt.asgSaved"));
}

/** Removing an assignment only closes it; work already logged stays with the person who did it. */
export async function removeAssignment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(); if ("error" in g) return g.error;
  const { t } = await getT();
  const id = str(fd, "id");
  const [a] = await db.select().from(assignments).where(eq(assignments.id, id));
  if (!a) return fail(t("common.notFound"));
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(assignments).set({ active: false, portalEditedAt: now, updatedAt: now }).where(eq(assignments.id, id));
    if (a.allocations?.length) await recomputeHourlyPlan(tx, [a.personId]);
    await audit({ userId: g.user.id, entity: "assignment", entityId: id, action: "remove", reason: optStr(fd, "reason"), before: { personId: a.personId, subactivityId: a.subactivityId, responsibility: a.responsibility, plannedMinutes: a.plannedMinutes } }, tx);
  });
  done();
  return ok(t("gantt.asgRemoved"));
}

