#!/usr/bin/env python3
"""Builds mirrorgo.app into site/public: static HTML (no framework, no JS needed to read it),
structured data for search engines and AI answer engines, sitemap, robots.txt and llms.txt.

    python3 site/build.py            # → web/landing-page (served at smrr.tv/landing-page)
    python3 site/build.py --serve    # build, then serve web/ on http://localhost:8000/landing-page/

Python 3.9+, standard library only. Text lives in content.py.
"""

import datetime
import html
import json
import re
import shutil
import sys
from pathlib import Path

import blog as B
import content as C

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
# Under smrr.tv the pages go into the smrr.tv Worker's static files (../web/landing-page, gitignored);
# on a domain of their own, into site/public.
WEB = ROOT.parent / "web"
OUT = WEB / C.BASE_PATH.strip("/") if C.BASE_PATH else ROOT / "public"
TODAY = datetime.date.today().isoformat()
SHOT_W, SHOT_H = 640, 1392  # src/img/screens/*.webp


def esc(text):
    return html.escape(text, quote=True)


def url(path):
    return C.SITE_URL + C.BASE_PATH + path


def with_base(markup):
    """Root-relative links and sources ("/help/", "/img/…") under BASE_PATH."""
    if not C.BASE_PATH:
        return markup
    return re.sub(r'((?:href|src)=")/(?!/)', lambda m: m.group(1) + C.BASE_PATH + "/", markup)


def app_store_url():
    return f"https://apps.apple.com/app/id{C.APP_STORE_ID}" if C.APP_STORE_ID else None


def tv(tv_id):
    return next(t for t in C.TVS if t["id"] == tv_id)


def feature(feature_id):
    return next(f for f in C.FEATURES if f["id"] == feature_id)


def all_faq():
    return [item for _, items in C.FAQ_SECTIONS for item in items]


def faq_item(faq_id):
    return next(item for item in all_faq() if item["id"] == faq_id)


# MARK: Pieces

DOWNLOAD_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
                'stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>')

INLINE_ICONS = {
    "mirroring": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6.5" width="13" height="10" rx="2.6" '
                 'fill="none" stroke="#fff" stroke-width="2"/><rect x="8.5" y="3" width="13" height="10" rx="2.6" fill="#fff"/></svg>',
    "browser": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#fff"/>'
               '<path d="M3.5 12h17M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" '
               'fill="none" stroke="#755cff" stroke-width="1.6"/></svg>',
}


def icon(feat):
    c1, c2 = feat["colors"]
    glyph = INLINE_ICONS.get(feat["icon"]) or f'<img src="/img/icons/{feat["icon"]}.svg" alt="" width="28" height="28">'
    return f'<span class="icon" style="--c1:{c1};--c2:{c2}">{glyph}</span>'


def download_button(extra_class=""):
    link = app_store_url()
    cls = f"btn {extra_class}".strip()
    if link:
        return f'<a class="{cls}" href="{link}" rel="noopener">{DOWNLOAD_SVG}Download on the App Store</a>'
    return f'<span class="{cls} disabled" aria-disabled="true">{DOWNLOAD_SVG}Coming soon to the App Store</span>'


def phone(shot, alt, cls="", eager=False):
    loading = 'fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    return (f'<div class="{" ".join(["phone", cls]).strip()}"><img src="/img/screens/{shot}.webp" '
            f'width="{SHOT_W}" height="{SHOT_H}" alt="{esc(alt)}" {loading}></div>')


def answer_html(item):
    parts = []
    if item.get("a"):
        parts.append(f"<p>{esc(item['a'])}</p>")
    if item.get("ol"):
        parts.append("<ol>" + "".join(f"<li>{esc(x)}</li>" for x in item["ol"]) + "</ol>")
    if item.get("ul"):
        parts.append("<ul>" + "".join(f"<li>{esc(x)}</li>" for x in item["ul"]) + "</ul>")
    if item.get("note"):
        parts.append(f'<p class="tip">{esc(item["note"])}</p>')
    return "".join(parts)


def answer_text(item):
    """The answer as plain text, for FAQPage structured data."""
    lines = [item.get("a", "")]
    lines += [f"{i}. {x}" for i, x in enumerate(item.get("ol", []), 1)]
    lines += [f"• {x}" for x in item.get("ul", [])]
    lines.append(item.get("note", ""))
    return " ".join(x for x in lines if x)


def faq_details(item, open_first=False):
    return (f'<details id="faq-{item["id"]}"{" open" if open_first else ""}>'
            f'<summary><h3>{esc(item["q"])}</h3></summary>'
            f'<div class="answer">{answer_html(item)}</div></details>')


def faq_schema(pairs):
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs
        ],
    }


def breadcrumbs_schema(items):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": name, "item": url(path)}
            for i, (name, path) in enumerate(items, 1)
        ],
    }


def app_schema():
    data = {
        "@context": "https://schema.org",
        "@type": "MobileApplication",
        "@id": url("/#app"),
        "name": C.APP_NAME,
        "alternateName": "MirrorGo: Screen Mirroring & Cast to TV",
        "description": C.ONE_LINER,
        "url": url("/"),
        "operatingSystem": f"iOS {C.MIN_IOS} or later",
        "applicationCategory": "UtilitiesApplication",
        "image": url("/img/icon-512.png"),
        "screenshot": [url(f"/img/screens/{s}.webp") for s in ("home", "mirroring", "detail_media", "iptv", "youtube")],
        "featureList": [f"{f['name']}: {f['short']}" for f in C.FEATURES],
        "availableOnDevice": "iPhone",
    }
    if app_store_url():
        data["downloadUrl"] = app_store_url()
        data["installUrl"] = app_store_url()
    return data


def website_schema():
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": url("/#website"),
        "name": C.APP_NAME,
        "url": url("/"),
        "inLanguage": "en",
        "about": {"@id": url("/#app")},
    }


# MARK: Layout

NAV = [("/#features", "Features"), ("/#tvs", "TVs"), ("/blog/", "Guides"), ("/help/", "Help")]


def header():
    links = "".join(f'<a href="{href}">{label}</a>' for href, label in NAV)
    return f"""<header class="header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="{C.APP_NAME} home"><img src="/img/icon.webp" alt="" width="34" height="34">{C.APP_NAME}</a>
    <nav class="nav" id="nav" aria-label="Main">{links}</nav>
    <button class="menu-btn" aria-label="Menu" aria-controls="nav" aria-expanded="false">☰</button>
    {download_button("small")}
  </div>
</header>"""


