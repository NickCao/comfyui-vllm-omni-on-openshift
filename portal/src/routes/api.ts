import { Router } from "express";
import { spawn } from "node:child_process";
import { requireAuth } from "../middleware/auth.js";
import { requireJson } from "../middleware/require-json.js";
import * as helm from "../services/helm.js";
import { config } from "../config.js";

const RELEASE_NAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const MAX_SUFFIX_LENGTH = 30;
/** Maximum duration for a log streaming SSE connection (30 minutes). */
const LOG_STREAM_TIMEOUT_MS = 30 * 60 * 1000;

/** Return a safe error message that does not leak internal details. */
function safeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Internal server error";
  const msg = err.message;
  // Only expose messages that look like user-facing Helm errors
  // (e.g. "cannot re-use a name that is still in use", "release not found").
  // Suppress messages containing filesystem paths or stack traces.
  if (/\/|\\|node_modules|ENOENT|EACCES|spawn/.test(msg)) {
    return "Internal server error";
  }
  return msg;
}

/** Return the expected release name prefix for a given user. */
function userPrefix(username: string): string {
  return `${config.helm.releasePrefix}${username.toLowerCase()}`;
}

/** Check whether a release name belongs to the given user. */
export function isOwnedBy(releaseName: string, username: string): boolean {
  const prefix = userPrefix(username);
  // Exact match (no suffix) or prefix followed by a hyphen (suffix separator)
  return releaseName === prefix || releaseName.startsWith(`${prefix}-`);
}

const router = Router();

router.use(requireAuth);
router.use(requireJson);

router.get("/instances", async (req, res) => {
  try {
    const user = req.user as { username: string };
    const instances = await helm.listInstances();
    const owned = instances.filter((i) => isOwnedBy(i.name, user.username));
    res.json(owned);
  } catch (err: unknown) {
    console.error("GET /api/instances failed:", err);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.post("/instances", async (req, res) => {
  try {
    const user = req.user as { username: string };
    const suffix = req.body?.name as string | undefined;
    if (suffix && !RELEASE_NAME_RE.test(suffix)) {
      res.status(400).json({ error: "Name must be lowercase alphanumeric with optional hyphens" });
      return;
    }
    if (suffix && suffix.length > MAX_SUFFIX_LENGTH) {
      res.status(400).json({ error: `Name must be at most ${MAX_SUFFIX_LENGTH} characters` });
      return;
    }
    const instance = await helm.createInstance(user.username, suffix);
    res.status(201).json(instance);
  } catch (err: unknown) {
    console.error("POST /api/instances failed:", err);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.delete("/instances/:name", async (req, res) => {
  try {
    const user = req.user as { username: string };
    const name = req.params.name;
    if (!RELEASE_NAME_RE.test(name) || !name.startsWith(config.helm.releasePrefix)) {
      res.status(400).json({ error: "Invalid instance name" });
      return;
    }
    if (!isOwnedBy(name, user.username)) {
      res.status(403).json({ error: "You can only delete your own instances" });
      return;
    }
    await helm.deleteInstance(name);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("DELETE /api/instances failed:", err);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.get("/instances/:name/logs", (req, res) => {
  const user = req.user as { username: string };
  const name = req.params.name;
  if (!RELEASE_NAME_RE.test(name) || !name.startsWith(config.helm.releasePrefix)) {
    res.status(400).json({ error: "Invalid instance name" });
    return;
  }
  if (!isOwnedBy(name, user.username)) {
    res.status(403).json({ error: "You can only view logs for your own instances" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const proc = spawn("kubectl", [
    "logs",
    "-f",
    "--tail=200",
    "-l", `app.kubernetes.io/instance=${name}`,
    "-c", "comfyui",
    "--namespace", config.helm.namespace,
  ]);

  const timeout = setTimeout(() => {
    proc.kill();
    res.write("event: close\ndata: stream timeout\n\n");
    res.end();
  }, LOG_STREAM_TIMEOUT_MS);

  proc.stdout.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) res.write(`data: ${line}\n\n`);
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line) res.write(`data: [stderr] ${line}\n\n`);
    }
  });

  proc.on("close", () => {
    clearTimeout(timeout);
    res.write("event: close\ndata: stream ended\n\n");
    res.end();
  });

  req.on("close", () => {
    clearTimeout(timeout);
    proc.kill();
  });
});

export default router;
