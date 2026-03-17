import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "./Nav";

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
        <Providers>
          <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-slate-900/80">
            <Nav />
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
