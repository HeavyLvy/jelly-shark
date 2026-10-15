import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR/prerender and hydration, true afterwards. Data views gate
 * their queries on this so /api/jf requests only ever run in the browser.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
