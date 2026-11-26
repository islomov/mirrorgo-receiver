// smrr.tv: serves the web receiver (web/) and the WebRTC signaling between the page (viewer)
// and the MirrorGo broadcast extension (sender). Protocol: ../../PROTOCOL.md.
//
// `Env` (bindings) is generated from wrangler.jsonc by `npm run types`.

import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, isCode, isToken, json, log, randomCode, rateLimitKey, wideRateLimitKey } from "./shared";

export { Room } from "./room";

/** How many random codes to try before giving up on creating a room. */
const MAX_CODE_ATTEMPTS = 8;
const RETRY_AFTER_S = "60";
/** Largest `POST /api/viewer` body (`{}` or `{"code","token"}`). */
const VIEWER_BODY_MAX_BYTES = 4 * 1024;
/** MirrorGo's landing page (../site), first served here at /landing-page. */
const LANDING_ORIGIN = "https://mirrorgo.app";
/**
 * Each MirrorGo TV app's page (smrr.tv/<tv>): its own copy of the receiver in web/<tv>/ (index.html, its
 * scripts and stylesheet), served at /<tv> as well as /<tv>/ (the apps load /<tv>, without a redirect).
 */
const TV_PAGE = /^\/(firetv|samsung|lg|roku|googletv)\/?$/;

/**
 * On every answer except WebSocket upgrades. No framing rule: the Cast receiver (web/cast/) frames the
 * page, and so may the TV apps. No `no-referrer` either: YouTube's embedded player needs the origin.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env);
    if (response.status === 101) return response;
    const secured = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
    return secured;
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // www.smrr.tv → smrr.tv (people will type both)
  if (url.hostname === "www.smrr.tv") {
    url.hostname = "smrr.tv";
    return Response.redirect(url.toString(), 301);
  }

  // The landing page moved to its own domain: same page there, permanently.
  const landing = url.pathname.match(/^\/landing-page(\/.*)?$/);
  if (landing) {
    return Response.redirect(`${LANDING_ORIGIN}${landing[1] ?? "/"}${url.search}`, 301);
  }

  if (url.pathname === "/healthz") {
    return new Response("ok", { headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === "/version") return handleVersion(request, env);
  if (url.pathname === "/ws") return handleWebSocket(request, url, env);

  if (url.pathname === "/api/rooms") return handleCreate(request, url, env);
  if (url.pathname === "/api/viewer") return handleHttpViewer(request, url, env);
  if (url.pathname === "/api/viewer/poll") return handlePoll(request, url, env);
  if (url.pathname === "/api/viewer/send") return handleSend(request, url, env);
  const lookup = url.pathname.match(/^\/api\/rooms\/([^/]*)$/);
  if (lookup) return handleLookup(request, url, lookup[1], env);
  if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);

  const tvPage = url.pathname.match(TV_PAGE);
  if (tvPage) {
    return env.ASSETS.fetch(new Request(new URL(`/${tvPage[1]}/`, url), request));
  }

  // The QR code's target: a page telling the user to type the code into the app.
  if (/^\/c\/[^/]*\/?$/.test(url.pathname)) {
    return env.ASSETS.fetch(new Request(new URL("/join", url), request));
  }

  return env.ASSETS.fetch(request);
}

// MARK: GET /version

/** The newest app release that works with smrr.tv (`APP_VERSION` in wrangler.jsonc); the app asks for it. */
function handleVersion(request: Request, env: Env): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405, { allow: "GET, HEAD" });
  }
  return json({ version: env.APP_VERSION });
}

// MARK: POST /api/rooms

/**
 * The app creates a room for a page it opens itself (the TV's browser, launched with `viewerURL`), so
 * nobody has to type a code. The tokens go only to the app; the viewer's is in the URL's fragment,
 * which browsers don't send to the server.
 */
