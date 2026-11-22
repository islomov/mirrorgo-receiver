#!/usr/bin/env python3
"""Builds alltvkit.app (also served on mirrorgo.app) into site/public: static HTML (no framework, no JS needed to read it) in every
language of content.LANGUAGES, structured data for search engines and AI answer engines, sitemaps,
robots.txt, llms.txt and llms-full.txt.

    python3 site/build.py            # → site/public
    python3 site/build.py --serve    # build, then http://localhost:8000/
    python3 site/build.py --check    # what's missing or broken in each translation (locales/*.json)

Python 3.9+, standard library only. English text lives in content.py, blog.py and i18n.UI; the other
languages in locales/<code>.json (see i18n.py). English is at the root, the others under /<code>/, with
the same paths. The legal pages (privacy, terms) are English only.
"""

import datetime
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import blog as B_EN
import content as C_EN
import i18n

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "public"
TODAY = datetime.date.today().isoformat()
SHOT_W, SHOT_H = 640, 1392  # src/img/screens/*.webp
SITE_URL = C_EN.SITE_URL
APP_NAME = C_EN.APP_NAME
SUPPORT_EMAIL = C_EN.SUPPORT_EMAIL
# Pages that only exist in English, whatever the language of the page linking to them.
ENGLISH_ONLY = ("/privacy/", "/terms/", "/firetv/")


def last_changed():
    """The date of the last commit that touched the site (stable between builds of the same commit)."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(ROOT)], capture_output=True,
                             text=True, cwd=ROOT, timeout=10).stdout.strip()
        return out or TODAY
    except (OSError, subprocess.SubprocessError):
        return TODAY


LASTMOD = last_changed()

# MARK: Language being built

# Set by use(): the content and blog in that language, its layout texts, and its LANGUAGES entry.
C, B, UI = C_EN, B_EN, i18n.UI
LANG = C_EN.LANGUAGES[0]
LANGS = {lang[0]: lang for lang in C_EN.LANGUAGES}
PROBLEMS = {}


def use(code):
    global C, B, UI, LANG
    C, B, UI, problems = i18n.localize(code)
    LANG = LANGS[code]
    PROBLEMS[code] = problems


def prefix(code=None):
    code = code or LANG[0]
    return "" if code == "en" else f"/{code}"


def h(path):
    """A link to a page of the site, in the language being built (legal pages are English only)."""
    if path.startswith(ENGLISH_ONLY):
        return path
    return prefix() + path


def url(path, code="en"):
    return SITE_URL + prefix(code) + path


def T(key, **values):
    """A layout text in the language being built."""
    text = UI[key]
    return text.format(**values) if values else text


def esc(text):
    return html.escape(text, quote=True)


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


def forms(tv_id):
    return B.PLATFORMS[tv_id]["forms"]


# MARK: Pieces

DOWNLOAD_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
                'stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>')

GLOBE_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'
             '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6'
             '-3.7-9S9.5 5.6 12 3z"/></svg>')

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
        return f'<a class="{cls}" href="{link}" rel="noopener">{DOWNLOAD_SVG}{esc(T("download"))}</a>'
    return f'<span class="{cls} disabled" aria-disabled="true">{DOWNLOAD_SVG}{esc(T("coming_soon"))}</span>'


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
        "inLanguage": LANG[1],
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs
        ],
    }


def breadcrumbs_schema(items):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": name, "item": url(path, LANG[0])}
            for i, (name, path) in enumerate(items, 1)
        ],
    }


def howto_schema(name, description, steps):
    data = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": name,
        "inLanguage": LANG[1],
        "tool": [{"@type": "HowToTool", "name": T("howto_tool")}],
        "step": [{"@type": "HowToStep", "position": i, "text": s} for i, s in enumerate(steps, 1)],
    }
    if description:
        data["description"] = description
    return data


def organization_schema():
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": url("/#org"),
        "name": APP_NAME,
        "url": url("/"),
        "logo": url("/img/icon-512.png"),
        "email": SUPPORT_EMAIL,
        "contactPoint": {"@type": "ContactPoint", "contactType": "customer support", "email": SUPPORT_EMAIL,
                         "availableLanguage": ["English"]},
    }


def app_schema():
    data = {
        "@context": "https://schema.org",
        "@type": "MobileApplication",
        "@id": url("/#app"),
        "name": APP_NAME,
        "alternateName": "All TV Kit: Screen Mirroring & Cast to TV",
        "description": C.ONE_LINER,
        "url": url("/", LANG[0]),
        "operatingSystem": f"iOS {C.MIN_IOS} or later",
        "applicationCategory": "UtilitiesApplication",
        "image": url("/img/icon-512.png"),
        "screenshot": [url(f"/img/screens/{s}.webp") for s in ("home", "mirroring", "detail_media", "iptv", "youtube")],
        "featureList": [f"{f['name']}: {f['short']}" for f in C.FEATURES],
        "availableOnDevice": "iPhone",
        "publisher": {"@id": url("/#org")},
        "inLanguage": LANG[1],
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
        "name": APP_NAME,
        "url": url("/"),
        "inLanguage": [lang[1] for lang in C_EN.LANGUAGES],
        "publisher": {"@id": url("/#org")},
        "about": {"@id": url("/#app")},
    }


# MARK: Layout

def nav():
    return [("/#features", T("nav_features")), ("/#tvs", T("nav_tvs")), ("/blog/", T("nav_guides")),
            ("/help/", T("nav_help"))]


def language_links(path, translated):
    """Each language's version of this page (or its home, for English-only pages), current one first."""
    return [(lang, prefix(lang[0]) + (path if translated else "/")) for lang in C_EN.LANGUAGES]


def language_menu(path, translated):
    current = ' aria-current="true"'
    items = "".join(
        f'<li><a href="{href}" hreflang="{lang[1]}" lang="{lang[2]}"{current if lang[0] == LANG[0] else ""}>'
        f'{esc(lang[4])}</a></li>'
        for lang, href in language_links(path, translated)
    )
    short = LANG[0].split("-")[0].upper()
    return (f'<details class="lang-menu"><summary aria-label="{esc(T("language"))}: {esc(LANG[4])}">{GLOBE_SVG}'
            f'<span>{short}</span></summary><ul>{items}</ul></details>')


def header(path, translated):
    links = "".join(f'<a href="{h(href)}">{esc(label)}</a>' for href, label in nav())
    return f"""<header class="header">
  <div class="wrap">
    <a class="brand" href="{h('/')}" aria-label="{esc(T('home_aria'))}"><img src="/img/icon.webp" alt="" width="34" height="34">{APP_NAME}</a>
    <nav class="nav" id="nav" aria-label="Main">{links}</nav>
    {language_menu(path, translated)}
    <button class="menu-btn" aria-label="{esc(T('menu'))}" aria-controls="nav" aria-expanded="false">☰</button>
    {download_button("small")}
  </div>
</header>"""


