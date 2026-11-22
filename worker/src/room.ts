// One room = one Durable Object, addressed by idFromName(code). It holds at most one viewer
// (the web page's WebSocket, or an HTTP viewer: a TV app without WebSockets that polls, e.g. Roku)
// and one sender (the iOS app or its broadcast extension) WebSocket, relays the signaling between
// them, and deletes itself when the room ends, which frees the code again.
// Protocol: ../../PROTOCOL.md.

import { DurableObject } from "cloudflare:workers";
import {
  CloseCode,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  LAUNCH_GRACE_MS,
  OUTBOX_MAX,
  POLL_ACTIVE_MS,
  POLL_GONE_MS,
  POLL_IDLE_MS,
  ROOM_TTL_MS,
  VIEWER_GRACE_MS,
  type Role,
  json,
  log,
  randomToken,
  tokensEqual,
} from "./shared";

interface RoomRecord {
  code: string;
  viewerToken: string;
  senderToken: string;
  createdAt: number;
  /** Set once a sender has joined: the room then no longer expires after 10 minutes. */
  senderEverJoined: boolean;
  /** When the viewer's socket closed, null while it's connected. */
  viewerLeftAt: number | null;
  /**
   * A room the app created: closed if no viewer has connected by then. Null once one has (and in
   * rooms created by a viewer; absent in records stored before this field existed).
   */
  viewerDueBy?: number | null;
  /**
   * Ids of the current sockets (older replaced sockets may still be closing). An HTTP viewer's is
   * `http:<session>`.
   */
  viewerSocket: string | null;
  senderSocket: string | null;
  /** HTTP viewer: when it last polled (it's gone POLL_GONE_MS later). */
  viewerPolledAt?: number | null;
}

/** What the sender sent an HTTP viewer since its last poll (`seq` keeps counting across sessions). */
interface Outbox {
  seq: number;
  items: { seq: number; data: string }[];
}

/** An HTTP viewer request's answer (`body`: JSON text), turned into a Response by the Worker. */
export interface HttpResult {
  status: number;
  body: string;
}

const result = (status: number, body: Record<string, unknown>): HttpResult => ({ status, body: JSON.stringify(body) });

const HTTP_PREFIX = "http:";
const isHttpViewer = (room: RoomRecord) => room.viewerSocket?.startsWith(HTTP_PREFIX) === true;

interface SocketAttachment {
  role: Role;
  id: string;
}

/**
 * Messages each role may send; everything else is ignored. WebRTC signaling, plus links the page
 * plays itself (`media-*`), what the page can play (`capabilities`) and that mirroring shows a
 * picture (`video-playing`).
 */
const RELAYED: Record<Role, ReadonlySet<string>> = {
  sender: new Set(["offer", "candidate", "bye", "media-load", "media-control", "media-stop"]),
  viewer: new Set(["answer", "candidate", "restart-ice", "bye", "capabilities", "media-status", "video-playing"]),
};

