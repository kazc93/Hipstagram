// Servicio de auditoría simplificado para post-service (persiste directo a DB)
import { pool } from '../db';

export async function auditLog(params: {
  request_id: string;
  actor_user_id: any;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: any;
  payload_resumen: string;
  result: string;
  ip_origen: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs
        (timestamp, request_id, actor_user_id, actor_role,
         action, entity_type, entity_id, payload_resumen, resultado, ip_origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        new Date(),
        params.request_id,
        params.actor_user_id,
        params.actor_role,
        params.action,
        params.entity_type,
        params.entity_id,
        params.payload_resumen,
        params.result,
        params.ip_origen,
      ]
    );
  } catch (err: any) {
    console.error('[AuditLog] Error persistiendo:', err.message);
  }
}
