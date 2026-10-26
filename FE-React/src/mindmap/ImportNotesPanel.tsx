import { useRef, useState } from "react";
import { X, FileText } from "lucide-react";
import { importNotes, isAbortError, errorMessage } from "./api";
import type { ExpansionNode } from "./api";
import type { MindNode } from "./types";

interface Props {
  mapId: string;
  nodes: MindNode[];
  onClose: () => void;
  onAdd: (parentNodeId: string | null, suggestions: ExpansionNode[]) => void;
}

function countAll(nodes: ExpansionNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countAll(n.children ?? []), 0);
}

export default function ImportNotesPanel({ mapId, nodes, onClose, onAdd }: Props) {
  const [notes, setNotes] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<ExpansionNode[] | null>(null);
  const [resultParentId, setResultParentId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const root = nodes.find((n) => n.parent_id === null);

  async function run() {
    if (!notes.trim() || loading) return;
    setError("");
    setSuggestions(null);
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await importNotes(mapId, notes.trim(), parentId, ctrl.signal);
      setSuggestions(res.nodes);
      setResultParentId(res.parent_node_id);
    } catch (e) {
      if (!isAbortError(e)) setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    if (!suggestions) return;
    onAdd(resultParentId, suggestions);
    setSuggestions(null);
    setNotes("");
  }

  return (
    <div className="imp-panel">
      <div className="imp-header">
        <span className="imp-title"><FileText size={14} /> Import Notes</span>
        <button className="imp-close" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="imp-body">
        <p className="imp-hint">
          Paste rough notes, bullet points, or meeting minutes — AI will structure them into branches.
        </p>

        <label className="imp-label">Attach under</label>
        <select
          className="imp-select"
          value={parentId ?? ""}
          onChange={(e) => setParentId(e.target.value || null)}
          disabled={loading}
        >
          <option value="">{root ? `Root — ${root.label}` : "Root"}</option>
          {nodes
            .filter((n) => n.parent_id !== null)
            .map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
        </select>

        <label className="imp-label">Your notes</label>
        <textarea
          className="imp-textarea"
          rows={10}
          placeholder={"e.g.\n- Auth flow needs refresh tokens\n- Rate limiting: 100 req/min per user\n- Add webhook support\n- Mobile SDK: iOS first, then Android"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
        />

        {error && <p className="imp-error">{error}</p>}

        {loading ? (
          <span className="imp-status"><span className="mm-spinner" /> Structuring notes…</span>
        ) : suggestions ? (
          <>
            <div className="imp-preview-header">
              <span>{countAll(suggestions)} nodes to add</span>
              <button className="mm-btn" onClick={() => setSuggestions(null)}>Discard</button>
            </div>
            <ul className="imp-preview">
              {suggestions.map((n, i) => (
                <li key={i}>
                  <span className="imp-node-label">{n.label}</span>
                  {(n.children?.length ?? 0) > 0 && (
                    <span className="imp-node-sub">+{n.children.length} children</span>
                  )}
                </li>
              ))}
            </ul>
            <button className="mm-btn primary" style={{ width: "100%" }} onClick={handleAdd}>
              Add to map
            </button>
          </>
        ) : (
          <button
            className="mm-btn primary"
            style={{ width: "100%" }}
            onClick={run}
            disabled={!notes.trim()}
          >
            Structure with AI
          </button>
        )}
      </div>
    </div>
  );
}
