// alltvkit.app, and the same site on mirrorgo.app (its first domain): www.<domain> → <domain>, POST /e counts a page view or a
// click (see count()), everything else from the static files (./public), counting the pages AI assistants and
// crawlers fetch (countAi()). Every morning, a cron sends yesterday's numbers to Telegram, and POST /telegram answers
// the bot's commands (report.js).

import { handleTelegram, sendDailyReport } from "./report.js";

// Roku articles for features a Roku doesn't have (MirrorGo only mirrors the screen to a Roku): they were
// published on 2026-11-16, so send them to the Roku guide in the same language rather than to a 404.
const GONE_ROKU_POSTS = /^(\/[a-z-]+)?\/blog\/(cast-photos-and-videos-from-iphone-to-roku|show-web-images-on-roku-from-iphone|watch-free-live-tv-on-roku-with-iphone|cast-youtube-from-iphone-to-roku|cast-web-videos-from-iphone-to-roku|show-iphone-camera-on-roku)\/?$/;

// The domains the site opens on (wrangler.jsonc's routes). The first is the main one: canonical URLs, the
// sitemap and structured data point to it, so search engines don't see two copies of the site.
const SITES = ["alltvkit.app", "mirrorgo.app"];

// AI assistants and crawlers, by the token in their User-Agent (from each company's crawler docs): [token, who,
// why]. "user": fetched because someone asked the assistant something; "search": for the assistant's search index;
// "training": for training models. They don't run site.js, so countAi() counts them as the Worker serves the page.
const AI_AGENTS = [
  ["ChatGPT-User", "ChatGPT", "user"],
  ["OAI-SearchBot", "ChatGPT", "search"],
  ["GPTBot", "ChatGPT", "training"],
  ["Claude-User", "Claude", "user"],
  ["Claude-SearchBot", "Claude", "search"],
  ["ClaudeBot", "Claude", "training"],
  ["Perplexity-User", "Perplexity", "user"],
  ["PerplexityBot", "Perplexity", "search"],
  ["MistralAI-User", "Mistral", "user"],
  ["Meta-ExternalFetcher", "Meta AI", "user"],
  ["meta-externalagent", "Meta AI", "training"],
  ["DuckAssistBot", "DuckDuckGo", "search"],
  ["Bytespider", "ByteDance", "training"],
  ["CCBot", "Common Crawl", "training"],
];

// Crawlers, previews, speed tests and headless browsers that do run site.js: their views are counted as device
// "bot", which the reports leave out.
const BOT_UA = /Googlebot|Google-InspectionTool|GoogleOther|AdsBot|Storebot|bingbot|BingPreview|Applebot|YandexBot|Baiduspider|DuckDuckBot|PetalBot|SemrushBot|AhrefsBot|MJ12bot|DotBot|facebookexternalhit|Twitterbot|Slackbot|TelegramBot|WhatsApp|Discordbot|LinkedInBot|HeadlessChrome|Lighthouse|PTST|GTmetrix|Pingdom|UptimeRobot|bot\/|crawler|spider/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // http:// and www. → https://<domain>, in one hop: plain HTTP was served as a second copy of the site.
    const bare = url.hostname.replace(/^www\./, "");
    if (SITES.includes(bare) && (bare !== url.hostname || url.protocol === "http:")) {
      url.hostname = bare;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/e") {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      await count(request, env);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/telegram") return handleTelegram(request, env, ctx);
    const gone = url.pathname.match(GONE_ROKU_POSTS);
    if (gone) {
      return Response.redirect(`${url.origin}${gone[1] ?? ""}/mirror-iphone-to-roku/`, 301);
    }
    const response = await env.ASSETS.fetch(request);
    countAi(request, env, url, response.status);
    return response;
  },

  // The cron in wrangler.jsonc: yesterday's numbers to Telegram (report.js).
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(sendDailyReport(env, controller.scheduledTime));
  },
};

// MARK: Counting

