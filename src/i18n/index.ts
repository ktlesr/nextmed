import { common } from "./dict/common";
import { nav } from "./dict/nav";
import { landing } from "./dict/landing";
import { gantt } from "./dict/gantt";
import { tasks } from "./dict/tasks";
import { work } from "./dict/work";
import { reports } from "./dict/reports";
import { docs } from "./dict/docs";
import { ops } from "./dict/ops";
import { finance } from "./dict/finance";
import { outputsDict } from "./dict/outputs";
import { admin } from "./dict/admin";

export type Locale = "tr" | "en";
export const LOCALES: Locale[] = ["tr", "en"];
export type Dict = { tr: Record<string, string>; en: Record<string, string> };

/** Each module owns one namespace: t("work.new") → dict/work.ts key "new". */
const modules: Record<string, Dict> = { common, nav, landing, gantt, tasks, work, reports, docs, ops, finance, outputs: outputsDict, admin };

export function flatDict(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ns, d] of Object.entries(modules)) for (const [k, v] of Object.entries(d[locale])) out[`${ns}.${k}`] = v;
  return out;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(dict: Record<string, string>): TFn {
  return (key, vars) => {
    let s = dict[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
