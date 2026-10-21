<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Ignore routine debugging and unverified changes. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Keep a qualifying candidate through the reporting pass even if you resolve or work around it. A successful fix changes the report outcome; it does not erase the friction that qualified it.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `node node_modules/next/dist/bin/next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Jelly Shark: how we work

A custom Jellyfin web frontend (Next.js BFF: the browser only talks to this server, which talks to Jellyfin). It is in **beta**. Read `README.md`, `CONTRIBUTING.md` and `RELEASING.md` for the user-facing side. Nothing below overrides what the user tells you in the moment.

### Branches, pull requests and the `beta` ruleset

- `beta` is the default branch and is protected by the ruleset "Protect beta": changes only through a pull request, the `build` check (the `checks` workflow) must pass, no force-pushes, no deletion, review comments resolved, squash or merge commits only. Repository admins can bypass only when merging a PR. **Never push to `beta` directly.**
- Every feature or issue gets its own branch off `beta` (`feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`) and its own pull request into `beta`. Put `Fixes #N` in the PR so the issue closes. Keep one topic per PR; don't mix in unrelated clean-ups, and don't stack unrelated commits on a feature branch.
- Fill in `.github/pull_request_template.md`, ticking only the boxes you actually did. Say plainly when something (like screenshots) is not attached.
- Don't merge pull requests unless the user says to. The user does the merging by default.
- Releases follow `RELEASING.md`, but the version bump now goes through a `release/<version>` branch and PR, since a direct push to `beta` is blocked.
- Commit messages: a short summary line, a plain-language body, and the attribution trailer the session instructions ask for.

### Pushing and GitHub access

- The user's SSH key has a passphrase and there is no agent in the shell, so `git push` over SSH fails. `gh` is installed and logged in as `HeavyLvy`. Push over HTTPS with the `gh` credential for that one command, without changing any git config:
  `git -c credential.helper='!gh auth git-credential' push -u https://github.com/HeavyLvy/jelly-shark.git <branch>`
  The same works for fetching. Open PRs with `gh pr create --base beta --head <branch> --body-file <file>`, and read issues with `gh issue view N --json ...`.
- The remote `origin` is `git@github.com:HeavyLvy/jelly-shark.git`. Don't add other remotes or push to other repos unless the user names them.
- Don't put personal details, real server addresses or secrets in code, docs, screenshots or commit messages. Use `192.168.1.10` style examples.

### Checks before a PR

Run what CI runs: `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm run build`. The lint output currently has two known unused-variable warnings in `scripts/mock-jellyfin.mjs`. Update the README when behavior, settings or install steps change. Database changes need a migration (`npm run db:generate`), committed in `drizzle/`.

### Working on UI

Whenever you change anything visible, take screenshots and look at them before calling it done: a phone size (390x844, touch) and a desktop size, in a **production build** against the mock Jellyfin. Check the page as a whole, not just the element you changed (for example, duplicate menus or overlapping bars). Attach or describe the result in the PR.

How to run it:

- `npm run mock:jellyfin` starts a fake Jellyfin on port 8920 (sign in as any username, e.g. `demo`, any password). It only remembers likes and unlikes; other writes are accepted and forgotten. Add routes there when a feature needs them.
- `npm run build`, then `PORT=<free port> JELLYFIN_URL=http://127.0.0.1:8920 SESSION_SECRET=<32+ chars> DATABASE_PATH=<scratch file> npm start`. Don't use ports 3000 or 3100 (the user's own servers), and don't point tests at the user's real Jellyfin or sign out its test account.
- Drive it with Playwright using Chromium (touch and `isMobile` contexts for the phone size). WebKit does not run on this machine, so iOS-only behavior has to be emulated and called out as unverified on a real iPhone.
- Stop the servers you started when done.

### Code conventions worth knowing

- Use the generated `@jellyfin/sdk` client for Jellyfin calls, not hand-written `fetch` code. Browser calls go through the `/api/jf` proxy (`lib/jellyfin/client.ts`); the session token never reaches the browser.
- Next 16 with `cacheComponents`: client data comes from `useJfQuery` (gated on the client), route handlers `await connection()`, there are no `runtime`/`dynamic` exports, and `usePathname`/`useSearchParams` need a `Suspense` boundary. `proxy.ts` replaces middleware.
- Styling: Tailwind 4 tokens plus the frosted-glass utilities in `app/globals.css` (`jelly`, `jelly-panel`, `jelly-control`, …). Use them on every surface and control, and never `backdrop-filter` inside scrolling content.
- Phone layouts are `max-sm`/below `sm` (40rem). The main phone tab bar is in `components/nav/pill-nav.tsx`; Music has its own shell (`app/(music)`) and shares that tab bar on phones.
- Keep comments and UI text plain and short, matching the surrounding code.
