"use client";
import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function PasswordForm() {
  const { t } = useT();
  const [state, action] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <Field label={t("admin.pwCurrent")} required><input type="password" name="current" required autoComplete="current-password" className="control" /></Field>
      <Field label={t("admin.pwNew")} required hint={t("admin.pwHint")}><input type="password" name="next" required minLength={10} autoComplete="new-password" className="control" /></Field>
      <Field label={t("admin.pwAgain")} required><input type="password" name="again" required minLength={10} autoComplete="new-password" className="control" /></Field>
      <FormMessage state={state} />
      <div><SubmitButton>{t("common.save")}</SubmitButton></div>
    </form>
  );
}
