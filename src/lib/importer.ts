/**
 * Schema v3 seed importer (project-month based — no calendar dates are read from the file).
 *
 * Rules (import_policy):
 *  - records are matched by stable entity id; importing the same file twice never duplicates
 *  - the fixed frame (WP / output / activity) may be created but never changed → such a file is rejected
 *  - new records are added; source-owned fields that were not edited in the portal are merged
 *  - a field edited in the portal AND changed in the source is a conflict: reported, never silently overwritten
 *  - rows missing from the file are not deleted
 *  - runtime data (start date, work logs, files, approvals, payments, closed months, baselines) is never touched
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as s from "@/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SeedFile = Record<string, any>;
export type RowState = "new" | "unchanged" | "changed" | "archived" | "conflict";
export type PreviewRow = { entity: "subactivity" | "assignment" | "person"; id: string; label: string; state: RowState; fields: string[] };
export type ImportPreview = {
  ok: boolean;
  errors: string[];
  counts: Record<string, number>;
  summary: Record<RowState, number>;
  frame: { new: number; unchanged: number };
  rows: PreviewRow[]; // only non-unchanged rows
};

// jsonb does not preserve key order, so compare canonically (sorted keys).
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v ?? null;
const eqJson = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const subSnap = (x: any) => ({ activity_id: x.activity_id, code: x.code, name_tr: x.name_tr ?? null, name_en: x.name_en ?? null, schedule_mode: x.schedule_mode, project_months: x.schedule_mode === "custom" ? x.project_months : null, active: x.active !== false });
const asgSnap = (x: any) => ({ person_id: x.person_id, subactivity_id: x.subactivity_id, responsibility: x.responsibility, task_description_tr: x.task_description_tr ?? null, task_description_en: x.task_description_en ?? null, planned_minutes: x.planned_minutes ?? null, planned_cost_eur: x.planned_cost_eur ?? null, schedule_mode: x.schedule_mode, project_months: x.schedule_mode === "custom" ? x.project_months : null, allocations: x.project_month_allocations ?? null, active: x.active !== false });
const personSnap = (x: any) => ({ full_name: x.full_name, organization_title_tr: x.organization_title_tr ?? null, organization_title_en: x.organization_title_en ?? null, project_role_tr: x.project_role_tr ?? null, project_role_en: x.project_role_en ?? null, general_duties_tr: x.general_duties_tr ?? null, province_tr: x.province_tr ?? null, plan: x.plan, active: x.active !== false });
const diffKeys = (a: Record<string, unknown>, b: Record<string, unknown> | null | undefined) => Object.keys(a).filter((k) => !eqJson(a[k], b?.[k]));

export function validateSeed(d: SeedFile): string[] {
  const errors: string[] = [];
  if (d?.schema_version !== 3) errors.push("schema_version must be 3 (v2 files must be migrated to the month-based structure)");
  for (const k of ["project", "work_packages", "outputs", "activities", "subactivities", "people", "assignments"]) if (!d?.[k]) errors.push(`missing section: ${k}`);
  if (errors.length) return errors;
  const dur = d.project.duration_months;
  const ids = new Set<string>();
  const uniq = (list: any[], name: string) => list.forEach((x) => { if (ids.has(x.id)) errors.push(`duplicate id ${x.id} in ${name}`); ids.add(x.id); });
  ["work_packages", "outputs", "activities", "subactivities", "people", "assignments"].forEach((n) => uniq(d[n], n));
  const wp = new Set(d.work_packages.map((x: any) => x.id)), out = new Set(d.outputs.map((x: any) => x.id)), act = new Set(d.activities.map((x: any) => x.id));
  const sub = new Set(d.subactivities.map((x: any) => x.id)), ppl = new Set(d.people.map((x: any) => x.id));
  d.outputs.forEach((x: any) => wp.has(x.work_package_id) || errors.push(`output ${x.id}: unknown parent`));
  d.activities.forEach((x: any) => out.has(x.output_id) || errors.push(`activity ${x.id}: unknown parent`));
  d.subactivities.forEach((x: any) => act.has(x.activity_id) || errors.push(`subactivity ${x.id}: unknown parent`));
  d.assignments.forEach((x: any) => { if (!sub.has(x.subactivity_id)) errors.push(`assignment ${x.id}: unknown subactivity`); if (!ppl.has(x.person_id)) errors.push(`assignment ${x.id}: unknown person`); });
  const badMonths = (m: any) => Array.isArray(m) && m.some((n: number) => !Number.isInteger(n) || n < 1 || n > dur);
  [...d.activities, ...d.subactivities, ...d.assignments].forEach((x: any) => badMonths(x.project_months) && errors.push(`${x.id}: month outside 1–${dur}`));
  // hourly month distribution must add up to each person's total plan
  const byPerson = new Map<string, number>();
  (d.hourly_project_period_plan ?? []).forEach((r: any) => byPerson.set(r.person_id, (byPerson.get(r.person_id) ?? 0) + r.planned_centi_hours));
  d.people.forEach((p: any) => { if (p.plan?.method === "hourly" && Math.abs((byPerson.get(p.id) ?? 0) * 0.6 - p.plan.total_planned_minutes) > 1) errors.push(`${p.id}: hourly month plan does not equal total planned minutes`); });
  return errors;
}

export async function previewImport(db: Db, d: SeedFile): Promise<ImportPreview> {
  const errors = validateSeed(d);
  const preview: ImportPreview = { ok: false, errors, counts: {}, summary: { new: 0, unchanged: 0, changed: 0, archived: 0, conflict: 0 }, frame: { new: 0, unchanged: 0 }, rows: [] };
  if (errors.length) return preview;
  preview.counts = { work_packages: d.work_packages.length, outputs: d.outputs.length, activities: d.activities.length, subactivities: d.subactivities.length, people: d.people.length, assignments: d.assignments.length, concrete_outputs: (d.concrete_outputs ?? []).length, hourly_rows: (d.hourly_project_period_plan ?? []).length };

  // Fixed frame: reject any change to code, name, parent or reference months.
  const [wps, outs, acts] = await Promise.all([db.select().from(s.workPackages), db.select().from(s.outputs), db.select().from(s.activities)]);
  const frameCheck = (existing: any[], incoming: any[], parentKey: string | null, dbParent: string | null) => {
    const map = new Map(existing.map((e) => [e.id, e]));
    for (const x of incoming) {
      const e = map.get(x.id);
      if (!e) { preview.frame.new++; continue; }
      const same = e.code === x.code && e.nameTr === x.name_tr && eqJson(e.months, x.project_months) && (!parentKey || e[dbParent!] === x[parentKey]);
      if (same) preview.frame.unchanged++;
      else errors.push(`fixed frame record ${x.id} differs from the portal — reference structure changes are rejected`);
    }
  };
  frameCheck(wps, d.work_packages, null, null);
  frameCheck(outs, d.outputs, "work_package_id", "workPackageId");
  frameCheck(acts, d.activities, "output_id", "outputId");

  const classify = (entity: PreviewRow["entity"], existing: { id: string; seedSnapshot: any; portalEditedAt: Date | null; active: boolean }[], incoming: any[], snap: (x: any) => Record<string, unknown>, label: (x: any) => string) => {
    const map = new Map(existing.map((e) => [e.id, e]));
    const seen = new Set<string>();
    for (const x of incoming) {
      seen.add(x.id);
      const e = map.get(x.id);
      if (!e) { preview.summary.new++; if (existing.length) preview.rows.push({ entity, id: x.id, label: label(x), state: "new", fields: [] }); continue; }
      const fields = diffKeys(snap(x), e.seedSnapshot);
      if (!fields.length) { preview.summary.unchanged++; continue; }
      const state: RowState = e.portalEditedAt ? "conflict" : "changed";
      preview.summary[state]++;
      preview.rows.push({ entity, id: x.id, label: label(x), state, fields });
    }
    // rows that exist in the portal but not in the file are reported, never deleted
    for (const e of existing) if (!seen.has(e.id) && e.seedSnapshot) { preview.summary.archived++; preview.rows.push({ entity, id: e.id, label: e.id, state: "archived", fields: [] }); }
  };
  const [subs, asgs, ppl] = await Promise.all([
    db.select({ id: s.subactivities.id, seedSnapshot: s.subactivities.seedSnapshot, portalEditedAt: s.subactivities.portalEditedAt, active: s.subactivities.active }).from(s.subactivities),
    db.select({ id: s.assignments.id, seedSnapshot: s.assignments.seedSnapshot, portalEditedAt: s.assignments.portalEditedAt, active: s.assignments.active }).from(s.assignments),
    db.select({ id: s.people.id, seedSnapshot: s.people.seedSnapshot, portalEditedAt: s.people.portalEditedAt, active: s.people.active }).from(s.people),
  ]);
  classify("subactivity", subs, d.subactivities, subSnap, (x) => `${x.code} ${x.name_tr ?? ""}`.slice(0, 110));
  classify("assignment", asgs, d.assignments, asgSnap, (x) => `${x.id} · ${x.person_id} → ${x.subactivity_id}`);
  classify("person", ppl, d.people, personSnap, (x) => x.full_name);
  preview.ok = errors.length === 0;
  return preview;
}

const subValues = (x: any, i: number) => ({ activityId: x.activity_id, code: x.code, nameTr: x.name_tr ?? null, nameEn: x.name_en ?? null, scheduleMode: x.schedule_mode, months: x.schedule_mode === "custom" ? x.project_months : null, active: x.active !== false, sort: i, seedSnapshot: subSnap(x) });
const asgValues = (x: any) => ({ personId: x.person_id, subactivityId: x.subactivity_id, responsibility: x.responsibility, taskDescriptionTr: x.task_description_tr ?? null, taskDescriptionEn: x.task_description_en ?? null, plannedMinutes: x.planned_minutes ?? null, plannedCostEur: x.planned_cost_eur != null ? String(x.planned_cost_eur) : null, scheduleMode: x.schedule_mode, months: x.schedule_mode === "custom" ? x.project_months : null, allocations: x.project_month_allocations ?? null, active: x.active !== false, seedSnapshot: asgSnap(x) });
const personValues = (x: any, i: number) => ({ fullName: x.full_name, organizationTitleTr: x.organization_title_tr ?? null, organizationTitleEn: x.organization_title_en ?? null, projectRoleTr: x.project_role_tr ?? null, projectRoleEn: x.project_role_en ?? null, generalDutiesTr: x.general_duties_tr ?? null, generalDutiesEn: x.general_duties_en ?? null, provinceTr: x.province_tr ?? null, active: x.active !== false, planMethod: x.plan.method, fixedRatio: x.plan.fixed_ratio != null ? String(x.plan.fixed_ratio) : null, totalPlannedMinutes: x.plan.total_planned_minutes ?? null, eligiblePersonnelCost: !!x.plan.eligible_personnel_cost, costClassTr: x.plan.cost_class_tr ?? null, costClassEn: x.plan.cost_class_en ?? null, plannedCostEur: String(x.plan.planned_cost_eur ?? 0), startProjectMonth: x.plan.start_project_month ?? 1, endProjectMonth: x.plan.end_project_month ?? 36, sort: i, seedSnapshot: personSnap(x) });

/**
 * Apply atomically. `overwrite` lists conflict rows ("entity:id") the admin explicitly chose to replace.
 * Returns the number of inserted / merged rows.
 */
