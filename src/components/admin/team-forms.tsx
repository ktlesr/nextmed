"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import type { PlanMethod, Role } from "@/db/schema";
import type { ActionState } from "@/lib/action";
import { ROLES } from "@/lib/constants";
import { useT } from "@/i18n/client";
import { createPerson, resetPassword, saveAccount, savePerson } from "@/app/app/admin/team/actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";

export type PersonCard = {
  id: string; fullName: string; organizationTitleTr: string | null; organizationTitleEn: string | null; projectRoleTr: string | null; projectRoleEn: string | null;
  generalDutiesTr: string | null; generalDutiesEn: string | null; provinceTr: string | null; active: boolean; planMethod: PlanMethod; fixedRatio: string | null;
  totalPlannedMinutes: number | null; internalTargetMinutes: number | null; hourlyRateEur: string | null; startProjectMonth: number; endProjectMonth: number;
};
export type AccountCard = { id: string; email: string; role: Role; canEditPlan: boolean; reviewerPersonId: string | null; locale: "tr" | "en"; active: boolean; mustChangePassword: boolean };

/** A temporary password is shown exactly once, right after it is generated. */
function OneTimePassword({ state }: { state: ActionState }) {
  const { t } = useT();
  const pw = state?.ok ? (state.data?.password as string | undefined) : undefined;
  if (!pw) return null;
  return (
    <div className="rounded-sm border border-warn/50 bg-warn-soft px-3.5 py-3">
      <p className="label text-warn">{t("admin.tempPassword")}</p>
      <p className="num mt-1 select-all text-[1.05rem] font-medium tracking-wide">{pw}</p>
      <p className="mt-1 text-[0.8rem] text-ink-2">{t("admin.tempPasswordOnce", { email: String(state?.data?.email ?? "") })}</p>
    </div>
  );
}

