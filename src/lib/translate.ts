import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { translationJobs } from "@/db/schema";

export type Lang = "tr" | "en";

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS = /\b(ve|ile|için|bir|bu|olarak|toplantı|rapor|proje|hazırlan|yapıl|edildi|görüş|ilgili|kurum|ajans|bina|eğitim|taslak|sunul|gönder)\w*/gi;
const EN_WORDS = /\b(the|and|with|for|of|to|was|were|meeting|report|draft|prepared|reviewed|submitted|building|training|agency|sent|project)\b/gi;

/** Source language is detected from the text itself — not from the interface locale. */
export function detectLang(text: string): Lang {
  if (TR_CHARS.test(text)) return "tr";
  const tr = (text.match(TR_WORDS) ?? []).length, en = (text.match(EN_WORDS) ?? []).length;
  return en > tr ? "en" : "tr";
}

export const translatorConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/** Machine translation. Codes (WP, PP5, PDU, RCO/RCR), numbers, personal and place names are kept verbatim. */
export async function machineTranslate(text: string, from: Lang, to: Lang): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("translator_not_configured");
  const name = { tr: "Turkish", en: "English" };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.TRANSLATION_MODEL || "claude-haiku-5-5",
      max_tokens: 2048,
      system:
        `You translate project-management records for an EU Interreg NEXT MED project from ${name[from]} to ${name[to]}. ` +
        `Return ONLY the translation, no quotes or commentary. Keep these verbatim: codes such as WP1, PP5, PDU, RCO84, RCR104, RCO116, ` +
        `activity codes like 4.1.2, numbers, dates, amounts, personal names, place names and organisation acronyms (TREK, ZAFER, PIM, GSS). ` +
        `Glossary: iş paketi = work package; çıktı = output; alt faaliyet = sub-activity; hizmet alımı = service procurement; enerji etüdü = energy audit; kanıt = evidence.`,
      messages: [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`translator_http_${res.status}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const out = json.content?.find((c) => c.type === "text")?.text?.trim();
  if (!out) throw new Error("translator_empty");
  return out;
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("bad identifier");
  return sql.raw(`"${s}"`);
};

/**
 * Resolve a free-text field into its two language columns and queue the missing side.
 * - `text` is what the user typed (any language); `override` lets the user correct the detected language.
 * - Returns { tr, en, sourceLang } to write to the `<field>_tr` / `<field>_en` columns.
 * Call `queueTranslation` after the row exists.
 */
export function splitBilingual(text: string | null | undefined, override?: Lang | null, existing?: { tr?: string | null; en?: string | null }) {
  const clean = (text ?? "").trim();
  if (!clean) return { tr: null as string | null, en: null as string | null, sourceLang: (override ?? "tr") as Lang, changed: false };
  const sourceLang = override ?? detectLang(clean);
  const prevSource = sourceLang === "tr" ? existing?.tr : existing?.en;
  const changed = prevSource !== clean;
  // When the source changed, the other side is stale and is regenerated; otherwise it is preserved.
  const other = changed ? null : (sourceLang === "tr" ? existing?.en : existing?.tr) ?? null;
  return sourceLang === "tr" ? { tr: clean, en: other, sourceLang, changed } : { tr: other, en: clean, sourceLang, changed };
}

/**
 * Queue (and, when a translator is configured, immediately run) the translation of one field.
 * `table` is the SQL table name, `field` the base column name (e.g. "description" → description_tr/_en).
 */
export async function queueTranslation(table: string, entityId: string, field: string, sourceLang: Lang, sourceText: string | null) {
  if (!sourceText?.trim()) return;
  const [job] = await db
    .insert(translationJobs)
    .values({ entity: table, entityId, field, sourceLang, sourceText, status: "pending" })
    .onConflictDoUpdate({
      target: [translationJobs.entity, translationJobs.entityId, translationJobs.field],
      set: { sourceLang, sourceText, status: "pending", targetText: null, error: null, sourceRevision: sql`${translationJobs.sourceRevision} + 1`, updatedAt: new Date() },
    })
    .returning();
  if (translatorConfigured()) await runTranslationJob(job.id).catch(() => {});
}

export async function runTranslationJob(jobId: number) {
  const [job] = await db.select().from(translationJobs).where(sql`${translationJobs.id} = ${jobId}`);
  if (!job) return;
  const target: Lang = job.sourceLang === "tr" ? "en" : "tr";
  try {
    const out = await machineTranslate(job.sourceText, job.sourceLang, target);
    await applyTranslation(job.entity, job.entityId, job.field, target, out);
    await db.update(translationJobs).set({ targetText: out, status: "machine", error: null, updatedAt: new Date() }).where(sql`${translationJobs.id} = ${jobId}`);
  } catch (e) {
    await db.update(translationJobs).set({ status: "failed", error: String((e as Error).message), updatedAt: new Date() }).where(sql`${translationJobs.id} = ${jobId}`);
    throw e;
  }
}

/** Write a translation into the record's own language column. */
export async function applyTranslation(table: string, entityId: string, field: string, lang: Lang, text: string) {
  await db.execute(sql`update ${ident(table)} set ${ident(`${field}_${lang}`)} = ${text} where id::text = ${entityId}`);
}

/** Convenience: queue several fields of one record. `fields` maps base name → split result. */
export async function queueFields(table: string, entityId: string, fields: Record<string, { tr: string | null; en: string | null; sourceLang: Lang; changed: boolean }>) {
  for (const [field, v] of Object.entries(fields)) {
    const src = v.sourceLang === "tr" ? v.tr : v.en;
    const other = v.sourceLang === "tr" ? v.en : v.tr;
    if (src && !other) await queueTranslation(table, entityId, field, v.sourceLang, src);
  }
}
