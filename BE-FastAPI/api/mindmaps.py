from uuid import uuid4
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import MindMap, MindNode, MindEdge
from models.user import User
from models.map_collaborator import MapCollaborator
from schemas.mindmap import EdgeIn, GraphIn, MapCreate, MapDetail, MapRename, MapSummary, NodeIn
from pydantic import BaseModel as PydanticBase, Field
from services.auth_service import get_current_user
from services.mindmap_ai import (
    MindMapAIError,
    MindMapGenerateRequest,
    ExpansionNode,
    ask_about_maps,
    expand_node,
    format_maps_as_context,
    generate_from_text,
    generate_mindmap,
    import_notes,
)
from services.mindmap_rules import GraphValidationError, validate_graph

router = APIRouter(prefix="/api/maps", tags=["maps"])


def _summary(m: MindMap, owner: User | None = None) -> MapSummary:
    return MapSummary(
        id=m.id,
        title=m.title,
        created_at=m.created_at.isoformat(),
        updated_at=m.updated_at.isoformat(),
        owner_id=m.owner_id,
        owner_name=owner.name if owner else None,
    )


def _detail(m: MindMap) -> MapDetail:
    return MapDetail(
        **_summary(m).model_dump(),
        nodes=[NodeIn.model_validate(n) for n in m.nodes],
        edges=[EdgeIn(id=e.id, source=e.source_id, target=e.target_id, label=e.label) for e in m.edges],
    )


def _get_map(db: Session, map_id: str) -> MindMap:
    m = db.query(MindMap).filter(MindMap.id == map_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Map not found")
    return m


def _check_access(db: Session, m: MindMap, user: User, require_editor: bool = False) -> None:
    """Raise 403 if user has no access (or insufficient role) to this map."""
    if m.owner_id == user.id:
        return
    collab = db.query(MapCollaborator).filter(
        MapCollaborator.map_id == m.id,
        MapCollaborator.user_id == user.id,
    ).first()
    if not collab:
        raise HTTPException(status_code=403, detail="You don't have access to this map")
    if require_editor and collab.role != "editor":
        raise HTTPException(status_code=403, detail="You need editor access to modify this map")


def _validate(graph: GraphIn) -> None:
    try:
        validate_graph(graph.nodes, graph.edges)
    except GraphValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _replace_graph(db: Session, m: MindMap, graph: GraphIn) -> None:
    """Replace every node and edge of a map in the current transaction."""
    node_ids = [n.id for n in graph.nodes]
    edge_ids = [e.id for e in graph.edges]
    node_clash = db.query(MindNode.id).filter(MindNode.id.in_(node_ids), MindNode.map_id != m.id).first()
    edge_clash = db.query(MindEdge.id).filter(MindEdge.id.in_(edge_ids), MindEdge.map_id != m.id).first() if edge_ids else None
    if node_clash or edge_clash:
        raise HTTPException(status_code=409, detail="Some node or connection ids are already used by another map")

    db.query(MindEdge).filter(MindEdge.map_id == m.id).delete(synchronize_session=False)
    db.query(MindNode).filter(MindNode.map_id == m.id).delete(synchronize_session=False)
    db.flush()
    db.add_all(
        MindNode(
            id=n.id,
            map_id=m.id,
            parent_id=n.parent_id,
            label=n.label.strip(),
            description=n.description,
            x=n.x,
            y=n.y,
            collapsed=n.collapsed,
        )
        for n in graph.nodes
    )
    db.add_all(
        MindEdge(id=e.id, map_id=m.id, source_id=e.source, target_id=e.target, label=e.label)
        for e in graph.edges
    )
    m.updated_at = datetime.utcnow()


@router.get("", response_model=list[MapSummary])
def list_maps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collab_map_ids = (
        db.query(MapCollaborator.map_id)
        .filter(MapCollaborator.user_id == current_user.id)
        .subquery()
    )
    rows = (
        db.query(MindMap, User)
        .outerjoin(User, MindMap.owner_id == User.id)
        .filter(
            (MindMap.owner_id == current_user.id) | (MindMap.id.in_(collab_map_ids))
        )
        .order_by(MindMap.updated_at.desc())
        .all()
    )
    return [_summary(m, owner) for m, owner in rows]


@router.post("", response_model=MapDetail, status_code=201)
def create_map(
    payload: MapCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = payload.title.strip() or "Untitled map"
    graph = payload.graph or GraphIn(nodes=[NodeIn(id=str(uuid4()), label=title)])
    _validate(graph)

    now = datetime.utcnow()
    m = MindMap(title=title, owner_id=current_user.id, created_at=now, updated_at=now)
    db.add(m)
    db.flush()
    _replace_graph(db, m, graph)
    db.commit()
    db.refresh(m)
    return _detail(m)


class MapChatRequest(PydanticBase):
    question: str
    map_id: str | None = None  # When set, scope context to this single map


@router.post("/chat")
def chat_about_maps(
    payload: MapChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Answer a question about the user's mind maps using their node data as context."""
    if payload.map_id:
        m = _get_map(db, payload.map_id)
        _check_access(db, m, current_user)
        maps = [m]
    else:
        collab_map_ids = (
            db.query(MapCollaborator.map_id)
            .filter(MapCollaborator.user_id == current_user.id)
            .subquery()
        )
        maps = (
            db.query(MindMap)
            .filter(
                (MindMap.owner_id == current_user.id) | (MindMap.id.in_(collab_map_ids))
            )
            .order_by(MindMap.updated_at.desc())
            .all()
        )
    context = format_maps_as_context(maps)
    try:
        answer = ask_about_maps(context, payload.question)
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"answer": answer}


@router.post("/generate")
def generate_map(payload: MindMapGenerateRequest, _: User = Depends(get_current_user)):
    """Generate an unsaved draft. Nothing is persisted until the client saves it."""
    try:
        title, graph = generate_mindmap(payload)
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"title": title, "nodes": graph.nodes, "edges": graph.edges}


class GenerateFromTextRequest(PydanticBase):
    text: str = Field(min_length=20, max_length=20000)


@router.post("/generate-from-text")
def generate_map_from_text(payload: GenerateFromTextRequest, _: User = Depends(get_current_user)):
    """Generate an unsaved mind map draft from a free-form text block (e.g. a chat response)."""
    try:
        title, graph = generate_from_text(payload.text)
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"title": title, "nodes": graph.nodes, "edges": graph.edges}


