import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";

vi.mock("../config.js", () => ({
  config: {
    helm: {
      chartPath: "../charts/comfyui",
      namespace: "test-ns",
      releasePrefix: "comfyui-",
    },
  },
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from("deadbeef01234567")),
}));

import { listInstances, createInstance, deleteInstance } from "../services/helm.js";

const mockExecFile = vi.mocked(execFile);

/**
 * Helper to configure mockExecFile to resolve with a given stdout value
 * based on the command and args.
 */
function mockExecSuccess(command: string, argsMatch: string[], stdout: string) {
  mockExecFile.mockImplementation(
    ((cmd: string, args: string[], opts: unknown, cb: Function) => {
      if (cmd === command && argsMatch.every((a) => args.includes(a))) {
        cb(null, { stdout });
      } else {
        cb(null, { stdout: "" });
      }
    }) as any
  );
}

/**
 * Configure mockExecFile to handle multiple different commands.
 */
function mockExecMulti(handlers: { cmd: string; match: string[]; stdout: string }[]) {
  mockExecFile.mockImplementation(
    ((cmd: string, args: string[], opts: unknown, cb: Function) => {
      for (const h of handlers) {
        if (cmd === h.cmd && h.match.every((a) => args.includes(a))) {
          cb(null, { stdout: h.stdout });
          return;
        }
      }
      cb(null, { stdout: "" });
    }) as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listInstances", () => {
  it("should parse helm list output and enrich with pod/route/password data", async () => {
    const helmListOutput = JSON.stringify([
      {
        name: "comfyui-alice",
        namespace: "test-ns",
        revision: "1",
        updated: "2026-01-01",
        status: "deployed",
        chart: "comfyui-0.1.0",
        app_version: "0.1.0",
      },
    ]);

    const podJson = JSON.stringify({
      items: [
        {
          metadata: { name: "comfyui-alice-abc123" },
          status: {
            phase: "Running",
            containerStatuses: [
              {
                ready: true,
                restartCount: 0,
                state: {},
              },
            ],
          },
        },
      ],
    });

    const passwordB64 = Buffer.from("secret123").toString("base64");

    mockExecMulti([
      { cmd: "helm", match: ["list"], stdout: helmListOutput },
      { cmd: "kubectl", match: ["get", "pods"], stdout: podJson },
      { cmd: "kubectl", match: ["get", "route"], stdout: "comfyui-alice.example.com" },
      { cmd: "kubectl", match: ["get", "secret"], stdout: passwordB64 },
    ]);

    const instances = await listInstances();

    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      name: "comfyui-alice",
      username: "alice",
      status: "deployed",
      routeUrl: "https://comfyui-alice.example.com",
      password: "secret123",
    });
    expect(instances[0].pods).toHaveLength(1);
    expect(instances[0].pods[0]).toMatchObject({
      name: "comfyui-alice-abc123",
      phase: "Running",
      ready: true,
      restarts: 0,
    });
  });

  it("should return empty array when no releases exist", async () => {
    mockExecSuccess("helm", ["list"], "[]");

    const instances = await listInstances();
    expect(instances).toEqual([]);
  });

  it("should handle kubectl errors gracefully for pods/route/password", async () => {
    const helmListOutput = JSON.stringify([
      {
        name: "comfyui-bob",
        namespace: "test-ns",
        revision: "1",
        updated: "2026-01-01",
        status: "deployed",
        chart: "comfyui-0.1.0",
        app_version: "0.1.0",
      },
    ]);

    // helm list succeeds, but all kubectl calls fail
    mockExecFile.mockImplementation(
      ((cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        if (cmd === "helm") {
          cb(null, { stdout: helmListOutput });
        } else {
          cb(new Error("kubectl not available"));
        }
      }) as any
    );

    const instances = await listInstances();

    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      name: "comfyui-bob",
      username: "bob",
      routeUrl: "",
      password: "",
      pods: [],
    });
  });
});

