import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { translationJobs, type TranslationStatus } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { translatorConfigured } from "@/lib/translate";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, TabLinks } from "@/components/ui/layout";
import { RunPendingButton, TranslationEditor } from "@/components/admin/translation-row";

export const metadata = { title: "Çeviriler" };
const STATUSES: TranslationStatus[] = ["pending", "machine", "reviewed", "failed"];
const tone: Record<TranslationStatus, Tone> = { pending: "warn", machine: "cobalt", reviewed: "ok", failed: "red" };
const PAGE = 25;

export default async function TranslationsPage({ searchParams }: { searchParams: Promise<{ status?: string; entity?: string; page?: string }> }) {
  await requireRole(can.admin);
  const sp = await searchParams;
  const { t, locale } = await getT();
  const status = STATUSES.includes(sp.status as TranslationStatus) ? (sp.status as TranslationStatus) : sp.status === "all" ? null : "pending";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const [byStatus, entities] = await Promise.all([
    db.select({ status: translationJobs.status, n: sql<number>`count(*)::int` }).from(translationJobs).groupBy(translationJobs.status),
    db.select({ entity: translationJobs.entity, n: sql<number>`count(*)::int` }).from(translationJobs).groupBy(translationJobs.entity).orderBy(translationJobs.entity),
  ]);
  const entity = entities.find((e) => e.entity === sp.entity)?.entity ?? null;
  const where = and(status ? eq(translationJobs.status, status) : undefined, entity ? eq(translationJobs.entity, entity) : undefined);
  const [[{ n: total }], jobs] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(translationJobs).where(where),
    db.select().from(translationJobs).where(where).orderBy(desc(translationJobs.updatedAt)).limit(PAGE).offset((page - 1) * PAGE),
  ]);
  const configured = translatorConfigured();
  const count = (s: TranslationStatus) => byStatus.find((x) => x.status === s)?.n ?? 0;
  const href = (o: { status?: string; entity?: string | null; page?: number }) => { const p = new URLSearchParams(); const st = o.status ?? (status ?? "all"); p.set("status", st); const en = o.entity === undefined ? entity : o.entity; if (en) p.set("entity", en); if (o.page && o.page > 1) p.set("page", String(o.page)); return `/app/admin/translations?${p}`; };
  const entityLabel = (e: string) => { const k = `admin.ent.${e}`, v = t(k); return v === k ? e : v; };
  const fieldLabel = (f: string) => { const k = `admin.fld.${f}`, v = t(k); return v === k ? f : v; };
  const open = count("pending") + count("failed");

  return (
    <>
      <PageHeader eyebrow={`${t("nav.groupAdmin")} · TR ⇄ EN`} title={t("nav.translations")} description={t("admin.trLede")} actions={<RunPendingButton disabled={!configured || open === 0} />} />
      {!configured && <Notice tone="warn" className="mb-5" title={t("admin.trNotConfiguredTitle")}>{t("admin.trNotConfiguredBody")}</Notice>}

      <TabLinks current={status ?? "all"} items={[...STATUSES.map((s) => ({ key: s, href: href({ status: s }), label: t(`common.tr.${s}`), count: count(s) })), { key: "all", href: href({ status: "all" }), label: t("common.all"), count: byStatus.reduce((a, b) => a + b.n, 0) }]} />

      {entities.length > 0 && (
        <div className="no-print mt-4 flex flex-wrap items-center gap-1.5">
          <span className="label mr-1">{t("admin.trEntity")}</span>
          <Link href={href({ entity: null })} className={buttonClass(entity ? "ghost" : "secondary", "sm")}>{t("common.all")}</Link>
          {entities.map((e) => <Link key={e.entity} href={href({ entity: e.entity })} className={buttonClass(entity === e.entity ? "secondary" : "ghost", "sm")}>{entityLabel(e.entity)}<span className="num text-ink-3">{e.n}</span></Link>)}
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState className="mt-6" title={t("admin.trEmpty")}>{t("admin.trEmptyHint")}</EmptyState>
      ) : (
        <ul className="panel mt-5">
          {jobs.map((j) => (
            <li key={`${j.id}-${j.sourceRevision}-${j.status}`} className="border-b border-line px-4 py-4 last:border-b-0">
              <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem]">
                <Badge tone={tone[j.status]} dot>{t(`common.tr.${j.status}`)}</Badge>
                <span className="font-medium">{entityLabel(j.entity)} · {fieldLabel(j.field)}</span>
                <span className="code">{j.entityId.length > 20 ? j.entityId.slice(0, 8) + "…" : j.entityId}</span>
                <span className="num uppercase text-ink-3">{j.sourceLang} → {j.sourceLang === "tr" ? "en" : "tr"}</span>
                <span className="num ml-auto text-ink-3">{fmtDateTime(locale, j.updatedAt)}</span>
              </p>
              <TranslationEditor canRetry={configured} job={{ id: j.id, sourceLang: j.sourceLang, sourceText: j.sourceText, targetText: j.targetText, status: j.status, sourceRevision: j.sourceRevision, error: j.error }} />
            </li>
          ))}
        </ul>
      )}
      {total > PAGE && (
        <nav className="no-print mt-4 flex items-center justify-between text-[0.86rem]">
          <span className="num text-ink-3">{(page - 1) * PAGE + 1}–{Math.min(total, page * PAGE)} / {total}</span>
          <span className="flex gap-2">{page > 1 && <Link href={href({ page: page - 1 })} className={buttonClass("secondary", "sm")}>←</Link>}{page * PAGE < total && <Link href={href({ page: page + 1 })} className={buttonClass("secondary", "sm")}>→</Link>}</span>
        </nav>
      )}
    </>
  );
}
