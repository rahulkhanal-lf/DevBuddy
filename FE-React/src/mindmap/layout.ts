import dagre from "@dagrejs/dagre";
import { hiddenNodeIds } from "./graph";
import type { MindGraph } from "./types";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 52;
const DESCRIPTION_EXTRA_HEIGHT = 24;

/**
 * Arrange visible nodes left-to-right as a tree. Cross-connections are ignored so
 * they never distort the hierarchy; hidden (collapsed) nodes keep their positions.
 */
export function autoLayout(graph: MindGraph): MindGraph {
  const hidden = hiddenNodeIds(graph);
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of graph.nodes) {
    if (hidden.has(n.id)) continue;
    g.setNode(n.id, {
      width: NODE_WIDTH,
      height: n.description ? NODE_HEIGHT + DESCRIPTION_EXTRA_HEIGHT : NODE_HEIGHT,
    });
  }
  for (const n of graph.nodes) {
    if (n.parent_id !== null && !hidden.has(n.id)) g.setEdge(n.parent_id, n.id);
  }

  dagre.layout(g);

  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (hidden.has(n.id)) return n;
      const p = g.node(n.id);
      // dagre returns centers; the canvas positions nodes by their top-left corner
      return { ...n, x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2) };
    }),
  };
}
