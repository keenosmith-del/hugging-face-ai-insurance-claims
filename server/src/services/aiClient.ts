import axios from 'axios';
const ai = axios.create({ baseURL: process.env.AI_SERVICE_URL || 'http://localhost:8000', timeout: Number(process.env.AI_TIMEOUT_MS || 900000) });
export async function analyseClaim(payload: unknown) { const { data } = await ai.post('/analyse/claim', payload); return data; }
export async function checkAiHealth() { const { data } = await ai.get('/health', { timeout: 3000 }); return data; }
