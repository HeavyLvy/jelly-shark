import { Suspense } from "react";
import { SearchView } from "@/components/search/search-view";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="pt-28" />}>
      <SearchView />
    </Suspense>
  );
}
