import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as helm from "../services/helm.js";
import { config } from "../config.js";

const RELEASE_NAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

const router = Router();

router.use(requireAuth);

router.get("/instances", async (_req, res) => {
  try {
    const instances = await helm.listInstances();
    res.json(instances);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
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
    const instance = await helm.createInstance(user.username, suffix);
    res.status(201).json(instance);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.delete("/instances/:name", async (req, res) => {
  try {
    const name = req.params.name;
    // Validate the release name format and ensure it belongs to a comfyui instance
    if (!RELEASE_NAME_RE.test(name) || !name.startsWith(config.helm.releasePrefix)) {
      res.status(400).json({ error: "Invalid instance name" });
      return;
    }
    await helm.deleteInstance(name);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
