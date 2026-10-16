# TODO

## Decisions

- **"c" subtitle toggle: prefer text subtitles?** When no subtitle was used before, "c" picks the first subtitle in the list. On DVD rips that is often a picture subtitle (DVDSUB/PGS), which has to be burned in and makes Jellyfin re-encode the video. Option: prefer the first *text* subtitle and fall back to the first in the list.
- **Music volume with ↑/↓ without clicking the slider.** Today ↑/↓ only change music volume while the volume slider is focused; after clicking elsewhere they do nothing. Wanted: ↑/↓ change volume ±5% without focusing the slider, with a brief "Volume 45%" readout (like the video player). Open question: where. Proposal: on the Music pages and whenever focus is inside the player bar, but not on Home/Library, where ↑/↓ scroll the page (or use Shift+↑/↓ there).

## Bugs to confirm

- **Short music stutter on fullscreen, F-keys or the Windows key.** Mitigated (removed blur from the large music panels), not confirmed fixed. If it still happens, turn on `localStorage.setItem("jelly-debug-audio", "1")` and check the console when it stutters.
- **KDE's repeat button doesn't sync with the app.** The Media Session API has no repeat state, so the browser can't report it to KDE. Probably can't be fixed from the web app.

## Phase 6: polish

- Responsive layouts: music panels collapse on small screens, phone-width player bar.
- Accessibility pass (focus order, labels, contrast, reduced motion).
- Performance pass (bundle size, image sizes, long lists).
- README: setup, `.env.local`, running on the LAN.

## Notes

- Skip Intro / Recap buttons only appear when the server has media segments (needs an intro-detection plugin on Jellyfin).
