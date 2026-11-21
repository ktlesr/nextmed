"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, files } from "@/db/schema";
import { assertRole, can, ForbiddenError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { buildReport, resolveReportRequest } from "@/lib/report-data";
import { reportToDocx } from "@/lib/report-export";
import { getFrame } from "@/lib/structure";
import { getT } from "@/i18n/server";

/**
 * Store the approved report of a CLOSED month under Documents → Reports, with its period, scope and language.
 * The generated file is kept as a dated record; storing again creates a new version and keeps the old one.
 */
export async function storeReportAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t, locale } = await getT();
  try {
    const user = await assertRole(can.coordinate);
    const m = /^(\d{4})-(\d{2})$/.exec(str(fd, "m"));
    if (!m) return fail(t("common.invalid"));
    const { wps } = await getFrame();
    const request = resolveReportRequest(user, { view: str(fd, "view"), year: +m[1], month: +m[2], person: str(fd, "person") || undefined, wp: str(fd, "wp") || undefined }, wps[0].id);
    if (!request) return fail(t("common.forbidden"));
    const doc = await buildReport(request, locale, t);
    if (!doc) return fail(t("common.notFound"));
    if (doc.monthState !== "closed") return fail(t("reports.errNotClosed"));
    const buf = await reportToDocx(doc, t("common.empty"));
    const meta = { year: doc.year, month: doc.month, scope: doc.scopeKey, locale, kind: "monthly_report" };
    const title = `${doc.title} — ${doc.period}`;

    const id = await db.transaction(async (tx) => {
      const [prev] = await tx.select().from(documents)
        .where(and(eq(documents.category, "reports"), sql`${documents.meta}->>'kind' = 'monthly_report'`, sql`(${documents.meta}->>'year')::int = ${doc.year}`, sql`(${documents.meta}->>'month')::int = ${doc.month}`, sql`${documents.meta}->>'scope' = ${doc.scopeKey}`, sql`${documents.meta}->>'locale' = ${locale}`))
        .orderBy(desc(documents.version)).limit(1);
      if (prev) await tx.update(documents).set({ isCurrent: false }).where(eq(documents.groupId, prev.groupId));
      const [row] = await tx.insert(documents).values({
        ...(prev ? { groupId: prev.groupId } : {}), category: "reports", titleTr: locale === "tr" ? title : null, titleEn: locale === "en" ? title : null,
        descriptionTr: locale === "tr" ? doc.subtitle : null, descriptionEn: locale === "en" ? doc.subtitle : null,
        docType: "monthly_report", docDate: `${doc.year}-${String(doc.month).padStart(2, "0")}-01`, version: (prev?.version ?? 0) + 1, isCurrent: true, access: "team",
        workPackageId: request.wpId, meta, uploadedBy: user.id,
      }).returning({ id: documents.id });
      await tx.insert(files).values({ entityType: "document", entityId: row.id, lang: locale, kind: "report", name: `${doc.fileName}_${locale.toUpperCase()}.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: buf.length, data: buf, access: "team", uploadedBy: user.id });
      await audit({ userId: user.id, entity: "document", entityId: row.id, action: "store_report", after: meta }, tx);
      return row.id;
    });
    revalidatePath("/app/documents");
    revalidatePath("/app/reports");
    return ok(t("reports.stored"), { id });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    console.error(e);
    return fail(t("common.error"));
  }
}
