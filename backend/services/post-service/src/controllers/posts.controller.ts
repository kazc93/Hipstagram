// Controller de posts — maneja creación, eliminación, feed y consulta de publicaciones
import { Response } from 'express';
import { pool } from '../db';
import { auditLog } from '../services/auditLog.service';
import { randomUUID } from 'crypto';

// CREAR POST — usa transacción + SAVEPOINT para proteger la inserción de hashtags
export const crearPost = async (req: any, res: Response) => {
  const id_usuario = req.usuario.id;
  const { descripcion } = req.body;
  const url_imagen = (req.file as any)?.location ?? null;
  let hashtags: string[] = [];

  if (typeof req.body.hashtags === 'string') {
    try {
      const parsed = JSON.parse(req.body.hashtags);
      if (Array.isArray(parsed)) {
        hashtags = parsed;
      }
    } catch {
      hashtags = req.body.hashtags
        .split(/[,\s]+/)
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
    }
  } else if (Array.isArray(req.body.hashtags)) {
    hashtags = req.body.hashtags;
  }

  if (descripcion && descripcion.length > 128) {
    return res.status(400).json({ mensaje: 'La descripción no puede superar 128 caracteres' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hashtagsNormalizados = hashtags.map(t => t.toLowerCase().replace('#', '').trim()).filter(Boolean);
    let hashtagsBloqueados: string[] = [];

    if (hashtagsNormalizados.length > 0) {
      const prohibidosRes = await client.query(
        `SELECT nombre FROM hashtags_prohibidos WHERE nombre = ANY($1)`,
        [hashtagsNormalizados]
      );
      hashtagsBloqueados = prohibidosRes.rows.map((r: any) => r.nombre);
    }

    const estadoInicial = hashtagsBloqueados.length > 0 ? 'BLOQUEADO' : 'PUBLICADO';

    const resultPost = await client.query(
      `INSERT INTO posts (id_usuario, descripcion, url_imagen, estado)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id_usuario, descripcion, url_imagen, estadoInicial]
    );
    const post = resultPost.rows[0];

    await client.query('SAVEPOINT sp_hashtags');

    try {
      if (hashtagsNormalizados.length > 0) {
        for (const nombre of hashtagsNormalizados) {
          const resultHashtag = await client.query(
            `INSERT INTO hashtags (nombre)
             VALUES ($1)
             ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
             RETURNING id_hashtag`,
            [nombre]
          );
          const id_hashtag = resultHashtag.rows[0].id_hashtag;

          await client.query(
            'INSERT INTO post_hashtags (id_post, id_hashtag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [post.id_post, id_hashtag]
          );
        }
      }
    } catch (hashtagError: any) {
      await client.query('ROLLBACK TO SAVEPOINT sp_hashtags');
      console.warn('[Posts] Hashtags revertidos por error:', hashtagError.message);
    }

    await client.query('COMMIT');

    const reqId = (req.headers['x-request-id'] as string) ?? randomUUID();

    await auditLog({
      request_id: reqId,
      actor_user_id: id_usuario,
      actor_role: 'USER',
      action: 'POST_CREATE',
      entity_type: 'post',
      entity_id: post.id_post,
      payload_resumen: `Post creado por usuario ${id_usuario}. Hashtags: ${hashtagsNormalizados.join(', ') || 'ninguno'}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    await auditLog({
      request_id: reqId,
      actor_user_id: id_usuario,
      actor_role: 'SYSTEM',
      action: 'POST_MODERATION',
      entity_type: 'post',
      entity_id: post.id_post,
      payload_resumen: hashtagsBloqueados.length > 0
        ? `Post BLOQUEADO por hashtags prohibidos: ${hashtagsBloqueados.join(', ')}`
        : 'Post aprobado automáticamente — sin hashtags prohibidos',
      result: hashtagsBloqueados.length > 0 ? 'BLOCKED' : 'APPROVED',
      ip_origen: req.ip ?? null,
    });

    const mensaje = hashtagsBloqueados.length > 0
      ? `Post creado pero bloqueado por hashtags prohibidos: ${hashtagsBloqueados.join(', ')}`
      : 'Post creado exitosamente';

    res.status(201).json({ mensaje, post });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error al crear post:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// ELIMINAR POST
export const eliminarPost = async (req: any, res: Response) => {
  const { id_post } = req.params;
  const id_usuario = req.usuario.id;

  try {
    const post = await pool.query('SELECT * FROM posts WHERE id_post = $1', [id_post]);

    if (post.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    if (post.rows[0].id_usuario !== id_usuario) {
      return res.status(403).json({ mensaje: 'No puedes eliminar este post' });
    }

    const deps = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM votos       WHERE id_post = $1)::int AS total_votos,
        (SELECT COUNT(*) FROM comentarios WHERE id_post = $1)::int AS total_comentarios`,
      [id_post]
    );
    const { total_votos, total_comentarios } = deps.rows[0];
    if (total_votos > 0 || total_comentarios > 0) {
      return res.status(409).json({
        mensaje: `No se puede eliminar: la publicación tiene ${total_votos} voto(s) y ${total_comentarios} comentario(s). Contacta a un administrador.`,
        total_votos,
        total_comentarios,
      });
    }

    await pool.query('DELETE FROM post_hashtags WHERE id_post = $1', [id_post]);
    await pool.query('DELETE FROM posts          WHERE id_post = $1', [id_post]);

    await auditLog({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: id_usuario,
      actor_role: 'USER',
      action: 'POST_DELETE',
      entity_type: 'post',
      entity_id: id_post,
      payload_resumen: `Post ${id_post} eliminado por su autor ${id_usuario}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    res.json({ mensaje: 'Post eliminado exitosamente' });

  } catch (error: any) {
    console.error('Error al eliminar post:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// OBTENER FEED — ordenado por likes DESC, con paginación
export const obtenerFeed = async (req: any, res: Response) => {
  const page  = Math.max(1, parseInt(req.query['page'] as string) || 1);
  const limit = Math.min(20, parseInt(req.query['limit'] as string) || 10);
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM posts WHERE estado = 'PUBLICADO'`
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / limit);

    const result = await pool.query(
      `SELECT
        p.id_post, p.descripcion, p.url_imagen,
        p.total_likes, p.total_dislikes, p.fecha_creacion,
        u.username, u.nombre_completo,
        COALESCE(array_agg(h.nombre) FILTER (WHERE h.nombre IS NOT NULL), '{}') as hashtags
       FROM posts p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       LEFT JOIN post_hashtags ph ON p.id_post = ph.id_post
       LEFT JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE p.estado = 'PUBLICADO'
       GROUP BY p.id_post, u.username, u.nombre_completo
       ORDER BY p.total_likes DESC, p.fecha_creacion DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ posts: result.rows, page, totalPages, total });
  } catch (error: any) {
    console.error('Error al obtener feed:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// OBTENER POSTS DEL USUARIO AUTENTICADO
export const obtenerMisPosts = async (req: any, res: Response) => {
  const id_usuario = req.usuario.id;

  try {
    const result = await pool.query(
      `SELECT
        p.id_post, p.descripcion, p.url_imagen, p.estado,
        p.total_likes, p.total_dislikes, p.fecha_creacion,
        COALESCE(array_agg(h.nombre) FILTER (WHERE h.nombre IS NOT NULL), '{}') as hashtags
       FROM posts p
       LEFT JOIN post_hashtags ph ON p.id_post = ph.id_post
       LEFT JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE p.id_usuario = $1
       GROUP BY p.id_post
       ORDER BY p.fecha_creacion DESC`,
      [id_usuario]
    );

    res.json({ posts: result.rows });
  } catch (error: any) {
    console.error('Error al obtener mis posts:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// OBTENER POST INDIVIDUAL
export const obtenerPost = async (req: any, res: Response) => {
  const { id_post } = req.params;
  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.nombre_completo,
              COALESCE(array_agg(h.nombre) FILTER (WHERE h.nombre IS NOT NULL), '{}') as hashtags
       FROM posts p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       LEFT JOIN post_hashtags ph ON p.id_post = ph.id_post
       LEFT JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE p.id_post = $1
       GROUP BY p.id_post, u.username, u.nombre_completo`,
      [id_post]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }
    res.json({ post: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
