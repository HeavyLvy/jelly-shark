"use client";

import { useEffect, useState } from "react";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { LinkRow, SeerrLinks } from "@/lib/seerr/types";

const AUTO = "auto";

/**
 * Which Seerr account each Jellyfin user acts as. Automatic (matched by Jellyfin
 * id, and created in Seerr on someone's first request) unless an administrator
 * picks a different account here.
 */
export function SeerrAccounts({ connectedUrl }: { connectedUrl: string }) {
  const [data, setData] = useState<SeerrLinks | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Bumped after a change to fetch the list again.
  const [reload, setReload] = useState(0);

  // Also reloads when the connection changes (a different Seerr has different accounts).
  useEffect(() => {
    let live = true;
    void apiFetch<SeerrLinks>("/api/seerr-config/links")
      .then((d) => {
        if (!live) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [connectedUrl, reload]);

  const choose = async (row: LinkRow, value: string) => {
    setMessage(null);
    try {
      await apiFetch("/api/seerr-config/links", { method: "PUT", json: { jellyfinUserId: row.jellyfinUserId, seerrUserId: value === AUTO ? null : Number(value) } });
      setReload((n) => n + 1);
      setMessage({ ok: true, text: value === AUTO ? `${row.jellyfinName} is linked automatically again.` : `${row.jellyfinName} now acts as that Seerr account.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save. Try again." });
    }
  };

  if (failed) return <p className="text-sm text-muted">Couldn&apos;t load the accounts.</p>;
  if (!data) return null;
  const nameOf = (id: number | null) => data.seerrUsers.find((u) => u.id === id)?.name ?? null;

  return (
    <div>
      <h3 className="text-sm font-medium text-text">Accounts</h3>
      <p className="mt-0.5 text-xs text-muted">
        Each person requests as their Seerr account. It&apos;s matched by their Jellyfin account, and created in Seerr the first time they request something. Pick one here to change it.
      </p>
      <ul className="mt-3 divide-y divide-hairline" aria-label="Seerr accounts">
        {data.links.map((row) => (
          <li key={row.jellyfinUserId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{row.jellyfinName}</p>
              <p className="truncate text-xs text-muted">
                {row.source === "manual" ? `Chosen: ${nameOf(row.seerrUserId) ?? "unknown account"}` : row.source === "auto" ? `Matched to ${nameOf(row.seerrUserId) ?? "a Seerr account"}` : "No Seerr account yet"}
              </p>
            </div>
            <SelectMenu
              size="sm"
              label={`Seerr account for ${row.jellyfinName}`}
              value={row.source === "manual" && row.seerrUserId ? String(row.seerrUserId) : AUTO}
              options={[{ value: AUTO, label: "Automatic" }, ...data.seerrUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
              onChange={(v) => void choose(row, v)}
            />
          </li>
        ))}
      </ul>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-2 text-sm text-text-secondary" : "mt-2 text-sm text-danger"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