def footer():
    tvs = "".join(f'<li><a href="/{t["page"]}/">{esc(t["name"])}</a></li>' for t in C.TVS if t["page"])
    brands = "".join(f'<li><a href="/{b["slug"]}/">{esc(b["name"])} TV</a></li>' for b in C.BRANDS)
    year = datetime.date.today().year
    return f"""<footer class="footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="/"><img src="/img/icon.webp" alt="" width="34" height="34" loading="lazy">{C.APP_NAME}</a>
        <p style="margin-top:14px;max-width:26em">{esc(C.TAGLINE)}. Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV and any web browser.</p>
      </div>
      <div><h4>Mirror to</h4><ul>{tvs}</ul></div>
      <div><h4>TV brands</h4><ul>{brands}</ul></div>
      <div><h4>Support</h4><ul>
        <li><a href="/blog/">Guides</a></li>
        <li><a href="/help/">Help &amp; FAQ</a></li>
        <li><a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a></li>
        <li><a href="https://smrr.tv">smrr.tv</a> (TV browser)</li>
        <li><a href="/privacy/">Privacy</a></li>
        <li><a href="/terms/">Terms of use</a></li>
        <li><a href="/firetv/privacy/">Fire TV app: privacy</a> · <a href="/firetv/terms/">terms</a></li>
      </ul></div>
    </div>
    <div class="legal">
      <span>© {year} {C.APP_NAME} · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms of use</a></span>
      <span>Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV, AirPlay and the TV brands named are trademarks of their owners. MirrorGo isn't affiliated with them.</span>
    </div>
  </div>
</footer>"""


def page(path, title, description, body, schemas=(), og_image="/img/og.png", noindex=False):
    canonical = url(path)
    store = (f'<meta name="apple-itunes-app" content="app-id={C.APP_STORE_ID}">' if C.APP_STORE_ID else "")
    ld = "\n".join(
        f'<script type="application/ld+json">{json.dumps(s, ensure_ascii=False, separators=(",", ":"))}</script>'
        for s in schemas
    )
    robots = '<meta name="robots" content="noindex">' if noindex else '<meta name="robots" content="index, follow, max-image-preview:large">'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{canonical}">
