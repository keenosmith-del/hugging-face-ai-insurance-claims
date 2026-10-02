import os
from functools import lru_cache
import torch
# Bound CPU worker contention on developer machines and containers.
torch.set_num_threads(max(1, min(4, int(os.getenv("AI_NUM_THREADS", "2")))))

def device():
    configured = os.getenv("AI_DEVICE", "auto")
    if configured == "auto":
        return 0 if torch.cuda.is_available() else -1
    return -1 if configured == "cpu" else int(configured)

@lru_cache(maxsize=8)
def hf_pipeline(task: str, model_name: str):
    from transformers import pipeline
    return pipeline(task, model=model_name, device=device(), token=os.getenv("HF_TOKEN") or None)
