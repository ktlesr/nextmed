import { cn } from "@/lib/cn";

/** The 36-month ruler — the portal's recurring motif. Every 6th tick is long; `current` is marked in red. */
export function Ruler({ months = 36, current, className, tickClassName }: { months?: number; current?: number | null; className?: string; tickClassName?: string }) {
  return (
    <div className={cn("flex h-4 items-end justify-between", className)} aria-hidden>
      {Array.from({ length: months }, (_, i) => {
        const m = i + 1;
        return <span key={m} className={cn("w-px", m === current ? "h-full w-[3px] bg-red" : m === 1 || m % 6 === 0 ? "h-full bg-current" : "h-1/2 bg-current opacity-50", tickClassName)} />;
      })}
    </div>
  );
}