class ExpandRequest(PydanticBase):
    node_id: str
    instruction: str = ""


def _serialise_expansion(nodes: list[ExpansionNode]) -> list[dict]:
    """Recursively convert ExpansionNode tree to JSON-serialisable dicts."""
    result = []
    for n in nodes:
        result.append({
            "label": n.label.strip()[:200],
            "description": n.description.strip()[:1000],
            "children": _serialise_expansion(n.children),
        })
    return result


class ImportNotesRequest(PydanticBase):
    notes: str = Field(min_length=10, max_length=20000)
    parent_node_id: str | None = None  # None = attach under root


@router.post("/{map_id}/import-notes")
def import_map_notes(
    map_id: str,
    payload: ImportNotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert rough notes into structured child nodes and attach under a chosen parent."""
    m = _get_map(db, map_id)
    _check_access(db, m, current_user, require_editor=True)
    context = _build_tree_text(m.nodes)
    if payload.parent_node_id:
        parent = next((n for n in m.nodes if n.id == payload.parent_node_id), None)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent node not found")
        parent_label = parent.label
    else:
        root = next((n for n in m.nodes if n.parent_id is None), None)
        parent_label = root.label if root else m.title
        payload.parent_node_id = root.id if root else None
    try:
        suggestions = import_notes(
            map_context=context,
            parent_label=parent_label,
            notes=payload.notes,
        )
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"parent_node_id": payload.parent_node_id, "nodes": _serialise_expansion(suggestions)}


@router.post("/{map_id}/expand")
def expand_map_node(
    map_id: str,
    payload: ExpandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI-suggest new child nodes for a specific node, using the map as context."""
    m = _get_map(db, map_id)
    _check_access(db, m, current_user)
    # Build context from this map's node tree
    context = _build_tree_text(m.nodes)
    # Find the target node
    target = next((n for n in m.nodes if n.id == payload.node_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Node not found")
    # Existing direct children labels (to avoid duplicates)
    existing = [n.label for n in m.nodes if n.parent_id == payload.node_id]
    try:
        suggestions = expand_node(
            map_context=context,
            node_label=target.label,
            node_description=target.description,
            existing_children=existing,
            instruction=payload.instruction.strip(),
        )
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"nodes": _serialise_expansion(suggestions)}


def _build_tree_text(nodes) -> str:
    """Render a node list as an indented tree string."""
    by_id = {n.id: n for n in nodes}
    children: dict = {}
    for n in nodes:
        children.setdefault(n.parent_id, []).append(n)
    lines: list[str] = []

    def walk(parent_id, indent: int) -> None:
        for n in children.get(parent_id, []):
            prefix = "  " * indent + ("- " if indent else "")
            lines.append(f"{prefix}{n.label}")
            walk(n.id, indent + 1)

    walk(None, 0)
    return "\n".join(lines)


@router.get("/{map_id}", response_model=MapDetail)
def get_map(
    map_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    _check_access(db, m, current_user)
    return _detail(m)


@router.patch("/{map_id}", response_model=MapSummary)
def rename_map(
    map_id: str,
    payload: MapRename,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    _check_access(db, m, current_user, require_editor=True)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
    m.title = title
    m.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(m)
    return _summary(m)


@router.put("/{map_id}/graph", response_model=MapDetail)
def save_graph(
    map_id: str,
    payload: GraphIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    _check_access(db, m, current_user, require_editor=True)
    _validate(payload)
    _replace_graph(db, m, payload)
    db.commit()
    db.refresh(m)
    return _detail(m)


@router.post("/{map_id}/duplicate", response_model=MapDetail, status_code=201)
def duplicate_map(
    map_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    source = _get_map(db, map_id)
    _check_access(db, source, current_user)
    # Fresh ids keep the copy independent; relationships are remapped through id_map
    id_map = {n.id: str(uuid4()) for n in source.nodes}
    graph = GraphIn(
        nodes=[
            NodeIn(
                id=id_map[n.id],
                parent_id=id_map.get(n.parent_id) if n.parent_id else None,
                label=n.label,
                description=n.description,
                x=n.x,
                y=n.y,
                collapsed=n.collapsed,
            )
            for n in source.nodes
        ],
        edges=[
            EdgeIn(id=str(uuid4()), source=id_map[e.source_id], target=id_map[e.target_id], label=e.label)
            for e in source.edges
        ],
    )
    _validate(graph)

    now = datetime.utcnow()
    copy = MindMap(title=f"{source.title} (copy)"[:255], owner_id=current_user.id, created_at=now, updated_at=now)
    db.add(copy)
    db.flush()
    _replace_graph(db, copy, graph)
    db.commit()
    db.refresh(copy)
    return _detail(copy)


@router.delete("/{map_id}")
def delete_map(
    map_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    if m.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this map")
    db.delete(m)
    db.commit()
    return {"message": "Map deleted"}


# ── Collaborator endpoints ──────────────────────────────────────────────────

class AddCollaboratorRequest(PydanticBase):
    email: str


@router.get("/{map_id}/collaborators")
def list_collaborators(
    map_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    _check_access(db, m, current_user)
    rows = (
        db.query(MapCollaborator, User)
        .join(User, MapCollaborator.user_id == User.id)
        .filter(MapCollaborator.map_id == map_id)
        .all()
    )
    return [
        {"id": u.id, "name": u.name, "email": u.email, "role": c.role}
        for c, u in rows
    ]


@router.post("/{map_id}/collaborators", status_code=201)
def add_collaborator(
    map_id: str,
    payload: AddCollaboratorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    if m.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can add collaborators")
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found with that email")
    existing = (
        db.query(MapCollaborator)
        .filter(MapCollaborator.map_id == map_id, MapCollaborator.user_id == user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User is already a collaborator")
    collab = MapCollaborator(map_id=map_id, user_id=user.id)
    db.add(collab)
    db.commit()
    return {"id": user.id, "name": user.name, "email": user.email, "role": collab.role}


@router.delete("/{map_id}/collaborators/{user_id}")
def remove_collaborator(
    map_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_map(db, map_id)
    if m.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can remove collaborators")
    collab = (
        db.query(MapCollaborator)
        .filter(MapCollaborator.map_id == map_id, MapCollaborator.user_id == user_id)
        .first()
    )
    if not collab:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    db.delete(collab)
    db.commit()
    return {"message": "Collaborator removed"}
