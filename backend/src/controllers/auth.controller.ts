// Controller de autenticación — maneja registro, login y renovación de tokens
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';    // para hashear y comparar contraseñas de forma segura
import jwt from 'jsonwebtoken';   // para generar y verificar tokens JWT
import { pool } from '../db';
import { getAuditLogService } from '../services/auditLog.service';
import { randomUUID } from 'crypto';

// REGISTRO — crea un nuevo usuario con contraseña hasheada
export const registro = async (req: Request, res: Response) => {
  try {
    const { username, email, password, nombre_completo } = req.body;

    // Hashear la contraseña con bcrypt antes de guardarla (nunca se guarda en texto plano)
    const passwordHash = await bcrypt.hash(password, 10);

    // Insertar en la DB y retornar el registro creado
    const query = `
      INSERT INTO usuarios (username, email, password, nombre_completo)
      VALUES ($1, $2, $3, $4) RETURNING *
    `;
    const result = await pool.query(query, [username, email, passwordHash, nombre_completo]);
    const nuevoUsuario = result.rows[0];

    // Registrar el evento en el sistema de auditoría
    await getAuditLogService().log({
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
    // Devolver el usuario sin la contraseña hasheada por seguridad
    const { password: _, ...usuarioSinPass } = nuevoUsuario;
    res.status(201).json(usuarioSinPass);

  } catch (error: any) {
    console.error('Error en registro:', error.message);
    // Código 23505 = violación de UNIQUE en PostgreSQL (username o email duplicado)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El username o email ya está en uso' });
    }
    res.status(500).json({ error: error.message });
  }
};

// REFRESH TOKEN — renueva el access token sin pedir contraseña nuevamente
export const refreshToken = async (req: Request, res: Response): Promise<any> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ mensaje: 'Refresh token requerido' });
  }
  try {
    // Verificar que el refresh token es válido y no ha expirado (7 días)
    const decoded = jwt.verify(
      refreshToken,
      process.env['JWT_REFRESH_SECRET'] || 'refresh_clave_secreta'
    ) as any;

    // Confirmar que el usuario sigue activo antes de emitir un nuevo token
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND activo = TRUE',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Usuario no encontrado o inactivo' });
    }

    const usuario = result.rows[0];
    // Emitir nuevo access token con vida de 24 horas
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

// LOGIN — autentica al usuario y entrega access token + refresh token
export const login = async (req: Request, res: Response): Promise<any> => {
  const { username, password } = req.body;
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();

  try {
    console.log('Intento de login para:', username);

    // Buscar por username O por email (el usuario puede usar cualquiera de los dos)
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 OR email = $1',
      [username]
    );

    // Usuario no existe — registrar en auditoría y responder con mensaje genérico
    if (result.rows.length === 0) {
      await getAuditLogService().log({
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

    // Comparar la contraseña ingresada contra el hash almacenado en la DB
    const passwordValida = await bcrypt.compare(password, usuario.password);

    // Contraseña incorrecta — registrar en auditoría
    if (!passwordValida) {
      await getAuditLogService().log({
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

    // Login exitoso — generar access token (24h) con id, username y rol en el payload
    const token = jwt.sign(
      {
        id: usuario.id_usuario,
        username: usuario.username,
        rol: usuario.id_rol === 1 ? 'ADMIN' : 'USER'  // 1 = ADMIN, 2 = USER
      },
      process.env['JWT_SECRET'] || 'tu_clave_secreta_aqui',
      { expiresIn: '24h' }
    );

    await getAuditLogService().log({
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

    // Generar refresh token de larga duración (7 días) para renovar el access token
    const refreshTokenValue = jwt.sign(
      { id: usuario.id_usuario },
      process.env['JWT_REFRESH_SECRET'] || 'refresh_clave_secreta',
      { expiresIn: '7d' }
    );

    console.log('Login exitoso para:', username);
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
