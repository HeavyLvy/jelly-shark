# TODO

## Bugs to confirm

- **Brief music stutter when pressing the Windows or Alt key (or going in/out of fullscreen).** Much less than before the blur was removed from the large music panels, and now intermittent: it stopped reproducing on demand (2026-10-17), so the cause is unknown. If you can reproduce it, turn on `localStorage.setItem("jelly-debug-audio", "1")` and check the console when it stutters.
- **KDE's repeat button doesn't sync with the app.** The Media Session API has no repeat state, so the browser can't report it to KDE. Probably can't be fixed from the web app.

## Phase 6: polish

- Check the phone layouts on a real phone (done in a phone-sized browser: music tabs, Now Playing screen, touch video controls).
- Accessibility pass (focus order, labels, contrast, reduced motion).
- Performance pass (bundle size, image sizes, long lists).
- Search is done but only checked against a mock server: try the typo matching ("Spnge Bobo"), Pages & settings, Favorites and People on your real library. Songs and episodes are matched through Jellyfin's own search plus a local index capped at 40,000 titles per kind, so check a big music library for speed.
- The two new lyrics full screen modes (expand, and browser full screen) are only checked in Chromium. Check them on Firefox and Safari. iPhone has no browser Fullscreen API, so there it covers the page instead.

## Notes

- Skip Intro / Recap buttons only appear when the server has media segments (needs an intro-detection plugin on Jellyfin).

## Phone Issues

All of these apply to mobile ONLY. All are done and checked at 390x844 with touch, except the real-device check above.

- The account dropdown fix (it closed itself when an item was tapped, because iOS never focuses tapped buttons) is checked by emulating iOS's blur in Chromium. WebKit can't run on this machine, so confirm on your iPhone.
- iPhone favorites from the lock screen / media controller: not possible from a web app. The Media Session API only has 16 actions (play, pause, seek, next/previous track, and a few call and slide ones) and no like, favorite or rating. Apple's like command only exists for native apps.
