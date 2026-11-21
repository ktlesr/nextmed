import { cn } from "@/lib/cn";

export type Tone = "neutral" | "cobalt" | "turq" | "ok" | "warn" | "red" | "outline";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  cobalt: "bg-cobalt-soft text-cobalt",
  turq: "bg-turq-soft text-turq",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  red: "bg-red-soft text-red",
  outline: "border border-line-2 text-ink-2",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs px-1.5 py-0.5 text-[0.74rem] font-medium leading-5", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Language tag on files and texts. */
export function LangTag({ lang, missing }: { lang: "tr" | "en"; missing?: boolean }) {
  return (
    <span className={cn("num inline-flex h-[1.15rem] items-center rounded-xs border px-1 text-[0.62rem] font-medium uppercase tracking-wider", missing ? "border-dashed border-warn text-warn" : "border-line-2 text-ink-2")}>{lang}</span>
  );
}

export const workLogTone: Record<string, Tone> = { draft: "neutral", in_review: "cobalt", changes_requested: "warn", approved: "ok", cancelled: "outline" };
export const planTone: Record<string, Tone> = { not_started: "neutral", in_progress: "cobalt", in_review: "warn", completed: "ok" };
/** Work-package chip: coloured code square + label. */
export function WpChip({ code, className }: { code: string; className?: string }) {
  const n = code.replace(/\D/g, "").slice(0, 1) || "1";
  return (
    <span className={cn("num inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-ink-2", className)}>
      <span className="size-2 rounded-[1px]" style={{ background: `var(--wp-${n})` }} aria-hidden />
      {code}
    </span>
  );
}
