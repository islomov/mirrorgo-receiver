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

async function upgrade(path: string, ip = freshIP()): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, { headers: { Upgrade: "websocket", "cf-connecting-ip": ip } });
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

  it("answers lookups with no-store and CORS", async () => {
    const { room } = await newViewer();
    const res = await lookup(room.code);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const missing = await lookup("000000");
    expect(missing.headers.get("access-control-allow-origin")).toBe("*");
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

describe("rate limits", () => {
  it("allows 10 lookups per minute per IP, then 429 with Retry-After", async () => {
    const ip = freshIP();
    for (let i = 0; i < 10; i++) expect((await lookup("123456", ip)).status).not.toBe(429);
    const limited = await lookup("123456", ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.headers.get("access-control-allow-origin")).toBe("*");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    // Another IP isn't affected.
    expect((await lookup("123456")).status).toBe(404);
  });
});

describe("site", () => {
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

  it("returns JSON 404 for unknown API paths", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/nope`);
    expect(res.status).toBe(404);
  });
});
