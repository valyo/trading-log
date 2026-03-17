"use client";

import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl: "/" })}
      className="rounded-md bg-[var(--primary)] px-6 py-3 text-[var(--primary-foreground)] font-medium hover:opacity-90"
    >
      Sign in with Google
    </button>
  );
}