def footer(path, translated):
    tvs = "".join(f'<li><a href="{h("/" + t["page"] + "/")}">{esc(t["name"])}</a></li>' for t in C.TVS if t["page"])
    brands = "".join(f'<li><a href="{h("/" + b["slug"] + "/")}">{esc(T("brand_tv", brand=b["name"]))}</a></li>'
                     for b in C.BRANDS)
    english = f' <span class="muted">{esc(T("english_only"))}</span>' if LANG[0] != "en" else ""
    langs = " · ".join(
        f'<a href="{href}" hreflang="{lang[1]}" lang="{lang[2]}">{esc(lang[4])}</a>'
        for lang, href in language_links(path, translated)
    )
    year = datetime.date.today().year
    return f"""<footer class="footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="{h('/')}"><img src="/img/icon.webp" alt="" width="34" height="34" loading="lazy">{APP_NAME}</a>
        <p style="margin-top:14px;max-width:26em">{esc(T("footer_blurb"))}</p>
      </div>
      <div><h4>{esc(T("footer_mirror_to"))}</h4><ul>{tvs}</ul></div>
      <div><h4>{esc(T("footer_brands"))}</h4><ul>{brands}</ul></div>
      <div><h4>{esc(T("footer_support"))}</h4><ul>
        <li><a href="{h('/blog/')}">{esc(T("guides"))}</a></li>
        <li><a href="{h('/help/')}">{esc(T("help_faq"))}</a></li>
        <li><a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a></li>
        <li><a href="https://smrr.tv">{esc(T("tv_browser"))}</a></li>
        <li><a href="/privacy/">{esc(T("privacy"))}</a>{english}</li>
        <li><a href="/terms/">{esc(T("terms"))}</a>{english}</li>
        <li><a href="/firetv/privacy/">{esc(T("firetv_app_privacy"))}</a> · <a href="/firetv/terms/">{esc(T("firetv_app_terms"))}</a></li>
      </ul></div>
    </div>
    <nav class="langs" aria-label="{esc(T("footer_languages"))}">{langs}</nav>
    <div class="legal">
      <span>© {year} {APP_NAME} · <a href="/privacy/">{esc(T("privacy"))}</a> · <a href="/terms/">{esc(T("terms"))}</a></span>
      <span>{esc(T("trademarks"))}</span>
    </div>
  </div>
</footer>"""


def snippet(text, limit=160):
    """`text` as a meta description of at most `limit` characters, cut where a reader won't notice: first
    without its asides in brackets (they come before the TV's name in some leads, and the cut lost it, so
    several articles shared one description), then at a sentence end, and only then mid-sentence."""
    if len(text) <= limit:
        return text
    text = re.sub(r"\s*[(（][^()（）]*[)）]", "", text)
    if len(text) <= limit:
        return text
    kept = ""
    for sentence in re.findall(r".+?(?:[.!?](?=\s|$)|[。！？]|$)\s*", text):
        if len(kept + sentence.rstrip()) > limit:
            break
        kept += sentence
    if len(kept) >= 60:
        return kept.rstrip()
    cut = text[:limit - 1]
    return (cut.rsplit(" ", 1)[0] if " " in cut else cut).rstrip(",;:、，") + "…"


def page(path, title, description, body, schemas=(), noindex=False, translated=True, og_image="/img/og.png"):
    """A whole page. `translated`: it exists in every language (else English only, like the legal pages)."""
    canonical = url(path, LANG[0])
    store = (f'<meta name="apple-itunes-app" content="app-id={C.APP_STORE_ID}">' if C.APP_STORE_ID else "")
    ld = "\n".join(
        f'<script type="application/ld+json">{json.dumps(s, ensure_ascii=False, separators=(",", ":"))}</script>'
        for s in schemas
    )
    robots = '<meta name="robots" content="noindex">' if noindex else '<meta name="robots" content="index, follow, max-image-preview:large">'
    if translated and not noindex:
        alternates = "\n".join(f'<link rel="alternate" hreflang="{lang[1]}" href="{url(path, lang[0])}">'
                               for lang in C_EN.LANGUAGES)
        alternates += f'\n<link rel="alternate" hreflang="x-default" href="{url(path)}">'
        og_alternates = "\n".join(f'<meta property="og:locale:alternate" content="{lang[3]}">'
                                  for lang in C_EN.LANGUAGES if lang[0] != LANG[0])
    else:
        alternates = og_alternates = ""
    return f"""<!doctype html>
<html lang="{LANG[2]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
{"" if noindex else f'<link rel="canonical" href="{canonical}">'}
{alternates}
{robots}
<meta name="theme-color" content="#0e0e12">
<meta name="color-scheme" content="dark">
{store}
<meta property="og:type" content="website">
<meta property="og:site_name" content="{APP_NAME}">
<meta property="og:locale" content="{LANG[3]}">
{og_alternates}
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
<link rel="preload" href="/fonts/Sora-Bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
{ld}
</head>
<body>
<a class="skip" href="#main">{esc(T("skip"))}</a>
{header(path, translated)}
<main id="main">
{body}
</main>
{footer(path, translated)}
<script src="/site.js" defer></script>
</body>
</html>
"""


# MARK: Home

def compatibility_table():
    head = "".join(f'<th scope="col">{esc(t.get("short", t["name"]))}</th>' for t in C.TVS)
    rows = []
    for _, name, cells in C.COMPATIBILITY:
        tds = []
        for t in C.TVS:
            status, detail = cells[t["id"]]
            mark = (f'<span class="yes" role="img" aria-label="{esc(T("yes"))}">✓</span>' if status == "yes" else
                    f'<span class="no" role="img" aria-label="{esc(T("no"))}">—</span>')
            extra = f'<span class="note-cell">{esc(detail)}</span>' if detail else ""
            tds.append(f"<td>{mark}{extra}</td>")
        rows.append(f'<tr><th scope="row">{esc(name)}</th>{"".join(tds)}</tr>')
    return (f'<div class="table-wrap"><table><caption class="skip">{esc(T("compat_caption"))}</caption>'
            f'<thead><tr><th scope="col">{esc(T("compat_feature"))}</th>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>')


def airplay_table():
    def mark(status):
        if status == "yes":
            return f'<span class="yes" role="img" aria-label="{esc(T("yes"))}">✓</span>'
        return f'<span class="no" role="img" aria-label="{esc(T("no"))}">—</span>'

    rows = "".join(f'<tr><th scope="row">{esc(name)}</th><td>{mark(iphone)}</td><td class="hl">{mark(mg)}</td></tr>'
                   for name, iphone, mg in C.AIRPLAY_COMPARE)
    return (f'<div class="table-wrap compare"><table><thead><tr><th scope="col">{esc(T("airplay_col_what"))}</th>'
            f'<th scope="col">{esc(T("airplay_col_iphone"))}</th><th scope="col" class="hl">{esc(T("airplay_col_mirrorgo"))}</th>'
            f'</tr></thead><tbody>{rows}</tbody></table></div>')


