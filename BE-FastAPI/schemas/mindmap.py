from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class NodeIn(BaseModel):
    """A mind map node as sent by the client and returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: Optional[str] = None
    label: str = Field(max_length=200)
    description: str = Field(default="", max_length=2000)
    x: float = 0.0
    y: float = 0.0
    collapsed: bool = False


class EdgeIn(BaseModel):
    """An optional cross-connection between two nodes."""

    id: str
    source: str
    target: str
    label: str = Field(default="", max_length=200)


class GraphIn(BaseModel):
    nodes: list[NodeIn]
    edges: list[EdgeIn] = Field(default_factory=list)


class MapCreate(BaseModel):
    title: str = Field(default="Untitled map", min_length=1, max_length=255)
    # Optional full graph, used when saving an AI-generated draft as a new map
    graph: Optional[GraphIn] = None


class MapRename(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class MapSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    created_at: str
    updated_at: str
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None


class MapDetail(MapSummary):
    nodes: list[NodeIn]
    edges: list[EdgeIn]
