import Link from "next/link";
import { and, eq, ne, sql } from "drizzle-orm";
import { LogOut, UserRound } from "lucide-react";
import { db } from "@/db";
import { workLogs } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { getProject } from "@/lib/structure";
import { projectMonthOf, todayInIstanbul } from "@/lib/dates";
import { initials, pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { logoutAction } from "@/app/actions";
import { MobileNav, Sidebar, type NavGroup } from "@/components/shell/nav";
import { LocaleSwitch, ThemeToggle } from "@/components/shell/toggles";
import { Ruler } from "@/components/ui/ruler";
import { Notice } from "@/components/ui/layout";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ t, locale }, project] = await Promise.all([getT(), getProject()]);

  const reviewCount = can.coordinate(user)
    ? (await db.select({ n: sql<number>`count(*)::int` }).from(workLogs).where(and(eq(workLogs.status, "in_review"), user.personId ? ne(workLogs.personId, user.personId) : undefined)))[0].n
    : 0;

  const groups: NavGroup[] = [
    { label: t("nav.groupDaily"), items: [
      { href: "/app", label: t("nav.home"), icon: "House" },
      { href: "/app/gantt", label: t("nav.gantt"), icon: "ChartGantt" },
      { href: "/app/tasks", label: t("nav.tasks"), icon: "ListChecks" },
      { href: "/app/work", label: t("nav.work"), icon: "Clock" },
      { href: "/app/outputs", label: t("nav.outputs"), icon: "Target" },
      { href: "/app/reports", label: t("nav.reports"), icon: "FileChartColumn" },
    ] },
    { label: t("nav.groupRecords"), items: [
      { href: "/app/documents", label: t("nav.documents"), icon: "FolderOpen" },
      { href: "/app/meetings", label: t("nav.meetings"), icon: "Users" },
      { href: "/app/procurements", label: t("nav.procurements"), icon: "Handshake" },
      { href: "/app/travels", label: t("nav.travels"), icon: "Plane" },
      ...(can.finance(user) || can.coordinate(user) ? [{ href: "/app/payments", label: t("nav.payments"), icon: "Landmark" }] : []),
    ] },
  ];
  const adminItems = [
    can.coordinate(user) && { href: "/app/review", label: t("nav.review"), icon: "ClipboardCheck", badge: reviewCount },
    can.coordinate(user) && { href: "/app/admin", label: t("nav.adminPanel"), icon: "Gauge" },
    can.coordinate(user) && { href: "/app/admin/workload", label: t("nav.workload"), icon: "Activity" },
    can.editPlan(user) && { href: "/app/admin/plan", label: t("nav.plan"), icon: "CalendarCog" },
    can.admin(user) && { href: "/app/admin/team", label: t("nav.team"), icon: "UserCog" },
    can.admin(user) && { href: "/app/admin/settings", label: t("nav.settings"), icon: "Settings" },
    can.finance(user) && { href: "/app/admin/costs", label: t("nav.costs"), icon: "Wallet" },
    can.admin(user) && { href: "/app/admin/translations", label: t("nav.translations"), icon: "Languages" },
    can.admin(user) && { href: "/app/admin/import", label: t("nav.import"), icon: "DatabaseBackup" },
    can.admin(user) && { href: "/app/admin/audit", label: t("nav.audit"), icon: "History" },
  ].filter(Boolean) as NavGroup["items"];
  if (adminItems.length) groups.push({ label: t("nav.groupAdmin"), items: adminItems });

  const today = todayInIstanbul();
  const currentMonth = project.startDate ? projectMonthOf(project.startDate, project.durationMonths, today) : null;
  const sub = `PP5 · ${t("common.partner")}`;
  const role = pick(locale, user.projectRoleTr, user.projectRoleEn) || t(`common.role.${user.role}`);

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={groups} sub="PP5 · ZAFER" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <MobileNav groups={groups} sub="PP5 · ZAFER" menuLabel={t("common.menu")} />
          {/* Where we are on the 36-month ruler */}
          <Link href="/app/gantt" className="group hidden min-w-0 flex-1 items-center gap-3 sm:flex" title={sub}>
            <span className="num shrink-0 text-[0.76rem] text-ink-2">
              {currentMonth ? <><span className="font-medium text-ink">{t("common.monthN", { n: currentMonth })}</span> / {project.durationMonths}</> : project.startDate ? t("common.ofMonths", { n: "—", total: project.durationMonths }) : t("common.awaitingStart")}
            </span>
            <Ruler months={project.durationMonths} current={currentMonth} className="h-3.5 max-w-md flex-1 text-ink-3 transition-colors group-hover:text-ink-2" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitch />
            <ThemeToggle />
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-sm border border-line-2 pl-1 pr-2.5 hover:border-ink [&::-webkit-details-marker]:hidden">
                <span className="num grid size-7 place-items-center rounded-xs bg-cobalt text-[0.7rem] font-medium text-on-cobalt">{initials(user.fullName)}</span>
                <span className="hidden max-w-36 truncate text-[0.85rem] font-medium md:block">{user.fullName}</span>
              </summary>
              <div className="absolute right-0 top-11 z-40 w-64 rounded-md border border-line-2 bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(6,10,26,0.45)]">
                <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
                  <p className="truncate font-semibold">{user.fullName}</p>
                  <p className="truncate text-[0.8rem] text-ink-2">{role}</p>
                  <p className="label mt-1.5">{t(`common.role.${user.role}`)}</p>
                </div>
                <Link href="/app/account" className="mt-1 flex items-center gap-2 rounded-sm px-2.5 py-2 text-[0.88rem] hover:bg-surface-2"><UserRound className="size-4 text-ink-3" />{t("common.profile")}</Link>
                <form action={logoutAction}>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-[0.88rem] hover:bg-surface-2"><LogOut className="size-4 text-ink-3" />{t("common.signOut")}</button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[86rem] flex-1 px-4 py-7 sm:px-6 lg:px-8">
          {user.mustChangePassword && (
            <Notice tone="warn" className="mb-6" title={t("admin.tempPasswordTitle")}>
              {t("admin.tempPasswordBody")} <Link href="/app/account" className="font-medium text-ink underline underline-offset-2">{t("common.profile")} →</Link>
            </Notice>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