def showcase_row(i, item):
    feat = feature(item["feature"])
    shots = item["shots"]
    media_cls = "feature-media single" if len(shots) == 1 else "feature-media"
    phones = "".join(phone(s, alt, "back float" if j == 1 else "") for j, (s, alt) in enumerate(shots))
    points = "".join(f"<li>{esc(p)}</li>" for p in item["points"])
    works = ""
    cells = next((cells for fid, _, cells in C.COMPATIBILITY if fid == item["feature"]), None)
    if cells:
        tvs_ok = [t.get("short", t["name"]) for t in C.TVS if cells[t["id"]][0] == "yes"]
        works = f'<p class="works-on"><b>{esc(T("works_on"))}</b> {esc(", ".join(tvs_ok))}</p>'
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
        f'<a class="chip" href="{h("/" + t["page"] + "/")}"><i style="background:{t["color"]}"></i>{esc(t["name"])}</a>'
        for t in C.TVS
    )
    brand_chips = "".join(
        f'<a class="chip brand-chip" href="{h("/" + b["slug"] + "/")}" style="--bc:{b["color"]}">{esc(b["name"])}</a>'
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
    facts = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in C.QUICK_FACTS)
    showcase = "".join(showcase_row(i, item) for i, item in enumerate(C.SHOWCASE))
    steps = "".join(f'<div class="step reveal"><h3>{esc(t)}</h3><p>{esc(d)}</p></div>' for t, d in C.STEPS)
    privacy = "".join(f"<li><b>{esc(t)}</b>{esc(d)}</li>" for t, d in C.PRIVACY_POINTS)
    faq_items = [faq_item(i) for i in C.HOME_FAQ]
    guide_cards = "".join(
        f'<a class="card" href="{h("/blog/")}#{t["id"]}"><b><i class="dot" style="background:{t["color"]}"></i>{esc(t["name"])}</b>'
        f'<span>{esc(T("n_guides", n=len([1 for tv_id, _ in B.posts() if tv_id == t["id"]]) + 1))}</span></a>'
        for t in C.TVS
    )
    faq = "".join(faq_details(item, open_first=(n == 0)) for n, item in enumerate(faq_items))
    h1 = esc(UI["home_h1"]).format(big=f'<span class="grad-text">{esc(T("home_h1_big"))}</span>')

    body = f"""
<section class="hero">
  <div class="wrap">
    <div>
      <span class="eyebrow"><span class="dot"></span>{esc(T("eyebrow"))}</span>
      <h1>{h1}</h1>
      <p class="lead">{esc(C.ONE_LINER)}</p>
      <div class="cta">{download_button()}<a class="btn ghost" href="#tvs">{esc(T("check_tv"))}</a></div>
      <p class="fine"><span>{esc(T("fine_wifi"))}</span><span>{esc(T("fine_sound"))}</span><span>{esc(T("fine_account"))}</span></p>
    </div>
    <div class="scene" aria-hidden="true">
      <div class="tv-wrap"><div class="tv"><span class="live-pill"><i></i>{esc(T("live_pill"))}</span><img src="/img/screens/home.webp" alt="" width="{SHOT_W}" height="{SHOT_H}" fetchpriority="high"></div><div class="tv-foot"></div></div>
      <div class="beam"><i></i><i></i><i></i><i></i><i></i></div>
      {phone("home", T("hero_alt"), "float", eager=True)}
    </div>
  </div>
</section>

<section class="brands" aria-label="{esc(T("supported_tvs"))}">
  <div class="wrap">
    <p>{esc(T("works_with_tv"))}</p>
    <div class="chips">{chips}</div>
    <div class="chips" style="margin-top:10px">{brand_chips}</div>
  </div>
</section>

<section id="about" class="facts-section">
  <div class="wrap">
    <div class="facts reveal">
      <div class="facts-head">
        <span class="kicker">{esc(T("facts_kicker"))}</span>
        <h2>{esc(T("facts_h2"))}</h2>
      </div>
      <dl>{facts}</dl>
    </div>
  </div>
</section>

<section id="features">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">{esc(T("features_kicker"))}</span>
      <h2>{esc(T("features_h2"))}</h2>
      <p>{esc(T("features_p"))}</p>
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
      <span class="kicker">{esc(T("how_kicker"))}</span>
      <h2>{esc(T("how_h2"))}</h2>
      <p>{esc(T("how_p"))}</p>
    </div>
    <div class="steps">{steps}</div>
  </div>
</section>

<section id="tvs">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">{esc(T("tvs_kicker"))}</span>
      <h2>{esc(T("tvs_h2"))}</h2>
      <p>{esc(T("tvs_p"))}</p>
    </div>
    <div class="reveal">{compatibility_table()}</div>
    <p class="table-foot">{esc(T("tvs_foot"))}</p>
  </div>
</section>

<section id="airplay">
  <div class="wrap">
    <div class="split-head reveal">
      <div>
        <span class="kicker">{esc(T("airplay_kicker"))}</span>
        <h2>{esc(T("airplay_h2"))}</h2>
        <p>{esc(T("airplay_p"))}</p>
      </div>
      {airplay_table()}
    </div>
  </div>
</section>

<section id="privacy">
  <div class="wrap">
    <div class="band reveal">
      <div>
        <span class="kicker">{esc(T("privacy_kicker"))}</span>
        <h2>{esc(T("privacy_h2"))}</h2>
        <p class="muted" style="margin-top:16px;font-size:18px">{esc(T("privacy_p"))}</p>
        <p style="margin-top:18px"><a href="/privacy/">{esc(T("privacy_link"))}</a></p>
      </div>
      <ul>{privacy}</ul>
    </div>
  </div>
</section>

<section id="guides">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">{esc(T("guides_kicker"))}</span>
      <h2>{esc(T("guides_h2"))}</h2>
      <p>{esc(T("guides_p"))}</p>
    </div>
    <div class="cards guide-grid">{guide_cards}</div>
    <p class="table-foot" style="margin-top:22px"><a href="{h('/blog/')}">{esc(T("all_guides"))}</a></p>
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="kicker">{esc(T("faq_kicker"))}</span>
      <h2>{esc(T("faq_h2"))}</h2>
    </div>
    <div class="faq">{faq}</div>
    <p class="table-foot" style="margin-top:22px"><a href="{h('/help/')}">{esc(T("all_help"))}</a></p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="final reveal">
      <img class="app-icon" src="/img/icon.webp" alt="{esc(T("app_icon_alt"))}" width="92" height="92" loading="lazy">
      <h2>{esc(T("final_h2"))}</h2>
      <p>{esc(T("final_p"))}</p>
      {download_button()}
    </div>
  </div>
</section>
"""
    schemas = [organization_schema(), website_schema(), app_schema(),
               faq_schema([(i["q"], answer_text(i)) for i in faq_items])]
    return page("/", T("home_title"), T("home_description"), body, schemas)


# MARK: TV guides

