# smrr.tv Worker

Serves the MirrorGo web receiver at https://smrr.tv: the static page in `../web` and the WebRTC
signaling between the page (viewer) and MirrorGo (sender: the broadcast extension while mirroring,
the app while the page plays a link it sent). Protocol:
[`../PROTOCOL.md`](../PROTOCOL.md).

- `src/index.ts`: routes (`/version` (the app's latest working version, `APP_VERSION` in `wrangler.jsonc`), `/ws`, `/api/rooms/:code`, `/api/viewer` (+ `/poll`, `/send`: HTTP viewers such as Roku), `/c/:code`, `/healthz`, www → apex redirect, assets).
- `src/room.ts`: the `Room` Durable Object (one per code; WebSocket hibernation, alarms for the TTLs).
- `/landing-page/*` → `https://mirrorgo.app/*` (301): the landing page (`../site/`) moved to its own domain.
- `wrangler.jsonc`: DO binding + `new_sqlite_classes` migration, rate limits, `ICE_SERVERS` and `APP_VERSION` vars.
- Hardening (PROTOCOL.md, "Implementation notes"): per-IP rate limits (IPv6 per /64), viewer rooms only
  from smrr.tv's own pages (`Origin`), CORS on the lookup only for localhost, security headers on every answer.

## One copy of the receiver per page

Each page is its own copy of the receiver (HTML, scripts, strings, stylesheet), so a change to one
doesn't touch the others. Copied logic between them is fine; there's no shared receiver code.

| URL | Folder | What it is |
|---|---|---|
| `/` (and `/c/<code>`) | `web/` (`index.html`, `app.js`, …, `join.*`) | smrr.tv in a browser: code + QR, the page the app opens itself (`#room=`), full screen, privacy link |
| `/firetv` | `web/firetv/` | Fire TV app's WebView: "tap this TV in All TV Kit", the code as a small fallback, QR → App Store |
| `/samsung`, `/lg`, `/roku`, `/googletv` | `web/<tv>/` | that TV app's WebView: code + QR, "for <TV>" badge, this TV's name, "Get a new code" |

Each folder has `index.html`, `app.js`, `strings.js`, `signaling.js`, `player.js`, `media.js` and
`style.css`. Only fonts, the app icon (`web/img/`) and third-party libraries (`web/vendor/`) are
shared. The Worker serves `web/<tv>/` at `/<tv>` as well as `/<tv>/` (the apps load `/<tv>`), and the
page loads its files from `/<tv>/…`. A fix that every page needs (say, in `player.js`) has to be
made in each copy. To check one page end to end: `PAGE=/firetv node e2e.mjs` (below).

The Cast receiver (App ID `9B4F2DCA`) is `../web/cast/index.html`, served with the rest of the site at
https://smrr.tv/cast/ (MIRR-176); the Cast console points there. Don't move or rename `web/cast/`.
The old GitHub Pages copy (root `index.html`) is gone (MIRR-180).

```bash
cd worker
npm install          # also generates worker-configuration.d.ts (binding types)
npm test             # vitest inside workerd: scripted viewer + sender WebSockets
npm run typecheck
npm run dev          # http://localhost:8787 (signalingURL then uses ws://localhost:8787)
npx wrangler dev --ip 0.0.0.0 --port 8787 --local-upstream <mac-ip>:8787
                     # reachable from an iPhone on the same Wi-Fi (signalingURL uses <mac-ip>)
npm run deploy       # needs `npx wrangler login` or CLOUDFLARE_API_TOKEN
```

Browser end-to-end check with a fake sender (headless Chrome, see `../tools/`):

```bash
cd tools && npm install
node e2e.mjs                          # against npm run dev
SERVER=https://smrr.tv node e2e.mjs   # against production
PAGE=/samsung node e2e.mjs            # a TV app's page (each its own copy)
```

Manual: serve `tools/` on localhost (`python3 -m http.server 8000`), open the page in one tab and
`http://localhost:8000/fake-sender.html?server=http://localhost:8787` in another, type the code.
Add `?debug=1` to the page for the getStats overlay.

`wrangler dev` rewrites the request URL to the route's host (`smrr.tv`); `--local-upstream` puts
the real host back, so `signalingURL` points at the dev server.

Pushes to `main` that touch `web/` or `worker/` run the tests and deploy through
`.github/workflows/deploy-worker.yml` (repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
