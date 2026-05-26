// Minimal hash router: location.hash → route object. No dependency.
// Supported shapes:
//   #/            → { name: "dashboard" }
//   #/entries     → { name: "entries" }
//   #/entries/:id → { name: "entry", id }

import { useEffect, useState } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "entries" }
  | { name: "entry"; id: string };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (!h || h === "/") return { name: "dashboard" };
  if (h === "entries") return { name: "entries" };
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
  if (route.name === "dashboard") location.hash = "#/";
  else if (route.name === "entries") location.hash = "#/entries";
  else location.hash = `#/entries/${route.id}`;
}

export function href(route: Route): string {
  if (route.name === "dashboard") return "#/";
  if (route.name === "entries") return "#/entries";
  return `#/entries/${route.id}`;
}