<link rel="alternate" hreflang="en" href="{canonical}">
<link rel="alternate" hreflang="x-default" href="{canonical}">
{robots}
<meta name="theme-color" content="#0e0e12">
<meta name="color-scheme" content="dark">
{store}
<meta property="og:type" content="website">
<meta property="og:site_name" content="{C.APP_NAME}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{url(og_image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/favicon-64.png" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/Sora-Bold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="/style.css">
{ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
{header()}
<main id="main">
{body}
</main>
{footer()}
<script src="/site.js" defer></script>
</body>
</html>
"""


# MARK: Home

def compatibility_table():
    head = "".join(f'<th scope="col">{esc(t.get("short", t["name"]))}</th>' for t in C.TVS)
    rows = []
    for name, cells in C.COMPATIBILITY:
        tds = []
        for t in C.TVS:
            status, detail = cells[t["id"]]
            mark = '<span class="yes" aria-label="Yes">✓</span>' if status == "yes" else '<span class="no" aria-label="No">—</span>'
            extra = f'<span class="note-cell">{esc(detail)}</span>' if detail else ""
            tds.append(f"<td>{mark}{extra}</td>")
        rows.append(f'<tr><td scope="row">{esc(name)}</td>{"".join(tds)}</tr>')
    return (f'<div class="table-wrap"><table><caption class="skip">What MirrorGo can show on each kind of TV</caption>'
            f'<thead><tr><th scope="col">Feature</th>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>')


def showcase_row(i, item):
    feat = feature(item["feature"])
    shots = item["shots"]
    media_cls = "feature-media single" if len(shots) == 1 else "feature-media"
    phones = "".join(phone(s, alt, "back float" if j == 1 else "") for j, (s, alt) in enumerate(shots))
    points = "".join(f"<li>{esc(p)}</li>" for p in item["points"])
    works = ""
    cells = C.COMPATIBILITY_BY_FEATURE.get(item["feature"])
    if cells:
        tvs_ok = [t.get("short", t["name"]) for t in C.TVS if cells[t["id"]][0] == "yes"]
        works = f'<p class="works-on"><b>Works on:</b> {esc(", ".join(tvs_ok))}</p>'
    foot = f'<p class="works-on">{esc(item["footnote"])}</p>' if item.get("footnote") else ""
    return f"""<div class="feature{' flip' if i % 2 else ''} reveal" id="{feat['id']}">
  <div class="{media_cls}" style="--glow:{item['glow']}">{phones}</div>
  <div class="feature-text">
    {icon(feat)}
    <h2>{esc(item['title'])}</h2>
    <p>{esc(item['text'])}</p>
    <ul class="checks">{points}</ul>
    {works}{foot}
  </div>
</div>"""


def build_home():
    chips = "".join(
        f'<a class="chip" href="/{t["page"]}/"><i style="background:{t["color"]}"></i>{esc(t["name"])}</a>'
        for t in C.TVS
    )
    brand_chips = "".join(
        f'<a class="chip brand-chip" href="/{b["slug"]}/" style="--bc:{b["color"]}">{esc(b["name"])}</a>'
        for b in C.BRANDS
    )
    tiles = "".join(
        f'<a class="tile reveal" href="#{f["id"]}" style="--c:{f["colors"][0]}">{icon(f)}<h3>{esc(f["name"])}</h3>'
        f'<p>{esc(f["short"])}</p></a>'
        if any(s["feature"] == f["id"] for s in C.SHOWCASE) else
        f'<div class="tile reveal" id="{f["id"]}" style="--c:{f["colors"][0]}">{icon(f)}<h3>{esc(f["name"])}</h3>'
        f'<p>{esc(f["short"])}</p></div>'
        for f in C.FEATURES
    )
    showcase = "".join(showcase_row(i, item) for i, item in enumerate(C.SHOWCASE))
    steps = "".join(f'<div class="step reveal"><h3>{esc(t)}</h3><p>{esc(d)}</p></div>' for t, d in C.STEPS)
    privacy = "".join(f"<li><b>{esc(t)}</b>{esc(d)}</li>" for t, d in C.PRIVACY_POINTS)
    faq_items = [faq_item(i) for i in C.HOME_FAQ]
    guide_cards = "".join(
        f'<a class="card" href="/blog/#{t["id"]}"><b><i class="dot" style="background:{t["color"]}"></i>{esc(t["name"])}</b>'
        f'<span>{len([1 for tv_id, _ in B.posts() if tv_id == t["id"]]) + 1} guides</span></a>'
        for t in C.TVS
    )
    faq = "".join(faq_details(item, open_first=(n == 0)) for n, item in enumerate(faq_items))

    body = f"""
<section class="hero">
  <div class="wrap">
    <div>
      <span class="eyebrow"><span class="dot"></span>For iPhone · No app on the TV</span>
      <h1>Your iPhone on the <span class="grad-text">big screen</span></h1>
      <p class="lead">{esc(C.ONE_LINER)}</p>
      <div class="cta">{download_button()}<a class="btn ghost" href="#tvs">Check your TV</a></div>
      <p class="fine"><span>Same Wi-Fi, no cables</span><span>Sound included</span><span>No account</span></p>
    </div>
    <div class="scene" aria-hidden="true">
      <div class="tv-wrap"><div class="tv"><span class="live-pill"><i></i>Mirroring</span><img src="/img/screens/home.webp" alt="" width="{SHOT_W}" height="{SHOT_H}" fetchpriority="high"></div><div class="tv-foot"></div></div>
      <div class="beam"><i></i><i></i><i></i><i></i><i></i></div>
      {phone("home", "MirrorGo's Home screen", "float", eager=True)}
    </div>
  </div>
</section>

<section class="brands" aria-label="Supported TVs">
  <div class="wrap">
    <p>Works with the TV you already have</p>
    <div class="chips">{chips}</div>
    <div class="chips" style="margin-top:10px">{brand_chips}</div>
  </div>
</section>

<section id="features">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">Everything in one app</span>
      <h2>Mirror it, or cast it</h2>
      <p>Show your whole screen, or send just what you're watching, in full quality, while your phone stays free.</p>
    </div>
    <div class="tiles">{tiles}</div>
  </div>
</section>

<section style="padding-top:20px">
  <div class="wrap">{showcase}</div>
</section>

<section id="how">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">How it works</span>
      <h2>On the TV in three taps</h2>
      <p>No cables, no adapters, nothing to install on the TV.</p>
    </div>
    <div class="steps">{steps}</div>
  </div>
</section>

<section id="tvs">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">Compatibility</span>
      <h2>What works on your TV</h2>
      <p>MirrorGo finds your TV on the Wi-Fi and dims anything it can't play.</p>
    </div>
    <div class="reveal">{compatibility_table()}</div>
    <p class="table-foot">Samsung smart TVs from 2016 · LG webOS TVs · Roku TVs and players · Google TV and Android TV (Sony, TCL, Hisense, Philips, Xiaomi…) · Chromecast · Fire TV Stick, Cube and Fire TV smart TVs · Apple TV and AirPlay TVs · any browser through smrr.tv</p>
  </div>
</section>

<section id="privacy">
  <div class="wrap">
    <div class="band reveal">
      <div>
        <span class="kicker">Private by design</span>
        <h2>Your phone, your TV, your Wi-Fi</h2>
        <p class="muted" style="margin-top:16px;font-size:18px">What you mirror and cast goes straight from your iPhone to your TV. MirrorGo has no account, and keeps your photos and videos off any server.</p>
        <p style="margin-top:18px"><a href="/privacy/">Read the privacy policy →</a></p>
      </div>
      <ul>{privacy}</ul>
    </div>
  </div>
</section>

<section id="guides">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">Guides</span>
      <h2>Step by step, for your TV</h2>
      <p>How to connect, mirror, and cast photos, videos, YouTube and live TV to each kind of TV.</p>
    </div>
    <div class="cards guide-grid">{guide_cards}</div>
    <p class="table-foot" style="margin-top:22px"><a href="/blog/">All guides →</a></p>
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">Questions</span>
      <h2>Frequently asked questions</h2>
    </div>
    <div class="faq">{faq}</div>
    <p class="table-foot" style="margin-top:22px"><a href="/help/">All help topics →</a></p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="final reveal">
      <img class="app-icon" src="/img/icon.webp" alt="{C.APP_NAME} app icon" width="92" height="92" loading="lazy">
      <h2>Put your iPhone on the TV</h2>
      <p>Screen mirroring, photos, videos, YouTube, web videos and thousands of live channels. One app, any TV.</p>
      {download_button()}
    </div>
  </div>
</section>
"""
    schemas = [website_schema(), app_schema(), faq_schema([(i["q"], answer_text(i)) for i in faq_items])]
    title = "MirrorGo: Screen Mirroring & Cast to TV for iPhone"
    desc = ("Mirror your iPhone to Samsung, LG, Google TV, Chromecast, Fire TV, Apple TV or any web browser, and cast "
            "photos, videos, YouTube, web videos and 9,000+ live TV channels. No app on the TV.")
    return page("/", title, desc, body, schemas)


# MARK: TV guides

STATUS_LABEL = {"ok": "Works", "part": "Partly", "not": "Not on this TV"}


def build_guide(g):
    t = tv(g["tv"])
    steps = "".join(f"<li>{esc(s)}</li>" for s in g["steps"])
    feats = "".join(
        f'<li>{esc(name)}<span class="status {st}">{STATUS_LABEL[st]}</span>'
        + (f"<small>{esc(detail)}</small>" if detail else "") + "</li>"
        for name, st, detail in g["features"]
    )
    sections = "".join(
        f"<h2>{esc(h)}</h2>" + "".join(f"<p>{esc(p)}</p>" for p in paras) for h, paras in g["sections"]
    )
    faq = "".join(
        f'<details><summary><h3>{esc(q)}</h3></summary><div class="answer"><p>{esc(a)}</p></div></details>'
        for q, a in g["faq"]
    )
    others = "".join(
        f'<a class="card" href="/{o["page"]}/"><b>{esc(o["name"])}</b><span>{esc(guide_h1(o["id"]))}</span></a>'
        for o in C.TVS if o["page"] and o["id"] != t["id"]
    )
    shot = "browser_code" if t["id"] == "browser" else "mirroring"
    articles = post_cards(t["id"])
    body = f"""
<section class="page-hero">
  <div class="wrap split">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › {esc(t['name'])}</nav>
      <h1>{esc(g['h1'])}</h1>
      <p class="lead">{esc(g['lead'])}</p>
      <div class="answer-box">
        <h2>How to do it</h2>
        <ol>{steps}</ol>
      </div>
      <div class="cta" style="margin-top:26px">{download_button()}</div>
    </div>
    {phone(shot, f"MirrorGo ready to mirror an iPhone to {t['name']}", "float", eager=True)}
  </div>
</section>
<section style="padding-top:30px">
  <div class="wrap prose">
    <h2>What you can do on {esc(t['name'])}</h2>
    <ul class="feature-list">{feats}</ul>
    {sections}
    <h2>Questions</h2>
    <div class="faq" style="margin:0">{faq}</div>
    <h2>More guides for {esc(t['name'])}</h2>
    <div class="cards">{articles}</div>
    <h2>Other TVs</h2>
    <div class="cards">{others}</div>
  </div>
</section>
"""
    howto = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": g["h1"],
        "description": g["lead"],
        "tool": [{"@type": "HowToTool", "name": "MirrorGo for iPhone"}],
        "step": [{"@type": "HowToStep", "position": i, "text": s} for i, s in enumerate(g["steps"], 1)],
    }
    schemas = [howto, faq_schema(g["faq"]),
               breadcrumbs_schema([("MirrorGo", "/"), (t["name"], f"/{g['slug']}/")])]
    return page(f"/{g['slug']}/", g["title"], g["description"], body, schemas)


# MARK: Blog

def guide_h1(tv_id):
    return next(g["h1"] for g in C.TV_GUIDES if g["tv"] == tv_id)


def post_url(tv_id, t):
    return f"/blog/{B.slug(tv_id, t)}/"


def post_cards(tv_id, exclude=None):
    """Cards for a TV's articles (and its mirroring guide)."""
    t = tv(tv_id)
    cards = [f'<a class="card" href="/{t["page"]}/"><b>Screen mirroring</b><span>{esc(guide_h1(tv_id))}</span></a>']
    for pid, topic in B.posts():
        if pid != tv_id or topic["id"] == exclude:
            continue
        title = topic["title"].format(art=B.PLATFORMS[pid].get("title_art", B.PLATFORMS[pid]["art"]))
        cards.append(f'<a class="card" href="{post_url(pid, topic)}"><b>{esc(topic["label"])}</b><span>{esc(title)}</span></a>')
    return "".join(cards)


def build_post(tv_id, topic):
    t = tv(tv_id)
    p = B.PLATFORMS[tv_id]
    art, title_art = p["art"], p.get("title_art", p["art"])
    path = post_url(tv_id, topic)
    title = topic["title"].format(art=title_art)
    h1 = topic["h1"].format(art=art)
    lead = topic["lead"].format(art=art)
    connect_post = post_url(tv_id, B.topic("connect"))
    if topic["id"] == "connect":
        steps = p["connect"]
        specifics = p["connect_notes"]
    else:
        steps = [s.format(art=art) for s in topic["steps"]]
        specifics = [p[topic["id"]]]
    steps_html = "".join(
        f'<li><a href="{connect_post}">{esc(s)}</a></li>' if (topic["id"] != "connect" and i == 0) else f"<li>{esc(s)}</li>"
        for i, s in enumerate(steps)
    )
    specifics_html = "".join(f"<p>{esc(x)}</p>" for x in specifics)
    tips = "".join(f"<li>{esc(x)}</li>" for x in topic["tips"])
    same_topic = "".join(
        f'<a class="card" href="{post_url(o, topic)}"><b>{esc(tv(o)["name"])}</b>'
        f'<span>{esc(topic["title"].format(art=B.PLATFORMS[o].get("title_art", B.PLATFORMS[o]["art"])))}</span></a>'
        for o, tp in B.posts() if tp["id"] == topic["id"] and o != tv_id
    )
    shot, alt = topic["shot"]
    if topic["id"] == "connect" and tv_id == "browser":
        shot, alt = "browser_code", "Typing the smrr.tv code in MirrorGo"
    body = f"""
<section class="page-hero">
  <div class="wrap split">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › <a href="/blog/">Guides</a> › <a href="/blog/#{t['id']}">{esc(t['name'])}</a></nav>
      <h1>{esc(h1)}</h1>
      <p class="lead">{esc(lead)}</p>
      <div class="answer-box">
        <h2>Step by step</h2>
        <ol>{steps_html}</ol>
      </div>
      <p class="byline">Updated <time datetime="{B.PUBLISHED}">{B.PUBLISHED}</time> · MirrorGo for iPhone</p>
    </div>
    {phone(shot, alt, "float", eager=True)}
  </div>
</section>
<section style="padding-top:30px">
  <div class="wrap prose">
    <h2>On {esc(t['name'])}</h2>
    {specifics_html}
    <h2>Good to know</h2>
    <ul>{tips}</ul>
    <div class="cta" style="margin-top:30px">{download_button()}</div>
    <h2>More for {esc(t['name'])}</h2>
    <div class="cards">{post_cards(tv_id, exclude=topic["id"])}</div>
    <h2>{esc(topic['label'])} on other TVs</h2>
    <div class="cards">{same_topic}</div>
  </div>
</section>
"""
    article = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": lead,
        "datePublished": B.PUBLISHED,
        "dateModified": B.PUBLISHED,
        "mainEntityOfPage": url(path),
        "image": url(f"/img/screens/{shot}.webp"),
        "author": {"@type": "Organization", "name": C.APP_NAME, "url": url("/")},
        "publisher": {"@type": "Organization", "name": C.APP_NAME, "logo": {"@type": "ImageObject", "url": url("/img/icon-512.png")}},
        "about": {"@id": url("/#app")},
    }
    howto = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": h1,
        "description": lead,
        "tool": [{"@type": "HowToTool", "name": "MirrorGo for iPhone"}],
        "step": [{"@type": "HowToStep", "position": i, "text": s} for i, s in enumerate(steps, 1)],
    }
    crumbs = breadcrumbs_schema([("MirrorGo", "/"), ("Guides", "/blog/"), (h1, path)])
    desc = lead if len(lead) <= 160 else lead[:157].rsplit(" ", 1)[0] + "…"
    return path, page(path, f"{title} | MirrorGo", desc, body, [article, howto, crumbs])


