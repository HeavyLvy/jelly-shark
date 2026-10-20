# Security policy

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub:
<https://github.com/HeavyLvy/jelly-shark/security/advisories/new>
(or the repository's *Security* tab, then *Report a vulnerability*).

Please include:

- what the problem is and what an attacker could do with it,
- the version or image tag, and how you run it,
- steps to reproduce, or a short proof of concept,
- whether it needs a signed-in user, a Jellyfin administrator, or nothing at all.

Don't include real passwords, tokens or your own server's address.

## What to expect

Jelly Shark is a spare-time project, so these are goals, not guarantees:

- I'll acknowledge your report within about 7 days.
- I'll tell you whether I consider it a vulnerability, and keep you updated while a fix is made.
- The fix ships as a new release and the advisory is published with credit to you, unless you'd rather stay anonymous.
- Please give me a reasonable time to fix it before you share details publicly.

## Supported versions

Only the newest release gets security fixes. While the project is in beta (`0.x`), that means the latest `0.x` release;
update to it before reporting if you can. Releases and tags are explained in [RELEASING.md](RELEASING.md).

## Scope

In scope: Jelly Shark's own code and the container image it publishes, for example sign-in and session handling, the
cookie encryption, the origin checks on changes, the proxy to Jellyfin, server-side request issues (such as the
*Server* setting), file uploads (branding icons), and the database.

Out of scope:

- Bugs in Jellyfin itself: report those to [Jellyfin](https://github.com/jellyfin/jellyfin/security).
- Problems caused by how it's run: serving it on the open internet without HTTPS, a weak or shared `SESSION_SECRET`, or
  an exposed Docker socket. The README's HTTPS section describes the intended setup.
- Findings that need an attacker who already controls the server, the container, or a Jellyfin administrator account.
- Automated scanner output with no demonstrated impact.

## Handling secrets

If you accidentally post a secret (a `SESSION_SECRET`, a Jellyfin token, a password) in an issue, change it right away.
Deleting the comment doesn't remove it from email notifications or from anyone who already saw it.
