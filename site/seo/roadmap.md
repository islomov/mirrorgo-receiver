# SEO roadmap: alltvkit.app (2026-11-22, MIRR-189)

From a `seo-roast` pass over the live site and a local build (`.claude/skills/seo-roast`). Ordered by what it
costs in App Store taps, not by category.

The base was already sound: every page is plain HTML, robots.txt allows every search and AI crawler, the
sitemaps list every page with its alternates, unknown URLs return 404, every page has a canonical, all 15
languages are fully translated with hreflang on every page, there's JSON-LD everywhere, and no image is
missing its alt text.

| # | Tier | Issue | What it costs | Fix | Who | Status |
|---|---|---|---|---|---|---|
| 1 | FATAL | `http://alltvkit.app/…` and `http://mirrorgo.app/…` answered 200: a second copy of every page, and www → apex kept `http` | Google may pick or split signals across the http copy | `worker.js`: http and www → `https://<domain>` in one 301 | agent | this PR |
| 2 | DECISION | 1,129 pages (about 75 per language × 15) went live at once on 2026-11-16, on a domain renamed 2026-11-21. 55 per language are blog templates (7 topics × up to 9 TVs) that share most of their text | If Google judges them scaled content, it can hold back the whole site, including the TV guides that earn taps | Measure first (below). If articles sit in "Crawled – currently not indexed" or "Duplicate" for weeks, noindex the blog in the other 14 languages, or merge each topic's TV posts into one page | owner | needs Search Console |
| 3 | REVENUE | 50 English blog titles were 61–86 characters, so " \| All TV Kit" pushed the TV's name out of the visible title | Lower click rate on the posts most likely to rank | The brand suffix is dropped when the title would pass 60 characters (all languages) | agent | this PR |
| 4 | REVENUE | Blog descriptions were cut at 157 characters mid-sentence; for web images and live TV the cut fell before the TV's name, so 16 English pages shared 3 descriptions | Google rewrites or ignores duplicate snippets | `snippet()`: drop brackets, then cut at a sentence end, then mid-sentence | agent | this PR |
| 5 | REVENUE | The 8 TV-maker pages (Sony, TCL, VIZIO…) were only linked from the home page, the guides index and the footer | "mirror iPhone to a Sony TV" queries are high intent; few internal links → crawled less, ranked lower | Each system guide lists the makers whose TVs run it ("TV brands with Google TV") | agent | this PR |
| 6 | REVENUE | The maker pages are thin: 208–346 words (Xiaomi, Panasonic ~210) | Hard to rank against pages that answer model-specific questions | Per maker: how to tell which system a TV runs, the model lines, 3–4 FAQ entries (`content.BRANDS`), then translate | agent + owner (facts) | next |
| 7 | COMPOUNDING | mirrorgo.app serves the whole site (canonical → alltvkit.app) instead of redirecting | Canonicals are hints; a 301 transfers the old domain's links for sure | `domain-migration` skill: 301 mirrorgo.app/* → alltvkit.app/*, verify with its script. Check first what links to mirrorgo.app (App Store privacy URL, TV app listings) | owner decides | open |
| 8 | COMPOUNDING | No comparison pages | People choosing between casting apps search "X vs Y" / "X alternative" | `vs-and-alternatives` skill, once the owner names the 3–5 apps people pick instead | owner names rivals | open |
| 9 | COMPOUNDING | Links from our own listings | Free, relevant links | App Store, Fire TV, Google TV, Roku, LG and Samsung listings link to `https://alltvkit.app/` | owner | check |

## Measure first

- Search Console and Bing Webmaster Tools: `https://alltvkit.app/sitemap.xml` submitted (README, "Search and AI
  answer engines"). Pages › "Why pages aren't indexed", weekly, per language folder.
- The `seo-autopilot` skill can run this on a schedule once there's a Search Console export or access.

## Fluff (only after the rows above)

- German web-video descriptions: the sentence cut still loses the TV's name on 9 pages (one duplicate).
- ~~Home, guides index, help and TV guide descriptions are 163–188 characters; Google shows ~155.~~ All ≤160 in
  every language (2026-11-25, SEO Site Checkup pass: 87/100).
