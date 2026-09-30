from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "claims-ai"

def test_claim_schema_and_partial_failures(monkeypatch, tmp_path):
    from app.pipelines import claim_analysis
    file_path = tmp_path / "bad.pdf"; file_path.write_bytes(b"not a pdf")
    response = client.post("/analyse/claim", json={"claimId":"x", "title":"Collision", "evidence":[{"id":"e1","filename":"bad.pdf","mimeType":"application/pdf","filePath":str(file_path)}]})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "partial"
    assert "coverageAssessment" in data
    assert data["failedPipelines"]

def test_ocr_preprocess_returns_image():
    from PIL import Image
    import numpy as np
    from app.pipelines.ocr import preprocess
    result = preprocess(Image.fromarray(np.full((20, 20, 3), 255, dtype=np.uint8)))
    assert result.mode == "L"

def test_keyword_fallback_and_currency_parsing(tmp_path):
    from app.pipelines.document_classifier import keyword_classification
    from app.pipelines.claim_analysis import extract_currency_amounts
    from app.pipelines.ocr import extract_text
    sample = tmp_path / "estimate.txt"
    sample.write_text("SYNTHETIC SAMPLE\nRepair estimate: R 18,500\nDate: 14 September 2026\n", encoding="utf-8")
    text = extract_text(str(sample))
    assert keyword_classification(text) == "repair_estimate"
    assert extract_currency_amounts(text) == [18500.0]
