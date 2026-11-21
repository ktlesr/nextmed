"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, followUps, meetings, travels } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optStr, str, type ActionState } from "@/lib/action";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";
import { TIME_ZONES, canCreateRecord, canEditRecord, isUuid, validActivity, validPerson, validPersonIds, zonedToUtc } from "@/lib/records";
import { and } from "drizzle-orm";

const STATUSES = ["planned", "held", "cancelled"] as const;

export async function saveMeeting(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  if (!user) return fail(t("common.forbidden"));
  const id = optStr(fd, "id");
  const [existing] = id && isUuid(id) ? await db.select().from(meetings).where(eq(meetings.id, id)) : [];
  if (id && !existing) return fail(t("common.notFound"));
  if (existing ? !canEditRecord(user, "meeting", existing.responsibleId) : !canCreateRecord(user, "meeting")) return fail(t("common.forbidden"));

  const kind = str(fd, "kind") === "stakeholder" ? "stakeholder" : "internal";
  const timeZone = TIME_ZONES.includes(str(fd, "timeZone")) ? str(fd, "timeZone") : "Europe/Istanbul";
  const startsAt = zonedToUtc(str(fd, "startsAt"), timeZone);
  const title = splitBilingual(str(fd, "title"), null, { tr: existing?.titleTr, en: existing?.titleEn });
  const errors: Record<string, string> = {};
  if (!title.tr && !title.en) errors.title = t("common.required");
  if (!startsAt) errors.startsAt = t("common.required");
  if (Object.keys(errors).length) return fail(t("common.invalid"), errors);
  const agenda = splitBilingual(str(fd, "agenda"), null, { tr: existing?.agendaTr, en: existing?.agendaEn });
  const description = splitBilingual(str(fd, "description"), null, { tr: existing?.descriptionTr, en: existing?.descriptionEn });
  const url = optStr(fd, "onlineUrl");
  const travelId = optStr(fd, "travelId");
  const status = STATUSES.find((s) => s === str(fd, "status")) ?? existing?.status ?? "planned";
  const duration = Math.min(1440, Math.max(15, parseInt(str(fd, "durationMinutes"), 10) || 60));
  const values = {
    kind: kind as "internal" | "stakeholder", titleTr: title.tr, titleEn: title.en, startsAt: startsAt!, durationMinutes: duration, timeZone,
    location: optStr(fd, "location"), onlineUrl: url && /^https?:\/\//i.test(url) ? url : null,
    agendaTr: agenda.tr, agendaEn: agenda.en, descriptionTr: description.tr, descriptionEn: description.en,
    participantIds: await validPersonIds(fd.getAll("participantIds").map(String)), externalParticipants: optStr(fd, "externalParticipants"),
    responsibleId: await validPerson(optStr(fd, "responsibleId")), activityId: await validActivity(optStr(fd, "activityId")),
    travelId: travelId && isUuid(travelId) && (await db.select({ id: travels.id }).from(travels).where(eq(travels.id, travelId))).length ? travelId : null,
    status,
  };
  let rowId = existing?.id;
  if (existing) {
    await db.update(meetings).set(values).where(eq(meetings.id, existing.id));
    await audit({ userId: user.id, entity: "meetings", entityId: existing.id, action: "update", before: { titleTr: existing.titleTr, startsAt: existing.startsAt, status: existing.status }, after: { titleTr: values.titleTr, startsAt: values.startsAt, status: values.status } });
  } else {
    [{ id: rowId }] = await db.insert(meetings).values({ ...values, createdBy: user.id }).returning({ id: meetings.id });
  }
  await queueFields("meetings", rowId!, { title, agenda, description });
  revalidatePath("/app/meetings");
  revalidatePath(`/app/meetings/${rowId}`);
  return ok(t("common.saved"), { id: rowId });
}

/** Outcome report of a held meeting. Saving an outcome marks the meeting as held. */
export async function saveOutcome(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [m] = user && isUuid(id) ? await db.select().from(meetings).where(eq(meetings.id, id)) : [];
  if (!user || !m || !canEditRecord(user, "meeting", m.responsibleId)) return fail(t("common.forbidden"));
  const outcome = splitBilingual(str(fd, "outcome"), null, { tr: m.outcomeTr, en: m.outcomeEn });
  await db.update(meetings).set({ outcomeTr: outcome.tr, outcomeEn: outcome.en, status: m.status === "planned" && (outcome.tr || outcome.en) ? "held" : m.status }).where(eq(meetings.id, id));
  await queueFields("meetings", id, { outcome });
  await audit({ userId: user.id, entity: "meetings", entityId: id, action: "outcome", before: { outcomeTr: m.outcomeTr, outcomeEn: m.outcomeEn }, after: { outcomeTr: outcome.tr, outcomeEn: outcome.en } });
  revalidatePath(`/app/meetings/${id}`);
  revalidatePath("/app/meetings");
  return ok(t("common.saved"));
}

export async function deleteMeeting(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [m] = user && isUuid(id) ? await db.select().from(meetings).where(eq(meetings.id, id)) : [];
  if (!user || !m || !canEditRecord(user, "meeting", m.responsibleId)) return fail(t("common.forbidden"));
  // a held meeting with minutes is a record — cancel it instead of deleting
  const hasFiles = (await db.select({ id: files.id }).from(files).where(and(eq(files.entityType, "meeting"), eq(files.entityId, id))).limit(1)).length > 0;
  if (hasFiles || m.outcomeTr || m.outcomeEn) return fail(t("ops.cannotDeleteWithRecords"));
  await db.delete(followUps).where(and(eq(followUps.sourceType, "meeting"), eq(followUps.sourceId, id)));
  await db.delete(meetings).where(eq(meetings.id, id));
  await audit({ userId: user.id, entity: "meetings", entityId: id, action: "delete", before: { titleTr: m.titleTr, titleEn: m.titleEn, startsAt: m.startsAt } });
  revalidatePath("/app/meetings");
  return ok(t("common.deleted"), { deleted: true });
}
