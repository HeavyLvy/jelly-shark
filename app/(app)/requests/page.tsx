import { Suspense } from "react";
import type { Metadata } from "next";
import { MyRequestsView, MyRequestsSkeleton } from "@/components/seerr/my-requests-view";

export const metadata: Metadata = { title: "My requests · Jelly Shark" };

export default function MyRequestsPage() {
  return (
    <Suspense fallback={<MyRequestsSkeleton />}>
      <MyRequestsView />
    </Suspense>
  );
}
