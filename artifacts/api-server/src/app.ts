import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';

export const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check Endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Primary API Router
const apiRouter = express.Router();

apiRouter.get('/status', (req, res) => {
  res.json({ status: 'active', app: 'DHD Livraison API Server' });
});

// Auth mock & helper endpoints
apiRouter.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email && password) {
    return res.json({
      success: true,
      token: 'jwt_token_sample',
      admin: { id: 1, email, name: 'Admin DHD', role: 'superadmin' }
    });
  }
  return res.status(400).json({ success: false, message: 'Invalid credentials' });
});

apiRouter.get('/auth/me', (req, res) => {
  res.json({ id: 1, email: 'admin@dhd-livraison.dz', name: 'Admin DHD', role: 'superadmin' });
});

apiRouter.get('/employees', (req, res) => {
  res.json([]);
});

apiRouter.get('/offices', (req, res) => {
  res.json([]);
});

apiRouter.get('/attendance', (req, res) => {
  res.json([]);
});

apiRouter.get('/salaries', (req, res) => {
  res.json([]);
});

apiRouter.get('/stats', (req, res) => {
  res.json({
    totalEmployees: 0,
    presentToday: 0,
    activeOffices: 0,
    pendingAdvances: 0
  });
});

app.use('/api', apiRouter);

// Static frontend serving if available
const frontendDist = path.resolve(process.cwd(), 'artifacts/dhd-livraison/dist/public');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not Found', path: req.path });
    }
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return res.status(404).json({ error: 'Not Found', path: req.path });
  });
} else {
  // Fallback root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'DHD Livraison API Server',
      status: 'online',
      endpoints: {
        health: '/healthz',
        apiStatus: '/api/status'
      }
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });
}

