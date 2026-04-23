// Middleware de autorización ADMIN — se usa después de verificarToken
// Consulta la DB para confirmar que el usuario tiene rol de administrador (id_rol = 1)
import { Response, NextFunction } from 'express';
import { pool } from '../db';

export const verificarAdmin = async (req: any, res: Response, next: NextFunction) => {
  try {
    // req.usuario fue inyectado por verificarToken en el paso anterior
    const id_usuario = req.usuario.id;

    // Consultar el rol real del usuario directamente en la base de datos
    const result = await pool.query(
      'SELECT id_rol FROM usuarios WHERE id_usuario = $1',
      [id_usuario]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // id_rol = 1 → ADMIN, cualquier otro valor → acceso denegado
    if (result.rows[0].id_rol !== 1) {
      return res.status(403).json({ mensaje: 'Acceso denegado. Se requiere rol ADMIN' });
    }

    next(); // usuario verificado como ADMIN, continuar al controller
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
