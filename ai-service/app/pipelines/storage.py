import os
from pathlib import Path

def safe_path(value):
    root = Path(os.getenv('UPLOAD_DIR', str(Path(__file__).resolve().parents[3] / 'uploads'))).resolve()
    path = Path(value).resolve()
    if not path.is_relative_to(root) or not path.is_file(): raise ValueError('Evidence must be an existing file within UPLOAD_DIR')
    if path.stat().st_size > 20 * 1024 * 1024: raise ValueError('File exceeds 20 MB limit')
    return str(path)
