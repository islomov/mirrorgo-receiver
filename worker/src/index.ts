// smrr.tv: serves the web receiver (web/) and the WebRTC signaling between the page (viewer)
// and the MirrorGo broadcast extension (sender). Protocol: ../../PROTOCOL.md.
//
// `Env` (bindings) is generated from wrangler.jsonc by `npm run types`.

import { PROTOCOL_VERSION, isCode, isToken, json, log, randomCode } from "./shared";

export { Room } from "./room";

/** How many random codes to try before giving up on creating a room. */
const MAX_CODE_ATTEMPTS = 8;
const RETRY_AFTER_S = "60";
const CORS = { "access-control-allow-origin": "*" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // www.smrr.tv → smrr.tv (people will type both)
    if (url.hostname === "www.smrr.tv") {
      url.hostname = "smrr.tv";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/healthz") {
      return new Response("ok", { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/ws") return handleWebSocket(request, url, env);

    const lookup = url.pathname.match(/^\/api\/rooms\/([^/]*)$/);
    if (lookup) return handleLookup(request, url, lookup[1], env);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404, CORS);

    // The QR code's target: a page telling the user to type the code into the app.
    if (/^\/c\/[^/]*\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/join", url), request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// MARK: GET /api/rooms/:code

async function handleLookup(request: Request, url: URL, code: string, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, "access-control-allow-methods": "GET, OPTIONS", "access-control-max-age": "86400" },
    });
  }
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { ...CORS, allow: "GET, OPTIONS" });

  const { success } = await env.LOOKUP_LIMITER.limit({ key: clientIP(request) });
  if (!success) {
    log("lookup-rate-limited");
    return json({ error: "rate_limited" }, 429, { ...CORS, "retry-after": RETRY_AFTER_S });
  }
  if (!isCode(code)) return json({ error: "bad_code" }, 400, CORS);

  const senderToken = await roomStub(env, code).lookup();
  if (!senderToken) return json({ error: "not_found" }, 404, CORS);

  const signalingURL = new URL("/ws", url);
  signalingURL.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  signalingURL.search = new URLSearchParams({ role: "sender", code, token: senderToken }).toString();
  return json({ v: PROTOCOL_VERSION, code, senderToken, signalingURL: signalingURL.toString() }, 200, CORS);
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
    const { success } = await env.SENDER_LIMITER.limit({ key: clientIP(request) });
    if (!success) return json({ error: "rate_limited" }, 429, { "retry-after": RETRY_AFTER_S });
    if (!isCode(code) || !isToken(token)) return json({ error: "not_found" }, 404);
    return roomStub(env, code).fetch(internal(request, "/sender", { token }));
  }

  if (role === "viewer") {
    // Reload: rejoin the same room. Anything that doesn't match a live room gets a new one.
    if (isCode(code) && isToken(token)) {
      const rejoined = await roomStub(env, code).fetch(internal(request, "/viewer/rejoin", { token }));
      if (rejoined.status === 101) return rejoined;
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

// MARK: Helpers

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

/** The upgrade request, re-addressed to one of the Room's internal paths. */
function internal(request: Request, path: string, params: Record<string, string>): Request {
  const url = new URL(`https://room${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, request);
}

function clientIP(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
