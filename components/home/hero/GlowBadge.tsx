import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The "Experience the End of PDF Service Letters Era" pill.
 * A bright ray runs around its border (CSS only, see .glow-badge in globals.css).
 */
export default function GlowBadge({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "glow-badge group inline-block rounded-full border border-white/15 bg-white/5 p-[5px] backdrop-blur-sm sm:p-[6px]",
        "transition-transform duration-300 hover:scale-[1.03] active:scale-[0.99]",
        className,
      )}
    >
      <span className="block rounded-full bg-gradient-to-b from-[#1f4fd1] to-[#0f2f86] px-5 py-2.5 text-center text-[clamp(0.95rem,3.9vw,1.75rem)] font-medium leading-snug text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] sm:px-9 sm:py-3">
        {children}
      </span>
    </Link>
  );
}