def build_blog_index():
    groups = []
    for t in C.TVS:
        items = [f'<li><a href="/{t["page"]}/">{esc(guide_h1(t["id"]))}</a></li>']
        for pid, topic in B.posts():
            if pid == t["id"]:
                p = B.PLATFORMS[pid]
                items.append(f'<li><a href="{post_url(pid, topic)}">{esc(topic["h1"].format(art=p["art"]))}</a></li>')
        groups.append(f'<div class="blog-group" id="{t["id"]}"><h2><i class="dot" style="background:{t["color"]}"></i>{esc(t["name"])}</h2>'
                      f'<ul>{"".join(items)}</ul></div>')
    brands = "".join(f'<a class="card" href="/{b["slug"]}/"><b>{esc(b["name"])}</b><span>Mirror your iPhone to a {esc(b["name"])} TV</span></a>' for b in C.BRANDS)
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › Guides</nav>
    <h1>Guides</h1>
    <p class="lead">Step-by-step guides for every kind of TV: connecting your iPhone, mirroring the screen, and casting photos, videos, web images, YouTube, web videos and free live TV.</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap">
    <div class="blog-groups">{"".join(groups)}</div>
    <div class="prose" style="max-width:none"><h2>By TV brand</h2><div class="cards">{brands}</div></div>
  </div>
