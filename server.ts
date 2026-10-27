import express from 'express';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Savora', version: '0.1.0' });
});

async function start() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.listen(PORT, '0.0.0.0', () => {
    console.log('Savora is running on port ' + PORT);
  });
}

start().catch((error) => {
  console.error('Unable to start Savora:', error);
  process.exit(1);
});
