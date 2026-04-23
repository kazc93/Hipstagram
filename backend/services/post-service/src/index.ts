import express from 'express';
import cors from 'cors';
import postRoutes from './routes/posts.routes';
import votosRoutes from './routes/votos.routes';
import comentariosRoutes from './routes/comentarios.routes';

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
  res.json({ status: 'ok', service: 'post-service', timestamp: new Date().toISOString() });
});

app.use('/api/posts', postRoutes);
app.use('/api/posts', votosRoutes);
app.use('/api/posts', comentariosRoutes);

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`post-service corriendo en el puerto ${PORT}`);
});
