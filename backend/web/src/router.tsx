// Minimal hash router: location.hash → route object. No dependency.
// Supported shapes:
//   #/            → { name: "dashboard" }
//   #/entries     → { name: "entries" }
//   #/entries/:id → { name: "entry", id }

import { useEffect, useState } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "entries" }
  | { name: "entry"; id: string }
  | { name: "graph" };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (!h || h === "/") return { name: "dashboard" };
  if (h === "entries") return { name: "entries" };
  if (h === "graph") return { name: "graph" };
  const m = h.match(/^entries\/([0-9a-fA-F-]{36})$/);
  if (m) return { name: "entry", id: m[1] };
  return { name: "dashboard" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function go(route: Route): void {
  location.hash = href(route);
}

export function href(route: Route): string {
  switch (route.name) {
    case "dashboard": return "#/";
    case "entries":   return "#/entries";
    case "graph":     return "#/graph";
    case "entry":     return `#/entries/${route.id}`;
  }
}
