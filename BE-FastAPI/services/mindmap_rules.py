"""
Structural validation for mind map graphs.

These rules run on every save and on every AI draft, so the database never
holds a graph that breaks parent references, cycles, or edge endpoints.
"""

import re
from typing import Sequence

MAX_NODES = 300
MAX_EDGES = 100
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class GraphValidationError(ValueError):
    def __init__(self, errors: Sequence[str]):
        self.errors = list(errors)
        super().__init__("; ".join(self.errors))


def validate_graph(nodes: Sequence, edges: Sequence) -> None:
    """
    Raise GraphValidationError listing every problem found.

    Nodes need: id, parent_id, label. Edges need: id, source, target.
    """
    errors: list[str] = []

    if not nodes:
        errors.append("A map must contain at least one node.")
    if len(nodes) > MAX_NODES:
        errors.append(f"A map can have at most {MAX_NODES} nodes (got {len(nodes)}).")
    if len(edges) > MAX_EDGES:
        errors.append(f"A map can have at most {MAX_EDGES} cross-connections (got {len(edges)}).")

    node_ids: set[str] = set()
    for node in nodes:
        if not ID_PATTERN.match(node.id):
            errors.append(f"Invalid node id '{node.id}'. Use 1-64 letters, digits, '-' or '_'.")
        if node.id in node_ids:
            errors.append(f"Duplicate node id '{node.id}'.")
        node_ids.add(node.id)
        if not node.label.strip():
            errors.append(f"Node '{node.id}' has an empty label.")

    roots = [node for node in nodes if node.parent_id is None]
    if nodes and len(roots) != 1:
        errors.append(f"A map must have exactly one root node; found {len(roots)}.")

    parent_of: dict[str, str] = {}
    for node in nodes:
        if node.parent_id is None:
            continue
        if node.parent_id == node.id:
            errors.append(f"Node '{node.id}' cannot be its own parent.")
        elif node.parent_id not in node_ids:
            errors.append(f"Node '{node.id}' references missing parent '{node.parent_id}'.")
        else:
            parent_of[node.id] = node.parent_id

    # Walk each parent chain; revisiting a node means the chain loops
    reported_cycles: set[str] = set()
    for start in parent_of:
        visited: list[str] = []
        current: str | None = start
        while current is not None and current not in visited:
            visited.append(current)
            current = parent_of.get(current)
        if current is not None and current not in reported_cycles:
            reported_cycles.add(current)
            errors.append(f"Parent relationships form a cycle involving '{current}'.")

    hierarchy_pairs = {frozenset((child, parent)) for child, parent in parent_of.items()}
    edge_ids: set[str] = set()
    connection_pairs: set[frozenset[str]] = set()
    for edge in edges:
        if not ID_PATTERN.match(edge.id):
            errors.append(f"Invalid connection id '{edge.id}'.")
        if edge.id in edge_ids:
            errors.append(f"Duplicate connection id '{edge.id}'.")
        edge_ids.add(edge.id)

        missing = [end for end in (edge.source, edge.target) if end not in node_ids]
        for end in missing:
            errors.append(f"Connection '{edge.id}' references missing node '{end}'.")
        if missing:
            continue
        if edge.source == edge.target:
            errors.append(f"Connection '{edge.id}' links node '{edge.source}' to itself.")
            continue

        pair = frozenset((edge.source, edge.target))
        if pair in connection_pairs:
            errors.append(f"Duplicate connection between '{edge.source}' and '{edge.target}'.")
        if pair in hierarchy_pairs:
            errors.append(
                f"Connection '{edge.id}' duplicates a parent-child link between "
                f"'{edge.source}' and '{edge.target}'."
            )
        connection_pairs.add(pair)

    if errors:
        raise GraphValidationError(errors)
