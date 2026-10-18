import { Suspense } from "react";
import type { Metadata } from "next";
import { HistoryView, HistorySkeleton } from "@/components/history/history-view";

export const metadata: Metadata = { title: "Watch history · Jelly Shark" };

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistorySkeleton />}>
      <HistoryView />
    </Suspense>
  );
}
