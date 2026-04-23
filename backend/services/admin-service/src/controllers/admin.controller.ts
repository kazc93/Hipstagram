import { Response } from 'express';
import { pool } from '../db';
import { getAuditLogService } from '../services/auditLog.service';
import { randomUUID } from 'crypto';

export const obtenerUsuarios = async (req: any, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id_usuario, username, email, nombre_completo,
              id_rol, activo, fecha_registro
       FROM usuarios ORDER BY fecha_registro DESC`
    );
    res.json({ usuarios: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const bloquearUsuario = async (req: any, res: Response) => {
  const { id } = req.params;
  const id_admin = req.usuario.id;

  try {
    const usuario = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1', [id]
    );
    if (usuario.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const nuevoEstado = !usuario.rows[0].activo;
    await pool.query(
      'UPDATE usuarios SET activo = $1 WHERE id_usuario = $2',
      [nuevoEstado, id]
    );

    await getAuditLogService().log({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_admin,
      actor_role: 'ADMIN',
      action: nuevoEstado ? 'ADMIN_UNBLOCK_USER' : 'ADMIN_BLOCK_USER',
      entity_type: 'user',
      entity_id: id,
      payload_resumen: `Usuario ${nuevoEstado ? 'activado' : 'bloqueado'} por admin ${id_admin}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.json({ mensaje: `Usuario ${nuevoEstado ? 'activado' : 'bloqueado'} exitosamente` });

  } catch (error: any) {
    if (error.code === '23503') {
      return res.status(409).json({
        mensaje: 'No se puede modificar este usuario porque tiene registros dependientes',
      });
    }
    res.status(500).json({ error: error.message });
  }
};

