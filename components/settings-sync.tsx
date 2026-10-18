"use client";

import { useEffect } from "react";
import { useMe } from "@/lib/queries/auth";
import { syncSettingsFromServer } from "@/lib/settings-sync";

/** Pulls the signed-in user's settings from the server whenever the active user changes. */
export function SettingsSync() {
  const me = useMe();
  const userId = me.data?.user.id;
  useEffect(() => {
    if (userId) void syncSettingsFromServer();
  }, [userId]);
  return null;
}
