import path from 'node:path'; import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const port = Number(process.env.PORT || 5050);
Promise.all([import('./app'), import('./config/db')]).then(async ([{ app }, { connectDatabase }]) => {
  try { await connectDatabase(); app.listen(port, () => console.info(`[API] Listening on ${port}`)); }
  catch (error) { console.error('[DB] Connection failed', (error as Error).message); process.exit(1); }
});
