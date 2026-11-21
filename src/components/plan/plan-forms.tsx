"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { createSub, moveSub, removeAssignment, saveActivityStatus, saveAssignment, subLifecycle, updateSub } from "@/app/app/admin/plan/actions";
import { useT } from "@/i18n/client";
import type { ChainOptions } from "@/lib/structure";
import { PLAN_STATUSES, RESPONSIBILITIES } from "@/lib/constants";
import { fmtCentiHours, monthsLabel } from "@/lib/format";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MonthGrid } from "@/components/ui/month-grid";
import { ChainSelect, ActivitySelect } from "@/components/ui/chain-select";
import { useModalClose } from "@/components/ui/dialog";
import { Badge, planTone } from "@/components/ui/badge";
import { Notice } from "@/components/ui/layout";
import type { ActionState } from "@/lib/action";

export type PersonOpt = { id: string; name: string; hourly: boolean };
export type AsgView = { id: string; personId: string; personName: string; hourly: boolean; responsibility: string; task: string; mode: "inherit" | "custom"; months: number[]; centi: number; allocMonths: number; status: string };
export type SubView = { id: string; code: string; name: string; description: string; mode: "inherit" | "custom"; months: number[]; status: string; completedOn: string | null; resultNote: string; active: boolean; hasHistory: boolean };

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
function useCloseOnOk(state: ActionState) {
  const close = useModalClose();
  useEffect(() => { if (state?.ok) close(); }, [state, close]);
}

function StatusFields({ status, completedOn, resultNote }: { status: string; completedOn?: string | null; resultNote?: string }) {
  const { t } = useT();
  const [s, setS] = useState(status);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("common.status")}>
        <select name="status" className="control" value={s} onChange={(e) => setS(e.target.value)}>{PLAN_STATUSES.map((x) => <option key={x} value={x}>{t(`common.plan.${x}`)}</option>)}</select>
      </Field>
      <Field label={t("gantt.completedOn")}><input type="date" name="completedOn" className="control" defaultValue={completedOn ?? ""} disabled={s !== "completed"} /></Field>
      <Field label={t("gantt.resultNote")} className="sm:col-span-2"><textarea name="resultNote" className="control min-h-16" defaultValue={resultNote ?? ""} /></Field>
    </div>
  );
}

export function ActivityStatusForm({ id, status, completedOn, resultNote }: { id: string; status: string; completedOn: string | null; resultNote: string }) {
  const { t } = useT();
  const [state, action] = useActionState(saveActivityStatus, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <StatusFields status={status} completedOn={completedOn} resultNote={resultNote} />
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{t("common.save")}</SubmitButton></div>
    </form>
  );
}

function ModeAndMonths({ mode, setMode, months, setMonths, parentMonths, duration, gridKey }: { mode: "inherit" | "custom"; setMode: (m: "inherit" | "custom") => void; months: number[]; setMonths: (m: number[]) => void; parentMonths: number[]; duration: number; gridKey: string }) {
  const { t, locale } = useT();
  return (
    <fieldset>
      <legend className="label mb-1.5">{t("gantt.planMethod")}</legend>
      <div className="flex flex-col gap-1.5 text-[0.9rem]">
        <label className="flex items-center gap-2"><input type="radio" name="mode" value="inherit" checked={mode === "inherit"} onChange={() => setMode("inherit")} />{t("gantt.inherit")} <span className="num text-[0.78rem] text-ink-3">{monthsLabel(locale, parentMonths)}</span></label>
        <label className="flex items-center gap-2"><input type="radio" name="mode" value="custom" checked={mode === "custom"} onChange={() => { setMode("custom"); if (!months.length) setMonths(parentMonths); }} />{t("gantt.custom")}</label>
      </div>
      {mode === "custom" ? (
        <div className="mt-3">
          <MonthGrid key={gridKey} name="months" duration={duration} defaultValue={months.length ? months : parentMonths} reference={parentMonths} onChange={setMonths} />
          <p className="mt-1.5 text-[0.78rem] text-ink-3">{t("gantt.monthsHint")}</p>
        </div>
      ) : <input type="hidden" name="months" value="" />}
    </fieldset>
  );
}

