"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { setLocale } from "@/app/actions";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

/** Day / night. Stored in a cookie so the server renders the right theme on the next request. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useT();
  const flip = () => {
    const d = document.documentElement;
    const next = d.dataset.theme === "dark" ? "light" : "dark";
    d.dataset.theme = next;
    document.cookie = `pds_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" onClick={flip} aria-label={t("common.switchTheme")} title={t("common.switchTheme")}
      className={cn("grid size-9 place-items-center rounded-sm border border-line-2 text-ink-2 transition-colors hover:border-ink hover:text-ink", className)}>
      <Sun className="hidden size-[1.05rem] dark:block" aria-hidden />
      <Moon className="size-[1.05rem] dark:hidden" aria-hidden />
    </button>
  );
}

/** TR / EN segmented switch. */
export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("common.switchLocale")} className={cn("num flex h-9 items-stretch overflow-hidden rounded-sm border border-line-2 text-[0.76rem] font-medium", pending && "opacity-60", className)}>
      {(["tr", "en"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} disabled={pending}
          onClick={() => locale !== l && start(async () => { await setLocale(l); router.refresh(); })}
          className={cn("px-2.5 uppercase tracking-wider transition-colors", locale === l ? "bg-ink text-bg" : "text-ink-2 hover:text-ink")}>
          {l}
        </button>
      ))}
    </div>
  );
}
