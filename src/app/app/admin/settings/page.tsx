import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, baselines, hourlyPlan, people as peopleT, referenceHours, subactivities, users } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { getPeople, getProject } from "@/lib/structure";
import { projectEnd } from "@/lib/dates";
import { fmtDate, fmtDateTime, fmtMoney, fmtMonthYear, fmtNumber, fmtPercent } from "@/lib/format";
import { getT } from "@/i18n/server";
import { DefList, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { BaselineForm, DefaultReferenceForm, DeleteReferenceButton, DurationForm, ReferenceHoursForm, ReportingRateForm, StartDateForm } from "@/components/plan/settings-forms";

export const metadata = { title: "Proje Ayarları" };

export default async function SettingsPage() {
  await requireRole(can.admin);
  const [{ t, locale }, p, people] = await Promise.all([getT(), getProject(), getPeople()]);
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const [subs, asg, hp, versions, refs] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)::int` }).from(subactivities).where(eq(subactivities.active, true))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(assignments).where(eq(assignments.active, true))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(hourlyPlan).where(sql`${hourlyPlan.centiHours} > 0`)),
    db.select({ b: baselines, name: peopleT.fullName, email: users.email }).from(baselines).leftJoin(users, eq(users.id, baselines.createdBy)).leftJoin(peopleT, eq(peopleT.id, users.personId)).orderBy(desc(baselines.version)),
    db.select().from(referenceHours).orderBy(desc(referenceHours.year), desc(referenceHours.month)),
  ]);
  const b = p.budget;
  const pName = new Map(people.map((x) => [x.id, x.fullName]));
  return (
    <>
      <PageHeader eyebrow={t("gantt.setEyebrow")} title={t("gantt.setTitle")} description={t("gantt.setDesc")} />
      <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-ink py-5 lg:grid-cols-4">
        <Stat label={t("gantt.startDate")} value={p.startDate ? fmtDate(locale, p.startDate) : "—"} sub={p.startDate ? undefined : t("gantt.startNone")} tone={p.startDate ? undefined : "warn"} />
        <Stat label={t("gantt.startEnd")} value={p.startDate ? fmtDate(locale, projectEnd(p.startDate, p.durationMonths)) : "—"} />
        <Stat label={t("gantt.durTitle")} value={p.durationMonths} sub={t("common.projectMonth")} />
        <Stat label={t("gantt.baseTitle")} value={versions.length ? `v${versions[0].b.version}` : "—"} sub={versions.length ? fmtDate(locale, versions[0].b.createdAt.toISOString()) : t("gantt.baseNone")} tone={versions.length ? "turq" : undefined} />
      </div>
      <div className="flex flex-col gap-6">
        <Panel title={t("gantt.startTitle")}><StartDateForm current={p.startDate} duration={p.durationMonths} affects={{ subs, asg, hp }} /></Panel>
        <Panel title={t("gantt.baseTitle")}>
          <BaselineForm hasBaseline={versions.length > 0} hasStart={!!p.startDate} />
          {versions.length > 0 && (
            <div className="-mx-4 -mb-4 mt-4 overflow-x-auto border-t border-line">
              <table className="tbl">
                <thead><tr><th>{t("gantt.baseVersion")}</th><th>{t("gantt.baseCaptured")}</th><th>{t("gantt.startDate")}</th><th>{t("gantt.baseScope")}</th><th>{t("gantt.baseBy")}</th><th>{t("common.reason")}</th></tr></thead>
                <tbody>{versions.map(({ b: v, name, email }, i) => (
                  <tr key={v.id}>
                    <td><span className="num font-medium">v{v.version}</span>{i === 0 && <Badge tone="turq" className="ml-2">{t("gantt.layerBaseline")}</Badge>}</td>
                    <td className="num whitespace-nowrap">{fmtDateTime(locale, v.createdAt)}</td>
                    <td className="num whitespace-nowrap">{fmtDate(locale, v.startDate)} · {v.durationMonths}</td>
                    <td className="whitespace-nowrap">{t("gantt.baseScopeV", { subs: v.snapshot.subactivities.filter((s) => s.active).length, asg: v.snapshot.assignments.length })}</td>
                    <td>{name ?? email ?? "—"}</td>
                    <td className="text-ink-2">{v.reason ?? "—"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={t("gantt.durTitle")}><DurationForm duration={p.durationMonths} /></Panel>
          <Panel title={t("gantt.rateTitle")}>
            <DefList className="mb-4" items={[[t("gantt.ratePlan"), <span key="r" className="num">{fmtNumber(locale, b.plan_currency_rate_try_per_eur, 2)}</span>]]} />
            <ReportingRateForm rate={b.reporting_currency_rate_try_per_eur ?? null} />
          </Panel>
        </div>
        <Panel title={t("gantt.refTitle")}>
          <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
            <DefaultReferenceForm hours={p.defaultReferenceHours} />
            <div>
              <p className="label mb-3">{t("gantt.refOverrides")}</p>
              <ReferenceHoursForm people={people.filter((x) => x.planMethod === "fixed_ratio").map((x) => ({ id: x.id, name: x.fullName }))} />
              {refs.length === 0 ? <p className="mt-4 text-[0.86rem] text-ink-3">{t("gantt.refNone")}</p> : (
                <table className="tbl mt-4">
                  <thead><tr><th>{t("common.month")}</th><th>{t("common.person")}</th><th className="r">{t("gantt.refHours")}</th><th /></tr></thead>
                  <tbody>{refs.map((r) => (
                    <tr key={r.id}><td>{fmtMonthYear(locale, r.year, r.month)}</td><td>{r.personId ? pName.get(r.personId) ?? r.personId : t("gantt.refEveryone")}</td><td className="r num">{fmtNumber(locale, Number(r.hours), 2)}</td><td className="r w-12"><DeleteReferenceButton id={r.id} /></td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        </Panel>
        <Panel title={t("gantt.budgetTitle")} aside={t("gantt.readOnly")}>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
            {([[t("gantt.bApproved"), fmtMoney(locale, b.approved_partner_budget_eur)], [t("gantt.bCeiling"), fmtMoney(locale, b.personnel_ceiling_eur)], [t("gantt.bPlan"), fmtMoney(locale, b.personnel_plan_eur)], [t("gantt.bRemaining"), fmtMoney(locale, b.personnel_remaining_eur)], [t("gantt.bAdmin"), fmtPercent(locale, b.admin_flat_rate)], [t("gantt.bTravel"), fmtPercent(locale, b.travel_flat_rate)], [t("gantt.bContribution"), fmtPercent(locale, b.partner_contribution_rate)]] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt className="label">{k}</dt><dd className="num mt-1 text-[1.05rem] font-medium">{v}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
