import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Check, Lock, Pencil, Trash2, X } from "lucide-react";
import { db } from "@/db";
import { followUps, procurements } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { listFiles } from "@/lib/files";
import { PROCUREMENT_FILE_KINDS } from "@/lib/constants";
import { canEditRecord, getLookups, isUuid, visibleFiles } from "@/lib/records";
import { fmtDate, fmtMoney, pick } from "@/lib/format";
import { DefList, PageHeader, Panel } from "@/components/ui/layout";
import { WpChip } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form";
import { ActionForm } from "@/components/records/action-form";
import { BiText, FileRows, FollowUps, UploadModal } from "@/components/records/parts";
import { ProcurementForm, REQUIRED_BY_STAGE, STAGES, StageTrack, methodLabel } from "@/components/records/procurement-parts";
import { deleteProcurement, setProcurementStatus } from "../actions";

export default async function ProcurementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [r] = await db.select().from(procurements).where(eq(procurements.id, id));
  if (!r) notFound();
  const { t, locale } = await getT();
  const [L, fileMap, fus] = await Promise.all([getLookups(), listFiles("procurement", [id]), db.select().from(followUps).where(and(eq(followUps.sourceType, "procurement"), eq(followUps.sourceId, id))).orderBy(asc(followUps.done), asc(followUps.createdAt))]);
  const canEdit = canEditRecord(user, "procurement", r.responsibleId);
  const all = fileMap.get(id) ?? [];
  const baseKind = (k: string | null) => (k ?? "").split(":")[0];
  const required = REQUIRED_BY_STAGE[r.status];
  const present = new Set(all.map((f) => baseKind(f.kind))); // presence is checked on all files, even those the viewer may not open
  const wp = L.actWp(r.activityId);
  const idx = STAGES.indexOf(r.status), next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
  const isFinanceKind = (k: string) => k === "invoice" || k === "payment";

  return (
    <>
      <Link href="/app/procurements" className="no-print mb-4 inline-flex items-center gap-1.5 text-[0.85rem] text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />{t("nav.procurements")}</Link>
      <PageHeader eyebrow={<>{t("ops.procurementFile")}{r.activityId && <> · <span className="num">{L.act.get(r.activityId)?.code}</span></>}</>} title={pick(locale, r.titleTr, r.titleEn)}
        actions={canEdit && <>
          <Modal trigger={<><Pencil className="size-3.5" />{t("common.edit")}</>} triggerVariant="secondary" title={t("ops.editProcurement")} side>
            <ProcurementForm t={t} locale={locale} row={r} people={L.people.filter((p) => p.active || p.id === r.responsibleId)} options={L.options} />
          </Modal>
          <ActionForm action={deleteProcurement} quiet confirm={t("ops.confirmDelete")} redirectTo="/app/procurements"><input type="hidden" name="id" value={r.id} /><Button variant="danger" aria-label={t("common.delete")}><Trash2 className="size-4" /></Button></ActionForm>
        </>} />

      <div className="panel mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div className="min-w-0 flex-1 basis-96"><StageTrack status={r.status} t={t} /></div>
        {canEdit && next && (
          <ActionForm action={setProcurementStatus} quiet closeOnOk={false}>
            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={next} />
            <SubmitButton variant="secondary" size="sm">{t("ops.advanceTo", { stage: t(`ops.pst.${next}`) })}</SubmitButton>
          </ActionForm>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-6">
          <Panel title={t("ops.procurementInfo")}>
            <DefList items={[
              [t("common.linkedActivity"), r.activityId ? <span key="a" className="flex flex-wrap items-center gap-2">{wp && <WpChip code={wp.code} />}<span className="code">{L.act.get(r.activityId)?.code}</span><span className="text-[0.86rem] text-ink-2">{L.actName(locale, r.activityId)}</span></span> : "—"],
              [t("ops.agencyResponsible"), r.responsibleId ? L.personName.get(r.responsibleId) : "—"],
              [t("ops.method"), methodLabel(t, r.method)],
              [t("ops.estimatedAmount"), <span key="e" className="num">{fmtMoney(locale, r.estimatedAmount, r.currency)}</span>],
              [t("ops.contractor"), r.contractor || "—"],
              [t("ops.contractAmount"), <span key="c" className="num font-medium">{fmtMoney(locale, r.contractAmount, r.currency)}</span>],
              [t("ops.deliveryDate"), <span key="d" className="num">{fmtDate(locale, r.deliveryDate)}</span>],
            ]} />
            <p className="label mb-1 mt-5">{t("ops.scope")}</p>
            <BiText locale={locale} t={t} tr={r.scopeTr} en={r.scopeEn} className="text-[0.92rem]" />
          </Panel>
          <Panel title={t("ops.checklist")} aside={r.status !== "cancelled" && <span className="num">{required.filter((k) => present.has(k)).length}/{required.length}</span>}>
            {required.length === 0 ? <p className="text-[0.88rem] text-ink-3">—</p> : (
              <ul className="flex flex-col gap-1.5 text-[0.9rem]">
                {required.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    {present.has(k) ? <Check className="size-4 text-ok" /> : <X className="size-4 text-warn" />}
                    <span className={present.has(k) ? "text-ink-2" : "font-medium"}>{t(`ops.pk.${k}`)}</span>
                    {!present.has(k) && <span className="text-[0.78rem] text-warn">{t("ops.docMissing")}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.8rem] text-ink-3">{t("ops.checklistHint")}</p>
          </Panel>
          <Panel title={t("ops.followUps")} aside={<span className="num">{fus.filter((f) => f.done).length}/{fus.length}</span>}>
            <FollowUps t={t} locale={locale} sourceType="procurement" sourceId={r.id} items={fus} canEdit={canEdit} userPersonId={user.personId} people={L.activePeople} options={L.options} personName={L.personName} actCode={(a) => (a ? L.act.get(a)?.code ?? null : null)} />
          </Panel>
        </div>

        <Panel title={t("ops.procurementDocs")} bodyClassName="p-0">
          {PROCUREMENT_FILE_KINDS.map((k) => {
            const list = all.filter((f) => baseKind(f.kind) === k);
            const visible = visibleFiles(user, list);
            const locked = isFinanceKind(k) && !can.finance(user);
            return (
              <div key={k} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[0.9rem] font-semibold">{t(`ops.pk.${k}`)}<span className="num text-[0.74rem] font-normal text-ink-3">{list.length}</span>{isFinanceKind(k) && <Lock className="size-3.5 text-ink-3" aria-label={t("common.access.finance")} />}</p>
                  {canEdit && !locked && <UploadModal t={t} sourceType="procurement" sourceId={r.id} kind={k} title={t(`ops.pk.${k}`)} labelField={k === "offer" ? t("ops.offerFirm") : undefined} />}
                </div>
                {locked && list.length > 0 ? <p className="text-[0.85rem] text-ink-3">{t("ops.financeOnly", { n: list.length })}</p> : <FileRows files={visible} t={t} canEdit={canEdit} sourceType="procurement" sourceId={r.id} showMissing={false} />}
              </div>
            );
          })}
        </Panel>
      </div>
    </>
  );
}
