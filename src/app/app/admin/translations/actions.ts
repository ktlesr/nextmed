"use server";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { translationJobs } from "@/db/schema";
import { assertRole, can, ForbiddenError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { applyTranslation, runTranslationJob, translatorConfigured } from "@/lib/translate";
import { getT } from "@/i18n/server";

const refresh = () => { revalidatePath("/app/admin/translations"); revalidatePath("/app/admin"); };

/** Correct and approve a translation: the text is written to the record's own language column. */
export async function approveTranslation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const id = parseInt(str(fd, "id"), 10);
    const text = str(fd, "targetText");
    if (!text) return fail(t("admin.trErrEmpty"));
    const [job] = await db.select().from(translationJobs).where(eq(translationJobs.id, id));
    if (!job) return fail(t("common.notFound"));
    // the source may have changed since this row was rendered — never approve against a stale revision
    if (String(job.sourceRevision) !== str(fd, "revision")) return fail(t("admin.trErrStale"));
    const target = job.sourceLang === "tr" ? "en" : "tr";
    try { await applyTranslation(job.entity, job.entityId, job.field, target, text); } catch { return fail(t("admin.trErrApply")); }
    await db.update(translationJobs).set({ targetText: text, status: "reviewed", error: null, reviewedBy: user.id, updatedAt: new Date() }).where(eq(translationJobs.id, id));
    await audit({ userId: user.id, entity: "translation", entityId: `${job.entity}:${job.entityId}:${job.field}`, action: "approve", before: { status: job.status, targetText: job.targetText }, after: { status: "reviewed", targetText: text } });
    refresh();
    return ok(t("admin.trApproved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Retry one pending or failed machine translation. */
export async function retryTranslation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    await assertRole(can.admin);
    if (!translatorConfigured()) return fail(t("admin.trNotConfigured"));
    const id = parseInt(str(fd, "id"), 10);
    try { await runTranslationJob(id); } catch (e) { refresh(); return fail(t("admin.trRetryFailed", { error: (e as Error).message })); }
    refresh();
    return ok(t("admin.trRetried"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Run the pending (and failed) queue in one go — bounded so a request cannot run away. */
export async function runPending(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    if (!translatorConfigured()) return fail(t("admin.trNotConfigured"));
    const jobs = await db.select({ id: translationJobs.id }).from(translationJobs).where(inArray(translationJobs.status, ["pending", "failed"])).orderBy(translationJobs.updatedAt).limit(40);
    let done = 0, failed = 0;
    for (let i = 0; i < jobs.length; i += 4) {
      const res = await Promise.allSettled(jobs.slice(i, i + 4).map((j) => runTranslationJob(j.id)));
      res.forEach((r) => (r.status === "fulfilled" ? done++ : failed++));
    }
    await audit({ userId: user.id, entity: "translation", action: "run_pending", after: { done, failed } });
    refresh();
    return failed && !done ? fail(t("admin.trBulkResult", { done, failed })) : ok(t("admin.trBulkResult", { done, failed }));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}
