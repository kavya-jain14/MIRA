import { describe, expect, it, vi } from "vitest";

import { tick } from "./scheduler-tick.mjs";

function reply(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("scheduled wake/tick", () => {
  it("requires a configured API origin before making any request", async () => {
    const fetchImpl = vi.fn();
    for (const value of [undefined, "", "https://YOUR_RENDER_SERVICE.onrender.com", "https://mira.onrender.com/api", "https://user:secret@mira.onrender.com"]) {
      await expect(tick(value, { fetchImpl })).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries a sleeping backend and accepts a valid no-op tick", async () => {
    const result = { status: "ok", due: 0, completed: 0, failed: 0 };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({}, 503))
      .mockResolvedValueOnce(reply(result));
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(tick("https://mira.onrender.com/", { fetchImpl, wait })).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://mira.onrender.com/api/internal/scheduler/tick",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("fails on worker errors inside HTTP 200 without retrying them away", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ status: "ok", due: 1, completed: 0, failed: 1 }));
    await expect(tick("https://mira.onrender.com", { fetchImpl })).rejects.toThrow(/1 of 1 due agent/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects HTML and inconsistent scheduler counts", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("<html>Frontend</html>"))
      .mockResolvedValueOnce(reply({ status: "ok", due: 1, completed: 0, failed: 0 }));
    await expect(tick("https://mira.onrender.com", { fetchImpl })).rejects.toThrow(/non-JSON/);
    await expect(tick("https://mira.onrender.com", { fetchImpl })).rejects.toThrow(/valid scheduler result/);
  });

  it("bounds network retries and does not retry an HTTP 404", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(tick("https://mira.onrender.com", { fetchImpl, wait })).rejects.toThrow(/two attempts/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    const missing = vi.fn().mockResolvedValue(reply({}, 404));
    await expect(tick("https://mira.onrender.com", { fetchImpl: missing, wait })).rejects.toThrow(/HTTP 404/);
    expect(missing).toHaveBeenCalledTimes(1);
  });
});