</section>
"""
    collection = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "MirrorGo guides",
        "url": url("/blog/"),
        "hasPart": [{"@type": "BlogPosting", "headline": tp["title"].format(art=B.PLATFORMS[pid].get("title_art", B.PLATFORMS[pid]["art"])),
                     "url": url(post_url(pid, tp))} for pid, tp in B.posts()],
    }
    return page("/blog/", "Guides: Mirror and Cast an iPhone to Any TV | MirrorGo",
                "Step-by-step guides to connect an iPhone to Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire "
                "TV, Apple TV or a web browser, and cast photos, videos, YouTube and live TV.", body,
                [collection, breadcrumbs_schema([("MirrorGo", "/"), ("Guides", "/blog/")])])


# MARK: TV brands

def build_brand(b):
    kinds = [tv(k) for k in b["platforms"]]
    cards = "".join(
        f'<a class="card" href="/{k["page"]}/"><b><i class="dot" style="background:{k["color"]}"></i>{esc(k["name"])}</b>'
        f'<span>{"Any model, through smrr.tv" if k["id"] == "browser" else esc(guide_h1(k["id"]))}</span></a>'
        for k in kinds
    )
    guides = "".join(
        f'<li><a href="{post_url(k["id"], B.topic(tp))}">{esc(B.topic(tp)["h1"].format(art=B.PLATFORMS[k["id"]]["art"]))}</a></li>'
        for k in kinds for tp in ("connect", "photos", "iptv")
    )
    names = ", ".join(k["name"] for k in kinds if k["id"] != "browser")
    steps = [
        f"Find out which system your {b['name']} TV runs ({names}): its logo is on the start screen and the remote.",
        "Put your iPhone on the same Wi-Fi as the TV.",
        "Open MirrorGo, tap Connect your TV and pick your TV.",
        f"Open Screen Mirroring and tap Start mirroring, then {C.START_SHARING}.",
    ]
    steps_html = "".join(f"<li>{esc(s)}</li>" for s in steps)
    path = f"/{b['slug']}/"
    body = f"""
<section class="page-hero">
  <div class="wrap split">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › {esc(b['name'])} TV</nav>
      <h1>Mirror your iPhone to a {esc(b['name'])} TV</h1>
      <p class="lead">{esc(b['about'])} {esc(b['which'])}</p>
      <div class="answer-box">
        <h2>How to do it</h2>
        <ol>{steps_html}</ol>
      </div>
      <div class="cta" style="margin-top:26px">{download_button()}</div>
    </div>
    {phone("mirroring", f"MirrorGo ready to mirror an iPhone to a {b['name']} TV", "float", eager=True)}
  </div>
</section>
<section style="padding-top:30px">
  <div class="wrap prose">
    <h2>{esc(b['name'])} TVs, by system</h2>
    <div class="cards">{cards}</div>
    <h2>Guides</h2>
    <ul>{guides}</ul>
  </div>
</section>
"""
    howto = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": f"Mirror your iPhone to a {b['name']} TV",
        "tool": [{"@type": "HowToTool", "name": "MirrorGo for iPhone"}],
        "step": [{"@type": "HowToStep", "position": i, "text": s} for i, s in enumerate(steps, 1)],
    }
    return path, page(path, f"How to Mirror an iPhone to a {b['name']} TV | MirrorGo",
                      f"Mirror your iPhone to a {b['name']} TV and cast photos, videos, YouTube and live TV with MirrorGo. "
                      f"Works with {names}.", body,
                      [howto, breadcrumbs_schema([("MirrorGo", "/"), (f"{b['name']} TV", path)])])


# MARK: Help

def build_help():
    groups = []
    pairs = []
    for title, items in C.FAQ_SECTIONS:
        groups.append(f'<div class="faq-group"><h2>{esc(title)}</h2><div class="faq">'
                      + "".join(faq_details(i) for i in items) + "</div></div>")
        pairs += [(i["q"], answer_text(i)) for i in items]
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › Help</nav>
    <h1>Help &amp; FAQ</h1>
    <p class="lead">Answers to the questions people ask most. Still stuck? Email <a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a> with your TV's model.</p>
  </div>
</section>
<section style="padding-top:20px">
  <div class="wrap" style="max-width:900px">{"".join(groups)}</div>
</section>
"""
    schemas = [faq_schema(pairs), breadcrumbs_schema([("MirrorGo", "/"), ("Help", "/help/")])]
    return page("/help/", "MirrorGo Help: Screen Mirroring & Casting FAQ",
                "How to connect your TV, mirror your iPhone screen, fix a TV that isn't found, sound, lag and "
                "black screens, and cast photos, videos, YouTube and IPTV with MirrorGo.", body, schemas)


# MARK: Privacy

def build_privacy():
    p = lambda text: f"<p>{text}</p>"
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › Privacy</nav>
    <h1>Privacy policy</h1>
    <p class="lead">Last updated {TODAY}</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap prose">
    {p("MirrorGo is built so that what you show on your TV stays between your iPhone and your TV. This policy explains what the app and our website smrr.tv handle, and why. The MirrorGo TV app for Fire TV and Android TV has <a href='/firetv/privacy/'>its own privacy policy</a>.")}
    <h2>No account, no tracking</h2>
    {p("MirrorGo has no account and no sign-up. The app contains no advertising and no third-party analytics or tracking.")}
    <h2>Your screen, photos and videos</h2>
    {p("When you mirror your screen or cast photos, videos or your camera, they go directly from your iPhone to your TV over your own Wi-Fi network. They are not uploaded to us or to anyone else, and we cannot see them.")}
    {p("Screen mirroring sends the sound your apps play. MirrorGo uses the microphone only to add sound when you cast your camera, and only while it is casting.")}
    <h2>Mirroring to a web browser (smrr.tv)</h2>
    {p("When you connect to a web browser through smrr.tv, our server helps your iPhone and the browser find each other. It sees their IP addresses, the code of the session and when it was used, and keeps them only as long as needed to run and protect the service, for example to limit attempts to guess codes. The picture and sound then go directly between your iPhone and the browser over your Wi-Fi; they do not pass through our server.")}
    <h2>Stored on your iPhone</h2>
    {p("MirrorGo keeps a few things on your iPhone so it works the next time: the TVs you connected to and the pairing keys they gave it, your settings, your favourite channels, your playlists and your recent image searches. They stay on your device and are deleted with the app.")}
    <h2>Permissions</h2>
    <ul>
      <li><b>Local Network</b>: to find your TVs and send them what you cast. Only used for devices on your own network.</li>
      <li><b>Photos</b>: to show and cast the photos and videos you pick.</li>
      <li><b>Camera</b>: to cast your camera and to scan the QR code on smrr.tv.</li>
      <li><b>Microphone</b>: sound when you cast your camera.</li>
    </ul>
    {p("You can change any of them at any time in the iPhone's Settings › MirrorGo.")}
    <h2>Content from other services</h2>
    {p("Some features show content from other services, which receive your request like any website you visit: YouTube (Google) in the YouTube screen; the websites you open in Web Videos (a private browser that keeps no history, cookies or cache); Wikimedia Commons for web images; the public iptv-org channel list and the channels' own streaming servers for live TV; and Google Cast for Chromecast and Google TV devices. Their own privacy policies apply.")}
    <h2>Purchases</h2>
    {p("Purchases are handled by Apple through the App Store. We don't receive your payment details.")}
    <h2>Support emails</h2>
    {p("If you email us, the message includes what you write and, to help us fix problems, your app version, iOS version, iPhone model and the kind of TV you use. We use it only to answer you.")}
    <h2>Children</h2>
    {p("MirrorGo doesn't knowingly collect personal information from anyone, including children.")}
    <h2>Changes and contact</h2>
    {p(f'If this policy changes, we will update this page and its date. Questions: <a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a>. See also our <a href="/terms/">Terms of use</a>.')}
  </div>
