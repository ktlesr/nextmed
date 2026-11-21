import Link from "next/link";
import { eq, inArray, sql } from "drizzle-orm";
import { Lock, Plus, TriangleAlert } from "lucide-react";
import { db } from "@/db";
import { assignments, subactivities, workLogs } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { assignmentMonths, getChainOptions, getFrame, getPeople, getProject, outsideParent, subMonths } from "@/lib/structure";
import { uniqSorted } from "@/lib/plan-data";
import { monthsLabel, pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { Badge, planTone, WpChip } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { ActivityStatusForm, AssignmentsManager, CreateSubForm, EditSubForm, MoveSubForm, SubLifecycleForm, type AsgView, type PersonOpt, type SubView } from "@/components/plan/plan-forms";

export const metadata = { title: "Planı Düzenle" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ activity?: string; archived?: string }> }) {
  await requireRole(can.editPlan);
  const sp = await searchParams;
  const [{ t, locale }, project, { wps, outs, acts }, options, people, allSubs] = await Promise.all([getT(), getProject(), getFrame(), getChainOptions(), getPeople(true), db.select().from(subactivities).orderBy(subactivities.sort)]);
  const act = acts.find((a) => a.id === sp.activity);
  const showArchived = sp.archived === "1";
  const personOpts: PersonOpt[] = people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.fullName, hourly: p.planMethod === "hourly" }));
  const nextCodes: Record<string, string> = {};
  for (const a of acts) nextCodes[a.id] = `${a.code}.${Math.max(0, ...allSubs.filter((s) => s.activityId === a.id).map((s) => Number(s.code.split(".").pop()) || 0)) + 1}`;
  const D = project.durationMonths;

  let detail: React.ReactNode = <EmptyState title={t("gantt.pickActivity")}>{t("gantt.pickActivityBody")}</EmptyState>;
  if (act) {
    const out = outs.find((o) => o.id === act.outputId)!, wp = wps.find((w) => w.id === out.workPackageId)!;
    const subs = allSubs.filter((s) => s.activityId === act.id);
    const ids = subs.map((s) => s.id);
    const [asgs, hist] = ids.length ? await Promise.all([
      db.select().from(assignments).where(inArray(assignments.subactivityId, ids)),
      db.select({ id: workLogs.subactivityId, n: sql<number>`count(*)::int` }).from(workLogs).where(inArray(workLogs.subactivityId, ids)).groupBy(workLogs.subactivityId),
    ]) : [[], []];
    const withHistory = new Set(hist.map((h) => h.id));
    const pName = new Map(people.map((p) => [p.id, p]));
    const forecast = uniqSorted(subs.filter((s) => s.active).flatMap((s) => subMonths(s, act.months)));
    const shown = subs.filter((s) => showArchived || s.active);
    detail = (
      <div className="flex min-w-0 flex-col gap-6">
        <Panel title={<span className="flex items-center gap-2"><Lock className="size-3.5 text-ink-3" />{t("gantt.fixed")}</span>} aside={t("gantt.frameLocked")}>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-ink-2"><WpChip code={wp.code} /><span>{pick(locale, wp.nameTr, wp.nameEn)}</span><span className="code">{out.code}</span><span>{pick(locale, out.nameTr, out.nameEn)}</span></p>
          <h2 className="mt-2 text-xl"><span className="num mr-2 text-cobalt">{act.code}</span>{pick(locale, act.nameTr, act.nameEn)}</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-2 text-[0.88rem] sm:grid-cols-2">
            <div><dt className="label">{t("gantt.refMonths")}</dt><dd className="num mt-0.5">{monthsLabel(locale, act.months)}</dd></div>
            <div><dt className="label">{t("gantt.forecastMonths")}</dt><dd className="num mt-0.5 flex items-center gap-2">{monthsLabel(locale, forecast)}{outsideParent(forecast, act.months).length > 0 && <span className="flex items-center gap-1 text-red"><TriangleAlert className="size-3.5" />{t("gantt.outside")}</span>}</dd></div>
          </dl>
          <div className="mt-5 border-t border-line pt-4">
            <p className="label mb-3">{t("gantt.activityStatus")}</p>
            <ActivityStatusForm key={act.id} id={act.id} status={act.status} completedOn={act.completedOn} resultNote={pick(locale, act.resultNoteTr, act.resultNoteEn)} />
          </div>
        </Panel>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-sans text-[1rem] font-semibold tracking-normal">{t("gantt.subs")} <span className="num ml-1 text-ink-3">{subs.filter((s) => s.active).length}</span></h2>
            <div className="flex items-center gap-3">
              <Link className="text-[0.84rem] text-ink-2 underline-offset-2 hover:text-ink hover:underline" href={`/app/admin/plan?activity=${act.id}${showArchived ? "" : "&archived=1"}`}>{showArchived ? t("gantt.hideArchived") : t("gantt.showArchived")}</Link>
              <Modal side trigger={<><Plus className="size-4" />{t("gantt.addSub")}</>} title={t("gantt.addSub")} description={`${act.code} · ${pick(locale, act.nameTr, act.nameEn)}`}>
                <CreateSubForm options={options} people={personOpts} duration={D} defaultActivity={act.id} nextCodes={nextCodes} />
              </Modal>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t("common.subactivity")}</th><th>{t("gantt.colPeriod")}</th><th>{t("gantt.colAssignees")}</th><th>{t("common.status")}</th><th className="r">{t("common.actions")}</th></tr></thead>
              <tbody>
                {shown.map((s) => {
                  const m = uniqSorted(subMonths(s, act.months));
                  const mine = asgs.filter((a) => a.subactivityId === s.id && a.active);
                  const out2 = outsideParent(m, act.months);
                  const view: SubView = { id: s.id, code: s.code, name: pick(locale, s.nameTr, s.nameEn), description: pick(locale, s.descriptionTr, s.descriptionEn), mode: s.scheduleMode, months: m, status: s.status, completedOn: s.completedOn, resultNote: pick(locale, s.resultNoteTr, s.resultNoteEn), active: s.active, hasHistory: withHistory.has(s.id) };
                  const aViews: AsgView[] = mine.map((a) => ({ id: a.id, personId: a.personId, personName: pName.get(a.personId)?.fullName ?? a.personId, hourly: pName.get(a.personId)?.planMethod === "hourly", responsibility: a.responsibility, task: pick(locale, a.taskDescriptionTr, a.taskDescriptionEn), mode: a.scheduleMode, months: uniqSorted(assignmentMonths(a, m)), centi: (a.allocations ?? []).reduce((x, y) => x + y.planned_centi_hours, 0), allocMonths: (a.allocations ?? []).length, status: a.status }));
                  return (
                    <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                      <td className="max-w-[30rem]"><span className="code mr-2 text-ink">{s.code}</span>{view.name}{!s.active && <Badge tone="outline" className="ml-2">{t("gantt.archived")}</Badge>}</td>
                      <td className="whitespace-nowrap"><span className="num text-[0.84rem]">{monthsLabel(locale, m)}</span><span className="block text-[0.74rem] text-ink-3">{s.scheduleMode === "custom" ? t("gantt.customShort") : t("gantt.inheritShort")}</span>{out2.length > 0 && <span className="mt-0.5 flex items-center gap-1 text-[0.74rem] text-red" title={s.outsideParentReason ?? ""}><TriangleAlert className="size-3" />{t("gantt.outside")}</span>}</td>
                      <td className="text-[0.84rem]">{mine.length ? mine.slice(0, 3).map((a) => pName.get(a.personId)?.fullName.split(" ")[0]).join(", ") + (mine.length > 3 ? ` +${mine.length - 3}` : "") : "—"}</td>
                      <td><Badge tone={planTone[s.status]} dot>{t(`common.plan.${s.status}`)}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {s.active && <Modal side trigger={t("common.edit")} triggerVariant="secondary" triggerSize="sm" title={t("gantt.editSub")} description={`${s.code} · ${act.code}`}>
                            <EditSubForm sub={view} parentMonths={act.months} duration={D} assignments={aViews} />
                          </Modal>}
                          {s.active && <Modal side trigger={<>{t("gantt.assignmentsTitle")} <span className="num text-ink-3">{mine.length}</span></>} triggerVariant="ghost" triggerSize="sm" title={t("gantt.assignmentsOf", { code: s.code })} description={view.name}>
                            <AssignmentsManager subId={s.id} subMonths={m} duration={D} people={personOpts} assignments={aViews} />
                          </Modal>}
                          <Modal trigger={t("gantt.manage")} triggerVariant="ghost" triggerSize="sm" title={`${s.code} · ${t("gantt.manage")}`} description={view.name}>
                            <div className="flex flex-col gap-6">
                              <SubLifecycleForm sub={view} />
                              {s.active && <div className="rule-top pt-4"><p className="label mb-2">{t("gantt.moveTitle")}</p><MoveSubForm sub={view} options={options} /></div>}
                            </div>
                          </Modal>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-ink-3">{t("common.empty")}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow={t("gantt.planEyebrow")} title={t("gantt.planTitle")} description={t("gantt.planDesc")}
        actions={!act ? <Modal side trigger={<><Plus className="size-4" />{t("gantt.addSub")}</>} title={t("gantt.addSub")}><CreateSubForm options={options} people={personOpts} duration={D} nextCodes={nextCodes} /></Modal> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
        <nav className="panel scroll-thin self-start overflow-y-auto lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)]" aria-label={t("common.activity")}>
          {wps.map((w) => (
            <div key={w.id} className="border-b border-line last:border-b-0">
              <p className="flex items-center gap-2 bg-surface-2/60 px-3 py-1.5"><WpChip code={w.code} /><span className="truncate text-[0.76rem] text-ink-2">{pick(locale, w.nameTr, w.nameEn)}</span></p>
              <ul>
                {acts.filter((a) => outs.find((o) => o.id === a.outputId)?.workPackageId === w.id).map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/admin/plan?activity=${a.id}`} scroll={false} aria-current={a.id === act?.id ? "page" : undefined} className={cn("flex items-baseline gap-2 px-3 py-1.5 text-[0.84rem]", a.id === act?.id ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                      <span className="num shrink-0 text-[0.76rem] font-medium">{a.code}</span>
                      <span className="min-w-0 flex-1 truncate">{pick(locale, a.nameTr, a.nameEn)}</span>
                      <span className="num shrink-0 text-[0.7rem] opacity-70">{allSubs.filter((s) => s.activityId === a.id && s.active).length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {detail}
      </div>
    </>
  );
}
