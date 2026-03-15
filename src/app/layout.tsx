import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trend Trading Log",
  description: "Log and track trend following trades and screening",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-slate-900/80">
          <nav className="mx-auto max-w-6xl px-4 py-3 flex gap-6">
            <Link href="/" className="font-semibold text-[var(--primary)]">
              Trend Log
            </Link>
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
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
