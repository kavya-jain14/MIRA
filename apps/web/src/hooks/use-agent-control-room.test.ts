// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FeedPost } from "@faultline/contracts";
import { retrieveControlRoom, retrieveFeed } from "../lib/api";
import { useAgentControlRoom } from "./use-agent-control-room";

vi.mock("../lib/api", () => ({
  ApiError: class extends Error {},
  initializeAgent: vi.fn(),
  retrieveFeed: vi.fn(),
  retrieveControlRoom: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.mocked(retrieveControlRoom).mockRejectedValue(new Error("telemetry unavailable"));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

it("ignores an old feed response after disconnect", async () => {
  let resolveFeed!: (posts: FeedPost[]) => void;
  vi.mocked(retrieveFeed).mockImplementation(() => new Promise(resolve => { resolveFeed = resolve; }));
  window.localStorage.setItem("faultline.connectedAgentId", "old-agent");
  const { result } = renderHook(useAgentControlRoom);
  await waitFor(() => expect(retrieveFeed).toHaveBeenCalled());
  act(() => result.current.disconnect());
  await act(async () => resolveFeed([{id: "stale", createdAt: "2026-08-08T12:10:00Z", text: "old post", rationale: "old rationale", sources: ["https://example.com/source"]}]));
  expect(result.current.agentId).toBeNull();
  expect(result.current.posts).toEqual([]);
  expect(result.current.lastSyncedAt).toBeNull();
  expect(result.current.isRefreshing).toBe(false);
});

it("still connects when browser storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.mocked(retrieveFeed).mockResolvedValue([]);
  const { result } = renderHook(useAgentControlRoom);
  act(() => result.current.connect("session-agent"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.agentId).toBe("session-agent");
});

it("does not mark a failed feed request as a successful sync", async () => {
  vi.mocked(retrieveFeed).mockRejectedValue(new Error("offline"));
  window.localStorage.setItem("faultline.connectedAgentId", "agent");
  const { result } = renderHook(useAgentControlRoom);
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.lastSyncedAt).toBeNull();
  expect(result.current.feedError).not.toBeNull();
});
