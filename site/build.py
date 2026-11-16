#!/usr/bin/env python3
"""Builds mirrorgo.app into site/public: static HTML (no framework, no JS needed to read it),
structured data for search engines and AI answer engines, sitemap, robots.txt and llms.txt.

    python3 site/build.py            # → site/public
    python3 site/build.py --serve    # build, then serve on http://localhost:8000

Python 3.9+, standard library only. Text lives in content.py.
"""

import datetime
import html
import json
import shutil
import sys
from pathlib import Path

import content as C

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "public"
TODAY = datetime.date.today().isoformat()
SHOT_W, SHOT_H = 640, 1392  # src/img/screens/*.webp


def esc(text):
    return html.escape(text, quote=True)


def url(path):
    return C.SITE_URL + path


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

NAV = [("/#features", "Features"), ("/#tvs", "TVs"), ("/#how", "How it works"), ("/help/", "Help")]


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
    feats = "".join(f'<li><a href="/#{f["id"]}">{esc(f["name"])}</a></li>' for f in C.FEATURES[:6])
    year = datetime.date.today().year
    return f"""<footer class="footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="/"><img src="/img/icon.webp" alt="" width="34" height="34" loading="lazy">{C.APP_NAME}</a>
        <p style="margin-top:14px;max-width:26em">{esc(C.TAGLINE)}. Samsung, LG, Google TV, Chromecast, Fire TV, Apple TV and any web browser.</p>
      </div>
      <div><h4>Mirror to</h4><ul>{tvs}</ul></div>
      <div><h4>Cast</h4><ul>{feats}</ul></div>
      <div><h4>Support</h4><ul>
        <li><a href="/help/">Help &amp; FAQ</a></li>
        <li><a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a></li>
        <li><a href="https://smrr.tv">smrr.tv</a> (TV browser)</li>
        <li><a href="/privacy/">Privacy</a></li>
      </ul></div>
    </div>
    <div class="legal">
      <span>© {year} {C.APP_NAME}</span>
      <span>Samsung, LG, Google TV, Chromecast, Fire TV, Apple TV and AirPlay are trademarks of their owners. MirrorGo isn't affiliated with them.</span>
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
        (f'<a class="chip" href="/{t["page"]}/">' if t["page"] else '<span class="chip">')
        + f'<i style="background:{t["color"]}"></i>{esc(t["name"])}'
        + ("</a>" if t["page"] else "</span>")
        for t in C.TVS
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
    <p class="table-foot">Samsung smart TVs from 2016 · LG webOS TVs · Google TV, Android TV and Chromecast · Fire TV Stick, Cube and Fire TV smart TVs · Apple TV and AirPlay TVs · any browser through smrr.tv</p>
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
        f'<a class="card" href="/{o["page"]}/"><b>{esc(o["name"])}</b><span>Mirror your iPhone to {esc(o["name"])}</span></a>'
        for o in C.TVS if o["page"] and o["id"] != t["id"]
    )
    shot = "browser_code" if t["id"] == "browser" else "mirroring"
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
    {p("MirrorGo is built so that what you show on your TV stays between your iPhone and your TV. This policy explains what the app and our website smrr.tv handle, and why.")}
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
    {p(f'If this policy changes, we will update this page and its date. Questions: <a href="mailto:{C.SUPPORT_EMAIL}">{C.SUPPORT_EMAIL}</a>.')}
  </div>
</section>
"""
    return page("/privacy/", "Privacy Policy | MirrorGo",
                "How MirrorGo handles your data: no account, no tracking, your screen and photos go straight from "
                "your iPhone to your TV.", body, [breadcrumbs_schema([("MirrorGo", "/"), ("Privacy", "/privacy/")])])


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

## Guides

- [Home]({url('/')}): features, supported TVs, compatibility, FAQ
- [Help & FAQ]({url('/help/')}): connecting, screen mirroring, casting, permissions, troubleshooting
{tv_lines}
- [Privacy policy]({url('/privacy/')})
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
        "name": C.APP_NAME, "short_name": C.APP_NAME, "start_url": "/", "display": "browser",
        "background_color": "#0e0e12", "theme_color": "#0e0e12",
        "icons": [{"src": "/img/icon-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": "/img/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"}],
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

def write(rel, text):
    path = OUT / rel
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
    write("help/index.html", build_help())
    write("privacy/index.html", build_privacy())
    paths += ["/help/", "/privacy/"]
    write("404.html", build_404())
    write("sitemap.xml", sitemap(paths))
    write("robots.txt", robots_txt())
    write("llms.txt", llms_txt())
    write("site.webmanifest", manifest())
    write("_headers", HEADERS)
    print(f"Built {len(paths)} pages into {OUT}")

    if "--serve" in sys.argv:
        import functools
        import http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(OUT))
        print("Serving on http://localhost:8000")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()


if __name__ == "__main__":
    main()
