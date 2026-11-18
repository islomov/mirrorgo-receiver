#!/usr/bin/env python3
"""mirrorgo.app's page views and clicks, from the Analytics Engine dataset `mirrorgo_site` (worker.js writes
it; its columns are listed there). Prints Markdown tables.

    CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… python3 site/stats.py [--days 7] [--top 20]

The token needs the "Account Analytics: Read" permission. The data is kept for 3 months.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DATASET = "mirrorgo_site"


def query(sql):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/analytics_engine/sql",
        data=(sql + " FORMAT JSON").encode(),
        headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp).get("data", [])
    except urllib.error.HTTPError as e:
        sys.exit(f"Cloudflare answered {e.code}: {e.read().decode(errors='replace')[:500]}")


def table(title, columns, rows):
    print(f"\n### {title}\n")
    if not rows:
        print("_Nothing yet._")
        return
    print("| " + " | ".join(label for label, _ in columns) + " |")
    print("|" + "|".join("---:" if key == "n" else "---" for _, key in columns) + "|")
    for row in rows:
        cells = []
        for _, key in columns:
            value = row.get(key, "")
            if key == "n":
                value = f"{int(float(value)):,}"
            cells.append(str(value).replace("|", "\\|") or "—")
        print("| " + " | ".join(cells) + " |")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=7, help="how many days back (default 7, at most 90)")
    ap.add_argument("--top", type=int, default=20, help="rows per table (default 20)")
    args = ap.parse_args()
    for name in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"):
        if not os.environ.get(name):
            sys.exit(f"Set {name} (see the top of this file).")

    since = f"timestamp > NOW() - INTERVAL '{max(1, min(args.days, 90))}' DAY"
    top = max(1, args.top)
    n = "SUM(_sample_interval) AS n"

    def grouped(event, columns, extra=""):
        cols = ", ".join(f"{blob} AS {alias}" for blob, alias in columns)
        aliases = ", ".join(alias for _, alias in columns)
        return query(f"SELECT {cols}, {n} FROM {DATASET} WHERE blob1 = '{event}' AND {since} {extra} "
                     f"GROUP BY {aliases} ORDER BY n DESC LIMIT {top}")

    print(f"## mirrorgo.app, the last {args.days} days")
    totals = {r["event"]: r["n"] for r in query(
        f"SELECT blob1 AS event, {n} FROM {DATASET} WHERE {since} GROUP BY event")}
    store = query(f"SELECT {n} FROM {DATASET} WHERE blob1 = 'click' AND blob4 = 'app-store' AND {since}")
    print(f"\nPage views: **{int(float(totals.get('view', 0))):,}** · link clicks: "
          f"**{int(float(totals.get('click', 0))):,}** · App Store button: "
          f"**{int(float(store[0]['n'] if store else 0)):,}**")

    table("Where visitors come from", [("Source", "source"), ("Views", "n")],
          grouped("view", [("blob4", "source")], "AND blob4 != '(internal)'"))
    table("Pages viewed", [("Page", "page"), ("Views", "n")], grouped("view", [("blob2", "page")]))
    table("App Store button clicks, by page and place", [("Page", "page"), ("Place", "place"), ("Clicks", "n")],
          grouped("click", [("blob2", "page"), ("blob5", "place")], "AND blob4 = 'app-store'"))
    table("Links clicked", [("Link", "link"), ("Clicks", "n")], grouped("click", [("blob4", "link")]))
    table("Links clicked, by page and place", [("Page", "page"), ("Place", "place"), ("Link", "link"),
                                               ("Clicks", "n")],
          grouped("click", [("blob2", "page"), ("blob5", "place"), ("blob4", "link")]))
    table("Countries", [("Country", "country"), ("Views", "n")], grouped("view", [("blob6", "country")]))
    table("Devices", [("Device", "device"), ("OS", "os"), ("Views", "n")],
          grouped("view", [("blob7", "device"), ("blob8", "os")]))
    table("Languages", [("Language", "lang"), ("Views", "n")], grouped("view", [("blob3", "lang")]))
    days = query(f"SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob1 AS event, {n} "
                 f"FROM {DATASET} WHERE {since} GROUP BY day, event ORDER BY day")
    by_day = {}
    for r in days:
        by_day.setdefault(str(r["day"])[:10], {})[r["event"]] = r["n"]
    table("Per day", [("Day", "day"), ("Views", "views"), ("Clicks", "clicks")],
          [{"day": d, "views": f"{int(float(v.get('view', 0))):,}", "clicks": f"{int(float(v.get('click', 0))):,}"}
           for d, v in sorted(by_day.items())])


if __name__ == "__main__":
    main()
