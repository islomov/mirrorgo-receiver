"""The site's languages.

English is the source: the page texts in content.py and blog.py, and the bits of the layout (buttons,
headings, page titles) in UI below. `extract()` gathers every one of them into a single tree, which
every build writes to locales/en.json, so its git diff shows what changed in English. Each other
language is the same tree translated, in locales/<code>.json (codes: content.LANGUAGES).

`localize(code)` lays a translation over the English and gives back `content`- and `blog`-shaped
namespaces for build.py. Anything missing or broken in a translation falls back to English, and
`python3 build.py --check` lists it.

Rules for a translation (checked by `--check`):
- Same keys and same list lengths as en.json.
- Keep every {placeholder} of a string as it is ({tv}, {brand}, {n}…).
- Blog topics (topics.*) may use any {form} of a TV that the language defines in
  platforms.<tv>.forms (English: {art} "a Samsung TV", {title_art}); every TV must define the forms
  the topics use, so a language can add cases or genders (German {dat} "einem Samsung-Fernseher"…).
"""

import json
import re
import string
from pathlib import Path
from types import SimpleNamespace

import blog as B_EN
import content as C_EN

LOCALES = Path(__file__).resolve().parent / "locales"

# The layout's texts (build.py). {placeholders} are filled in by the build.
UI = {
    # Header, footer
    "skip": "Skip to content",
    "home_aria": "All TV Kit home",
    "menu": "Menu",
    "language": "Language",
    "nav_features": "Features",
    "nav_tvs": "TVs",
    "nav_guides": "Guides",
    "nav_help": "Help",
    "download": "Download on the App Store",
    "coming_soon": "Coming soon to the App Store",
    "footer_blurb": "TV remote, screen mirroring and casting for iPhone. Samsung, LG, Roku, Google TV, Android TV, Chromecast, "
                    "Fire TV, Apple TV and any web browser.",
    "footer_mirror_to": "Mirror to",
    "footer_brands": "TV brands",
    "footer_support": "Support",
    "footer_languages": "Languages",
    "brand_tv": "{brand} TV",
    "guides": "Guides",
    "help_faq": "Help & FAQ",
    "tv_browser": "smrr.tv (TV browser)",
    "privacy": "Privacy",
    "terms": "Terms of use",
    "firetv_app_privacy": "Fire TV app: privacy",
    "firetv_app_terms": "terms",
    "english_only": "(English)",
    "trademarks": "Samsung, LG, Roku, Google TV, Android TV, Chromecast, Fire TV, Apple TV, AirPlay and the TV brands "
                  "named are trademarks of their owners. All TV Kit isn't affiliated with them.",

    # Home
    "home_title": "All TV Kit: TV Remote, Screen Mirroring & Cast for iPhone",
    "home_description": "Use your iPhone as a Samsung or LG TV remote, mirror it to Samsung, LG, Roku, Google TV, "
                        "Fire TV, Apple TV or any browser, and cast photos, videos, YouTube and live TV.",
    "eyebrow": "For iPhone · No app on the TV",
    "home_h1": "Your iPhone on the {big}",
    "home_h1_big": "big screen",
    "check_tv": "Check your TV",
    "fine_wifi": "Same Wi-Fi, no cables",
    "fine_sound": "Sound included",
    "fine_account": "No account",
    "hero_alt": "All TV Kit's Home screen",
    "live_pill": "Mirroring",
    "works_with_tv": "Works with the TV you already have",
    "supported_tvs": "Supported TVs",
    "facts_kicker": "At a glance",
    "facts_h2": "What is All TV Kit?",
    "features_kicker": "Everything in one app",
    "features_h2": "Control it, mirror it, cast it",
    "features_p": "Use your phone as the TV remote, show your whole screen, or send just what you're watching, in full quality.",
    "works_on": "Works on:",
    "how_kicker": "How it works",
    "how_h2": "On the TV in three taps",
    "how_p": "No cables, no adapters, nothing to install on the TV.",
    "tvs_kicker": "Compatibility",
    "tvs_h2": "What works on your TV",
    "tvs_p": "All TV Kit finds your TV on the Wi-Fi and dims anything it can't play.",
    "tvs_foot": "Samsung smart TVs from 2016 · LG webOS TVs · Roku TVs and players · Google TV and Android TV (Sony, "
                "TCL, Hisense, Philips, Xiaomi…) · Chromecast · Fire TV Stick, Cube and Fire TV smart TVs · Apple TV "
                "and AirPlay TVs · any browser through smrr.tv",
    "compat_caption": "What All TV Kit can show on each kind of TV",
    "compat_feature": "Feature",
    "yes": "Yes",
    "no": "No",
    "airplay_kicker": "AirPlay or All TV Kit?",
    "airplay_h2": "More TVs than AirPlay",
    "airplay_p": "On its own, an iPhone only mirrors to an Apple TV or a TV with AirPlay. All TV Kit adds almost every "
                 "other TV, and things to watch on it.",
    "airplay_col_what": "Show your iPhone on",
    "airplay_col_iphone": "iPhone alone (AirPlay)",
    "airplay_col_mirrorgo": "With All TV Kit",
    "privacy_kicker": "Private by design",
    "privacy_h2": "Your phone, your TV, your Wi-Fi",
    "privacy_p": "What you mirror and cast goes straight from your iPhone to your TV. All TV Kit has no account, and "
                 "keeps your photos and videos off any server.",
    "privacy_link": "Read the privacy policy →",
    "guides_kicker": "Guides",
    "guides_h2": "Step by step, for your TV",
    "guides_p": "How to connect, mirror, and cast photos, videos, YouTube and live TV to each kind of TV.",
    "n_guides": "{n} guides",
    "all_guides": "All guides →",
    "faq_kicker": "Questions",
    "faq_h2": "Frequently asked questions",
    "all_help": "All help topics →",
    "final_h2": "Put your iPhone on the TV",
    "final_p": "Screen mirroring, photos, videos, YouTube, web videos and thousands of live channels. One app, any TV.",
    "app_icon_alt": "All TV Kit app icon",

    # TV guides (/mirror-iphone-to-<tv>/)
    "how_to_do_it": "How to do it",
    "guide_phone_alt": "All TV Kit ready to mirror an iPhone to {tv}",
    "what_you_can_do": "What you can do on {tv}",
    "questions": "Questions",
    "more_guides_for": "More guides for {tv}",
    "other_tvs": "Other TVs",
    "status_ok": "Works",
    "status_part": "Partly",
    "status_not": "Not on this TV",
    "howto_tool": "All TV Kit for iPhone",

    # Blog
    "screen_mirroring": "Screen mirroring",
    "step_by_step": "Step by step",
    "updated": "Updated {date}",
    "on_tv": "On {tv}",
    "good_to_know": "Good to know",
    "more_for": "More for {tv}",
    "topic_on_other_tvs": "{topic} on other TVs",
    "browser_code_alt": "Typing the smrr.tv code in All TV Kit",
    "page_title": "{title} | All TV Kit",
    "blog_h1": "Guides",
    "blog_lead": "Step-by-step guides for every kind of TV: connecting your iPhone, mirroring the screen, and casting "
                 "photos, videos, web images, YouTube, web videos and free live TV.",
    "blog_title": "Guides: Mirror and Cast an iPhone to Any TV | All TV Kit",
    "blog_description": "Step-by-step guides to connect an iPhone to Samsung, LG, Roku, Google TV, Android TV, "
                        "Chromecast, Fire TV, Apple TV or a web browser, and cast photos, videos, YouTube and live TV.",
    "blog_collection": "All TV Kit guides",
    "by_brand": "By TV brand",

    # TV brands (/mirror-iphone-to-<brand>-tv/)
    "brand_h1": "Mirror your iPhone to a {brand} TV",
    "brand_title": "How to Mirror an iPhone to a {brand} TV | All TV Kit",
    "brand_description": "Mirror your iPhone to a {brand} TV and cast photos, videos, YouTube and live TV with "
                         "All TV Kit. Works with {systems}.",
    "brand_step_1": "Find out which system your {brand} TV runs ({systems}): its logo is on the start screen and the remote.",
    "brand_step_2": "Put your iPhone on the same Wi-Fi as the TV.",
    "brand_step_3": "Open All TV Kit, tap Connect your TV and pick your TV.",
    "brand_step_4": "Open Screen Mirroring and tap Start mirroring, then {start}.",
    "brand_phone_alt": "All TV Kit ready to mirror an iPhone to a {brand} TV",
    "brand_any_model": "Any model, through smrr.tv",
    "brand_by_system": "{brand} TVs, by system",

    # Help
    "help_crumb": "Help",
    "help_h1": "Help & FAQ",
    "help_lead": "Answers to the questions people ask most. Still stuck? Email {email} with your TV's model.",
    "help_title": "All TV Kit Help: Screen Mirroring & Casting FAQ",
    "help_description": "How to connect your TV, mirror your iPhone screen, fix a TV that isn't found, sound, lag and "
                        "black screens, and cast photos, videos, YouTube and IPTV with All TV Kit.",

    # 404
    "nf_title": "Page not found | All TV Kit",
    "nf_description": "This page doesn't exist.",
    "nf_h1": "This page isn't on the TV",
    "nf_lead": "The link may be old. Try the home page or the help.",
    "nf_home": "Home",
    "nf_help": "Help",
}


