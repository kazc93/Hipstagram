import { Router } from 'express';
import { votar } from '../controllers/votos.controller';
import { verificarToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/:id_post/votar', verificarToken, votar);

export default router;