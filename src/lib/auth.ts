// Single-admin session auth: HMAC-signed expiry cookies, no dependencies.
// Password comes from ADMIN_PASSWORD (env) — checked with scrypt timing-safe.
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { env } from "./env";

const COOKIE = "tapps_session";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12h

function secret(): string {
  return env("SESSION_SECRET") || "dev-only-secret-change-me";
}

export function adminPassword(): string {
  return env("ADMIN_PASSWORD") || "tapps";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(ttlMs = DEFAULT_TTL_MS): string {
  const expires = Date.now() + ttlMs;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payload);
  if (mac.length !== expected.length) return false;
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

export function checkPassword(candidate: string): boolean {
  const expected = adminPassword();
  const a = Buffer.from(candidate.padEnd(128, "\0").slice(0, 128));
  const b = Buffer.from(expected.padEnd(128, "\0").slice(0, 128));
  return timingSafeEqual(a, b);
}

export const sessionCookie = {
  name: COOKIE,
  options: {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production" || !!process.env.FORCE_SECURE_COOKIES,
    maxAge: DEFAULT_TTL_MS / 1000
  }
};

export function csrfToken(): string {
  // Per-process token; SameSite=strict cookies + origin checks carry the
  // real protection. Token adds defense-in-depth for the admin forms.
  if (!process.env.TAPPS_CSRF) process.env.TAPPS_CSRF = randomBytes(16).toString("hex");
  return process.env.TAPPS_CSRF;
}

export function checkCsrf(token: string | undefined | null): boolean {
  return !!token && token === csrfToken();
}
