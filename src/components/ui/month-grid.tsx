"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Project-month picker (1…duration). Gapped selections are kept as separate months.
 * `reference` marks the parent's window so going outside it is visible while picking.
 * Submits as a comma-separated hidden input.
 */
export function MonthGrid({ name, duration = 36, defaultValue = [], reference, single, onChange, disabled }: { name: string; duration?: number; defaultValue?: number[]; reference?: number[]; single?: boolean; onChange?: (months: number[]) => void; disabled?: boolean }) {
  const [sel, setSel] = useState<number[]>([...defaultValue].sort((a, b) => a - b));
  const ref = new Set(reference ?? []);
  const toggle = (m: number) => {
    const next = single ? [m] : sel.includes(m) ? sel.filter((x) => x !== m) : [...sel, m].sort((a, b) => a - b);
    setSel(next);
    onChange?.(next);
  };
  return (
    <div>
      <input type="hidden" name={name} value={sel.join(",")} />
      <div className="grid grid-cols-12 gap-px overflow-hidden rounded-sm border border-line-2 bg-line-2" role="group">
        {Array.from({ length: duration }, (_, i) => i + 1).map((m) => {
          const on = sel.includes(m);
          return (
            <button key={m} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(m)}
              className={cn("num relative h-8 text-[0.74rem] transition-colors", on ? "bg-ink font-medium text-bg" : ref.has(m) ? "bg-cobalt-soft text-ink hover:bg-surface-3" : "bg-surface text-ink-3 hover:bg-surface-2 hover:text-ink", on && reference && !ref.has(m) && "bg-red text-surface")}>
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
