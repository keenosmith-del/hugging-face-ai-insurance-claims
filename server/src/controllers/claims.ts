import { Request, Response, NextFunction } from 'express';
import { Claim } from '../models/Claim';
import { Evidence } from '../models/Evidence';
import { analyseClaim } from '../services/aiClient';
import { deleteClaimUploads } from '../services/storage';

export async function listClaims(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await Claim.find().sort({ updatedAt: -1 }).limit(100)); }
  catch (error) { next(error); }
}

export async function createClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const claim = await Claim.create({ title, description: String(req.body.description || '') });
    res.status(201).json(claim);
  } catch (error) { next(error); }
}

export async function getClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const evidence = await Evidence.find({ claimId: claim._id }).sort({ createdAt: 1 });
    res.json({ ...claim.toObject(), evidence });
  } catch (error) { next(error); }
}

export async function deleteClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    await deleteClaimUploads(String(claim._id));
    await Evidence.deleteMany({ claimId: claim._id });
    await claim.deleteOne();
    res.status(204).end();
  } catch (error) { next(error); }
}

export async function addEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ error: 'Upload at least one supported file' });
    const records = await Evidence.insertMany(files.map(file => ({ claimId: claim._id, filename: file.originalname, mimeType: file.mimetype, filePath: file.path, size: file.size })));
    if (claim.analysis) {
      claim.analysis = null;
      claim.analysedAt = undefined;
      claim.humanReview = undefined;
      claim.coverageAssessment = 'Not assessed';
      claim.missingInformation = [];
      claim.riskIndicators = [];
      claim.detectedDamage = [];
      claim.recommendations = [];
      claim.estimatedDamage = null;
      claim.status = 'Draft';
      await claim.save();
    }
    res.status(201).json(records);
  } catch (error) { next(error); }
}

export async function getEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await Claim.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Claim not found' });
    res.json(await Evidence.find({ claimId: req.params.id }).sort({ createdAt: 1 }));
  } catch (error) { next(error); }
}

export async function runAnalysis(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const evidence = await Evidence.find({ claimId: claim._id });
    if (!evidence.length) return res.status(400).json({ error: 'Add evidence before analysis' });
    claim.status = 'Processing';
    claim.humanReview = undefined;
    await claim.save();
    try {
      const result = await analyseClaim({ claimId: String(claim._id), title: claim.title, description: claim.description, evidence: evidence.map(item => ({ id: String(item._id), filename: item.filename, mimeType: item.mimeType, filePath: item.filePath })) });
      claim.analysis = result;
      claim.status = 'Awaiting Review';
      claim.coverageAssessment = result.coverageAssessment || 'Requires human review';
      claim.missingInformation = result.missingInformation || [];
      claim.riskIndicators = result.riskIndicators || [];
      claim.detectedDamage = result.detectedDamage || [];
      claim.recommendations = result.recommendations || [];
      claim.estimatedDamage = result.estimatedDamage ?? null;
      claim.analysedAt = new Date();
      await claim.save();
      for (const item of evidence) {
        const processed = (result.evidence || []).find((entry: any) => entry.id === String(item._id));
        if (processed) {
          item.evidenceType = processed.evidenceType || 'unknown';
          item.documentClassification = processed.documentClassification;
          item.extractedText = processed.extractedText || '';
          item.entities = processed.entities || [];
          item.aiAnalysis = processed;
          await item.save();
        }
      }
      res.json(claim);
    } catch (error) {
      claim.status = 'Awaiting Review';
      await claim.save();
      next(error);
    }
  } catch (error) { next(error); }
}

export async function submitHumanReview(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (!claim.analysis) return res.status(409).json({ error: 'Analyse this claim before submitting a review' });
    if (claim.status === 'Processing') return res.status(409).json({ error: 'Wait for analysis to finish before reviewing' });

    const submittedOutcome = String(req.body.outcome || '');
    const notes = String(req.body.notes || '').trim();
    const outcomes = ['approved', 'declined', 'more_information_required'] as const;
    if (!(outcomes as readonly string[]).includes(submittedOutcome)) return res.status(400).json({ error: 'Choose approve, decline, or request more information' });
    if (!notes) return res.status(400).json({ error: 'Add review notes before submitting a decision' });
    if (notes.length > 2000) return res.status(400).json({ error: 'Review notes must be 2000 characters or fewer' });

    const outcome = submittedOutcome as typeof outcomes[number];
    claim.humanReview = { outcome, notes, reviewedAt: new Date() };
    claim.status = outcome === 'more_information_required' ? 'Awaiting Information' : 'Resolved';
    await claim.save();
    res.json(claim);
  } catch (error) { next(error); }
}

export async function getAnalysis(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json(claim.analysis || { status: 'not_analysed' });
  } catch (error) { next(error); }
}
