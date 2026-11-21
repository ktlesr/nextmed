import { ExternalLink, FileText, Trash2, Check, Undo2 } from "lucide-react";
import type { TFn, Locale } from "@/i18n";
import type { FileMeta } from "@/lib/files";
import type { followUps } from "@/db/schema";
import type { ChainOptions, Person } from "@/lib/structure";
import { fmtDate, isFallback, pick } from "@/lib/format";
import { todayInIstanbul } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Badge, LangTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, SubmitButton } from "@/components/ui/form";
import { EvidenceSlots } from "@/components/ui/evidence";
import { ActivitySelect } from "@/components/ui/chain-select";
import { Modal } from "@/components/ui/dialog";
import { ActionForm } from "./action-form";
import { addFollowUp, deleteFollowUp, deleteRecordFile, toggleFollowUp, uploadRecordFiles } from "./shared-actions";

/** Bilingual text in the interface language; when that side is missing the source is shown with a hint. */
export function BiText({ locale, t, tr, en, className, as: Tag = "p", empty = "—" }: { locale: Locale; t: TFn; tr?: string | null; en?: string | null; className?: string; as?: "p" | "span" | "div"; empty?: string }) {
  const text = pick(locale, tr, en);
  if (!text) return <Tag className={cn("text-ink-3", className)}>{empty}</Tag>;
  return (
    <Tag className={cn("whitespace-pre-line", className)}>
      {text}
      {isFallback(locale, tr, en) && <span className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 whitespace-nowrap text-[0.72rem] text-warn" title={t("common.sourceShown")}><LangTag lang={locale} missing />{t("common.translationPending")}</span>}
    </Tag>
  );
}

export function PeopleChecks({ people, name, defaults = [], className }: { people: Person[]; name: string; defaults?: string[]; className?: string }) {
  return (
    <div className={cn("scroll-thin grid max-h-44 gap-x-4 gap-y-1 overflow-y-auto rounded-sm border border-line-2 p-2.5 sm:grid-cols-2", className)}>
      {people.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-[0.88rem]">
          <input type="checkbox" name={name} value={p.id} defaultChecked={defaults.includes(p.id)} className="size-3.5 accent-[var(--cobalt)]" />
          <span className="truncate">{p.fullName}</span>
        </label>
      ))}
    </div>
  );
}

export function PersonSelect({ people, name, defaultValue, t, required }: { people: Person[]; name: string; defaultValue?: string | null; t: TFn; required?: boolean }) {
  return (
    <select name={name} className="control" defaultValue={defaultValue ?? ""} required={required}>
      <option value="">{t("common.none")}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
    </select>
  );
}

