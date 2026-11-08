"""Schemas for the Visualize feature: a research workflow and a knowledge graph."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from schemas.analysis import EXCERPT_HELP

StepKind = Literal["context", "problem", "data", "method", "experiment", "result", "conclusion"]
NodeGroup = Literal["problem", "method", "concept", "data", "metric", "finding", "entity"]


class WorkflowStep(BaseModel):
    title: str = Field(description="Step name, at most 6 words.")
    detail: str = Field(description="What happens in this step, in your own words, at most 30 words.")
    kind: StepKind = Field(description="The role of this step in the work.")
    excerpt: str = Field(description=EXCERPT_HELP)


class GraphNode(BaseModel):
    id: str = Field(description="Short unique identifier, lowercase letters, digits and hyphens.")
    label: str = Field(description="Concept name as it should appear in the graph, at most 4 words.")
    group: NodeGroup = Field(description="What kind of thing this node is.")
    description: str = Field(description="What this is and why it matters here, at most 25 words.")
    excerpt: str = Field(description=EXCERPT_HELP)


class GraphEdge(BaseModel):
    source: str = Field(description="id of the source node.")
    target: str = Field(description="id of the target node.")
    relation: str = Field(description="The relationship from source to target, a verb phrase of at most 4 words.")


class GeminiVisual(BaseModel):
    workflow: list[WorkflowStep] = Field(
        description="4 to 7 steps, in order, tracing the work from motivation to conclusion."
    )
    nodes: list[GraphNode] = Field(description="8 to 14 key concepts, methods, data, findings and entities.")
    edges: list[GraphEdge] = Field(description="10 to 20 meaningful relationships between those nodes.")


class WorkflowStepOut(WorkflowStep):
    excerpt_verified: bool = False


class GraphNodeOut(GraphNode):
    excerpt_verified: bool = False


class Visualization(BaseModel):
    workflow: list[WorkflowStepOut]
    nodes: list[GraphNodeOut]
    edges: list[GraphEdge]


class VisualMeta(BaseModel):
    model: str
    generated_at: datetime
    processing_ms: int


class VisualizeResponse(BaseModel):
    visual: Visualization
    meta: VisualMeta