const other = (role: Role): Role => (role === "viewer" ? "sender" : "viewer");

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  // MARK: Entry points (called by the Worker)

  /**
   * WebSocket upgrades, forwarded by the Worker:
   * - `/viewer/new?code=` create the room (409 if this code is taken by a live room)
   * - `/viewer/rejoin?token=` the page reloaded (404 / 403 → the Worker makes a new room)
   * - `/sender?token=` the phone (404 / 403 are returned to it)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const room = this.liveRoom(now);

    switch (url.pathname) {
      case "/viewer/new": {
        if (room) return json({ error: "taken" }, 409);
        const code = url.searchParams.get("code") ?? "";
        const created: RoomRecord = {
          code,
          viewerToken: randomToken(),
          senderToken: randomToken(),
          createdAt: now,
          senderEverJoined: false,
          viewerLeftAt: null,
          viewerSocket: null,
          senderSocket: null,
        };
        log("room-created", { code });
        return this.accept("viewer", created);
      }
      case "/viewer/rejoin": {
        if (!room) return json({ error: "not_found" }, 404);
        if (!tokensEqual(url.searchParams.get("token") ?? "", room.viewerToken)) return json({ error: "forbidden" }, 403);
        log("viewer-rejoined", { code: room.code });
        return this.accept("viewer", room);
      }
      case "/sender": {
        if (!room) return json({ error: "not_found" }, 404);
        if (!tokensEqual(url.searchParams.get("token") ?? "", room.senderToken)) return json({ error: "forbidden" }, 403);
        log("sender-joined", { code: room.code });
        return this.accept("sender", room);
      }
      default:
        return json({ error: "not_found" }, 404);
    }
  }

  /**
   * `POST /api/rooms`: a room for a page the app is about to open (the TV's browser), with no viewer
   * yet. The page joins it like a reload (`/viewer/rejoin` with the viewer token). Null if this code
   * is taken by a live room.
   */
  async create(code: string): Promise<{ viewerToken: string; senderToken: string } | null> {
    const now = Date.now();
    if (this.liveRoom(now)) return null;
    const created: RoomRecord = {
      code,
      viewerToken: randomToken(),
      senderToken: randomToken(),
      createdAt: now,
      senderEverJoined: false,
      viewerLeftAt: null,
      viewerDueBy: now + LAUNCH_GRACE_MS,
      viewerSocket: null,
      senderSocket: null,
    };
    this.save(created);
    log("room-created", { code, by: "app" });
    return { viewerToken: created.viewerToken, senderToken: created.senderToken };
  }

  /** `GET /api/rooms/:code`: the sender token of the live room, or null. */
  async lookup(): Promise<string | null> {
    const room = this.liveRoom(Date.now());
    return room ? room.senderToken : null;
  }

  // MARK: HTTP viewers (POST /api/viewer, GET /api/viewer/poll, POST /api/viewer/send)

  /** `POST /api/viewer` without a room: a new room with this HTTP viewer. Null if the code is taken. */
  async httpViewerNew(code: string): Promise<Record<string, unknown> | null> {
    const now = Date.now();
    if (this.liveRoom(now)) return null;
    const room: RoomRecord = {
      code,
      viewerToken: randomToken(),
      senderToken: randomToken(),
      createdAt: now,
      senderEverJoined: false,
      viewerLeftAt: null,
      viewerSocket: null,
      senderSocket: null,
    };
    log("room-created", { code, viewer: "http" });
    return this.joinHttpViewer(room, now);
  }

  /** `POST /api/viewer` with its room (app restarted, network back): null if it's gone or the token is wrong. */
  async httpViewerRejoin(token: string): Promise<Record<string, unknown> | null> {
    const now = Date.now();
    const room = this.liveRoom(now);
    if (!room || !tokensEqual(token, room.viewerToken)) return null;
    log("viewer-rejoined", { code: room.code, viewer: "http" });
    return this.joinHttpViewer(room, now);
  }

  /** `GET /api/viewer/poll`: the messages after `after` (older ones are dropped: acknowledged). */
  async httpViewerPoll(token: string, session: string, after: number): Promise<HttpResult> {
    const now = Date.now();
    const checked = this.httpSession(token, session, now);
    if (!("room" in checked)) return checked;
    const { room } = checked;
    room.viewerPolledAt = now;
    this.save(room);

    const outbox = this.outbox();
    const items = outbox.items.filter((item) => item.seq > after);
    if (items.length !== outbox.items.length) this.ctx.storage.kv.put("outbox", { seq: outbox.seq, items } satisfies Outbox);
    return result(200, { seq: outbox.seq, messages: items.map((item) => JSON.parse(item.data)), ...this.pollState(room) });
  }

  /** `POST /api/viewer/send`: one message to the sender (the types a page may send, plus `hello`). */
  async httpViewerSend(token: string, session: string, message: string): Promise<HttpResult> {
    const now = Date.now();
    const checked = this.httpSession(token, session, now);
    if (!("room" in checked)) return checked;
    const { room } = checked;
    room.viewerPolledAt = now;
    this.save(room);

    if (message.length > MAX_MESSAGE_BYTES) return result(413, { error: "too_large" });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
    } catch {
      return result(400, { error: "bad_json" });
    }
    const type = parsed && typeof parsed === "object" ? parsed.type : undefined;
    if (type === "hello") {
      log("hello", { role: "viewer", v: parsed.v, viewer: "http" });
      return result(200, { delivered: false });
    }
    if (typeof type !== "string" || !RELAYED.viewer.has(type)) return result(400, { error: "bad_type" });
    const sender = this.socket("sender", room);
    if (sender) this.trySend(sender, message);
    return result(200, { delivered: sender !== undefined });
  }

  // MARK: WebSocket events (hibernation API)

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    if (message.length > MAX_MESSAGE_BYTES) {
      log("message-too-large", { role: attachment.role, bytes: message.length });
      return;
    }
    let type: unknown;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
      type = parsed && typeof parsed === "object" ? parsed.type : undefined;
    } catch {
      log("bad-json", { role: attachment.role });
      return;
    }
    if (typeof type !== "string") return;

    if (type === "ping") {
      // Pings that aren't byte-for-byte the auto-response string end up here.
      this.trySend(ws, '{"type":"pong"}');
      return;
    }
    if (type === "hello") {
      log("hello", { role: attachment.role, v: parsed.v });
      return;
    }
    if (!RELAYED[attachment.role].has(type)) return;

    const room = this.room();
    if (!room || room[`${attachment.role}Socket`] !== attachment.id) return; // replaced socket
    this.deliver(other(attachment.role), room, message, type);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.socketGone(ws);
    // Complete the closing handshake (a no-op if it's already closed).
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {}
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    log("socket-error", { error: String(error) });
    this.socketGone(ws);
  }

  async alarm(): Promise<void> {
    const room = this.liveRoom(Date.now());
    if (room) this.schedule(room);
  }

  // MARK: Room state

  private room(): RoomRecord | undefined {
    return this.ctx.storage.kv.get<RoomRecord>("room");
  }

  private save(room: RoomRecord): void {
    this.ctx.storage.kv.put("room", room);
    this.schedule(room);
  }

  /** The room if it's still alive at `now`; ends it (closing its sockets) if a deadline has passed. */
  private liveRoom(now: number): RoomRecord | undefined {
    const room = this.room();
    if (!room) return undefined;
    if (isHttpViewer(room) && room.viewerPolledAt != null && now >= room.viewerPolledAt + POLL_GONE_MS) {
      // The HTTP viewer stopped polling: it left when it should have polled last.
      room.viewerLeftAt = room.viewerPolledAt + POLL_GONE_MS;
      room.viewerSocket = null;
      room.viewerPolledAt = null;
      this.save(room);
      log("peer-left", { code: room.code, role: "viewer", viewer: "http" });
      const sender = this.socket("sender", room);
      if (sender) this.trySend(sender, JSON.stringify({ type: "peer-left", role: "viewer" }));
    }
    if (!room.senderEverJoined && now >= room.createdAt + ROOM_TTL_MS) {
      this.end(room, CloseCode.expired, "expired", "room-expired");
      return undefined;
    }
    if (room.viewerLeftAt !== null && now >= room.viewerLeftAt + VIEWER_GRACE_MS) {
      this.end(room, CloseCode.roomClosed, "room closed", "room-closed");
      return undefined;
    }
    if (room.viewerDueBy != null && now >= room.viewerDueBy) {
      this.end(room, CloseCode.roomClosed, "room closed", "room-never-opened");
      return undefined;
    }
    return room;
  }

  private schedule(room: RoomRecord): void {
    const deadlines: number[] = [];
    if (!room.senderEverJoined) deadlines.push(room.createdAt + ROOM_TTL_MS);
    if (room.viewerLeftAt !== null) deadlines.push(room.viewerLeftAt + VIEWER_GRACE_MS);
    if (room.viewerDueBy != null) deadlines.push(room.viewerDueBy);
    if (isHttpViewer(room) && room.viewerPolledAt != null) deadlines.push(room.viewerPolledAt + POLL_GONE_MS);
    if (deadlines.length) void this.ctx.storage.setAlarm(Math.min(...deadlines));
    else void this.ctx.storage.deleteAlarm();
  }

  /** Closes every socket and deletes all storage, so the code is free again. */
  private end(room: RoomRecord, viewerCode: number, viewerReason: string, event: string): void {
    log(event, { code: room.code, ageS: Math.round((Date.now() - room.createdAt) / 1000) });
    for (const ws of this.ctx.getWebSockets()) {
      const role = (ws.deserializeAttachment() as SocketAttachment | null)?.role;
      try {
        if (role === "viewer") ws.close(viewerCode, viewerReason);
        else ws.close(CloseCode.roomClosed, "room closed");
      } catch {}
    }
    void this.ctx.storage.deleteAlarm();
    void this.ctx.storage.deleteAll();
  }

  // MARK: Sockets

  private accept(role: Role, room: RoomRecord): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, id } satisfies SocketAttachment);

    const previous = this.socket(role, room);
    if (previous) {
      try {
        previous.close(CloseCode.replaced, "replaced");
      } catch {}
    }

    room[`${role}Socket`] = id;
    if (role === "viewer") {
      room.viewerLeftAt = null;
      room.viewerDueBy = null;
      room.viewerPolledAt = null; // replaces an HTTP viewer too
    }
    else room.senderEverJoined = true;
    this.save(room);

    const peerConnected = this.connected(other(role), room);
    const iceServers = this.env.ICE_SERVERS;
    if (role === "viewer") {
      this.trySend(server, JSON.stringify({
        type: "room", v: PROTOCOL_VERSION, code: room.code, viewerToken: room.viewerToken, iceServers,
        senderConnected: peerConnected,
      }));
    } else {
      this.trySend(server, JSON.stringify({
        type: "ready", v: PROTOCOL_VERSION, code: room.code, iceServers, viewerConnected: peerConnected,
      }));
    }
    if (peerConnected) this.deliver(other(role), room, JSON.stringify({ type: "peer-joined", role }), "peer-joined");

    return new Response(null, { status: 101, webSocket: client });
  }

  /** The current socket for `role`, if it's connected. */
  private socket(role: Role, room: RoomRecord): WebSocket | undefined {
    const id = room[`${role}Socket`];
    if (!id) return undefined;
    return this.ctx.getWebSockets(role).find((ws) => {
      const a = ws.deserializeAttachment() as SocketAttachment | null;
      return a?.id === id && ws.readyState === WebSocket.OPEN;
    });
  }

  private socketGone(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    const room = this.room();
    if (!room || room[`${attachment.role}Socket`] !== attachment.id) return; // replaced, or room gone
    room[`${attachment.role}Socket`] = null;
    if (attachment.role === "viewer") room.viewerLeftAt = Date.now();
    this.save(room);
    log("peer-left", { code: room.code, role: attachment.role });
    this.deliver(other(attachment.role), room, JSON.stringify({ type: "peer-left", role: attachment.role }), "peer-left");
  }

  /** Whether `role` is in the room: its socket is open, or the HTTP viewer is polling. */
  private connected(role: Role, room: RoomRecord): boolean {
    if (role === "viewer" && isHttpViewer(room)) return true;
    return this.socket(role, room) !== undefined;
  }

  /**
   * To `role`'s current connection: its socket, or the HTTP viewer's outbox. HTTP viewers can't do
   * WebRTC, so they don't get ICE candidates (they answer an offer with `bye`).
   */
  private deliver(role: Role, room: RoomRecord, message: string, type: string): void {
    if (role === "viewer" && isHttpViewer(room)) {
      if (type !== "candidate") this.enqueue(room, message);
      return;
    }
    const ws = this.socket(role, room);
    if (ws) this.trySend(ws, message);
  }

  // MARK: HTTP viewer

  private joinHttpViewer(room: RoomRecord, now: number): Record<string, unknown> {
    const previous = this.socket("viewer", room);
    if (previous) {
      try {
        previous.close(CloseCode.replaced, "replaced");
      } catch {}
    }
    const session = randomToken();
    room.viewerSocket = HTTP_PREFIX + session;
    room.viewerLeftAt = null;
    room.viewerDueBy = null;
    room.viewerPolledAt = now;
    this.save(room);
    const outbox = this.outbox();
    this.ctx.storage.kv.put("outbox", { seq: outbox.seq, items: [] } satisfies Outbox);

    const sender = this.socket("sender", room);
    if (sender) this.trySend(sender, JSON.stringify({ type: "peer-joined", role: "viewer" }));
    return {
      type: "room", v: PROTOCOL_VERSION, code: room.code, viewerToken: room.viewerToken, session,
      seq: outbox.seq, ...this.pollState(room),
    };
  }

  /** The room, if `token` and `session` are this room's current HTTP viewer's; else the error to answer. */
  private httpSession(token: string, session: string, now: number): { room: RoomRecord } | HttpResult {
    const room = this.liveRoom(now);
    // Same answer for "no room" and "wrong token": it doesn't tell live codes apart.
    if (!room || !tokensEqual(token, room.viewerToken)) return result(404, { error: "not_found" });
    if (room.viewerSocket === HTTP_PREFIX + session) return { room };
    // Timed out (rejoin with POST /api/viewer), or another viewer took the room over.
    return room.viewerSocket === null ? result(410, { error: "gone" }) : result(409, { error: "replaced" });
  }

  private pollState(room: RoomRecord): Record<string, unknown> {
    const senderConnected = this.socket("sender", room) !== undefined;
    return { senderConnected, pollIntervalMs: senderConnected ? POLL_ACTIVE_MS : POLL_IDLE_MS };
  }

  private outbox(): Outbox {
    return this.ctx.storage.kv.get<Outbox>("outbox") ?? { seq: 0, items: [] };
  }

  private enqueue(room: RoomRecord, data: string): void {
    const outbox = this.outbox();
    outbox.seq += 1;
    outbox.items.push({ seq: outbox.seq, data });
    if (outbox.items.length > OUTBOX_MAX) {
      outbox.items.shift();
      log("outbox-full", { code: room.code });
    }
    this.ctx.storage.kv.put("outbox", outbox);
  }

  private trySend(ws: WebSocket, message: string): void {
    try {
      ws.send(message);
    } catch {}
  }
}
