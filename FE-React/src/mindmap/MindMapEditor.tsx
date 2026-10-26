import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import { GitBranch, Minus, Plus } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useBlocker } from "react-router-dom";
import { ArrowLeft, FileText, Maximize2, Network, Redo2, Save, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useTheme } from "../theme";

import { createMap, errorMessage, expandNode, getMap, importNotes, renameMap, saveGraph, type ExpansionNode } from "./api";
import ImportNotesPanel from "./ImportNotesPanel";
import {
  addChild,
  addSibling,
  childrenMap,
  connect,
  deleteNode,
  findNode,
  getRoot,
  graphProblems,
  hiddenNodeIds,
  moveNodes,
  removeEdge,
  renameNode,
  setDescription,
  setEdgeLabel,
  subtreeIds,
  toggleCollapsed,
} from "./graph";
import { initHistory, push, redo, replace, undo, type History } from "./history";
import { autoLayout } from "./layout";
import MindMapNode, { type MindFlowNode, type MindNodeActions } from "./MindMapNode";
import type { Draft, MindGraph } from "./types";
import "./MindMap.css";

const nodeTypes = { mind: MindMapNode };
const EMPTY_GRAPH: MindGraph = { nodes: [], edges: [] };

interface Props {
  mapId: string | null; // null = unsaved draft
  draft: Draft | null;
  onClose: () => void;
  onCreated: (mapId: string) => void; // a draft was saved as a new map
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };
type Notice = { kind: "error" | "info"; text: string } | null;

