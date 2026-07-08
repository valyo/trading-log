"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function Nav() {
  const { data: session, status } = useSession();

  return (
    <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-6 flex-wrap">
      <div className="flex gap-6">
        <Link href="/" className="font-semibold text-[var(--primary)]">
          Trend Log
        </Link>
        {session && (
          <>
            <Link href="/trades" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Trades
            </Link>
            <Link href="/trades/import" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Import trades
            </Link>
            <Link href="/screens" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Screens
            </Link>
            <Link href="/screens/compare" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Compare
            </Link>
            <Link href="/performance" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Performance
            </Link>
            <Link href="/stretch" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Price study
            </Link>
          </>
        )}
      </div>
      {status === "authenticated" && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--muted)]">{session?.user?.email}</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
