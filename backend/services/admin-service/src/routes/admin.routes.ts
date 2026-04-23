import { Router } from 'express';
import {
  obtenerUsuarios,
  bloquearUsuario,
  obtenerPostsAdmin,
  cambiarEstadoPost,
  obtenerHashtagsProhibidos,
  agregarHashtagProhibido,
  eliminarHashtagProhibido,
  obtenerAuditLogs,
  eliminarPostAdmin,
} from '../controllers/admin.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { verificarAdmin } from '../middleware/admin.middleware';

const router = Router();

// Todas las rutas requieren token válido + rol ADMIN
router.use(verificarToken, verificarAdmin);

// ── Usuarios ───────────────────────────────────────────────────
router.get('/usuarios',             obtenerUsuarios);
router.put('/usuarios/:id/bloquear', bloquearUsuario);

// ── Moderación de posts ────────────────────────────────────────
router.get('/posts',                    obtenerPostsAdmin);
router.put('/posts/:id/estado',         cambiarEstadoPost);
router.delete('/posts/:id_post',        eliminarPostAdmin);

// ── Hashtags prohibidos ────────────────────────────────────────
router.get('/hashtags-prohibidos',            obtenerHashtagsProhibidos);
router.post('/hashtags-prohibidos',           agregarHashtagProhibido);
router.delete('/hashtags-prohibidos/:id',     eliminarHashtagProhibido);

// ── Audit logs ─────────────────────────────────────────────────
router.get('/audit-logs',           obtenerAuditLogs);

export default router;
