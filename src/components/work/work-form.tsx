"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { dayInfoAction, saveWorkLogAction } from "@/app/app/work/actions";
import { useT } from "@/i18n/client";
import { fmtDuration } from "@/lib/format";
import type { ChainOptions } from "@/lib/structure";
import { ChainSelect } from "@/components/ui/chain-select";
import { Modal, useModalClose } from "@/components/ui/dialog";
import { EvidenceSlots } from "@/components/ui/evidence";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/layout";

export type WorkFormInitial = { id?: string; workDate: string; minutes?: number; wp?: string; out?: string; act?: string; sub?: string | null; description?: string; sourceLang?: "tr" | "en"; status?: string };
type Props = { options: ChainOptions; assignedSubIds: string[]; today: string; minDate: string | null; initial: WorkFormInitial; initialRemaining: number; limit: number; step: number; reopened?: boolean };

function FormBody({ options, assignedSubIds, today, minDate, initial, initialRemaining, limit, step, reopened }: Props) {
  const { t, locale } = useT();
  const router = useRouter();
  const close = useModalClose();
  const [state, action] = useActionState(saveWorkLogAction, null);
  const [date, setDate] = useState(initial.workDate);
  const [info, setInfo] = useState<{ remaining: number; state: string }>({ remaining: initialRemaining, state: "ok" });
  const [minutes, setMinutes] = useState(String(initial.minutes ?? ""));
  const [loading, start] = useTransition();

  useEffect(() => {
    if (state?.ok) { close(); router.refresh(); }
  }, [state, close, router]);

  const onDate = (d: string) => {
    setDate(d);
    if (!d) return;
    start(async () => {
      const r = await dayInfoAction(d, initial.id ?? null);
      setInfo(r);
      if (Number(minutes) > r.remaining) setMinutes("");
    });
  };
  const durations: number[] = [];
  for (let m = step; m <= Math.min(limit, info.remaining); m += step) durations.push(m);
  const blocked = info.state !== "ok" || durations.length === 0;
  const blockMsg = info.state === "closed" ? t("work.errClosed") : info.state === "future" ? t("work.errFuture") : info.state === "outside" ? t("work.errOutsideProject") : info.state === "no_start" ? t("work.needStart") : info.state === "ok" && durations.length === 0 ? t("work.errDayFull") : null;

  return (
    <form action={action} className="flex flex-col gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {reopened && initial.id && <Notice tone="warn">{t("work.reopenedEditNote")}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.date")} required error={state?.fieldErrors?.workDate}>
          <input type="date" name="workDate" required className="control" value={date} max={today} min={minDate ?? undefined} onChange={(e) => onDate(e.target.value)} />
        </Field>
        <Field label={t("work.duration")} required error={state?.fieldErrors?.minutes}
          hint={loading ? t("common.loading") : blockMsg ? <span className="text-red">{blockMsg}</span> : t("work.remainingHint", { d: fmtDuration(locale, info.remaining), limit: fmtDuration(locale, limit) })}>
          <select name="minutes" required className="control num" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={blocked || loading}>
            <option value="">{t("common.select")}</option>
            {durations.map((m) => <option key={m} value={m}>{fmtDuration(locale, m)}</option>)}
          </select>
        </Field>
      </div>
      <ChainSelect options={options} assignedSubIds={assignedSubIds} defaults={{ wp: initial.wp, out: initial.out, act: initial.act, sub: initial.sub }} errors={state?.fieldErrors} />
      <Field label={t("work.description")} required hint={t("work.descriptionHint")} error={state?.fieldErrors?.description}>
        <textarea name="description" required className="control" rows={4} defaultValue={initial.description ?? ""} maxLength={4000} />
      </Field>
      <Field label={t("work.sourceLang")} hint={t("work.sourceLangHint")} className="max-w-xs">
        <select name="sourceLang" className="control" defaultValue="">
          <option value="">{t("work.detectAuto")}</option>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </Field>
      <div>
        <p className="label mb-2">{t("work.evidence")} · {t("common.optional")}</p>
        <EvidenceSlots t={t} links multiple />
      </div>
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <SubmitButton name="intent" value="submit" disabled={blocked}>{t("work.sendToReview")}</SubmitButton>
        {!reopened && <SubmitButton name="intent" value="draft" variant="secondary" disabled={blocked}>{t("common.saveDraft")}</SubmitButton>}
        <button type="button" onClick={close} className="ml-auto px-2 text-[0.88rem] text-ink-2 hover:text-ink">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

export function WorkLogButton(props: Props & { disabledReason?: string | null; size?: "sm" | "md" }) {
  const { t } = useT();
  const edit = !!props.initial.id;
  if (props.disabledReason) return <span className="text-[0.85rem] text-ink-3">{props.disabledReason}</span>;
  return (
    <Modal side trigger={edit ? <><Pencil className="size-3.5" />{t("common.edit")}</> : <><Plus className="size-4" />{t("work.new")}</>} triggerVariant={edit ? "secondary" : "primary"} triggerSize={props.size ?? (edit ? "sm" : "md")}
      title={edit ? t("work.editTitle") : t("work.newTitle")} description={t("work.formLede")}>
      <FormBody {...props} />
    </Modal>
  );
}
