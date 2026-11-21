"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetSpec } from "@/db/schema";
import { useT } from "@/i18n/client";
import type { ChainOptions } from "@/lib/structure";
import { KINDS, OBS_STATUSES, QUALIFIERS, UNITS } from "@/lib/adminOutputConst";
import type { ConcreteOutput } from "@/lib/adminOutputs";
import { addObservation, deleteObservation, saveTarget } from "@/app/app/outputs/actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { EvidenceSlots } from "@/components/ui/evidence";
import { ActivitySelect } from "@/components/ui/chain-select";
import { useModalClose } from "@/components/ui/dialog";

/** New actual for one target. Numeric targets take value + unit; contributions take a status and short result. */
export function ObservationForm({ output, today }: { output: Pick<ConcreteOutput, "id" | "projectTarget" | "zaferObligation">; today: string }) {
  const { t, locale } = useT();
  const close = useModalClose();
  const router = useRouter();
  const [state, action] = useActionState(addObservation, null);
  const [scope, setScope] = useState<"project" | "zafer">("zafer");
  const spec = scope === "project" ? output.projectTarget : output.zaferObligation;
  const numeric = spec.value != null || spec.kind === "coverage" || (spec.kind !== "contribution" && spec.kind !== "not_specified");
  const unit = spec.unit ?? output.projectTarget.unit ?? "";
  useEffect(() => { if (state?.ok) { router.refresh(); close(); } }, [state, close, router]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="concreteOutputId" value={output.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("outputs.scope")} required>
          <select name="scope" className="control" value={scope} onChange={(e) => setScope(e.target.value as "project" | "zafer")}>
            <option value="zafer">{t("outputs.scopeZafer")}</option>
            <option value="project">{t("outputs.scopeProject")}</option>
          </select>
        </Field>
        <Field label={t("common.date")} required error={state?.fieldErrors?.observedOn}>
          <input type="date" name="observedOn" required defaultValue={today} max={today} className="control" />
        </Field>
      </div>
      <p className="rounded-sm bg-surface-2 px-3 py-2 text-[0.86rem] text-ink-2"><span className="label mr-2">{t("outputs.target")}</span>{locale === "en" ? spec.display_en : spec.display_tr}</p>
      {numeric ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("outputs.value")} error={state?.fieldErrors?.value} hint={t("outputs.valueHint")}>
            <input name="value" inputMode="decimal" className="control num" placeholder="0" />
          </Field>
          <Field label={t("outputs.unit")}>
            <select name="unit" className="control" defaultValue={unit} key={unit}>
              {!unit && <option value="">{t("common.none")}</option>}
              {UNITS.map((u) => <option key={u} value={u}>{t(`outputs.u.${u}`)}</option>)}
            </select>
          </Field>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.status")} hint={numeric ? t("common.optional") : t("outputs.statusHint")}>
          <select name="status" className="control" defaultValue="">
            <option value="">{t("common.none")}</option>
            {OBS_STATUSES.map((s) => <option key={s} value={s}>{t(`outputs.os.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t("outputs.dedupeKey")} hint={t("outputs.dedupeHint")}>
          <input name="dedupeKey" className="control num text-[0.87rem]" placeholder={t("outputs.dedupePlaceholder")} maxLength={120} />
        </Field>
      </div>
      <Field label={t("outputs.note")} hint={t("outputs.noteHint")}>
        <textarea name="note" className="control" maxLength={2000} />
      </Field>
      <EvidenceSlots t={t} links />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <SubmitButton>{t("outputs.saveObservation")}</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteObservationForm({ id }: { id: string }) {
  const { t } = useT();
  const close = useModalClose();
  const router = useRouter();
  const [state, action] = useActionState(deleteObservation, null);
  useEffect(() => { if (state?.ok) { router.refresh(); close(); } }, [state, close, router]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-[0.9rem] text-ink-2">{t("outputs.deleteObservationBody")}</p>
      <Field label={t("common.reason")} required><textarea name="reason" required className="control" /></Field>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton variant="danger">{t("common.delete")}</SubmitButton></div>
    </form>
  );
}

function SpecFields({ prefix, legend, spec }: { prefix: "project" | "zafer"; legend: string; spec?: TargetSpec }) {
  const { t } = useT();
  const [kind, setKind] = useState<TargetSpec["kind"]>(spec?.kind ?? "numeric");
  const numeric = kind === "numeric" || kind === "conditional";
  const hasUnit = kind !== "contribution" && kind !== "not_specified";
  return (
    <fieldset className="rounded-sm border border-line p-3.5">
      <legend className="label px-1.5">{legend}</legend>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label={`${t("outputs.display")} · TR`} required><textarea name={`${prefix}DisplayTr`} defaultValue={spec?.display_tr} className="control min-h-16" /></Field>
        <Field label={`${t("outputs.display")} · EN`}><textarea name={`${prefix}DisplayEn`} defaultValue={spec?.display_en} className="control min-h-16" /></Field>
      </div>
      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-4">
        <Field label={t("outputs.kind")}>
          <select name={`${prefix}Kind`} className="control" value={kind} onChange={(e) => setKind(e.target.value as TargetSpec["kind"])}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`outputs.k.${k}`)}</option>)}
          </select>
        </Field>
        <Field label={t("outputs.value")}><input name={`${prefix}Value`} inputMode="decimal" disabled={!numeric} defaultValue={spec?.value ?? ""} className="control num" /></Field>
        <Field label={t("outputs.unit")}>
          <select name={`${prefix}Unit`} className="control" disabled={!hasUnit} defaultValue={spec?.unit ?? ""}>
            <option value="">{t("common.none")}</option>
            {UNITS.map((u) => <option key={u} value={u}>{t(`outputs.u.${u}`)}</option>)}
          </select>
        </Field>
        <Field label={t("outputs.qualifier")}>
          <select name={`${prefix}Qualifier`} className="control" disabled={!numeric} defaultValue={spec?.qualifier ?? "exact"}>
            {QUALIFIERS.map((q) => <option key={q} value={q}>{t(`outputs.q.${q}`)}</option>)}
          </select>
        </Field>
      </div>
    </fieldset>
  );
}

/** Admin: add or edit a target. Every edit pushes the previous values into the version history. */
export function TargetForm({ output, options }: { output?: ConcreteOutput; options: ChainOptions }) {
  const { t } = useT();
  const close = useModalClose();
  const router = useRouter();
  const [state, action] = useActionState(saveTarget, null);
  useEffect(() => {
    if (!state?.ok) return;
    if (!output && state.data?.id) router.push(`/app/outputs/${state.data.id}`); else router.refresh();
    close();
  }, [state, close, router, output]);
  return (
    <form action={action} className="flex flex-col gap-4">
      {output && <input type="hidden" name="id" value={output.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("outputs.colName")} · TR`} required error={state?.fieldErrors?.nameTr}><textarea name="nameTr" defaultValue={output?.nameTr ?? ""} className="control min-h-16" /></Field>
        <Field label={`${t("outputs.colName")} · EN`}><textarea name="nameEn" defaultValue={output?.nameEn ?? ""} className="control min-h-16" /></Field>
      </div>
      <SpecFields prefix="project" legend={t("outputs.colProject")} spec={output?.projectTarget} />
      <SpecFields prefix="zafer" legend={t("outputs.colZafer")} spec={output?.zaferObligation} />
      <fieldset>
        <legend className="label mb-1.5">{t("outputs.workPackages")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {options.wps.map((w) => (
            <label key={w.id} className="flex items-center gap-1.5 text-[0.88rem]"><input type="checkbox" name="workPackageIds" value={w.id} defaultChecked={output?.workPackageIds.includes(w.id)} className="accent-[var(--cobalt)]" /><span className="num">{w.code}</span></label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label={t("common.linkedActivity")} hint={t("common.optional")}><ActivitySelect options={options} defaultValue={output?.activityId} /></Field>
        <Field label={t("outputs.indicator")} hint="RCO84, RCR104 …"><input name="programmeIndicator" defaultValue={output?.programmeIndicator ?? ""} className="control num" maxLength={12} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("outputs.sourcePages")} hint={t("outputs.sourcePagesHint")}><input name="pages" defaultValue={(output?.sources?.application_form_pages ?? []).join(", ")} className="control num" /></Field>
        <Field label={t("outputs.sourceMatrix")} hint={t("outputs.sourceMatrixHint")}><input name="matrix" defaultValue={(output?.sources?.zafer_matrix_subactivities ?? []).join(", ")} className="control num" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("outputs.countingNote")} · TR`}><textarea name="countingNoteTr" defaultValue={output?.countingNoteTr ?? ""} className="control min-h-16" /></Field>
        <Field label={`${t("outputs.countingNote")} · EN`}><textarea name="countingNoteEn" defaultValue={output?.countingNoteEn ?? ""} className="control min-h-16" /></Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem]">
        <label className="flex items-center gap-2"><input type="checkbox" name="priority" defaultChecked={output?.priority} className="accent-[var(--cobalt)]" />{t("outputs.priorityLabel")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="active" value="on" defaultChecked={output ? output.active : true} className="accent-[var(--cobalt)]" />{t("outputs.activeLabel")}</label>
      </div>
      {output && <Field label={t("common.reason")} hint={t("common.optional")}><input name="reason" className="control" maxLength={300} /></Field>}
      <FormMessage state={state} />
      <div className="flex justify-end border-t border-line pt-4"><SubmitButton>{t("common.save")}</SubmitButton></div>
    </form>
  );
}
