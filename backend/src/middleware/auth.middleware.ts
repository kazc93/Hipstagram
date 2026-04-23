// Middleware de autenticación — verifica que el request lleve un JWT válido
// Se aplica a todas las rutas protegidas antes de llegar al controller
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const verificarToken = (req: any, res: Response, next: NextFunction) => {
  // El token llega en el header: Authorization: Bearer <token>
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ mensaje: 'Token requerido' });
  }

  // Extraer solo el token (quitar la palabra "Bearer ")
  const token = authHeader.split(' ')[1];

  try {
    // Verificar firma y expiración del JWT contra la clave secreta
    const decoded = jwt.verify(
      token,
      process.env['JWT_SECRET'] || 'tu_clave_secreta_aqui'
    );
    // Inyectar los datos del usuario en el request para que los controllers los usen
    req.usuario = decoded;
    next(); // pasar al siguiente middleware o al controller
  } catch (error) {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
};
