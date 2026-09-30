from functools import lru_cache
import numpy as np
from sentence_transformers import SentenceTransformer

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
@lru_cache(maxsize=1)
def model(): return SentenceTransformer(MODEL)
def embed(text: str) -> list[float]:
    if not text.strip(): return []
    return model().encode(text[:8000], normalize_embeddings=True).astype(float).tolist()
def similarity_pairs(items: list[dict]) -> list[dict]:
    available = [item for item in items if item.get("embedding")]
    pairs = []
    for i, left in enumerate(available):
        for right in available[i+1:]:
            score = float(np.dot(left["embedding"], right["embedding"]))
            pairs.append({"leftEvidenceId": left["id"], "rightEvidenceId": right["id"], "similarity": round(score, 4)})
    return pairs
