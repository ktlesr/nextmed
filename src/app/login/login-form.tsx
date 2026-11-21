"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export function LoginForm() {
  const { t } = useT();
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <Field label={t("landing.email")} required>
        <input name="email" type="email" autoComplete="username" required autoFocus className="control h-11" placeholder="ad.soyad@zafer.gov.tr" />
      </Field>
      <Field label={t("landing.password")} required>
        <input name="password" type="password" autoComplete="current-password" required className="control h-11" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 w-full">{t("landing.loginBtn")}</SubmitButton>
    </form>
  );
}
