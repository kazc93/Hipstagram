-- ROLES
CREATE TABLE IF NOT EXISTS roles (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (id_rol, nombre) VALUES 
    (1, 'ADMIN'),
    (2, 'USER')
ON CONFLICT DO NOTHING;


-- USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255),
    id_rol INTEGER DEFAULT 2 REFERENCES roles(id_rol),
    activo BOOLEAN DEFAULT TRUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- POSTS
CREATE TABLE IF NOT EXISTS posts (
    id_post SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    descripcion VARCHAR(128),
    url_imagen VARCHAR(500),
    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    total_likes INTEGER DEFAULT 0,
    total_dislikes INTEGER DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HASHTAGS
CREATE TABLE IF NOT EXISTS hashtags (
    id_hashtag SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS post_hashtags (
    id_post INTEGER REFERENCES posts(id_post) ON DELETE RESTRICT,
    id_hashtag INTEGER REFERENCES hashtags(id_hashtag),
    PRIMARY KEY (id_post, id_hashtag)
);

-- VOTOS
CREATE TABLE IF NOT EXISTS votos (
    id_voto SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_post INTEGER NOT NULL REFERENCES posts(id_post) ON DELETE RESTRICT,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('like', 'dislike')),
    fecha_voto TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_usuario, id_post)
);

-- COMENTARIOS
CREATE TABLE IF NOT EXISTS comentarios (
    id_comentario SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_post INTEGER NOT NULL REFERENCES posts(id_post) ON DELETE RESTRICT,
    contenido VARCHAR(500) NOT NULL,
    fecha_comentario TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HASHTAGS PROHIBIDOS
CREATE TABLE IF NOT EXISTS hashtags_prohibidos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    agregado_por INTEGER REFERENCES usuarios(id_usuario),
    fecha_agregado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id_log SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    request_id VARCHAR(36),
    actor_user_id INTEGER REFERENCES usuarios(id_usuario),
    actor_role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    payload_resumen TEXT,
    resultado VARCHAR(20),
    ip_origen VARCHAR(50)
);

-- ROLES DE BASE DE DATOS (DBA)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
        CREATE ROLE app_role;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_read_role') THEN
        CREATE ROLE admin_read_role;
    END IF;
END$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT SELECT ON audit_logs TO admin_read_role;
REVOKE ALL ON audit_logs FROM app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_role;

-- USUARIOS INICIALES
INSERT INTO usuarios (id_usuario, username, email, password, nombre_completo, id_rol, activo)
VALUES 
  (1, 'Kevin', 'kevinazurdia@correo.com', '$2a$10$BaQOHNauxQPk9W.9/3gC8eB0F9IogopBgoLKrxv758p8y3c1//dXC', 'Kevin Azurdia', 1, true),
  (2, 'alguien', 'alguno@correo.com', '$2a$10$nQknQRsVgVEhEPirUe3ES.6dDA6kEzKWBOywZbGBiDDHoBzwMKyyS', 'alguno', 2, true)
ON CONFLICT DO NOTHING;

-- HASHTAGS INICIALES
INSERT INTO hashtags (id_hashtag, nombre)
VALUES
  (1, 'messi'),
  (2, 'ucl'),
  (5, 'messi #ucl')
ON CONFLICT DO NOTHING;

-- HASHTAGS PROHIBIDOS POR DEFECTO
INSERT INTO hashtags_prohibidos (nombre, agregado_por)
VALUES
  ('spam', NULL),
  ('nsfw', NULL),
  ('odio', NULL),
  ('violencia', NULL),
  ('drogas', NULL)
ON CONFLICT DO NOTHING;

-- POSTS INICIALES
INSERT INTO posts (id_post, id_usuario, descripcion, url_imagen, estado, total_likes, total_dislikes, fecha_creacion)
VALUES 
  (2, 1, 'Champions 2009 🤩', 'http://localhost:3000/uploads/1774230811036-195887539.jpeg', 'PUBLICADO', 0, 0, '2026-03-23 01:53:31.061975'),
  (3, 2, 'Champions 2009', 'http://localhost:3000/uploads/1774241848660-554950641.jpeg', 'PUBLICADO', 0, 0, '2026-03-23 04:57:28.695319')
ON CONFLICT DO NOTHING;

-- RELACION POST-HASHTAGS
INSERT INTO post_hashtags (id_post, id_hashtag)
VALUES 
  (2, 2),
  (2, 1),
  (3, 5)
ON CONFLICT DO NOTHING;