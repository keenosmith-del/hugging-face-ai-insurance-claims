import { Router } from 'express';
import { editClaim, reopenClaim, downloadEvidence, removeEvidence, validateClaimUpload, addEvidence, createClaim, deleteClaim, getAnalysis, getClaim, getEvidence, listClaims, runAnalysis, submitHumanReview } from '../controllers/claims';
import { administrator } from '../services/auth';
import { upload } from '../services/storage';
const router = Router();
// Single-instance mutation guard complements MongoDB's persistent analysis lock.
const mutations = new Set<string>();
router.use('/:id', (req, res, next) => {
  if (req.method === 'GET') return next();
  const id = String(req.params.id).toLowerCase();
  if (mutations.has(id)) return res.status(409).json({ error: 'Another claim action is running; retry after it finishes' });
  mutations.add(id);
  let released = false;
  const release = () => { if (!released) { released = true; mutations.delete(id); } };
  res.once('finish', release); res.once('close', release); next();
});
router.get('/', listClaims); router.post('/', createClaim); router.get('/:id', getClaim);
router.patch('/:id', editClaim); router.post('/:id/reopen', reopenClaim); router.delete('/:id', administrator, deleteClaim);
router.get('/:id/evidence/:evidenceId/download', downloadEvidence); router.delete('/:id/evidence/:evidenceId', removeEvidence);
router.post('/:id/evidence', validateClaimUpload, upload.array('files', 10), addEvidence); router.get('/:id/evidence', getEvidence);
router.post('/:id/analyse', runAnalysis); router.post('/:id/review', submitHumanReview); router.get('/:id/analysis', getAnalysis);
export default router;
