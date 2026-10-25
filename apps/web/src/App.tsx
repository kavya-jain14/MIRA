import { useCallback, useEffect, useMemo, useState } from "react";

import { MIRA_PERSONA } from "@faultline/agent-core";

import { AutonomyStrip } from "./components/autonomy-strip";
import { DecisionMargin } from "./components/decision-margin";
import { EditorialLedger } from "./components/editorial-ledger";
import { FeedPanel } from "./components/feed-panel";
import { Header } from "./components/header";
import { HealthDrawer } from "./components/health-drawer";
import { HowItWorks } from "./components/how-it-works";
import { InitializePanel } from "./components/initialize-panel";
import { Masthead } from "./components/masthead";
import { RunTimeline } from "./components/run-timeline";
import { StatusBanner } from "./components/status-banner";
import { useAgentControlRoom } from "./hooks/use-agent-control-room";
import { formatUtc } from "./lib/time";

type DeskView = "feed" | "ledger";
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "faultline.theme";

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Theme persistence is optional when browser storage is unavailable.
  }
  return "light";
}

export default function App(): React.JSX.Element {
  const controlRoom = useAgentControlRoom();
  const [deskView, setDeskView] = useState<DeskView>("feed");
  const [healthOpen, setHealthOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Keep the selected theme for this session even if it cannot be saved.
    }
  }, [theme]);

  const openHealth = useCallback(() => setHealthOpen(true), []);
  const closeHealth = useCallback(() => setHealthOpen(false), []);

  const initializeMira = useCallback(
    () =>
      controlRoom.initialize({
        name: MIRA_PERSONA.name,
        domain: MIRA_PERSONA.domain,
      }),
    [controlRoom],
  );

  const completedRuns = useMemo(
    () =>
      controlRoom.snapshot?.runs.filter((run) => run.status !== "running") ?? [],
    [controlRoom.snapshot],
  );

  const telemetryUnavailable = controlRoom.telemetryError !== null;
  const sourcesOffline =
    controlRoom.snapshot?.health.some(
      (service) => service.key === "sources" && service.state === "offline",
    ) ?? false;

  return (
    <div className="app-shell" id="top">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header
        connected={controlRoom.agentId !== null}
        theme={theme}
        isRefreshing={controlRoom.isRefreshing}
        onRefresh={() => void controlRoom.refresh()}
        onDisconnect={controlRoom.disconnect}
        onOpenHealth={openHealth}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      />

      {controlRoom.agentId === null ? (
        <InitializePanel
          isInitializing={controlRoom.isInitializing}
          error={controlRoom.initializationError}
          onInitialize={initializeMira}
          onConnect={controlRoom.connect}
        />
      ) : (
        <main className="control-room" id="main-content">
          <Masthead
            agentId={controlRoom.agentId}
            workerState={controlRoom.snapshot?.autonomy.workerState ?? null}
          />

          <HowItWorks />

          <AutonomyStrip
            status={controlRoom.snapshot?.autonomy ?? null}
            postsFallback={controlRoom.posts.length}
            loading={controlRoom.isLoading}
          />

          <StatusBanner
            feedError={controlRoom.feedError}
            telemetryError={controlRoom.telemetryError}
            onRetry={() => void controlRoom.refresh()}
          />

          {sourcesOffline && controlRoom.telemetryError === null ? (
            <button className="source-outage" type="button" onClick={openHealth}>
              <span>Source scan paused</span>
              No live source responded in the latest cycle. Existing notes and
              editorial memory remain available.
              <strong>Runtime details ↗</strong>
            </button>
          ) : null}

          <nav className="desk-tabs" aria-label="Editorial records">
            <button
              className={deskView === "feed" ? "is-active" : ""}
              type="button"
              aria-current={deskView === "feed" ? "page" : undefined}
              onClick={() => setDeskView("feed")}
            >
              Published notes
              <span>{controlRoom.posts.length}</span>
            </button>
            <button
              className={deskView === "ledger" ? "is-active" : ""}
              type="button"
              aria-current={deskView === "ledger" ? "page" : undefined}
              onClick={() => setDeskView("ledger")}
            >
              Topics skipped
              <span>{controlRoom.snapshot?.autonomy.candidatesRejected ?? 0}</span>
            </button>
          </nav>

          <div className="desk-grid">
            <div className="desk-primary">
              {deskView === "feed" ? (
                <FeedPanel
                  posts={controlRoom.posts}
                  loading={controlRoom.isLoading}
                  feedError={controlRoom.feedError}
                  hadCompletedRun={completedRuns.length > 0}
                />
              ) : (
                <EditorialLedger
                  items={controlRoom.snapshot?.editorialLedger ?? []}
                  unavailable={telemetryUnavailable}
                />
              )}
            </div>

            <aside className="desk-sidebar">
              <DecisionMargin
                items={controlRoom.snapshot?.editorialLedger ?? []}
                totalRejected={
                  controlRoom.snapshot?.autonomy.candidatesRejected ?? 0
                }
                unavailable={telemetryUnavailable}
                onShowAll={() => setDeskView("ledger")}
              />

              <RunTimeline
                runs={controlRoom.snapshot?.runs ?? []}
                unavailable={telemetryUnavailable}
                onOpenHealth={openHealth}
              />

            </aside>
          </div>

          <footer className="control-footer">
            <span>
              {controlRoom.lastSyncedAt
                ? `Last interface sync ${formatUtc(controlRoom.lastSyncedAt)}`
                : "Waiting for first interface sync"}
            </span>
            <span>Evidence before excitement · Failure mode before feature list</span>
          </footer>
        </main>
      )}

      <HealthDrawer
        open={healthOpen}
        health={controlRoom.snapshot?.health ?? []}
        unavailable={telemetryUnavailable}
        onClose={closeHealth}
      />
    </div>
  );
}
