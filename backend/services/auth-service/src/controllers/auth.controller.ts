// Controller de autenticación — Este código sirve para gestionar el acceso, registro y seguridad de los usuarios.

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { randomUUID } from 'crypto';

// ─── Audit log simplificado (directo a DB, sin lista enlazada) ───────────────
async function auditLog(params: {
  request_id: string;
  actor_user_id: any;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: any;
  payload_resumen: string;
  result: string;
  ip_origen: string | null;
}) {
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

// Este código sirve para realizar el registro de nuevos usuarios en la plataforma y asegurar su información.
export const registro = async (req: Request, res: Response) => {
  try {
    const { username, email, password, nombre_completo } = req.body;

    // Este código sirve para encriptar la contraseña del usuario para que no sea visible en la base de datos.
    const passwordHash = await bcrypt.hash(password, 10);

    // Este código sirve para insertar la información del nuevo perfil en las tablas correspondientes de la DB.
    const query = `
      INSERT INTO usuarios (username, email, password, nombre_completo)
      VALUES ($1, $2, $3, $4) RETURNING *
    `;
    const result = await pool.query(query, [username, email, passwordHash, nombre_completo]);
    const nuevoUsuario = result.rows[0];

    // Este código sirve para reportar la creación de la cuenta al sistema de auditoría general.
    await auditLog({
      request_id: (req.headers['x-request-id'] as string) ?? randomUUID(),
      actor_user_id: nuevoUsuario.id_usuario,
      actor_role: 'USER',
      action: 'REGISTER',
      entity_type: 'user',
      entity_id: nuevoUsuario.id_usuario,
      payload_resumen: `Nuevo registro: ${username}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    console.log('Usuario registrado con exito:', username);
    // Este código sirve para devolver la respuesta al frontend omitiendo datos sensibles por seguridad.
    const { password: _, ...usuarioSinPass } = nuevoUsuario;
    res.status(201).json(usuarioSinPass);

  } catch (error: any) {
    console.error('Error en registro:', error.message);
    // Este código sirve para manejar errores cuando el nombre de usuario o correo ya existen en el sistema.
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El username o email ya está en uso' });
    }
    res.status(500).json({ error: error.message });
  }
};

// Este código sirve para renovar el permiso de acceso del usuario de forma automática cuando el token principal expira.
export const refreshToken = async (req: Request, res: Response): Promise<any> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ mensaje: 'Refresh token requerido' });
  }
  try {
    // Este código sirve para verificar si el código de renovación sigue siendo válido y no ha caducado.
    const decoded = jwt.verify(
      refreshToken,
      process.env['JWT_REFRESH_SECRET'] || 'refresh_clave_secreta'
    ) as any;

    // Este código sirve para confirmar en la base de datos que el usuario no ha sido bloqueado antes de darle nuevo acceso.
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND activo = TRUE',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Usuario no encontrado o inactivo' });
    }

    const usuario = result.rows[0];
    // Este código sirve para generar un nuevo pase de acceso (Token) con los permisos actualizados del usuario.
    const newToken = jwt.sign(
      { id: usuario.id_usuario, username: usuario.username, rol: usuario.id_rol === 1 ? 'ADMIN' : 'USER' },
      process.env['JWT_SECRET'] || 'tu_clave_secreta_aqui',
      { expiresIn: '24h' }
    );

    res.json({ token: newToken });
  } catch {
    return res.status(401).json({ mensaje: 'Refresh token inválido o expirado' });
  }
};

// Este código sirve para validar las credenciales de entrada y otorgar los tokens de seguridad necesarios para navegar.
export const login = async (req: Request, res: Response): Promise<any> => {
  const { username, password } = req.body;
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();

  try {
    console.log('Intento de login para:', username);

    // Este código sirve para buscar al usuario en la base de datos utilizando ya sea su nombre o su correo electrónico.
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 OR email = $1',
      [username]
    );

    // Este código sirve para reportar al sistema de auditoría si alguien intenta entrar con un usuario que no existe.
    if (result.rows.length === 0) {
      await auditLog({
        request_id: requestId,
        actor_user_id: null,
        actor_role: 'SYSTEM',
        action: 'LOGIN_FAIL',
        entity_type: 'user',
        entity_id: null,
        payload_resumen: `Login fallido — usuario no encontrado: ${username}`,
        result: 'FAIL',
        ip_origen: req.ip ?? null,
      });
      return res.status(401).json({ mensaje: 'Usuario o clave incorrectos' });
    }

    const usuario = result.rows[0];

    // Este código sirve para comparar la contraseña que escribió el usuario contra la que tenemos guardada encriptada.
    const passwordValida = await bcrypt.compare(password, usuario.password);

    // Este código sirve para registrar en la auditoría cuando un usuario ingresa una contraseña equivocada.
    if (!passwordValida) {
      await auditLog({
        request_id: requestId,
        actor_user_id: usuario.id_usuario,
        actor_role: 'USER',
        action: 'LOGIN_FAIL',
        entity_type: 'user',
        entity_id: usuario.id_usuario,
        payload_resumen: `Login fallido — contraseña incorrecta para: ${username}`,
        result: 'FAIL',
        ip_origen: req.ip ?? null,
      });
      return res.status(401).json({ mensaje: 'Usuario o clave incorrectos' });
    }

    // Este código sirve para generar el token de acceso principal que identifica al usuario y su rol (Admin o Usuario).
    const token = jwt.sign(
      {
        id: usuario.id_usuario,
        username: usuario.username,
        rol: usuario.id_rol === 1 ? 'ADMIN' : 'USER'
      },
      process.env['JWT_SECRET'] || 'tu_clave_secreta_aqui',
      { expiresIn: '24h' }
    );

    // Este código sirve para dejar constancia en los logs de que el usuario entró al sistema exitosamente.
    await auditLog({
      request_id: requestId,
      actor_user_id: usuario.id_usuario,
      actor_role: 'USER',
      action: 'LOGIN_SUCCESS',
      entity_type: 'user',
      entity_id: usuario.id_usuario,
      payload_resumen: `Login exitoso: ${username}`,
      result: 'SUCCESS',
      ip_origen: req.ip ?? null,
    });

    // Este código sirve para crear un token de respaldo de larga duración para mantener la sesión iniciada.
    const refreshTokenValue = jwt.sign(
      { id: usuario.id_usuario },
      process.env['JWT_REFRESH_SECRET'] || 'refresh_clave_secreta',
      { expiresIn: '7d' }
    );

    console.log('Login exitoso para:', username);

    // Este código sirve para enviar toda la información de sesión necesaria hacia la aplicación cliente (Frontend).
    res.json({
      mensaje: 'Login exitoso',
      token,
      refreshToken: refreshTokenValue,
      usuario: {
        id: usuario.id_usuario,
        username: usuario.username,
        rol: usuario.id_rol === 1 ? 'ADMIN' : 'USER'
      },
    });
  } catch (error: any) {
    console.error('Error en servidor (Login):', error.message);
    res.status(500).json({ error: error.message });
  }
};
