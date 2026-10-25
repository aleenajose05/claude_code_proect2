import { describe, expect, it } from "vitest";

import { clientId, createSessionToken, passwordMatches, sessionCookie, verifySessionToken } from "@/lib/auth";

const SECRET = "s".repeat(40);

describe("session tokens", () => {
  it("verifies a token only for the scope it was issued for", () => {
    const demo = createSessionToken(SECRET, "demo");
    const debug = createSessionToken(SECRET, "debug");
    expect(verifySessionToken(SECRET, "demo", demo)).toBe(true);
    expect(verifySessionToken(SECRET, "debug", debug)).toBe(true);
    // A demo session can never be used as a debug session, and vice versa.
    expect(verifySessionToken(SECRET, "debug", demo)).toBe(false);
    expect(verifySessionToken(SECRET, "demo", debug)).toBe(false);
  });

  it("rejects tampered, foreign-secret, malformed and expired tokens", () => {
    const token = createSessionToken(SECRET, "debug");
    const [payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ s: "debug", exp: 9_999_999_999 })).toString("base64url");
    expect(verifySessionToken(SECRET, "debug", `${forgedPayload}.${signature}`)).toBe(false);
    expect(verifySessionToken(SECRET, "debug", `${payload}.${signature}x`)).toBe(false);
    expect(verifySessionToken("t".repeat(40), "debug", token)).toBe(false);
    expect(verifySessionToken(SECRET, "debug", undefined)).toBe(false);
    expect(verifySessionToken(SECRET, "debug", "a.b.c")).toBe(false);
    expect(verifySessionToken(SECRET, "debug", "x".repeat(600))).toBe(false);
    const issued = Date.parse("2026-10-25T00:00:00Z");
    const old = createSessionToken(SECRET, "debug", issued);
    expect(verifySessionToken(SECRET, "debug", old, issued + 7 * 3600_000)).toBe(true);
    expect(verifySessionToken(SECRET, "debug", old, issued + 9 * 3600_000)).toBe(false); // 8 h lifetime
  });

  it("compares passwords exactly", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("correct horse ", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });

  it("issues HttpOnly cookies with separate names and stricter debug settings", () => {
    const demo = sessionCookie("demo", "t", true);
    const debug = sessionCookie("debug", "t", true);
    expect(demo).toMatchObject({ name: "sl_demo", httpOnly: true, secure: true, sameSite: "lax" });
    expect(debug).toMatchObject({ name: "sl_debug", httpOnly: true, secure: true, sameSite: "strict" });
    expect(debug.maxAge).toBeLessThan(demo.maxAge);
  });

  it("derives a hashed client id and never exposes the raw IP", () => {
    const id = clientId(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), SECRET);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain("203");
    expect(clientId(new Headers({ "x-real-ip": "203.0.113.7" }), SECRET)).toBe(id);
    expect(clientId(new Headers(), SECRET)).not.toBe(id);
  });
});