# MARK: English → tree

def _faq_items(c):
    return [item for _, items in c.FAQ_SECTIONS for item in items]


def extract():
    """Every English text of the site, as the tree a translation fills in (locales/<code>.json)."""
    C, B = C_EN, B_EN
    notes = sorted({d for _, _, cells in C.COMPATIBILITY for _, d in cells.values() if d})
    return {
        "ui": dict(UI),
        "site": {"tagline": C.TAGLINE, "one_liner": C.ONE_LINER, "start_sharing": C.START_SHARING},
        "tvs": {t["id"]: {k: t[k] for k in ("name", "short") if k in t} for t in C.TVS},
        "compat_rows": {fid: name for fid, name, _ in C.COMPATIBILITY},
        "compat_notes": {n: n for n in notes},
        "features": {f["id"]: {"name": f["name"], "short": f["short"]} for f in C.FEATURES},
        "showcase": {
            s["feature"]: {"title": s["title"], "text": s["text"], "points": list(s["points"]),
                           "alts": [alt for _, alt in s["shots"]],
                           **({"footnote": s["footnote"]} if s.get("footnote") else {})}
            for s in C.SHOWCASE
        },
        "steps": [list(x) for x in C.STEPS],
        "privacy_points": [list(x) for x in C.PRIVACY_POINTS],
        "quick_facts": [list(x) for x in C.QUICK_FACTS],
        "airplay_compare": [row[0] for row in C.AIRPLAY_COMPARE],
        "faq_sections": [title for title, _ in C.FAQ_SECTIONS],
        "faq": {i["id"]: {k: i[k] for k in ("q", "a", "ol", "ul", "note") if k in i} for i in _faq_items(C)},
        "brands": {b["id"]: {"about": b["about"], "which": b["which"]} for b in C.BRANDS},
        "guides": {
            g["tv"]: {"title": g["title"], "description": g["description"], "h1": g["h1"], "lead": g["lead"],
                      "steps": list(g["steps"]),
                      "features": [[name, detail] for name, _, detail in g["features"]],
                      "sections": [[h, list(ps)] for h, ps in g["sections"]],
                      "faq": [[q, a] for q, a in g["faq"]]}
            for g in C.TV_GUIDES
        },
        "topics": {
            t["id"]: {"label": t["label"], "title": t["title"], "h1": t["h1"], "lead": t["lead"],
                      "shot_alt": t["shot"][1], **({"steps": list(t["steps"])} if t["steps"] else {}),
                      "tips": list(t["tips"])}
            for t in B.TOPICS
        },
        "platforms": {
            tv_id: {"forms": {"art": p["art"], "title_art": p.get("title_art", p["art"])},
                    "connect": list(p["connect"]), "connect_notes": list(p["connect_notes"]),
                    **{t["id"]: p[t["id"]] for t in B.TOPICS if t["id"] != "connect" and p.get(t["id"])}}
            for tv_id, p in B.PLATFORMS.items()
        },
    }


