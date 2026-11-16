# mirrorgo.app — the MirrorGo landing page

Static site, no framework: `build.py` (Python 3.9+, standard library only) writes `public/` from
`content.py` (all the text) and `src/` (CSS, JS, fonts, images). `public/` is generated, not committed.

```bash
python3 site/build.py            # → site/public
python3 site/build.py --serve    # build, then http://localhost:8000
```

| Path | What |
|------|------|
| `/` | Hero, features with app screenshots, how it works, compatibility table, privacy, FAQ |
| `/mirror-iphone-to-samsung-tv/`, `-lg-tv/`, `-chromecast/`, `-fire-tv/`, `-browser/` | One guide per kind of TV (the searches people actually make) |
| `/help/` | The app's whole FAQ (same text as the app's Help screen) |
| `/privacy/` | Privacy policy (App Store "Privacy Policy URL") |
| `robots.txt`, `sitemap.xml`, `llms.txt` | For search engines and AI answer engines |

## Search and AI answer engines (SEO / GEO)

- Every page is plain HTML: readable with no JavaScript (the scroll animations only hide content once
  `site.js` has run).
- Structured data (JSON-LD): `MobileApplication` + `WebSite` + `FAQPage` on `/`, `HowTo` + `FAQPage` +
  `BreadcrumbList` on each TV guide, `FAQPage` on `/help/`.
- Answer-first copy: each TV guide opens with a one-paragraph answer and the numbered steps, and states
  facts plainly (which TVs, what works, what doesn't), which is what AI answers quote.
- `llms.txt` sums up the app, the compatibility table and the pages for AI crawlers.
- `robots.txt` allows every crawler. **In Cloudflare, keep "Block AI bots", "AI Labyrinth" and
  "Managed robots.txt" off for mirrorgo.app** (Security › Bots), or AI answer engines can't read the site.
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

## Hosting

Cloudflare, in the same account as smrr.tv: `wrangler.jsonc` deploys `public/` as its own Worker with
static assets (`mirrorgo-site`, free, no Worker script). `.github/workflows/deploy-site.yml` builds and
deploys on every push to `main` that touches `site/` (the same `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` secrets as smrr.tv).

Domain, once bought:

1. Register `mirrorgo.app` (Cloudflare Registrar sells `.app` at cost) or add it to Cloudflare as a zone.
2. Uncomment the `routes` line in `wrangler.jsonc` (custom domain `mirrorgo.app`) and push.
3. Add `www.mirrorgo.app` → `https://mirrorgo.app` as a Redirect Rule (Rules › Redirect Rules).
4. Submit `https://mirrorgo.app/sitemap.xml` in Google Search Console and Bing Webmaster Tools (Bing
   also feeds ChatGPT search).

If the domain changes, change `SITE_URL` in `content.py` (canonical URLs, sitemap, structured data).
