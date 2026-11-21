"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { expectedPayments, files, paymentTransfers } from "@/db/schema";
import { ForbiddenError, assertRole, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";
import { CURRENCIES, isUuid, saveEvidence } from "@/lib/records";

const KINDS = ["advance", "interim", "balance"] as const;
const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fileError = (e: unknown, t: (k: string) => string) => fail((e as Error).message === "file_too_large" ? t("common.fileTooLarge") : t("common.error"));

export async function savePayment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const id = optStr(fd, "id");
    const [existing] = id && isUuid(id) ? await db.select().from(expectedPayments).where(eq(expectedPayments.id, id)) : [];
    if (id && !existing) return fail(t("common.notFound"));
    const kind = KINDS.find((k) => k === str(fd, "kind"));
    const amount = optNum(fd, "expectedAmount");
    const errors: Record<string, string> = {};
    if (!kind) errors.kind = t("common.required");
    if (amount == null || amount <= 0) errors.expectedAmount = t("finance.amountPositive");
    if (Object.keys(errors).length) return fail(errors.expectedAmount ?? t("common.invalid"), errors);
    const note = splitBilingual(str(fd, "note"), null, { tr: existing?.noteTr, en: existing?.noteEn });
    const date = optStr(fd, "expectedDate");
    const values = { kind: kind!, period: optStr(fd, "period"), sender: optStr(fd, "sender"), expectedAmount: amount!.toFixed(2), currency: CURRENCIES.includes(str(fd, "currency")) ? str(fd, "currency") : "EUR", expectedDate: isDate(date) ? date : null, noteTr: note.tr, noteEn: note.en };
    let rowId = existing?.id;
    if (existing) {
      await db.update(expectedPayments).set(values).where(eq(expectedPayments.id, existing.id));
      await audit({ userId: user.id, entity: "expected_payments", entityId: existing.id, action: "update", before: { kind: existing.kind, expectedAmount: existing.expectedAmount, currency: existing.currency, period: existing.period }, after: { kind: values.kind, expectedAmount: values.expectedAmount, currency: values.currency, period: values.period } });
    } else {
      [{ id: rowId }] = await db.insert(expectedPayments).values({ ...values, createdBy: user.id }).returning({ id: expectedPayments.id });
    }
    try { await saveEvidence(fd, { entityType: "payment", entityId: rowId!, kind: "basis", access: "team", uploadedBy: user.id }); } catch (e) { return fileError(e, t); }
    await queueFields("expected_payments", rowId!, { note });
    revalidatePath("/app/payments");
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** A bank transfer credited against an expected payment. One payment may arrive in several transfers. */
export async function addTransfer(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const paymentId = str(fd, "paymentId");
    const [payment] = isUuid(paymentId) ? await db.select({ id: expectedPayments.id }).from(expectedPayments).where(eq(expectedPayments.id, paymentId)) : [];
    if (!payment) return fail(t("common.notFound"));
    const amount = optNum(fd, "amount"), valueDate = optStr(fd, "valueDate");
    if (amount == null || amount <= 0) return fail(t("finance.amountPositive"), { amount: t("finance.amountPositive") });
    if (!isDate(valueDate)) return fail(t("common.invalid"), { valueDate: t("common.required") });
    const [row] = await db.insert(paymentTransfers).values({ paymentId, valueDate: valueDate!, amount: amount.toFixed(2), reference: optStr(fd, "reference"), createdBy: user.id }).returning({ id: paymentTransfers.id });
    // bank receipts are restricted to finance access
    try { await saveEvidence(fd, { entityType: "transfer", entityId: row.id, kind: "receipt", access: "finance", uploadedBy: user.id }); }
    catch (e) { await db.delete(paymentTransfers).where(eq(paymentTransfers.id, row.id)); return fileError(e, t); }
    await audit({ userId: user.id, entity: "payment_transfers", entityId: row.id, action: "create", after: { paymentId, valueDate, amount } });
    revalidatePath("/app/payments");
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

export async function deleteTransfer(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const id = str(fd, "id"), reason = str(fd, "reason");
    const [row] = isUuid(id) ? await db.select().from(paymentTransfers).where(eq(paymentTransfers.id, id)) : [];
    if (!row) return fail(t("common.notFound"));
    if (!reason) return fail(t("common.reasonRequired"));
    await db.transaction(async (tx) => {
      await tx.delete(files).where(and(eq(files.entityType, "transfer"), eq(files.entityId, id)));
      await tx.delete(paymentTransfers).where(eq(paymentTransfers.id, id));
      await audit({ userId: user.id, entity: "payment_transfers", entityId: id, action: "delete", reason, before: { paymentId: row.paymentId, valueDate: row.valueDate, amount: row.amount, reference: row.reference } }, tx);
    });
    revalidatePath("/app/payments");
    return ok(t("common.deleted"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

export async function deletePayment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.finance);
    const id = str(fd, "id");
    const [row] = isUuid(id) ? await db.select().from(expectedPayments).where(eq(expectedPayments.id, id)) : [];
    if (!row) return fail(t("common.notFound"));
    const transfers = await db.select({ id: paymentTransfers.id }).from(paymentTransfers).where(eq(paymentTransfers.paymentId, id));
    if (transfers.length) return fail(t("finance.hasTransfers"));
    await db.transaction(async (tx) => {
      await tx.delete(files).where(and(eq(files.entityType, "payment"), inArray(files.entityId, [id])));
      await tx.delete(expectedPayments).where(eq(expectedPayments.id, id));
      await audit({ userId: user.id, entity: "expected_payments", entityId: id, action: "delete", before: { kind: row.kind, expectedAmount: row.expectedAmount, currency: row.currency, period: row.period } }, tx);
    });
    revalidatePath("/app/payments");
    return ok(t("common.deleted"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}
