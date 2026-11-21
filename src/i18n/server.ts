import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { flatDict, makeT, type Locale, type TFn } from "./index";

/** Interface language: remembered per user (cookie mirrors users.locale), default Turkish. */
export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get("pds_locale")?.value;
  return c === "en" ? "en" : "tr";
});

export const getT = cache(async (): Promise<{ t: TFn; locale: Locale }> => {
  const locale = await getLocale();
  return { t: makeT(flatDict(locale)), locale };
});
