import { and, eq } from "drizzle-orm";
import { CalendarCog } from "lucide-react";
import { db } from "@/db";
import { assignments } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getFrame, getPeople, getProject, getSubactivities, subMonths, assignmentMonths, outsideParent } from "@/lib/structure";
import { actualMonths, latestBaseline, uniqSorted } from "@/lib/plan-data";
import { diffDays, projectEnd, projectMonthOf, projectMonthWindow, todayInIstanbul } from "@/lib/dates";
import { fmtCentiHours, fmtDate, fmtHours, pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { PageHeader, TabLinks, Notice, EmptyState } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { GanttChart, type GRow, type MonthHead } from "@/components/plan/gantt-chart";

export const metadata = { title: "Takvim ve Gantt" };

export default async function GanttPage({ searchParams }: { searchParams: Promise<{ view?: string; wp?: string; person?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ t, locale }, project, { wps, outs, acts }, subs, people, baseline] = await Promise.all([getT(), getProject(), getFrame(), getSubactivities(), getPeople(), latestBaseline()]);
  const view = sp.view === "person" ? "person" : "general";
  const wpFilter = wps.find((w) => w.id === sp.wp)?.id ?? "";
  const D = project.durationMonths, start = project.startDate;
  const wpNum = (id: string) => Number(id.replace(/\D/g, "")[0] ?? 1);
  const outById = new Map(outs.map((o) => [o.id, o])), actById = new Map(acts.map((a) => [a.id, a]));

  const heads: MonthHead[] = Array.from({ length: D }, (_, i) => {
    const m = i + 1;
    if (!start) return { m };
    const w = projectMonthWindow(start, m), prev = m > 1 ? projectMonthWindow(start, m - 1).start.slice(0, 4) : "";
    return { m, date: fmtDate(locale, w.start, { month: "short" }).replace(".", ""), title: `${fmtDate(locale, w.start)}–${fmtDate(locale, w.end)}`, year: w.start.slice(0, 4) !== prev ? w.start.slice(0, 4) : undefined };
  });
  const today = todayInIstanbul();
  let todayPos: number | null = null;
  if (start) {
    const m = projectMonthOf(start, D, today);
    if (m) { const w = projectMonthWindow(start, m); todayPos = m - 1 + diffDays(w.start, today) / (diffDays(w.start, w.end) + 1); }
  }

  const actuals = await actualMonths(project);
  const baseSub = new Map((baseline?.snapshot.subactivities ?? []).map((s) => [s.id, s.months]));
  const baseAsg = new Map((baseline?.snapshot.assignments ?? []).map((a) => [a.id, a.months]));
  const rows: GRow[] = [];
  const mk = (base: string, extra: Record<string, string>) => { const q = new URLSearchParams({ ...(view === "person" ? { view } : {}), ...(wpFilter ? { wp: wpFilter } : {}), ...(sp.person ? { person: sp.person } : {}), ...extra }); for (const [k, v] of [...q]) if (!v) q.delete(k); const s = q.toString(); return s ? `${base}?${s}` : base; };

  let personId = "";
  const visiblePeople = can.seeTeam(user) ? people : people.filter((p) => p.id === user.personId);
  if (view === "general") {
    for (const w of wps.filter((x) => !wpFilter || x.id === wpFilter)) {
      const n = wpNum(w.id);
      const wOuts = outs.filter((o) => o.workPackageId === w.id);
      const wpRow: GRow = { id: w.id, parent: null, level: 0, code: w.code, name: pick(locale, w.nameTr, w.nameEn), wp: n, ref: w.months, fixed: true };
      rows.push(wpRow);
      const wCur: number[] = [], wAct: number[] = [];
      for (const o of wOuts) {
        const oRow: GRow = { id: o.id, parent: w.id, level: 1, code: o.code, name: pick(locale, o.nameTr, o.nameEn), wp: n, ref: o.months, fixed: true };
        rows.push(oRow);
        const oCur: number[] = [], oAct: number[] = [];
        for (const a of acts.filter((x) => x.outputId === o.id)) {
          const aSubs = subs.filter((s) => s.activityId === a.id);
          const cur = uniqSorted(aSubs.flatMap((s) => subMonths(s, a.months)));
          const act = actuals.byActivity.get(a.id) ?? [];
          rows.push({ id: a.id, parent: o.id, level: 2, code: a.code, name: pick(locale, a.nameTr, a.nameEn), wp: n, ref: a.months, current: cur.length ? cur : a.months, baseline: baseline ? a.months : null, actual: act, outside: outsideParent(cur, a.months), status: a.status, fixed: true, childCount: aSubs.length });
          oCur.push(...(cur.length ? cur : a.months)); oAct.push(...act);
          for (const s of aSubs) {
            const m = subMonths(s, a.months);
            rows.push({ id: s.id, parent: a.id, level: 3, code: s.code, name: pick(locale, s.nameTr, s.nameEn), wp: n, current: m, baseline: baseline ? baseSub.get(s.id) ?? null : null, actual: actuals.bySub.get(s.id) ?? [], outside: outsideParent(m, a.months), status: s.status });
          }
        }
        oRow.current = uniqSorted(oCur); oRow.actual = uniqSorted(oAct); oRow.baseline = baseline ? o.months : null;
        wCur.push(...oCur); wAct.push(...oAct);
      }
      wpRow.current = uniqSorted(wCur); wpRow.actual = uniqSorted(wAct); wpRow.baseline = baseline ? w.months : null;
    }
  } else {
    personId = visiblePeople.find((p) => p.id === sp.person)?.id ?? (user.personId && visiblePeople.some((p) => p.id === user.personId) ? user.personId : visiblePeople[0]?.id ?? "");
    if (personId) {
      const person = people.find((p) => p.id === personId)!;
      const asgs = await db.select().from(assignments).where(and(eq(assignments.personId, personId), eq(assignments.active, true)));
      const subById = new Map(subs.map((s) => [s.id, s]));
      const items = asgs.map((a) => ({ a, s: subById.get(a.subactivityId) })).filter((x) => x.s).map((x) => { const act = actById.get(x.s!.activityId)!; const out = outById.get(act.outputId)!; return { ...x, s: x.s!, act, wpId: out.workPackageId }; })
        .filter((x) => !wpFilter || x.wpId === wpFilter).sort((x, y) => x.s.sort - y.s.sort);
      for (const w of wps) {
        const mine = items.filter((x) => x.wpId === w.id);
        if (!mine.length) continue;
        const n = wpNum(w.id);
        const wpRow: GRow = { id: w.id, parent: null, level: 0, code: w.code, name: pick(locale, w.nameTr, w.nameEn), wp: n, ref: w.months, fixed: true };
        rows.push(wpRow);
        const wCur: number[] = [];
        for (const act of acts) {
          const inAct = mine.filter((x) => x.act.id === act.id);
          if (!inAct.length) continue;
          const aCur: number[] = [];
          const aRow: GRow = { id: act.id, parent: w.id, level: 2, code: act.code, name: pick(locale, act.nameTr, act.nameEn), wp: n, ref: act.months, fixed: true };
          rows.push(aRow);
          for (const { a, s } of inAct) {
            const sm = subMonths(s, act.months), m = assignmentMonths(a, sm);
            const centi = (a.allocations ?? []).reduce((x, y) => x + y.planned_centi_hours, 0);
            const hours = person.planMethod === "hourly" ? (centi ? fmtCentiHours(locale, centi) : a.plannedMinutes ? fmtHours(locale, a.plannedMinutes, 1) : "") : "";
            rows.push({ id: a.id, parent: act.id, level: 3, code: s.code, name: pick(locale, a.taskDescriptionTr, a.taskDescriptionEn) || pick(locale, s.nameTr, s.nameEn), wp: n, current: m, baseline: baseline ? baseAsg.get(a.id) ?? null : null, outside: outsideParent(m, act.months), status: a.status, meta: [t(`common.resp.${a.responsibility}`), hours].filter(Boolean).join(" · ") });
            aCur.push(...m);
          }
          aRow.current = uniqSorted(aCur); wCur.push(...aCur);
        }
        wpRow.current = uniqSorted(wCur);
      }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={t("gantt.eyebrow")}
        title={t("gantt.title")}
        description={start ? t("gantt.descStart", { start: fmtDate(locale, start), end: fmtDate(locale, projectEnd(start, D)), n: D }) : t("gantt.descNoStart", { n: D })}
        actions={can.editPlan(user) ? <ButtonLink href="/app/admin/plan" variant="secondary"><CalendarCog className="size-4" />{t("gantt.editPlan")}</ButtonLink> : undefined}
      />
      <TabLinks className="mb-4" current={view} items={[{ key: "general", href: mk("/app/gantt", { view: "", person: "" }), label: t("gantt.tabGeneral") }, { key: "person", href: mk("/app/gantt", { view: "person" }), label: t("gantt.tabPerson") }]} />
      <form className="no-print mb-4 flex flex-wrap items-end gap-3" action="/app/gantt">
        {view === "person" && <input type="hidden" name="view" value="person" />}
        {view === "person" && (
          <label className="block"><span className="label mb-1 block">{t("gantt.selectPerson")}</span>
            <select name="person" defaultValue={personId} className="control w-64" disabled={visiblePeople.length < 2}>
              {visiblePeople.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
            {visiblePeople.length < 2 && <input type="hidden" name="person" value={personId} />}
          </label>
        )}
        <label className="block"><span className="label mb-1 block">{t("common.workPackage")}</span>
          <select name="wp" defaultValue={wpFilter} className="control w-64">
            <option value="">{t("gantt.allWps")}</option>
            {wps.map((w) => <option key={w.id} value={w.id}>{w.code} · {pick(locale, w.nameTr, w.nameEn).slice(0, 60)}</option>)}
          </select>
        </label>
        <button className="h-[2.35rem] rounded-sm border border-line-2 bg-surface px-3 text-[0.88rem] hover:border-ink">{t("common.apply")}</button>
        <p className="ml-auto text-[0.8rem] text-ink-3">{baseline ? t("gantt.baselineV", { v: baseline.version, date: fmtDate(locale, baseline.createdAt.toISOString()) }) : t("gantt.noBaseline")}</p>
      </form>
      {!start && <Notice tone="cobalt" className="mb-4" title={t("common.awaitingStart")} />}
      {view === "person" && !rows.length ? <EmptyState title={t("gantt.noAssignments")} /> : (
        <div className="relative">
          <GanttChart key={`${view}-${wpFilter}-${personId}`} rows={rows} heads={heads} todayPos={todayPos} hasBaseline={!!baseline} openLevel={view === "person" ? 3 : 2} itemLabel={t("gantt.colItem")} />
        </div>
      )}
    </>
  );
}
