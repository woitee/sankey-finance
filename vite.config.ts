import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function correctionsApiPlugin(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  const parsedDir = path.resolve(dataDir, 'parsed');
  const correctionsPath = path.resolve(dataDir, 'corrections.json');

  return {
    name: 'corrections-api',
    configureServer(server) {
      // GET /api/corrections
      server.middlewares.use('/api/corrections', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const data = fs.existsSync(correctionsPath)
              ? fs.readFileSync(correctionsPath, 'utf-8')
              : JSON.stringify({ version: 1, corrections: [] });
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to read corrections' }));
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              fs.writeFileSync(correctionsPath, JSON.stringify(parsed, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        next();
      });

      // GET /api/statements - list available parsed statements
      server.middlewares.use('/api/statements', (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const files = fs.readdirSync(parsedDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''))
            .sort();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
        }
      });

      // GET/POST /api/statement/:period
      server.middlewares.use('/api/statement/', (req, res, next) => {
        const period = req.url?.replace(/^\//, '').replace(/\/$/, '');
        if (!period) return next();
        const filePath = path.resolve(parsedDir, `${period}.json`);

        if (req.method === 'GET') {
          try {
            const data = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `Statement ${period} not found` }));
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), correctionsApiPlugin()],
});