async function handleCreate(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });

  if (await overLimit(env, request, env.CREATE_LIMITER, "create")) {
    log("create-rate-limited");
    return rateLimited();
  }
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const tokens = await roomStub(env, code).create(code);
    if (!tokens) continue;
    const viewerURL = new URL("/", url);
    viewerURL.hash = `room=${code}-${tokens.viewerToken}`;
    return json({
      v: PROTOCOL_VERSION,
      code,
      senderToken: tokens.senderToken,
      signalingURL: senderSignalingURL(url, code, tokens.senderToken),
      viewerURL: viewerURL.toString(),
    }, 201);
  }
  log("no-free-code");
  return json({ error: "busy" }, 503);
}

// MARK: GET /api/rooms/:code

async function handleLookup(request: Request, url: URL, code: string, env: Env): Promise<Response> {
  const CORS = devCORS(request);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, "access-control-allow-methods": "GET, OPTIONS", "access-control-max-age": "86400" },
    });
  }
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { ...CORS, allow: "GET, OPTIONS" });

  if (await overLimit(env, request, env.LOOKUP_LIMITER, "lookup")) {
    log("lookup-rate-limited");
    return rateLimited(CORS);
  }
  if (!isCode(code)) return json({ error: "bad_code" }, 400, CORS);

  const senderToken = await roomStub(env, code).lookup();
  if (!senderToken) return json({ error: "not_found" }, 404, CORS);

  return json({ v: PROTOCOL_VERSION, code, senderToken, signalingURL: senderSignalingURL(url, code, senderToken) }, 200, CORS);
}

// MARK: /ws

async function handleWebSocket(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json({ error: "expected_websocket" }, 426, { upgrade: "websocket" });
  }
  const role = url.searchParams.get("role");
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token");

  if (role === "sender") {
    if (await overLimit(env, request, env.SENDER_LIMITER)) return rateLimited();
    if (!isCode(code) || !isToken(token)) return json({ error: "not_found" }, 404);
    return roomStub(env, code).fetch(internal(request, "/sender", { token }));
  }

  if (role === "viewer") {
    if (!pageOrigin(request, url)) return json({ error: "forbidden_origin" }, 403);
    // Reload: rejoin the same room. Anything that doesn't match a live room gets a new one.
    if (isCode(code) && isToken(token)) {
      if (await overLimit(env, request, env.RELAY_LIMITER)) return rateLimited();
      const rejoined = await roomStub(env, code).fetch(internal(request, "/viewer/rejoin", { token }));
      if (rejoined.status === 101) return rejoined;
    }
    if (await overLimit(env, request, env.VIEWER_LIMITER, "viewer")) {
      log("viewer-rate-limited");
      return rateLimited();
    }
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const fresh = randomCode();
      const created = await roomStub(env, fresh).fetch(internal(request, "/viewer/new", { code: fresh }));
      if (created.status !== 409) return created;
    }
    log("no-free-code");
    return json({ error: "busy" }, 503);
  }

  return json({ error: "bad_role" }, 400);
}

// MARK: HTTP viewers (TVs without WebSockets, e.g. Roku)

/**
 * `POST /api/viewer`, body `{}` (a new room) or `{"code","token"}` (rejoin its room; a room that's gone
 * or a wrong token gets a new one, like a page's rejoin). Answers the `room` message plus a `session`
 * for /poll and /send.
 */
async function handleHttpViewer(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  if (!pageOrigin(request, url)) return json({ error: "forbidden_origin" }, 403);
  const text = await readText(request, VIEWER_BODY_MAX_BYTES);
  if (text === null) return json({ error: "too_large" }, 413);
  let body: unknown = {};
  try {
    if (text) body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_json" }, 400);
  const fields = body as Record<string, unknown>;
  const code = typeof fields.code === "string" ? fields.code : null;
  const token = typeof fields.token === "string" ? fields.token : null;
  if (isCode(code) && isToken(token)) {
    if (await overLimit(env, request, env.RELAY_LIMITER)) return rateLimited();
    const rejoined = await roomStub(env, code).httpViewerRejoin(token);
    if (rejoined) return json(rejoined, 200);
  }

  if (await overLimit(env, request, env.CREATE_LIMITER, "create")) {
    log("viewer-rate-limited");
    return rateLimited();
  }
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const fresh = randomCode();
    const created = await roomStub(env, fresh).httpViewerNew(fresh);
    if (created) return json(created, 201);
  }
  log("no-free-code");
  return json({ error: "busy" }, 503);
}

