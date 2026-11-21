"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { concreteOutputs, files, observations, type TargetSpec } from "@/db/schema";
import { assertRole, can, ForbiddenError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { saveLink, saveUpload } from "@/lib/files";
import { queueFields, splitBilingual, type Lang } from "@/lib/translate";
import { getFrame } from "@/lib/structure";
import { getT } from "@/i18n/server";
import { KINDS, OBS_STATUSES, QUALIFIERS } from "@/lib/adminOutputConst";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const refresh = (id?: string) => { revalidatePath("/app/outputs"); if (id) revalidatePath(`/app/outputs/${id}`); revalidatePath("/app/admin"); };

/** Record an actual for one target (Proje Geneli or ZAFER), with evidence in two languages. */
export async function addObservation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.coordinate);
    const outputId = str(fd, "concreteOutputId");
    const [target] = await db.select().from(concreteOutputs).where(eq(concreteOutputs.id, outputId));
    if (!target) return fail(t("common.notFound"));
    const scope = str(fd, "scope") === "project" ? "project" : "zafer";
    const observedOn = str(fd, "observedOn");
    if (!isDate(observedOn)) return fail(t("common.invalid"), { observedOn: t("common.required") });
    const value = optNum(fd, "value");
    const status = optStr(fd, "status");
    if (value != null && value < 0) return fail(t("common.invalid"), { value: t("outputs.errValue") });
    if (status && !(OBS_STATUSES as readonly string[]).includes(status)) return fail(t("common.invalid"));
    const override = (["tr", "en"] as const).find((l) => l === str(fd, "sourceLang")) as Lang | undefined;
    const note = splitBilingual(str(fd, "note"), override ?? null);
    if (value == null && !status && !note.tr && !note.en) return fail(t("outputs.errEmptyObservation"));
    const spec = scope === "project" ? target.projectTarget : target.zaferObligation;
    const [row] = await db.insert(observations).values({
      concreteOutputId: outputId, scope, observedOn, value: value != null ? String(value) : null,
      unit: value != null ? optStr(fd, "unit") ?? spec.unit ?? target.projectTarget.unit : null,
      status, noteTr: note.tr, noteEn: note.en, dedupeKey: optStr(fd, "dedupeKey"), createdBy: user.id,
    }).returning();
    try {
      for (const lang of ["tr", "en"] as const) {
        for (const f of fd.getAll(lang === "tr" ? "fileTr" : "fileEn")) await saveUpload(f, { entityType: "observation", entityId: row.id, lang, uploadedBy: user.id });
        await saveLink(optStr(fd, lang === "tr" ? "linkTr" : "linkEn"), { entityType: "observation", entityId: row.id, lang, uploadedBy: user.id });
      }
    } catch (e) {
      if ((e as Error).message === "file_too_large") { await db.delete(files).where(sql`${files.entityType} = 'observation' and ${files.entityId} = ${row.id}`); await db.delete(observations).where(eq(observations.id, row.id)); return fail(t("common.fileTooLarge")); }
      throw e;
    }
    await queueFields("observations", row.id, { note });
    await audit({ userId: user.id, entity: "observation", entityId: row.id, action: "create", after: { concreteOutputId: outputId, scope, observedOn, value, status, dedupeKey: row.dedupeKey } });
    refresh(outputId);
    return ok(t("outputs.observationSaved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

export async function deleteObservation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.coordinate);
    const reason = str(fd, "reason");
    if (!reason) return fail(t("common.reasonRequired"));
    const [row] = await db.select().from(observations).where(eq(observations.id, str(fd, "id")));
    if (!row) return fail(t("common.notFound"));
    await db.delete(files).where(sql`${files.entityType} = 'observation' and ${files.entityId} = ${row.id}`);
    await db.delete(observations).where(eq(observations.id, row.id));
    await audit({ userId: user.id, entity: "observation", entityId: row.id, action: "delete", reason, before: row });
    refresh(row.concreteOutputId);
    return ok(t("common.deleted"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

function readSpec(fd: FormData, prefix: string): TargetSpec | null {
  const kind = str(fd, `${prefix}Kind`) as TargetSpec["kind"];
  if (!KINDS.includes(kind)) return null;
  const displayTr = str(fd, `${prefix}DisplayTr`), displayEn = str(fd, `${prefix}DisplayEn`);
  if (!displayTr && !displayEn) return null;
  const numeric = kind === "numeric" || kind === "conditional";
  const q = str(fd, `${prefix}Qualifier`);
  return {
    kind, value: numeric ? optNum(fd, `${prefix}Value`) : null, unit: kind === "contribution" || kind === "not_specified" ? null : optStr(fd, `${prefix}Unit`),
    qualifier: (QUALIFIERS as readonly string[]).includes(q) ? q : null, display_tr: displayTr || displayEn, display_en: displayEn || displayTr,
  };
}
const numList = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
const codeList = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d+(\.\d+){1,3}$/.test(x)))];

