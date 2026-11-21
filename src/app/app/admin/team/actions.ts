"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { people, sessions, users, type PlanMethod, type Role } from "@/db/schema";
import { assertRole, can, ForbiddenError, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, optNum, optStr, str, type ActionState } from "@/lib/action";
import { ROLES } from "@/lib/constants";
import { queueTranslation } from "@/lib/translate";
import { getProject } from "@/lib/structure";
import { getT } from "@/i18n/server";

const METHODS: PlanMethod[] = ["fixed_ratio", "hourly", "non_budget_support"];
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const tempPassword = () => `Zk-${randomBytes(9).toString("base64url")}`;
const refresh = () => { revalidatePath("/app/admin/team"); revalidatePath("/app", "layout"); };

async function readPerson(fd: FormData, duration: number, t: (k: string) => string) {
  const fullName = str(fd, "fullName");
  if (fullName.length < 3) return { error: fail(t("common.invalid"), { fullName: t("common.required") }) };
  const planMethod = str(fd, "planMethod") as PlanMethod;
  if (!METHODS.includes(planMethod)) return { error: fail(t("common.invalid")) };
  const start = optNum(fd, "startProjectMonth") ?? 1, end = optNum(fd, "endProjectMonth") ?? duration;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > duration || start > end) return { error: fail(t("admin.errMonths"), { endProjectMonth: t("admin.errMonths") }) };
  const pct = optNum(fd, "fixedRatioPct"), hours = optNum(fd, "totalPlannedHours"), internal = optNum(fd, "internalTargetHours");
  if (planMethod === "fixed_ratio" && (pct == null || pct <= 0 || pct > 100)) return { error: fail(t("admin.errRatio"), { fixedRatioPct: t("admin.errRatio") }) };
  if (planMethod === "hourly" && (hours == null || hours <= 0)) return { error: fail(t("admin.errHours"), { totalPlannedHours: t("admin.errHours") }) };
  return {
    values: {
      fullName, organizationTitleTr: optStr(fd, "organizationTitleTr"), organizationTitleEn: optStr(fd, "organizationTitleEn"),
      projectRoleTr: optStr(fd, "projectRoleTr"), projectRoleEn: optStr(fd, "projectRoleEn"),
      generalDutiesTr: optStr(fd, "generalDutiesTr"), generalDutiesEn: optStr(fd, "generalDutiesEn"),
      provinceTr: optStr(fd, "provinceTr"), startProjectMonth: start, endProjectMonth: end, planMethod,
      fixedRatio: planMethod === "fixed_ratio" ? String(Math.round(pct! * 100) / 10000) : null,
      totalPlannedMinutes: planMethod === "hourly" ? Math.round(hours! * 60) : null,
      internalTargetMinutes: planMethod === "non_budget_support" && internal && internal > 0 ? Math.round(internal * 60) : null,
      eligiblePersonnelCost: planMethod !== "non_budget_support",
      hourlyRateEur: planMethod === "hourly" && optNum(fd, "hourlyRateEur") != null ? String(optNum(fd, "hourlyRateEur")) : null,
      active: fd.get("active") === "on",
    },
  };
}

/** Editable text is stored per language; a missing side is queued for translation. */
async function queuePersonTexts(id: string, v: Record<string, unknown>, before?: Record<string, unknown>) {
  for (const [base, col] of [["organization_title", "organizationTitle"], ["project_role", "projectRole"], ["general_duties", "generalDuties"]] as const) {
    const tr = v[`${col}Tr`] as string | null, en = v[`${col}En`] as string | null;
    if (tr && !en) await queueTranslation("people", id, base, "tr", tr);
    else if (en && !tr) await queueTranslation("people", id, base, "en", en);
    else if (tr && en && before && before[`${col}Tr`] !== tr && before[`${col}En`] === en) { /* both given by the admin: nothing to queue */ }
  }
}

/** Update a person card. Name or title changes stay on the same card (same id); a new employee gets a new record. */
export async function savePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const project = await getProject();
    const id = str(fd, "id");
    const [before] = await db.select().from(people).where(eq(people.id, id));
    if (!before) return fail(t("common.notFound"));
    const r = await readPerson(fd, project.durationMonths, t);
    if (r.error) return r.error;
    const v = r.values!;
    if (!v.active && before.active) {
      const [acc] = await db.select().from(users).where(eq(users.personId, id));
      if (acc?.id === user.id) return fail(t("admin.errSelf"));
    }
    const keys = Object.keys(v) as (keyof typeof v)[];
    const changed = keys.filter((k) => String(before[k] ?? "") !== String(v[k] ?? "") && !(k === "fixedRatio" && Number(before[k] ?? 0) === Number(v[k] ?? 0)) && !(k === "hourlyRateEur" && Number(before[k] ?? 0) === Number(v[k] ?? 0)));
    if (!changed.length) return ok(t("admin.noChange"));
    await db.update(people).set({ ...v, portalEditedAt: new Date() }).where(eq(people.id, id));
    await queuePersonTexts(id, v, before);
    await audit({ userId: user.id, entity: "person", entityId: id, action: "update", reason: optStr(fd, "reason"), before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, v[k]])) });
    refresh();
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

