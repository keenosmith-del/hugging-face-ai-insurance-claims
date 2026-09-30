import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/aiClient', () => ({ checkAiHealth: vi.fn(), analyseClaim: vi.fn() }));
vi.mock('../src/models/Claim', () => ({ Claim: { create: vi.fn(), findById: vi.fn() } }));
vi.mock('../src/models/Evidence', () => ({ Evidence: { insertMany: vi.fn(), find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('../src/services/storage', () => ({ upload: { array: () => (_req: unknown, _res: unknown, next: () => void) => next() }, deleteClaimUploads: vi.fn() }));

import { app } from '../src/app';
import { analyseClaim, checkAiHealth } from '../src/services/aiClient';
import { Claim } from '../src/models/Claim';
import { Evidence } from '../src/models/Evidence';
import { addEvidence, createClaim, deleteClaim, runAnalysis, submitHumanReview } from '../src/controllers/claims';
import { deleteClaimUploads } from '../src/services/storage';

function responseDouble() {
  const response: any = { statusCode: 200, body: undefined };
  response.status = (code: number) => { response.statusCode = code; return response; };
  response.json = (body: unknown) => { response.body = body; return response; };
  return response;
}

describe('claims API handlers', () => {
  it('registers a health endpoint and reports AI reachability', async () => {
    vi.mocked(checkAiHealth).mockResolvedValue({ status: 'ok' });
    const route = (app as any)._router.stack.find((layer: any) => layer.route?.path === '/health').route.stack[0].handle;
    const response = responseDouble();
    await route({}, response);
    expect(response.body).toMatchObject({ status: 'ok', ai: { status: 'ok' } });
  });

  it('validates a claim title', async () => {
    const response = responseDouble();
    await createClaim({ body: { title: '  ' } } as any, response, vi.fn());
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Title is required');
    expect(Claim.create).not.toHaveBeenCalled();
  });

  it('creates and returns a persisted claim', async () => {
    vi.mocked(Claim.create).mockResolvedValue({ _id: 'claim-id', claimNumber: 'CLM-DEMO', title: 'Collision' } as never);
    const response = responseDouble();
    await createClaim({ body: { title: 'Collision', description: 'Rear impact' } } as any, response, vi.fn());
    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({ claimNumber: 'CLM-DEMO', title: 'Collision' });
    expect(Claim.create).toHaveBeenCalledWith({ title: 'Collision', description: 'Rear impact' });
  });

  it('persists uploaded evidence metadata for an existing claim', async () => {
    vi.mocked(Claim.findById).mockResolvedValue({ _id: 'claim-id' } as never);
    vi.mocked(Evidence.insertMany).mockResolvedValue([{ _id: 'evidence-id', filename: 'report.txt' }] as never);
    const response = responseDouble();
    await addEvidence({ params: { id: 'claim-id' }, files: [{ originalname: 'report.txt', mimetype: 'text/plain', path: '/uploads/report.txt', size: 25 }] } as any, response, vi.fn());
    expect(response.statusCode).toBe(201);
    expect(Evidence.insertMany).toHaveBeenCalledWith([expect.objectContaining({ claimId: 'claim-id', filename: 'report.txt', filePath: '/uploads/report.txt' })]);
  });

  it('calls the AI service and saves its structured assessment', async () => {
    const claim: any = { _id: 'claim-id', title: 'Collision', description: 'Rear impact', status: 'Draft', save: vi.fn() };
    const evidence: any = { _id: 'evidence-id', filename: 'report.txt', save: vi.fn() };
    vi.mocked(Claim.findById).mockResolvedValue(claim);
    vi.mocked(Evidence.find).mockResolvedValue([evidence] as never);
    vi.mocked(analyseClaim).mockResolvedValue({ status: 'complete', evidence: [{ id: 'evidence-id', evidenceType: 'police_report', extractedText: 'Collision report' }], coverageAssessment: 'Needs review', missingInformation: [], riskIndicators: [], detectedDamage: [], recommendations: ['Review'] } as never);
    const response = responseDouble();
    await runAnalysis({ params: { id: 'claim-id' } } as any, response, vi.fn());
    expect(analyseClaim).toHaveBeenCalledWith(expect.objectContaining({ claimId: 'claim-id', title: 'Collision' }));
    expect(claim.status).toBe('Awaiting Review');
    expect(claim.coverageAssessment).toBe('Needs review');
    expect(claim.save).toHaveBeenCalledTimes(2);
    expect(evidence.evidenceType).toBe('police_report');
    expect(evidence.save).toHaveBeenCalledOnce();
  });

  it('requires analysis and notes before a human decision can be recorded', async () => {
    vi.mocked(Claim.findById).mockResolvedValue({ _id: 'claim-id', analysis: null } as never);
    const response = responseDouble();
    await submitHumanReview({ params: { id: 'claim-id' }, body: { outcome: 'approved', notes: '' } } as any, response, vi.fn());
    expect(response.statusCode).toBe(409);
    expect(response.body.error).toContain('Analyse this claim');
  });

  it('stores a human decision and moves the claim to the correct status', async () => {
    const claim: any = { _id: 'claim-id', analysis: { status: 'complete' }, status: 'Awaiting Review', save: vi.fn() };
    vi.mocked(Claim.findById).mockResolvedValue(claim);
    const response = responseDouble();
    await submitHumanReview({ params: { id: 'claim-id' }, body: { outcome: 'more_information_required', notes: 'Please provide the original repair invoice.' } } as any, response, vi.fn());
    expect(response.statusCode).toBe(200);
    expect(claim.status).toBe('Awaiting Information');
    expect(claim.humanReview).toMatchObject({ outcome: 'more_information_required', notes: 'Please provide the original repair invoice.' });
    expect(claim.save).toHaveBeenCalledOnce();
  });

  it('records an assessor approval as resolved without an AI-generated decision', async () => {
    const claim: any = { _id: 'claim-id', analysis: { status: 'complete' }, status: 'Awaiting Review', save: vi.fn() };
    vi.mocked(Claim.findById).mockResolvedValue(claim);
    const response = responseDouble();
    await submitHumanReview({ params: { id: 'claim-id' }, body: { outcome: 'approved', notes: 'Manual review complete; supporting documents checked.' } } as any, response, vi.fn());
    expect(claim.status).toBe('Resolved');
    expect(claim.humanReview.outcome).toBe('approved');
  });

  it('deletes the claim, evidence records, and local uploads', async () => {
    const claim: any = { _id: 'claim-id', deleteOne: vi.fn() };
    vi.mocked(Claim.findById).mockResolvedValue(claim);
    vi.mocked(Evidence.deleteMany).mockResolvedValue({ deletedCount: 2 } as never);
    const response = responseDouble();
    response.end = vi.fn();
    await deleteClaim({ params: { id: 'claim-id' } } as any, response, vi.fn());
    expect(deleteClaimUploads).toHaveBeenCalledWith('claim-id');
    expect(Evidence.deleteMany).toHaveBeenCalledWith({ claimId: 'claim-id' });
    expect(claim.deleteOne).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(204);
  });
});