export const obtenerPostsAdmin = async (req: any, res: Response) => {
  try {
    const estado = req.query['estado'] as string | undefined;
    const page   = parseInt(req.query['page']  as string) || 1;
    const limit  = parseInt(req.query['limit'] as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = estado ? `WHERE p.estado = $1` : '';
    const params     = estado ? [estado.toUpperCase(), limit, offset] : [limit, offset];
    const limitIdx   = estado ? 2 : 1;

    const result = await pool.query(
      `SELECT p.id_post, p.descripcion, p.url_imagen, p.estado, p.fecha_creacion,
              p.total_likes, p.total_dislikes, u.username, u.email
       FROM posts p JOIN usuarios u ON p.id_usuario = u.id_usuario
       ${conditions}
       ORDER BY p.fecha_creacion DESC
       LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
      params
    );

    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM posts ${estado ? 'WHERE estado = $1' : ''}`,
      estado ? [estado.toUpperCase()] : []
    );

    res.json({ posts: result.rows, total: parseInt(totalRes.rows[0].count), page, limit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const cambiarEstadoPost = async (req: any, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body;
  const id_admin = req.usuario.id;

  const estadosValidos = ['PUBLICADO', 'BLOQUEADO', 'PENDIENTE', 'RECHAZADO'];
  if (!estadosValidos.includes(estado?.toUpperCase())) {
    return res.status(400).json({ mensaje: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` });
  }

  try {
    const result = await pool.query(
      'UPDATE posts SET estado = $1 WHERE id_post = $2 RETURNING *',
      [estado.toUpperCase(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    const accion = estado.toUpperCase() === 'PUBLICADO'  ? 'ADMIN_APPROVE_POST'
                 : estado.toUpperCase() === 'RECHAZADO'  ? 'ADMIN_REJECT_POST'
                 : estado.toUpperCase() === 'BLOQUEADO'  ? 'ADMIN_REJECT_POST'
                 : 'POST_MODERATION';

    await getAuditLogService().log({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_admin,
      actor_role: 'ADMIN',
      action: accion as any,
      entity_type: 'post',
      entity_id: id,
      payload_resumen: `Post ${id} cambiado a estado ${estado.toUpperCase()} por admin ${id_admin}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.json({ mensaje: `Post actualizado a estado ${estado.toUpperCase()}`, post: result.rows[0] });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── HASHTAGS PROHIBIDOS ──────────────────────────────────────────────────────

export const obtenerHashtagsProhibidos = async (req: any, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT hp.id, hp.nombre, hp.fecha_agregado, u.username AS agregado_por_username
       FROM hashtags_prohibidos hp
       LEFT JOIN usuarios u ON hp.agregado_por = u.id_usuario
       ORDER BY hp.fecha_agregado DESC`
    );
    res.json({ hashtags_prohibidos: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const agregarHashtagProhibido = async (req: any, res: Response) => {
  const id_admin = req.usuario.id;
  let nombres: string[] = [];
  if (Array.isArray(req.body.nombres)) {
    nombres = req.body.nombres;
  } else if (req.body.nombre) {
    nombres = [req.body.nombre];
  } else {
    return res.status(400).json({ mensaje: "'nombre' o 'nombres' son obligatorios" });
  }

  const normalizados = nombres
    .map((n: string) => n.toLowerCase().replace(/^#/, '').trim())
    .filter(Boolean);

  const insertados: string[] = [];
  const duplicados: string[] = [];

  try {
    for (const nombre of normalizados) {
      try {
        await pool.query(
          'INSERT INTO hashtags_prohibidos (nombre, agregado_por) VALUES ($1, $2)',
          [nombre, id_admin]
        );
        insertados.push(nombre);
      } catch (e: any) {
        if (e.code === '23505') {
          duplicados.push(nombre);
        } else {
          throw e;
        }
      }
    }

    await getAuditLogService().log({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_admin,
      actor_role: 'ADMIN',
      action: 'ADMIN_UPDATE_BANNED_WORDS',
      entity_type: 'system',
      entity_id: null,
      payload_resumen: `Hashtags prohibidos agregados: ${insertados.join(', ')}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.status(201).json({ mensaje: 'Operación completada', insertados, duplicados });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const eliminarHashtagProhibido = async (req: any, res: Response) => {
  const { id } = req.params;
  const id_admin = req.usuario.id;

  try {
    const result = await pool.query(
      'DELETE FROM hashtags_prohibidos WHERE id = $1 RETURNING nombre',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Hashtag prohibido no encontrado' });
    }

    await getAuditLogService().log({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_admin,
      actor_role: 'ADMIN',
      action: 'ADMIN_UPDATE_BANNED_WORDS',
      entity_type: 'system',
      entity_id: id,
      payload_resumen: `Hashtag prohibido eliminado: ${result.rows[0].nombre}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.json({ mensaje: `Hashtag '${result.rows[0].nombre}' eliminado de la lista prohibida` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Lee desde la lista doblemente enlazada (memoria) con fallback a DB
export const obtenerAuditLogs = async (req: any, res: Response) => {
  try {
    const page     = parseInt(req.query['page']     as string) || 1;
    const pageSize = parseInt(req.query['pageSize'] as string) || 20;

    const filters: Record<string, string> = {};
    if (req.query['action'])        filters['action']        = req.query['action'] as string;
    if (req.query['actor_user_id']) filters['actor_user_id'] = req.query['actor_user_id'] as string;
    if (req.query['result'])        filters['result']        = req.query['result'] as string;

    const resultado = await getAuditLogService().getPaginated(
      page,
      pageSize,
      Object.keys(filters).length > 0 ? (filters as any) : undefined
    );

    res.json(resultado);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ADMIN: eliminar post con cascade
export const eliminarPostAdmin = async (req: any, res: Response) => {
  const { id_post } = req.params;
  const id_admin = req.usuario.id;

  try {
    const post = await pool.query('SELECT id_post FROM posts WHERE id_post = $1', [id_post]);
    if (post.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    await pool.query('DELETE FROM comentarios    WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM votos          WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM post_hashtags  WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM posts          WHERE id_post = $1', [id_post]);

    await getAuditLogService().log({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_admin,
      actor_role: 'ADMIN',
      action: 'ADMIN_DELETE_POST',
      entity_type: 'post',
      entity_id: id_post,
      payload_resumen: `Post ${id_post} eliminado en cascade por admin ${id_admin}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.json({ mensaje: 'Post eliminado correctamente (cascade admin)' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
