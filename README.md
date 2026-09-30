# Hugging Face AI Insurance Claims Platform

A small portfolio prototype for AI-assisted vehicle claim evidence review. The application accepts documents and accident photographs, runs focused inference pipelines, stores evidence and structured outputs, and presents those outputs to a human assessor.

> This educational portfolio project is not an insurance adjudication system. It does not approve or reject claims, determine fraud, establish coverage, or provide reliable repair quotations. Model outputs can be incomplete or wrong and require human review.

## Business problem and solution

Claim evidence arrives in different formats and often needs manual reading and triage. This prototype centralises claim files, extracts text and entities from documents, identifies likely document types, detects generic objects in photographs, and compares evidence text semantically. Its checklist and summaries help organise review; they are not decisions.

## Architecture

```text
React + Vite (5173)
        | REST
Node + Express + TypeScript (5050) ---- MongoDB (27017)
        | HTTP                              |
        v                                   | claims, evidence, outputs
Python + FastAPI (8000) <------------------+
  Transformers / PyTorch / OpenCV / Tesseract / Sentence Transformers
```

The Node API owns claims, uploads, persistence and orchestration. The Python service owns inference. Local upload files are mounted into both containers so the Python service can read the files saved by Node.

## Stack and model choices

| Capability | Model/tool | Framework and input | Output and limitations |
|---|---|---|---|
| OCR | Tesseract 5 via `pytesseract`, OpenCV preprocessing | OpenCV/Pillow image cleanup; TXT/DOCX/PDF text extraction via standard libraries | Text only; scanned PDFs without raster conversion report a partial failure. OCR errors are possible. |
| Document classification | [`valhalla/distilbart-mnli-12-1`](https://huggingface.co/valhalla/distilbart-mnli-12-1) | Hugging Face Transformers zero-shot classifier; extracted text and candidate labels | Candidate label and model score. Clear document phrases can trigger a transparent keyword fallback; its source and raw model prediction are retained. General NLI model, not trained for insurance. Image evidence type comes from MIME type, not visual document classification. |
| NER | [`dslim/bert-base-NER`](https://huggingface.co/dslim/bert-base-NER) | Transformers token classification over extracted text | General named entities; insurance identifiers are additionally surfaced with explicitly labelled regex heuristics. Not insurance-specialised. |
| Object detection | [`facebook/detr-resnet-50`](https://huggingface.co/facebook/detr-resnet-50) | Transformers/PyTorch object detection on images | COCO object labels and boxes (e.g. car/person). It does not label vehicle parts or damage. |
| Text embeddings | [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | Sentence Transformers over claim description and extracted document text | Normalised vectors and cosine similarity. Similarity is not evidence of truth or consistency. |
| Image analysis | DETR generic object observations | Same model as object detection | Vehicle presence may be shown; no damage severity or part-level claims are made. |

Models load lazily on first use and are cached by Hugging Face/Sentence Transformers. First inference downloads model weights and can take time and disk space. CPU inference works but may be slow. `HF_TOKEN` is optional for these public models; `AI_DEVICE=auto` selects CUDA when available, otherwise CPU. `AI_DEVICE` can also be set to a Transformers device index (`-1` for CPU, `0` for first CUDA GPU).

## AI and evidence flow

1. A user creates a claim and uploads up to ten files (20 MB each; PDF, common images, text and Word MIME types).
2. Node stores uploads under `uploads/claims/<claim id>/` and persists metadata in MongoDB.
3. The user starts analysis. Node posts claim text and evidence file references to FastAPI.
4. FastAPI routes images through DETR and other evidence through text extraction, zero-shot classification and NER; text is embedded when available.
5. The service returns per-evidence outputs, pipeline failures, pairwise text similarities, missing-evidence checklist, extracted currency amounts and review recommendations.
6. Node persists the structured analysis on the claim and each evidence record. React fetches and displays those saved responses.

The document checklist expects a policy, a police/accident report and a repair estimate/invoice. Extracted monetary amounts are summed without deduplicating or validating them, so this is only a rough extracted amount and may be misleading. The current implementation does not infer named damaged parts: COCO DETR has no such labels. No risk or fraud score is generated. Coverage wording is a workflow cue and must not be treated as a coverage decision.

Each pipeline is isolated so an OCR/model error can result in `partial` analysis while retaining successful evidence results. Error details are returned per pipeline; review uploaded inputs before relying on any output.

## Repository map

```text
frontend/                 React, TypeScript, Vite UI
server/                   Express API, Mongoose models, local storage
ai-service/app/pipelines/ OCR, classification, NER, detection, embeddings, orchestration
sample-data/              Synthetic text fixtures
uploads/                  Local evidence storage (ignored by git)
docker-compose.yml        MongoDB, Node, Python, frontend
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Node health and AI service availability |
| GET / POST | `/api/claims` | List claims / create claim (`title`, `description`) |
| GET / DELETE | `/api/claims/:id` | Retrieve claim and evidence / delete claim, evidence metadata and local uploads |
| POST | `/api/claims/:id/evidence` | Multipart upload; use repeated `files` fields |
| GET | `/api/claims/:id/evidence` | Evidence metadata and saved outputs |
| POST | `/api/claims/:id/analyse` | Run AI analysis and persist it |
| POST | `/api/claims/:id/review` | Record a human outcome (`approved`, `declined`, `more_information_required`) and required notes |
| GET | `/api/claims/:id/analysis` | Retrieve saved assessment |
| GET | `http://localhost:8000/health` | FastAPI health |
| POST | `http://localhost:8000/analyse/document` | Standalone document processing (`filePath`) |
| POST | `http://localhost:8000/analyse/image` | Standalone image processing (`filePath`) |
| POST | `http://localhost:8000/analyse/claim` | Main structured claim analysis |

## Data model

MongoDB has two collections: `claims` and `evidences`. A claim contains a generated claim number, title, description, status, assessment fields, structured analysis, human-review outcome/notes and timestamps. Evidence stores claim reference, filename, MIME type, local path, inferred evidence type, classifier result, OCR text, NER entities and per-item AI outputs. Uploaded binary files remain on local disk. Local storage can be replaced behind the storage service with S3, Azure Blob Storage or GCS later.

## Human review and cleanup

After analysis, the claim detail page presents a **Review and record an outcome** form. A human assessor can record an approval, decline or request for more information, with required notes. Approval and decline move the claim to `Resolved`; a request moves it to `Awaiting Information`. The AI never selects or submits that outcome. Adding new evidence clears the old assessment and review so it must be analysed again. Use **Delete claim** on any claim detail page to delete the claim, its evidence records and its local upload directory; the UI asks for confirmation first.

## Run locally

Requirements: Node.js 20+, npm, Python 3.11, MongoDB, and the Tesseract executable. On macOS, install Tesseract with your preferred package manager. PyTorch wheel selection can depend on operating system and accelerator; see the official PyTorch install selector if the pinned dependency resolution needs adjustment.

```bash
cp .env.example .env
# Start MongoDB separately, then:
cd ai-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In separate terminals:

```bash
cd server && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. The default frontend API URL is `http://localhost:5050`. Create a claim, add evidence, and choose **Analyse claim**. Add sample text documents from `sample-data/claims/claim-001/` to explore the document pipelines. OCR of images additionally requires a working Tesseract executable in `PATH`.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Node runtime mode |
| `PORT` | `5050` | Node API port |
| `MONGODB_URI` | local MongoDB URI | Mongo connection string |
| `AI_SERVICE_URL` | `http://localhost:8000` | FastAPI base URL |
| `UPLOAD_DIR` | `./uploads` | Local upload root |
| `HF_TOKEN` | empty | Optional Hugging Face token |
| `AI_DEVICE` | `auto` | `auto`, `-1` CPU, or an accelerator index |

Copy `.env.example`; never commit `.env` or tokens.

## Docker

Docker Compose starts MongoDB, Node, FastAPI, and the Vite development server:

```bash
docker compose up --build
```

Open `http://localhost:5173`; APIs are at ports 5050 and 8000. Model weights are cached in the `hf-cache` volume. The Compose AI service uses CPU by default. The first model use downloads weights, so allow network access and storage. To pass a Hugging Face token, place it in the local `.env` file. For GPU execution, configure the AI container and its device runtime for the local platform.

## Tests and verification

After creating the Python 3.11 environment described above, run all automated tests from the repository root:

```bash
npm test
```

The Python tests exercise the health endpoint, response schema/partial-failure behavior, OpenCV preprocessing, text extraction, currency parsing and the transparent document keyword fallback without downloading model weights. The Node tests cover health handling, claim creation, evidence metadata persistence, AI-service handoff, human review outcomes and claim deletion. `npm run build` builds both TypeScript applications. The live workflow was also exercised with the synthetic policy, report and estimate through Node, FastAPI and MongoDB using downloaded Hugging Face weights. Automated tests do not claim to validate model accuracy.

## Limitations and future work

- No insurer rules, policy coverage decision, fraud detection, claim approval/rejection, repair estimate or liability judgement.
- The chosen NER and document model are general-purpose and may misclassify domain documents; scores are model scores, not calibrated probabilities.
- DETR's generic COCO taxonomy cannot identify damaged vehicle parts or damage severity.
- Tesseract image OCR is sensitive to blur, angle, handwriting and low contrast. Scanned PDFs need page rasterisation before OCR.
- The sample extraction sums every detected Rand-like amount and does not distinguish total, excess, tax or currency context.
- Local storage, no authentication, basic MIME/file-size checks and no retention controls make this unsuitable for real claims or sensitive personal data.
- Future work: robust PDF rasterisation and page limits, domain validation, calibrated models with representative labelled data, image embeddings, audit trails, access controls, secure object storage and model evaluation.

## Deployment options

For a later deployment, React could run on Vercel, the Node and FastAPI containers on Render, Azure Container Apps or Cloud Run, MongoDB on Atlas, and evidence files on S3, Azure Blob Storage or GCS. Deployment, secrets management, privacy controls and model-serving cost are outside this prototype.

## Skills demonstrated

React and TypeScript UI; Express REST API; Mongoose persistence; FastAPI/Pydantic inference service; Hugging Face Transformers and Hub models; PyTorch object detection; OpenCV and OCR; NER; sentence embeddings and semantic similarity; multimodal evidence orchestration; partial-failure handling; Docker Compose; API and pipeline testing; responsible AI limitations documentation.
