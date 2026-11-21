/**
 * Project-month calendar arithmetic. Dates are local dates ("YYYY-MM-DD") in Europe/Istanbul;
 * all maths is done on UTC midnights so no DST or host time zone can shift a day.
 *
 * A project month is NOT a fixed 30 days: month N starts at start + (N-1) calendar months, clamped
 * to the last day when that day does not exist — always added from the ORIGINAL anchor, so a short
 * February never drags later months backwards.
 */
export type ISODate = string;

export const parseISO = (s: ISODate): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const toISO = (d: Date): ISODate => d.toISOString().slice(0, 10);
export const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();

export function addMonthsClamped(start: ISODate, months: number): ISODate {
  const d = parseISO(start);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(y, m + 1));
  return toISO(new Date(Date.UTC(y, m, day)));
}
export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
export const diffDays = (a: ISODate, b: ISODate) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);

export type MonthWindow = { month: number; start: ISODate; end: ISODate };

/** Calendar window of project month `n` (1-based). */
export function projectMonthWindow(start: ISODate, n: number): MonthWindow {
  return { month: n, start: addMonthsClamped(start, n - 1), end: addDays(addMonthsClamped(start, n), -1) };
}
export const projectEnd = (start: ISODate, duration: number) => addDays(addMonthsClamped(start, duration), -1);

/** Project month containing `date`, or null when outside the project. */
export function projectMonthOf(start: ISODate, duration: number, date: ISODate): number | null {
  if (date < start || date > projectEnd(start, duration)) return null;
  const s = parseISO(start), d = parseISO(date);
  let n = (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + (d.getUTCMonth() - s.getUTCMonth()) + 1;
  n = Math.max(1, Math.min(duration, n));
  while (n > 1 && projectMonthWindow(start, n).start > date) n--;
  while (n < duration && projectMonthWindow(start, n).end < date) n++;
  return n;
}

/** Non-contiguous months stay separate windows: [7,13,19] → three ranges, never one long bar. */
export function monthRuns(months: number[]): [number, number][] {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === m - 1) last[1] = m;
    else runs.push([m, m]);
  }
  return runs;
}

export const todayInIstanbul = (): ISODate =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const calendarMonthBounds = (year: number, month1: number): { start: ISODate; end: ISODate } => ({
  start: `${year}-${String(month1).padStart(2, "0")}-01`,
  end: `${year}-${String(month1).padStart(2, "0")}-${String(daysInMonth(year, month1)).padStart(2, "0")}`,
});

/** Distribute an integer `total` over `weights`, preserving the total exactly (largest remainder). */
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++;
  return out;
}

/**
 * Calendar-month targets for hourly staff: each project month's centi-hours are pro-rated by the
 * calendar days it overlaps, in integer centi-hours, largest remainder — totals are preserved.
 * Returns a map "YYYY-MM" → centi-hours.
 */
export function calendarTargets(start: ISODate, plan: { projectMonth: number; centiHours: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of plan) {
    if (!row.centiHours) continue;
    const w = projectMonthWindow(start, row.projectMonth);
    const parts: { key: string; days: number }[] = [];
    let cursor = w.start;
    while (cursor <= w.end) {
      const [y, m] = cursor.split("-").map(Number);
      const monthEnd = calendarMonthBounds(y, m).end;
      const segEnd = monthEnd < w.end ? monthEnd : w.end;
      parts.push({ key: cursor.slice(0, 7), days: diffDays(cursor, segEnd) + 1 });
      cursor = addDays(segEnd, 1);
    }
    const shares = largestRemainder(row.centiHours, parts.map((p) => p.days));
    parts.forEach((p, i) => out.set(p.key, (out.get(p.key) ?? 0) + shares[i]));
  }
  return out;
}

/**
 * Re-plan an hourly allocation onto new months, preserving the total.
 * Same length → allocations move in order; changed length → explicit weights or equal weights.
 */
export function replanAllocations(
  old: { project_month: number; planned_centi_hours: number }[],
  newMonths: number[],
  weights?: number[],
): { project_month: number; planned_centi_hours: number }[] {
  const months = [...newMonths].sort((a, b) => a - b);
  const sortedOld = [...old].sort((a, b) => a.project_month - b.project_month);
  const total = sortedOld.reduce((a, b) => a + b.planned_centi_hours, 0);
  if (months.length === 0) return [];
  if (!weights && sortedOld.length === months.length)
    return months.map((m, i) => ({ project_month: m, planned_centi_hours: sortedOld[i].planned_centi_hours }));
  const shares = largestRemainder(total, weights && weights.length === months.length ? weights : months.map(() => 1));
  return months.map((m, i) => ({ project_month: m, planned_centi_hours: shares[i] }));
}
