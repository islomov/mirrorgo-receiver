# smrr.tv Worker

Serves the MirrorGo web receiver at https://smrr.tv: the static page in `../web` and the WebRTC
signaling between the page (viewer) and MirrorGo (sender: the broadcast extension while mirroring,
the app while the page plays a link it sent). Protocol:
[`../PROTOCOL.md`](../PROTOCOL.md).

- `src/index.ts`: routes (`/ws`, `/api/rooms/:code`, `/api/viewer` (+ `/poll`, `/send`: HTTP viewers such as Roku), `/c/:code`, `/healthz`, www → apex redirect, assets).
- `src/room.ts`: the `Room` Durable Object (one per code; WebSocket hibernation, alarms for the TTLs).
- `/landing-page/*` → `https://mirrorgo.app/*` (301): the landing page (`../site/`) moved to its own domain.
- `wrangler.jsonc`: DO binding + `new_sqlite_classes` migration, rate limits, `ICE_SERVERS` var.

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
```

Manual: serve `tools/` on localhost (`python3 -m http.server 8000`), open the page in one tab and
`http://localhost:8000/fake-sender.html?server=http://localhost:8787` in another, type the code.
Add `?debug=1` to the page for the getStats overlay.

`wrangler dev` rewrites the request URL to the route's host (`smrr.tv`); `--local-upstream` puts
the real host back, so `signalingURL` points at the dev server.

Pushes to `main` that touch `web/` or `worker/` run the tests and deploy through
`.github/workflows/deploy-worker.yml` (repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
