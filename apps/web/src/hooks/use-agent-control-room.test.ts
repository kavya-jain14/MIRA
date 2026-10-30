// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FeedPost } from "@faultline/contracts";
import { initializeAgent, retrieveControlRoom, retrieveFeed } from "../lib/api";
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

it("keeps an explicitly connected desk when an earlier initialization finishes", async () => {
  let resolveInitialization!: (agentId: string) => void;
  vi.mocked(initializeAgent).mockImplementation(() => new Promise(resolve => { resolveInitialization = resolve; }));
  vi.mocked(retrieveFeed).mockResolvedValue([]);
  const { result } = renderHook(useAgentControlRoom);
  let initialization!: Promise<void>;
  act(() => { initialization = result.current.initialize({ name: "Mira", domain: "reliability" }); });
  act(() => result.current.connect("existing-desk"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => { resolveInitialization("late-new-desk"); await initialization; });

  expect(result.current.agentId).toBe("existing-desk");
  expect(window.localStorage.getItem("faultline.connectedAgentId")).toBe("existing-desk");
  expect(result.current.isInitializing).toBe(false);
});

it("does not show an old initialization failure after connecting another desk", async () => {
  let rejectInitialization!: (error: Error) => void;
  vi.mocked(initializeAgent).mockImplementation(() => new Promise((_, reject) => { rejectInitialization = reject; }));
  vi.mocked(retrieveFeed).mockResolvedValue([]);
  const { result } = renderHook(useAgentControlRoom);
  let initialization!: Promise<void>;
  act(() => { initialization = result.current.initialize({ name: "Mira", domain: "reliability" }); });
  act(() => result.current.connect("existing-desk"));
  await act(async () => { rejectInitialization(new Error("late failure")); await initialization; });

  expect(result.current.agentId).toBe("existing-desk");
  expect(result.current.initializationError).toBeNull();
  expect(result.current.isInitializing).toBe(false);
});

it("stays disconnected when an earlier initialization resolves after a connection was closed", async () => {
  let resolveInitialization!: (agentId: string) => void;
  vi.mocked(initializeAgent).mockImplementation(() => new Promise(resolve => { resolveInitialization = resolve; }));
  vi.mocked(retrieveFeed).mockResolvedValue([]);
  const { result } = renderHook(useAgentControlRoom);
  let initialization!: Promise<void>;
  act(() => { initialization = result.current.initialize({ name: "Mira", domain: "reliability" }); });
  act(() => result.current.connect("existing-desk"));
  act(() => result.current.disconnect());
  await act(async () => { resolveInitialization("late-new-desk"); await initialization; });

  expect(result.current.agentId).toBeNull();
  expect(window.localStorage.getItem("faultline.connectedAgentId")).toBeNull();
  expect(result.current.isInitializing).toBe(false);
});

it("connects a current initialization result normally", async () => {
  vi.mocked(initializeAgent).mockResolvedValue("new-desk");
  vi.mocked(retrieveFeed).mockResolvedValue([]);
  const { result } = renderHook(useAgentControlRoom);
  await act(async () => { await result.current.initialize({ name: "Mira", domain: "reliability" }); });

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.agentId).toBe("new-desk");
  expect(window.localStorage.getItem("faultline.connectedAgentId")).toBe("new-desk");
  expect(result.current.isInitializing).toBe(false);
});

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

it("shows a healthy feed while telemetry is still pending", async () => {
  let rejectTelemetry!: (reason: Error) => void;
  vi.mocked(retrieveControlRoom).mockImplementation(() => new Promise((_, reject) => {
    rejectTelemetry = reject;
  }));
  const posts: FeedPost[] = [{
    id: "available", createdAt: "2026-08-08T12:10:00Z", text: "Available post",
    rationale: "Evidence is available.", sources: ["https://example.com/source"],
  }];
  vi.mocked(retrieveFeed).mockResolvedValue(posts);
  window.localStorage.setItem("faultline.connectedAgentId", "agent");
  const { result } = renderHook(useAgentControlRoom);

  await waitFor(() => expect(result.current.posts).toEqual(posts));
  expect(result.current.isLoading).toBe(false);
  expect(result.current.lastSyncedAt).not.toBeNull();
  expect(result.current.isRefreshing).toBe(true);

  await act(async () => rejectTelemetry(new Error("telemetry unavailable")));
  expect(result.current.posts).toEqual(posts);
  expect(result.current.telemetryError).not.toBeNull();
  expect(result.current.isRefreshing).toBe(false);
});

it("reports feed failure without waiting for telemetry", async () => {
  vi.mocked(retrieveControlRoom).mockImplementation(() => new Promise(() => {}));
  vi.mocked(retrieveFeed).mockRejectedValue(new Error("feed unavailable"));
  window.localStorage.setItem("faultline.connectedAgentId", "agent");
  const { result } = renderHook(useAgentControlRoom);

  await waitFor(() => expect(result.current.feedError).not.toBeNull());
  expect(result.current.isLoading).toBe(false);
  expect(result.current.lastSyncedAt).toBeNull();
  act(() => result.current.disconnect());
  expect(result.current.isRefreshing).toBe(false);
});

it("ignores a late telemetry failure after the feed settles and disconnects", async () => {
  let rejectTelemetry!: (reason: Error) => void;
  vi.mocked(retrieveControlRoom).mockImplementation(() => new Promise((_, reject) => {
    rejectTelemetry = reject;
  }));
  vi.mocked(retrieveFeed).mockResolvedValue([]);
  window.localStorage.setItem("faultline.connectedAgentId", "agent");
  const { result } = renderHook(useAgentControlRoom);

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.disconnect());
  await act(async () => rejectTelemetry(new Error("stale telemetry")));

  expect(result.current.telemetryError).toBeNull();
  expect(result.current.lastSyncedAt).toBeNull();
  expect(result.current.isRefreshing).toBe(false);
});
