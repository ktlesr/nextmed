"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, subactivities, workLogs } from "@/db/schema";
import { can, getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { projectMonthOf, todayInIstanbul } from "@/lib/dates";
import { fmtDuration } from "@/lib/format";
import { MAX_FILE_BYTES, saveLink, saveUpload } from "@/lib/files";
import { getProject, subMonths, validateChain } from "@/lib/structure";
import { queueFields, splitBilingual } from "@/lib/translate";
import { dayUsedMinutes, isISODate, monthStateOfDate } from "@/lib/work";
import { getT } from "@/i18n/server";

class Reject extends Error {}

async function storeEvidence(fd: FormData, logId: string, userId: string) {
  for (const lang of ["tr", "en"] as const) {
    for (const f of fd.getAll(lang === "tr" ? "fileTr" : "fileEn")) await saveUpload(f, { entityType: "work_log", entityId: logId, lang, kind: "evidence", uploadedBy: userId });
    await saveLink(str(fd, lang === "tr" ? "linkTr" : "linkEn"), { entityType: "work_log", entityId: logId, lang, kind: "evidence", uploadedBy: userId });
  }
}
const filesTooLarge = (fd: FormData) => [...fd.getAll("fileTr"), ...fd.getAll("fileEn")].some((f) => typeof f !== "string" && f.size > MAX_FILE_BYTES);

/** What can still be logged on a date (used by the form when the date changes). */
export async function dayInfoAction(date: string, excludeId?: string | null): Promise<{ remaining: number; state: "ok" | "closed" | "future" | "outside" | "no_start" | "invalid" }> {
  const user = await getUser();
  if (!user?.personId || !isISODate(date)) return { remaining: 0, state: "invalid" };
  const project = await getProject();
  if (!project.startDate) return { remaining: 0, state: "no_start" };
  if (date > todayInIstanbul()) return { remaining: 0, state: "future" };
  if (projectMonthOf(project.startDate, project.durationMonths, date) == null) return { remaining: 0, state: "outside" };
  if ((await monthStateOfDate(date)) === "closed") return { remaining: 0, state: "closed" };
  const used = await dayUsedMinutes(db, user.personId, date, excludeId && /^[0-9a-f-]{36}$/i.test(excludeId) ? excludeId : null);
  return { remaining: Math.max(0, project.dailyLimitMinutes - used), state: "ok" };
}

/**
 * Create or edit a daily work record. Date, duration and the activity chain are validated again here;
 * the 8-hour ceiling is checked under a per person+day advisory lock so two devices cannot overrun it.
 */
export async function saveWorkLogAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t, locale } = await getT();
  const user = await getUser();
  if (!user) return fail(t("common.forbidden"));
  if (!user.personId) return fail(t("work.noPerson"));
  const personId = user.personId;
  const project = await getProject();
  if (!project.startDate) return fail(t("work.needStart"));

  const id = str(fd, "id") || null;
  const workDate = str(fd, "workDate");
  const minutes = parseInt(str(fd, "minutes"), 10);
  const wp = str(fd, "workPackageId"), out = str(fd, "outputId"), act = str(fd, "activityId"), sub = str(fd, "subactivityId") || null;
  const description = str(fd, "description");
  const langOverride = str(fd, "sourceLang");
  const intent = str(fd, "intent") === "submit" ? "submit" : "draft";

  const errors: Record<string, string> = {};
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return fail(t("common.notFound"));
  if (!isISODate(workDate)) errors.workDate = t("common.required");
  if (!Number.isInteger(minutes) || minutes < project.stepMinutes || minutes > project.dailyLimitMinutes || minutes % project.stepMinutes !== 0) errors.minutes = t("work.errStep");
  if (!wp) errors.workPackageId = t("common.required");
  if (!out) errors.outputId = t("common.required");
  if (!act) errors.activityId = t("common.required");
  if (!description) errors.description = t("common.required");
  if (Object.keys(errors).length) return fail(t("common.invalid"), errors);
  if (workDate > todayInIstanbul()) return fail(t("work.errFuture"), { workDate: t("work.errFuture") });
  const pm = projectMonthOf(project.startDate, project.durationMonths, workDate);
  if (pm == null) return fail(t("work.errOutsideProject"), { workDate: t("work.errOutsideProject") });
  if (!(await validateChain(wp, out, act, sub))) return fail(t("work.errChain"));
  if (filesTooLarge(fd)) return fail(t("common.fileTooLarge"));
  const mState = await monthStateOfDate(workDate);
  if (mState === "closed") return fail(t("work.errClosed"));

  // Work outside the planned window is allowed — the actual date is never bent to the plan — but flagged.
  const [a] = await db.select({ months: activities.months }).from(activities).where(eq(activities.id, act));
  let planMonths = a?.months ?? [];
  if (sub) {
    const [s] = await db.select({ scheduleMode: subactivities.scheduleMode, months: subactivities.months }).from(subactivities).where(eq(subactivities.id, sub));
    if (s) planMonths = subMonths(s, planMonths);
  }
  const outsidePlanWindow = !planMonths.includes(pm);

  let savedId = id;
  let split: ReturnType<typeof splitBilingual>;
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${personId + "|" + workDate}))`);
      let existing: typeof workLogs.$inferSelect | undefined;
      if (id) {
        [existing] = await tx.select().from(workLogs).where(and(eq(workLogs.id, id), eq(workLogs.personId, personId))).for("update");
        if (!existing) throw new Reject(t("common.notFound"));
        const editable = existing.status === "draft" || existing.status === "changes_requested" || (existing.status !== "cancelled" && mState === "reopened");
        if (!editable) throw new Reject(t("work.errNotEditable"));
        if (existing.workDate !== workDate) {
          // moving a record to another day: lock that day too and make sure the old month is not closed
          if ((await monthStateOfDate(existing.workDate)) === "closed") throw new Reject(t("work.errClosed"));
        }
      }
      const used = await dayUsedMinutes(tx, personId, workDate, id);
      const remaining = project.dailyLimitMinutes - used;
      if (minutes > remaining) throw new Reject(remaining <= 0 ? t("work.errDayFull") : t("work.errRemaining", { d: fmtDuration(locale, remaining) }));

      const sp = splitBilingual(description, langOverride === "tr" || langOverride === "en" ? langOverride : null, existing ? { tr: existing.descriptionTr, en: existing.descriptionEn } : undefined);
      // A record edited in a reopened month always goes back to review.
      const status = mState === "reopened" && existing && existing.status !== "draft" ? "in_review" : intent === "submit" ? "in_review" : existing?.status === "changes_requested" ? "changes_requested" : "draft";
      const values = {
        workDate, minutes, workPackageId: wp, outputId: out, activityId: act, subactivityId: sub,
        descriptionTr: sp.tr, descriptionEn: sp.en, sourceLang: sp.sourceLang, status, outsidePlanWindow,
        submittedAt: status === "in_review" ? new Date() : existing?.submittedAt ?? null, updatedAt: new Date(),
      } as const;
      if (existing) {
        await tx.update(workLogs).set(values).where(eq(workLogs.id, existing.id));
        await audit({ userId: user.id, entity: "work_log", entityId: existing.id, action: status === "in_review" ? "resubmit" : "update", before: { workDate: existing.workDate, minutes: existing.minutes, status: existing.status, activityId: existing.activityId, subactivityId: existing.subactivityId }, after: { workDate, minutes, status, activityId: act, subactivityId: sub } }, tx);
        return { id: existing.id, sp, status };
      }
      const [row] = await tx.insert(workLogs).values({ ...values, personId, createdBy: user.id }).returning({ id: workLogs.id });
      return { id: row.id, sp, status };
    });
    savedId = result.id;
    split = result.sp;
    await storeEvidence(fd, result.id, user.id);
    await queueFields("work_logs", result.id, { description: split });
    revalidatePath("/app", "layout");
    const msg = result.status === "in_review" ? t("work.submitted") : t("work.savedDraft");
    return ok(outsidePlanWindow ? `${msg} ${t("work.warnOutsidePlan")}` : msg, { id: savedId, outsidePlanWindow });
  } catch (e) {
    if (e instanceof Reject) return fail(e.message);
    if ((e as Error).message === "file_too_large") return fail(t("common.fileTooLarge"));
    console.error(e);
    return fail(t("common.error"));
  }
}

/** Draft / changes-requested → in review, straight from the list. */
export async function submitLogAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  if (!user?.personId || !/^[0-9a-f-]{36}$/i.test(id)) return fail(t("common.forbidden"));
  const [row] = await db.select().from(workLogs).where(and(eq(workLogs.id, id), eq(workLogs.personId, user.personId)));
  if (!row) return fail(t("common.notFound"));
  if (row.status !== "draft" && row.status !== "changes_requested") return fail(t("work.errNotEditable"));
  if ((await monthStateOfDate(row.workDate)) === "closed") return fail(t("work.errClosed"));
  await db.update(workLogs).set({ status: "in_review", submittedAt: new Date(), updatedAt: new Date() }).where(eq(workLogs.id, id));
  await audit({ userId: user.id, entity: "work_log", entityId: id, action: "submit", before: { status: row.status }, after: { status: "in_review" } });
  revalidatePath("/app", "layout");
  return ok(t("work.submitted"));
}

/** The owner may delete a draft that was never submitted. Anything else is cancelled by a reviewer, with a reason. */
export async function deleteDraftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  if (!user?.personId || !/^[0-9a-f-]{36}$/i.test(id)) return fail(t("common.forbidden"));
  const [row] = await db.select().from(workLogs).where(and(eq(workLogs.id, id), eq(workLogs.personId, user.personId)));
  if (!row) return fail(t("common.notFound"));
  if (row.status !== "draft" || row.submittedAt) return fail(t("work.errNotEditable"));
  await db.execute(sql`delete from files where entity_type = 'work_log' and entity_id = ${id}`);
  await db.execute(sql`delete from translation_jobs where entity = 'work_logs' and entity_id = ${id}`);
  await db.delete(workLogs).where(eq(workLogs.id, id));
  await audit({ userId: user.id, entity: "work_log", entityId: id, action: "delete_draft", before: { workDate: row.workDate, minutes: row.minutes } });
  revalidatePath("/app", "layout");
  return ok(t("common.deleted"));
}

/** More evidence pairs can be attached to the same record later. Originals are always kept. */
export async function addEvidenceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return fail(t("common.forbidden"));
  const [row] = await db.select().from(workLogs).where(eq(workLogs.id, id));
  if (!row) return fail(t("common.notFound"));
  if (row.personId !== user.personId && !can.coordinate(user)) return fail(t("common.forbidden"));
  if (row.status === "cancelled") return fail(t("work.errNotEditable"));
  if (filesTooLarge(fd)) return fail(t("common.fileTooLarge"));
  const has = [...fd.getAll("fileTr"), ...fd.getAll("fileEn")].some((f) => typeof f !== "string" && f.size > 0) || /^https?:\/\//i.test(str(fd, "linkTr")) || /^https?:\/\//i.test(str(fd, "linkEn"));
  if (!has) return fail(t("work.errNoFile"));
  await storeEvidence(fd, id, user.id);
  revalidatePath(`/app/work/${id}`);
  revalidatePath("/app/review");
  return ok(t("work.evidenceAdded"));
}
