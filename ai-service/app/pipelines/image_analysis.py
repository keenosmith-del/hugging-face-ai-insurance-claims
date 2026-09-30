"""Image interpretation stays bounded to generic COCO detections; no damage severity or repair valuation."""
from app.pipelines.object_detection import detect_objects, damage_observations

def analyse_image(file_path: str) -> dict:
    detections = detect_objects(file_path)
    return {"detections": detections, "damageObservations": damage_observations(detections), "limitation": "Generic object detector; does not identify vehicle parts or damage severity."}
