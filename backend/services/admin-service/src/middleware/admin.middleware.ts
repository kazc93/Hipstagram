// Middleware de autorización ADMIN — se usa después de verificarToken
import { Response, NextFunction } from 'express';
import { pool } from '../db';

export const verificarAdmin = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id_usuario = req.usuario.id;

    const result = await pool.query(
      'SELECT id_rol FROM usuarios WHERE id_usuario = $1',
      [id_usuario]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    if (result.rows[0].id_rol !== 1) {
      return res.status(403).json({ mensaje: 'Acceso denegado. Se requiere rol ADMIN' });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