# MARK: Translation over English

def placeholders(text):
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def _merge(en, tr, path, problems):
    if isinstance(en, dict):
        if not isinstance(tr, dict):
            problems.append(f"{path}: should be an object")
            return en
        out = {}
        for k, v in en.items():
            if k not in tr:
                problems.append(f"{path}.{k}: missing")
                out[k] = v
            else:
                out[k] = _merge(v, tr[k], f"{path}.{k}", problems)
        extra = sorted(set(tr) - set(en))
        if path.endswith(".forms"):
            out.update({k: tr[k] for k in extra if isinstance(tr[k], str)})
        elif extra:
            problems.append(f"{path}: unknown keys {extra}")
        return out
    if isinstance(en, list):
        if not isinstance(tr, list) or len(tr) != len(en):
            problems.append(f"{path}: should be a list of {len(en)}")
            return en
        return [_merge(a, b, f"{path}[{i}]", problems) for i, (a, b) in enumerate(zip(en, tr))]
    if en is None:
        return None
    if not isinstance(tr, str) or not tr.strip():
        problems.append(f"{path}: should be text")
        return en
    # Blog topics may use any of the language's own forms (checked in load()); the rest keep English's.
    if path.split(".", 1)[-1].split(".")[0] != "topics" and placeholders(tr) != placeholders(en):
        problems.append(f"{path}: placeholders {sorted(placeholders(tr))}, English has {sorted(placeholders(en))}")
        return en
    return tr


