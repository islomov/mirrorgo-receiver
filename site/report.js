// Landing page stats in Telegram (the Analytics Engine dataset `mirrorgo_site`, see count() in worker.js for its
// columns): every morning, yesterday's numbers (the cron in wrangler.jsonc), and on demand, the bot's commands
// (/stats today so far, /yesterday, /week), which Telegram posts to POST /telegram (the webhook).
//
// Secrets (`npx wrangler secret put <NAME>` in site/; nothing is sent while one is missing):
//   TELEGRAM_BOT_TOKEN       the bot's token, from @BotFather
//   TELEGRAM_CHAT_ID         the chat to post in, and the only one whose commands are answered (send the bot a
//                            message, then open https://api.telegram.org/bot<TOKEN>/getUpdates: message.chat.id)
//   TELEGRAM_WEBHOOK_SECRET  any random string; Telegram sends it with each update (setWebhook's secret_token)
//   STATS_ACCOUNT_ID         the Cloudflare account id
//   STATS_API_TOKEN          a Cloudflare API token with "Account Analytics: Read" (the same kind stats.py uses)
//
// The webhook, once (and the commands in the bot's menu):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url=https://alltvkit.app/telegram -d secret_token=<SECRET> \
//        -d 'allowed_updates=["message"]'
//   curl "https://api.telegram.org/bot<TOKEN>/setMyCommands" -H 'Content-Type: application/json' \
//        -d '{"commands":[{"command":"stats","description":"Today so far"},…]}'   (COMMANDS below)

const DATASET = "mirrorgo_site";

// Days are calendar days in this time zone (UTC+5); the cron sends the morning report at 09:00 there.
const UTC_OFFSET_HOURS = 5;
const OFFSET = UTC_OFFSET_HOURS * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const TOP = 5;

// Sources (blob4: the referrer's domain or ?utm_source) that are AI chats: ChatGPT tags its links
// ?utm_source=chatgpt.com, the others are referrers. Their apps often send neither, so some land in "(direct)".
const AI_CHATS = new Set(["chatgpt.com", "chat.openai.com", "perplexity.ai", "perplexity", "claude.ai",
  "gemini.google.com", "copilot.microsoft.com", "copilot.com", "chat.mistral.ai", "meta.ai", "chat.deepseek.com",
  "grok.com", "you.com", "phind.com"]);

export const COMMANDS = {
  "/stats": ["today", "Today so far"],
  "/yesterday": ["yesterday", "Yesterday, as in the morning report"],
  "/week": ["week", "The last 7 days"],
};

export async function sendDailyReport(env, now = Date.now()) {
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "STATS_ACCOUNT_ID", "STATS_API_TOKEN"].filter((k) => !env[k]);
  if (missing.length) {
    console.log(`Daily report not sent: set the secret(s) ${missing.join(", ")}.`);
    return;
  }
  await send(env, await buildReport(env, "yesterday", now));
}

// POST /telegram: an update from Telegram. Answered only when it carries the webhook secret and comes from
// TELEGRAM_CHAT_ID; always 200 otherwise, so that Telegram doesn't send it again.
export async function handleTelegram(request, env, ctx) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) return new Response(null, { status: 401 });
  let message;
  try {
    message = (await request.json()).message;
  } catch {
    return new Response(null);
  }
  if (!message?.text || String(message.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) return new Response(null);
  const command = message.text.trim().split(/\s+/)[0].replace(/@.*$/, "").toLowerCase();
  ctx.waitUntil(answer(env, COMMANDS[command]?.[0]));
  return new Response(null);
}

async function answer(env, kind) {
  let text;
  if (!kind) {
    text = Object.entries(COMMANDS).map(([command, [, about]]) => `${command} — ${about}`).join("\n");
  } else {
    try {
      text = await buildReport(env, kind);
    } catch (e) {
      text = `Couldn't get the stats: ${esc(e.message)}`;
    }
  }
  await send(env, text);
}

