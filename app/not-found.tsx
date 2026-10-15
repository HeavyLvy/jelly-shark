import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl items-center px-4">
      <EmptyState
        className="w-full"
        as="h1"
        title="Page not found"
        description="That page doesn't exist, or the item was removed from your library."
        action={
          <Link href="/" className={buttonClasses({})}>
            Go home
          </Link>
        }
      />
    </main>
  );
}
