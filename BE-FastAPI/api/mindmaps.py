from uuid import uuid4
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import MindMap, MindNode, MindEdge
from schemas.mindmap import EdgeIn, GraphIn, MapCreate, MapDetail, MapRename, MapSummary, NodeIn
from pydantic import BaseModel as PydanticBase
from services.mindmap_ai import (
    MindMapAIError,
    MindMapGenerateRequest,
    ask_about_maps,
    format_maps_as_context,
    generate_mindmap,
)
from services.mindmap_rules import GraphValidationError, validate_graph

router = APIRouter(prefix="/api/maps", tags=["maps"])


def _summary(m: MindMap) -> MapSummary:
    return MapSummary(
        id=m.id,
        title=m.title,
        created_at=m.created_at.isoformat(),
        updated_at=m.updated_at.isoformat(),
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
def list_maps(db: Session = Depends(get_db)):
    maps = db.query(MindMap).order_by(MindMap.updated_at.desc()).all()
    return [_summary(m) for m in maps]


@router.post("", response_model=MapDetail, status_code=201)
def create_map(payload: MapCreate, db: Session = Depends(get_db)):
    title = payload.title.strip() or "Untitled map"
    graph = payload.graph or GraphIn(nodes=[NodeIn(id=str(uuid4()), label=title)])
    _validate(graph)

    now = datetime.utcnow()
    m = MindMap(id=str(uuid4()), title=title, created_at=now, updated_at=now)
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
def chat_about_maps(payload: MapChatRequest, db: Session = Depends(get_db)):
    """Answer a question about the user's mind maps using their node data as context."""
    if payload.map_id:
        maps = db.query(MindMap).filter(MindMap.id == payload.map_id).all()
        if not maps:
            raise HTTPException(status_code=404, detail="Map not found")
    else:
        maps = db.query(MindMap).order_by(MindMap.updated_at.desc()).all()
    context = format_maps_as_context(maps)
    try:
        answer = ask_about_maps(context, payload.question)
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"answer": answer}


@router.post("/generate")
def generate_map(payload: MindMapGenerateRequest):
    """Generate an unsaved draft. Nothing is persisted until the client saves it."""
    try:
        title, graph = generate_mindmap(payload)
    except MindMapAIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"title": title, "nodes": graph.nodes, "edges": graph.edges}


@router.get("/{map_id}", response_model=MapDetail)
def get_map(map_id: str, db: Session = Depends(get_db)):
    return _detail(_get_map(db, map_id))


@router.patch("/{map_id}", response_model=MapSummary)
def rename_map(map_id: str, payload: MapRename, db: Session = Depends(get_db)):
    m = _get_map(db, map_id)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
    m.title = title
    m.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(m)
    return _summary(m)


@router.put("/{map_id}/graph", response_model=MapDetail)
def save_graph(map_id: str, payload: GraphIn, db: Session = Depends(get_db)):
    m = _get_map(db, map_id)
    _validate(payload)
    _replace_graph(db, m, payload)
    db.commit()
    db.refresh(m)
    return _detail(m)


@router.post("/{map_id}/duplicate", response_model=MapDetail, status_code=201)
def duplicate_map(map_id: str, db: Session = Depends(get_db)):
    source = _get_map(db, map_id)
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
    copy = MindMap(id=str(uuid4()), title=f"{source.title} (copy)"[:255], created_at=now, updated_at=now)
    db.add(copy)
    db.flush()
    _replace_graph(db, copy, graph)
    db.commit()
    db.refresh(copy)
    return _detail(copy)


@router.delete("/{map_id}")
def delete_map(map_id: str, db: Session = Depends(get_db)):
    m = _get_map(db, map_id)
    db.delete(m)
    db.commit()
    return {"message": "Map deleted"}
