import express from 'express';
import cors from 'cors';
import { pool } from './db';
import { initAuditLogService } from './services/auditLog.service';
import adminRoutes from './routes/admin.routes';

const app = express();

const allowedOrigins = (process.env['CORS_ORIGIN'] || 'http://localhost:4200')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido → ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'admin-service', timestamp: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);

const PORT = 3004;

(async () => {
  const auditLog = initAuditLogService(pool);
  await auditLog.loadRecentFromDB();

  app.listen(PORT, () => {
    console.log(`admin-service corriendo en el puerto ${PORT}`);
  });
})();
