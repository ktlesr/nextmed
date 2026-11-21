import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payrollCosts, workLogs } from "@/db/schema";
import type { Person, ProjectRow } from "@/lib/structure";

export type PayrollRow = typeof payrollCosts.$inferSelect;
export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** TRY → EUR with the record's reporting rate, else the project reporting rate, else the plan rate. */
export function toEur(amount: number, currency: string, rowRate: string | null, project: ProjectRow): number | null {
  if (currency === "EUR") return amount;
  if (currency !== "TRY") return null;
  const rate = Number(rowRate) || Number(project.budget.reporting_currency_rate_try_per_eur) || Number(project.budget.plan_currency_rate_try_per_eur);
  return rate > 0 ? amount / rate : null;
}

/**
 * Eligible personnel actuals.
 *  - fixed ratio: documented eligible monthly employer cost × approved ratio
 *  - hourly: approved hours × valid GSS hourly cost
 *  - unbudgeted support: always 0 €
 * A person-month amount is attributed to work packages in proportion to that person's approved minutes
 * per WP in the same calendar month; with no approved work that month it stays unattributed.
 */
export async function eligibleActuals(project: ProjectRow, people: Person[]) {
  const [payroll, logs] = await Promise.all([
    db.select().from(payrollCosts),
    db.select({ personId: workLogs.personId, ym: sql<string>`to_char(${workLogs.workDate}, 'YYYY-MM')`, wp: workLogs.workPackageId, minutes: sql<number>`sum(${workLogs.minutes})::int` })
      .from(workLogs).where(eq(workLogs.status, "approved")).groupBy(workLogs.personId, sql`to_char(${workLogs.workDate}, 'YYYY-MM')`, workLogs.workPackageId),
  ]);
  const minutes = new Map<string, Map<string, number>>(); // person|ym → wp → minutes
  for (const l of logs) { const k = `${l.personId}|${l.ym}`; minutes.set(k, (minutes.get(k) ?? new Map()).set(l.wp, l.minutes)); }
  const byPersonMonth = new Map<string, number>(), byPerson = new Map<string, number>(), byWp = new Map<string, number>();
  let unattributed = 0, total = 0;
  const add = (personId: string, key: string, eur: number) => {
    if (!(eur > 0)) return;
    byPersonMonth.set(`${personId}|${key}`, eur);
    byPerson.set(personId, (byPerson.get(personId) ?? 0) + eur);
    total += eur;
    const split = minutes.get(`${personId}|${key}`);
    const sum = split ? [...split.values()].reduce((a, b) => a + b, 0) : 0;
    if (!split || !sum) { unattributed += eur; return; }
    for (const [wp, m] of split) byWp.set(wp, (byWp.get(wp) ?? 0) + (eur * m) / sum);
  };
  for (const p of people) {
    if (!p.eligiblePersonnelCost || p.planMethod === "non_budget_support") continue;
    if (p.planMethod === "fixed_ratio") {
      const ratio = Number(p.fixedRatio ?? 0);
      for (const r of payroll) {
        if (r.personId !== p.id || r.amount == null) continue;
        const eur = toEur(Number(r.amount), r.currency, r.rateTryPerEur, project);
        if (eur != null) add(p.id, ym(r.year, r.month), eur * ratio);
      }
    } else {
      const rate = Number(p.hourlyRateEur ?? 0);
      for (const [k, split] of minutes) {
        const [pid, key] = k.split("|");
        if (pid === p.id) add(p.id, key, ([...split.values()].reduce((a, b) => a + b, 0) / 60) * rate);
      }
    }
  }
  return { payroll, byPersonMonth, byPerson, byWp, unattributed, total };
}
