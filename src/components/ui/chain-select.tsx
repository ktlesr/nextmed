"use client";
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import type { ChainOptions } from "@/lib/structure";
import { Field } from "./form";

/**
 * Dependent WP → output → activity → sub-activity selects over the fixed project tree.
 * Changing a parent clears incompatible children. Options show code + full name (native select type-ahead
 * works on the code). Assigned sub-activities are listed first. Field names: workPackageId, outputId,
 * activityId, subactivityId.
 */
export function ChainSelect({ options, defaults, depth = "sub", required = true, assignedSubIds = [], onChange, errors }: {
  options: ChainOptions;
  defaults?: { wp?: string | null; out?: string | null; act?: string | null; sub?: string | null };
  depth?: "activity" | "sub";
  required?: boolean;
  assignedSubIds?: string[];
  onChange?: (v: { wp: string; out: string; act: string; sub: string }) => void;
  errors?: Record<string, string>;
}) {
  const { t, locale } = useT();
  // When only an activity is known (e.g. editing a linked record) derive its parents.
  const init = useMemo(() => {
    let { wp = "", out = "", act = "" } = { wp: defaults?.wp ?? "", out: defaults?.out ?? "", act: defaults?.act ?? "" };
    if (act && !out) out = options.acts.find((a) => a.id === act)?.parent ?? "";
    if (out && !wp) wp = options.outs.find((o) => o.id === out)?.parent ?? "";
    return { wp, out, act, sub: defaults?.sub ?? "" };
  }, [defaults, options]);
  const [v, setV] = useState(init);
  const set = (next: typeof v) => { setV(next); onChange?.(next); };
  const name = (o: { nameTr: string; nameEn: string }) => (locale === "tr" ? o.nameTr || o.nameEn : o.nameEn || o.nameTr);
  const outs = options.outs.filter((o) => o.parent === v.wp);
  const acts = options.acts.filter((a) => a.parent === v.out);
  const assigned = new Set(assignedSubIds);
  const subs = options.subs.filter((s) => s.parent === v.act);
  const mine = subs.filter((s) => assigned.has(s.id)), others = subs.filter((s) => !assigned.has(s.id));
  const clip = (s: string, n = 96) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("common.workPackage")} required={required} error={errors?.workPackageId}>
        <select name="workPackageId" className="control" required={required} value={v.wp} onChange={(e) => set({ wp: e.target.value, out: "", act: "", sub: "" })}>
          <option value="">{t("common.select")}</option>
          {options.wps.map((w) => <option key={w.id} value={w.id}>{w.code} · {clip(name(w))}</option>)}
        </select>
      </Field>
      <Field label={t("common.output")} required={required} error={errors?.outputId}>
        <select name="outputId" className="control" required={required} disabled={!v.wp} value={v.out} onChange={(e) => set({ ...v, out: e.target.value, act: "", sub: "" })}>
          <option value="">{v.wp ? t("common.select") : t("common.selectParentFirst")}</option>
          {outs.map((o) => <option key={o.id} value={o.id}>{o.code} · {clip(name(o))}</option>)}
        </select>
      </Field>
      <Field label={t("common.activity")} required={required} error={errors?.activityId} className={depth === "activity" ? "sm:col-span-2" : undefined}>
        <select name="activityId" className="control" required={required} disabled={!v.out} value={v.act} onChange={(e) => set({ ...v, act: e.target.value, sub: "" })}>
          <option value="">{v.out ? t("common.select") : t("common.selectParentFirst")}</option>
          {acts.map((a) => <option key={a.id} value={a.id}>{a.code} · {clip(name(a))}</option>)}
        </select>
      </Field>
      {depth === "sub" && (
        <Field label={t("common.subactivity")} hint={t("common.optional")} error={errors?.subactivityId}>
          <select name="subactivityId" className="control" disabled={!v.act} value={v.sub} onChange={(e) => set({ ...v, sub: e.target.value })}>
            <option value="">{v.act ? t("common.none") : t("common.selectParentFirst")}</option>
            {mine.length > 0 && <optgroup label={t("common.assignedToMe")}>{mine.map((s) => <option key={s.id} value={s.id}>{s.code} · {clip(name(s))}</option>)}</optgroup>}
            {mine.length > 0 ? <optgroup label={t("common.others")}>{others.map((s) => <option key={s.id} value={s.id}>{s.code} · {clip(name(s))}</option>)}</optgroup> : others.map((s) => <option key={s.id} value={s.id}>{s.code} · {clip(name(s))}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

/** Single optional activity link (meetings, travels, procurements, documents). Field name: activityId. */
export function ActivitySelect({ options, defaultValue, name = "activityId", required }: { options: ChainOptions; defaultValue?: string | null; name?: string; required?: boolean }) {
  const { t, locale } = useT();
  return (
    <select name={name} className="control" defaultValue={defaultValue ?? ""} required={required}>
      <option value="">{t("common.none")}</option>
      {options.wps.map((w) => (
        <optgroup key={w.id} label={`${w.code} · ${locale === "tr" ? w.nameTr : w.nameEn}`.slice(0, 80)}>
          {options.acts.filter((a) => options.outs.find((o) => o.id === a.parent)?.parent === w.id).map((a) => {
            const n = locale === "tr" ? a.nameTr : a.nameEn;
            return <option key={a.id} value={a.id}>{a.code} · {n.length > 90 ? n.slice(0, 89) + "…" : n}</option>;
          })}
        </optgroup>
      ))}
    </select>
  );
}
