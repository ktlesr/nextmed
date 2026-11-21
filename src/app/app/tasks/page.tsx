import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { assignmentMonths, getFrame, getPeople, getProject, getSubactivities, subMonths } from "@/lib/structure";
import { monthRuns, projectMonthWindow } from "@/lib/dates";
import { RESPONSIBILITIES } from "@/lib/constants";
import { fmtCentiHours, fmtDate, fmtHours, fmtNumber, isFallback, monthsLabel, pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { DefList, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { Badge, planTone, WpChip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Görevler" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ person?: string; wp?: string; resp?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ t, locale }, project, { wps, outs, acts }, subs, people] = await Promise.all([getT(), getProject(), getFrame(), getSubactivities(true), getPeople()]);
  const selectable = can.seeTeam(user) ? people : people.filter((p) => p.id === user.personId);
  const person = selectable.find((p) => p.id === sp.person) ?? selectable.find((p) => p.id === user.personId) ?? (can.seeTeam(user) ? selectable[0] : undefined);
  if (!person) return (<><PageHeader eyebrow={t("tasks.eyebrow")} title={t("tasks.title")} /><EmptyState title={t("tasks.noPerson")}>{t("tasks.noPersonBody")}</EmptyState></>);

  const wpF = wps.find((w) => w.id === sp.wp)?.id ?? "", respF = RESPONSIBILITIES.find((r) => r === sp.resp) ?? "";
  const subById = new Map(subs.map((s) => [s.id, s])), actById = new Map(acts.map((a) => [a.id, a])), outById = new Map(outs.map((o) => [o.id, o])), wpById = new Map(wps.map((w) => [w.id, w]));
  const all = (await db.select().from(assignments).where(and(eq(assignments.personId, person.id), eq(assignments.active, true))))
    .map((a) => { const s = subById.get(a.subactivityId)!; const act = actById.get(s.activityId)!; const out = outById.get(act.outputId)!; return { a, s, act, out, wp: wpById.get(out.workPackageId)! }; })
    .filter((x) => x.s.active).sort((x, y) => x.s.sort - y.s.sort);
  const list = all.filter((x) => (!wpF || x.wp.id === wpF) && (!respF || x.a.responsibility === respF));
  const start = project.startDate;
  const dates = (months: number[]) => start ? monthRuns(months).map(([a, b]) => `${fmtDate(locale, projectMonthWindow(start, a).start)}–${fmtDate(locale, projectMonthWindow(start, b).end)}`) : [];
  const hourly = person.planMethod === "hourly";
  const span = person.endProjectMonth - person.startProjectMonth + 1;
  const plan = person.planMethod === "fixed_ratio"
    ? <span className="num">{t("tasks.fixedRatio", { p: fmtNumber(locale, Number(person.fixedRatio ?? 0) * 100, Number(person.fixedRatio ?? 0) * 1000 % 10 ? 1 : 0) })}</span>
    : hourly
      ? <span className="num">{t("tasks.hourlyTotal", { h: fmtHours(locale, person.totalPlannedMinutes ?? 0, 0) })} · {t("tasks.hourlyAvg", { h: fmtHours(locale, (person.totalPlannedMinutes ?? 0) / span, 2) })}</span>
      : <span>{t("tasks.unbudgeted")} · <span className="num">{t("tasks.unbudgetedSub")}</span></span>;

  return (
    <>
      <PageHeader eyebrow={t("tasks.eyebrow")} title={person.fullName} description={pick(locale, person.projectRoleTr, person.projectRoleEn)}
        actions={<ButtonLink variant="secondary" href={`/app/gantt?view=person&person=${person.id}`}>{t("tasks.openGantt")}</ButtonLink>} />
      <div className="grid gap-6 xl:grid-cols-[19rem_1fr]">
        <Panel title={t("tasks.duties")} className="self-start">
          <p className="text-[0.92rem] text-ink-2">{pick(locale, person.generalDutiesTr, person.generalDutiesEn) || "—"}</p>
          {isFallback(locale, person.generalDutiesTr, person.generalDutiesEn) && <p className="mt-1 text-[0.76rem] text-warn">{t("common.sourceShown")}</p>}
          <DefList className="mt-5 border-t border-line pt-4" items={[
            [t("tasks.orgTitle"), pick(locale, person.organizationTitleTr, person.organizationTitleEn) || "—"],
            [t("tasks.projectRole"), pick(locale, person.projectRoleTr, person.projectRoleEn) || "—"],
            [t("tasks.workPlan"), plan],
            [t("tasks.period"), <span key="p" className="num">{monthsLabel(locale, [person.startProjectMonth, person.endProjectMonth]).replace(", ", "–")}</span>],
            ...(person.provinceTr ? [[t("tasks.province"), person.provinceTr] as [string, string]] : []),
          ]} />
        </Panel>
        <div className="min-w-0">
          <form className="no-print mb-4 flex flex-wrap items-end gap-3">
            {selectable.length > 1 && (
              <label className="block"><span className="label mb-1 block">{t("tasks.selectPerson")}</span>
                <select name="person" defaultValue={person.id} className="control w-56">{selectable.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select>
              </label>
            )}
            <label className="block"><span className="label mb-1 block">{t("common.workPackage")}</span>
              <select name="wp" defaultValue={wpF} className="control w-44"><option value="">{t("tasks.allWps")}</option>{wps.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</select>
            </label>
            <label className="block"><span className="label mb-1 block">{t("tasks.colResp")}</span>
              <select name="resp" defaultValue={respF} className="control w-52"><option value="">{t("tasks.allResp")}</option>{RESPONSIBILITIES.map((r) => <option key={r} value={r}>{t(`common.resp.${r}`)}</option>)}</select>
            </label>
            <button className="h-[2.35rem] rounded-sm border border-line-2 bg-surface px-3 text-[0.88rem] hover:border-ink">{t("common.apply")}</button>
            <p className="num ml-auto text-[0.8rem] text-ink-3">{t("tasks.count", { n: list.length })}{list.length !== all.length ? ` / ${all.length}` : ""}</p>
          </form>
          {list.length === 0 ? <EmptyState title={t("tasks.none")} /> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>{t("tasks.colSub")}</th><th>{t("tasks.colResp")}</th><th>{t("tasks.colPeriod")}</th>{hourly && <th className="r">{t("tasks.colHours")}</th>}<th>{t("tasks.colStatus")}</th></tr></thead>
                <tbody>
                  {list.map(({ a, s, act, out, wp }) => {
                    const months = assignmentMonths(a, subMonths(s, act.months));
                    const centi = (a.allocations ?? []).reduce((x, y) => x + y.planned_centi_hours, 0);
                    const task = pick(locale, a.taskDescriptionTr, a.taskDescriptionEn), sname = pick(locale, s.nameTr, s.nameEn);
                    return (
                      <tr key={a.id}>
                        <td className="min-w-[18rem]">
                          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.76rem] text-ink-3">
                            <WpChip code={wp.code} /><span className="code" title={pick(locale, out.nameTr, out.nameEn)}>{out.code}</span>
                            <span className="code" title={pick(locale, act.nameTr, act.nameEn)}>{act.code}</span>
                            <span className="truncate">{pick(locale, act.nameTr, act.nameEn)}</span>
                          </p>
                          <p className="mt-1"><span className="code mr-2 text-ink">{s.code}</span><span className="font-medium">{sname}</span></p>
                          {task && task !== sname && <p className="mt-1 text-[0.86rem] text-ink-2">{task}</p>}
                        </td>
                        <td><Badge tone={a.responsibility === "lead" ? "cobalt" : "outline"}>{t(`common.resp.${a.responsibility}`)}</Badge></td>
                        <td className="whitespace-nowrap">
                          <span className="num text-[0.84rem]">{monthsLabel(locale, months)}</span>
                          {a.scheduleMode === "custom" && <span className="ml-2 text-[0.72rem] text-ink-3">{t("tasks.customPeriod")}</span>}
                          {dates(months).slice(0, 3).map((d) => <span key={d} className="num block text-[0.72rem] text-ink-3">{d}</span>)}
                          {dates(months).length > 3 && <span className="num block text-[0.72rem] text-ink-3">+{dates(months).length - 3}</span>}
                        </td>
                        {hourly && <td className="r num whitespace-nowrap">{centi ? fmtCentiHours(locale, centi) : a.plannedMinutes ? fmtHours(locale, a.plannedMinutes, 1) : "—"}</td>}
                        <td><Badge tone={planTone[a.status]} dot>{t(`common.plan.${a.status}`)}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {can.editPlan(user) && <p className="mt-3 text-[0.84rem] text-ink-3"><Link href="/app/admin/plan" className="text-cobalt underline-offset-2 hover:underline">{t("gantt.editPlan")} →</Link></p>}
        </div>
      </div>
    </>
  );
}
