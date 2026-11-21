import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, type FileAccess, type FileEntity } from "@/db/schema";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type FileMeta = { id: string; entityId: string; lang: "tr" | "en"; kind: string | null; name: string; size: number; mime: string; externalUrl: string | null; access: FileAccess; ownerPersonId: string | null; createdAt: Date };

/** Store an uploaded file in its original form with its own language label. Empty inputs are ignored. */
export async function saveUpload(
  file: FormDataEntryValue | null,
  opts: { entityType: FileEntity; entityId: string; lang: "tr" | "en"; kind?: string | null; access?: FileAccess; uploadedBy: string; ownerPersonId?: string | null },
): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_FILE_BYTES) throw new Error("file_too_large");
  const [row] = await db.insert(files).values({
    entityType: opts.entityType, entityId: opts.entityId, lang: opts.lang, kind: opts.kind ?? null,
    name: file.name, mime: file.type || "application/octet-stream", size: file.size,
    data: Buffer.from(await file.arrayBuffer()), access: opts.access ?? "team",
    uploadedBy: opts.uploadedBy, ownerPersonId: opts.ownerPersonId ?? null,
  }).returning({ id: files.id });
  return row.id;
}

/** Link to an existing document instead of uploading. */
export async function saveLink(url: string | null | undefined, opts: { entityType: FileEntity; entityId: string; lang: "tr" | "en"; kind?: string | null; access?: FileAccess; uploadedBy: string }) {
  const clean = (url ?? "").trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  const [row] = await db.insert(files).values({ entityType: opts.entityType, entityId: opts.entityId, lang: opts.lang, kind: opts.kind ?? null, name: clean, externalUrl: clean, access: opts.access ?? "team", uploadedBy: opts.uploadedBy }).returning({ id: files.id });
  return row.id;
}

const metaCols = { id: files.id, entityId: files.entityId, lang: files.lang, kind: files.kind, name: files.name, size: files.size, mime: files.mime, externalUrl: files.externalUrl, access: files.access, ownerPersonId: files.ownerPersonId, createdAt: files.createdAt };

export async function listFiles(entityType: FileEntity, entityIds: string[]): Promise<Map<string, FileMeta[]>> {
  const map = new Map<string, FileMeta[]>();
  if (!entityIds.length) return map;
  const rows = await db.select(metaCols).from(files).where(and(eq(files.entityType, entityType), inArray(files.entityId, entityIds))).orderBy(files.createdAt);
  for (const r of rows) map.set(r.entityId, [...(map.get(r.entityId) ?? []), r]);
  return map;
}
