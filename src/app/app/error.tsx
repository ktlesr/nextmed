"use client";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, locale } = useT();
  return (
    <EmptyState title={t("common.error")} action={<Button onClick={reset}>{locale === "tr" ? "Yeniden dene" : "Try again"}</Button>}>
      {locale === "tr" ? "Beklenmeyen bir hata oluştu. Sorun sürerse portal yöneticisine haber verin." : "Something unexpected happened. If it persists, let the portal administrator know."}
      {error.digest && <span className="num mt-2 block text-[0.75rem] text-ink-3">ref: {error.digest}</span>}
    </EmptyState>
  );
}
