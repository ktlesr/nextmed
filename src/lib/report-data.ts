import "server-only";
import { and, asc, between, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, assignments, concreteOutputs, followUps, meetings, observations, people, procurements, subactivities, travels } from "@/db/schema";
import type { Locale, TFn } from "@/i18n";
import { can, type SessionUser } from "./auth";
import { calendarMonthBounds, projectMonthOf, todayInIstanbul } from "./dates";
import { listFiles, type FileMeta } from "./files";
import { fmtDate, fmtDuration, fmtHours, fmtMoney, fmtMonthYear, fmtNumber, fmtPercent, monthLabel, monthsLabel, pick } from "./format";
import { getFrame, getPeople, getProject, subMonths } from "./structure";
import { monthlyTargets, monthlyWorkTotals } from "./targets";
import { fetchLogs, monthState, type LogRow, type MonthState } from "./work";

export type ReportView = "person" | "wp" | "general";
export type Cell = string | { text: string; files?: FileMeta[]; status?: string; tone?: "ok" | "warn" | "cobalt" | "neutral" | "red"; strong?: boolean };
export type Column = { label: string; align?: "r"; mono?: boolean; wide?: boolean };
export type Section = { heading: string; code?: string; note?: string; table?: { head: Column[]; rows: Cell[][]; foot?: Cell[][] }; empty?: string };
export type ReportDoc = {
  view: ReportView; title: string; subtitle: string; period: string; fileName: string;
  meta: [string, string][]; stats: { label: string; value: string; sub?: string; tone?: "ok" | "cobalt" | "warn" }[]; sections: Section[];
  year: number; month: number; monthState: MonthState; scopeKey: string;
};
export type ReportRequest = { view: ReportView; year: number; month: number; personId: string | null; wpId: string | null };

export const cellText = (c: Cell): string => (typeof c === "string" ? c : c.files?.length ? c.files.map((f) => `[${f.lang.toUpperCase()}] ${f.name}`).join("\n") : c.text);

/**
 * Who may open which report: a team member only their own personal report; coordination, finance and admin
 * may open any person, work-package and project-wide report. Returns null when the request is not allowed.
 */
export function resolveReportRequest(user: SessionUser, p: { view?: string; year: number; month: number; person?: string; wp?: string }, firstWpId: string): ReportRequest | null {
  const view: ReportView = p.view === "wp" || p.view === "general" ? p.view : "person";
  if (!can.seeTeam(user)) {
    if (view !== "person" || !user.personId || (p.person && p.person !== user.personId)) return null;
    return { view, year: p.year, month: p.month, personId: user.personId, wpId: null };
  }
  return { view, year: p.year, month: p.month, personId: view === "person" ? p.person || user.personId : null, wpId: view === "wp" ? p.wp || firstWpId : null };
}

const sumMin = (rows: LogRow[], status: string) => rows.filter((r) => r.status === status).reduce((a, r) => a + r.minutes, 0);
const uniq = <T,>(a: T[]) => [...new Set(a)];
const filesOf = (rows: LogRow[], files: Map<string, FileMeta[]>) => rows.flatMap((r) => files.get(r.id) ?? []);

/**
 * All three views read the same daily records, filtered by the day the work was done. Approved time is the
 * main total; time still in review is a separate line. Cancelled records never count. A record without a
 * sub-activity is counted once, under its activity.
 */
