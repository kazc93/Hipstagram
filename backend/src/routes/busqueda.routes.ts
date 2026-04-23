import { Router } from 'express';
import { buscarPorHashtag, buscarGeneral, explorar } from '../controllers/busqueda.controller';
import { verificarToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/hashtag', verificarToken, buscarPorHashtag);
router.get('/general', verificarToken, buscarGeneral);
router.get('/explorar', verificarToken, explorar);

export default router;