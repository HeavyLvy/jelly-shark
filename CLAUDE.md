@AGENTS.md

## Working on UI

Whenever you change anything visible, take screenshots and look at them before calling it done: a phone size (390x844, touch) and a desktop size, in a production build against a mock Jellyfin. Check the page as a whole, not just the element you changed (for example, duplicate menus or overlapping bars).

## Branches and pull requests

`beta` is the default branch. Every feature or issue gets its own branch off `beta` (`feature/<short-name>`, or `fix/<short-name>` for bugs) and its own pull request into `beta` that says `Fixes #N`. Don't commit features straight to `beta`. Follow `.github/pull_request_template.md`, and keep unrelated changes out of the PR.
