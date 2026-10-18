# TODO

## Bugs to confirm

- **Short music stutter on fullscreen, F-keys or the Windows key.** Mitigated (removed blur from the large music panels), not confirmed fixed. If it still happens, turn on `localStorage.setItem("jelly-debug-audio", "1")` and check the console when it stutters.
- **KDE's repeat button doesn't sync with the app.** The Media Session API has no repeat state, so the browser can't report it to KDE. Probably can't be fixed from the web app.

## Phase 6: polish

- Check the phone layouts on a real phone (done in a phone-sized browser: music tabs, Now Playing screen, touch video controls).
- Accessibility pass (focus order, labels, contrast, reduced motion).
- Performance pass (bundle size, image sizes, long lists).

## Notes

- Skip Intro / Recap buttons only appear when the server has media segments (needs an intro-detection plugin on Jellyfin).