/** Add a sub-activity under a fixed main activity — one form: tree, definition, period, people. */
export function CreateSubForm({ options, people, duration, defaultActivity, nextCodes }: { options: ChainOptions; people: PersonOpt[]; duration: number; defaultActivity?: string; nextCodes: Record<string, string> }) {
  const { t } = useT();
  const [state, action] = useActionState(createSub, null);
  useCloseOnOk(state);
  const [act, setAct] = useState(defaultActivity ?? "");
  const [mode, setMode] = useState<"inherit" | "custom">("inherit");
  const [months, setMonths] = useState<number[]>([]);
  const [rows, setRows] = useState<number[]>([0]);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const parentMonths = useMemo(() => options.acts.find((a) => a.id === act)?.months ?? [], [options, act]);
  const outside = mode === "custom" && parentMonths.length ? months.filter((m) => m < Math.min(...parentMonths) || m > Math.max(...parentMonths)) : [];
  return (
    <form action={action} className="flex flex-col gap-5">
      <ChainSelect options={options} depth="activity" defaults={{ act: defaultActivity }} onChange={(v) => { if (v.act !== act) { setAct(v.act); setMonths([]); setMode("inherit"); } }} />
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <Field label={t("gantt.subCode")}><input key={act} name="code" className="control num" defaultValue={nextCodes[act] ?? ""} /></Field>
        <Field label={t("gantt.subName")} required><input name="name" className="control" required /></Field>
      </div>
      <Field label={t("gantt.subDesc")} hint={t("gantt.codeHint")}><textarea name="description" className="control" /></Field>
      {act && <ModeAndMonths mode={mode} setMode={setMode} months={months} setMonths={setMonths} parentMonths={parentMonths} duration={duration} gridKey={act} />}
      {outside.length > 0 && <Notice tone="warn" title={<span className="flex items-center gap-1.5"><TriangleAlert className="size-4" />{t("gantt.outside")}</span>}>{t("gantt.pvOutside", { m: outside.join(", ") })}</Notice>}
      <fieldset className="rule-top pt-4">
        <legend className="label">{t("gantt.people")}</legend>
        <div className="flex flex-col gap-3">
          {rows.map((k) => (
            <div key={k} className="grid gap-2 rounded-sm border border-line p-3 sm:grid-cols-[1fr_1fr_6.5rem_auto]">
              <select name="personId" className="control" aria-label={t("common.person")} value={picked[k] ?? ""} onChange={(e) => setPicked({ ...picked, [k]: e.target.value })}>
                <option value="">{t("common.select")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select name="responsibility" className="control" aria-label={t("gantt.responsibility")} defaultValue={k === 0 ? "lead" : "support"}>{RESPONSIBILITIES.map((r) => <option key={r} value={r}>{t(`common.resp.${r}`)}</option>)}</select>
              <input name="hours" inputMode="decimal" className="control num" placeholder={t("gantt.planHours")} aria-label={t("gantt.planHours")} disabled={!people.find((p) => p.id === picked[k])?.hourly} />
              {!people.find((p) => p.id === picked[k])?.hourly && <input type="hidden" name="hours" value="" />}
              <Button type="button" variant="ghost" size="sm" aria-label={t("gantt.remove")} onClick={() => setRows(rows.filter((x) => x !== k))}><Trash2 className="size-4" /></Button>
              <textarea name="task" className="control min-h-14 sm:col-span-4" placeholder={t("gantt.personalTask")} aria-label={t("gantt.personalTask")} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows([...rows, (rows[rows.length - 1] ?? 0) + 1])}><Plus className="size-4" />{t("gantt.addPerson")}</Button>
          <p className="text-[0.76rem] text-ink-3">{t("gantt.planHoursHint")} {t("gantt.ratioNote")}</p>
        </div>
      </fieldset>
      <StatusFields status="not_started" />
      <Field label={t("gantt.revisionReason")} required={outside.length > 0}><input name="reason" className="control" required={outside.length > 0} /></Field>
      <FormMessage state={state} />
      <div className="flex gap-2"><SubmitButton>{t("gantt.addSub")}</SubmitButton></div>
    </form>
  );
}

/** Edit / postpone a sub-activity with a preview of everything the new period touches. */
export function EditSubForm({ sub, parentMonths, duration, assignments }: { sub: SubView; parentMonths: number[]; duration: number; assignments: AsgView[] }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(updateSub, null);
  useCloseOnOk(state);
  const [mode, setMode] = useState(sub.mode);
  const [months, setMonths] = useState<number[]>(sub.months);
  const oldM = sub.months;
  const newM = mode === "custom" ? months : parentMonths;
  const changed = !same(oldM, newM);
  const lo = Math.min(...parentMonths), hi = Math.max(...parentMonths);
  const outside = newM.filter((m) => m < lo || m > hi);
  const inherited = assignments.filter((a) => a.mode === "inherit"), custom = assignments.filter((a) => a.mode === "custom"), hourly = assignments.filter((a) => a.centi > 0);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={sub.id} />
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <Field label={t("gantt.subCode")}><input name="code" className="control num" defaultValue={sub.code} /></Field>
        <Field label={t("gantt.subName")} required><textarea name="name" className="control min-h-16" required defaultValue={sub.name} /></Field>
      </div>
      <Field label={t("gantt.subDesc")} hint={t("gantt.codeHint")}><textarea name="description" className="control" defaultValue={sub.description} /></Field>
      <ModeAndMonths mode={mode} setMode={setMode} months={months} setMonths={setMonths} parentMonths={parentMonths} duration={duration} gridKey={sub.id} />
      <section className="rounded-sm border border-line-2 bg-surface-2/50 p-3.5 text-[0.87rem]" aria-live="polite">
        <p className="label mb-2">{t("gantt.preview")}</p>
        {!changed ? <p className="text-ink-3">{t("gantt.pvNoChange")}</p> : (
          <div className="flex flex-col gap-3">
            <p className="num font-medium">{t("gantt.pvOldNew", { old: monthsLabel(locale, oldM), new: monthsLabel(locale, newM) })}</p>
            {outside.length > 0 && <Notice tone="warn" title={<span className="flex items-center gap-1.5"><TriangleAlert className="size-4" />{t("gantt.outside")}</span>}>{t("gantt.pvOutside", { m: outside.join(", ") })}</Notice>}
            {inherited.length > 0 && <p>{t("gantt.pvInherited", { n: inherited.length })}</p>}
            {custom.length > 0 && (
              <div>
                <p>{t("gantt.pvCustom")}</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {custom.map((a) => <li key={a.id}><label className="flex items-center gap-2"><input type="checkbox" name="align" value={a.id} /><span className="font-medium">{a.personName}</span><span className="num text-ink-3">{monthsLabel(locale, a.months)}</span><span className="text-cobalt">{t("gantt.align")}</span></label></li>)}
                </ul>
              </div>
            )}
            {hourly.length > 0 && (
              <div>
                <p>{t("gantt.pvHourly")}</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {hourly.map((a) => <li key={a.id} className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium">{a.personName}</span><span className="num">{fmtCentiHours(locale, a.centi)}</span><span className="text-ink-3">· {oldM.length === newM.length ? t("gantt.pvSameLen") : t("gantt.pvNewLen")}</span></li>)}
                </ul>
                {oldM.length !== newM.length && <Field label={t("gantt.weights")} hint={t("gantt.weightsHint")} className="mt-2"><input name="weights" className="control num" placeholder={newM.map(() => "1").join(",")} /></Field>}
              </div>
            )}
          </div>
        )}
      </section>
      <StatusFields status={sub.status} completedOn={sub.completedOn} resultNote={sub.resultNote} />
      <Field label={t("gantt.revisionReason")} required={changed} hint={t("gantt.reasonHintChange")}><input name="reason" className="control" required={changed} /></Field>
      <FormMessage state={state} />
      <div><SubmitButton>{t("common.save")}</SubmitButton></div>
    </form>
  );
}

export function SubLifecycleForm({ sub }: { sub: SubView }) {
  const { t } = useT();
  const [state, action] = useActionState(subLifecycle, null);
  useCloseOnOk(state);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={sub.id} />
      {sub.active ? (
        <>
          <p className="text-[0.86rem] text-ink-2">{sub.hasHistory ? t("gantt.archiveHint") : t("gantt.deleteHint")}</p>
          <Field label={t("common.reason")} required><input name="reason" className="control" required /></Field>
          <FormMessage state={state} />
          <div className="flex gap-2">
            <SubmitButton variant="secondary" name="intent" value="archive">{t("gantt.archiveSub")}</SubmitButton>
            {!sub.hasHistory && <SubmitButton variant="danger" name="intent" value="delete">{t("gantt.deleteSub")}</SubmitButton>}
          </div>
        </>
      ) : (
        <><FormMessage state={state} /><div><SubmitButton variant="secondary" name="intent" value="restore">{t("gantt.restoreSub")}</SubmitButton></div></>
      )}
    </form>
  );
}

export function MoveSubForm({ sub, options }: { sub: SubView; options: ChainOptions }) {
  const { t } = useT();
  const [state, action] = useActionState(moveSub, null);
  useCloseOnOk(state);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={sub.id} />
      <p className="text-[0.86rem] text-ink-2">{t("gantt.moveHint")}</p>
      <Field label={t("common.activity")} required><ActivitySelect options={options} required /></Field>
      <Field label={t("common.reason")} required><input name="reason" className="control" required /></Field>
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{t("gantt.move")}</SubmitButton></div>
    </form>
  );
}

function AssignmentForm({ subId, subMonths, duration, people, a }: { subId: string; subMonths: number[]; duration: number; people: PersonOpt[]; a?: AsgView }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(saveAssignment, null);
  const [rmState, rmAction] = useActionState(removeAssignment, null);
  const [mode, setMode] = useState<"inherit" | "custom">(a?.mode ?? "inherit");
  const [pid, setPid] = useState(a?.personId ?? "");
  const hourly = a ? a.hourly : !!people.find((p) => p.id === pid)?.hourly;
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="subactivityId" value={subId} />
        {a && <input type="hidden" name="id" value={a.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          {!a && <Field label={t("common.person")} required><select name="personId" className="control" required value={pid} onChange={(e) => setPid(e.target.value)}><option value="">{t("common.select")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
          <Field label={t("gantt.responsibility")}><select name="responsibility" className="control" defaultValue={a?.responsibility ?? "support"}>{RESPONSIBILITIES.map((r) => <option key={r} value={r}>{t(`common.resp.${r}`)}</option>)}</select></Field>
          <Field label={t("common.status")}><select name="status" className="control" defaultValue={a?.status ?? "not_started"}>{PLAN_STATUSES.map((x) => <option key={x} value={x}>{t(`common.plan.${x}`)}</option>)}</select></Field>
          {hourly && <Field label={t("gantt.planHours")}><input name="hours" inputMode="decimal" className="control num" defaultValue={a?.centi ? String(a.centi / 100) : ""} /></Field>}
        </div>
        <Field label={t("gantt.personalTask")}><textarea name="task" className="control min-h-14" defaultValue={a?.task ?? ""} /></Field>
        <fieldset>
          <legend className="label mb-1.5">{t("gantt.asgPeriod")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.88rem]">
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="inherit" checked={mode === "inherit"} onChange={() => setMode("inherit")} />{t("gantt.asgInherit")} <span className="num text-[0.76rem] text-ink-3">{monthsLabel(locale, subMonths)}</span></label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="custom" checked={mode === "custom"} onChange={() => setMode("custom")} />{t("gantt.asgCustom")}</label>
          </div>
          {mode === "custom" ? <div className="mt-2"><MonthGrid name="months" duration={duration} defaultValue={a?.mode === "custom" ? a.months : subMonths} reference={subMonths} /></div> : <input type="hidden" name="months" value="" />}
        </fieldset>
        <FormMessage state={state} />
        <FormMessage state={rmState} />
        <div className="flex items-center gap-2"><SubmitButton size="sm">{a ? t("common.save") : t("common.add")}</SubmitButton>{!hourly && !a && <span className="text-[0.76rem] text-ink-3">{t("gantt.ratioNote")}</span>}</div>
      </form>
      {a && <form action={rmAction}><input type="hidden" name="id" value={a.id} /><SubmitButton variant="danger" size="sm">{t("gantt.remove")}</SubmitButton></form>}
    </div>
  );
}

export function AssignmentsManager({ subId, subMonths, duration, people, assignments }: { subId: string; subMonths: number[]; duration: number; people: PersonOpt[]; assignments: AsgView[] }) {
  const { t, locale } = useT();
  return (
    <div className="flex flex-col gap-2">
      {assignments.length === 0 && <p className="text-[0.88rem] text-ink-3">{t("gantt.asgNone")}</p>}
      {assignments.map((a) => (
        <details key={a.id} className="rounded-sm border border-line open:border-line-2">
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[0.88rem]">
            <span className="font-medium">{a.personName}</span>
            <Badge tone={a.responsibility === "lead" ? "cobalt" : "outline"}>{t(`common.resp.${a.responsibility}`)}</Badge>
            <span className="num text-[0.78rem] text-ink-3">{monthsLabel(locale, a.months)}{a.mode === "custom" ? ` · ${t("gantt.customShort")}` : ""}</span>
            {a.centi > 0 && <span className="num text-[0.78rem]">{fmtCentiHours(locale, a.centi)}</span>}
            <Badge tone={planTone[a.status]} dot className="ml-auto">{t(`common.plan.${a.status}`)}</Badge>
          </summary>
          <div className="border-t border-line p-3"><AssignmentForm subId={subId} subMonths={subMonths} duration={duration} people={people} a={a} /></div>
        </details>
      ))}
      <details className="mt-2 rounded-sm border border-dashed border-line-2">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[0.88rem] font-medium"><Plus className="size-4" />{t("gantt.newAssignment")}</summary>
        <div className="border-t border-line p-3"><AssignmentForm subId={subId} subMonths={subMonths} duration={duration} people={people} /></div>
      </details>
    </div>
  );
}
