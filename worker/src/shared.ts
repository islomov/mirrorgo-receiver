// Small helpers shared by the Worker entry point and the Room Durable Object.

export const PROTOCOL_VERSION = 1;

/** No sender has ever joined this long after the room was created → expired (4008). */
export const ROOM_TTL_MS = 10 * 60 * 1000;
/** The viewer has been gone this long → room closed (4004 to the sender). */
export const VIEWER_GRACE_MS = 60 * 1000;
/** Largest message relayed between the peers. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

export const CloseCode = {
  replaced: 4001,
  roomClosed: 4004,
  expired: 4008,
} as const;

export type Role = "viewer" | "sender";

const CODE_RE = /^\d{6}$/;
const TOKEN_RE = /^[0-9a-f]{32}$/;

export const isCode = (s: string | null): s is string => s !== null && CODE_RE.test(s);
export const isToken = (s: string | null): s is string => s !== null && TOKEN_RE.test(s);

/** 6 uniformly random digits (leading zeros allowed). */
export function randomCode(): string {
  const buf = new Uint32Array(1);
  // Rejection sampling keeps the distribution uniform.
  do crypto.getRandomValues(buf);
  while (buf[0] >= 4_294_000_000);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** 128 random bits as 32 lowercase hex characters. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two tokens without an early exit. */
export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** Structured log line. Never pass SDP, candidates or tokens here. */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}
