import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-[background,border-color,color,transform] duration-100 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none select-none";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-cobalt hover:text-on-cobalt border border-ink hover:border-cobalt",
  secondary: "bg-surface text-ink border border-line-2 hover:border-ink",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2 border border-transparent",
  danger: "bg-surface text-red border border-red/50 hover:bg-red hover:text-surface hover:border-red",
};
const sizes: Record<Size, string> = { sm: "h-8 px-2.5 text-[0.83rem]", md: "h-9.5 px-3.5 text-[0.9rem]", lg: "h-12 px-5 text-base" };

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) => cn(base, variants[variant], sizes[size], className);

export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}
export function ButtonLink({ variant = "primary", size = "md", className, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; variant?: Variant; size?: Size }) {
  return <Link href={href} {...props} className={buttonClass(variant, size, className)} />;
}
