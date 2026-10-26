import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export interface MindNodeActions {
  commitLabel: (id: string, label: string) => void;
  cancelEdit: () => void;
  toggle: (id: string) => void;
}

export type MindNodeData = {
  label: string;
  description: string;
  isRoot: boolean;
  childCount: number;
  collapsed: boolean;
  editing: boolean;
  actions: MindNodeActions;
};

export type MindFlowNode = Node<MindNodeData, "mind">;

function LabelInput({ id, initial, actions }: { id: string; initial: string; actions: MindNodeActions }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish(commit: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (commit) actions.commitLabel(id, value);
    else actions.cancelEdit();
  }

  return (
    <input
      ref={inputRef}
      className="mm-node-input nodrag nowheel"
      value={value}
      maxLength={200}
      aria-label="Node label"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

function MindMapNode({ id, data, selected }: NodeProps<MindFlowNode>) {
  return (
    <div className={`mm-node${data.isRoot ? " root" : ""}${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="mm-handle" />
      {data.editing ? (
        <LabelInput id={id} initial={data.label} actions={data.actions} />
      ) : (
        <div className="mm-node-label" title={data.label}>
          {data.label}
        </div>
      )}
      {data.description && (
        <div className="mm-node-desc" title={data.description}>
          {data.description}
        </div>
      )}
      {data.childCount > 0 && (
        <button
          className="mm-collapse nodrag"
          title={data.collapsed ? `Expand (${data.childCount} hidden)` : "Collapse branch"}
          onClick={(e) => {
            e.stopPropagation();
            data.actions.toggle(id);
          }}
        >
          {data.collapsed ? `+${data.childCount}` : "−"}
        </button>
      )}
      <Handle type="source" position={Position.Right} className="mm-handle" />
    </div>
  );
}

export default memo(MindMapNode);
