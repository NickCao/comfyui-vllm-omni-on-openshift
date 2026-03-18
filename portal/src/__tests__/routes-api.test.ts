import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the router
vi.mock("../config.js", () => ({
  config: {
    allowedUsers: ["alice"],
    helm: {
      chartPath: "../charts/comfyui",
      namespace: "test-ns",
      releasePrefix: "comfyui-",
    },
  },
}));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../middleware/require-json.js", () => ({
  requireJson: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../services/helm.js", () => ({
  listInstances: vi.fn(),
  createInstance: vi.fn(),
  deleteInstance: vi.fn(),
}));

import * as helm from "../services/helm.js";
import apiRoutes, { isOwnedBy } from "../routes/api.js";

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    url: "/",
    params: {},
    body: {},
    user: { username: "alice" },
    on: vi.fn(),
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.write = vi.fn();
  res.end = vi.fn();
  res.writeHead = vi.fn();
  return res;
}

function getRouteHandler(
  router: any,
  method: string,
  path: string
): Function {
  const layer = router.stack.find(
    (l: any) =>
      l.route &&
      l.route.path === path &&
      l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No ${method} ${path} route found`);
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

describe("GET /api/instances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return only the current user's instances", async () => {
    const allInstances = [
      {
        name: "comfyui-alice",
        username: "alice",
        status: "deployed",
        updated: "2026-01-01",
        routeUrl: "https://comfyui-alice.example.com",
        password: "abc123",
        pods: [],
      },
      {
        name: "comfyui-bob",
        username: "bob",
        status: "deployed",
        updated: "2026-01-01",
        routeUrl: "https://comfyui-bob.example.com",
        password: "def456",
        pods: [],
      },
      {
        name: "comfyui-alice-dev",
        username: "alice",
        status: "deployed",
        updated: "2026-01-01",
        routeUrl: "",
        password: "ghi789",
        pods: [],
      },
    ];
    vi.mocked(helm.listInstances).mockResolvedValue(allInstances);

    const handler = getRouteHandler(apiRoutes, "get", "/instances");
    const req = mockReq({ user: { username: "alice" } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.listInstances).toHaveBeenCalled();
    const returned = res.json.mock.calls[0][0];
    expect(returned).toHaveLength(2);
    expect(returned.every((i: any) => i.name.startsWith("comfyui-alice"))).toBe(true);
  });

  it("should return 500 when helm service throws", async () => {
    vi.mocked(helm.listInstances).mockRejectedValue(new Error("helm failed"));

    const handler = getRouteHandler(apiRoutes, "get", "/instances");
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "helm failed" });
  });
});

describe("POST /api/instances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create an instance without suffix", async () => {
    const mockInstance = {
      name: "comfyui-alice",
      username: "alice",
      status: "deployed",
      updated: "2026-01-01",
      routeUrl: "",
      password: "generated",
      pods: [],
    };
    vi.mocked(helm.createInstance).mockResolvedValue(mockInstance);

    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: {} });
    const res = mockRes();
    await handler(req, res);

    expect(helm.createInstance).toHaveBeenCalledWith("alice", undefined);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockInstance);
  });

  it("should create an instance with a valid suffix", async () => {
    const mockInstance = {
      name: "comfyui-alice-test",
      username: "alice",
      status: "deployed",
      updated: "2026-01-01",
      routeUrl: "",
      password: "generated",
      pods: [],
    };
    vi.mocked(helm.createInstance).mockResolvedValue(mockInstance);

    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: { name: "test" } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.createInstance).toHaveBeenCalledWith("alice", "test");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should reject invalid suffix with 400", async () => {
    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: { name: "INVALID_NAME!" } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.createInstance).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Name must be lowercase alphanumeric with optional hyphens",
    });
  });

  it("should reject suffix starting with a hyphen", async () => {
    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: { name: "-invalid" } });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should reject suffix exceeding 30 characters", async () => {
    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: { name: "a".repeat(31) } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.createInstance).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Name must be at most 30 characters",
    });
  });

  it("should accept suffix of exactly 30 characters", async () => {
    vi.mocked(helm.createInstance).mockResolvedValue({
      name: "comfyui-alice-" + "a".repeat(30),
      username: "alice",
      status: "deployed",
      updated: "",
      routeUrl: "",
      password: "",
      pods: [],
    });

    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: { name: "a".repeat(30) } });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(helm.createInstance).toHaveBeenCalled();
  });

  it("should return 500 when helm service throws", async () => {
    vi.mocked(helm.createInstance).mockRejectedValue(
      new Error("already exists")
    );

    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: {} });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "already exists" });
  });
});

describe("DELETE /api/instances/:name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete a valid instance", async () => {
    vi.mocked(helm.deleteInstance).mockResolvedValue(undefined);

    const handler = getRouteHandler(apiRoutes, "delete", "/instances/:name");
    const req = mockReq({ params: { name: "comfyui-alice" } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.deleteInstance).toHaveBeenCalledWith("comfyui-alice");
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("should reject names not starting with comfyui- prefix", async () => {
    const handler = getRouteHandler(apiRoutes, "delete", "/instances/:name");
    const req = mockReq({ params: { name: "other-release" } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.deleteInstance).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid instance name" });
  });

  it("should reject names with invalid characters", async () => {
    const handler = getRouteHandler(apiRoutes, "delete", "/instances/:name");
    const req = mockReq({ params: { name: "comfyui-INVALID!" } });
    const res = mockRes();
    await handler(req, res);

    expect(helm.deleteInstance).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should reject deleting another user's instance with 403", async () => {
    const handler = getRouteHandler(apiRoutes, "delete", "/instances/:name");
    const req = mockReq({
      params: { name: "comfyui-bob" },
      user: { username: "alice" },
    });
    const res = mockRes();
    await handler(req, res);

    expect(helm.deleteInstance).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "You can only delete your own instances" });
  });

  it("should allow deleting own instance with suffix", async () => {
    vi.mocked(helm.deleteInstance).mockResolvedValue(undefined);

    const handler = getRouteHandler(apiRoutes, "delete", "/instances/:name");
    const req = mockReq({
      params: { name: "comfyui-alice-dev" },
      user: { username: "alice" },
    });
    const res = mockRes();
    await handler(req, res);

    expect(helm.deleteInstance).toHaveBeenCalledWith("comfyui-alice-dev");
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("should return 500 when helm service throws", async () => {
    vi.mocked(helm.deleteInstance).mockRejectedValue(
      new Error("not found")
    );

    const handler = getRouteHandler(apiRoutes, "delete", "/instances/:name");
    const req = mockReq({ params: { name: "comfyui-alice" } });
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "not found" });
  });
});

describe("release name validation regex", () => {
  // The regex is used in POST and DELETE handlers.
  // We test it indirectly via the POST handler's suffix validation.
  const testSuffix = async (name: string, shouldPass: boolean) => {
    vi.mocked(helm.createInstance).mockResolvedValue({
      name: `comfyui-alice-${name}`,
      username: "alice",
      status: "deployed",
      updated: "",
      routeUrl: "",
      password: "",
      pods: [],
    });

    const handler = getRouteHandler(apiRoutes, "post", "/instances");
    const req = mockReq({ body: { name } });
    const res = mockRes();
    await handler(req, res);

    if (shouldPass) {
      expect(res.status).not.toHaveBeenCalledWith(400);
    } else {
      expect(res.status).toHaveBeenCalledWith(400);
    }
  };

  it("should accept lowercase alphanumeric", () => testSuffix("test1", true));
  it("should accept names with hyphens", () => testSuffix("my-test", true));
  it("should accept names with dots", () => testSuffix("v1.0", true));
  it("should accept single character", () => testSuffix("a", true));
  it("should reject uppercase letters", () => testSuffix("Test", false));
  it("should reject underscores", () => testSuffix("my_test", false));
  it("should reject names ending with hyphen", () => testSuffix("test-", false));
  it("should reject spaces", () => testSuffix("my test", false));
});

describe("isOwnedBy", () => {
  it("should match exact release name (no suffix)", () => {
    expect(isOwnedBy("comfyui-alice", "alice")).toBe(true);
  });

  it("should match release name with suffix", () => {
    expect(isOwnedBy("comfyui-alice-dev", "alice")).toBe(true);
  });

  it("should be case-insensitive for username", () => {
    expect(isOwnedBy("comfyui-alice", "Alice")).toBe(true);
  });

  it("should not match another user's instance", () => {
    expect(isOwnedBy("comfyui-bob", "alice")).toBe(false);
  });

  it("should not match partial username overlap", () => {
    // comfyui-ali should NOT be owned by alice
    expect(isOwnedBy("comfyui-ali", "alice")).toBe(false);
  });

  it("should not match when username is a prefix of another", () => {
    // comfyui-alicex should NOT be owned by alice
    expect(isOwnedBy("comfyui-alicex", "alice")).toBe(false);
  });
});
