import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, concreteOutputs, people, subactivities } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getFrame } from "@/lib/structure";
import { getT } from "@/i18n/server";
import { Brand } from "@/components/shell/brand";
import { LocaleSwitch, ThemeToggle } from "@/components/shell/toggles";
import { ScoreGantt } from "@/components/shell/score-gantt";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const count = async (table: typeof people | typeof subactivities | typeof assignments | typeof concreteOutputs) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(table).where(sql`active = true`))[0].n;

export default async function Landing() {
  const [{ t, locale }, user, { wps, outs, acts }, nSub, nPeople, nAsg, nTargets] = await Promise.all([
    getT(), getUser(), getFrame(), count(subactivities), count(people), count(assignments), count(concreteOutputs),
  ]);
  const name = (o: { nameTr: string; nameEn: string }) => (locale === "tr" ? o.nameTr : o.nameEn);
  const lanes = wps.map((w) => ({
    code: w.code, name: name(w), months: w.months,
    lines: acts.filter((a) => outs.find((o) => o.id === a.outputId)?.workPackageId === w.id).map((a) => ({ code: a.code, name: name(a), months: a.months })),
  }));
  const counts: [number, string][] = [[wps.length, "wp"], [outs.length, "out"], [acts.length, "act"], [nSub, "sub"], [nPeople, "people"], [nAsg, "asg"], [nTargets, "targets"]];
  const modules = ["home", "gantt", "tasks", "work", "outputs", "reports", "documents", "meetings", "procurements", "travels", "payments", "admin"];
  const navKey: Record<string, string> = { admin: "nav.groupAdmin" };
  const rules = ["day", "step", "frame", "base"];
  const provinces = ["Afyonkarahisar", "Kütahya", "Manisa", "Uşak"];
  const cta = user ? { href: "/app", label: t("landing.goToApp") } : { href: "/login", label: t("landing.enter") };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Brand sub={`PP5 · ${t("common.partner")}`} />
          <div className="flex items-center gap-2">
            <LocaleSwitch />
            <ThemeToggle />
            <ButtonLink href={cta.href} size="md" className="ml-1 hidden sm:inline-flex">{user ? t("landing.goToApp") : t("landing.signIn")}</ButtonLink>
          </div>
        </div>
      </header>

      <main>
        {/* Hero — the thesis is the plan itself */}
        <section className="mx-auto max-w-6xl px-5 pb-10 pt-14 sm:pt-20">
          <p className="label rise">{t("landing.eyebrow")}</p>
          <h1 className="rise mt-5 text-[clamp(2.7rem,8.5vw,6.2rem)] font-bold leading-[0.95] tracking-[-0.035em]" style={{ animationDelay: "60ms" }}>
            {t("landing.h1a")}<br /><span className="text-cobalt">{t("landing.h1b")}</span>
          </h1>
          <div className="rise mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" style={{ animationDelay: "140ms" }}>
            <p className="max-w-[52ch] text-[1.08rem] text-ink-2">{t("landing.lede")}</p>
            <div className="flex shrink-0 items-center gap-2">
              <ButtonLink href={cta.href} size="lg">{cta.label}<ArrowRight className="size-4" /></ButtonLink>
              <ButtonLink href="#tour" variant="ghost" size="lg">{t("landing.tour")}<ArrowDown className="size-4" /></ButtonLink>
            </div>
          </div>
          <div className="rise mt-12" style={{ animationDelay: "220ms" }}>
            <ScoreGantt lanes={lanes} locale={locale} monthsLabel={t("landing.ganttMonths")} />
            <p className="mt-2.5 text-[0.82rem] text-ink-3">{t("landing.ganttCaption")}</p>
          </div>
        </section>

        {/* Counts straight from the database */}
        <section className="border-y border-ink bg-surface">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:grid-cols-4 lg:grid-cols-7">
            {counts.map(([n, key], i) => (
              <div key={key} className={`border-line py-5 pr-4 ${i > 0 ? "lg:border-l lg:pl-5" : ""}`}>
                <dd className="font-display text-[2.4rem] font-semibold leading-none tracking-tight tabular-nums">{n}</dd>
                <dt className="label mt-2">{t(`landing.count.${key}`)}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* Menu ledger */}
        <section id="tour" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
            <div>
              <h2 className="text-[2rem]">{t("landing.modulesTitle")}</h2>
              <p className="mt-3 text-ink-2">{t("landing.modulesLede")}</p>
            </div>
            <ul className="rule-top grid sm:grid-cols-2 sm:gap-x-10">
              {modules.map((m) => (
                <li key={m} className="border-b border-line py-3.5">
                  <p className="font-semibold">{t(navKey[m] ?? `nav.${m}`)}</p>
                  <p className="mt-0.5 text-[0.9rem] text-ink-2">{t(`landing.m.${m}`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Rules */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-[2rem]">{t("landing.rulesTitle")}</h2>
            <p className="mt-3 max-w-[56ch] text-ink-2">{t("landing.rulesLede")}</p>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {rules.map((r) => (
                <div key={r} className="rule-top pt-4">
                  <p className="label">{t(`landing.r.${r}.k`)}</p>
                  <p className="num mt-2 text-[2rem] font-medium leading-none tracking-tight text-cobalt">{t(`landing.r.${r}.v`)}</p>
                  <p className="mt-3 text-[0.9rem] text-ink-2">{t(`landing.r.${r}.d`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sequence: start date → calendar → baseline → current plan */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
            <div>
              <h2 className="text-[2rem]">{t("landing.stepsTitle")}</h2>
              <p className="mt-3 text-ink-2">{t("landing.stepsLede")}</p>
              <p className="mt-6 border-l-2 border-turq pl-3 text-[0.87rem] text-ink-2"><span className="label mb-1 block text-turq">{t("landing.exampleLabel")}</span><span className="num">{t("landing.example")}</span></p>
            </div>
            <ol className="rule-top">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="grid grid-cols-[3.5rem_1fr] gap-4 border-b border-line py-5 sm:grid-cols-[5rem_15rem_1fr]">
                  <span className="num text-[1.6rem] leading-none text-ink-3">0{n}</span>
                  <span className="font-display text-xl font-semibold">{t(`landing.s${n}.t`)}</span>
                  <span className="col-start-2 text-ink-2 sm:col-start-3">{t(`landing.s${n}.d`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Field: four provinces, two buildings each */}
        <section className="bg-ink text-bg">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
              <div>
                <h2 className="text-[2.2rem]">{t("landing.fieldTitle")}</h2>
                <p className="mt-4 max-w-[54ch] opacity-75">{t("landing.fieldLede")}</p>
              </div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
                {provinces.map((p) => (
                  <li key={p} className="border-t border-bg/30 pt-4">
                    <div className="flex h-14 items-end gap-1.5" aria-hidden>
                      <span className="h-full w-6 bg-[var(--turq)]" style={{ maskImage: "repeating-linear-gradient(0deg,#000 0 6px,transparent 6px 9px)" }} />
                      <span className="h-3/4 w-6 bg-[var(--turq)]" style={{ maskImage: "repeating-linear-gradient(0deg,#000 0 6px,transparent 6px 9px)" }} />
                    </div>
                    <p className="mt-3 font-display text-lg font-semibold">{p}</p>
                    <p className="num text-[0.75rem] uppercase tracking-wider opacity-60">{t("landing.buildings")}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-[0.85rem] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[60ch]">{t("landing.footNote")}</p>
        <Link href={cta.href} className="font-medium text-ink underline-offset-4 hover:underline">{cta.label} →</Link>
      </footer>
    </div>
  );
}
