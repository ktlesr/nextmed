import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { people, sessions, users, type Role } from "@/db/schema";

const COOKIE = "pds_session";
const SESSION_DAYS = 14;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  canEditPlan: boolean;
  locale: "tr" | "en";
  personId: string | null;
  fullName: string;
  projectRoleTr: string | null;
  projectRoleEn: string | null;
  mustChangePassword: boolean;
};

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

export async function signIn(email: string, password: string): Promise<boolean> {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  // Compare against a dummy hash when the user is unknown so timing does not reveal accounts.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.3s5pZ3lNwtq5uY5uG1eY0n2b6QeW");
  if (!u || !u.active || !ok) return false;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId: u.id, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  jar.set("pds_locale", u.locale, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(COOKIE);
}

/** Resolved on every request — sessions and permissions are never trusted from the client. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ u: users, p: people })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(people, eq(people.id, users.personId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.u.active) return null;
  return {
    id: row.u.id,
    email: row.u.email,
    role: row.u.role,
    canEditPlan: row.u.canEditPlan,
    locale: row.u.locale,
    personId: row.u.personId,
    fullName: row.p?.fullName ?? row.u.email,
    projectRoleTr: row.p?.projectRoleTr ?? null,
    projectRoleEn: row.p?.projectRoleEn ?? null,
    mustChangePassword: row.u.mustChangePassword,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/* ── Permissions ─────────────────────────────────────────────────────────── */
export const can = {
  admin: (u: SessionUser) => u.role === "admin",
  /** Sees team plans & summaries; reviews, approves or returns records. */
  coordinate: (u: SessionUser) => u.role === "admin" || u.role === "coordinator",
  /** Payroll, bank, incoming payments and financial reports. */
  finance: (u: SessionUser) => u.role === "admin" || u.role === "finance",
  /** Sub-activity plan editing: admin, or a coordinator granted the extra permission. */
  editPlan: (u: SessionUser) => u.role === "admin" || (u.role === "coordinator" && u.canEditPlan),
  /** Team-wide views (reports, workload) */
  seeTeam: (u: SessionUser) => u.role !== "member",
  seePerson: (u: SessionUser, personId: string) => u.role !== "member" || u.personId === personId,
  fileAccess: (u: SessionUser, access: "team" | "finance" | "admin") =>
    access === "team" || u.role === "admin" || (access === "finance" && u.role === "finance"),
};

export class ForbiddenError extends Error {
  constructor() { super("forbidden"); }
}
export async function requireRole(check: (u: SessionUser) => boolean): Promise<SessionUser> {
  const u = await requireUser();
  if (!check(u)) redirect("/app?denied=1");
  return u;
}
/** For server actions: throws instead of redirecting. */
export async function assertRole(check: (u: SessionUser) => boolean): Promise<SessionUser> {
  const u = await getUser();
  if (!u || !check(u)) throw new ForbiddenError();
  return u;
}