def build_guide(g):
    t = tv(g["tv"])
    steps = "".join(f"<li>{esc(s)}</li>" for s in g["steps"])
    feats = "".join(
        f'<li>{esc(name)}<span class="status {st}">{esc(T("status_" + st))}</span>'
        + (f"<small>{esc(detail)}</small>" if detail else "") + "</li>"
        for name, st, detail in g["features"]
    )
    sections = "".join(
        f"<h2>{esc(hd)}</h2>" + "".join(f"<p>{esc(p)}</p>" for p in paras) for hd, paras in g["sections"]
    )
    faq = "".join(
        f'<details><summary><h3>{esc(q)}</h3></summary><div class="answer"><p>{esc(a)}</p></div></details>'
        for q, a in g["faq"]
    )
    others = "".join(
        f'<a class="card" href="{h("/" + o["page"] + "/")}"><b>{esc(o["name"])}</b><span>{esc(guide_h1(o["id"]))}</span></a>'
        for o in C.TVS if o["page"] and o["id"] != t["id"]
    )
    shot = "browser_code" if t["id"] == "browser" else "mirroring"
    articles = post_cards(t["id"])
    # The TV makers whose TVs run this system (every TV has a browser, so not on the browser guide): their
    # pages were only linked from the home page, the guides index and the footer.
    makers = [b for b in C.BRANDS if t["id"] in b["platforms"] and t["id"] != "browser"]
    makers_html = (f'<h2>{esc(T("tv_brands_with", tv=t["name"]))}</h2><div class="cards">' + "".join(
        f'<a class="card" href="{h("/" + b["slug"] + "/")}"><b>{esc(b["name"])}</b>'
        f'<span>{esc(T("brand_h1", brand=b["name"]))}</span></a>' for b in makers) + "</div>") if makers else ""
    body = f"""
<section class="page-hero">
  <div class="wrap split">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="{h('/')}">{APP_NAME}</a> › {esc(t['name'])}</nav>
      <h1>{esc(g['h1'])}</h1>
      <p class="lead">{esc(g['lead'])}</p>
      <div class="answer-box">
        <h2>{esc(T("how_to_do_it"))}</h2>
        <ol>{steps}</ol>
      </div>
      <div class="cta" style="margin-top:26px">{download_button()}</div>
    </div>
    {phone(shot, T("guide_phone_alt", tv=t['name']), "float", eager=True)}
  </div>
</section>
<section style="padding-top:30px">
  <div class="wrap prose">
    <h2>{esc(T("what_you_can_do", tv=t['name']))}</h2>
    <ul class="feature-list">{feats}</ul>
    {sections}
    <h2>{esc(T("questions"))}</h2>
    <div class="faq" style="margin:0">{faq}</div>
    <h2>{esc(T("more_guides_for", tv=t['name']))}</h2>
    <div class="cards">{articles}</div>
    {makers_html}
    <h2>{esc(T("other_tvs"))}</h2>
    <div class="cards">{others}</div>
  </div>
</section>
"""
    schemas = [howto_schema(g["h1"], g["lead"], g["steps"]), faq_schema(g["faq"]),
               breadcrumbs_schema([(APP_NAME, "/"), (t["name"], f"/{g['slug']}/")])]
    return page(f"/{g['slug']}/", g["title"], g["description"], body, schemas)


# MARK: Blog

def guide_h1(tv_id):
    return next(g["h1"] for g in C.TV_GUIDES if g["tv"] == tv_id)


def post_url(tv_id, topic):
    return f"/blog/{B.slug(tv_id, topic)}/"


def post_title(tv_id, topic):
    return topic["title"].format(**forms(tv_id))


def post_cards(tv_id, exclude=None):
    """Cards for a TV's articles (and its mirroring guide)."""
    t = tv(tv_id)
    cards = [f'<a class="card" href="{h("/" + t["page"] + "/")}"><b>{esc(T("screen_mirroring"))}</b>'
             f'<span>{esc(guide_h1(tv_id))}</span></a>']
    for pid, topic in B.posts():
        if pid != tv_id or topic["id"] == exclude:
            continue
        cards.append(f'<a class="card" href="{h(post_url(pid, topic))}"><b>{esc(topic["label"])}</b>'
                     f'<span>{esc(post_title(pid, topic))}</span></a>')
    return "".join(cards)


def build_post(tv_id, topic):
    t = tv(tv_id)
    p = B.PLATFORMS[tv_id]
    f = forms(tv_id)
    path = post_url(tv_id, topic)
    title = post_title(tv_id, topic)
    h1 = topic["h1"].format(**f)
    lead = topic["lead"].format(**f)
    connect_post = h(post_url(tv_id, B.topic("connect")))
    if topic["id"] == "connect":
        steps = p["connect"]
        specifics = p["connect_notes"]
    else:
        steps = [s.format(**f) for s in topic["steps"]]
        specifics = [p[topic["id"]]]
    steps_html = "".join(
        f'<li><a href="{connect_post}">{esc(s)}</a></li>' if (topic["id"] != "connect" and i == 0) else f"<li>{esc(s)}</li>"
        for i, s in enumerate(steps)
    )
    specifics_html = "".join(f"<p>{esc(x)}</p>" for x in specifics)
    tips = "".join(f"<li>{esc(x)}</li>" for x in topic["tips"])
    same_topic = "".join(
        f'<a class="card" href="{h(post_url(o, topic))}"><b>{esc(tv(o)["name"])}</b>'
        f'<span>{esc(post_title(o, topic))}</span></a>'
        for o, tp in B.posts() if tp["id"] == topic["id"] and o != tv_id
    )
    updated = esc(UI["updated"]).format(date=f'<time datetime="{B.PUBLISHED}">{B.PUBLISHED}</time>')
    shot, alt = topic["shot"]
    if topic["id"] == "connect" and tv_id == "browser":
        shot, alt = "browser_code", T("browser_code_alt")
    body = f"""
<section class="page-hero">
  <div class="wrap split">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="{h('/')}">{APP_NAME}</a> › <a href="{h('/blog/')}">{esc(T("guides"))}</a> › <a href="{h('/blog/')}#{t['id']}">{esc(t['name'])}</a></nav>
      <h1>{esc(h1)}</h1>
      <p class="lead">{esc(lead)}</p>
      <div class="answer-box">
        <h2>{esc(T("step_by_step"))}</h2>
        <ol>{steps_html}</ol>
      </div>
      <p class="byline">{updated} · {esc(T("howto_tool"))}</p>
    </div>
    {phone(shot, alt, "float", eager=True)}
  </div>
</section>
<section style="padding-top:30px">
  <div class="wrap prose">
    <h2>{esc(T("on_tv", tv=t['name']))}</h2>
    {specifics_html}
    <h2>{esc(T("good_to_know"))}</h2>
    <ul>{tips}</ul>
    <div class="cta" style="margin-top:30px">{download_button()}</div>
    <h2>{esc(T("more_for", tv=t['name']))}</h2>
    <div class="cards">{post_cards(tv_id, exclude=topic["id"])}</div>
    <h2>{esc(T("topic_on_other_tvs", topic=topic['label']))}</h2>
    <div class="cards">{same_topic}</div>
  </div>
</section>
"""
    article = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": lead,
        "inLanguage": LANG[1],
        "datePublished": B.PUBLISHED,
        "dateModified": max(B.PUBLISHED, LASTMOD),
        "mainEntityOfPage": url(path, LANG[0]),
        "image": url(f"/img/screens/{shot}.webp"),
        "author": {"@type": "Organization", "name": APP_NAME, "url": url("/")},
        "publisher": {"@type": "Organization", "name": APP_NAME, "logo": {"@type": "ImageObject", "url": url("/img/icon-512.png")}},
        "about": {"@id": url("/#app")},
    }
    crumbs = breadcrumbs_schema([(APP_NAME, "/"), (T("guides"), "/blog/"), (h1, path)])
    # Search results show about 60 characters of a title: past that, the brand suffix only pushes the TV's name out.
    full_title = T("page_title", title=title)
    return path, page(path, full_title if len(full_title) <= 60 else title, snippet(lead), body,
                      [article, howto_schema(h1, lead, steps), crumbs])


