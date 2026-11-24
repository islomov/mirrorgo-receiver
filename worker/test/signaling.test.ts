// Signaling tests: scripted viewer and sender WebSocket clients against the Worker + Room DO,
// running inside workerd. See PROTOCOL.md.

import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://smrr.tv";
let ipCounter = 0;
/** Each test gets its own client IP, so the per-IP rate limits don't leak between tests. */
const freshIP = () => `198.51.100.${++ipCounter}`;

type Msg = Record<string, any>;

class Client {
  readonly raw: string[] = [];
  private waiters: Array<() => void> = [];
  private cursor = 0;
  closeEvent: { code: number; reason: string } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      this.raw.push(e.data as string);
      this.wake();
    });
    ws.addEventListener("close", (e) => {
      this.closeEvent = { code: e.code, reason: e.reason };
      this.wake();
    });
    ws.accept();
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }

  private async until<T>(check: () => T | undefined, what: string, timeoutMs = 2000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = check();
      if (value !== undefined) return value;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${what}; got ${JSON.stringify(this.raw.slice(this.cursor))}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** The next message (raw text), in order. */
  nextRaw(): Promise<string> {
    return this.until(() => (this.cursor < this.raw.length ? this.raw[this.cursor++] : undefined), "a message");
  }

  async next(type?: string): Promise<Msg> {
    const m = JSON.parse(await this.nextRaw());
    if (type) expect(m.type).toBe(type);
    return m;
  }

  /** Resolves when nothing else arrives for a moment. */
  async expectSilence(ms = 150): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    expect(this.raw.slice(this.cursor)).toEqual([]);
  }

  closed(): Promise<{ code: number; reason: string }> {
    return this.until(() => this.closeEvent ?? undefined, "close");
  }

  send(m: Msg | string) {
    this.ws.send(typeof m === "string" ? m : JSON.stringify(m));
  }

  close() {
    this.ws.close(1000, "bye");
  }
}

async function upgrade(path: string, ip = freshIP(), headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, { headers: { Upgrade: "websocket", "cf-connecting-ip": ip, ...headers } });
}

async function connect(path: string, ip?: string): Promise<Client> {
  const res = await upgrade(path, ip);
  expect(res.status).toBe(101);
  return new Client(res.webSocket!);
}

async function newViewer(): Promise<{ viewer: Client; room: Msg }> {
  const viewer = await connect("/ws?role=viewer");
  const room = await viewer.next("room");
  return { viewer, room };
}

async function lookup(code: string, ip = freshIP(), origin = ORIGIN): Promise<Response> {
  return SELF.fetch(`${origin}/api/rooms/${code}`, { headers: { "cf-connecting-ip": ip } });
}

async function senderFor(code: string): Promise<{ sender: Client; ready: Msg }> {
  const res = await lookup(code);
  expect(res.status).toBe(200);
  const { senderToken } = (await res.json()) as Msg;
  const sender = await connect(`/ws?role=sender&code=${code}&token=${senderToken}`);
  const ready = await sender.next("ready");
  return { sender, ready };
}

async function createRoom(ip = freshIP(), origin = ORIGIN): Promise<Response> {
  return SELF.fetch(`${origin}/api/rooms`, { method: "POST", headers: { "cf-connecting-ip": ip } });
}

