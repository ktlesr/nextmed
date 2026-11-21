"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { closeMonthAction, reopenMonthAction } from "@/app/app/admin/workload/actions";
import { useT } from "@/i18n/client";
import { Modal, useModalClose } from "@/components/ui/dialog";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

function CloseForm({ ym, warn }: { ym: string; warn?: string | null }) {
  const { t } = useT();
  const close = useModalClose();
  const router = useRouter();
  const [state, action] = useActionState(closeMonthAction, null);
  useEffect(() => { if (state?.ok) { close(); router.refresh(); } }, [state, close, router]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="ym" value={ym} />
      <p className="text-[0.92rem] text-ink-2">{t("work.closeExplain")}</p>
      {warn && <p className="border-l-2 border-warn pl-3 text-[0.88rem] text-warn">{warn}</p>}
      <FormMessage state={state} />
      <div><SubmitButton><Lock className="size-4" />{t("work.closeMonth")}</SubmitButton></div>
    </form>
  );
}
function ReopenForm({ ym }: { ym: string }) {
  const { t } = useT();
  const close = useModalClose();
  const router = useRouter();
  const [state, action] = useActionState(reopenMonthAction, null);
  useEffect(() => { if (state?.ok) { close(); router.refresh(); } }, [state, close, router]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="ym" value={ym} />
      <p className="text-[0.92rem] text-ink-2">{t("work.reopenExplain")}</p>
      <Field label={t("common.reason")} required><textarea name="reason" required rows={3} className="control" autoFocus /></Field>
      <FormMessage state={state} />
      <div><SubmitButton><LockOpen className="size-4" />{t("work.reopenMonth")}</SubmitButton></div>
    </form>
  );
}

export function ClosureControls({ ym, state, warn }: { ym: string; state: "open" | "closed" | "reopened"; warn?: string | null }) {
  const { t } = useT();
  return state === "closed" ? (
    <Modal trigger={<><LockOpen className="size-4" />{t("work.reopenMonth")}</>} triggerVariant="secondary" title={t("work.reopenMonth")}><ReopenForm ym={ym} /></Modal>
  ) : (
    <Modal trigger={<><Lock className="size-4" />{t("work.closeMonth")}</>} triggerVariant="secondary" title={t("work.closeMonth")}><CloseForm ym={ym} warn={warn} /></Modal>
  );
}