</section>
"""
    return page("/privacy/", "Privacy Policy | MirrorGo",
                "How MirrorGo handles your data: no account, no tracking, your screen and photos go straight from "
                "your iPhone to your TV.", body, [breadcrumbs_schema([("MirrorGo", "/"), ("Privacy", "/privacy/")])])


def build_terms():
    """Terms of use. The app's Settings shows the short version (SettingViewModel.content in MirrorGo)."""
    p = lambda text: f"<p>{text}</p>"
    mail = f'<a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a>'
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › Terms of use</nav>
    <h1>Terms of use</h1>
    <p class="lead">Last updated {TODAY}</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap prose">
    {p("These Terms of Use (“Terms”) govern your use of the MirrorGo app for iPhone, the website mirrorgo.app and the TV web page smrr.tv (together, the “Service”), operated by the makers of MirrorGo (“we”, “our”, “us”). By downloading, accessing or using the Service, you agree to these Terms. If you don't agree, don't use the Service.")}
    <h2>1. The Service</h2>
    {p("MirrorGo mirrors your iPhone's screen and casts photos, videos, your camera, web videos, web images, live TV channels and YouTube to TVs, streaming devices and web browsers on your own network. Which features work depends on your TV, your network and the content; they may change as TVs and services change, and we don't guarantee that every TV, model or piece of content is supported.")}
    <h2>2. Using the Service</h2>
    <ul>
      <li>Use the Service only for lawful purposes and in line with applicable laws and regulations.</li>
      <li>Don't misuse the Service, interfere with how it works, try to get unauthorized access to any part of it, or reverse engineer it except where the law allows.</li>
      <li>Only connect to and cast to TVs and devices you are allowed to use.</li>
    </ul>
    <h2>3. Your content and other people's content</h2>
    {p("You are responsible for what you mirror or cast, and for having the right to show it. MirrorGo doesn't host, upload or store your photos, videos or screen: they go from your iPhone to your TV over your network.")}
    {p("Web videos, web images, YouTube and live TV channels come from third parties that MirrorGo doesn't own or control. Live TV channels are free, publicly available streams listed by the community-run iptv-org project; we don't operate, host or endorse them, and their availability, content and legality where you live are outside our control. YouTube content is subject to YouTube's own terms. Web images come from Wikimedia Commons under their own licences, shown with each image. Respect the rights and terms of the services whose content you watch, and don't use MirrorGo to get around copy protection: protected content (for example from paid streaming apps) can't be mirrored or cast.")}
    <h2>4. Subscriptions and purchases</h2>
    {p("Some features may need a paid subscription or purchase. Payment is charged to your Apple ID by Apple. Subscriptions renew automatically unless turned off at least 24 hours before the end of the current period; you can manage or cancel them in your iPhone's Settings › your name › Subscriptions. Refunds are handled by Apple under its policies. Use Restore Purchase in MirrorGo's Settings to get a purchase back on a new device.")}
    <h2>5. Intellectual property</h2>
    {p("The Service, including its software, text, graphics and logos, belongs to us or our licensors. You may not copy, reproduce, distribute or create derivative works from it without our prior written permission. Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV, AirPlay, YouTube and other names are trademarks of their owners; MirrorGo isn't affiliated with or endorsed by them.")}
    <h2>6. Third-party services and links</h2>
    {p("The Service works with, and may link to, third-party devices, websites and services. We aren't responsible for their content, policies or practices, or for changes they make that affect the Service.")}
    <h2>7. Privacy</h2>
    {p('How we handle data is described in our <a href="/privacy/">Privacy policy</a>.')}
    <h2>8. No warranty</h2>
    {p("The Service is provided “as is” and “as available”, without warranties of any kind, express or implied, to the fullest extent the law allows. We don't promise that it will be uninterrupted, error-free, or work with every TV or network.")}
    <h2>9. Limitation of liability</h2>
    {p("To the fullest extent the law allows, we aren't liable for any indirect, incidental, special or consequential damages, or for loss of data, revenue or profits, arising from your use of, or inability to use, the Service. Nothing in these Terms limits liability that can't be limited by law.")}
    <h2>10. Ending your use</h2>
    {p("You can stop using the Service at any time by deleting the app. We may suspend or end access to the Service if you break these Terms.")}
    <h2>11. Apple's terms</h2>
    {p("The app is licensed to you under Apple's Licensed Application End User License Agreement, together with these Terms. Apple isn't responsible for the app or its support. Where these Terms and Apple's agreement differ, Apple's agreement applies to the extent required.")}
    <h2>12. Changes</h2>
    {p("We may update these Terms. When we do, we'll change the date at the top of this page. Using the Service after a change means you accept the updated Terms.")}
    <h2>13. Contact</h2>
    {p(f"Questions about these Terms: {mail}.")}
  </div>
</section>
"""
    return page("/terms/", "Terms of Use | MirrorGo",
                "The terms for using MirrorGo, the screen mirroring and casting app for iPhone, and its websites.",
                body, [breadcrumbs_schema([("MirrorGo", "/"), ("Terms of use", "/terms/")])])


# MARK: Fire TV app (islomov/mirrorgo-firetv: smrr.tv full screen in a WebView, announced as _mirrorgo._tcp)

FIRETV_APP = "MirrorGo for Fire TV"


def legal_page(path, crumb, h1, title, description, sections_html):
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">MirrorGo</a> › {esc(crumb)}</nav>
    <h1>{esc(h1)}</h1>
    <p class="lead">Last updated {TODAY}</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap prose">
{sections_html}
  </div>
</section>
"""
    return page(path, title, description, body, [breadcrumbs_schema([("MirrorGo", "/"), (crumb, path)])])