function PersonFields({ p, duration, errors }: { p?: PersonCard; duration: number; errors?: Record<string, string> }) {
  const { t } = useT();
  const [method, setMethod] = useState<PlanMethod>(p?.planMethod ?? "fixed_ratio");
  const pct = p?.fixedRatio != null ? String(Math.round(Number(p.fixedRatio) * 10000) / 100) : "";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label={t("admin.fullName")} required error={errors?.fullName}><input name="fullName" required defaultValue={p?.fullName} className="control" maxLength={120} /></Field>
        <Field label={t("admin.province")} hint={t("common.optional")}><input name="provinceTr" defaultValue={p?.provinceTr ?? ""} className="control" maxLength={60} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("admin.orgTitle")} · TR`}><input name="organizationTitleTr" defaultValue={p?.organizationTitleTr ?? ""} className="control" /></Field>
        <Field label={`${t("admin.orgTitle")} · EN`} hint={t("admin.autoTranslateHint")}><input name="organizationTitleEn" defaultValue={p?.organizationTitleEn ?? ""} className="control" /></Field>
        <Field label={`${t("admin.projectRole")} · TR`}><input name="projectRoleTr" defaultValue={p?.projectRoleTr ?? ""} className="control" /></Field>
        <Field label={`${t("admin.projectRole")} · EN`}><input name="projectRoleEn" defaultValue={p?.projectRoleEn ?? ""} className="control" /></Field>
        <Field label={`${t("admin.duties")} · TR`}><textarea name="generalDutiesTr" defaultValue={p?.generalDutiesTr ?? ""} className="control" /></Field>
        <Field label={`${t("admin.duties")} · EN`}><textarea name="generalDutiesEn" defaultValue={p?.generalDutiesEn ?? ""} className="control" /></Field>
      </div>
      <fieldset className="rounded-sm border border-line p-3.5">
        <legend className="label px-1.5">{t("admin.workPlan")}</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={t("admin.method")} className="sm:col-span-2">
            <select name="planMethod" className="control" value={method} onChange={(e) => setMethod(e.target.value as PlanMethod)}>
              {(["fixed_ratio", "hourly", "non_budget_support"] as const).map((m) => <option key={m} value={m}>{t(`common.method.${m}`)}</option>)}
            </select>
          </Field>
          <Field label={t("admin.startMonth")}><input name="startProjectMonth" type="number" min={1} max={duration} defaultValue={p?.startProjectMonth ?? 1} className="control num" /></Field>
          <Field label={t("admin.endMonth")} error={errors?.endProjectMonth}><input name="endProjectMonth" type="number" min={1} max={duration} defaultValue={p?.endProjectMonth ?? duration} className="control num" /></Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {method === "fixed_ratio" && <Field label={t("admin.ratioPct")} required error={errors?.fixedRatioPct} hint={t("admin.ratioHint")}><input name="fixedRatioPct" inputMode="decimal" defaultValue={pct} className="control num" placeholder="15" /></Field>}
          {method === "hourly" && <>
            <Field label={t("admin.totalHours")} required error={errors?.totalPlannedHours} hint={t("admin.totalHoursHint")}><input name="totalPlannedHours" inputMode="decimal" defaultValue={p?.totalPlannedMinutes != null ? p.totalPlannedMinutes / 60 : ""} className="control num" /></Field>
            <Field label={t("admin.hourlyRate")} hint={t("admin.hourlyRateHint")}><input name="hourlyRateEur" inputMode="decimal" defaultValue={p?.hourlyRateEur ?? ""} className="control num" /></Field>
          </>}
          {method === "non_budget_support" && <Field label={t("admin.internalTarget")} hint={t("admin.internalTargetHint")}><input name="internalTargetHours" inputMode="decimal" defaultValue={p?.internalTargetMinutes != null ? p.internalTargetMinutes / 60 : ""} className="control num" /></Field>}
        </div>
        <p className="mt-3 text-[0.8rem] text-ink-3">{t("admin.datesDerived")}</p>
      </fieldset>
    </>
  );
}

export function PersonForm({ person, duration }: { person: PersonCard; duration: number }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(savePerson, null);
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={person.id} />
      <PersonFields p={person} duration={duration} errors={state?.fieldErrors} />
      <label className="flex items-center gap-2 text-[0.9rem]"><input type="checkbox" name="active" defaultChecked={person.active} className="accent-[var(--cobalt)]" />{t("admin.personActive")}</label>
      <Field label={t("common.reason")} hint={t("common.optional")}><input name="reason" className="control" maxLength={300} /></Field>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>{t("common.save")}</SubmitButton></div>
    </form>
  );
}

function AccountFields({ a, people, personId, errors }: { a?: AccountCard; people: { id: string; fullName: string }[]; personId?: string; errors?: Record<string, string> }) {
  const { t } = useT();
  const [role, setRole] = useState<Role>(a?.role ?? "member");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("landing.email")} required error={errors?.email}><input name="email" type="email" required defaultValue={a?.email} className="control num text-[0.88rem]" /></Field>
        <Field label={t("admin.systemRole")} hint={t("admin.systemRoleHint")}>
          <select name="role" className="control" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(`common.role.${r}`)}</option>)}</select>
        </Field>
        <Field label={t("admin.reviewer")} hint={t("admin.reviewerHint")} error={errors?.reviewerPersonId}>
          <select name="reviewerPersonId" className="control" defaultValue={a?.reviewerPersonId ?? ""}>
            <option value="">{t("common.none")}</option>
            {people.filter((p) => p.id !== personId).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </Field>
        <Field label={t("common.language")}><select name="locale" className="control" defaultValue={a?.locale ?? "tr"}><option value="tr">Türkçe</option><option value="en">English</option></select></Field>
      </div>
      <p className="text-[0.82rem] text-ink-2">{t(`admin.roleDesc.${role}`)}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem]">
        {role === "coordinator" && <label className="flex items-center gap-2"><input type="checkbox" name="canEditPlan" defaultChecked={a?.canEditPlan} className="accent-[var(--cobalt)]" />{t("admin.canEditPlan")}</label>}
        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={a ? a.active : true} className="accent-[var(--cobalt)]" />{t("admin.accountActive")}</label>
      </div>
    </>
  );
}

export function AccountForm({ personId, account, people }: { personId: string; account: AccountCard | null; people: { id: string; fullName: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(saveAccount, null);
  const [resetState, resetAction] = useActionState(resetPassword, null);
  useEffect(() => { if (state?.ok || resetState?.ok) router.refresh(); }, [state, resetState, router]);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="personId" value={personId} />
        {account && <input type="hidden" name="userId" value={account.id} />}
        {!account && <p className="rounded-sm bg-surface-2 px-3 py-2 text-[0.86rem] text-ink-2">{t("admin.noAccountYet")}</p>}
        <AccountFields a={account ?? undefined} people={people} personId={personId} errors={state?.fieldErrors} />
        <FormMessage state={state} />
        <OneTimePassword state={state} />
        <div className="flex justify-end"><SubmitButton>{account ? t("common.save") : t("admin.createAccount")}</SubmitButton></div>
      </form>
      {account && (
        <form action={resetAction} className="flex flex-col gap-3 border-t border-line pt-4">
          <input type="hidden" name="userId" value={account.id} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[40ch] text-[0.84rem] text-ink-2">{t("admin.resetHint")}</p>
            <SubmitButton variant="secondary"><KeyRound className="size-4" />{t("admin.resetPassword")}</SubmitButton>
          </div>
          <FormMessage state={resetState} />
          <OneTimePassword state={resetState} />
        </form>
      )}
    </div>
  );
}

export function NewPersonForm({ duration }: { duration: number }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(createPerson, null);
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  if (state?.ok) return <div className="flex flex-col gap-4"><FormMessage state={state} /><OneTimePassword state={state} /></div>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <PersonFields duration={duration} errors={state?.fieldErrors} />
      <fieldset className="rounded-sm border border-line p-3.5">
        <legend className="label px-1.5">{t("admin.access")} · {t("common.optional")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("landing.email")} error={state?.fieldErrors?.email} hint={t("admin.emailOptionalHint")}><input name="email" type="email" className="control num text-[0.88rem]" /></Field>
          <Field label={t("admin.systemRole")}><select name="role" className="control" defaultValue="member">{ROLES.map((r) => <option key={r} value={r}>{t(`common.role.${r}`)}</option>)}</select></Field>
        </div>
      </fieldset>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>{t("admin.addPerson")}</SubmitButton></div>
    </form>
  );
}
