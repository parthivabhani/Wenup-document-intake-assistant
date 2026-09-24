import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared top bar: announcement strip + logo row. `actions` fills the right side. */
export function SiteHeader({ actions, compact = false }: { actions?: ReactNode; compact?: boolean }) {
  return (
    <header>
      {!compact && (
        <p className="bg-ink px-4 py-2.5 text-center text-xs text-white sm:text-sm">
          <span className="sm:hidden">Technical test by Parthiv Abhani. Not an official Wenup product.</span>
          <span className="hidden sm:inline">
            A technical test built by Parthiv Abhani, not an official Wenup product. Any document it drafts is fictional, not legal advice.
          </span>{" "}
          <Link href="/intake" className="font-bold text-lime underline-offset-4 hover:underline">
            Try it now
          </Link>
        </p>
      )}
      <div
        className={`mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-8 ${compact ? "py-3" : "py-5 sm:py-6"}`}
      >
        <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="Document Intake Assistant home">
          <Image
            src="/wenup-logo.svg"
            alt="Wenup"
            width={compact ? 96 : 128}
            height={compact ? 27 : 36}
            priority
            className={`h-auto shrink-0 ${compact ? "w-[76px] sm:w-[96px]" : "w-[92px] sm:w-[128px]"}`}
          />
          {/* Wraps to two short lines on phones so it fits beside the action button */}
          <span
            className={`max-w-[6.75rem] border-l-2 border-lilac pl-2.5 text-xs leading-tight font-semibold sm:max-w-none sm:pl-3 sm:font-medium ${compact ? "sm:text-sm" : "sm:text-base"}`}
          >
            Document Intake Assistant
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">{actions}</div>
      </div>
    </header>
  );
}
