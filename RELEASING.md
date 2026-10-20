# Releasing and versioning

Jelly Shark uses [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`, for example `1.4.2`.

## What each number means

"Compatible" here means: an existing install can update without changing its settings, its `.env`, its Docker volume
or how it talks to Jellyfin.

| Bump | When | Examples |
| --- | --- | --- |
| **MAJOR** (`2.0.0`) | Not compatible with the previous version. Updating needs the person running it to do something. | Removing or renaming an environment variable. A database change that can't be applied automatically. Dropping support for an older Jellyfin. Changing the port or the `/data` volume layout. |
| **MINOR** (`1.5.0`) | New features, still compatible with the previous version. | A new page, setting or player option. A new optional environment variable with a safe default. |
| **PATCH** (`1.4.3`) | Bug fixes only. Nothing new, nothing changed on purpose. | A crash, a wrong label, a layout bug, a security fix that changes no behavior. |

Rules of thumb:

- When in doubt between two levels, pick the higher one.
- Database migrations in `drizzle/` run on their own at startup. That's fine in a minor or patch release as long as the
  update needs nothing from the person running it and can't lose their data.
- Bump the number for the *whole* release, not per change. If a release has a fix and a feature, it's a minor release.

### Before 1.0

While the major number is `0` the project is in beta, and anything may change between minor versions: `0.2.0` can be
incompatible with `0.1.x`. Patches (`0.1.1`) stay bug-fix only. The jump to `1.0.0` is the promise that the rules above
hold from then on.

### Pre-releases

A hyphen suffix marks a version that isn't final yet: `0.1.0-beta.1`, `0.1.0-beta.2`, `1.0.0-rc.1`. They sort before the
plain version (`0.1.0-beta.2` < `0.1.0`). Pre-releases are published on GitHub as *pre-releases* and never become
`:latest`.

## Where the version lives

Three places must agree. The release workflow refuses to build if they don't:

1. the git tag, with a leading `v` (`v0.1.0-beta.1`)
2. `version` in `package.json` (and `package-lock.json`)
3. `CLIENT_VERSION` in `lib/constants.ts` (what Jelly Shark reports to Jellyfin)

## Cutting a release

1. Make sure the code on the branch is what you want to ship: `npx next typegen && npx tsc --noEmit`, `npm run lint`,
   `npm run build`.
2. Set the new version in package.json and the lock file without creating a tag:

   ```bash
   npm version 0.1.0-beta.2 --no-git-tag-version
   ```

   Then set the same value for `CLIENT_VERSION` in `lib/constants.ts`.
3. Commit and push (for example `Release 0.1.0-beta.2`).
4. Create the release. The tag is made for you, on the branch you name:

   ```bash
   gh release create v0.1.0-beta.2 --target beta --prerelease --generate-notes   # pre-release
   gh release create v0.1.0 --target beta --generate-notes                         # stable
   ```

5. Publishing the release starts the **release image** workflow (Actions tab). It builds for `amd64` and `arm64` and
   pushes to GitHub's container registry.
6. At the first stable release (`1.0.0`, or whichever stable version comes first), change the image tag in
   `docker-compose.yml` and the README from `:beta` to `:latest`, so the install steps stay on the newest stable build.

## Container image tags

The image is `ghcr.io/<owner>/<repo>` (lowercase). For a release `vX.Y.Z`:

| Release | Tags pushed |
| --- | --- |
| Stable `v1.4.2` | `1.4.2`, `1.4`, `1`, `latest` |
| Stable `v0.2.3` | `0.2.3`, `0.2`, `latest` (no `:0`, since 0.x minors may break) |
| Pre-release `v0.1.0-beta.1` | `0.1.0-beta.1`, `beta` (never `latest`) |
| `rc` pre-release `v1.0.0-rc.1` | `1.0.0-rc.1`, `rc` |
| Manual workflow run | `edge` |

To stay on compatible updates, follow `1` (or `1.4` for patches only). For a fully repeatable setup, pin the exact
version.

GitHub can make a package **private** the first time an image is pushed. After your first release, check by pulling
while logged out; if it's denied, open the package's settings on GitHub (Package settings → Change visibility) and make
it public so `docker pull` works for everyone.
