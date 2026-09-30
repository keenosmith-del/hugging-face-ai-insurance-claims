import express from 'express'; import cors from 'cors';
import claims from './routes/claims'; import { checkAiHealth } from './services/aiClient';
export const app = express(); app.use(cors()); app.use(express.json({ limit: '1mb' }));
app.get('/health', async (_req, res) => { let ai: unknown; try { ai = await checkAiHealth(); } catch { ai = { status: 'unavailable' }; } res.json({ status: 'ok', service: 'claims-api', ai }); });
app.use('/api/claims', claims);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('[API]', err.message); if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier' }); if (err.code === 11000) return res.status(409).json({ error: 'Duplicate record' }); const status = err.message === 'Unsupported file type' ? 415 : err.code === 'ECONNREFUSED' ? 503 : 500; res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message }); });
