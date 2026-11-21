import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { Brand, StarLattice } from "@/components/shell/brand";
import { LocaleSwitch, ThemeToggle } from "@/components/shell/toggles";
import { Ruler } from "@/components/ui/ruler";
import { LoginForm } from "./login-form";

export const metadata = { title: "Giriş" };

export default async function LoginPage() {
  if (await getUser()) redirect("/app");
  const { t } = await getT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Glazed panel: fixed cobalt ground in both themes */}
      <aside className="relative hidden overflow-hidden bg-[#0f1f5c] text-[#eef2ff] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <StarLattice className="absolute inset-0 size-full text-[#3f5bd6] opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1440] via-transparent to-transparent" />
        <Link href="/" className="relative flex items-center gap-2 text-[0.85rem] text-[#b9c6f5] hover:text-white"><ArrowLeft className="size-4" />{t("landing.backHome")}</Link>
        <div className="relative max-w-md">
          <p className="font-display text-[2.7rem] font-semibold leading-[1.03] tracking-tight">
            {t("landing.loginAside1")}<br /><span className="text-[#5fe0d8]">{t("landing.loginAside2")}</span>
          </p>
          <p className="mt-5 text-[#b9c6f5]">{t("landing.loginAsideSub")}</p>
        </div>
        <div className="relative">
          <Ruler className="h-7 text-[#aebcf2]" />
          <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[#93a5ec]">01 — 36 · {t("common.partner")} · PP5</p>
        </div>
      </aside>

      <main className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/"><Brand sub="PP5" /></Link>
          <div className="flex items-center gap-2"><LocaleSwitch /><ThemeToggle /></div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <p className="label mb-3">{t("common.portal")}</p>
          <h1 className="text-[2.1rem]">{t("landing.loginTitle")}</h1>
          <p className="mt-2 text-ink-2">{t("landing.loginLede")}</p>
          <LoginForm />
          <p className="mt-8 border-t border-line pt-4 text-[0.85rem] text-ink-3">{t("landing.loginHelp")}</p>
        </div>
      </main>
    </div>
  );
}
