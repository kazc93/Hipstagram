import { Response } from 'express';
import { pool } from '../db';

const POST_FIELDS = `
  p.id_post, p.descripcion, p.url_imagen,
  p.total_likes, p.total_dislikes, p.fecha_creacion,
  u.username, u.nombre_completo,
  COALESCE(array_agg(h.nombre) FILTER (WHERE h.nombre IS NOT NULL), '{}') as hashtags
`;

const paginationParams = (req: any) => {
  const page  = Math.max(1, parseInt(req.query['page'] as string) || 1);
  const limit = Math.min(20, parseInt(req.query['limit'] as string) || 10);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

// BÚSQUEDA POR HASHTAG — con paginación
export const buscarPorHashtag = async (req: any, res: Response) => {
  const { tag } = req.query;
  if (!tag) return res.status(400).json({ mensaje: 'Debes proporcionar un hashtag' });

  const { page, limit, offset } = paginationParams(req);
  const tagClean = tag.toString().replace('#', '').trim();

  try {
    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT p.id_post)
       FROM posts p
       JOIN post_hashtags ph ON p.id_post = ph.id_post
       JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE h.nombre ILIKE $1 AND p.estado = 'PUBLICADO'`,
      [tagClean]
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT ${POST_FIELDS}
       FROM posts p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       JOIN post_hashtags ph ON p.id_post = ph.id_post
       JOIN hashtags h2 ON ph.id_hashtag = h2.id_hashtag
       LEFT JOIN post_hashtags ph2 ON p.id_post = ph2.id_post
       LEFT JOIN hashtags h ON ph2.id_hashtag = h.id_hashtag
       WHERE h2.nombre ILIKE $1 AND p.estado = 'PUBLICADO'
       GROUP BY p.id_post, u.username, u.nombre_completo
       ORDER BY p.total_likes DESC, p.fecha_creacion DESC
       LIMIT $2 OFFSET $3`,
      [tagClean, limit, offset]
    );

    res.json({ posts: result.rows, page, totalPages: Math.ceil(total / limit), total });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// BÚSQUEDA GENERAL — con paginación
export const buscarGeneral = async (req: any, res: Response) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ mensaje: 'Debes proporcionar un término de búsqueda' });

  const { page, limit, offset } = paginationParams(req);
  const termino = `%${q}%`;

  try {
    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT p.id_post)
       FROM posts p
       LEFT JOIN post_hashtags ph ON p.id_post = ph.id_post
       LEFT JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE (p.descripcion ILIKE $1 OR h.nombre ILIKE $1) AND p.estado = 'PUBLICADO'`,
      [termino]
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT ${POST_FIELDS}
       FROM posts p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       LEFT JOIN post_hashtags ph ON p.id_post = ph.id_post
       LEFT JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE (p.descripcion ILIKE $1 OR h.nombre ILIKE $1) AND p.estado = 'PUBLICADO'
       GROUP BY p.id_post, u.username, u.nombre_completo
       ORDER BY p.total_likes DESC, p.fecha_creacion DESC
       LIMIT $2 OFFSET $3`,
      [termino, limit, offset]
    );

    res.json({ posts: result.rows, page, totalPages: Math.ceil(total / limit), total });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// EXPLORAR — top posts por likes (sin filtro de búsqueda)
export const explorar = async (req: any, res: Response) => {
  const { page, limit, offset } = paginationParams(req);

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM posts WHERE estado = 'PUBLICADO' AND total_likes > 0`
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT ${POST_FIELDS}
       FROM posts p
       JOIN usuarios u ON p.id_usuario = u.id_usuario
       LEFT JOIN post_hashtags ph ON p.id_post = ph.id_post
       LEFT JOIN hashtags h ON ph.id_hashtag = h.id_hashtag
       WHERE p.estado = 'PUBLICADO' AND p.total_likes > 0
       GROUP BY p.id_post, u.username, u.nombre_completo
       ORDER BY p.total_likes DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ posts: result.rows, page, totalPages: Math.ceil(total / limit), total });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
