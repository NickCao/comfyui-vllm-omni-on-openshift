import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    allowedUsers: ["alice", "bob"],
  },
}));

import { requireAuth } from "../middleware/auth.js";

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: vi.fn(() => false),
    user: undefined as unknown,
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("requireAuth middleware", () => {
  it("should return 401 when not authenticated", () => {
    const req = mockReq({ isAuthenticated: vi.fn(() => false) });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 when user is not in allowedUsers", () => {
    const req = mockReq({
      isAuthenticated: vi.fn(() => true),
      user: { username: "eve" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "User not authorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next when user is authenticated and authorized", () => {
    const req = mockReq({
      isAuthenticated: vi.fn(() => true),
      user: { username: "alice" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should compare usernames case-insensitively", () => {
    const req = mockReq({
      isAuthenticated: vi.fn(() => true),
      user: { username: "Alice" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should reject users not in the whitelist even if authenticated", () => {
    const req = mockReq({
      isAuthenticated: vi.fn(() => true),
      user: { username: "mallory" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
