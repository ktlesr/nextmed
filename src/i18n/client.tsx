"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale, type TFn } from "./index";

const Ctx = createContext<{ locale: Locale; dict: Record<string, string> }>({ locale: "tr", dict: {} });

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Record<string, string>; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useT(): { t: TFn; locale: Locale } {
  const { locale, dict } = useContext(Ctx);
  const t = useMemo(() => makeT(dict), [dict]);
  return { t, locale };
}
