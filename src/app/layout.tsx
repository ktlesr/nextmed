import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getLocale } from "@/i18n/server";
import { flatDict } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PDS4NextMed · Zafer Kalkınma Ajansı", template: "%s · PDS4NextMed" },
  description: "PDS4NextMed proje takip portalı — Zafer Kalkınma Ajansı (PP5)",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f1f4f8" }, { media: "(prefers-color-scheme: dark)", color: "#080d1f" }] };

// Resolves the theme before first paint when no explicit choice is stored (no flash).
const themeScript = `(function(){try{var d=document.documentElement;if(!d.dataset.theme){d.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const theme = (await cookies()).get("pds_theme")?.value;
  return (
    <html lang={locale} data-theme={theme === "dark" || theme === "light" ? theme : undefined} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <I18nProvider locale={locale} dict={flatDict(locale)}>{children}</I18nProvider>
      </body>
    </html>
  );
}
