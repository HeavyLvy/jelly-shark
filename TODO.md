# TODO

## Bugs to confirm

- **Brief music stutter when pressing the Windows or Alt key (or going in/out of fullscreen).** Much less than before the blur was removed from the large music panels, and now intermittent: it stopped reproducing on demand (2026-10-17), so the cause is unknown. If you can reproduce it, turn on `localStorage.setItem("jelly-debug-audio", "1")` and check the console when it stutters.
- **KDE's repeat button doesn't sync with the app.** The Media Session API has no repeat state, so the browser can't report it to KDE. Probably can't be fixed from the web app.

## Phase 6: polish

- Check the phone layouts on a real phone (done in a phone-sized browser: music tabs, Now Playing screen, touch video controls).
- Accessibility pass (focus order, labels, contrast, reduced motion).
- Performance pass (bundle size, image sizes, long lists).

## Notes

- Skip Intro / Recap buttons only appear when the server has media segments (needs an intro-detection plugin on Jellyfin).
