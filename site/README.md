# MirrorGo landing page — https://smrr.tv/landing-page/

Static site, no framework: `build.py` (Python 3.9+, standard library only) builds `content.py` (all the
text) and `src/` (CSS, JS, fonts, images) into `../web/landing-page/`, which the smrr.tv Worker serves
with the rest of `web/`. The output is gitignored; `.github/workflows/deploy-worker.yml` builds it before
every smrr.tv deploy (pushes to `main` touching `site/`, `web/` or `worker/`).

```bash
python3 site/build.py            # → web/landing-page
python3 site/build.py --serve    # build, then http://localhost:8000/landing-page/
```

Run the build before `npm run dev` in `worker/` to see it at http://localhost:8787/landing-page/.
`web/robots.txt` (committed) points at its sitemap; `web/llms.txt` is generated.

Paths below are under `/landing-page`.

| Path | What |
|------|------|
| `/` | Hero, features with app screenshots, how it works, compatibility table, privacy, FAQ |
| `/mirror-iphone-to-samsung-tv/`, `-lg-tv/`, `-chromecast/`, `-fire-tv/`, `-browser/` | One guide per kind of TV (the searches people actually make) |
| `/help/` | The app's whole FAQ (same text as the app's Help screen) |
| `/privacy/` | Privacy policy (App Store "Privacy Policy URL") |
| `sitemap.xml` (+ `/robots.txt`, `/llms.txt` at smrr.tv's root) | For search engines and AI answer engines |

## Search and AI answer engines (SEO / GEO)

- Every page is plain HTML: readable with no JavaScript (the scroll animations only hide content once
  `site.js` has run).
- Structured data (JSON-LD): `MobileApplication` + `WebSite` + `FAQPage` on `/`, `HowTo` + `FAQPage` +
  `BreadcrumbList` on each TV guide, `FAQPage` on `/help/`.
- Answer-first copy: each TV guide opens with a one-paragraph answer and the numbered steps, and states
  facts plainly (which TVs, what works, what doesn't), which is what AI answers quote.
- `llms.txt` sums up the app, the compatibility table and the pages for AI crawlers.
- `robots.txt` allows every crawler. **In Cloudflare, keep "Block AI bots", "AI Labyrinth" and
  "Managed robots.txt" off for the zone** (Security › Bots), or AI answer engines can't read the site.
- Submit `https://smrr.tv/landing-page/sitemap.xml` in Google Search Console and Bing Webmaster Tools
  (Bing also feeds ChatGPT search).
- `hreflang` is already set (`en` + `x-default`), so translated pages can be added under `/<lang>/` later.

## Keeping it in step with the app

- Text: `content.py`. The help answers are the app's own FAQ (`Localizable.strings`, `faq.*` keys in the
  MirrorGo repo); the compatibility table follows `MediaCastCoordinator.canCast`,
  `CameraCastCoordinator.canCast` and `YouTubeCasting`.
- Screenshots: `src/img/screens/*.webp`, 640 × 1392, taken in the simulator with the app's
  `-debug_route` launch arguments (see `DebugLaunch` in the app), then `cwebp -q 82 -resize 640 0`.
- `src/img/og.png` (1200 × 630) is the link preview image.
- When the app is live, set `APP_STORE_ID` in `content.py`: the buttons then link to the App Store and
  pages get the Smart App Banner. Swap the button for Apple's official "Download on the App Store"
  badge (Apple's marketing tools) at the same time.

## Moving it to its own domain (mirrorgo.app) later

1. Register `mirrorgo.app` in the same Cloudflare account.
2. In `content.py`: `SITE_URL = "https://mirrorgo.app"`, `BASE_PATH = ""`. The build then writes
   `site/public/` with its own `robots.txt`, `llms.txt`, `404.html` and `_headers`.
3. Deploy `site/public` as its own static-assets Worker with the custom domain `mirrorgo.app`, and
   redirect `smrr.tv/landing-page/*` there (301) so links and search rankings carry over.
4. Submit the new sitemap in Google Search Console and Bing Webmaster Tools.
