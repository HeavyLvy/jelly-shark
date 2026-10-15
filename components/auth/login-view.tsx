"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, Plus, Smartphone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { JellyGlyph } from "@/components/ui/logo";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/states";
import { ApiError, hardNavigate } from "@/lib/api-client";
import {
  avatarUrl,
  pollQuickConnect,
  useLogin,
  useQuickConnectInitiate,
  useServerInfo,
  useSwitchAccount,
  type PublicAccount,
} from "@/lib/queries/auth";

type Step =
  | { kind: "choose" }
  | { kind: "password"; user: (PublicAccount & { hasPassword?: boolean }) | null }
  | { kind: "quick" };

/**
 * Resolves ?next= against our origin and keeps only same-origin paths.
 * (Browsers treat "/\\evil.example" or "/\t/evil" as protocol-relative, so a
 * prefix check alone is not enough.)
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/login")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Try again.";
}

/** Same as safeNext, but safe to call during render (window may be absent on the server). */
function safeNextFromRaw(raw: string | null): string {
  return typeof window === "undefined" ? "/" : safeNext(raw);
}

export function LoginSkeleton() {
  return (
    <div className="jelly-panel relative w-full max-w-lg rounded-panel p-8">
      <Skeleton tone="raised" className="mx-auto mb-6 h-8 w-48" />
      <div className="flex justify-center gap-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} tone="raised" className="size-20 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function LoginView() {
  const params = useSearchParams();
  const rawNext = params.get("next");
  const adding = params.get("add") === "1";
  const server = useServerInfo();
  const [step, setStep] = useState<Step>({ kind: "choose" });

  // Hard navigation so every per-user cache and kept-alive page starts clean.
  const finish = () => hardNavigate(safeNext(rawNext));

  if (server.isPending) return <LoginSkeleton />;
  if (server.isError) {
    return (
      <div className="jelly-panel relative w-full max-w-lg rounded-panel p-8">
        <ErrorState
          title="Can't reach Jellyfin"
          description="Check that JELLYFIN_URL in .env.local points at your server and that it's running."
          action={<Button onClick={() => server.refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const info = server.data;
  const remembered = adding ? [] : info.accounts;
  const rememberedIds = new Set(info.accounts.map((a) => a.userId));
  const publicUsers = info.publicUsers.filter((u) => !rememberedIds.has(u.userId));
  const hasTiles = remembered.length > 0 || publicUsers.length > 0;
  const effectiveStep: Step = step.kind === "choose" && !hasTiles ? { kind: "password", user: null } : step;

  return (
    <div className="jelly-panel relative w-full max-w-xl rounded-panel p-6 sm:p-10">
      {adding && info.accounts.length > 0 && (
        <Link
          href={safeNextFromRaw(rawNext)}
          className={buttonClasses({ variant: "ghost", size: "sm", className: "absolute top-4 left-4" })}
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Cancel
        </Link>
      )}
      <header className="mb-8 flex flex-col items-center gap-3 text-center">
        <JellyGlyph className="size-10 text-accent" />
        <h1 className="font-display text-3xl font-extrabold tracking-display sm:text-4xl">
          {effectiveStep.kind === "choose" ? "Who's watching?" : "Sign in"}
        </h1>
        <p className="text-sm text-muted">
          {info.serverName}
          {info.version ? ` · Jellyfin ${info.version}` : ""}
        </p>
      </header>

      {effectiveStep.kind === "choose" && (
        <ChooseUser
          remembered={remembered}
          publicUsers={publicUsers}
          onRemembered={finish}
          onPick={(user) => setStep({ kind: "password", user })}
          onOther={() => setStep({ kind: "password", user: null })}
        />
      )}

      {effectiveStep.kind === "password" && (
        <PasswordForm
          user={effectiveStep.user}
          canGoBack={hasTiles}
          onBack={() => setStep({ kind: "choose" })}
          onDone={finish}
        />
      )}

      {effectiveStep.kind === "quick" && <QuickConnect onBack={() => setStep({ kind: "choose" })} onDone={finish} />}

      {info.quickConnect && effectiveStep.kind !== "quick" && (
        <div className="mt-8 border-t border-hairline pt-6 text-center">
          <Button variant="ghost" icon={<Smartphone className="size-4" aria-hidden="true" />} onClick={() => setStep({ kind: "quick" })}>
            Use Quick Connect
          </Button>
        </div>
      )}
    </div>
  );
}

function UserTile({ name, src, onClick, disabled, label }: { name: string; src: string | null; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="group flex w-24 flex-col items-center gap-2 rounded-panel p-2 text-sm text-text-secondary transition hover:text-text disabled:opacity-50 sm:w-28"
      >
        <span className="rounded-full ring-2 ring-transparent ring-offset-4 ring-offset-surface transition group-hover:ring-accent group-focus-visible:ring-accent">
          <Avatar name={name} src={src} size={80} />
        </span>
        <span className="w-full truncate">{label ?? name}</span>
      </button>
    </li>
  );
}

function ChooseUser({
  remembered,
  publicUsers,
  onRemembered,
  onPick,
  onOther,
}: {
  remembered: PublicAccount[];
  publicUsers: (PublicAccount & { hasPassword: boolean })[];
  onRemembered: () => void;
  onPick: (user: PublicAccount & { hasPassword: boolean }) => void;
  onOther: () => void;
}) {
  const switchAccount = useSwitchAccount();
  return (
    <div>
      <ul className="flex flex-wrap justify-center gap-4" aria-label="Profiles">
        {remembered.map((a) => (
          <UserTile
            key={a.userId}
            name={a.name}
            src={avatarUrl(a)}
            disabled={switchAccount.isPending}
            onClick={() => switchAccount.mutate(a.userId, { onSuccess: onRemembered })}
          />
        ))}
        {publicUsers.map((u) => (
          <UserTile key={u.userId} name={u.name} src={avatarUrl(u)} onClick={() => onPick(u)} />
        ))}
        <li>
          <button
            type="button"
            onClick={onOther}
            className="group flex w-24 flex-col items-center gap-2 rounded-panel p-2 text-sm text-text-secondary transition hover:text-text sm:w-28"
          >
            <span className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-hairline-strong transition group-hover:border-accent group-hover:text-accent">
              <Plus className="size-7" aria-hidden="true" />
            </span>
            <span>Add profile</span>
          </button>
        </li>
      </ul>
      {switchAccount.isError && (
        <p role="alert" className="mt-4 text-center text-sm text-danger">
          {errorMessage(switchAccount.error)}
        </p>
      )}
    </div>
  );
}

function PasswordForm({
  user,
  canGoBack,
  onBack,
  onDone,
}: {
  user: (PublicAccount & { hasPassword?: boolean }) | null;
  canGoBack: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const login = useLogin();
  const [username, setUsername] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) passwordRef.current?.focus();
  }, [user]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username: user?.name ?? username, password }, { onSuccess: onDone });
  };

  const inputClass =
    "h-12 w-full rounded-full border border-hairline-strong bg-bg/50 px-5 text-text placeholder:text-muted focus-visible:border-accent focus-visible:outline-none";

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-4">
      {user ? (
        <div className="flex flex-col items-center gap-2">
          <Avatar name={user.name} src={avatarUrl(user)} size={72} />
          <p className="font-semibold">{user.name}</p>
          {/* Lets password managers pair the saved password with this username. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user.name}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Username
          <input
            className={inputClass}
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        Password
        <input
          ref={passwordRef}
          className={inputClass}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {login.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(login.error)}
        </p>
      )}
      <Button type="submit" size="lg" disabled={login.isPending} icon={login.isPending ? <Spinner className="size-4" label="Signing in" /> : <KeyRound className="size-4" aria-hidden="true" />}>
        Sign in
      </Button>
      {canGoBack && (
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden="true" />}>
          Back to profiles
        </Button>
      )}
    </form>
  );
}

function QuickConnect({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const initiate = useQuickConnectInitiate();
  const [status, setStatus] = useState<"pending" | "expired" | "error">("pending");
  const { mutate } = initiate;
  const started = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    // Guard against StrictMode's double effect creating two pending codes.
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  const code = initiate.data?.code;

  useEffect(() => {
    if (!code || status !== "pending") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await pollQuickConnect();
        if (cancelled) return;
        if (res.status === "authenticated") onDoneRef.current();
        else if (res.status === "expired") setStatus("expired");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    const id = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [code, status]);

  const restart = () => {
    setStatus("pending");
    initiate.mutate();
  };

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {initiate.isPending && <Spinner className="size-8" label="Requesting code" />}
      {initiate.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(initiate.error)}
        </p>
      )}
      {code && status === "pending" && (
        <>
          <p className="text-sm text-text-secondary">
            On a device that&apos;s already signed in, open <strong>Settings → Quick Connect</strong> and enter:
          </p>
          <p className="font-display text-5xl font-extrabold tracking-[0.2em] text-accent" aria-live="polite">
            {code}
          </p>
          <CopyButton text={code} label="Copy code" />
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" label="Waiting for approval" /> Waiting for approval…
          </p>
        </>
      )}
      {(status === "expired" || status === "error" || initiate.isError) && !initiate.isPending && (
        <>
          {!initiate.isError && (
            <p role="alert" className="text-sm text-text-secondary">
              {status === "expired" ? "That code expired." : "Couldn't check the code."}
            </p>
          )}
          <Button onClick={restart}>Get a new code</Button>
        </>
      )}
      <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" aria-hidden="true" />}>
        Back
      </Button>
    </div>
  );
}
