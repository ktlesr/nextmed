"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, payrollCosts, people } from "@/db/schema";
import { ForbiddenError, assertRole, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/files";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { getT } from "@/i18n/server";
import { isUuid } from "@/lib/records";

/** Exactly one record per person and payroll month (upsert). */
export async function savePayrollCost(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const personId = str(fd, "personId"), year = parseInt(str(fd, "year"), 10), month = parseInt(str(fd, "month"), 10);
    const [person] = await db.select({ id: people.id }).from(people).where(eq(people.id, personId));
    if (!person || !(year >= 2020 && year <= 2100) || !(month >= 1 && month <= 12)) return fail(t("common.invalid"));
    const amount = optNum(fd, "amount"), rate = optNum(fd, "rate");
    if (amount != null && amount < 0) return fail(t("common.invalid"), { amount: t("common.invalid") });
    if (rate != null && rate <= 0) return fail(t("common.invalid"), { rate: t("common.invalid") });
    const currency = ["TRY", "EUR"].includes(str(fd, "currency")) ? str(fd, "currency") : "TRY";
    const [before] = await db.select().from(payrollCosts).where(and(eq(payrollCosts.personId, personId), eq(payrollCosts.year, year), eq(payrollCosts.month, month)));
    const values = { amount: amount == null ? null : amount.toFixed(2), currency, rateTryPerEur: rate == null ? null : rate.toFixed(4), note: optStr(fd, "note"), updatedBy: user.id, updatedAt: new Date() };
    const [row] = await db.insert(payrollCosts).values({ personId, year, month, ...values })
      .onConflictDoUpdate({ target: [payrollCosts.personId, payrollCosts.year, payrollCosts.month], set: values }).returning({ id: payrollCosts.id });
    try {
      for (const [field, kind] of [["filePayroll", "payroll"], ["fileProof", "payment_proof"]] as const)
        for (const f of fd.getAll(field)) await saveUpload(f, { entityType: "payroll", entityId: row.id, lang: "tr", kind, access: "finance", uploadedBy: user.id });
    } catch (e) {
      return fail((e as Error).message === "file_too_large" ? t("common.fileTooLarge") : t("common.error"));
    }
    await audit({ userId: user.id, entity: "payroll_costs", entityId: row.id, action: before ? "update" : "create", before: before ? { amount: before.amount, currency: before.currency, rate: before.rateTryPerEur } : null, after: { personId, year, month, amount: values.amount, currency, rate: values.rateTryPerEur } });
    revalidatePath("/app/admin/costs");
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

export async function deletePayrollFile(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const id = str(fd, "fileId");
    const [f] = isUuid(id) ? await db.select({ id: files.id, name: files.name, entityId: files.entityId }).from(files).where(and(eq(files.id, id), eq(files.entityType, "payroll"))) : [];
    if (!f) return fail(t("common.notFound"));
    await db.delete(files).where(eq(files.id, id));
    await audit({ userId: user.id, entity: "files", entityId: id, action: "delete", before: { name: f.name, payrollCostId: f.entityId } });
    revalidatePath("/app/admin/costs");
    return ok();
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Valid GSS hourly cost of hourly staff (EUR / hour). */
export async function saveHourlyRates(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const hourly = await db.select({ id: people.id, rate: people.hourlyRateEur }).from(people).where(eq(people.planMethod, "hourly"));
    for (const p of hourly) {
      if (!fd.has(`rate:${p.id}`)) continue;
      const rate = optNum(fd, `rate:${p.id}`);
      if (rate != null && (rate < 0 || rate > 1000)) return fail(t("common.invalid"));
      const next = rate == null ? null : rate.toFixed(4);
      if (Number(next ?? -1) === Number(p.rate ?? -1)) continue;
      await db.update(people).set({ hourlyRateEur: next }).where(eq(people.id, p.id));
      await audit({ userId: user.id, entity: "people", entityId: p.id, action: "hourly_rate", before: { hourlyRateEur: p.rate }, after: { hourlyRateEur: next } });
    }
    revalidatePath("/app/admin/costs");
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}
