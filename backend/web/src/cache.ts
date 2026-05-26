// Tiny app-wide cache so EntryList, EntryDetail, and the wikilink resolver
// share one set of in-flight fetches instead of triple-loading the same data.
// Phase 4 replaces this with proper live updates; for now it's just a memo
// with a "bust" call after mutations.

import { Entry, GraphResponse, getGraph, listAllEntries } from "./api";

let entriesPromise: Promise<Entry[]> | null = null;
let graphPromise: Promise<GraphResponse> | null = null;

export function getAllEntriesCached(): Promise<Entry[]> {
  if (!entriesPromise) {
    entriesPromise = listAllEntries(2000).then((r) => r.entries);
  }
  return entriesPromise;
}

export function getGraphCached(): Promise<GraphResponse> {
  if (!graphPromise) {
    graphPromise = getGraph();
  }
  return graphPromise;
}

export function bustCache(): void {
  entriesPromise = null;
  graphPromise = null;
}
