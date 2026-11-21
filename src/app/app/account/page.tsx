import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { pick } from "@/lib/format";
import { DefList, PageHeader, Panel } from "@/components/ui/layout";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  return (
    <>
      <PageHeader eyebrow={t("common.profile")} title={user.fullName} description={pick(locale, user.projectRoleTr, user.projectRoleEn)} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("admin.accountInfo")}>
          <DefList items={[[t("landing.email"), <span key="e" className="num text-[0.88rem]">{user.email}</span>], [t("admin.systemRole"), t(`common.role.${user.role}`)], [t("common.language"), locale.toUpperCase()]]} />
        </Panel>
        <Panel title={t("admin.changePassword")}><PasswordForm /></Panel>
      </div>
    </>
  );
}
