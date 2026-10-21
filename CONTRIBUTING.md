# Contributing and issue handling

Thanks for helping. This page explains how to report things, how reports are handled, and what a good pull request
looks like. Jelly Shark is a spare-time project: replies can take a few days.

## Where things go

| You have | Do this |
| --- | --- |
| A security problem | **Not a public issue.** Use the private report link in [SECURITY.md](SECURITY.md). |
| Something broken | Open a **Bug report**. |
| An idea | Open a **Feature request**. |
| A "how do I" question | Read the README first, then open a **Question**. |
| A bug in Jellyfin itself (library, transcoding, plugins) | Report it to [Jellyfin](https://github.com/jellyfin/jellyfin/issues). If Jelly Shark mishandles what Jellyfin sends, open a bug here. |

Blank issues are turned off on purpose: the forms ask for what is needed to reproduce a problem.

## Rules for everyone

1. **Search first.** Open and closed issues. Add a 👍 to an existing one instead of commenting "+1".
2. **One problem per issue.** Two bugs are two issues.
3. **Be specific.** Version, browser, device, steps, and what you expected. "It doesn't work" can't be fixed.
4. **Keep private things out.** Issues are public and permanent. Remove tokens, passwords, your `SESSION_SECRET`, and real
   addresses from logs and screenshots. If you posted one by accident, change it.
5. **Be kind.** No insults, harassment or pressure ("any update?"). Comments that break this are hidden or deleted, and
   repeat offenders are blocked.
6. **English**, please, so everyone can follow along.

## How issues are handled

New issues from the forms start with the `needs-triage` label. Triage means: read it, label it, and either ask for what's
missing or confirm it.

### Labels

Type (set by the form):

- `bug`: something is broken
- `enhancement`: a new feature or improvement
- `question`: help with using or setting up
- `documentation`: README or docs are wrong or missing
- `accessibility`: a barrier for people with disabilities (treated like a bug)

Status:

- `needs-triage`: not looked at yet
- `needs-info`: waiting for the reporter
- `confirmed`: reproduced, or clearly valid
- `regression`: worked in an earlier release
- `upstream`: caused by Jellyfin or the browser, not by this project
- `blocked`: waiting on something else

Area (what part of the app): `area: video`, `area: music`, `area: search`, `area: phone`, `area: settings`,
`area: install`, `area: jellyfin-compat`.

Helpers: `good first issue`, `help wanted`.

Closing reasons: `duplicate`, `wontfix`, `invalid`.

### What happens to each kind

**Bugs.** Triage tries to reproduce it. If something's missing, it gets `needs-info` and a question. A bug that makes
the app unusable, loses data, or is a `regression` in the newest release goes first. Cosmetic and single-browser bugs
wait their turn. Fixes go into the next patch release (see [RELEASING.md](RELEASING.md)).

**Features.** Accepted if they fit what Jelly Shark is (a fast, good-looking Jellyfin frontend), can be built in a web
app, and don't add a lot of upkeep. Accepted ideas get `confirmed` and wait for someone to build them. Declined ones are
closed as `wontfix` with the reason. A feature isn't a promise until it has a pull request or a milestone.

**Security.** Handled privately, as described in [SECURITY.md](SECURITY.md). If a security problem is posted publicly,
the issue is hidden or deleted, and the reporter is asked to resend it privately.

**Questions.** Answered when possible. If the answer should have been in the README, a documentation fix follows.

### Closing

- **No reply:** an issue waiting on `needs-info` is closed after 14 days without an answer. It can be reopened any time.
- **Duplicates:** closed with a link to the original.
- **Can't reproduce** after the reporter has given what was asked: closed, reopened if new details appear.
- **Fixed:** closed by the pull request or release that fixes it (`Fixes #123`).
- **Old versions:** a bug that can't be reproduced on the newest release is closed; update and reopen if it comes back.

## Sending a pull request

1. **Open an issue first** for anything bigger than a small fix, so effort isn't wasted on something that won't be merged.
2. Branch from `beta` and open the pull request against `beta`.
3. Keep it to **one topic**. No drive-by renames or reformatting.
4. Before pushing, run what CI runs:

   ```bash
   npx next typegen && npx tsc --noEmit
   npm run lint
   npm run build
   npm test
   npm run test:e2e
   ```

   The browser tests need the build first and download a test browser once (`npx playwright install chromium`).
   Bug fixes and visible features need a test that fails without them.

5. **Visible changes need screenshots** (see "Working on UI" in [AGENTS.md](AGENTS.md)): a phone size (390x844, touch)
   and a desktop size, taken from a production build, looking at the whole page and not only the part you changed.
   `npm run mock:jellyfin` gives you a fake server to test against.
6. Database changes need a migration (`npm run db:generate`), committed in `drizzle/`.
7. Update the README when behavior, settings or install steps change.
8. Don't put personal details, real server addresses or secrets in code, tests, screenshots or commit messages.
9. Fill in the pull request template. CI (`checks`) must be green before it's merged.

By contributing you agree your work is licensed under the project's [Apache License 2.0](LICENSE).
