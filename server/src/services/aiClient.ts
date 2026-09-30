import axios from 'axios';
const ai = axios.create({ baseURL: process.env.AI_SERVICE_URL || 'http://localhost:8000', timeout: 180000 });
export async function analyseClaim(payload: unknown) { const { data } = await ai.post('/analyse/claim', payload); return data; }
export async function checkAiHealth() { const { data } = await ai.get('/health', { timeout: 3000 }); return data; }
