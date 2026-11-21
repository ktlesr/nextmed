"use client";
import { useActionState } from "react";
import { RotateCw } from "lucide-react";
import { useT } from "@/i18n/client";
import { approveTranslation, retryTranslation, runPending } from "@/app/app/admin/translations/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { LangTag } from "@/components/ui/badge";

/** Source and translation side by side; the admin corrects and approves, or retries the machine. */
export function TranslationEditor({ job, canRetry }: { job: { id: number; sourceLang: "tr" | "en"; sourceText: string; targetText: string | null; status: string; sourceRevision: number; error: string | null }; canRetry: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(approveTranslation, null);
  const [retryState, retry] = useActionState(retryTranslation, null);
  const target = job.sourceLang === "tr" ? "en" : "tr";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0">
        <p className="label mb-1.5 flex items-center gap-2"><LangTag lang={job.sourceLang} />{t("admin.trSource")} <span className="num normal-case tracking-normal">r{job.sourceRevision}</span></p>
        <p className="whitespace-pre-wrap rounded-sm border border-dashed border-line-2 bg-surface-2 px-3 py-2 text-[0.9rem]">{job.sourceText}</p>
      </div>
      <div className="min-w-0">
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="revision" value={job.sourceRevision} />
          <p className="label flex items-center gap-2"><LangTag lang={target} missing={!job.targetText} />{t("admin.trTarget")}</p>
          <textarea name="targetText" required defaultValue={job.targetText ?? ""} lang={target} placeholder={t("admin.trTargetPlaceholder")} className="control min-h-20" />
          {job.error && job.status === "failed" && <p className="num text-[0.76rem] text-red">{job.error}</p>}
          <FormMessage state={state} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SubmitButton size="sm">{job.status === "reviewed" ? t("common.save") : t("admin.trApprove")}</SubmitButton>
          </div>
        </form>
        {canRetry && job.status !== "reviewed" && (
          <form action={retry} className="mt-2 flex flex-col items-end gap-2">
            <input type="hidden" name="id" value={job.id} />
            <SubmitButton variant="ghost" size="sm"><RotateCw className="size-3.5" />{t("admin.trRetry")}</SubmitButton>
            <FormMessage state={retryState} className="self-stretch" />
          </form>
        )}
      </div>
    </div>
  );
}

export function RunPendingButton({ disabled }: { disabled: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(runPending, null);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <SubmitButton disabled={disabled}><RotateCw className="size-4" />{t("admin.trRunPending")}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
