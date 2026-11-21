import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Plus, TriangleAlert } from "lucide-react";
import { db } from "@/db";
import { files, procurements, type ProcurementStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { PROCUREMENT_STATUSES } from "@/lib/constants";
import { canCreateRecord, getLookups } from "@/lib/records";
import { fmtDate, fmtMoney, pick } from "@/lib/format";
import { EmptyState, PageHeader, Stat } from "@/components/ui/layout";
import { WpChip } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { RecordFilters } from "@/components/records/parts";
import { ProcurementForm, REQUIRED_BY_STAGE, StageTrack } from "@/components/records/procurement-parts";

export const metadata = { title: "Hizmet Alımları" };

export default async function ProcurementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { t, locale } = await getT();
  const L = await getLookups();
  const status = PROCUREMENT_STATUSES.find((s) => s === sp.status);
  const rows = await db.select().from(procurements).where(and(sp.resp ? eq(procurements.responsibleId, sp.resp) : undefined, sp.act ? eq(procurements.activityId, sp.act) : undefined, status ? eq(procurements.status, status) : undefined)).orderBy(desc(procurements.createdAt));
  const kinds = rows.length ? await db.select({ id: files.entityId, kind: sql<string>`split_part(${files.kind}, ':', 1)` }).from(files).where(and(eq(files.entityType, "procurement"), inArray(files.entityId, rows.map((r) => r.id)))) : [];
  const have = new Map<string, Set<string>>();
  for (const k of kinds) have.set(k.id, (have.get(k.id) ?? new Set()).add(k.kind));
  const missing = (id: string, s: ProcurementStatus) => REQUIRED_BY_STAGE[s].filter((k) => !have.get(id)?.has(k)).length;
  const open = rows.filter((r) => !["paid", "cancelled"].includes(r.status));
  const sum = (list: typeof rows, f: "estimatedAmount" | "contractAmount") => list.filter((r) => r.currency === "EUR" && r.status !== "cancelled").reduce((a, r) => a + Number(r[f] ?? 0), 0);

  return (
    <>
      <PageHeader eyebrow={t("nav.groupRecords")} title={t("nav.procurements")} description={t("ops.procurementsLede")}
        actions={canCreateRecord(user, "procurement") && (
          <Modal trigger={<><Plus className="size-4" />{t("ops.newProcurement")}</>} title={t("ops.newProcurement")} side>
            <ProcurementForm t={t} locale={locale} people={L.activePeople} options={L.options} defaultResponsible={user.personId} />
          </Modal>
        )} />
      {rows.length > 0 && (
        <div className="rule-top mb-6 grid grid-cols-2 gap-6 pt-4 sm:grid-cols-4">
          <Stat label={t("ops.openFiles")} value={open.length} sub={t("ops.ofTotal", { n: rows.length })} />
          <Stat label={t("ops.estimatedTotal")} value={<span className="text-[1.5rem]">{fmtMoney(locale, sum(rows, "estimatedAmount"))}</span>} />
          <Stat label={t("ops.contractedTotal")} value={<span className="text-[1.5rem]">{fmtMoney(locale, sum(rows, "contractAmount"))}</span>} tone="turq" />
          <Stat label={t("ops.missingDocs")} value={rows.reduce((a, r) => a + missing(r.id, r.status), 0)} tone={rows.some((r) => missing(r.id, r.status)) ? "warn" : undefined} />
        </div>
      )}
      <RecordFilters t={t} people={L.activePeople} options={L.options} statuses={PROCUREMENT_STATUSES} statusLabel={(s) => t(`ops.pst.${s}`)} current={sp} />
      {rows.length === 0 ? <EmptyState title={sp.resp || sp.act || sp.status ? t("common.emptyFiltered") : t("common.empty")}>{t("ops.procurementsEmpty")}</EmptyState> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t("ops.procurement")}</th><th>{t("common.linkedActivity")}</th><th>{t("ops.agencyResponsible")}</th><th>{t("ops.contractor")}</th><th className="r">{t("common.amount")}</th><th>{t("ops.deliveryDate")}</th><th>{t("ops.stage")}</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const wp = L.actWp(r.activityId), miss = missing(r.id, r.status);
                return (
                  <tr key={r.id}>
                    <td className="min-w-60"><Link href={`/app/procurements/${r.id}`} className="font-medium underline-offset-2 hover:text-cobalt hover:underline">{pick(locale, r.titleTr, r.titleEn)}</Link>
                      {miss > 0 && <span className="mt-0.5 flex items-center gap-1 text-[0.76rem] text-warn"><TriangleAlert className="size-3" />{t("ops.nMissingDocs", { n: miss })}</span>}</td>
                    <td>{r.activityId ? <span className="flex items-center gap-2">{wp && <WpChip code={wp.code} />}<span className="code">{L.act.get(r.activityId)?.code}</span></span> : <span className="text-ink-3">—</span>}</td>
                    <td className="whitespace-nowrap text-[0.86rem]">{r.responsibleId ? L.personName.get(r.responsibleId) : "—"}</td>
                    <td className="text-[0.86rem]">{r.contractor || <span className="text-ink-3">—</span>}</td>
                    <td className="r num whitespace-nowrap text-[0.86rem]">{r.contractAmount ? fmtMoney(locale, r.contractAmount, r.currency) : r.estimatedAmount ? <span className="text-ink-3" title={t("ops.estimatedAmount")}>≈ {fmtMoney(locale, r.estimatedAmount, r.currency)}</span> : "—"}</td>
                    <td className="num whitespace-nowrap text-[0.84rem]">{fmtDate(locale, r.deliveryDate)}</td>
                    <td><StageTrack status={r.status} t={t} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
