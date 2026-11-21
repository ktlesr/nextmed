"use client";
import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action";
import { useModalClose } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";

/**
 * Wraps server-rendered fields in a form bound to a server action. Closes the surrounding Modal and/or
 * resets on success. `confirm` asks before submitting (deletes).
 */
export function ActionForm({ action, children, className, closeOnOk = true, resetOnOk, confirm, quiet }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>; children: React.ReactNode; className?: string; closeOnOk?: boolean; resetOnOk?: boolean; confirm?: string; quiet?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const close = useModalClose();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnOk) ref.current?.reset();
    if (closeOnOk) close();
  }, [state, close, closeOnOk, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className} onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {children}
      {(!quiet || (state && !state.ok)) && <FormMessage state={state} className="mt-3" />}
    </form>
  );
}