export async function createPerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const project = await getProject();
    const r = await readPerson(fd, project.durationMonths, t);
    if (r.error) return r.error;
    const email = str(fd, "email").toLowerCase();
    const role = (ROLES.includes(str(fd, "role") as Role) ? str(fd, "role") : "member") as Role;
    if (email) {
      if (!emailOk(email)) return fail(t("admin.errEmail"), { email: t("admin.errEmail") });
      const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (dup) return fail(t("admin.errEmailTaken"), { email: t("admin.errEmailTaken") });
    }
    const id = `person-${crypto.randomUUID()}`;
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${people.sort}), 0)::int` }).from(people);
    const password = email ? tempPassword() : null;
    await db.transaction(async (tx) => {
      await tx.insert(people).values({ id, ...r.values!, active: true, sort: max + 1, portalEditedAt: new Date() });
      if (email && password) await tx.insert(users).values({ personId: id, email, passwordHash: await hashPassword(password), role, mustChangePassword: true });
      await audit({ userId: user.id, entity: "person", entityId: id, action: "create", after: { ...r.values, email: email || null, role: email ? role : null } }, tx);
    });
    await queuePersonTexts(id, r.values!);
    refresh();
    return ok(t("admin.personAdded"), password ? { password, email } : undefined);
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

const activeAdmins = async (exceptUserId: string) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, exceptUserId))))[0].n;

/** Portal access of a person: system role is a separate field from the project role. */
export async function saveAccount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const personId = optStr(fd, "personId"), userId = optStr(fd, "userId");
    const email = str(fd, "email").toLowerCase();
    if (!emailOk(email)) return fail(t("admin.errEmail"), { email: t("admin.errEmail") });
    const role = str(fd, "role") as Role;
    if (!ROLES.includes(role)) return fail(t("common.invalid"));
    const active = fd.get("active") === "on";
    const canEditPlan = role === "coordinator" && fd.get("canEditPlan") === "on";
    const reviewerPersonId = optStr(fd, "reviewerPersonId");
    // the final review of someone's own records is always done by another person
    if (reviewerPersonId && reviewerPersonId === personId) return fail(t("admin.errReviewerSelf"), { reviewerPersonId: t("admin.errReviewerSelf") });
    if (reviewerPersonId && !(await db.select({ id: people.id }).from(people).where(eq(people.id, reviewerPersonId))).length) return fail(t("common.invalid"));
    const locale: "tr" | "en" = str(fd, "locale") === "en" ? "en" : "tr";
    const [dup] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), userId ? ne(users.id, userId) : undefined));
    if (dup) return fail(t("admin.errEmailTaken"), { email: t("admin.errEmailTaken") });

    if (!userId) {
      if (!personId || !(await db.select({ id: people.id }).from(people).where(eq(people.id, personId))).length) return fail(t("common.notFound"));
      if ((await db.select({ id: users.id }).from(users).where(eq(users.personId, personId))).length) return fail(t("admin.errHasAccount"));
      const password = tempPassword();
      const [row] = await db.insert(users).values({ personId, email, passwordHash: await hashPassword(password), role, canEditPlan, reviewerPersonId, locale, active, mustChangePassword: true }).returning({ id: users.id });
      await audit({ userId: user.id, entity: "user", entityId: row.id, action: "create", after: { personId, email, role, canEditPlan, reviewerPersonId, active } });
      refresh();
      return ok(t("admin.accountCreated"), { password, email });
    }
    const [before] = await db.select().from(users).where(eq(users.id, userId));
    if (!before) return fail(t("common.notFound"));
    if (before.id === user.id && (role !== "admin" || !active)) return fail(t("admin.errSelf"));
    if (before.role === "admin" && before.active && (role !== "admin" || !active) && (await activeAdmins(before.id)) === 0) return fail(t("admin.errLastAdmin"));
    const next = { email, role, canEditPlan, reviewerPersonId, locale, active };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => before[k] !== next[k]);
    if (!changed.length) return ok(t("admin.noChange"));
    await db.update(users).set(next).where(eq(users.id, userId));
    if (!active) await db.delete(sessions).where(eq(sessions.userId, userId));
    await audit({ userId: user.id, entity: "user", entityId: userId, action: "update", before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) });
    refresh();
    return ok(t("common.saved"));
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Generates a temporary password (shown once), forces a change at next sign-in and ends the user's sessions. */
export async function resetPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const userId = str(fd, "userId");
    const [target] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId));
    if (!target) return fail(t("common.notFound"));
    const password = tempPassword();
    await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, userId));
    if (userId !== user.id) await db.delete(sessions).where(eq(sessions.userId, userId));
    await audit({ userId: user.id, entity: "user", entityId: userId, action: "reset_password" });
    refresh();
    return ok(t("admin.passwordReset"), { password, email: target.email });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}
