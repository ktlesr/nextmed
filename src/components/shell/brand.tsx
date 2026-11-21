import { cn } from "@/lib/cn";

/** Wordmark: an eight-point çini star (two rotated squares) + the project name. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(45 12 12)" />
      <rect x="9.6" y="9.6" width="4.8" height="4.8" fill="var(--turq)" transform="rotate(45 12 12)" />
    </svg>
  );
}

export function Brand({ sub, className }: { sub?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Mark className="text-cobalt" />
      <span className="leading-none">
        <span className="block font-display text-[1.06rem] font-bold tracking-tight">PDS4<span className="text-cobalt">Next</span>Med</span>
        {sub && <span className="label mt-1 block text-[0.6rem]">{sub}</span>}
      </span>
    </span>
  );
}

/** Seljuk eight-point star lattice, used once: the sign-in panel. */
export function StarLattice({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden>
      <defs>
        <pattern id="lattice" width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="16" y="16" width="24" height="24" />
            <rect x="16" y="16" width="24" height="24" transform="rotate(45 28 28)" />
            <path d="M28 0v11M28 45v11M0 28h11M45 28h11" />
            <circle cx="0" cy="0" r="5" /><circle cx="56" cy="0" r="5" /><circle cx="0" cy="56" r="5" /><circle cx="56" cy="56" r="5" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#lattice)" />
    </svg>
  );
}
