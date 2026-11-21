import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { concreteOutputs, subactivities, users, people } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getChainOptions, getFrame } from "@/lib/structure";
import { accumulate, duplicateIds, loadObservations } from "@/lib/adminOutputs";
import { listFiles } from "@/lib/files";
import { todayInIstanbul } from "@/lib/dates";
import { fmtDate, fmtDateTime, isFallback, pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { Badge, LangTag, WpChip } from "@/components/ui/badge";
import { DefList, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { Modal } from "@/components/ui/dialog";
import { FileList } from "@/components/ui/evidence";
import { TargetCell, fmtValue, unitLabel } from "@/components/admin/target-cell";
import { DeleteObservationForm, ObservationForm, TargetForm } from "@/components/admin/output-forms";

export default async function OutputDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [row] = await db.select().from(concreteOutputs).where(eq(concreteOutputs.id, decodeURIComponent(id)));
  if (!row) notFound();
  const admin = can.admin(user), editor = can.coordinate(user);
  const [{ t, locale }, { wps, outs, acts }, obs, options] = await Promise.all([getT(), getFrame(), loadObservations([row.id]), admin ? getChainOptions() : null]);
  const actual = accumulate(obs).get(row.id);
  const dups = duplicateIds(obs);
  const fileMap = await listFiles("observation", obs.map((o) => o.id));
  const authorIds = [...new Set(obs.map((o) => o.createdBy).filter(Boolean))] as string[];
  const authors = authorIds.length ? await db.select({ id: users.id, email: users.email, name: people.fullName }).from(users).leftJoin(people, eq(people.id, users.personId)).where(inArray(users.id, authorIds)) : [];
  const matrix = row.sources?.zafer_matrix_subactivities ?? [];
  const subs = matrix.length ? await db.select({ code: subactivities.code, nameTr: subactivities.nameTr, nameEn: subactivities.nameEn }).from(subactivities).where(inArray(subactivities.code, matrix)) : [];
  const output = outs.find((o) => o.id === row.outputId), activity = acts.find((a) => a.id === row.activityId);
  const pages = row.sources?.application_form_pages ?? [];
  const basis = row.projectTargetBasis ? t(`outputs.basis.${row.projectTargetBasis}`) : "—";
  const today = todayInIstanbul();
  const history = [...row.history].reverse();
  const fieldLabel = (k: string) => { const key = `outputs.f.${k}`, v = t(key); return v === key ? k : v; };
  const show = (v: unknown): string => v == null ? "—" : typeof v === "object" ? ("display_tr" in (v as object) ? String((v as Record<string, unknown>)[locale === "tr" ? "display_tr" : "display_en"]) : JSON.stringify(v)) : typeof v === "boolean" ? (v ? t("common.yes") : t("common.no")) : String(v);

  return (
    <>
      <Link href="/app/outputs" className="no-print mb-4 inline-flex items-center gap-1.5 text-[0.86rem] text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />{t("nav.outputs")}</Link>
      <PageHeader
        eyebrow={<span className="flex flex-wrap items-center gap-3">{t("outputs.eyebrow")}{row.workPackageIds.map((w) => { const x = wps.find((y) => y.id === w); return x ? <WpChip key={w} code={x.code} /> : null; })}{row.programmeIndicator && <span className="num text-cobalt">{row.programmeIndicator}</span>}</span>}
        title={pick(locale, row.nameTr, row.nameEn)}
        description={isFallback(locale, row.nameTr, row.nameEn) ? t("common.sourceShown") : undefined}
        actions={<>
          {editor && row.active && <Modal trigger={<><Plus className="size-4" />{t("outputs.addObservation")}</>} title={t("outputs.addObservation")} description={pick(locale, row.nameTr, row.nameEn)} side><ObservationForm output={{ id: row.id, projectTarget: row.projectTarget, zaferObligation: row.zaferObligation }} today={today} /></Modal>}
          {admin && options && <Modal trigger={<><Pencil className="size-4" />{t("common.edit")}</>} triggerVariant="secondary" title={t("outputs.editTarget")} description={t("outputs.editTargetLede")} side><TargetForm output={row} options={options} /></Modal>}
        </>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("outputs.colProject")} aside={<span className="label">{t("outputs.scopeProject")}</span>}><TargetCell spec={row.projectTarget} actual={actual?.project} t={t} locale={locale} large /></Panel>
        <Panel title={t("outputs.colZafer")} aside={<span className="label">ZAFER · PP5</span>}><TargetCell spec={row.zaferObligation} actual={actual?.zafer} t={t} locale={locale} large /></Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
        <Panel title={t("outputs.linksAndSource")}>
          <DefList items={[
            [t("common.workPackage"), <ul key="w" className="flex flex-col gap-1">{row.workPackageIds.map((w) => { const x = wps.find((y) => y.id === w); return x ? <li key={w}><Link href={`/app/gantt?wp=${x.id}`} className="hover:text-cobalt"><span className="code mr-2">{x.code}</span>{pick(locale, x.nameTr, x.nameEn)}</Link></li> : null; })}{!row.workPackageIds.length && "—"}</ul>],
            [t("common.output"), output ? <span key="o"><span className="code mr-2">{output.code}</span>{pick(locale, output.nameTr, output.nameEn)}</span> : "—"],
            [t("common.activity"), activity ? <span key="a"><span className="code mr-2">{activity.code}</span>{pick(locale, activity.nameTr, activity.nameEn)}</span> : "—"],
            [t("outputs.basisLabel"), basis],
            [t("outputs.sourcePages"), pages.length ? <span key="p" className="num">{t("outputs.pagesShort", { pages: pages.join(", ") })}</span> : "—"],
            [t("outputs.sourceMatrix"), matrix.length ? <ul key="m" className="flex flex-col gap-1">{matrix.map((c) => { const s = subs.find((x) => x.code === c); return <li key={c}><span className="code mr-2">{c}</span><span className="text-ink-2">{s ? pick(locale, s.nameTr, s.nameEn) : ""}</span></li>; })}</ul> : "—"],
            [t("outputs.countingNote"), pick(locale, row.countingNoteTr, row.countingNoteEn) || "—"],
            [t("outputs.priority"), row.priority ? t("common.yes") : t("common.no")],
          ]} />
          {!row.active && <p className="mt-4"><Badge tone="neutral">{t("outputs.inactive")}</Badge></p>}
        </Panel>

        <Panel title={t("outputs.history")} aside={<span className="num">{obs.length}</span>} bodyClassName="p-0">
          {obs.length === 0 ? (
            <div className="p-4"><EmptyState title={t("outputs.noObservations")}>{t("outputs.noObservationsHint")}</EmptyState></div>
          ) : (
            <ul>
              {obs.map((o) => {
                const author = authors.find((a) => a.id === o.createdBy);
                const note = pick(locale, o.noteTr, o.noteEn);
                return (
                  <li key={o.id} className="grid grid-cols-[5.6rem_1fr_auto] gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 last:border-b-0">
                    <span className="num pt-0.5 text-[0.82rem] text-ink-2">{fmtDate(locale, o.observedOn)}</span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={o.scope === "zafer" ? "turq" : "cobalt"}>{o.scope === "zafer" ? t("outputs.scopeZafer") : t("outputs.scopeProject")}</Badge>
                        {o.value != null && <span className="num font-medium">{dups.has(o.id) ? <s className="text-ink-3">{fmtValue(locale, Number(o.value))}</s> : `+${fmtValue(locale, Number(o.value))}`} <span className="font-normal text-ink-2">{unitLabel(t, o.unit)}</span></span>}
                        {o.status && <Badge tone={o.status === "completed" || o.status === "contributed" ? "ok" : "neutral"}>{t(`outputs.os.${o.status}`)}</Badge>}
                        {o.dedupeKey && <span className="code" title={t("outputs.dedupeKey")}>#{o.dedupeKey}</span>}
                        {dups.has(o.id) && <Badge tone="warn">{t("outputs.notCounted")}</Badge>}
                      </p>
                      {note && <p className="mt-1.5 text-[0.9rem] text-ink-2">{note}{isFallback(locale, o.noteTr, o.noteEn) && <span className="ml-2 inline-flex items-center gap-1 text-[0.76rem] text-warn"><LangTag lang={locale} missing />{t("common.translationPending")}</span>}</p>}
                      <FileList files={fileMap.get(o.id)} t={t} className="mt-2" compact={!fileMap.get(o.id)?.length} />
                      <p className="mt-1.5 text-[0.76rem] text-ink-3">{author?.name ?? author?.email ?? "—"} · {fmtDateTime(locale, o.createdAt)}</p>
                    </div>
                    {editor && <div className="no-print"><Modal trigger={<Trash2 className="size-4" />} triggerVariant="ghost" triggerSize="sm" title={t("outputs.deleteObservation")}><DeleteObservationForm id={o.id} /></Modal></div>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {admin && (
        <Panel title={t("outputs.versions")} aside={<span className="num">{history.length}</span>} className="mt-6" bodyClassName={history.length ? "p-0" : undefined}>
          {history.length === 0 ? <p className="text-[0.88rem] text-ink-3">{t("outputs.noVersions")}</p> : (
            <ul>
              {history.map((h, i) => (
                <li key={i} className="border-b border-line px-4 py-3 last:border-b-0">
                  <p className="text-[0.82rem] text-ink-2"><span className="num">{fmtDateTime(locale, h.at)}</span> · {h.by ?? "—"}</p>
                  <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-[0.86rem] sm:grid-cols-[11rem_1fr]">
                    {Object.entries(h.before).map(([k, v]) => <div key={k} className="contents"><dt className="label pt-0.5">{fieldLabel(k)}</dt><dd className="text-ink-2"><span className="text-ink-3">{t("outputs.was")} </span>{show(v)}</dd></div>)}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}