def build_blog_index():
    groups = []
    for t in C.TVS:
        items = [f'<li><a href="{h("/" + t["page"] + "/")}">{esc(guide_h1(t["id"]))}</a></li>']
        for pid, topic in B.posts():
            if pid == t["id"]:
                items.append(f'<li><a href="{h(post_url(pid, topic))}">{esc(topic["h1"].format(**forms(pid)))}</a></li>')
        groups.append(f'<div class="blog-group" id="{t["id"]}"><h2><i class="dot" style="background:{t["color"]}"></i>{esc(t["name"])}</h2>'
                      f'<ul>{"".join(items)}</ul></div>')
    brands = "".join(f'<a class="card" href="{h("/" + b["slug"] + "/")}"><b>{esc(b["name"])}</b>'
                     f'<span>{esc(T("brand_h1", brand=b["name"]))}</span></a>' for b in C.BRANDS)
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="{h('/')}">{APP_NAME}</a> › {esc(T("guides"))}</nav>
    <h1>{esc(T("blog_h1"))}</h1>
    <p class="lead">{esc(T("blog_lead"))}</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap">
    <div class="blog-groups">{"".join(groups)}</div>
    <div class="prose" style="max-width:none"><h2>{esc(T("by_brand"))}</h2><div class="cards">{brands}</div></div>
  </div>
</section>
"""
    collection = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": T("blog_collection"),
        "url": url("/blog/", LANG[0]),
        "inLanguage": LANG[1],
        "hasPart": [{"@type": "BlogPosting", "headline": post_title(pid, tp), "url": url(post_url(pid, tp), LANG[0])}
                    for pid, tp in B.posts()],
    }
    return page("/blog/", T("blog_title"), T("blog_description"), body,
                [collection, breadcrumbs_schema([(APP_NAME, "/"), (T("guides"), "/blog/")])])


# MARK: TV brands

def build_brand(b):
    kinds = [tv(k) for k in b["platforms"]]
    cards = "".join(
        f'<a class="card" href="{h("/" + k["page"] + "/")}"><b><i class="dot" style="background:{k["color"]}"></i>{esc(k["name"])}</b>'
        f'<span>{esc(T("brand_any_model")) if k["id"] == "browser" else esc(guide_h1(k["id"]))}</span></a>'
        for k in kinds
    )
    guides = "".join(
        f'<li><a href="{h(post_url(k["id"], B.topic(tp)))}">{esc(B.topic(tp)["h1"].format(**forms(k["id"])))}</a></li>'
        for k in kinds for tp in ("connect", "photos", "iptv")
    )
    names = ", ".join(k["name"] for k in kinds if k["id"] != "browser")
    steps = [T("brand_step_1", brand=b["name"], systems=names), T("brand_step_2"), T("brand_step_3"),
             T("brand_step_4", start=C.START_SHARING)]
    steps_html = "".join(f"<li>{esc(s)}</li>" for s in steps)
    path = f"/{b['slug']}/"
    h1 = T("brand_h1", brand=b["name"])
    body = f"""
<section class="page-hero">
  <div class="wrap split">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="{h('/')}">{APP_NAME}</a> › {esc(T("brand_tv", brand=b['name']))}</nav>
      <h1>{esc(h1)}</h1>
      <p class="lead">{esc(b['about'])} {esc(b['which'])}</p>
      <div class="answer-box">
        <h2>{esc(T("how_to_do_it"))}</h2>
        <ol>{steps_html}</ol>
      </div>
      <div class="cta" style="margin-top:26px">{download_button()}</div>
    </div>
    {phone("mirroring", T("brand_phone_alt", brand=b['name']), "float", eager=True)}
  </div>
</section>
<section style="padding-top:30px">
  <div class="wrap prose">
    <h2>{esc(T("brand_by_system", brand=b['name']))}</h2>
    <div class="cards">{cards}</div>
    <h2>{esc(T("guides"))}</h2>
    <ul>{guides}</ul>
  </div>
</section>
"""
    schemas = [howto_schema(h1, None, steps),
               breadcrumbs_schema([(APP_NAME, "/"), (T("brand_tv", brand=b["name"]), path)])]
    return path, page(path, T("brand_title", brand=b["name"]),
                      T("brand_description", brand=b["name"], systems=names), body, schemas)


# MARK: Help

def build_help():
    groups = []
    pairs = []
    for title, items in C.FAQ_SECTIONS:
        groups.append(f'<div class="faq-group"><h2>{esc(title)}</h2><div class="faq">'
                      + "".join(faq_details(i) for i in items) + "</div></div>")
        pairs += [(i["q"], answer_text(i)) for i in items]
    lead = esc(UI["help_lead"]).format(email=f'<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>')
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="{h('/')}">{APP_NAME}</a> › {esc(T("help_crumb"))}</nav>
    <h1>{esc(T("help_h1"))}</h1>
    <p class="lead">{lead}</p>
  </div>
</section>
<section style="padding-top:20px">
  <div class="wrap" style="max-width:900px">{"".join(groups)}</div>
</section>
"""
    schemas = [faq_schema(pairs), breadcrumbs_schema([(APP_NAME, "/"), (T("help_crumb"), "/help/")])]
    return page("/help/", T("help_title"), T("help_description"), body, schemas)


# MARK: Privacy

def build_privacy():
    p = lambda text: f"<p>{text}</p>"
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">All TV Kit</a> › Privacy</nav>
    <h1>Privacy policy</h1>
    <p class="lead">Last updated {TODAY}</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap prose">
    {p("All TV Kit is built so that what you show on your TV stays between your iPhone and your TV. This policy explains what the app and our websites alltvkit.app (also at mirrorgo.app) and smrr.tv handle, and why. Our TV app for Fire TV and Android TV, MirrorGo for Fire TV, has <a href='/firetv/privacy/'>its own privacy policy</a>. Nothing is installed on a Roku: how All TV Kit works with it is described below.")}
    <h2>No account, no tracking</h2>
    {p("All TV Kit has no account and no sign-up. The app contains no advertising and no third-party analytics or tracking.")}
    <h2>Your screen, photos and videos</h2>
    {p("When you mirror your screen or cast photos, videos or your camera, they go directly from your iPhone to your TV over your own Wi-Fi network. They are not uploaded to us or to anyone else, and we cannot see them.")}
    {p("Screen mirroring sends the sound your apps play. All TV Kit uses the microphone only to add sound when you cast your camera, and only while it is casting.")}
    <h2>Mirroring to a Roku</h2>
    {p("All TV Kit talks to a Roku over your own network with Roku's External Control Protocol, the way Roku's own mobile app does. To find and recognise it, All TV Kit asks the Roku for its name, model, serial number and network address; to show your screen, it asks the Roku's built-in player to play a live video stream that your iPhone serves over your Wi-Fi. The picture and sound go directly from your iPhone to the Roku: they don't pass through our servers, and we can't see them. While you mirror, All TV Kit checks what the Roku's player and screen are showing, only to know when mirroring has ended. None of this leaves your network or is sent to us, and All TV Kit installs nothing on the Roku. The Roku itself is covered by Roku's own privacy policy.")}
    <h2>Mirroring to a web browser (smrr.tv)</h2>
    {p("When you connect to a web browser through smrr.tv, our server helps your iPhone and the browser find each other. It sees their IP addresses, the code of the session and when it was used, and keeps them only as long as needed to run and protect the service, for example to limit attempts to guess codes. The picture and sound then go directly between your iPhone and the browser over your Wi-Fi; they do not pass through our server.")}
    <h2>Stored on your iPhone</h2>
    {p("All TV Kit keeps a few things on your iPhone so it works the next time: the TVs you connected to and the pairing keys they gave it, your settings, your favourite channels, your playlists and your recent image searches. They stay on your device and are deleted with the app.")}
    <h2>Permissions</h2>
    <ul>
      <li><b>Local Network</b>: to find your TVs and send them what you cast. Only used for devices on your own network.</li>
      <li><b>Photos</b>: to show and cast the photos and videos you pick.</li>
      <li><b>Camera</b>: to cast your camera and to scan the QR code on smrr.tv.</li>
      <li><b>Microphone</b>: sound when you cast your camera.</li>
    </ul>
    {p("You can change any of them at any time in the iPhone's Settings › All TV Kit.")}
    <h2>Content from other services</h2>
    {p("Some features show content from other services, which receive your request like any website you visit: YouTube (Google) in the YouTube screen; the websites you open in Web Videos (a private browser that keeps no history, cookies or cache); Wikimedia Commons for web images; the public iptv-org channel list and the channels' own streaming servers for live TV; Google Cast for Chromecast and Google TV devices; and the built-in player of Roku devices. Their own privacy policies apply.")}
    <h2>Our website alltvkit.app</h2>
    {p("To know which pages help people find All TV Kit, alltvkit.app (also at mirrorgo.app) counts its page views and the links clicked on it: for each, the page, its language and which of the two addresses it was opened on, the link and where it is on the page, the website that sent you there (its domain only, or the name in a link's <code>ref</code> or <code>utm_source</code>), your country and the kind of device (phone, tablet or computer, and its operating system). It sets no cookies, stores nothing on your device, and doesn't keep your IP address or anything else that identifies you. The counts are kept for three months, on Cloudflare, which hosts the site.")}
    <h2>Purchases</h2>
    {p("Purchases are handled by Apple through the App Store. We don't receive your payment details.")}
    <h2>Support emails</h2>
    {p("If you email us, the message includes what you write and, to help us fix problems, your app version, iOS version, iPhone model and the kind of TV you use. We use it only to answer you.")}
    <h2>Children</h2>
    {p("All TV Kit doesn't knowingly collect personal information from anyone, including children.")}
    <h2>Changes and contact</h2>
    {p(f'If this policy changes, we will update this page and its date. Questions: <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>. See also our <a href="/terms/">Terms of use</a>.')}
  </div>
