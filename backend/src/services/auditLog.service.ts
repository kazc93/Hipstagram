// backend/src/services/auditLog.service.ts

import { Pool } from 'pg';
import { DoublyLinkedList } from '../data-structures/DoublyLinkedList';
import { randomUUID } from 'crypto';


// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAIL'
  | 'REGISTER'
  | 'LOGOUT'
  | 'POST_CREATE'
  | 'POST_DELETE'
  | 'POST_MODERATION'
  | 'VOTE_LIKE'
  | 'VOTE_DISLIKE'
  | 'VOTE_CHANGE'
  | 'COMMENT_CREATE'
  | 'COMMENT_DELETE'
  | 'ADMIN_BLOCK_USER'
  | 'ADMIN_UNBLOCK_USER'
  | 'ADMIN_APPROVE_POST'
  | 'ADMIN_REJECT_POST'
  | 'ADMIN_DELETE_POST'
  | 'ADMIN_UPDATE_BANNED_WORDS';

export type AuditResult = 'SUCCESS' | 'FAIL' | 'BLOCKED' | 'APPROVED';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  request_id: string;
  actor_user_id: string | null;
  actor_role: 'USER' | 'ADMIN' | 'SYSTEM';
  action: AuditAction;
  entity_type: 'user' | 'post' | 'comment' | 'vote' | 'system';
  entity_id: string | null;
  payload_resumen: string;
  result: AuditResult;
  ip_origen: string | null;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

class AuditLogService {
  // Lista doblemente enlazada en memoria (acceso O(1) al tail para appends)
  private list = new DoublyLinkedList<AuditEvent>();

  // Límite de eventos en memoria para no saturar el proceso
  private readonly MAX_IN_MEMORY = 500;

  constructor(private db: Pool) {}

  /**
   * Registra un evento de auditoría.
   * Guarda en la lista en memoria Y persiste en la base de datos.
   */
  async log(params: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const event: AuditEvent = {
        id: randomUUID(),
      timestamp: new Date(),
      ...params,
    };

    // 1. Agregar al final de la lista doblemente enlazada
    this.list.append(event);

    // 2. Si supera el límite en memoria, eliminar el nodo más antiguo (head)
    if (this.list.size > this.MAX_IN_MEMORY) {
      const head = this.list.getHead();
      if (head) this.list.remove(head);
    }

    // 3. Persistir en base de datos (no bloquea — fire and forget con manejo de error)
    this.persist(event).catch((err) => {
      console.error('[AuditLog] Error persistiendo evento:', err.message);
    });
  }

  /**
   * Persiste el evento en la tabla audit_logs de PostgreSQL.
   */
  private async persist(event: AuditEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs
        (timestamp, actor_user_id, actor_role,
         action, entity_type, entity_id, resultado, ip_origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.timestamp,
        event.actor_user_id,
        event.actor_role,
        event.action,
        event.entity_type,
        event.entity_id,
        event.result,
        event.ip_origen,
      ]
    );
  }

  /**
   * Devuelve eventos paginados desde memoria (más recientes primero).
   * Si se piden páginas muy antiguas que ya no están en memoria, cae a DB.
   */
  async getPaginated(
    page: number,
    pageSize: number,
    filters?: { action?: AuditAction; actor_user_id?: string; result?: AuditResult }
  ): Promise<{ data: AuditEvent[]; total: number; totalPages: number }> {
    // Si hay filtros, consultar directamente la DB para exactitud
    if (filters && Object.keys(filters).length > 0) {
      return this.getPaginatedFromDB(page, pageSize, filters);
    }

    // Sin filtros: servir desde la lista en memoria
    const paginated = this.list.paginate(page, pageSize);

    // Si la página pedida está vacía pero existe en DB, caer a DB
    if (paginated.data.length === 0 && page > 1) {
      return this.getPaginatedFromDB(page, pageSize, filters);
    }

    return paginated;
  }

  /**
   * Consulta la base de datos directamente.
   * Se usa para filtros o páginas antiguas no disponibles en memoria.
   */
  private async getPaginatedFromDB(
    page: number,
    pageSize: number,
    filters?: { action?: AuditAction; actor_user_id?: string; result?: AuditResult }
  ): Promise<{ data: AuditEvent[]; total: number; totalPages: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.action) {
      conditions.push(`action = $${idx++}`);
      values.push(filters.action);
    }
    if (filters?.actor_user_id) {
      conditions.push(`actor_user_id = $${idx++}`);
      values.push(filters.actor_user_id);
    }
    if (filters?.result) {
      conditions.push(`result = $${idx++}`);
      values.push(filters.result);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(
      `SELECT COUNT(*) FROM audit_logs ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const offset = (page - 1) * pageSize;
    const dataRes = await this.db.query(
      `SELECT a.*, u.username, resultado as result 
       FROM audit_logs a
       LEFT JOIN usuarios u ON a.actor_user_id = u.id_usuario
       ${where}
       ORDER BY a.timestamp DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset]
    );

    return {
      data: dataRes.rows as AuditEvent[],
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Recarga los eventos más recientes desde la DB al iniciar el servidor.
   * Evita que la lista esté vacía en el primer arranque.
   */
  async loadRecentFromDB(): Promise<void> {
    try {
      const res = await this.db.query(
        `SELECT * FROM audit_logs
         ORDER BY timestamp DESC
         LIMIT $1`,
        [this.MAX_IN_MEMORY]
      );
      // Cargar en orden cronológico (más antiguo primero = append al tail)
      const rows = (res.rows as AuditEvent[]).reverse();
      rows.forEach((row) => this.list.append(row));
      console.log(`[AuditLog] ${rows.length} eventos cargados en memoria desde DB`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AuditLog] No se pudo cargar eventos desde DB:', message);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// Se inicializa con el pool de conexión en index.ts / db.ts

let _instance: AuditLogService | null = null;

export function initAuditLogService(db: Pool): AuditLogService {
  _instance = new AuditLogService(db);
  return _instance;
}

export function getAuditLogService(): AuditLogService {
  if (!_instance) {
    throw new Error('AuditLogService no inicializado. Llama a initAuditLogService(db) primero.');
  }
  return _instance;
}
