import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const port = Number(process.env.PORT || 5050);
Promise.all([import('./app'), import('./config/db'), import('mongoose')]).then(async ([{ app }, { connectDatabase }, { default: mongoose }]) => {
  try {
    await connectDatabase();
    const { bootstrap } = await import('./services/auth'); await bootstrap();
    const { Claim } = await import('./models/Claim');
    await Claim.updateMany({ $or: [{ analysisStatus: 'processing' }, { status: 'Processing' }] }, { $set: { analysisStatus: 'failed', analysisStale: true, analysisError: 'API restarted during processing; retry analysis', status: 'Ready for Analysis' } });
    const server = app.listen(port, () => console.info(`[API] Listening on ${port}`));
    server.on('error', error => { console.error('[API] Startup failed:', error.message); mongoose.disconnect().finally(()=>process.exit(1)); });
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { server.close(() => mongoose.disconnect().finally(()=>process.exit(0))); setTimeout(()=>process.exit(1),10000).unref(); });
  } catch (error) { console.error('[Startup]', (error as Error).message); await mongoose.disconnect(); process.exit(1); }
});
