import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Request, Response, NextFunction } from 'express';
import { Claim } from '../models/Claim';
import { Evidence } from '../models/Evidence';
import { analyseClaim } from '../services/aiClient';
import { deleteClaimUploads } from '../services/storage';

export async function listClaims(_req: Request, res: Response, next: NextFunction) {
  try { const query = String(_req.query.q || '').slice(0,120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); res.json(await Claim.find(query ? { $or: [{ title: { $regex: query, $options: 'i' } }, { claimNumber: { $regex: query, $options: 'i' } }] } : {}).sort({ updatedAt: -1 }).limit(100)); }
  catch (error) { next(error); }
}

export async function createClaim(req: Request, res: Response, next: NextFunction) {
  try {
    if (typeof req.body.title !== 'string' || (req.body.description !== undefined && typeof req.body.description !== 'string')) return res.status(400).json({ error: 'Claim title and description must be text' });
    const title = String(req.body.title || '').trim();
    if (title.length > 120 || String(req.body.description || "").length > 10000) return res.status(400).json({ error: "Claim text exceeds limits" });
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const kinds = ['insurance_policy','police_report','repair_estimate','accident_photo'];
    if (req.body.requiredEvidence !== undefined && (!Array.isArray(req.body.requiredEvidence) || !req.body.requiredEvidence.every((v: unknown) => kinds.includes(String(v))))) return res.status(400).json({ error: 'Invalid evidence requirements' });
    const claim = await Claim.create({ title, description: String(req.body.description || ''), ...(req.body.requiredEvidence !== undefined ? { requiredEvidence: req.body.requiredEvidence } : {}) });
    res.status(201).json(claim);
  } catch (error) { next(error); }
}

export async function getClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const evidence = await Evidence.find({ claimId: claim._id }).sort({ createdAt: 1 });
    res.json({ ...claim.toObject(), evidence: evidence.map(item => { const { filePath, ...publicItem } = item.toObject(); return publicItem; }) });
  } catch (error) { next(error); }
}

export async function deleteClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.analysisStatus === 'processing') return res.status(409).json({ error: 'Wait for analysis to finish' });
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
    if (claim.analysisStatus === 'processing' || claim.status === 'Resolved') { await Promise.all(files.map(f => fs.unlink(f.path))); return res.status(409).json({ error: 'Wait for analysis or reopen resolved claim before changing evidence' }); }
    if (await Evidence.countDocuments({ claimId: claim._id }) + files.length > 50) { await Promise.all(files.map(f => fs.unlink(f.path).catch(()=>{}))); return res.status(400).json({ error: 'Maximum 50 evidence files per claim' }); }
    let records;
    try {
      const metadata = [];
      const hashes = new Set<string>();
      for (const file of files) {
        const bytes = await fs.readFile(file.path);
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (hashes.has(hash) || await Evidence.exists({ claimId: claim._id, sha256: hash })) throw new Error('Duplicate evidence');
        hashes.add(hash);
        const mime = file.mimetype;
        const extensions: Record<string,string[]> = { 'text/plain':['.txt','.md','.csv'], 'application/pdf':['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx'], 'image/jpeg':['.jpg','.jpeg'], 'image/png':['.png'], 'image/webp':['.webp'], 'image/tiff':['.tif','.tiff'] };
        if (!extensions[mime]?.includes(path.extname(file.originalname).toLowerCase())) throw new Error('Filename extension does not match file type');
        const magic = bytes.subarray(0,12);
        const valid = mime === 'text/plain' ? !bytes.includes(0) : mime === 'application/pdf' ? magic.toString().startsWith('%PDF-') : mime.includes('wordprocessingml') ? magic.subarray(0,2).toString() === 'PK' : mime === 'image/jpeg' ? magic[0] === 255 && magic[1] === 216 : mime === 'image/png' ? magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/webp' ? magic.subarray(0,4).toString() === 'RIFF' && magic.subarray(8,12).toString() === 'WEBP' : mime === 'image/tiff' ? ['49492a00','4d4d002a'].includes(magic.subarray(0,4).toString('hex')) : false;
        if (!valid) throw new Error('File content does not match supported type');
        metadata.push({ claimId: claim._id, filename: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'), mimeType: mime, filePath: file.path, size: file.size, sha256: hash });
      }
      records = await Evidence.insertMany(metadata);
    } catch (error) { await Promise.all(files.map(file => fs.unlink(file.path).catch(()=>{}))); return res.status(400).json({ error: (error as Error).message }); }
    if (claim.analysis) {
      invalidate(claim);
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
    claim.status = 'Ready for Analysis'; await claim.save();
    res.status(201).json(records.map(item => { const { filePath, ...publicItem } = item.toObject(); return publicItem; }));
  } catch (error) { next(error); }
}

export async function getEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await Claim.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Claim not found' });
    res.json(await Evidence.find({ claimId: req.params.id }).select('-filePath').sort({ createdAt: 1 }));
  } catch (error) { next(error); }
}

