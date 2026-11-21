"use server";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { workLogs } from "@/db/schema";
import { can, getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { canReviewLog, monthStateOfDate, ownerAccounts } from "@/lib/work";
import { getT } from "@/i18n/server";

/**
 * approve | return (reason) | cancel (reason). `ids` may carry several records for a bulk approval.
 * The reviewer is re-checked for every record: nobody gives the final review to their own work.
 */
export async function reviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  if (!user || !can.coordinate(user)) return fail(t("common.forbidden"));
  const decision = str(fd, "decision");
  const reason = str(fd, "reason");
  const ids = [...new Set(fd.getAll("ids").flatMap((v) => String(v).split(",")).filter((v) => /^[0-9a-f-]{36}$/i.test(v)))];
  if (!ids.length || !["approve", "return", "cancel"].includes(decision)) return fail(t("common.invalid"));
  if (decision !== "approve" && !reason) return fail(t("common.reasonRequired"));

  const rows = await db.select().from(workLogs).where(inArray(workLogs.id, ids));
  if (rows.length !== ids.length) return fail(t("common.notFound"));
  const owners = await ownerAccounts([...new Set(rows.map((r) => r.personId))]);
  for (const r of rows) {
    if (!canReviewLog(user, owners.get(r.personId)!)) return fail(r.personId === user.personId ? t("work.errOwnReview") : t("work.errNotReviewer"));
    if (decision === "cancel" ? r.status === "cancelled" : r.status !== "in_review") return fail(t("work.errNotInReview"));
    if ((await monthStateOfDate(r.workDate)) === "closed") return fail(t("work.errClosed"));
  }
  const status = decision === "approve" ? "approved" : decision === "return" ? "changes_requested" : "cancelled";
  await db.transaction(async (tx) => {
    await tx.update(workLogs).set({ status, reviewerUserId: user.id, reviewNote: decision === "approve" ? null : reason, reviewedAt: new Date(), updatedAt: new Date() }).where(inArray(workLogs.id, ids));
    for (const r of rows) await audit({ userId: user.id, entity: "work_log", entityId: r.id, action: decision, reason: reason || null, before: { status: r.status }, after: { status } }, tx);
  });
  revalidatePath("/app", "layout");
  return ok(decision === "approve" ? t("work.approvedN", { n: ids.length }) : decision === "return" ? t("work.returned") : t("work.cancelled"));
}
