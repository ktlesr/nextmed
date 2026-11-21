import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { FileText, Trash2, X } from "lucide-react";
import { db } from "@/db";
import { files } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { getFrame, getPeople, getProject } from "@/lib/structure";
import { calendarMonthBounds, projectEnd, projectMonthWindow, todayInIstanbul } from "@/lib/dates";
import { eligibleActuals, ym } from "@/lib/records-costs";
import { fmtMoney, fmtMonthYear, fmtNumber, fmtPercent, pick } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Meter, Notice, PageHeader, Panel, Stat } from "@/components/ui/layout";
import { Badge, WpChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, SubmitButton } from "@/components/ui/form";
import { ActionForm } from "@/components/records/action-form";
import { deletePayrollFile, saveHourlyRates, savePayrollCost } from "./actions";

export const metadata = { title: "Aylık İşverene Maliyet" };

export default async function CostsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(can.finance);
  const sp = await searchParams;
  const { t, locale } = await getT();
  const [project, people, { wps }] = await Promise.all([getProject(), getPeople(true), getFrame()]);
  const today = todayInIstanbul(), thisYear = +today.slice(0, 4), thisYm = today.slice(0, 7);
  const startY = project.startDate ? +project.startDate.slice(0, 4) : thisYear;
  const endY = project.startDate ? +projectEnd(project.startDate, project.durationMonths).slice(0, 4) : thisYear + 1;
  const years = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);
  const year = years.includes(+(sp.year ?? "")) ? +sp.year! : years.includes(thisYear) ? thisYear : years[0];
  const A = await eligibleActuals(project, people);
  const rows = A.payroll.filter((r) => r.year === year);
  const withFiles = new Set<string>();
  const fileRows = A.payroll.length ? await db.select({ id: files.id, entityId: files.entityId, name: files.name, kind: files.kind }).from(files).where(and(eq(files.entityType, "payroll"), inArray(files.entityId, A.payroll.map((r) => r.id)))) : [];
  fileRows.forEach((f) => withFiles.add(f.entityId));
  const cell = (pid: string, m: number) => rows.find((r) => r.personId === pid && r.month === m);
  /** Is this calendar month inside the person's assignment period and not in the future? */
  const due = (p: (typeof people)[number], m: number) => {
    if (!project.startDate || !p.active || !p.eligiblePersonnelCost || p.planMethod !== "fixed_ratio") return false;
    const key = ym(year, m);
    if (key > thisYm) return false;
    const b = calendarMonthBounds(year, m);
    const first = projectMonthWindow(project.startDate, p.startProjectMonth).start, last = projectMonthWindow(project.startDate, Math.min(p.endProjectMonth, project.durationMonths)).end;
    return b.end >= first && b.start <= last;
  };
  const listed = people.filter((p) => p.active || rows.some((r) => r.personId === p.id));
  const sel = sp.p && +(sp.m ?? 0) >= 1 && +(sp.m ?? 0) <= 12 ? { person: people.find((p) => p.id === sp.p), month: +sp.m! } : null;
  const selRow = sel?.person ? cell(sel.person.id, sel.month) : undefined;
  const selFiles = selRow ? fileRows.filter((f) => f.entityId === selRow.id) : [];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthShort = (m: number) => new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, m - 1, 1)));
  const compact = (n: number) => fmtNumber(locale, n, 0);
  let missingCount = 0;
  for (const p of listed) for (const m of months) { const c = cell(p.id, m); if ((c && (c.amount == null || !withFiles.has(c.id))) || (!c && due(p, m))) missingCount++; }

  // Budget
  const b = project.budget;
  const flatAdmin = A.total * b.admin_flat_rate, flatTravel = A.total * b.travel_flat_rate;
  const hourly = people.filter((p) => p.planMethod === "hourly" && p.active);

  return (
    <>
      <PageHeader eyebrow={<>{t("nav.groupAdmin")} · {t("common.access.finance")}</>} title={t("nav.costs")} description={t("finance.costsLede")}
        actions={
          <form method="get" className="flex items-end gap-2">
            <Field label={t("finance.payrollYear")}><select name="year" defaultValue={year} className="control num w-28">{years.map((y) => <option key={y}>{y}</option>)}</select></Field>
            <Button type="submit" variant="secondary">{t("common.apply")}</Button>
          </form>
        } />

      {!project.startDate && <Notice tone="warn" className="mb-5" title={t("common.awaitingStart")}>{t("finance.noStartHint")}</Notice>}

      {sel?.person && (
        <Panel className="mb-6 border-ink" title={<>{sel.person.fullName} · <span className="num font-normal">{fmtMonthYear(locale, year, sel.month)}</span></>}
          aside={<Link href={`/app/admin/costs?year=${year}`} scroll={false} className="rounded-sm p-1 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t("common.close")}><X className="size-4" /></Link>}>
          <ActionForm key={`${sel.person.id}-${year}-${sel.month}-${selRow?.updatedAt?.getTime() ?? 0}`} action={savePayrollCost} closeOnOk={false} className="flex flex-col gap-4">
            <input type="hidden" name="personId" value={sel.person.id} /><input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={sel.month} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("finance.employerCost")} hint={t("finance.employerCostHint")}><input name="amount" inputMode="decimal" className="control num" defaultValue={selRow?.amount ?? ""} /></Field>
              <Field label={t("common.currency")}><select name="currency" className="control" defaultValue={selRow?.currency ?? "TRY"}><option>TRY</option><option>EUR</option></select></Field>
              <Field label={t("finance.reportingRate")} hint={t("finance.reportingRateHint", { rate: fmtNumber(locale, b.plan_currency_rate_try_per_eur, 2) })}><input name="rate" inputMode="decimal" className="control num" defaultValue={selRow?.rateTryPerEur ?? ""} /></Field>
              <Field label={t("common.note")}><input name="note" className="control" defaultValue={selRow?.note ?? ""} /></Field>
              <Field label={t("finance.payrollDoc")} className="lg:col-span-2"><input type="file" name="filePayroll" className="control" /></Field>
              <Field label={t("finance.paymentProof")} className="lg:col-span-2"><input type="file" name="fileProof" className="control" /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <SubmitButton>{t("common.save")}</SubmitButton>
              <p className="text-[0.82rem] text-ink-3">
                {sel.person.planMethod === "fixed_ratio" ? t("finance.ruleFixed", { ratio: fmtPercent(locale, Number(sel.person.fixedRatio ?? 0), 1) }) : sel.person.planMethod === "hourly" ? t("finance.ruleHourly") : t("finance.ruleUnbudgeted")}
                {A.byPersonMonth.has(`${sel.person.id}|${ym(year, sel.month)}`) && <> · <span className="num font-medium text-ink">{t("finance.eligibleN", { amount: fmtMoney(locale, A.byPersonMonth.get(`${sel.person.id}|${ym(year, sel.month)}`)) })}</span></>}
              </p>
            </div>
          </ActionForm>
          {selFiles.length > 0 && (
            <ul className="mt-4 border-t border-line pt-3">
              {selFiles.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-1 text-[0.87rem]">
                  <Badge tone="neutral">{t(`finance.fk.${f.kind ?? "payroll"}`)}</Badge>
                  <a href={`/api/files/${f.id}`} className="flex min-w-0 items-center gap-1.5 text-cobalt hover:underline"><FileText className="size-3.5 shrink-0" /><span className="truncate">{f.name}</span></a>
                  <ActionForm action={deletePayrollFile} quiet closeOnOk={false} confirm={t("finance.confirmDeleteFile")} className="ml-auto"><input type="hidden" name="fileId" value={f.id} /><button className="rounded-sm p-1 text-ink-3 hover:bg-red-soft hover:text-red" aria-label={t("common.delete")}><Trash2 className="size-3.5" /></button></ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* person × payroll month */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-sans text-[1rem] font-semibold tracking-normal">{t("finance.gridTitle", { year })}</h2>
        <p className="flex items-center gap-3 text-[0.8rem] text-ink-2">
          {missingCount > 0 && <Badge tone="warn" dot>{t("finance.nMissing", { n: missingCount })}</Badge>}
          <span>{t("finance.gridHint")}</span>
        </p>
      </div>
      <div className="tbl-wrap scroll-thin mb-8">
        <table className="tbl">
          <thead><tr><th className="sticky left-0 z-10 min-w-48">{t("common.person")}</th>{months.map((m) => <th key={m} className={cn("r min-w-[5.4rem]", ym(year, m) === thisYm && "text-cobalt")}>{monthShort(m)}</th>)}<th className="r min-w-28">{t("finance.eligibleEur")}</th></tr></thead>
          <tbody>
            {listed.map((p) => {
              const yearTotal = months.reduce((a, m) => a + (A.byPersonMonth.get(`${p.id}|${ym(year, m)}`) ?? 0), 0);
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 bg-surface"><p className="whitespace-nowrap font-medium">{p.fullName}</p>
                    <p className="num text-[0.72rem] text-ink-3">{p.planMethod === "fixed_ratio" ? `${t("common.method.fixed_ratio")} ${fmtPercent(locale, Number(p.fixedRatio ?? 0), 1)}` : p.planMethod === "hourly" ? `${t("common.method.hourly")} · ${p.hourlyRateEur ? `${fmtNumber(locale, Number(p.hourlyRateEur), 2)} €/${locale === "tr" ? "sa" : "h"}` : t("finance.rateMissing")}` : `${t("common.method.non_budget_support")} · 0 €`}</p></td>
                  {months.map((m) => {
                    const c = cell(p.id, m), on = sel?.person?.id === p.id && sel.month === m;
                    const incomplete = c ? c.amount == null || !withFiles.has(c.id) : due(p, m);
                    return (
                      <td key={m} className={cn("r p-0", on && "outline outline-2 -outline-offset-2 outline-cobalt")}>
                        <Link href={`/app/admin/costs?year=${year}&p=${p.id}&m=${m}`} scroll={false} className={cn("block px-2 py-2.5 hover:bg-cobalt-soft", incomplete && "bg-warn-soft/60")} title={`${p.fullName} · ${fmtMonthYear(locale, year, m)}`}>
                          {c?.amount != null ? <span className="num block text-[0.8rem]">{compact(Number(c.amount))}<span className="ml-0.5 text-[0.62rem] text-ink-3">{c.currency === "TRY" ? "₺" : "€"}</span></span> : <span className="num block text-[0.8rem] text-ink-3">—</span>}
                          {incomplete && <span className="block whitespace-nowrap text-[0.64rem] font-medium text-warn">{t("finance.dataMissing")}</span>}
                        </Link>
                      </td>
                    );
                  })}
                  <td className="r num text-[0.86rem] font-medium">{yearTotal > 0 ? fmtMoney(locale, yearTotal) : <span className="font-normal text-ink-3">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title={t("finance.budgetTitle")} aside={<span className="num">PP5</span>}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
            <Stat label={t("finance.approvedBudget")} value={<span className="text-[1.35rem]">{fmtMoney(locale, b.approved_partner_budget_eur)}</span>} sub={t("finance.partnerShare", { pct: fmtPercent(locale, b.partner_contribution_rate), amount: fmtMoney(locale, b.approved_partner_budget_eur * b.partner_contribution_rate) })} />
            <Stat label={t("finance.personnelCeiling")} value={<span className="text-[1.35rem]">{fmtMoney(locale, b.personnel_ceiling_eur)}</span>} sub={t("finance.planAndRest", { plan: fmtMoney(locale, b.personnel_plan_eur), rest: fmtMoney(locale, b.personnel_remaining_eur) })} />
            <Stat label={t("finance.eligibleActual")} tone="turq" value={<span className="text-[1.35rem]">{fmtMoney(locale, A.total)}</span>} sub={fmtPercent(locale, b.personnel_ceiling_eur ? A.total / b.personnel_ceiling_eur : 0, 1) + " · " + t("finance.ofCeiling")} />
            <Stat label={t("finance.ceilingRemaining")} value={<span className="text-[1.35rem]">{fmtMoney(locale, b.personnel_ceiling_eur - A.total)}</span>} />
          </div>
          <Meter value={A.total} max={b.personnel_ceiling_eur} tone="turq" className="mt-5" label={t("finance.eligibleActual")} />
          <div className="mt-5 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
            {[["adminFlat", b.admin_flat_rate, flatAdmin], ["travelFlat", b.travel_flat_rate, flatTravel]].map(([k, rate, val]) => (
              <div key={k as string}>
                <p className="label">{t(`finance.${k}`)} · {fmtPercent(locale, rate as number)}</p>
                <p className="num mt-1 text-[1.1rem] font-medium">{fmtMoney(locale, val as number)} <span className="text-[0.8rem] font-normal text-ink-3">/ {fmtMoney(locale, b.personnel_plan_eur * (rate as number))} {t("finance.planned")}</span></p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.8rem] text-ink-3">{t("finance.flatHint")} {t("finance.rates", { plan: fmtNumber(locale, b.plan_currency_rate_try_per_eur, 2), rep: b.reporting_currency_rate_try_per_eur ? fmtNumber(locale, b.reporting_currency_rate_try_per_eur, 2) : "—" })}</p>

          <div className="-mx-4 mt-5 overflow-x-auto border-t border-line">
            <table className="tbl">
              <thead><tr><th>WP</th><th className="r">{t("finance.personnelCeiling")}</th><th className="r">{t("finance.personnelPlan")}</th><th className="r">{t("finance.eligibleActual")}</th><th className="r">{t("finance.remaining")}</th><th className="r">{t("finance.externalServices")}</th></tr></thead>
              <tbody>
                {wps.map((w) => {
                  const act = A.byWp.get(w.id) ?? 0, ceil = Number(w.personnelCeilingEur);
                  return (
                    <tr key={w.id}>
                      <td><WpChip code={w.code} /><span className="mt-0.5 block max-w-64 truncate text-[0.8rem] text-ink-2" title={pick(locale, w.nameTr, w.nameEn)}>{pick(locale, w.nameTr, w.nameEn)}</span></td>
                      <td className="r num">{fmtMoney(locale, ceil)}</td>
                      <td className="r num text-ink-2">{fmtMoney(locale, w.personnelPlanEur)}</td>
                      <td className="r num font-medium">{fmtMoney(locale, act)}<Meter value={act} max={ceil} tone={act > ceil ? "red" : "turq"} className="ml-auto mt-1 h-1 w-20" /></td>
                      <td className={cn("r num", ceil - act < 0 && "text-red")}>{fmtMoney(locale, ceil - act)}</td>
                      <td className="r num text-ink-2">{fmtMoney(locale, w.externalServicesBudgetEur)}</td>
                    </tr>
                  );
                })}
                {A.unattributed > 0.005 && <tr><td className="text-[0.86rem] text-ink-2">{t("finance.unattributed")}</td><td /><td /><td className="r num font-medium">{fmtMoney(locale, A.unattributed)}</td><td /><td /></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.8rem] text-ink-3">{t("finance.wpRule")}</p>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title={t("finance.hourlyRates")}>
            <ActionForm action={saveHourlyRates} closeOnOk={false} className="flex flex-col gap-2.5">
              {hourly.map((p) => (
                <label key={p.id} className="grid grid-cols-[1fr_7.5rem] items-center gap-3 text-[0.9rem]">
                  <span className="min-w-0"><span className="block truncate font-medium">{p.fullName}</span><span className="num text-[0.74rem] text-ink-3">{pick(locale, p.costClassTr, p.costClassEn)} · {fmtNumber(locale, (p.totalPlannedMinutes ?? 0) / 60, 0)} {locale === "tr" ? "sa" : "h"}</span></span>
                  <input name={`rate:${p.id}`} inputMode="decimal" className="control num text-right" defaultValue={p.hourlyRateEur ? Number(p.hourlyRateEur) : ""} placeholder="€" aria-label={`${p.fullName} €/h`} />
                </label>
              ))}
              <div className="mt-2"><SubmitButton variant="secondary" size="sm">{t("common.save")}</SubmitButton></div>
            </ActionForm>
            <p className="mt-3 text-[0.8rem] text-ink-3">{t("finance.hourlyRatesHint")}</p>
          </Panel>
          <Panel title={t("finance.rulesTitle")}>
            <ul className="flex flex-col gap-2.5 text-[0.88rem] text-ink-2">
              <li><span className="font-semibold text-ink">{t("common.method.fixed_ratio")}.</span> {t("finance.ruleFixedLong")}</li>
              <li><span className="font-semibold text-ink">{t("common.method.hourly")}.</span> {t("finance.ruleHourlyLong")}</li>
              <li><span className="font-semibold text-ink">{t("common.method.non_budget_support")}.</span> {t("finance.ruleUnbudgetedLong")}</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
