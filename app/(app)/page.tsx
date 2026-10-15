import { Suspense } from "react";
import { HomeSkeleton, HomeView } from "@/components/home/home-view";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeView />
    </Suspense>
  );
}
