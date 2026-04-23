import { Router } from 'express';
import { crearComentario, obtenerComentarios, eliminarComentario } from '../controllers/comentarios.controller';
import { verificarToken } from '../middleware/auth.middleware';


const router = Router();

router.get('/:id_post/comentarios', verificarToken, obtenerComentarios);
router.post('/:id_post/comentarios', verificarToken, crearComentario);
router.delete('/:id_post/comentarios/:id_comentario', verificarToken, eliminarComentario);

export default router;