import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { EntryList } from "./pages/EntryList";
import { EntryDetail } from "./pages/EntryDetail";
import { Settings } from "./components/Settings";
import { hasApiKey } from "./auth";
import { Route, useRoute } from "./router";

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
  }
}

export default function App() {
  const [showSettings, setShowSettings] = useState(!hasApiKey());
  const [upstream, setUpstream] = useState<"ok" | "err" | "unknown">("unknown");
  const route = useRoute();

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((j) => setUpstream(j.status === "ok" ? "ok" : "err"))
      .catch(() => setUpstream("err"));
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
        </nav>
        <div className="right">
          <span className="status">
            <span className={`dot ${upstream}`} />
            proxy {upstream}
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
    </>
  );
}
