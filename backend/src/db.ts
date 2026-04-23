// Pool de conexiones a PostgreSQL — se reutiliza en todos los controllers
// Las credenciales vienen de variables de entorno
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  user:     process.env.DB_USER     || 'hipstagram_admin',
  host:     process.env.DB_HOST     || 'db',
  database: process.env.DB_NAME     || 'hipstagram_db',
  password: process.env.DB_PASSWORD || 'adminpassword123',
  port:     parseInt(process.env.DB_PORT || '5432'),
  
  // SSL solo en conexiones externas (RDS/EC2); desactivado en localhost y Docker
  ssl: process.env.DB_HOST?.includes('localhost') || process.env.DB_HOST === 'db'
    ? false
    : { rejectUnauthorized: false },
});
