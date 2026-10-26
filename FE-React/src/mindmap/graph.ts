// Pure graph operations. Every function returns a new graph (or the same
// object when nothing changed, so history can skip no-op edits).

import type { MindEdge, MindGraph, MindNode } from "./types";

export const MAX_NODES = 300;
export const MAX_EDGES = 100;
export const MAX_LABEL_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
const NODE_GAP_X = 260;
const NODE_GAP_Y = 90;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function newId(): string {
  return crypto.randomUUID();
}

export function createGraph(rootLabel: string): MindGraph {
  return {
    nodes: [{ id: newId(), parent_id: null, label: rootLabel, description: "", x: 0, y: 0, collapsed: false }],
    edges: [],
  };
}

export function findNode(graph: MindGraph, id: string): MindNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function getRoot(graph: MindGraph): MindNode | undefined {
  return graph.nodes.find((n) => n.parent_id === null);
}

export function childrenMap(graph: MindGraph): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (n.parent_id === null) continue;
    const list = children.get(n.parent_id);
    if (list) list.push(n.id);
    else children.set(n.parent_id, [n.id]);
  }
  return children;
}

/** The node itself plus everything below it. */
export function subtreeIds(graph: MindGraph, id: string): Set<string> {
  const children = childrenMap(graph);
  const result = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(children.get(current) ?? []));
  }
  return result;
}

/** Nodes hidden because an ancestor is collapsed. */
export function hiddenNodeIds(graph: MindGraph): Set<string> {
  const children = childrenMap(graph);
  const hidden = new Set<string>();
  for (const n of graph.nodes) {
    if (!n.collapsed) continue;
    const stack = [...(children.get(n.id) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      if (hidden.has(current)) continue;
      hidden.add(current);
      stack.push(...(children.get(current) ?? []));
    }
  }
  return hidden;
}

export function addChild(
  graph: MindGraph,
  parentId: string,
  label = "New idea"
): { graph: MindGraph; id: string } | null {
  const parent = findNode(graph, parentId);
  if (!parent || graph.nodes.length >= MAX_NODES) return null;

  const siblings = graph.nodes.filter((n) => n.parent_id === parentId);
  const lowest = siblings.reduce((max, n) => Math.max(max, n.y), -Infinity);
  const node: MindNode = {
    id: newId(),
    parent_id: parentId,
    label,
    description: "",
    x: parent.x + NODE_GAP_X,
    y: siblings.length ? lowest + NODE_GAP_Y : parent.y,
    collapsed: false,
  };
  // Expand a collapsed parent so the new child is visible
  const nodes = graph.nodes.map((n) => (n.id === parentId && n.collapsed ? { ...n, collapsed: false } : n));
  return { graph: { ...graph, nodes: [...nodes, node] }, id: node.id };
}

/** Siblings share the node's parent; the root has no siblings. */
export function addSibling(graph: MindGraph, nodeId: string, label = "New idea") {
  const node = findNode(graph, nodeId);
  if (!node || node.parent_id === null) return null;
  return addChild(graph, node.parent_id, label);
}

type NodePatch = Partial<Pick<MindNode, "label" | "description" | "collapsed" | "x" | "y">>;

export function updateNode(graph: MindGraph, id: string, patch: NodePatch): MindGraph {
  const node = findNode(graph, id);
  if (!node) return graph;
  const changed = (Object.keys(patch) as (keyof NodePatch)[]).some((key) => node[key] !== patch[key]);
  if (!changed) return graph;
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Blank labels are rejected (the graph is returned unchanged). */
export function renameNode(graph: MindGraph, id: string, label: string): MindGraph {
  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!trimmed) return graph;
  return updateNode(graph, id, { label: trimmed });
}

export function setDescription(graph: MindGraph, id: string, description: string): MindGraph {
  return updateNode(graph, id, { description: description.slice(0, MAX_DESCRIPTION_LENGTH) });
}

export function moveNodes(graph: MindGraph, positions: Map<string, { x: number; y: number }>): MindGraph {
  if (!positions.size) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = positions.get(n.id);
      return p && (p.x !== n.x || p.y !== n.y) ? { ...n, x: p.x, y: p.y } : n;
    }),
  };
}