</section>
"""
    return page("/privacy/", "Privacy Policy | All TV Kit",
                "How All TV Kit handles your data: no account, no tracking, your screen and photos go straight from "
                "your iPhone to your TV.", body, [breadcrumbs_schema([("All TV Kit", "/"), ("Privacy", "/privacy/")])],
                translated=False)


def build_terms():
    """Terms of use, with the open-source licences of the iPhone app at the end (licenses.json, from the
    app's frameworks; the app opens this page from Settings › Terms of Use)."""
    p = lambda text: f"<p>{text}</p>"
    licences = json.loads((ROOT / "licenses.json").read_text())
    licence_items = "".join(
        f'<details style="margin-top:10px"><summary>{esc(item["name"])} '
        f'<span class="muted" style="font-weight:400">· {esc(item["license"])}</span></summary>'
        f'<pre style="white-space:pre-wrap;margin:0;padding:0 22px 22px;font-size:13px;line-height:1.5;color:#cfcfd8">'
        f'{esc(item["text"])}</pre></details>'
        for item in licences)
    mail = f'<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">All TV Kit</a> › Terms of use</nav>
    <h1>Terms of use</h1>
    <p class="lead">Last updated {TODAY}</p>
  </div>
</section>
<section style="padding-top:10px">
  <div class="wrap prose">
    {p("These Terms of Use (“Terms”) govern your use of the All TV Kit app for iPhone, the website alltvkit.app (also at mirrorgo.app) and the TV web page smrr.tv (together, the “Service”), operated by the makers of All TV Kit (“we”, “our”, “us”). By downloading, accessing or using the Service, you agree to these Terms. If you don't agree, don't use the Service.")}
    <h2>1. The Service</h2>
    {p("All TV Kit mirrors your iPhone's screen and casts photos, videos, your camera, web videos, web images, live TV channels and YouTube to TVs, streaming devices and web browsers on your own network. Which features work depends on your TV, your network and the content; they may change as TVs and services change, and we don't guarantee that every TV, model or piece of content is supported. On Roku TVs and Roku players, All TV Kit currently offers screen mirroring only, played by the Roku's built-in player; nothing is installed on the Roku.")}
    <h2>2. Using the Service</h2>
    <ul>
      <li>Use the Service only for lawful purposes and in line with applicable laws and regulations.</li>
      <li>Don't misuse the Service, interfere with how it works, try to get unauthorized access to any part of it, or reverse engineer it except where the law allows.</li>
      <li>Only connect to and cast to TVs and devices you are allowed to use.</li>
    </ul>
    <h2>3. Your content and other people's content</h2>
    {p("You are responsible for what you mirror or cast, and for having the right to show it. All TV Kit doesn't host, upload or store your photos, videos or screen: they go from your iPhone to your TV over your network.")}
    {p("Web videos, web images, YouTube and live TV channels come from third parties that All TV Kit doesn't own or control. Live TV channels are free, publicly available streams listed by the community-run iptv-org project; we don't operate, host or endorse them, and their availability, content and legality where you live are outside our control. YouTube content is subject to YouTube's own terms. Web images come from Wikimedia Commons under their own licences, shown with each image. Respect the rights and terms of the services whose content you watch, and don't use All TV Kit to get around copy protection: protected content (for example from paid streaming apps) can't be mirrored or cast.")}
    <h2>4. Price</h2>
    {p("All TV Kit is free to download and use. If paid features are added later, they will be charged to your Apple ID by Apple under its terms, and these Terms will be updated first.")}
    <h2>5. Intellectual property</h2>
    {p("The Service, including its software, text, graphics and logos, belongs to us or our licensors. You may not copy, reproduce, distribute or create derivative works from it without our prior written permission. Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV, AirPlay, YouTube and other names are trademarks of their owners; All TV Kit isn't affiliated with or endorsed by them.")}
    <h2>6. Third-party services and links</h2>
    {p("The Service works with, and may link to, third-party devices, websites and services, such as Samsung, LG, Roku, Google Cast, Fire TV and AirPlay devices. We aren't responsible for their content, policies or practices, or for changes they make that affect the Service, for example a TV update that changes or turns off the features All TV Kit relies on (on a Roku, “Control by mobile apps”).")}
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
    <h2>14. Open-source software</h2>
    {p("The All TV Kit app includes the following software, used under their licences:")}
    {licence_items}
  </div>
</section>
"""
    return page("/terms/", "Terms of Use | All TV Kit",
                "The terms for using All TV Kit, the screen mirroring and casting app for iPhone, and its websites.",
                body, [breadcrumbs_schema([("All TV Kit", "/"), ("Terms of use", "/terms/")])], translated=False)


# MARK: Fire TV app (islomov/mirrorgo-firetv: smrr.tv full screen in a WebView, announced as _mirrorgo._tcp)

FIRETV_APP = "MirrorGo for Fire TV"


def legal_page(path, crumb, h1, title, description, sections_html):
    body = f"""
<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">All TV Kit</a> › {esc(crumb)}</nav>
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
    return page(path, title, description, body, [breadcrumbs_schema([("All TV Kit", "/"), (crumb, path)])],
                translated=False)


def build_firetv_privacy():
    p = lambda text: f"<p>{text}</p>"
    mail = f'<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
    html_ = f"""
    {p(f"This policy covers {FIRETV_APP}, the TV app that receives what you mirror or cast from All TV Kit on your iPhone. It runs on Amazon Fire TV and on Android TV / Google TV. For the iPhone app, see the <a href='/privacy/'>All TV Kit privacy policy</a>.")}
    <h2>In short</h2>
    <ul>
      <li>No account, no sign-up, no advertising, no analytics or tracking.</li>
      <li>The app only asks for internet access. It never uses a camera or microphone.</li>
      <li>What you mirror from your iPhone goes straight to the TV over your Wi-Fi; we don't see or store it.</li>
    </ul>
    <h2>How the app works</h2>
    {p("The app shows our web page smrr.tv full screen. The page shows a 6-digit code, and All TV Kit on your iPhone connects to it, either with that code or by finding the TV on your network. Your iPhone then sends the picture and sound straight to the TV over your Wi-Fi, or sends it a link (a live TV channel, a web video, a YouTube video) that the TV plays itself.")}
    <h2>What our server sees</h2>
    {p("To connect your iPhone and the TV, the smrr.tv server sees both devices' IP addresses, the session's code and when it was used. It keeps them only as long as needed to run and protect the service, for example to limit attempts to guess codes. The picture and sound don't pass through our server. To help the two devices reach each other on your network, they also contact a standard connection (STUN) server run by Cloudflare, which sees their IP addresses.")}
    <h2>What other devices on your network can see</h2>
    {p("While the app is open, it announces the TV on your local network so All TV Kit on your iPhone can list it: the TV's name (as set in its settings, else its model), its model, the app's version and the current 6-digit code. Any device on the same network can see this, just as anyone in the room can see the code on screen. The announcement stops when you leave the app.")}
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
                      f"Privacy Policy: {FIRETV_APP} | All TV Kit",
                      f"How {FIRETV_APP} handles data: no account, no tracking, internet access only; what you mirror "
                      "goes straight from your iPhone to the TV.", html_)


def build_firetv_terms():
    p = lambda text: f"<p>{text}</p>"
    mail = f'<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
    html_ = f"""
    {p(f"These Terms of Use (“Terms”) govern your use of {FIRETV_APP} (the “App”), the TV app for Amazon Fire TV and Android TV / Google TV that receives what you mirror or cast from All TV Kit on your iPhone, operated by the makers of All TV Kit (“we”, “our”, “us”). By installing or using the App, you agree to these Terms. If you don't agree, don't use the App. All TV Kit on the iPhone has its own <a href='/terms/'>terms of use</a>.")}
    <h2>1. The App</h2>
    {p("The App shows our web page smrr.tv full screen so All TV Kit on your iPhone can mirror its screen and cast photos, videos, web videos, live TV channels and YouTube to your TV. It needs an internet connection, and your iPhone and TV on the same network. Features depend on your TV, network and content, may change, and aren't guaranteed to work with every device.")}
    <h2>2. Using the App</h2>
    <ul>
      <li>Use the App only for lawful purposes and in line with applicable laws and regulations.</li>
      <li>Don't misuse the App or smrr.tv, interfere with how they work, try to get unauthorized access, or reverse engineer the App except where the law allows.</li>
      <li>The App announces your TV and its code on your local network (see the <a href="/firetv/privacy/">privacy policy</a>). Use it on networks where you're comfortable with that.</li>
    </ul>
    <h2>3. Content</h2>
    {p("You are responsible for what you mirror or cast to the App and for having the right to show it. Live TV channels, web videos and YouTube videos come from third parties we don't own or control; live TV channels are free, public streams listed by the community-run iptv-org project, and their availability, content and legality where you live are outside our control. YouTube content is subject to YouTube's terms. Respect the rights and terms of the services whose content you watch.")}
    <h2>4. Price</h2>
    {p("The App is free. All TV Kit on the iPhone may offer paid features under its own terms.")}
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
                      f"Terms of Use: {FIRETV_APP} | All TV Kit",
                      f"The terms for using {FIRETV_APP}, the TV app that receives what you mirror and cast from "
                      "All TV Kit on your iPhone.", html_)

