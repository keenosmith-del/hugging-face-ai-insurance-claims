from pathlib import Path
import cv2
import numpy as np
import pytesseract
from PIL import Image
Image.MAX_IMAGE_PIXELS = 16_000_000
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
        reader = PdfReader(path)
        if len(reader.pages) > 20: raise ValueError("PDF exceeds 20-page processing limit")
        texts = []
        document = None
        try:
            for index, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if not text.strip():
                    import pypdfium2 as pdfium
                    if document is None: document = pdfium.PdfDocument(str(path))
                    pdfpage = document[index]
                    width, height = pdfpage.get_size()
                    bitmap = pdfpage.render(scale=min(2, 2400 / max(width, height)))
                    try: text = pytesseract.image_to_string(preprocess(bitmap.to_pil()), config="--psm 6", timeout=30)
                    finally: bitmap.close(); pdfpage.close()
                texts.append(text)
            text = "\n".join(texts).strip()
            if not text: raise ValueError("No text extracted from PDF")
            return text[:30000]
        finally:
            if document is not None: document.close()
    if path.suffix.lower() == ".docx":
        from zipfile import ZipFile
        with ZipFile(path) as archive:
            if sum(item.file_size for item in archive.infolist()) > 50 * 1024 * 1024: raise ValueError("DOCX exceeds expanded-size limit")
        from docx import Document
        document = Document(path)
        paragraphs = [paragraph.text for paragraph in document.paragraphs]
        paragraphs += [" | ".join(cell.text for cell in row.cells) for table in document.tables for row in table.rows]
        text = "\n".join(paragraphs).strip()
        if not text: raise ValueError("No text extracted from DOCX")
        return text[:30000]
    with Image.open(path) as image:
        return pytesseract.image_to_string(preprocess(image), config="--psm 6", timeout=30).strip()[:30000]
