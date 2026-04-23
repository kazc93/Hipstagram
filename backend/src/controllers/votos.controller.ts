// Controller de votos — maneja like/dislike con lógica de toggle y cambio de reacción
import { Response } from 'express';
import { pool } from '../db';
import { getAuditLogService } from '../services/auditLog.service';
import { randomUUID } from 'crypto';

export const votar = async (req: any, res: Response) => {
  const { id_post } = req.params;
  const { tipo } = req.body;           // 'like' o 'dislike'
  const id_usuario = req.usuario.id;   // viene del JWT validado por verificarToken
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();

  if (!['like', 'dislike'].includes(tipo)) {
    return res.status(400).json({ mensaje: 'Tipo de voto inválido. Use like o dislike' });
  }

  try {
    // Toda la operación de voto dentro de una transacción para mantener consistencia
    await pool.query('BEGIN');

    const post = await pool.query('SELECT * FROM posts WHERE id_post = $1', [id_post]);
    if (post.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ mensaje: 'Post no encontrado' });
    }

    // Verificar si el usuario ya votó en este post (UNIQUE constraint en DB)
    const votoExistente = await pool.query(
      'SELECT * FROM votos WHERE id_usuario = $1 AND id_post = $2',
      [id_usuario, id_post]
    );

    if (votoExistente.rows.length === 0) {
      // CASO 1: Voto nuevo — insertar y sumar al contador del post
      await pool.query(
        'INSERT INTO votos (id_usuario, id_post, tipo) VALUES ($1, $2, $3)',
        [id_usuario, id_post, tipo]
      );
      const campo = tipo === 'like' ? 'total_likes' : 'total_dislikes';
      await pool.query(
        `UPDATE posts SET ${campo} = ${campo} + 1 WHERE id_post = $1`,
        [id_post]
      );
      await pool.query('COMMIT');

      await getAuditLogService().log({
        request_id: requestId,
        actor_user_id: id_usuario,
        actor_role: 'USER',
        action: tipo === 'like' ? 'VOTE_LIKE' : 'VOTE_DISLIKE',
        entity_type: 'vote',
        entity_id: id_post,
        payload_resumen: `Usuario ${id_usuario} dio ${tipo} al post ${id_post}`,
        result: 'SUCCESS',
        ip_origen: req.ip ?? null,
      });

      return res.json({ mensaje: `${tipo} registrado exitosamente` });

    } else {
      const votoActual = votoExistente.rows[0].tipo;

      if (votoActual === tipo) {
        // CASO 2: Mismo voto — cancelar (toggle: volver a hacer clic quita el voto)
        await pool.query(
          'DELETE FROM votos WHERE id_usuario = $1 AND id_post = $2',
          [id_usuario, id_post]
        );
        const campo = tipo === 'like' ? 'total_likes' : 'total_dislikes';
        await pool.query(
          `UPDATE posts SET ${campo} = ${campo} - 1 WHERE id_post = $1`,
          [id_post]
        );
        await pool.query('COMMIT');

        await getAuditLogService().log({
          request_id: requestId,
          actor_user_id: id_usuario,
          actor_role: 'USER',
          action: tipo === 'like' ? 'VOTE_LIKE' : 'VOTE_DISLIKE',
          entity_type: 'vote',
          entity_id: id_post,
          payload_resumen: `Usuario ${id_usuario} canceló su ${tipo} en post ${id_post}`,
          result: 'SUCCESS',
          ip_origen: req.ip ?? null,
        });

        return res.json({ mensaje: `${tipo} cancelado` });

      } else {
        // CASO 3: Voto diferente — cambiar reacción, ajustar ambos contadores
        await pool.query(
          'UPDATE votos SET tipo = $1 WHERE id_usuario = $2 AND id_post = $3',
          [tipo, id_usuario, id_post]
        );
        const campoSumar  = tipo === 'like' ? 'total_likes'   : 'total_dislikes';
        const campoRestar = tipo === 'like' ? 'total_dislikes' : 'total_likes';
        await pool.query(
          `UPDATE posts SET ${campoSumar} = ${campoSumar} + 1, ${campoRestar} = ${campoRestar} - 1 WHERE id_post = $1`,
          [id_post]
        );
        await pool.query('COMMIT');

        await getAuditLogService().log({
          request_id: requestId,
          actor_user_id: id_usuario,
          actor_role: 'USER',
          action: 'VOTE_CHANGE',
          entity_type: 'vote',
          entity_id: id_post,
          payload_resumen: `Usuario ${id_usuario} cambió voto de ${votoActual} a ${tipo} en post ${id_post}`,
          result: 'SUCCESS',
          ip_origen: req.ip ?? null,
        });

        return res.json({ mensaje: `Voto cambiado a ${tipo}` });
      }
    }

  } catch (error: any) {
    await pool.query('ROLLBACK'); // revertir todo si algo falla
    console.error('Error al votar:', error.message);
    res.status(500).json({ error: error.message });
  }
};
