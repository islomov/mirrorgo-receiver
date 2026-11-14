# smrr.tv Worker

Serves the MirrorGo web receiver at https://smrr.tv: the static page in `../web`, and later the
WebRTC signaling endpoint (`/ws`, one Durable Object per room) and `/api/*`.

The Cast receiver (`../index.html`) is separate: GitHub Pages serves it at
https://islomov.github.io/mirrorgo-receiver/ and the Cast console (App ID `9B4F2DCA`) points there.
Don't move it.

```bash
cd worker
npm install          # also generates worker-configuration.d.ts (binding types)
npm run dev          # http://localhost:8787
npm run deploy       # needs `npx wrangler login` or CLOUDFLARE_API_TOKEN
```

Pushes to `main` that touch `web/` or `worker/` deploy through
`.github/workflows/deploy-worker.yml` (repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

`GET /healthz` returns `ok`. `www.smrr.tv` redirects to `smrr.tv`.
