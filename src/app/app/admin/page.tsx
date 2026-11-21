import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { can, requireRole } from "@/lib/auth";
import { getFrame, getProject } from "@/lib/structure";
import { calendarMonthBounds, todayInIstanbul } from "@/lib/dates";
import { fmtDate, fmtDuration, fmtHours, fmtMoney, fmtMonthYear, fmtPercent, monthLabel, monthsLabel, pick } from "@/lib/format";
import { attention, personnelCost, planCompliance, priorityOutputs, teamWorkload } from "@/lib/adminDashboard";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { Badge, WpChip, planTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Meter, Notice, PageHeader, Panel } from "@/components/ui/layout";
import { PlanInstrument } from "@/components/admin/plan-instrument";
import { fmtValue, unitLabel } from "@/components/admin/target-cell";
import { ratioLabel } from "@/components/admin/plan-summary";

export const metadata = { title: "Yönetim Paneli" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ ym?: string; wp?: string }> }) {
  const user = await requireRole(can.coordinate);
  const sp = await searchParams;
  const today = todayInIstanbul();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.ym ?? "") ? sp.ym! : today.slice(0, 7);
  const [year, month] = ym.split("-").map(Number);
  const [{ t, locale }, project, { wps }] = await Promise.all([getT(), getProject(), getFrame()]);
  const wp = wps.find((w) => w.id === sp.wp) ?? null;
  const period = calendarMonthBounds(year, month);
  const finance = can.finance(user);
  const [plan, workload, cost, outputs, att] = await Promise.all([
    planCompliance(project, period.end, wp?.id ?? null), teamWorkload(project, year, month, wp?.id ?? null),
    finance ? personnelCost(project, year, month, wp?.id ?? null) : null, priorityOutputs(period.end, wp?.id ?? null), attention(wp?.id ?? null),
  ]);
  const qs = (extra: Record<string, string> = {}) => { const p = new URLSearchParams({ ym, ...(wp ? { wp: wp.id } : {}), ...extra }); return `?${p}`; };
  const shift = (d: number) => { const k = year * 12 + month - 1 + d; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`; };
  const s = plan.subs, a = plan.activities;
  const ratio = s.baseDue + a.baseDue > 0 ? (s.baseDueDone + a.baseDueDone) / (s.baseDue + a.baseDue) : null;
  const name = (o: { nameTr: string | null; nameEn: string | null }) => pick(locale, o.nameTr, o.nameEn);
  const lanes = [
    { key: "baseline", label: t("admin.laneBaseline"), counts: plan.lanes.baseline, color: "var(--ink-3)", total: plan.lanes.baseline.reduce((x, y) => x + y, 0) },
    { key: "current", label: t("admin.laneCurrent"), counts: plan.lanes.current, color: "var(--cobalt)", total: plan.lanes.current.reduce((x, y) => x + y, 0) },
    { key: "actual", label: t("admin.laneActual"), counts: plan.lanes.actual, color: "var(--turq)", total: plan.lanes.actual.reduce((x, y) => x + y, 0) },
  ];
  const attentionRows: { label: string; n: number | null; href: string; tone?: "red" | "warn" }[] = [
    { label: t("admin.attDelayed"), n: plan.delays.length, href: "#delays", tone: "red" },
    { label: t("admin.attReview"), n: att.inReview, href: "/app/review" },
    { label: t("admin.attEvidenceEn"), n: att.evidenceAwaitingEn.length, href: "#evidence", tone: "warn" },
    { label: t("admin.attTranslations"), n: att.pendingTranslations, href: "/app/admin/translations?status=pending" },
    { label: t("admin.attTranslationsFailed"), n: att.failedTranslations, href: "/app/admin/translations?status=failed", tone: "red" },
    { label: t("admin.attOutside"), n: plan.outside.length, href: "#outside", tone: "warn" },
    { label: t("admin.attConflicts"), n: att.importConflicts, href: "/app/admin/import", tone: "red" },
  ];
  const sumApproved = workload.reduce((x, r) => x + r.totals.approved, 0), sumReview = workload.reduce((x, r) => x + r.totals.inReview, 0);
  const sumTarget = workload.reduce((x, r) => x + (r.target.kind === "target" ? r.target.minutes : 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex flex-wrap items-center gap-3">{t("nav.adminPanel")}{wp ? <WpChip code={wp.code} /> : <span>{t("admin.allWps")}</span>}{plan.periodMonth != null && plan.periodMonth > 0 && <span className="num text-ink-2">{monthLabel(locale, plan.periodMonth)} / {project.durationMonths}</span>}</span>}
        title={<span className="capitalize">{fmtMonthYear(locale, year, month)}</span>}
        description={wp ? name(wp) : t("admin.dashLede")}
        actions={
          <form className="flex flex-wrap items-end gap-2" action="/app/admin">
            <div className="flex items-end gap-1">
              <Link href={`?ym=${shift(-1)}${wp ? `&wp=${wp.id}` : ""}`} className={buttonClass("secondary", "md", "px-2.5")} aria-label={t("admin.prevMonth")}>←</Link>
              <label><span className="label mb-1.5 block">{t("admin.calendarMonth")}</span><input type="month" name="ym" defaultValue={ym} required className="control num h-9.5 w-40 text-[0.87rem]" /></label>
              <Link href={`?ym=${shift(1)}${wp ? `&wp=${wp.id}` : ""}`} className={buttonClass("secondary", "md", "px-2.5")} aria-label={t("admin.nextMonth")}>→</Link>
            </div>
            <label><span className="label mb-1.5 block">{t("common.workPackage")}</span>
              <select name="wp" defaultValue={wp?.id ?? ""} className="control h-9.5 w-44">
                <option value="">{t("common.all")}</option>
                {wps.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
            </label>
            <button className={buttonClass("primary")}>{t("common.apply")}</button>
          </form>
        }
      />

      {!plan.hasStart && <Notice tone="warn" className="mb-5" title={t("common.awaitingStart")}>{t("admin.noStartBody")} {can.admin(user) && <Link href="/app/admin/settings" className="font-medium text-ink underline underline-offset-2">{t("nav.settings")} →</Link>}</Notice>}
      {plan.hasStart && !plan.hasBaseline && <Notice tone="cobalt" className="mb-5" title={t("admin.noBaselineTitle")}>{t("admin.noBaselineBody")}</Notice>}

      {/* ── Plan compliance: three readings on one ruler ── */}
      <section className="panel">
        <div className="grid lg:grid-cols-[19rem_1fr]">
          <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
            <p className="label">{t("admin.compliance")}</p>
            <p className="mt-2 font-display text-[3.6rem] font-semibold leading-none tracking-tight tabular-nums">
              {s.baseDueDone + a.baseDueDone}<span className="text-ink-3"> / {s.baseDue + a.baseDue}</span>
            </p>
            <p className="mt-2 text-[0.88rem] text-ink-2">{t("admin.complianceSub", { date: fmtDate(locale, period.end) })}</p>
            {ratio != null && <><Meter value={ratio} max={1} tone={ratio >= 1 ? "ok" : ratio >= 0.7 ? "cobalt" : "red"} className="mt-4" label={t("admin.compliance")} /><p className="num mt-1.5 text-[0.8rem] text-ink-2">{fmtPercent(locale, ratio)}</p></>}
            <table className="mt-5 w-full text-[0.84rem]">
              <thead><tr className="label text-left"><th className="pb-1.5 font-medium" /><th className="pb-1.5 text-right font-medium">{t("admin.activitiesShort")}</th><th className="pb-1.5 text-right font-medium">{t("admin.subsShort")}</th></tr></thead>
              <tbody className="num">
                {([[t("admin.laneBaseline"), a.baseDue, s.baseDue, "bg-ink-3"], [t("admin.laneCurrent"), a.curDue, s.curDue, "bg-cobalt"], [t("admin.laneActual"), a.done, s.done, "bg-turq"]] as const).map(([label, x, y, dot]) => (
                  <tr key={label} className="border-t border-line"><td className="py-1.5 font-sans"><span className={cn("mr-2 inline-block size-2 rounded-[1px]", dot)} />{label}</td><td className="py-1.5 text-right">{x}</td><td className="py-1.5 text-right">{y}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.76rem] text-ink-3">{t("admin.complianceLegend")}{plan.baselineVersion ? ` · ${t("admin.baselineV", { v: plan.baselineVersion, date: fmtDate(locale, plan.baselineStart) })}` : ""}</p>
          </div>
          <div className="min-w-0 overflow-x-auto p-5"><div className="min-w-[34rem]"><PlanInstrument lanes={lanes} duration={project.durationMonths} periodMonth={plan.periodMonth} monthWord={t("common.month")} caption={t("admin.instrumentCaption")} /></div></div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        {/* ── Monthly team workload ── */}
        <Panel title={t("admin.workload")} aside={<Link href={`/app/admin/workload?ym=${ym}`} className="flex items-center gap-1 hover:text-ink">{t("nav.workload")}<ArrowUpRight className="size-3.5" /></Link>} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[36rem]">
              <thead><tr><th>{t("common.person")}</th><th className="w-[34%]">{t("admin.approvedVsTarget")}</th><th className="r">{t("admin.remaining")}</th><th className="r">{t("admin.inReview")}</th></tr></thead>
              <tbody>
                {workload.map(({ person, target, totals }) => {
                  const tg = target.kind === "target" ? target.minutes : null;
                  return (
                    <tr key={person.id}>
                      <td><p className="font-medium">{person.fullName}</p><p className="text-[0.76rem] text-ink-3">{t(`common.method.${person.planMethod}`)}{person.planMethod === "fixed_ratio" && person.fixedRatio ? ` · ${ratioLabel(locale, Number(person.fixedRatio))}` : ""}</p></td>
                      <td>
                        {tg != null ? (
                          <><p className="num text-[0.84rem]"><span className="font-medium">{fmtHours(locale, totals.approved)}</span><span className="text-ink-3"> / {fmtHours(locale, tg, target.kind === "target" && target.method === "hourly" ? 2 : 1)}</span></p><Meter value={totals.approved} max={tg} pending={totals.inReview} tone={totals.approved >= tg ? "ok" : "cobalt"} className="mt-1.5" label={person.fullName} /></>
                        ) : (
                          <p className="text-[0.84rem]"><span className="num font-medium">{fmtHours(locale, totals.approved)}</span> <span className="text-ink-3">· {t(`admin.tg.${target.kind}`)}</span></p>
                        )}
                      </td>
                      <td className="num r">{tg == null ? "—" : totals.approved >= tg ? <span className="text-ok">{t("admin.targetMet")}</span> : fmtDuration(locale, tg - totals.approved)}</td>
                      <td className="num r">{totals.inReview ? <span className="text-cobalt">{fmtDuration(locale, totals.inReview)}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="border-t border-ink"><td className="px-3 py-2 label">{t("common.total")}</td><td className="num px-3 py-2 text-[0.84rem]">{fmtHours(locale, sumApproved)} / {fmtHours(locale, sumTarget)}</td><td /><td className="num r px-3 py-2">{sumReview ? fmtDuration(locale, sumReview) : "—"}</td></tr></tfoot>
            </table>
          </div>
        </Panel>

        {/* ── Needs attention ── */}
        <Panel title={t("admin.attention")} bodyClassName="p-0">
          <ul>
            {attentionRows.map((r) => (
              <li key={r.label} className="border-b border-line last:border-b-0">
                <Link href={r.href.startsWith("#") ? `${qs()}${r.href}` : r.href} className="group flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                  <span className="text-[0.9rem]">{r.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={cn("num min-w-8 text-right font-display text-[1.5rem] font-semibold leading-none tabular-nums", !r.n ? "text-ink-3" : r.tone === "red" ? "text-red" : r.tone === "warn" ? "text-warn" : "text-ink")}>{r.n ?? "—"}</span>
                    <ArrowUpRight className="size-4 text-ink-3 group-hover:text-ink" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* ── Cumulative personnel cost ── */}
        <Panel title={t("admin.cost")} aside={<span className="num">{t("admin.until", { date: fmtDate(locale, period.end) })}</span>}>
          {!cost ? (
            <div className="flex items-start gap-3 text-ink-2"><Lock className="mt-0.5 size-5 shrink-0 text-ink-3" /><div><p className="font-medium text-ink">{t("admin.costLockedTitle")}</p><p className="mt-1 text-[0.88rem]">{t("admin.costLockedBody")}</p></div></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {([[t("admin.costActual"), cost.total, "text-ink"], [t("admin.costCeiling"), cost.ceiling, "text-ink-2"], [t("admin.costRemaining"), cost.remaining, cost.remaining < 0 ? "text-red" : "text-turq"]] as const).map(([label, v, cls]) => (
                  <div key={label} className="min-w-0"><p className="label">{label}</p><p className={cn("num mt-1 truncate text-[1.15rem] font-medium", cls)}>{fmtMoney(locale, v)}</p></div>
                ))}
              </div>
              <Meter value={cost.total} max={cost.ceiling} tone={cost.total > cost.ceiling ? "red" : "turq"} className="mt-4" label={t("admin.cost")} />
              <p className="num mt-1.5 text-[0.78rem] text-ink-3">{fmtPercent(locale, cost.ceiling ? cost.total / cost.ceiling : 0, 1)} · {t("admin.costPlan")} {fmtMoney(locale, cost.plan)}</p>
              {cost.rows.length > 0 && (
                <details className="mt-4 border-t border-line pt-3">
                  <summary className="label cursor-pointer hover:text-ink">{t("admin.costByPerson")}</summary>
                  <table className="mt-2 w-full text-[0.84rem]"><tbody>
                    {cost.rows.map((r) => <tr key={r.id} className="border-t border-line first:border-t-0"><td className="py-1.5">{r.fullName}</td><td className="py-1.5 text-ink-3">{t(`common.method.${r.method}`)}</td><td className="num py-1.5 text-right">{fmtMoney(locale, r.eur)}</td><td className="num py-1.5 text-right text-ink-3">/ {fmtMoney(locale, r.planned)}</td></tr>)}
                  </tbody></table>
                </details>
              )}
              <ul className="mt-3 flex flex-col gap-1 text-[0.8rem] text-ink-3">
                {cost.missingPayroll > 0 && <li className="text-warn">{t("admin.costMissingPayroll", { n: cost.missingPayroll })} <Link href="/app/admin/costs" className="underline underline-offset-2">{t("nav.costs")} →</Link></li>}
                {cost.missingRate > 0 && <li className="text-warn">{t("admin.costMissingRate", { n: cost.missingRate })}</li>}
                {wp && <li>{t("admin.costWpNote")}{cost.unallocated > 0 ? ` ${t("admin.costUnallocated", { amount: fmtMoney(locale, cost.unallocated) })}` : ""}</li>}
                <li>{t(cost.usesReportingRate ? "admin.costRateReporting" : "admin.costRatePlan", { rate: fmtValue(locale, cost.rate) })}</li>
              </ul>
            </>
          )}
        </Panel>

        {/* ── Tangible outputs ── */}
        <Panel title={t("admin.outputs")} aside={<Link href="/app/outputs" className="flex items-center gap-1 hover:text-ink">{t("nav.outputs")}<ArrowUpRight className="size-3.5" /></Link>} bodyClassName="p-0">
          {outputs.length === 0 ? <div className="p-4"><EmptyState title={t("admin.noPriority")}>{t("admin.noPriorityHint")}</EmptyState></div> : (
            <ul>
              {outputs.map(({ output, zafer }) => {
                const target = output.zaferObligation.value;
                const has = !!zafer && zafer.records > 0;
                return (
                  <li key={output.id} className="border-b border-line last:border-b-0">
                    <Link href={`/app/outputs/${output.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 hover:bg-surface-2">
                      <span className="min-w-0 truncate text-[0.9rem]">{name(output)}</span>
                      <span className="num whitespace-nowrap text-[0.9rem]"><span className={cn("font-medium", !has && "text-ink-3")}>{has ? fmtValue(locale, zafer!.sum) : "—"}</span><span className="text-ink-3"> / {target != null ? fmtValue(locale, target) : "—"} {unitLabel(t, output.zaferObligation.unit)}</span></span>
                      {target != null && <Meter value={zafer?.sum ?? 0} max={target} tone={(zafer?.sum ?? 0) >= target ? "ok" : "turq"} className="col-span-2 h-1" label={name(output)} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Delays against the baseline ── */}
      <Panel id="delays" title={t("admin.delays")} aside={<span className="num">{plan.delays.length}</span>} className="mt-6 scroll-mt-20" bodyClassName="p-0">
        {plan.delays.length === 0 ? <p className="p-4 text-[0.88rem] text-ink-3">{plan.hasStart ? t("admin.noDelays") : t("admin.noStartBody")}</p> : (
          <div className="max-h-[30rem] overflow-auto scroll-thin">
            <table className="tbl min-w-[46rem]">
              <thead className="sticky top-0"><tr><th>{t("common.code")}</th><th>{t("admin.item")}</th><th>{t("admin.laneBaseline")}</th><th>{t("admin.laneCurrent")}</th><th>{t("common.status")}</th><th className="r">{t("admin.late")}</th></tr></thead>
              <tbody>
                {plan.delays.map((d) => (
                  <tr key={d.id}>
                    <td><WpChip code={d.wpCode} className="mr-2" /><span className={cn("code", d.level === "activity" && "text-ink")}>{d.code}</span></td>
                    <td className="max-w-[30rem]"><span className={d.level === "activity" ? "font-semibold" : undefined}>{name(d)}</span>{d.level === "activity" && <Badge tone="outline" className="ml-2">{t("admin.mainActivity")}</Badge>}</td>
                    <td className="num whitespace-nowrap text-[0.82rem]">{d.baseMonth ? monthLabel(locale, d.baseMonth) : "—"}<span className="block text-ink-3">{fmtDate(locale, d.baseEnd)}</span></td>
                    <td className="num whitespace-nowrap text-[0.82rem]">{d.curMonth ? monthLabel(locale, d.curMonth) : "—"}{d.curEnd && d.baseEnd && d.curEnd > d.baseEnd ? <span className="block text-warn">{fmtDate(locale, d.curEnd)}</span> : <span className="block text-ink-3">{fmtDate(locale, d.curEnd)}</span>}</td>
                    <td><Badge tone={planTone[d.status]}>{t(`common.plan.${d.status}`)}</Badge></td>
                    <td className="num r whitespace-nowrap text-red">{t("admin.days", { n: d.daysLate })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* ── Parents' current finish forecast & sub-activities outside the parent window ── */}
        <Panel id="outside" title={t("admin.forecast")} aside={<span className="num">{plan.forecasts.length} · {plan.outside.length}</span>} className="scroll-mt-20" bodyClassName="p-0">
          {plan.forecasts.length + plan.outside.length === 0 ? <p className="p-4 text-[0.88rem] text-ink-3">{t("admin.noForecast")}</p> : (
            <>
              {plan.forecasts.length > 0 && (
                <table className="tbl"><thead><tr><th>{t("common.activity")}</th><th className="r">{t("admin.refEnd")}</th><th className="r">{t("admin.forecastEnd")}</th><th className="r">{t("admin.diff")}</th></tr></thead><tbody>
                  {plan.forecasts.map((f) => (
                    <tr key={f.id}><td><span className="code mr-2">{f.code}</span>{name(f)}</td><td className="num r">{monthLabel(locale, f.refMonth)}</td><td className="num r font-medium">{monthLabel(locale, f.forecastMonth)}</td><td className={cn("num r", f.forecastMonth > f.refMonth ? "text-red" : "text-ok")}>{f.forecastMonth > f.refMonth ? "+" : ""}{f.forecastMonth - f.refMonth}</td></tr>
                  ))}
                </tbody></table>
              )}
              {plan.outside.length > 0 && (
                <ul className={plan.forecasts.length ? "border-t border-ink" : undefined}>
                  {plan.outside.map((o) => (
                    <li key={o.id} className="border-b border-line px-4 py-3 last:border-b-0">
                      <p className="text-[0.9rem]"><span className="code mr-2">{o.code}</span>{name(o)}</p>
                      <p className="num mt-1 text-[0.78rem] text-ink-2">{monthsLabel(locale, o.months)} <span className="text-ink-3">· {t("admin.parentWindow", { code: o.parentCode, months: monthsLabel(locale, o.parentMonths) })}</span> <span className="text-red">· {t("admin.outsideMonths", { months: o.outside.join(", ") })}</span></p>
                      {o.reason && <p className="mt-1 text-[0.82rem] text-ink-2"><span className="label mr-2">{t("common.reason")}</span>{o.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>

        {/* ── Evidence awaiting an English version ── */}
        <Panel id="evidence" title={t("admin.attEvidenceEn")} aside={<span className="num">{att.evidenceAwaitingEn.length}</span>} className="scroll-mt-20" bodyClassName="p-0">
          {att.evidenceAwaitingEn.length === 0 ? <p className="p-4 text-[0.88rem] text-ink-3">{t("admin.noEvidencePending")}</p> : (
            <ul className="max-h-[26rem] overflow-auto scroll-thin">
              {att.evidenceAwaitingEn.map((l) => (
                <li key={l.id} className="grid grid-cols-[5.4rem_1fr] gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <span className="num text-[0.8rem] text-ink-2">{fmtDate(locale, l.workDate)}</span>
                  <span className="min-w-0"><span className="block text-[0.86rem] font-medium">{l.personName}</span><span className="block truncate text-[0.84rem] text-ink-2">{pick(locale, l.descriptionTr, l.descriptionEn)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
