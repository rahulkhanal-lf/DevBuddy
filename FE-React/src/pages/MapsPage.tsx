import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Network, Sparkles, Bot, X, Users } from "lucide-react";
import { createMap, deleteMap, duplicateMap, errorMessage, listMaps, renameMap } from "../mindmap/api";
import { useAuth } from "../auth/AuthContext";
import GenerateDialog from "../mindmap/GenerateDialog";
import MapsChatPanel from "../mindmap/MapsChatPanel";
import type { MapSummary } from "../mindmap/types";
import "../mindmap/MindMap.css";

function formatDate(iso: string) {
  // The API returns naive UTC timestamps
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function MapsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMap, setChatMap] = useState<MapSummary | undefined>(undefined);

  const refresh = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      setMaps(await listMaps());
      setStatus("ready");
    } catch (err) {
      setLoadError(errorMessage(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleNew() {
    const title = window.prompt("Name your new map", "Untitled map");
    if (title === null) return;
    setCreating(true);
    setActionError("");
    try {
      const created = await createMap(title.trim() || "Untitled map");
      navigate(`/maps/${created.id}`);
    } catch (err) {
      setActionError(`Couldn't create the map: ${errorMessage(err)}`);
    } finally {
      setCreating(false);
    }
  }

  async function runAction(id: string, action: () => Promise<unknown>, failure: string) {
    setBusyId(id);
    setActionError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setActionError(`${failure}: ${errorMessage(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  function handleRename(m: MapSummary) {
    const title = window.prompt("Rename map", m.title);
    if (title === null || !title.trim() || title.trim() === m.title) return;
    runAction(m.id, () => renameMap(m.id, title.trim()), "Couldn't rename the map");
  }

  function handleDuplicate(m: MapSummary) {
    runAction(m.id, () => duplicateMap(m.id), "Couldn't duplicate the map");
  }

  function handleDelete(m: MapSummary) {
    if (!window.confirm(`Delete "${m.title}"? This can't be undone.`)) return;
    runAction(m.id, () => deleteMap(m.id), "Couldn't delete the map");
  }

  function openChat(m?: MapSummary) {
    setChatMap(m);
    setShowChat(true);
  }

  return (
    <div className="main">
      <header className="chat-header mm-list-header">
        <span className="chat-header-title">Mind maps</span>
        <div className="mm-row">
          <button
            className={`mm-btn${showChat && !chatMap ? " primary" : ""}`}
            onClick={() => { setChatMap(undefined); setShowChat((v) => !v); }}
            title="Ask AI about all maps"
          >
            <MessageSquare size={14} /> Ask AI
          </button>
          <button className="mm-btn" onClick={() => setShowGenerate(true)}>
            <Sparkles size={14} /> Generate with AI
          </button>
          <button className="mm-btn primary" onClick={handleNew} disabled={creating}>
            {creating ? "Creating…" : "+ New map"}
          </button>
        </div>
      </header>

      <div className="mm-page-body">
        <div className="mm-list">
          {actionError && (
            <div className="mm-banner error" role="alert">
              {actionError}
              <button className="mm-banner-close" onClick={() => setActionError("")} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}

          {status === "loading" && (
            <div className="mm-center">
              <span className="mm-spinner" /> Loading maps…
            </div>
          )}

          {status === "error" && (
            <div className="mm-center column">
              <p>Couldn't load your maps: {loadError}</p>
              <button className="mm-btn primary" onClick={refresh}>Retry</button>
            </div>
          )}

          {status === "ready" && maps.length === 0 && (
            <div className="mm-center column mm-empty">
              <div className="mm-empty-icon"><Network size={40} strokeWidth={1.2} /></div>
              <h2>No mind maps yet</h2>
              <p>Start from a blank map, or describe an idea and let AI draft one for you.</p>
              <div className="mm-row">
                <button className="mm-btn" onClick={() => setShowGenerate(true)}>
                  <Sparkles size={14} /> Generate with AI
                </button>
                <button className="mm-btn primary" onClick={handleNew}>+ New map</button>
              </div>
            </div>
          )}

          {status === "ready" && maps.length > 0 && (
            <div className="mm-list-inner">
              <p className="mm-page-title">{maps.length} map{maps.length !== 1 ? "s" : ""}</p>
              <ul className="mm-grid">
                {maps.map((m) => (
                  <li key={m.id} className={`mm-card${busyId === m.id ? " busy" : ""}`}>
                    <div className="mm-card-icon">
                      <Network size={18} strokeWidth={1.5} />
                    </div>
                    <button className="mm-card-open" onClick={() => navigate(`/maps/${m.id}`)}>
                      <span className="mm-card-title">{m.title}</span>
                      <span className="mm-card-meta">
                        {m.owner_id && m.owner_id !== user?.id ? (
                          <span className="mm-badge shared"><Users size={11} /> Shared by {m.owner_name ?? "someone"}</span>
                        ) : (
                          <span className="mm-badge mine">Mine</span>
                        )}
                        <span className="mm-card-date">Updated {formatDate(m.updated_at)}</span>
                      </span>
                    </button>
                    <div className="mm-card-actions">
                      <button
                        className={`mm-btn small${showChat && chatMap?.id === m.id ? " primary" : ""}`}
                        onClick={() => openChat(m)}
                        title="Ask AI about this map"
                      >
                        <Bot size={12} /> Ask AI
                      </button>
                      <button className="mm-btn small" onClick={() => handleRename(m)} disabled={busyId !== null}>
                        Rename
                      </button>
                      <button className="mm-btn small" onClick={() => handleDuplicate(m)} disabled={busyId !== null}>
                        Duplicate
                      </button>
                      <button className="mm-btn small danger" onClick={() => handleDelete(m)} disabled={busyId !== null}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {showChat && <MapsChatPanel onClose={() => { setShowChat(false); setChatMap(undefined); }} map={chatMap} />}
      </div>

      {showGenerate && (
        <GenerateDialog
          onClose={() => setShowGenerate(false)}
          onGenerated={(draft) => {
            setShowGenerate(false);
            navigate("/maps/new", { state: { draft } });
          }}
        />
      )}
    </div>
  );
}
