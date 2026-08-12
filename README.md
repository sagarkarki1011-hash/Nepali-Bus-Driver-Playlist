# नेपाल यातायात — Nepali Bus Driver Playlist

A fullscreen bus ride through the hills. Frames of the road loop behind an invisible
YouTube player, so all you get is the view and the music. `/garage` is where you change
the playlist and the road without touching the code.

```
/            the ride
/garage      password-protected editor
/api/config  GET is public, POST needs the garage cookie
```

## The three things worth knowing up front

**1. Audio cannot start on its own.** Every browser blocks autoplay with sound until
someone interacts with the page. That is why the ride opens on a boarding card — the
click on **चढ्नुहोस्** is what lets the music start. There is no way around this, and
sites like hornokplease.xyz work the same way.

**2. The YouTube player has to stay in the page.** `display: none` on the iframe stops
playback, so `#yt-host` is a real 240×135 element parked in the corner at `opacity: 0`.
It is driven entirely through the IFrame API — the visible controls are ours.

**3. Nothing saves without a store.** The garage writes to Redis or Blob storage. Until
one is connected it will tell you so and keep the Save button disabled.

## Deploying

1. **Import the repo into Vercel.** No build step and no framework preset — `public/`
   is served as-is and `api/` becomes serverless functions.

2. **Set the garage password.** Settings → Environment Variables:

   | Variable | Required | What it does |
   | --- | --- | --- |
   | `GARAGE_PASSWORD` | yes | The password for `/garage`. |
   | `GARAGE_SECRET` | no | Signs the session cookie. Derived from the password when unset — set it to a long random string if you want sessions to survive a password change. |

3. **Add storage** — Storage → Create, then connect it to the project:

   - **Redis (Upstash)** for the config. Saves appear instantly. Vercel injects
     `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
   - **Blob** if you want to upload frames from the garage rather than paste URLs.
     Injects `BLOB_READ_WRITE_TOKEN`.

   Blob alone works for both — the config is then stored as a JSON blob, but the CDN
   can hold a stale copy for up to a minute after each save. Redis avoids that.

4. **Redeploy** so the functions pick up the new environment variables.

Everything degrades honestly: with no storage the site still runs on the defaults in
`public/assets/fallback-config.js`, and the garage says exactly what is missing.

## Using the garage

Sign in at `/garage`.

- **Playlist** — paste a full YouTube link or a bare ID. It strips `?si=` tracking and
  pulls the `list=` parameter out. The hint line under the field tells you what it
  parsed, and warns you when an ID looks too short to be real.
- **Background** — either **Frames** (crossfading stills) or a **Video file**. Frames can
  be dropped in, browsed for, or pasted as `https://` URLs. Dropped images are resized
  to 2560px and re-encoded in the browser before upload, which keeps them under the
  4 MB function-body limit and keeps the site fast. Reorder by dragging or with the
  arrow buttons.
- **Motion** — *Crossfade* dissolves between frames, *Flipbook* cycles them fast with no
  fade, *Hard cut* snaps. Ken Burns adds a slow drifting zoom. The preview panel runs
  the real transition.
- **Signage** — the title plate, route line and footer line, plus toggles for the
  signboard, the tassels down the sides, and the vignette.

Changes are staged locally until you press Save; Revert throws them away.

## On the ride

| Key | |
| --- | --- |
| `space` | play / pause |
| `←` `→` | previous / next track |
| `↑` `↓` | volume |
| `H` | horn |
| `S` | shuffle |
| `M` | mute |
| `F` | fullscreen |

The controls fade out after a few seconds of stillness and come back on any movement.
The horn is synthesised with the Web Audio API, so it costs no asset. Volume is
remembered per visitor in `localStorage`; everything else comes from the garage.

## Local development

```sh
npm install
npx vercel dev          # needs the env vars above in .env.local
```

`npm run frames` regenerates the placeholder SVGs in `public/frames` from
`tools/make-frames.mjs`. They exist so the site looks alive before you add your own
photographs — delete them from the garage once you have real frames.

## Layout

```
api/          config.js · session.js · upload.js
lib/          store.js · auth.js · validate.js · http.js · defaults.js
public/       index.html · garage.html · assets/ · frames/
tools/        make-frames.mjs
```

`public/assets/fallback-config.js` is the single source of truth for defaults — the API
imports it to fill gaps, and the browser loads it directly if `/api/config` is
unreachable.

## Notes on safety

The config endpoint is the only write path and it is behind an HMAC-signed, HttpOnly
session cookie. Saved values are whitelisted server-side rather than trusted: media
links must be `https://` or root-relative (so no `javascript:` or protocol-relative
URLs), text is length-capped, numbers are clamped, the frame list is capped at 60, and
unknown keys are dropped.
