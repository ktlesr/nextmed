"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, expectedPayments, files, meetings, procurements, travels, type DocumentCategory, type FileAccess } from "@/db/schema";
import { can, getUser, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optStr, str, type ActionState } from "@/lib/action";
import { queueFields, splitBilingual } from "@/lib/translate";
import { getT } from "@/i18n/server";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { getFrame } from "@/lib/structure";
import { isUuid, saveEvidence, validActivity } from "@/lib/records";

const ACCESS: FileAccess[] = ["team", "finance", "admin"];
type Doc = typeof documents.$inferSelect;

/** Uploader, coordination or admin — and only people who may open the document at all. */
const mayEdit = (u: SessionUser, d: Doc) => can.fileAccess(u, d.access) && (can.coordinate(u) || d.uploadedBy === u.id);

async function parseLink(raw: string | null): Promise<{ linkType: string | null; linkId: string | null }> {
  const [type, id] = (raw ?? "").split(":");
  if (!isUuid(id)) return { linkType: null, linkId: null };
  const table = { meeting: meetings, travel: travels, procurement: procurements, payment: expectedPayments }[type];
  if (!table) return { linkType: null, linkId: null };
  const found = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return found.length ? { linkType: type, linkId: id } : { linkType: null, linkId: null };
}

async function common(fd: FormData, user: SessionUser, existing?: Doc) {
  const title = splitBilingual(str(fd, "title"), null, { tr: existing?.titleTr, en: existing?.titleEn });
  const description = splitBilingual(str(fd, "description"), null, { tr: existing?.descriptionTr, en: existing?.descriptionEn });
  const category = DOCUMENT_CATEGORIES.find((c) => c === str(fd, "category")) as DocumentCategory | undefined;
  let access = ACCESS.find((a) => a === str(fd, "access")) ?? existing?.access ?? "team";
  // only finance / admin may create restricted documents
  if (access !== "team" && !can.fileAccess(user, access)) access = "team";
  const docDate = optStr(fd, "docDate");
  const activityId = await validActivity(optStr(fd, "activityId"));
  let workPackageId: string | null = null;
  if (activityId) {
    const { acts, outs } = await getFrame();
    workPackageId = outs.find((o) => o.id === acts.find((a) => a.id === activityId)?.outputId)?.workPackageId ?? null;
  } else {
    const wp = optStr(fd, "workPackageId");
    workPackageId = wp && (await getFrame()).wps.some((w) => w.id === wp) ? wp : null;
  }
  return { title, description, category, access, docDate: docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null, activityId, workPackageId, docType: optStr(fd, "docType")?.slice(0, 80) ?? null, link: fd.has("link") ? await parseLink(optStr(fd, "link")) : null };
}

