import { asc, eq } from "drizzle-orm";
import { Pencil, ShieldCheck, UserPlus } from "lucide-react";
import { db } from "@/db";
import { assignments, people, users } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { getProject } from "@/lib/structure";
import { fmtDateTime, initials, pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/dialog";
import { planSummary } from "@/components/admin/plan-summary";
import { AccountForm, NewPersonForm, PersonForm } from "@/components/admin/team-forms";

export const metadata = { title: "Ekip ve Roller" };

export default async function TeamPage() {
  const me = await requireRole(can.admin);
  const [{ t, locale }, project, rows, accounts, counts] = await Promise.all([
    getT(), getProject(), db.select().from(people).orderBy(asc(people.sort)), db.select().from(users),
    db.select({ personId: assignments.personId, n: sql<number>`count(*)::int` }).from(assignments).where(eq(assignments.active, true)).groupBy(assignments.personId),
  ]);
  const options = rows.filter((p) => p.active).map((p) => ({ id: p.id, fullName: p.fullName }));
  const unlinked = accounts.filter((a) => !a.personId);
  const roleTone = { admin: "red", coordinator: "cobalt", finance: "turq", member: "neutral" } as const;

  return (
    <>
      <PageHeader eyebrow={`${t("nav.groupAdmin")} · ${t("admin.nPeople", { n: rows.filter((p) => p.active).length })}`} title={t("nav.team")} description={t("admin.teamLede")}
        actions={<Modal trigger={<><UserPlus className="size-4" />{t("admin.addPerson")}</>} title={t("admin.addPerson")} description={t("admin.addPersonLede")} side><NewPersonForm duration={project.durationMonths} /></Modal>} />
      <div className="tbl-wrap">
        <table className="tbl min-w-[62rem]">
          <thead><tr><th>{t("common.person")}</th><th>{t("admin.projectRole")}</th><th>{t("admin.workPlan")}</th><th className="r">{t("admin.tasksShort")}</th><th>{t("admin.access")}</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const acc = accounts.find((a) => a.personId === p.id) ?? null;
              const plan = planSummary(p, t, locale);
              const reviewer = acc?.reviewerPersonId ? rows.find((x) => x.id === acc.reviewerPersonId)?.fullName : null;
              return (
                <tr key={p.id} className={p.active ? undefined : "opacity-55"}>
                  <td>
                    <div className="flex items-start gap-3">
                      <span className="num grid size-8 shrink-0 place-items-center rounded-xs bg-surface-2 text-[0.72rem] font-medium text-ink-2">{initials(p.fullName)}</span>
                      <div className="min-w-0"><p className="font-semibold">{p.fullName}{!p.active && <Badge tone="neutral" className="ml-2">{t("admin.inactive")}</Badge>}</p><p className="max-w-[24rem] text-[0.8rem] text-ink-2">{pick(locale, p.organizationTitleTr, p.organizationTitleEn)}</p></div>
                    </div>
                  </td>
                  <td className="max-w-[15rem]">{pick(locale, p.projectRoleTr, p.projectRoleEn) || "—"}{p.provinceTr && <span className="label mt-1 block">{p.provinceTr}</span>}</td>
                  <td className="whitespace-nowrap"><span className="num font-medium">{plan.main}</span>{plan.sub && <span className="num block text-[0.78rem] text-ink-3">{plan.sub}</span>}<span className="num block text-[0.74rem] text-ink-3">{t("admin.monthRange", { a: p.startProjectMonth, b: p.endProjectMonth })}</span></td>
                  <td className="num r">{counts.find((c) => c.personId === p.id)?.n ?? 0}</td>
                  <td>
                    {acc ? (
                      <>
                        <p className="flex flex-wrap items-center gap-1.5"><Badge tone={roleTone[acc.role]}>{t(`common.role.${acc.role}`)}</Badge>{acc.canEditPlan && <Badge tone="outline">{t("admin.planEditShort")}</Badge>}{!acc.active && <Badge tone="warn">{t("admin.accountDisabled")}</Badge>}{acc.mustChangePassword && acc.active && <Badge tone="outline">{t("admin.tempPwShort")}</Badge>}</p>
                        <p className="num mt-1 text-[0.78rem] text-ink-2">{acc.email}</p>
                        <p className="text-[0.74rem] text-ink-3">{acc.lastLoginAt ? t("admin.lastLogin", { at: fmtDateTime(locale, acc.lastLoginAt) }) : t("admin.neverLoggedIn")}{reviewer ? ` · ${t("admin.reviewerShort", { name: reviewer })}` : ""}</p>
                      </>
                    ) : <span className="text-[0.84rem] text-ink-3">{t("admin.noAccount")}</span>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Modal trigger={<><Pencil className="size-3.5" />{t("admin.card")}</>} triggerVariant="secondary" triggerSize="sm" title={p.fullName} description={t("admin.cardLede")} side>
                        <PersonForm duration={project.durationMonths} person={{ id: p.id, fullName: p.fullName, organizationTitleTr: p.organizationTitleTr, organizationTitleEn: p.organizationTitleEn, projectRoleTr: p.projectRoleTr, projectRoleEn: p.projectRoleEn, generalDutiesTr: p.generalDutiesTr, generalDutiesEn: p.generalDutiesEn, provinceTr: p.provinceTr, active: p.active, planMethod: p.planMethod, fixedRatio: p.fixedRatio, totalPlannedMinutes: p.totalPlannedMinutes, internalTargetMinutes: p.internalTargetMinutes, hourlyRateEur: p.hourlyRateEur, startProjectMonth: p.startProjectMonth, endProjectMonth: p.endProjectMonth }} />
                      </Modal>
                      <Modal trigger={<><ShieldCheck className="size-3.5" />{t("admin.access")}</>} triggerVariant="secondary" triggerSize="sm" title={`${t("admin.access")} · ${p.fullName}`} description={t("admin.accessLede")} side>
                        <AccountForm personId={p.id} people={options} account={acc ? { id: acc.id, email: acc.email, role: acc.role, canEditPlan: acc.canEditPlan, reviewerPersonId: acc.reviewerPersonId, locale: acc.locale, active: acc.active, mustChangePassword: acc.mustChangePassword } : null} />
                      </Modal>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unlinked.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg">{t("admin.systemAccounts")}</h2>
          <p className="mt-1 text-[0.88rem] text-ink-2">{t("admin.systemAccountsLede")}</p>
          <ul className="panel mt-3">
            {unlinked.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span><span className="num text-[0.88rem]">{a.email}</span>{a.id === me.id && <span className="label ml-2">{t("admin.you")}</span>}<span className="ml-3"><Badge tone={roleTone[a.role]}>{t(`common.role.${a.role}`)}</Badge>{!a.active && <Badge tone="warn" className="ml-1.5">{t("admin.accountDisabled")}</Badge>}</span></span>
                <Modal trigger={<><ShieldCheck className="size-3.5" />{t("admin.access")}</>} triggerVariant="secondary" triggerSize="sm" title={a.email} side>
                  <AccountForm personId="" people={options} account={{ id: a.id, email: a.email, role: a.role, canEditPlan: a.canEditPlan, reviewerPersonId: a.reviewerPersonId, locale: a.locale, active: a.active, mustChangePassword: a.mustChangePassword }} />
                </Modal>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