def load(code):
    """The translation tree for a language, laid over English, and what was wrong with it."""
    en = extract()
    if code == "en":
        return en, []
    file = LOCALES / f"{code}.json"
    if not file.exists():
        return en, [f"{file.name}: missing (the pages are in English)"]
    try:
        tr = json.loads(file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return en, [f"{file.name}: {e}"]
    problems = []
    tree = _merge(en, tr, code, problems)
    # Each TV must have every form the topics use.
    used = set()
    for t in tree["topics"].values():
        for s in [t["title"], t["h1"], t["lead"], *t.get("steps", [])]:
            used |= placeholders(s)
    for tv_id, p in tree["platforms"].items():
        missing = used - set(p["forms"])
        if missing:
            problems.append(f"{code}.platforms.{tv_id}.forms: missing {sorted(missing)}, used by topics")
            tree["platforms"][tv_id]["forms"] = {**tree["platforms"][tv_id]["forms"],
                                                 **{k: p["forms"]["art"] for k in missing}}
    return tree, problems


def untranslated(code):
    """Longer texts still the same as in English (worth a look; names and short labels can stay)."""
    en = extract()
    tree, _ = load(code)
    same = []

    def walk(a, b, path):
        if isinstance(a, dict):
            for k in a:
                walk(a[k], b[k], f"{path}.{k}")
        elif isinstance(a, list):
            for i, (x, y) in enumerate(zip(a, b)):
                walk(x, y, f"{path}[{i}]")
        elif isinstance(a, str) and a == b and len(a) > 30:
            same.append(path)

    walk(en, tree, code)
    return same


# MARK: Tree → content / blog

def localize(code):
    """content- and blog-shaped namespaces in a language, and what was wrong with its translation."""
    m, problems = load(code)
    C = SimpleNamespace(**{k: getattr(C_EN, k) for k in dir(C_EN) if k.isupper()})
    C.TAGLINE, C.ONE_LINER, C.START_SHARING = m["site"]["tagline"], m["site"]["one_liner"], m["site"]["start_sharing"]
    C.TVS = [{**t, **m["tvs"][t["id"]]} for t in C_EN.TVS]
    C.COMPATIBILITY = [
        (fid, m["compat_rows"][fid], {tv: (st, m["compat_notes"][d] if d else None) for tv, (st, d) in cells.items()})
        for fid, _, cells in C_EN.COMPATIBILITY
    ]
    C.FEATURES = [{**f, **m["features"][f["id"]]} for f in C_EN.FEATURES]
    C.SHOWCASE = []
    for s in C_EN.SHOWCASE:
        ms = m["showcase"][s["feature"]]
        C.SHOWCASE.append({**s, "title": ms["title"], "text": ms["text"], "points": ms["points"],
                           "shots": [(shot, alt) for (shot, _), alt in zip(s["shots"], ms["alts"])],
                           **({"footnote": ms["footnote"]} if "footnote" in ms else {})})
    C.STEPS = [tuple(x) for x in m["steps"]]
    C.PRIVACY_POINTS = [tuple(x) for x in m["privacy_points"]]
    C.QUICK_FACTS = [tuple(x) for x in m["quick_facts"]]
    C.AIRPLAY_COMPARE = [(name, *row[1:]) for name, row in zip(m["airplay_compare"], C_EN.AIRPLAY_COMPARE)]
    C.FAQ_SECTIONS = [(title, [{**i, **m["faq"][i["id"]]} for i in items])
                      for title, (_, items) in zip(m["faq_sections"], C_EN.FAQ_SECTIONS)]
    C.BRANDS = [{**b, **m["brands"][b["id"]]} for b in C_EN.BRANDS]
    C.TV_GUIDES = []
    for g in C_EN.TV_GUIDES:
        mg = m["guides"][g["tv"]]
        C.TV_GUIDES.append({
            **g, "title": mg["title"], "description": mg["description"], "h1": mg["h1"], "lead": mg["lead"],
            "steps": mg["steps"],
            "features": [(name, st, detail) for (name, detail), (_, st, _) in zip(mg["features"], g["features"])],
            "sections": [(h, ps) for h, ps in mg["sections"]],
            "faq": [(q, a) for q, a in mg["faq"]],
        })

    topics = []
    for t in B_EN.TOPICS:
        mt = m["topics"][t["id"]]
        topics.append({**t, "label": mt["label"], "title": mt["title"], "h1": mt["h1"], "lead": mt["lead"],
                       "shot": (t["shot"][0], mt["shot_alt"]), "steps": mt.get("steps"), "tips": mt["tips"]})
    platforms = {}
    for tv_id, p in B_EN.PLATFORMS.items():
        mp = m["platforms"][tv_id]
        platforms[tv_id] = {**p, **{k: v for k, v in mp.items()}}
    by_id = {t["id"]: t for t in topics}
    B = SimpleNamespace(
        PUBLISHED=B_EN.PUBLISHED, TOPICS=topics, PLATFORMS=platforms,
        topic=lambda topic_id: by_id[topic_id],
        posts=lambda: [(tv_id, by_id[t["id"]]) for tv_id, t in B_EN.posts()],
        slug=lambda tv_id, t: B_EN.slug(tv_id, t),
    )
    return C, B, m["ui"], problems


def write_source():
    """locales/en.json: the English tree, what each translation fills in."""
    LOCALES.mkdir(exist_ok=True)
    text = json.dumps(extract(), ensure_ascii=False, indent=1) + "\n"
    (LOCALES / "en.json").write_text(text, encoding="utf-8")


def strip_tags(text):
    return re.sub(r"<[^>]+>", "", text)
