import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { db } from "@/db";
import { followUps, meetings, travels } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { listFiles } from "@/lib/files";
import { canEditRecord, getLookups, isUuid } from "@/lib/records";
import { fmtDate, fmtDateTime, fmtDuration, pick } from "@/lib/format";
import { DefList, Notice, PageHeader, Panel } from "@/components/ui/layout";
import { Badge, WpChip, type Tone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { Field, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/records/action-form";
import { BiText, FileRows, FollowUps, UploadModal } from "@/components/records/parts";
import { MeetingForm } from "@/components/records/meeting-form";
import { deleteMeeting, saveOutcome } from "../actions";

const tone: Record<string, Tone> = { planned: "cobalt", held: "ok", cancelled: "outline" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [m] = await db.select().from(meetings).where(eq(meetings.id, id));
  if (!m) notFound();
  const { t, locale } = await getT();
  const [L, fileMap, fus, travelRows] = await Promise.all([
    getLookups(), listFiles("meeting", [id]),
    db.select().from(followUps).where(and(eq(followUps.sourceType, "meeting"), eq(followUps.sourceId, id))).orderBy(asc(followUps.done), asc(followUps.createdAt)),
    db.select().from(travels).orderBy(desc(travels.departDate)),
  ]);
  const canEdit = canEditRecord(user, "meeting", m.responsibleId);
  const all = fileMap.get(id) ?? [];
  const minutes = all.filter((f) => f.kind?.startsWith("minutes")), others = all.filter((f) => !f.kind?.startsWith("minutes"));
  const isPast = m.startsAt < new Date() && m.status !== "cancelled";
  const hasOutcome = !!(m.outcomeTr || m.outcomeEn);
  const wp = L.actWp(m.activityId);
  const travel = m.travelId ? travelRows.find((x) => x.id === m.travelId) : null;
  const backHref = m.kind === "stakeholder" ? "/app/meetings?kind=stakeholder" : "/app/meetings";

  return (
    <>
      <Link href={backHref} className="no-print mb-4 inline-flex items-center gap-1.5 text-[0.85rem] text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />{t("nav.meetings")}</Link>
      <PageHeader eyebrow={<>{t(`ops.kind.${m.kind}`)} · <span className="num">{fmtDateTime(locale, m.startsAt, m.timeZone)}</span></>} title={pick(locale, m.titleTr, m.titleEn)}
        actions={<>
          <Badge tone={tone[m.status]} dot>{t(`ops.mst.${m.status}`)}</Badge>
          {canEdit && <Modal trigger={<><Pencil className="size-3.5" />{t("common.edit")}</>} triggerVariant="secondary" title={t("ops.editMeeting")} side>
            <MeetingForm t={t} locale={locale} meeting={m} people={L.people.filter((p) => p.active || m.participantIds.includes(p.id))} options={L.options} travels={travelRows} />
          </Modal>}
          {canEdit && <ActionForm action={deleteMeeting} quiet confirm={t("ops.confirmDelete")} redirectTo={backHref}><input type="hidden" name="id" value={m.id} /><Button variant="danger" aria-label={t("common.delete")}><Trash2 className="size-4" /></Button></ActionForm>}
        </>} />

      {isPast && (!hasOutcome || minutes.length === 0) && (
        <Notice tone="warn" className="mb-6" title={t("ops.meetingIncomplete")}>
          {[!hasOutcome && t("ops.outcomeMissing"), minutes.length === 0 && t("ops.minutesMissing"), m.status === "planned" && t("ops.stillPlanned")].filter(Boolean).join(" · ")}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-6">
          <Panel title={t("ops.meetingInfo")}>
            <DefList items={[
              [t("ops.startsAt"), <span key="d" className="num text-[0.88rem]">{fmtDateTime(locale, m.startsAt, m.timeZone)} <span className="text-ink-3">· {m.timeZone} · {fmtDuration(locale, m.durationMinutes)}</span>{m.timeZone !== "Europe/Istanbul" && <span className="block text-ink-3">{fmtDateTime(locale, m.startsAt)} · Europe/Istanbul</span>}</span>],
              [t("common.place"), m.location || "—"],
              [t("ops.onlineUrl"), m.onlineUrl ? <a key="u" href={m.onlineUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-cobalt hover:underline"><ExternalLink className="size-3.5 shrink-0" />{m.onlineUrl}</a> : "—"],
              [t("common.responsible"), m.responsibleId ? L.personName.get(m.responsibleId) : "—"],
              [t("common.linkedActivity"), m.activityId ? <span key="a" className="flex flex-wrap items-center gap-2">{wp && <WpChip code={wp.code} />}<span className="code">{L.act.get(m.activityId)?.code}</span><span className="text-[0.86rem] text-ink-2">{L.actName(locale, m.activityId)}</span></span> : "—"],
              [t("ops.relatedTravel"), travel ? <Link key="t" href={`/app/travels/${travel.id}`} className="text-cobalt hover:underline">{fmtDate(locale, travel.departDate)} · {travel.place}</Link> : "—"],
            ]} />
          </Panel>
          <Panel title={t("common.participants")} aside={<span className="num">{m.participantIds.length}</span>}>
            {m.participantIds.length ? <ul className="grid gap-1 text-[0.9rem] sm:grid-cols-2">{m.participantIds.map((p) => <li key={p}>{L.personName.get(p) ?? p}</li>)}</ul> : <p className="text-[0.88rem] text-ink-3">—</p>}
            {m.externalParticipants && <><p className="label mb-1 mt-4">{t("ops.externalParticipants")}</p><p className="whitespace-pre-line text-[0.9rem] text-ink-2">{m.externalParticipants}</p></>}
          </Panel>
          <Panel title={t("ops.agenda")}>
            <BiText locale={locale} t={t} tr={m.agendaTr} en={m.agendaEn} className="text-[0.92rem]" />
            {(m.descriptionTr || m.descriptionEn) && <><p className="label mb-1 mt-4">{t("common.description")}</p><BiText locale={locale} t={t} tr={m.descriptionTr} en={m.descriptionEn} className="text-[0.9rem] text-ink-2" /></>}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title={t("ops.outcome")}>
            {hasOutcome && <BiText locale={locale} t={t} tr={m.outcomeTr} en={m.outcomeEn} className="mb-4 text-[0.92rem]" />}
            {canEdit ? (
              <ActionForm action={saveOutcome} closeOnOk={false} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={m.id} />
                <Field label={hasOutcome ? t("ops.outcomeEdit") : t("ops.outcomeWrite")} hint={t("ops.bilingualHint")}><textarea name="outcome" className="control min-h-28" defaultValue={pick(locale, m.outcomeTr, m.outcomeEn)} /></Field>
                <div><SubmitButton variant="secondary" size="sm">{t("common.save")}</SubmitButton></div>
              </ActionForm>
            ) : !hasOutcome && <p className="text-[0.88rem] text-ink-3">{t("ops.outcomeNone")}</p>}
          </Panel>
          <Panel title={t("ops.minutes")} aside={canEdit && <UploadModal t={t} sourceType="meeting" sourceId={m.id} kind="minutes" title={t("ops.minutes")} />}>
            <FileRows files={minutes} t={t} canEdit={canEdit} sourceType="meeting" sourceId={m.id} />
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="label">{t("ops.otherAttachments")}</p>
              {canEdit && <UploadModal t={t} sourceType="meeting" sourceId={m.id} kinds={["attachment", "agenda"]} kindLabel={(k) => t(`ops.mkind.${k}`)} />}
            </div>
            <div className="mt-2"><FileRows files={others} t={t} canEdit={canEdit} sourceType="meeting" sourceId={m.id} showMissing={false} /></div>
          </Panel>
          <Panel title={t("ops.decisionsAndTasks")} aside={<span className="num">{fus.filter((f) => f.done).length}/{fus.length}</span>}>
            <FollowUps t={t} locale={locale} sourceType="meeting" sourceId={m.id} items={fus} canEdit={canEdit} userPersonId={user.personId} people={L.activePeople} options={L.options} personName={L.personName} actCode={(a) => (a ? L.act.get(a)?.code ?? null : null)} />
          </Panel>
        </div>
      </div>
    </>
  );
}
