import { Response } from 'express';
import { pool } from '../db';
import { auditLog } from '../services/auditLog.service';
import { randomUUID } from 'crypto';

export const crearComentario = async (req: any, res: Response) => {
  const { id_post } = req.params;
  const { contenido } = req.body;
  const id_usuario = req.usuario.id;

  if (!contenido || contenido.trim().length === 0) {
    return res.status(400).json({ mensaje: 'El comentario no puede estar vacío' });
  }
  if (contenido.length > 500) {
    return res.status(400).json({ mensaje: 'El comentario no puede superar 500 caracteres' });
  }

  try {
    await pool.query('BEGIN');

    const post = await pool.query('SELECT * FROM posts WHERE id_post = $1', [id_post]);
    if (post.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    const result = await pool.query(
      `INSERT INTO comentarios (id_usuario, id_post, contenido)
       VALUES ($1, $2, $3) RETURNING *`,
      [id_usuario, id_post, contenido.trim()]
    );
    const comentario = result.rows[0];

    await pool.query('COMMIT');

    await auditLog({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_usuario,
      actor_role: 'USER',
      action: 'COMMENT_CREATE',
      entity_type: 'comment',
      entity_id: comentario.id_comentario,
      payload_resumen: `Comentario en post ${id_post} por usuario ${id_usuario}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.status(201).json({ mensaje: 'Comentario creado', comentario });

  } catch (error: any) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
};

export const obtenerComentarios = async (req: any, res: Response) => {
  const { id_post } = req.params;
  const page   = parseInt(req.query['page'] as string) || 1;
  const limit  = 10;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT c.id_comentario, c.contenido, c.fecha_comentario,
              u.username, u.nombre_completo
       FROM comentarios c
       JOIN usuarios u ON c.id_usuario = u.id_usuario
       WHERE c.id_post = $1
       ORDER BY c.fecha_comentario ASC
       LIMIT $2 OFFSET $3`,
      [id_post, limit, offset]
    );
    res.json({ comentarios: result.rows, page, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const eliminarComentario = async (req: any, res: Response) => {
  const { id_comentario } = req.params;
  const id_usuario = req.usuario.id;

  try {
    const comentario = await pool.query(
      'SELECT * FROM comentarios WHERE id_comentario = $1',
      [id_comentario]
    );

    if (comentario.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Comentario no encontrado' });
    }
    if (comentario.rows[0].id_usuario !== id_usuario) {
      return res.status(403).json({ mensaje: 'No puedes eliminar este comentario' });
    }

    await pool.query('DELETE FROM comentarios WHERE id_comentario = $1', [id_comentario]);

    await auditLog({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_usuario,
      actor_role: 'USER',
      action: 'COMMENT_DELETE',
      entity_type: 'comment',
      entity_id: id_comentario,
      payload_resumen: `Comentario ${id_comentario} eliminado por usuario ${id_usuario}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.json({ mensaje: 'Comentario eliminado exitosamente' });

  } catch (error: any) {
    console.error('Error al eliminar comentario:', error.message);
    res.status(500).json({ error: error.message });
  }
};
