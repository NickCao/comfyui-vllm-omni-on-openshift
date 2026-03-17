import { describe, it, expect, vi } from "vitest";
import express from "express";
import authRoutes from "../routes/auth.js";

/** Minimal Express app that mounts the auth router for testing. */
function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  return app;
}

/**
 * Lightweight helper to call a route handler directly without a real HTTP
 * server.  Express v5 routers can be invoked via `app.handle()` internally,
 * but the simplest approach is to build mock req/res objects that match what
 * the handlers actually use.
 */
function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    url: "/",
    isAuthenticated: vi.fn(() => false),
    user: undefined as unknown,
    logout: vi.fn((cb: () => void) => cb()),
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  return res;
}

describe("GET /auth/me", () => {
  // We test the handler logic directly since it doesn't depend on passport middleware
  it("should return user data when authenticated", () => {
    const handler = getRouteHandler(authRoutes, "get", "/me");
    const req = mockReq({
      isAuthenticated: vi.fn(() => true),
      user: {
        username: "alice",
        displayName: "Alice Smith",
        photos: [{ value: "https://example.com/avatar.png" }],
      },
    });
    const res = mockRes();

    handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      username: "alice",
      displayName: "Alice Smith",
      avatar: "https://example.com/avatar.png",
    });
  });

  it("should return empty avatar when photos is empty", () => {
    const handler = getRouteHandler(authRoutes, "get", "/me");
    const req = mockReq({
      isAuthenticated: vi.fn(() => true),
      user: {
        username: "bob",
        displayName: "Bob",
        photos: [],
      },
    });
    const res = mockRes();

    handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      username: "bob",
      displayName: "Bob",
      avatar: "",
    });
  });

  it("should return 401 when not authenticated", () => {
    const handler = getRouteHandler(authRoutes, "get", "/me");
    const req = mockReq({ isAuthenticated: vi.fn(() => false) });
    const res = mockRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
  });
});

describe("POST /auth/logout", () => {
  it("should call req.logout and return ok", () => {
    const handler = getRouteHandler(authRoutes, "post", "/logout");
    const req = mockReq({
      logout: vi.fn((cb: () => void) => cb()),
    });
    const res = mockRes();

    handler(req, res);

    expect(req.logout).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

/**
 * Extract a route handler from an Express Router by method and path.
 * This avoids needing to spin up an HTTP server for simple handler tests.
 */
function getRouteHandler(
  router: express.Router,
  method: string,
  path: string
): Function {
  const layer = (router as any).stack.find(
    (l: any) =>
      l.route &&
      l.route.path === path &&
      l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No ${method} ${path} route found`);
  // Return the last handler (skipping middleware like passport.authenticate)
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}