export async function buildReport(req: ReportRequest, locale: Locale, t: TFn): Promise<ReportDoc | null> {
  const { year, month } = req;
  const { start, end } = calendarMonthBounds(year, month);
  const [project, { wps, outs, acts }, persons, mState] = await Promise.all([getProject(), getFrame(), getPeople(true), monthState(year, month)]);
  const period = fmtMonthYear(locale, year, month);
  const ymKey = `${year}-${String(month).padStart(2, "0")}`;
  const name = (o: { nameTr: string | null; nameEn: string | null }) => pick(locale, o.nameTr, o.nameEn);
  const dur = (m: number) => fmtDuration(locale, m);
  const st = (s: string) => ({ text: t(`common.st.${s}`), status: s });
  const planSt = (s: string): Cell => ({ text: t(`common.plan.${s}`), tone: s === "completed" ? "ok" : s === "in_progress" ? "cobalt" : s === "in_review" ? "warn" : "neutral" });
  const base = { year, month, monthState: mState, period, subtitle: `${project.name} · ${pick(locale, project.partnerTr, project.partnerEn)} (${project.partnerCode})` };
  const generated: [string, string] = [t("reports.generated"), fmtDate(locale, todayInIstanbul())];
  const stateRow: [string, string] = [t("reports.monthStatus"), t(`reports.mstate.${mState}`)];

  /* ───────── Person ───────── */
  if (req.view === "person") {
    const person = persons.find((p) => p.id === req.personId);
    if (!person) return null;
    const logs = await fetchLogs({ personId: person.id, from: start, to: end, excludeCancelled: true });
    const [files, targets, totals] = await Promise.all([listFiles("work_log", logs.map((l) => l.id)), monthlyTargets([person], project, year, month), monthlyWorkTotals([person.id], year, month)]);
    const target = targets.get(person.id), tt = totals.get(person.id)!;
    const goal = target?.kind === "target" ? target.minutes : null;
    const byAct = new Map<string, LogRow[]>();
    for (const l of logs) byAct.set(l.activityId, [...(byAct.get(l.activityId) ?? []), l]);
    return {
      ...base, view: "person", scopeKey: `person:${person.id}`, title: t("reports.titlePerson", { name: person.fullName }), fileName: `PDS4NextMed_${ymKey}_${person.fullName.replace(/\s+/g, "_")}`,
      meta: [[t("common.person"), person.fullName], [t("reports.orgTitle"), pick(locale, person.organizationTitleTr, person.organizationTitleEn) || "—"], [t("reports.projectRole"), pick(locale, person.projectRoleTr, person.projectRoleEn) || "—"],
        [t("work.method"), t(`common.method.${person.planMethod}`) + (person.planMethod === "fixed_ratio" && person.fixedRatio ? ` · ${fmtPercent(locale, Number(person.fixedRatio), 1)}` : "")], [t("common.period"), period], stateRow, generated],
      stats: [
        { label: t("work.mTarget"), value: goal != null ? fmtHours(locale, goal, 2) : "—", sub: target && target.kind !== "target" ? t(`work.state.${target.kind === "no_plan" ? "noPlan" : target.kind === "awaiting_start" ? "awaitingStart" : target.kind === "awaiting_reference" ? "awaitingReference" : "noTarget"}`) : undefined },
        { label: t("work.mApproved"), value: dur(tt.approved), tone: "ok", sub: goal ? fmtPercent(locale, tt.approved / goal, 1) : undefined },
        { label: t("work.mInReview"), value: dur(tt.inReview), tone: tt.inReview ? "cobalt" : undefined, sub: t("reports.separateLine") },
        { label: t("work.mRemaining"), value: goal != null ? dur(Math.max(0, goal - tt.approved)) : "—", sub: goal != null && tt.approved > goal ? `+${dur(tt.approved - goal)} ${t("work.overTarget")}` : undefined },
      ],
      sections: [
        {
          heading: t("reports.dailyRecords"), empty: t("reports.noRecords"),
          table: {
            head: [{ label: t("common.date"), mono: true }, { label: t("work.duration"), align: "r", mono: true }, { label: "WP", mono: true }, { label: t("common.output"), mono: true }, { label: t("common.activity") }, { label: t("common.subactivity") }, { label: t("work.description"), wide: true }, { label: t("common.status") }, { label: t("work.evidence") }],
            rows: logs.map((l) => [fmtDate(locale, l.workDate), dur(l.minutes), l.wpCode, l.outCode, `${l.actCode} ${name({ nameTr: l.actTr, nameEn: l.actEn })}`, l.subCode ? `${l.subCode} ${name({ nameTr: l.subTr, nameEn: l.subEn })}` : "—", pick(locale, l.descriptionTr, l.descriptionEn), st(l.status), { text: "—", files: files.get(l.id) ?? [] }]),
            foot: logs.length ? [
              [{ text: t("reports.approvedTotal"), strong: true }, { text: dur(tt.approved), strong: true }, "", "", "", "", "", "", ""],
              [t("reports.inReviewLine"), dur(tt.inReview), "", "", "", "", "", "", ""],
              ...(tt.draft + tt.changesRequested ? [[t("reports.notSubmittedLine"), dur(tt.draft + tt.changesRequested), "", "", "", "", "", "", ""] as Cell[]] : []),
            ] : undefined,
          },
        },
        {
          heading: t("reports.byActivity"), empty: t("reports.noRecords"),
          table: {
            head: [{ label: "WP", mono: true }, { label: t("common.activity"), wide: true }, { label: t("reports.records"), align: "r", mono: true }, { label: t("work.mApproved"), align: "r", mono: true }, { label: t("work.mInReview"), align: "r", mono: true }],
            rows: [...byAct.values()].map((rows) => [rows[0].wpCode, `${rows[0].actCode} ${name({ nameTr: rows[0].actTr, nameEn: rows[0].actEn })}`, String(rows.length), dur(sumMin(rows, "approved")), dur(sumMin(rows, "in_review"))]),
          },
        },
      ],
    };
  }

  /* ───────── Work package ───────── */
  if (req.view === "wp") {
    const wp = wps.find((w) => w.id === req.wpId);
    if (!wp) return null;
    const logs = await fetchLogs({ workPackageId: wp.id, from: start, to: end, excludeCancelled: true });
    const files = await listFiles("work_log", logs.map((l) => l.id));
    const wpOuts = outs.filter((o) => o.workPackageId === wp.id);
    const wpActs = acts.filter((a) => wpOuts.some((o) => o.id === a.outputId));
    const fu = wpActs.length ? await db.select({ f: followUps, who: people.fullName }).from(followUps).leftJoin(people, eq(people.id, followUps.assigneeId)).where(and(inArray(followUps.activityId, wpActs.map((a) => a.id)), eq(followUps.done, false))).orderBy(asc(followUps.dueDate)) : [];
    const reportable = logs.filter((l) => l.status === "approved" || l.status === "in_review");
    const sections: Section[] = wpOuts.map((o) => {
      const rows: Cell[][] = [];
      for (const a of wpActs.filter((x) => x.outputId === o.id)) {
        const al = reportable.filter((l) => l.activityId === a.id);
        if (!al.length) continue;
        rows.push([
          { text: `${a.code} ${name(a)}`, strong: true },
          al.map((l) => `• ${fmtDate(locale, l.workDate, { day: "2-digit", month: "2-digit" })}${l.subCode ? ` [${l.subCode}]` : ""} ${pick(locale, l.descriptionTr, l.descriptionEn)}`).join("\n"),
          uniq(al.map((l) => l.personName)).join(", "),
          dur(sumMin(al, "approved")), dur(sumMin(al, "in_review")), planSt(a.status), { text: "—", files: filesOf(al, files) },
        ]);
      }
      return {
        heading: name(o), code: o.code, empty: t("reports.noWorkOutput"),
        table: { head: [{ label: t("common.activity") }, { label: t("reports.workDone"), wide: true }, { label: t("reports.contributors") }, { label: t("work.mApproved"), align: "r", mono: true }, { label: t("work.mInReview"), align: "r", mono: true }, { label: t("common.status") }, { label: t("work.evidence") }], rows },
      };
    });
    sections.push({
      heading: t("reports.followUps"), empty: t("reports.noFollowUps"),
      table: { head: [{ label: t("reports.followUp"), wide: true }, { label: t("common.responsible") }, { label: t("common.activity"), mono: true }, { label: t("reports.due"), mono: true }], rows: fu.map(({ f, who }) => [pick(locale, f.textTr, f.textEn), who ?? "—", wpActs.find((a) => a.id === f.activityId)?.code ?? "—", f.dueDate ? fmtDate(locale, f.dueDate) : "—"]) },
    });
    return {
      ...base, view: "wp", scopeKey: `wp:${wp.id}`, title: t("reports.titleWp", { code: wp.code, name: name(wp) }), fileName: `PDS4NextMed_${ymKey}_${wp.code}`,
      meta: [[t("common.workPackage"), `${wp.code} · ${name(wp)}`], [t("reports.refMonths"), monthsLabel(locale, wp.months)], [t("common.period"), period], stateRow, generated],
      stats: [
        { label: t("work.mApproved"), value: dur(sumMin(logs, "approved")), tone: "ok" },
        { label: t("work.mInReview"), value: dur(sumMin(logs, "in_review")), tone: sumMin(logs, "in_review") ? "cobalt" : undefined, sub: t("reports.separateLine") },
        { label: t("reports.contributors"), value: String(uniq(reportable.map((l) => l.personId)).length) },
        { label: t("reports.records"), value: String(reportable.length) },
      ],
      sections,
    };
  }

  /* ───────── Project-wide ───────── */
  const pm = project.startDate ? projectMonthOf(project.startDate, project.durationMonths, end > todayInIstanbul() ? todayInIstanbul() : end) ?? projectMonthOf(project.startDate, project.durationMonths, start) : null;
  const tsFrom = new Date(start + "T00:00:00+03:00"), tsTo = new Date(end + "T23:59:59+03:00");
  const [logs, subs, leadAsg, obs, meetingRows, procs, trv] = await Promise.all([
    fetchLogs({ from: start, to: end, excludeCancelled: true }),
    db.select().from(subactivities).where(eq(subactivities.active, true)).orderBy(asc(subactivities.sort)),
    db.select({ sub: assignments.subactivityId, who: people.fullName }).from(assignments).innerJoin(people, eq(people.id, assignments.personId)).where(and(eq(assignments.responsibility, "lead"), eq(assignments.active, true))),
    db.select({ o: observations, name: concreteOutputs }).from(observations).innerJoin(concreteOutputs, eq(concreteOutputs.id, observations.concreteOutputId)).where(between(observations.observedOn, start, end)).orderBy(asc(observations.observedOn)),
    db.select().from(meetings).where(and(gte(meetings.startsAt, tsFrom), lte(meetings.startsAt, tsTo), ne(meetings.status, "cancelled"))).orderBy(asc(meetings.startsAt)),
    db.select({ p: procurements, who: people.fullName }).from(procurements).leftJoin(people, eq(people.id, procurements.responsibleId)).where(ne(procurements.status, "cancelled")).orderBy(asc(procurements.createdAt)),
    db.select().from(travels).where(and(lte(travels.departDate, end), gte(travels.returnDate, start), ne(travels.status, "cancelled"))).orderBy(asc(travels.departDate)),
  ]);
  const decisions = meetingRows.length ? await db.select({ f: followUps, who: people.fullName }).from(followUps).leftJoin(people, eq(people.id, followUps.assigneeId)).where(and(eq(followUps.sourceType, "meeting"), inArray(followUps.sourceId, meetingRows.map((m) => m.id)))).orderBy(asc(followUps.createdAt)) : [];
  const actById = new Map(acts.map((a) => [a.id, a]));
  const wpOfAct = (activityId: string) => wps.find((w) => w.id === outs.find((o) => o.id === actById.get(activityId)?.outputId)?.workPackageId);
  const monthsOf = (s: (typeof subs)[number]) => subMonths(s, actById.get(s.activityId)?.months ?? []);
  const leads = new Map<string, string[]>();
  for (const a of leadAsg) leads.set(a.sub, [...(leads.get(a.sub) ?? []), a.who]);
  const reportable = logs.filter((l) => l.status === "approved" || l.status === "in_review");

  // Progress comes from the recorded status and completion date — never inferred from hours.
  const doneActs = acts.filter((a) => a.status === "completed" && a.completedOn && a.completedOn >= start && a.completedOn <= end);
  const doneSubs = subs.filter((s) => s.status === "completed" && s.completedOn && s.completedOn >= start && s.completedOn <= end);
  const milestones = pm ? acts.filter((a) => a.months.includes(pm) && (Math.max(...a.months) === pm || !a.months.includes(pm + 1))) : [];
  const delayed = pm ? subs.filter((s) => { const m = monthsOf(s); return s.status !== "completed" && m.length > 0 && Math.max(...m) < pm; }) : [];
  const next = pm && pm < project.durationMonths ? subs.filter((s) => s.status !== "completed" && monthsOf(s).includes(pm + 1)) : [];
  const CAP = 40;
  const capNote = (n: number) => (n > CAP ? t("reports.capNote", { shown: CAP, total: n }) : undefined);

  return {
    ...base, view: "general", scopeKey: "general", title: t("reports.titleGeneral"), fileName: `PDS4NextMed_${ymKey}_${locale === "tr" ? "Genel" : "General"}`,
    meta: [[t("common.period"), period], [t("common.projectMonth"), pm ? monthLabel(locale, pm) : t("common.awaitingStart")], stateRow, generated],
    stats: [
      { label: t("work.mApproved"), value: dur(sumMin(logs, "approved")), tone: "ok" },
      { label: t("work.mInReview"), value: dur(sumMin(logs, "in_review")), tone: sumMin(logs, "in_review") ? "cobalt" : undefined, sub: t("reports.separateLine") },
      { label: t("reports.completedCount"), value: String(doneActs.length + doneSubs.length), sub: t("reports.completedSub", { a: doneActs.length, s: doneSubs.length }) },
      { label: t("reports.delayed"), value: String(delayed.length), tone: delayed.length ? "warn" : undefined },
    ],
    sections: [
      {
        heading: t("reports.wpSummary"),
        table: {
          head: [{ label: "WP", mono: true }, { label: t("common.workPackage"), wide: true }, { label: t("reports.contributors"), align: "r", mono: true }, { label: t("reports.records"), align: "r", mono: true }, { label: t("work.mApproved"), align: "r", mono: true }, { label: t("work.mInReview"), align: "r", mono: true }],
          rows: wps.map((w) => { const wl = reportable.filter((l) => l.workPackageId === w.id); return [w.code, name(w), String(uniq(wl.map((l) => l.personId)).length), String(wl.length), dur(sumMin(wl, "approved")), dur(sumMin(wl, "in_review"))]; }),
          foot: [[{ text: t("common.total"), strong: true }, "", String(uniq(reportable.map((l) => l.personId)).length), String(reportable.length), { text: dur(sumMin(logs, "approved")), strong: true }, dur(sumMin(logs, "in_review"))]],
        },
      },
      {
        heading: t("reports.completed"), note: t("reports.completedNote"), empty: t("reports.noCompleted"),
        table: { head: [{ label: t("common.code"), mono: true }, { label: t("common.name"), wide: true }, { label: t("reports.completedOn"), mono: true }, { label: t("reports.result"), wide: true }],
          rows: [...doneActs.map((a): Cell[] => [{ text: a.code, strong: true }, name(a), fmtDate(locale, a.completedOn), pick(locale, a.resultNoteTr, a.resultNoteEn) || "—"]), ...doneSubs.map((s): Cell[] => [s.code, name(s), fmtDate(locale, s.completedOn), pick(locale, s.resultNoteTr, s.resultNoteEn) || "—"])] },
      },
      {
        heading: t("reports.milestones"), note: pm ? t("reports.milestonesNote", { m: monthLabel(locale, pm) }) : undefined, empty: pm ? t("reports.noMilestones") : t("common.awaitingStart"),
        table: { head: [{ label: t("common.code"), mono: true }, { label: t("common.activity"), wide: true }, { label: t("reports.refMonths"), mono: true }, { label: t("common.status") }], rows: milestones.map((a) => [a.code, name(a), monthsLabel(locale, a.months), planSt(a.status)]) },
      },
      {
        heading: t("reports.delays"), note: capNote(delayed.length) ?? (pm ? t("reports.delaysNote") : undefined), empty: pm ? t("reports.noDelays") : t("common.awaitingStart"),
        table: { head: [{ label: t("common.code"), mono: true }, { label: t("common.subactivity"), wide: true }, { label: t("reports.planned"), mono: true }, { label: t("common.resp.lead") }, { label: t("common.status") }], rows: delayed.slice(0, CAP).map((s) => [s.code, name(s), monthsLabel(locale, monthsOf(s)), (leads.get(s.id) ?? []).join(", ") || "—", planSt(s.status)]) },
      },
      {
        heading: t("reports.observations"), note: t("reports.observationsNote"), empty: t("reports.noObservations"),
        table: { head: [{ label: t("common.date"), mono: true }, { label: t("reports.target"), wide: true }, { label: t("reports.scope") }, { label: t("reports.value"), align: "r", mono: true }, { label: t("common.note"), wide: true }],
          rows: obs.map(({ o, name: co }) => [fmtDate(locale, o.observedOn), pick(locale, co.nameTr, co.nameEn), o.scope === "zafer" ? "ZAFER" : t("reports.scopeProject"), o.value != null ? `${fmtNumber(locale, Number(o.value), Number(o.value) % 1 ? 2 : 0)}${o.unit ? ` ${o.unit}` : ""}` : o.status ?? "—", pick(locale, o.noteTr, o.noteEn) || "—"]) },
      },
      {
        heading: t("reports.meetings"), empty: t("reports.noMeetings"),
        table: { head: [{ label: t("common.date"), mono: true }, { label: t("reports.meeting"), wide: true }, { label: t("common.status") }, { label: t("reports.decisions"), wide: true }],
          rows: meetingRows.map((m) => [fmtDate(locale, m.startsAt.toISOString()), pick(locale, m.titleTr, m.titleEn), t(`reports.mt.${m.status}`), decisions.filter((d) => d.f.sourceId === m.id).map((d) => `• ${pick(locale, d.f.textTr, d.f.textEn)}${d.who ? ` (${d.who}${d.f.dueDate ? `, ${fmtDate(locale, d.f.dueDate)}` : ""})` : ""}`).join("\n") || "—"]) },
      },
      {
        heading: t("reports.procurements"), empty: t("reports.noProcurements"),
        table: { head: [{ label: t("reports.procurement"), wide: true }, { label: t("common.activity"), mono: true }, { label: t("common.responsible") }, { label: t("reports.contractAmount"), align: "r", mono: true }, { label: t("reports.delivery"), mono: true }, { label: t("common.status") }],
          rows: procs.map(({ p, who }) => [pick(locale, p.titleTr, p.titleEn), p.activityId ? actById.get(p.activityId)?.code ?? "—" : "—", who ?? "—", fmtMoney(locale, p.contractAmount ?? p.estimatedAmount, p.currency), p.deliveryDate ? fmtDate(locale, p.deliveryDate) : "—", t(`reports.pr.${p.status}`)]) },
      },
      {
        heading: t("reports.travels"), empty: t("reports.noTravels"),
        table: { head: [{ label: t("common.date"), mono: true }, { label: t("reports.purpose"), wide: true }, { label: t("common.place") }, { label: t("common.participants") }, { label: t("common.status") }],
          rows: trv.map((v) => [`${fmtDate(locale, v.departDate)} – ${fmtDate(locale, v.returnDate)}`, pick(locale, v.purposeTr, v.purposeEn), v.place ?? "—", v.participantIds.map((id) => persons.find((p) => p.id === id)?.fullName ?? id).join(", ") || "—", t(`reports.tv.${v.status}`)]) },
      },
      {
        heading: t("reports.nextPriorities"), note: capNote(next.length) ?? (pm && pm < project.durationMonths ? t("reports.nextNote", { m: monthLabel(locale, pm + 1) }) : undefined), empty: pm ? t("reports.noNext") : t("common.awaitingStart"),
        table: { head: [{ label: "WP", mono: true }, { label: t("common.code"), mono: true }, { label: t("common.subactivity"), wide: true }, { label: t("common.resp.lead") }, { label: t("common.status") }], rows: next.slice(0, CAP).map((s) => [wpOfAct(s.activityId)?.code ?? "", s.code, name(s), (leads.get(s.id) ?? []).join(", ") || "—", planSt(s.status)]) },
      },
    ],
  };
}