export async function runAnalysis(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const evidence = await Evidence.find({ claimId: claim._id });
    if (!evidence.length) return res.status(400).json({ error: 'Add evidence before analysis' });
    if (claim.status === 'Resolved') return res.status(409).json({ error: 'Reopen the claim before reanalysis' });
    const lock = await Claim.updateOne({ _id: claim._id, analysisStatus: { $ne: 'processing' } }, { $set: { analysisStatus: 'processing', analysisStartedAt: new Date(), status: 'Analysing' } });
    if (!lock.modifiedCount) return res.status(409).json({ error: 'Analysis is already running' });
    claim.analysisStatus = 'processing'; claim.analysisStale = !!claim.analysis; claim.analysisStartedAt = new Date(); claim.status = 'Analysing';
    claim.humanReview = undefined;
    await claim.save();
    try {
      const result = await analyseClaim({ claimId: String(claim._id), title: claim.title, description: claim.description, requiredEvidence: claim.requiredEvidence, evidence: evidence.map(item => ({ id: String(item._id), filename: item.filename, mimeType: item.mimeType, filePath: item.filePath })) });
      if (claim.analysis) claim.analysisHistory.push({ version: claim.analysisHistory.length + 1, analysedAt: claim.analysedAt, result: claim.analysis });
      claim.analysis = result; claim.analysisStale = false; claim.analysisStatus = result.status === 'partial' ? 'partial' : 'completed'; claim.analysisError = undefined;
      claim.status = 'Awaiting Review';
      claim.coverageAssessment = result.coverageAssessment || 'Requires human review';
      claim.missingInformation = result.missingInformation || [];
      claim.riskIndicators = result.riskIndicators || [];
      claim.detectedDamage = result.detectedDamage || [];
      claim.recommendations = result.recommendations || [];
      claim.estimatedDamage = result.estimatedDamage ?? null;
      claim.analysedAt = new Date();
      for (const item of evidence) {
        const processed = (result.evidence || []).find((entry: any) => entry.id === String(item._id));
        if (processed) {
          item.evidenceType = processed.evidenceType || 'unknown';
          item.documentClassification = processed.documentClassification;
          item.extractionStatus = (processed.errors || []).some((e: any) => e.pipeline === 'ocr') ? 'failed' : 'completed';
          item.extractionMetadata = { characters: (processed.extractedText || '').length, analysedAt: new Date(), pageLimit: 20, textLimit: 30000 };
          item.extractedText = processed.extractedText || '';
          item.entities = processed.entities || [];
          item.aiAnalysis = processed;
          await item.save();
        }
      }
      await claim.save();
      res.json(claim);
    } catch (error) {
      claim.status = 'Ready for Analysis'; claim.analysisStatus = 'failed'; claim.analysisStale = true; claim.analysisError = 'Inference failed or timed out; retry analysis';
      await claim.save();
      res.status(503).json({ error: claim.analysisError });
    }
  } catch (error) { next(error); }
}

export async function submitHumanReview(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (!claim.analysis) return res.status(409).json({ error: 'Analyse this claim before submitting a review' });
    if (claim.status === 'Processing' || claim.analysisStatus === 'processing' || claim.analysisStale) return res.status(409).json({ error: 'Wait for analysis to finish before reviewing' });

    const submittedOutcome = String(req.body.outcome || '');
    const notes = String(req.body.notes || '').trim();
    const outcomes = ['approved', 'declined', 'more_information_required'] as const;
    if (!(outcomes as readonly string[]).includes(submittedOutcome)) return res.status(400).json({ error: 'Choose approve, decline, or request more information' });
    if (!notes) return res.status(400).json({ error: 'Add review notes before submitting a decision' });
    if (notes.length > 2000) return res.status(400).json({ error: 'Review notes must be 2000 characters or fewer' });

    const outcome = submittedOutcome as typeof outcomes[number];
    claim.humanReview = { outcome, notes, reviewedAt: new Date(), reviewer: res.locals.user?.username || 'test-reviewer', analysisVersion: claim.analysisHistory.length + 1 };
    claim.reviewHistory.push(claim.humanReview);
    claim.auditHistory.push({ action: 'human_review', actor: res.locals.user?.username, at: new Date(), outcome });
    claim.status = outcome === 'more_information_required' ? 'Awaiting Information' : 'Resolved';
    await claim.save();
    res.json(claim);
  } catch (error) { next(error); }
}

