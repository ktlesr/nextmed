import type { TFn, Locale } from "@/i18n";
import type { travels } from "@/db/schema";
import type { ChainOptions, Person } from "@/lib/structure";
import { pick } from "@/lib/format";
import { Field, SubmitButton } from "@/components/ui/form";
import { ActivitySelect } from "@/components/ui/chain-select";
import { ActionForm } from "./action-form";
import { PeopleChecks, PersonSelect } from "./parts";
import { saveTravel } from "@/app/app/travels/actions";

type Travel = typeof travels.$inferSelect;

export function TravelForm({ t, locale, row, people, options, defaultResponsible }: { t: TFn; locale: Locale; row?: Travel; people: Person[]; options: ChainOptions; defaultResponsible?: string | null }) {
  return (
    <ActionForm action={saveTravel} className="flex flex-col gap-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("ops.purpose")} required hint={t("ops.bilingualHint")} className="sm:col-span-2"><textarea name="purpose" required className="control min-h-16" defaultValue={row ? pick(locale, row.purposeTr, row.purposeEn) : ""} /></Field>
        <Field label={t("common.place")}><input name="place" className="control" defaultValue={row?.place ?? ""} /></Field>
        <Field label={t("common.status")}>
          <select name="status" className="control" defaultValue={row?.status ?? "planned"}>{["planned", "completed", "cancelled"].map((s) => <option key={s} value={s}>{t(`ops.tst.${s}`)}</option>)}</select>
        </Field>
        <Field label={t("ops.departDate")} required><input type="date" name="departDate" required className="control" defaultValue={row?.departDate ?? ""} /></Field>
        <Field label={t("ops.returnDate")} required><input type="date" name="returnDate" required className="control" defaultValue={row?.returnDate ?? ""} /></Field>
        <Field label={t("common.responsible")} className="sm:col-span-2"><PersonSelect people={people} name="responsibleId" t={t} defaultValue={row?.responsibleId ?? defaultResponsible} /></Field>
        <Field label={t("common.participants")} className="sm:col-span-2"><PeopleChecks people={people} name="participantIds" defaults={row?.participantIds ?? []} /></Field>
        <Field label={t("common.linkedActivity")} hint={t("common.optional")} className="sm:col-span-2"><ActivitySelect options={options} defaultValue={row?.activityId} /></Field>
      </div>
      <div><SubmitButton>{t("common.save")}</SubmitButton></div>
    </ActionForm>
  );
}
