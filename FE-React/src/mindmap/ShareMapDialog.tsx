import { useState, useEffect, type FormEvent } from "react";
import { X, UserPlus, Trash2 } from "lucide-react";
import { authFetch } from "../lib/authFetch";
import UserAvatar from "../components/UserAvatar";

interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Props {
  mapId: string;
  onClose: () => void;
}

export default function ShareMapDialog({ mapId, onClose }: Props) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCollaborators();
  }, [mapId]);

  async function fetchCollaborators() {
    setLoading(true);
    try {
      const res = await authFetch(`/api/maps/${mapId}/collaborators`);
      if (res.ok) setCollaborators(await res.json());
    } catch {}
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setAddLoading(true);
    try {
      const res = await authFetch(`/api/maps/${mapId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Failed to add collaborator");
      } else {
        setCollaborators((prev) => [...prev, data]);
        setEmail("");
      }
    } catch {
      setError("Network error");
    }
    setAddLoading(false);
  }

  async function handleRemove(userId: string) {
    try {
      await authFetch(`/api/maps/${mapId}/collaborators/${userId}`, { method: "DELETE" });
      setCollaborators((prev) => prev.filter((c) => c.id !== userId));
    } catch {}
  }

  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="share-header">
          <span className="share-title">Share map</span>
          <button className="share-close" onClick={onClose}><X size={16} /></button>
        </div>

        <form className="share-add-form" onSubmit={handleAdd}>
          <input
            className="share-email-input"
            type="email"
            placeholder="Invite by email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={addLoading}
          />
          <button className="share-add-btn" type="submit" disabled={addLoading || !email.trim()}>
            <UserPlus size={15} />
            {addLoading ? "Adding…" : "Invite"}
          </button>
        </form>
        {error && <p className="share-error">{error}</p>}

        <div className="share-collab-list">
          {loading ? (
            <p className="share-hint">Loading…</p>
          ) : collaborators.length === 0 ? (
            <p className="share-hint">No collaborators yet. Invite someone above.</p>
          ) : (
            collaborators.map((c) => (
              <div key={c.id} className="share-collab-row">
                <UserAvatar name={c.name} size={32} />
                <div className="share-collab-info">
                  <span className="share-collab-name">{c.name}</span>
                  <span className="share-collab-email">{c.email}</span>
                </div>
                <span className="share-collab-role">{c.role}</span>
                <button
                  className="share-remove-btn"
                  onClick={() => handleRemove(c.id)}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
