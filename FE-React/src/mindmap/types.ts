// Shared mind map data model. Mirrors BE-FastAPI/schemas/mindmap.py.

export interface MindNode {
  id: string;
  parent_id: string | null; // null only for the root
  label: string;
  description: string;
  x: number;
  y: number;
  collapsed: boolean;
}

// Cross-connection between nodes; parent-child links come from MindNode.parent_id
export interface MindEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface MindGraph {
  nodes: MindNode[];
  edges: MindEdge[];
}

export interface MapSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MapDetail extends MapSummary, MindGraph {}

export interface GenerateRequest {
  topic: string;
  purpose: string;
  depth: number;
  branches: number;
  constraints: string;
}

// Unsaved AI output as returned by POST /api/maps/generate
export interface GeneratedDraft {
  title: string;
  nodes: MindNode[];
  edges: MindEdge[];
}

// An unsaved map held only in the editor until the user accepts it
export interface Draft {
  title: string;
  graph: MindGraph;
}
