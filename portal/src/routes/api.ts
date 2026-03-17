import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as helm from "../services/helm.js";

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
    const existing = await helm.getInstance(user.username);
    if (existing) {
      res.status(409).json({ error: "Instance already exists" });
      return;
    }
    const instance = await helm.createInstance(user.username);
    res.status(201).json(instance);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.delete("/instances/:username", async (req, res) => {
  try {
    await helm.deleteInstance(req.params.username);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