/** `GET /api/viewer/poll?code=&token=&session=&after=<seq>`: what the sender sent since `after`. */
async function handlePoll(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
  const session = httpSessionParams(url);
  if (!session) return json({ error: "not_found" }, 404);
  if (await overLimit(env, request, env.RELAY_LIMITER)) return rateLimited();
  const after = Number(url.searchParams.get("after") ?? "0");
  if (!Number.isSafeInteger(after) || after < 0) return json({ error: "bad_after" }, 400);
  const result = await roomStub(env, session.code).httpViewerPoll(session.token, session.session, after);
  return jsonText(result.body, result.status);
}

/** `POST /api/viewer/send?code=&token=&session=`, body: one message for the sender. */
async function handleSend(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  const session = httpSessionParams(url);
  if (!session) return json({ error: "not_found" }, 404);
  if (await overLimit(env, request, env.RELAY_LIMITER)) return rateLimited();
  const message = await readText(request, MAX_MESSAGE_BYTES);
  if (message === null) return json({ error: "too_large" }, 413);
  const result = await roomStub(env, session.code).httpViewerSend(session.token, session.session, message);
  return jsonText(result.body, result.status);
}

/** A Room's JSON answer (already serialized). */
function jsonText(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function httpSessionParams(url: URL): { code: string; token: string; session: string } | null {
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token");
  const session = url.searchParams.get("session");
  return isCode(code) && isToken(token) && isToken(session) ? { code, token, session } : null;
}

// MARK: Helpers

/**
 * Whether the request is over `limiter`'s per-IP (IPv6: per /64) limit, or, with a `scope`, over
 * WIDE_LIMITER's limit for its IPv6 /48 on that endpoint.
 */
async function overLimit(env: Env, request: Request, limiter: RateLimit, scope?: string): Promise<boolean> {
  if (!(await limiter.limit({ key: rateLimitKey(request) })).success) return true;
  const wide = scope ? wideRateLimitKey(request) : null;
  return wide !== null && !(await env.WIDE_LIMITER.limit({ key: `${scope}:${wide}` })).success;
}

function rateLimited(headers: Record<string, string> = {}): Response {
  return json({ error: "rate_limited" }, 429, { ...headers, "retry-after": RETRY_AFTER_S });
}

/**
 * The body as text, or null once it's over `maxBytes` (it's not read further, so a huge body can't use
 * up the Worker's memory or reach the Room).
 */
async function readText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** `wss://<this origin>/ws?role=sender&code=…&token=…` (`ws:` under `wrangler dev`). */
function senderSignalingURL(url: URL, code: string, senderToken: string): string {
  const signalingURL = new URL("/ws", url);
  signalingURL.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  signalingURL.search = new URLSearchParams({ role: "sender", code, token: senderToken }).toString();
  return signalingURL.toString();
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

/** The upgrade request, re-addressed to one of the Room's internal paths. */
function internal(request: Request, path: string, params: Record<string, string>): Request {
  const url = new URL(`https://room${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, request);
}

const isLocalhost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

/**
 * Whether a request that makes a viewer room may come from this browser page: from smrr.tv itself (or
 * the dev server it's served from), from localhost (the dev tools in ../tools), or not from a browser at
 * all (no Origin: Roku, the app). Other sites can't open rooms from their visitors' browsers, which would
 * use up the codes; an opaque origin ("null": sandboxed frames) is refused too.
 */
function pageOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  if (!URL.canParse(origin)) return false;
  const { host, hostname } = new URL(origin);
  return host === url.host || isLocalhost(hostname);
}

/**
 * CORS for `GET /api/rooms/:code`: only for pages on localhost (../tools/fake-sender.html). The app
 * doesn't need it, and no other site's page may read sender tokens, so it can't spread code guessing
 * over its visitors' IPs.
 */
function devCORS(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const dev = origin !== null && URL.canParse(origin) && isLocalhost(new URL(origin).hostname);
  return dev ? { "access-control-allow-origin": origin, vary: "origin" } : { vary: "origin" };
}
