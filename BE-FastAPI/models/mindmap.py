from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class MindMap(Base):
    __tablename__ = "mind_maps"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    nodes = relationship(
        "MindNode",
        back_populates="mind_map",
        cascade="all, delete-orphan",
    )
    edges = relationship(
        "MindEdge",
        back_populates="mind_map",
        cascade="all, delete-orphan",
    )


class MindNode(Base):
    __tablename__ = "mind_nodes"

    # Node IDs are chosen by the client (or the AI draft) and must be unique across all maps
    id = Column(String(64), primary_key=True)
    map_id = Column(String(36), ForeignKey("mind_maps.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(String(64), nullable=True)  # None only for the root node
    label = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    x = Column(Float, nullable=False, default=0.0)
    y = Column(Float, nullable=False, default=0.0)
    collapsed = Column(Boolean, nullable=False, default=False)

    mind_map = relationship("MindMap", back_populates="nodes")


class MindEdge(Base):
    __tablename__ = "mind_edges"

    # Cross-connections only; parent-child links are derived from MindNode.parent_id
    id = Column(String(64), primary_key=True)
    map_id = Column(String(36), ForeignKey("mind_maps.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(String(64), nullable=False)
    target_id = Column(String(64), nullable=False)
    label = Column(String(200), nullable=False, default="")

    mind_map = relationship("MindMap", back_populates="edges")
