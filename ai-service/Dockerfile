FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --timeout 180 --retries 5 --no-cache-dir "torch>=2.2,<3" "torchvision>=0.17,<1" --index-url https://download.pytorch.org/whl/cpu
RUN pip install --timeout 180 --retries 5 --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