def build_404():
    body = f"""
<section class="page-hero" style="text-align:center;padding:120px 0">
  <div class="wrap">
    <h1>{esc(T("nf_h1"))}</h1>
    <p class="lead">{esc(T("nf_lead"))}</p>
    <div class="cta" style="margin-top:28px;display:flex;gap:12px;justify-content:center"><a class="btn" href="{h('/')}">{esc(T("nf_home"))}</a><a class="btn ghost" href="{h('/help/')}">{esc(T("nf_help"))}</a></div>
  </div>
</section>"""
    return page("/404", T("nf_title"), T("nf_description"), body, noindex=True, translated=False)


# MARK: Files for crawlers and AI answer engines

def compat_lines():
    lines = []
    for _, name, cells in C.COMPATIBILITY:
        bits = []
        for t in C.TVS:
            status, detail = cells[t["id"]]
            bits.append(f"{t.get('short', t['name'])}: {'yes' if status == 'yes' else 'no'}{f' ({detail})' if detail else ''}")
        lines.append(f"- {name} — " + "; ".join(bits))
    return "\n".join(lines)


def llms_txt():
    """llms.txt (English): what All TV Kit is, what works where, and where to read more."""
    tv_lines = "\n".join(f"- [{t['name']}]({url('/' + t['page'] + '/')}): {guide_h1(t['id'])}" for t in C.TVS if t["page"])
    brand_lines = "\n".join(f"- [{b['name']} TV]({url('/' + b['slug'] + '/')}): {b['about']}" for b in C.BRANDS)
    feats = "\n".join(f"- {f['name']}: {f['short']}" for f in C.FEATURES)
    facts = "\n".join(f"- {k}: {v}" for k, v in C.QUICK_FACTS)
    airplay = "\n".join(f"- {name}: iPhone alone (AirPlay) {iphone}; with All TV Kit {mg}" for name, iphone, mg in C.AIRPLAY_COMPARE)
    langs = "\n".join(f"- {lang[4]} ({lang[1]}): {url('/', lang[0])}" for lang in C.LANGUAGES)
    store = app_store_url() or "Coming soon to the App Store"
    return f"""# {APP_NAME}

> {C.ONE_LINER}

{facts}
- Download: {store}
- Support: {SUPPORT_EMAIL}

## Features

{feats}

## What works on each TV

{compat_lines()}

## AirPlay or All TV Kit

{airplay}

## Pages

- [Home]({url('/')}): features, supported TVs, compatibility, FAQ
- [Help & FAQ]({url('/help/')}): connecting, screen mirroring, casting, permissions, troubleshooting
- [Guides]({url('/blog/')}): step-by-step guides per kind of TV (connect, photos & videos, web images, live TV, YouTube, web videos, camera)
- [Full text]({url('/llms-full.txt')}): the help and every TV guide in one Markdown file

## Mirroring guides by kind of TV

{tv_lines}

## By TV brand

{brand_lines}

## Languages

The site is in {len(C.LANGUAGES)} languages, with the same pages under each:

{langs}

## Legal

- [Privacy policy]({url('/privacy/')})
- [Terms of use]({url('/terms/')})
- [Fire TV app privacy policy]({url('/firetv/privacy/')}), [terms of use]({url('/firetv/terms/')})
"""


