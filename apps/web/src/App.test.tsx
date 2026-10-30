// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const snapshot = {
  agentId: "agent-mira",
  autonomy: {
    initializedAt: "2026-08-08T12:00:00Z",
    lastRunAt: "2026-08-08T12:30:00Z",
    nextRunAt: "2026-08-08T13:00:00Z",
    postsPublished: 2,
    candidatesRejected: 1,
    workerState: "idle",
  },
  editorialLedger: [
    {
      id: "decision-1",
      title: "Benchmark claim without reproducible evidence",
      finalScore: 48,
      reason: "The primary evidence was insufficient for a material claim.",
      sourceUrl: "https://example.com/rejected",
      decidedAt: "2026-08-08T12:25:00Z",
    },
  ],
  runs: [
    {
      id: "run-1",
      startedAt: "2026-08-08T12:29:00Z",
      completedAt: "2026-08-08T12:30:00Z",
      status: "completed",
      discovered: 3,
      rejected: 1,
      published: 2,
      summary: "Two reliability signals cleared the editorial threshold.",
    },
  ],
  health: [
    {
      key: "worker",
      label: "Autonomous worker",
      state: "healthy",
      detail: "Heartbeat received on schedule.",
      checkedAt: "2026-08-08T12:30:00Z",
    },
  ],
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installConnectedApi(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/agent/control-room")) return response(snapshot);
    if (url.includes("/api/agent/feed")) {
      return response({
        posts: [
          {
            id: "older",
            createdAt: "2026-08-08T12:10:00Z",
            text: "Older reliability note",
            rationale: "Selected for practical relevance at the time.",
            sources: ["https://example.com/older"],
          },
          {
            id: "newer",
            createdAt: "2026-08-08T12:20:00Z",
            text: "Signal — ### **Newest reliability note**\n\nFault line — Builder risk increased.\n\nBuilder move — Patch the exposed path now.",
            rationale: "Selected because a primary source changed builder risk now.",
            sources: ["https://research.example.com/newer"],
          },
        ],
      });
    }
    if (url.includes("/api/agent/init")) return response({ agentId: "agent-mira" });
    return response({ message: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MIRA control room", () => {
  it("keeps the feed and theme usable when browser storage access is denied", async () => {
    const user = userEvent.setup();
    installConnectedApi();
    window.history.replaceState({}, "", "/?agentId=agent-mira");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access denied", "SecurityError");
    });

    render(<App />);

    expect(await screen.findByText("Newest reliability note")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await user.click(screen.getByRole("button", { name: /disconnect view/i }));
    expect(screen.getByText("The signal is noisy.")).toBeVisible();
  });

  it("uses the saved theme and permits toggling when theme persistence fails", async () => {
    const user = userEvent.setup();
    const fetchMock = installConnectedApi();
    window.localStorage.setItem("faultline.theme", "dark");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });

    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await user.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(screen.getByText("The signal is noisy.")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the API before deliberate initialization", () => {
    const fetchMock = installConnectedApi();
    render(<App />);

    expect(screen.getByText("The signal is noisy.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MIRA home" })).toBeVisible();
    expect(screen.getAllByText("MIRA").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/Machine Intelligence for Reliability & Assurance/i),
    ).toBeVisible();
    expect(
      screen.getByText("Mira publishes only when the signal earns it."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Publish threshold 72 out of 100")).toBeVisible();
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains autonomous behavior and remembers the chosen theme", async () => {
    const user = userEvent.setup();
    installConnectedApi();
    window.localStorage.setItem("faultline.connectedAgentId", "agent-mira");
    render(<App />);

    expect(
      await screen.findByText("A feed shaped by decisions, not volume."),
    ).toBeVisible();
    expect(
      screen.getByText(/Machine Intelligence for Reliability & Assurance/i),
    ).toBeVisible();
    expect(screen.getByText(/open Topics skipped to audit/i)).toBeVisible();
    expect(screen.getByText("live evidence")).toBeVisible();
    expect(screen.getByText("the claim")).toBeVisible();
    expect(screen.getByText("prior coverage")).toBeVisible();
    expect(screen.getByText(/Most feeds reward recency/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("faultline.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeVisible();
  });

  it("initializes once, polls both read endpoints, and renders newest first", async () => {
    const user = userEvent.setup();
    const fetchMock = installConnectedApi();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /initialize autonomous editor/i }));

    await screen.findByRole("heading", { name: "Mira" });
    const initCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/agent/init"),
    );
    expect(initCall?.[1]).toMatchObject({ method: "POST" });

    await screen.findByText("Newest reliability note");
    expect(document.body).not.toHaveTextContent("###");
    expect(document.body).not.toHaveTextContent("**Newest reliability note**");
    expect(screen.getByText("What happened")).toBeVisible();
    expect(screen.getByText("Why it matters")).toBeVisible();
    expect(screen.getByText("What builders should do")).toBeVisible();
    const cards = document.querySelectorAll(".feed-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0] as HTMLElement).getByText("Newest reliability note")).toBeVisible();
    expect(screen.getByText(/primary source changed builder risk now/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /research.example.com/i })).toBeVisible();

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/agent/feed"))).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/api/agent/control-room")),
    ).toBe(true);
  });

  it("shows intentional rejection evidence without relying on color", async () => {
    const user = userEvent.setup();
    installConnectedApi();
    window.localStorage.setItem("faultline.connectedAgentId", "agent-mira");
    render(<App />);

    await screen.findByText("Newest reliability note");
    await user.click(screen.getByRole("button", { name: /topics skipped/i }));

    expect(
      screen.getAllByText("Benchmark claim without reproducible evidence"),
    ).toHaveLength(2);
    expect(screen.getByLabelText("Rejected")).toBeVisible();
    expect(screen.getByLabelText("Editorial score 48 out of 100")).toBeVisible();
  });

  it("keeps the published feed readable when telemetry is unavailable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/agent/control-room")) {
        return response({ message: "worker telemetry unavailable" }, 503);
      }
      return response({
        posts: [
          {
            id: "post-1",
            createdAt: "2026-08-08T12:20:00Z",
            text: "Verified post remains readable",
            rationale: "The feed endpoint remains independent from telemetry.",
            sources: ["https://example.com/source"],
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("faultline.connectedAgentId", "agent-mira");

    render(<App />);

    await screen.findByText("Verified post remains readable");
    await waitFor(() =>
      expect(screen.getByText("Operational telemetry is degraded")).toBeVisible(),
    );
    expect(screen.getByText("Verified post remains readable")).toBeVisible();
  });

  it("shows a deliberate source-outage state without making the feed look broken", async () => {
    const offlineSnapshot = {
      ...snapshot,
      health: [
        {
          key: "sources",
          label: "Primary sources",
          state: "offline",
          detail: "No live source responded during the latest scan.",
          checkedAt: "2026-08-08T12:30:00Z",
        },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/agent/control-room")) return response(offlineSnapshot);
      if (url.includes("/api/agent/feed")) return response({ posts: [] });
      return response({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("faultline.connectedAgentId", "agent-mira");

    render(<App />);

    expect(await screen.findByText("Source scan paused")).toBeVisible();
    expect(screen.getByText(/Existing notes and editorial memory remain available/i)).toBeVisible();
    expect(screen.getByText("No topic cleared the editorial bar.")).toBeVisible();
  });
});
