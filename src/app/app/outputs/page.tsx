import Link from "next/link";
import { Plus, Search, Star } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { getChainOptions, getFrame } from "@/lib/structure";
import { accumulate, loadObservations, loadOutputs } from "@/lib/adminOutputs";
import { todayInIstanbul } from "@/lib/dates";
import { pick } from "@/lib/format";
import { getT } from "@/i18n/server";
import { Badge, WpChip } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/dialog";
import { TargetCell } from "@/components/admin/target-cell";
import { ObservationForm, TargetForm } from "@/components/admin/output-forms";
import { togglePriority } from "./actions";

export const metadata = { title: "Somut Çıktılar" };

export default async function OutputsPage({ searchParams }: { searchParams: Promise<{ q?: string; wp?: string; inactive?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const admin = can.admin(user), editor = can.coordinate(user);
  const [{ t, locale }, { wps }, all, obs, options] = await Promise.all([getT(), getFrame(), loadOutputs(admin && sp.inactive === "1"), loadObservations(), admin ? getChainOptions() : null]);
  const actuals = accumulate(obs);
  const q = (sp.q ?? "").trim().toLocaleLowerCase(locale);
  const wp = wps.find((w) => w.id === sp.wp);
  // Search runs over the texts of the selected interface language.
  const rows = all.filter((r) => {
    if (wp && !r.workPackageIds.includes(wp.id)) return false;
    if (!q) return true;
    const hay = [pick(locale, r.nameTr, r.nameEn), locale === "tr" ? r.projectTarget.display_tr : r.projectTarget.display_en, locale === "tr" ? r.zaferObligation.display_tr : r.zaferObligation.display_en, pick(locale, r.countingNoteTr, r.countingNoteEn), r.programmeIndicator ?? ""].join(" ").toLocaleLowerCase(locale);
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  const today = todayInIstanbul();
  const withActual = all.filter((r) => actuals.has(r.id)).length;

  return (
    <>
      <PageHeader
        eyebrow={`${t("outputs.eyebrow")} · ${t("outputs.nTargets", { n: all.length })}`}
        title={t("nav.outputs")}
        description={t("outputs.lede")}
        actions={admin && options ? <Modal trigger={<><Plus className="size-4" />{t("outputs.addTarget")}</>} title={t("outputs.addTarget")} description={t("outputs.addTargetLede")} side><TargetForm options={options} /></Modal> : undefined}
      />

      <form className="no-print mb-4 flex flex-wrap items-end gap-3" action="/app/outputs">
        <label className="min-w-56 flex-1">
          <span className="label mb-1.5 block">{t("common.search")}</span>
          <span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><input name="q" defaultValue={sp.q ?? ""} placeholder={t("outputs.searchPlaceholder")} className="control pl-8" /></span>
        </label>
        <label className="w-full sm:w-72">
          <span className="label mb-1.5 block">{t("common.workPackage")}</span>
          <select name="wp" defaultValue={wp?.id ?? ""} className="control">
            <option value="">{t("common.all")}</option>
            {wps.map((w) => <option key={w.id} value={w.id}>{w.code} · {pick(locale, w.nameTr, w.nameEn).slice(0, 60)}</option>)}
          </select>
        </label>
        {admin && <label className="flex h-9.5 items-center gap-2 text-[0.88rem] text-ink-2"><input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === "1"} className="accent-[var(--cobalt)]" />{t("outputs.showInactive")}</label>}
        <button className={buttonClass("secondary")}>{t("common.filter")}</button>
        {(q || wp) && <Link href="/app/outputs" className={buttonClass("ghost")}>{t("outputs.clear")}</Link>}
      </form>

      <p className="num mb-2 text-[0.78rem] text-ink-3">{t("outputs.showing", { n: rows.length, total: all.length })} · {t("outputs.withActual", { n: withActual })}</p>

      {rows.length === 0 ? (
        <EmptyState title={t("common.emptyFiltered")}>{t("outputs.emptyHint")}</EmptyState>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl min-w-[56rem] table-fixed">
            <colgroup><col className="w-[2.6rem]" /><col className="w-[34%]" /><col /><col /></colgroup>
            <thead>
              <tr><th className="r">#</th><th>{t("outputs.colName")}</th><th>{t("outputs.colProject")}</th><th>{t("outputs.colZafer")}</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = actuals.get(r.id);
                return (
                  <tr key={r.id} className={r.active ? undefined : "opacity-55"}>
                    <td className="num r text-[0.76rem] text-ink-3">{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <Link href={`/app/outputs/${r.id}`} className="font-semibold underline-offset-2 hover:text-cobalt hover:underline">{pick(locale, r.nameTr, r.nameEn)}</Link>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {r.workPackageIds.map((id) => { const w = wps.find((x) => x.id === id); return w ? <WpChip key={id} code={w.code} /> : null; })}
                        {r.programmeIndicator && <Badge tone="outline" className="num">{r.programmeIndicator}</Badge>}
                        {!r.active && <Badge tone="neutral">{t("outputs.inactive")}</Badge>}
                        {r.priority && !admin && <Badge tone="cobalt">{t("outputs.priority")}</Badge>}
                      </div>
                      <div className="no-print mt-2.5 flex flex-wrap items-center gap-1.5">
                        {editor && r.active && <Modal trigger={<><Plus className="size-3.5" />{t("outputs.addObservation")}</>} triggerVariant="secondary" triggerSize="sm" title={t("outputs.addObservation")} description={pick(locale, r.nameTr, r.nameEn)} side><ObservationForm output={{ id: r.id, projectTarget: r.projectTarget, zaferObligation: r.zaferObligation }} today={today} /></Modal>}
                        {admin && (
                          <form action={togglePriority}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className={buttonClass("ghost", "sm", r.priority ? "text-cobalt" : undefined)} title={t("outputs.priorityLabel")} aria-pressed={r.priority}><Star className="size-3.5" fill={r.priority ? "currentColor" : "none"} />{t("outputs.priority")}</button>
                          </form>
                        )}
                      </div>
                    </td>
                    <td><TargetCell spec={r.projectTarget} actual={a?.project} t={t} locale={locale} /></td>
                    <td><TargetCell spec={r.zaferObligation} actual={a?.zafer} t={t} locale={locale} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 max-w-[80ch] text-[0.82rem] text-ink-3">{t("outputs.footnote")}</p>
    </>
  );
}
