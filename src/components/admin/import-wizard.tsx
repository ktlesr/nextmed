"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/client";
import type { ImportPreview, RowState } from "@/lib/importer";
import { applyAction, previewAction } from "@/app/app/admin/import/actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Badge, type Tone } from "@/components/ui/badge";
import { Notice } from "@/components/ui/layout";
import { cn } from "@/lib/cn";

const STATES: RowState[] = ["new", "unchanged", "changed", "archived", "conflict"];
const tone: Record<RowState, Tone> = { new: "ok", unchanged: "neutral", changed: "cobalt", archived: "outline", conflict: "red" };
const COUNT_KEYS = ["work_packages", "outputs", "activities", "subactivities", "people", "assignments", "concrete_outputs", "hourly_rows"];

export function ImportWizard() {
  const { t } = useT();
  const router = useRouter();
  const [state, preview] = useActionState(previewAction, null);
  const [applied, apply] = useActionState(async (p: Awaited<ReturnType<typeof applyAction>>, fd: FormData) => { const r = await applyAction(p, fd); if (r?.ok) router.refresh(); return r; }, null);
  const [show, setShow] = useState<RowState | "all">("all");
  const data = state?.ok ? (state.data as { preview: ImportPreview; token: string; fileName: string; schemaVersion: number | null; fingerprint: string | null }) : null;
  const pv = data?.preview;
  const rows = pv ? pv.rows.filter((r) => show === "all" || r.state === show) : [];
  const fieldLabel = (f: string) => { const k = `admin.impField.${f}`, v = t(k); return v === k ? f : v; };

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1 */}
      <section className="panel">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5"><span className="num text-ink-3">01</span><h2 className="font-sans text-[0.95rem] font-semibold tracking-normal">{t("admin.impStep1")}</h2></div>
        <form action={preview} className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field label={t("admin.impFile")} hint={t("admin.impFileHint")}><input type="file" name="file" accept="application/json,.json" className="control" /></Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="source" value="upload"><FileJson className="size-4" />{t("admin.impPreview")}</SubmitButton>
            <SubmitButton name="source" value="bundled" variant="secondary">{t("admin.impUseBundled")}</SubmitButton>
          </div>
          {state && !state.ok && <FormMessage state={state} className="md:col-span-2" />}
        </form>
      </section>

      {/* Step 2 */}
      {pv && data && (
        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <div className="flex items-center gap-3"><span className="num text-ink-3">02</span><h2 className="font-sans text-[0.95rem] font-semibold tracking-normal">{t("admin.impStep2")}</h2></div>
            <p className="num text-[0.78rem] text-ink-2">{data.fileName} · schema v{String(data.schemaVersion ?? "?")}</p>
          </div>
          <div className="p-4">
            {pv.errors.length > 0 && (
              <Notice tone="red" title={t("admin.impRejected", { n: pv.errors.length })} className="mb-4">
                <ul className="num mt-1 max-h-48 list-disc overflow-auto pl-5 text-[0.8rem]">{pv.errors.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}</ul>
              </Notice>
            )}
            {Object.keys(pv.counts).length > 0 && (
              <>
                <p className="label mb-2">{t("admin.impCounts")}</p>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
                  {COUNT_KEYS.map((k) => <div key={k} className="bg-surface px-3 py-2.5"><dd className="num text-[1.25rem] font-medium leading-none">{pv.counts[k] ?? 0}</dd><dt className="mt-1.5 text-[0.74rem] text-ink-2">{t(`admin.impCount.${k}`)}</dt></div>)}
                </dl>
                <p className={cn("mt-3 flex items-center gap-2 text-[0.86rem]", pv.errors.some((e) => e.includes("fixed frame")) ? "text-red" : "text-ok")}>
                  <ShieldCheck className="size-4" />{pv.errors.some((e) => e.includes("fixed frame")) ? t("admin.impFrameChanged") : t("admin.impFrameOk", { unchanged: pv.frame.unchanged, new: pv.frame.new })}
                </p>

                <p className="label mb-2 mt-5">{t("admin.impGroups")}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setShow("all")} className={cn("rounded-sm border px-2.5 py-1.5 text-[0.84rem]", show === "all" ? "border-ink" : "border-line-2 text-ink-2")}>{t("common.all")}</button>
                  {STATES.map((s) => (
                    <button key={s} type="button" onClick={() => setShow(s)} aria-pressed={show === s} className={cn("flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-[0.84rem]", show === s ? "border-ink" : "border-line-2 text-ink-2")}>
                      <Badge tone={tone[s]}>{t(`admin.impState.${s}`)}</Badge><span className="num font-medium">{pv.summary[s]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <form action={apply} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="token" value={data.token} />
              <input type="hidden" name="fileName" value={data.fileName} />
              {pv.rows.length > 0 ? (
                <div className="tbl-wrap max-h-[26rem] overflow-auto scroll-thin">
                  <table className="tbl">
                    <thead className="sticky top-0"><tr><th className="w-8" /><th>{t("common.status")}</th><th>{t("admin.impRecord")}</th><th>{t("admin.impChangedFields")}</th></tr></thead>
                    <tbody>
                      {rows.slice(0, 400).map((r) => (
                        <tr key={`${r.entity}:${r.id}`}>
                          <td>{r.state === "conflict" && <input type="checkbox" name="overwrite" value={`${r.entity}:${r.id}`} aria-label={t("admin.impOverwrite")} className="accent-[var(--red)]" />}</td>
                          <td><Badge tone={tone[r.state]}>{t(`admin.impState.${r.state}`)}</Badge></td>
                          <td><span className="label mr-2">{t(`admin.impEntity.${r.entity}`)}</span><span className="text-[0.86rem]">{r.label}</span></td>
                          <td className="text-[0.82rem] text-ink-2">{r.fields.map(fieldLabel).join(", ") || "—"}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && <tr><td colSpan={4} className="text-ink-3">{t("common.emptyFiltered")}</td></tr>}
                    </tbody>
                  </table>
                </div>
              ) : pv.ok ? <p className="text-[0.88rem] text-ink-2">{pv.summary.new > 0 ? t("admin.impAllNew", { n: pv.summary.new }) : t("admin.impNothing")}</p> : null}

              {pv.ok && (
                <>
                  {pv.summary.conflict > 0 && (
                    <>
                      <Notice tone="warn" title={t("admin.impConflictTitle", { n: pv.summary.conflict })}>{t("admin.impConflictBody")}</Notice>
                      <Field label={t("common.reason")} hint={t("admin.impReasonHint")}><textarea name="reason" className="control min-h-16" maxLength={500} /></Field>
                    </>
                  )}
                  <FormMessage state={applied} />
                  {!applied?.ok && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="max-w-[60ch] text-[0.84rem] text-ink-2">{t("admin.impDefault")}</p><SubmitButton>{t("admin.impApply")}</SubmitButton></div>}
                </>
              )}
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