def md_answer(item):
    lines = []
    if item.get("a"):
        lines.append(item["a"])
    lines += [f"{i}. {x}" for i, x in enumerate(item.get("ol", []), 1)]
    lines += [f"- {x}" for x in item.get("ul", [])]
    if item.get("note"):
        lines.append(f"Note: {item['note']}")
    return "\n".join(lines)


def llms_full_txt():
    """llms-full.txt (English): the help and the TV guides in full, for AI answer engines."""
    out = [f"# {APP_NAME}: the full guide\n\n> {C.ONE_LINER}\n\nSource: {url('/')}\n"]
    out.append("## At a glance\n\n" + "\n".join(f"- {k}: {v}" for k, v in C.QUICK_FACTS))
    out.append("## What works on each TV\n\n" + compat_lines())
    out.append("## Help & FAQ\n\nSource: " + url("/help/"))
    for title, items in C.FAQ_SECTIONS:
        out.append(f"### {title}\n\n" + "\n\n".join(f"#### {i['q']}\n\n{md_answer(i)}" for i in items))
    out.append("## Mirroring guides by kind of TV")
    for g in C.TV_GUIDES:
        parts = [f"### {g['h1']}\n\nSource: {url('/' + g['slug'] + '/')}\n\n{g['lead']}",
                 "Steps:\n\n" + "\n".join(f"{i}. {s}" for i, s in enumerate(g["steps"], 1)),
                 "What works:\n\n" + "\n".join(f"- {n}: {T('status_' + st).lower()}{f' ({d})' if d else ''}"
                                               for n, st, d in g["features"])]
        parts += [f"#### {hd}\n\n" + "\n\n".join(ps) for hd, ps in g["sections"]]
        parts += [f"#### {q}\n\n{a}" for q, a in g["faq"]]
        out.append("\n\n".join(parts))
    out.append("## TV brands\n\n" + "\n\n".join(
        f"### {b['name']} TV\n\nSource: {url('/' + b['slug'] + '/')}\n\n{b['about']} {b['which']}" for b in C.BRANDS))
    return "\n\n".join(out) + "\n"


# Crawlers named so that a "block AI bots" setting further up (Cloudflare, a CDN) is easy to spot as
# overriding the site's wish: search engines and AI answer engines are all welcome.
AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
               "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot", "Applebot-Extended", "Bingbot",
               "DuckAssistBot", "Amazonbot", "meta-externalagent", "MistralAI-User", "CCBot"]


def robots_txt():
    named = "\n".join(f"User-agent: {bot}" for bot in AI_CRAWLERS)
    return f"""# All TV Kit welcomes search engines and AI answer engines.
User-agent: *
Allow: /

{named}
Allow: /

Sitemap: {url('/sitemap.xml')}
"""


def sitemap_index(codes):
    entries = "".join(f"<sitemap><loc>{url(f'/sitemap-{code}.xml')}</loc><lastmod>{LASTMOD}</lastmod></sitemap>"
                      for code in codes)
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</sitemapindex>\n')


def sitemap(code, paths, translated):
    """One language's pages, each with its versions in the other languages (hreflang)."""
    entries = []
    for p in paths:
        alts = ""
        if p in translated:
            alts = "".join(f'<xhtml:link rel="alternate" hreflang="{lang[1]}" href="{url(p, lang[0])}"/>'
                           for lang in C_EN.LANGUAGES)
            alts += f'<xhtml:link rel="alternate" hreflang="x-default" href="{url(p)}"/>'
        entries.append(f"<url><loc>{url(p, code)}</loc><lastmod>{LASTMOD}</lastmod>{alts}</url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            f'xmlns:xhtml="http://www.w3.org/1999/xhtml">{"".join(entries)}</urlset>\n')


def manifest():
    return json.dumps({
        "name": APP_NAME, "short_name": APP_NAME, "start_url": "/", "display": "browser",
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
/*.txt
  Content-Type: text/plain; charset=utf-8
"""


# MARK: Build

def write(rel, text):
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_language(code):
    """Every translated page in one language; returns their paths."""
    use(code)

    def out(path, text):
        rel = (prefix() + path).strip("/")
        write(f"{rel}/index.html" if rel else "index.html", text)

    out("/", build_home())
    paths = ["/"]
    for g in C.TV_GUIDES:
        out(f"/{g['slug']}/", build_guide(g))
        paths.append(f"/{g['slug']}/")
    for b in C.BRANDS:
        path, html_ = build_brand(b)
        out(path, html_)
        paths.append(path)
    out("/blog/", build_blog_index())
    paths.append("/blog/")
    for tv_id, topic in B.posts():
        path, html_ = build_post(tv_id, topic)
        out(path, html_)
        paths.append(path)
    out("/help/", build_help())
    paths.append("/help/")
    write(f"{prefix().strip('/')}/404.html".lstrip("/"), build_404())
    return paths


def check():
    """--check: what's missing, broken or still in English in each translation."""
    bad = False
    for lang in C_EN.LANGUAGES[1:]:
        code = lang[0]
        _, problems = i18n.load(code)
        same = i18n.untranslated(code) if (i18n.LOCALES / f"{code}.json").exists() else []
        status = "ok" if not problems else f"{len(problems)} problem(s)"
        print(f"{code}: {status}, {len(same)} longer text(s) same as English")
        for p in problems[:40]:
            print(f"  ✗ {p}")
        for s in same[:15]:
            print(f"  · {s}")
        bad = bad or bool(problems)
    return 1 if bad else 0


def main():
    if "--check" in sys.argv:
        sys.exit(check())

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)
    i18n.write_source()

    codes = [lang[0] for lang in C_EN.LANGUAGES]
    sitemaps = {}
    translated = set()
    for code in codes:
        paths = build_language(code)
        translated.update(paths)
        sitemaps[code] = paths

    # English only: the legal pages, and the files for crawlers.
    use("en")
    write("privacy/index.html", build_privacy())
    write("terms/index.html", build_terms())
    write("firetv/privacy/index.html", build_firetv_privacy())
    write("firetv/terms/index.html", build_firetv_terms())
    sitemaps["en"] += ["/privacy/", "/terms/", "/firetv/privacy/", "/firetv/terms/"]
    for code, paths in sitemaps.items():
        write(f"sitemap-{code}.xml", sitemap(code, paths, translated))
    write("sitemap.xml", sitemap_index(codes))
    write("site.webmanifest", manifest())
    write("robots.txt", robots_txt())
    write("llms.txt", llms_txt())
    write("llms-full.txt", llms_full_txt())
    write("_headers", HEADERS)

    total = sum(len(p) for p in sitemaps.values())
    print(f"Built {total} pages in {len(codes)} languages into {OUT}")
    for code in codes[1:]:
        if PROBLEMS.get(code):
            print(f"  {code}: {len(PROBLEMS[code])} translation problem(s), English used there "
                  f"(python3 site/build.py --check)")

    if "--serve" in sys.argv:
        import functools
        import http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(OUT))
        print("Serving on http://localhost:8000/")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()


if __name__ == "__main__":
    main()
