# Demo walkthrough

Run commands from the repository root. Requirements: Node 20.19+, Python 3.11, local MongoDB, Tesseract in PATH. On macOS, `brew install tesseract`. Use only synthetic data.

```sh
cp .env.example .env
npm --prefix server ci
npm --prefix frontend ci
python3.11 -m venv ai-service/.venv
ai-service/.venv/bin/pip install -r ai-service/requirements.txt
```

Edit `.env`: set BOOTSTRAP_USERNAME and a unique BOOTSTRAP_PASSWORD of at least 12 characters. Startup creates the administrator only if that username does not exist; changing the environment does not reset a stored password. No universal production credentials are supplied.

Start MongoDB if not already running, using your installed MongoDB service. Alternatively start only the Compose database:

```sh
docker compose up -d mongo
```

In three terminals, from repository root:

```sh
ai-service/.venv/bin/python -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port 8000
npm --prefix server run dev
npm --prefix frontend run dev
```

Python does not automatically load the root `.env`. Export HF_TOKEN/AI_DEVICE/UPLOAD_DIR if needed. Public models need no token. First inference downloads weights unless already cached. To force cached offline inference, prefix the Python command with `HF_HUB_OFFLINE=1` only after the models have been downloaded.

For the complete container setup:

```sh
docker compose up --build
```

Root `.env` supplies bootstrap settings to Compose. Default URLs: frontend http://localhost:5173, API http://localhost:5050, AI http://localhost:8000. If a port is occupied, stop its owning service yourself or configure alternate ports. Engineering verification used API 5051 because an unrelated service occupied 5050.

## User journey

1. Sign in with your bootstrap credentials.
2. Create a claim titled `SYNTHETIC collision`. Use description `Registration: DEMO123`, `Accident date: 2026-09-14`, `Claimant: Alex Example` on separate lines, followed by a fictional incident description. Choose evidence requirements.
3. Upload policy.txt, police-report.txt and repair-estimate.txt from sample-data/claims/claim-001. Download evidence to inspect the original. Duplicate uploads should be rejected.
4. Analyse. Observe the real processing state, then classification/model identity, extracted text, entities, similarities, comparisons, financial context and missing photograph checklist. Scores are uncalibrated model scores.
5. Record a human request for additional information with notes.
6. Add scanned-report.pdf and synthetic-accident.png. The active assessment becomes stale; its previous version and review remain in history. The vehicle photograph is generated and clearly labelled synthetic; no real accident/customer appears. An optional schematic fixture may legitimately return no detections.
7. Reanalyse. Inspect actual OCR text, object labels/boxes (an empty list is valid), comparison sources and uncertain findings. AI cannot establish liability, coverage or fraud.
8. Record an explicit human outcome. Reload; confirm the review remains. Reopen a resolved claim before editing, replacing evidence (remove then upload) or analysing again.
9. Search the dashboard by title/claim number. Administrators may delete a synthetic claim with controlled evidence cleanup. Assessors cannot delete claims.
10. Stop the AI service and attempt analysis: the API should return a meaningful failure and persist `failed`. Restart the AI service and retry. An API restart marks interrupted processing failed. Do not mark failed analysis as reviewed.

## Reproducible checks

```sh
npm run build
npm test
TEST_USERNAME=YOUR_USERNAME TEST_PASSWORD=YOUR_PASSWORD python3 scripts/verify-live.py
```

For an alternate API:

```sh
TEST_API_URL=http://127.0.0.1:5051 TEST_USERNAME=YOUR_USERNAME TEST_PASSWORD=YOUR_PASSWORD python3 scripts/verify-live.py
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/insurance_claims_engineering node scripts/verify-records.cjs
```

The live script creates synthetic records and a temporary assessor account. It uses real model inference and preserves its principal claim for inspection. The separate record check is intended for the isolated engineering database.
