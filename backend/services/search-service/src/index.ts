import express from 'express';
import cors from 'cors';
import busquedaRoutes from './routes/busqueda.routes';

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
  res.json({ status: 'ok', service: 'search-service', timestamp: new Date().toISOString() });
});

app.use('/api/busqueda', busquedaRoutes);

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`search-service corriendo en el puerto ${PORT}`);
});
