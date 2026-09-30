from pathlib import Path
from PIL import Image
from app.pipelines.common import hf_pipeline

MODEL = "facebook/detr-resnet-50"
def detect_objects(file_path: str) -> list[dict]:
    with Image.open(Path(file_path)) as image:
        predictions = hf_pipeline("object-detection", MODEL)(image.convert("RGB"))
    return [{"label": p["label"], "confidence": float(p["score"]), "box": {k: int(v) for k, v in p["box"].items()}, "model": MODEL} for p in predictions if p["score"] >= 0.35]

def damage_observations(detections: list[dict]) -> list[dict]:
    # COCO DETR has no vehicle-part or damage classes. Only report vehicle presence as context.
    vehicles = [d for d in detections if d["label"].lower() in {"car", "truck", "bus", "motorcycle"}]
    return [{"observation": f"{d['label']} visible; physical damage is not assessed by this model", "confidence": d["confidence"], "evidence": d["box"], "model": MODEL} for d in vehicles]
