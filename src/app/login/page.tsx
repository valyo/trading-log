import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignInButton } from "./SignInButton";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-4">
      <p className="text-center text-2xl font-medium text-[var(--foreground)]">
        Сульо и Пульо нямат работа тук
      </p>
      {error === "AccessDenied" && (
        <p className="text-center text-sm text-amber-600 dark:text-amber-400">
          Your Google account is not allowed to sign in.
        </p>
      )}
      <SignInButton />
    </div>
  );
}
