import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

function getAllowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_GOOGLE_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user?.email?.toLowerCase();
      if (!email) return false;
      const allowed = getAllowedEmails();
      if (allowed.size === 0) return true; // no allowlist configured = allow all (dev)
      return allowed.has(email);
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