def build_firetv_privacy():
    p = lambda text: f"<p>{text}</p>"
    mail = f'<a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a>'
    html_ = f"""
    {p(f"This policy covers {FIRETV_APP}, the TV app that receives what you mirror or cast from MirrorGo on your iPhone. It runs on Amazon Fire TV and on Android TV / Google TV. For the iPhone app, see the <a href='/privacy/'>MirrorGo privacy policy</a>.")}
    <h2>In short</h2>
    <ul>
      <li>No account, no sign-up, no advertising, no analytics or tracking.</li>
      <li>The app only asks for internet access. It never uses a camera or microphone.</li>
      <li>What you mirror from your iPhone goes straight to the TV over your Wi-Fi; we don't see or store it.</li>
    </ul>
    <h2>How the app works</h2>
    {p("The app shows our web page smrr.tv full screen. The page shows a 6-digit code, and MirrorGo on your iPhone connects to it, either with that code or by finding the TV on your network. Your iPhone then sends the picture and sound straight to the TV over your Wi-Fi, or sends it a link (a live TV channel, a web video, a YouTube video) that the TV plays itself.")}
    <h2>What our server sees</h2>
    {p("To connect your iPhone and the TV, the smrr.tv server sees both devices' IP addresses, the session's code and when it was used. It keeps them only as long as needed to run and protect the service, for example to limit attempts to guess codes. The picture and sound don't pass through our server. To help the two devices reach each other on your network, they also contact a standard connection (STUN) server run by Cloudflare, which sees their IP addresses.")}
    <h2>What other devices on your network can see</h2>
    {p("While the app is open, it announces the TV on your local network so MirrorGo on your iPhone can list it: the TV's name (as set in its settings, else its model), its model, the app's version and the current 6-digit code. Any device on the same network can see this, just as anyone in the room can see the code on screen. The announcement stops when you leave the app.")}
    <h2>What the TV fetches from others</h2>
    {p("When you cast a link, the TV fetches it directly from where it lives, which sees the TV's IP address like any website you visit: live TV channels from their own streaming servers, web videos from the site they come from, and YouTube videos through YouTube's embedded player, under Google's privacy policy. If you use none of these, the TV only talks to your iPhone and smrr.tv.")}
    <h2>Stored on the TV</h2>
    {p("The page keeps the current session (its code) in the browser's session storage, and the TV's web view may cache parts of the page so it loads faster. Nothing else is stored. The app sets no cookies of its own and isn't included in device backups. Uninstalling the app removes it all.")}
    <h2>Children</h2>
    {p("The app doesn't knowingly collect personal information from anyone, including children.")}
    <h2>Amazon and Google</h2>
    {p("If you got the app from the Amazon Appstore or Google Play, the store and your device's maker handle your account, downloads and device under their own privacy policies.")}
    <h2>Changes and contact</h2>
    {p(f"If this policy changes, we'll update this page and its date. Questions: {mail}. See also the <a href='/firetv/terms/'>terms of use for {FIRETV_APP}</a>.")}
"""
    return legal_page("/firetv/privacy/", "Fire TV app privacy", f"{FIRETV_APP}: privacy policy",
                      f"Privacy Policy: {FIRETV_APP} | MirrorGo",
                      f"How {FIRETV_APP} handles data: no account, no tracking, internet access only; what you mirror "
                      "goes straight from your iPhone to the TV.", html_)


def build_firetv_terms():
    p = lambda text: f"<p>{text}</p>"
    mail = f'<a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a>'
    html_ = f"""
    {p(f"These Terms of Use (“Terms”) govern your use of {FIRETV_APP} (the “App”), the TV app for Amazon Fire TV and Android TV / Google TV that receives what you mirror or cast from MirrorGo on your iPhone, operated by the makers of MirrorGo (“we”, “our”, “us”). By installing or using the App, you agree to these Terms. If you don't agree, don't use the App. MirrorGo on the iPhone has its own <a href='/terms/'>terms of use</a>.")}
    <h2>1. The App</h2>
    {p("The App shows our web page smrr.tv full screen so MirrorGo on your iPhone can mirror its screen and cast photos, videos, web videos, live TV channels and YouTube to your TV. It needs an internet connection, and your iPhone and TV on the same network. Features depend on your TV, network and content, may change, and aren't guaranteed to work with every device.")}
    <h2>2. Using the App</h2>
    <ul>
      <li>Use the App only for lawful purposes and in line with applicable laws and regulations.</li>
      <li>Don't misuse the App or smrr.tv, interfere with how they work, try to get unauthorized access, or reverse engineer the App except where the law allows.</li>
      <li>The App announces your TV and its code on your local network (see the <a href="/firetv/privacy/">privacy policy</a>). Use it on networks where you're comfortable with that.</li>
    </ul>
    <h2>3. Content</h2>
    {p("You are responsible for what you mirror or cast to the App and for having the right to show it. Live TV channels, web videos and YouTube videos come from third parties we don't own or control; live TV channels are free, public streams listed by the community-run iptv-org project, and their availability, content and legality where you live are outside our control. YouTube content is subject to YouTube's terms. Respect the rights and terms of the services whose content you watch.")}
    <h2>4. Price</h2>
    {p("The App is free. MirrorGo on the iPhone may offer paid features under its own terms.")}
    <h2>5. Intellectual property</h2>
    {p("The App and smrr.tv, including their software, text, graphics and logos, belong to us or our licensors. You may not copy, reproduce, distribute or create derivative works from them without our prior written permission. Amazon, Fire TV, Android TV, Google TV and YouTube are trademarks of their owners; the App isn't affiliated with or endorsed by them.")}
    <h2>6. No warranty</h2>
    {p("The App is provided “as is” and “as available”, without warranties of any kind, express or implied, to the fullest extent the law allows. We don't promise that it will be uninterrupted, error-free, or work with every TV or network.")}
    <h2>7. Limitation of liability</h2>
    {p("To the fullest extent the law allows, we aren't liable for any indirect, incidental, special or consequential damages, or for loss of data, revenue or profits, arising from your use of, or inability to use, the App. Nothing in these Terms limits liability that can't be limited by law.")}
    <h2>8. App stores</h2>
    {p("If you got the App from the Amazon Appstore or Google Play, that store's terms also apply to your download and use. The store isn't responsible for the App or its support; we are.")}
    <h2>9. Ending your use and changes</h2>
    {p("You can stop using the App at any time by uninstalling it. We may update these Terms; when we do, we'll change the date at the top of this page. Using the App after a change means you accept the updated Terms.")}
    <h2>10. Contact</h2>
    {p(f"Questions about these Terms: {mail}.")}
"""
    return legal_page("/firetv/terms/", "Fire TV app terms", f"{FIRETV_APP}: terms of use",
                      f"Terms of Use: {FIRETV_APP} | MirrorGo",
                      f"The terms for using {FIRETV_APP}, the TV app that receives what you mirror and cast from "
                      "MirrorGo on your iPhone.", html_)


