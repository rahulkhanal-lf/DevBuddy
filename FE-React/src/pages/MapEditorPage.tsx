import { useCallback } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import MindMapEditor from "../mindmap/MindMapEditor";
import type { Draft } from "../mindmap/types";

// Handles /maps/:mapId (saved map) and /maps/new (unsaved AI draft passed in navigation state)
export default function MapEditorPage() {
  const { mapId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const draft = (location.state as { draft?: Draft } | null)?.draft ?? null;

  const onClose = useCallback(() => navigate("/maps"), [navigate]);
  const onCreated = useCallback((id: string) => navigate(`/maps/${id}`, { replace: true }), [navigate]);

  // A draft only lives in navigation state; without it there is nothing to show
  if (!mapId && !draft) return <Navigate to="/maps" replace />;

  return (
    <div className="main">
      <MindMapEditor
        key={mapId ?? location.key}
        mapId={mapId ?? null}
        draft={mapId ? null : draft}
        onClose={onClose}
        onCreated={onCreated}
      />
    </div>
  );
}
