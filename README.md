# Jelly Shark

A custom web frontend for [Jellyfin](https://jellyfin.org): movies, TV, music, lyrics, search. It runs as a small
Next.js server that sits between your browser and Jellyfin, so the browser never talks to Jellyfin directly and never
sees an access token (sessions are an encrypted, httpOnly cookie).

## Run it with Docker (recommended)

```bash
cp .env.example .env
# edit .env: set JELLYFIN_URL (your server's LAN address) and SESSION_SECRET (openssl rand -base64 48)
docker compose up -d --build
```

Open `http://<this machine>:3100` and sign in with your Jellyfin account (or Quick Connect).

- **Settings** (playback, subtitles, poster size, Home rows…) are stored per user in a SQLite database on the
  `jelly-shark-data` volume (`/data/jelly-shark.db`). Back that volume up if you care about them; delete it to reset.
- **Quick Connect:** signed in on one device, you can sign another device into Jellyfin or Jelly Shark without leaving the app
  (account menu or Settings → Approve a device, then type the 6-digit code the other device shows). It approves as the active
  profile; Quick Connect must be enabled on the Jellyfin server.
- **Branding:** Jellyfin administrators can change the app's name, icon (built-in presets, or any PNG/JPEG/WebP/SVG you upload, which opens in a crop-and-resize editor first)
  and accent color in Settings → Branding. It applies to everyone on the server, including the login page, and is stored
  in the same database; "Reset to defaults" restores the built-in look. (The name shown in Jellyfin's device list stays "Jelly Shark".)
- **Poster size** is a build-time value: `NEXT_PUBLIC_POSTER_WIDTH` in `.env` (120–400, default 215), then rebuild.
- **Health:** `GET /api/health` returns `{"ok":true}`; the image has a Docker `HEALTHCHECK` on it.
- Plain `docker build -t jelly-shark . && docker run -p 3100:3000 -e JELLYFIN_URL=… -e SESSION_SECRET=… -v jelly-shark-data:/data jelly-shark` works too.

The app serves plain HTTP. If you put it behind a reverse proxy with HTTPS, forward the `Host` header (and
`X-Forwarded-Host` if it changes), because writes check that the request's Origin matches.

## Develop

```bash
cp .env.example .env.local   # JELLYFIN_URL, SESSION_SECRET
npm install
npm run dev                  # http://localhost:3100 (also reachable from other devices on your LAN)
```

Needs Node 24. The app's own data (per-user settings) lives in SQLite, accessed through
[Drizzle ORM](https://orm.drizzle.team) with `better-sqlite3`; `DATABASE_PATH` (default `./data/jelly-shark.db`) sets
where the file lives. The schema is TypeScript in `lib/db/schema.ts`. After changing it run `npm run db:generate`
to create a migration in `drizzle/` (commit it); pending migrations are applied automatically at startup.
Checks: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Notes

- Seek-bar preview thumbnails appear after Jellyfin has generated trickplay images
  (Dashboard → Libraries → enable trickplay extraction, then run the *Generate Trickplay Images* task).
- Skip Intro buttons need media segments (an intro-detection plugin) on the server.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) (which also lists third-party attributions).
Jelly Shark is an independent project and is not affiliated with Jellyfin.
