// The morning report: yesterday's page views and clicks (the Analytics Engine dataset `mirrorgo_site`, see count() in
// worker.js for its columns), sent to a Telegram chat by the Worker's cron (wrangler.jsonc's triggers).
//
// Secrets (`npx wrangler secret put <NAME>` in site/; nothing is sent while one is missing):
//   TELEGRAM_BOT_TOKEN  the bot's token, from @BotFather
//   TELEGRAM_CHAT_ID    the chat to post in (send the bot a message, then open
//                       https://api.telegram.org/bot<TOKEN>/getUpdates and take message.chat.id)
//   STATS_ACCOUNT_ID    the Cloudflare account id
//   STATS_API_TOKEN     a Cloudflare API token with "Account Analytics: Read" (the same kind stats.py uses)

const DATASET = "mirrorgo_site";

// "Yesterday" is the calendar day in this time zone (UTC+5); the cron sends the report at 09:00 there.
const UTC_OFFSET_HOURS = 5;
const DAY = 24 * 60 * 60 * 1000;
const TOP = 5;

export async function sendDailyReport(env, now = Date.now()) {
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "STATS_ACCOUNT_ID", "STATS_API_TOKEN"].filter((k) => !env[k]);
  if (missing.length) {
    console.log(`Daily report not sent: set the secret(s) ${missing.join(", ")}.`);
    return;
  }
  const text = await buildReport(env, now);
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  if (!res.ok) throw new Error(`Telegram answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function buildReport(env, now = Date.now()) {
  const offset = UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const today = Math.floor((now + offset) / DAY) * DAY - offset; // local midnight, as a UTC time
  const yesterday = between(today - DAY, today);
  const dayBefore = between(today - 2 * DAY, today - DAY);
  const week = between(today - 7 * DAY, today);
  const q = (query) => sql(env, query);
  const n = "SUM(_sample_interval) AS n";

  const totals = (w) => q(`SELECT blob1 AS event, ${n} FROM ${DATASET} WHERE ${w} GROUP BY event`)
    .then((rows) => Object.fromEntries(rows.map((r) => [r.event, num(r.n)])));
  const store = (w) => q(`SELECT ${n} FROM ${DATASET} WHERE blob1 = 'click' AND blob4 = 'app-store' AND ${w}`)
    .then((rows) => num(rows[0]?.n));
  const top = (column, extra = "", limit = TOP) =>
    q(`SELECT ${column} AS k, ${n} FROM ${DATASET} WHERE blob1 = 'view' AND ${yesterday} ${extra} ` +
      `GROUP BY k ORDER BY n DESC LIMIT ${limit}`).then((rows) => rows.map((r) => [r.k, num(r.n)]));

  const [y, p, w, storeY, storeP, storeW, sources, pages, countries, devices] = await Promise.all([
    totals(yesterday), totals(dayBefore), totals(week), store(yesterday), store(dayBefore), store(week),
    top("blob4", "AND blob4 != '(internal)'"), top("blob2"), top("blob6"), top("blob7", "", 10),
  ]);

  const label = (t, opts) => new Date(t + offset).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
  const prevDay = label(today - 2 * DAY, { weekday: "short" });
  const views = y.view ?? 0;
  const lines = [
    `📊 <b>alltvkit.app · ${label(today - DAY, { weekday: "short", day: "numeric", month: "short" })}</b>`,
    "",
    `👀 <b>${fmt(views)}</b> views${change(views, p.view ?? 0, prevDay)}`,
    `🍎 <b>${fmt(storeY)}</b> App Store taps${change(storeY, storeP, prevDay)}`,
    `🖱 <b>${fmt(y.click ?? 0)}</b> link clicks${change(y.click ?? 0, p.click ?? 0, prevDay)}`,
    `<i>7 days: ${fmt(w.view ?? 0)} views · ${fmt(storeW)} App Store taps</i>`,
  ];
  if (views === 0) return lines.join("\n");

  const list = (title, rows, name = (k) => k) => {
    if (!rows.length) return;
    lines.push("", `<b>${title}</b>`, ...rows.map(([k, v]) => `${esc(name(k))}  ${fmt(v)}`));
  };
  list("From", sources, (k) => k.replace(/^\((.*)\)$/, "$1") || "?");
  list("Pages", pages, (k) => k || "/");
  lines.push("", "<b>Countries</b>", countries.map(([k, v]) => `${flag(k)}${esc(k || "?")} ${fmt(v)}`).join(" · "));
  const all = devices.reduce((s, [, v]) => s + v, 0) || 1;
  const icon = { mobile: "📱", desktop: "💻", tablet: "📟" };
  lines.push("", devices.map(([k, v]) => `${icon[k] ? `${icon[k]} ` : ""}${esc(k)} ${Math.round((100 * v) / all)}%`).join(" · "));
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

function fmt(value) {
  return value.toLocaleString("en-US");
}

function change(now, before, day) {
  if (now === before) return before ? ` (= ${day})` : "";
  if (!before) return ` (${day}: 0)`;
  const pct = Math.round((100 * (now - before)) / before);
  return ` (${pct > 0 ? "+" : ""}${pct}% vs ${day})`;
}

function flag(code) {
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) + " ";
}

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
