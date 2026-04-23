import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const verificarToken = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ mensaje: 'Token requerido' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env['JWT_SECRET'] || 'tu_clave_secreta_aqui');
    req.usuario = decoded;
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
};
