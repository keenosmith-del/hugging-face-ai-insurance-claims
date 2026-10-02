from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "claims-ai"

def test_claim_schema_and_partial_failures(monkeypatch, tmp_path):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
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

def test_structured_comparisons_and_money_not_summed():
    from app.pipelines.comparison import aggregate
    from app.schemas.analysis import ClaimAnalysisRequest, EvidenceResult
    request = ClaimAnalysisRequest(claimId='x', title='Synthetic', description='Registration: DEMO123\nAccident date: 2026-09-14', evidence=[{'id':'e1','filename':'invoice.txt','mimeType':'text/plain','filePath':'fixture.txt'}])
    result = EvidenceResult(id='e1', filename='invoice.txt', evidenceType='repair_invoice', extractedText='Registration: DEMO999\nAccident date: 14 September 2026\nInvoice total: R 1,000\nVAT: R 150\nExcess: R 250')
    data = aggregate(request, [result])
    assert next(c for c in data['comparisons'] if c['field'] == 'registration')['status'] == 'MISMATCH'
    assert next(c for c in data['comparisons'] if c['field'] == 'date')['status'] == 'MATCH'
    assert [v['category'] for v in data['financialObservations']] == ['invoice_total', 'tax', 'excess']
    assert next(c for c in data['checklist'] if c['type'] == 'repair_estimate')['sources'] == ['e1']

def test_file_access_outside_storage_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv('UPLOAD_DIR', str(tmp_path / 'uploads'))
    from app.pipelines.storage import safe_path
    import pytest
    file = tmp_path / 'secret.txt'; file.write_text('secret')
    with pytest.raises(ValueError): safe_path(str(file))

def test_real_scanned_pdf_ocr(tmp_path):
    import shutil, pytest
    if not shutil.which('tesseract'): pytest.skip('Tesseract executable required')
    from PIL import Image, ImageDraw, ImageFont
    from app.pipelines.ocr import extract_text
    image = Image.new('RGB', (1000, 400), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((50, 50), 'SYNTHETIC REPORT\nRegistration: DEMO123', fill='black', font=ImageFont.load_default(size=36))
    path = tmp_path / 'scan.pdf'; image.save(path, 'PDF')
    assert 'DEMO123' in extract_text(str(path))

def test_pdf_page_limit(tmp_path):
    import pytest
    from pypdf import PdfWriter
    from app.pipelines.ocr import extract_text
    writer = PdfWriter()
    for _ in range(21): writer.add_blank_page(100, 100)
    path = tmp_path / 'large.pdf'
    with path.open('wb') as handle: writer.write(handle)
    with pytest.raises(ValueError, match='20-page'): extract_text(str(path))

def test_equivalent_dates_and_ambiguous_fields():
    from app.pipelines.comparison import fields
    assert fields('Date: 14 September 2026\nAccident date: 2026-09-14')['date'] == '20260914'
    assert fields('Registration: DEMO123\nRegistration: DEMO999')['registration'] is None

def test_docx_paragraph_and_table_extraction(tmp_path):
    from docx import Document
    from app.pipelines.ocr import extract_text
    document = Document(); document.add_paragraph('SYNTHETIC insurance policy')
    table = document.add_table(rows=1, cols=2); table.cell(0,0).text='Registration'; table.cell(0,1).text='DEMO123'
    path=tmp_path/'policy.docx';document.save(path)
    text=extract_text(str(path));assert 'SYNTHETIC insurance policy' in text and 'DEMO123' in text

def test_selectable_pdf_extraction(tmp_path):
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    from app.pipelines.ocr import extract_text
    writer=PdfWriter();page=writer.add_blank_page(width=300,height=200)
    font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
    page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
    content=DecodedStreamObject();content.set_data(b'BT /F1 12 Tf 20 100 Td (SYNTHETIC DEMO123) Tj ET');page[NameObject('/Contents')]=writer._add_object(content)
    path=tmp_path/'selectable.pdf'
    with path.open('wb') as handle:writer.write(handle)
    assert 'DEMO123' in extract_text(str(path))

def test_partial_failure_does_not_contaminate_same_filename(monkeypatch):
    from app.pipelines import claim_analysis
    from app.schemas.analysis import ClaimAnalysisRequest
    def extract(path):
        if path == 'bad': raise ValueError('Synthetic extraction failure')
        return 'SYNTHETIC insurance policy'
    monkeypatch.setattr(claim_analysis,'extract_text',extract)
    monkeypatch.setattr(claim_analysis,'classify',lambda text:{'classification':'insurance_policy','model':'isolated-unit-test'})
    monkeypatch.setattr(claim_analysis,'extract_entities',lambda text:[])
    monkeypatch.setattr(claim_analysis,'embed',lambda text:[1.,0.])
    request=ClaimAnalysisRequest(claimId='synthetic',title='Synthetic',evidence=[{'id':'bad-id','filename':'same.txt','mimeType':'text/plain','filePath':'bad'},{'id':'good-id','filename':'same.txt','mimeType':'text/plain','filePath':'good'}])
    result=claim_analysis.analyse_claim(request)
    assert result.status=='partial' and result.evidence[0].errors
    assert not result.evidence[1].errors
