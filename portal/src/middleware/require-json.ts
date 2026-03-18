import type { Request, Response, NextFunction } from "express";

/**
 * CSRF protection middleware for mutating endpoints.
 *
 * Requires that POST, PUT, PATCH, and DELETE requests carry a
 * Content-Type of application/json. Browsers cannot send cross-origin
 * requests with this content type from forms or simple XHR without
 * triggering a CORS preflight, which the server does not allow.
 */
export function requireJson(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const ct = req.headers["content-type"] || "";
    if (!ct.includes("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json" });
      return;
    }
  }
  next();
}
