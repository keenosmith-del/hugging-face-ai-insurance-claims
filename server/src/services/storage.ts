import fs from 'node:fs/promises';
import path from 'node:path';
import { Request } from 'express';
import multer from 'multer';
const root = path.resolve(__dirname, '../../../', process.env.UPLOAD_DIR || './uploads');
export async function ensureClaimUploadDir(claimId: string) { const dir = path.join(root, 'claims', claimId); await fs.mkdir(dir, { recursive: true }); return dir; }
export async function deleteClaimUploads(claimId: string) { await fs.rm(path.join(root, 'claims', claimId), { recursive: true, force: true }); }
export const upload = multer({ storage: multer.diskStorage({ destination: async (req: Request, _file, cb) => { try { cb(null, await ensureClaimUploadDir(String(req.params.id))); } catch (e) { cb(e as Error, ''); } }, filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`) }), limits: { fileSize: 20 * 1024 * 1024, files: 10 }, fileFilter: (_req, file, cb) => { const ok = /^(image\/(jpeg|png|webp|tiff)|application\/(pdf|vnd.openxmlformats-officedocument\..+)|text\/plain)$/.test(file.mimetype); if (ok) cb(null, true); else cb(new Error('Unsupported file type')); } });
