"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, Trash2, Undo2, Ban } from "lucide-react";
import { addEvidenceAction, deleteDraftAction, submitLogAction } from "@/app/app/work/actions";
import { reviewAction } from "@/app/app/review/actions";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { Modal, useModalClose } from "@/components/ui/dialog";
import { EvidenceSlots } from "@/components/ui/evidence";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

function useRefreshOnOk(state: ActionState, after?: () => void) {
  const router = useRouter();
  useEffect(() => { if (state?.ok) { after?.(); router.refresh(); } }, [state, router, after]);
}

export function SubmitLogButton({ id }: { id: string }) {
  const { t } = useT();
  const [state, action] = useActionState(submitLogAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="secondary"><Send className="size-3.5" />{t("work.sendToReview")}</SubmitButton>
      {state && !state.ok && <span className="text-[0.75rem] text-red">{state.error}</span>}
    </form>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const { t } = useT();
  const [state, action] = useActionState(deleteDraftAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(t("work.confirmDelete"))) e.preventDefault(); }} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost"><Trash2 className="size-3.5" /><span className="sr-only">{t("common.delete")}</span></SubmitButton>
      {state && !state.ok && <span className="text-[0.75rem] text-red">{state.error}</span>}
    </form>
  );
}

export function ApproveButton({ ids, label, size = "sm" }: { ids: string[]; label?: string; size?: "sm" | "md" }) {
  const { t } = useT();
  const [state, action] = useActionState(reviewAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="ids" value={ids.join(",")} />
      <input type="hidden" name="decision" value="approve" />
      <SubmitButton size={size}><Check className="size-3.5" />{label ?? t("work.approve")}</SubmitButton>
      {state && !state.ok && <span className="max-w-56 text-right text-[0.75rem] text-red">{state.error}</span>}
    </form>
  );
}

function ReasonForm({ ids, decision }: { ids: string[]; decision: "return" | "cancel" }) {
  const { t } = useT();
  const close = useModalClose();
  const [state, action] = useActionState(reviewAction, null);
  useRefreshOnOk(state, close);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="ids" value={ids.join(",")} />
      <input type="hidden" name="decision" value={decision} />
      <Field label={t("common.reason")} required hint={decision === "return" ? t("work.returnHint") : t("work.cancelHint")}>
        <textarea name="reason" required rows={4} className="control" autoFocus />
      </Field>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton variant={decision === "cancel" ? "danger" : "primary"}>{decision === "return" ? t("work.returnBtn") : t("work.cancelBtn")}</SubmitButton>
      </div>
    </form>
  );
}

export function ReturnButton({ id }: { id: string }) {
  const { t } = useT();
  return (
    <Modal trigger={<><Undo2 className="size-3.5" />{t("work.returnBtn")}</>} triggerVariant="secondary" triggerSize="sm" title={t("work.returnTitle")} description={t("work.returnHint")}>
      <ReasonForm ids={[id]} decision="return" />
    </Modal>
  );
}
export function CancelButton({ id }: { id: string }) {
  const { t } = useT();
  return (
    <Modal trigger={<><Ban className="size-3.5" />{t("work.cancelBtn")}</>} triggerVariant="danger" triggerSize="sm" title={t("work.cancelTitle")} description={t("work.cancelHint")}>
      <ReasonForm ids={[id]} decision="cancel" />
    </Modal>
  );
}

export function AddEvidenceForm({ id }: { id: string }) {
  const { t } = useT();
  const [state, action] = useActionState(addEvidenceAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <EvidenceSlots t={t} links multiple />
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary" size="sm">{t("work.addEvidence")}</SubmitButton></div>
    </form>
  );
}
