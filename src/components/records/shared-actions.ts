"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, followUps, type FileAccess } from "@/db/schema";
import { can, getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optStr, str, type ActionState } from "@/lib/action";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";
import { isUuid, recordEditable, saveEvidence, validActivity, validPerson, type RecordType } from "@/lib/records";
import { PROCUREMENT_FILE_KINDS, TRAVEL_FILE_KINDS } from "@/lib/constants";

const TYPES: RecordType[] = ["meeting", "procurement", "travel"];
const pathOf = (type: RecordType, id: string) => `/app/${type}s/${id}`;
const KINDS: Record<RecordType, readonly string[]> = { meeting: ["minutes", "agenda", "attachment"], procurement: PROCUREMENT_FILE_KINDS, travel: TRAVEL_FILE_KINDS };

async function guard(fd: FormData) {
  const { t } = await getT();
  const user = await getUser();
  const type = str(fd, "sourceType") as RecordType, id = str(fd, "sourceId");
  if (!user || !TYPES.includes(type) || !isUuid(id) || !(await recordEditable(user, type, id))) return { ok: false as const, t, error: fail(t("common.forbidden")) };
  return { ok: true as const, t, user, type, id };
}

/** Decision / follow-up task raised from a meeting, travel or procurement file. */
export async function addFollowUp(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd);
  if (!g.ok) return g.error;
  const text = splitBilingual(str(fd, "text"));
  if (!text.tr && !text.en) return fail(g.t("common.invalid"));
  const due = optStr(fd, "dueDate");
  const [row] = await db.insert(followUps).values({
    sourceType: g.type, sourceId: g.id, textTr: text.tr, textEn: text.en, isDecision: fd.get("isDecision") === "on",
    assigneeId: await validPerson(optStr(fd, "assigneeId")), activityId: await validActivity(optStr(fd, "activityId")),
    dueDate: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
  }).returning({ id: followUps.id });
  await queueFields("follow_ups", row.id, { text });
  revalidatePath(pathOf(g.type, g.id));
  return ok();
}

export async function toggleFollowUp(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  if (!user || !isUuid(id)) return fail(t("common.forbidden"));
  const [row] = await db.select().from(followUps).where(eq(followUps.id, id));
  if (!row) return fail(t("common.notFound"));
  // the assignee may tick their own task; otherwise the record's editors
  const allowed = (user.personId && user.personId === row.assigneeId) || (await recordEditable(user, row.sourceType, row.sourceId));
  if (!allowed) return fail(t("common.forbidden"));
  await db.update(followUps).set({ done: !row.done, doneAt: row.done ? null : new Date() }).where(eq(followUps.id, id));
  revalidatePath(pathOf(row.sourceType, row.sourceId));
  return ok();
}

export async function deleteFollowUp(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  if (!user || !isUuid(id)) return fail(t("common.forbidden"));
  const [row] = await db.select().from(followUps).where(eq(followUps.id, id));
  if (!row) return fail(t("common.notFound"));
  if (!(await recordEditable(user, row.sourceType, row.sourceId))) return fail(t("common.forbidden"));
  await db.delete(followUps).where(eq(followUps.id, id));
  await audit({ userId: user.id, entity: "follow_ups", entityId: id, action: "delete", before: { textTr: row.textTr, textEn: row.textEn, sourceType: row.sourceType, sourceId: row.sourceId } });
  revalidatePath(pathOf(row.sourceType, row.sourceId));
  return ok();
}

/** Upload TR / EN files (or links) into a meeting, procurement or travel file under a document kind. */
export async function uploadRecordFiles(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd);
  if (!g.ok) return g.error;
  const kind = str(fd, "kind");
  if (!KINDS[g.type].includes(kind)) return fail(g.t("common.invalid"));
  // invoices and payment proofs are financial documents
  const access: FileAccess = g.type === "procurement" && (kind === "invoice" || kind === "payment") ? "finance" : "team";
  if (access === "finance" && !can.finance(g.user)) return fail(g.t("common.forbidden"));
  const owner = g.type === "travel" ? await validPerson(optStr(fd, "ownerPersonId")) : null;
  const label = optStr(fd, "label"); // e.g. the firm an offer belongs to
  try {
    const n = await saveEvidence(fd, { entityType: g.type, entityId: g.id, kind: label ? `${kind}:${label.slice(0, 80)}` : kind, access, uploadedBy: g.user.id, ownerPersonId: owner });
    if (!n) return fail(g.t("ops.noFileChosen"));
  } catch (e) {
    return fail((e as Error).message === "file_too_large" ? g.t("common.fileTooLarge") : g.t("common.error"));
  }
  revalidatePath(pathOf(g.type, g.id));
  return ok(g.t("common.saved"));
}

export async function deleteRecordFile(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd);
  if (!g.ok) return g.error;
  const fileId = str(fd, "fileId");
  if (!isUuid(fileId)) return fail(g.t("common.notFound"));
  const [f] = await db.select({ id: files.id, name: files.name, access: files.access, kind: files.kind }).from(files).where(and(eq(files.id, fileId), eq(files.entityType, g.type), eq(files.entityId, g.id)));
  if (!f) return fail(g.t("common.notFound"));
  if (!can.fileAccess(g.user, f.access)) return fail(g.t("common.forbidden"));
  await db.delete(files).where(eq(files.id, fileId));
  await audit({ userId: g.user.id, entity: "files", entityId: fileId, action: "delete", before: { name: f.name, kind: f.kind, entityType: g.type, entityId: g.id } });
  revalidatePath(pathOf(g.type, g.id));
  return ok();
}
