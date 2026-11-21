"use server";
import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { assertRole, can, ForbiddenError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { applyImport, previewImport, type SeedFile } from "@/lib/importer";
import { loadBundledSeed } from "@/lib/adminDashboard";
import { getT } from "@/i18n/server";

const MAX = 12 * 1024 * 1024;
// The parsed upload is parked in the server's temp dir between preview and apply; only the random token travels to the browser.
const tmpPath = (token: string) => path.join(os.tmpdir(), `pds-import-${token}.json`);
const isToken = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

/** Step 1 — validate and preview. Nothing is written to the database. */
export async function previewAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    await assertRole(can.admin);
    let seed: SeedFile, fileName: string, token = "bundled";
    const file = fd.get("file");
    if (str(fd, "source") === "bundled" || !file || typeof file === "string" || file.size === 0) {
      if (str(fd, "source") !== "bundled") return fail(t("admin.impErrNoFile"));
      seed = await loadBundledSeed();
      fileName = "data/seed.v3.json";
    } else {
      if (file.size > MAX) return fail(t("admin.impErrTooLarge"));
      const text = await file.text();
      try { seed = JSON.parse(text); } catch { return fail(t("admin.impErrJson")); }
      if (!seed || typeof seed !== "object" || Array.isArray(seed)) return fail(t("admin.impErrJson"));
      token = crypto.randomUUID();
      await writeFile(tmpPath(token), text, { mode: 0o600 });
      fileName = file.name;
    }
    const preview = await previewImport(db, seed);
    return ok(undefined, { preview, token, fileName, schemaVersion: seed.schema_version ?? null, fingerprint: seed.reference_structure_fingerprint ?? null });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}

/** Step 2 — apply atomically. Conflict rows are only replaced when the admin ticked them, with a reason. */
export async function applyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getT();
  try {
    const user = await assertRole(can.admin);
    const token = str(fd, "token");
    const overwrite = fd.getAll("overwrite").map(String).filter((s) => /^(subactivity|assignment|person):[\w.:-]+$/.test(s));
    const reason = str(fd, "reason");
    if (overwrite.length && !reason) return fail(t("admin.impErrReason"));
    let seed: SeedFile;
    if (token === "bundled") seed = await loadBundledSeed();
    else {
      if (!isToken(token)) return fail(t("common.invalid"));
      try { seed = JSON.parse(await readFile(tmpPath(token), "utf8")); } catch { return fail(t("admin.impErrExpired")); }
    }
    const before = await previewImport(db, seed);
    if (!before.ok) return fail(t("admin.impErrRejected", { error: before.errors[0] ?? "" }));
    // only rows that really are conflicts can be overwritten
    const conflicts = new Set(before.rows.filter((r) => r.state === "conflict").map((r) => `${r.entity}:${r.id}`));
    const chosen = overwrite.filter((o) => conflicts.has(o));
    let res;
    try { res = await applyImport(db, seed, { overwrite: chosen }); } catch (e) { return fail(t("admin.impErrRejected", { error: (e as Error).message })); }
    await audit({ userId: user.id, entity: "import", entityId: str(fd, "fileName").slice(0, 200) || null, action: "apply", reason: reason || null, before: { summary: before.summary, frame: before.frame }, after: { ...res, overwritten: chosen } });
    if (token !== "bundled") await unlink(tmpPath(token)).catch(() => {});
    revalidatePath("/app", "layout");
    return ok(t("admin.impApplied", { inserted: res.inserted, merged: res.merged, skipped: res.skippedConflicts }), { applied: res });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(t("common.forbidden"));
    throw e;
  }
}
