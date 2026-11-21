"use client";
import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { captureBaseline, deleteReferenceHours, saveDefaultReference, saveDuration, saveReferenceHours, saveReportingRate, saveStartDate } from "@/app/app/admin/settings/actions";
import { useT } from "@/i18n/client";
import { projectEnd, projectMonthWindow } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function StartDateForm({ current, duration, affects }: { current: string | null; duration: number; affects: { subs: number; asg: number; hp: number } }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(saveStartDate, null);
  const [date, setDate] = useState(current ?? "");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const sample = [...new Set([1, 2, 5, 12, 24, duration])].filter((m) => m <= duration);
  const changing = !!current && valid && date !== current;
  return (
    <form action={action} className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-4">
        <Field label={t("gantt.startDate")} required><input type="date" name="startDate" required className="control h-11" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {changing && <Field label={t("common.reason")} required><input name="reason" required className="control" /></Field>}
        <FormMessage state={state} />
        <div><SubmitButton disabled={!valid || (!!current && !changing)}>{current ? t("gantt.startUpdate") : t("gantt.startSave")}</SubmitButton></div>
      </div>
      <div>
        <p className="label mb-2">{t("gantt.startPreview")}</p>
        {valid ? (
          <>
            <table className="tbl"><tbody>
              {sample.map((m) => { const w = projectMonthWindow(date, m); return <tr key={m}><td className="num w-20 font-medium">{t("common.monthN", { n: m })}</td><td className="num">{fmtDate(locale, w.start)}–{fmtDate(locale, w.end)}</td></tr>; })}
              <tr><td className="label">{t("gantt.startEnd")}</td><td className="num font-medium text-cobalt">{fmtDate(locale, projectEnd(date, duration))}</td></tr>
            </tbody></table>
            <p className="mt-3 text-[0.84rem] text-ink-2">{t("gantt.startAffects", affects)}</p>
            {current && <p className="mt-1 text-[0.84rem] text-ink-3">{t("gantt.startChangeNote")}</p>}
          </>
        ) : <p className="text-[0.88rem] text-ink-3">{t("common.awaitingStart")}</p>}
      </div>
    </form>
  );
}

export function BaselineForm({ hasBaseline, hasStart }: { hasBaseline: boolean; hasStart: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(captureBaseline, null);
  if (!hasStart) return <p className="text-[0.88rem] text-ink-3">{t("gantt.baseNeedStart")}</p>;
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      {hasBaseline && <><p className="text-[0.86rem] text-ink-2">{t("gantt.baseNewHint")}</p><Field label={t("common.reason")} required><input name="reason" required className="control" /></Field></>}
      <FormMessage state={state} />
      <div><SubmitButton variant={hasBaseline ? "secondary" : "primary"}>{hasBaseline ? t("gantt.baseNew") : t("gantt.baseCapture")}</SubmitButton></div>
    </form>
  );
}

export function DurationForm({ duration }: { duration: number }) {
  const { t } = useT();
  const [state, action] = useActionState(saveDuration, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label={t("gantt.durMonths")}><input name="durationMonths" type="number" min={1} max={120} defaultValue={duration} className="control num" /></Field>
        <Field label={t("common.reason")} hint={t("gantt.durHint")}><input name="reason" className="control" /></Field>
      </div>
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{t("common.save")}</SubmitButton></div>
    </form>
  );
}

export function DefaultReferenceForm({ hours }: { hours: string }) {
  const { t } = useT();
  const [state, action] = useActionState(saveDefaultReference, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t("gantt.refDefault")} hint={t("gantt.refDefaultHint")}><input name="hours" inputMode="decimal" defaultValue={Number(hours)} className="control num max-w-32" /></Field>
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{t("common.save")}</SubmitButton></div>
    </form>
  );
}

export function ReferenceHoursForm({ people }: { people: { id: string; name: string }[] }) {
  const { t } = useT();
  const [state, action] = useActionState(saveReferenceHours, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_7rem_auto] sm:items-end">
        <Field label={t("common.person")}><select name="personId" className="control"><option value="">{t("gantt.refEveryone")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label={t("common.month")} required><input type="month" name="ym" required className="control num" /></Field>
        <Field label={t("gantt.refHours")} required><input name="hours" inputMode="decimal" required className="control num" /></Field>
        <SubmitButton variant="secondary">{t("gantt.refAdd")}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteReferenceButton({ id }: { id: number }) {
  const { t } = useT();
  const [, action] = useActionState(deleteReferenceHours, null);
  return <form action={action}><input type="hidden" name="id" value={id} /><SubmitButton variant="ghost" size="sm"><Trash2 className="size-4" /><span className="sr-only">{t("common.delete")}</span></SubmitButton></form>;
}

export function ReportingRateForm({ rate }: { rate: number | null }) {
  const { t } = useT();
  const [state, action] = useActionState(saveReportingRate, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t("gantt.rateReport")} hint={t("gantt.rateHint")}><input name="rate" inputMode="decimal" defaultValue={rate ?? ""} className="control num max-w-32" /></Field>
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{t("common.save")}</SubmitButton></div>
    </form>
  );
}
