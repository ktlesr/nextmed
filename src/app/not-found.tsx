import { getT } from "@/i18n/server";
import { Brand } from "@/components/shell/brand";
import { ButtonLink } from "@/components/ui/button";
import { Ruler } from "@/components/ui/ruler";

export default async function NotFound() {
  const { t, locale } = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <Brand sub="PP5" />
      <p className="num mt-12 text-[5rem] font-medium leading-none tracking-tight text-cobalt">404</p>
      <Ruler className="mt-4 text-ink-3" />
      <h1 className="mt-6 text-3xl">{t("common.notFound")}</h1>
      <p className="mt-2 text-ink-2">{locale === "tr" ? "Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir." : "The page you are looking for may have moved or never existed."}</p>
      <div className="mt-6"><ButtonLink href="/app">{t("nav.home")}</ButtonLink></div>
    </main>
  );
}
