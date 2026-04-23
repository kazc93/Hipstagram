import { Response } from 'express';
import { pool } from '../db';
import { getAuditLogService } from '../services/auditLog.service';
import { randomUUID } from 'crypto';

// Este código sirve para obtener la lista completa de todos los usuarios registrados en el sistema, ordenados desde el más reciente.
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

// Este código sirve para bloquear o desbloquear a un usuario específico y guardar el registro de qué administrador hizo esta acción.
export const bloquearUsuario = async (req: any, res: Response) => {
  const { id } = req.params;
  const id_admin = req.usuario.id;

  try {
    // Este código sirve para verificar si el usuario existe antes de intentar cambiar su estado.
    const usuario = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1', [id]
    );
    if (usuario.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // Este código sirve para invertir el estado actual del usuario (si está activo lo inactiva, y viceversa) en la base de datos.
    const nuevoEstado = !usuario.rows[0].activo;
    await pool.query(
      'UPDATE usuarios SET activo = $1 WHERE id_usuario = $2',
      [nuevoEstado, id]
    );

    // Registrar en la lista doblemente enlazada + DB
    // Este código sirve para guardar el registro de auditoría de la acción de bloquear/desbloquear en el sistema.
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
    // Este código atrapa el error cuando se intenta modificar un usuario que está amarrado a otros datos importantes.
    if (error.code === '23503') {
      return res.status(409).json({
        mensaje: 'No se puede modificar este usuario porque tiene registros dependientes',
      });
    }
    res.status(500).json({ error: error.message });
  }
};

