import { describe, it, expect, vi } from "vitest";
import { requireJson } from "../middleware/require-json.js";

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    headers: {} as Record<string, string>,
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("requireJson middleware", () => {
  it("should pass through GET requests without Content-Type", () => {
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should reject POST without application/json Content-Type", () => {
    const req = mockReq({ method: "POST", headers: {} });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json).toHaveBeenCalledWith({ error: "Content-Type must be application/json" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject DELETE without application/json Content-Type", () => {
    const req = mockReq({ method: "DELETE", headers: {} });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(res.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });

  it("should pass POST with application/json Content-Type", () => {
    const req = mockReq({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should pass DELETE with application/json Content-Type", () => {
    const req = mockReq({
      method: "DELETE",
      headers: { "content-type": "application/json" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should accept Content-Type with charset parameter", () => {
    const req = mockReq({
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should reject POST with form-urlencoded Content-Type", () => {
    const req = mockReq({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const res = mockRes();
    const next = vi.fn();

    requireJson(req, res, next);

    expect(res.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });
});
