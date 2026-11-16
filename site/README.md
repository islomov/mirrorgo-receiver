# MirrorGo landing page — https://mirrorgo.app

Static site, no framework: `build.py` (Python 3.9+, standard library only) builds `content.py` (all the
text) and `src/` (CSS, JS, fonts, images) into `public/` (gitignored). `wrangler.jsonc` deploys it to
Cloudflare as its own Worker, `mirrorgo-site`, on `mirrorgo.app` (`worker.js` only redirects
`www.mirrorgo.app`). `.github/workflows/deploy-site.yml` builds and deploys on every push to `main` that
touches `site/`, with the same `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets as smrr.tv.

```bash
python3 site/build.py            # → site/public
python3 site/build.py --serve    # build, then http://localhost:8000/
```

It was first served at `smrr.tv/landing-page/`; the smrr.tv Worker now sends those URLs to the same page
here (301).

| Path | What |
|------|------|
| `/` | Hero, features with app screenshots, how it works, compatibility table, privacy, FAQ |
| `/mirror-iphone-to-<tv>/` | Mirroring guide per kind of TV (`content.TV_GUIDES`): Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV, browser |
| `/mirror-iphone-to-<brand>-tv/` | Per TV maker (`content.BRANDS`: Sony, TCL, Hisense, VIZIO, Philips, Xiaomi, Toshiba, Panasonic), pointing at the systems its TVs run |
| `/blog/`, `/blog/<slug>/` | Guides (`blog.py`): per kind of TV × connect, photos & videos, web images, live TV, YouTube, web videos, camera. Each article is the topic's steps plus that TV's own notes |
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
  "Managed robots.txt" off for the zone** (Security › Bots), or AI answer engines can't read the site.
- Submit `https://mirrorgo.app/sitemap.xml` in Google Search Console and Bing Webmaster Tools
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

## Domain

`mirrorgo.app` is registered at Namecheap; its DNS is on Cloudflare (Namecheap › Domain List › Manage ›
Nameservers › Custom DNS: the two Cloudflare nameservers), in the same account as smrr.tv. The
`custom_domain` routes create the DNS records and certificates on deploy; the API token needs
**Workers Routes: Edit** and **DNS: Edit** on the `mirrorgo.app` zone. The registration itself can move
to Cloudflare Registrar after 60 days (ICANN lock), if wanted.
