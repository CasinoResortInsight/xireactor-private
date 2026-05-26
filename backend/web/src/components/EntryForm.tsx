// Create / Edit form, surfaced as a right-side drawer to match Settings.
// Phase 3 keeps the editor as a plain textarea — a richer markdown editor
// (e.g. @uiw/react-md-editor) is a Phase-5 polish item.

import { useEffect, useState } from "react";
import {
  ApiError,
  ContentTypeRow,
  Entry,
  EntryCreatePayload,
  EntryUpdatePayload,
  createEntry,
  listTypes,
  updateEntry,
} from "../api";
import { notifyMutated } from "../mutations";
import { toast } from "./Toast";

const SENSITIVITIES = [
  "operational",
  "project",
  "meeting",
  "shared",
  "strategic",
  "private",
  "system",
];

export interface EntryFormProps {
  mode: "create" | "edit";
  entry?: Entry; // required in edit mode
  onClose: () => void;
  onSaved?: (e: Entry) => void;
}

interface FormState {
  title: string;
  content: string;
  summary: string;
  content_type: string;
  logical_path: string;
  sensitivity: string;
  tagsRaw: string; // comma-separated, parsed on submit
}

function initial(entry?: Entry): FormState {
  return {
    title: entry?.title ?? "",
    content: entry?.content ?? "",
    summary: entry?.summary ?? "",
    content_type: entry?.content_type ?? "daily",
    logical_path: entry?.logical_path ?? "",
    sensitivity: entry?.sensitivity ?? "operational",
    tagsRaw: (entry?.tags ?? []).join(", "),
  };
}

export function EntryForm({ mode, entry, onClose, onSaved }: EntryFormProps) {
  const [state, setState] = useState<FormState>(initial(entry));
  const [types, setTypes] = useState<ContentTypeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTypes()
      .then((r) =>
        setTypes(
          r.types.filter((t) => t.is_active && !t.alias_of).sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        ),
      )
      .catch(() => {
        // Non-fatal — the user can still type a content_type by hand.
      });
  }, []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  function parseTags(raw: string): string[] {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function submit() {
    if (!state.title.trim()) return setError("Title is required.");
    if (!state.logical_path.trim()) return setError("Folder (logical_path) is required.");
    if (!state.content_type.trim()) return setError("Content type is required.");

    setBusy(true);
    setError(null);
    try {
      let saved: Entry;
      if (mode === "create") {
        const body: EntryCreatePayload = {
          title: state.title.trim(),
          content: state.content,
          summary: state.summary.trim() || null,
          content_type: state.content_type,
          logical_path: state.logical_path.trim(),
          sensitivity: state.sensitivity || null,
          tags: parseTags(state.tagsRaw),
        };
        saved = await createEntry(body);
        toast.success(`Created "${saved.title}"`);
      } else {
        if (!entry) throw new Error("edit mode without entry");
        const body: EntryUpdatePayload = {
          title: state.title.trim(),
          content: state.content,
          summary: state.summary.trim() || null,
          content_type: state.content_type,
          logical_path: state.logical_path.trim(),
          sensitivity: state.sensitivity,
          tags: parseTags(state.tagsRaw),
          expected_version: entry.version,
        };
        saved = await updateEntry(entry.id, body);
        toast.success(`Saved "${saved.title}"`);
      }
      notifyMutated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      const msg = e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={busy ? undefined : onClose} />
      <div className="drawer drawer-wide" role="dialog" aria-label={mode === "create" ? "New entry" : "Edit entry"}>
        <h2>{mode === "create" ? "New entry" : "Edit entry"}</h2>

        {error && <div className="error">{error}</div>}

        <label>Title</label>
        <input
          value={state.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="What is this entry about?"
          autoFocus
        />

        <div className="form-row">
          <div>
            <label>Content type</label>
            {types.length > 0 ? (
              <select
                value={state.content_type}
                onChange={(e) => set("content_type", e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={state.content_type}
                onChange={(e) => set("content_type", e.target.value)}
                placeholder="daily, meeting, project, …"
              />
            )}
          </div>
          <div>
            <label>Sensitivity</label>
            <select
              value={state.sensitivity}
              onChange={(e) => set("sensitivity", e.target.value)}
            >
              {SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label>Folder (logical path)</label>
        <input
          value={state.logical_path}
          onChange={(e) => set("logical_path", e.target.value)}
          placeholder="meetings/2026/05/snack-bar-refresh"
          className="mono"
        />

        <label>Summary (optional)</label>
        <input
          value={state.summary}
          onChange={(e) => set("summary", e.target.value)}
          placeholder="One-line summary for cards and link previews"
        />

        <label>Tags (comma-separated)</label>
        <input
          value={state.tagsRaw}
          onChange={(e) => set("tagsRaw", e.target.value)}
          placeholder="ops, snack-bar, q2"
        />

        <label>Content (markdown)</label>
        <textarea
          value={state.content}
          onChange={(e) => set("content", e.target.value)}
          rows={18}
          className="mono"
          placeholder="# Heading&#10;&#10;Body text. Wikilinks like [[other-entry]] resolve automatically."
        />

        {mode === "edit" && entry && (
          <p className="hint">
            Editing v{entry.version}. The server rejects the save if someone
            else has updated this entry in the meantime.
          </p>
        )}

        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
