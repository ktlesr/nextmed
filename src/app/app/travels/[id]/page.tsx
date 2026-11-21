import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { db } from "@/db";
import { followUps, meetings, travels } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { listFiles } from "@/lib/files";
import { CURRENCIES, canEditRecord, getLookups, isUuid } from "@/lib/records";
import { diffDays } from "@/lib/dates";
import { fmtDate, fmtDateTime, fmtMoney, pick } from "@/lib/format";
import { DefList, Notice, PageHeader, Panel } from "@/components/ui/layout";
import { Badge, WpChip, type Tone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, SubmitButton } from "@/components/ui/form";
import { ActionForm } from "@/components/records/action-form";
import { BiText, FileRows, FollowUps, UploadModal } from "@/components/records/parts";
import { TravelForm } from "@/components/records/travel-form";
import { deleteTravel, saveTravelCost, saveTravelReport } from "../actions";

const tone: Record<string, Tone> = { planned: "cobalt", completed: "ok", cancelled: "outline" };
const SHARED = ["invitation", "agenda", "assignment"] as const;
const PERSONAL = ["ticket", "boarding"] as const;

export default async function TravelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [r] = await db.select().from(travels).where(eq(travels.id, id));
  if (!r) notFound();
  const { t, locale } = await getT();
  const [L, fileMap, fus, linked] = await Promise.all([
    getLookups(), listFiles("travel", [id]),
    db.select().from(followUps).where(and(eq(followUps.sourceType, "travel"), eq(followUps.sourceId, id))).orderBy(asc(followUps.done), asc(followUps.createdAt)),
    db.select({ id: meetings.id, titleTr: meetings.titleTr, titleEn: meetings.titleEn, startsAt: meetings.startsAt, timeZone: meetings.timeZone }).from(meetings).where(eq(meetings.travelId, id)).orderBy(asc(meetings.startsAt)),
  ]);
  const canEdit = canEditRecord(user, "travel", r.responsibleId);
  const isParticipant = !!user.personId && r.participantIds.includes(user.personId);
  const seeCost = can.finance(user) || can.coordinate(user);
  const all = fileMap.get(id) ?? [];
  const base = (k: string | null) => (k ?? "").split(":")[0];
  const shared = all.filter((f) => !f.ownerPersonId && base(f.kind) !== "report");
  const reportFiles = all.filter((f) => base(f.kind) === "report");
  const hasReport = !!(r.reportTr || r.reportEn) || reportFiles.length > 0;
  const wp = L.actWp(r.activityId);
  const participants = r.participantIds.map((p) => L.people.find((x) => x.id === p)).filter((p) => !!p);
  const kindLabel = (k: string) => t(`ops.tk.${k}`);

  return (
    <>
      <Link href="/app/travels" className="no-print mb-4 inline-flex items-center gap-1.5 text-[0.85rem] text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />{t("nav.travels")}</Link>
      <PageHeader eyebrow={<>{t("ops.travelFile")} · <span className="num">{fmtDate(locale, r.departDate)} – {fmtDate(locale, r.returnDate)}</span></>} title={r.place || pick(locale, r.purposeTr, r.purposeEn)}
        actions={<>
          <Badge tone={tone[r.status]} dot>{t(`ops.tst.${r.status}`)}</Badge>
          {canEdit && <Modal trigger={<><Pencil className="size-3.5" />{t("common.edit")}</>} triggerVariant="secondary" title={t("ops.editTravel")} side>
            <TravelForm t={t} locale={locale} row={r} people={L.people.filter((p) => p.active || r.participantIds.includes(p.id))} options={L.options} />
          </Modal>}
          {canEdit && <ActionForm action={deleteTravel} quiet confirm={t("ops.confirmDelete")} redirectTo="/app/travels"><input type="hidden" name="id" value={r.id} /><Button variant="danger" aria-label={t("common.delete")}><Trash2 className="size-4" /></Button></ActionForm>}
        </>} />

      {r.status === "completed" && !hasReport && <Notice tone="warn" className="mb-6" title={t("ops.reportMissing")}>{t("ops.reportMissingBody")}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-6">
          <Panel title={t("ops.travelInfo")}>
            <p className="label mb-1">{t("ops.purpose")}</p>
            <BiText locale={locale} t={t} tr={r.purposeTr} en={r.purposeEn} className="mb-5 text-[0.95rem]" />
            <DefList items={[
              [t("common.place"), r.place || "—"],
              [t("ops.dates"), <span key="d" className="num text-[0.88rem]">{fmtDate(locale, r.departDate)} – {fmtDate(locale, r.returnDate)} <span className="text-ink-3">· {t("ops.nDays", { n: diffDays(r.departDate, r.returnDate) + 1 })}</span></span>],
              [t("common.responsible"), r.responsibleId ? L.personName.get(r.responsibleId) : "—"],
              [t("common.linkedActivity"), r.activityId ? <span key="a" className="flex flex-wrap items-center gap-2">{wp && <WpChip code={wp.code} />}<span className="code">{L.act.get(r.activityId)?.code}</span><span className="text-[0.86rem] text-ink-2">{L.actName(locale, r.activityId)}</span></span> : "—"],
              [t("ops.linkedMeetings"), linked.length ? <ul key="m">{linked.map((m) => <li key={m.id}><Link href={`/app/meetings/${m.id}`} className="text-cobalt hover:underline">{pick(locale, m.titleTr, m.titleEn)}</Link> <span className="num text-[0.78rem] text-ink-3">{fmtDateTime(locale, m.startsAt, m.timeZone)}</span></li>)}</ul> : "—"],
            ]} />
          </Panel>

          {seeCost && (
            <Panel title={t("ops.actualCost")} aside={<span className="num font-medium text-ink">{fmtMoney(locale, r.actualCost, r.currency)}</span>}>
              <ActionForm action={saveTravelCost} closeOnOk={false} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={r.id} />
                <Field label={t("common.amount")} className="w-40"><input name="actualCost" inputMode="decimal" className="control num" defaultValue={r.actualCost ?? ""} /></Field>
                <Field label={t("common.currency")} className="w-28"><select name="currency" className="control" defaultValue={r.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
                <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
              </ActionForm>
              <p className="mt-3 text-[0.8rem] text-ink-3">{t("ops.actualCostHint")}</p>
            </Panel>
          )}

          <Panel title={t("ops.followUps")} aside={<span className="num">{fus.filter((f) => f.done).length}/{fus.length}</span>}>
            <FollowUps t={t} locale={locale} sourceType="travel" sourceId={r.id} items={fus} canEdit={canEdit} userPersonId={user.personId} people={L.activePeople} options={L.options} personName={L.personName} actCode={(a) => (a ? L.act.get(a)?.code ?? null : null)} />
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title={t("ops.sharedDocs")} aside={canEdit && <UploadModal t={t} sourceType="travel" sourceId={r.id} kinds={SHARED} kindLabel={kindLabel} />}>
            <p className="mb-2 text-[0.82rem] text-ink-3">{t("ops.sharedDocsHint")}</p>
            {SHARED.map((k) => {
              const list = shared.filter((f) => base(f.kind) === k);
              return (
                <div key={k} className="border-t border-line py-2 first:border-t-0">
                  <p className="label mb-1 flex items-center gap-2">{kindLabel(k)}{list.length === 0 && <span className="normal-case tracking-normal text-warn">· {t("ops.docMissing")}</span>}</p>
                  {list.length > 0 && <FileRows files={list} t={t} canEdit={canEdit} sourceType="travel" sourceId={r.id} showMissing={false} />}
                </div>
              );
            })}
          </Panel>

          <Panel title={t("ops.participantDocs")} aside={canEdit && participants.length > 0 && <UploadModal t={t} sourceType="travel" sourceId={r.id} kinds={PERSONAL} kindLabel={kindLabel} people={participants} />}>
            {participants.length === 0 ? <p className="text-[0.88rem] text-ink-3">{t("ops.noParticipants")}</p> : participants.map((p) => {
              const list = all.filter((f) => f.ownerPersonId === p.id);
              return (
                <div key={p.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
                  <p className="mb-1 flex items-center justify-between gap-2 text-[0.9rem] font-semibold">{p.fullName}
                    <span className="flex gap-1.5">{PERSONAL.map((k) => <Badge key={k} tone={list.some((f) => base(f.kind) === k) ? "ok" : "warn"}>{kindLabel(k)}</Badge>)}</span></p>
                  {list.length > 0 && <FileRows files={list} t={t} canEdit={canEdit} sourceType="travel" sourceId={r.id} showMissing={false} />}
                </div>
              );
            })}
          </Panel>

          <Panel title={t("ops.travelReport")} aside={canEdit && <UploadModal t={t} sourceType="travel" sourceId={r.id} kind="report" trigger={t("ops.uploadReport")} title={t("ops.travelReport")} />}>
            {(r.reportTr || r.reportEn) && <BiText locale={locale} t={t} tr={r.reportTr} en={r.reportEn} className="mb-4 text-[0.92rem]" />}
            {reportFiles.length > 0 && <div className="mb-4"><FileRows files={reportFiles} t={t} canEdit={canEdit} sourceType="travel" sourceId={r.id} /></div>}
            {canEdit || isParticipant ? (
              <ActionForm action={saveTravelReport} closeOnOk={false} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={r.id} />
                <Field label={t("ops.reportShortForm")} hint={t("ops.bilingualHint")}><textarea name="report" className="control min-h-28" placeholder={t("ops.reportPlaceholder")} defaultValue={pick(locale, r.reportTr, r.reportEn)} /></Field>
                <div><SubmitButton variant="secondary" size="sm">{t("common.save")}</SubmitButton></div>
              </ActionForm>
            ) : !hasReport && <p className="text-[0.88rem] text-ink-3">{t("ops.reportNone")}</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
