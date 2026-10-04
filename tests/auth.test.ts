import { describe, it, expect, beforeEach } from "vitest";
import { createSession, verifySession, checkPassword, checkCsrf, csrfToken } from "../src/lib/auth";

describe("session auth", () => {
  it("round-trips a valid session", () => {
    const token = createSession();
    expect(verifySession(token)).toBe(true);
  });

  it("rejects tampered tokens", () => {
    const token = createSession();
    expect(verifySession(token + "x")).toBe(false);
    expect(verifySession("1.2.3")).toBe(false);
    expect(verifySession("")).toBe(false);
    expect(verifySession(undefined)).toBe(false);
  });

  it("expires old sessions", () => {
    const expired = createSession(-1000);
    expect(verifySession(expired)).toBe(false);
  });

  it("checks passwords without timing leaks (roughly)", () => {
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(checkPassword("hunter2")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });
});

describe("csrf", () => {
  it("accepts the process token and rejects others", () => {
    const token = csrfToken();
    expect(checkCsrf(token)).toBe(true);
    expect(checkCsrf("nope")).toBe(false);
    expect(checkCsrf(null)).toBe(false);
  });
});
