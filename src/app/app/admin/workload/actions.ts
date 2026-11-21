"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { monthClosures } from "@/db/schema";
import { assertRole, can, ForbiddenError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { todayInIstanbul } from "@/lib/dates";
import { getT } from "@/i18n/server";

const parse = (s: string) => { const m = /^(\d{4})-(\d{2})$/.exec(s); return m && +m[2] >= 1 && +m[2] <= 12 ? { year: +m[1], month: +m[2] } : null; };

/** Close a calendar month for reporting: its records can no longer be entered, edited or reviewed. */
export async function closeMonthAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.coordinate);
    const ym = parse(str(fd, "ym"));
    if (!ym) return fail(t("common.invalid"));
    if (str(fd, "ym") > todayInIstanbul().slice(0, 7)) return fail(t("work.errCloseFuture"));
    await db.insert(monthClosures).values({ ...ym, closedBy: user.id, closedAt: new Date() })
      .onConflictDoUpdate({ target: [monthClosures.year, monthClosures.month], set: { closedBy: user.id, closedAt: new Date(), reopenedAt: null, reopenReason: null } });
    await audit({ userId: user.id, entity: "month_closure", entityId: str(fd, "ym"), action: "close" });
    revalidatePath("/app", "layout");
    return ok(t("work.monthClosedOk"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Reopen a closed month — only with a reason. Records edited afterwards go back to review. */
export async function reopenMonthAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.coordinate);
    const ym = parse(str(fd, "ym"));
    const reason = str(fd, "reason");
    if (!ym) return fail(t("common.invalid"));
    if (!reason) return fail(t("common.reasonRequired"));
    const [c] = await db.select().from(monthClosures).where(and(eq(monthClosures.year, ym.year), eq(monthClosures.month, ym.month)));
    if (!c || c.reopenedAt) return fail(t("work.errNotClosed"));
    await db.update(monthClosures).set({ reopenedAt: new Date(), reopenReason: reason }).where(and(eq(monthClosures.year, ym.year), eq(monthClosures.month, ym.month)));
    await audit({ userId: user.id, entity: "month_closure", entityId: str(fd, "ym"), action: "reopen", reason });
    revalidatePath("/app", "layout");
    return ok(t("work.monthReopenedOk"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}
