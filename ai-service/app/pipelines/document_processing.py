"""Convenience composition of OCR, classification, and NER pipelines."""
from app.pipelines.ocr import extract_text
from app.pipelines.document_classifier import classify
from app.pipelines.ner import extract_entities

def analyse_document(file_path: str) -> dict:
    text = extract_text(file_path)
    return {"extractedText": text, "classification": classify(text), "entities": extract_entities(text)}
