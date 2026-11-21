import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, people, users } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { getProject } from "@/lib/structure";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { DefList, PageHeader, Panel } from "@/components/ui/layout";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata = { title: "Veri Yükleme" };

export default async function ImportPage() {
  await requireRole(can.admin);
  const [{ t, locale }, project, history] = await Promise.all([
    getT(), getProject(),
    db.select({ a: auditLog, email: users.email, name: people.fullName }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).leftJoin(people, eq(people.id, users.personId)).where(eq(auditLog.entity, "import")).orderBy(desc(auditLog.at)).limit(8),
  ]);
  const kept = ["start", "actuals", "files", "approvals", "payments", "closed", "baselines"];
  return (
    <>
      <PageHeader eyebrow={`${t("nav.groupAdmin")} · schema v${project.schemaVersion}`} title={t("nav.import")} description={t("admin.impLede")} />
      <div className="grid gap-6 xl:grid-cols-[1fr_21rem]">
        <ImportWizard />
        <aside className="flex flex-col gap-6">
          <Panel title={t("admin.impNeverTouched")}>
            <ul className="flex flex-col gap-2 text-[0.88rem]">
              {kept.map((k) => <li key={k} className="flex gap-2.5"><span className="mt-[0.55rem] h-px w-3 shrink-0 bg-turq" />{t(`admin.impKept.${k}`)}</li>)}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[0.82rem] text-ink-2">{t("admin.impRules")}</p>
          </Panel>
          <Panel title={t("admin.impCurrent")}>
            <DefList items={[
              [t("admin.impLastImport"), <span key="i" className="num text-[0.84rem]">{fmtDateTime(locale, project.importedAt)}</span>],
              [t("admin.impFingerprint"), <span key="f" className="num break-all text-[0.74rem] text-ink-2">{project.referenceFingerprint?.slice(0, 24) ?? "—"}…</span>],
            ]} />
          </Panel>
          {history.length > 0 && (
            <Panel title={t("admin.impHistory")} bodyClassName="p-0">
              <ul>{history.map(({ a, email, name }) => {
                const after = (a.after ?? {}) as { inserted?: number; merged?: number; skippedConflicts?: number };
                return <li key={a.id} className="border-b border-line px-4 py-2.5 text-[0.84rem] last:border-b-0"><p className="num text-ink-2">{fmtDateTime(locale, a.at)}</p><p>{name ?? email ?? "—"}</p><p className="num text-[0.78rem] text-ink-3">+{after.inserted ?? 0} · ~{after.merged ?? 0} · !{after.skippedConflicts ?? 0}</p>{a.reason && <p className="text-[0.8rem] text-ink-2">{a.reason}</p>}</li>;
              })}</ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
