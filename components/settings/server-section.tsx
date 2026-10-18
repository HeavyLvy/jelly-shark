"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ApiError, apiFetch } from "@/lib/api-client";
import { authKeys, useMe } from "@/lib/queries/auth";

interface ServerConfig {
  envUrl: string;
  defaultUrl: string;
  policy: "locked" | "users";
  custom: boolean;
}

/**
 * Which Jellyfin server Jelly Shark talks to.
 * - Administrators (of this instance's server): the address everyone uses, and
 *   whether people may sign in to a server of their own.
 * - Everyone else: nothing, unless the admin lets people choose, in which case
 *   they see their current server and can sign in to a different one.
 */
export function ServerSection() {
  const me = useMe();
  const server = me.data?.server;
  if (!server) return null;
  const isAdmin = !!me.data?.user.isAdministrator && server.isInstanceServer;
  if (isAdmin) return <AdminServerSettings />;
  if (server.canChange) return <MyServer name={server.name} url={server.url} />;
  return null;
}

/** A person's own view when users may choose their server. */
function MyServer({ name, url }: { name: string | null; url: string | null }) {
  const router = useRouter();
  return (
    <section aria-label="Server" className="mt-10">
      <h2 className="mb-2 font-display text-xl font-bold tracking-tight">Server</h2>
      <div className="jelly-solid rounded-panel px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <div className="min-w-0 flex-1 basis-56">
            <p className="font-medium text-text">Connected to {name ?? "Jellyfin"}</p>
            {url && <p className="mt-0.5 text-sm break-all text-muted">{url}</p>}
          </div>
          <Button variant="secondary" onClick={() => router.push("/login?add=1")}>
            Sign in to a different server
          </Button>
        </div>
      </div>
    </section>
  );
}

function AdminServerSettings() {
  const qc = useQueryClient();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    void apiFetch<ServerConfig>("/api/server-config")
      .then((c) => {
        if (!live) return;
        setConfig(c);
        setUrl(c.defaultUrl);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!config) return null;

  const save = async (patch: { url?: string | null; policy?: "locked" | "users" }, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await apiFetch<ServerConfig>("/api/server-config", { method: "PUT", json: patch });
      setConfig(next);
      setUrl(next.defaultUrl);
      void qc.invalidateQueries({ queryKey: authKeys.me });
      void qc.invalidateQueries({ queryKey: authKeys.server });
      setMessage({ ok: true, text: success });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const changed = url.trim() !== config.defaultUrl;
  const seg = (active: boolean) => cn("min-h-11 flex-1 rounded-card px-4 py-2 text-left transition", active ? "bg-text text-bg" : "text-text-secondary hover:bg-overlay hover:text-text");

  return (
    <section aria-label="Server" className="mt-10">
      <h2 className="font-display text-xl font-bold tracking-tight">Server</h2>
      <p className="mb-2 text-sm text-muted">Which Jellyfin server Jelly Shark connects to. Only Jellyfin administrators see this.</p>
      <div className="jelly-solid space-y-6 rounded-panel p-5">
        <div>
          <label htmlFor="server-address" className="text-sm font-medium text-text">
            Jellyfin address
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id="server-address"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setMessage(null);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
              className="h-11 min-w-0 flex-1 basis-64 rounded-card border border-hairline-strong bg-bg/40 px-3 text-text focus-visible:border-accent focus-visible:outline-none"
            />
            <Button disabled={busy || !changed || !url.trim()} onClick={() => void save({ url }, "Saved. Connected to the new address.")}>
              Save
            </Button>
            {config.custom && (
              <Button variant="secondary" disabled={busy} onClick={() => void save({ url: null }, "Back to the address from JELLYFIN_URL.")}>
                Use the default
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            The default comes from <code className="rounded bg-overlay px-1">JELLYFIN_URL</code> ({config.envUrl}). It&apos;s checked before saving. If this is a different Jellyfin server,
            everyone will need to sign in again.
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-text">Who can choose a server</legend>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Who can choose a server">
            <button type="button" role="radio" aria-checked={config.policy === "locked"} disabled={busy} onClick={() => config.policy !== "locked" && void save({ policy: "locked" }, "Locked: everyone uses the address above.")} className={seg(config.policy === "locked")}>
              <span className="block text-sm font-semibold">Locked</span>
              <span className={cn("block text-xs", config.policy === "locked" ? "text-bg/70" : "text-muted")}>Everyone uses the address above. No server options for anyone else.</span>
            </button>
            <button type="button" role="radio" aria-checked={config.policy === "users"} disabled={busy} onClick={() => config.policy !== "users" && void save({ policy: "users" }, "People can now sign in to a server of their own.")} className={seg(config.policy === "users")}>
              <span className="block text-sm font-semibold">Users can choose</span>
              <span className={cn("block text-xs", config.policy === "users" ? "text-bg/70" : "text-muted")}>The sign-in screen gets a &ldquo;Change server&rdquo; option. Each profile remembers its own server.</span>
            </button>
          </div>
          {config.policy === "users" && <p className="mt-2 text-xs text-muted">Switching back to Locked signs out anyone who chose a different server.</p>}
        </fieldset>

        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-text-secondary" : "text-danger")}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