const hasUpload = (fd: FormData) => ["fileTr", "fileEn"].some((k) => fd.getAll(k).some((f) => typeof f !== "string" && f.size > 0)) || ["linkTr", "linkEn"].some((k) => /^https?:\/\//i.test(str(fd, k)));

export async function createDocument(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  if (!user) return fail(t("common.forbidden"));
  const c = await common(fd, user);
  const errors: Record<string, string> = {};
  if (!c.title.tr && !c.title.en) errors.title = t("common.required");
  if (!c.category) errors.category = t("common.required");
  if (Object.keys(errors).length) return fail(t("common.invalid"), errors);
  if (!hasUpload(fd)) return fail(t("docs.fileRequired"));
  const [doc] = await db.insert(documents).values({
    category: c.category!, titleTr: c.title.tr, titleEn: c.title.en, descriptionTr: c.description.tr, descriptionEn: c.description.en, docType: c.docType, docDate: c.docDate,
    access: c.access, workPackageId: c.workPackageId, activityId: c.activityId, linkType: c.link?.linkType ?? null, linkId: c.link?.linkId ?? null, uploadedBy: user.id,
  }).returning({ id: documents.id });
  try {
    await saveEvidence(fd, { entityType: "document", entityId: doc.id, access: c.access, uploadedBy: user.id });
  } catch (e) {
    await db.delete(documents).where(eq(documents.id, doc.id));
    return fail((e as Error).message === "file_too_large" ? t("common.fileTooLarge") : t("common.error"));
  }
  await queueFields("documents", doc.id, { title: c.title, description: c.description });
  revalidatePath("/app/documents");
  return ok(t("common.saved"));
}

/** New version: same group, version + 1, only the newest is current. Earlier versions stay available. */
export async function newDocumentVersion(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [prev] = user && isUuid(id) ? await db.select().from(documents).where(eq(documents.id, id)) : [];
  if (!user || !prev || !mayEdit(user, prev)) return fail(t("common.forbidden"));
  if (!hasUpload(fd)) return fail(t("docs.fileRequired"));
  const docDate = optStr(fd, "docDate");
  let newId = "";
  try {
    await db.transaction(async (tx) => {
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${documents.version}), 0)::int` }).from(documents).where(eq(documents.groupId, prev.groupId));
      await tx.update(documents).set({ isCurrent: false }).where(eq(documents.groupId, prev.groupId));
      const [row] = await tx.insert(documents).values({
        groupId: prev.groupId, category: prev.category, titleTr: prev.titleTr, titleEn: prev.titleEn, descriptionTr: prev.descriptionTr, descriptionEn: prev.descriptionEn, docType: prev.docType,
        docDate: docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : prev.docDate, version: max + 1, isCurrent: true, access: prev.access, workPackageId: prev.workPackageId, activityId: prev.activityId,
        linkType: prev.linkType, linkId: prev.linkId, meta: { ...(prev.meta ?? {}), versionNote: optStr(fd, "note") }, uploadedBy: user.id,
      }).returning({ id: documents.id });
      newId = row.id;
    });
    await saveEvidence(fd, { entityType: "document", entityId: newId, access: prev.access, uploadedBy: user.id });
  } catch (e) {
    if (newId) { // roll the version back if the file could not be stored
      await db.delete(documents).where(eq(documents.id, newId));
      await db.update(documents).set({ isCurrent: true }).where(eq(documents.id, prev.id));
    }
    return fail((e as Error).message === "file_too_large" ? t("common.fileTooLarge") : t("common.error"));
  }
  await audit({ userId: user.id, entity: "documents", entityId: newId, action: "new_version", before: { id: prev.id, version: prev.version } });
  revalidatePath("/app/documents");
  return ok(t("common.saved"));
}

/** Card details apply to every version of the document. */
export async function updateDocument(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [doc] = user && isUuid(id) ? await db.select().from(documents).where(eq(documents.id, id)) : [];
  if (!user || !doc || !mayEdit(user, doc)) return fail(t("common.forbidden"));
  const c = await common(fd, user, doc);
  if (!c.title.tr && !c.title.en) return fail(t("common.invalid"), { title: t("common.required") });
  const set = {
    category: c.category ?? doc.category, titleTr: c.title.tr, titleEn: c.title.en, descriptionTr: c.description.tr, descriptionEn: c.description.en, docType: c.docType, access: c.access,
    workPackageId: c.workPackageId, activityId: c.activityId, ...(c.link ? { linkType: c.link.linkType, linkId: c.link.linkId } : {}),
  };
  const group = await db.select({ id: documents.id }).from(documents).where(eq(documents.groupId, doc.groupId));
  await db.update(documents).set(set).where(eq(documents.groupId, doc.groupId));
  await db.update(documents).set({ docDate: c.docDate }).where(eq(documents.id, doc.id));
  for (const g of group) await db.update(files).set({ access: c.access }).where(and(eq(files.entityType, "document"), eq(files.entityId, g.id)));
  // optional additional language version on the current card
  try { await saveEvidence(fd, { entityType: "document", entityId: doc.id, access: c.access, uploadedBy: user.id }); }
  catch (e) { return fail((e as Error).message === "file_too_large" ? t("common.fileTooLarge") : t("common.error")); }
  await queueFields("documents", doc.id, { title: c.title, description: c.description });
  await audit({ userId: user.id, entity: "documents", entityId: doc.id, action: "update", before: { titleTr: doc.titleTr, titleEn: doc.titleEn, category: doc.category, access: doc.access, activityId: doc.activityId }, after: { titleTr: set.titleTr, titleEn: set.titleEn, category: set.category, access: set.access, activityId: set.activityId } });
  revalidatePath("/app/documents");
  return ok(t("common.saved"));
}

/** Removes the whole document with all versions. Stored monthly reports are kept: only an admin may remove them. */
export async function deleteDocument(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  const id = str(fd, "id");
  const [doc] = user && isUuid(id) ? await db.select().from(documents).where(eq(documents.id, id)) : [];
  if (!user || !doc || !mayEdit(user, doc)) return fail(t("common.forbidden"));
  const isStoredReport = doc.category === "reports" && doc.meta && "year" in doc.meta && "month" in doc.meta;
  if (isStoredReport && !can.admin(user)) return fail(t("docs.storedReportLocked"));
  const group = await db.select({ id: documents.id }).from(documents).where(eq(documents.groupId, doc.groupId));
  await db.transaction(async (tx) => {
    for (const g of group) await tx.delete(files).where(and(eq(files.entityType, "document"), eq(files.entityId, g.id)));
    await tx.delete(documents).where(eq(documents.groupId, doc.groupId));
    await audit({ userId: user.id, entity: "documents", entityId: doc.id, action: "delete", before: { titleTr: doc.titleTr, titleEn: doc.titleEn, category: doc.category, versions: group.length } }, tx);
  });
  revalidatePath("/app/documents");
  return ok(t("common.deleted"));
}