export async function getAnalysis(req: Request, res: Response, next: NextFunction) {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    res.json(claim.analysisStale ? { status: 'stale', analysisStatus: claim.analysisStatus, previousAnalysis: claim.analysis } : claim.analysis || { status: 'not_analysed' });
  } catch (error) { next(error); }
}

function invalidate(claim: any) {
  if (claim.analysis) claim.analysisHistory.push({ version: claim.analysisHistory.length + 1, analysedAt: claim.analysedAt, result: claim.analysis, stale: true });
  claim.analysisStale = true; claim.analysedAt = undefined; claim.analysis = null; claim.humanReview = undefined; claim.analysisStatus = 'not_started';
  claim.estimatedDamage = null; claim.coverageAssessment = 'Not assessed'; claim.missingInformation = []; claim.recommendations = []; claim.riskIndicators = []; claim.detectedDamage = [];
}
export async function editClaim(req: Request, res: Response, next: NextFunction) {
  try { const claim = await Claim.findById(req.params.id); if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.analysisStatus === 'processing' || claim.status === 'Resolved') return res.status(409).json({ error: 'Wait for analysis or reopen claim before editing' });
    if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.length > 120 || typeof req.body.description !== 'string' || req.body.description.length > 10000) return res.status(400).json({ error: 'Invalid title or description' });
    claim.title = req.body.title.trim(); claim.description = req.body.description; invalidate(claim); claim.status = 'Evidence Collection';
    claim.auditHistory.push({ action: 'edit', actor: res.locals.user.username, at: new Date() }); await claim.save(); res.json(claim);
  } catch (error) { next(error); }
}
export async function reopenClaim(req: Request, res: Response, next: NextFunction) {
  try { const claim = await Claim.findById(req.params.id); if (!claim) return res.status(404).json({ error: 'Claim not found' }); if (claim.status !== 'Resolved') return res.status(409).json({ error: 'Only resolved claims can be reopened' });
    claim.status = 'Evidence Collection'; claim.humanReview = undefined; claim.auditHistory.push({ action: 'reopen', actor: res.locals.user.username, at: new Date() }); await claim.save(); res.json(claim);
  } catch (error) { next(error); }
}
export async function downloadEvidence(req: Request, res: Response, next: NextFunction) {
  try { const item = await Evidence.findOne({ _id: req.params.evidenceId, claimId: req.params.id }); if (!item) return res.status(404).json({ error: 'Evidence not found' });
    const root = await fs.realpath(path.resolve(__dirname, '../../../', process.env.UPLOAD_DIR || './uploads'));
    const actual = await fs.realpath(item.filePath); if (!actual.startsWith(root + path.sep)) return res.status(403).json({ error: 'Unsafe evidence path' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.download(actual, item.filename);
  } catch (error) { next(error); }
}
export async function removeEvidence(req: Request, res: Response, next: NextFunction) {
  try { const claim = await Claim.findById(req.params.id); if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.analysisStatus === 'processing' || claim.status === 'Resolved') return res.status(409).json({ error: 'Wait for analysis or reopen claim before changing evidence' });
    const item = await Evidence.findOne({ _id: req.params.evidenceId, claimId: claim._id }); if (!item) return res.status(404).json({ error: 'Evidence not found' });
    await fs.unlink(item.filePath); await item.deleteOne(); invalidate(claim); claim.status = 'Evidence Collection'; claim.auditHistory.push({ action: 'remove_evidence', actor: res.locals.user.username, at: new Date(), evidenceId: item._id }); await claim.save(); res.status(204).end();
  } catch (error) { next(error); }
}
export async function validateClaimUpload(req: Request, res: Response, next: NextFunction) {
  try { if (!/^[a-f\d]{24}$/i.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid identifier' }); const claim = await Claim.findById(req.params.id); if (!claim) return res.status(404).json({ error: 'Claim not found' }); if (claim.analysisStatus === 'processing' || claim.status === 'Resolved') return res.status(409).json({ error: 'Wait for analysis or reopen claim' }); next(); } catch (error) { next(error); }
}