// Este código sirve para que el administrador pueda ver todos los posts, con paginación y la opción de filtrarlos por su estado.
export const obtenerPostsAdmin = async (req: any, res: Response) => {
  try {
    // Filtro opcional por estado: PENDIENTE | PUBLICADO | BLOQUEADO | RECHAZADO
    // Este código configura las variables necesarias para hacer la paginación de los posts.
    const estado = req.query['estado'] as string | undefined;
    const page   = parseInt(req.query['page']     as string) || 1;
    const limit  = parseInt(req.query['limit']    as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = estado ? `WHERE p.estado = $1` : '';
    const params     = estado ? [estado.toUpperCase(), limit, offset] : [limit, offset];
    const limitIdx   = estado ? 2 : 1;

    // Este código sirve para traer los posts de la base de datos uniendo la información con los datos del usuario que lo publicó.
    const result = await pool.query(
      `SELECT p.id_post, p.descripcion, p.url_imagen, p.estado, p.fecha_creacion,
              p.total_likes, p.total_dislikes, u.username, u.email
       FROM posts p JOIN usuarios u ON p.id_usuario = u.id_usuario
       ${conditions}
       ORDER BY p.fecha_creacion DESC
       LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
      params
    );

    // Este código sirve para contar el total de posts que existen y saber cuántas páginas habrá en total.
    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM posts ${estado ? 'WHERE estado = $1' : ''}`,
      estado ? [estado.toUpperCase()] : []
    );

    res.json({ posts: result.rows, total: parseInt(totalRes.rows[0].count), page, limit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Este código sirve para que el administrador pueda aprobar, rechazar o bloquear un post específico.
export const cambiarEstadoPost = async (req: any, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body;
  const id_admin = req.usuario.id;

  // PUBLICADO = aprobado, RECHAZADO = rechazado, BLOQUEADO = bloqueado, PENDIENTE = volver a revisión
  // Este código sirve para validar que el estado que se quiere aplicar sea uno de los permitidos por el sistema.
  const estadosValidos = ['PUBLICADO', 'BLOQUEADO', 'PENDIENTE', 'RECHAZADO'];
  if (!estadosValidos.includes(estado?.toUpperCase())) {
    return res.status(400).json({ mensaje: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` });
  }

  try {
    // Este código sirve para actualizar el estado del post en la base de datos y devolver los datos actualizados.
    const result = await pool.query(
      'UPDATE posts SET estado = $1 WHERE id_post = $2 RETURNING *',
      [estado.toUpperCase(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    // Este código sirve para clasificar qué tipo de acción se hizo para guardarlo correctamente en el registro de auditoría.
    const accion = estado.toUpperCase() === 'PUBLICADO'  ? 'ADMIN_APPROVE_POST'
                 : estado.toUpperCase() === 'RECHAZADO'  ? 'ADMIN_REJECT_POST'
                 : estado.toUpperCase() === 'BLOQUEADO'  ? 'ADMIN_REJECT_POST'
                 : 'POST_MODERATION';

    // Este código registra en el sistema de auditoría el cambio de estado del post.
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

// Este código sirve para obtener la lista de todas las palabras o hashtags que no se pueden usar en la aplicación.
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

// Este código sirve para agregar uno o varios hashtags a la lista de prohibidos al mismo tiempo.
export const agregarHashtagProhibido = async (req: any, res: Response) => {
  const id_admin = req.usuario.id;
  // Acepta { nombre: string } o { nombres: string[] } para carga masiva
  // Este código sirve para preparar la información, verificando si se mandó un solo nombre o una lista de nombres.
  let nombres: string[] = [];
  if (Array.isArray(req.body.nombres)) {
    nombres = req.body.nombres;
  } else if (req.body.nombre) {
    nombres = [req.body.nombre];
  } else {
    return res.status(400).json({ mensaje: "'nombre' o 'nombres' son obligatorios" });
  }

  // Este código sirve para limpiar las palabras, quitando espacios, pasando a minúsculas y quitando el símbolo de hashtag si lo trae.
  const normalizados = nombres
    .map((n: string) => n.toLowerCase().replace(/^#/, '').trim())
    .filter(Boolean);

  const insertados: string[] = [];
  const duplicados: string[] = [];

  try {
    // Este código sirve para recorrer cada palabra limpia y tratar de guardarla en la base de datos; si ya existe, la marca como duplicada.
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

    // Este código sirve para dejar registro de que el administrador actualizó la lista de palabras prohibidas.
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

// Este código sirve para borrar de forma permanente un hashtag de la lista de prohibidos.
export const eliminarHashtagProhibido = async (req: any, res: Response) => {
  const { id } = req.params;
  const id_admin = req.usuario.id;

  try {
    // Este código sirve para eliminar el registro de la base de datos y devolver el nombre del hashtag que se borró.
    const result = await pool.query(
      'DELETE FROM hashtags_prohibidos WHERE id = $1 RETURNING nombre',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Hashtag prohibido no encontrado' });
    }

    // Este código sirve para registrar qué administrador eliminó el hashtag prohibido.
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
// Este código sirve para consultar el historial de auditoría de todas las acciones importantes que han pasado en el sistema.
export const obtenerAuditLogs = async (req: any, res: Response) => {
  try {
    const page     = parseInt(req.query['page']     as string) || 1;
    const pageSize = parseInt(req.query['pageSize'] as string) || 20;

    // Filtros opcionales desde query params
    // Este código sirve para atrapar los parámetros de búsqueda si el administrador quiere filtrar por acción, usuario o resultado.
    const filters: Record<string, string> = {};
    if (req.query['action'])        filters['action']        = req.query['action'] as string;
    if (req.query['actor_user_id']) filters['actor_user_id'] = req.query['actor_user_id'] as string;
    if (req.query['result'])        filters['result']        = req.query['result'] as string;

    // Este código ejecuta la búsqueda de los registros usando el servicio de auditoría, aplicando la paginación y los filtros.
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

// ADMIN: eliminar post con cascade (ignora FK, borra dependencias primero)
// Este código sirve para que el administrador pueda eliminar un post completo junto con todos sus comentarios, likes y hashtags amarrados.
export const eliminarPostAdmin = async (req: any, res: Response) => {
  const { id_post } = req.params;
  const id_admin = req.usuario.id;

  try {
    const post = await pool.query('SELECT id_post FROM posts WHERE id_post = $1', [id_post]);
    if (post.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    // Este código sirve para borrar primero los datos dependientes (comentarios, votos, hashtags) para que la base de datos permita borrar el post principal sin errores de llaves foráneas.
    await pool.query('DELETE FROM comentarios    WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM votos          WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM post_hashtags  WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM posts          WHERE id_post = $1', [id_post]);

    // Este código registra que el administrador ejecutó una eliminación total en cascada de un post.
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