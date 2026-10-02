from app.pipelines.common import hf_pipeline
import re

LABELS = ["driver license", "insurance policy", "police accident report", "vehicle registration document", "vehicle repair estimate", "vehicle repair invoice", "accident photograph", "supporting correspondence", "other document"]
ALIASES = {"driver license":"driver_license", "insurance policy":"insurance_policy", "police accident report":"police_report", "vehicle registration document":"vehicle_registration", "vehicle repair estimate":"repair_estimate", "vehicle repair invoice":"repair_invoice", "accident photograph":"accident_photo", "supporting correspondence":"supporting_correspondence", "other document":"unknown"}
MODEL = "valhalla/distilbart-mnli-12-1"

def keyword_classification(text: str) -> str | None:
    rules = [
        ("driver_license", r"driver'?s?\s+licen[cs]e|licen[cs]e number"),
        ("insurance_policy", r"insurance\s+policy|policy\s+(?:number|no\.?|schedule)"),
        ("police_report", r"police\s+(?:accident\s+)?report|accident\s+report|crash\s+report"),
        ("vehicle_registration", r"vehicle\s+registration|registration\s+certificate"),
        ("repair_invoice", r"repair\s+invoice|invoice\s+(?:total|for\s+(?:repairs|vehicle))"),
        ("repair_estimate", r"repair\s+estimate|estimate\s+for\s+repairs|repair\s+(?:quote|quotation)"),
    ]
    for label, pattern in rules:
        if re.search(pattern, text, re.IGNORECASE):
            return label
    return None

def classify(text: str, image: bool = False) -> dict:
    if not text.strip(): raise ValueError("Classification requires extracted text")
    candidate_text = text[:2500]
    result = hf_pipeline("zero-shot-classification", MODEL)(candidate_text, candidate_labels=LABELS, multi_label=False)
    label, score = result["labels"][0], float(result["scores"][0])
    prediction = {"classification": ALIASES[label], "confidence": score}
    fallback = keyword_classification(text)
    if fallback:
        return {"classification": fallback, "confidence": score if fallback == prediction["classification"] else None, "model": MODEL, "requiresReview": True, "scoreMeaning": "uncalibrated model score", "source": "keyword fallback", "modelPrediction": prediction}
    return {**prediction, "model": MODEL, "source": "Hugging Face zero-shot", "requiresReview": True, "scoreMeaning": "uncalibrated model score"}
