# MirrorGo landing page — https://mirrorgo.app

Static site, no framework: `build.py` (Python 3.9+, standard library only) builds `content.py` and
`blog.py` (the English text), `i18n.py` (the layout's text, and the translations in `locales/`) and `src/`
(CSS, JS, fonts, images) into `public/` (gitignored), in 15 languages. `wrangler.jsonc` deploys it to
Cloudflare as its own Worker, `mirrorgo-site`, on `mirrorgo.app` and, the same site, `alltvkit.app`
(`worker.js` only redirects `www.mirrorgo.app` and `www.alltvkit.app`, and the removed Roku casting
articles: a Roku only gets screen mirroring). `.github/workflows/deploy-site.yml` builds and deploys on every push to `main` that
touches `site/`, with the same `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets as smrr.tv.

```bash
python3 site/build.py            # → site/public
python3 site/build.py --serve    # build, then http://localhost:8000/
python3 site/build.py --check    # what's missing or broken in each translation
```

## Visitors and clicks

`site.js` sends each page view (with `document.referrer` and any `?ref=` / `?utm_source=` / `?src=`) and each
link click (the link, and where it is: header, footer, hero, a section's id…) to `POST /e`; `worker.js` writes
it to the Workers Analytics Engine dataset `mirrorgo_site` (kept 3 months). No cookies, no storage, no IP or
identifiers: only the referrer's domain, the country and the kind of device (the privacy policy says so).
Bots that don't run JavaScript aren't counted.

```bash
CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… python3 site/stats.py --days 30
```

prints where visitors come from, the pages viewed, the App Store button's clicks by page and place, every
link clicked, countries, devices, languages and a per-day count. The token needs **Account Analytics: Read**.
To tell your own links apart (a post, a profile, an ad), add `?ref=<name>` to them, e.g.
`https://mirrorgo.app/?ref=tiktok`: it shows as that source.

It was first served at `smrr.tv/landing-page/`; the smrr.tv Worker now sends those URLs to the same page
here (301).

## Languages

English is at the root; German, French, Spanish, Italian, Portuguese (Portugal), Dutch, Swedish, Danish,
Norwegian, Finnish, Polish, Japanese, Korean and Traditional Chinese are under `/<code>/` with the same
paths (`content.LANGUAGES`): the developed markets of Tier 1 and Tier 2. The privacy policy and terms are
English only.

- Every build writes **`locales/en.json`**: every English text of the site in one tree. When English
  changes, its git diff is what to translate; put the same change in each `locales/<code>.json`.
- Each `locales/<code>.json` is that tree translated (rules in `i18n.py`). Anything missing or broken
  falls back to English and `--check` lists it; CI runs `--check` and fails on a problem.
- Blog articles are templates (`blog.TOPICS`) filled with each TV's name in the forms a language needs
  (`platforms.<tv>.forms`: German has its cases, Finnish and Polish theirs…).
- Pages carry `hreflang` links to every language (and `x-default` → English), `og:locale`, and each
  language has its own sitemap (`sitemap-<code>.xml`, listed by `sitemap.xml`) with the alternates.
- Nothing redirects by language (crawlers and shared links always get the URL's language). When the
  browser prefers another of the site's languages, `site.js` offers it in a small pill; picking a
  language, or closing the pill, is remembered.
- Adding a language: a line in `content.LANGUAGES` and its `locales/<code>.json`; the CSS has font
  stacks for scripts Sora doesn't cover (`:lang(ja)`…).

| Path | What |
|------|------|
| `/` | Hero, features with app screenshots, how it works, compatibility table, privacy, FAQ |
| `/mirror-iphone-to-<tv>/` | Mirroring guide per kind of TV (`content.TV_GUIDES`): Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV, browser |
| `/mirror-iphone-to-<brand>-tv/` | Per TV maker (`content.BRANDS`: Sony, TCL, Hisense, VIZIO, Philips, Xiaomi, Toshiba, Panasonic), pointing at the systems its TVs run |
| `/blog/`, `/blog/<slug>/` | Guides (`blog.py`): per kind of TV × connect, photos & videos, web images, live TV, YouTube, web videos, camera. Each article is the topic's steps plus that TV's own notes |
| `/help/` | The app's whole FAQ (same text as the app's Help screen) |
| `/<code>/…` | All of the above in each other language |
| `/privacy/`, `/terms/`, `/firetv/…` | Privacy policy (App Store "Privacy Policy URL") and terms, English only. The terms end with the iPhone app's open-source licences from `licenses.json` (update it when the app's frameworks change) |
| `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` | For search engines and AI answer engines |

## Search and AI answer engines (SEO / GEO)

- Every page is plain HTML: readable with no JavaScript (the scroll animations only hide content once
  `site.js` has run).
- Structured data (JSON-LD), with `inLanguage`: `Organization` + `MobileApplication` + `WebSite` +
  `FAQPage` on `/`, `HowTo` + `FAQPage` + `BreadcrumbList` on each TV guide, `BlogPosting` + `HowTo` on
  each article, `FAQPage` on `/help/`.
- The home page has quotable facts: "What is MirrorGo?" (a short definition list) and "AirPlay or
  MirrorGo?" (what an iPhone does alone vs. with MirrorGo), the questions AI answers get asked.
- Answer-first copy: each TV guide opens with a one-paragraph answer and the numbered steps, and states
  facts plainly (which TVs, what works, what doesn't), which is what AI answers quote.
- `llms.txt` sums up the app, the compatibility table, the pages and the languages for AI crawlers;
  `llms-full.txt` is the help and every TV guide in one Markdown file.
- `robots.txt` allows every crawler, and names the AI ones (GPTBot, ClaudeBot, PerplexityBot…). **In Cloudflare, keep "Block AI bots", "AI Labyrinth" and
  "Managed robots.txt" off for the zone** (Security › Bots), or AI answer engines can't read the site.
- Submit `https://mirrorgo.app/sitemap.xml` in Google Search Console and Bing Webmaster Tools
  (Bing also feeds ChatGPT search).
- Sitemaps' `lastmod` is the date of the last commit to `site/`, so it only moves when the site does.

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
**Workers Routes: Edit** and **DNS: Edit** on the `mirrorgo.app` and `alltvkit.app` zones. The registration itself can move
to Cloudflare Registrar after 60 days (ICANN lock), if wanted.

`alltvkit.app` is registered at Cloudflare Registrar (2026-11-21), in the same account. It serves the same
pages as `mirrorgo.app`; their canonical URLs, the sitemap and the structured data stay on `mirrorgo.app`
(`SITE_URL` in `content.py`), so search engines index one copy. Links inside the site are relative, so a
visitor on `alltvkit.app` stays on it. `stats.py` shows the views per domain.
