import { Suspense, lazy, useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { EntryList } from "./pages/EntryList";
import { EntryDetail } from "./pages/EntryDetail";
import { Staging } from "./pages/Staging";
import { Tags } from "./pages/Tags";
import { Activity } from "./pages/Activity";
import { Settings } from "./components/Settings";

// cytoscape is ~400 KB — only pull it in when the graph tab is opened.
const Graph = lazy(() => import("./pages/Graph").then((m) => ({ default: m.Graph })));
import { ToastHost } from "./components/Toast";
import { hasApiKey } from "./auth";
import { Route, useRoute } from "./router";
import { startLivePolling, stopLivePolling } from "./mutations";
import { useIdentity } from "./identity";

function NavLink({ to, label, current }: { to: string; label: string; current: boolean }) {
  return (
    <a className={`navlink ${current ? "active" : ""}`} href={to}>
      {label}
    </a>
  );
}

function CurrentView({ route }: { route: Route }) {
  switch (route.name) {
    case "dashboard":
      return <Dashboard />;
    case "entries":
      return <EntryList />;
    case "entry":
      return <EntryDetail id={route.id} />;
    case "graph":
      return (
        <Suspense fallback={<div className="empty">Loading graph…</div>}>
          <Graph />
        </Suspense>
      );
    case "staging":
      return <Staging />;
    case "tags":
      return <Tags />;
    case "activity":
      return <Activity />;
  }
}

export default function App() {
  const [showSettings, setShowSettings] = useState(!hasApiKey());
  const [upstream, setUpstream] = useState<"ok" | "err" | "unknown">("unknown");
  const route = useRoute();
  const identity = useIdentity();

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((j) => setUpstream(j.status === "ok" ? "ok" : "err"))
      .catch(() => setUpstream("err"));
  }, []);

  // Live updates — poll every 10s while the tab is mounted. Pause when the
  // tab is backgrounded to avoid wasted requests.
  useEffect(() => {
    if (!hasApiKey()) return;
    const onVis = () => {
      if (document.visibilityState === "visible") startLivePolling();
      else stopLivePolling();
    };
    startLivePolling();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopLivePolling();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Scroll to top on every route change.
  useEffect(() => window.scrollTo(0, 0), [route]);

  return (
    <>
      <header className="topbar">
        <h1>KB Admin · Arguss Labs</h1>
        <nav className="nav">
          <NavLink to="#/" label="Dashboard" current={route.name === "dashboard"} />
          <NavLink
            to="#/entries"
            label="Entries"
            current={route.name === "entries" || route.name === "entry"}
          />
          <NavLink to="#/graph" label="Graph" current={route.name === "graph"} />
          <NavLink to="#/staging" label="Staging" current={route.name === "staging"} />
          <NavLink to="#/tags" label="Tags" current={route.name === "tags"} />
          <NavLink to="#/activity" label="Activity" current={route.name === "activity"} />
        </nav>
        <div className="right">
          <span className="status">
            <span className={`dot ${upstream}`} />
            proxy {upstream}
          </span>
          <span className="identity">
            {identity.status === "ok" && (
              <>
                <b>{identity.user.display_name}</b>
                <span className={`role-badge role-${identity.user.role}`}>{identity.user.role}</span>
              </>
            )}
            {identity.status === "invalid" && (
              <span className="identity-bad" title={identity.error}>key invalid</span>
            )}
            {identity.status === "anon" && <span className="muted">no key</span>}
          </span>
          <button className="btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>
      <main>
        <CurrentView route={route} />
      </main>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <ToastHost />
    </>
  );
}
