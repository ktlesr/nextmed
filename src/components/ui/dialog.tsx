"use client";
import { useEffect, useRef, useState, useCallback, createContext, useContext } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const DialogCtx = createContext<{ close: () => void }>({ close: () => {} });
/** Inside a Modal: close it (e.g. after a successful save). */
export const useModalClose = () => useContext(DialogCtx).close;

/**
 * Trigger + native <dialog>. `side` renders a right-hand sheet for long forms.
 * Content is only mounted while open, so forms always start fresh.
 */
export function Modal({ trigger, triggerVariant = "primary", triggerSize = "md", triggerClassName, title, description, side, wide, children }: {
  trigger: React.ReactNode; triggerVariant?: "primary" | "secondary" | "ghost" | "danger"; triggerSize?: "sm" | "md" | "lg"; triggerClassName?: string;
  title: React.ReactNode; description?: React.ReactNode; side?: boolean; wide?: boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</Button>
      <dialog ref={ref} onClose={close} onClick={(e) => e.target === ref.current && close()}
        className={cn("m-0 max-h-none max-w-none border-line bg-surface p-0 text-ink",
          side ? "fixed inset-y-0 left-auto right-0 h-dvh w-[min(100vw,44rem)] border-l" : cn("fixed left-1/2 top-1/2 max-h-[90dvh] w-[min(94vw,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-md border", wide && "w-[min(94vw,52rem)]"))}>
        {open && (
          <DialogCtx.Provider value={{ close }}>
            <div className={cn("flex flex-col", side ? "h-dvh" : "max-h-[90dvh]")}>
              <div className="flex items-start justify-between gap-4 border-b border-ink px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-xl">{title}</h2>
                  {description && <p className="mt-1 text-[0.87rem] text-ink-2">{description}</p>}
                </div>
                <button type="button" onClick={close} aria-label="Close" className="-mr-1.5 -mt-1 rounded-sm p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"><X className="size-5" /></button>
              </div>
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            </div>
          </DialogCtx.Provider>
        )}
      </dialog>
    </>
  );
}
