// Punto de entrada del servidor Express — registra rutas, middleware global y arranca el servidor
import express from 'express';
import cors from 'cors';
import { pool } from './db';
import { initAuditLogService } from './services/auditLog.service';
import authRoutes from './routes/auth.routes';
import postRoutes from './routes/posts.routes';
import votosRoutes from './routes/votos.routes';
import comentariosRoutes from './routes/comentarios.routes';
import busquedaRoutes from './routes/busqueda.routes';
import adminRoutes from './routes/admin.routes';
import path from 'path';

const app = express();

// Lista de orígenes permitidos para CORS (frontend Angular en local o producción)
const allowedOrigins = (process.env['CORS_ORIGIN'] || 'http://localhost:4200')
  .split(',')
  .map(o => o.trim());

// CORS: controla qué dominios pueden llamar a esta API
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido → ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parsear body JSON en todas las rutas
app.use(express.json());

// Servir imágenes subidas localmente (en producción se usan URLs de S3)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check — usado por el smoke test del pipeline Jenkins para verificar que el servidor levantó
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Registro de rutas por dominio de negocio
app.use('/api/auth',     authRoutes);        // login, registro, refresh token
app.use('/api/posts',    postRoutes);         // crear, listar, eliminar posts
app.use('/api/posts',    votosRoutes);        // like/dislike en posts
app.use('/api/posts',    comentariosRoutes);  // comentarios en posts
app.use('/api/busqueda', busquedaRoutes);     // búsqueda por hashtag o texto
app.use('/api/admin',    adminRoutes);        // panel de administración (solo ADMIN)

const PORT = 3000;

// Inicializar el servidor: primero carga los logs recientes de la DB en memoria, luego escucha
(async () => {
  const auditLog = initAuditLogService(pool);
  await auditLog.loadRecentFromDB();  // carga los últimos 500 eventos en la lista enlazada

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
})();
