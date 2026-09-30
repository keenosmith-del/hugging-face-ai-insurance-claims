from pathlib import Path
import cv2
import numpy as np
import pytesseract
from PIL import Image
from pypdf import PdfReader

def preprocess(image: Image.Image) -> Image.Image:
    rgb = np.array(image.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    if max(gray.shape) < 1800:
        scale = 1800 / max(gray.shape)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    clean = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return Image.fromarray(clean)

def extract_text(file_path: str) -> str:
    path = Path(file_path)
    if path.suffix.lower() in {".txt", ".md", ".csv"}:
        return path.read_text(encoding="utf-8", errors="replace")[:30000]
    if path.suffix.lower() == ".pdf":
        text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages).strip()
        if text:
            return text[:30000]
        # Scanned PDFs are not rasterized silently; report the requirement clearly.
        raise ValueError("PDF contains no selectable text; convert pages to images for scanned-PDF OCR")
    if path.suffix.lower() == ".docx":
        from docx import Document
        return "\n".join(paragraph.text for paragraph in Document(path).paragraphs)[:30000]
    with Image.open(path) as image:
        return pytesseract.image_to_string(preprocess(image), config="--psm 6").strip()[:30000]