// One data point in the Analytics Engine dataset `mirrorgo_site` per event that site.js sends. Nothing that
// identifies a person is kept: no IP address, no cookie or id, only the referrer's domain. The columns
// (stats.py reads them by these numbers):
//   blob1 "view" | "click"      blob2 the page's path      blob3 the page's language
//   blob4 view: where the visitor came from (?utm_source / ?ref / ?src, else the referrer's domain,
//         "(direct)" or "(internal)"); click: the link ("/path/", "/path/#section", "app-store",
//         "host/path" for another site, "mailto")
//   blob5 click: where the link is on the page (header, footer, hero, a section's id…)
//   blob6 country      blob7 device (mobile, tablet, desktop; "bot" for BOT_UA, since 2026-11-23)
//   blob8 os (ios, android, mac, windows, linux, chromeos, other; linux and chromeos were "other" before 2026-11-23)
//   blob9 the domain the page was opened on (one of SITES; empty before alltvkit.app was added, 2026-11-21)
// and, from countAi() (since 2026-11-23), blob1 "ai": blob2 the page, blob4 who (AI_AGENTS: "ChatGPT", "Claude"…),
// blob5 why ("user", "search", "training"), blob6 country, blob7 "bot", blob8 the User-Agent token, blob9 domain.
async function count(request, env) {
  if (!env.STATS) return;
  let data;
  try {
    const text = await request.text();
    if (text.length > 4096) return;
    data = JSON.parse(text);
  } catch {
    return;
  }
  if (!data || (data.t !== "view" && data.t !== "click")) return;
  const page = clip(String(data.p || "/"), 200);
  const source = data.t === "view" ? viewSource(data) : linkTarget(data.h);
  if (source === null) return;
  const ua = request.headers.get("User-Agent") || "";
  const host = new URL(request.url).hostname;
  env.STATS.writeDataPoint({
    indexes: [data.t],
    blobs: [
      data.t,
      page,
      clip(String(data.l || ""), 16),
      source,
      data.t === "click" ? clip(String(data.w || ""), 40) : "",
      request.cf?.country || "",
      BOT_UA.test(ua) || aiAgent(ua) ? "bot" : device(ua),
      os(ua),
      SITES.includes(host) ? host : "",
    ],
  });
}

// A page (not a file: CSS, JS, images, fonts…) served to an AI assistant or crawler: one "ai" data point. Only
// answers with 200, so a redirect and the page it leads to count once.
function countAi(request, env, url, status) {
  if (!env.STATS || request.method !== "GET" || status !== 200) return;
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !/\.(html|txt|md)$/i.test(url.pathname)) return;
  const agent = aiAgent(request.headers.get("User-Agent") || "");
  if (!agent) return;
  const host = url.hostname;
  env.STATS.writeDataPoint({
    indexes: ["ai"],
    blobs: ["ai", clip(url.pathname, 200), "", agent[1], agent[2], request.cf?.country || "", "bot", agent[0],
      SITES.includes(host) ? host : ""],
  });
}

function aiAgent(ua) {
  const lower = ua.toLowerCase();
  return AI_AGENTS.find(([token]) => lower.includes(token.toLowerCase())) ?? null;
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max) : text;
}

function viewSource(data) {
  const tag = String(data.s || "").trim().toLowerCase();
  if (tag) return clip(tag, 60);
  if (!data.r) return "(direct)";
  try {
    const host = new URL(String(data.r)).hostname.replace(/^www\./, "");
    return SITES.includes(host) ? "(internal)" : clip(host, 100);
  } catch {
    return "(direct)";
  }
}

function linkTarget(href) {
  let url;
  try {
    url = new URL(String(href || ""));
  } catch {
    return null;
  }
  if (url.protocol === "mailto:") return "mailto";
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if (SITES.includes(host)) return clip(url.pathname + url.hash, 200);
  if (host === "apps.apple.com") return "app-store";
  return clip(host + url.pathname.replace(/\/$/, ""), 200);
}

function device(ua) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

function os(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Linux/.test(ua)) return "linux";
  return "other";
}
