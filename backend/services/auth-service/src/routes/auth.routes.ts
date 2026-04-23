import { Router } from 'express';
import { registro, login, refreshToken } from '../controllers/auth.controller';

const router = Router();

router.post('/registro', registro);
router.post('/login', login);
router.post('/refresh', refreshToken);

export default router;
