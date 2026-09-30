from app.schemas.analysis import ClaimAnalysisRequest, ClaimAnalysisResponse, EvidenceResult, PipelineFailure
from app.pipelines.ocr import extract_text
from app.pipelines.document_classifier import classify
from app.pipelines.ner import extract_entities
from app.pipelines.object_detection import detect_objects, damage_observations
from app.pipelines.embeddings import embed, similarity_pairs
from pathlib import Path
import re
import numpy as np

def extract_currency_amounts(text: str) -> list[float]:
    return [float(value.replace(",", "")) for value in re.findall(r"(?i)(?:\bR\s?|\bZAR\s?|\$\s?|€\s?)([\d,]+(?:\.\d{1,2})?)", text)]

def analyse_claim(request: ClaimAnalysisRequest) -> ClaimAnalysisResponse:
    results = []; failures = []; completed = set()
    for item in request.evidence:
        result = EvidenceResult(id=item.id, filename=item.filename)
        is_image = item.mimeType.startswith("image/")
        if is_image:
            result.evidenceType = "accident_photo"
            result.documentClassification = {"classification": "accident_photo", "source": "image MIME type", "model": None}
            completed.add("evidence_type_detection")
            try:
                result.objectDetections = detect_objects(item.filePath); result.damageObservations = damage_observations(result.objectDetections); completed.add("object_detection")
            except Exception as exc:
                result.errors.append(PipelineFailure(pipeline="object_detection", error=str(exc)[:300])); failures.append(PipelineFailure(pipeline=f"object_detection:{item.filename}", error=str(exc)[:300]))
        else:
            try:
                result.extractedText = extract_text(item.filePath); completed.add("ocr")
            except Exception as exc:
                result.errors.append(PipelineFailure(pipeline="ocr", error=str(exc)[:300])); failures.append(PipelineFailure(pipeline=f"ocr:{item.filename}", error=str(exc)[:300]))
            if result.extractedText:
                try:
                    result.documentClassification = classify(result.extractedText); result.evidenceType = result.documentClassification["classification"]; completed.add("document_classification")
                except Exception as exc: failures.append(PipelineFailure(pipeline=f"document_classification:{item.filename}", error=str(exc)[:300]))
                try: result.entities = extract_entities(result.extractedText); completed.add("ner")
                except Exception as exc: failures.append(PipelineFailure(pipeline=f"ner:{item.filename}", error=str(exc)[:300]))
        meaningful_text = result.extractedText
        if meaningful_text:
            try: result.embedding = embed(meaningful_text); completed.add("embeddings")
            except Exception as exc: failures.append(PipelineFailure(pipeline=f"embeddings:{item.filename}", error=str(exc)[:300]))
        results.append(result)
    # Small evidence checklist; it identifies missing evidence, never coverage eligibility.
    types = {r.evidenceType for r in results}
    expected = {"insurance_policy": "Insurance policy", "police_report": "Police/accident report", "repair_estimate": "Repair estimate or invoice"}
    missing = [label for key, label in expected.items() if key not in types]
    combined = " ".join([request.description] + [r.extractedText for r in results]).lower()
    money = extract_currency_amounts(combined)
    damages = [o for r in results for o in r.damageObservations]
    recommendations = ([f"Request {x.lower()}" for x in missing] + ["Review original evidence and model outputs", "Complete human claims assessment"])
    similarities = similarity_pairs([r.model_dump() for r in results])
    if request.description.strip():
        try:
            claim_embedding = np.asarray(embed(request.description))
            for result in results:
                if result.embedding:
                    similarities.append({"leftEvidenceId": "claim-description", "rightEvidenceId": result.id, "similarity": round(float(np.dot(claim_embedding, np.asarray(result.embedding))), 4)})
            completed.add("embeddings")
        except Exception as exc:
            failures.append(PipelineFailure(pipeline="claim_description_embedding", error=str(exc)[:300]))
    coverage = "Policy document detected; coverage not determined. Human review required" if "insurance_policy" in types else "Undetermined; policy document not identified"
    return ClaimAnalysisResponse(claimId=request.claimId, status="partial" if failures else "complete", completedPipelines=sorted(completed), failedPipelines=failures, evidence=results, evidenceSimilarity=similarities, estimatedDamage=sum(money) if money else None, coverageAssessment=coverage, missingInformation=missing, riskIndicators=[], detectedDamage=damages, recommendations=recommendations)
