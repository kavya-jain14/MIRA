import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ControlRoomSnapshot, FeedPost, PersonaInit } from "@faultline/contracts";

import {
  ApiError,
  initializeAgent,
  retrieveControlRoom,
  retrieveFeed,
} from "../lib/api";

const STORAGE_KEY = "faultline.connectedAgentId";
const POLL_INTERVAL_MS = 30_000;

function readInitialAgentId(): string | null {
  const queryAgentId = new URLSearchParams(window.location.search).get("agentId");
  if (queryAgentId?.trim()) return queryAgentId.trim();
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function messageFor(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "An unexpected interface error occurred.";
}

export interface AgentControlRoomState {
  agentId: string | null;
  posts: FeedPost[];
  snapshot: ControlRoomSnapshot | null;
  feedError: string | null;
  telemetryError: string | null;
  initializationError: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isInitializing: boolean;
  lastSyncedAt: string | null;
  initialize: (persona: PersonaInit) => Promise<void>;
  connect: (agentId: string) => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

export function useAgentControlRoom(): AgentControlRoomState {
  const initializationVersion = useRef(0);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [agentId, setAgentId] = useState<string | null>(readInitialAgentId);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [snapshot, setSnapshot] = useState<ControlRoomSnapshot | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(agentId !== null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (agentId === null) return;
    activeRequest.current?.abort();
    const version = ++requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsRefreshing(true);

    const isCurrent = (): boolean =>
      !controller.signal.aborted && version === requestVersion.current;

    // Feed availability must not depend on control-room telemetry latency.
    const feedRequest = retrieveFeed(agentId, controller.signal).then(
      (result) => {
        if (!isCurrent()) return;
        setPosts(result);
        setFeedError(null);
        setLastSyncedAt(new Date().toISOString());
        setIsLoading(false);
      },
      (error: unknown) => {
        if (!isCurrent()) return;
        setFeedError(messageFor(error));
        setIsLoading(false);
      },
    );
    const telemetryRequest = retrieveControlRoom(agentId, controller.signal).then(
      (result) => {
        if (!isCurrent()) return;
        setSnapshot(result);
        setTelemetryError(null);
      },
      (error: unknown) => {
        if (!isCurrent()) return;
        setTelemetryError(messageFor(error));
      },
    );

    await Promise.all([feedRequest, telemetryRequest]);
    if (isCurrent()) setIsRefreshing(false);
  }, [agentId]);

  useEffect(() => {
    if (agentId === null) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(poll);
      activeRequest.current?.abort();
      requestVersion.current += 1;
    };
  }, [agentId, refresh]);

  const initialize = useCallback(async (persona: PersonaInit): Promise<void> => {
    const version = ++initializationVersion.current;
    setIsInitializing(true);
    setInitializationError(null);
    try {
      const initializedAgentId = await initializeAgent(persona);
      if (version !== initializationVersion.current) return;
      try { window.localStorage.setItem(STORAGE_KEY, initializedAgentId); } catch { /* Continue for this session. */ }
      activeRequest.current?.abort();
      requestVersion.current += 1;
      setPosts([]);
      setSnapshot(null);
      setLastSyncedAt(null);
      setAgentId(initializedAgentId);
      setIsLoading(true);
    } catch (error) {
      if (version === initializationVersion.current) setInitializationError(messageFor(error));
    } finally {
      if (version === initializationVersion.current) setIsInitializing(false);
    }
  }, []);

  const connect = useCallback((value: string): void => {
    const normalized = value.trim();
    if (!normalized) return;
    initializationVersion.current += 1;
    setIsInitializing(false);
    try { window.localStorage.setItem(STORAGE_KEY, normalized); } catch { /* Continue for this session. */ }
    activeRequest.current?.abort();
    requestVersion.current += 1;
    setPosts([]);
    setSnapshot(null);
    setLastSyncedAt(null);
    setInitializationError(null);
    setAgentId(normalized);
    setIsLoading(true);
  }, []);

  const disconnect = useCallback((): void => {
    initializationVersion.current += 1;
    setIsInitializing(false);
    setInitializationError(null);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Disconnect locally. */ }
    activeRequest.current?.abort();
    requestVersion.current += 1;
    setIsRefreshing(false);
    setAgentId(null);
    setPosts([]);
    setSnapshot(null);
    setFeedError(null);
    setTelemetryError(null);
    setLastSyncedAt(null);
    setIsLoading(false);
  }, []);

  return useMemo(
    () => ({
      agentId,
      posts,
      snapshot,
      feedError,
      telemetryError,
      initializationError,
      isLoading,
      isRefreshing,
      isInitializing,
      lastSyncedAt,
      initialize,
      connect,
      disconnect,
      refresh,
    }),
    [
      agentId,
      posts,
      snapshot,
      feedError,
      telemetryError,
      initializationError,
      isLoading,
      isRefreshing,
      isInitializing,
      lastSyncedAt,
      initialize,
      connect,
      disconnect,
      refresh,
    ],
  );
}
