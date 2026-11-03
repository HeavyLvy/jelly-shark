"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ApiError, apiFetch } from "@/lib/api-client";
import { seerrKeys } from "@/lib/queries/seerr";
import { SeerrAccounts } from "./seerr-accounts";

interface SeerrConfig {
  configured: boolean;
  url: string | null;
  version?: string;
}

const INPUT = "h-11 min-w-0 flex-1 basis-64 rounded-card border border-hairline-strong bg-bg/40 px-3 text-text focus-visible:border-accent focus-visible:outline-none";

/** Connect Jelly Shark to a Seerr server (administrators only; the server checks too). */
export function SeerrSection() {
  const qc = useQueryClient();
  const [config, setConfig] = useState<SeerrConfig | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    void apiFetch<SeerrConfig>("/api/seerr-config")
      .then((c) => {
        if (!live) return;
        setConfig(c);
        setUrl(c.url ?? "");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!config) return null;

  const run = async (action: () => Promise<SeerrConfig>, success: (next: SeerrConfig) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await action();
      setConfig(next);
      setUrl(next.url ?? "");
      setApiKey("");
      void qc.invalidateQueries({ queryKey: seerrKeys.all });
      setMessage({ ok: true, text: success(next) });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => apiFetch<SeerrConfig>("/api/seerr-config", { method: "PUT", json: { url, ...(apiKey.trim() ? { apiKey } : {}) } }),
      (next) => `Connected to Seerr${next.version ? ` ${next.version}` : ""}.`,
    );
  const disconnect = () => run(() => apiFetch<SeerrConfig>("/api/seerr-config", { method: "DELETE" }), () => "Disconnected from Seerr.");

  const changed = url.trim() !== (config.url ?? "") || apiKey.trim() !== "";
  const canSave = !busy && changed && !!url.trim() && (apiKey.trim() !== "" || (config.configured && url.trim() === config.url));

  return (
    <section aria-label="Seerr" className="mt-10">
      <h2 className="font-display text-xl font-bold tracking-tight">Seerr</h2>
      <p className="mb-2 text-sm text-muted">Lets people request movies and shows that aren&apos;t in your library yet. Only Jellyfin administrators see this.</p>
      <div className="jelly-solid space-y-5 rounded-panel p-5">
        <div>
          <label htmlFor="seerr-address" className="text-sm font-medium text-text">
            Seerr address
          </label>
          <input
            id="seerr-address"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setMessage(null);
            }}
            placeholder="http://192.168.1.10:5055"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            className={cn(INPUT, "mt-1.5 w-full")}
          />
        </div>
        <div>
          <label htmlFor="seerr-key" className="text-sm font-medium text-text">
            API key
          </label>
          <input
            id="seerr-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setMessage(null);
            }}
            placeholder={config.configured ? "Saved. Type a new key to replace it." : "Paste the key from Seerr"}
            autoComplete="off"
            spellCheck={false}
            className={cn(INPUT, "mt-1.5 w-full")}
          />
          <p className="mt-2 text-xs text-muted">
            Find it in Seerr under Settings → General. It&apos;s checked before saving, stays on this server, and is never sent to your browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canSave} onClick={() => void save()}>
            {config.configured ? "Save" : "Connect"}
          </Button>
          {config.configured && (
            <Button variant="secondary" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          )}
        </div>
        {config.configured && config.url && <SeerrAccounts connectedUrl={config.url} />}
        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-text-secondary" : "text-danger")}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
