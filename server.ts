import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const FASTAPI_PORT = 8000;

let pythonProcess: ChildProcess | null = null;

function startFastApiBackend() {
  console.log('[FastAPI] Spawning Python uvicorn main:app on port 8000...');
  pythonProcess = spawn(
    'python3',
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(FASTAPI_PORT)],
    {
      cwd: __dirname,
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  );

  pythonProcess.on('error', (err) => {
    console.error('[FastAPI] Failed to start Python process:', err);
  });

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[FastAPI] Python process exited with code ${code}, signal ${signal}`);
  });
}

async function startServer() {
  const app = express();

  // Start FastAPI backend
  startFastApiBackend();

  // Handle process shutdown cleanly
  const cleanup = () => {
    if (pythonProcess) {
      console.log('[Server] Terminating FastAPI backend process...');
      pythonProcess.kill();
      pythonProcess = null;
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  // Proxy /api/* requests directly to FastAPI backend
  app.all('/api/*', (req, res) => {
    const targetPath = req.originalUrl;
    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: FASTAPI_PORT,
        path: targetPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${FASTAPI_PORT}`,
        },
      },
      (proxyRes) => {
        // Forward status code and headers (including Content-Disposition for downloads)
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error(`[Proxy] Error forwarding ${req.method} ${targetPath}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          detail: 'FastAPI backend is starting up or temporarily unavailable. Please retry in a moment.',
          error: err.message,
        });
      }
    });

    req.pipe(proxyReq);
  });

  // Vite development middleware
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Web application running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Failed to initialize server:', err);
  process.exit(1);
});