def build_404():
    body = """
<section class="page-hero" style="text-align:center;padding:120px 0">
  <div class="wrap">
    <h1>This page isn't on the TV</h1>
    <p class="lead">The link may be old. Try the home page or the help.</p>
    <div class="cta" style="margin-top:28px;display:flex;gap:12px;justify-content:center"><a class="btn" href="/">Home</a><a class="btn ghost" href="/help/">Help</a></div>
  </div>
</section>"""
    return page("/404", "Page not found | MirrorGo", "This page doesn't exist.", body, noindex=True)


# MARK: Files for crawlers

def llms_txt():
    tv_lines = "\n".join(f"- [{t['name']}]({url('/' + t['page'] + '/')})" for t in C.TVS if t["page"])
    brand_lines = "\n".join(f"- [{b['name']} TV]({url('/' + b['slug'] + '/')}): {b['about']}" for b in C.BRANDS)
    feats = "\n".join(f"- {f['name']}: {f['short']}" for f in C.FEATURES)
    compat = []
    for name, cells in C.COMPATIBILITY:
        bits = []
        for t in C.TVS:
            status, detail = cells[t["id"]]
            bits.append(f"{t.get('short', t['name'])}: {'yes' if status == 'yes' else 'no'}{f' ({detail})' if detail else ''}")
        compat.append(f"- {name} — " + "; ".join(bits))
    compat = "\n".join(compat)
    store = app_store_url() or "Coming soon to the App Store"
    return f"""# {C.APP_NAME}

> {C.ONE_LINER}

- Platform: iPhone, iOS {C.MIN_IOS} or later
- Download: {store}
- No app needed on the TV; phone and TV on the same Wi-Fi
- No account; mirrored and cast media goes directly from the iPhone to the TV over Wi-Fi
- Support: {C.SUPPORT_EMAIL}

## Features

{feats}

## What works on each TV

{compat}

## Pages

- [Home]({url('/')}): features, supported TVs, compatibility, FAQ
- [Help & FAQ]({url('/help/')}): connecting, screen mirroring, casting, permissions, troubleshooting
- [Guides]({url('/blog/')}): step-by-step guides per kind of TV (connect, photos & videos, web images, live TV, YouTube, web videos, camera)

## Mirroring guides by kind of TV

{tv_lines}

## By TV brand

{brand_lines}

- [Privacy policy]({url('/privacy/')})
- [Terms of use]({url('/terms/')})
- [Fire TV app privacy policy]({url('/firetv/privacy/')}), [terms of use]({url('/firetv/terms/')})
"""


def robots_txt():
    # Search engines and AI answer engines are all welcome: the site exists to be found and quoted.
    return f"""User-agent: *
Allow: /

Sitemap: {url('/sitemap.xml')}
"""


def sitemap(paths):
    entries = "".join(f"<url><loc>{url(p)}</loc><lastmod>{TODAY}</lastmod></url>" for p in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>\n'


def manifest():
    return json.dumps({
        "name": C.APP_NAME, "short_name": C.APP_NAME, "start_url": f"{C.BASE_PATH}/", "display": "browser",
        "background_color": "#0e0e12", "theme_color": "#0e0e12",
        "icons": [{"src": f"{C.BASE_PATH}/img/icon-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": f"{C.BASE_PATH}/img/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"}],
    }, indent=2)


HEADERS = """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
/img/*
  Cache-Control: public, max-age=604800
/fonts/*
  Cache-Control: public, max-age=2592000
/*.css
  Cache-Control: public, max-age=3600
/*.js
  Cache-Control: public, max-age=3600
"""


# MARK: Build

def write(rel, text, root=None):
    if rel.endswith(".html"):
        text = with_base(text)
    path = (root or OUT) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main():
    # Which TVs each showcased feature works on (for "Works on" under each section).
    by_name = {"screen-mirroring": "Screen mirroring", "photos-videos": "Photos & videos", "camera": "Camera",
               "web-videos": "Web videos", "iptv": "Live TV channels (IPTV)", "youtube": "YouTube",
               "web-images": "Web images"}
    rows = dict(C.COMPATIBILITY)
    C.COMPATIBILITY_BY_FEATURE = {fid: rows[name] for fid, name in by_name.items()}

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)

    write("index.html", build_home())
    paths = ["/"]
    for g in C.TV_GUIDES:
        write(f"{g['slug']}/index.html", build_guide(g))
        paths.append(f"/{g['slug']}/")
    for b in C.BRANDS:
        path, html_ = build_brand(b)
        write(path.strip("/") + "/index.html", html_)
        paths.append(path)
    write("blog/index.html", build_blog_index())
    paths.append("/blog/")
    for tv_id, topic in B.posts():
        path, html_ = build_post(tv_id, topic)
        write(path.strip("/") + "/index.html", html_)
        paths.append(path)
    write("help/index.html", build_help())
    write("privacy/index.html", build_privacy())
    write("terms/index.html", build_terms())
    write("firetv/privacy/index.html", build_firetv_privacy())
    write("firetv/terms/index.html", build_firetv_terms())
    paths += ["/help/", "/privacy/", "/terms/", "/firetv/privacy/", "/firetv/terms/"]
    write("sitemap.xml", sitemap(paths))
    write("site.webmanifest", manifest())
    if C.BASE_PATH:
        # robots.txt and llms.txt only count at the root: smrr.tv's robots.txt is web/robots.txt
        # (it points at this sitemap); llms.txt is written there too. 404 and _headers stay smrr.tv's.
        write("llms.txt", llms_txt(), root=WEB)
    else:
        write("404.html", build_404())
        write("robots.txt", robots_txt())
        write("llms.txt", llms_txt())
        write("_headers", HEADERS)
    print(f"Built {len(paths)} pages into {OUT}")

    if "--serve" in sys.argv:
        import functools
        import http.server
        served = WEB if C.BASE_PATH else OUT
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(served))
        print(f"Serving on http://localhost:8000{C.BASE_PATH}/")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()


if __name__ == "__main__":
    main()
