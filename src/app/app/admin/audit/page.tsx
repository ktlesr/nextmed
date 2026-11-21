import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, people, users } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";

export const metadata = { title: "Değişiklik Kaydı" };
const PAGE = 40;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const flat = (v: unknown): string => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
/** Field-level diff of the stored before/after snapshots. */
function diff(before: unknown, after: unknown): { key: string; a: string; b: string }[] {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  if (!isObj(before) && !isObj(after)) return before == null && after == null ? [] : [{ key: "·", a: flat(before), b: flat(after) }];
  const b = isObj(before) ? before : {}, a = isObj(after) ? after : {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)).map((k) => ({ key: k, a: flat(b[k]), b: flat(a[k]) }));
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; user?: string; from?: string; to?: string; page?: string }> }) {
  await requireRole(can.admin);
  const sp = await searchParams;
  const { t, locale } = await getT();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const [entities, actors] = await Promise.all([
    db.select({ entity: auditLog.entity, n: sql<number>`count(*)::int` }).from(auditLog).groupBy(auditLog.entity).orderBy(auditLog.entity),
    db.selectDistinct({ id: users.id, email: users.email, name: people.fullName }).from(auditLog).innerJoin(users, eq(users.id, auditLog.userId)).leftJoin(people, eq(people.id, users.personId)),
  ]);
  const entity = entities.find((e) => e.entity === sp.entity)?.entity;
  const actor = actors.find((a) => a.id === sp.user)?.id;
  // days are Europe/Istanbul days
  const where = and(
    entity ? eq(auditLog.entity, entity) : undefined, actor ? eq(auditLog.userId, actor) : undefined,
    isDate(sp.from) ? gte(auditLog.at, sql`(${sp.from}::date::timestamp at time zone 'Europe/Istanbul')`) : undefined,
    isDate(sp.to) ? lt(auditLog.at, sql`(${addDays(sp.to!, 1)}::date::timestamp at time zone 'Europe/Istanbul')`) : undefined,
  );
  const [[{ n: total }], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where),
    db.select({ a: auditLog, email: users.email, name: people.fullName }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).leftJoin(people, eq(people.id, users.personId)).where(where).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(PAGE).offset((page - 1) * PAGE),
  ]);
  const label = (ns: string, v: string) => { const k = `admin.${ns}.${v}`, x = t(k); return x === k ? v : x; };
  const href = (p: number) => { const q = new URLSearchParams(); if (entity) q.set("entity", entity); if (actor) q.set("user", actor); if (isDate(sp.from)) q.set("from", sp.from!); if (isDate(sp.to)) q.set("to", sp.to!); if (p > 1) q.set("page", String(p)); return `/app/admin/audit?${q}`; };
  const filtered = !!(entity || actor || isDate(sp.from) || isDate(sp.to));

  return (
    <>
      <PageHeader eyebrow={`${t("nav.groupAdmin")} · ${t("admin.auditCount", { n: total })}`} title={t("nav.audit")} description={t("admin.auditLede")} />
      <form className="no-print mb-5 flex flex-wrap items-end gap-3" action="/app/admin/audit">
        <label className="w-full sm:w-52"><span className="label mb-1.5 block">{t("admin.auditEntity")}</span>
          <select name="entity" defaultValue={entity ?? ""} className="control"><option value="">{t("common.all")}</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{label("ae", e.entity)} ({e.n})</option>)}</select>
        </label>
        <label className="w-full sm:w-56"><span className="label mb-1.5 block">{t("admin.auditUser")}</span>
          <select name="user" defaultValue={actor ?? ""} className="control"><option value="">{t("common.all")}</option>{actors.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.email}</option>)}</select>
        </label>
        <label><span className="label mb-1.5 block">{t("admin.auditFrom")}</span><input type="date" name="from" defaultValue={isDate(sp.from) ? sp.from : ""} className="control" /></label>
        <label><span className="label mb-1.5 block">{t("admin.auditTo")}</span><input type="date" name="to" defaultValue={isDate(sp.to) ? sp.to : ""} className="control" /></label>
        <button className={buttonClass("secondary")}>{t("common.filter")}</button>
        {filtered && <Link href="/app/admin/audit" className={buttonClass("ghost")}>{t("outputs.clear")}</Link>}
      </form>

      {rows.length === 0 ? <EmptyState title={filtered ? t("common.emptyFiltered") : t("common.empty")}>{t("admin.auditEmptyHint")}</EmptyState> : (
        <div className="tbl-wrap">
          <table className="tbl min-w-[54rem]">
            <thead><tr><th>{t("admin.auditWhen")}</th><th>{t("admin.auditUser")}</th><th>{t("admin.auditEntity")}</th><th>{t("admin.auditAction")}</th><th>{t("admin.auditChange")}</th></tr></thead>
            <tbody>
              {rows.map(({ a, email, name }) => {
                const d = diff(a.before, a.after);
                return (
                  <tr key={a.id}>
                    <td className="num whitespace-nowrap text-[0.8rem] text-ink-2">{fmtDateTime(locale, a.at)}</td>
                    <td className="whitespace-nowrap">{name ?? email ?? <span className="text-ink-3">{t("admin.auditSystem")}</span>}</td>
                    <td><span className="font-medium">{label("ae", a.entity)}</span>{a.entityId && <span className="code mt-0.5 block max-w-52 truncate" title={a.entityId}>{a.entityId}</span>}</td>
                    <td><Badge tone={a.action === "create" ? "ok" : a.action === "delete" || a.action === "archive" ? "red" : "cobalt"}>{label("aa", a.action)}</Badge></td>
                    <td className="min-w-64 max-w-[34rem]">
                      {a.reason && <p className="text-[0.88rem]"><span className="label mr-2">{t("common.reason")}</span>{a.reason}</p>}
                      {d.length > 0 ? (
                        <details className={a.reason ? "mt-1.5" : undefined}>
                          <summary className="cursor-pointer text-[0.82rem] text-ink-2 hover:text-ink">{t("admin.auditFields", { n: d.length })} <span className="num text-ink-3">{d.slice(0, 4).map((x) => x.key).join(", ")}{d.length > 4 ? "…" : ""}</span></summary>
                          <dl className="mt-2 flex flex-col gap-1.5 border-l-2 border-line pl-3">
                            {d.map((x) => (
                              <div key={x.key} className="min-w-0 text-[0.8rem]">
                                <dt className="label">{x.key}</dt>
                                <dd className="num break-words"><span className="text-red line-through decoration-red/50">{x.a.length > 400 ? x.a.slice(0, 400) + "…" : x.a}</span><span className="mx-1.5 text-ink-3">→</span><span className="text-ok">{x.b.length > 400 ? x.b.slice(0, 400) + "…" : x.b}</span></dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ) : !a.reason && <span className="text-ink-3">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <nav className="no-print mt-4 flex items-center justify-between text-[0.86rem]">
          <span className="num text-ink-3">{(page - 1) * PAGE + 1}–{Math.min(total, page * PAGE)} / {total}</span>
          <span className="flex gap-2">{page > 1 && <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>← {t("admin.newer")}</Link>}{page * PAGE < total && <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>{t("admin.older")} →</Link>}</span>
        </nav>
      )}
    </>
  );
}
