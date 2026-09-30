import { Router } from 'express';
import { addEvidence, createClaim, deleteClaim, getAnalysis, getClaim, getEvidence, listClaims, runAnalysis, submitHumanReview } from '../controllers/claims';
import { upload } from '../services/storage';
const router = Router();
router.get('/', listClaims); router.post('/', createClaim); router.get('/:id', getClaim);
router.delete('/:id', deleteClaim);
router.post('/:id/evidence', upload.array('files', 10), addEvidence); router.get('/:id/evidence', getEvidence);
router.post('/:id/analyse', runAnalysis); router.post('/:id/review', submitHumanReview); router.get('/:id/analysis', getAnalysis);
export default router;
