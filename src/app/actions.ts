"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUser, hashPassword, signIn, signOut } from "@/lib/auth";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { getT } from "@/i18n/server";

/** TR / EN switch — remembered on the user account, applies to interface, texts and reports together. */
export async function setLocale(locale: "tr" | "en") {
  const l = locale === "en" ? "en" : "tr";
  (await cookies()).set("pds_locale", l, { path: "/", maxAge: 31536000, sameSite: "lax" });
  const user = await getUser();
  if (user) await db.update(users).set({ locale: l }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const success = await signIn(str(fd, "email"), String(fd.get("password") ?? ""));
  if (!success) return fail(t("landing.loginError"));
  redirect("/app");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  const user = await getUser();
  if (!user) return fail(t("common.forbidden"));
  const current = String(fd.get("current") ?? ""), next = String(fd.get("next") ?? ""), again = String(fd.get("again") ?? "");
  if (next.length < 10) return fail(t("admin.pwTooShort"));
  if (next !== again) return fail(t("admin.pwMismatch"));
  const [row] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await bcrypt.compare(current, row.h))) return fail(t("admin.pwWrong"));
  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(users.id, user.id));
  revalidatePath("/app", "layout");
  return ok(t("admin.pwChanged"));
}