describe("createInstance", () => {
  it("should generate a password and run helm install", async () => {
    mockExecMulti([
      { cmd: "helm", match: ["install"], stdout: "" },
      { cmd: "kubectl", match: ["get", "route"], stdout: "comfyui-alice.example.com" },
      { cmd: "kubectl", match: ["get", "pods"], stdout: JSON.stringify({ items: [] }) },
    ]);

    const instance = await createInstance("alice");

    expect(instance.name).toBe("comfyui-alice");
    expect(instance.username).toBe("alice");
    expect(instance.status).toBe("deployed");
    expect(instance.password).toHaveLength(32); // 16 random bytes = 32 hex chars
    expect(instance.routeUrl).toBe("https://comfyui-alice.example.com");

    // Verify helm install was called with correct args
    const helmCall = mockExecFile.mock.calls.find(
      (c: any[]) => c[0] === "helm" && c[1].includes("install")
    );
    expect(helmCall).toBeDefined();
    expect(helmCall![1]).toContain("comfyui-alice");
    expect(helmCall![1]).toContain("../charts/comfyui");
    expect(helmCall![1]).toContain("--namespace");
    expect(helmCall![1]).toContain("test-ns");
  });

  it("should create instance with suffix", async () => {
    mockExecMulti([
      { cmd: "helm", match: ["install"], stdout: "" },
      { cmd: "kubectl", match: ["get", "route"], stdout: "" },
      { cmd: "kubectl", match: ["get", "pods"], stdout: JSON.stringify({ items: [] }) },
    ]);

    const instance = await createInstance("alice", "dev");

    expect(instance.name).toBe("comfyui-alice-dev");
  });

  it("should lowercase the username in the release name", async () => {
    mockExecMulti([
      { cmd: "helm", match: ["install"], stdout: "" },
      { cmd: "kubectl", match: ["get", "route"], stdout: "" },
      { cmd: "kubectl", match: ["get", "pods"], stdout: JSON.stringify({ items: [] }) },
    ]);

    const instance = await createInstance("Alice");

    expect(instance.name).toBe("comfyui-alice");
  });
});

describe("deleteInstance", () => {
  it("should run helm uninstall with correct args", async () => {
    mockExecFile.mockImplementation(
      ((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: "" });
      }) as any
    );

    await deleteInstance("comfyui-alice");

    const helmCall = mockExecFile.mock.calls.find(
      (c: any[]) => c[0] === "helm" && c[1].includes("uninstall")
    );
    expect(helmCall).toBeDefined();
    expect(helmCall![1]).toContain("comfyui-alice");
    expect(helmCall![1]).toContain("--namespace");
    expect(helmCall![1]).toContain("test-ns");
  });

  it("should propagate errors from helm uninstall", async () => {
    mockExecFile.mockImplementation(
      ((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error("release not found"));
      }) as any
    );

    await expect(deleteInstance("comfyui-nonexistent")).rejects.toThrow(
      "release not found"
    );
  });
});

