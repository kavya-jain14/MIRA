import {
  ControlRoomSnapshotSchema,
  FeedResponseSchema,
  InitializeAgentResponseSchema,
  type ControlRoomSnapshot,
  type FeedPost,
  type PersonaInit,
} from "@faultline/contracts";
import type { ZodType } from "zod";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredBaseUrl?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  public readonly status: number | null;

  public constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("MIRA could not reach the API.");
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
      ) {
        detail = payload.message;
      }
    } catch {
      // The status code remains the authoritative fallback.
    }
    throw new ApiError(detail, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The API returned an unreadable response.", response.status);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("The API response did not match the MIRA contract.");
  }
  return parsed.data;
}

export async function initializeAgent(persona: PersonaInit): Promise<string> {
  const response = await request(
    "/api/agent/init",
    InitializeAgentResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({ persona }),
    },
  );
  return response.agentId;
}

export async function retrieveFeed(
  agentId: string,
  signal?: AbortSignal,
): Promise<FeedPost[]> {
  const options: RequestInit = { method: "GET" };
  if (signal !== undefined) options.signal = signal;

  const response = await request(
    `/api/agent/feed?agentId=${encodeURIComponent(agentId)}`,
    FeedResponseSchema,
    options,
  );

  return [...response.posts].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function retrieveControlRoom(
  agentId: string,
  signal?: AbortSignal,
): Promise<ControlRoomSnapshot> {
  const options: RequestInit = { method: "GET" };
  if (signal !== undefined) options.signal = signal;

  return request(
    `/api/agent/control-room?agentId=${encodeURIComponent(agentId)}`,
    ControlRoomSnapshotSchema,
    options,
  );
}
