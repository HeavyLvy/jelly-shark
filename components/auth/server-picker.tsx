"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/states";
import { ApiError, apiFetch } from "@/lib/api-client";
import { authKeys, type ServerInfo } from "@/lib/queries/auth";

/**
 * Sign-in screen: shows the server and, when the admin lets people choose,
 * a "Change server" control. The address is verified server-side (it must
 * answer like Jellyfin) before it's accepted. Choosing one only affects this
 * sign-in; the profile remembers its server afterwards.
 */
export function ServerPicker({ info, onChanged }: { info: ServerInfo; onChanged: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: authKeys.server });
    onChanged();
  };

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/server/check", { method: "POST", json: { url } });
      setOpen(false);
      setUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check that address. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const resetToDefault = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/server/check", { method: "DELETE" });
      setOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-sm text-muted">
      <p>
        {info.serverName}
        {info.version ? ` · Jellyfin ${info.version}` : ""}
        {info.canChangeServer && !open && (
          <>
            {" · "}
            <button type="button" onClick={() => setOpen(true)} className="font-semibold text-text-secondary hover:text-text hover:underline">
              Change server
            </button>
          </>
        )}
      </p>
      {info.canChangeServer && !info.usingDefault && info.serverUrl && !open && <p className="mt-0.5 text-xs break-all">{info.serverUrl}</p>}

      {info.canChangeServer && open && (
        <form onSubmit={(e) => void connect(e)} className="mx-auto mt-4 max-w-sm text-left">
          <label htmlFor="server-url" className="block text-sm font-medium text-text">
            Jellyfin server address
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="server-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="192.168.1.10:8096"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
              aria-invalid={!!error}
              aria-describedby={error ? "server-url-error" : undefined}
              className="h-11 min-w-0 flex-1 rounded-card border border-hairline-strong bg-bg/40 px-3 text-text placeholder:text-muted/60 focus-visible:border-accent focus-visible:outline-none"
            />
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? <Spinner className="size-4" label="Checking" /> : "Connect"}
            </Button>
          </div>
          {error && (
            <p id="server-url-error" role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <p className="mt-2 text-xs">Use the address you open Jellyfin at, e.g. a LAN address or https://jellyfin.example.com.</p>
          <div className="mt-2 flex gap-4 text-xs font-semibold">
            <button type="button" onClick={() => setOpen(false)} className="text-text-secondary hover:text-text hover:underline">
              Cancel
            </button>
            {!info.usingDefault && (
              <button type="button" onClick={() => void resetToDefault()} className="text-text-secondary hover:text-text hover:underline">
                Use the default server
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
