"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, followUps, meetings, travels } from "@/db/schema";
import { can, getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";
import { CURRENCIES, canCreateRecord, canEditRecord, isUuid, validActivity, validPerson, validPersonIds } from "@/lib/records";

const STATUSES = ["planned", "completed", "cancelled"] as const;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function saveTravel(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  if (!user) return fail(t("common.forbidden"));
  const id = optStr(fd, "id");
  const [existing] = id && isUuid(id) ? await db.select().from(travels).where(eq(travels.id, id)) : [];
  if (id && !existing) return fail(t("common.notFound"));
  if (existing ? !canEditRecord(user, "travel", existing.responsibleId) : !canCreateRecord(user, "travel")) return fail(t("common.forbidden"));
  const purpose = splitBilingual(str(fd, "purpose"), null, { tr: existing?.purposeTr, en: existing?.purposeEn });
  const depart = str(fd, "departDate"), ret = str(fd, "returnDate");
  const errors: Record<string, string> = {};
  if (!purpose.tr && !purpose.en) errors.purpose = t("common.required");
  if (!isDate(depart)) errors.departDate = t("common.required");
  if (!isDate(ret)) errors.returnDate = t("common.required");
  else if (isDate(depart) && ret < depart) errors.returnDate = t("ops.returnBeforeDepart");
  if (Object.keys(errors).length) return fail(Object.values(errors)[0] === t("common.required") ? t("common.invalid") : Object.values(errors)[0], errors);
  const values = {
    purposeTr: purpose.tr, purposeEn: purpose.en, place: optStr(fd, "place"), activityId: await validActivity(optStr(fd, "activityId")),
    departDate: depart, returnDate: ret, participantIds: await validPersonIds(fd.getAll("participantIds").map(String)),
    responsibleId: await validPerson(optStr(fd, "responsibleId")), status: STATUSES.find((s) => s === str(fd, "status")) ?? existing?.status ?? "planned",
  };
  let rowId = existing?.id;
  if (existing) {
    await db.update(travels).set(values).where(eq(travels.id, existing.id));
    await audit({ userId: user.id, entity: "travels", entityId: existing.id, action: "update", before: { departDate: existing.departDate, returnDate: existing.returnDate, status: existing.status, place: existing.place }, after: { departDate: depart, returnDate: ret, status: values.status, place: values.place } });
  } else {
    [{ id: rowId }] = await db.insert(travels).values({ ...values, createdBy: user.id }).returning({ id: travels.id });
  }
  await queueFields("travels", rowId!, { purpose });
  revalidatePath("/app/travels");
  revalidatePath(`/app/travels/${rowId}`);
  return ok(t("common.saved"));
}

/** Post-travel report entered through the short form. Participants may write it too. */
export async function saveTravelReport(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [tr] = user && isUuid(id) ? await db.select().from(travels).where(eq(travels.id, id)) : [];
  if (!user || !tr) return fail(t("common.forbidden"));
  const allowed = canEditRecord(user, "travel", tr.responsibleId) || (!!user.personId && tr.participantIds.includes(user.personId));
  if (!allowed) return fail(t("common.forbidden"));
  const report = splitBilingual(str(fd, "report"), null, { tr: tr.reportTr, en: tr.reportEn });
  await db.update(travels).set({ reportTr: report.tr, reportEn: report.en }).where(eq(travels.id, id));
  await queueFields("travels", id, { report });
  await audit({ userId: user.id, entity: "travels", entityId: id, action: "report", before: { reportTr: tr.reportTr, reportEn: tr.reportEn }, after: { reportTr: report.tr, reportEn: report.en } });
  revalidatePath(`/app/travels/${id}`);
  revalidatePath("/app/travels");
  return ok(t("common.saved"));
}

/** Actual spend, kept for internal tracking only (the travel flat rate is reported separately). */
export async function saveTravelCost(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [tr] = user && isUuid(id) ? await db.select().from(travels).where(eq(travels.id, id)) : [];
  if (!user || !tr || !(can.finance(user) || can.coordinate(user))) return fail(t("common.forbidden"));
  const amount = optNum(fd, "actualCost");
  if (amount != null && amount < 0) return fail(t("common.invalid"));
  const currency = CURRENCIES.includes(str(fd, "currency")) ? str(fd, "currency") : "EUR";
  await db.update(travels).set({ actualCost: amount == null ? null : amount.toFixed(2), currency }).where(eq(travels.id, id));
  await audit({ userId: user.id, entity: "travels", entityId: id, action: "cost", before: { actualCost: tr.actualCost, currency: tr.currency }, after: { actualCost: amount, currency } });
  revalidatePath(`/app/travels/${id}`);
  return ok(t("common.saved"));
}

export async function deleteTravel(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [tr] = user && isUuid(id) ? await db.select().from(travels).where(eq(travels.id, id)) : [];
  if (!user || !tr || !canEditRecord(user, "travel", tr.responsibleId)) return fail(t("common.forbidden"));
  const hasFiles = (await db.select({ id: files.id }).from(files).where(and(eq(files.entityType, "travel"), eq(files.entityId, id))).limit(1)).length > 0;
  if (hasFiles || tr.reportTr || tr.reportEn) return fail(t("ops.cannotDeleteWithRecords"));
  await db.update(meetings).set({ travelId: null }).where(eq(meetings.travelId, id));
  await db.delete(followUps).where(and(eq(followUps.sourceType, "travel"), eq(followUps.sourceId, id)));
  await db.delete(travels).where(eq(travels.id, id));
  await audit({ userId: user.id, entity: "travels", entityId: id, action: "delete", before: { purposeTr: tr.purposeTr, place: tr.place, departDate: tr.departDate } });
  revalidatePath("/app/travels");
  return ok(t("common.deleted"));
}
