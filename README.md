# Hugging Face AI Insurance Claims Platform

A local portfolio prototype for multimodal insurance evidence review. React/TypeScript/Vite, Express/TypeScript, MongoDB/Mongoose and FastAPI integrate real Hugging Face inference, PyTorch, OpenCV and Tesseract. The existing frontend layout is preserved.

**Decision support only.** AI does not approve claims, determine payable amounts, establish coverage/liability, detect proven fraud or grade physical damage. Explicit human reviews own outcomes.

## Implemented workflow

- Environment-based administrator bootstrap, salted scrypt passwords, expiring/revocable bearer sessions, protected APIs/downloads and assessor/administrator permissions.
- Create, list/search, view/edit and delete claims; reopen resolved claims.
- PDF, DOCX, TXT, JPEG, PNG, WebP and TIFF uploads with count/size, MIME/signature and duplicate checks; protected downloads and evidence removal. Replace evidence by removing and uploading again.
- Real synchronous inference orchestration, persisted processing/failure state and polling; atomic duplicate-analysis guard and restart recovery.
- Selectable PDF text, bounded scanned-PDF rasterisation/OCR, DOCX paragraphs/tables and image OCR.
- Source-linked deterministic comparisons, contextual currency observations and per-claim configurable required-evidence checklists.
- Human reviews with reviewer identity, timestamps, notes/outcome and analysis version; historical assessments/reviews and separate mutation audit records.
- Changed claim text or evidence invalidates active findings. Prior versions remain available. Model failures are retained as partial results; service failures are retryable.

## Real model integrations

| Capability | Implementation | Limits |
|---|---|---|
| Classification | `valhalla/distilbart-mnli-12-1`, Transformers zero-shot classification | General NLI model; transparent keyword overrides retain raw prediction. Scores are uncalibrated. |
| NER | `dslim/bert-base-NER`, Transformers | General entities; policy/claim/registration rules are labelled separately. |
| Vision | `facebook/detr-resnet-50`, Transformers/PyTorch | COCO objects and bounding boxes, no damaged parts or severity. Empty detections are valid. |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` | Real normalised vectors/cosine similarity; similarity is not factual agreement. |
| OCR | OpenCV, Tesseract, PDFium | Sensitive to input quality; 20-page PDF limit, bounded rasterisation and OCR timeouts. |

Models load lazily and require initial network downloads/cache space. CPU works. `AI_DEVICE=auto` selects CUDA when available; `cpu`/`-1` selects CPU. Model IDs are retained; exact model revision pinning/evaluation remains future work.

## Start locally

Requirements: Node 20.19+, Python 3.11, MongoDB, Tesseract (`brew install tesseract` on macOS).

```sh
cp .env.example .env
npm --prefix server ci
npm --prefix frontend ci
python3.11 -m venv ai-service/.venv
ai-service/.venv/bin/pip install -r ai-service/requirements.txt
```

Set `BOOTSTRAP_USERNAME` and a unique `BOOTSTRAP_PASSWORD` (minimum 12 characters) in `.env`. Existing users are not overwritten. Start your MongoDB service, or `docker compose up -d mongo`. In separate terminals from the repository root:

```sh
ai-service/.venv/bin/python -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port 8000
npm --prefix server run dev
npm --prefix frontend run dev
```

Open http://localhost:5173 and sign in. Node loads root `.env`; Python settings must be exported in its terminal. Public model weights require no HF_TOKEN. Local upload defaults resolve to the same repository `uploads/` folder.

```sh
docker compose up --build
```

Compose preserves defaults 5173/5050/8000/27017, shares `/uploads` and caches model weights in `hf-cache`. Database/AI host ports bind to loopback. Populate root `.env` bootstrap settings before starting.

## Configuration

| Variable | Default/purpose |
|---|---|
| PORT | 5050 |
| MONGODB_URI | mongodb://localhost:27017/insurance_claims |
| AI_SERVICE_URL | http://localhost:8000 |
| UPLOAD_DIR | Repository uploads locally; /uploads in containers |
| AI_TIMEOUT_MS | 900000 |
| FRONTEND_ORIGIN | http://localhost:5173 |
| VITE_API_URL | http://localhost:5050 |
| BOOTSTRAP_USERNAME / BOOTSTRAP_PASSWORD | Required for initial administrator creation |
| HF_TOKEN | Optional public-model download credential |
| AI_DEVICE | auto |
| HF_HOME / HF_HUB_OFFLINE | Optional Python model cache/offline configuration |

## API

All claim routes require a bearer session. Assessor accounts share the synthetic workspace. Administrators additionally create users/delete claims.

| Method | Route | Action |
|---|---|---|
| POST | /api/auth/login, /api/auth/logout | Create/revoke session |
| POST | /api/auth/users | Administrator creates assessor/administrator |
| GET/POST | /api/claims | Search/list or create (title, description, optional requiredEvidence) |
| GET/PATCH/DELETE | /api/claims/:id | View/edit/delete claim |
| POST | /api/claims/:id/reopen | Reopen resolved claim |
| GET/POST | /api/claims/:id/evidence | List/upload files (repeated files multipart fields) |
| GET | /api/claims/:id/evidence/:evidenceId/download | Protected original download |
| DELETE | /api/claims/:id/evidence/:evidenceId | Remove evidence/invalidate analysis |
| POST | /api/claims/:id/analyse | Run real inference and persist assessment |
| POST | /api/claims/:id/review | Human outcome and required notes |
| GET | /api/claims/:id/analysis | Saved assessment |
| GET | /health | API/AI health |

FastAPI `/health`, `/analyse/document`, `/analyse/image`, `/analyse/claim` are internal inference endpoints. Evidence paths must resolve inside its UPLOAD_DIR. Do not expose FastAPI publicly.

## Verification and status

```sh
npm run build
npm test
TEST_USERNAME=YOUR_USERNAME TEST_PASSWORD=YOUR_PASSWORD python3 scripts/verify-live.py
```

Unit tests use mocks for isolated orchestration. The separate live script uses actual Express, MongoDB, FastAPI and model weights. Synthetic fixtures contain text, a scanned PDF and a clearly labelled generated accident photograph plus a drawn vehicle schematic. These are not a model-accuracy benchmark.

See [completion audit](docs/COMPLETION_AUDIT.md), [exact demo walkthrough](docs/DEMO_WALKTHROUGH.md), and [architecture](docs/ARCHITECTURE.md). Readiness is conditional on every acceptance check, including browser and photograph verification; successful unit tests alone do not establish readiness.

## Security and engineering limits

Use synthetic data only. This local single-instance prototype has no tenant isolation, malware scanner, production TLS, tamper-proof audit, transactional filesystem/database cleanup or validated insurer rules. Session tokens in sessionStorage require protection against XSS. Histories require retention limits for sustained operation. Concurrent evidence mutations and worker interruption need further production hardening. Extraction is bounded/truncated and rule comparisons understand only explicit labelled fields. Missing evidence is not deception. Monetary observations are contextual values requiring review and are never summed into a claim total.
