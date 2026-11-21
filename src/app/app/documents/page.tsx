import Link from "next/link";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { History, Lock, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { db } from "@/db";
import { documents, expectedPayments, meetings, procurements, travels, type FileAccess } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { listFiles, type FileMeta } from "@/lib/files";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { getLookups } from "@/lib/records";
import { fmtDate, fmtMonthYear, pick } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { Badge, WpChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, SubmitButton } from "@/components/ui/form";
import { EvidenceSlots, FileList } from "@/components/ui/evidence";
import { ActivitySelect } from "@/components/ui/chain-select";
import { ActionForm } from "@/components/records/action-form";
import { BiText } from "@/components/records/parts";
import { createDocument, deleteDocument, newDocumentVersion, updateDocument } from "./actions";

export const metadata = { title: "Dokümanlar" };
type Doc = typeof documents.$inferSelect;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { t, locale } = await getT();
  const L = await getLookups();
  const cat = DOCUMENT_CATEGORIES.find((c) => c === sp.cat);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  // Access is enforced in the query: restricted documents never reach users without that permission.
  const allowed = (["team", "finance", "admin"] as FileAccess[]).filter((a) => can.fileAccess(user, a));
  const visible = inArray(documents.access, allowed);
  const actIds = sp.act ? L.options.acts.filter((a) => a.code.startsWith(sp.act!.trim())).map((a) => a.id) : null;
  const filters = and(
    visible, eq(documents.isCurrent, true), cat ? eq(documents.category, cat) : undefined,
    q ? or(ilike(documents.titleTr, `%${q}%`), ilike(documents.titleEn, `%${q}%`), ilike(documents.descriptionTr, `%${q}%`), ilike(documents.descriptionEn, `%${q}%`), ilike(documents.docType, `%${q}%`)) : undefined,
    isDate(sp.from) ? gte(documents.docDate, sp.from!) : undefined, isDate(sp.to) ? lte(documents.docDate, sp.to!) : undefined,
    actIds ? (actIds.length ? inArray(documents.activityId, actIds) : sql`false`) : undefined,
  );
  const [rows, counts, mtgs, trvs, prcs, pays] = await Promise.all([
    db.select().from(documents).where(filters).orderBy(desc(sql`coalesce(${documents.docDate}, ${documents.createdAt}::date)`), desc(documents.createdAt)),
    db.select({ category: documents.category, n: sql<number>`count(*)::int` }).from(documents).where(and(visible, eq(documents.isCurrent, true))).groupBy(documents.category),
    db.select({ id: meetings.id, titleTr: meetings.titleTr, titleEn: meetings.titleEn, startsAt: meetings.startsAt }).from(meetings).orderBy(desc(meetings.startsAt)).limit(100),
    db.select({ id: travels.id, purposeTr: travels.purposeTr, purposeEn: travels.purposeEn, place: travels.place, departDate: travels.departDate }).from(travels).orderBy(desc(travels.departDate)).limit(100),
    db.select({ id: procurements.id, titleTr: procurements.titleTr, titleEn: procurements.titleEn }).from(procurements).orderBy(desc(procurements.createdAt)).limit(100),
    can.finance(user) || can.coordinate(user) ? db.select({ id: expectedPayments.id, kind: expectedPayments.kind, period: expectedPayments.period }).from(expectedPayments).orderBy(desc(expectedPayments.createdAt)).limit(100) : Promise.resolve([]),
  ]);
  const groupIds = [...new Set(rows.map((r) => r.groupId))];
  const older = groupIds.length ? await db.select().from(documents).where(and(visible, eq(documents.isCurrent, false), inArray(documents.groupId, groupIds))).orderBy(desc(documents.version)) : [];
  const fileMap = await listFiles("document", [...rows, ...older].map((d) => d.id));
  const n = (c: string) => counts.find((x) => x.category === c)?.n ?? 0;
  const total = counts.reduce((a, c) => a + c.n, 0);
  const qs = (over: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v); const s = p.toString(); return `/app/documents${s ? `?${s}` : ""}`; };
  const filtered = !!(q || sp.from || sp.to || sp.act);
  const short = (s: string, len = 70) => (s.length > len ? s.slice(0, len - 1) + "…" : s);

  const linkOptions = (
    <>
      <option value="">{t("common.none")}</option>
      {mtgs.length > 0 && <optgroup label={t("nav.meetings")}>{mtgs.map((m) => <option key={m.id} value={`meeting:${m.id}`}>{fmtDate(locale, m.startsAt.toISOString())} · {short(pick(locale, m.titleTr, m.titleEn))}</option>)}</optgroup>}
      {trvs.length > 0 && <optgroup label={t("nav.travels")}>{trvs.map((x) => <option key={x.id} value={`travel:${x.id}`}>{fmtDate(locale, x.departDate)} · {short(x.place || pick(locale, x.purposeTr, x.purposeEn))}</option>)}</optgroup>}
      {prcs.length > 0 && <optgroup label={t("nav.procurements")}>{prcs.map((x) => <option key={x.id} value={`procurement:${x.id}`}>{short(pick(locale, x.titleTr, x.titleEn))}</option>)}</optgroup>}
      {pays.length > 0 && <optgroup label={t("nav.payments")}>{pays.map((x) => <option key={x.id} value={`payment:${x.id}`}>{t(`finance.kind.${x.kind}`)}{x.period ? ` · ${x.period}` : ""}</option>)}</optgroup>}
    </>
  );
  const linkHref = (d: Doc) => d.linkType === "payment" ? "/app/payments" : d.linkType === "work_log" ? "/app/work" : d.linkType && d.linkId ? `/app/${d.linkType}s/${d.linkId}` : null;
  const linkLabel = (d: Doc) => {
    if (d.linkType === "meeting") { const m = mtgs.find((x) => x.id === d.linkId); return m ? short(pick(locale, m.titleTr, m.titleEn), 40) : ""; }
    if (d.linkType === "travel") { const x = trvs.find((y) => y.id === d.linkId); return x ? short(x.place || pick(locale, x.purposeTr, x.purposeEn), 40) : ""; }
    if (d.linkType === "procurement") { const x = prcs.find((y) => y.id === d.linkId); return x ? short(pick(locale, x.titleTr, x.titleEn), 40) : ""; }
    return "";
  };

  const DetailFields = ({ doc }: { doc?: Doc }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("common.title")} required hint={t("docs.bilingualHint")} className="sm:col-span-2"><input name="title" required className="control" defaultValue={doc ? pick(locale, doc.titleTr, doc.titleEn) : ""} /></Field>
      <Field label={t("docs.category")} required>
        <select name="category" required className="control" defaultValue={doc?.category ?? cat ?? "project_documents"}>{DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`common.cat.${c}`)}</option>)}</select>
      </Field>
      <Field label={t("common.type")} hint={t("docs.typeHint")}><input name="docType" className="control" maxLength={80} defaultValue={doc?.docType ?? ""} /></Field>
      <Field label={t("docs.docDate")}><input type="date" name="docDate" className="control" defaultValue={doc?.docDate ?? ""} /></Field>
      <Field label={t("docs.access")} hint={allowed.length === 1 ? t("docs.accessHintTeam") : t("docs.accessHint")}>
        <select name="access" className="control" defaultValue={doc?.access ?? "team"}>{allowed.map((a) => <option key={a} value={a}>{t(`common.access.${a}`)}</option>)}</select>
      </Field>
      <Field label={t("common.description")} className="sm:col-span-2"><textarea name="description" className="control min-h-16" defaultValue={doc ? pick(locale, doc.descriptionTr, doc.descriptionEn) : ""} /></Field>
      <Field label={t("common.linkedActivity")} hint={t("common.optional")} className="sm:col-span-2"><ActivitySelect options={L.options} defaultValue={doc?.activityId} /></Field>
      <Field label={t("docs.linkedRecord")} hint={t("common.optional")} className="sm:col-span-2">
        <select name="link" className="control" defaultValue={doc?.linkType && doc.linkId && doc.linkType !== "work_log" ? `${doc.linkType}:${doc.linkId}` : ""}>{linkOptions}</select>
      </Field>
    </div>
  );

  const MetaLine = ({ d }: { d: Doc }) => {
    const wp = d.workPackageId ? L.wp.get(d.workPackageId) : L.actWp(d.activityId);
    const meta = d.meta as { year?: number; month?: number; scope?: string; locale?: string } | null;
    const href = linkHref(d);
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-ink-2">
        <span className="num">{fmtDate(locale, d.docDate ?? d.createdAt.toISOString())}</span>
        {d.docType && <span>{d.docType}</span>}
        {meta?.year && meta?.month && <Badge tone="turq">{fmtMonthYear(locale, meta.year, meta.month)}{meta.scope ? ` · ${meta.scope}` : ""}{meta.locale ? ` · ${String(meta.locale).toUpperCase()}` : ""}</Badge>}
        {wp && <WpChip code={wp.code} />}
        {d.activityId && <span className="code">{L.act.get(d.activityId)?.code}</span>}
        {href && <Link href={href} className="text-cobalt underline-offset-2 hover:underline">{t(`docs.link.${d.linkType}`)}{linkLabel(d) && `: ${linkLabel(d)}`}</Link>}
        <span className="text-ink-3">{t("docs.uploadedBy", { name: d.uploadedBy ? L.userName.get(d.uploadedBy) ?? "—" : "—" })}</span>
      </p>
    );
  };

  return (
    <>
      <PageHeader eyebrow={t("nav.groupRecords")} title={t("nav.documents")} description={t("docs.lede")}
        actions={
          <Modal trigger={<><Plus className="size-4" />{t("docs.upload")}</>} title={t("docs.upload")} side>
            <ActionForm action={createDocument} className="flex flex-col gap-4">
              <DetailFields />
              <EvidenceSlots t={t} links labelTr={t("docs.fileTr")} labelEn={t("docs.fileEn")} />
              <div><SubmitButton>{t("common.upload")}</SubmitButton></div>
            </ActionForm>
          </Modal>
        } />

      <div className="grid gap-6 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
        {/* Category sub-navigation */}
        <nav className="no-print lg:sticky lg:top-20 lg:self-start" aria-label={t("docs.category")}>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0 lg:border-t lg:border-ink">
            {[{ key: undefined as string | undefined, label: t("docs.allCategories"), count: total }, ...DOCUMENT_CATEGORIES.map((c) => ({ key: c as string, label: t(`common.cat.${c}`), count: n(c) }))].map((it) => {
              const on = cat === it.key;
              return (
                <li key={it.key ?? "all"} className="shrink-0 lg:border-b lg:border-line">
                  <Link href={qs({ cat: it.key })} aria-current={on ? "page" : undefined} className={cn("flex items-center justify-between gap-3 whitespace-nowrap rounded-sm px-2.5 py-2 text-[0.9rem] lg:rounded-none lg:px-1", on ? "bg-ink font-semibold text-bg lg:bg-transparent lg:text-ink" : "text-ink-2 hover:text-ink")}>
                    <span className="flex items-center gap-2">{on && <span className="hidden h-3.5 w-[3px] bg-cobalt lg:block" aria-hidden />}{it.label}</span>
                    <span className="num text-[0.74rem] opacity-70">{it.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <form method="get" className="no-print mb-5 flex flex-wrap items-end gap-3">
            {cat && <input type="hidden" name="cat" value={cat} />}
            <Field label={t("common.search")} className="min-w-52 flex-1"><input type="search" name="q" defaultValue={q} className="control" placeholder={t("docs.searchPlaceholder")} /></Field>
            <Field label={t("docs.from")} className="w-40"><input type="date" name="from" defaultValue={sp.from ?? ""} className="control" /></Field>
            <Field label={t("docs.to")} className="w-40"><input type="date" name="to" defaultValue={sp.to ?? ""} className="control" /></Field>
            <Field label={t("docs.activityCode")} className="w-32"><input name="act" defaultValue={sp.act ?? ""} className="control num" placeholder="4.1.2" /></Field>
            <Button type="submit" variant="secondary">{t("common.filter")}</Button>
            {filtered && <Link href={qs({ q: undefined, from: undefined, to: undefined, act: undefined })} className="pb-2.5 text-[0.85rem] text-ink-2 underline underline-offset-2 hover:text-ink">{t("docs.clear")}</Link>}
          </form>

          {rows.length === 0 ? <EmptyState title={filtered ? t("common.emptyFiltered") : t("common.empty")}>{t("docs.empty")}</EmptyState> : (
            <ul className="rule-top">
              {rows.map((d) => {
                const hist = older.filter((o) => o.groupId === d.groupId);
                const editable = can.coordinate(user) || d.uploadedBy === user.id;
                const dFiles: FileMeta[] = fileMap.get(d.id) ?? [];
                return (
                  <li key={d.id} className="border-b border-line py-4">
                    <div className="grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <BiText as="span" locale={locale} t={t} tr={d.titleTr} en={d.titleEn} className="text-[1.02rem] font-semibold" />
                          <span className="num rounded-xs border border-line-2 px-1.5 text-[0.72rem] font-medium text-ink-2" title={t("docs.currentVersion")}>v{d.version}</span>
                          {!cat && <Badge tone="neutral">{t(`common.cat.${d.category}`)}</Badge>}
                          {d.access !== "team" && <Badge tone="warn"><Lock className="size-3" />{t(`common.access.${d.access}`)}</Badge>}
                        </div>
                        <MetaLine d={d} />
                        {(d.descriptionTr || d.descriptionEn) && <BiText locale={locale} t={t} tr={d.descriptionTr} en={d.descriptionEn} className="mt-2 max-w-[70ch] text-[0.88rem] text-ink-2" />}
                      </div>
                      <div className="min-w-0">
                        <FileList files={dFiles} t={t} />
                        {editable && (
                          <div className="no-print mt-3 flex flex-wrap gap-1.5">
                            <Modal trigger={<><Upload className="size-3.5" />{t("docs.newVersion")}</>} triggerVariant="secondary" triggerSize="sm" title={t("docs.newVersion")} description={`${pick(locale, d.titleTr, d.titleEn)} · v${d.version} → v${Math.max(d.version, ...hist.map((h) => h.version)) + 1}`} wide>
                              <ActionForm action={newDocumentVersion} className="flex flex-col gap-4">
                                <input type="hidden" name="id" value={d.id} />
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label={t("docs.docDate")}><input type="date" name="docDate" className="control" /></Field>
                                  <Field label={t("docs.versionNote")} hint={t("common.optional")}><input name="note" className="control" maxLength={200} /></Field>
                                </div>
                                <EvidenceSlots t={t} links labelTr={t("docs.fileTr")} labelEn={t("docs.fileEn")} />
                                <p className="text-[0.82rem] text-ink-3">{t("docs.newVersionHint")}</p>
                                <div><SubmitButton>{t("common.upload")}</SubmitButton></div>
                              </ActionForm>
                            </Modal>
                            <Modal trigger={<><Pencil className="size-3.5" />{t("common.edit")}</>} triggerVariant="ghost" triggerSize="sm" title={t("docs.editCard")} side>
                              <ActionForm action={updateDocument} className="flex flex-col gap-4">
                                <input type="hidden" name="id" value={d.id} />
                                <DetailFields doc={d} />
                                <p className="label">{t("docs.addLanguageVersion")}</p>
                                <EvidenceSlots t={t} links labelTr={t("docs.fileTr")} labelEn={t("docs.fileEn")} />
                                <div><SubmitButton>{t("common.save")}</SubmitButton></div>
                              </ActionForm>
                            </Modal>
                            <ActionForm action={deleteDocument} quiet closeOnOk={false} confirm={t("docs.confirmDelete")}>
                              <input type="hidden" name="id" value={d.id} />
                              <Button variant="ghost" size="sm" aria-label={t("common.delete")} className="hover:text-red"><Trash2 className="size-3.5" /></Button>
                            </ActionForm>
                          </div>
                        )}
                      </div>
                    </div>
                    {hist.length > 0 && (
                      <details className="mt-3">
                        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[0.82rem] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden"><History className="size-3.5" />{t("docs.history", { n: hist.length })}</summary>
                        <ul className="mt-2 border-l border-line-2 pl-4">
                          {hist.map((h) => (
                            <li key={h.id} className="grid gap-x-6 gap-y-1 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
                              <p className="text-[0.84rem] text-ink-2"><span className="num font-medium text-ink">v{h.version}</span> · <span className="num">{fmtDate(locale, h.docDate ?? h.createdAt.toISOString())}</span> · {t("docs.uploadedBy", { name: h.uploadedBy ? L.userName.get(h.uploadedBy) ?? "—" : "—" })}</p>
                              <FileList files={fileMap.get(h.id)} t={t} flagMissing={false} compact />
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
