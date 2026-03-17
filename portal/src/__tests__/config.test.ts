import { describe, it, expect, beforeEach, vi } from "vitest";

describe("config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig() {
    const mod = await import("../config.js");
    return mod.config;
  }

  describe("port", () => {
    it("should default to 3000", async () => {
      const config = await loadConfig();
      expect(config.port).toBe(3000);
    });

    it("should read from PORT env var", async () => {
      vi.stubEnv("PORT", "8080");
      const config = await loadConfig();
      expect(config.port).toBe(8080);
    });
  });

  describe("sessionSecret", () => {
    it("should have a default value", async () => {
      const config = await loadConfig();
      expect(config.sessionSecret).toBe("change-me-in-production");
    });

    it("should read from SESSION_SECRET env var", async () => {
      vi.stubEnv("SESSION_SECRET", "my-secret");
      const config = await loadConfig();
      expect(config.sessionSecret).toBe("my-secret");
    });
  });

  describe("allowedUsers", () => {
    it("should default to empty array", async () => {
      const config = await loadConfig();
      expect(config.allowedUsers).toEqual([]);
    });

    it("should parse comma-separated usernames", async () => {
      vi.stubEnv("ALLOWED_GITHUB_USERS", "alice,bob,charlie");
      const config = await loadConfig();
      expect(config.allowedUsers).toEqual(["alice", "bob", "charlie"]);
    });

    it("should lowercase usernames", async () => {
      vi.stubEnv("ALLOWED_GITHUB_USERS", "Alice,BOB");
      const config = await loadConfig();
      expect(config.allowedUsers).toEqual(["alice", "bob"]);
    });

    it("should trim whitespace", async () => {
      vi.stubEnv("ALLOWED_GITHUB_USERS", " alice , bob ");
      const config = await loadConfig();
      expect(config.allowedUsers).toEqual(["alice", "bob"]);
    });

    it("should filter empty entries", async () => {
      vi.stubEnv("ALLOWED_GITHUB_USERS", "alice,,bob,");
      const config = await loadConfig();
      expect(config.allowedUsers).toEqual(["alice", "bob"]);
    });
  });

  describe("github", () => {
    it("should have empty defaults", async () => {
      const config = await loadConfig();
      expect(config.github.clientID).toBe("");
      expect(config.github.clientSecret).toBe("");
      expect(config.github.callbackURL).toBe(
        "http://localhost:3000/auth/github/callback"
      );
    });

    it("should read from env vars", async () => {
      vi.stubEnv("GITHUB_CLIENT_ID", "my-id");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "my-secret");
      vi.stubEnv("GITHUB_CALLBACK_URL", "https://example.com/callback");
      const config = await loadConfig();
      expect(config.github.clientID).toBe("my-id");
      expect(config.github.clientSecret).toBe("my-secret");
      expect(config.github.callbackURL).toBe("https://example.com/callback");
    });
  });

  describe("helm", () => {
    it("should have correct defaults", async () => {
      const config = await loadConfig();
      expect(config.helm.chartPath).toBe("../charts/comfyui");
      expect(config.helm.namespace).toBe("comfyui-vllm-omni");
      expect(config.helm.releasePrefix).toBe("comfyui-");
    });

    it("should read chartPath and namespace from env vars", async () => {
      vi.stubEnv("COMFYUI_CHART_PATH", "/opt/charts/comfyui");
      vi.stubEnv("COMFYUI_NAMESPACE", "my-namespace");
      const config = await loadConfig();
      expect(config.helm.chartPath).toBe("/opt/charts/comfyui");
      expect(config.helm.namespace).toBe("my-namespace");
    });
  });
});
