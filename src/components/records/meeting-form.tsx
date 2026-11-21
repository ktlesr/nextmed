import type { TFn, Locale } from "@/i18n";
import type { meetings, travels } from "@/db/schema";
import type { ChainOptions, Person } from "@/lib/structure";
import { TIME_ZONES, utcToZonedInput } from "@/lib/records";
import { fmtDate, pick } from "@/lib/format";
import { Field, SubmitButton } from "@/components/ui/form";
import { ActivitySelect } from "@/components/ui/chain-select";
import { ActionForm } from "./action-form";
import { PeopleChecks, PersonSelect } from "./parts";
import { saveMeeting } from "@/app/app/meetings/actions";

type Meeting = typeof meetings.$inferSelect;
type Travel = typeof travels.$inferSelect;

export function MeetingForm({ t, locale, meeting, kind, people, options, travels, defaultResponsible }: { t: TFn; locale: Locale; meeting?: Meeting; kind?: "internal" | "stakeholder"; people: Person[]; options: ChainOptions; travels: Travel[]; defaultResponsible?: string | null }) {
  const tz = meeting?.timeZone ?? "Europe/Istanbul";
  return (
    <ActionForm action={saveMeeting} className="flex flex-col gap-4">
      {meeting && <input type="hidden" name="id" value={meeting.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("ops.meetingKind")} required>
          <select name="kind" className="control" defaultValue={meeting?.kind ?? kind ?? "internal"}>
            <option value="internal">{t("ops.kind.internal")}</option>
            <option value="stakeholder">{t("ops.kind.stakeholder")}</option>
          </select>
        </Field>
        <Field label={t("common.status")}>
          <select name="status" className="control" defaultValue={meeting?.status ?? "planned"}>
            {["planned", "held", "cancelled"].map((s) => <option key={s} value={s}>{t(`ops.mst.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t("common.title")} required hint={t("ops.bilingualHint")} className="sm:col-span-2">
          <input name="title" required className="control" defaultValue={meeting ? pick(locale, meeting.titleTr, meeting.titleEn) : ""} />
        </Field>
        <Field label={t("ops.startsAt")} required>
          <input type="datetime-local" name="startsAt" required className="control" defaultValue={meeting ? utcToZonedInput(meeting.startsAt, tz) : ""} />
        </Field>
        <Field label={t("ops.timeZone")} hint={t("ops.timeZoneHint")}>
          <select name="timeZone" className="control" defaultValue={tz}>{TIME_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}</select>
        </Field>
        <Field label={t("ops.duration")}>
          <input type="number" name="durationMinutes" min={15} max={1440} step={15} className="control num" defaultValue={meeting?.durationMinutes ?? 60} />
        </Field>
        <Field label={t("common.responsible")}><PersonSelect people={people} name="responsibleId" t={t} defaultValue={meeting?.responsibleId ?? defaultResponsible} /></Field>
        <Field label={t("common.place")}><input name="location" className="control" defaultValue={meeting?.location ?? ""} /></Field>
        <Field label={t("ops.onlineUrl")}><input type="url" name="onlineUrl" className="control" placeholder="https://" defaultValue={meeting?.onlineUrl ?? ""} /></Field>
        <Field label={t("ops.agenda")} className="sm:col-span-2"><textarea name="agenda" className="control" defaultValue={meeting ? pick(locale, meeting.agendaTr, meeting.agendaEn) : ""} /></Field>
        <Field label={t("common.description")} className="sm:col-span-2"><textarea name="description" className="control min-h-16" defaultValue={meeting ? pick(locale, meeting.descriptionTr, meeting.descriptionEn) : ""} /></Field>
        <Field label={t("common.participants")} className="sm:col-span-2"><PeopleChecks people={people} name="participantIds" defaults={meeting?.participantIds ?? []} /></Field>
        <Field label={t("ops.externalParticipants")} hint={t("ops.externalHint")} className="sm:col-span-2"><textarea name="externalParticipants" className="control min-h-14" defaultValue={meeting?.externalParticipants ?? ""} /></Field>
        <Field label={t("common.linkedActivity")} hint={t("common.optional")} className="sm:col-span-2"><ActivitySelect options={options} defaultValue={meeting?.activityId} /></Field>
        <Field label={t("ops.relatedTravel")} hint={t("common.optional")} className="sm:col-span-2">
          <select name="travelId" className="control" defaultValue={meeting?.travelId ?? ""}>
            <option value="">{t("common.none")}</option>
            {travels.map((tr) => <option key={tr.id} value={tr.id}>{fmtDate(locale, tr.departDate)} · {tr.place ?? ""} · {pick(locale, tr.purposeTr, tr.purposeEn).slice(0, 60)}</option>)}
          </select>
        </Field>
      </div>
      <div><SubmitButton>{t("common.save")}</SubmitButton></div>
    </ActionForm>
  );
}
