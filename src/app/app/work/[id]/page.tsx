import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { assignments, auditLog, people, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { todayInIstanbul } from "@/lib/dates";
import { listFiles } from "@/lib/files";
import { fmtDate, fmtDateTime, fmtDuration, pick } from "@/lib/format";
import { getChainOptions, getProject } from "@/lib/structure";
import { canReviewLog, dayUsedMinutes, fetchLogs, monthStateOfDate, ownerAccounts } from "@/lib/work";
import { getT } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { FileList } from "@/components/ui/evidence";
import { DefList, Notice, PageHeader, Panel } from "@/components/ui/layout";
import { LangTag, WpChip } from "@/components/ui/badge";
import { OutsidePlanFlag, StatusBadge } from "@/components/work/log-bits";
import { AddEvidenceForm, ApproveButton, CancelButton, ReturnButton, SubmitLogButton } from "@/components/work/row-actions";
import { WorkLogButton } from "@/components/work/work-form";

export default async function WorkLogDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [log] = await fetchLogs({ id });
  if (!log) notFound();
  const mine = log.personId === user.personId;
  if (!mine && !can.coordinate(user)) notFound(); // a team member only sees their own records
  const [{ t, locale }, project, files, owners, history, mState] = await Promise.all([
    getT(), getProject(), listFiles("work_log", [id]), ownerAccounts([log.personId]),
    db.select({ at: auditLog.at, action: auditLog.action, reason: auditLog.reason, who: people.fullName, email: users.email })
      .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).leftJoin(people, eq(people.id, users.personId))
      .where(and(eq(auditLog.entity, "work_log"), eq(auditLog.entityId, id))).orderBy(desc(auditLog.at)),
    monthStateOfDate(log.workDate),
  ]);
  const reviewer = canReviewLog(user, owners.get(log.personId)!);
  const editable = mine && mState !== "closed" && (log.status === "draft" || log.status === "changes_requested" || (mState === "reopened" && log.status !== "cancelled"));
  const [options, asg, used] = editable
    ? await Promise.all([getChainOptions(), db.select({ sub: assignments.subactivityId }).from(assignments).where(and(eq(assignments.personId, log.personId), eq(assignments.active, true))), dayUsedMinutes(db, log.personId, log.workDate, log.id)])
    : [null, [], 0];
  const f = files.get(id);
  const sourceText = log.sourceLang === "tr" ? log.descriptionTr : log.descriptionEn;
  const otherText = log.sourceLang === "tr" ? log.descriptionEn : log.descriptionTr;
  const otherLang = log.sourceLang === "tr" ? "en" : "tr";

  return (
    <>
      <ButtonLink href={mine ? "/app/work" : "/app/review"} variant="ghost" size="sm" className="no-print -ml-2 mb-3"><ArrowLeft className="size-4" />{mine ? t("nav.work") : t("nav.review")}</ButtonLink>
      <PageHeader
        eyebrow={<>{t("work.record")} · <span className="num">{fmtDate(locale, log.workDate)}</span> · {log.personName}</>}
        title={<span className="flex flex-wrap items-center gap-3"><span className="num">{fmtDuration(locale, log.minutes)}</span><StatusBadge status={log.status} t={t} /></span>}
        actions={
          <>
            {editable && options && (
              <WorkLogButton options={options} assignedSubIds={asg.map((a) => a.sub)} today={todayInIstanbul()} minDate={project.startDate} limit={project.dailyLimitMinutes} step={project.stepMinutes} size="md" reopened={mState === "reopened" && log.status !== "draft"}
                initial={{ id: log.id, workDate: log.workDate, minutes: log.minutes, wp: log.workPackageId, out: log.outputId, act: log.activityId, sub: log.subactivityId, description: sourceText ?? "" }}
                initialRemaining={Math.max(0, project.dailyLimitMinutes - used)} />
            )}
            {mine && (log.status === "draft" || log.status === "changes_requested") && mState !== "closed" && <SubmitLogButton id={log.id} />}
            {reviewer && log.status === "in_review" && mState !== "closed" && <><ApproveButton ids={[log.id]} size="md" /><ReturnButton id={log.id} /></>}
            {reviewer && log.status !== "cancelled" && mState !== "closed" && <CancelButton id={log.id} />}
          </>
        }
      />
      {log.reviewNote && (log.status === "changes_requested" || log.status === "cancelled") && <Notice tone={log.status === "cancelled" ? "red" : "warn"} className="mb-6" title={log.status === "cancelled" ? t("work.cancelReason") : t("work.reviewNote")}>{log.reviewNote}</Notice>}
      {mState === "closed" && <Notice className="mb-6">{t("work.errClosed")}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title={t("work.description")} aside={<LangTag lang={log.sourceLang} />}>
            <p className="whitespace-pre-line">{sourceText}</p>
            <div className="mt-4 border-t border-line pt-3">
              <p className="label mb-1.5 flex items-center gap-2"><LangTag lang={otherLang} missing={!otherText} />{otherText ? t("work.translation") : t("common.translationPending")}</p>
              {otherText ? <p className="whitespace-pre-line text-ink-2">{otherText}</p> : <p className="text-[0.86rem] text-ink-3">{t("common.sourceShown")}</p>}
            </div>
          </Panel>
          <Panel title={t("work.evidence")}>
            <FileList files={f} t={t} />
            {(mine || can.coordinate(user)) && log.status !== "cancelled" && (
              <div className="no-print mt-5 border-t border-line pt-4">
                <p className="label mb-3">{t("work.addEvidencePair")}</p>
                <AddEvidenceForm id={log.id} />
              </div>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title={t("work.chain")}>
            <DefList items={[
              [t("common.workPackage"), <span key="w"><WpChip code={log.wpCode} /> <span className="ml-1">{pick(locale, log.wpTr, log.wpEn)}</span></span>],
              [t("common.output"), <span key="o"><span className="code">{log.outCode}</span> {pick(locale, log.outTr, log.outEn)}</span>],
              [t("common.activity"), <span key="a"><span className="code">{log.actCode}</span> {pick(locale, log.actTr, log.actEn)}</span>],
              [t("common.subactivity"), log.subCode ? <span key="s"><span className="code">{log.subCode}</span> {pick(locale, log.subTr, log.subEn)}</span> : <span key="s" className="text-ink-3">{t("work.noSub")}</span>],
              [t("common.date"), <span key="d" className="num">{fmtDate(locale, log.workDate)}</span>],
              [t("work.duration"), <span key="m" className="num">{fmtDuration(locale, log.minutes)}</span>],
            ]} />
            {log.outsidePlanWindow && <div className="mt-3"><OutsidePlanFlag t={t} /></div>}
          </Panel>
          <Panel title={t("work.history")}>
            <ol className="flex flex-col gap-2.5 text-[0.86rem]">
              {history.map((h, i) => (
                <li key={i} className="grid grid-cols-[8.2rem_1fr] gap-3">
                  <span className="num text-[0.76rem] text-ink-3">{fmtDateTime(locale, h.at)}</span>
                  <span><span className="font-medium">{t(`work.hist.${h.action}`)}</span> <span className="text-ink-2">· {h.who ?? h.email ?? "—"}</span>{h.reason && <span className="block text-ink-2">{h.reason}</span>}</span>
                </li>
              ))}
              <li className="grid grid-cols-[8.2rem_1fr] gap-3">
                <span className="num text-[0.76rem] text-ink-3">{fmtDateTime(locale, log.createdAt)}</span>
                <span><span className="font-medium">{t("work.hist.create")}</span> <span className="text-ink-2">· {log.personName}</span></span>
              </li>
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