export async function applyImport(db: Db, d: SeedFile, opts: { overwrite?: string[] } = {}): Promise<{ inserted: number; merged: number; skippedConflicts: number }> {
  const preview = await previewImport(db, d);
  if (!preview.ok) throw new Error("Import rejected: " + preview.errors.slice(0, 5).join("; "));
  const overwrite = new Set(opts.overwrite ?? []);
  const res = { inserted: 0, merged: 0, skippedConflicts: 0 };
  const chunk = <T,>(arr: T[], n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  await db.transaction(async (tx) => {
    const [existingProject] = await tx.select({ id: s.project.id }).from(s.project).limit(1);
    if (!existingProject) {
      const b = d.budget;
      await tx.insert(s.project).values({
        id: d.project.id, name: d.project.name, partnerTr: d.project.partner, partnerEn: d.project.partner_en ?? d.project.partner, partnerCode: d.project.partner_code,
        startDate: null, // entered by the admin; never read from the file
        durationMonths: d.project.duration_months, timeZone: d.project.time_zone, stepMinutes: d.project.work_log_step_minutes, dailyLimitMinutes: d.project.work_log_daily_limit_minutes,
        budget: { approved_partner_budget_eur: b.approved_partner_budget_eur, personnel_ceiling_eur: b.personnel_ceiling_eur, personnel_plan_eur: b.personnel_plan_eur, personnel_remaining_eur: b.personnel_remaining_eur, plan_currency_rate_try_per_eur: b.plan_currency_rate_try_per_eur, reporting_currency_rate_try_per_eur: null, admin_flat_rate: b.admin_flat_rate, travel_flat_rate: b.travel_flat_rate, partner_contribution_rate: b.partner_contribution_rate },
        governance: d.project_governance ?? {}, settings: d.portal_settings ?? {}, schemaVersion: 3, referenceFingerprint: d.reference_structure_fingerprint ?? null, importedAt: new Date(),
      });
    } else {
      await tx.update(s.project).set({ importedAt: new Date() }).where(eq(s.project.id, existingProject.id));
    }

    const wpBudget = new Map<string, any>((d.budget?.work_packages ?? []).map((w: any) => [w.work_package_id, w]));
    await tx.insert(s.workPackages).values(d.work_packages.map((x: any, i: number) => ({ id: x.id, code: x.code, nameTr: x.name_tr, nameEn: x.name_en ?? x.name_tr, months: x.project_months, active: x.active !== false, sort: i, personnelCeilingEur: String(wpBudget.get(x.id)?.personnel_ceiling_eur ?? 0), personnelPlanEur: String(wpBudget.get(x.id)?.personnel_plan_eur ?? 0), externalServicesBudgetEur: String(wpBudget.get(x.id)?.external_services_budget_eur ?? 0) }))).onConflictDoNothing();
    await tx.insert(s.outputs).values(d.outputs.map((x: any, i: number) => ({ id: x.id, workPackageId: x.work_package_id, code: x.code, nameTr: x.name_tr, nameEn: x.name_en ?? x.name_tr, months: x.project_months, active: x.active !== false, sort: i }))).onConflictDoNothing();
    await tx.insert(s.activities).values(d.activities.map((x: any, i: number) => ({ id: x.id, outputId: x.output_id, code: x.code, nameTr: x.name_tr, nameEn: x.name_en ?? x.name_tr, months: x.project_months, active: x.active !== false, sort: i }))).onConflictDoNothing();

    const upsert = async (entity: PreviewRow["entity"], table: any, incoming: any[], values: (x: any, i: number) => any) => {
      const existing = new Map<string, { seedSnapshot: any; portalEditedAt: Date | null }>((await tx.select({ id: table.id, seedSnapshot: table.seedSnapshot, portalEditedAt: table.portalEditedAt }).from(table)).map((e: any) => [e.id, e]));
      const fresh: any[] = [];
      for (let i = 0; i < incoming.length; i++) {
        const x = incoming[i], e = existing.get(x.id), v = values(x, i);
        if (!e) { fresh.push({ id: x.id, ...v }); continue; }
        if (eqJson(v.seedSnapshot, e.seedSnapshot)) continue;
        if (e.portalEditedAt && !overwrite.has(`${entity}:${x.id}`)) { res.skippedConflicts++; continue; }
        await tx.update(table).set({ ...v, portalEditedAt: null }).where(eq(table.id, x.id));
        res.merged++;
      }
      for (const part of chunk(fresh)) await tx.insert(table).values(part);
      res.inserted += fresh.length;
    };
    await upsert("person", s.people, d.people, personValues);
    await upsert("subactivity", s.subactivities, d.subactivities, subValues);
    await upsert("assignment", s.assignments, d.assignments, asgValues);

    const hp: (typeof s.hourlyPlan.$inferInsert)[] = (d.hourly_project_period_plan ?? []).map((r: any) => ({ personId: r.person_id, projectMonth: r.project_month, centiHours: r.planned_centi_hours }));
    for (const part of chunk(hp)) await tx.insert(s.hourlyPlan).values(part).onConflictDoNothing();

    const co = (d.concrete_outputs ?? []).map((x: any, i: number) => ({ id: x.id, nameTr: x.name_tr, nameEn: x.name_en ?? null, projectTarget: x.project_target, zaferObligation: x.zafer_obligation, workPackageIds: x.work_package_ids ?? [], outputId: x.output_id ?? null, activityId: x.activity_id ?? null, programmeIndicator: x.programme_indicator ?? null, projectTargetBasis: x.project_target_basis ?? null, sources: x.sources ?? {}, countingNoteTr: x.counting_note_tr ?? null, countingNoteEn: x.counting_note_en ?? null, priority: x.zafer_obligation?.kind === "numeric", active: x.active !== false, sort: i }));
    if (co.length) await tx.insert(s.concreteOutputs).values(co).onConflictDoNothing();
    await tx.execute(sql`select 1`);
  });
  return res;
}