async function send(env, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  if (!res.ok) throw new Error(`Telegram answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// The time spans of a report: what it counts, what it's compared with, and its title.
function period(kind, now) {
  const today = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET; // local midnight, as a UTC time
  const date = (t, opts) => new Date(t + OFFSET).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
  const time = new Date(now + OFFSET).toISOString().slice(11, 16);
  if (kind === "today") {
    return { from: today, to: now, title: `Today until ${time}`, vs: "same time yesterday", week: false };
  }
  if (kind === "week") {
    return { from: now - 7 * DAY, to: now, title: "The last 7 days", vs: "the 7 days before", week: false };
  }
  return {
    from: today - DAY, to: today, title: date(today - DAY, { weekday: "short", day: "numeric", month: "short" }),
    vs: date(today - 2 * DAY, { weekday: "short" }), week: true,
  };
}

export async function buildReport(env, kind = "yesterday", now = Date.now()) {
  const { from, to, title, vs, week: withWeek } = period(kind, now);
  const span = to - from;
  const current = between(from, to);
  const before = between(from - (kind === "week" ? span : DAY), to - (kind === "week" ? span : DAY));
  const week = between(to - 7 * DAY, to);
  const q = (query) => sql(env, query);
  const n = "SUM(_sample_interval) AS n";

  // People only: blob7 is "bot" for crawlers that ran site.js and for every "ai" data point (worker.js).
  const people = "blob7 != 'bot'";
  const totals = (w) => q(`SELECT blob1 AS event, ${n} FROM ${DATASET} WHERE ${people} AND ${w} GROUP BY event`)
    .then((rows) => Object.fromEntries(rows.map((r) => [r.event, num(r.n)])));
  const store = (w) => q(`SELECT ${n} FROM ${DATASET} WHERE blob1 = 'click' AND blob4 = 'app-store' AND ${people} ` +
    `AND ${w}`).then((rows) => num(rows[0]?.n));
  const top = (column, extra = "", limit = TOP, event = "view") =>
    q(`SELECT ${column} AS k, ${n} FROM ${DATASET} WHERE blob1 = '${event}' AND ${current} ${extra} ` +
      `GROUP BY k ORDER BY n DESC LIMIT ${limit}`).then((rows) => rows.map((r) => [r.k, num(r.n)]));
  const ai = q(`SELECT blob4 AS who, blob5 AS why, ${n} FROM ${DATASET} WHERE blob1 = 'ai' AND ${current} ` +
    `GROUP BY who, why ORDER BY n DESC`).then((rows) => rows.map((r) => ({ who: r.who, why: r.why, n: num(r.n) })));
  const botViews = q(`SELECT ${n} FROM ${DATASET} WHERE blob1 = 'view' AND blob7 = 'bot' AND ${current}`)
    .then((rows) => num(rows[0]?.n));

  const [y, p, w, storeY, storeP, storeW, allSources, pages, countries, devices, aiRows, aiPages, bots] =
    await Promise.all([
      totals(current), totals(before), withWeek ? totals(week) : {}, store(current), store(before),
      withWeek ? store(week) : 0,
      top("blob4", `AND ${people} AND blob4 != '(internal)'`, 100), top("blob2", `AND ${people}`),
      top("blob6", `AND ${people}`), top("blob7", `AND ${people}`, 10),
      ai, top("blob2", "AND blob5 = 'user'", TOP, "ai"), botViews,
    ]);
  const sources = allSources.slice(0, TOP);

  const views = y.view ?? 0;
  const lines = [
    `📊 <b>alltvkit.app · ${title}</b>`,
    "",
    `👀 <b>${fmt(views)}</b> ${plural(views, "view")}${change(views, p.view ?? 0, vs)}`,
    `🍎 <b>${fmt(storeY)}</b> App Store ${plural(storeY, "tap")}${change(storeY, storeP, vs)}`,
    `🖱 <b>${fmt(y.click ?? 0)}</b> link ${plural(y.click ?? 0, "click")}${change(y.click ?? 0, p.click ?? 0, vs)}`,
  ];
  if (withWeek) {
    lines.push(`<i>7 days: ${fmt(w.view ?? 0)} ${plural(w.view ?? 0, "view")} · ${fmt(storeW)} App Store ${plural(storeW, "tap")}</i>`);
  }

  // AI: pages an assistant fetched to answer someone, visits from AI chats, and crawlers.
  const byWho = (rows) => {
    const sums = {};
    for (const r of rows) sums[r.who] = (sums[r.who] ?? 0) + r.n;
    const total = Object.values(sums).reduce((a, b) => a + b, 0);
    const parts = Object.entries(sums).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${fmt(v)}`);
    return [total, parts.length ? ` (${parts.join(" · ")})` : ""];
  };
  const [forPeople, forPeopleBy] = byWho(aiRows.filter((r) => r.why === "user"));
  const [crawled, crawledBy] = byWho(aiRows.filter((r) => r.why !== "user"));
  const chats = allSources.filter(([k]) => AI_CHATS.has(k));
  const fromChats = chats.reduce((a, [, v]) => a + v, 0);
  lines.push(
    "",
    `🤖 <b>${fmt(forPeople)}</b> ${plural(forPeople, "page")} read by AI for someone's question${forPeopleBy}`,
    `💬 <b>${fmt(fromChats)}</b> ${plural(fromChats, "visit")} from AI chats` +
      (chats.length ? ` (${chats.map(([k, v]) => `${esc(k)} ${fmt(v)}`).join(" · ")})` : ""),
  );
  if (crawled) lines.push(`🕷 ${fmt(crawled)} ${plural(crawled, "page")} fetched by AI crawlers${crawledBy}`);
  if (bots) lines.push(`<i>Not counted above: ${fmt(bots)} ${plural(bots, "view")} by other bots</i>`);

  // <code>: Telegram would otherwise link the domains and turn "/zh" into a bot command.
  const list = (heading, rows, name = (k) => k) => {
    if (!rows.length) return;
    lines.push("", `<b>${heading}</b>`, ...rows.map(([k, v]) => `<code>${esc(name(k))}</code>  ${fmt(v)}`));
  };
  if (views) {
    list("From", sources, (k) => k.replace(/^\((.*)\)$/, "$1") || "?");
    list("Pages", pages, (k) => k || "/");
    lines.push("", "<b>Countries</b>", countries.map(([k, v]) => `${flag(k)}${esc(k || "?")} ${fmt(v)}`).join(" · "));
    const all = devices.reduce((s, [, v]) => s + v, 0) || 1;
    const icon = { mobile: "📱", desktop: "💻" };
    lines.push("", devices.map(([k, v]) => `${icon[k] ? `${icon[k]} ` : ""}${esc(k)} ${Math.round((100 * v) / all)}%`).join(" · "));
  }
  list("Pages AI read for someone", aiPages, (k) => k || "/");
  return lines.join("\n");
}

async function sql(env, query) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.STATS_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STATS_API_TOKEN}` },
    body: `${query} FORMAT JSON`,
  });
  if (!res.ok) throw new Error(`Analytics Engine answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data ?? [];
}

function between(from, to) {
  const t = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  return `timestamp >= toDateTime('${t(from)}') AND timestamp < toDateTime('${t(to)}')`;
}

function num(value) {
  return Math.round(Number(value) || 0);
}

function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}

function fmt(value) {
  return value.toLocaleString("en-US");
}

function change(now, before, vs) {
  if (now === before) return before ? ` (= ${vs})` : "";
  if (!before) return ` (${vs}: 0)`;
  const pct = Math.round((100 * (now - before)) / before);
  return ` (${pct > 0 ? "+" : ""}${pct}% vs ${vs})`;
}

function flag(code) {
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) + " ";
}

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
