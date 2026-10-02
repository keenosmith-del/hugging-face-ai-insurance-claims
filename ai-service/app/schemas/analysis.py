from typing import Any, Literal
from pydantic import BaseModel, Field

class EvidenceInput(BaseModel):
    id: str
    filename: str
    mimeType: str
    filePath: str

class ClaimAnalysisRequest(BaseModel):
    claimId: str
    title: str
    description: str = ""
    requiredEvidence: list[str] = Field(default_factory=lambda: ["insurance_policy", "police_report", "repair_estimate", "accident_photo"])
    evidence: list[EvidenceInput] = Field(min_length=1, max_length=50)

class PipelineFailure(BaseModel):
    pipeline: str
    error: str

class EvidenceResult(BaseModel):
    id: str
    filename: str
    evidenceType: str = "unknown"
    documentClassification: dict[str, Any] | None = None
    extractedText: str = ""
    entities: list[dict[str, Any]] = Field(default_factory=list)
    objectDetections: list[dict[str, Any]] = Field(default_factory=list)
    damageObservations: list[dict[str, Any]] = Field(default_factory=list)
    embedding: list[float] | None = None
    errors: list[PipelineFailure] = Field(default_factory=list)

class ClaimAnalysisResponse(BaseModel):
    modelMetadata: dict[str, Any] = Field(default_factory=dict)
    comparisons: list[dict[str, Any]] = Field(default_factory=list)
    financialObservations: list[dict[str, Any]] = Field(default_factory=list)
    checklist: list[dict[str, Any]] = Field(default_factory=list)
    claimId: str
    status: Literal["complete", "partial"]
    completedPipelines: list[str]
    failedPipelines: list[PipelineFailure]
    evidence: list[EvidenceResult]
    evidenceSimilarity: list[dict[str, Any]] = Field(default_factory=list)
    estimatedDamage: float | None = None
    coverageAssessment: str
    missingInformation: list[str]
    riskIndicators: list[str]
    detectedDamage: list[dict[str, Any]]
    recommendations: list[str]
