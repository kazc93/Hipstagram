import { Router } from 'express';
import { crearPost, obtenerFeed, obtenerPost, eliminarPost, obtenerMisPosts } from '../controllers/posts.controller';
import { verificarToken } from '../middleware/auth.middleware';
import { upload } from '../middleware/multer.middleware';

const router = Router();

router.get('/feed', verificarToken, obtenerFeed);
router.get('/mis-posts', verificarToken, obtenerMisPosts);
router.post('/', verificarToken, upload.single('imagen'), crearPost);
router.get('/:id_post', verificarToken, obtenerPost);
router.delete('/:id_post', verificarToken, eliminarPost);

export default router;