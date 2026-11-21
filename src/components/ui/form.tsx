"use client";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/action";
import { Button } from "./button";

export function Field({ label, hint, error, required, className, children }: { label: string; hint?: React.ReactNode; error?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="label mb-1.5 flex items-center gap-1">
        {label}
        {required && <span className="text-red" aria-hidden>*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[0.8rem] text-red">{error}</span> : hint ? <span className="mt-1 block text-[0.8rem] text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, name, value, disabled }: { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} name={name} value={value} disabled={pending || disabled} aria-busy={pending}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

/** Inline result of a server action. */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state || (!state.error && !state.message)) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("flex items-start gap-2 rounded-sm border px-3 py-2 text-[0.87rem]", state.ok ? "border-ok/40 bg-ok-soft text-ok" : "border-red/40 bg-red-soft text-red", className)}>
      {state.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{state.ok ? state.message : state.error}</span>
    </p>
  );
}