/** Admin: add a target or edit name / source / targets. Previous values are pushed to the version history. */
export async function saveTarget(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const id = optStr(fd, "id");
    const nameTr = optStr(fd, "nameTr"), nameEn = optStr(fd, "nameEn");
    if (!nameTr && !nameEn) return fail(t("common.invalid"), { nameTr: t("common.required") });
    const projectTarget = readSpec(fd, "project"), zaferObligation = readSpec(fd, "zafer");
    if (!projectTarget || !zaferObligation) return fail(t("outputs.errSpec"));
    const { wps, acts, outs } = await getFrame();
    const workPackageIds = fd.getAll("workPackageIds").map(String).filter((w) => wps.some((x) => x.id === w));
    const activityId = optStr(fd, "activityId");
    const act = activityId ? acts.find((a) => a.id === activityId) : null;
    if (activityId && !act) return fail(t("common.invalid"));
    const outputId = act ? act.outputId : null;
    if (act) { const wp = outs.find((o) => o.id === act.outputId)!.workPackageId; if (!workPackageIds.includes(wp)) workPackageIds.push(wp); }
    const values = {
      nameTr, nameEn, projectTarget, zaferObligation, workPackageIds: workPackageIds.sort(), activityId: act?.id ?? null, outputId,
      programmeIndicator: optStr(fd, "programmeIndicator")?.toUpperCase() ?? null,
      sources: { application_form_pages: numList(str(fd, "pages")), zafer_matrix_subactivities: codeList(str(fd, "matrix")) },
      countingNoteTr: optStr(fd, "countingNoteTr"), countingNoteEn: optStr(fd, "countingNoteEn"),
      priority: fd.get("priority") === "on", active: fd.get("active") === "on", updatedAt: new Date(),
    };
    if (!id) {
      const newId = `concrete-${crypto.randomUUID()}`;
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${concreteOutputs.sort}), 0)::int` }).from(concreteOutputs);
      await db.insert(concreteOutputs).values({ id: newId, ...values, projectTargetBasis: "portal_admin", sort: max + 1 });
      await audit({ userId: user.id, entity: "concrete_output", entityId: newId, action: "create", after: values });
      refresh();
      return ok(t("outputs.targetAdded"), { id: newId });
    }
    const [before] = await db.select().from(concreteOutputs).where(eq(concreteOutputs.id, id));
    if (!before) return fail(t("common.notFound"));
    const prev = { nameTr: before.nameTr, nameEn: before.nameEn, projectTarget: before.projectTarget, zaferObligation: before.zaferObligation, workPackageIds: before.workPackageIds, activityId: before.activityId, programmeIndicator: before.programmeIndicator, sources: before.sources, countingNoteTr: before.countingNoteTr, countingNoteEn: before.countingNoteEn, priority: before.priority, active: before.active };
    const next = { ...values, updatedAt: undefined };
    const changed = (Object.keys(prev) as (keyof typeof prev)[]).filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify((next as Record<string, unknown>)[k] ?? null));
    if (!changed.length) return ok(t("outputs.noChange"));
    const snapshot = Object.fromEntries(changed.map((k) => [k, prev[k]]));
    await db.update(concreteOutputs).set({ ...values, history: [...before.history, { at: new Date().toISOString(), by: user.fullName, before: snapshot }] }).where(eq(concreteOutputs.id, id));
    await audit({ userId: user.id, entity: "concrete_output", entityId: id, action: "update", reason: optStr(fd, "reason"), before: snapshot, after: Object.fromEntries(changed.map((k) => [k, (next as Record<string, unknown>)[k]])) });
    refresh(id);
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Admin: toggle dashboard priority. */
export async function togglePriority(fd: FormData): Promise<void> {
  const user = await assertRole(can.admin);
  const id = str(fd, "id");
  const [row] = await db.select({ priority: concreteOutputs.priority }).from(concreteOutputs).where(eq(concreteOutputs.id, id));
  if (!row) return;
  await db.update(concreteOutputs).set({ priority: !row.priority }).where(eq(concreteOutputs.id, id));
  await audit({ userId: user.id, entity: "concrete_output", entityId: id, action: "priority", before: { priority: row.priority }, after: { priority: !row.priority } });
  refresh(id);
}
