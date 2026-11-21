"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, followUps, procurements } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";
import { PROCUREMENT_STATUSES } from "@/lib/constants";
import { CURRENCIES, canCreateRecord, canEditRecord, isUuid, validActivity, validPerson } from "@/lib/records";

const money = (n: number | null) => (n == null || n < 0 ? null : n.toFixed(2));

export async function saveProcurement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  if (!user) return fail(t("common.forbidden"));
  const id = optStr(fd, "id");
  const [existing] = id && isUuid(id) ? await db.select().from(procurements).where(eq(procurements.id, id)) : [];
  if (id && !existing) return fail(t("common.notFound"));
  if (existing ? !canEditRecord(user, "procurement", existing.responsibleId) : !canCreateRecord(user, "procurement")) return fail(t("common.forbidden"));
  const title = splitBilingual(str(fd, "title"), null, { tr: existing?.titleTr, en: existing?.titleEn });
  if (!title.tr && !title.en) return fail(t("common.invalid"), { title: t("common.required") });
  const scope = splitBilingual(str(fd, "scope"), null, { tr: existing?.scopeTr, en: existing?.scopeEn });
  const delivery = optStr(fd, "deliveryDate");
  const method = str(fd, "method") === "other" ? optStr(fd, "methodOther") ?? "other" : optStr(fd, "method");
  const values = {
    titleTr: title.tr, titleEn: title.en, scopeTr: scope.tr, scopeEn: scope.en,
    activityId: await validActivity(optStr(fd, "activityId")), responsibleId: await validPerson(optStr(fd, "responsibleId")),
    method, estimatedAmount: money(optNum(fd, "estimatedAmount")), contractor: optStr(fd, "contractor"), contractAmount: money(optNum(fd, "contractAmount")),
    currency: CURRENCIES.includes(str(fd, "currency")) ? str(fd, "currency") : "EUR",
    deliveryDate: delivery && /^\d{4}-\d{2}-\d{2}$/.test(delivery) ? delivery : null,
    status: PROCUREMENT_STATUSES.find((s) => s === str(fd, "status")) ?? existing?.status ?? "planning",
  };
  let rowId = existing?.id;
  if (existing) {
    await db.update(procurements).set(values).where(eq(procurements.id, existing.id));
    await audit({ userId: user.id, entity: "procurements", entityId: existing.id, action: "update", before: { status: existing.status, contractor: existing.contractor, contractAmount: existing.contractAmount, estimatedAmount: existing.estimatedAmount, method: existing.method }, after: { status: values.status, contractor: values.contractor, contractAmount: values.contractAmount, estimatedAmount: values.estimatedAmount, method: values.method } });
  } else {
    [{ id: rowId }] = await db.insert(procurements).values({ ...values, createdBy: user.id }).returning({ id: procurements.id });
  }
  await queueFields("procurements", rowId!, { title, scope });
  revalidatePath("/app/procurements");
  revalidatePath(`/app/procurements/${rowId}`);
  return ok(t("common.saved"));
}

export async function setProcurementStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [row] = user && isUuid(id) ? await db.select().from(procurements).where(eq(procurements.id, id)) : [];
  if (!user || !row || !canEditRecord(user, "procurement", row.responsibleId)) return fail(t("common.forbidden"));
  const status = PROCUREMENT_STATUSES.find((s) => s === str(fd, "status"));
  if (!status) return fail(t("common.invalid"));
  await db.update(procurements).set({ status }).where(eq(procurements.id, id));
  await audit({ userId: user.id, entity: "procurements", entityId: id, action: "status", before: { status: row.status }, after: { status } });
  revalidatePath("/app/procurements");
  revalidatePath(`/app/procurements/${id}`);
  return ok();
}

export async function deleteProcurement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [row] = user && isUuid(id) ? await db.select().from(procurements).where(eq(procurements.id, id)) : [];
  if (!user || !row || !canEditRecord(user, "procurement", row.responsibleId)) return fail(t("common.forbidden"));
  const hasFiles = (await db.select({ id: files.id }).from(files).where(and(eq(files.entityType, "procurement"), eq(files.entityId, id))).limit(1)).length > 0;
  if (hasFiles) return fail(t("ops.cannotDeleteWithRecords"));
  await db.delete(followUps).where(and(eq(followUps.sourceType, "procurement"), eq(followUps.sourceId, id)));
  await db.delete(procurements).where(eq(procurements.id, id));
  await audit({ userId: user.id, entity: "procurements", entityId: id, action: "delete", before: { titleTr: row.titleTr, titleEn: row.titleEn, status: row.status } });
  revalidatePath("/app/procurements");
  return ok(t("common.deleted"));
}
