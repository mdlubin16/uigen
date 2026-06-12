// @vitest-environment node
// auth.ts is server-only; jose's Uint8Array checks fail under jsdom's realm.
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { jwtVerify } from "jose";

// auth.ts is marked "server-only"; stub it so the module can load under vitest.
vi.mock("server-only", () => ({}));

// Shared fake cookie store returned by next/headers' cookies().
const { mockCookieStore } = vi.hoisted(() => ({
  mockCookieStore: {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

import { createSession } from "../auth";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");
const COOKIE_NAME = "auth-token";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSession", () => {
  test("stores the token under the auth-token cookie", async () => {
    await createSession("user-123", "test@example.com");

    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
    const [name, token] = mockCookieStore.set.mock.calls[0];
    expect(name).toBe(COOKIE_NAME);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  test("signs a JWT carrying the userId and email", async () => {
    await createSession("user-123", "test@example.com");

    const [, token] = mockCookieStore.set.mock.calls[0];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
  });

  test("sets a 7-day expiry on both the token and the cookie", async () => {
    const before = Date.now();
    await createSession("user-123", "test@example.com");
    const after = Date.now();

    const [, token, options] = mockCookieStore.set.mock.calls[0];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Cookie expiry is ~7 days out.
    const expires = options.expires as Date;
    expect(expires).toBeInstanceOf(Date);
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);

    // JWT exp claim (seconds) matches the 7-day window.
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.exp).toBeGreaterThanOrEqual(
      Math.floor((before + sevenDaysMs) / 1000)
    );
    expect(payload.exp).toBeLessThanOrEqual(
      Math.ceil((after + sevenDaysMs) / 1000)
    );
  });

  test("uses secure httpOnly cookie options", async () => {
    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  test("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.secure).toBe(true);
  });

  test("does not mark the cookie secure outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");

    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.secure).toBe(false);
  });

  test("produces a token that verifies against the signing secret", async () => {
    await createSession("user-123", "test@example.com");

    const [, token] = mockCookieStore.set.mock.calls[0];
    // jwtVerify rejects on a bad signature; resolving proves a valid HS256 token.
    await expect(jwtVerify(token, JWT_SECRET)).resolves.toBeDefined();
  });
});