export function toggleCollapsed(graph: MindGraph, id: string): MindGraph {
  const node = findNode(graph, id);
  if (!node || !graph.nodes.some((n) => n.parent_id === id)) return graph;
  return updateNode(graph, id, { collapsed: !node.collapsed });
}

/** Deletes a node with its whole subtree and every connection touching it. The root can't be deleted. */
export function deleteNode(graph: MindGraph, id: string): { graph: MindGraph; removed: number } | null {
  const node = findNode(graph, id);
  if (!node || node.parent_id === null) return null;
  const removed = subtreeIds(graph, id);
  return {
    graph: {
      nodes: graph.nodes.filter((n) => !removed.has(n.id)),
      edges: graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
    },
    removed: removed.size,
  };
}

export function connect(
  graph: MindGraph,
  source: string,
  target: string,
  label = ""
): { graph: MindGraph; id: string } | { error: string } {
  if (source === target) return { error: "A node can't be connected to itself." };
  const a = findNode(graph, source);
  const b = findNode(graph, target);
  if (!a || !b) return { error: "Both nodes must exist to connect them." };
  if (a.parent_id === b.id || b.parent_id === a.id) {
    return { error: "These nodes are already linked as parent and child." };
  }
  const duplicate = graph.edges.some(
    (e) => (e.source === source && e.target === target) || (e.source === target && e.target === source)
  );
  if (duplicate) return { error: "These nodes are already connected." };
  if (graph.edges.length >= MAX_EDGES) return { error: `A map can have at most ${MAX_EDGES} connections.` };

  const edge: MindEdge = { id: newId(), source, target, label };
  return { graph: { ...graph, edges: [...graph.edges, edge] }, id: edge.id };
}

export function setEdgeLabel(graph: MindGraph, id: string, label: string): MindGraph {
  const edge = graph.edges.find((e) => e.id === id);
  const next = label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!edge || edge.label === next) return graph;
  return { ...graph, edges: graph.edges.map((e) => (e.id === id ? { ...e, label: next } : e)) };
}

export function removeEdge(graph: MindGraph, id: string): MindGraph {
  if (!graph.edges.some((e) => e.id === id)) return graph;
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/** Client-side mirror of the server's structural rules. Empty list means valid. */
export function graphProblems(graph: MindGraph): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (!ID_PATTERN.test(n.id)) problems.push(`Invalid node id "${n.id}".`);
    if (ids.has(n.id)) problems.push(`Duplicate node id "${n.id}".`);
    ids.add(n.id);
    if (!n.label.trim()) problems.push(`Node "${n.id}" has an empty label.`);
  }
  if (!graph.nodes.length) problems.push("A map needs at least one node.");
  if (graph.nodes.length > MAX_NODES) problems.push(`A map can have at most ${MAX_NODES} nodes.`);
  const roots = graph.nodes.filter((n) => n.parent_id === null);
  if (graph.nodes.length && roots.length !== 1) problems.push(`A map needs exactly one root (found ${roots.length}).`);

  const parentOf = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.parent_id === null) continue;
    if (!ids.has(n.parent_id) || n.parent_id === n.id) problems.push(`Node "${n.id}" has an invalid parent.`);
    else parentOf.set(n.id, n.parent_id);
  }
  for (const start of parentOf.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      current = parentOf.get(current);
    }
    if (current !== undefined) {
      problems.push("Parent relationships form a cycle.");
      break;
    }
  }

  const edgeIds = new Set<string>();
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) problems.push(`Duplicate connection id "${e.id}".`);
    edgeIds.add(e.id);
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) {
      problems.push(`Connection "${e.id}" has invalid endpoints.`);
    }
  }
  return problems;
}

/** Replace every id with a fresh UUID while keeping all relationships intact. */
export function withFreshIds(graph: MindGraph): MindGraph {
  const idMap = new Map(graph.nodes.map((n) => [n.id, newId()]));
  const remap = (id: string) => idMap.get(id) ?? id;
  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      id: remap(n.id),
      parent_id: n.parent_id === null ? null : remap(n.parent_id),
    })),
    edges: graph.edges.map((e) => ({ ...e, id: newId(), source: remap(e.source), target: remap(e.target) })),
  };
}
