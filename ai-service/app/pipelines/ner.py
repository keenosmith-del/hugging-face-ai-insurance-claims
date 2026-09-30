from app.pipelines.common import hf_pipeline

MODEL = "dslim/bert-base-NER"
def extract_entities(text: str) -> list[dict]:
    if not text.strip(): return []
    result = hf_pipeline("ner", MODEL)(text[:12000], aggregation_strategy="simple")
    entities = [{"text": item["word"], "label": item["entity_group"], "confidence": float(item["score"]), "model": MODEL} for item in result]
    # Surface likely policy/claim identifiers as transparent regex heuristics, not model NER.
    import re
    for kind, pattern in [("POLICY_NUMBER", r"(?i)\bpolicy\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})"), ("CLAIM_NUMBER", r"(?i)\bclaim\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})"), ("REGISTRATION", r"\b[A-Z]{2,3}\s?\d{3,6}\s?[A-Z]{0,3}\b")]:
        for match in re.finditer(pattern, text): entities.append({"text": match.group(1) if match.lastindex else match.group(0), "label": kind, "confidence": 0.5, "source": "regex heuristic"})
    return entities
