import { graphProblems, withFreshIds } from "./graph";
import { autoLayout } from "./layout";
import type { Draft, GeneratedDraft, MindGraph } from "./types";

/**
 * Turn a server-validated AI draft into an editor-ready graph: re-check its
 * structure, give it fresh ids (AI ids like "n1" would collide across maps),
 * and lay it out. Throws instead of returning a broken graph.
 */
export function prepareDraft(draft: GeneratedDraft): Draft {
  const raw: MindGraph = {
    nodes: (draft.nodes ?? []).map((n) => ({
      id: String(n.id),
      parent_id: n.parent_id ?? null,
      label: String(n.label ?? ""),
      description: String(n.description ?? ""),
      x: 0,
      y: 0,
      collapsed: false,
    })),
    edges: (draft.edges ?? []).map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      label: String(e.label ?? ""),
    })),
  };

  const problems = graphProblems(raw);
  if (problems.length) {
    throw new Error(`The AI response was invalid (${problems.slice(0, 2).join(" ")}). Please try again.`);
  }

  return {
    title: draft.title?.trim() || "AI generated map",
    graph: autoLayout(withFreshIds(raw)),
  };
}
