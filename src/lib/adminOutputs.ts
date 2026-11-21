import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { concreteOutputs, observations, type TargetSpec } from "@/db/schema";

export type ConcreteOutput = typeof concreteOutputs.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type Scope = "project" | "zafer";
export type Actual = { sum: number; counted: number; records: number; lastOn: string | null; lastStatus: string | null };
export type ActualMap = Map<string, Record<Scope, Actual>>;

const empty = (): Actual => ({ sum: 0, counted: 0, records: 0, lastOn: null, lastStatus: null });

/**
 * Cumulative actuals per target and scope. An observation carrying a dedupe key (a building, person or
 * file identifier) is counted once per indicator and scope — the first record wins, later evidence for the
 * same key adds nothing. `until` limits to observations on or before that date; `from` gives period movement.
 */
export function accumulate(rows: Observation[], opts: { from?: string; until?: string } = {}): ActualMap {
  const out: ActualMap = new Map();
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => a.observedOn.localeCompare(b.observedOn) || a.createdAt.getTime() - b.createdAt.getTime());
  for (const r of sorted) {
    if (opts.until && r.observedOn > opts.until) continue;
    const key = r.dedupeKey ? `${r.concreteOutputId}|${r.scope}|${r.dedupeKey.trim().toLocaleLowerCase("tr")}` : null;
    const duplicate = key ? seen.has(key) : false;
    if (key) seen.add(key);
    if (opts.from && r.observedOn < opts.from) continue;
    const entry = out.get(r.concreteOutputId) ?? { project: empty(), zafer: empty() };
    const a = entry[r.scope];
    a.records++;
    if (!duplicate && r.value != null) { a.sum += Number(r.value); a.counted++; }
    if (!a.lastOn || r.observedOn >= a.lastOn) { a.lastOn = r.observedOn; if (r.status) a.lastStatus = r.status; }
    out.set(r.concreteOutputId, entry);
  }
  return out;
}

/** Observation ids that did not add to the counter because their dedupe key was already counted. */
export function duplicateIds(rows: Observation[]): Set<string> {
  const seen = new Set<string>(), dup = new Set<string>();
  const sorted = [...rows].sort((a, b) => a.observedOn.localeCompare(b.observedOn) || a.createdAt.getTime() - b.createdAt.getTime());
  for (const r of sorted) {
    if (!r.dedupeKey) continue;
    const key = `${r.concreteOutputId}|${r.scope}|${r.dedupeKey.trim().toLocaleLowerCase("tr")}`;
    if (seen.has(key)) dup.add(r.id); else seen.add(key);
  }
  return dup;
}

export async function loadOutputs(includeInactive = false) {
  const rows = await db.select().from(concreteOutputs).orderBy(asc(concreteOutputs.sort), asc(concreteOutputs.id));
  return includeInactive ? rows : rows.filter((r) => r.active);
}
export async function loadObservations(outputIds?: string[]) {
  if (outputIds && !outputIds.length) return [];
  const q = db.select().from(observations);
  return (outputIds ? q.where(inArray(observations.concreteOutputId, outputIds)) : q).orderBy(desc(observations.observedOn), desc(observations.createdAt));
}

export const UNITS = ["people", "buildings", "m2", "pilot_actions", "solutions", "organisations", "events", "conferences", "conferences_attended", "videos", "sets", "plans", "packages", "models", "hubs", "meetings", "meetings_hosted", "workshop_types", "workshop_types_per_country", "reporting_rounds"] as const;
export const KINDS: TargetSpec["kind"][] = ["numeric", "coverage", "contribution", "conditional", "not_specified"];
export const QUALIFIERS = ["exact", "approximate", "greater_than", "indicative", "planned", "if_assigned"] as const;
export const OBS_STATUSES = ["planned", "in_progress", "contributed", "completed"] as const;
