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
  | { name: "graph" }
  | { name: "staging" }
  | { name: "tags" }
  | { name: "activity" }
  | { name: "users" };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (!h || h === "/") return { name: "dashboard" };
  if (h === "entries") return { name: "entries" };
  if (h === "graph") return { name: "graph" };
  if (h === "staging") return { name: "staging" };
  if (h === "tags") return { name: "tags" };
  if (h === "activity") return { name: "activity" };
  if (h === "users") return { name: "users" };
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
    case "staging":   return "#/staging";
    case "tags":      return "#/tags";
    case "activity":  return "#/activity";
    case "users":     return "#/users";
    case "entry":     return `#/entries/${route.id}`;
  }
}