const stub = (code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

/** Moves the room's clock back by `ms` (creation and viewer-left times). */
async function ageRoom(code: string, ms: number) {
  await runInDurableObject(stub(code), (_, state) => {
    const room = state.storage.kv.get<Msg>("room")!;
    room.createdAt -= ms;
    if (room.viewerLeftAt !== null) room.viewerLeftAt -= ms;
    state.storage.kv.put("room", room);
  });
}

describe("rooms", () => {
  it("gives a new viewer a 6-digit code, a viewer token and the ICE servers", async () => {
    const { room } = await newViewer();
    expect(room).toMatchObject({ type: "room", v: 1, senderConnected: false });
    expect(room.code).toMatch(/^\d{6}$/);
    expect(room.viewerToken).toMatch(/^[0-9a-f]{32}$/);
    expect(room.iceServers).toEqual([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
  });

  it("looks up a live room: same sender token every time, signalingURL from the request origin", async () => {
    const { room } = await newViewer();
    const a = (await (await lookup(room.code)).json()) as Msg;
    const b = (await (await lookup(room.code)).json()) as Msg;
    expect(a.v).toBe(1);
    expect(a.code).toBe(room.code);
    expect(a.senderToken).toMatch(/^[0-9a-f]{32}$/);
    expect(b.senderToken).toBe(a.senderToken);
    expect(a.senderToken).not.toBe(room.viewerToken);
    expect(a.signalingURL).toBe(`wss://smrr.tv/ws?role=sender&code=${room.code}&token=${a.senderToken}`);

    const local = (await (await lookup(room.code, freshIP(), "http://localhost:8787")).json()) as Msg;
    expect(local.signalingURL).toBe(`ws://localhost:8787/ws?role=sender&code=${room.code}&token=${a.senderToken}`);
  });

  it("answers lookups with no-store, and CORS only for pages on localhost (the dev tools)", async () => {
    const { room } = await newViewer();
    const lookupFrom = (origin: string) =>
      SELF.fetch(`${ORIGIN}/api/rooms/${room.code}`, { headers: { "cf-connecting-ip": freshIP(), origin } });
    const res = await lookup(room.code);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect((await lookupFrom("https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await lookupFrom("http://localhost:8000")).headers.get("access-control-allow-origin")).toBe("http://localhost:8000");
    const preflight = await SELF.fetch(`${ORIGIN}/api/rooms/${room.code}`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8000" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8000");
  });

  it("rejects bad and unknown codes", async () => {
    expect(await (await lookup("12345")).json()).toEqual({ error: "bad_code" });
    expect((await lookup("12345")).status).toBe(400);
    expect((await lookup("abcdef")).status).toBe(400);
    const res = await lookup("999999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("refuses a sender before the upgrade: 404 without a live room, 403 with a wrong token", async () => {
    const { room } = await newViewer();
    const unknown = await upgrade(`/ws?role=sender&code=999999&token=${"0".repeat(32)}`);
    expect(unknown.status).toBe(404);
    expect(unknown.webSocket).toBeNull();
    const wrong = await upgrade(`/ws?role=sender&code=${room.code}&token=${"0".repeat(32)}`);
    expect(wrong.status).toBe(403);
    expect(wrong.webSocket).toBeNull();
  });

  it("rejects requests to /ws that aren't WebSocket upgrades or have no role", async () => {
    expect((await SELF.fetch(`${ORIGIN}/ws?role=viewer`)).status).toBe(426);
    expect((await upgrade("/ws?role=admin")).status).toBe(400);
  });
});

describe("relay", () => {
  it("relays offer / answer / candidates / restart-ice / bye unchanged, both ways", async () => {
    const { viewer, room } = await newViewer();
    const { sender, ready } = await senderFor(room.code);
    expect(ready).toMatchObject({ type: "ready", v: 1, code: room.code, viewerConnected: true });
    expect(ready.iceServers).toEqual(room.iceServers);
    expect(await viewer.next("peer-joined")).toEqual({ type: "peer-joined", role: "sender" });

    sender.send({ type: "hello", v: 1, role: "sender", app: "test" });
    viewer.send({ type: "hello", v: 1, role: "viewer", userAgent: "test" });

    const offer = JSON.stringify({ type: "offer", sdp: "v=0\r\n...", iceRestart: false });
    sender.send(offer);
    expect(await viewer.nextRaw()).toBe(offer);

    const answer = JSON.stringify({ type: "answer", sdp: "v=0\r\nanswer" });
    viewer.send(answer);
    expect(await sender.nextRaw()).toBe(answer);

    const c1 = JSON.stringify({ type: "candidate", candidate: "candidate:1 1 udp 1 192.0.2.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 });
    sender.send(c1);
    expect(await viewer.nextRaw()).toBe(c1);
    const c2 = JSON.stringify({ type: "candidate", candidate: "candidate:2 1 udp 1 x.local 5001 typ host", sdpMid: "0", sdpMLineIndex: 0 });
    viewer.send(c2);
    expect(await sender.nextRaw()).toBe(c2);

    viewer.send({ type: "restart-ice" });
    expect(await sender.next()).toEqual({ type: "restart-ice" });

    sender.send({ type: "bye", reason: "stopped" });
    expect(await viewer.next()).toEqual({ type: "bye", reason: "stopped" });

    // hello isn't relayed
    await viewer.expectSilence();
    await sender.expectSilence();
  });

  it("relays media-load / media-control / media-stop to the page, capabilities / media-status / video-playing to the phone", async () => {
    const { viewer, room } = await newViewer();
    const { sender } = await senderFor(room.code);
    await viewer.next("peer-joined");

    const load = JSON.stringify({ type: "media-load", id: 1, url: "https://example.com/live.m3u8", mime: "application/x-mpegURL", live: true, title: "News", start: 0 });
    sender.send(load);
    expect(await viewer.nextRaw()).toBe(load);
    const capabilities = JSON.stringify({ type: "capabilities", webrtc: true, hls: "native", mp4: true });
    viewer.send(capabilities);
    expect(await sender.nextRaw()).toBe(capabilities);
    const status = JSON.stringify({ type: "media-status", id: 1, state: "playing", time: 3.5, duration: null, muted: true });
    viewer.send(status);
    expect(await sender.nextRaw()).toBe(status);
    viewer.send({ type: "video-playing" });
    expect(await sender.next()).toEqual({ type: "video-playing" });
    sender.send({ type: "media-control", id: 1, action: "pause" });
    expect(await viewer.next()).toEqual({ type: "media-control", id: 1, action: "pause" });
    sender.send({ type: "media-stop" });
    expect(await viewer.next()).toEqual({ type: "media-stop" });

    // Wrong direction
    viewer.send({ type: "media-load", url: "https://example.com/x.m3u8" });
    sender.send({ type: "media-status", state: "playing" });
    await viewer.expectSilence();
    await sender.expectSilence();
  });

  it("drops unknown types, wrong-direction types, bad JSON and messages over 64 KB", async () => {
    const { viewer, room } = await newViewer();
    const { sender } = await senderFor(room.code);
    await viewer.next("peer-joined");

    sender.send({ type: "answer", sdp: "senders don't answer" });
    sender.send({ type: "restart-ice" });
    sender.send({ type: "room", code: "123456" });
    sender.send("not json");
    sender.send({ type: "offer", sdp: "x".repeat(65 * 1024) });
    viewer.send({ type: "offer", sdp: "viewers don't offer" });
    viewer.send({ type: "whatever" });
    await viewer.expectSilence();
    await sender.expectSilence();

    sender.send({ type: "candidate", candidate: "ok" });
    expect(await viewer.next()).toEqual({ type: "candidate", candidate: "ok" });
  });

  it("drops messages while the other side isn't connected", async () => {
    const { viewer } = await newViewer();
    viewer.send({ type: "answer", sdp: "nobody there" });
    await viewer.expectSilence();
  });

  it("answers the keepalive ping", async () => {
    const { viewer, room } = await newViewer();
    viewer.send('{"type":"ping"}');
    expect(await viewer.nextRaw()).toBe('{"type":"pong"}');
    // Not byte-for-byte the auto-response string: the object answers it itself.
    viewer.send('{ "type": "ping" }');
    expect(await viewer.nextRaw()).toBe('{"type":"pong"}');
    const { sender } = await senderFor(room.code);
    sender.send('{"type":"ping"}');
    expect(await sender.nextRaw()).toBe('{"type":"pong"}');
  });
});

describe("presence", () => {
  it("tells each side when the other joins and leaves", async () => {
    const { viewer, room } = await newViewer();
    const { sender, ready } = await senderFor(room.code);
    expect(ready.viewerConnected).toBe(true);
    expect(await viewer.next()).toEqual({ type: "peer-joined", role: "sender" });

    sender.close();
    expect(await viewer.next()).toEqual({ type: "peer-left", role: "sender" });

    // The broadcast starts again with the same token: no new code needed.
    const again = await senderFor(room.code);
    expect(again.ready.viewerConnected).toBe(true);
    expect(await viewer.next()).toEqual({ type: "peer-joined", role: "sender" });
  });

  it("replaces an older sender: it gets 4001, the viewer gets peer-joined", async () => {
    const { viewer, room } = await newViewer();
    const first = await senderFor(room.code);
    await viewer.next("peer-joined");

    const second = await senderFor(room.code);
    expect(await first.sender.closed()).toEqual({ code: 4001, reason: "replaced" });
    expect(await viewer.next()).toEqual({ type: "peer-joined", role: "sender" });

    // The new sender relays; closing the old one doesn't announce peer-left.
    second.sender.send({ type: "offer", sdp: "from the new sender" });
    expect(await viewer.next()).toEqual({ type: "offer", sdp: "from the new sender" });
    await viewer.expectSilence();
  });

  it("lets a reloaded viewer rejoin the same room; the sender sees it leave and come back", async () => {
    const { viewer, room } = await newViewer();
    const { sender } = await senderFor(room.code);
    await viewer.next("peer-joined");

    viewer.close();
    expect(await sender.next()).toEqual({ type: "peer-left", role: "viewer" });

    const again = await connect(`/ws?role=viewer&code=${room.code}&token=${room.viewerToken}`);
    const rejoined = await again.next("room");
    expect(rejoined).toMatchObject({ code: room.code, viewerToken: room.viewerToken, senderConnected: true });
    expect(await sender.next()).toEqual({ type: "peer-joined", role: "viewer" });
  });

  it("replaces an older viewer socket (e.g. a duplicated tab) with 4001", async () => {
    const { viewer, room } = await newViewer();
    const second = await connect(`/ws?role=viewer&code=${room.code}&token=${room.viewerToken}`);
    expect((await second.next("room")).code).toBe(room.code);
    expect(await viewer.closed()).toEqual({ code: 4001, reason: "replaced" });
  });

  it("gives a viewer with a wrong token or a dead code a new room", async () => {
    const { room } = await newViewer();
    const wrong = await connect(`/ws?role=viewer&code=${room.code}&token=${"0".repeat(32)}`);
    const other = await wrong.next("room");
    expect(other.code).not.toBe(room.code);

    const dead = await connect(`/ws?role=viewer&code=999998&token=${room.viewerToken}`);
    expect((await dead.next("room")).code).not.toBe("999998");
  });
});

describe("lifetime", () => {
  it("expires a room no sender joined within 10 minutes (4008) and frees the code", async () => {
    const { viewer, room } = await newViewer();
    await ageRoom(room.code, 9 * 60 * 1000);
    await runDurableObjectAlarm(stub(room.code)); // not due yet: rescheduled
    expect((await lookup(room.code)).status).toBe(200);

    await ageRoom(room.code, 61 * 1000);
    expect(await runDurableObjectAlarm(stub(room.code))).toBe(true);
    expect(await viewer.closed()).toEqual({ code: 4008, reason: "expired" });
    expect((await lookup(room.code)).status).toBe(404);
    const keys = await runInDurableObject(stub(room.code), (_, state) => [...state.storage.kv.list()].length);
    expect(keys).toBe(0);

    // Reconnecting without a code starts a new room.
    const { room: next } = await newViewer();
    expect(next.code).toMatch(/^\d{6}$/);
  });

  it("doesn't expire a room once a sender has joined", async () => {
    const { room } = await newViewer();
    const { sender } = await senderFor(room.code);
    sender.close();
    await ageRoom(room.code, 30 * 60 * 1000);
    await runDurableObjectAlarm(stub(room.code));
    expect((await lookup(room.code)).status).toBe(200);
  });

  it("closes the room 60 s after the viewer left: the sender gets 4004", async () => {
    const { viewer, room } = await newViewer();
    const { sender } = await senderFor(room.code);
    await viewer.next("peer-joined");
    viewer.close();
    await sender.next("peer-left");

    await ageRoom(room.code, 30 * 1000);
    await runDurableObjectAlarm(stub(room.code));
    expect(sender.closeEvent).toBeNull();
    expect((await lookup(room.code)).status).toBe(200);

    await ageRoom(room.code, 31 * 1000);
    expect(await runDurableObjectAlarm(stub(room.code))).toBe(true);
    expect(await sender.closed()).toEqual({ code: 4004, reason: "room closed" });
    expect((await lookup(room.code)).status).toBe(404);
    expect((await upgrade(`/ws?role=viewer&code=${room.code}&token=${room.viewerToken}`)).status).toBe(101);
  });

  it("treats a room past its deadline as gone even before the alarm runs", async () => {
    const { viewer, room } = await newViewer();
    await ageRoom(room.code, 11 * 60 * 1000);
    expect((await lookup(room.code)).status).toBe(404);
    expect(await viewer.closed()).toEqual({ code: 4008, reason: "expired" });
  });
});

describe("rooms created by the app", () => {
  it("creates a room with no viewer: sender token, signaling URL and the page's URL with the viewer token in its fragment", async () => {
    const res = await createRoom();
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const room = (await res.json()) as Msg;
    expect(room.v).toBe(1);
    expect(room.code).toMatch(/^\d{6}$/);
    expect(room.senderToken).toMatch(/^[0-9a-f]{32}$/);
    expect(room.signalingURL).toBe(`wss://smrr.tv/ws?role=sender&code=${room.code}&token=${room.senderToken}`);
    const viewerURL = new URL(room.viewerURL);
    expect(viewerURL.origin + viewerURL.pathname + viewerURL.search).toBe("https://smrr.tv/");
    const [, code, viewerToken] = viewerURL.hash.match(/^#room=(\d{6})-([0-9a-f]{32})$/)!;
    expect(code).toBe(room.code);
    expect(viewerToken).not.toBe(room.senderToken);

    // Looked up like any room, with the same sender token.
    expect(((await (await lookup(room.code)).json()) as Msg).senderToken).toBe(room.senderToken);
  });

  it("lets the sender join first and the page join with the viewer token from its URL", async () => {
    const room = (await (await createRoom()).json()) as Msg;
    const viewerToken = new URL(room.viewerURL).hash.split("-")[1];

    const sender = await connect(`/ws?role=sender&code=${room.code}&token=${room.senderToken}`);
    expect(await sender.next("ready")).toMatchObject({ code: room.code, viewerConnected: false });
    sender.send({ type: "media-load", id: 1, url: "https://example.com/a.m3u8" });

    const viewer = await connect(`/ws?role=viewer&code=${room.code}&token=${viewerToken}`);
    expect(await viewer.next("room")).toMatchObject({ code: room.code, viewerToken, senderConnected: true });
    await viewer.expectSilence(); // the link sent before it came was dropped
    expect(await sender.next("peer-joined")).toEqual({ type: "peer-joined", role: "viewer" });
    sender.send({ type: "media-load", id: 2, url: "https://example.com/a.m3u8" });
    expect((await viewer.next("media-load")).id).toBe(2);
  });

  it("closes a room whose page never connected within 2 minutes; once it has, the usual rules apply", async () => {
    const never = (await (await createRoom()).json()) as Msg;
    const sender = await connect(`/ws?role=sender&code=${never.code}&token=${never.senderToken}`);
    await sender.next("ready");
    await runInDurableObject(stub(never.code), (_, state) => {
      const room = state.storage.kv.get<Msg>("room")!;
      room.viewerDueBy -= 2 * 60 * 1000;
      state.storage.kv.put("room", room);
    });
    expect(await runDurableObjectAlarm(stub(never.code))).toBe(true);
    expect(await sender.closed()).toEqual({ code: 4004, reason: "room closed" });
    expect((await lookup(never.code)).status).toBe(404);

    const opened = (await (await createRoom()).json()) as Msg;
    const viewerToken = new URL(opened.viewerURL).hash.split("-")[1];
    await connect(`/ws?role=viewer&code=${opened.code}&token=${viewerToken}`);
    const dueBy = await runInDurableObject(stub(opened.code), (_, state) => state.storage.kv.get<Msg>("room")!.viewerDueBy);
    expect(dueBy).toBeNull();
    await ageRoom(opened.code, 5 * 60 * 1000);
    await runDurableObjectAlarm(stub(opened.code));
    expect((await lookup(opened.code)).status).toBe(200);
  });

  it("only takes POST, and allows 10 rooms per minute per IP", async () => {
    expect((await SELF.fetch(`${ORIGIN}/api/rooms`)).status).toBe(405);
    const ip = freshIP();
    for (let i = 0; i < 10; i++) expect((await createRoom(ip)).status).toBe(201);
    const limited = await createRoom(ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await createRoom()).status).toBe(201);
  });
});

describe("rate limits", () => {
  it("allows 10 lookups per minute per IP, then 429 with Retry-After", async () => {
    const ip = freshIP();
    for (let i = 0; i < 10; i++) expect((await lookup("123456", ip)).status).not.toBe(429);
    const limited = await lookup("123456", ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    // Another IP isn't affected.
    expect((await lookup("123456")).status).toBe(404);
  });
});

describe("abuse", () => {
  it("allows 30 new viewer rooms per minute per IP; rejoining its room isn't counted", async () => {
    const ip = freshIP();
    const first = await connect("/ws?role=viewer", ip);
    const room = await first.next("room");
    for (let i = 1; i < 30; i++) expect((await upgrade("/ws?role=viewer", ip)).status).toBe(101);
    const limited = await upgrade("/ws?role=viewer", ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await upgrade(`/ws?role=viewer&code=${room.code}&token=${room.viewerToken}`, ip)).status).toBe(101);
    expect((await upgrade("/ws?role=viewer")).status).toBe(101); // another IP
  });

  it("counts an IPv6 client per /64", async () => {
    for (let i = 0; i < 10; i++) expect((await lookup("123456", `2001:db8:1:2::${i.toString(16)}`)).status).toBe(404);
    expect((await lookup("123456", "2001:0db8:0001:0002:ffff:ffff:ffff:ffff")).status).toBe(429);
    expect((await lookup("123456", "2001:db8:1:3::1")).status).toBe(404);
  });

  it("refuses viewer rooms from other sites' pages and sandboxed frames", async () => {
    for (const origin of ["https://evil.example", "null", "https://smrr.tv.evil.example"]) {
      expect((await upgrade("/ws?role=viewer", freshIP(), { origin })).status, origin).toBe(403);
      const http = await SELF.fetch(`${ORIGIN}/api/viewer`, { method: "POST", body: "{}", headers: { "cf-connecting-ip": freshIP(), origin } });
      expect(http.status, origin).toBe(403);
    }
    for (const origin of [ORIGIN, "http://localhost:8000", "http://127.0.0.1:8787"]) {
      expect((await upgrade("/ws?role=viewer", freshIP(), { origin })).status, origin).toBe(101);
    }
    // Not a browser (Roku, the app): no Origin.
    expect((await httpViewer({})).status).toBe(201);
  });

  it("sends security headers, except on WebSocket upgrades", async () => {
    for (const path of ["/", "/firetv", "/c/123456", "/healthz", "/api/rooms/000000", "/ws"]) {
      const res = await SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual" });
      expect(res.headers.get("strict-transport-security"), path).toBe("max-age=31536000");
      expect(res.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(res.headers.get("referrer-policy"), path).toBe("strict-origin-when-cross-origin");
      await res.arrayBuffer();
    }
    const www = await SELF.fetch("https://www.smrr.tv/", { redirect: "manual" });
    expect(www.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});

describe("site", () => {
  it("serves the app's latest working version at /version", async () => {
    const res = await SELF.fetch(`${ORIGIN}/version`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ version: env.APP_VERSION });
    expect(env.APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect((await SELF.fetch(`${ORIGIN}/version`, { method: "POST" })).status).toBe(405);
  });

  it("serves /healthz, redirects www, and serves the join page for /c/<code>", async () => {
    expect(await (await SELF.fetch(`${ORIGIN}/healthz`)).text()).toBe("ok");
    const www = await SELF.fetch("https://www.smrr.tv/c/123456", { redirect: "manual" });
    expect(www.status).toBe(301);
    expect(www.headers.get("location")).toBe("https://smrr.tv/c/123456");
    const join = await SELF.fetch(`${ORIGIN}/c/123456`);
    expect(join.status).toBe(200);
    expect(await join.text()).toContain("join.js");
    const home = await SELF.fetch(`${ORIGIN}/`);
    expect(await home.text()).toContain("app.js");
  });

  it("serves each TV app's own page at /firetv, /samsung, /lg, /roku and /googletv", async () => {
    for (const tv of ["firetv", "samsung", "lg", "roku", "googletv"]) {
      for (const path of [`/${tv}`, `/${tv}/`]) {
        const res = await SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual" });
        expect(res.status, path).toBe(200);
        const html = await res.text();
        // Its own copy of the receiver (web/<tv>/), not smrr.tv's (/app.js) or another TV's.
        expect(html, path).toContain(`src="/${tv}/app.js"`);
        expect(html, path).toContain(`href="/${tv}/style.css"`);
      }
      for (const file of ["app.js", "strings.js", "signaling.js", "player.js", "media.js", "style.css"]) {
        const res = await SELF.fetch(`${ORIGIN}/${tv}/${file}`, { redirect: "manual" });
        expect(res.status, `/${tv}/${file}`).toBe(200);
        await res.arrayBuffer();
      }
    }
    const other = await SELF.fetch(`${ORIGIN}/sony`, { redirect: "manual" });
    expect(other.status).toBe(404);
    await other.arrayBuffer();
  });

  it("redirects the old /landing-page URLs to the same page on mirrorgo.app", async () => {
    for (const [from, to] of [
      ["/landing-page", "https://mirrorgo.app/"],
      ["/landing-page/", "https://mirrorgo.app/"],
      ["/landing-page/help/", "https://mirrorgo.app/help/"],
      ["/landing-page/mirror-iphone-to-lg-tv/?ref=x", "https://mirrorgo.app/mirror-iphone-to-lg-tv/?ref=x"],
    ]) {
      const res = await SELF.fetch(`${ORIGIN}${from}`, { redirect: "manual" });
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(to);
    }
    const other = await SELF.fetch(`${ORIGIN}/landing-pages`, { redirect: "manual" });
    expect(other.status).not.toBe(301);
  });

  it("returns JSON 404 for unknown API paths", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/nope`);
    expect(res.status).toBe(404);
  });
});

// MARK: HTTP viewers (TVs without WebSockets, e.g. Roku)

async function httpViewer(body: Msg | string = {}, ip = freshIP()): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/api/viewer`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "cf-connecting-ip": ip },
  });
}

async function newHttpViewer(): Promise<Msg> {
  const res = await httpViewer();
  expect(res.status).toBe(201);
  return (await res.json()) as Msg;
}

const sessionQuery = (v: Msg) => `code=${v.code}&token=${v.viewerToken}&session=${v.session}`;

async function poll(v: Msg, after = 0): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/api/viewer/poll?${sessionQuery(v)}&after=${after}`);
}

async function polled(v: Msg, after = 0): Promise<Msg> {
  const res = await poll(v, after);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  return (await res.json()) as Msg;
}

async function sendHttp(v: Msg, m: Msg | string): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/api/viewer/send?${sessionQuery(v)}`, {
    method: "POST",
    body: typeof m === "string" ? m : JSON.stringify(m),
  });
}

/** Moves the HTTP viewer's last poll back by `ms`. */
async function agePoll(code: string, ms: number) {
  await runInDurableObject(stub(code), (_, state) => {
    const room = state.storage.kv.get<Msg>("room")!;
    room.viewerPolledAt -= ms;
    state.storage.kv.put("room", room);
  });
}

describe("HTTP viewers", () => {
  it("creates a room: code, viewer token, session, and how often to poll", async () => {
    const v = await newHttpViewer();
    expect(v).toMatchObject({ type: "room", v: 1, seq: 0, senderConnected: false, pollIntervalMs: 3000 });
    expect(v.code).toMatch(/^\d{6}$/);
    expect(v.viewerToken).toMatch(/^[0-9a-f]{32}$/);
    expect(v.session).toMatch(/^[0-9a-f]{32}$/);
    expect((await lookup(v.code)).status).toBe(200);
    expect(await polled(v)).toEqual({ seq: 0, messages: [], senderConnected: false, pollIntervalMs: 3000 });
  });

  it("relays the sender's messages through polls (no ICE candidates) and the viewer's sends to the sender", async () => {
    const v = await newHttpViewer();
    const { sender, ready } = await senderFor(v.code);
    expect(ready.viewerConnected).toBe(true);

    let p = await polled(v);
    expect(p).toMatchObject({ messages: [{ type: "peer-joined", role: "sender" }], senderConnected: true, pollIntervalMs: 1000 });

    const load = { type: "media-load", id: 1, kind: "video", url: "https://example.com/a.m3u8", live: true };
    sender.send(load);
    sender.send({ type: "candidate", candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 });
    sender.send({ type: "offer", sdp: "v=0", iceRestart: false });
    sender.send({ type: "media-control", id: 1, action: "pause" });
    await new Promise((r) => setTimeout(r, 50));

    const next = await polled(v, p.seq);
    expect(next.messages).toEqual([load, { type: "offer", sdp: "v=0", iceRestart: false }, { type: "media-control", id: 1, action: "pause" }]);
    // Not acknowledged yet: the same again. Acknowledged: gone.
    expect((await polled(v, p.seq)).messages).toHaveLength(3);
    expect((await polled(v, next.seq)).messages).toEqual([]);
    expect((await polled(v, 0)).messages).toEqual([]);

    const caps = { type: "capabilities", v: 1, webrtc: false, hls: "native", mp4: true };
    expect(await (await sendHttp(v, caps)).json()).toEqual({ delivered: true });
    expect(await sender.next("capabilities")).toEqual(caps);
    expect((await sendHttp(v, { type: "media-status", id: 1, state: "playing", time: 1 })).status).toBe(200);
    await sender.next("media-status");
    expect((await sendHttp(v, { type: "bye" })).status).toBe(200);
    await sender.next("bye");

    expect(await (await sendHttp(v, { type: "hello", v: 1, role: "viewer" })).json()).toEqual({ delivered: false });
    expect((await sendHttp(v, { type: "media-load" })).status).toBe(400);
    expect((await sendHttp(v, "not json")).status).toBe(400);
    expect((await sendHttp(v, JSON.stringify({ type: "media-status", pad: "x".repeat(70_000) }))).status).toBe(413);
    await sender.expectSilence();
  });

  it("answers 404 for wrong tokens, sessions of dead rooms and bad parameters; only POST / GET", async () => {
    const v = await newHttpViewer();
    expect((await poll({ ...v, viewerToken: "0".repeat(32) })).status).toBe(404);
    expect((await poll({ ...v, code: "000000" === v.code ? "000001" : "000000" })).status).toBe(404);
    expect((await poll({ ...v, session: "nope" })).status).toBe(404);
    expect((await SELF.fetch(`${ORIGIN}/api/viewer/poll?${sessionQuery(v)}&after=-1`)).status).toBe(400);
    expect((await SELF.fetch(`${ORIGIN}/api/viewer`)).status).toBe(405);
    expect((await SELF.fetch(`${ORIGIN}/api/viewer/poll?${sessionQuery(v)}`, { method: "POST" })).status).toBe(405);
    expect((await httpViewer("not json")).status).toBe(400);
  });

  it("counts a viewer that stopped polling as gone after 15 s; it rejoins with its token (same code)", async () => {
    const v = await newHttpViewer();
    const { sender } = await senderFor(v.code);
    await polled(v);

    await agePoll(v.code, 10 * 1000);
    await runDurableObjectAlarm(stub(v.code)); // not due yet
    await sender.expectSilence();

    await agePoll(v.code, 6 * 1000);
    expect(await runDurableObjectAlarm(stub(v.code))).toBe(true);
    await sender.next("peer-left");
    expect(await (await poll(v)).json()).toEqual({ error: "gone" });
    expect((await poll(v)).status).toBe(410);

    const res = await httpViewer({ code: v.code, token: v.viewerToken });
    expect(res.status).toBe(200);
    const again = (await res.json()) as Msg;
    expect(again).toMatchObject({ code: v.code, viewerToken: v.viewerToken, senderConnected: true });
    expect(again.session).not.toBe(v.session);
    expect((await sender.next("peer-joined")).role).toBe("viewer");
    expect((await poll(v)).status).toBe(409); // the old session was replaced
    expect((await poll(again)).status).toBe(200);
  });

  it("closes the room 60 s after the viewer stopped polling; its rejoin then gets a new room", async () => {
    const v = await newHttpViewer();
    const { sender } = await senderFor(v.code);
    await agePoll(v.code, 16 * 1000);
    await runDurableObjectAlarm(stub(v.code));
    await sender.next("peer-left");

    await ageRoom(v.code, 61 * 1000);
    expect(await runDurableObjectAlarm(stub(v.code))).toBe(true);
    expect(await sender.closed()).toEqual({ code: 4004, reason: "room closed" });
    expect((await poll(v)).status).toBe(404);
    const res = await httpViewer({ code: v.code, token: v.viewerToken });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Msg).viewerToken).not.toBe(v.viewerToken);
  });

  it("expires like any room when no sender joins within 10 minutes", async () => {
    const v = await newHttpViewer();
    await ageRoom(v.code, 11 * 60 * 1000);
    await agePoll(v.code, -11 * 60 * 1000); // it kept polling
    expect((await poll(v)).status).toBe(404);
  });

  it("hands the room over between a page and an HTTP viewer with the same token", async () => {
    const v = await newHttpViewer();
    const page = await connect(`/ws?role=viewer&code=${v.code}&token=${v.viewerToken}`);
    expect((await page.next("room")).code).toBe(v.code);
    expect((await poll(v)).status).toBe(409);

    const back = await httpViewer({ code: v.code, token: v.viewerToken });
    expect(back.status).toBe(200);
    expect(await page.closed()).toEqual({ code: 4001, reason: "replaced" });
  });

  it("allows 10 new rooms per minute per IP", async () => {
    const ip = freshIP();
    for (let i = 0; i < 10; i++) expect((await httpViewer({}, ip)).status).toBe(201);
    const res = await httpViewer({}, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });
});