export default function MindMapEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({ mapId: initialMapId, draft, onClose, onCreated }: Props) {
  const { fitView } = useReactFlow();
  const { theme } = useTheme();
  const [mapId, setMapId] = useState(initialMapId);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [load, setLoad] = useState<LoadState>(draft ? { status: "ready" } : { status: "loading" });
  const [hist, setHist] = useState<History<MindGraph>>(() => initHistory(draft?.graph ?? EMPTY_GRAPH));
  // The last graph known to be persisted; null means this draft was never saved
  const [saved, setSaved] = useState<MindGraph | null>(draft ? null : EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [connectMenu, setConnectMenu] = useState<{ sourceId: string; x: number; y: number } | null>(null);
  const dragBase = useRef<MindGraph | null>(null);

  // Import notes panel
  const [importOpen, setImportOpen] = useState(false);

  // AI expand state
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandInstruction, setExpandInstruction] = useState("");
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandError, setExpandError] = useState("");
  const [expandSuggestions, setExpandSuggestions] = useState<ExpansionNode[] | null>(null);
  const expandAbort = useRef<AbortController | null>(null);
  const expandTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const graph = hist.present;
  const isDraft = mapId === null;
  const dirty = saved === null || graph !== saved;

  // ── Loading ───────────────────────────────────────────────────────────────

  const loadMap = useCallback(async (id: string) => {
    setLoad({ status: "loading" });
    try {
      const m = await getMap(id);
      const loaded: MindGraph = { nodes: m.nodes, edges: m.edges };
      setTitle(m.title);
      setHist(initHistory(loaded));
      setSaved(loaded);
      setLoad({ status: "ready" });
    } catch (err) {
      setLoad({ status: "error", message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    if (initialMapId && !draft) loadMap(initialMapId);
  }, [initialMapId, draft, loadMap]);

  // ── Unsaved-change protection ─────────────────────────────────────────────

  // Any in-app navigation away (sidebar, back button, "← Maps") asks first
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const message = isDraft
      ? "Discard this AI draft? It hasn't been saved."
      : "You have unsaved changes. Leave without saving?";
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, isDraft]);

  // Once a draft is saved, move to the new map's permanent URL
  useEffect(() => {
    if (initialMapId === null && mapId && !dirty) onCreated(mapId);
  }, [initialMapId, mapId, dirty, onCreated]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (notice?.kind !== "info") return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  // ── Graph editing ─────────────────────────────────────────────────────────

  const commit = useCallback((next: MindGraph) => setHist((h) => push(h, next)), []);

  function addChildTo(parentId: string) {
    const result = addChild(graph, parentId);
    if (!result) return setNotice({ kind: "error", text: "Can't add more nodes: the map has reached its size limit." });
    commit(result.graph);
    selectNode(result.id);
    setEditingId(result.id);
  }

  function addSiblingOf(nodeId: string) {
    const node = findNode(graph, nodeId);
    if (node?.parent_id === null) return addChildTo(nodeId); // the root has no siblings
    const result = addSibling(graph, nodeId);
    if (!result) return setNotice({ kind: "error", text: "Can't add more nodes: the map has reached its size limit." });
    commit(result.graph);
    selectNode(result.id);
    setEditingId(result.id);
  }

  function deleteSelection() {
    if (selectedEdgeId) {
      commit(removeEdge(graph, selectedEdgeId));
      setSelectedEdgeId(null);
      return;
    }
    if (!selectedId) return;
    const node = findNode(graph, selectedId);
    if (!node) return;
    if (node.parent_id === null) {
      setNotice({ kind: "error", text: "The root node can't be deleted. Delete the whole map from the maps list instead." });
      return;
    }
    const below = subtreeIds(graph, selectedId).size - 1;
    if (below > 0 && !window.confirm(`Delete "${node.label}" and ${below} node${below > 1 ? "s" : ""} below it?`)) return;
    const result = deleteNode(graph, selectedId);
    if (!result) return;
    commit(result.graph);
    selectNode(node.parent_id);
  }

  function toggle(id: string) {
    commit(toggleCollapsed(graph, id));
  }

  function arrange() {
    commit(autoLayout(graph));
    requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
  }

  function doUndo() {
    setEditingId(null);
    setHist(undo);
  }

  function doRedo() {
    setEditingId(null);
    setHist(redo);
  }

  function selectNode(id: string | null) {
    setSelectedId(id);
    setSelectedEdgeId(null);
    // Reset expand panel when switching nodes
    expandAbort.current?.abort();
    setExpandOpen(false);
    setExpandSuggestions(null);
    setExpandError("");
    setExpandInstruction("");
  }

  function openExpandForNode(nodeId: string) {
    selectNode(nodeId);
    setExpandOpen(true);
    setExpandSuggestions(null);
    setExpandError("");
    setExpandInstruction("");
    // Focus the textarea after React re-renders
    setTimeout(() => expandTextareaRef.current?.focus(), 50);
  }

  // Stable callbacks for memoized nodes; they always call the latest handlers
  const latest = useRef<MindNodeActions>(null!);
  latest.current = {
    commitLabel: (id, label) => {
      setEditingId(null);
      commit(renameNode(graph, id, label));
    },
    cancelEdit: () => setEditingId(null),
    toggle,
  };
  const nodeActions = useMemo<MindNodeActions>(
    () => ({
      commitLabel: (id, label) => latest.current.commitLabel(id, label),
      cancelEdit: () => latest.current.cancelEdit(),
      toggle: (id) => latest.current.toggle(id),
    }),
    []
  );

  // ── AI node expansion ─────────────────────────────────────────────────────

  async function runExpand() {
    if (!mapId || !selectedId || expandLoading) return;
    expandAbort.current?.abort();
    const ctrl = new AbortController();
    expandAbort.current = ctrl;
    setExpandLoading(true);
    setExpandError("");
    setExpandSuggestions(null);
    try {
      const res = await expandNode(mapId, selectedId, expandInstruction, ctrl.signal);
      setExpandSuggestions(res.nodes);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setExpandError(errorMessage(err));
    } finally {
      setExpandLoading(false);
    }
  }

  function flattenExpansion(
    suggestions: ExpansionNode[],
    parentId: string,
    g: MindGraph,
    idCounter: { n: number }
  ): MindGraph {
    let cur = g;
    for (const s of suggestions) {
      const id = `ai${Date.now()}${++idCounter.n}`;
      cur = {
        ...cur,
        nodes: [...cur.nodes, {
          id,
          parent_id: parentId,
          label: s.label.trim() || "Node",
          description: s.description.trim(),
          x: 0,
          y: 0,
          collapsed: false,
        }],
        edges: cur.edges,
      };
      if (s.children?.length) {
        cur = flattenExpansion(s.children, id, cur, idCounter);
      }
    }
    return cur;
  }

  function addSuggestions() {
    if (!selectedId || !expandSuggestions?.length) return;
    const idCounter = { n: 0 };
    const next = flattenExpansion(expandSuggestions, selectedId, graph, idCounter);
    commit(autoLayout(next));
    requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
    setExpandSuggestions(null);
    setExpandOpen(false);
    setExpandInstruction("");
  }

  function addImportedNotes(parentNodeId: string | null, suggestions: ExpansionNode[]) {
    if (!suggestions.length) return;
    const idCounter = { n: Date.now() };
    const attachTo = parentNodeId ?? graph.nodes.find((n) => n.parent_id === null)?.id ?? null;
    if (!attachTo) return;
    const next = flattenExpansion(suggestions, attachTo, graph, idCounter);
    commit(autoLayout(next));
    requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
    setImportOpen(false);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async function save() {
    if (saving) return;
    const snapshot = graph;
    const problems = graphProblems(snapshot);
    if (problems.length) {
      setNotice({ kind: "error", text: `Can't save: ${problems[0]}` });
      return;
    }
    setSaving(true);
    try {
      if (mapId) {
        await saveGraph(mapId, snapshot);
      } else {
        const created = await createMap(title.trim() || "Untitled map", snapshot);
        setMapId(created.id);
      }
      setSaved(snapshot);
      setNotice({ kind: "info", text: isDraft ? "Saved as a new map" : "Saved" });
    } catch (err) {
      setNotice({ kind: "error", text: `Couldn't save: ${errorMessage(err)} Your changes are still here.` });
    } finally {
      setSaving(false);
    }
  }

  // Save requested while typing: run after the pending label edit has been committed
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!pendingSave) return;
    setPendingSave(false);
    saveRef.current();
  }, [pendingSave]);

  async function commitTitle(value: string) {
    const next = value.trim().slice(0, 255);
    if (!next || next === title) return;
    const previous = title;
    setTitle(next);
    if (!mapId) return;
    try {
      await renameMap(mapId, next);
    } catch (err) {
      setTitle(previous);
      setNotice({ kind: "error", text: `Couldn't rename: ${errorMessage(err)}` });
    }
  }

  // Navigation is guarded by the blocker above, so closing needs no extra confirm
  const close = onClose;

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (load.status !== "ready") return;
    const target = e.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === "s") {
      e.preventDefault();
      if (typing) {
        target.blur();
        setPendingSave(true);
      } else {
        save();
      }
      return;
    }
    if (typing || document.querySelector(".mm-modal-backdrop")) return;

    if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      doRedo();
    } else if (mod && key === "z") {
      e.preventDefault();
      doUndo();
    } else if (!mod && !e.altKey) {
      if (e.key === "Tab" && selectedId) {
        e.preventDefault();
        addChildTo(selectedId);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        addSiblingOf(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "F2" && selectedId) {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key === " " && selectedId) {
        e.preventDefault();
        toggle(selectedId);
      } else if (e.key === "Escape") {
        if (connectMenu) { setConnectMenu(null); return; }
        selectNode(null);
      }
    }
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // ── Canvas data ───────────────────────────────────────────────────────────

  const hidden = useMemo(() => hiddenNodeIds(graph), [graph]);
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [parent, kids] of childrenMap(graph)) counts.set(parent, kids.length);
    return counts;
  }, [graph]);
  const rootId = useMemo(() => getRoot(graph)?.id, [graph]);

  const rfNodes = useMemo<MindFlowNode[]>(
    () =>
      graph.nodes
        .filter((n) => !hidden.has(n.id))
        .map((n) => ({
          id: n.id,
          type: "mind" as const,
          position: { x: n.x, y: n.y },
          selected: n.id === selectedId,
          measured: measured[n.id],
          data: {
            label: n.label,
            description: n.description,
            isRoot: n.id === rootId,
            childCount: childCounts.get(n.id) ?? 0,
            collapsed: n.collapsed,
            editing: n.id === editingId,
            actions: nodeActions,
          },
        })),
    [graph, hidden, selectedId, editingId, measured, childCounts, rootId, nodeActions]
  );

  const rfEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    for (const n of graph.nodes) {
      if (n.parent_id === null || hidden.has(n.id)) continue;
      edges.push({
        id: `tree-${n.id}`,
        source: n.parent_id,
        target: n.id,
        selectable: false,
        deletable: false,
        focusable: false,
        className: "mm-tree-edge",
      });
    }
    for (const e of graph.edges) {
      if (hidden.has(e.source) || hidden.has(e.target)) continue;
      edges.push({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
        selected: e.id === selectedEdgeId,
        deletable: false,
        className: "mm-link-edge",
      });
    }
    return edges;
  }, [graph, hidden, selectedEdgeId]);

  const onNodesChange = useCallback((changes: NodeChange<MindFlowNode>[]) => {
    const moves = new Map<string, { x: number; y: number }>();
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === "position" && c.position) moves.set(c.id, c.position);
      if (c.type === "dimensions" && c.dimensions) sizes[c.id] = c.dimensions;
    }
    if (Object.keys(sizes).length) setMeasured((m) => ({ ...m, ...sizes }));
    // Positions update live during a drag; one history entry is recorded when it ends
    if (moves.size) setHist((h) => replace(h, moveNodes(h.present, moves)));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (load.status === "loading") {
    return (
      <div className="mm-center">
        <span className="mm-spinner" /> Loading map…
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="mm-center column">
        <p>Couldn't load this map: {load.message}</p>
        <div className="mm-row">
          <button className="mm-btn" onClick={onClose}>
            Back to maps
          </button>
          {initialMapId && (
            <button className="mm-btn primary" onClick={() => loadMap(initialMapId)}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const selectedNode = selectedId ? findNode(graph, selectedId) : undefined;
  const selectedEdge = selectedEdgeId ? graph.edges.find((e) => e.id === selectedEdgeId) : undefined;
  const status = saving ? "Saving…" : dirty ? (isDraft ? "Not saved" : "Unsaved changes") : "All changes saved";

  return (
    <div className="mm-editor">
      <div className="mm-toolbar">
        <button className="mm-btn" onClick={close} title="Back to maps">
          <ArrowLeft size={14} /> Maps
        </button>
        <input
          key={title}
          className="mm-title-input"
          defaultValue={title}
          maxLength={255}
          aria-label="Map title"
          onBlur={(e) => commitTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = title;
              e.currentTarget.blur();
            }
          }}
        />
        <div className="mm-toolbar-group">
          <button className="mm-btn" onClick={doUndo} disabled={!hist.past.length} title="Undo (Ctrl+Z)">
            <Undo2 size={14} /> Undo
          </button>
          <button className="mm-btn" onClick={doRedo} disabled={!hist.future.length} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={14} /> Redo
          </button>
        </div>
        <div className="mm-toolbar-group">
          <button className="mm-btn" onClick={() => selectedId && addChildTo(selectedId)} disabled={!selectedId} title="Add child (Tab)">
            + Child
          </button>
          <button className="mm-btn" onClick={() => selectedId && addSiblingOf(selectedId)} disabled={!selectedId} title="Add sibling (Enter)">
            + Sibling
          </button>
          <button className="mm-btn" onClick={deleteSelection} disabled={!selectedId && !selectedEdgeId} title="Delete (Del)">
            <Trash2 size={14} /> Delete
          </button>
        </div>
        <div className="mm-toolbar-group">
          <button className="mm-btn" onClick={arrange} title="Arrange nodes as a tree">
            <Network size={14} /> Auto-arrange
          </button>
          <button className="mm-btn" onClick={() => fitView({ duration: 300, padding: 0.2 })} title="Fit the map to the screen">
            <Maximize2 size={14} /> Fit
          </button>
        </div>
        {mapId && (
          <button
            className={`mm-btn${importOpen ? " primary" : ""}`}
            onClick={() => setImportOpen((v) => !v)}
            title="Import rough notes and let AI structure them into branches"
          >
            <FileText size={14} /> Import Notes
          </button>
        )}
        <span className={`mm-status${dirty ? " dirty" : ""}`}>{status}</span>
        <button className="mm-btn primary" onClick={save} disabled={saving || (!dirty && !isDraft)} title="Save (Ctrl+S)">
          <Save size={14} /> {isDraft ? "Accept & save" : "Save"}
        </button>
      </div>

      {isDraft && (
        <div className="mm-banner draft">
          <strong>AI draft preview.</strong> Review and edit it freely. It is saved as a new map only when you click
          “Accept &amp; save”. Existing maps are never changed.
          <button className="mm-btn small" onClick={close}>
            Discard
          </button>
        </div>
      )}
      {notice && (
        <div className={`mm-banner ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
          <button className="mm-banner-close" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mm-body">
        {importOpen && mapId && (
          <ImportNotesPanel
            mapId={mapId}
            nodes={graph.nodes}
            onClose={() => setImportOpen(false)}
            onAdd={addImportedNotes}
          />
        )}
        <div className="mm-canvas">
          <ReactFlow<MindFlowNode, Edge>
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={(_, node) => {
              dragBase.current = graph;
              selectNode(node.id);
            }}
            onNodeDragStop={() => {
              const base = dragBase.current;
              dragBase.current = null;
              if (base) setHist((h) => push(h, h.present, base));
            }}
            onNodeClick={(_, node) => selectNode(node.id)}
            onNodeDoubleClick={(_, node) => {
              selectNode(node.id);
              setEditingId(node.id);
            }}
            onEdgeClick={(_, edge) => {
              if (edge.id.startsWith("tree-")) return;
              setSelectedEdgeId(edge.id);
              setSelectedId(null);
            }}
            onPaneClick={() => { selectNode(null); setConnectMenu(null); }}
            onConnectEnd={(event, connectionState: FinalConnectionState) => {
              if (connectionState.isValid) return;
              const sourceId = connectionState.fromNode?.id;
              if (!sourceId) return;
              const e = event as MouseEvent;
              setConnectMenu({ sourceId, x: e.clientX, y: e.clientY });
            }}
            onConnect={(c) => {
              const result = connect(graph, c.source, c.target);
              if ("error" in result) setNotice({ kind: "error", text: result.error });
              else {
                commit(result.graph);
                setSelectedEdgeId(result.id);
                setSelectedId(null);
              }
            }}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            minZoom={0.1}
            maxZoom={2}
            colorMode={theme}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {connectMenu && (
          <>
            <div className="mm-connect-overlay" onClick={() => setConnectMenu(null)} />
            <div
              className="mm-connect-menu"
              style={{ left: connectMenu.x, top: connectMenu.y }}
            >
              <p className="mm-connect-label">Add node</p>
              <button
                className="mm-connect-item"
                onClick={() => { addChildTo(connectMenu.sourceId); setConnectMenu(null); }}
              >
                <GitBranch size={14} />
                Child
              </button>
              <button
                className="mm-connect-item"
                onClick={() => { addSiblingOf(connectMenu.sourceId); setConnectMenu(null); }}
              >
                <Plus size={14} />
                Sibling
              </button>
              {mapId && (
                <button
                  className="mm-connect-item expand"
                  onClick={() => { openExpandForNode(connectMenu.sourceId); setConnectMenu(null); }}
                >
                  <Sparkles size={14} />
                  Expand with AI
                </button>
              )}
              <button
                className="mm-connect-item cancel"
                onClick={() => setConnectMenu(null)}
              >
                <Minus size={14} />
                Cancel
              </button>
            </div>
          </>
        )}

        {(selectedNode || selectedEdge) && (
          <aside className="mm-inspector">
            {selectedNode && (
              <>
                <h3>{selectedNode.parent_id === null ? "Root node" : "Node"}</h3>
                <label className="mm-field">
                  <span>Label</span>
                  <input
                    key={`${selectedNode.id}-label-${selectedNode.label}`}
                    defaultValue={selectedNode.label}
                    maxLength={200}
                    onBlur={(e) => {
                      const next = renameNode(graph, selectedNode.id, e.target.value);
                      if (next === graph) e.target.value = selectedNode.label;
                      else commit(next);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <label className="mm-field">
                  <span>Description</span>
                  <textarea
                    key={`${selectedNode.id}-desc-${selectedNode.description}`}
                    defaultValue={selectedNode.description}
                    rows={5}
                    maxLength={2000}
                    placeholder="Optional notes"
                    onBlur={(e) => commit(setDescription(graph, selectedNode.id, e.target.value))}
                  />
                </label>
                <div className="mm-inspector-actions">
                  <button className="mm-btn" onClick={() => addChildTo(selectedNode.id)}>
                    + Child
                  </button>
                  <button className="mm-btn" onClick={() => addSiblingOf(selectedNode.id)}>
                    + Sibling
                  </button>
                  {(childCounts.get(selectedNode.id) ?? 0) > 0 && (
                    <button className="mm-btn" onClick={() => toggle(selectedNode.id)}>
                      {selectedNode.collapsed ? "Expand" : "Collapse"}
                    </button>
                  )}
                  {selectedNode.parent_id !== null && (
                    <button className="mm-btn danger" onClick={deleteSelection}>
                      Delete
                    </button>
                  )}
                </div>
                {/* AI expand section — only when editing a saved map */}
                {mapId && (
                  <div className="mm-expand">
                    <button
                      className={`mm-btn mm-expand-toggle${expandOpen ? " primary" : ""}`}
                      onClick={() => { setExpandOpen((v) => !v); setExpandSuggestions(null); setExpandError(""); }}
                    >
                      <Sparkles size={13} /> Expand with AI
                    </button>

                    {expandOpen && (
                      <div className="mm-expand-body">
                        <textarea
                          ref={expandTextareaRef}
                          className="mm-expand-input"
                          rows={2}
                          placeholder={`e.g. "Add subtopics about ${selectedNode.label}…"`}
                          value={expandInstruction}
                          onChange={(e) => setExpandInstruction(e.target.value)}
                          disabled={expandLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runExpand(); }
                          }}
                        />
                        {expandLoading ? (
                          <span className="mm-expand-status"><span className="mm-spinner" /> Generating…</span>
                        ) : (
                          <button className="mm-btn primary" style={{ width: "100%" }} onClick={runExpand}>
                            Generate
                          </button>
                        )}

                        {expandError && <p className="mm-expand-error">{expandError}</p>}

                        {expandSuggestions && expandSuggestions.length > 0 && (
                          <>
                            <p className="mm-expand-preview-title">
                              {expandSuggestions.length} node{expandSuggestions.length !== 1 ? "s" : ""} to add:
                            </p>
                            <ul className="mm-expand-preview">
                              {expandSuggestions.map((n, i) => (
                                <li key={i}>
                                  <span className="mm-expand-label">{n.label}</span>
                                  {n.children?.length > 0 && (
                                    <span className="mm-expand-sub">+{n.children.length} child{n.children.length !== 1 ? "ren" : ""}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <div className="mm-expand-actions">
                              <button className="mm-btn" onClick={() => setExpandSuggestions(null)}>Discard</button>
                              <button className="mm-btn primary" onClick={addSuggestions}>Add to map</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="mm-hint">Drag from a node's edge dot to another node to add a cross-connection.</p>
              </>
            )}
            {selectedEdge && (
              <>
                <h3>Connection</h3>
                <p className="mm-hint">
                  {findNode(graph, selectedEdge.source)?.label} ↔ {findNode(graph, selectedEdge.target)?.label}
                </p>
                <label className="mm-field">
                  <span>Label</span>
                  <input
                    key={`${selectedEdge.id}-${selectedEdge.label}`}
                    defaultValue={selectedEdge.label}
                    maxLength={200}
                    placeholder="e.g. depends on"
                    onBlur={(e) => commit(setEdgeLabel(graph, selectedEdge.id, e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <button className="mm-btn danger" onClick={deleteSelection}>
                  Delete connection
                </button>
              </>
            )}
          </aside>
        )}
      </div>

      <div className="mm-shortcuts">
        Tab child · Enter sibling · F2 / double-click rename · Space collapse · Del delete · Ctrl+Z / Ctrl+Shift+Z undo/redo ·
        Ctrl+S save · drag nodes to move · scroll to zoom · drag background to pan
      </div>
    </div>
  );
}