/** GET filter bar shared by meetings, procurements and travels: responsible, linked activity, status. */
export function RecordFilters({ t, people, options, statuses, statusLabel, current, hidden }: { t: TFn; people: Person[]; options: ChainOptions; statuses: readonly string[]; statusLabel: (s: string) => string; current: { resp?: string; act?: string; status?: string }; hidden?: Record<string, string> }) {
  return (
    <form method="get" className="no-print mb-4 flex flex-wrap items-end gap-3">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Field label={t("common.responsible")} className="w-48">
        <select name="resp" defaultValue={current.resp ?? ""} className="control"><option value="">{t("common.all")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select>
      </Field>
      <Field label={t("common.linkedActivity")} className="w-64">
        <select name="act" defaultValue={current.act ?? ""} className="control"><option value="">{t("common.all")}</option>{options.acts.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select>
      </Field>
      <Field label={t("common.status")} className="w-44">
        <select name="status" defaultValue={current.status ?? ""} className="control"><option value="">{t("common.all")}</option>{statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
      </Field>
      <Button type="submit" variant="secondary">{t("common.filter")}</Button>
    </form>
  );
}

/** Files of one record with delete buttons for editors. `kind` may carry a label after a colon (offer:Firm). */
export function FileRows({ files, t, canEdit, sourceType, sourceId, showMissing = true }: { files: FileMeta[]; t: TFn; canEdit: boolean; sourceType: string; sourceId: string; showMissing?: boolean }) {
  if (!files.length) return <p className="text-[0.85rem] text-ink-3">{t("common.noFiles")}</p>;
  const hasTr = files.some((f) => f.lang === "tr"), hasEn = files.some((f) => f.lang === "en");
  return (
    <ul className="flex flex-col">
      {files.map((f) => {
        const label = f.kind?.includes(":") ? f.kind.slice(f.kind.indexOf(":") + 1) : null;
        return (
          <li key={f.id} className="flex min-w-0 items-center gap-2 border-b border-line py-1.5 text-[0.87rem] last:border-b-0">
            <LangTag lang={f.lang} />
            <a href={f.externalUrl ?? `/api/files/${f.id}`} {...(f.externalUrl ? { target: "_blank", rel: "noreferrer noopener" } : {})} className="flex min-w-0 items-center gap-1.5 text-cobalt underline-offset-2 hover:underline">
              {f.externalUrl ? <ExternalLink className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
              <span className="truncate">{f.name}</span>
            </a>
            {label && <span className="shrink-0 text-[0.78rem] text-ink-2">· {label}</span>}
            {f.access !== "team" && <Badge tone="warn">{t(`common.access.${f.access}`)}</Badge>}
            {canEdit && (
              <ActionForm action={deleteRecordFile} quiet closeOnOk={false} confirm={t("ops.confirmDeleteFile")} className="ml-auto shrink-0">
                <input type="hidden" name="sourceType" value={sourceType} /><input type="hidden" name="sourceId" value={sourceId} /><input type="hidden" name="fileId" value={f.id} />
                <button className="rounded-sm p-1 text-ink-3 hover:bg-red-soft hover:text-red" aria-label={t("common.delete")} title={t("common.delete")}><Trash2 className="size-3.5" /></button>
              </ActionForm>
            )}
          </li>
        );
      })}
      {showMissing && hasTr && !hasEn && <li className="flex items-center gap-2 pt-1.5 text-[0.8rem] text-warn"><LangTag lang="en" missing />{t("common.missingEn")}</li>}
      {showMissing && hasEn && !hasTr && <li className="flex items-center gap-2 pt-1.5 text-[0.8rem] text-warn"><LangTag lang="tr" missing />{t("common.missingTr")}</li>}
    </ul>
  );
}

/** Modal with the two TR / EN upload slots for one document kind (or a kind select). */
export function UploadModal({ t, sourceType, sourceId, kind, kinds, kindLabel, trigger, title, people, labelField }: {
  t: TFn; sourceType: string; sourceId: string; kind?: string; kinds?: readonly string[]; kindLabel?: (k: string) => string; trigger?: React.ReactNode; title?: string; people?: Person[]; labelField?: string;
}) {
  return (
    <Modal trigger={trigger ?? t("ops.addFile")} triggerVariant="secondary" triggerSize="sm" title={title ?? t("ops.addFile")} wide>
      <ActionForm action={uploadRecordFiles} className="flex flex-col gap-4">
        <input type="hidden" name="sourceType" value={sourceType} /><input type="hidden" name="sourceId" value={sourceId} />
        {kind ? <input type="hidden" name="kind" value={kind} /> : (
          <Field label={t("ops.docKind")} required>
            <select name="kind" className="control" required>{(kinds ?? []).map((k) => <option key={k} value={k}>{kindLabel ? kindLabel(k) : k}</option>)}</select>
          </Field>
        )}
        {labelField && <Field label={labelField} hint={t("common.optional")}><input name="label" className="control" maxLength={80} /></Field>}
        {people && <Field label={t("ops.participantDoc")} hint={t("ops.participantDocHint")}><PersonSelect people={people} name="ownerPersonId" t={t} /></Field>}
        <EvidenceSlots t={t} links multiple labelTr={t("ops.fileTr")} labelEn={t("ops.fileEn")} />
        <div><SubmitButton>{t("common.upload")}</SubmitButton></div>
      </ActionForm>
    </Modal>
  );
}

type FollowUp = typeof followUps.$inferSelect;

/** Decisions and follow-up tasks of a meeting, travel or procurement file. */
export function FollowUps({ t, locale, sourceType, sourceId, items, canEdit, userPersonId, people, options, personName, actCode }: {
  t: TFn; locale: Locale; sourceType: string; sourceId: string; items: FollowUp[]; canEdit: boolean; userPersonId: string | null; people: Person[]; options: ChainOptions; personName: Map<string, string>; actCode: (id: string | null) => string | null;
}) {
  const today = todayInIstanbul();
  return (
    <div>
      {items.length === 0 ? <p className="text-[0.88rem] text-ink-3">{t("ops.noFollowUps")}</p> : (
        <ul className="flex flex-col">
          {items.map((f) => {
            const overdue = !f.done && !!f.dueDate && f.dueDate < today;
            const mayToggle = canEdit || (!!userPersonId && userPersonId === f.assigneeId);
            return (
              <li key={f.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
                {mayToggle ? (
                  <ActionForm action={toggleFollowUp} quiet closeOnOk={false}>
                    <input type="hidden" name="id" value={f.id} />
                    <button aria-label={f.done ? t("ops.reopen") : t("ops.markDone")} title={f.done ? t("ops.reopen") : t("ops.markDone")}
                      className={cn("mt-0.5 grid size-5 place-items-center rounded-xs border", f.done ? "border-ok bg-ok text-surface" : "border-line-2 text-transparent hover:border-ink hover:text-ink-3")}>
                      {f.done ? <Check className="size-3.5" /> : <Undo2 className="size-3" />}
                    </button>
                  </ActionForm>
                ) : <span className={cn("mt-0.5 grid size-5 place-items-center rounded-xs border", f.done ? "border-ok bg-ok text-surface" : "border-line-2")}>{f.done && <Check className="size-3.5" />}</span>}
                <div className="min-w-0 flex-1">
                  <BiText locale={locale} t={t} tr={f.textTr} en={f.textEn} className={cn("text-[0.92rem]", f.done && "text-ink-3 line-through")} />
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-ink-2">
                    <Badge tone={f.isDecision ? "cobalt" : "neutral"}>{f.isDecision ? t("ops.decision") : t("ops.task")}</Badge>
                    {f.assigneeId && <span>{personName.get(f.assigneeId)}</span>}
                    {actCode(f.activityId) && <span className="code">{actCode(f.activityId)}</span>}
                    {f.dueDate && <span className={cn("num", overdue && "font-medium text-red")}>{t("ops.due")} {fmtDate(locale, f.dueDate)}{overdue && ` · ${t("ops.overdue")}`}</span>}
                  </p>
                </div>
                {canEdit && (
                  <ActionForm action={deleteFollowUp} quiet closeOnOk={false} confirm={t("ops.confirmDelete")}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="rounded-sm p-1 text-ink-3 hover:bg-red-soft hover:text-red" aria-label={t("common.delete")}><Trash2 className="size-3.5" /></button>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <ActionForm action={addFollowUp} closeOnOk={false} resetOnOk className="mt-4 rounded-sm border border-dashed border-line-2 p-3">
          <input type="hidden" name="sourceType" value={sourceType} /><input type="hidden" name="sourceId" value={sourceId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("ops.followUpText")} required className="sm:col-span-2"><textarea name="text" required className="control min-h-16" placeholder={t("ops.followUpPlaceholder")} /></Field>
            <Field label={t("ops.assignee")}><PersonSelect people={people} name="assigneeId" t={t} /></Field>
            <Field label={t("ops.dueDate")}><input type="date" name="dueDate" className="control" /></Field>
            <Field label={t("common.linkedActivity")} className="sm:col-span-2"><ActivitySelect options={options} /></Field>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[0.88rem]"><input type="checkbox" name="isDecision" className="size-3.5 accent-[var(--cobalt)]" />{t("ops.isDecision")}</label>
            <SubmitButton size="sm" variant="secondary">{t("common.add")}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
