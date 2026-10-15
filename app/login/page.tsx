import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginView, LoginSkeleton } from "@/components/auth/login-view";

export const metadata: Metadata = { title: "Sign in · Jelly Shark" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <Suspense fallback={<LoginSkeleton />}>
        <LoginView />
      </Suspense>
    </main>
  );
}
