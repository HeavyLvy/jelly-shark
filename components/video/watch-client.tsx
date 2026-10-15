"use client";

import { useParams } from "next/navigation";
import { LockPageScroll } from "@/components/lock-page-scroll";
import { VideoPlayer } from "./video-player";

/** Keys the player by id so "next episode" starts a fresh player (clean state, new negotiation). */
export function WatchClient() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <LockPageScroll />
      <VideoPlayer key={id} id={id} />
    </>
  );
}
