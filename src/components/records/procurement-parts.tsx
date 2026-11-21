import type { TFn, Locale } from "@/i18n";
import type { procurements, ProcurementStatus } from "@/db/schema";
import type { ChainOptions, Person } from "@/lib/structure";
import { PROCUREMENT_STATUSES } from "@/lib/constants";
import { CURRENCIES, PROCUREMENT_METHODS } from "@/lib/records";
import { pick } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Field, SubmitButton } from "@/components/ui/form";
import { ActivitySelect } from "@/components/ui/chain-select";
import { ActionForm } from "./action-form";
import { PersonSelect } from "./parts";
import { saveProcurement } from "@/app/app/procurements/actions";

type Procurement = typeof procurements.$inferSelect;
export const STAGES = PROCUREMENT_STATUSES.filter((s) => s !== "cancelled") as ProcurementStatus[];

/** Documents expected once a procurement has reached each stage (cumulative). */
export const REQUIRED_BY_STAGE: Record<ProcurementStatus, string[]> = {
  planning: ["specification"],
  tender: ["specification", "tender_notice", "offer"],
  evaluation: ["specification", "tender_notice", "offer", "evaluation"],
  contracted: ["specification", "tender_notice", "offer", "evaluation", "contract"],
  delivered: ["specification", "tender_notice", "offer", "evaluation", "contract", "delivery"],
  accepted: ["specification", "tender_notice", "offer", "evaluation", "contract", "delivery", "acceptance"],
  paid: ["specification", "tender_notice", "offer", "evaluation", "contract", "delivery", "acceptance", "invoice", "payment"],
  cancelled: [],
};

/** Stage track: planning → tender → evaluation → contract → delivery → acceptance → payment. */
export function StageTrack({ status, t, compact }: { status: ProcurementStatus; t: TFn; compact?: boolean }) {
  if (status === "cancelled") return <span className="num inline-flex h-5 items-center rounded-xs border border-line-2 px-1.5 text-[0.72rem] text-ink-3 line-through">{t("ops.pst.cancelled")}</span>;
  const idx = STAGES.indexOf(status);
  return (
    <div className={cn(compact ? "w-36" : "w-full")} role="img" aria-label={t(`ops.pst.${status}`)}>
      <div className="flex gap-[3px]">
        {STAGES.map((s, i) => <span key={s} title={t(`ops.pst.${s}`)} className={cn("h-1.5 flex-1 rounded-[1px]", i < idx ? "bg-turq" : i === idx ? "bg-cobalt" : "bg-surface-3")} />)}
      </div>
      {compact ? <p className="mt-1 text-[0.78rem] font-medium">{t(`ops.pst.${status}`)} <span className="num text-ink-3">{idx + 1}/{STAGES.length}</span></p> : (
        <div className="mt-1.5 hidden gap-[3px] sm:flex">{STAGES.map((s, i) => <span key={s} className={cn("flex-1 truncate text-[0.72rem]", i === idx ? "font-semibold text-ink" : i < idx ? "text-ink-2" : "text-ink-3")}>{t(`ops.pst.${s}`)}</span>)}</div>
      )}
    </div>
  );
}

export function ProcurementForm({ t, locale, row, people, options, defaultResponsible }: { t: TFn; locale: Locale; row?: Procurement; people: Person[]; options: ChainOptions; defaultResponsible?: string | null }) {
  const known = (PROCUREMENT_METHODS as readonly string[]).includes(row?.method ?? "");
  return (
    <ActionForm action={saveProcurement} className="flex flex-col gap-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.title")} required hint={t("ops.bilingualHint")} className="sm:col-span-2"><input name="title" required className="control" defaultValue={row ? pick(locale, row.titleTr, row.titleEn) : ""} /></Field>
        <Field label={t("ops.scope")} className="sm:col-span-2"><textarea name="scope" className="control" defaultValue={row ? pick(locale, row.scopeTr, row.scopeEn) : ""} /></Field>
        <Field label={t("common.linkedActivity")} className="sm:col-span-2"><ActivitySelect options={options} defaultValue={row?.activityId} /></Field>
        <Field label={t("ops.agencyResponsible")}><PersonSelect people={people} name="responsibleId" t={t} defaultValue={row?.responsibleId ?? defaultResponsible} /></Field>
        <Field label={t("common.status")}>
          <select name="status" className="control" defaultValue={row?.status ?? "planning"}>{PROCUREMENT_STATUSES.map((s) => <option key={s} value={s}>{t(`ops.pst.${s}`)}</option>)}</select>
        </Field>
        <Field label={t("ops.method")} hint={t("ops.methodHint")}>
          <select name="method" className="control" defaultValue={row?.method ? (known ? row.method : "other") : ""}>
            <option value="">{t("common.select")}</option>
            {PROCUREMENT_METHODS.map((m) => <option key={m} value={m}>{t(`ops.pm.${m}`)}</option>)}
          </select>
        </Field>
        <Field label={t("ops.methodOther")} hint={t("ops.methodOtherHint")}><input name="methodOther" className="control" defaultValue={row?.method && !known ? row.method : ""} /></Field>
        <Field label={t("ops.estimatedAmount")}><input name="estimatedAmount" inputMode="decimal" className="control num" defaultValue={row?.estimatedAmount ?? ""} /></Field>
        <Field label={t("common.currency")}><select name="currency" className="control" defaultValue={row?.currency ?? "EUR"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label={t("ops.contractor")}><input name="contractor" className="control" defaultValue={row?.contractor ?? ""} /></Field>
        <Field label={t("ops.contractAmount")}><input name="contractAmount" inputMode="decimal" className="control num" defaultValue={row?.contractAmount ?? ""} /></Field>
        <Field label={t("ops.deliveryDate")}><input type="date" name="deliveryDate" className="control" defaultValue={row?.deliveryDate ?? ""} /></Field>
      </div>
      <div><SubmitButton>{t("common.save")}</SubmitButton></div>
    </ActionForm>
  );
}

export const methodLabel = (t: TFn, method: string | null) => (!method ? "—" : (PROCUREMENT_METHODS as readonly string[]).includes(method) ? t(`ops.pm.${method}`) : method);
