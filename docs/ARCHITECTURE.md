# Architecture

React/TypeScript/Vite uses Fetch to call Express/TypeScript. Express owns claims, authentication, uploads, human actions, orchestration and persistence. FastAPI owns extraction, model inference and transparent aggregation. MongoDB stores claims, evidence, users, expiring sessions and sensitive-action audit records. Evidence bytes live under `uploads/claims/<id>/`.

Default ports: frontend 5173, Express 5050, FastAPI 8000, MongoDB 27017. Local Node resolves UPLOAD_DIR against the repository root. Python defaults to the same root; set UPLOAD_DIR explicitly when running in another deployment. Compose mounts both services at `/uploads`; models use `/models` and the hf-cache volume.

## Data flow

1. Bootstrap an administrator from environment variables. Passwords use salted scrypt. Login issues a random eight-hour bearer token; MongoDB stores its SHA-256 digest and expiry. The frontend stores the token in sessionStorage. Logout revokes it.
2. An authenticated assessor creates a claim and configures required evidence. Assessors share the demonstration workspace; administrators additionally create users and delete claims. There is no customer/tenant role.
3. Upload middleware checks claim existence/state, MIME type and per-request count/size. The controller checks signatures, sanitises names and hashes bytes for duplicate detection. UUID storage names avoid collisions. API metadata omits paths. Downloads require authentication and matching claim/evidence identifiers, and resolve beneath the upload root.
4. Analysis obtains an atomic MongoDB processing lock. Express calls FastAPI over HTTP, waiting for real completion with a configurable 900-second timeout. Claim lifecycle and analysis processing state are separate. Browser polling reads persisted state every five seconds; there is no simulated progress percentage.
5. FastAPI restricts inputs to existing files under UPLOAD_DIR (20 MB maximum), at most 50 evidence inputs, bounded PDF rasterisation (20 pages; at most 2400 pixels per page dimension), OCR timeouts, DOCX expanded-size bounds and bounded text inputs. Claim inference uses a single-process lock. Run one API and one AI worker for this prototype.
6. PDFs use selectable text where available and PDFium/Tesseract for scanned pages. DOCX paragraphs/tables and TXT are extracted directly. Images receive real DETR and OCR. No text or objects are invented when pipelines fail.
7. DistilBART MNLI classifies text; transparent keyword overrides retain raw model predictions. BERT NER identifies general entities, with separately labelled identifier rules. MiniLM produces actual normalised embeddings; cosine similarity is not factual agreement. DETR reports COCO labels, boxes and scores, with no damage severity.
8. Deterministic aggregation compares explicitly labelled dates, registrations, policy references, claimant names and locations. MATCH/MISMATCH/MISSING/UNVERIFIABLE include sources and require review. Monetary values retain line context, category and currency; they are never summed into payable amounts. Checklist requirements are configurable per claim; detected documents require verification.
9. Express saves per-evidence extraction/output data and the consolidated assessment. Previous assessments and human reviews remain in claim history. Changed evidence or claim text invalidates active analysis. Only human review can resolve a claim; resolved claims must be reopened before changes or reanalysis.

## Reliability and boundaries

Inference failures persist retryable failure states. API startup marks interrupted processing as failed; it does not resume work automatically. MongoDB disconnections surface errors. Graceful shutdown closes HTTP and database connections. Sensitive claim mutation requests produce separate audit records, including requests to delete claims.

This is a single-instance, local prototype. Filesystem operations and MongoDB writes are not one cross-resource transaction. Concurrent evidence mutations need further hardening for production. Audits are not tamper-proof. History embedded on claims needs retention/size policy for sustained use. FastAPI is an internal inference service, not a public authenticated API; Compose exposes it only on loopback. There is no malware scanning, production TLS, insurer policy engine or autonomous adjudication.