describe("pod status parsing", () => {
  it("should extract waiting reason as phase", async () => {
    const helmListOutput = JSON.stringify([
      {
        name: "comfyui-alice",
        namespace: "test-ns",
        revision: "1",
        updated: "2026-01-01",
        status: "deployed",
        chart: "comfyui-0.1.0",
        app_version: "0.1.0",
      },
    ]);

    const podJson = JSON.stringify({
      items: [
        {
          metadata: { name: "comfyui-alice-pod1" },
          status: {
            phase: "Pending",
            containerStatuses: [
              {
                ready: false,
                restartCount: 3,
                state: {
                  waiting: {
                    reason: "CrashLoopBackOff",
                    message: "back-off 5m0s restarting failed container",
                  },
                },
              },
            ],
          },
        },
      ],
    });

    mockExecMulti([
      { cmd: "helm", match: ["list"], stdout: helmListOutput },
      { cmd: "kubectl", match: ["get", "pods"], stdout: podJson },
      { cmd: "kubectl", match: ["get", "route"], stdout: "" },
      { cmd: "kubectl", match: ["get", "secret"], stdout: "" },
    ]);

    const instances = await listInstances();
    const pod = instances[0].pods[0];

    expect(pod.phase).toBe("CrashLoopBackOff");
    expect(pod.ready).toBe(false);
    expect(pod.restarts).toBe(3);
    expect(pod.message).toBe("back-off 5m0s restarting failed container");
  });

  it("should extract terminated reason as phase", async () => {
    const helmListOutput = JSON.stringify([
      {
        name: "comfyui-alice",
        namespace: "test-ns",
        revision: "1",
        updated: "2026-01-01",
        status: "deployed",
        chart: "comfyui-0.1.0",
        app_version: "0.1.0",
      },
    ]);

    const podJson = JSON.stringify({
      items: [
        {
          metadata: { name: "comfyui-alice-pod1" },
          status: {
            phase: "Failed",
            containerStatuses: [
              {
                ready: false,
                restartCount: 0,
                state: {
                  terminated: { reason: "OOMKilled" },
                },
              },
            ],
          },
        },
      ],
    });

    mockExecMulti([
      { cmd: "helm", match: ["list"], stdout: helmListOutput },
      { cmd: "kubectl", match: ["get", "pods"], stdout: podJson },
      { cmd: "kubectl", match: ["get", "route"], stdout: "" },
      { cmd: "kubectl", match: ["get", "secret"], stdout: "" },
    ]);

    const instances = await listInstances();
    expect(instances[0].pods[0].phase).toBe("OOMKilled");
  });

  it("should fall back to pod phase when no container status", async () => {
    const helmListOutput = JSON.stringify([
      {
        name: "comfyui-alice",
        namespace: "test-ns",
        revision: "1",
        updated: "2026-01-01",
        status: "deployed",
        chart: "comfyui-0.1.0",
        app_version: "0.1.0",
      },
    ]);

    const podJson = JSON.stringify({
      items: [
        {
          metadata: { name: "comfyui-alice-pod1" },
          status: {
            phase: "Pending",
          },
        },
      ],
    });

    mockExecMulti([
      { cmd: "helm", match: ["list"], stdout: helmListOutput },
      { cmd: "kubectl", match: ["get", "pods"], stdout: podJson },
      { cmd: "kubectl", match: ["get", "route"], stdout: "" },
      { cmd: "kubectl", match: ["get", "secret"], stdout: "" },
    ]);

    const instances = await listInstances();
    const pod = instances[0].pods[0];

    expect(pod.phase).toBe("Pending");
    expect(pod.ready).toBe(false);
    expect(pod.restarts).toBe(0);
  });

  it("should aggregate status across multiple containers", async () => {
    const helmListOutput = JSON.stringify([
      {
        name: "comfyui-alice",
        namespace: "test-ns",
        revision: "1",
        updated: "2026-01-01",
        status: "deployed",
        chart: "comfyui-0.1.0",
        app_version: "0.1.0",
      },
    ]);

    const podJson = JSON.stringify({
      items: [
        {
          metadata: { name: "comfyui-alice-pod1" },
          status: {
            phase: "Running",
            containerStatuses: [
              {
                name: "comfyui",
                ready: true,
                restartCount: 1,
                state: {},
              },
              {
                name: "nginx",
                ready: false,
                restartCount: 3,
                state: {
                  waiting: {
                    reason: "CrashLoopBackOff",
                    message: "back-off restarting",
                  },
                },
              },
            ],
          },
        },
      ],
    });

    mockExecMulti([
      { cmd: "helm", match: ["list"], stdout: helmListOutput },
      { cmd: "kubectl", match: ["get", "pods"], stdout: podJson },
      { cmd: "kubectl", match: ["get", "route"], stdout: "" },
      { cmd: "kubectl", match: ["get", "secret"], stdout: "" },
    ]);

    const instances = await listInstances();
    const pod = instances[0].pods[0];

    // Should report the worst state (nginx sidecar crash)
    expect(pod.phase).toBe("CrashLoopBackOff");
    expect(pod.ready).toBe(false);
    // Total restarts across both containers
    expect(pod.restarts).toBe(4);
    expect(pod.message).toBe("back-off restarting");
  });
});
