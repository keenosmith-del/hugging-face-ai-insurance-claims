from fastapi import FastAPI, HTTPException
from app.schemas.analysis import ClaimAnalysisRequest, ClaimAnalysisResponse
from app.pipelines.claim_analysis import analyse_claim

app = FastAPI(title="Claims AI Service", version="1.0.0", description="Local AI inference for insurance evidence; outputs require human review.")
@app.get("/health")
def health(): return {"status": "ok", "service": "claims-ai", "models": "loaded on demand"}
@app.post("/analyse/document")
def analyse_document(payload: dict):
    from app.pipelines.ocr import extract_text
    from app.pipelines.document_classifier import classify
    path = payload.get("filePath")
    if not path: raise HTTPException(400, "filePath is required")
    try:
        text = extract_text(path); return {"extractedText": text, "classification": classify(text)}
    except Exception as exc: raise HTTPException(422, str(exc))
@app.post("/analyse/image")
def analyse_image(payload: dict):
    from app.pipelines.object_detection import detect_objects, damage_observations
    path = payload.get("filePath")
    if not path: raise HTTPException(400, "filePath is required")
    try:
        detections = detect_objects(path); return {"detections": detections, "damageObservations": damage_observations(detections)}
    except Exception as exc: raise HTTPException(422, str(exc))
@app.post("/analyse/claim", response_model=ClaimAnalysisResponse)
def analyse(payload: ClaimAnalysisRequest):
    try: return analyse_claim(payload)
    except Exception as exc: raise HTTPException(500, f"Claim analysis failed: {exc}")
