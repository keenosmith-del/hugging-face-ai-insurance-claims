import os
from functools import lru_cache
import torch

def device():
    configured = os.getenv("AI_DEVICE", "auto")
    if configured == "auto":
        return 0 if torch.cuda.is_available() else -1
    return int(configured)

@lru_cache(maxsize=8)
def hf_pipeline(task: str, model_name: str):
    from transformers import pipeline
    return pipeline(task, model=model_name, device=device(), token=os.getenv("HF_TOKEN") or None)
