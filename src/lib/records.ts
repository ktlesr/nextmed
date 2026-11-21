import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings, people, procurements, travels, users, type FileAccess, type FileEntity } from "@/db/schema";
import { can, type SessionUser } from "@/lib/auth";
import { getChainOptions, getPeople } from "@/lib/structure";
import { saveLink, saveUpload, type FileMeta } from "@/lib/files";
import type { Locale } from "@/i18n";

export const TIME_ZONES = ["Europe/Istanbul", "Europe/Rome", "Europe/Athens", "Europe/Madrid", "Europe/Paris", "Europe/Brussels", "Europe/Lisbon", "Africa/Cairo", "Africa/Tunis", "Asia/Amman", "Asia/Beirut", "Asia/Nicosia", "UTC"];
export const CURRENCIES = ["EUR", "TRY", "USD"];
export const PROCUREMENT_METHODS = ["direct", "three_offers", "negotiated", "open_tender", "restricted", "framework", "other"] as const;

/** Wall-clock time in `tz` ("YYYY-MM-DDTHH:mm") → instant. */
export function zonedToUtc(local: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const asUtc = new Date(local.slice(0, 16) + ":00Z");
  if (Number.isNaN(asUtc.getTime())) return null;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(asUtc).map((x) => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return new Date(asUtc.getTime() - (shown - asUtc.getTime()));
  } catch { return null; }
}
/** Instant → value for <input type="datetime-local"> in `tz`. */
export function utcToZonedInput(d: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Names and activity labels used by every records page. */
export const getLookups = cache(async () => {
  const [ppl, options, us] = await Promise.all([getPeople(true), getChainOptions(), db.select({ id: users.id, personId: users.personId, email: users.email }).from(users)]);
  const personName = new Map(ppl.map((p) => [p.id, p.fullName]));
  const userName = new Map(us.map((u) => [u.id, (u.personId && personName.get(u.personId)) || u.email]));
  const act = new Map(options.acts.map((a) => [a.id, a]));
  const out = new Map(options.outs.map((o) => [o.id, o]));
  const wp = new Map(options.wps.map((w) => [w.id, w]));
  const actWp = (activityId: string | null | undefined) => { const a = activityId ? act.get(activityId) : null; const o = a ? out.get(a.parent) : null; return o ? wp.get(o.parent) ?? null : null; };
  const actName = (locale: Locale, activityId: string | null | undefined) => { const a = activityId ? act.get(activityId) : null; return a ? (locale === "tr" ? a.nameTr : a.nameEn) : ""; };
  return { people: ppl, activePeople: ppl.filter((p) => p.active), options, personName, userName, act, wp, actWp, actName };
});

export type RecordType = "meeting" | "procurement" | "travel";

/** Who may edit a meeting / procurement / travel file: coordination, its responsible person, and finance for procurements. */
export async function recordEditable(user: SessionUser, type: RecordType, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const table = type === "meeting" ? meetings : type === "procurement" ? procurements : travels;
  const [row] = await db.select({ responsibleId: table.responsibleId }).from(table).where(eq(table.id, id));
  if (!row) return false;
  return canEditRecord(user, type, row.responsibleId);
}
export const canEditRecord = (user: SessionUser, type: RecordType, responsibleId: string | null) =>
  can.coordinate(user) || (type === "procurement" && can.finance(user)) || (!!user.personId && user.personId === responsibleId);
export const canCreateRecord = (user: SessionUser, type: RecordType) => can.coordinate(user) || (type === "procurement" && can.finance(user));

/** Stores the TR / EN upload slots (fileTr, fileEn, linkTr, linkEn) of a form. Returns number of stored items. */
export async function saveEvidence(fd: FormData, opts: { entityType: FileEntity; entityId: string; kind?: string | null; access?: FileAccess; uploadedBy: string; ownerPersonId?: string | null }): Promise<number> {
  let n = 0;
  for (const lang of ["tr", "en"] as const) {
    for (const f of fd.getAll(lang === "tr" ? "fileTr" : "fileEn")) if (await saveUpload(f, { ...opts, lang })) n++;
    const link = fd.get(lang === "tr" ? "linkTr" : "linkEn");
    if (typeof link === "string" && (await saveLink(link, { ...opts, lang }))) n++;
  }
  return n;
}

export const visibleFiles = (user: SessionUser, list: FileMeta[] | undefined) => (list ?? []).filter((f) => can.fileAccess(user, f.access));
export const isUuid = (s: string | null | undefined): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const validPersonIds = async (ids: string[]) => { const all = new Set((await getPeople(true)).map((p) => p.id)); return [...new Set(ids)].filter((i) => all.has(i)); };
export const validActivity = async (id: string | null) => (id && (await getChainOptions()).acts.some((a) => a.id === id) ? id : null);
export const validPerson = async (id: string | null) => (id && (await db.select({ id: people.id }).from(people).where(eq(people.id, id))).length ? id : null);
