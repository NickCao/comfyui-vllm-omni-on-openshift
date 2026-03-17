import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as { username: string };
  if (!config.allowedUsers.includes(user.username.toLowerCase())) {
    res.status(403).json({ error: "User not authorized" });
    return;
  }
  next();
}
