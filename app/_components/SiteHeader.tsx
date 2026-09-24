import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared top bar: announcement strip + logo row. `actions` fills the right side. */
export function SiteHeader({ actions, compact = false }: { actions?: ReactNode; compact?: boolean }) {
  return (
    <header>
      {!compact && (
        <p className="bg-ink px-4 py-2.5 text-center text-sm text-white">
          A technical test build: the document it drafts is fictional, not legal advice.{" "}
          <Link href="/intake" className="font-bold text-lime underline-offset-4 hover:underline">
            Try it now
          </Link>
        </p>
      )}
      <div
        className={`mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-8 ${compact ? "py-3" : "py-5 sm:py-6"}`}
      >
        <Link href="/" className="flex items-center gap-3" aria-label="Document Intake Assistant home">
          <Image src="/wenup-logo.svg" alt="WenUp" width={compact ? 96 : 128} height={compact ? 27 : 36} priority />
          <span className={`hidden font-medium sm:inline ${compact ? "text-sm" : "text-base"}`}>
            Document Intake Assistant
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">{actions}</div>
      </div>
    </header>
  );
}
